<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\MirrorRecord;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class MirrorRecordController extends Controller
{
    private const PUBLIC_TRANSFER_STATUSES = [
        'DRAFT' => 'Chá» xÃ¡c nháº­n xuáº¥t',
        'IN_TRANSIT' => 'Äang chuyá»ƒn',
        'RETURN_IN_PROGRESS' => 'Äang chá» nháº­n láº¡i hÃ ng tráº£',
        'COMPLETED' => 'HoÃ n thÃ nh',
        'RETURNED' => 'ÄÃ£ tráº£ hÃ ng / ÄÃ£ má»Ÿ khÃ³a',
        'CANCELLED' => 'ÄÃ£ há»§y',
    ];

    private const SEARCH_COLUMNS = [
        'code',
        'name',
        'status',
        'type',
        'voucher_code',
        'product_code',
        'product_name',
        'customer_name',
        'customer_phone',
        'warehouse_name',
        'creator',
        'action_type',
        'field_name',
        'log_type',
        'log_action',
        'created_by',
    ];

    private const FILTER_COLUMNS = [
        'status',
        'type',
        'branch_mongo_id',
        'customer_mongo_id',
        'product_mongo_id',
        'user_mongo_id',
        'branch_id',
        'customer_id',
        'product_id',
        'warehouse_mongo_id',
        'import_export_type',
        'field_name',
        'action_type',
        'refund_status',
        'is_delivery',
        'is_cod',
        'log_type',
        'log_action',
        'created_by',
    ];

    private function serialize(MirrorRecord $record): array
    {
        $payload = is_array($record->payload) ? $record->payload : [];
        $attributes = $record->toArray();
        unset($attributes['payload']);
        $identifier = $record->mongo_id ?: (string) $record->getKey();

        return array_merge($attributes, $payload, [
            '_id' => $payload['_id'] ?? $identifier,
            'id' => $payload['id'] ?? ($record->mongo_id ?: $record->getKey()),
            'localId' => $record->getKey(),
            'mongoId' => $record->mongo_id,
        ]);
    }

    private function enrich(array $serialized, string $resource, string $table): array
    {
        return match ($resource) {
            'product-refunds' => $this->enrichRefund($serialized),
            'sale-payments' => $this->enrichSalePayment($serialized),
            'warehouse-transfers' => $this->enrichWarehouseTransfer($serialized),
            default => $serialized,
        };
    }

    private function normalizeStatus(?string $status): string
    {
        return strtoupper(trim((string) $status));
    }

    private function transferStatusLabel(string $status): string
    {
        return self::PUBLIC_TRANSFER_STATUSES[$status] ?? $status;
    }

    private function transferStatusTone(string $status): string
    {
        return match ($status) {
            'DRAFT' => 'adjustment',
            'IN_TRANSIT' => 'transfer',
            'RETURN_IN_PROGRESS', 'RETURNED' => 'refund',
            'COMPLETED' => 'import',
            'CANCELLED' => 'export',
            default => 'adjustment',
        };
    }

    private function normalizeTransferLine(array $line): array
    {
        $quantity = (float) ($line['requestedQuantity'] ?? $line['quantity'] ?? $line['amount'] ?? 0);

        return array_merge($line, [
            'productId' => $line['productId'] ?? $line['product_id'] ?? null,
            'productCode' => $line['productCode'] ?? $line['product_code'] ?? null,
            'productName' => $line['productName'] ?? $line['product_name'] ?? null,
            'unit' => $line['unit'] ?? '',
            'requestedQuantity' => (float) ($line['requestedQuantity'] ?? $quantity),
            'dispatchedQuantity' => (float) ($line['dispatchedQuantity'] ?? $line['dispatched_quantity'] ?? $quantity),
            'receivedQuantity' => (float) ($line['receivedQuantity'] ?? $line['received_quantity'] ?? $quantity),
            'lockedQuantity' => (float) ($line['lockedQuantity'] ?? $line['locked_quantity'] ?? $quantity),
            'note' => $line['note'] ?? '',
        ]);
    }

    private function enrichWarehouseTransfer(array $serialized): array
    {
        $status = $this->normalizeStatus((string) ($serialized['status'] ?? ''));
        $rawKind = strtoupper((string) ($serialized['kind'] ?? $serialized['type'] ?? 'NORMAL_TRANSFER'));
        $kind = in_array($rawKind, ['RETURN', 'RETURN_OF_TRANSFER'], true) ? 'RETURN_OF_TRANSFER' : 'NORMAL_TRANSFER';
        $lines = is_array($serialized['lines'] ?? null) ? $serialized['lines'] : [];
        $lines = array_values(array_map(fn ($line): array => $this->normalizeTransferLine(is_array($line) ? $line : []), $lines));
        $qty = array_sum(array_map(fn (array $line): float => (float) ($line['requestedQuantity'] ?? 0), $lines));

        $serialized['status'] = $status;
        $serialized['statusLabel'] = $this->transferStatusLabel($status);
        $serialized['statusTone'] = $this->transferStatusTone($status);
        $serialized['kind'] = $kind;
        $serialized['lines'] = $lines;
        $serialized['spCount'] = (int) ($serialized['spCount'] ?? $serialized['sp_count'] ?? count($lines));
        $serialized['qty'] = (float) ($serialized['qty'] ?? $qty);
        $serialized['lockedQuantity'] = (float) ($serialized['lockedQuantity'] ?? array_sum(array_map(fn (array $line): float => (float) ($line['lockedQuantity'] ?? 0), $lines)));
        $serialized['sourceWarehouseId'] = $serialized['sourceWarehouseId'] ?? $serialized['from_branch_mongo_id'] ?? null;
        $serialized['destinationWarehouseId'] = $serialized['destinationWarehouseId'] ?? $serialized['to_branch_mongo_id'] ?? null;
        $serialized['sourceWarehouseName'] = $serialized['sourceWarehouseName'] ?? $serialized['source_warehouse_name'] ?? null;
        $serialized['destinationWarehouseName'] = $serialized['destinationWarehouseName'] ?? $serialized['destination_warehouse_name'] ?? null;
        $serialized['sourceExportBillId'] = $serialized['sourceExportBillId'] ?? $serialized['source_export_bill_mongo_id'] ?? null;
        $serialized['destinationImportBillId'] = $serialized['destinationImportBillId'] ?? $serialized['destination_import_bill_mongo_id'] ?? null;
        $serialized['canEdit'] = $status === 'DRAFT';
        $serialized['canCancel'] = $status === 'DRAFT';
        $serialized['canConfirmSource'] = $status === 'DRAFT';
        $serialized['canConfirmDestination'] = $status === 'IN_TRANSIT';
        $serialized['canReturn'] = $status === 'IN_TRANSIT' && $kind !== 'RETURN_OF_TRANSFER';
        $serialized['canPrint'] = $status === 'COMPLETED' || $status === 'RETURN_IN_PROGRESS' || $status === 'IN_TRANSIT';
        $serialized['audits'] = $serialized['audits'] ?? [];

        return $serialized;
    }

    private function mirrorRecord(string $table, ?string $mongoId): ?array
    {
        if (!$mongoId || !Schema::hasTable($table)) {
            return null;
        }

        $record = (new MirrorRecord())->forTable($table)->newQuery()
            ->where('mongo_id', $mongoId)
            ->first();

        return $record ? $this->serialize($record) : null;
    }

    private function lookupProduct(?string $mongoId): ?array
    {
        if (!$mongoId || !Schema::hasTable('products')) {
            return null;
        }

        $record = (new MirrorRecord())->forTable('products')->newQuery()
            ->where('mongo_id', $mongoId)
            ->first();

        if (!$record) {
            return null;
        }

        return [
            '_id' => $record->mongo_id,
            'code' => $record->code,
            'name' => $record->name,
        ];
    }
    private function enrichRefund(array $serialized): array
    {
        $paymentMongoId = $serialized['payment_mongo_id'] ?? ($serialized['paymentId'] ?? null);
        if (is_string($paymentMongoId) && strlen($paymentMongoId) === 24) {
            $payment = $this->mirrorRecord('sale_payments', $paymentMongoId);
            $serialized['paymentId'] = $payment ? $this->enrichSalePayment($payment) : $paymentMongoId;
        }

        $items = $serialized['items'] ?? [];
        if (is_array($items)) {
            foreach ($items as $index => $item) {
                $productId = $item['productId'] ?? null;
                if (is_string($productId) && strlen($productId) === 24) {
                    $product = $this->lookupProduct($productId);
                    if ($product) {
                        $item['productId'] = [
                            '_id' => $product['_id'] ?? $productId,
                            'code' => $product['code'] ?? null,
                            'name' => $product['name'] ?? null,
                        ];
                    }
                }
                $items[$index] = $item;
            }
            $serialized['items'] = $items;
        }

        return $serialized;
    }

    private function enrichSalePayment(array $serialized): array
    {
        $branchMongoId = $serialized['branch_mongo_id'] ?? null;
        if ($branchMongoId) {
            $branch = $this->mirrorRecord('branches', $branchMongoId);
            if ($branch) {
                $serialized['branchId'] = [
                    '_id' => $branch['_id'] ?? $branchMongoId,
                    'name' => $branch['name'] ?? null,
                    'code' => $branch['code'] ?? null,
                    'address' => $branch['address'] ?? null,
                    'phone' => $branch['phone'] ?? null,
                    'invoiceProfile' => $branch['invoiceProfile'] ?? $branch['invoice_profile'] ?? null,
                ];
            }
        }

        $customerMongoId = $serialized['customer_mongo_id'] ?? null;
        if ($customerMongoId) {
            $customer = $this->mirrorRecord('customers', $customerMongoId);
            if ($customer) {
                $serialized['customerId'] = [
                    '_id' => $customer['_id'] ?? $customerMongoId,
                    'name' => $customer['name'] ?? null,
                    'phone' => $customer['phone'] ?? $customer['customer_phone'] ?? null,
                    'code' => $customer['code'] ?? $customer['customer_code'] ?? null,
                ];
            }
        }

        $items = $serialized['items'] ?? [];
        if (is_array($items)) {
            foreach ($items as $index => $item) {
                $productId = $item['productId'] ?? null;
                if (is_string($productId) && strlen($productId) === 24) {
                    $product = $this->lookupProduct($productId);
                    if ($product) {
                        $item['productId'] = [
                            '_id' => $product['_id'] ?? $productId,
                            'code' => $product['code'] ?? null,
                            'name' => $product['name'] ?? null,
                        ];
                    }
                }
                $items[$index] = $item;
            }
            $serialized['items'] = $items;
        }

        return $serialized;
    }
    public function index(Request $request, string $resource): JsonResponse
    {
        $table = MirrorRecord::TABLES[$resource] ?? null;

        abort_if($table === null, 404, 'Unknown mirror resource.');

        $page = max((int) $request->query('page', 1), 1);
        $limitParam = $request->query('limit', $request->query('perPage', 20));
        $limit = min(max((int) $limitParam, 1), 5000);
        $query = (new MirrorRecord())->forTable($table)->newQuery();
        $columns = collect(Schema::getColumnListing($table))->flip();

        $search = trim((string) $request->query('q', $request->query('search', $request->query('keyword', ''))));
        if ($resource === 'sale-payments') {
            $search = trim((string) $request->query('invoiceCode', $request->query('code', $search)));
        } elseif ($resource === 'warehouse-transfers') {
            $search = trim((string) $request->query('id', $request->query('code', $search)));
        }
        if ($search !== '') {
            $query->where(function ($builder) use ($search, $columns): void {
                foreach (self::SEARCH_COLUMNS as $column) {
                    if ($columns->has($column)) {
                        $builder->orWhere($column, 'like', "%{$search}%");
                    }
                }
            });
        }

        if ($request->filled('branchId') || $request->filled('storeId')) {
            $branchValue = $request->query('branchId', $request->query('storeId'));
            if ($columns->has('branch_id')) {
                $query->where('branch_id', $branchValue);
            } elseif ($columns->has('branch_mongo_id')) {
                $query->where('branch_mongo_id', $branchValue);
            }
        }

        foreach (self::FILTER_COLUMNS as $field) {
            if ($columns->has($field) && $request->filled($field)) {
                $value = $request->query($field);
                if (is_string($value) && str_contains($value, ',')) {
                    $query->whereIn($field, array_filter(array_map('trim', explode(',', $value))));
                } else {
                    $query->where($field, $value);
                }
            }
        }

        if ($resource === 'sale-payments') {
            $this->applySalePaymentExtraFilters($request, $query, $columns);
        } elseif ($resource === 'warehouse-transfers') {
            $this->applyWarehouseTransferFilters($request, $query, $columns);
        }

        $sort = (string) $request->query('sort', 'business_date');
        $sortAliases = [
            'createdAt' => 'created_at',
            'updatedAt' => 'updated_at',
            'recordDate' => 'record_date',
            'customerName' => 'customer_name',
            'customerPhone' => 'customer_phone',
            'logType' => 'log_type',
            'logAction' => 'log_action',
            'createdBy' => 'created_by',
        ];
        $sort = $sortAliases[$sort] ?? $sort;
        if (!$columns->has($sort)) {
            $sort = $columns->has('business_date') ? 'business_date' : 'created_at';
        }
        $order = $request->query('order') === 'asc' ? 'asc' : 'desc';

        $total = (clone $query)->count();
        $records = $query
            ->orderBy($sort, $order)
            ->orderBy('id', $order)
            ->skip(($page - 1) * $limit)
            ->limit($limit)
            ->get();

        $items = array_map(
            fn (MirrorRecord $record): array => $this->enrich($this->serialize($record), $resource, $table),
            $records->all(),
        );

        $response = [
            'items' => $items,
            'data' => $items,
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'per_page' => $limit,
            'current_page' => $page,
            'last_page' => (int) ceil($total / max($limit, 1)),
        ];

        if ($resource === 'product-edit-logs') {
            $response['meta'] = $this->productEditLogMeta();
        }

        return response()->json($response);
    }

    private function applySalePaymentExtraFilters(Request $request, \Illuminate\Database\Eloquent\Builder $query, \Illuminate\Support\Collection $columns): void
    {
        $dateColumn = $columns->has('business_date') ? 'business_date' : ($columns->has('completed_at') ? 'completed_at' : null);
        if ($dateColumn) {
            if ($from = trim((string) $request->query('dateFrom', ''))) {
                $query->whereDate($dateColumn, '>=', $from);
            }
            if ($to = trim((string) $request->query('dateTo', ''))) {
                $query->whereDate($dateColumn, '<=', $to);
            }
        }

        $customerKeyword = trim((string) $request->query('customerKeyword', ''));
        if ($customerKeyword !== '' && $columns->has('customer_id')) {
            $matchingCustomerIds = Customer::query()
                ->where(function ($builder) use ($customerKeyword): void {
                    $builder->where('name', 'like', "%{$customerKeyword}%")
                        ->orWhere('phone', 'like', "%{$customerKeyword}%")
                        ->orWhere('phone2', 'like', "%{$customerKeyword}%")
                        ->orWhere('code', 'like', "%{$customerKeyword}%");
                })
                ->pluck('id')
                ->all();
            $query->whereIn('customer_id', $matchingCustomerIds);
        }

        $productKeyword = trim((string) $request->query('productKeyword', ''));
        if ($productKeyword !== '' && $columns->has('items')) {
            $matchingProductMongoIds = Product::query()
                ->where(function ($builder) use ($productKeyword): void {
                    $builder->where('name', 'like', "%{$productKeyword}%")
                        ->orWhere('code', 'like', "%{$productKeyword}%")
                        ->orWhere('barcode', 'like', "%{$productKeyword}%");
                })
                ->whereNotNull('mongo_id')
                ->pluck('mongo_id')
                ->map(fn ($id): string => (string) $id)
                ->filter()
                ->all();

            if (empty($matchingProductMongoIds)) {
                $query->whereRaw('1 = 0');
                return;
            }

            $jsonValues = collect($matchingProductMongoIds)
                ->map(fn ($id): string => DB::getPdo()->quote($id))
                ->implode(',');

            $query->whereRaw(
                'EXISTS (SELECT 1 FROM JSON_TABLE(items, "$[*]" COLUMNS(productId VARCHAR(24) PATH "$.productId")) AS jt WHERE jt.productId IN ('.$jsonValues.'))'
            );
        }
    }
    private function applyWarehouseTransferFilters(Request $request, \Illuminate\Database\Eloquent\Builder $query, \Illuminate\Support\Collection $columns): void
    {
        $tab = (string) $request->query('tab', 'all');
        if ($tab === 'draft') {
            $query->whereIn(DB::raw('UPPER(status)'), ['DRAFT']);
        } elseif (in_array($tab, ['outgoing', 'incoming'], true)) {
            $query->whereIn(DB::raw('UPPER(status)'), ['IN_TRANSIT', 'RETURN_IN_PROGRESS']);
        }

        $this->applyTransferWarehouseFilter($query, $columns, 'sourceWarehouseId', 'from_branch_mongo_id', 'from_branch_id', $request->query('sourceWarehouseId'));
        $this->applyTransferWarehouseFilter($query, $columns, 'destinationWarehouseId', 'to_branch_mongo_id', 'to_branch_id', $request->query('destinationWarehouseId'));

        $dateColumn = $columns->has('business_date') ? 'business_date' : ($columns->has('created_at') ? 'created_at' : null);
        if ($dateColumn) {
            if ($fromDate = trim((string) $request->query('fromDate', ''))) {
                $query->whereDate($dateColumn, '>=', $fromDate);
            }
            if ($toDate = trim((string) $request->query('toDate', ''))) {
                $query->whereDate($dateColumn, '<=', $toDate);
            }
        }
    }

    private function applyTransferWarehouseFilter(\Illuminate\Database\Eloquent\Builder $query, \Illuminate\Support\Collection $columns, string $requestField, string $mongoColumn, string $localColumn, mixed $value): void
    {
        $value = trim((string) $value);
        if ($value === '') {
            return;
        }

        $branch = Branch::query()
            ->where('id', $value)
            ->orWhere('mongo_id', $value)
            ->first();

        $query->where(function ($builder) use ($columns, $mongoColumn, $localColumn, $value, $branch): void {
            if ($columns->has($mongoColumn)) {
                $builder->orWhere($mongoColumn, $branch?->mongo_id ?? $value);
            }
            if ($columns->has($localColumn) && $branch) {
                $builder->orWhere($localColumn, $branch->id);
            }
        });
    }

    public function show(Request $request): JsonResponse
    {
        $resource = (string) $request->route('resource');
        $id = (string) $request->route('id');
        $table = MirrorRecord::TABLES[$resource] ?? null;

        abort_if($table === null, 404, 'Unknown mirror resource.');

        $query = (new MirrorRecord())->forTable($table)->newQuery();
        $record = ctype_digit($id)
            ? $query->where('id', (int) $id)->firstOrFail()
            : $query->where('mongo_id', $id)->firstOrFail();

        return response()->json($this->enrich($this->serialize($record), $resource, $table));
    }

    public function warehouseTransferMeta(): JsonResponse
    {
        $warehouses = Branch::query()
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['mongo_id', 'name', 'code'])
            ->map(fn (Branch $branch): array => [
                'value' => $branch->mongo_id,
                'label' => $branch->name,
                'code' => $branch->code,
            ])
            ->values();

        $statuses = collect(self::PUBLIC_TRANSFER_STATUSES)
            ->map(fn (string $label, string $status): array => [
                'value' => $status,
                'label' => $label,
            ])
            ->values();

        return response()->json([
            'role' => 'ADMIN',
            'userWarehouseIds' => [],
            'warehouses' => $warehouses,
            'destinationWarehouses' => $warehouses,
            'statuses' => $statuses,
        ]);
    }

    public function customerCareMeta(): JsonResponse
    {
        return response()->json([
            'reasons' => $this->distinctSorted('customer_cares', 'reason'),
            'creators' => $this->distinctSorted('customer_cares', 'creator'),
        ]);
    }

    private function productEditLogMeta(): array
    {
        $logTypes = $this->distinctSorted('product_edit_logs', 'log_type');

        return [
            'logTypes' => $logTypes,
            'logActions' => $this->distinctSorted('product_edit_logs', 'log_action'),
            'editors' => $this->distinctSorted('product_edit_logs', 'created_by'),
            'toneByLogType' => collect($logTypes)
                ->mapWithKeys(fn (string $type): array => [
                    $type => str_contains(mb_strtolower($type), 'xÃ³a') ? 'danger' : 'warning',
                ])
                ->all(),
        ];
    }

    private function distinctSorted(string $table, string $column): array
    {
        if (!Schema::hasColumn($table, $column)) {
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
            ->sort(fn (string $left, string $right): int => strnatcasecmp($left, $right))
            ->values()
            ->all();
    }

    public function resources(): JsonResponse
    {
        return response()->json(['data' => array_keys(MirrorRecord::TABLES)]);
    }
}
