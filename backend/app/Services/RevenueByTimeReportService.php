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
 * Read-only revenue-by-time report.
 *
 * Evidence / business mapping (do not invent outside this):
 * - Sales: sale_payments (retail + wholesale via type column / payload.type)
 * - Refunds: product_refunds
 * - Completed status: completed / COMPLETED (DashboardController, invoiceHelpers)
 * - Exclude draft/cancelled by default
 * - Revenue timestamp: business_date (DashboardController chart/totals)
 * - Order value after discount: value (MirrorRecordController normalize)
 * - Paid amount: value_payment (DashboardController sum)
 * - Discount: discount_value
 * - Qty sold: amount_products / items[].amount
 * - Cost: total_cost when present (often null on create — profit KPIs may be null)
 * - Branch: branch_id
 * - Staff: user_id / author_id / payload salesperson|techStaff|staff|author
 * - Channel: type retail|wholesale + payload channel|orderSource|saleChannel
 * - Payment: payment_lines / payload typePayment / paymentMethod
 */
class RevenueByTimeReportService
{
    public const TIMEZONE = 'Asia/Ho_Chi_Minh';

    public const GRANULARITIES = ['hour', 'day', 'week', 'month', 'quarter', 'year'];

    public const DEFAULT_STATUSES = ['completed'];

    public const ALLOWED_STATUSES = ['completed', 'draft', 'cancelled'];

    public const SALE_TYPES = ['retail', 'wholesale'];

    public const PER_PAGE_OPTIONS = [20, 50, 100];

    public const SORT_FIELDS = [
        'periodKey',
        'invoiceCount',
        'itemQuantity',
        'grossRevenue',
        'discountAmount',
        'revenue',
        'refundAmount',
        'netRevenue',
        'averageOrderValue',
    ];

    public const MAX_RANGE_DAYS = [
        'hour' => 7,
        'day' => 366,
        'week' => 732,
        'month' => 1826,
        'quarter' => 1826,
        'year' => 3650,
    ];

    /** @var array<string, string>|null */
    private ?array $paymentMethodCatalog = null;

    public function options(): array
    {
        $stores = Branch::query()
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'code'])
            ->map(fn (Branch $branch) => [
                'id' => (string) $branch->id,
                'name' => $branch->name,
                'code' => $branch->code,
            ])
            ->values()
            ->all();

        $dimensions = $this->reportFilterDimensions();

        $staff = User::query()
            ->whereIn('id', $dimensions['staffIds'])
            ->where(function ($query) {
                $query->where('is_active', true)->orWhereNull('is_active');
            })
            ->where(function ($query) {
                $query->whereNull('status')->orWhere('status', '!=', 'LOCKED');
            })
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'role'])
            ->map(fn (User $user) => [
                'id' => (string) $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
            ])
            ->values()
            ->all();

        return [
            'stores' => $stores,
            'staff' => $staff,
            'channels' => $dimensions['channels'],
            'saleChannels' => $dimensions['saleChannels'],
            'invoiceStatuses' => $dimensions['invoiceStatuses'],
            'paymentMethods' => $this->distinctPaymentMethodLabels(),
            'granularities' => [
                ['value' => 'hour', 'label' => 'Theo giờ'],
                ['value' => 'day', 'label' => 'Theo ngày'],
                ['value' => 'week', 'label' => 'Theo tuần'],
                ['value' => 'month', 'label' => 'Theo tháng'],
                ['value' => 'quarter', 'label' => 'Theo quý'],
                ['value' => 'year', 'label' => 'Theo năm'],
            ],
            'presets' => [
                'today', 'yesterday', 'last_7_days', 'last_30_days',
                'this_week', 'this_month', 'last_month', 'this_quarter', 'this_year', 'custom',
            ],
            'perPageOptions' => self::PER_PAGE_OPTIONS,
            'timezone' => self::TIMEZONE,
            'currency' => 'VND',
            'capabilities' => $dimensions['capabilities'],
            'formulas' => [
                'grossRevenue' => 'COALESCE(value, value_payment, 0) + COALESCE(discount_value, 0) — doanh thu trước giảm giá (value đã là sau giảm theo MirrorRecordController)',
                'discountAmount' => 'SUM(COALESCE(discount_value, 0)) trên sale_payments',
                'revenue' => 'COALESCE(value, value_payment, 0) — tổng tiền hóa đơn sau giảm giá',
                'refundAmount' => 'COALESCE(value, total, total_payable_amount, 0) trên product_refunds theo ngày phát sinh refund (business_date), không truy ngược ngày bán gốc',
                'netRevenue' => 'revenue - refundAmount',
                'averageOrderValue' => 'revenue / invoiceCount — TB/hóa đơn = doanh thu sau giảm (trước trừ trả hàng) / số hóa đơn; null/0 nếu invoiceCount = 0',
                'itemQuantity' => 'COALESCE(amount_products, sum items.amount)',
                'costAmount' => 'SUM(total_cost) khi có dữ liệu; null nếu không có bản ghi nào có total_cost',
                'paymentBreakdown' => 'Ưu tiên SUM(payment_lines[].amount) theo method; nếu thiếu amount thì chia đều revenue / số method (fallback có cờ meta)',
                'timestamp' => 'business_date (fallback completed_at, created_at)',
                'defaultStatus' => 'completed / COMPLETED only',
            ],
        ];
    }

    public function report(array $input): array
    {
        $filters = $this->normalizeFilters($input);
        $this->assertGranularityFitsRange($filters);

        $sales = $this->loadSales($filters);
        $refundLoad = $this->loadRefundsWithMeta($filters);
        $refunds = $refundLoad['rows'];
        $currentSummary = $this->summarize($sales, $refunds);
        $timeline = $this->buildTimeline($filters, $sales, $refunds);
        $breakdowns = $this->buildBreakdowns($sales, $refunds);
        $table = $this->paginateTimeline($timeline, $filters);
        $attribution = $this->buildAttributionMeta($sales, $breakdowns);

        $comparison = null;
        if ($filters['compare'] === 'previous_period') {
            $prevFilters = $this->previousPeriodFilters($filters);
            $prevSales = $this->loadSales($prevFilters);
            $prevRefunds = $this->loadRefundsWithMeta($prevFilters)['rows'];
            $prevSummary = $this->summarize($prevSales, $prevRefunds);
            $comparison = [
                'period' => [
                    'from' => $prevFilters['from']->toDateString(),
                    'to' => $prevFilters['to']->toDateString(),
                ],
                'metrics' => $this->buildComparisonMetrics($currentSummary, $prevSummary),
            ];
        }

        return [
            'filters' => [
                'from' => $filters['from']->toDateString(),
                'to' => $filters['to']->toDateString(),
                'granularity' => $filters['granularity'],
                'storeId' => $filters['storeId'],
                'staffId' => $filters['staffId'],
                'channel' => $filters['channel'],
                'saleChannel' => $filters['saleChannel'],
                'status' => $filters['statuses'],
                'paymentMethod' => $filters['paymentMethod'],
                'compare' => $filters['compare'],
                'timezone' => self::TIMEZONE,
            ],
            'summary' => $currentSummary,
            'comparison' => $comparison,
            'timeline' => $timeline,
            'breakdowns' => $breakdowns,
            'table' => $table,
            'meta' => [
                'generatedAt' => Carbon::now(self::TIMEZONE)->toIso8601String(),
                'currency' => 'VND',
                'timezone' => self::TIMEZONE,
                'hasCostData' => $currentSummary['costAmount'] !== null,
                'saleCountLoaded' => $sales->count(),
                'refundCountLoaded' => $refunds->count(),
                'attribution' => $attribution,
                'refunds' => [
                    'hasBranchColumn' => Schema::hasColumn('product_refunds', 'branch_id'),
                    'excludedMissingStore' => $refundLoad['excludedMissingStore'],
                    'excludedMissingStaff' => $refundLoad['excludedMissingStaff'],
                    'excludedMissingChannel' => $refundLoad['excludedMissingChannel'],
                    'note' => 'Refund tính theo ngày phát sinh. Khi thiếu branch/staff/channel metadata, bản ghi bị loại khỏi filter dimension tương ứng (không gán nhầm).',
                ],
                'formulas' => [
                    'averageOrderValue' => 'revenue / invoiceCount',
                    'netRevenue' => 'revenue - refundAmount',
                    'grossRevenue' => 'revenue + discountAmount',
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

        $granularity = strtolower(trim((string) ($input['granularity'] ?? 'day')));
        if (!in_array($granularity, self::GRANULARITIES, true)) {
            throw ValidationException::withMessages([
                'granularity' => ['Kiểu tổng hợp không hợp lệ.'],
            ]);
        }

        $storeId = trim((string) ($input['storeId'] ?? ''));
        if ($storeId !== '' && !Branch::query()->where('id', $storeId)->exists()) {
            throw ValidationException::withMessages([
                'storeId' => ['Cửa hàng không tồn tại.'],
            ]);
        }

        $staffId = trim((string) ($input['staffId'] ?? ''));
        if ($staffId !== '' && !User::query()->where('id', $staffId)->exists()) {
            throw ValidationException::withMessages([
                'staffId' => ['Nhân viên không tồn tại.'],
            ]);
        }

        $dimensions = $this->reportFilterDimensions();
        $channel = strtolower(trim((string) ($input['channel'] ?? '')));
        $availableChannels = array_column($dimensions['channels'], 'value');
        if ($channel !== '' && !in_array($channel, $availableChannels, true)) {
            throw ValidationException::withMessages([
                'channel' => ['Loại hóa đơn không có trong dữ liệu bán hàng hiện tại.'],
            ]);
        }

        $saleChannel = strtolower(trim((string) ($input['saleChannel'] ?? '')));
        $availableSaleChannels = array_column($dimensions['saleChannels'], 'value');
        if ($saleChannel !== '' && !in_array($saleChannel, $availableSaleChannels, true)) {
            throw ValidationException::withMessages([
                'saleChannel' => ['Kênh bán không có trong dữ liệu bán hàng hiện tại.'],
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

        $page = max(1, (int) ($input['page'] ?? 1));
        $perPage = (int) ($input['perPage'] ?? 20);
        if (!in_array($perPage, self::PER_PAGE_OPTIONS, true)) {
            throw ValidationException::withMessages([
                'perPage' => ['perPage chỉ nhận: '.implode(', ', self::PER_PAGE_OPTIONS)],
            ]);
        }

        $sortBy = (string) ($input['sortBy'] ?? 'periodKey');
        if (!in_array($sortBy, self::SORT_FIELDS, true)) {
            throw ValidationException::withMessages([
                'sortBy' => ['Trường sắp xếp không được phép.'],
            ]);
        }
        $sortDirection = strtolower((string) ($input['sortDirection'] ?? 'asc'));
        if (!in_array($sortDirection, ['asc', 'desc'], true)) {
            throw ValidationException::withMessages([
                'sortDirection' => ['Chỉ chấp nhận asc|desc.'],
            ]);
        }

        return [
            'from' => $from,
            'to' => $to,
            'fromUtc' => $from->copy()->timezone('UTC'),
            'toUtcEnd' => $to->copy()->endOfDay()->timezone('UTC'),
            'granularity' => $granularity,
            'storeId' => $storeId !== '' ? $storeId : null,
            'staffId' => $staffId !== '' ? $staffId : null,
            'channel' => $channel !== '' ? $channel : null,
            'saleChannel' => $saleChannel !== '' ? $saleChannel : null,
            'statuses' => $statuses,
            'paymentMethod' => $paymentMethod !== '' ? $paymentMethod : null,
            'compare' => $compare,
            'page' => $page,
            'perPage' => $perPage,
            'sortBy' => $sortBy,
            'sortDirection' => $sortDirection,
        ];
    }

    private function assertGranularityFitsRange(array $filters): void
    {
        $days = $filters['from']->diffInDays($filters['to']) + 1;
        $max = self::MAX_RANGE_DAYS[$filters['granularity']] ?? 366;
        if ($days > $max) {
            throw ValidationException::withMessages([
                'granularity' => [
                    sprintf(
                        'Khoảng %d ngày quá lớn cho tổng hợp "%s" (tối đa %d ngày). Hãy thu hẹp khoảng thời gian hoặc chọn kiểu tổng hợp thô hơn.',
                        $days,
                        $filters['granularity'],
                        $max
                    ),
                ],
            ]);
        }

        // Point budget: hour can explode points
        $estimate = match ($filters['granularity']) {
            'hour' => $days * 24,
            'day' => $days,
            'week' => (int) ceil($days / 7) + 1,
            'month' => (int) ceil($days / 28) + 1,
            'quarter' => (int) ceil($days / 90) + 1,
            'year' => (int) ceil($days / 365) + 1,
            default => $days,
        };
        if ($estimate > 400) {
            throw ValidationException::withMessages([
                'granularity' => ['Số điểm dữ liệu ước tính quá lớn (>400). Hãy thu hẹp khoảng hoặc đổi kiểu tổng hợp.'],
            ]);
        }
    }

    private function previousPeriodFilters(array $filters): array
    {
        $days = $filters['from']->diffInDays($filters['to']) + 1;
        $prevTo = $filters['from']->copy()->subDay()->startOfDay();
        $prevFrom = $prevTo->copy()->subDays($days - 1)->startOfDay();

        $next = $filters;
        $next['from'] = $prevFrom;
        $next['to'] = $prevTo;
        $next['fromUtc'] = $prevFrom->copy()->timezone('UTC');
        $next['toUtcEnd'] = $prevTo->copy()->endOfDay()->timezone('UTC');

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

        if ($filters['storeId'] !== null) {
            $query->where('branch_id', (int) $filters['storeId']);
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

        $rows = $query->get([
            'id', 'mongo_id', 'code', 'status', 'type', 'branch_id',
            'value', 'total', 'value_payment', 'discount_value', 'discount_type',
            'amount_products', 'total_cost', 'business_date', 'completed_at', 'created_at',
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
                // Map Vietnamese labels loosely to store
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

            // Staff name fallback when user_id/author_id empty but filter was SQL-matched only on ids —
            // already filtered in SQL; extra name match not needed when IDs set.
            return true;
        })->values();
    }

    /**
     * @return array{rows: Collection, excludedMissingStore: int, excludedMissingStaff: int, excludedMissingChannel: int}
     */
    private function loadRefundsWithMeta(array $filters): array
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
        if (Schema::hasColumn('product_refunds', 'user_created_id')) {
            $columns[] = 'user_created_id';
        }
        if (Schema::hasColumn('product_refunds', 'author_id')) {
            $columns[] = 'author_id';
        }
        if (Schema::hasColumn('product_refunds', 'branch_mongo_id')) {
            $columns[] = 'branch_mongo_id';
        }

        $rows = $query->get($columns);
        $excludedMissingStore = 0;
        $excludedMissingStaff = 0;
        $excludedMissingChannel = 0;

        $branch = null;
        if ($filters['storeId'] !== null) {
            $branch = Branch::query()->where('id', $filters['storeId'])->first();
        }

        $filtered = $rows->filter(function ($row) use (
            $filters,
            $branch,
            &$excludedMissingStore,
            &$excludedMissingStaff,
            &$excludedMissingChannel
        ) {
            $payload = is_array($row->payload) ? $row->payload : [];

            if ($filters['storeId'] !== null) {
                $resolved = $this->resolveRefundBranchId($row, $payload, $branch);
                if ($resolved === null) {
                    $excludedMissingStore++;

                    return false;
                }
                if ((string) $resolved !== (string) $filters['storeId']
                    && (string) $resolved !== (string) ($branch?->mongo_id ?? '')) {
                    return false;
                }
            }

            if ($filters['staffId'] !== null) {
                $sid = (int) $filters['staffId'];
                $match = ((int) ($row->user_id ?? 0) === $sid)
                    || ((int) ($row->user_created_id ?? 0) === $sid)
                    || ((int) ($row->author_id ?? 0) === $sid);
                if (!$match) {
                    $hasAnyStaff = ((int) ($row->user_id ?? 0) > 0)
                        || ((int) ($row->user_created_id ?? 0) > 0)
                        || ((int) ($row->author_id ?? 0) > 0);
                    if (!$hasAnyStaff) {
                        $excludedMissingStaff++;
                    }

                    return false;
                }
            }

            if ($filters['channel'] !== null) {
                $type = strtolower((string) ($payload['type'] ?? $row->type ?? ''));
                if ($type === '') {
                    $excludedMissingChannel++;

                    return false;
                }
                if ($type !== $filters['channel']) {
                    return false;
                }
            }

            if ($filters['saleChannel'] !== null) {
                $ch = strtolower((string) ($payload['channel'] ?? $payload['saleChannel'] ?? $payload['orderSource'] ?? ''));
                if ($ch === 'cửa hàng' || $ch === 'cua hang') {
                    $ch = 'store';
                }
                if ($ch === '') {
                    $excludedMissingChannel++;

                    return false;
                }
                if ($ch !== $filters['saleChannel'] && !str_contains($ch, $filters['saleChannel'])) {
                    return false;
                }
            }

            return true;
        })->values();

        return [
            'rows' => $filtered,
            'excludedMissingStore' => $excludedMissingStore,
            'excludedMissingStaff' => $excludedMissingStaff,
            'excludedMissingChannel' => $excludedMissingChannel,
        ];
    }

    private function resolveRefundBranchId(object $row, array $payload, ?Branch $filterBranch): mixed
    {
        $candidates = [];
        if (isset($row->branch_id) && $row->branch_id !== null && $row->branch_id !== '') {
            $candidates[] = $row->branch_id;
        }
        foreach (['branchId', 'warehouseId', 'storeId', 'branch_id', 'warehouse_id'] as $key) {
            if (!array_key_exists($key, $payload)) {
                continue;
            }
            $raw = $payload[$key];
            if (is_array($raw)) {
                $raw = $raw['id'] ?? $raw['_id'] ?? $raw['mongo_id'] ?? null;
            }
            if ($raw !== null && $raw !== '') {
                $candidates[] = $raw;
            }
        }
        if (isset($row->branch_mongo_id) && $row->branch_mongo_id) {
            $candidates[] = $row->branch_mongo_id;
        }

        if ($candidates === []) {
            return null;
        }

        foreach ($candidates as $c) {
            if ($filterBranch && (
                (string) $c === (string) $filterBranch->id
                || (string) $c === (string) ($filterBranch->mongo_id ?? '')
            )) {
                return $c;
            }
        }

        return $candidates[0];
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
            'hour' => [
                'key' => $time->format('Y-m-d\TH:00'),
                'label' => $time->format('d/m/Y H:00'),
                'sort' => $time->format('Y-m-d H:00:00'),
            ],
            'day' => [
                'key' => $time->format('Y-m-d'),
                'label' => $time->format('d/m/Y'),
                'sort' => $time->format('Y-m-d'),
            ],
            'week' => [
                'key' => $time->format('o-\WW'),
                'label' => 'Tuần '.$time->format('W').'/'.$time->format('o'),
                'sort' => $time->format('o-W'),
            ],
            'month' => [
                'key' => $time->format('Y-m'),
                'label' => 'Tháng '.$time->format('m/Y'),
                'sort' => $time->format('Y-m'),
            ],
            'quarter' => [
                'key' => $time->format('Y').'-Q'.$time->quarter,
                'label' => 'Quý '.$time->quarter.'/'.$time->format('Y'),
                'sort' => $time->format('Y').'-'.$time->quarter,
            ],
            'year' => [
                'key' => $time->format('Y'),
                'label' => 'Năm '.$time->format('Y'),
                'sort' => $time->format('Y'),
            ],
            default => [
                'key' => $time->format('Y-m-d'),
                'label' => $time->format('d/m/Y'),
                'sort' => $time->format('Y-m-d'),
            ],
        };
    }

    private function emptyBucket(string $key, string $label): array
    {
        return [
            'key' => $key,
            'label' => $label,
            'periodKey' => $key,
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
            '_costSum' => 0.0,
            '_costCount' => 0,
        ];
    }

    private function buildTimeline(array $filters, Collection $sales, Collection $refunds): array
    {
        $buckets = [];
        $cursor = $filters['from']->copy();
        $end = $filters['to']->copy();
        $granularity = $filters['granularity'];

        // Seed continuous buckets for day/hour; for coarser, seed from range
        while ($cursor->lte($end)) {
            $meta = $this->bucketKey($cursor, $granularity);
            if (!isset($buckets[$meta['key']])) {
                $buckets[$meta['key']] = $this->emptyBucket($meta['key'], $meta['label']);
                $buckets[$meta['key']]['_sort'] = $meta['sort'];
            }
            $cursor = match ($granularity) {
                'hour' => $cursor->addHour(),
                'day' => $cursor->addDay(),
                'week' => $cursor->addWeek(),
                'month' => $cursor->addMonthNoOverflow(),
                'quarter' => $cursor->addMonthsNoOverflow(3),
                'year' => $cursor->addYear(),
                default => $cursor->addDay(),
            };
        }

        foreach ($sales as $row) {
            $time = $this->eventTime($row);
            $meta = $this->bucketKey($time, $granularity);
            if (!isset($buckets[$meta['key']])) {
                $buckets[$meta['key']] = $this->emptyBucket($meta['key'], $meta['label']);
                $buckets[$meta['key']]['_sort'] = $meta['sort'];
            }
            $b = &$buckets[$meta['key']];
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
            $time = $this->eventTime($row);
            $meta = $this->bucketKey($time, $granularity);
            if (!isset($buckets[$meta['key']])) {
                $buckets[$meta['key']] = $this->emptyBucket($meta['key'], $meta['label']);
                $buckets[$meta['key']]['_sort'] = $meta['sort'];
            }
            $buckets[$meta['key']]['refundAmount'] += $this->refundAmount($row);
        }

        $timeline = [];
        foreach ($buckets as $b) {
            $b['netRevenue'] = $b['revenue'] - $b['refundAmount'];
            $b['averageOrderValue'] = $b['invoiceCount'] > 0
                ? round($b['revenue'] / $b['invoiceCount'], 2)
                : 0.0;
            if ($b['_costCount'] > 0) {
                $b['costAmount'] = round($b['_costSum'], 2);
                $b['grossProfit'] = round($b['revenue'] - $b['_costSum'], 2);
            } else {
                $b['costAmount'] = null;
                $b['grossProfit'] = null;
            }
            unset($b['_costSum'], $b['_costCount'], $b['_sort']);
            // Round money
            foreach (['grossRevenue', 'discountAmount', 'revenue', 'refundAmount', 'netRevenue', 'itemQuantity'] as $f) {
                $b[$f] = round((float) $b[$f], 2);
            }
            $timeline[] = $b;
        }

        usort($timeline, function ($a, $b) {
            return strcmp((string) $a['key'], (string) $b['key']);
        });

        return $timeline;
    }

    private function summarize(Collection $sales, Collection $refunds): array
    {
        $gross = 0.0;
        $discount = 0.0;
        $revenue = 0.0;
        $qty = 0.0;
        $costSum = 0.0;
        $costCount = 0;
        $invoiceCount = $sales->count();

        foreach ($sales as $row) {
            $gross += $this->saleGross($row);
            $discount += $this->saleDiscount($row);
            $revenue += $this->saleRevenue($row);
            $qty += $this->saleQty($row);
            $cost = $this->saleCost($row);
            if ($cost !== null) {
                $costSum += $cost;
                $costCount++;
            }
        }

        $refundTotal = 0.0;
        foreach ($refunds as $row) {
            $refundTotal += $this->refundAmount($row);
        }

        $net = $revenue - $refundTotal;
        $aov = $invoiceCount > 0 ? $revenue / $invoiceCount : 0.0;

        $costAmount = $costCount > 0 ? round($costSum, 2) : null;
        $grossProfit = $costCount > 0 ? round($revenue - $costSum, 2) : null;
        $margin = ($costCount > 0 && $revenue > 0)
            ? round((($revenue - $costSum) / $revenue) * 100, 2)
            : null;

        return [
            'grossRevenue' => round($gross, 2),
            'discountAmount' => round($discount, 2),
            'revenue' => round($revenue, 2),
            'refundAmount' => round($refundTotal, 2),
            'netRevenue' => round($net, 2),
            'invoiceCount' => $invoiceCount,
            'itemQuantity' => round($qty, 2),
            'averageOrderValue' => round($aov, 2),
            'costAmount' => $costAmount,
            'grossProfit' => $grossProfit,
            'grossMarginPercent' => $margin,
        ];
    }

    private function buildComparisonMetrics(array $current, array $previous): array
    {
        $keys = [
            'grossRevenue', 'discountAmount', 'revenue', 'refundAmount', 'netRevenue',
            'invoiceCount', 'itemQuantity', 'averageOrderValue', 'costAmount', 'grossProfit',
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

    private function buildBreakdowns(Collection $sales, Collection $refunds): array
    {
        $storeMap = Branch::query()->get(['id', 'name', 'code'])->keyBy('id');
        $userMap = User::query()->get(['id', 'name'])->keyBy('id');

        $byStore = [];
        $byChannel = [];
        $byPayment = [];
        $byStaff = [];

        $typeAttributed = 0;
        $staffAttributed = 0;
        $saleChannelAttributed = 0;
        $paymentUsedActual = 0;
        $paymentUsedEqualSplit = 0;
        $paymentAmountMismatch = 0;
        $saleCount = $sales->count();

        foreach ($sales as $row) {
            $rev = $this->saleRevenue($row);
            $payload = is_array($row->payload) ? $row->payload : [];

            $storeId = $row->branch_id ? (string) $row->branch_id : 'unknown';
            $storeName = $storeMap->get($row->branch_id)?->name ?? 'Không xác định';
            if (!isset($byStore[$storeId])) {
                $byStore[$storeId] = ['key' => $storeId, 'label' => $storeName, 'revenue' => 0.0, 'invoiceCount' => 0];
            }
            $byStore[$storeId]['revenue'] += $rev;
            $byStore[$storeId]['invoiceCount'] += 1;

            $type = strtolower(trim((string) ($row->type ?? '')));
            if ($type === '') {
                $type = strtolower(trim((string) ($payload['type'] ?? '')));
            }
            if ($type !== '' && $type !== 'unknown') {
                $typeAttributed++;
            }
            $typeKey = $type !== '' ? $type : 'unknown';
            $channelLabel = match ($typeKey) {
                'retail' => 'Bán lẻ',
                'wholesale' => 'Bán sỉ',
                'unknown' => 'Không xác định',
                default => $typeKey,
            };
            if (!isset($byChannel[$typeKey])) {
                $byChannel[$typeKey] = [
                    'key' => $typeKey,
                    'label' => $channelLabel,
                    'revenue' => 0.0,
                    'invoiceCount' => 0,
                ];
            }
            $byChannel[$typeKey]['revenue'] += $rev;
            $byChannel[$typeKey]['invoiceCount'] += 1;

            $saleCh = strtolower(trim((string) (
                $payload['channel'] ?? $payload['saleChannel'] ?? $payload['orderSource'] ?? ''
            )));
            if ($saleCh !== '') {
                $saleChannelAttributed++;
            }

            $paymentParts = $this->paymentAmountsFromSale($row, $rev);
            if ($paymentParts['mode'] === 'actual') {
                $paymentUsedActual++;
            } else {
                $paymentUsedEqualSplit++;
            }
            if ($paymentParts['amountMismatch']) {
                $paymentAmountMismatch++;
            }
            foreach ($paymentParts['parts'] as $part) {
                $label = $part['label'];
                $k = mb_strtolower($label);
                if (!isset($byPayment[$k])) {
                    $byPayment[$k] = ['key' => $label, 'label' => $label, 'revenue' => 0.0, 'invoiceCount' => 0];
                }
                $byPayment[$k]['revenue'] += $part['amount'];
                $byPayment[$k]['invoiceCount'] += 1;
            }

            $staffId = $row->user_id ?: $row->author_id;
            if ($staffId) {
                $staffAttributed++;
                $staffKey = (string) $staffId;
                $staffName = $userMap->get($staffId)?->name ?? 'Nhân viên #'.$staffId;
            } else {
                // Do not invent staff from payload.creator without business approval.
                $staffKey = 'unknown';
                $staffName = 'Không xác định';
            }
            if (!isset($byStaff[$staffKey])) {
                $byStaff[$staffKey] = ['key' => $staffKey, 'label' => $staffName, 'revenue' => 0.0, 'invoiceCount' => 0];
            }
            $byStaff[$staffKey]['revenue'] += $rev;
            $byStaff[$staffKey]['invoiceCount'] += 1;
        }

        // Refunds are not allocated into store/staff/channel breakdowns when dimension metadata is incomplete.
        // Summary/timeline still include refund totals by occurrence date.

        $normalize = function (array $map, int $topN = 10): array {
            $items = array_values($map);
            usort($items, fn ($a, $b) => $b['revenue'] <=> $a['revenue']);
            $totalRev = array_sum(array_column($items, 'revenue'));
            if (count($items) > $topN) {
                $top = array_slice($items, 0, $topN);
                $rest = array_slice($items, $topN);
                $other = [
                    'key' => 'other',
                    'label' => 'Khác',
                    'revenue' => array_sum(array_column($rest, 'revenue')),
                    'invoiceCount' => array_sum(array_column($rest, 'invoiceCount')),
                ];
                $items = array_merge($top, [$other]);
            }
            foreach ($items as &$item) {
                $item['revenue'] = round((float) $item['revenue'], 2);
                $item['percent'] = $totalRev > 0
                    ? round(($item['revenue'] / $totalRev) * 100, 2)
                    : 0.0;
            }
            unset($item);

            return $items;
        };

        $channelItems = $normalize($byChannel, 20);
        $staffItems = $normalize($byStaff);
        $storeItems = $normalize($byStore);
        $paymentItems = $normalize($byPayment);

        $channelMeaningful = $this->isMeaningfulBreakdown($channelItems);
        $staffMeaningful = $this->isMeaningfulBreakdown($staffItems);
        $storeMeaningful = $this->isMeaningfulBreakdown($storeItems);
        $paymentMeaningful = $this->isMeaningfulBreakdown($paymentItems)
            && !($paymentItems === [] || (count($paymentItems) === 1 && ($paymentItems[0]['key'] ?? '') === 'Không xác định'));

        return [
            'stores' => $storeItems,
            'channels' => $channelItems,
            'paymentMethods' => $paymentItems,
            'staff' => $staffItems,
            'meta' => [
                'stores' => [
                    'hasMeaningfulAttribution' => $storeMeaningful,
                    'message' => $storeMeaningful
                        ? null
                        : 'Dữ liệu bán hàng hiện chưa có thông tin cửa hàng để phân tích.',
                ],
                'channels' => [
                    'hasMeaningfulAttribution' => $channelMeaningful,
                    'coverage' => $saleCount > 0 ? round($typeAttributed / $saleCount, 4) : 0.0,
                    'message' => $channelMeaningful
                        ? null
                        : 'Dữ liệu bán hàng hiện chưa có thông tin loại hóa đơn để phân tích.',
                ],
                'paymentMethods' => [
                    'hasMeaningfulAttribution' => $paymentMeaningful,
                    'allocationMode' => $paymentUsedActual > 0 && $paymentUsedEqualSplit === 0
                        ? 'actual_line_amounts'
                        : ($paymentUsedEqualSplit > 0 && $paymentUsedActual === 0
                            ? 'equal_split_fallback'
                            : 'mixed'),
                    'salesWithActualAmounts' => $paymentUsedActual,
                    'salesWithEqualSplit' => $paymentUsedEqualSplit,
                    'salesWithAmountMismatch' => $paymentAmountMismatch,
                    'message' => $paymentMeaningful
                        ? ($paymentAmountMismatch > 0
                            ? 'Một số hóa đơn có tổng payment_lines.amount khác doanh thu; breakdown dùng amount thực tế của từng dòng (không scale im lặng).'
                            : null)
                        : 'Dữ liệu thanh toán chưa đủ để phân tích.',
                ],
                'staff' => [
                    'hasMeaningfulAttribution' => $staffMeaningful,
                    'coverage' => $saleCount > 0 ? round($staffAttributed / $saleCount, 4) : 0.0,
                    'message' => $staffMeaningful
                        ? null
                        : 'Dữ liệu bán hàng hiện chưa có thông tin nhân viên để phân tích.',
                ],
                'saleChannel' => [
                    'hasMeaningfulAttribution' => $saleChannelAttributed > 0,
                    'coverage' => $saleCount > 0 ? round($saleChannelAttributed / $saleCount, 4) : 0.0,
                    'message' => $saleChannelAttributed > 0
                        ? null
                        : 'Dữ liệu bán hàng hiện chưa có thông tin kênh bán để phân tích.',
                ],
                'refundAllocation' => [
                    'note' => 'Refund không được phân bổ vào breakdown cửa hàng/nhân viên/loại HĐ khi thiếu metadata; chỉ trừ vào timeline/summary theo ngày phát sinh.',
                ],
            ],
        ];
    }

    private function isMeaningfulBreakdown(array $items): bool
    {
        if ($items === []) {
            return false;
        }
        $keys = array_map(fn ($i) => strtolower((string) ($i['key'] ?? '')), $items);
        $labels = array_map(fn ($i) => mb_strtolower((string) ($i['label'] ?? '')), $items);
        $onlyUnknown = count($items) === 1 && (
            in_array($keys[0], ['unknown', 'không xác định', ''], true)
            || in_array($labels[0], ['unknown', 'không xác định', ''], true)
        );

        return !$onlyUnknown;
    }

    private function paginateTimeline(array $timeline, array $filters): array
    {
        $sortBy = $filters['sortBy'];
        $dir = $filters['sortDirection'] === 'desc' ? -1 : 1;

        usort($timeline, function ($a, $b) use ($sortBy, $dir) {
            $av = $a[$sortBy] ?? $a['key'] ?? '';
            $bv = $b[$sortBy] ?? $b['key'] ?? '';
            if (is_numeric($av) && is_numeric($bv)) {
                return $av == $bv ? 0 : ($av < $bv ? -1 * $dir : 1 * $dir);
            }

            return strcmp((string) $av, (string) $bv) * $dir;
        });

        $total = count($timeline);
        $page = $filters['page'];
        $perPage = $filters['perPage'];
        $totalPages = max(1, (int) ceil($total / $perPage));
        if ($page > $totalPages) {
            $page = $totalPages;
        }
        $offset = ($page - 1) * $perPage;
        $data = array_slice($timeline, $offset, $perPage);

        $totals = [
            'grossRevenue' => 0.0,
            'discountAmount' => 0.0,
            'revenue' => 0.0,
            'refundAmount' => 0.0,
            'netRevenue' => 0.0,
            'invoiceCount' => 0,
            'itemQuantity' => 0.0,
        ];
        foreach ($timeline as $row) {
            $totals['grossRevenue'] += $row['grossRevenue'];
            $totals['discountAmount'] += $row['discountAmount'];
            $totals['revenue'] += $row['revenue'];
            $totals['refundAmount'] += $row['refundAmount'];
            $totals['netRevenue'] += $row['netRevenue'];
            $totals['invoiceCount'] += $row['invoiceCount'];
            $totals['itemQuantity'] += $row['itemQuantity'];
        }
        foreach ($totals as $k => $v) {
            if ($k !== 'invoiceCount') {
                $totals[$k] = round($v, 2);
            }
        }
        $totals['averageOrderValue'] = $totals['invoiceCount'] > 0
            ? round($totals['revenue'] / $totals['invoiceCount'], 2)
            : 0.0;

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

    private function paymentLinesFromSale(object $row): array
    {
        $lines = is_array($row->payment_lines) ? $row->payment_lines : [];
        if ($lines !== []) {
            return $lines;
        }
        $payload = is_array($row->payload) ? $row->payload : [];
        $fromPayload = $payload['typePayment'] ?? $payload['paymentLines'] ?? $payload['payment_lines'] ?? [];
        if (!is_array($fromPayload)) {
            $fromPayload = [];
        }
        if ($fromPayload === []) {
            $single = $payload['paymentMethod'] ?? $payload['payment_method'] ?? null;
            if (is_string($single) && $this->isRealPaymentLabel($single)) {
                return [['method' => $single]];
            }
        }

        return $fromPayload;
    }

    private function paymentLabelFromLine(array $line): ?string
    {
        $name = null;
        if (isset($line['methodId']) && is_array($line['methodId'])) {
            $name = $line['methodId']['name']
                ?? $line['methodId']['label']
                ?? $line['methodId']['code']
                ?? null;
            // Resolve by id/mongo_id when only identifier is present inside methodId object.
            if ($name === null || $name === '') {
                $id = $line['methodId']['id']
                    ?? $line['methodId']['_id']
                    ?? $line['methodId']['mongo_id']
                    ?? null;
                if ($id !== null && $id !== '') {
                    $name = $this->resolvePaymentMethodName((string) $id);
                }
            }
        } elseif (isset($line['methodId']) && (is_string($line['methodId']) || is_numeric($line['methodId']))) {
            // Retail/wholesale create payload stores methodId as string id/mongo_id.
            $name = $this->resolvePaymentMethodName((string) $line['methodId']);
        }
        $name = $name
            ?? $line['method']
            ?? $line['name']
            ?? $line['label']
            ?? $line['paymentMethod']
            ?? null;
        if (!is_string($name) && !is_numeric($name)) {
            return null;
        }
        $label = trim((string) $name);
        if (!$this->isRealPaymentLabel($label)) {
            return null;
        }

        return $label;
    }

    /**
     * Resolve payment method label from id/mongo_id/code/name using catalog + in-memory cache.
     * Returns null when catalog has no match so callers can fall back to other fields.
     */
    private function resolvePaymentMethodName(string $raw): ?string
    {
        $key = trim($raw);
        if ($key === '') {
            return null;
        }
        $catalog = $this->paymentMethodCatalogMap();
        $lower = mb_strtolower($key);
        if (isset($catalog[$lower])) {
            return $catalog[$lower];
        }
        // Numeric id lookup
        if (ctype_digit($key) && isset($catalog['id:'.$key])) {
            return $catalog['id:'.$key];
        }

        return null;
    }

    /**
     * @return array<string, string> lowercase key / id:N / mongo_id → display name
     */
    private function paymentMethodCatalogMap(): array
    {
        if ($this->paymentMethodCatalog !== null) {
            return $this->paymentMethodCatalog;
        }
        $map = [];
        try {
            $methods = (new MirrorRecord())->forTable('payment_methods')->newQuery()
                ->get(['id', 'mongo_id', 'name', 'code']);
            foreach ($methods as $m) {
                $label = trim((string) ($m->name ?: $m->code ?: ''));
                if ($label === '' || !$this->isRealPaymentLabel($label)) {
                    continue;
                }
                $map[mb_strtolower($label)] = $label;
                if ($m->code) {
                    $map[mb_strtolower((string) $m->code)] = $label;
                }
                if ($m->mongo_id) {
                    $map[mb_strtolower((string) $m->mongo_id)] = $label;
                    $map[(string) $m->mongo_id] = $label;
                }
                if ($m->id) {
                    $map['id:'.(string) $m->id] = $label;
                    $map[(string) $m->id] = $label;
                }
            }
        } catch (\Throwable) {
            // catalog may be unavailable
        }
        $this->paymentMethodCatalog = $map;

        return $this->paymentMethodCatalog;
    }

    private function isRealPaymentLabel(string $label): bool
    {
        $t = trim($label);
        if ($t === '') {
            return false;
        }
        $lower = mb_strtolower($t);
        $placeholders = ['—', '-', '–', 'n/a', 'na', 'null', 'none', 'unknown', 'không xác định'];

        return !in_array($lower, $placeholders, true) && !in_array($t, $placeholders, true);
    }

    /**
     * @return array{parts: list<array{label: string, amount: float}>, mode: string, amountMismatch: bool}
     */
    private function paymentAmountsFromSale(object $row, float $revenue): array
    {
        $lines = $this->paymentLinesFromSale($row);
        $parsed = [];
        foreach ($lines as $line) {
            if (!is_array($line)) {
                continue;
            }
            $label = $this->paymentLabelFromLine($line);
            if ($label === null) {
                continue;
            }
            $amount = null;
            foreach (['amount', 'value', 'paid', 'money', 'total'] as $ak) {
                if (isset($line[$ak]) && $line[$ak] !== '' && is_numeric($line[$ak])) {
                    $amount = abs((float) $line[$ak]);
                    break;
                }
            }
            $parsed[] = ['label' => $label, 'amount' => $amount];
        }

        if ($parsed === []) {
            return [
                'parts' => [['label' => 'Không xác định', 'amount' => max(0.0, $revenue)]],
                'mode' => 'equal_split',
                'amountMismatch' => false,
            ];
        }

        $allHaveAmount = !in_array(null, array_column($parsed, 'amount'), true);
        if ($allHaveAmount) {
            $sum = array_sum(array_map(fn ($p) => (float) $p['amount'], $parsed));
            $mismatch = $revenue > 0 && abs($sum - $revenue) > 1.0;
            // Keep actual line amounts (do not silently scale). Invoice count still +1 per method present.
            $parts = [];
            foreach ($parsed as $p) {
                $parts[] = ['label' => $p['label'], 'amount' => (float) $p['amount']];
            }

            return [
                'parts' => $parts,
                'mode' => 'actual',
                'amountMismatch' => $mismatch,
            ];
        }

        // Fallback: equal split revenue across distinct labels
        $labels = array_values(array_unique(array_column($parsed, 'label')));
        $share = count($labels) > 0 ? max(0.0, $revenue) / count($labels) : max(0.0, $revenue);
        $parts = array_map(fn ($label) => ['label' => $label, 'amount' => $share], $labels);

        return [
            'parts' => $parts,
            'mode' => 'equal_split',
            'amountMismatch' => false,
        ];
    }

    private function paymentLabelsFromSale(object $row): array
    {
        $labels = [];
        foreach ($this->paymentLinesFromSale($row) as $line) {
            if (!is_array($line)) {
                continue;
            }
            $label = $this->paymentLabelFromLine($line);
            if ($label !== null) {
                $labels[] = $label;
            }
        }

        return array_values(array_unique($labels));
    }

    private function reportFilterDimensions(): array
    {
        // Completed sales drive revenue, so staff/channel/sale-channel options come from
        // completed rows only (filtering by them must have revenue impact).
        $sales = (new MirrorRecord())->forTable('sale_payments')->newQuery()
            ->whereIn('status', ['completed', 'COMPLETED'])
            ->get(['type', 'user_id', 'author_id', 'status', 'payload']);

        $channelSet = [];
        $saleChannelSet = [];
        $staffIds = [];
        $statusSet = [];

        // Status options must reflect every allowed status actually present in data
        // (scan all rows, not only completed) so the dropdown is not silently locked to
        // "completed" when draft/cancelled invoices exist.
        $statusRows = (new MirrorRecord())->forTable('sale_payments')->newQuery()
            ->get(['status']);
        $statusSet = [];
        foreach ($statusRows as $sale) {
            $status = strtolower(trim((string) ($sale->status ?? '')));
            if (in_array($status, self::ALLOWED_STATUSES, true)) {
                $statusSet[$status] = true;
            }
        }

        foreach ($sales as $sale) {
            $type = strtolower(trim((string) ($sale->type ?? '')));
            if (in_array($type, self::SALE_TYPES, true)) {
                $channelSet[$type] = true;
            }

            foreach ([$sale->user_id ?? null, $sale->author_id ?? null] as $staffId) {
                if (is_numeric($staffId) && (int) $staffId > 0) {
                    $staffIds[(int) $staffId] = true;
                }
            }

            $payload = is_array($sale->payload) ? $sale->payload : [];
            $saleChannel = strtolower(trim((string) (
                $payload['channel']
                ?? $payload['saleChannel']
                ?? $payload['orderSource']
                ?? ''
            )));
            if ($saleChannel === 'cửa hàng' || $saleChannel === 'cua hang') {
                $saleChannel = 'store';
            }
            if ($saleChannel !== '') {
                $saleChannelSet[$saleChannel] = true;
            }
        }

        $channelLabels = [
            'retail' => 'Bán lẻ',
            'wholesale' => 'Bán sỉ',
        ];
        $saleChannelLabels = [
            'store' => 'Cửa hàng',
            'shopee' => 'Shopee',
            'tiktok' => 'TikTok',
            'lazada' => 'Lazada',
            'tiki' => 'Tiki',
            'facebook' => 'Facebook Shop',
            'ecom-finance' => 'Tài chính sàn TMDT',
        ];
        $statusLabels = [
            'completed' => 'Hoàn tất',
            'draft' => 'Nháp',
            'cancelled' => 'Đã hủy',
        ];

        $channels = array_map(
            fn (string $value) => ['value' => $value, 'label' => $channelLabels[$value] ?? $value],
            array_keys($channelSet),
        );
        $saleChannels = array_map(
            fn (string $value) => ['value' => $value, 'label' => $saleChannelLabels[$value] ?? $value],
            array_keys($saleChannelSet),
        );
        // Always surface statuses that actually exist. If none detected, still expose
        // completed so the UI can default to a valid, business-safe status.
        if ($statusSet === []) {
            $statusSet['completed'] = true;
        }
        $invoiceStatuses = array_map(
            fn (string $value) => ['value' => $value, 'label' => $statusLabels[$value] ?? $value],
            array_keys($statusSet),
        );

        usort($channels, fn (array $left, array $right) => strcmp($left['label'], $right['label']));
        usort($saleChannels, fn (array $left, array $right) => strcmp($left['label'], $right['label']));
        usort($invoiceStatuses, fn (array $left, array $right) => strcmp($left['label'], $right['label']));

        $hasStore = (new MirrorRecord())->forTable('sale_payments')->newQuery()
            ->whereIn('status', ['completed', 'COMPLETED'])
            ->whereNotNull('branch_id')
            ->where('branch_id', '!=', 0)
            ->exists();

        return [
            'channels' => $channels,
            'saleChannels' => $saleChannels,
            'invoiceStatuses' => $invoiceStatuses,
            'staffIds' => array_keys($staffIds),
            'capabilities' => [
                'invoiceType' => [
                    'available' => $channels !== [],
                    'filterEnabled' => $channels !== [],
                    'message' => $channels !== [] ? null : 'Dữ liệu bán hàng chưa có loại hóa đơn để lọc.',
                ],
                'saleChannel' => [
                    'available' => $saleChannels !== [],
                    'filterEnabled' => $saleChannels !== [],
                    'message' => $saleChannels !== [] ? null : 'Dữ liệu bán hàng chưa có kênh bán để lọc.',
                ],
                'staff' => [
                    'available' => $staffIds !== [],
                    'filterEnabled' => $staffIds !== [],
                    'message' => $staffIds !== [] ? null : 'Dữ liệu bán hàng chưa có nhân viên gắn với hóa đơn để lọc.',
                ],
                'store' => [
                    'available' => $hasStore,
                    'filterEnabled' => $hasStore,
                    'message' => $hasStore ? null : 'Dữ liệu bán hàng chưa có cửa hàng gắn với hóa đơn để lọc.',
                ],
                'paymentMethod' => [
                    'available' => true,
                    'filterEnabled' => true,
                    'message' => null,
                ],
                'refundBranchColumn' => Schema::hasColumn('product_refunds', 'branch_id'),
            ],
        ];
    }

    private function buildAttributionMeta(Collection $sales, array $breakdowns): array
    {
        $meta = $breakdowns['meta'] ?? [];

        return [
            'invoiceType' => $meta['channels'] ?? [
                'hasMeaningfulAttribution' => false,
                'message' => 'Dữ liệu bán hàng hiện chưa có thông tin loại hóa đơn để phân tích.',
            ],
            'staff' => $meta['staff'] ?? [
                'hasMeaningfulAttribution' => false,
                'message' => 'Dữ liệu bán hàng hiện chưa có thông tin nhân viên để phân tích.',
            ],
            'saleChannel' => $meta['saleChannel'] ?? [
                'hasMeaningfulAttribution' => false,
                'message' => 'Dữ liệu bán hàng hiện chưa có thông tin kênh bán để phân tích.',
            ],
            'store' => $meta['stores'] ?? [
                'hasMeaningfulAttribution' => true,
                'message' => null,
            ],
            'paymentMethod' => $meta['paymentMethods'] ?? [
                'hasMeaningfulAttribution' => true,
                'message' => null,
            ],
        ];
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
                if ($label && $this->isRealPaymentLabel((string) $label)) {
                    $fromCatalog[mb_strtolower((string) $label)] = (string) $label;
                }
            }
        } catch (\Throwable) {
            // catalog may be unavailable
        }

        if ($fromCatalog !== []) {
            return collect($fromCatalog)->sort()->values()->map(fn ($label) => [
                'value' => $label,
                'label' => $label,
            ])->all();
        }

        // Fallback: scan payment_lines without hard 500 cap that silently drops methods.
        // Chunk by id ascending to cover full table safely for option discovery.
        $set = [];
        $lastId = 0;
        $guard = 0;
        while ($guard < 50) {
            $guard++;
            $batch = (new MirrorRecord())->forTable('sale_payments')->newQuery()
                ->where('id', '>', $lastId)
                ->orderBy('id')
                ->limit(1000)
                ->get(['id', 'payment_lines', 'payload']);
            if ($batch->isEmpty()) {
                break;
            }
            foreach ($batch as $row) {
                $lastId = max($lastId, (int) $row->id);
                foreach ($this->paymentLabelsFromSale($row) as $label) {
                    $set[mb_strtolower($label)] = $label;
                }
            }
            if ($batch->count() < 1000) {
                break;
            }
        }

        return collect($set)->sort()->values()->map(fn ($label) => [
            'value' => $label,
            'label' => $label,
        ])->all();
    }
}
