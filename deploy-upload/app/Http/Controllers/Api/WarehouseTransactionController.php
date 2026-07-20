<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\MirrorRecord;
use App\Support\LocalToken;
use App\Models\Product;
use App\Models\ProductBranchStock;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class WarehouseTransactionController extends Controller
{
    private const LIMIT = 20;
    private const MAX_LIMIT = 5000;

    private array $voucherMongoIdCache = [];

    /** @var array<string, Branch>|null */
    private ?array $warehousesByMongoId = null;

    /** @var array<string, Branch>|null */
    private ?array $warehousesByNumericId = null;

    private function warehouseMap(): array
    {
        if ($this->warehousesByMongoId !== null) {
            return $this->warehousesByMongoId;
        }

        $branches = Branch::query()
            ->orderBy('name')
            ->get(['id', 'mongo_id', 'name', 'code']);

        $this->warehousesByMongoId = $branches
            ->filter(fn ($branch) => $branch->mongo_id !== null && $branch->mongo_id !== '')
            ->keyBy(fn ($branch) => (string) $branch->mongo_id)
            ->all();

        $this->warehousesByNumericId = $branches
            ->keyBy(fn ($branch) => (string) $branch->id)
            ->all();

        return $this->warehousesByMongoId;
    }

    private function resolveBranch(?string $key): ?Branch
    {
        $key = trim((string) $key);
        if ($key === '') {
            return null;
        }

        $this->warehouseMap();

        return $this->warehousesByMongoId[$key]
            ?? $this->warehousesByNumericId[$key]
            ?? null;
    }

    private function resolveWarehouseName(?string $key, array $payload = [], array $sourceRow = []): ?string
    {
        $fromPayload = $payload['warehouse_name']
            ?? $payload['warehouseName']
            ?? $payload['warehouse']
            ?? $payload['sourceWarehouseName']
            ?? $payload['destinationWarehouseName']
            ?? $payload['source_warehouse_name']
            ?? $payload['destination_warehouse_name']
            ?? null;
        if (is_string($fromPayload) && trim($fromPayload) !== '') {
            return trim($fromPayload);
        }

        $fromRow = $sourceRow['C'] ?? $sourceRow['c'] ?? null;
        if (is_string($fromRow) && trim($fromRow) !== '') {
            return trim($fromRow);
        }

        return $this->resolveBranch($key)?->name;
    }

    public function meta(): JsonResponse
    {
        $warehouses = collect($this->warehouseMap())
            ->map(fn ($branch): array => [
                'value' => (string) $branch->mongo_id,
                'label' => $branch->name,
                'code' => $branch->code,
            ])
            ->values();

        $voucherTypes = $this->distinctSorted('inventory_vouchers', 'type');

        $types = collect([
            'IMPORT' => 'Nhập kho',
            'EXPORT' => 'Xuất kho',
            'TRANSFER' => 'Chuyển kho',
        ])->map(fn ($label, $value): array => ['value' => $value, 'label' => $label])->values();

        // Build kinds safely to avoid merge/unique mixing arrays and strings (was causing incorrect filter options)
        // Values stay stable for filtering; only display labels are normalized for known aliases.
        $kindMap = collect([
            'IMPORT' => 'Nhập kho',
            'EXPORT' => 'Xuất kho',
            'TRANSFER' => 'Chuyển kho',
        ]);
        foreach ($voucherTypes as $t) {
            $t = trim((string) $t);
            if ($t === '' || $kindMap->has($t)) {
                continue;
            }
            $kindMap->put($t, $this->kindDisplayLabel($t));
        }
        $kinds = $kindMap
            ->map(fn ($label, $value): array => ['value' => (string) $value, 'label' => (string) $label])
            ->values();

        return response()->json([
            'warehouses' => $warehouses,
            'types' => $types,
            'kinds' => $kinds,
        ]);
    }

    public function index(Request $request, string $tab): JsonResponse
    {
        if ($message = $this->validateDateRange($request)) {
            return response()->json([
                'ok' => false,
                'message' => $message,
            ], 422);
        }

        $tab = $tab === 'items' ? 'items' : 'bills';
        $limit = (int) min(max((int) $request->query('limit', $request->query('perPage', self::LIMIT)), 1), self::MAX_LIMIT);
        $page = max((int) $request->query('page', 1), 1);
        $warehouses = $this->warehouseMap();
        $filters = $this->filters($request);

        if ($tab === 'bills') {
            ['items' => $items, 'total' => $total] = $this->paginateBillRows($filters, $warehouses, $page, $limit);
        } else {
            ['items' => $items, 'total' => $total] = $this->paginateItemRows($filters, $warehouses, $page, $limit);
        }

        return response()->json([
            'items' => $items,
            'data' => $items,
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'per_page' => $limit,
            'current_page' => $page,
            'last_page' => (int) ceil($total / max($limit, 1)),
        ]);
    }

    /**
     * Reject inverted date ranges. Compare YYYY-MM-DD lexicographically when both match the format
     * to avoid timezone drift from Carbon parsing of date-only strings.
     */
    private function validateDateRange(Request $request): ?string
    {
        $fromDate = trim((string) $request->query('fromDate', ''));
        $toDate = trim((string) $request->query('toDate', ''));
        if ($fromDate === '' || $toDate === '') {
            return null;
        }

        $fromKey = $this->normalizeDateKey($fromDate);
        $toKey = $this->normalizeDateKey($toDate);
        if ($fromKey === null || $toKey === null) {
            return null;
        }

        if ($fromKey > $toKey) {
            return 'Từ ngày không được lớn hơn Đến ngày.';
        }

        return null;
    }

    private function normalizeDateKey(string $value): ?string
    {
        $value = trim($value);
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) === 1) {
            return $value;
        }

        try {
            return Carbon::parse($value)->format('Y-m-d');
        } catch (\Throwable) {
            return null;
        }
    }

    private function kindDisplayLabel(string $value): string
    {
        $key = strtoupper(trim($value));
        return match ($key) {
            'IMPORT', 'IN', 'STOCK_IN' => 'Nhập kho',
            'EXPORT', 'OUT', 'STOCK_OUT' => 'Xuất kho',
            'TRANSFER', 'CHUYỂN KHO' => 'Chuyển kho',
            'IMPORT_TRANSFER' => 'Nhập chuyển kho',
            'EXPORT_TRANSFER' => 'Xuất chuyển kho',
            default => $value !== '' ? $value : 'Không xác định',
        };
    }

    /**
     * Bills = vouchers ∪ transfers (1 row each). Safe windowed merge:
     * top (offset+limit) of merge ⊆ top (offset+limit) of each sorted source.
     * Total uses exact SQL counts.
     *
     * @return array{items: list<array>, total: int}
     */
    private function paginateBillRows(array $filters, array $warehouses, int $page, int $limit): array
    {
        $offset = max(0, ($page - 1) * $limit);
        $window = $offset + $limit;

        $voucherTotal = $this->countVouchers($filters);
        $transferTotal = $this->countTransfers($filters);
        $total = $voucherTotal + $transferTotal;

        if ($total === 0 || $offset >= $total) {
            return ['items' => [], 'total' => $total];
        }

        // Bills list never filters by product keyword (field is items-tab only).
        $billFilters = $filters;
        $billFilters['productKeyword'] = '';

        $vouchers = $this->queryVouchers($billFilters, $warehouses, false, $window)
            ->map(fn ($row) => $this->billRowFromVoucher($row, $warehouses));
        $transfers = $this->queryTransfers($billFilters, $warehouses, false, $window)
            ->map(fn ($row) => $this->billRowFromTransfer($row, $warehouses));

        $items = $vouchers->concat($transfers)
            ->sortByDesc(fn (array $row): int => $this->sortTimestamp($row['date'] ?? null))
            ->values()
            ->slice($offset, $limit)
            ->values()
            ->all();

        return ['items' => $items, 'total' => $total];
    }

    /**
     * Items: inventory_products rows + expanded transfer lines.
     * Fast SQL pagination when only one source can contribute (typed IMPORT/EXPORT/TRANSFER).
     * Mixed sources keep full filtered load with N+1 voucher lookup batching.
     *
     * @return array{items: list<array>, total: int}
     */
    private function paginateItemRows(array $filters, array $warehouses, int $page, int $limit): array
    {
        $offset = max(0, ($page - 1) * $limit);
        $type = $filters['type'];
        $kind = $filters['kind'];

        // Pure voucher-product path: transfers cannot contribute.
        if ($type === 'IMPORT' || $type === 'EXPORT' || $kind === 'IMPORT' || $kind === 'EXPORT') {
            $total = $this->countVoucherProducts($filters);
            if ($total === 0 || $offset >= $total) {
                return ['items' => [], 'total' => $total];
            }
            $this->warmVoucherCodeCacheForProducts($filters, $limit, $offset);
            $items = $this->queryVoucherProducts($filters, $warehouses, $limit, $offset)
                ->map(fn ($row) => $this->itemRowFromVoucherProduct($row, $warehouses))
                ->values()
                ->all();

            return ['items' => $items, 'total' => $total];
        }

        // Pure transfer path: inventory products cannot contribute.
        if ($type === 'TRANSFER' || $kind === 'TRANSFER') {
            $lines = $this->queryTransfers($filters, $warehouses, false)
                ->flatMap(fn ($row) => $this->itemRowsFromTransfer($row, $warehouses));
            if ($filters['productKeyword'] !== '') {
                $lines = $this->filterItemRowsByProductKeyword($lines, $filters['productKeyword']);
            }
            $sorted = $lines
                ->sortByDesc(fn (array $row): int => $this->sortTimestamp($row['date'] ?? null))
                ->values();
            $total = $sorted->count();
            $items = $sorted->slice($offset, $limit)->values()->all();

            return ['items' => $items, 'total' => $total];
        }

        // Mixed sources: must expand transfer lines before global sort/paginate.
        $this->warmVoucherCodeCacheForProducts($filters);
        $products = $this->queryVoucherProducts($filters, $warehouses)
            ->map(fn ($row) => $this->itemRowFromVoucherProduct($row, $warehouses));
        $transferLines = $this->queryTransfers($filters, $warehouses, false)
            ->flatMap(fn ($row) => $this->itemRowsFromTransfer($row, $warehouses));

        $combined = $products->concat($transferLines);
        if ($filters['productKeyword'] !== '') {
            $combined = $this->filterItemRowsByProductKeyword($combined, $filters['productKeyword']);
        }

        $sorted = $combined
            ->sortByDesc(fn (array $row): int => $this->sortTimestamp($row['date'] ?? null))
            ->values();
        $total = $sorted->count();
        $items = $sorted->slice($offset, $limit)->values()->all();

        return ['items' => $items, 'total' => $total];
    }

    private function filterItemRowsByProductKeyword($rows, string $productKeyword)
    {
        $keyword = mb_strtolower(trim($productKeyword));
        if ($keyword === '') {
            return $rows;
        }

        return $rows->filter(function (array $row) use ($keyword): bool {
            foreach (['productName', 'productCode', 'barcode'] as $field) {
                $val = mb_strtolower((string) ($row[$field] ?? ''));
                if ($val !== '' && str_contains($val, $keyword)) {
                    return true;
                }
            }

            return false;
        });
    }

    private function filters(Request $request): array
    {
        return [
            'warehouseId' => trim((string) $request->query('warehouseId', '')),
            'billId' => trim((string) $request->query('billId', $request->query('code', ''))),
            'type' => trim((string) $request->query('type', '')),
            'kind' => trim((string) $request->query('kind', '')),
            'fromDate' => trim((string) $request->query('fromDate', '')),
            'toDate' => trim((string) $request->query('toDate', '')),
            'productKeyword' => trim((string) $request->query('productKeyword', '')),
        ];
    }

    private function applyDateFilter($query, array $filters, string $column = 'business_date'): void
    {
        if ($filters['fromDate'] !== '') {
            $from = $this->parseDate($filters['fromDate']);
            if ($from) {
                $query->where($column, '>=', $from->startOfDay());
            }
        }
        if ($filters['toDate'] !== '') {
            $to = $this->parseDate($filters['toDate']);
            if ($to) {
                $query->where($column, '<=', $to->endOfDay());
            }
        }
    }

    private function parseDate(string $value): ?Carbon
    {
        if ($value === '') {
            return null;
        }
        try {
            return Carbon::parse($value);
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * Resolve warehouse filter against real DB shapes:
     * - inventory_vouchers: warehouse_mongo_id often NULL, warehouse_name filled
     * - inventory_products: branch_mongo_id often stores numeric branches.id
     * - warehouse_transfers: from/to_branch_mongo_id stores Branch.mongo_id
     */
    private function applyWarehouseFilter($query, string $warehouseId, string $mode): void
    {
        $warehouseId = trim($warehouseId);
        if ($warehouseId === '') {
            return;
        }

        $branch = $this->resolveBranch($warehouseId);
        $keys = array_values(array_unique(array_filter([
            $warehouseId,
            $branch?->mongo_id ? (string) $branch->mongo_id : null,
            $branch?->id !== null ? (string) $branch->id : null,
        ], fn ($v) => $v !== null && $v !== '')));
        $name = $branch?->name ? trim((string) $branch->name) : '';

        if ($mode === 'voucher') {
            $query->where(function ($builder) use ($keys, $name): void {
                if ($keys !== []) {
                    $builder->whereIn('warehouse_mongo_id', $keys)
                        ->orWhereIn('branch_mongo_id', $keys);
                }
                if ($name !== '') {
                    $builder->orWhere('warehouse_name', $name)
                        ->orWhere('warehouse_name', 'like', $name.' →%')
                        ->orWhere('warehouse_name', 'like', '%→ '.$name);
                }
            });

            return;
        }

        if ($mode === 'product') {
            $query->where(function ($builder) use ($keys, $name): void {
                if ($keys !== []) {
                    $builder->whereIn('branch_mongo_id', $keys);
                }
                // JSON payload may store warehouse label from legacy import
                if ($name !== '') {
                    $builder->orWhere('payload->source_row->values->C', $name)
                        ->orWhere('payload', 'like', '%"C":"'.$name.'"%');
                }
            });

            return;
        }

        // transfer
        $query->where(function ($builder) use ($keys): void {
            foreach ($keys as $key) {
                $builder->orWhere('from_branch_mongo_id', $key)
                    ->orWhere('to_branch_mongo_id', $key)
                    ->orWhere('from_branch_id', $key)
                    ->orWhere('to_branch_id', $key);
            }
        });
    }

    /**
     * Type filter must accept both English enum (IMPORT/EXPORT) in import_export_type
     * and Vietnamese labels in type (e.g. "Xuất bán lẻ", "Nhập khi tạo sản phẩm").
     */
    private function applyTypeFilter($query, string $type, array $columns): void
    {
        $type = trim($type);
        if ($type === '' || $type === 'TRANSFER') {
            return;
        }

        $patterns = $this->typeMatchPatterns($type);
        $query->where(function ($builder) use ($columns, $patterns, $type): void {
            foreach ($columns as $column) {
                $builder->orWhere($column, $type);
                foreach ($patterns as $pattern) {
                    $builder->orWhere($column, 'like', $pattern);
                }
            }
        });
    }

    private function applyKindFilter($query, string $kind, array $columns): void
    {
        $kind = trim($kind);
        if ($kind === '' || $kind === 'TRANSFER') {
            return;
        }

        // Built-in kind values IMPORT/EXPORT behave like type filter.
        if (in_array($kind, ['IMPORT', 'EXPORT'], true)) {
            $this->applyTypeFilter($query, $kind, $columns);

            return;
        }

        $query->where(function ($builder) use ($columns, $kind): void {
            foreach ($columns as $column) {
                $builder->orWhere($column, $kind)
                    ->orWhere($column, 'like', '%'.$kind.'%');
            }
        });
    }

    private function typeMatchPatterns(string $type): array
    {
        return match ($type) {
            'IMPORT' => ['IMPORT%', 'Import%', 'Nhập%', 'nhập%', 'NHẬP%', '%trả hàng%', '%tra hang%'],
            'EXPORT' => ['EXPORT%', 'Export%', 'Xuất%', 'xuất%', 'XUẤT%'],
            default => ['%'.$type.'%'],
        };
    }

    private function vouchersBaseQuery(array $filters)
    {
        if ($filters['type'] === 'TRANSFER' || $filters['kind'] === 'TRANSFER') {
            return null;
        }

        $query = (new MirrorRecord())->forTable('inventory_vouchers')->newQuery();
        $this->applyDateFilter($query, $filters);
        $this->applyWarehouseFilter($query, $filters['warehouseId'], 'voucher');

        if ($filters['billId'] !== '') {
            $keyword = $filters['billId'];
            $query->where(function ($builder) use ($keyword): void {
                $builder->where('voucher_code', 'like', "%{$keyword}%")
                    ->orWhere('code', 'like', "%{$keyword}%")
                    ->orWhere('mongo_id', $keyword)
                    ->orWhere('refer_code', 'like', "%{$keyword}%");
            });
        }

        $this->applyTypeFilter($query, $filters['type'], ['import_export_type', 'type']);
        $this->applyKindFilter($query, $filters['kind'], ['import_export_type', 'type']);

        return $query;
    }

    private function countVouchers(array $filters): int
    {
        $query = $this->vouchersBaseQuery($filters);
        if ($query === null) {
            return 0;
        }

        return (int) $query->count();
    }

    private function queryVouchers(array $filters, array $warehouses, bool $byId, ?int $limit = null)
    {
        $query = $this->vouchersBaseQuery($filters);
        if ($query === null) {
            return collect();
        }

        $query->orderByDesc('business_date')->orderByDesc('id');
        if ($limit !== null) {
            $query->limit(max(0, $limit));
        }

        return $query->get();
    }

    private function transfersBaseQuery(array $filters)
    {
        $query = (new MirrorRecord())->forTable('warehouse_transfers')->newQuery();
        $this->applyDateFilter($query, $filters);
        $this->applyWarehouseFilter($query, $filters['warehouseId'], 'transfer');

        if ($filters['billId'] !== '') {
            $keyword = $filters['billId'];
            $query->where(function ($builder) use ($keyword): void {
                $builder->where('code', 'like', "%{$keyword}%")
                    ->orWhere('mongo_id', $keyword)
                    ->orWhere('name', 'like', "%{$keyword}%");
            });
        }
        if (($filters['type'] !== '' && $filters['type'] !== 'TRANSFER')
            || ($filters['kind'] !== '' && $filters['kind'] !== 'TRANSFER')) {
            $query->whereRaw('1 = 0');
        }

        // Pre-filter transfer payloads when searching product text (exact match still applied after expand).
        if ($filters['productKeyword'] !== '') {
            $keyword = $filters['productKeyword'];
            $query->where('payload', 'like', '%'.$keyword.'%');
        }

        return $query;
    }

    private function countTransfers(array $filters): int
    {
        // Count transfer bills (not expanded lines). productKeyword prefilter is approximate for bills
        // and must not affect bill totals — only apply for item-oriented callers via a flag.
        $filtersForBills = $filters;
        $filtersForBills['productKeyword'] = '';

        return (int) $this->transfersBaseQuery($filtersForBills)->count();
    }

    private function queryTransfers(array $filters, array $warehouses, bool $byId, ?int $limit = null)
    {
        $query = $this->transfersBaseQuery($filters);
        $query->orderByDesc('business_date')->orderByDesc('id');
        if ($limit !== null) {
            $query->limit(max(0, $limit));
        }

        return $query->get();
    }

    private function voucherProductsBaseQuery(array $filters)
    {
        if ($filters['type'] === 'TRANSFER' || $filters['kind'] === 'TRANSFER') {
            return null;
        }

        $query = (new MirrorRecord())->forTable('inventory_products')->newQuery();
        $this->applyDateFilter($query, $filters);
        $this->applyWarehouseFilter($query, $filters['warehouseId'], 'product');

        // inventory_products in this DB: name/code/type on columns; prodCode/prodName/price/qty in payload JSON.
        if ($filters['productKeyword'] !== '') {
            $keyword = $filters['productKeyword'];
            $query->where(function ($builder) use ($keyword): void {
                $builder->where('name', 'like', "%{$keyword}%")
                    ->orWhere('code', 'like', "%{$keyword}%")
                    ->orWhere('payload->prodName', 'like', "%{$keyword}%")
                    ->orWhere('payload->prodCode', 'like', "%{$keyword}%")
                    ->orWhere('payload->product_name', 'like', "%{$keyword}%")
                    ->orWhere('payload->product_code', 'like', "%{$keyword}%")
                    ->orWhere('payload->barcode', 'like', "%{$keyword}%")
                    ->orWhere('payload', 'like', "%{$keyword}%");
            });
        }

        $this->applyTypeFilter($query, $filters['type'], ['type']);
        $this->applyKindFilter($query, $filters['kind'], ['type']);

        if ($filters['billId'] !== '') {
            $keyword = $filters['billId'];
            $voucherKeys = (new MirrorRecord())->forTable('inventory_vouchers')->newQuery()
                ->where(function ($builder) use ($keyword): void {
                    $builder->where('voucher_code', 'like', "%{$keyword}%")
                        ->orWhere('code', 'like', "%{$keyword}%")
                        ->orWhere('mongo_id', $keyword)
                        ->orWhere('refer_code', 'like', "%{$keyword}%");
                })
                ->get(['mongo_id', 'voucher_code', 'code', 'refer_code'])
                ->flatMap(fn ($row) => [
                    $row->mongo_id,
                    $row->voucher_code,
                    $row->code,
                    $row->refer_code,
                ])
                ->filter(fn ($v) => $v !== null && trim((string) $v) !== '')
                ->map(fn ($v) => (string) $v)
                ->unique()
                ->values()
                ->all();

            $query->where(function ($builder) use ($keyword, $voucherKeys): void {
                $builder->where('inventory_voucher_mongo_id', $keyword)
                    ->orWhere('inventory_voucher_mongo_id', 'like', "%{$keyword}%")
                    ->orWhere('code', 'like', "%{$keyword}%")
                    ->orWhere('payload->code', 'like', "%{$keyword}%");
                if ($voucherKeys !== []) {
                    $builder->orWhereIn('inventory_voucher_mongo_id', $voucherKeys);
                }
            });
        }

        return $query;
    }

    private function countVoucherProducts(array $filters): int
    {
        $query = $this->voucherProductsBaseQuery($filters);
        if ($query === null) {
            return 0;
        }

        return (int) $query->count();
    }

    private function queryVoucherProducts(array $filters, array $warehouses, ?int $limit = null, ?int $offset = null)
    {
        $query = $this->voucherProductsBaseQuery($filters);
        if ($query === null) {
            return collect();
        }

        $query->orderByDesc('business_date')->orderByDesc('id');
        if ($offset !== null) {
            $query->offset(max(0, $offset));
        }
        if ($limit !== null) {
            $query->limit(max(0, $limit));
        }

        return $query->get();
    }

    /**
     * Batch-warm voucher code/id caches to avoid N+1 lookups while mapping product rows.
     */
    private function warmVoucherCodeCacheForProducts(array $filters, ?int $limit = null, ?int $offset = null): void
    {
        $query = $this->voucherProductsBaseQuery($filters);
        if ($query === null) {
            return;
        }

        $query->orderByDesc('business_date')->orderByDesc('id');
        if ($offset !== null) {
            $query->offset(max(0, $offset));
        }
        if ($limit !== null) {
            $query->limit(max(0, $limit));
        }

        $refs = $query->get(['inventory_voucher_mongo_id', 'payload', 'code'])
            ->flatMap(function ($row) {
                $payload = is_array($row->payload) ? $row->payload : [];

                return [
                    $row->inventory_voucher_mongo_id,
                    $payload['inventory_voucher_mongo_id'] ?? null,
                    $payload['voucherId'] ?? null,
                    $payload['code'] ?? null,
                    $payload['voucher_code'] ?? null,
                    $payload['refer_code'] ?? null,
                ];
            })
            ->map(fn ($v) => trim((string) $v))
            ->filter(fn ($v) => $v !== '')
            ->unique()
            ->values()
            ->all();

        if ($refs === []) {
            return;
        }

        $vouchers = (new MirrorRecord())->forTable('inventory_vouchers')->newQuery()
            ->where(function ($builder) use ($refs): void {
                $builder->whereIn('mongo_id', $refs)
                    ->orWhereIn('voucher_code', $refs)
                    ->orWhereIn('code', $refs)
                    ->orWhereIn('refer_code', $refs);
            })
            ->get(['mongo_id', 'voucher_code', 'code', 'refer_code']);

        foreach ($vouchers as $voucher) {
            $mongoId = $voucher->mongo_id ? (string) $voucher->mongo_id : null;
            $code = $voucher->voucher_code ?: $voucher->code;
            $code = $code ? (string) $code : null;
            if ($mongoId) {
                $this->voucherMongoIdCache['code:'.$mongoId] = $code;
                $this->voucherMongoIdCache['id:'.$mongoId] = $mongoId;
            }
            foreach ([$voucher->voucher_code, $voucher->code, $voucher->refer_code] as $key) {
                $key = trim((string) $key);
                if ($key === '') {
                    continue;
                }
                $this->voucherMongoIdCache['id:'.$key] = $mongoId;
                if ($code) {
                    $this->voucherMongoIdCache['code:'.$key] = $code;
                }
            }
        }
    }

    private function typeKeyword(string $type): string
    {
        return match ($type) {
            'IMPORT' => 'Nhập%',
            'EXPORT' => 'Xuất%',
            default => "%{$type}%",
        };
    }

    private function billRowFromVoucher(MirrorRecord $record, array $warehouses): array
    {
        $payload = is_array($record->payload) ? $record->payload : [];
        $type = $this->detectVoucherType($payload, $record);
        $voucherCode = $record->voucher_code ?: ($payload['voucher_code'] ?? $payload['code'] ?? $record->code ?? $record->mongo_id);
        $warehouseId = $record->warehouse_mongo_id
            ?: ($payload['warehouse_mongo_id'] ?? $record->branch_mongo_id ?? $payload['branch_mongo_id'] ?? null);
        // Prefer warehouse_name column (always filled in this DB). Never invent names.
        $warehouseName = $record->warehouse_name
            ?: $this->resolveWarehouseName(
                $warehouseId !== null ? (string) $warehouseId : null,
                $payload,
            );

        $isImport = $type === 'IMPORT';
        $isExport = $type === 'EXPORT';
        $rawKind = $record->type
            ?: ($payload['type'] ?? $record->import_export_type ?? $payload['import_export_type'] ?? 'Không xác định');
        // Normalize technical codes (import/export) to Vietnamese labels for UI filters/badges.
        $kindLabel = $this->kindDisplayLabel(trim((string) $rawKind));
        if ($kindLabel === trim((string) $rawKind) && $isImport) {
            $kindLabel = 'Nhập kho';
        } elseif ($kindLabel === trim((string) $rawKind) && $isExport) {
            $kindLabel = 'Xuất kho';
        }
        $directionLabel = $isImport ? 'Nhập kho' : ($isExport ? 'Xuất kho' : (string) $kindLabel);
        $directionTone = $isImport ? 'import' : ($isExport ? 'export' : 'neutral');

        return [
            'rowKey' => 'inventory-voucher:' . $record->mongo_id,
            'source' => 'inventory-voucher',
            'sourceId' => $record->mongo_id,
            'code' => $voucherCode,
            'billCode' => $voucherCode,
            'date' => $this->dateValue($payload, $record),
            'warehouseId' => $warehouseId,
            'warehouseName' => $warehouseName,
            'totalProductLines' => (int) ($record->sp_count ?? $payload['sp_count'] ?? $payload['spCount'] ?? 0),
            'totalQuantity' => (int) $this->amountValue($record->qty ?? $payload['qty'] ?? 0, true),
            'totalAmount' => $this->amountValue($record->total_amount ?? $payload['total_amount'] ?? $payload['totalAmount'] ?? $payload['total'] ?? $record->total ?? null),
            'type' => $type,
            'kind' => $type === 'UNKNOWN' ? ($payload['type'] ?? $payload['import_export_type'] ?? $record->type ?? 'UNKNOWN') : $type,
            'kindLabel' => $kindLabel,
            'sourceModule' => 'inventory-voucher',
            'createdByName' => $record->creator ?? ($payload['creator'] ?? null),
            'customerName' => $payload['customer_name'] ?? $payload['customer'] ?? null,
            'customerPhone' => $payload['customer_phone'] ?? $record->customer_phone ?? null,
            'relatedCode' => $payload['refer_code'] ?? $record->refer_code ?? null,
            'note' => $payload['note'] ?? $record->note ?? '',
            'status' => $record->status,
            'directionLabel' => $directionLabel,
            'directionTone' => $directionTone,
            'canDelete' => $this->voucherCanDelete($record, $payload, $type),
        ];
    }

    private function billRowFromTransfer(MirrorRecord $record, array $warehouses): array
    {
        $payload = is_array($record->payload) ? $record->payload : [];
        $fromId = $payload['sourceWarehouseId']
            ?? $payload['from_branch_mongo_id']
            ?? $record->from_branch_mongo_id
            ?? null;
        $toId = $payload['destinationWarehouseId']
            ?? $payload['to_branch_mongo_id']
            ?? $record->to_branch_mongo_id
            ?? null;
        $fromName = $payload['sourceWarehouseName']
            ?? $payload['source_warehouse_name']
            ?? ($record->source_warehouse_name ?? null)
            ?? $this->resolveWarehouseName($fromId !== null ? (string) $fromId : null, $payload);
        $toName = $payload['destinationWarehouseName']
            ?? $payload['destination_warehouse_name']
            ?? ($record->destination_warehouse_name ?? null)
            ?? $this->resolveWarehouseName($toId !== null ? (string) $toId : null, $payload);

        return [
            'rowKey' => 'warehouse-transfer:' . $record->mongo_id,
            'source' => 'warehouse-transfer',
            'sourceId' => $record->mongo_id,
            'code' => $payload['code'] ?? $record->code ?? $record->mongo_id,
            'billCode' => $payload['code'] ?? $record->code ?? null,
            'date' => $this->dateValue($payload, $record),
            'fromWarehouseId' => $fromId,
            'fromWarehouseName' => $fromName,
            'toWarehouseId' => $toId,
            'toWarehouseName' => $toName,
            'totalProductLines' => (int) ($payload['spCount'] ?? $payload['sp_count'] ?? count($payload['lines'] ?? [])),
            'totalQuantity' => (int) ($payload['qty'] ?? $this->transferQuantity($payload)),
            'totalAmount' => $this->amountValue($payload['total_amount'] ?? $payload['totalAmount'] ?? $record->total_amount ?? $record->total ?? null),
            'type' => 'TRANSFER',
            'kind' => 'TRANSFER',
            'kindLabel' => $payload['type'] ?? $record->type ?? 'Chuyển kho',
            'sourceModule' => 'warehouse-transfer',
            'createdByName' => $record->creator ?? ($payload['creator'] ?? null),
            'note' => $payload['note'] ?? '',
            'status' => $record->status ?? ($payload['status'] ?? null),
            'directionLabel' => 'Chuyển kho',
            'directionTone' => 'transfer',
            'canDelete' => false,
        ];
    }

    private function itemRowFromVoucherProduct(MirrorRecord $record, array $warehouses): array
    {
        $payload = is_array($record->payload) ? $record->payload : [];
        $sourceRow = is_array($payload['source_row']['values'] ?? null) ? $payload['source_row']['values'] : [];
        $type = $this->detectVoucherType($payload + ['type' => $record->type], $record);

        $voucherRef = $record->inventory_voucher_mongo_id
            ?: ($payload['inventory_voucher_mongo_id'] ?? $payload['voucherId'] ?? $payload['code'] ?? null);
        $voucherMongoId = $this->voucherMongoIdForCode($voucherRef) ?? $voucherRef;

        // Prefer human voucher code from linked voucher when available.
        $displayBillCode = $payload['refer_code']
            ?? $payload['voucher_code']
            ?? null;
        if ($voucherMongoId) {
            $linked = $this->voucherCodeForMongoId((string) $voucherMongoId);
            if ($linked) {
                $displayBillCode = $linked;
            }
        }
        if (!$displayBillCode) {
            $displayBillCode = $voucherRef;
        }

        $branchKey = $record->branch_mongo_id ?: ($payload['warehouse_mongo_id'] ?? $payload['branch_mongo_id'] ?? null);
        $warehouseName = $this->resolveWarehouseName(
            $branchKey !== null ? (string) $branchKey : null,
            $payload,
            $sourceRow,
        );

        $productCode = $payload['prodCode']
            ?? $payload['product_code']
            ?? $payload['productCode']
            ?? $sourceRow['D']
            ?? $record->product_code
            ?? null;
        $productName = ($record->name !== null && trim((string) $record->name) !== '' ? $record->name : null)
            ?? $payload['prodName']
            ?? $payload['product_name']
            ?? $payload['productName']
            ?? $sourceRow['E']
            ?? $record->product_name
            ?? null;
        $barcode = $payload['barcode'] ?? $sourceRow['F'] ?? $record->barcode ?? null;

        $quantity = $this->amountValue(
            $payload['qty'] ?? $sourceRow['G'] ?? $record->qty ?? $payload['export_qty'] ?? $payload['import_qty'] ?? $record->amount ?? 0,
            true,
        );
        $unitPrice = $this->amountValue(
            $payload['price'] ?? $sourceRow['H'] ?? $record->unit_price ?? $payload['unit_price'] ?? $payload['currentPrice'] ?? 0,
            true,
        );
        $totalAmount = $this->amountValue(
            $payload['total_amount']
                ?? $payload['totalAmount']
                ?? $sourceRow['I']
                ?? $record->total_amount
                ?? $record->total
                ?? ($quantity * $unitPrice),
            true,
        );

        $kindLabel = $record->type ?: ($payload['type'] ?? $sourceRow['J'] ?? $payload['import_export_type'] ?? 'Không xác định');
        $directionLabel = $type === 'IMPORT' ? 'Nhập kho' : ($type === 'EXPORT' ? 'Xuất kho' : (string) $kindLabel);
        $directionTone = $type === 'IMPORT' ? 'import' : ($type === 'EXPORT' ? 'export' : 'neutral');

        return [
            'rowKey' => 'inventory-product:' . $record->mongo_id,
            'source' => 'inventory-voucher',
            'sourceId' => $voucherMongoId,
            'itemSourceId' => $record->mongo_id,
            'code' => $displayBillCode,
            'billCode' => $displayBillCode,
            'date' => $this->dateValue($payload, $record),
            'warehouseId' => $branchKey,
            'warehouseName' => $warehouseName,
            'productId' => $record->product_mongo_id ?: ($payload['product_mongo_id'] ?? $payload['productId'] ?? null),
            'productCode' => $productCode,
            'productName' => $productName,
            'barcode' => $barcode,
            'imei' => $payload['imei'] ?? null,
            'quantity' => $quantity,
            'unitPrice' => $unitPrice,
            'totalAmount' => $totalAmount,
            'type' => $type,
            'kind' => $type === 'UNKNOWN' ? (string) $kindLabel : $type,
            'kindLabel' => $kindLabel,
            'sourceModule' => 'inventory-voucher',
            'createdByName' => $record->creator ?? ($payload['creator'] ?? null),
            'note' => $payload['note'] ?? ($sourceRow['K'] ?? ''),
            'status' => $record->status,
            'directionLabel' => $directionLabel,
            'directionTone' => $directionTone,
            'canDelete' => false,
        ];
    }

    private function itemRowsFromTransfer(MirrorRecord $record, array $warehouses): array
    {
        $payload = is_array($record->payload) ? $record->payload : [];
        $lines = $payload['lines'] ?? [];
        $fromId = $payload['sourceWarehouseId']
            ?? $payload['from_branch_mongo_id']
            ?? $record->from_branch_mongo_id
            ?? null;
        $toId = $payload['destinationWarehouseId']
            ?? $payload['to_branch_mongo_id']
            ?? $record->to_branch_mongo_id
            ?? null;
        $fromName = $payload['sourceWarehouseName']
            ?? $payload['source_warehouse_name']
            ?? ($record->source_warehouse_name ?? null)
            ?? $this->resolveWarehouseName($fromId !== null ? (string) $fromId : null, $payload);
        $toName = $payload['destinationWarehouseName']
            ?? $payload['destination_warehouse_name']
            ?? ($record->destination_warehouse_name ?? null)
            ?? $this->resolveWarehouseName($toId !== null ? (string) $toId : null, $payload);
        $date = $this->dateValue($payload, $record);
        $creator = $record->creator ?? ($payload['creator'] ?? null);
        $billCode = $payload['code'] ?? $record->code ?? $record->mongo_id;

        return collect($lines)->map(function ($line, $index) use ($record, $fromId, $toId, $fromName, $toName, $date, $creator, $billCode): array {
            $qty = $this->amountValue($line['receivedQuantity'] ?? $line['dispatchedQuantity'] ?? $line['approvedQuantity'] ?? $line['requestedQuantity'] ?? 0, true);
            $unitPrice = $this->amountValue($line['unitCostSnapshot'] ?? $line['unitPrice'] ?? 0, true);

            return [
                'rowKey' => 'warehouse-transfer:' . $record->mongo_id . ':' . $index,
                'source' => 'warehouse-transfer',
                'sourceId' => $record->mongo_id,
                'itemSourceId' => $line['_id'] ?? null,
                'code' => $billCode,
                'billCode' => $billCode,
                'date' => $date,
                'fromWarehouseId' => $fromId,
                'fromWarehouseName' => $fromName,
                'toWarehouseId' => $toId,
                'toWarehouseName' => $toName,
                'productId' => $line['productId'] ?? null,
                'productCode' => $line['productCode'] ?? null,
                'productName' => $line['productName'] ?? null,
                'barcode' => $line['barcode'] ?? null,
                'imei' => $line['imei'] ?? null,
                'quantity' => $qty,
                'unitPrice' => $unitPrice,
                'totalAmount' => $this->amountValue($line['totalAmount'] ?? ($qty * $unitPrice), true),
                'type' => 'TRANSFER',
                'kind' => 'TRANSFER',
                'kindLabel' => 'Chuyển kho',
                'sourceModule' => 'warehouse-transfer',
                'createdByName' => $creator,
                'note' => $line['note'] ?? '',
                'status' => $record->status,
                'directionLabel' => 'Chuyển kho',
                'directionTone' => 'transfer',
                'canDelete' => false,
            ];
        })->all();
    }

    private function detectVoucherType(array $payload, MirrorRecord $record): string
    {
        $candidates = [
            $record->import_export_type ?? null,
            $payload['import_export_type'] ?? null,
            $payload['type'] ?? null,
            $record->type ?? null,
        ];

        foreach ($candidates as $type) {
            $raw = trim((string) $type);
            if ($raw === '') {
                continue;
            }
            $upper = mb_strtoupper($raw);
            $lower = mb_strtolower($raw);

            if ($upper === 'IMPORT' || $upper === 'TRANSFER_IMPORT' || str_starts_with($upper, 'IMPORT')) {
                return 'IMPORT';
            }
            if ($upper === 'EXPORT' || $upper === 'TRANSFER_EXPORT' || str_starts_with($upper, 'EXPORT')) {
                return 'EXPORT';
            }
            if (str_contains($lower, 'nhập') || str_contains($lower, 'nhap') || str_contains($lower, 'trả hàng') || str_contains($lower, 'tra hang')) {
                return 'IMPORT';
            }
            if (str_contains($lower, 'xuất') || str_contains($lower, 'xuat')) {
                return 'EXPORT';
            }
        }

        // Do not default unknown/missing to EXPORT (would fabricate transaction type).
        return 'UNKNOWN';
    }

    private function transferQuantity(array $payload): int
    {
        $lines = $payload['lines'] ?? [];

        return collect($lines)->sum(fn ($line): float => (float) ($line['receivedQuantity'] ?? $line['dispatchedQuantity'] ?? $line['approvedQuantity'] ?? $line['requestedQuantity'] ?? 0));
    }

    private function dateValue(array $payload, MirrorRecord $record): string
    {
        $value = $payload['date'] ?? $payload['createdAt'] ?? $record->business_date ?? $record->created_at;

        return $value ? (string) $value : '';
    }

    private function amountValue($value, bool $asNumber = false)
    {
        if ($value === null || $value === '') {
            return $asNumber ? 0 : 0;
        }
        if (is_string($value)) {
            $numeric = (float) str_replace(',', '', $value);
        } else {
            $numeric = (float) $value;
        }

        return $asNumber ? $numeric : (int) round($numeric);
    }

    private function sortTimestamp(?string $date): int
    {
        $date = trim((string) $date);
        if ($date === '') {
            return 0;
        }

        foreach (['d/m/Y', 'Y-m-d', 'd-m-Y'] as $format) {
            try {
                $parsed = Carbon::createFromFormat($format, $date);
                if ($parsed) {
                    return $parsed->startOfDay()->getTimestamp();
                }
            } catch (\Throwable) {
            }
        }

        try {
            return Carbon::parse($date)->getTimestamp();
        } catch (\Throwable) {
            return 0;
        }
    }

    private function voucherMongoIdForCode($voucherCode): ?string
    {
        $voucherCode = trim((string) $voucherCode);
        if ($voucherCode === '') {
            return null;
        }

        $cacheKey = 'id:'.$voucherCode;
        if (array_key_exists($cacheKey, $this->voucherMongoIdCache)) {
            return $this->voucherMongoIdCache[$cacheKey];
        }

        $voucher = (new MirrorRecord())->forTable('inventory_vouchers')->newQuery()
            ->where(function ($builder) use ($voucherCode): void {
                $builder->where('voucher_code', $voucherCode)
                    ->orWhere('code', $voucherCode)
                    ->orWhere('mongo_id', $voucherCode)
                    ->orWhere('refer_code', $voucherCode);
            })
            ->first(['mongo_id', 'voucher_code', 'code']);

        $this->voucherMongoIdCache[$cacheKey] = $voucher?->mongo_id;
        if ($voucher?->mongo_id) {
            $code = $voucher->voucher_code ?: $voucher->code;
            if ($code) {
                $this->voucherMongoIdCache['code:'.$voucher->mongo_id] = (string) $code;
            }
        }

        return $this->voucherMongoIdCache[$cacheKey];
    }

    private function voucherCodeForMongoId(string $mongoId): ?string
    {
        $mongoId = trim($mongoId);
        if ($mongoId === '') {
            return null;
        }

        $cacheKey = 'code:'.$mongoId;
        if (array_key_exists($cacheKey, $this->voucherMongoIdCache)) {
            return $this->voucherMongoIdCache[$cacheKey];
        }

        $voucher = (new MirrorRecord())->forTable('inventory_vouchers')->newQuery()
            ->where('mongo_id', $mongoId)
            ->first(['mongo_id', 'voucher_code', 'code']);

        $code = $voucher?->voucher_code ?: $voucher?->code;
        $this->voucherMongoIdCache[$cacheKey] = $code ? (string) $code : null;

        return $this->voucherMongoIdCache[$cacheKey];
    }

    public function show(string $source, string $sourceId): JsonResponse
    {
        if ($source === 'warehouse-transfer') {
            $record = (new MirrorRecord())->forTable('warehouse_transfers')->newQuery()
                ->where('mongo_id', $sourceId)
                ->firstOrFail();

            return response()->json($this->transferDetail($record));
        }

        $record = (new MirrorRecord())->forTable('inventory_vouchers')->newQuery()
            ->where(function ($builder) use ($sourceId): void {
                $builder->where('mongo_id', $sourceId)
                    ->orWhere('voucher_code', $sourceId)
                    ->orWhere('code', $sourceId);
            })
            ->firstOrFail();

        return response()->json($this->voucherDetail($record));
    }

    private function voucherDetail(MirrorRecord $record): array
    {
        $warehouses = $this->warehouseMap();
        $row = $this->billRowFromVoucher($record, $warehouses);
        $payload = is_array($record->payload) ? $record->payload : [];
        $voucherCode = $record->voucher_code ?: ($payload['voucher_code'] ?? $payload['voucherId'] ?? $record->code ?? $record->mongo_id);
        $items = (new MirrorRecord())->forTable('inventory_products')->newQuery()
            ->where(function ($builder) use ($voucherCode, $record): void {
                // inventory_products schema here only has inventory_voucher_mongo_id/code/payload (no refer_code column).
                $builder->where('inventory_voucher_mongo_id', $voucherCode)
                    ->orWhere('inventory_voucher_mongo_id', $record->mongo_id)
                    ->orWhere('payload->code', $voucherCode)
                    ->orWhere('code', 'like', $voucherCode.'%');
            })
            ->get()
            ->map(fn ($product) => $this->detailItemFromVoucherProduct($product))
            ->all();

        return array_merge($row, ['items' => $items]);
    }

    private function transferDetail(MirrorRecord $record): array
    {
        $warehouses = $this->warehouseMap();
        $row = $this->billRowFromTransfer($record, $warehouses);
        $payload = is_array($record->payload) ? $record->payload : [];
        $items = collect($payload['lines'] ?? [])->map(function ($line, $index): array {
            return [
                'rowKey' => 'transfer-line:' . $index,
                'productCode' => $line['productCode'] ?? '',
                'productName' => $line['productName'] ?? '',
                'barcode' => $line['barcode'] ?? '',
                'quantity' => $this->amountValue($line['receivedQuantity'] ?? $line['dispatchedQuantity'] ?? $line['approvedQuantity'] ?? $line['requestedQuantity'] ?? 0, true),
                'unitPrice' => $this->amountValue($line['unitCostSnapshot'] ?? 0, true),
                'totalAmount' => 0,
                'note' => $line['note'] ?? '',
            ];
        })->all();

        return array_merge($row, ['items' => $items]);
    }

    private function detailItemFromVoucherProduct(MirrorRecord $record): array
    {
        $payload = is_array($record->payload) ? $record->payload : [];
        $sourceRow = is_array($payload['source_row']['values'] ?? null) ? $payload['source_row']['values'] : [];
        $quantity = $this->amountValue(
            $payload['qty'] ?? $sourceRow['G'] ?? $record->qty ?? $payload['export_qty'] ?? $payload['import_qty'] ?? $record->amount ?? 0,
            true,
        );
        $unitPrice = $this->amountValue(
            $payload['price'] ?? $sourceRow['H'] ?? $record->unit_price ?? $payload['unit_price'] ?? 0,
            true,
        );

        return [
            'rowKey' => 'inventory-product:' . $record->mongo_id,
            'productCode' => $payload['prodCode']
                ?? $payload['product_code']
                ?? $payload['productCode']
                ?? $sourceRow['D']
                ?? $record->product_code
                ?? '',
            'productName' => ($record->name !== null && trim((string) $record->name) !== '' ? $record->name : null)
                ?? $payload['prodName']
                ?? $payload['product_name']
                ?? $payload['productName']
                ?? $sourceRow['E']
                ?? $record->product_name
                ?? '',
            'barcode' => $payload['barcode'] ?? $sourceRow['F'] ?? $record->barcode ?? '',
            'quantity' => $quantity,
            'unitPrice' => $unitPrice,
            'totalAmount' => $this->amountValue(
                $payload['total_amount'] ?? $payload['totalAmount'] ?? $sourceRow['I'] ?? $record->total_amount ?? $record->total ?? ($quantity * $unitPrice),
                true,
            ),
            'note' => $payload['note'] ?? ($sourceRow['K'] ?? ''),
        ];
    }

    public function destroy(Request $request, string $source, string $sourceId): JsonResponse
    {
        if ($authError = $this->requireLocalUser($request)) {
            return $authError;
        }

        try {
            $result = DB::transaction(function () use ($source, $sourceId) {
                return $this->deleteBillBySource($source, $sourceId);
            });
        } catch (\InvalidArgumentException $e) {
            return response()->json(['ok' => false, 'message' => $e->getMessage()], 422);
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json(['ok' => false, 'message' => 'Không tìm thấy phiếu cần xóa.'], 404);
        }

        return response()->json([
            'ok' => true,
            'message' => $result['message'] ?? 'Đã xóa phiếu và hoàn tác tồn kho.',
            'code' => $result['code'] ?? null,
        ]);
    }

    public function bulkDelete(Request $request): JsonResponse
    {
        if ($authError = $this->requireLocalUser($request)) {
            return $authError;
        }

        $rows = $request->input('rows', []);
        if (!is_array($rows) || $rows === []) {
            return response()->json(['ok' => false, 'message' => 'Vui lòng chọn ít nhất một phiếu.'], 422);
        }

        $deleted = [];
        $failed = [];

        try {
            DB::transaction(function () use ($rows, &$deleted, &$failed): void {
                foreach ($rows as $row) {
                    if (!is_array($row)) {
                        $failed[] = ['message' => 'Dòng xóa không hợp lệ.'];
                        continue;
                    }
                    $source = (string) ($row['source'] ?? '');
                    $sourceId = (string) ($row['sourceId'] ?? $row['source_id'] ?? '');
                    try {
                        $result = $this->deleteBillBySource($source, $sourceId);
                        $deleted[] = $result;
                    } catch (\Throwable $e) {
                        // Fail entire bulk atomically so stock never partially reverses.
                        throw new \InvalidArgumentException(
                            $e->getMessage() ?: 'Không thể xóa hàng loạt phiếu.'
                        );
                    }
                }
            });
        } catch (\InvalidArgumentException $e) {
            return response()->json([
                'ok' => false,
                'message' => $e->getMessage(),
                'deleted' => [],
                'failed' => $failed,
            ], 422);
        }

        return response()->json([
            'ok' => true,
            'message' => 'Đã xóa '.count($deleted).' phiếu và hoàn tác tồn kho.',
            'deleted' => $deleted,
        ]);
    }

    /**
     * Pure warehouse import/export vouchers may be deleted (with stock reverse).
     * Sale/refund/transfer-linked documents must be cancelled in their origin module.
     */
    private function voucherCanDelete(MirrorRecord $record, array $payload, string $type): bool
    {
        if ($type !== 'IMPORT' && $type !== 'EXPORT') {
            return false;
        }

        $label = mb_strtolower(trim((string) (
            $record->type
            ?? $payload['type']
            ?? $record->import_export_type
            ?? $payload['import_export_type']
            ?? ''
        )));

        // Business documents that must not reverse from the aggregate page.
        if ($label !== '' && preg_match('/bán|ban le|ban si|trả hàng|tra hang|đổi hàng|doi hang|sale|refund|return/u', $label)) {
            return false;
        }

        if (!empty($payload['paymentId'])
            || !empty($payload['payment_mongo_id'])
            || !empty($payload['saleId'])
            || !empty($payload['sale_payment_id'])
            || !empty($payload['refundId'])) {
            return false;
        }

        // Transfers are never deleted from this aggregate list.
        if (($payload['kind'] ?? null) === 'TRANSFER' || $type === 'TRANSFER') {
            return false;
        }

        return true;
    }

    /**
     * @return array{message: string, code: ?string}
     */
    private function deleteBillBySource(string $source, string $sourceId): array
    {
        $source = trim($source);
        $sourceId = trim($sourceId);
        if ($sourceId === '') {
            throw new \InvalidArgumentException('Thiếu mã phiếu cần xóa.');
        }

        if ($source === 'warehouse-transfer') {
            throw new \InvalidArgumentException(
                'Không xóa phiếu chuyển kho tại trang xuất nhập. Vui lòng hủy tại module Chuyển kho.'
            );
        }

        if ($source !== 'inventory-voucher') {
            throw new \InvalidArgumentException('Loại chứng từ không hỗ trợ xóa tại đây.');
        }

        $record = (new MirrorRecord())->forTable('inventory_vouchers')->newQuery()
            ->where(function ($builder) use ($sourceId): void {
                $builder->where('mongo_id', $sourceId)
                    ->orWhere('voucher_code', $sourceId)
                    ->orWhere('code', $sourceId);
            })
            ->first();

        if (!$record) {
            throw new \Illuminate\Database\Eloquent\ModelNotFoundException('Không tìm thấy phiếu.');
        }

        $payload = is_array($record->payload) ? $record->payload : [];
        $type = $this->detectVoucherType($payload, $record);
        if (!$this->voucherCanDelete($record, $payload, $type)) {
            throw new \InvalidArgumentException(
                'Phiếu liên kết nghiệp vụ gốc (bán/trả/chuyển) không được xóa tại trang xuất nhập kho.'
            );
        }

        $voucherCode = (string) ($record->voucher_code ?: ($payload['voucher_code'] ?? $payload['code'] ?? $record->code ?? $record->mongo_id));
        $this->reverseInventoryVoucherStock($record, $payload, $type);
        $this->deleteInventoryVoucherProducts($record, $voucherCode);
        $record->delete();

        return [
            'message' => 'Đã xóa phiếu '.$voucherCode.' và hoàn tác tồn kho.',
            'code' => $voucherCode,
        ];
    }

    private function reverseInventoryVoucherStock(MirrorRecord $record, array $payload, string $type): void
    {
        // Reverse of applyInventoryVoucherStock: IMPORT reverse = -qty, EXPORT reverse = +qty.
        $direction = $type === 'IMPORT' ? -1 : ($type === 'EXPORT' ? 1 : 0);
        if ($direction === 0) {
            throw new \InvalidArgumentException('Không xác định hướng hoàn tồn cho phiếu này.');
        }

        $branchKey = $record->warehouse_mongo_id
            ?? $payload['warehouse_mongo_id']
            ?? $record->branch_mongo_id
            ?? $payload['branchId']
            ?? $payload['warehouseId']
            ?? $payload['warehouse']
            ?? $record->branch_id
            ?? null;
        $branch = $this->resolveBranch($branchKey !== null ? (string) $branchKey : null)
            ?? ($record->branch_id ? Branch::query()->find($record->branch_id) : null);
        if (!$branch) {
            throw new \InvalidArgumentException('Không xác định được kho để hoàn tác tồn.');
        }

        $lines = $this->collectVoucherLinesForReverse($record, $payload);
        if ($lines === []) {
            // Empty voucher: allow delete without stock change.
            return;
        }

        foreach ($lines as $line) {
            $product = $this->resolveProduct($line['productId'] ?? null, $line['productCode'] ?? null);
            if (!$product || $product->type === 'service') {
                continue;
            }
            $qty = (float) ($line['quantity'] ?? 0);
            if ($qty <= 0) {
                continue;
            }
            $delta = $qty * $direction;
            $stock = ProductBranchStock::query()->firstOrCreate(
                ['product_id' => $product->id, 'branch_id' => $branch->id],
                ['qty' => 0, 'locked_quantity' => 0, 'mongo_id' => bin2hex(random_bytes(12))]
            );
            $current = (float) $stock->qty;
            if ($delta < 0 && $current + 1e-9 < abs($delta)) {
                throw new \InvalidArgumentException(
                    'Không thể xóa phiếu: hoàn tác tồn sản phẩm "'.($product->code ?: $product->name)
                    .'" sẽ âm (cần trừ '.abs($delta).', còn '.$current.').'
                );
            }
            $stock->forceFill(['qty' => max(0, $current + $delta)])->save();
            $product->forceFill(['qty' => (float) $product->stocks()->sum('qty')])->save();
        }
    }

    /**
     * @return list<array{productId: mixed, productCode: ?string, quantity: float}>
     */
    private function collectVoucherLinesForReverse(MirrorRecord $record, array $payload): array
    {
        $fromPayload = $payload['items'] ?? $payload['lines'] ?? $payload['products'] ?? [];
        $lines = [];
        if (is_array($fromPayload) && $fromPayload !== []) {
            foreach ($fromPayload as $line) {
                if (!is_array($line)) {
                    continue;
                }
                $rawPid = $line['productId'] ?? $line['product_id'] ?? null;
                $pid = is_array($rawPid) ? ($rawPid['_id'] ?? $rawPid['id'] ?? null) : $rawPid;
                $qty = (float) ($line['quantity'] ?? $line['amount'] ?? $line['qty'] ?? 0);
                if ($qty <= 0) {
                    continue;
                }
                $lines[] = [
                    'productId' => $pid,
                    'productCode' => $line['productCode'] ?? $line['product_code'] ?? $line['prodCode'] ?? null,
                    'quantity' => $qty,
                ];
            }
            if ($lines !== []) {
                return $lines;
            }
        }

        $voucherCode = (string) ($record->voucher_code ?: $record->code ?: $record->mongo_id);
        $products = (new MirrorRecord())->forTable('inventory_products')->newQuery()
            ->where(function ($builder) use ($record, $voucherCode): void {
                $builder->where('inventory_voucher_mongo_id', $record->mongo_id)
                    ->orWhere('inventory_voucher_mongo_id', $voucherCode)
                    ->orWhere('code', 'like', $voucherCode.'#%')
                    ->orWhere('payload->code', $voucherCode);
            })
            ->get();

        foreach ($products as $productRow) {
            $p = is_array($productRow->payload) ? $productRow->payload : [];
            $qty = (float) ($p['qty'] ?? $productRow->qty ?? $productRow->amount ?? 0);
            if ($qty <= 0) {
                continue;
            }
            $lines[] = [
                'productId' => $productRow->product_id
                    ?? $p['productId']
                    ?? $productRow->product_mongo_id
                    ?? null,
                'productCode' => $p['prodCode'] ?? $p['productCode'] ?? $productRow->product_code ?? null,
                'quantity' => $qty,
            ];
        }

        return $lines;
    }

    private function deleteInventoryVoucherProducts(MirrorRecord $record, string $voucherCode): void
    {
        $keys = array_values(array_unique(array_filter([
            (string) $record->mongo_id,
            $voucherCode,
        ], fn ($v) => $v !== null && trim((string) $v) !== '')));

        // inventory_products may not have refer_code column in this schema — only use known columns.
        (new MirrorRecord())->forTable('inventory_products')->newQuery()
            ->where(function ($builder) use ($keys, $voucherCode): void {
                if ($keys !== []) {
                    $builder->whereIn('inventory_voucher_mongo_id', $keys);
                }
                if ($voucherCode !== '') {
                    $builder->orWhere('code', 'like', $voucherCode.'#%')
                        ->orWhere('code', $voucherCode)
                        ->orWhere('payload->code', $voucherCode)
                        ->orWhere('payload->voucherId', $voucherCode);
                }
            })
            ->delete();
    }

    private function resolveProduct(mixed $id, ?string $code = null): ?Product
    {
        if ($id !== null && $id !== '') {
            $product = Product::query()->where('id', $id)->orWhere('mongo_id', (string) $id)->first();
            if ($product) {
                return $product;
            }
        }
        $code = trim((string) $code);
        if ($code !== '') {
            return Product::query()->where('code', $code)->first();
        }

        return null;
    }

    private function requireLocalUser(Request $request): ?JsonResponse
    {
        $user = LocalToken::resolve($request);
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated. Vui lòng đăng nhập lại.'], 401);
        }

        return null;
    }

    private function distinctSorted(string $table, string $column): array
    {
        $exists = \Illuminate\Support\Facades\Schema::hasColumn($table, $column);
        if (!$exists) {
            return [];
        }

        return (new MirrorRecord())->forTable($table)->newQuery()
            ->whereNotNull($column)
            ->where($column, '<>', '')
            ->distinct()
            ->pluck($column)
            ->map(fn ($value): string => trim((string) $value))
            ->filter()
            ->unique()
            ->sort(fn ($left, $right): int => strnatcasecmp($left, $right))
            ->values()
            ->all();
    }
}


