<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\MirrorRecord;
use App\Models\Product;
use App\Models\ProductBranchStock;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class LocalWriteController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $email = trim((string) $request->input('email', 'local@ladystars.test'));
        $user = User::query()->where('email', $email)->first()
            ?? User::query()->where(fn ($q) => $q->where('role', 'ADMIN')->orWhere('is_root_owner', true))->first()
            ?? User::query()->first();

        $shape = $user ? [
            '_id' => (string) $user->id,
            'id' => $user->id,
            'email' => $user->email,
            'name' => $user->name,
            'role' => $user->role,
        ] : [
            '_id' => 'local',
            'email' => $email,
            'name' => 'Laravel Local Tester',
            'role' => 'ADMIN',
        ];

        return response()->json([
            'token' => 'local-laravel-token',
            'user' => $shape,
        ]);
    }

    public function updateStore(Request $request): JsonResponse
    {
        $record = (new MirrorRecord())->forTable('store_settings')->newQuery()->orderByDesc('id')->first()
            ?? (new MirrorRecord())->forTable('store_settings')->newQuery()->create([
                'mongo_id' => $this->localMongoId(),
                'name' => 'LadyStars Local',
                'payload' => [],
            ]);

        $payload = array_merge(is_array($record->payload) ? $record->payload : [], $request->all());
        $record->forceFill([
            'name' => $payload['shopName'] ?? $payload['name'] ?? $record->name,
            'payload' => $payload,
        ])->save();

        return response()->json($payload + ['shopName' => $record->name]);
    }

    public function storeMirror(Request $request): JsonResponse
    {
        $resource = (string) $request->route('resource');
        $table = $this->table($resource);
        $payload = $request->all();
        $record = DB::transaction(fn () => $this->createRecord($table, $payload, $resource));

        return response()->json($this->serialize($record), 201);
    }

    public function updateMirror(Request $request): JsonResponse
    {
        $resource = (string) $request->route('resource');
        $id = (string) $request->route('id');
        $table = $this->table($resource);
        $record = $this->findRecord($table, $id);
        $payload = array_merge(is_array($record->payload) ? $record->payload : [], $request->all());
        $record->forceFill($this->attributes($table, $payload, $resource, $record))->save();

        return response()->json($this->serialize($record));
    }

    public function deleteMirror(Request $request): JsonResponse
    {
        $resource = (string) $request->route('resource');
        $id = (string) $request->route('id');
        $table = $this->table($resource);
        $record = $this->findRecord($table, $id);

        if ($resource === 'warehouse-transfers') {
            $payload = is_array($record->payload) ? $record->payload : [];
            $payload['status'] = 'CANCELLED';
            $payload['cancelledAt'] = now()->toISOString();
            if ($request->filled('reason')) $payload['cancelReason'] = $request->input('reason');
            $record->forceFill(['status' => 'CANCELLED', 'payload' => $payload])->save();

            return response()->json($this->serialize($record));
        }

        $record->delete();

        return response()->json(['ok' => true, 'message' => 'Deleted locally.']);
    }

    public function action(Request $request): JsonResponse
    {
        $resource = (string) $request->route('resource');
        $id = (string) $request->route('id');
        $action = (string) $request->route('action');
        $table = $this->table($resource);
        $record = $this->findRecord($table, $id);
        $payload = is_array($record->payload) ? $record->payload : [];
        $status = match ($action) {
            'confirm-destination' => 'COMPLETED',
            'complete', 'reconcile' => 'completed',
            'cancel' => $resource === 'warehouse-transfers' ? 'CANCELLED' : 'cancelled',
            'submit', 'confirm-source' => 'IN_TRANSIT',
            'return' => $resource === 'warehouse-transfers' ? 'RETURN_IN_PROGRESS' : 'RETURNED',
            'resnapshot' => $record->status,
            'reverse-reconcile' => 'COUNTING',
            default => $record->status,
        };

        if ($action === 'complete' && $resource === 'sale-payments' && $record->status !== 'completed') {
            $this->applySaleStock($payload, -1);
        }
        if ($action === 'cancel' && $resource === 'sale-payments' && $record->status === 'completed') {
            $this->applySaleStock($payload, 1);
        }

        $payload['status'] = $status;
        $payload[$action.'At'] = now()->toISOString();
        if ($request->filled('reason')) $payload['reason'] = $request->input('reason');

        $updates = ['status' => $status, 'payload' => $payload];
        if ($action === 'complete' && Schema::hasColumn($table, 'completed_at')) {
            $updates['completed_at'] = now();
        }
        $record->forceFill($updates)->save();

        if ($action === 'return' && $resource === 'warehouse-transfers') {
            $return = $this->createRecord($table, array_merge($payload, [
                'code' => 'TR-'.$this->nextSuffix(),
                'status' => 'DRAFT',
                'type' => 'return',
                'sourceWarehouseId' => $payload['destinationWarehouseId'] ?? null,
                'destinationWarehouseId' => $payload['sourceWarehouseId'] ?? null,
            ]), $resource);
            return response()->json(['ok' => true, 'returnTransfer' => $this->serialize($return)]);
        }

        return response()->json($this->serialize($record));
    }

    private function createRecord(string $table, array $payload, string $resource): MirrorRecord
    {
        return (new MirrorRecord())->forTable($table)->newQuery()->create($this->attributes($table, $payload, $resource));
    }

    private function attributes(string $table, array $payload, string $resource, ?MirrorRecord $record = null): array
    {
        $nowCode = $this->prefix($resource).$this->nextSuffix();
        $code = (string) ($payload['code'] ?? $payload['voucherId'] ?? $payload['id'] ?? $record?->code ?? $nowCode);
        $status = (string) ($payload['status'] ?? $record?->status ?? ($resource === 'warehouse-transfers' ? 'DRAFT' : 'draft'));
        $businessDate = $payload['businessDate'] ?? $payload['date'] ?? $payload['recordDate'] ?? now();
        $branchId = $payload['branchId'] ?? $payload['warehouseId'] ?? $payload['warehouse'] ?? $payload['sourceWarehouseId'] ?? null;
        $branch = $this->branch($branchId);
        $customer = $this->customer($payload['customerId'] ?? null);
        $product = $this->product($payload['productId'] ?? null);
        $items = $payload['items'] ?? $payload['lines'] ?? null;

        $payload = array_merge($payload, [
            '_id' => $record?->mongo_id ?? ($payload['_id'] ?? null),
            'code' => $code,
            'status' => $status,
            'createdAt' => $payload['createdAt'] ?? optional($record?->created_at)->toISOString() ?? now()->toISOString(),
            'updatedAt' => now()->toISOString(),
        ]);

        $attrs = [
            'mongo_id' => $record?->mongo_id ?? $this->localMongoId(),
            'code' => $code,
            'name' => $payload['name'] ?? $payload['label'] ?? $payload['customerName'] ?? null,
            'status' => $status,
            'type' => $payload['type'] ?? $payload['importExportType'] ?? null,
            'amount' => $payload['amount'] ?? $payload['qty'] ?? $payload['amountProducts'] ?? null,
            'value' => $payload['value'] ?? $payload['price'] ?? null,
            'total' => $payload['total'] ?? $payload['totalAmount'] ?? $payload['valuePayment'] ?? null,
            'branch_mongo_id' => $branch?->mongo_id,
            'customer_mongo_id' => $customer?->mongo_id,
            'product_mongo_id' => $product?->mongo_id,
            'user_mongo_id' => User::query()->value('mongo_id'),
            'business_date' => $businessDate,
            'payload' => $payload,
        ];

        $extra = [
            'sale_payments' => [
                'amount_products' => $payload['amountProducts'] ?? collect($items ?? [])->sum(fn ($i) => (float) ($i['amount'] ?? $i['quantity'] ?? 0)),
                'total_cost' => $payload['totalCost'] ?? null,
                'discount_value' => $payload['discountValue'] ?? null,
                'discount_type' => $payload['discountType'] ?? null,
                'value_payment' => $payload['valuePayment'] ?? null,
                'tendered_value' => $payload['tenderedValue'] ?? null,
                'settlement_value' => $payload['settlementValue'] ?? $payload['valuePayment'] ?? null,
                'is_delivery' => $payload['isDelivery'] ?? false,
                'is_cod' => $payload['isCod'] ?? false,
                'note' => $payload['note'] ?? null,
                'customer_id' => $customer?->id,
                'branch_id' => $branch?->id,
                'user_id' => User::query()->value('id'),
                'author_id' => User::query()->value('id'),
                'payment_lines' => $payload['typePayment'] ?? $payload['paymentLines'] ?? [],
                'items' => $items ?? [],
            ],
            'product_refunds' => [
                'payment_mongo_id' => $payload['paymentId'] ?? null,
                'refund_fee' => $payload['refundFee'] ?? 0,
                'discount_value' => $payload['discountValue'] ?? 0,
                'discount_type' => $payload['discountType'] ?? null,
                'settlement_value' => $payload['settlementValue'] ?? null,
                'note' => $payload['note'] ?? null,
                'items' => $items ?? [],
                'payment_lines' => $payload['paymentLines'] ?? [],
            ],
            'inventory_vouchers' => [
                'import_export_type' => $payload['importExportType'] ?? $payload['type'] ?? null,
                'voucher_code' => $payload['voucherId'] ?? $code,
                'refer_code' => $payload['referCode'] ?? null,
                'qty' => $payload['qty'] ?? null,
                'sp_count' => $payload['spCount'] ?? null,
                'total_amount' => $payload['totalAmount'] ?? null,
                'discount' => $payload['discount'] ?? null,
                'creator' => $payload['creator'] ?? null,
                'supplier' => $payload['supplier'] ?? null,
                'seller' => $payload['seller'] ?? null,
                'note' => $payload['note'] ?? null,
                'warehouse_mongo_id' => $branch?->mongo_id,
                'warehouse_name' => $branch?->name ?? ($payload['warehouse'] ?? null),
                'warehouse_code' => $branch?->code,
                'branch_id' => $branch?->id,
            ],
            'inventory_products' => [
                'refer_code' => $payload['voucherId'] ?? $payload['referCode'] ?? null,
                'qty' => $payload['qty'] ?? $payload['importQty'] ?? $payload['exportQty'] ?? null,
                'import_qty' => $payload['importQty'] ?? 0,
                'export_qty' => $payload['exportQty'] ?? 0,
                'unit_price' => $payload['unitPrice'] ?? $payload['price'] ?? null,
                'total_amount' => $payload['totalAmount'] ?? null,
                'creator' => $payload['creator'] ?? null,
                'inventory_voucher_mongo_id' => $payload['voucherId'] ?? null,
                'branch_id' => $branch?->id,
                'warehouse_name' => $branch?->name ?? ($payload['warehouse'] ?? null),
                'product_id' => $product?->id,
                'product_code' => $payload['productCode'] ?? $product?->code,
                'product_name' => $payload['productName'] ?? $product?->name,
                'barcode' => $product?->barcode,
            ],
            'warehouse_transfers' => [
                'from_branch_mongo_id' => $this->branch($payload['sourceWarehouseId'] ?? null)?->mongo_id,
                'to_branch_mongo_id' => $this->branch($payload['destinationWarehouseId'] ?? null)?->mongo_id,
                'from_branch_id' => $this->branch($payload['sourceWarehouseId'] ?? null)?->id,
                'to_branch_id' => $this->branch($payload['destinationWarehouseId'] ?? null)?->id,
                'date_send' => $payload['dateSend'] ?? null,
                'date_take' => $payload['dateTake'] ?? null,
                'source_warehouse_name' => $this->branch($payload['sourceWarehouseId'] ?? null)?->name,
                'destination_warehouse_name' => $this->branch($payload['destinationWarehouseId'] ?? null)?->name,
                'qty' => collect($items ?? [])->sum(fn ($i) => (float) ($i['quantity'] ?? $i['amount'] ?? 0)),
                'sp_count' => is_array($items) ? count($items) : null,
                'creator' => $payload['creator'] ?? null,
                'source' => 'local-laravel',
                'lines' => $items ?? [],
            ],
            'customer_cares' => [
                'customer_code' => $payload['customerCode'] ?? $customer?->code,
                'customer_name' => $payload['customerName'] ?? $customer?->name,
                'customer_phone' => $payload['customerPhone'] ?? $customer?->phone,
                'record_date' => $payload['recordDate'] ?? now(),
                'branch_id' => $branch?->id,
                'details' => $payload['details'] ?? null,
                'reason' => $payload['reason'] ?? null,
                'description' => $payload['description'] ?? null,
                'creator' => $payload['creator'] ?? null,
            ],
            'inventory_checks' => [
                'branch_id' => $branch?->id,
                'warehouse_name' => $branch?->name,
                'creator' => $payload['creator'] ?? null,
                'sp_count' => is_array($items) ? count($items) : null,
                'qty' => collect($items ?? [])->sum(fn ($i) => (float) ($i['actualStock'] ?? $i['actual_stock'] ?? 0)),
                'note' => $payload['note'] ?? null,
                'missing_sp' => $payload['missingSp'] ?? null,
                'balance' => $payload['balance'] ?? null,
            ],
        ][$table] ?? [];

        return $this->onlyExisting($table, array_merge($attrs, $extra));
    }

    private function applySaleStock(array $payload, int $direction): void
    {
        $branch = $this->branch($payload['branchId'] ?? null) ?? Branch::query()->first();
        if (!$branch) return;
        foreach (($payload['items'] ?? []) as $line) {
            $product = $this->product($line['productId'] ?? null);
            if (!$product || $product->type === 'service') continue;
            $qty = (float) ($line['amount'] ?? $line['quantity'] ?? 0) * $direction;
            $stock = ProductBranchStock::query()->firstOrCreate(['product_id' => $product->id, 'branch_id' => $branch->id], ['qty' => 0, 'locked_quantity' => 0]);
            $stock->forceFill(['qty' => max(0, (float) $stock->qty + $qty)])->save();
            $product->forceFill(['qty' => (float) $product->stocks()->sum('qty')])->save();
        }
    }

    private function table(string $resource): string
    {
        $table = MirrorRecord::TABLES[$resource] ?? null;
        abort_if(!$table, 404, 'Unknown local resource.');
        return $table;
    }

    private function findRecord(string $table, string $id): MirrorRecord
    {
        $query = (new MirrorRecord())->forTable($table)->newQuery();
        return ctype_digit($id) ? $query->where('id', (int) $id)->firstOrFail() : $query->where('mongo_id', $id)->orWhere('code', $id)->firstOrFail();
    }

    private function serialize(MirrorRecord $record): array
    {
        $payload = is_array($record->payload) ? $record->payload : [];
        $attrs = $record->toArray();
        unset($attrs['payload']);
        return array_merge($attrs, $payload, [
            '_id' => (string) ($record->mongo_id ?: $record->id),
            'id' => $record->id,
            'localId' => $record->id,
            'mongoId' => $record->mongo_id,
            'code' => $record->code,
            'status' => $record->status,
        ]);
    }

    private function onlyExisting(string $table, array $attrs): array
    {
        $columns = array_flip(Schema::getColumnListing($table));
        return array_filter($attrs, fn ($key) => isset($columns[$key]), ARRAY_FILTER_USE_KEY);
    }

    private function branch(mixed $id): ?Branch
    {
        if (!$id) return null;
        return Branch::query()->where('id', $id)->orWhere('mongo_id', $id)->orWhere('name', $id)->orWhere('code', $id)->first();
    }

    private function customer(mixed $id): ?Customer
    {
        if (!$id) return null;
        return Customer::query()->where('id', $id)->orWhere('mongo_id', $id)->first();
    }

    private function product(mixed $id): ?Product
    {
        if (!$id) return null;
        return Product::query()->where('id', $id)->orWhere('mongo_id', $id)->first();
    }

    private function localMongoId(): string
    {
        return bin2hex(random_bytes(12));
    }

    private function nextSuffix(): string
    {
        return now()->format('ymdHis').random_int(10, 99);
    }

    private function prefix(string $resource): string
    {
        return match ($resource) {
            'sale-payments' => 'HD',
            'product-refunds' => 'TH',
            'inventory-vouchers' => 'KHO',
            'inventory-products' => 'CT',
            'warehouse-transfers' => 'CK',
            'customer-cares' => 'CS',
            'inventory-checks' => 'KK',
            default => 'LC',
        };
    }
}
