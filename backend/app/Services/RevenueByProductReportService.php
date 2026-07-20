<?php

namespace App\Services;

use App\Models\Branch;
use App\Models\Category;
use App\Models\MirrorRecord;
use App\Models\Product;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * Read-only revenue-by-product report.
 *
 * Evidence / business mapping (do not invent outside this):
 * - Sales source: sale_payments (DashboardController, RevenueByTimeReportService)
 * - Product lines: items[] or payload.items (DashboardController::dailyProducts / topProducts)
 * - Line revenue: item.total ?? item.value (DashboardController)
 * - Line qty: item.amount (DashboardController)
 * - Product id: item.productId ?? item.product_id (supports nested object id/_id)
 * - Completed status: completed / COMPLETED; draft/cancelled excluded by default
 * - Timestamp: business_date (fallback completed_at, created_at)
 * - Refunds: product_refunds line items (qty + line money when present)
 * - Invoice-level discount is NOT allocated to products (no allocation formula in source)
 * - Line discount: item.discountValue when present only
 * - Category/trademark: products table snapshot + line item name/code fallback
 * - netRevenue (product) = revenue - refundAmount (line-level)
 */
class RevenueByProductReportService
{
    public const TIMEZONE = 'Asia/Ho_Chi_Minh';

    public const UNKNOWN_PRODUCT_ID = 'unknown';

    public const DEFAULT_STATUSES = ['completed'];

    public const ALLOWED_STATUSES = ['completed', 'draft', 'cancelled'];

    public const SALE_TYPES = ['retail', 'wholesale'];

    public const PER_PAGE_OPTIONS = [20, 50, 100];

    public const TREND_GRANULARITIES = ['day', 'week', 'month'];

    public const TOP_OPTIONS = [5, 10, 20, 50];

    public const METRICS = [
        'netRevenue',
        'revenue',
        'grossRevenue',
        'invoiceCount',
        'itemQuantity',
        'averageSellingPrice',
    ];

    public const SORT_FIELDS = [
        'netRevenue',
        'revenue',
        'grossRevenue',
        'invoiceCount',
        'itemQuantity',
        'averageSellingPrice',
        'productName',
        'productCode',
        'refundAmount',
        'discountAmount',
        'qtyReturned',
        'revenueSharePercent',
        'rank',
        'lastSoldAt',
    ];

    public const MAX_RANGE_DAYS = 1826;

    public const TOP_TREND_PRODUCTS = 8;

    public const MAX_CATEGORY_PIE = 10;

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

        $categories = Category::query()
            ->orderBy('name')
            ->get(['id', 'name', 'code', 'is_active'])
            ->map(fn (Category $c) => [
                'id' => (string) $c->id,
                'name' => $c->name,
                'code' => $c->code,
                'isActive' => (bool) $c->is_active,
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
            'categories' => $categories,
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
                'today', 'yesterday', 'last_7_days', 'last_15_days', 'last_30_days',
                'this_week', 'this_month', 'last_month', 'this_quarter', 'this_year', 'custom',
            ],
            'compareModes' => [
                ['value' => 'none', 'label' => 'Không so sánh'],
                ['value' => 'previous_period', 'label' => 'So với kỳ trước'],
            ],
            'metrics' => [
                ['value' => 'netRevenue', 'label' => 'Doanh thu thuần'],
                ['value' => 'revenue', 'label' => 'Doanh thu'],
                ['value' => 'grossRevenue', 'label' => 'Doanh thu trước giảm dòng'],
                ['value' => 'invoiceCount', 'label' => 'Số hóa đơn'],
                ['value' => 'itemQuantity', 'label' => 'Số lượng bán'],
                ['value' => 'averageSellingPrice', 'label' => 'Giá bán TB'],
            ],
            'trendGranularities' => [
                ['value' => 'day', 'label' => 'Theo ngày'],
                ['value' => 'week', 'label' => 'Theo tuần'],
                ['value' => 'month', 'label' => 'Theo tháng'],
            ],
            'topOptions' => self::TOP_OPTIONS,
            'sortOptions' => [
                ['value' => 'netRevenue', 'label' => 'Doanh thu thuần'],
                ['value' => 'revenue', 'label' => 'Doanh thu'],
                ['value' => 'itemQuantity', 'label' => 'Số lượng bán'],
                ['value' => 'invoiceCount', 'label' => 'Số hóa đơn'],
                ['value' => 'averageSellingPrice', 'label' => 'Giá bán TB'],
                ['value' => 'productName', 'label' => 'Tên sản phẩm'],
                ['value' => 'productCode', 'label' => 'Mã sản phẩm'],
            ],
            'perPageOptions' => self::PER_PAGE_OPTIONS,
            'timezone' => self::TIMEZONE,
            'currency' => 'VND',
            'formulas' => [
                'revenue' => 'SUM(item.total ?? item.value) trên line items sale_payments — DashboardController',
                'itemQuantity' => 'SUM(item.amount) trên line items',
                'discountAmount' => 'SUM(item.discountValue) khi có trên dòng; không phân bổ giảm giá cấp hóa đơn',
                'grossRevenue' => 'revenue + discountAmount (dòng)',
                'refundAmount' => 'SUM(item.total ?? item.value) trên product_refunds items (khi có); fallback 0 cho dòng không có tiền',
                'qtyReturned' => 'SUM(item.amount) trên product_refunds items',
                'netRevenue' => 'revenue - refundAmount',
                'averageSellingPrice' => 'revenue / itemQuantity (0 nếu qty = 0)',
                'invoiceCount' => 'số hóa đơn distinct chứa sản phẩm',
                'timestamp' => 'business_date (fallback completed_at, created_at)',
                'defaultStatus' => 'completed / COMPLETED only',
                'productKey' => 'productId/product_id ổn định; snapshot name/code từ line nếu product đã xóa',
            ],
        ];
    }

    public function report(array $input): array
    {
        $filters = $this->normalizeFilters($input);

        $sales = $this->loadSales($filters);
        $refunds = $this->loadRefunds($filters);

        $productRows = $this->aggregateByProduct($sales, $refunds);
        $productRows = $this->enrichProducts($productRows);
        $productRows = $this->applyProductFilters($productRows, $filters);

        $summary = $this->buildSummary($productRows, $sales, $refunds);
        $ranking = $this->buildRanking($productRows, $filters['metric']);
        $table = $this->paginateRanking($ranking, $filters);
        $timeline = $this->buildTimeline($filters, $sales, $refunds);
        $trend = $this->buildTrend($filters, $sales, $refunds, $ranking);
        $breakdowns = $this->buildBreakdowns($productRows, $sales);
        $pareto = $this->buildPareto($ranking);

        $comparison = null;
        if ($filters['compare'] === 'previous_period') {
            $prevFilters = $this->previousPeriodFilters($filters);
            $prevSales = $this->loadSales($prevFilters);
            $prevRefunds = $this->loadRefunds($prevFilters);
            $prevRows = $this->aggregateByProduct($prevSales, $prevRefunds);
            $prevRows = $this->enrichProducts($prevRows);
            $prevRows = $this->applyProductFilters($prevRows, $filters);
            $prevSummary = $this->buildSummary($prevRows, $prevSales, $prevRefunds);
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
                'categoryIds' => $filters['categoryIds'],
                'staffId' => $filters['staffId'],
                'channel' => $filters['channel'],
                'saleChannel' => $filters['saleChannel'],
                'status' => $filters['statuses'],
                'paymentMethod' => $filters['paymentMethod'],
                'compare' => $filters['compare'],
                'metric' => $filters['metric'],
                'trendGranularity' => $filters['trendGranularity'],
                'top' => $filters['top'],
                'search' => $filters['search'],
                'minRevenue' => $filters['minRevenue'],
                'maxRevenue' => $filters['maxRevenue'],
                'minQuantity' => $filters['minQuantity'],
                'maxQuantity' => $filters['maxQuantity'],
                'timezone' => self::TIMEZONE,
            ],
            'summary' => $summary,
            'comparison' => $comparison,
            // Full filtered ranking (same as store report). Frontend slices by `top` for charts.
            'ranking' => $ranking,
            'timeline' => $timeline,
            'trend' => $trend,
            'pareto' => $pareto,
            'breakdowns' => $breakdowns,
            'table' => $table,
            'meta' => [
                'generatedAt' => Carbon::now(self::TIMEZONE)->toIso8601String(),
                'currency' => 'VND',
                'timezone' => self::TIMEZONE,
                'saleCountLoaded' => $sales->count(),
                'refundCountLoaded' => $refunds->count(),
                'productCountMatched' => count($productRows),
                'notes' => [
                    'Doanh thu sản phẩm lấy từ line items (total/value), không phân bổ giảm giá cấp hóa đơn.',
                    'Hoàn tiền theo dòng product_refunds items khi có tiền; nếu chỉ có số lượng thì chỉ cộng qtyReturned.',
                ],
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

        $storeIds = $this->parseIdList($input['storeIds'] ?? $input['storeId'] ?? null);
        if ($storeIds !== []) {
            $existing = Branch::query()->whereIn('id', $storeIds)->pluck('id')->map(fn ($id) => (string) $id)->all();
            $missing = array_diff($storeIds, $existing);
            if ($missing !== []) {
                throw ValidationException::withMessages([
                    'storeIds' => ['Một hoặc nhiều cửa hàng không tồn tại: '.implode(', ', $missing)],
                ]);
            }
        }

        $categoryIds = $this->parseIdList($input['categoryIds'] ?? $input['categoryId'] ?? null);
        if ($categoryIds !== []) {
            $existing = Category::query()->whereIn('id', $categoryIds)->pluck('id')->map(fn ($id) => (string) $id)->all();
            $missing = array_diff($categoryIds, $existing);
            if ($missing !== []) {
                throw ValidationException::withMessages([
                    'categoryIds' => ['Một hoặc nhiều danh mục không tồn tại: '.implode(', ', $missing)],
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

        $top = (int) ($input['top'] ?? 10);
        if (!in_array($top, self::TOP_OPTIONS, true)) {
            throw ValidationException::withMessages([
                'top' => ['top chỉ nhận: '.implode(', ', self::TOP_OPTIONS)],
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

        $minRevenue = $this->parseOptionalFloat($input['minRevenue'] ?? null, 'minRevenue');
        $maxRevenue = $this->parseOptionalFloat($input['maxRevenue'] ?? null, 'maxRevenue');
        if ($minRevenue !== null && $maxRevenue !== null && $minRevenue > $maxRevenue) {
            throw ValidationException::withMessages([
                'minRevenue' => ['Doanh thu tối thiểu không được lớn hơn tối đa.'],
            ]);
        }

        $minQuantity = $this->parseOptionalFloat($input['minQuantity'] ?? null, 'minQuantity');
        $maxQuantity = $this->parseOptionalFloat($input['maxQuantity'] ?? null, 'maxQuantity');
        if ($minQuantity !== null && $maxQuantity !== null && $minQuantity > $maxQuantity) {
            throw ValidationException::withMessages([
                'minQuantity' => ['Số lượng tối thiểu không được lớn hơn tối đa.'],
            ]);
        }

        return [
            'from' => $from,
            'to' => $to,
            'storeIds' => $storeIds,
            'categoryIds' => $categoryIds,
            'staffId' => $staffId !== '' ? $staffId : null,
            'channel' => $channel !== '' ? $channel : null,
            'saleChannel' => $saleChannel !== '' ? $saleChannel : null,
            'statuses' => $statuses,
            'paymentMethod' => $paymentMethod !== '' ? $paymentMethod : null,
            'compare' => $compare,
            'metric' => $metric,
            'trendGranularity' => $trendGranularity,
            'top' => $top,
            'page' => $page,
            'perPage' => $perPage,
            'sortBy' => $sortBy,
            'sortDirection' => $sortDirection,
            'search' => $search !== '' ? $search : null,
            'minRevenue' => $minRevenue,
            'maxRevenue' => $maxRevenue,
            'minQuantity' => $minQuantity,
            'maxQuantity' => $maxQuantity,
        ];
    }

    private function parseIdList(mixed $raw): array
    {
        if ($raw === null || $raw === '' || $raw === []) {
            return [];
        }
        if (is_array($raw)) {
            $ids = array_map(fn ($v) => trim((string) $v), $raw);
        } else {
            $ids = array_map('trim', explode(',', (string) $raw));
        }
        $ids = array_values(array_filter($ids, fn ($id) => $id !== ''));
        if (count($ids) > 100) {
            throw ValidationException::withMessages([
                'ids' => ['Danh sách ID tối đa 100 phần tử.'],
            ]);
        }

        return $ids;
    }

    private function parseOptionalFloat(mixed $raw, string $field): ?float
    {
        if ($raw === null || $raw === '') {
            return null;
        }
        if (!is_numeric($raw)) {
            throw ValidationException::withMessages([
                $field => ['Giá trị số không hợp lệ.'],
            ]);
        }

        return (float) $raw;
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

        $rows = $query->get([
            'id', 'mongo_id', 'code', 'status', 'type', 'branch_id',
            'value', 'total', 'value_payment', 'discount_value',
            'amount_products', 'business_date', 'completed_at', 'created_at',
            'user_id', 'author_id', 'payment_lines', 'items', 'payload',
        ]);

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

    private function loadRefunds(array $filters): Collection
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
            'business_date', 'completed_at', 'created_at',
            'user_id', 'items', 'payload', 'payment_mongo_id',
        ];
        if (Schema::hasColumn('product_refunds', 'total_payable_amount')) {
            $columns[] = 'total_payable_amount';
        }
        if (Schema::hasColumn('product_refunds', 'branch_id')) {
            $columns[] = 'branch_id';
        }
        if (Schema::hasColumn('product_refunds', 'user_created_id')) {
            $columns[] = 'user_created_id';
        }

        $rows = $query->get($columns);

        return $rows->filter(function ($row) use ($filters) {
            $payload = is_array($row->payload) ? $row->payload : [];

            if ($filters['storeIds'] !== []) {
                $branchId = $row->branch_id ?? null;
                if ($branchId === null) {
                    $raw = $payload['branchId'] ?? $payload['warehouseId'] ?? null;
                    if (is_array($raw)) {
                        $raw = $raw['id'] ?? $raw['_id'] ?? null;
                    }
                    $branchId = $raw;
                }
                if ($branchId === null || !in_array((string) $branchId, $filters['storeIds'], true)) {
                    // allow if payment parent matches a filtered store — best-effort via payload only
                    if (!in_array((string) ($payload['branchId'] ?? ''), $filters['storeIds'], true)) {
                        return false;
                    }
                }
            }

            if ($filters['staffId'] !== null) {
                $sid = (int) $filters['staffId'];
                $match = ((int) ($row->user_id ?? 0) === $sid)
                    || ((int) ($row->user_created_id ?? 0) === $sid);
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

    private function extractItems(object $row): array
    {
        $items = is_array($row->items) ? $row->items : [];
        if ($items === []) {
            $payload = is_array($row->payload) ? $row->payload : [];
            $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];
        }

        return array_values(array_filter($items, fn ($i) => is_array($i)));
    }

    private function extractProductId(array $item): ?string
    {
        $pidRaw = $item['productId'] ?? $item['product_id'] ?? null;
        if (is_array($pidRaw)) {
            $pidRaw = $pidRaw['id'] ?? $pidRaw['_id'] ?? $pidRaw['mongo_id'] ?? null;
        }
        if ($pidRaw === null || $pidRaw === '') {
            return null;
        }

        return (string) $pidRaw;
    }

    /** Line revenue — DashboardController: total ?? value */
    private function lineRevenue(array $item): float
    {
        $raw = $item['total'] ?? $item['value'] ?? 0;
        if (!is_numeric($raw)) {
            return 0.0;
        }

        return max(0.0, (float) $raw);
    }

    private function lineQty(array $item): float
    {
        $raw = $item['amount'] ?? $item['quantity'] ?? 0;
        if (!is_numeric($raw)) {
            return 0.0;
        }

        return max(0.0, (float) $raw);
    }

    private function lineDiscount(array $item): float
    {
        $raw = $item['discountValue'] ?? $item['discount_value'] ?? $item['discount'] ?? 0;
        if (!is_numeric($raw)) {
            return 0.0;
        }

        return max(0.0, (float) $raw);
    }

    private function emptyProductBucket(string $productId, array $item): array
    {
        $name = (string) (
            $item['name']
            ?? $item['productName']
            ?? (is_array($item['productId'] ?? null) ? ($item['productId']['name'] ?? '') : '')
            ?? ''
        );
        $code = (string) (
            $item['code']
            ?? $item['productCode']
            ?? (is_array($item['productId'] ?? null) ? ($item['productId']['code'] ?? '') : '')
            ?? ''
        );

        return [
            'productId' => $productId,
            'productName' => $name !== '' ? $name : 'Sản phẩm #'.$productId,
            'productCode' => $code !== '' ? $code : null,
            'categoryId' => null,
            'categoryName' => (string) ($item['categoryName'] ?? $item['category'] ?? '') ?: null,
            'trademarkName' => (string) ($item['trademarkName'] ?? $item['brand'] ?? '') ?: null,
            'sku' => (string) ($item['sku'] ?? $item['barcode'] ?? '') ?: null,
            'imageUrl' => null,
            'grossRevenue' => 0.0,
            'discountAmount' => 0.0,
            'revenue' => 0.0,
            'refundAmount' => 0.0,
            'netRevenue' => 0.0,
            'invoiceCount' => 0,
            'itemQuantity' => 0.0,
            'qtyReturned' => 0.0,
            'averageSellingPrice' => 0.0,
            'revenueSharePercent' => 0.0,
            'lastSoldAt' => null,
            'rank' => 0,
            '_invoiceIds' => [],
        ];
    }

    private function aggregateByProduct(Collection $sales, Collection $refunds): array
    {
        $buckets = [];

        foreach ($sales as $row) {
            $items = $this->extractItems($row);
            $saleId = (string) ($row->id ?? $row->mongo_id ?? uniqid('sale_', true));
            $eventTime = $this->eventTime($row);

            foreach ($items as $item) {
                $pid = $this->extractProductId($item);
                if ($pid === null) {
                    continue;
                }
                if (!isset($buckets[$pid])) {
                    $buckets[$pid] = $this->emptyProductBucket($pid, $item);
                }
                $rev = $this->lineRevenue($item);
                $disc = $this->lineDiscount($item);
                $qty = $this->lineQty($item);
                $b = &$buckets[$pid];
                $b['revenue'] += $rev;
                $b['discountAmount'] += $disc;
                $b['grossRevenue'] += $rev + $disc;
                $b['itemQuantity'] += $qty;
                $b['_invoiceIds'][$saleId] = true;
                if ($b['lastSoldAt'] === null || $eventTime->gt(Carbon::parse($b['lastSoldAt']))) {
                    $b['lastSoldAt'] = $eventTime->toIso8601String();
                }
                // Prefer non-empty snapshot name/code from lines
                if (($b['productName'] === '' || str_starts_with($b['productName'], 'Sản phẩm #')) && !empty($item['name'])) {
                    $b['productName'] = (string) $item['name'];
                }
                if (($b['productCode'] === null || $b['productCode'] === '') && !empty($item['code'])) {
                    $b['productCode'] = (string) $item['code'];
                }
                unset($b);
            }
        }

        foreach ($refunds as $row) {
            $items = $this->extractItems($row);
            if ($items === []) {
                // No line items: cannot attribute refund money to a product without inventing allocation.
                continue;
            }
            foreach ($items as $item) {
                $pid = $this->extractProductId($item);
                if ($pid === null) {
                    continue;
                }
                if (!isset($buckets[$pid])) {
                    $buckets[$pid] = $this->emptyProductBucket($pid, $item);
                }
                $buckets[$pid]['refundAmount'] += $this->lineRevenue($item);
                $buckets[$pid]['qtyReturned'] += $this->lineQty($item);
            }
        }

        $totalNet = 0.0;
        foreach ($buckets as &$b) {
            $b['invoiceCount'] = count($b['_invoiceIds']);
            $b['netRevenue'] = $b['revenue'] - $b['refundAmount'];
            $b['averageSellingPrice'] = $b['itemQuantity'] > 0
                ? round($b['revenue'] / $b['itemQuantity'], 2)
                : 0.0;
            foreach (['grossRevenue', 'discountAmount', 'revenue', 'refundAmount', 'netRevenue', 'itemQuantity', 'qtyReturned'] as $f) {
                $b[$f] = round((float) $b[$f], 2);
            }
            $totalNet += $b['netRevenue'];
            unset($b['_invoiceIds']);
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

    private function enrichProducts(array $productRows): array
    {
        if ($productRows === []) {
            return $productRows;
        }

        $pids = array_keys($productRows);
        $mongoPids = array_values(array_filter($pids, fn ($p) => !ctype_digit((string) $p)));
        $localPids = array_values(array_filter($pids, fn ($p) => ctype_digit((string) $p)));

        $byMongo = Product::query()
            ->whereIn('mongo_id', $mongoPids)
            ->get(['id', 'mongo_id', 'code', 'name', 'category_id', 'category_name', 'trademark_name', 'barcode', 'extra'])
            ->keyBy('mongo_id');
        $byLocal = Product::query()
            ->whereIn('id', array_map('intval', $localPids))
            ->get(['id', 'mongo_id', 'code', 'name', 'category_id', 'category_name', 'trademark_name', 'barcode', 'extra'])
            ->keyBy('id');

        $categoryIds = [];
        foreach ($byMongo as $p) {
            if ($p->category_id) {
                $categoryIds[] = (int) $p->category_id;
            }
        }
        foreach ($byLocal as $p) {
            if ($p->category_id) {
                $categoryIds[] = (int) $p->category_id;
            }
        }
        $categoryMap = $categoryIds === []
            ? collect()
            : Category::query()->whereIn('id', array_unique($categoryIds))->get(['id', 'name'])->keyBy('id');

        foreach ($productRows as $pid => &$row) {
            $product = ctype_digit((string) $pid) ? $byLocal->get((int) $pid) : $byMongo->get($pid);
            if (!$product) {
                continue;
            }
            $row['productName'] = $product->name ?: $row['productName'];
            $row['productCode'] = $product->code ?: $row['productCode'];
            $row['categoryId'] = $product->category_id ? (string) $product->category_id : null;
            $row['categoryName'] = $product->category_name
                ?: ($product->category_id ? ($categoryMap->get($product->category_id)?->name ?? $row['categoryName']) : $row['categoryName']);
            $row['trademarkName'] = $product->trademark_name ?: $row['trademarkName'];
            $row['sku'] = $product->barcode ?: $row['sku'];
            $extra = is_array($product->extra) ? $product->extra : [];
            $img = $extra['image'] ?? $extra['imageUrl'] ?? $extra['thumbnail'] ?? null;
            if (is_string($img) && $img !== '') {
                $row['imageUrl'] = $img;
            }
            // Normalize productId to stable local id when available
            $row['productId'] = (string) $product->id;
            $row['productMongoId'] = $product->mongo_id ? (string) $product->mongo_id : (string) $pid;
        }
        unset($row);

        // Re-key by productId after enrichment (merge duplicates that mapped to same local id)
        $merged = [];
        foreach ($productRows as $row) {
            $key = (string) $row['productId'];
            if (!isset($merged[$key])) {
                $merged[$key] = $row;
                continue;
            }
            $m = &$merged[$key];
            $m['grossRevenue'] += $row['grossRevenue'];
            $m['discountAmount'] += $row['discountAmount'];
            $m['revenue'] += $row['revenue'];
            $m['refundAmount'] += $row['refundAmount'];
            $m['itemQuantity'] += $row['itemQuantity'];
            $m['qtyReturned'] += $row['qtyReturned'];
            $m['invoiceCount'] += $row['invoiceCount'];
            if ($row['lastSoldAt'] && ($m['lastSoldAt'] === null || $row['lastSoldAt'] > $m['lastSoldAt'])) {
                $m['lastSoldAt'] = $row['lastSoldAt'];
            }
            unset($m);
        }

        $totalNet = array_sum(array_column($merged, 'revenue')) - array_sum(array_column($merged, 'refundAmount'));
        foreach ($merged as &$m) {
            $m['netRevenue'] = round($m['revenue'] - $m['refundAmount'], 2);
            $m['averageSellingPrice'] = $m['itemQuantity'] > 0
                ? round($m['revenue'] / $m['itemQuantity'], 2)
                : 0.0;
            foreach (['grossRevenue', 'discountAmount', 'revenue', 'refundAmount', 'itemQuantity', 'qtyReturned'] as $f) {
                $m[$f] = round((float) $m[$f], 2);
            }
            $m['revenueSharePercent'] = $totalNet > 0
                ? round(($m['netRevenue'] / $totalNet) * 100, 2)
                : 0.0;
        }
        unset($m);

        return $merged;
    }

    private function applyProductFilters(array $productRows, array $filters): array
    {
        $out = $productRows;

        if ($filters['categoryIds'] !== []) {
            $out = array_filter(
                $out,
                fn ($r) => $r['categoryId'] !== null && in_array((string) $r['categoryId'], $filters['categoryIds'], true)
            );
        }

        if ($filters['search'] !== null) {
            $needle = mb_strtolower($filters['search']);
            $out = array_filter($out, function ($r) use ($needle) {
                return str_contains(mb_strtolower((string) ($r['productName'] ?? '')), $needle)
                    || str_contains(mb_strtolower((string) ($r['productCode'] ?? '')), $needle)
                    || str_contains(mb_strtolower((string) ($r['sku'] ?? '')), $needle);
            });
        }

        if ($filters['minRevenue'] !== null) {
            $out = array_filter($out, fn ($r) => $r['netRevenue'] >= $filters['minRevenue']);
        }
        if ($filters['maxRevenue'] !== null) {
            $out = array_filter($out, fn ($r) => $r['netRevenue'] <= $filters['maxRevenue']);
        }
        if ($filters['minQuantity'] !== null) {
            $out = array_filter($out, fn ($r) => $r['itemQuantity'] >= $filters['minQuantity']);
        }
        if ($filters['maxQuantity'] !== null) {
            $out = array_filter($out, fn ($r) => $r['itemQuantity'] <= $filters['maxQuantity']);
        }

        // Recompute share after filter
        $totalNet = 0.0;
        foreach ($out as $r) {
            $totalNet += $r['netRevenue'];
        }
        foreach ($out as &$r) {
            $r['revenueSharePercent'] = $totalNet > 0
                ? round(($r['netRevenue'] / $totalNet) * 100, 2)
                : 0.0;
        }
        unset($r);

        return $out;
    }

    private function buildSummary(array $productRows, Collection $sales, Collection $refunds): array
    {
        $gross = 0.0;
        $discount = 0.0;
        $revenue = 0.0;
        $refund = 0.0;
        $qty = 0.0;
        $qtyReturned = 0.0;
        $topProduct = null;

        foreach ($productRows as $row) {
            $gross += $row['grossRevenue'];
            $discount += $row['discountAmount'];
            $revenue += $row['revenue'];
            $refund += $row['refundAmount'];
            $qty += $row['itemQuantity'];
            $qtyReturned += $row['qtyReturned'];
            if ($topProduct === null || $row['netRevenue'] > $topProduct['netRevenue']) {
                $topProduct = $row;
            }
        }

        // invoiceCount KPI: distinct sales in range (same as store/time reports for overall),
        // not sum of per-product invoice counts (which double-count multi-item invoices).
        $invoiceCount = $sales->count();
        $net = $revenue - $refund;
        $aov = $invoiceCount > 0 ? $revenue / $invoiceCount : 0.0;
        // Note: AOV here uses product-line revenue / invoices; may differ from invoice-level AOV
        // when some invoices have no productId lines. Documented as product-line based.

        $returnRate = $qty > 0
            ? round(($qtyReturned / $qty) * 100, 2)
            : ($qtyReturned > 0 ? null : 0.0);

        return [
            'productCount' => count($productRows),
            'grossRevenue' => round($gross, 2),
            'discountAmount' => round($discount, 2),
            'revenue' => round($revenue, 2),
            'refundAmount' => round($refund, 2),
            'netRevenue' => round($net, 2),
            'invoiceCount' => $invoiceCount,
            'itemQuantity' => round($qty, 2),
            'qtyReturned' => round($qtyReturned, 2),
            'returnRatePercent' => $returnRate,
            'averageOrderValue' => round($aov, 2),
            'averageSellingPrice' => $qty > 0 ? round($revenue / $qty, 2) : 0.0,
            'topProduct' => $topProduct ? [
                'id' => $topProduct['productId'],
                'name' => $topProduct['productName'],
                'code' => $topProduct['productCode'],
                'netRevenue' => $topProduct['netRevenue'],
            ] : null,
        ];
    }

    private function buildRanking(array $productRows, string $metric): array
    {
        $list = array_values($productRows);
        usort($list, function ($a, $b) use ($metric) {
            $av = $a[$metric] ?? $a['netRevenue'] ?? 0;
            $bv = $b[$metric] ?? $b['netRevenue'] ?? 0;
            if ($av == $bv) {
                return strcmp((string) $a['productName'], (string) $b['productName']);
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
            if (in_array($sortBy, ['productName', 'productCode', 'lastSoldAt'], true)) {
                return strcmp((string) ($a[$sortBy] ?? ''), (string) ($b[$sortBy] ?? '')) * $dir;
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
        $totalPages = $total === 0 ? 0 : max(1, (int) ceil($total / $perPage));
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
            'qtyReturned' => 0.0,
        ];
        foreach ($sorted as $row) {
            $totals['grossRevenue'] += $row['grossRevenue'];
            $totals['discountAmount'] += $row['discountAmount'];
            $totals['revenue'] += $row['revenue'];
            $totals['refundAmount'] += $row['refundAmount'];
            $totals['netRevenue'] += $row['netRevenue'];
            $totals['invoiceCount'] += $row['invoiceCount'];
            $totals['itemQuantity'] += $row['itemQuantity'];
            $totals['qtyReturned'] += $row['qtyReturned'];
        }
        foreach (['grossRevenue', 'discountAmount', 'revenue', 'refundAmount', 'netRevenue', 'itemQuantity', 'qtyReturned'] as $k) {
            $totals[$k] = round($totals[$k], 2);
        }
        $totals['averageSellingPrice'] = $totals['itemQuantity'] > 0
            ? round($totals['revenue'] / $totals['itemQuantity'], 2)
            : 0.0;

        // Strip internal fields from response rows
        $clean = array_map(function ($row) {
            unset($row['productMongoId']);

            return $row;
        }, $data);

        return [
            'data' => array_values($clean),
            'totals' => $totals,
            'pagination' => [
                'page' => $page,
                'perPage' => $perPage,
                'total' => $total,
                'totalPages' => $totalPages,
            ],
        ];
    }

    private function buildTimeline(array $filters, Collection $sales, Collection $refunds): array
    {
        $granularity = $filters['trendGranularity'];
        $buckets = [];
        $cursor = $filters['from']->copy();
        $end = $filters['to']->copy();

        while ($cursor->lte($end)) {
            $meta = $this->bucketKey($cursor, $granularity);
            if (!isset($buckets[$meta['key']])) {
                $buckets[$meta['key']] = [
                    'key' => $meta['key'],
                    'label' => $meta['label'],
                    'revenue' => 0.0,
                    'refundAmount' => 0.0,
                    'netRevenue' => 0.0,
                    'itemQuantity' => 0.0,
                    'invoiceCount' => 0,
                ];
            }
            $cursor = match ($granularity) {
                'week' => $cursor->addWeek(),
                'month' => $cursor->addMonthNoOverflow(),
                default => $cursor->addDay(),
            };
        }

        foreach ($sales as $row) {
            $time = $this->eventTime($row);
            $meta = $this->bucketKey($time, $granularity);
            if (!isset($buckets[$meta['key']])) {
                $buckets[$meta['key']] = [
                    'key' => $meta['key'],
                    'label' => $meta['label'],
                    'revenue' => 0.0,
                    'refundAmount' => 0.0,
                    'netRevenue' => 0.0,
                    'itemQuantity' => 0.0,
                    'invoiceCount' => 0,
                ];
            }
            $items = $this->extractItems($row);
            $lineRev = 0.0;
            $lineQty = 0.0;
            $hasLine = false;
            foreach ($items as $item) {
                if ($this->extractProductId($item) === null) {
                    continue;
                }
                $hasLine = true;
                $lineRev += $this->lineRevenue($item);
                $lineQty += $this->lineQty($item);
            }
            if ($hasLine) {
                $buckets[$meta['key']]['revenue'] += $lineRev;
                $buckets[$meta['key']]['itemQuantity'] += $lineQty;
                $buckets[$meta['key']]['invoiceCount'] += 1;
            }
        }

        foreach ($refunds as $row) {
            $time = $this->eventTime($row);
            $meta = $this->bucketKey($time, $granularity);
            if (!isset($buckets[$meta['key']])) {
                $buckets[$meta['key']] = [
                    'key' => $meta['key'],
                    'label' => $meta['label'],
                    'revenue' => 0.0,
                    'refundAmount' => 0.0,
                    'netRevenue' => 0.0,
                    'itemQuantity' => 0.0,
                    'invoiceCount' => 0,
                ];
            }
            $items = $this->extractItems($row);
            foreach ($items as $item) {
                if ($this->extractProductId($item) === null) {
                    continue;
                }
                $buckets[$meta['key']]['refundAmount'] += $this->lineRevenue($item);
            }
        }

        $timeline = [];
        ksort($buckets);
        foreach ($buckets as $b) {
            $b['netRevenue'] = round($b['revenue'] - $b['refundAmount'], 2);
            $b['revenue'] = round($b['revenue'], 2);
            $b['refundAmount'] = round($b['refundAmount'], 2);
            $b['itemQuantity'] = round($b['itemQuantity'], 2);
            $timeline[] = $b;
        }

        return $timeline;
    }

    private function buildTrend(array $filters, Collection $sales, Collection $refunds, array $ranking): array
    {
        $granularity = $filters['trendGranularity'];
        $topIds = array_slice(array_map(fn ($r) => (string) $r['productId'], $ranking), 0, self::TOP_TREND_PRODUCTS);

        if ($topIds === []) {
            return [
                'granularity' => $granularity,
                'series' => [],
                'buckets' => [],
                'note' => null,
            ];
        }

        $nameById = [];
        foreach ($ranking as $r) {
            $nameById[(string) $r['productId']] = $r['productName'];
        }

        $timeBuckets = [];
        $cursor = $filters['from']->copy();
        $end = $filters['to']->copy();
        while ($cursor->lte($end)) {
            $meta = $this->bucketKey($cursor, $granularity);
            $timeBuckets[$meta['key']] = ['key' => $meta['key'], 'label' => $meta['label']];
            $cursor = match ($granularity) {
                'week' => $cursor->addWeek(),
                'month' => $cursor->addMonthNoOverflow(),
                default => $cursor->addDay(),
            };
        }

        $seriesData = [];
        foreach ($topIds as $pid) {
            $seriesData[$pid] = [
                'productId' => $pid,
                'productName' => $nameById[$pid] ?? ('SP #'.$pid),
                '_acc' => [],
            ];
            foreach ($timeBuckets as $key => $_) {
                $seriesData[$pid]['_acc'][$key] = [
                    'revenue' => 0.0,
                    'refundAmount' => 0.0,
                    'netRevenue' => 0.0,
                    'itemQuantity' => 0.0,
                    'invoiceCount' => 0,
                ];
            }
        }

        // Map raw line product keys → enriched productId for top matching
        // Build reverse map from ranking product codes/mongo aliases is hard;
        // re-extract using same product id resolution as aggregation.
        foreach ($sales as $row) {
            $time = $this->eventTime($row);
            $meta = $this->bucketKey($time, $granularity);
            $key = $meta['key'];
            $items = $this->extractItems($row);
            $saleInvoiceCounted = [];
            foreach ($items as $item) {
                $rawPid = $this->extractProductId($item);
                if ($rawPid === null) {
                    continue;
                }
                $resolved = $this->resolveToRankingId($rawPid, $topIds, $ranking);
                if ($resolved === null || !isset($seriesData[$resolved])) {
                    continue;
                }
                if (!isset($seriesData[$resolved]['_acc'][$key])) {
                    $seriesData[$resolved]['_acc'][$key] = [
                        'revenue' => 0.0,
                        'refundAmount' => 0.0,
                        'netRevenue' => 0.0,
                        'itemQuantity' => 0.0,
                        'invoiceCount' => 0,
                    ];
                }
                $seriesData[$resolved]['_acc'][$key]['revenue'] += $this->lineRevenue($item);
                $seriesData[$resolved]['_acc'][$key]['itemQuantity'] += $this->lineQty($item);
                if (!isset($saleInvoiceCounted[$resolved])) {
                    $seriesData[$resolved]['_acc'][$key]['invoiceCount'] += 1;
                    $saleInvoiceCounted[$resolved] = true;
                }
            }
        }

        foreach ($refunds as $row) {
            $time = $this->eventTime($row);
            $meta = $this->bucketKey($time, $granularity);
            $key = $meta['key'];
            foreach ($this->extractItems($row) as $item) {
                $rawPid = $this->extractProductId($item);
                if ($rawPid === null) {
                    continue;
                }
                $resolved = $this->resolveToRankingId($rawPid, $topIds, $ranking);
                if ($resolved === null || !isset($seriesData[$resolved])) {
                    continue;
                }
                if (!isset($seriesData[$resolved]['_acc'][$key])) {
                    $seriesData[$resolved]['_acc'][$key] = [
                        'revenue' => 0.0,
                        'refundAmount' => 0.0,
                        'netRevenue' => 0.0,
                        'itemQuantity' => 0.0,
                        'invoiceCount' => 0,
                    ];
                }
                $seriesData[$resolved]['_acc'][$key]['refundAmount'] += $this->lineRevenue($item);
            }
        }

        $series = [];
        foreach ($seriesData as $pid => $s) {
            $points = [];
            ksort($s['_acc']);
            foreach ($s['_acc'] as $key => $acc) {
                $points[] = [
                    'key' => $key,
                    'label' => $timeBuckets[$key]['label'] ?? $key,
                    'revenue' => round($acc['revenue'], 2),
                    'refundAmount' => round($acc['refundAmount'], 2),
                    'netRevenue' => round($acc['revenue'] - $acc['refundAmount'], 2),
                    'itemQuantity' => round($acc['itemQuantity'], 2),
                    'invoiceCount' => $acc['invoiceCount'],
                ];
            }
            $series[] = [
                'productId' => $pid,
                'productName' => $s['productName'],
                'points' => $points,
            ];
        }

        $note = count($ranking) > self::TOP_TREND_PRODUCTS
            ? sprintf('Biểu đồ xu hướng hiển thị top %d sản phẩm theo %s.', self::TOP_TREND_PRODUCTS, $filters['metric'])
            : null;

        return [
            'granularity' => $granularity,
            'series' => $series,
            'buckets' => array_values($timeBuckets),
            'note' => $note,
        ];
    }

    private function resolveToRankingId(string $rawPid, array $topIds, array $ranking): ?string
    {
        if (in_array($rawPid, $topIds, true)) {
            return $rawPid;
        }
        foreach ($ranking as $r) {
            if ((string) $r['productId'] === $rawPid) {
                return (string) $r['productId'];
            }
            if (isset($r['productMongoId']) && (string) $r['productMongoId'] === $rawPid) {
                return (string) $r['productId'];
            }
            if ((string) ($r['productCode'] ?? '') === $rawPid) {
                return (string) $r['productId'];
            }
        }
        // Local numeric ↔ string
        if (ctype_digit($rawPid)) {
            foreach ($topIds as $tid) {
                if ((string) $tid === $rawPid) {
                    return $tid;
                }
            }
        }

        return null;
    }

    private function buildBreakdowns(array $productRows, Collection $sales): array
    {
        $byCategory = [];
        $byTrademark = [];

        foreach ($productRows as $row) {
            $ck = $row['categoryId'] ?? 'unknown';
            $cl = $row['categoryName'] ?: 'Không xác định';
            if (!isset($byCategory[$ck])) {
                $byCategory[$ck] = [
                    'key' => (string) $ck,
                    'label' => $cl,
                    'revenue' => 0.0,
                    'invoiceCount' => 0,
                    'itemQuantity' => 0.0,
                ];
            }
            $byCategory[$ck]['revenue'] += $row['netRevenue'];
            $byCategory[$ck]['invoiceCount'] += $row['invoiceCount'];
            $byCategory[$ck]['itemQuantity'] += $row['itemQuantity'];

            $tk = $row['trademarkName'] ? mb_strtolower($row['trademarkName']) : 'unknown';
            $tl = $row['trademarkName'] ?: 'Không xác định';
            if (!isset($byTrademark[$tk])) {
                $byTrademark[$tk] = [
                    'key' => $tk,
                    'label' => $tl,
                    'revenue' => 0.0,
                    'invoiceCount' => 0,
                    'itemQuantity' => 0.0,
                ];
            }
            $byTrademark[$tk]['revenue'] += $row['netRevenue'];
            $byTrademark[$tk]['invoiceCount'] += $row['invoiceCount'];
            $byTrademark[$tk]['itemQuantity'] += $row['itemQuantity'];
        }

        $byChannel = [];
        foreach ($sales as $row) {
            $type = strtolower((string) ($row->type ?? ''));
            if ($type === '') {
                $payload = is_array($row->payload) ? $row->payload : [];
                $type = strtolower((string) ($payload['type'] ?? 'unknown'));
            }
            $label = match ($type) {
                'retail' => 'Bán lẻ',
                'wholesale' => 'Bán sỉ',
                default => $type !== '' ? $type : 'Không xác định',
            };
            $ck = $type ?: 'unknown';
            if (!isset($byChannel[$ck])) {
                $byChannel[$ck] = ['key' => $ck, 'label' => $label, 'revenue' => 0.0, 'invoiceCount' => 0];
            }
            $lineRev = 0.0;
            foreach ($this->extractItems($row) as $item) {
                if ($this->extractProductId($item) === null) {
                    continue;
                }
                $lineRev += $this->lineRevenue($item);
            }
            $byChannel[$ck]['revenue'] += $lineRev;
            $byChannel[$ck]['invoiceCount'] += 1;
        }

        return [
            'categories' => $this->normalizeBreakdown(array_values($byCategory), self::MAX_CATEGORY_PIE),
            'trademarks' => $this->normalizeBreakdown(array_values($byTrademark), self::MAX_CATEGORY_PIE),
            'channels' => $this->normalizeBreakdown(array_values($byChannel), 10),
        ];
    }

    private function buildPareto(array $ranking): array
    {
        $total = array_sum(array_map(fn ($r) => max(0.0, (float) $r['netRevenue']), $ranking));
        $cum = 0.0;
        $points = [];
        foreach ($ranking as $r) {
            $rev = max(0.0, (float) $r['netRevenue']);
            $cum += $rev;
            $points[] = [
                'productId' => $r['productId'],
                'productName' => $r['productName'],
                'netRevenue' => $r['netRevenue'],
                'cumulativeRevenue' => round($cum, 2),
                'cumulativePercent' => $total > 0 ? round(($cum / $total) * 100, 2) : 0.0,
                'rank' => $r['rank'],
            ];
            if (count($points) >= 50) {
                break;
            }
        }

        return [
            'totalNetRevenue' => round($total, 2),
            'points' => $points,
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
                'itemQuantity' => array_sum(array_map(fn ($r) => $r['itemQuantity'] ?? 0, $rest)),
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
            'invoiceCount', 'itemQuantity', 'qtyReturned', 'averageOrderValue',
            'averageSellingPrice', 'productCount', 'returnRatePercent',
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
            // empty
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
