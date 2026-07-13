<?php

namespace App\Services;

use App\Models\Branch;
use App\Models\MirrorRecord;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * Read-only revenue-by-store report.
 *
 * Business formulas aligned with RevenueByTimeReportService (do not invent):
 * - grossRevenue = revenue + discount
 * - revenue = COALESCE(value, value_payment, 0)
 * - refundAmount from product_refunds only (no double-count with sale refunded_value)
 * - netRevenue = revenue - refundAmount
 * - averageOrderValue = revenue / invoiceCount (0 if no invoices)
 * - costAmount null when no total_cost data
 * - timestamp: business_date (fallback completed_at, created_at)
 * - default status: completed only
 * - store key: stable branch id (or "unknown")
 */
class RevenueByStoreReportService
{
    public const TIMEZONE = 'Asia/Ho_Chi_Minh';

    public const UNKNOWN_STORE_ID = 'unknown';

    public const DEFAULT_STATUSES = ['completed'];

    public const ALLOWED_STATUSES = ['completed', 'draft', 'cancelled'];

    public const SALE_TYPES = ['retail', 'wholesale'];

    public const PER_PAGE_OPTIONS = [20, 50, 100];

    public const TREND_GRANULARITIES = ['day', 'week', 'month'];

    public const METRICS = [
        'netRevenue',
        'revenue',
        'grossRevenue',
        'invoiceCount',
        'itemQuantity',
        'averageOrderValue',
    ];

    public const SORT_FIELDS = [
        'netRevenue',
        'revenue',
        'grossRevenue',
        'invoiceCount',
        'itemQuantity',
        'averageOrderValue',
        'storeName',
        'refundAmount',
        'discountAmount',
        'rank',
    ];

    public const MAX_RANGE_DAYS = 1826;

    public const TOP_TREND_STORES = 8;

    public function options(): array
    {
        $stores = Branch::query()
            ->orderByDesc('is_active')
            ->orderBy('name')
            ->get(['id', 'name', 'code', 'is_active'])
            ->map(fn (Branch $b) => [
                'id' => (string) $b->id,
                'name' => $b->name,
                'code' => $b->code,
                'isActive' => (bool) $b->is_active,
            ])
            ->values()
            ->all();

        $staff = User::query()
            ->where(function ($q) {
                $q->where('is_active', true)->orWhereNull('is_active');
            })
            ->where(function ($q) {
                $q->whereNull('status')->orWhere('status', '!=', 'LOCKED');
            })
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'role'])
            ->map(fn (User $u) => [
                'id' => (string) $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'role' => $u->role,
            ])
            ->values()
            ->all();

        return [
            'stores' => $stores,
            'staff' => $staff,
            'channels' => [
                ['value' => 'retail', 'label' => 'Bán lẻ'],
                ['value' => 'wholesale', 'label' => 'Bán sỉ'],
            ],
            'saleChannels' => [
                ['value' => 'store', 'label' => 'Cửa hàng'],
                ['value' => 'shopee', 'label' => 'Shopee'],
                ['value' => 'tiktok', 'label' => 'TikTok'],
                ['value' => 'lazada', 'label' => 'Lazada'],
                ['value' => 'tiki', 'label' => 'Tiki'],
                ['value' => 'facebook', 'label' => 'Facebook Shop'],
                ['value' => 'ecom-finance', 'label' => 'Tài chính sàn TMDT'],
            ],
            'invoiceStatuses' => [
                ['value' => 'completed', 'label' => 'Hoàn tất'],
                ['value' => 'draft', 'label' => 'Nháp'],
                ['value' => 'cancelled', 'label' => 'Đã hủy'],
            ],
            'paymentMethods' => $this->distinctPaymentMethodLabels(),
            'presets' => [
                'today', 'yesterday', 'last_7_days', 'last_30_days',
                'this_week', 'this_month', 'last_month', 'this_quarter', 'this_year', 'custom',
            ],
            'compareModes' => [
                ['value' => 'none', 'label' => 'Không so sánh'],
                ['value' => 'previous_period', 'label' => 'So với kỳ trước'],
            ],
            'metrics' => [
                ['value' => 'netRevenue', 'label' => 'Doanh thu thuần'],
                ['value' => 'revenue', 'label' => 'Doanh thu'],
                ['value' => 'grossRevenue', 'label' => 'Doanh thu trước giảm'],
                ['value' => 'invoiceCount', 'label' => 'Số hóa đơn'],
                ['value' => 'itemQuantity', 'label' => 'Số sản phẩm'],
                ['value' => 'averageOrderValue', 'label' => 'Giá trị đơn TB'],
            ],
            'trendGranularities' => [
                ['value' => 'day', 'label' => 'Theo ngày'],
                ['value' => 'week', 'label' => 'Theo tuần'],
                ['value' => 'month', 'label' => 'Theo tháng'],
            ],
            'sortOptions' => [
                ['value' => 'netRevenue', 'label' => 'Doanh thu thuần'],
                ['value' => 'revenue', 'label' => 'Doanh thu'],
                ['value' => 'invoiceCount', 'label' => 'Số hóa đơn'],
                ['value' => 'itemQuantity', 'label' => 'Số sản phẩm'],
                ['value' => 'averageOrderValue', 'label' => 'Giá trị đơn TB'],
                ['value' => 'storeName', 'label' => 'Tên cửa hàng'],
            ],
            'perPageOptions' => self::PER_PAGE_OPTIONS,
            'timezone' => self::TIMEZONE,
            'currency' => 'VND',
            'formulas' => [
                'grossRevenue' => 'COALESCE(value, value_payment, 0) + COALESCE(discount_value, 0)',
                'discountAmount' => 'SUM(COALESCE(discount_value, 0)) trên sale_payments',
                'revenue' => 'COALESCE(value, value_payment, 0) — sau giảm giá',
                'refundAmount' => 'COALESCE(value, total, total_payable_amount, 0) trên product_refunds (không cộng refunded_value của sale)',
                'netRevenue' => 'revenue - refundAmount',
                'averageOrderValue' => 'revenue / invoiceCount (0 nếu invoiceCount = 0)',
                'itemQuantity' => 'COALESCE(amount_products, sum items.amount)',
                'costAmount' => 'SUM(total_cost) khi có dữ liệu; null nếu không có total_cost',
                'timestamp' => 'business_date (fallback completed_at, created_at)',
                'defaultStatus' => 'completed / COMPLETED only',
                'storeKey' => 'branch_id ổn định; unknown nếu không xác định được cửa hàng',
            ],
        ];
    }

    public function report(array $input): array
    {
        $filters = $this->normalizeFilters($input);

        $sales = $this->loadSales($filters);
        $refunds = $this->loadRefunds($filters, $sales);

        $branchMap = $this->loadBranchMap($sales, $refunds);
        $storeRows = $this->aggregateByStore($sales, $refunds, $branchMap);
        $storeRows = $this->applySearch($storeRows, $filters['search']);

        $summary = $this->buildSummary($storeRows, $branchMap);
        $ranking = $this->buildRanking($storeRows, $filters['metric']);
        $table = $this->paginateRanking($ranking, $filters);
        $trend = $this->buildTrend($filters, $sales, $refunds, $branchMap, $ranking);
        $breakdowns = $this->buildBreakdowns($sales, $refunds, $branchMap, $ranking);

        $comparison = null;
        if ($filters['compare'] === 'previous_period') {
            $prevFilters = $this->previousPeriodFilters($filters);
            $prevSales = $this->loadSales($prevFilters);
            $prevRefunds = $this->loadRefunds($prevFilters, $prevSales);
            $prevBranchMap = $this->loadBranchMap($prevSales, $prevRefunds);
            $prevRows = $this->aggregateByStore($prevSales, $prevRefunds, $prevBranchMap);
            $prevRows = $this->applySearch($prevRows, $filters['search']);
            $prevSummary = $this->buildSummary($prevRows, $prevBranchMap);
            $comparison = [
                'period' => [
                    'from' => $prevFilters['from']->toDateString(),
                    'to' => $prevFilters['to']->toDateString(),
                ],
                'metrics' => $this->buildComparisonMetrics($summary, $prevSummary),
            ];
        }

        return [
            'filters' => [
                'from' => $filters['from']->toDateString(),
                'to' => $filters['to']->toDateString(),
                'storeIds' => $filters['storeIds'],
                'staffId' => $filters['staffId'],
                'channel' => $filters['channel'],
                'saleChannel' => $filters['saleChannel'],
                'status' => $filters['statuses'],
                'paymentMethod' => $filters['paymentMethod'],
                'compare' => $filters['compare'],
                'metric' => $filters['metric'],
                'trendGranularity' => $filters['trendGranularity'],
                'search' => $filters['search'],
                'timezone' => self::TIMEZONE,
            ],
            'summary' => $summary,
            'comparison' => $comparison,
            'ranking' => $ranking,
            'trend' => $trend,
            'breakdowns' => $breakdowns,
            'table' => $table,
            'meta' => [
                'generatedAt' => Carbon::now(self::TIMEZONE)->toIso8601String(),
                'currency' => 'VND',
                'timezone' => self::TIMEZONE,
                'hasCostData' => $summary['costAmount'] !== null,
                'saleCountLoaded' => $sales->count(),
                'refundCountLoaded' => $refunds->count(),
            ],
        ];
    }

    private function normalizeFilters(array $input): array
    {
        $fromRaw = trim((string) ($input['from'] ?? ''));
        $toRaw = trim((string) ($input['to'] ?? ''));

        if ($fromRaw === '' || $toRaw === '') {
            $to = Carbon::now(self::TIMEZONE)->startOfDay();
            $from = (clone $to)->subDays(29);
        } else {
            try {
                $from = Carbon::createFromFormat('Y-m-d', $fromRaw, self::TIMEZONE)->startOfDay();
                $to = Carbon::createFromFormat('Y-m-d', $toRaw, self::TIMEZONE)->startOfDay();
            } catch (\Throwable) {
                throw ValidationException::withMessages([
                    'from' => ['Ngày không hợp lệ. Định dạng yêu cầu YYYY-MM-DD.'],
                ]);
            }
        }

        if ($from->gt($to)) {
            throw ValidationException::withMessages([
                'from' => ['Ngày bắt đầu không được lớn hơn ngày kết thúc.'],
            ]);
        }

        $days = $from->diffInDays($to) + 1;
        if ($days > self::MAX_RANGE_DAYS) {
            throw ValidationException::withMessages([
                'to' => [sprintf('Khoảng thời gian tối đa %d ngày.', self::MAX_RANGE_DAYS)],
            ]);
        }

        $storeIds = $this->parseStoreIds($input);
        if ($storeIds !== []) {
            $existing = Branch::query()->whereIn('id', $storeIds)->pluck('id')->map(fn ($id) => (string) $id)->all();
            $missing = array_diff($storeIds, $existing);
            if ($missing !== []) {
                throw ValidationException::withMessages([
                    'storeIds' => ['Một hoặc nhiều cửa hàng không tồn tại: '.implode(', ', $missing)],
                ]);
            }
        }

        $staffId = trim((string) ($input['staffId'] ?? ''));
        if ($staffId !== '' && !User::query()->where('id', $staffId)->exists()) {
            throw ValidationException::withMessages([
                'staffId' => ['Nhân viên không tồn tại.'],
            ]);
        }

        $channel = strtolower(trim((string) ($input['channel'] ?? '')));
        if ($channel !== '' && !in_array($channel, self::SALE_TYPES, true)) {
            throw ValidationException::withMessages([
                'channel' => ['Loại bán không hợp lệ. Chỉ chấp nhận retail|wholesale.'],
            ]);
        }

        $saleChannel = strtolower(trim((string) ($input['saleChannel'] ?? '')));
        $allowedSaleChannels = ['store', 'shopee', 'tiktok', 'lazada', 'tiki', 'facebook', 'ecom-finance'];
        if ($saleChannel !== '' && !in_array($saleChannel, $allowedSaleChannels, true)) {
            throw ValidationException::withMessages([
                'saleChannel' => ['Kênh bán hàng không hợp lệ.'],
            ]);
        }

        $statusRaw = $input['status'] ?? null;
        if (is_array($statusRaw)) {
            $statuses = array_values(array_filter(array_map(fn ($s) => strtolower(trim((string) $s)), $statusRaw)));
        } else {
            $statusStr = trim((string) ($statusRaw ?? ''));
            $statuses = $statusStr === ''
                ? self::DEFAULT_STATUSES
                : array_values(array_filter(array_map('trim', explode(',', strtolower($statusStr)))));
        }
        if ($statuses === []) {
            $statuses = self::DEFAULT_STATUSES;
        }
        foreach ($statuses as $st) {
            if (!in_array($st, self::ALLOWED_STATUSES, true)) {
                throw ValidationException::withMessages([
                    'status' => ['Trạng thái hóa đơn không hợp lệ: '.$st],
                ]);
            }
        }

        $paymentMethod = trim((string) ($input['paymentMethod'] ?? ''));

        $compare = strtolower(trim((string) ($input['compare'] ?? 'previous_period')));
        if (!in_array($compare, ['none', 'previous_period'], true)) {
            throw ValidationException::withMessages([
                'compare' => ['Giá trị compare không hợp lệ.'],
            ]);
        }

        $metric = (string) ($input['metric'] ?? 'netRevenue');
        if (!in_array($metric, self::METRICS, true)) {
            throw ValidationException::withMessages([
                'metric' => ['Chỉ số metric không hợp lệ.'],
            ]);
        }

        $trendGranularity = strtolower(trim((string) ($input['trendGranularity'] ?? 'day')));
        if (!in_array($trendGranularity, self::TREND_GRANULARITIES, true)) {
            throw ValidationException::withMessages([
                'trendGranularity' => ['Kiểu tổng hợp xu hướng không hợp lệ.'],
            ]);
        }

        $page = max(1, (int) ($input['page'] ?? 1));
        $perPage = (int) ($input['perPage'] ?? 20);
        if (!in_array($perPage, self::PER_PAGE_OPTIONS, true)) {
            throw ValidationException::withMessages([
                'perPage' => ['perPage chỉ nhận: '.implode(', ', self::PER_PAGE_OPTIONS)],
            ]);
        }

        $sortBy = (string) ($input['sortBy'] ?? 'netRevenue');
        if (!in_array($sortBy, self::SORT_FIELDS, true)) {
            throw ValidationException::withMessages([
                'sortBy' => ['Trường sắp xếp không được phép.'],
            ]);
        }
        $sortDirection = strtolower((string) ($input['sortDirection'] ?? 'desc'));
        if (!in_array($sortDirection, ['asc', 'desc'], true)) {
            throw ValidationException::withMessages([
                'sortDirection' => ['Chỉ chấp nhận asc|desc.'],
            ]);
        }

        $search = trim((string) ($input['search'] ?? ''));
        if (mb_strlen($search) > 100) {
            throw ValidationException::withMessages([
                'search' => ['Từ khóa tìm kiếm tối đa 100 ký tự.'],
            ]);
        }

        return [
            'from' => $from,
            'to' => $to,
            'storeIds' => $storeIds,
            'staffId' => $staffId !== '' ? $staffId : null,
            'channel' => $channel !== '' ? $channel : null,
            'saleChannel' => $saleChannel !== '' ? $saleChannel : null,
            'statuses' => $statuses,
            'paymentMethod' => $paymentMethod !== '' ? $paymentMethod : null,
            'compare' => $compare,
            'metric' => $metric,
            'trendGranularity' => $trendGranularity,
            'page' => $page,
            'perPage' => $perPage,
            'sortBy' => $sortBy,
            'sortDirection' => $sortDirection,
            'search' => $search !== '' ? $search : null,
        ];
    }

    private function parseStoreIds(array $input): array
    {
        $raw = $input['storeIds'] ?? $input['storeId'] ?? null;
        if ($raw === null || $raw === '' || $raw === []) {
            return [];
        }
        if (is_array($raw)) {
            $ids = array_map(fn ($v) => trim((string) $v), $raw);
        } else {
            $ids = array_map('trim', explode(',', (string) $raw));
        }

        return array_values(array_filter($ids, fn ($id) => $id !== ''));
    }

    private function previousPeriodFilters(array $filters): array
    {
        $days = $filters['from']->diffInDays($filters['to']) + 1;
        $prevTo = $filters['from']->copy()->subDay()->startOfDay();
        $prevFrom = $prevTo->copy()->subDays($days - 1)->startOfDay();

        $next = $filters;
        $next['from'] = $prevFrom;
        $next['to'] = $prevTo;

        return $next;
    }

    private function loadSales(array $filters): Collection
    {
        $query = (new MirrorRecord())->forTable('sale_payments')->newQuery();

        $statusList = [];
        foreach ($filters['statuses'] as $st) {
            $statusList[] = $st;
            $statusList[] = strtoupper($st);
        }
        $query->whereIn('status', array_values(array_unique($statusList)));

        if ($filters['storeIds'] !== []) {
            $query->whereIn('branch_id', array_map('intval', $filters['storeIds']));
        }

        if ($filters['channel'] !== null) {
            $query->where(function ($q) use ($filters) {
                $q->where('type', $filters['channel'])
                    ->orWhere('type', strtoupper($filters['channel']));
            });
        }

        if ($filters['staffId'] !== null) {
            $sid = (int) $filters['staffId'];
            $query->where(function ($q) use ($sid) {
                $q->where('user_id', $sid)->orWhere('author_id', $sid);
            });
        }

        $from = $filters['from']->toDateString();
        $to = $filters['to']->toDateString();
        $this->applyDateRange($query, $from, $to);

        $columns = [
            'id', 'mongo_id', 'code', 'status', 'type', 'branch_id', 'branch_mongo_id',
            'value', 'total', 'value_payment', 'discount_value', 'discount_type',
            'amount_products', 'total_cost', 'business_date', 'completed_at', 'created_at',
            'user_id', 'author_id', 'payment_lines', 'items', 'payload',
        ];

        $rows = $query->get($columns);

        return $rows->filter(function ($row) use ($filters) {
            if ($filters['saleChannel'] !== null) {
                $payload = is_array($row->payload) ? $row->payload : [];
                $ch = strtolower((string) (
                    $payload['channel']
                    ?? $payload['saleChannel']
                    ?? $payload['orderSource']
                    ?? ''
                ));
                if ($ch === 'cửa hàng' || $ch === 'cua hang') {
                    $ch = 'store';
                }
                if ($ch !== $filters['saleChannel'] && !str_contains($ch, $filters['saleChannel'])) {
                    return false;
                }
            }

            if ($filters['paymentMethod'] !== null) {
                $labels = $this->paymentLabelsFromSale($row);
                $needle = mb_strtolower($filters['paymentMethod']);
                $hit = false;
                foreach ($labels as $label) {
                    if (mb_strtolower($label) === $needle) {
                        $hit = true;
                        break;
                    }
                }
                if (!$hit) {
                    return false;
                }
            }

            return true;
        })->values();
    }

    /**
     * Load refunds; resolve store via branch_id, payload, or parent sale payment_mongo_id.
     * Refunds are counted only from product_refunds (never from sale refunded_value).
     */
    private function loadRefunds(array $filters, Collection $salesForLookup): Collection
    {
        $query = (new MirrorRecord())->forTable('product_refunds')->newQuery();

        $statusList = [];
        foreach ($filters['statuses'] as $st) {
            $statusList[] = $st;
            $statusList[] = strtoupper($st);
        }
        $includeEmptyStatus = in_array('completed', $filters['statuses'], true);
        $query->where(function ($q) use ($statusList, $includeEmptyStatus) {
            $q->whereIn('status', array_values(array_unique($statusList)));
            if ($includeEmptyStatus) {
                $q->orWhereNull('status')->orWhere('status', '');
            }
        });

        $from = $filters['from']->toDateString();
        $to = $filters['to']->toDateString();
        $this->applyDateRange($query, $from, $to);

        $columns = [
            'id', 'mongo_id', 'code', 'status', 'value', 'total',
            'refund_fee', 'business_date', 'completed_at', 'created_at',
            'user_id', 'payment_lines', 'items', 'payload', 'payment_mongo_id',
        ];
        if (Schema::hasColumn('product_refunds', 'total_payable_amount')) {
            $columns[] = 'total_payable_amount';
        }
        if (Schema::hasColumn('product_refunds', 'settlement_value')) {
            $columns[] = 'settlement_value';
        }
        if (Schema::hasColumn('product_refunds', 'branch_id')) {
            $columns[] = 'branch_id';
        }
        if (Schema::hasColumn('product_refunds', 'branch_mongo_id')) {
            $columns[] = 'branch_mongo_id';
        }
        if (Schema::hasColumn('product_refunds', 'user_created_id')) {
            $columns[] = 'user_created_id';
        }

        $rows = $query->get($columns);

        // Build payment_mongo_id -> branch_id map from already-loaded sales + DB lookup for orphans
        $saleBranchByMongo = [];
        foreach ($salesForLookup as $sale) {
            if ($sale->mongo_id) {
                $saleBranchByMongo[(string) $sale->mongo_id] = $sale->branch_id;
            }
        }

        $missingPaymentMongoIds = [];
        foreach ($rows as $row) {
            $pmid = $row->payment_mongo_id ?? null;
            if ($pmid && !array_key_exists((string) $pmid, $saleBranchByMongo)) {
                $missingPaymentMongoIds[] = (string) $pmid;
            }
        }
        if ($missingPaymentMongoIds !== []) {
            $parentSales = (new MirrorRecord())->forTable('sale_payments')->newQuery()
                ->whereIn('mongo_id', array_values(array_unique($missingPaymentMongoIds)))
                ->get(['mongo_id', 'branch_id', 'branch_mongo_id']);
            foreach ($parentSales as $ps) {
                $saleBranchByMongo[(string) $ps->mongo_id] = $ps->branch_id;
            }
        }

        $mongoToBranchId = Branch::query()
            ->whereNotNull('mongo_id')
            ->pluck('id', 'mongo_id')
            ->mapWithKeys(fn ($id, $mongo) => [(string) $mongo => (int) $id])
            ->all();

        return $rows->filter(function ($row) use ($filters, $saleBranchByMongo, $mongoToBranchId) {
            $payload = is_array($row->payload) ? $row->payload : [];

            // Resolve store id for this refund
            $resolvedStoreId = $this->resolveRefundStoreId($row, $payload, $saleBranchByMongo, $mongoToBranchId);
            $row->_resolved_store_id = $resolvedStoreId;

            if ($filters['storeIds'] !== []) {
                if ($resolvedStoreId === self::UNKNOWN_STORE_ID || !in_array($resolvedStoreId, $filters['storeIds'], true)) {
                    return false;
                }
            }

            if ($filters['staffId'] !== null) {
                $sid = (int) $filters['staffId'];
                $match = ((int) ($row->user_id ?? 0) === $sid)
                    || ((int) ($row->user_created_id ?? 0) === $sid)
                    || ((int) ($row->author_id ?? 0) === $sid);
                if (!$match) {
                    return false;
                }
            }

            if ($filters['channel'] !== null) {
                $type = strtolower((string) ($payload['type'] ?? $row->type ?? ''));
                if ($type !== '' && $type !== $filters['channel']) {
                    return false;
                }
            }

            if ($filters['saleChannel'] !== null) {
                $ch = strtolower((string) ($payload['channel'] ?? $payload['saleChannel'] ?? ''));
                if ($ch === 'cửa hàng' || $ch === 'cua hang') {
                    $ch = 'store';
                }
                if ($ch !== '' && $ch !== $filters['saleChannel'] && !str_contains($ch, $filters['saleChannel'])) {
                    return false;
                }
            }

            return true;
        })->values();
    }

    private function resolveRefundStoreId(
        object $row,
        array $payload,
        array $saleBranchByMongo,
        array $mongoToBranchId,
    ): string {
        if (isset($row->branch_id) && $row->branch_id !== null && $row->branch_id !== '') {
            return (string) $row->branch_id;
        }

        $raw = $payload['branchId'] ?? $payload['warehouseId'] ?? null;
        if (is_array($raw)) {
            $raw = $raw['id'] ?? $raw['_id'] ?? null;
        }
        if ($raw !== null && $raw !== '') {
            if (is_numeric($raw) && Branch::query()->where('id', (int) $raw)->exists()) {
                return (string) (int) $raw;
            }
            $asMongo = (string) $raw;
            if (isset($mongoToBranchId[$asMongo])) {
                return (string) $mongoToBranchId[$asMongo];
            }
        }

        $branchMongo = $row->branch_mongo_id ?? $payload['branchMongoId'] ?? null;
        if ($branchMongo && isset($mongoToBranchId[(string) $branchMongo])) {
            return (string) $mongoToBranchId[(string) $branchMongo];
        }

        $pmid = $row->payment_mongo_id ?? null;
        if ($pmid && array_key_exists((string) $pmid, $saleBranchByMongo)) {
            $bid = $saleBranchByMongo[(string) $pmid];
            if ($bid !== null && $bid !== '') {
                return (string) $bid;
            }
        }

        return self::UNKNOWN_STORE_ID;
    }

    private function resolveSaleStoreId(object $row, array $mongoToBranchId): string
    {
        if ($row->branch_id !== null && $row->branch_id !== '') {
            return (string) $row->branch_id;
        }
        $mongo = $row->branch_mongo_id ?? null;
        if ($mongo && isset($mongoToBranchId[(string) $mongo])) {
            return (string) $mongoToBranchId[(string) $mongo];
        }
        $payload = is_array($row->payload) ? $row->payload : [];
        $raw = $payload['branchId'] ?? $payload['warehouseId'] ?? null;
        if (is_array($raw)) {
            $raw = $raw['id'] ?? $raw['_id'] ?? null;
        }
        if ($raw !== null && $raw !== '') {
            if (is_numeric($raw)) {
                return (string) (int) $raw;
            }
            if (isset($mongoToBranchId[(string) $raw])) {
                return (string) $mongoToBranchId[(string) $raw];
            }
        }

        return self::UNKNOWN_STORE_ID;
    }

    private function loadBranchMap(Collection $sales, Collection $refunds): Collection
    {
        $ids = [];
        foreach ($sales as $row) {
            if ($row->branch_id) {
                $ids[] = (int) $row->branch_id;
            }
        }
        foreach ($refunds as $row) {
            $sid = $row->_resolved_store_id ?? null;
            if ($sid && $sid !== self::UNKNOWN_STORE_ID && is_numeric($sid)) {
                $ids[] = (int) $sid;
            }
        }
        $ids = array_values(array_unique($ids));
        if ($ids === []) {
            return Branch::query()->get(['id', 'name', 'code', 'is_active', 'mongo_id'])->keyBy(fn ($b) => (string) $b->id);
        }

        // Include all branches that appear + all active ones for name map completeness
        return Branch::query()
            ->whereIn('id', $ids)
            ->orWhere('is_active', true)
            ->get(['id', 'name', 'code', 'is_active', 'mongo_id'])
            ->keyBy(fn ($b) => (string) $b->id);
    }

    private function emptyStoreBucket(string $storeId, ?Branch $branch): array
    {
        $isUnknown = $storeId === self::UNKNOWN_STORE_ID;

        return [
            'storeId' => $storeId,
            'storeName' => $isUnknown ? 'Chưa xác định' : ($branch?->name ?? 'Cửa hàng #'.$storeId),
            'storeCode' => $isUnknown ? null : ($branch?->code ?? null),
            'isActive' => $isUnknown ? null : (bool) ($branch?->is_active ?? false),
            'grossRevenue' => 0.0,
            'discountAmount' => 0.0,
            'revenue' => 0.0,
            'refundAmount' => 0.0,
            'netRevenue' => 0.0,
            'invoiceCount' => 0,
            'itemQuantity' => 0.0,
            'averageOrderValue' => 0.0,
            'costAmount' => null,
            'grossProfit' => null,
            'grossMarginPercent' => null,
            'revenueSharePercent' => 0.0,
            'rank' => 0,
            '_costSum' => 0.0,
            '_costCount' => 0,
        ];
    }

    private function aggregateByStore(Collection $sales, Collection $refunds, Collection $branchMap): array
    {
        $mongoToBranchId = $branchMap
            ->filter(fn ($b) => $b->mongo_id)
            ->mapWithKeys(fn ($b) => [(string) $b->mongo_id => (string) $b->id])
            ->all();

        $buckets = [];

        foreach ($sales as $row) {
            $storeId = $this->resolveSaleStoreId($row, $mongoToBranchId);
            if (!isset($buckets[$storeId])) {
                $branch = $storeId !== self::UNKNOWN_STORE_ID ? $branchMap->get($storeId) : null;
                $buckets[$storeId] = $this->emptyStoreBucket($storeId, $branch);
            }
            $b = &$buckets[$storeId];
            $rev = $this->saleRevenue($row);
            $disc = $this->saleDiscount($row);
            $b['grossRevenue'] += $this->saleGross($row);
            $b['discountAmount'] += $disc;
            $b['revenue'] += $rev;
            $b['invoiceCount'] += 1;
            $b['itemQuantity'] += $this->saleQty($row);
            $cost = $this->saleCost($row);
            if ($cost !== null) {
                $b['_costSum'] += $cost;
                $b['_costCount'] += 1;
            }
            unset($b);
        }

        foreach ($refunds as $row) {
            $storeId = $row->_resolved_store_id ?? self::UNKNOWN_STORE_ID;
            if (!isset($buckets[$storeId])) {
                $branch = $storeId !== self::UNKNOWN_STORE_ID ? $branchMap->get($storeId) : null;
                $buckets[$storeId] = $this->emptyStoreBucket($storeId, $branch);
            }
            $buckets[$storeId]['refundAmount'] += $this->refundAmount($row);
        }

        $totalNet = 0.0;
        foreach ($buckets as &$b) {
            $b['netRevenue'] = $b['revenue'] - $b['refundAmount'];
            $b['averageOrderValue'] = $b['invoiceCount'] > 0
                ? round($b['revenue'] / $b['invoiceCount'], 2)
                : 0.0;
            if ($b['_costCount'] > 0) {
                $b['costAmount'] = round($b['_costSum'], 2);
                $b['grossProfit'] = round($b['revenue'] - $b['_costSum'], 2);
                $b['grossMarginPercent'] = $b['revenue'] > 0
                    ? round((($b['revenue'] - $b['_costSum']) / $b['revenue']) * 100, 2)
                    : null;
            } else {
                $b['costAmount'] = null;
                $b['grossProfit'] = null;
                $b['grossMarginPercent'] = null;
            }
            foreach (['grossRevenue', 'discountAmount', 'revenue', 'refundAmount', 'netRevenue', 'itemQuantity'] as $f) {
                $b[$f] = round((float) $b[$f], 2);
            }
            $totalNet += $b['netRevenue'];
            unset($b['_costSum'], $b['_costCount']);
        }
        unset($b);

        foreach ($buckets as &$b) {
            $b['revenueSharePercent'] = $totalNet > 0
                ? round(($b['netRevenue'] / $totalNet) * 100, 2)
                : 0.0;
        }
        unset($b);

        return $buckets;
    }

    private function applySearch(array $storeRows, ?string $search): array
    {
        if ($search === null || $search === '') {
            return $storeRows;
        }
        $needle = mb_strtolower($search);

        return array_filter(
            $storeRows,
            function ($row) use ($needle) {
                $name = mb_strtolower((string) ($row['storeName'] ?? ''));
                $code = mb_strtolower((string) ($row['storeCode'] ?? ''));

                return str_contains($name, $needle) || str_contains($code, $needle);
            },
            ARRAY_FILTER_USE_BOTH
        );
    }

    private function buildSummary(array $storeRows, Collection $branchMap): array
    {
        $gross = 0.0;
        $discount = 0.0;
        $revenue = 0.0;
        $refund = 0.0;
        $qty = 0.0;
        $invoices = 0;
        $costSum = 0.0;
        $costCount = 0;
        $activeStoreCount = 0;
        $topStore = null;

        foreach ($storeRows as $row) {
            $gross += $row['grossRevenue'];
            $discount += $row['discountAmount'];
            $revenue += $row['revenue'];
            $refund += $row['refundAmount'];
            $qty += $row['itemQuantity'];
            $invoices += $row['invoiceCount'];
            if ($row['costAmount'] !== null) {
                $costSum += $row['costAmount'];
                $costCount++;
            }
            if ($row['isActive'] === true) {
                $activeStoreCount++;
            }
            if ($topStore === null || $row['netRevenue'] > $topStore['netRevenue']) {
                $topStore = $row;
            }
        }

        $net = $revenue - $refund;
        $aov = $invoices > 0 ? $revenue / $invoices : 0.0;
        $costAmount = $costCount > 0 ? round($costSum, 2) : null;
        $grossProfit = $costCount > 0 ? round($revenue - $costSum, 2) : null;
        $margin = ($costCount > 0 && $revenue > 0)
            ? round((($revenue - $costSum) / $revenue) * 100, 2)
            : null;

        return [
            'storeCount' => count($storeRows),
            'activeStoreCount' => $activeStoreCount,
            'grossRevenue' => round($gross, 2),
            'discountAmount' => round($discount, 2),
            'revenue' => round($revenue, 2),
            'refundAmount' => round($refund, 2),
            'netRevenue' => round($net, 2),
            'invoiceCount' => $invoices,
            'itemQuantity' => round($qty, 2),
            'averageOrderValue' => round($aov, 2),
            'costAmount' => $costAmount,
            'grossProfit' => $grossProfit,
            'grossMarginPercent' => $margin,
            'topStore' => $topStore ? [
                'id' => $topStore['storeId'],
                'name' => $topStore['storeName'],
                'code' => $topStore['storeCode'],
                'netRevenue' => $topStore['netRevenue'],
            ] : null,
        ];
    }

    private function buildRanking(array $storeRows, string $metric): array
    {
        $list = array_values($storeRows);
        usort($list, function ($a, $b) use ($metric) {
            $av = $a[$metric] ?? $a['netRevenue'] ?? 0;
            $bv = $b[$metric] ?? $b['netRevenue'] ?? 0;
            if ($av == $bv) {
                return strcmp((string) $a['storeName'], (string) $b['storeName']);
            }

            return $bv <=> $av;
        });

        $rank = 1;
        foreach ($list as &$row) {
            $row['rank'] = $rank++;
        }
        unset($row);

        return $list;
    }

    private function paginateRanking(array $ranking, array $filters): array
    {
        $sortBy = $filters['sortBy'];
        $dir = $filters['sortDirection'] === 'desc' ? -1 : 1;

        $sorted = $ranking;
        usort($sorted, function ($a, $b) use ($sortBy, $dir) {
            if ($sortBy === 'storeName') {
                return strcmp((string) $a['storeName'], (string) $b['storeName']) * $dir;
            }
            $av = $a[$sortBy] ?? 0;
            $bv = $b[$sortBy] ?? 0;
            if (is_numeric($av) && is_numeric($bv)) {
                return $av == $bv ? 0 : ($av < $bv ? -1 * $dir : 1 * $dir);
            }

            return strcmp((string) $av, (string) $bv) * $dir;
        });

        $total = count($sorted);
        $page = $filters['page'];
        $perPage = $filters['perPage'];
        $totalPages = max(1, (int) ceil(max(1, $total) / $perPage));
        if ($total === 0) {
            $totalPages = 0;
        }
        if ($page > max(1, $totalPages) && $totalPages > 0) {
            $page = $totalPages;
        }
        $offset = ($page - 1) * $perPage;
        $data = array_slice($sorted, $offset, $perPage);

        $totals = [
            'grossRevenue' => 0.0,
            'discountAmount' => 0.0,
            'revenue' => 0.0,
            'refundAmount' => 0.0,
            'netRevenue' => 0.0,
            'invoiceCount' => 0,
            'itemQuantity' => 0.0,
            'costAmount' => null,
            'grossProfit' => null,
        ];
        $costSum = 0.0;
        $costCount = 0;
        foreach ($sorted as $row) {
            $totals['grossRevenue'] += $row['grossRevenue'];
            $totals['discountAmount'] += $row['discountAmount'];
            $totals['revenue'] += $row['revenue'];
            $totals['refundAmount'] += $row['refundAmount'];
            $totals['netRevenue'] += $row['netRevenue'];
            $totals['invoiceCount'] += $row['invoiceCount'];
            $totals['itemQuantity'] += $row['itemQuantity'];
            if ($row['costAmount'] !== null) {
                $costSum += $row['costAmount'];
                $costCount++;
            }
        }
        foreach (['grossRevenue', 'discountAmount', 'revenue', 'refundAmount', 'netRevenue', 'itemQuantity'] as $k) {
            $totals[$k] = round($totals[$k], 2);
        }
        $totals['averageOrderValue'] = $totals['invoiceCount'] > 0
            ? round($totals['revenue'] / $totals['invoiceCount'], 2)
            : 0.0;
        $totals['costAmount'] = $costCount > 0 ? round($costSum, 2) : null;
        $totals['grossProfit'] = $costCount > 0 ? round($totals['revenue'] - $costSum, 2) : null;

        return [
            'data' => array_values($data),
            'totals' => $totals,
            'pagination' => [
                'page' => $page,
                'perPage' => $perPage,
                'total' => $total,
                'totalPages' => $totalPages,
            ],
        ];
    }

    private function buildTrend(
        array $filters,
        Collection $sales,
        Collection $refunds,
        Collection $branchMap,
        array $ranking,
    ): array {
        $granularity = $filters['trendGranularity'];
        $metric = $filters['metric'];

        // Top N stores by ranking metric for multi-series chart
        $topIds = array_slice(array_map(fn ($r) => $r['storeId'], $ranking), 0, self::TOP_TREND_STORES);
        if ($topIds === []) {
            return [
                'granularity' => $granularity,
                'series' => [],
                'buckets' => [],
                'note' => null,
            ];
        }

        $mongoToBranchId = $branchMap
            ->filter(fn ($b) => $b->mongo_id)
            ->mapWithKeys(fn ($b) => [(string) $b->mongo_id => (string) $b->id])
            ->all();

        // Continuous time buckets
        $timeBuckets = [];
        $cursor = $filters['from']->copy();
        $end = $filters['to']->copy();
        while ($cursor->lte($end)) {
            $meta = $this->bucketKey($cursor, $granularity);
            if (!isset($timeBuckets[$meta['key']])) {
                $timeBuckets[$meta['key']] = [
                    'key' => $meta['key'],
                    'label' => $meta['label'],
                ];
            }
            $cursor = match ($granularity) {
                'week' => $cursor->addWeek(),
                'month' => $cursor->addMonthNoOverflow(),
                default => $cursor->addDay(),
            };
        }

        // Per store per time key accumulators
        $seriesData = [];
        foreach ($topIds as $sid) {
            $name = $sid === self::UNKNOWN_STORE_ID
                ? 'Chưa xác định'
                : ($branchMap->get($sid)?->name ?? 'Cửa hàng #'.$sid);
            $seriesData[$sid] = [
                'storeId' => $sid,
                'storeName' => $name,
                'points' => [],
                '_acc' => [],
            ];
            foreach ($timeBuckets as $key => $tb) {
                $seriesData[$sid]['_acc'][$key] = [
                    'grossRevenue' => 0.0,
                    'revenue' => 0.0,
                    'refundAmount' => 0.0,
                    'netRevenue' => 0.0,
                    'invoiceCount' => 0,
                    'itemQuantity' => 0.0,
                ];
            }
        }

        foreach ($sales as $row) {
            $storeId = $this->resolveSaleStoreId($row, $mongoToBranchId);
            if (!isset($seriesData[$storeId])) {
                continue;
            }
            $time = $this->eventTime($row);
            $meta = $this->bucketKey($time, $granularity);
            $key = $meta['key'];
            if (!isset($seriesData[$storeId]['_acc'][$key])) {
                $seriesData[$storeId]['_acc'][$key] = [
                    'grossRevenue' => 0.0,
                    'revenue' => 0.0,
                    'refundAmount' => 0.0,
                    'netRevenue' => 0.0,
                    'invoiceCount' => 0,
                    'itemQuantity' => 0.0,
                ];
                if (!isset($timeBuckets[$key])) {
                    $timeBuckets[$key] = ['key' => $key, 'label' => $meta['label']];
                }
            }
            $acc = &$seriesData[$storeId]['_acc'][$key];
            $acc['grossRevenue'] += $this->saleGross($row);
            $acc['revenue'] += $this->saleRevenue($row);
            $acc['invoiceCount'] += 1;
            $acc['itemQuantity'] += $this->saleQty($row);
            unset($acc);
        }

        foreach ($refunds as $row) {
            $storeId = $row->_resolved_store_id ?? self::UNKNOWN_STORE_ID;
            if (!isset($seriesData[$storeId])) {
                continue;
            }
            $time = $this->eventTime($row);
            $meta = $this->bucketKey($time, $granularity);
            $key = $meta['key'];
            if (!isset($seriesData[$storeId]['_acc'][$key])) {
                $seriesData[$storeId]['_acc'][$key] = [
                    'grossRevenue' => 0.0,
                    'revenue' => 0.0,
                    'refundAmount' => 0.0,
                    'netRevenue' => 0.0,
                    'invoiceCount' => 0,
                    'itemQuantity' => 0.0,
                ];
            }
            $seriesData[$storeId]['_acc'][$key]['refundAmount'] += $this->refundAmount($row);
        }

        $series = [];
        foreach ($seriesData as $sid => $s) {
            $points = [];
            ksort($s['_acc']);
            foreach ($s['_acc'] as $key => $acc) {
                $label = $timeBuckets[$key]['label'] ?? $key;
                $points[] = [
                    'key' => $key,
                    'label' => $label,
                    'grossRevenue' => round($acc['grossRevenue'], 2),
                    'revenue' => round($acc['revenue'], 2),
                    'refundAmount' => round($acc['refundAmount'], 2),
                    'netRevenue' => round($acc['revenue'] - $acc['refundAmount'], 2),
                    'invoiceCount' => $acc['invoiceCount'],
                    'itemQuantity' => round($acc['itemQuantity'], 2),
                ];
            }
            $series[] = [
                'storeId' => $sid,
                'storeName' => $s['storeName'],
                'points' => $points,
            ];
        }

        $note = count($ranking) > self::TOP_TREND_STORES
            ? sprintf('Biểu đồ xu hướng hiển thị top %d cửa hàng theo %s.', self::TOP_TREND_STORES, $metric)
            : null;

        return [
            'granularity' => $granularity,
            'series' => $series,
            'buckets' => array_values($timeBuckets),
            'note' => $note,
        ];
    }

    private function buildBreakdowns(
        Collection $sales,
        Collection $refunds,
        Collection $branchMap,
        array $ranking,
    ): array {
        $mongoToBranchId = $branchMap
            ->filter(fn ($b) => $b->mongo_id)
            ->mapWithKeys(fn ($b) => [(string) $b->mongo_id => (string) $b->id])
            ->all();

        $userMap = User::query()->get(['id', 'name'])->keyBy('id');

        $revenueShareByStore = array_map(fn ($r) => [
            'key' => $r['storeId'],
            'label' => $r['storeName'],
            'revenue' => $r['netRevenue'],
            'invoiceCount' => $r['invoiceCount'],
            'percent' => $r['revenueSharePercent'],
        ], $ranking);

        // Group tiny slices into "Khác" for pie readability
        $revenueShareByStore = $this->normalizeBreakdown($revenueShareByStore, 10, 'revenue');

        $byChannel = [];
        $byPayment = [];
        $byStaff = [];

        foreach ($sales as $row) {
            $rev = $this->saleRevenue($row);

            $type = strtolower((string) ($row->type ?? ''));
            if ($type === '') {
                $payload = is_array($row->payload) ? $row->payload : [];
                $type = strtolower((string) ($payload['type'] ?? 'unknown'));
            }
            $channelLabel = match ($type) {
                'retail' => 'Bán lẻ',
                'wholesale' => 'Bán sỉ',
                default => $type !== '' ? $type : 'Không xác định',
            };
            $ck = $type ?: 'unknown';
            if (!isset($byChannel[$ck])) {
                $byChannel[$ck] = ['key' => $ck, 'label' => $channelLabel, 'revenue' => 0.0, 'invoiceCount' => 0];
            }
            $byChannel[$ck]['revenue'] += $rev;
            $byChannel[$ck]['invoiceCount'] += 1;

            $labels = $this->paymentLabelsFromSale($row);
            if ($labels === []) {
                $labels = ['Không xác định'];
            }
            $share = $rev / count($labels);
            foreach ($labels as $label) {
                $k = mb_strtolower($label);
                if (!isset($byPayment[$k])) {
                    $byPayment[$k] = ['key' => $label, 'label' => $label, 'revenue' => 0.0, 'invoiceCount' => 0];
                }
                $byPayment[$k]['revenue'] += $share;
                $byPayment[$k]['invoiceCount'] += 1;
            }

            $staffId = $row->user_id ?: $row->author_id;
            $staffKey = $staffId ? (string) $staffId : 'unknown';
            $staffName = $staffId
                ? ($userMap->get($staffId)?->name ?? 'Nhân viên #'.$staffId)
                : $this->staffNameFromPayload($row);
            if (!isset($byStaff[$staffKey])) {
                $byStaff[$staffKey] = ['key' => $staffKey, 'label' => $staffName, 'revenue' => 0.0, 'invoiceCount' => 0];
            }
            $byStaff[$staffKey]['revenue'] += $rev;
            $byStaff[$staffKey]['invoiceCount'] += 1;
        }

        return [
            'revenueShareByStore' => $revenueShareByStore,
            'channels' => $this->normalizeBreakdown(array_values($byChannel), 20),
            'paymentMethods' => $this->normalizeBreakdown(array_values($byPayment), 10),
            'staff' => $this->normalizeBreakdown(array_values($byStaff), 10),
        ];
    }

    private function normalizeBreakdown(array $items, int $topN = 10, string $valueKey = 'revenue'): array
    {
        usort($items, fn ($a, $b) => ($b[$valueKey] ?? 0) <=> ($a[$valueKey] ?? 0));
        $totalRev = array_sum(array_column($items, $valueKey));
        if (count($items) > $topN) {
            $top = array_slice($items, 0, $topN);
            $rest = array_slice($items, $topN);
            $other = [
                'key' => 'other',
                'label' => 'Khác',
                'revenue' => array_sum(array_column($rest, $valueKey)),
                'invoiceCount' => array_sum(array_column($rest, 'invoiceCount')),
            ];
            $items = array_merge($top, [$other]);
        }
        foreach ($items as &$item) {
            $item['revenue'] = round((float) ($item[$valueKey] ?? $item['revenue'] ?? 0), 2);
            $item['percent'] = $totalRev > 0
                ? round(($item['revenue'] / $totalRev) * 100, 2)
                : 0.0;
        }
        unset($item);

        return $items;
    }

    private function buildComparisonMetrics(array $current, array $previous): array
    {
        $keys = [
            'grossRevenue', 'discountAmount', 'revenue', 'refundAmount', 'netRevenue',
            'invoiceCount', 'itemQuantity', 'averageOrderValue', 'costAmount', 'grossProfit',
            'storeCount',
        ];
        $out = [];
        foreach ($keys as $key) {
            $cur = $current[$key] ?? null;
            $prev = $previous[$key] ?? null;
            if ($cur === null && $prev === null) {
                $out[$key] = null;
                continue;
            }
            $c = (float) ($cur ?? 0);
            $p = (float) ($prev ?? 0);
            $change = $c - $p;
            $pct = $p == 0.0 ? null : round(($change / $p) * 100, 2);
            $out[$key] = [
                'currentValue' => $cur,
                'previousValue' => $prev,
                'changeValue' => $cur === null && $prev === null ? null : round($change, 2),
                'changePercent' => $pct,
            ];
        }

        return $out;
    }

    private function applyDateRange($query, string $from, string $to): void
    {
        $query->where(function ($q) use ($from, $to) {
            $q->where(function ($inner) use ($from, $to) {
                $inner->whereNotNull('business_date')
                    ->whereDate('business_date', '>=', $from)
                    ->whereDate('business_date', '<=', $to);
            })->orWhere(function ($inner) use ($from, $to) {
                $inner->whereNull('business_date')
                    ->whereNotNull('completed_at')
                    ->whereDate('completed_at', '>=', $from)
                    ->whereDate('completed_at', '<=', $to);
            })->orWhere(function ($inner) use ($from, $to) {
                $inner->whereNull('business_date')
                    ->whereNull('completed_at')
                    ->whereDate('created_at', '>=', $from)
                    ->whereDate('created_at', '<=', $to);
            });
        });
    }

    private function saleRevenue(object $row): float
    {
        $value = $row->value;
        if ($value === null || $value === '' || !is_numeric($value)) {
            $value = $row->value_payment;
        }
        if ($value === null || $value === '' || !is_numeric($value)) {
            $payload = is_array($row->payload) ? $row->payload : [];
            $value = $payload['total'] ?? $payload['totalAmount'] ?? $payload['value'] ?? 0;
        }

        return max(0.0, (float) $value);
    }

    private function saleDiscount(object $row): float
    {
        if ($row->discount_value !== null && is_numeric($row->discount_value)) {
            return max(0.0, (float) $row->discount_value);
        }
        $payload = is_array($row->payload) ? $row->payload : [];
        $d = $payload['discountValue'] ?? $payload['discount_value'] ?? $payload['discount'] ?? 0;

        return max(0.0, is_numeric($d) ? (float) $d : 0.0);
    }

    private function saleGross(object $row): float
    {
        return $this->saleRevenue($row) + $this->saleDiscount($row);
    }

    private function saleQty(object $row): float
    {
        if ($row->amount_products !== null && is_numeric($row->amount_products)) {
            return max(0.0, (float) $row->amount_products);
        }
        $items = is_array($row->items) ? $row->items : [];
        if ($items === []) {
            $payload = is_array($row->payload) ? $row->payload : [];
            $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];
        }
        $qty = 0.0;
        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }
            $qty += (float) ($item['amount'] ?? $item['quantity'] ?? 0);
        }

        return max(0.0, $qty);
    }

    private function saleCost(object $row): ?float
    {
        if ($row->total_cost !== null && is_numeric($row->total_cost)) {
            return max(0.0, (float) $row->total_cost);
        }
        $payload = is_array($row->payload) ? $row->payload : [];
        if (isset($payload['totalCost']) && is_numeric($payload['totalCost'])) {
            return max(0.0, (float) $payload['totalCost']);
        }

        return null;
    }

    private function refundAmount(object $row): float
    {
        $candidates = [
            $row->value ?? null,
            $row->total ?? null,
            $row->total_payable_amount ?? null,
        ];
        $payload = is_array($row->payload) ? $row->payload : [];
        $candidates[] = $payload['value'] ?? null;
        $candidates[] = $payload['total'] ?? null;
        $candidates[] = $payload['totalPayableAmount'] ?? null;
        $candidates[] = $payload['refundAmount'] ?? null;

        foreach ($candidates as $c) {
            if ($c !== null && $c !== '' && is_numeric($c)) {
                return abs((float) $c);
            }
        }

        return 0.0;
    }

    private function eventTime(object $row): Carbon
    {
        $tz = self::TIMEZONE;
        foreach (['business_date', 'completed_at', 'created_at'] as $field) {
            $v = $row->{$field} ?? null;
            if ($v instanceof Carbon) {
                return $v->copy()->timezone($tz);
            }
            if ($v) {
                try {
                    return Carbon::parse($v)->timezone($tz);
                } catch (\Throwable) {
                    // continue
                }
            }
        }

        return Carbon::now($tz);
    }

    private function bucketKey(Carbon $time, string $granularity): array
    {
        return match ($granularity) {
            'week' => [
                'key' => $time->format('o-\WW'),
                'label' => 'Tuần '.$time->format('W').'/'.$time->format('o'),
            ],
            'month' => [
                'key' => $time->format('Y-m'),
                'label' => 'Tháng '.$time->format('m/Y'),
            ],
            default => [
                'key' => $time->format('Y-m-d'),
                'label' => $time->format('d/m'),
            ],
        };
    }

    private function paymentLabelsFromSale(object $row): array
    {
        $labels = [];
        $lines = is_array($row->payment_lines) ? $row->payment_lines : [];
        if ($lines === []) {
            $payload = is_array($row->payload) ? $row->payload : [];
            $lines = $payload['typePayment'] ?? $payload['paymentLines'] ?? [];
            if (!is_array($lines)) {
                $lines = [];
            }
            $single = $payload['paymentMethod'] ?? $payload['payment_method'] ?? null;
            if ($lines === [] && $single) {
                return [(string) $single];
            }
        }
        foreach ($lines as $line) {
            if (!is_array($line)) {
                continue;
            }
            $name = $line['methodId']['name']
                ?? $line['method']
                ?? $line['name']
                ?? $line['label']
                ?? null;
            if ($name) {
                $labels[] = (string) $name;
            }
        }

        return array_values(array_unique($labels));
    }

    private function staffNameFromPayload(object $row): string
    {
        $payload = is_array($row->payload) ? $row->payload : [];
        $sp = $payload['salesperson'] ?? $payload['techStaff'] ?? $payload['staff'] ?? $payload['author'] ?? $payload['createdBy'] ?? null;
        if (is_array($sp)) {
            return (string) ($sp['name'] ?? 'Không xác định');
        }
        if (is_string($sp) && $sp !== '') {
            return $sp;
        }

        return 'Không xác định';
    }

    private function distinctPaymentMethodLabels(): array
    {
        $fromCatalog = [];
        try {
            $methods = (new MirrorRecord())->forTable('payment_methods')->newQuery()
                ->orderBy('name')
                ->get(['name', 'code', 'mongo_id']);
            foreach ($methods as $m) {
                $label = $m->name ?: $m->code;
                if ($label) {
                    $fromCatalog[] = [
                        'value' => (string) $label,
                        'label' => (string) $label,
                    ];
                }
            }
        } catch (\Throwable) {
            // table may be empty
        }

        if ($fromCatalog !== []) {
            return $fromCatalog;
        }

        $sales = (new MirrorRecord())->forTable('sale_payments')->newQuery()
            ->orderByDesc('id')
            ->limit(500)
            ->get(['payment_lines', 'payload']);
        $set = [];
        foreach ($sales as $row) {
            foreach ($this->paymentLabelsFromSale($row) as $label) {
                $set[mb_strtolower($label)] = $label;
            }
        }

        return collect($set)->sort()->values()->map(fn ($label) => [
            'value' => $label,
            'label' => $label,
        ])->all();
    }
}
