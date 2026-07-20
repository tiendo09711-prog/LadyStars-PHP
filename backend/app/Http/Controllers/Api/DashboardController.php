<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\MirrorRecord;
use App\Models\Product;
use App\Models\ProductBranchStock;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;

class DashboardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $salesQuery = (new MirrorRecord())->forTable('sale_payments')->newQuery();
        $completedSales = (clone $salesQuery)->whereIn('status', ['completed', 'COMPLETED']);
        $selectedStores = $this->selectedStoreIds($request);
        if ($selectedStores !== null) {
            $salesQuery->whereIn('branch_id', $selectedStores);
            $completedSales->whereIn('branch_id', $selectedStores);
        }

        $today = Carbon::today();

        // Default range for totals/periods (preserve existing behavior for other cards)
        $rangeDays = $this->rangeDays((string) $request->query('chartRange', '7 ngày'));
        $start = Carbon::today()->subDays($rangeDays - 1);
        $previousStart = (clone $start)->subDays($rangeDays);
        $previousEnd = (clone $start)->subSecond();

        // Custom date range support for "Doanh thu theo thời gian" chart only.
        // Frontend may send startDate and/or endDate (YYYY-MM-DD) independently.
        // isDateFilterActive when at least one is present (start-only / end-only / both are valid).
        // Only both + start>end is invalid (do not apply).
        // Never mix with chartRange/days when date filter active.
        $startDateStr = (string) $request->query('startDate', '');
        $endDateStr = (string) $request->query('endDate', '');
        $hasStart = $startDateStr !== '';
        $hasEnd = $endDateStr !== '';
        $isDateFilterActive = $hasStart || $hasEnd;

        $chartStart = clone $start;
        $chartRangeDays = $rangeDays;
        $chartPrevStart = clone $previousStart;
        $useCustomChart = false;
        $chartEndForSeries = null;

        if ($isDateFilterActive) {
            try {
                $cs = $hasStart ? Carbon::parse($startDateStr)->startOfDay() : null;
                $ce = $hasEnd ? Carbon::parse($endDateStr)->endOfDay() : null;

                $bothPresent = $hasStart && $hasEnd;
                $dateRangeInvalid = $bothPresent && $cs && $ce && $cs->gt($ce);

                if ($dateRangeInvalid) {
                    // do not apply reverse range; fall through to default days
                    $useCustomChart = false;
                } else {
                    $useCustomChart = true;

                    if ($cs && $ce) {
                        // full range
                        $chartStart = $cs;
                        $chartEndForSeries = $ce;
                    } elseif ($cs) {
                        // start-only: from start to today (inclusive)
                        $chartStart = $cs;
                        $chartEndForSeries = Carbon::today()->endOfDay();
                    } elseif ($ce) {
                        // end-only: last ~30 calendar days ending at the given endDate (bounded window)
                        // ensures no data after endDate, without using/sending chartRange days
                        $chartEndForSeries = $ce;
                        $chartStart = (clone $ce)->subDays(29)->startOfDay();
                    } else {
                        $useCustomChart = false;
                    }

                    if ($useCustomChart && $chartEndForSeries) {
                        // Carbon 3 diffInDays is signed + can be fractional with endOfDay — count calendar days only.
                        $chartRangeDays = max(1, $this->calendarDayOffset($chartStart, $chartEndForSeries) + 1);
                        $chartPrevStart = (clone $chartStart)->subDays($chartRangeDays)->startOfDay();
                    }
                }
            } catch (\Throwable $e) {
                $useCustomChart = false;
            }
        }

        $chartPrevEnd = (clone $chartStart)->subSecond();

        // Build chart dates inclusively. When custom (incl. partial), only dates satisfying the bounds are included.
        if (!$chartEndForSeries || !$useCustomChart) {
            $chartEndForSeries = (clone $chartStart)->addDays($chartRangeDays - 1);
        }
        $chartDates = [];
        $cur = clone $chartStart;
        $chartEndDay = (clone $chartEndForSeries)->startOfDay();
        while ($cur->lte($chartEndDay)) {
            $chartDates[] = clone $cur;
            $cur = $cur->copy()->addDay();
        }

        $chartData = collect($chartDates)->map(function (Carbon $date) use ($chartStart, $chartPrevStart, $completedSales): array {
            // Carbon 3: $later->diffInDays($earlier) is negative — always offset from chartStart → date (≥ 0).
            $offset = $this->calendarDayOffset($chartStart, $date);
            $previousDate = (clone $chartPrevStart)->addDays($offset);

            return [
                'date' => $date->format('d/m'),
                'fullDate' => $date->toDateString(),
                'revenue' => (float) (clone $completedSales)->whereDate('business_date', $date)->sum('value_payment'),
                'prevRevenue' => (float) (clone $completedSales)->whereDate('business_date', $previousDate)->sum('value_payment'),
            ];
        })->all();

        $inventory = $this->inventoryMetrics($selectedStores);

        $topLimit = min(max((int) $request->query('topLimit', 10), 1), 50);
        $topProducts = $this->topProducts(
            $completedSales,
            $this->rangeDays((string) $request->query('topRange', '7 ngày')),
            $topLimit,
            $selectedStores
        );

        $recentSales = $this->recentSales($salesQuery, 20);

        $activeStores = Branch::query()->where('is_active', true)->orderBy('name')->get(['id', 'name']);

        return response()->json([
            'totals' => [
                'todayRevenue' => (float) (clone $completedSales)->whereDate('business_date', $today)->sum('value_payment'),
                'periodRevenue' => (float) (clone $completedSales)->whereBetween('business_date', [$start, now()])->sum('value_payment'),
                'previousPeriodRevenue' => (float) (clone $completedSales)->whereBetween('business_date', [$previousStart, $previousEnd])->sum('value_payment'),
                'totalSales' => (int) $salesQuery->count(),
                'completedSales' => (int) (clone $salesQuery)->whereIn('status', ['completed', 'COMPLETED'])->count(),
                'customers' => Schema::hasTable('customers') ? (int) Customer::query()->count() : 0,
                'products' => (int) Product::query()->count(),
            ],
            'salesChannels' => [],
            'inventory' => $inventory,
            'topProducts' => $topProducts,
            'chartData' => $chartData,
            'wallets' => ['zaloOA' => 0, 'shopeeWallet' => 0, 'zaloWallet' => 0, 'adsWallet' => 0],
            'walletItems' => [],
            'recentSales' => $recentSales,
            'availableStores' => $activeStores->pluck('name')->values()->all(),
            // id+name for storage-duration branch filter (FE may select by name).
            'stores' => $activeStores->map(fn (Branch $b): array => [
                'id' => (int) $b->id,
                'name' => (string) $b->name,
            ])->values()->all(),
        ]);
    }

    /**
     * Non-negative whole calendar-day distance from $from → $to (Carbon 3 signed-safe).
     */
    private function calendarDayOffset(Carbon $from, Carbon $to): int
    {
        $start = $from->copy()->startOfDay();
        $end = $to->copy()->startOfDay();
        $signed = (int) $start->diffInDays($end, false);

        return max(0, $signed);
    }

    public function dailyProducts(Request $request): JsonResponse
    {
        $date = $request->query('date');
        $selectedStores = $this->selectedStoreIds($request);
        $completedSales = (new MirrorRecord())->forTable('sale_payments')->newQuery()
            ->whereIn('status', ['completed', 'COMPLETED']);

        if ($date !== null) {
            $completedSales->whereDate('business_date', Carbon::parse($date));
        }
        if ($selectedStores !== null) {
            $completedSales->whereIn('branch_id', $selectedStores);
        }

        $rows = [];
        foreach ($completedSales->get(['items', 'payload']) as $record) {
            foreach ($this->saleLineItems($record) as $item) {
                $lineKey = $this->lineProductKey($item);
                if ($lineKey === null) {
                    continue;
                }
                $amount = (float) ($item['amount'] ?? 0);
                $revenue = (float) ($item['total'] ?? $item['value'] ?? 0);
                if (!isset($rows[$lineKey])) {
                    $rows[$lineKey] = [
                        'code' => $item['productCode'] ?? $item['code'] ?? null,
                        'name' => $item['name'] ?? null,
                        'qty' => 0.0,
                        'revenue' => 0.0,
                        'priceSum' => 0.0,
                        'priceCount' => 0,
                    ];
                }
                $rows[$lineKey]['qty'] += $amount;
                $rows[$lineKey]['revenue'] += $revenue;
                $unitPrice = $amount > 0 ? $revenue / $amount : 0.0;
                $rows[$lineKey]['priceSum'] += $unitPrice;
                $rows[$lineKey]['priceCount'] += 1;
            }
        }

        $resolved = $this->resolveProductsByLineKeys(array_keys($rows));

        $products = collect($rows)->map(function (array $row, string $pid) use ($resolved): array {
            $product = $resolved[$pid] ?? null;

            return [
                'code' => $product?->code ?? $row['code'] ?? $pid,
                'name' => $product?->name ?? $row['name'] ?? 'Không rõ',
                'qty' => $row['qty'],
                'price' => $row['priceCount'] > 0 ? (float) ($row['priceSum'] / $row['priceCount']) : 0.0,
                'revenue' => $row['revenue'],
            ];
        })->values()->sortByDesc('revenue')->values()->all();

        return response()->json([
            'date' => $date,
            'products' => $products,
            'total' => count($products),
        ]);
    }

    private function rangeDays(string $label): int
    {
        return match ($label) {
            '14 ngày' => 14,
            '30 ngày' => 30,
            'Tháng này' => max(1, now()->day),
            'Tháng trước' => max(1, now()->copy()->subMonthNoOverflow()->daysInMonth),
            default => 7,
        };
    }

    private function selectedStoreIds(Request $request): ?array
    {
        $raw = (string) $request->query('stores', '');
        if ($raw === '') {
            return null;
        }
        $names = array_values(array_filter(array_map('trim', explode(',', $raw)), fn ($value) => $value !== ''));
        if (empty($names)) {
            return null;
        }

        $ids = Branch::query()->where('is_active', true)->whereIn('name', $names)->pluck('id')->all();

        return empty($ids) ? null : $ids;
    }

    /**
     * Inventory KPIs must follow the same store filter as chart/top/recent.
     * qty/cost/sale are aggregated from product_branch_stocks × product cost/price.
     *
     * @param  list<int>|null  $selectedStores
     * @return array{totalQty: float, totalCostValue: float, totalSaleValue: float}
     */
    private function inventoryMetrics(?array $selectedStores): array
    {
        $query = ProductBranchStock::query()
            ->join('products as p', 'p.id', '=', 'product_branch_stocks.product_id');

        if ($selectedStores !== null) {
            $query->whereIn('product_branch_stocks.branch_id', $selectedStores);
        }

        $row = $query->selectRaw(
            'COALESCE(SUM(product_branch_stocks.qty), 0) as total_qty, '
            . 'COALESCE(SUM(product_branch_stocks.qty * COALESCE(p.cost, 0)), 0) as total_cost, '
            . 'COALESCE(SUM(product_branch_stocks.qty * COALESCE(p.price, 0)), 0) as total_sale'
        )->first();

        return [
            'totalQty' => (float) ($row->total_qty ?? 0),
            'totalCostValue' => (float) ($row->total_cost ?? 0),
            'totalSaleValue' => (float) ($row->total_sale ?? 0),
        ];
    }

    /**
     * @param  list<int>|null  $selectedStores
     */
    private function topProducts($completedSales, int $rangeDays, int $limit, ?array $selectedStores = null): array
    {
        $topStart = Carbon::today()->subDays($rangeDays - 1);
        $sales = (clone $completedSales)->where('business_date', '>=', $topStart)->get(['items', 'payload']);

        $revenueByProduct = [];
        $qtyByProduct = [];
        $productPids = [];
        foreach ($sales as $record) {
            foreach ($this->saleLineItems($record) as $item) {
                $lineKey = $this->lineProductKey($item);
                if ($lineKey === null) {
                    continue;
                }
                $productPids[$lineKey] = true;
                $amount = (float) ($item['amount'] ?? 0);
                $revenue = (float) ($item['total'] ?? $item['value'] ?? 0);
                if (!isset($revenueByProduct[$lineKey])) {
                    $revenueByProduct[$lineKey] = 0.0;
                    $qtyByProduct[$lineKey] = 0.0;
                }
                $revenueByProduct[$lineKey] += $revenue;
                $qtyByProduct[$lineKey] += $amount;
            }
        }

        $refunds = (new MirrorRecord())->forTable('product_refunds')->newQuery()
            ->whereIn('status', ['completed', 'COMPLETED'])
            ->where('business_date', '>=', $topStart);

        // Keep refunds under the same store filter as sales (DB-ST-019).
        // product_refunds may only have branch_mongo_id (no local branch_id).
        if ($selectedStores !== null) {
            $mongoIds = Branch::query()
                ->whereIn('id', $selectedStores)
                ->whereNotNull('mongo_id')
                ->pluck('mongo_id')
                ->filter(fn ($value) => $value !== '')
                ->values()
                ->all();

            $refunds->where(function ($query) use ($selectedStores, $mongoIds) {
                $applied = false;
                if (Schema::hasColumn('product_refunds', 'branch_id')) {
                    $query->whereIn('branch_id', $selectedStores);
                    $applied = true;
                }
                if (!empty($mongoIds)) {
                    if ($applied) {
                        $query->orWhereIn('branch_mongo_id', $mongoIds);
                    } else {
                        $query->whereIn('branch_mongo_id', $mongoIds);
                    }
                } elseif (!$applied) {
                    // No usable branch column/value → do not leak global refunds into a store filter.
                    $query->whereRaw('1 = 0');
                }
            });
        }

        $refunds = $refunds->get(['items', 'payload']);
        $returnedByProduct = [];
        foreach ($refunds as $record) {
            foreach ($this->saleLineItems($record) as $item) {
                $lineKey = $this->lineProductKey($item);
                if ($lineKey === null) {
                    continue;
                }
                $productPids[$lineKey] = true;
                $amount = (float) ($item['amount'] ?? 0);
                $returnedByProduct[$lineKey] = ($returnedByProduct[$lineKey] ?? 0.0) + $amount;
            }
        }

        $pids = array_keys($productPids);
        $resolved = $this->resolveProductsByLineKeys($pids);

        $rows = collect($pids)->map(function (string $pid) use ($resolved, $revenueByProduct, $qtyByProduct, $returnedByProduct): array {
            $product = $resolved[$pid] ?? null;
            $fallbackCode = str_starts_with($pid, 'code:') ? substr($pid, 5) : $pid;

            return [
                '_id' => $product?->id !== null ? (string) $product->id : $pid,
                'code' => $product?->code ?? $fallbackCode,
                'name' => $product?->name ?? 'Không rõ',
                'qtySold' => $qtyByProduct[$pid] ?? 0.0,
                'qtyReturned' => $returnedByProduct[$pid] ?? 0,
                'revenue' => $revenueByProduct[$pid] ?? 0.0,
                '_revenue' => $revenueByProduct[$pid] ?? 0.0,
            ];
        })->sortByDesc('_revenue')->values()->take($limit)->values();

        $rank = 0;

        return $rows->map(function (array $row) use (&$rank): array {
            $rank++;
            unset($row['_revenue']);
            $row['rank'] = $rank;

            return $row;
        })->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function saleLineItems(object $record): array
    {
        if (is_array($record->items ?? null) && $record->items !== []) {
            return array_values(array_filter($record->items, 'is_array'));
        }
        $payload = is_array($record->payload ?? null) ? $record->payload : [];
        $items = $payload['items'] ?? [];

        return is_array($items) ? array_values(array_filter($items, 'is_array')) : [];
    }

    /**
     * Stable line key: productId / product_id, else code:productCode.
     */
    private function lineProductKey(array $item): ?string
    {
        $pidRaw = $item['productId'] ?? $item['product_id'] ?? null;
        if (is_array($pidRaw)) {
            $pidRaw = $pidRaw['id'] ?? $pidRaw['_id'] ?? $pidRaw['mongo_id'] ?? null;
        }
        if ($pidRaw !== null && $pidRaw !== '') {
            return (string) $pidRaw;
        }
        $code = $item['productCode'] ?? $item['code'] ?? null;
        if ($code !== null && trim((string) $code) !== '') {
            return 'code:'.trim((string) $code);
        }

        return null;
    }

    /**
     * @param  list<string>  $keys
     * @return array<string, Product>
     */
    private function resolveProductsByLineKeys(array $keys): array
    {
        $mongoPids = [];
        $localPids = [];
        $codes = [];
        foreach ($keys as $key) {
            if (str_starts_with($key, 'code:')) {
                $codes[] = substr($key, 5);
            } elseif (ctype_digit((string) $key)) {
                $localPids[] = (int) $key;
            } else {
                $mongoPids[] = $key;
            }
        }

        $byMongo = !empty($mongoPids)
            ? Product::query()->whereIn('mongo_id', $mongoPids)->get(['id', 'mongo_id', 'code', 'name'])->keyBy('mongo_id')
            : collect();
        $byLocal = !empty($localPids)
            ? Product::query()->whereIn('id', $localPids)->get(['id', 'mongo_id', 'code', 'name'])->keyBy('id')
            : collect();
        $byCode = !empty($codes)
            ? Product::query()->whereIn('code', $codes)->get(['id', 'mongo_id', 'code', 'name'])->keyBy('code')
            : collect();

        $out = [];
        foreach ($keys as $key) {
            if (str_starts_with($key, 'code:')) {
                $product = $byCode->get(substr($key, 5));
            } elseif (ctype_digit((string) $key)) {
                $product = $byLocal->get((int) $key);
            } else {
                $product = $byMongo->get($key);
            }
            if ($product) {
                $out[$key] = $product;
            }
        }

        return $out;
    }

    private function recentSales($salesQuery, int $limit): array
    {
        $branchIds = [];
        $customerIds = [];
        $records = (clone $salesQuery)
            ->orderByDesc('business_date')
            ->orderByDesc('id')
            ->limit($limit)
            ->get();
        foreach ($records as $record) {
            if ($record->branch_id !== null) {
                $branchIds[(string) $record->branch_id] = true;
            }
            if ($record->customer_id !== null) {
                $customerIds[(string) $record->customer_id] = true;
            }
        }

        $branches = Branch::query()->find(array_keys($branchIds))->keyBy('id');
        $customers = Customer::query()->find(array_keys($customerIds))->keyBy('id');

        return $records->map(function (MirrorRecord $record) use ($branches, $customers): array {
            $branch = $record->branch_id !== null ? $branches->get($record->branch_id) : null;
            $customer = $record->customer_id !== null ? $customers->get($record->customer_id) : null;

            return [
                'id' => (string) ($record->mongo_id ?: $record->id),
                '_id' => (string) ($record->mongo_id ?: $record->id),
                'code' => $record->code,
                'customerName' => $customer?->name ?? (is_array($record->payload) ? ($record->payload['customerName'] ?? '') : '') ?? '',
                'type' => $record->type ?? (is_array($record->payload) ? ($record->payload['type'] ?? 'Bán hàng') : 'Bán hàng'),
                'branchName' => $branch?->name ?? '',
                'value' => (float) ($record->value_payment ?? $record->total ?? $record->value ?? 0),
                'status' => $record->status,
                'createdAt' => optional($record->business_date ?? $record->created_at)->toISOString(),
                'businessDate' => optional($record->business_date)->toISOString(),
            ];
        })->values()->all();
    }
}