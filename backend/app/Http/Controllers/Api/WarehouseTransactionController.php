<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\MirrorRecord;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class WarehouseTransactionController extends Controller
{
    private const LIMIT = 20;
    private const MAX_LIMIT = 5000;

    private function warehouseMap(): array
    {
        return Branch::query()
            ->orderBy('name')
            ->get(['mongo_id', 'name', 'code'])
            ->filter(fn ($branch) => $branch->mongo_id !== null)
            ->keyBy('mongo_id')
            ->all();
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

        $kinds = collect([
            'IMPORT' => 'Nhập kho',
            'EXPORT' => 'Xuất kho',
            'TRANSFER' => 'Chuyển kho',
        ])->merge(collect($voucherTypes)->mapWithKeys(fn ($type): array => [$type => $type]))
            ->unique()
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
        $tab = $tab === 'items' ? 'items' : 'bills';
        $warehouses = $this->warehouseMap();
        $rows = $tab === 'bills'
            ? $this->buildBillRows($request, $warehouses)
            : $this->buildItemRows($request, $warehouses);

        $total = $rows->count();
        $limit = (int) min(max((int) $request->query('limit', $request->query('perPage', self::LIMIT)), 1), self::MAX_LIMIT);
        $page = max((int) $request->query('page', 1), 1);
        $items = $rows
            ->forPage($page, $limit)
            ->values()
            ->all();

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

    private function buildBillRows(Request $request, array $warehouses)
    {
        $filters = $this->filters($request);
        $vouchers = $this->queryVouchers($filters, $warehouses, false)
            ->map(fn ($row) => $this->billRowFromVoucher($row, $warehouses));
        $transfers = $this->queryTransfers($filters, $warehouses, false)
            ->map(fn ($row) => $this->billRowFromTransfer($row, $warehouses));

        return $vouchers->concat($transfers)
            ->sortByDesc('date')
            ->values();
    }

    private function buildItemRows(Request $request, array $warehouses)
    {
        $filters = $this->filters($request);
        $products = $this->queryVoucherProducts($filters, $warehouses)
            ->map(fn ($row) => $this->itemRowFromVoucherProduct($row, $warehouses));
        $transferLines = $this->queryTransfers($filters, $warehouses, false)
            ->flatMap(fn ($row) => $this->itemRowsFromTransfer($row, $warehouses));

        return $products->concat($transferLines)
            ->sortByDesc('date')
            ->values();
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
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function queryVouchers(array $filters, array $warehouses, bool $byId)
    {
        $query = (new MirrorRecord())->forTable('inventory_vouchers')->newQuery();
        $this->applyDateFilter($query, $filters);

        if ($filters['warehouseId'] !== '') {
            $query->where('warehouse_mongo_id', $filters['warehouseId']);
        }
        if ($filters['billId'] !== '') {
            $keyword = $filters['billId'];
            $query->where(function ($q) use ($keyword): void {
                $q->where('voucher_code', 'like', "%{$keyword}%")
                    ->orWhere('code', 'like', "%{$keyword}%")
                    ->orWhere('mongo_id', $keyword);
            });
        }
        if ($filters['type'] !== '' && $filters['type'] !== 'TRANSFER') {
            $query->where('import_export_type', 'like', $this->typeKeyword($filters['type']));
        }
        if ($filters['kind'] !== '' && $filters['kind'] !== 'TRANSFER') {
            $query->where(function ($q) use ($filters): void {
                $q->where('type', $filters['kind'])
                    ->orWhere('import_export_type', $filters['kind']);
            });
        }

        return $query->orderByDesc('business_date')->get();
    }

    private function queryTransfers(array $filters, array $warehouses, bool $byId)
    {
        $query = (new MirrorRecord())->forTable('warehouse_transfers')->newQuery();
        $this->applyDateFilter($query, $filters);

        if ($filters['warehouseId'] !== '') {
            $warehouseId = $filters['warehouseId'];
            $query->where(function ($q) use ($warehouseId): void {
                $q->where('from_branch_mongo_id', $warehouseId)
                    ->orWhere('to_branch_mongo_id', $warehouseId);
            });
        }
        if ($filters['billId'] !== '') {
            $keyword = $filters['billId'];
            $query->where(function ($q) use ($keyword): void {
                $q->where('code', 'like', "%{$keyword}%")
                    ->orWhere('mongo_id', $keyword);
            });
        }
        if ($filters['type'] !== '' && $filters['type'] !== 'IMPORT' && $filters['type'] !== 'EXPORT') {
            // TRANSFER filter leaves transfers in scope.
        } else {
            // No voucher-specific type filter excludes transfers only if type/kind set to voucher values.
            if ($filters['type'] !== '' || $filters['kind'] !== '') {
                $query->whereRaw('1=0');
            }
        }

        return $query->orderByDesc('business_date')->get();
    }

    private function queryVoucherProducts(array $filters, array $warehouses)
    {
        $query = (new MirrorRecord())->forTable('inventory_products')->newQuery();
        $this->applyDateFilter($query, $filters);

        if ($filters['warehouseId'] !== '') {
            $query->where('branch_mongo_id', $filters['warehouseId']);
        }
        if ($filters['productKeyword'] !== '') {
            $keyword = $filters['productKeyword'];
            $query->where(function ($q) use ($keyword): void {
                $q->where('product_name', 'like', "%{$keyword}%")
                    ->orWhere('product_code', 'like', "%{$keyword}%")
                    ->orWhere('barcode', 'like', "%{$keyword}%");
            });
        }
        if ($filters['type'] !== '' && $filters['type'] !== 'TRANSFER') {
            $query->where('type', 'like', $this->typeKeyword($filters['type']));
        }
        if ($filters['kind'] !== '' && $filters['kind'] !== 'TRANSFER') {
            $query->where('type', $filters['kind']);
        }
        if ($filters['billId'] !== '') {
            $keyword = $filters['billId'];
            $query->where(function ($q) use ($keyword): void {
                $q->where('inventory_voucher_mongo_id', $keyword)
                    ->orWhere('refer_code', 'like', "%{$keyword}%");
            });
        }

        return $query->orderByDesc('business_date')->get();
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
        $warehouseName = $payload['warehouse_name'] ?? $record->name ?? null;
        $warehouseId = $payload['warehouse_mongo_id'] ?? $record->warehouse_mongo_id ?? null;

        return [
            'rowKey' => 'inventory-voucher:' . $record->mongo_id,
            'source' => 'inventory-voucher',
            'sourceId' => $record->mongo_id,
            'code' => $payload['voucher_code'] ?? $payload['code'] ?? $record->code ?? null,
            'billCode' => $payload['voucher_code'] ?? null,
            'date' => $this->dateValue($payload, $record),
            'warehouseId' => $warehouseId,
            'warehouseName' => $warehouseName,
            'totalProductLines' => (int) ($payload['sp_count'] ?? $payload['spCount'] ?? 0),
            'totalQuantity' => (int) ($payload['qty'] ?? 0),
            'totalAmount' => $this->amountValue($payload['total_amount'] ?? $payload['totalAmount'] ?? $record->total_amount ?? $payload['total'] ?? null),
            'type' => $type,
            'kind' => $type,
            'kindLabel' => $payload['type'] ?? $payload['import_export_type'] ?? $record->type ?? 'Phiếu xuất nhập',
            'sourceModule' => 'inventory-voucher',
            'createdByName' => $record->creator ?? ($payload['creator'] ?? null),
            'customerName' => $payload['customer_name'] ?? $payload['customer'] ?? null,
            'customerPhone' => $payload['customer_phone'] ?? null,
            'relatedCode' => $payload['refer_code'] ?? null,
            'note' => $payload['note'] ?? '',
            'status' => $record->status,
            'directionLabel' => $type === 'IMPORT' ? 'Nhập kho' : 'Xuất kho',
            'directionTone' => $type === 'IMPORT' ? 'import' : 'export',
            'canDelete' => false,
        ];
    }

    private function billRowFromTransfer(MirrorRecord $record, array $warehouses): array
    {
        $payload = is_array($record->payload) ? $record->payload : [];
        $fromId = $payload['from_branch_mongo_id'] ?? $record->from_branch_mongo_id ?? null;
        $toId = $payload['to_branch_mongo_id'] ?? $record->to_branch_mongo_id ?? null;

        return [
            'rowKey' => 'warehouse-transfer:' . $record->mongo_id,
            'source' => 'warehouse-transfer',
            'sourceId' => $record->mongo_id,
            'code' => $payload['code'] ?? $record->code ?? $record->mongo_id,
            'billCode' => $payload['code'] ?? $record->code ?? null,
            'date' => $this->dateValue($payload, $record),
            'fromWarehouseId' => $fromId,
            'fromWarehouseName' => $payload['source_warehouse_name'] ?? ($warehouses[$fromId] ?? null)?->name,
            'toWarehouseId' => $toId,
            'toWarehouseName' => $payload['destination_warehouse_name'] ?? ($warehouses[$toId] ?? null)?->name,
            'totalProductLines' => (int) ($payload['sp_count'] ?? count($payload['lines'] ?? [])),
            'totalQuantity' => (int) ($payload['qty'] ?? $this->transferQuantity($payload)),
            'totalAmount' => $this->amountValue($payload['total_amount'] ?? $payload['totalAmount'] ?? $record->total_amount ?? null),
            'type' => 'TRANSFER',
            'kind' => 'TRANSFER',
            'kindLabel' => $payload['type'] ?? 'Chuyển kho',
            'sourceModule' => 'warehouse-transfer',
            'createdByName' => $payload['creator'] ?? null,
            'note' => $payload['note'] ?? '',
            'status' => $record->status,
            'directionLabel' => 'Chuyển kho',
            'directionTone' => 'transfer',
            'canDelete' => false,
        ];
    }

    private function itemRowFromVoucherProduct(MirrorRecord $record, array $warehouses): array
    {
        $payload = is_array($record->payload) ? $record->payload : [];
        $type = $this->detectVoucherType($payload, $record);

        return [
            'rowKey' => 'inventory-product:' . $record->mongo_id,
            'source' => 'inventory-voucher',
            'sourceId' => $record->inventory_voucher_mongo_id ?: ($payload['inventory_voucher_mongo_id'] ?? null),
            'itemSourceId' => $record->mongo_id,
            'code' => $record->inventory_voucher_mongo_id ?: ($payload['voucherId'] ?? null),
            'billCode' => $record->inventory_voucher_mongo_id ?: ($payload['refer_code'] ?? null),
            'date' => $this->dateValue($payload, $record),
            'warehouseId' => $record->branch_mongo_id ?: ($payload['warehouse_mongo_id'] ?? null),
            'warehouseName' => $payload['warehouse_name'] ?? $payload['warehouse'] ?? ($warehouses[$record->branch_mongo_id] ?? null)?->name,
            'productId' => $record->product_mongo_id ?: ($payload['product_mongo_id'] ?? $payload['productId'] ?? null),
            'productCode' => $record->product_code ?: ($payload['product_code'] ?? $payload['productCode'] ?? null),
            'productName' => $record->name ?: ($payload['product_name'] ?? $payload['productName'] ?? null),
            'barcode' => $record->barcode ?: ($payload['barcode'] ?? null),
            'imei' => $payload['imei'] ?? null,
            'quantity' => $this->amountValue($record->qty ?? $payload['qty'] ?? $payload['export_qty'] ?? $payload['import_qty'] ?? 0, true),
            'unitPrice' => $this->amountValue($record->unit_price ?? $payload['unit_price'] ?? $payload['price'] ?? $payload['currentPrice'] ?? 0, true),
            'totalAmount' => $this->amountValue($record->total_amount ?? $payload['total_amount'] ?? $payload['totalAmount'] ?? 0, true),
            'type' => $type,
            'kind' => $type,
            'kindLabel' => $record->type ?: ($payload['type'] ?? 'Phiếu xuất nhập'),
            'sourceModule' => 'inventory-voucher',
            'createdByName' => $payload['creator'] ?? null,
            'note' => $payload['note'] ?? '',
            'status' => $record->status,
            'directionLabel' => $type === 'IMPORT' ? 'Nhập kho' : 'Xuất kho',
            'directionTone' => $type === 'IMPORT' ? 'import' : 'export',
            'canDelete' => false,
        ];
    }

    private function itemRowsFromTransfer(MirrorRecord $record, array $warehouses): array
    {
        $payload = is_array($record->payload) ? $record->payload : [];
        $lines = $payload['lines'] ?? [];
        $fromId = $payload['from_branch_mongo_id'] ?? $record->from_branch_mongo_id ?? null;
        $toId = $payload['to_branch_mongo_id'] ?? $record->to_branch_mongo_id ?? null;
        $date = $this->dateValue($payload, $record);
        $creator = $payload['creator'] ?? null;
        $billCode = $payload['code'] ?? $record->code ?? $record->mongo_id;

        return collect($lines)->map(function ($line, $index) use ($record, $warehouses, $fromId, $toId, $date, $creator, $billCode): array {
            return [
                'rowKey' => 'warehouse-transfer:' . $record->mongo_id . ':' . $index,
                'source' => 'warehouse-transfer',
                'sourceId' => $record->mongo_id,
                'itemSourceId' => $line['_id'] ?? null,
                'code' => $billCode,
                'billCode' => $billCode,
                'date' => $date,
                'fromWarehouseId' => $fromId,
                'fromWarehouseName' => $payload['source_warehouse_name'] ?? ($warehouses[$fromId] ?? null)?->name,
                'toWarehouseId' => $toId,
                'toWarehouseName' => $payload['destination_warehouse_name'] ?? ($warehouses[$toId] ?? null)?->name,
                'productId' => $line['productId'] ?? null,
                'productCode' => $line['productCode'] ?? null,
                'productName' => $line['productName'] ?? null,
                'barcode' => $line['barcode'] ?? null,
                'imei' => $line['imei'] ?? null,
                'quantity' => $this->amountValue($line['receivedQuantity'] ?? $line['dispatchedQuantity'] ?? $line['approvedQuantity'] ?? $line['requestedQuantity'] ?? 0, true),
                'unitPrice' => $this->amountValue($line['unitCostSnapshot'] ?? 0, true),
                'totalAmount' => 0,
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
        $type = $payload['type'] ?? $payload['import_export_type'] ?? $record->type ?? '';
        $lower = mb_strtolower((string) $type);

        if (str_contains($lower, 'nhập') || str_contains($lower, 'nhap')) {
            return 'IMPORT';
        }
        if (str_contains($lower, 'xuất') || str_contains($lower, 'xuat')) {
            return 'EXPORT';
        }

        return 'EXPORT';
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

    public function show(string $source, string $sourceId): JsonResponse
    {
        if ($source === 'warehouse-transfer') {
            $record = (new MirrorRecord())->forTable('warehouse_transfers')->newQuery()
                ->where('mongo_id', $sourceId)
                ->firstOrFail();

            return response()->json($this->transferDetail($record));
        }

        $record = (new MirrorRecord())->forTable('inventory_vouchers')->newQuery()
            ->where('mongo_id', $sourceId)
            ->firstOrFail();

        return response()->json($this->voucherDetail($record));
    }

    private function voucherDetail(MirrorRecord $record): array
    {
        $warehouses = $this->warehouseMap();
        $row = $this->billRowFromVoucher($record, $warehouses);
        $payload = is_array($record->payload) ? $record->payload : [];
        $voucherCode = $payload['voucher_code'] ?? $payload['voucherId'] ?? $record->code ?? $record->mongo_id;
        $items = (new MirrorRecord())->forTable('inventory_products')->newQuery()
            ->where(function ($q) use ($voucherCode, $record): void {
                $q->where('inventory_voucher_mongo_id', $voucherCode)
                    ->orWhere('inventory_voucher_mongo_id', $record->mongo_id)
                    ->orWhere('refer_code', $voucherCode);
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

        return [
            'rowKey' => 'inventory-product:' . $record->mongo_id,
            'productCode' => $record->product_code ?: ($payload['product_code'] ?? $payload['productCode'] ?? ''),
            'productName' => $record->name ?: ($payload['product_name'] ?? $payload['productName'] ?? $record->name ?? ''),
            'barcode' => $record->barcode ?: ($payload['barcode'] ?? ''),
            'quantity' => $this->amountValue($record->qty ?? $payload['qty'] ?? $payload['export_qty'] ?? $payload['import_qty'] ?? 0, true),
            'unitPrice' => $this->amountValue($record->unit_price ?? $payload['unit_price'] ?? $payload['price'] ?? 0, true),
            'totalAmount' => $this->amountValue($record->total_amount ?? $payload['total_amount'] ?? $payload['totalAmount'] ?? 0, true),
            'note' => $payload['note'] ?? '',
        ];
    }

    public function destroy(string $source, string $sourceId): JsonResponse
    {
        return response()->json([
            'ok' => false,
            'message' => 'Tính năng xóa phiếu xuất nhập kho chưa được hỗ trợ tại trang tổng hợp. Vui lòng hủy phiếu tại module nghiệp vụ gốc.',
        ], 405);
    }

    public function bulkDelete(Request $request): JsonResponse
    {
        return response()->json([
            'ok' => false,
            'message' => 'Tính năng xóa hàng loạt phiếu xuất nhập kho chưa được hỗ trợ. Vui lòng hủy từng phiếu tại module nghiệp vụ gốc.',
        ], 405);
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



