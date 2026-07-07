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
        $rangeDays = $this->rangeDays((string) $request->query('chartRange', '7 ngày'));
        $start = Carbon::today()->subDays($rangeDays - 1);
        $previousStart = (clone $start)->subDays($rangeDays);
        $previousEnd = (clone $start)->subSecond();

        $chartData = collect(range(0, $rangeDays - 1))->map(function (int $offset) use ($start, $previousStart, $completedSales): array {
            $date = (clone $start)->addDays($offset);
            $previousDate = (clone $previousStart)->addDays($offset);

            return [
                'date' => $date->format('d/m'),
                'fullDate' => $date->toDateString(),
                'revenue' => (float) (clone $completedSales)->whereDate('business_date', $date)->sum('value_payment'),
                'prevRevenue' => (float) (clone $completedSales)->whereDate('business_date', $previousDate)->sum('value_payment'),
            ];
        })->all();

        $inventory = [
            'totalQty' => (float) ProductBranchStock::query()->sum('qty'),
            'totalCostValue' => (float) Product::query()->selectRaw('SUM(COALESCE(qty,0) * COALESCE(cost,0)) as total')->value('total'),
            'totalSaleValue' => (float) Product::query()->selectRaw('SUM(COALESCE(qty,0) * COALESCE(price,0)) as total')->value('total'),
        ];

        $topLimit = min(max((int) $request->query('topLimit', 10), 1), 50);
        $topProducts = $this->topProducts($completedSales, $this->rangeDays((string) $request->query('topRange', '7 ngày')), $topLimit);

        $recentSales = $this->recentSales($salesQuery, 20);

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
            'availableStores' => Branch::query()->where('is_active', true)->orderBy('name')->pluck('name')->values()->all(),
        ]);
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
            $items = is_array($record->items) ? $record->items : (is_array($record->payload) ? ($record->payload['items'] ?? []) : []);
            foreach ($items as $item) {
                $pidRaw = $item['productId'] ?? $item['product_id'] ?? null;
                if ($pidRaw === null || $pidRaw === '') {
                    continue;
                }
                $productId = (string) $pidRaw;
                $amount = (float) ($item['amount'] ?? 0);
                $revenue = (float) ($item['total'] ?? $item['value'] ?? 0);
                if (!isset($rows[$productId])) {
                    $rows[$productId] = [
                        'code' => $item['code'] ?? null,
                        'name' => $item['name'] ?? null,
                        'qty' => 0.0,
                        'revenue' => 0.0,
                        'priceSum' => 0.0,
                        'priceCount' => 0,
                    ];
                }
                $rows[$productId]['qty'] += $amount;
                $rows[$productId]['revenue'] += $revenue;
                $unitPrice = $amount > 0 ? $revenue / $amount : 0.0;
                $rows[$productId]['priceSum'] += $unitPrice;
                $rows[$productId]['priceCount'] += 1;
            }
        }

        // Support productId stored as local PK (int/string from legacy import or frontend _id) or mongo_id string.
        // Previously only accepted string mongo_id => caused empty daily products even when chart had revenue.
        $pids = array_keys($rows);
        $mongoPids = array_values(array_filter($pids, fn ($p) => !ctype_digit((string) $p)));
        $localPids = array_values(array_filter($pids, fn ($p) => ctype_digit((string) $p)));
        $byMongo = Product::query()->whereIn('mongo_id', $mongoPids)->get(['mongo_id', 'code', 'name'])->keyBy('mongo_id');
        $byLocal = Product::query()->whereIn('id', array_map('intval', $localPids))->get(['id', 'code', 'name'])->keyBy('id');

        $products = collect($rows)->map(function (array $row, string $pid) use ($byMongo, $byLocal): array {
            $product = ctype_digit($pid) ? $byLocal->get((int) $pid) : $byMongo->get($pid);

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

    private function topProducts($completedSales, int $rangeDays, int $limit): array
    {
        $topStart = Carbon::today()->subDays($rangeDays - 1);
        $sales = (clone $completedSales)->where('business_date', '>=', $topStart)->get(['items', 'payload']);

        $revenueByProduct = [];
        $qtyByProduct = [];
        $productPids = [];
        foreach ($sales as $record) {
            $items = is_array($record->items) ? $record->items : (is_array($record->payload) ? ($record->payload['items'] ?? []) : []);
            foreach ($items as $item) {
                $pidRaw = $item['productId'] ?? $item['product_id'] ?? null;
                if ($pidRaw === null || $pidRaw === '') {
                    continue;
                }
                $productId = (string) $pidRaw;
                $productPids[$productId] = true;
                $amount = (float) ($item['amount'] ?? 0);
                $revenue = (float) ($item['total'] ?? $item['value'] ?? 0);
                if (!isset($revenueByProduct[$productId])) {
                    $revenueByProduct[$productId] = 0.0;
                    $qtyByProduct[$productId] = 0.0;
                }
                $revenueByProduct[$productId] += $revenue;
                $qtyByProduct[$productId] += $amount;
            }
        }

        $refunds = (new MirrorRecord())->forTable('product_refunds')->newQuery()
            ->whereIn('status', ['completed', 'COMPLETED'])
            ->where('business_date', '>=', $topStart)
            ->get(['items', 'payload']);
        $returnedByProduct = [];
        foreach ($refunds as $record) {
            $items = is_array($record->items) ? $record->items : (is_array($record->payload) ? ($record->payload['items'] ?? []) : []);
            foreach ($items as $item) {
                $pidRaw = $item['productId'] ?? $item['product_id'] ?? null;
                if ($pidRaw === null || $pidRaw === '') {
                    continue;
                }
                $productId = (string) $pidRaw;
                $productPids[$productId] = true;
                $amount = (float) ($item['amount'] ?? 0);
                $returnedByProduct[$productId] = ($returnedByProduct[$productId] ?? 0.0) + $amount;
            }
        }

        $pids = array_keys($productPids);
        $mongoPids = array_values(array_filter($pids, fn ($p) => !ctype_digit((string) $p)));
        $localPids = array_values(array_filter($pids, fn ($p) => ctype_digit((string) $p)));
        $byMongo = Product::query()->whereIn('mongo_id', $mongoPids)->get(['id', 'mongo_id', 'code', 'name'])->keyBy('mongo_id');
        $byLocal = Product::query()->whereIn('id', array_map('intval', $localPids))->get(['id', 'code', 'name'])->keyBy('id');

        $rows = collect($pids)->map(function (string $pid) use ($byMongo, $byLocal, $revenueByProduct, $qtyByProduct, $returnedByProduct): array {
            $product = ctype_digit($pid) ? $byLocal->get((int) $pid) : $byMongo->get($pid);

            return [
                '_id' => $product?->id !== null ? (string) $product->id : $pid,
                'code' => $product?->code ?? $pid,
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