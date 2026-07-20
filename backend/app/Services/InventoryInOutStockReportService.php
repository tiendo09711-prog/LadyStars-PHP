<?php

namespace App\Services;

use App\Models\Branch;
use App\Models\MirrorRecord;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * Read-only report: Xuất nhập tồn (inventory in/out movement).
 * Aggregates over the full filtered set; table is paginated.
 */
class InventoryInOutStockReportService
{
    public const TIMEZONE = 'Asia/Ho_Chi_Minh';

    public const MAX_RANGE_DAYS = 366;

    public const PER_PAGE_OPTIONS = [20, 50, 100];

    public const SORT_FIELDS = ['date', 'billCode', 'type', 'warehouseName', 'productName', 'qtyIn', 'qtyOut'];

    public const TYPES = [
        'IMPORT' => 'Nhập',
        'EXPORT' => 'Xuất',
        'TRANSFER' => 'Chuyển kho',
    ];

    /** @var array<string, Branch>|null */
    private ?array $warehousesByMongoId = null;

    /** @var array<string, Branch>|null */
    private ?array $warehousesByNumericId = null;

    public function options(): array
    {
        $warehouses = Branch::query()
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'mongo_id', 'name', 'code'])
            ->map(fn (Branch $branch): array => [
                'value' => (string) ($branch->mongo_id ?: $branch->id),
                'label' => (string) $branch->name,
                'code' => $branch->code,
            ])
            ->values()
            ->all();

        return [
            'warehouses' => $warehouses,
            'types' => collect(self::TYPES)
                ->map(fn (string $label, string $value): array => ['value' => $value, 'label' => $label])
                ->values()
                ->all(),
            'perPageOptions' => self::PER_PAGE_OPTIONS,
            'timezone' => self::TIMEZONE,
            'currency' => 'VND',
            'maxRangeDays' => self::MAX_RANGE_DAYS,
            'sortFields' => self::SORT_FIELDS,
            'capabilities' => [
                'valueMetrics' => true,
                'transferLines' => true,
                'exportAll' => true,
            ],
        ];
    }

    public function report(array $query): array
    {
        $filters = $this->normalizeFilters($query);
        $rows = $this->buildRows($filters);

        $summary = $this->buildSummary($rows);
        $timeline = $this->buildTimeline($rows, $filters['fromDate'], $filters['toDate']);
        $byType = $this->buildTypeBreakdown($rows);

        $sorted = $this->sortRows($rows, $filters['sortBy'], $filters['sortDir']);
        $total = $sorted->count();
        $page = $filters['page'];
        $perPage = $filters['perPage'];
        $offset = ($page - 1) * $perPage;
        $pageRows = $sorted->slice($offset, $perPage)->values()->all();

        return [
            'filters' => $filters,
            'summary' => $summary,
            'timeline' => $timeline,
            'breakdowns' => [
                'byType' => $byType,
            ],
            'table' => [
                'data' => $pageRows,
                'totals' => [
                    'qtyIn' => $summary['totalIn'],
                    'qtyOut' => $summary['totalOut'],
                    'netQty' => $summary['netQty'],
                    'lineCount' => $summary['lineCount'],
                    'valueIn' => $summary['valueIn'],
                    'valueOut' => $summary['valueOut'],
                ],
                'pagination' => [
                    'page' => $page,
                    'perPage' => $perPage,
                    'total' => $total,
                    'totalPages' => max((int) ceil($total / max($perPage, 1)), 1),
                ],
            ],
            'meta' => [
                'generatedAt' => Carbon::now(self::TIMEZONE)->toIso8601String(),
                'timezone' => self::TIMEZONE,
                'currency' => 'VND',
                'capabilities' => [
                    'valueMetrics' => true,
                    'transferLines' => true,
                    'exportAll' => true,
                ],
            ],
        ];
    }

    /**
     * Full filtered rows for export (no pagination).
     *
     * @return array{filters: array<string, mixed>, rows: list<array<string, mixed>>}
     */
    public function exportRows(array $query): array
    {
        $filters = $this->normalizeFilters($query);
        $rows = $this->buildRows($filters);
        $sorted = $this->sortRows($rows, $filters['sortBy'], $filters['sortDir']);

        return [
            'filters' => $filters,
            'rows' => $sorted->values()->all(),
        ];
    }

    private function normalizeFilters(array $query): array
    {
        $fromDate = trim((string) ($query['fromDate'] ?? $query['from'] ?? ''));
        $toDate = trim((string) ($query['toDate'] ?? $query['to'] ?? ''));

        if ($fromDate === '' || $toDate === '') {
            $to = Carbon::now(self::TIMEZONE)->startOfDay();
            $from = $to->copy()->subDays(29);
            $fromDate = $from->format('Y-m-d');
            $toDate = $to->format('Y-m-d');
        }

        $fromKey = $this->normalizeDateKey($fromDate);
        $toKey = $this->normalizeDateKey($toDate);
        if ($fromKey === null || $toKey === null) {
            throw ValidationException::withMessages([
                'fromDate' => ['Định dạng ngày không hợp lệ. Dùng YYYY-MM-DD.'],
            ]);
        }
        if ($fromKey > $toKey) {
            throw ValidationException::withMessages([
                'fromDate' => ['Từ ngày không được sau Đến ngày.'],
            ]);
        }

        $fromCarbon = Carbon::createFromFormat('Y-m-d', $fromKey, self::TIMEZONE)->startOfDay();
        $toCarbon = Carbon::createFromFormat('Y-m-d', $toKey, self::TIMEZONE)->endOfDay();
        $rangeDays = $fromCarbon->diffInDays($toCarbon) + 1;
        if ($rangeDays > self::MAX_RANGE_DAYS) {
            throw ValidationException::withMessages([
                'fromDate' => ['Khoảng ngày tối đa là '.self::MAX_RANGE_DAYS.' ngày.'],
            ]);
        }

        $type = strtoupper(trim((string) ($query['type'] ?? '')));
        if ($type !== '' && !array_key_exists($type, self::TYPES)) {
            throw ValidationException::withMessages([
                'type' => ['Loại giao dịch không hợp lệ.'],
            ]);
        }

        $sortBy = trim((string) ($query['sortBy'] ?? $query['sort'] ?? 'date'));
        if (!in_array($sortBy, self::SORT_FIELDS, true)) {
            $sortBy = 'date';
        }
        $sortDir = strtolower(trim((string) ($query['sortDir'] ?? $query['order'] ?? 'desc'))) === 'asc' ? 'asc' : 'desc';
        $page = max((int) ($query['page'] ?? 1), 1);
        $perPage = (int) ($query['perPage'] ?? $query['limit'] ?? 20);
        if ($perPage < 1) {
            $perPage = 20;
        }
        $perPage = min($perPage, 100);

        $q = trim((string) ($query['q'] ?? $query['keyword'] ?? $query['productKeyword'] ?? ''));
        $warehouseId = trim((string) ($query['warehouseId'] ?? $query['branchId'] ?? ''));

        return [
            'fromDate' => $fromKey,
            'toDate' => $toKey,
            'warehouseId' => $warehouseId,
            'type' => $type,
            'q' => $q,
            'page' => $page,
            'perPage' => $perPage,
            'sortBy' => $sortBy,
            'sortDir' => $sortDir,
        ];
    }

    private function normalizeDateKey(string $value): ?string
    {
        $value = trim($value);
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) === 1) {
            return $value;
        }
        try {
            return Carbon::parse($value, self::TIMEZONE)->format('Y-m-d');
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    private function buildRows(array $filters): Collection
    {
        $rows = collect();

        if ($filters['type'] === '' || $filters['type'] === 'IMPORT' || $filters['type'] === 'EXPORT') {
            $rows = $rows->concat($this->voucherProductRows($filters));
        }
        if ($filters['type'] === '' || $filters['type'] === 'TRANSFER') {
            $rows = $rows->concat($this->transferLineRows($filters));
        }

        if ($filters['q'] !== '') {
            $needle = mb_strtolower($filters['q']);
            $rows = $rows->filter(function (array $row) use ($needle): bool {
                $hay = mb_strtolower(implode(' ', array_filter([
                    (string) ($row['billCode'] ?? ''),
                    (string) ($row['productCode'] ?? ''),
                    (string) ($row['productName'] ?? ''),
                    (string) ($row['barcode'] ?? ''),
                ])));

                return str_contains($hay, $needle);
            });
        }

        return $rows->values();
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    private function voucherProductRows(array $filters): Collection
    {
        $query = (new MirrorRecord())->forTable('inventory_products')->newQuery();
        $this->applyDateFilter($query, $filters);
        $this->applyWarehouseFilterProduct($query, $filters['warehouseId']);

        if ($filters['type'] === 'IMPORT' || $filters['type'] === 'EXPORT') {
            $this->applyTypeFilter($query, $filters['type']);
        }

        if ($filters['q'] !== '') {
            $keyword = $filters['q'];
            $query->where(function ($builder) use ($keyword): void {
                $builder->where('name', 'like', "%{$keyword}%")
                    ->orWhere('code', 'like', "%{$keyword}%")
                    ->orWhere('payload->prodName', 'like', "%{$keyword}%")
                    ->orWhere('payload->prodCode', 'like', "%{$keyword}%")
                    ->orWhere('payload->product_name', 'like', "%{$keyword}%")
                    ->orWhere('payload->product_code', 'like', "%{$keyword}%")
                    ->orWhere('payload->barcode', 'like', "%{$keyword}%")
                    ->orWhere('inventory_voucher_mongo_id', 'like', "%{$keyword}%")
                    ->orWhere('payload', 'like', "%{$keyword}%");
            });
        }

        return $query->orderByDesc('business_date')->orderByDesc('id')->get()
            ->map(fn (MirrorRecord $record): array => $this->mapVoucherProductRow($record))
            ->filter(function (array $row) use ($filters): bool {
                if ($filters['type'] === 'IMPORT' && $row['type'] !== 'IMPORT') {
                    return false;
                }
                if ($filters['type'] === 'EXPORT' && $row['type'] !== 'EXPORT') {
                    return false;
                }

                return true;
            })
            ->values();
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    private function transferLineRows(array $filters): Collection
    {
        $query = (new MirrorRecord())->forTable('warehouse_transfers')->newQuery();
        $this->applyDateFilter($query, $filters);
        $this->applyWarehouseFilterTransfer($query, $filters['warehouseId']);

        if ($filters['q'] !== '') {
            $keyword = $filters['q'];
            $query->where(function ($builder) use ($keyword): void {
                $builder->where('code', 'like', "%{$keyword}%")
                    ->orWhere('mongo_id', $keyword)
                    ->orWhere('name', 'like', "%{$keyword}%")
                    ->orWhere('payload', 'like', "%{$keyword}%");
            });
        }

        $rows = collect();
        foreach ($query->orderByDesc('business_date')->orderByDesc('id')->get() as $record) {
            foreach ($this->mapTransferLines($record) as $line) {
                $rows->push($line);
            }
        }

        return $rows->values();
    }

    private function applyDateFilter($query, array $filters): void
    {
        $from = Carbon::createFromFormat('Y-m-d', $filters['fromDate'], self::TIMEZONE)->startOfDay();
        $to = Carbon::createFromFormat('Y-m-d', $filters['toDate'], self::TIMEZONE)->endOfDay();
        $query->where('business_date', '>=', $from)->where('business_date', '<=', $to);
    }

    private function applyWarehouseFilterProduct($query, string $warehouseId): void
    {
        if ($warehouseId === '') {
            return;
        }
        $keys = $this->warehouseKeys($warehouseId);
        $name = $this->resolveBranch($warehouseId)?->name ?? '';
        // inventory_products has branch_mongo_id / branch_id / warehouse_name (no warehouse_mongo_id column).
        $query->where(function ($builder) use ($keys, $name): void {
            if ($keys !== []) {
                $builder->whereIn('branch_mongo_id', $keys);
                $numericKeys = array_values(array_filter($keys, static fn ($key) => is_numeric($key)));
                if ($numericKeys !== []) {
                    $builder->orWhereIn('branch_id', $numericKeys);
                }
            }
            if ($name !== '') {
                $builder->orWhere('warehouse_name', $name)
                    ->orWhere('payload->source_row->values->C', $name);
            }
        });
    }

    private function applyWarehouseFilterTransfer($query, string $warehouseId): void
    {
        if ($warehouseId === '') {
            return;
        }
        $keys = $this->warehouseKeys($warehouseId);
        if ($keys === []) {
            $query->whereRaw('1 = 0');

            return;
        }
        $query->where(function ($builder) use ($keys): void {
            foreach ($keys as $key) {
                $builder->orWhere('from_branch_mongo_id', $key)
                    ->orWhere('to_branch_mongo_id', $key)
                    ->orWhere('from_branch_id', $key)
                    ->orWhere('to_branch_id', $key);
            }
        });
    }

    private function applyTypeFilter($query, string $type): void
    {
        $patterns = match ($type) {
            'IMPORT' => ['IMPORT%', 'Import%', 'Nhập%', 'nhập%', 'NHẬP%', '%trả hàng%', '%tra hang%'],
            'EXPORT' => ['EXPORT%', 'Export%', 'Xuất%', 'xuất%', 'XUẤT%'],
            default => [],
        };
        $table = method_exists($query, 'getModel') ? $query->getModel()->getTable() : 'inventory_products';
        $hasImportExportType = Schema::hasColumn($table, 'import_export_type');

        $query->where(function ($builder) use ($type, $patterns, $hasImportExportType): void {
            $builder->where('type', $type);
            if ($hasImportExportType) {
                $builder->orWhere('import_export_type', $type);
            }
            foreach ($patterns as $pattern) {
                $builder->orWhere('type', 'like', $pattern);
                if ($hasImportExportType) {
                    $builder->orWhere('import_export_type', 'like', $pattern);
                }
            }
            // Payload type for rows where column type is sparse.
            $builder->orWhere('payload->type', $type)
                ->orWhere('payload->import_export_type', $type);
        });
    }

    /** @return list<string> */
    private function warehouseKeys(string $warehouseId): array
    {
        $branch = $this->resolveBranch($warehouseId);
        $keys = array_filter([
            $warehouseId,
            $branch?->mongo_id ? (string) $branch->mongo_id : null,
            $branch ? (string) $branch->id : null,
        ]);

        return array_values(array_unique($keys));
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

    private function warehouseMap(): void
    {
        if ($this->warehousesByMongoId !== null) {
            return;
        }
        $branches = Branch::query()->orderBy('name')->get(['id', 'mongo_id', 'name', 'code']);
        $this->warehousesByMongoId = $branches
            ->filter(fn ($b) => $b->mongo_id !== null && $b->mongo_id !== '')
            ->keyBy(fn ($b) => (string) $b->mongo_id)
            ->all();
        $this->warehousesByNumericId = $branches
            ->keyBy(fn ($b) => (string) $b->id)
            ->all();
    }

    private function mapVoucherProductRow(MirrorRecord $record): array
    {
        $payload = is_array($record->payload) ? $record->payload : [];
        $sourceRow = is_array($payload['source_row']['values'] ?? null) ? $payload['source_row']['values'] : [];
        $type = $this->detectVoucherType($payload, $record);
        $qty = $this->num($payload['qty'] ?? $sourceRow['G'] ?? $record->qty ?? $payload['export_qty'] ?? $payload['import_qty'] ?? 0);
        $unitPrice = $this->num($payload['price'] ?? $sourceRow['H'] ?? $record->unit_price ?? $payload['unit_price'] ?? 0);
        $totalAmount = $this->num(
            $payload['total_amount'] ?? $payload['totalAmount'] ?? $sourceRow['I'] ?? $record->total_amount ?? ($qty * $unitPrice)
        );
        $branchKey = $record->branch_mongo_id ?: ($payload['warehouse_mongo_id'] ?? $payload['branch_mongo_id'] ?? null);
        $warehouseName = $record->warehouse_name
            ?: ($payload['warehouse_name'] ?? $payload['warehouseName'] ?? null)
            ?: $this->resolveBranch($branchKey !== null ? (string) $branchKey : null)?->name;

        $billCode = $payload['refer_code']
            ?? $payload['voucher_code']
            ?? $record->inventory_voucher_mongo_id
            ?? $payload['code']
            ?? $record->code
            ?? $record->mongo_id;

        $productCode = $payload['prodCode'] ?? $payload['product_code'] ?? $payload['productCode'] ?? $sourceRow['D'] ?? $record->product_code ?? null;
        $productName = (trim((string) ($record->name ?? '')) !== '' ? $record->name : null)
            ?? $payload['prodName']
            ?? $payload['product_name']
            ?? $payload['productName']
            ?? $sourceRow['E']
            ?? null;

        $qtyIn = $type === 'IMPORT' ? abs($qty) : 0.0;
        $qtyOut = $type === 'EXPORT' ? abs($qty) : 0.0;
        $valueIn = $type === 'IMPORT' ? abs($totalAmount) : 0.0;
        $valueOut = $type === 'EXPORT' ? abs($totalAmount) : 0.0;

        // Prefer voucher mongo id for detail API; fall back to human codes used by show().
        $sourceId = $this->firstNonEmptyString([
            $record->inventory_voucher_mongo_id ?? null,
            $payload['inventory_voucher_mongo_id'] ?? null,
            $payload['voucher_mongo_id'] ?? null,
            $payload['voucherId'] ?? null,
            $payload['voucher_code'] ?? null,
            $payload['refer_code'] ?? null,
            $billCode !== null && (string) $billCode !== (string) ($record->mongo_id ?? '') ? $billCode : null,
        ]);

        return [
            'id' => 'ip:'.$record->mongo_id,
            'date' => $this->dateString($payload, $record),
            'billCode' => (string) $billCode,
            'type' => $type,
            'typeLabel' => self::TYPES[$type] ?? ($type === 'UNKNOWN' ? 'Không xác định' : $type),
            'warehouseId' => $branchKey !== null ? (string) $branchKey : null,
            'warehouseName' => $warehouseName,
            'productCode' => $productCode !== null ? (string) $productCode : null,
            'productName' => $productName !== null ? (string) $productName : null,
            'barcode' => isset($payload['barcode']) ? (string) $payload['barcode'] : null,
            'qtyIn' => $qtyIn,
            'qtyOut' => $qtyOut,
            'netQty' => $qtyIn - $qtyOut,
            'valueIn' => $valueIn,
            'valueOut' => $valueOut,
            'unitPrice' => $unitPrice,
            'createdByName' => $record->creator ?? ($payload['creator'] ?? null),
            'source' => 'inventory-voucher',
            'sourceId' => $sourceId,
            // No dedicated voucher detail route; FE opens modal via transactions bills API.
            'detailPath' => $sourceId ? '/warehouse/transactions?source=inventory-voucher&sourceId='.rawurlencode($sourceId) : null,
        ];
    }

    /** @param  list<mixed>  $candidates */
    private function firstNonEmptyString(array $candidates): ?string
    {
        foreach ($candidates as $value) {
            if ($value === null) {
                continue;
            }
            $text = trim((string) $value);
            if ($text !== '') {
                return $text;
            }
        }

        return null;
    }

    /** @return list<array<string, mixed>> */
    private function mapTransferLines(MirrorRecord $record): array
    {
        $payload = is_array($record->payload) ? $record->payload : [];
        $lines = is_array($payload['lines'] ?? null) ? $payload['lines'] : [];
        $fromId = $payload['sourceWarehouseId'] ?? $payload['from_branch_mongo_id'] ?? $record->from_branch_mongo_id ?? null;
        $toId = $payload['destinationWarehouseId'] ?? $payload['to_branch_mongo_id'] ?? $record->to_branch_mongo_id ?? null;
        $fromName = $payload['sourceWarehouseName']
            ?? $payload['source_warehouse_name']
            ?? ($record->source_warehouse_name ?? null)
            ?? $this->resolveBranch($fromId !== null ? (string) $fromId : null)?->name;
        $toName = $payload['destinationWarehouseName']
            ?? $payload['destination_warehouse_name']
            ?? ($record->destination_warehouse_name ?? null)
            ?? $this->resolveBranch($toId !== null ? (string) $toId : null)?->name;
        $date = $this->dateString($payload, $record);
        $billCode = $payload['code'] ?? $record->code ?? $record->mongo_id;
        $creator = $record->creator ?? ($payload['creator'] ?? null);

        if ($lines === []) {
            $qty = $this->num($payload['qty'] ?? 0);

            return [[
                'id' => 'tf:'.$record->mongo_id.':0',
                'date' => $date,
                'billCode' => (string) $billCode,
                'type' => 'TRANSFER',
                'typeLabel' => self::TYPES['TRANSFER'],
                'warehouseId' => $fromId !== null ? (string) $fromId : null,
                'warehouseName' => trim(($fromName ?: '—').' → '.($toName ?: '—')),
                'productCode' => null,
                'productName' => null,
                'barcode' => null,
                'qtyIn' => 0.0,
                'qtyOut' => abs($qty),
                'netQty' => -abs($qty),
                'valueIn' => 0.0,
                'valueOut' => 0.0,
                'unitPrice' => 0.0,
                'createdByName' => $creator,
                'source' => 'warehouse-transfer',
                'sourceId' => $record->mongo_id,
                'detailPath' => $record->mongo_id ? '/warehouse/transfers/'.$record->mongo_id : null,
            ]];
        }

        $mapped = [];
        foreach ($lines as $index => $line) {
            if (!is_array($line)) {
                continue;
            }
            $qty = abs($this->num(
                $line['receivedQuantity']
                ?? $line['dispatchedQuantity']
                ?? $line['approvedQuantity']
                ?? $line['requestedQuantity']
                ?? 0
            ));
            $unitPrice = $this->num($line['unitCostSnapshot'] ?? $line['unitPrice'] ?? 0);
            $mapped[] = [
                'id' => 'tf:'.$record->mongo_id.':'.$index,
                'date' => $date,
                'billCode' => (string) $billCode,
                'type' => 'TRANSFER',
                'typeLabel' => self::TYPES['TRANSFER'],
                'warehouseId' => $fromId !== null ? (string) $fromId : null,
                'warehouseName' => trim(($fromName ?: '—').' → '.($toName ?: '—')),
                'productCode' => isset($line['productCode']) ? (string) $line['productCode'] : null,
                'productName' => isset($line['productName']) ? (string) $line['productName'] : null,
                'barcode' => isset($line['barcode']) ? (string) $line['barcode'] : null,
                // Transfer is stock leaving source; report as outbound movement.
                'qtyIn' => 0.0,
                'qtyOut' => $qty,
                'netQty' => -$qty,
                'valueIn' => 0.0,
                'valueOut' => abs($qty * $unitPrice),
                'unitPrice' => $unitPrice,
                'createdByName' => $creator,
                'source' => 'warehouse-transfer',
                'sourceId' => $record->mongo_id,
                'detailPath' => $record->mongo_id ? '/warehouse/transfers/'.$record->mongo_id : null,
            ];
        }

        return $mapped;
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
            if ($upper === 'IMPORT' || str_starts_with($upper, 'IMPORT')) {
                return 'IMPORT';
            }
            if ($upper === 'EXPORT' || str_starts_with($upper, 'EXPORT')) {
                return 'EXPORT';
            }
            if (str_contains($lower, 'nhập') || str_contains($lower, 'nhap') || str_contains($lower, 'trả hàng') || str_contains($lower, 'tra hang')) {
                return 'IMPORT';
            }
            if (str_contains($lower, 'xuất') || str_contains($lower, 'xuat')) {
                return 'EXPORT';
            }
        }

        return 'UNKNOWN';
    }

    private function dateString(array $payload, MirrorRecord $record): string
    {
        $value = $payload['date'] ?? $payload['createdAt'] ?? $record->business_date ?? $record->created_at;
        if (!$value) {
            return '';
        }
        try {
            return Carbon::parse($value, self::TIMEZONE)->format('Y-m-d H:i:s');
        } catch (\Throwable) {
            return (string) $value;
        }
    }

    private function num(mixed $value): float
    {
        if ($value === null || $value === '') {
            return 0.0;
        }
        if (is_string($value)) {
            return (float) str_replace(',', '', $value);
        }

        return (float) $value;
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return array<string, float|int>
     */
    private function buildSummary(Collection $rows): array
    {
        $totalIn = (float) $rows->sum(fn (array $r) => (float) ($r['qtyIn'] ?? 0));
        $totalOut = (float) $rows->sum(fn (array $r) => (float) ($r['qtyOut'] ?? 0));
        $valueIn = (float) $rows->sum(fn (array $r) => (float) ($r['valueIn'] ?? 0));
        $valueOut = (float) $rows->sum(fn (array $r) => (float) ($r['valueOut'] ?? 0));
        $bills = $rows->pluck('billCode')->filter()->unique()->count();

        return [
            'totalIn' => $totalIn,
            'totalOut' => $totalOut,
            'netQty' => $totalIn - $totalOut,
            'lineCount' => $rows->count(),
            'documentCount' => $bills,
            'valueIn' => $valueIn,
            'valueOut' => $valueOut,
        ];
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return list<array<string, mixed>>
     */
    private function buildTimeline(Collection $rows, string $fromDate, string $toDate): array
    {
        $cursor = Carbon::createFromFormat('Y-m-d', $fromDate, self::TIMEZONE)->startOfDay();
        $end = Carbon::createFromFormat('Y-m-d', $toDate, self::TIMEZONE)->startOfDay();
        $bucket = [];
        while ($cursor->lte($end)) {
            $key = $cursor->format('Y-m-d');
            $bucket[$key] = [
                'key' => $key,
                'label' => $cursor->format('d/m'),
                'periodKey' => $key,
                'qtyIn' => 0.0,
                'qtyOut' => 0.0,
                'netQty' => 0.0,
                'lineCount' => 0,
            ];
            $cursor->addDay();
        }

        foreach ($rows as $row) {
            $date = (string) ($row['date'] ?? '');
            $day = strlen($date) >= 10 ? substr($date, 0, 10) : '';
            if ($day === '' || !isset($bucket[$day])) {
                continue;
            }
            $bucket[$day]['qtyIn'] += (float) ($row['qtyIn'] ?? 0);
            $bucket[$day]['qtyOut'] += (float) ($row['qtyOut'] ?? 0);
            $bucket[$day]['netQty'] = $bucket[$day]['qtyIn'] - $bucket[$day]['qtyOut'];
            $bucket[$day]['lineCount'] += 1;
        }

        return array_values($bucket);
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return list<array<string, mixed>>
     */
    private function buildTypeBreakdown(Collection $rows): array
    {
        $groups = [
            'IMPORT' => ['type' => 'IMPORT', 'label' => self::TYPES['IMPORT'], 'qtyIn' => 0.0, 'qtyOut' => 0.0, 'lineCount' => 0],
            'EXPORT' => ['type' => 'EXPORT', 'label' => self::TYPES['EXPORT'], 'qtyIn' => 0.0, 'qtyOut' => 0.0, 'lineCount' => 0],
            'TRANSFER' => ['type' => 'TRANSFER', 'label' => self::TYPES['TRANSFER'], 'qtyIn' => 0.0, 'qtyOut' => 0.0, 'lineCount' => 0],
            'UNKNOWN' => ['type' => 'UNKNOWN', 'label' => 'Không xác định', 'qtyIn' => 0.0, 'qtyOut' => 0.0, 'lineCount' => 0],
        ];

        foreach ($rows as $row) {
            $type = (string) ($row['type'] ?? 'UNKNOWN');
            if (!isset($groups[$type])) {
                $type = 'UNKNOWN';
            }
            $groups[$type]['qtyIn'] += (float) ($row['qtyIn'] ?? 0);
            $groups[$type]['qtyOut'] += (float) ($row['qtyOut'] ?? 0);
            $groups[$type]['lineCount'] += 1;
        }

        return array_values(array_filter($groups, fn (array $g): bool => $g['lineCount'] > 0));
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return Collection<int, array<string, mixed>>
     */
    private function sortRows(Collection $rows, string $sortBy, string $sortDir): Collection
    {
        $sorted = $rows->sortBy(function (array $row) use ($sortBy) {
            $value = $row[$sortBy] ?? null;
            if (is_numeric($value)) {
                return (float) $value;
            }

            return mb_strtolower((string) $value);
        }, SORT_REGULAR, $sortDir === 'desc');

        return $sorted->values();
    }
}
