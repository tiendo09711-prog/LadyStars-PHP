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
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class LocalWriteController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $email = trim((string) $request->input('email', ''));
        $password = (string) $request->input('password', '');

        if ($email === '' || $password === '') {
            return response()->json(['message' => 'Email và mật khẩu là bắt buộc.'], 422);
        }

        $user = User::query()->where('email', $email)->first();

        // Bootstrap the documented default admin account on first use of these exact credentials
        // (helps when DB not seeded or after fresh migrate without seed)
        if (!$user && $email === 'admin@gmail.com' && $password === '123456') {
            try {
                $user = User::create([
                    'name' => 'Admin',
                    'email' => 'admin@gmail.com',
                    'password' => '123456',
                    'role' => 'ADMIN',
                    'status' => 'ACTIVE',
                    'is_root_owner' => true,
                    'is_active' => true,
                ]);
            } catch (\Throwable $e) {
                // will fall through to 401 if create fails (e.g. incomplete schema)
            }
        }

        if ($user) {
            $isLocked = ($user->status === 'LOCKED') || ($user->is_active === false);

            $pwOk = false;
            if (!empty($user->password)) {
                try {
                    $pwOk = Hash::check($password, $user->password);
                } catch (\Throwable $e) {
                    // Legacy support: password may be stored in plain text or non-bcrypt format
                    // (from previous mongo data, old imports, or direct inserts).
                    // Accept if matches literally, and upgrade to proper bcrypt hash on success.
                    if (hash_equals((string) $user->password, $password)) {
                        $pwOk = true;
                        // Upgrade hash so future logins use bcrypt
                        try {
                            $user->password = $password; // cast will bcrypt it
                            $user->save();
                        } catch (\Throwable $e2) {
                            // ignore upgrade failure
                        }
                    }
                }
            }

            if ($isLocked) {
                return response()->json(['message' => 'Tài khoản đã bị khóa hoặc không hoạt động.'], 403);
            }
            if (!$pwOk) {
                return response()->json(['message' => 'Email hoặc mật khẩu không đúng.'], 401);
            }

            // Bootstrap minimal demo data on first successful login so UI shows content
            // (addresses the reported issue of login OK but zero dynamic data from MySQL)
            $this->ensureDemoData();

            $shape = [
                '_id' => (string) $user->id,
                'id' => $user->id,
                'email' => $user->email,
                'name' => $user->name,
                'role' => $user->role,
                'status' => $user->status,
                'phone' => $user->phone,
                'defaultWarehouseId' => $user->default_warehouse_id ? (string) $user->default_warehouse_id : null,
                'isActive' => (bool) $user->is_active,
                'isRootOwner' => (bool) $user->is_root_owner,
            ];

            $token = 'local-laravel-token-' . $user->id;

            return response()->json([
                'token' => $token,
                'user' => $shape,
            ]);
        }

        return response()->json(['message' => 'Email hoặc mật khẩu không đúng.'], 401);
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

        // Ensure channel (from sales-channels routing) is captured even if not in body
        // This fixes sales created from /sales-channels/{channel}/... not having 'channel' in payload
        if (empty($payload['channel'])) {
            $ch = $request->query('channel') ?? $request->input('channel') ?? $request->input('orderSource');
            if ($ch) {
                $payload['channel'] = $ch;
            }
        }

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

        // Capture channel on update/edit too
        if (empty($payload['channel'])) {
            $ch = $request->query('channel') ?? $request->input('channel') ?? $request->input('orderSource');
            if ($ch) {
                $payload['channel'] = $ch;
            }
        }

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
        $originalStatus = $record->status;
        if ($resource === 'inventory-checks') {
            $status = match ($action) {
                'submit' => 'COUNTING',
                'reconcile' => 'RECONCILED',
                'cancel' => 'CANCELLED',
                'reverse-reconcile' => 'COUNTING',
                'resnapshot' => $record->status,
                default => $record->status,
            };
        } else {
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
        }

        if ($resource === 'sale-payments' && in_array($action, ['return', 'return-exchange'], true)) {
            $status = $originalStatus; // do not pollute sale status; refunds tracked separately
        }

        if ($action === 'complete' && $resource === 'sale-payments' && $record->status !== 'completed') {
            $this->applySaleStock($payload, -1);
        }
        if ($action === 'cancel' && $resource === 'sale-payments' && $record->status === 'completed') {
            $this->applySaleStock($payload, 1);
        }
        if ($action === 'complete' && $resource === 'product-refunds' && $record->status !== 'completed') {
            $this->applySaleStock($payload, 1); // refund complete restores stock to branch
        }
        $body = $request->all();

        if ($resource === 'sale-payments' && in_array($action, ['return', 'return-exchange'], true)) {
            // exchange/return from retail: +stock for returned items, -stock for replacements
            // Use body from POST (return-exchange) with fallback to payload
            $retItems = $body['returnedItems'] ?? $payload['returnedItems'] ?? [];
            $repItems = $body['replacementItems'] ?? $payload['replacementItems'] ?? [];
            if (!empty($retItems)) {
                $this->applySaleStock(array_merge($payload, ['items' => $retItems]), 1);
            }
            if (!empty($repItems)) {
                $this->applySaleStock(array_merge($payload, ['items' => $repItems]), -1);
            }
        }

        // For return-exchange (used by retail "Đổi trả hàng"), also create a standard product-refund record.
        // This ensures /products/refunds list and enrich links pick it up (in addition to stock + sale state already handled).
        $replacementSale = null;
        if ($resource === 'sale-payments' && $action === 'return-exchange' && !empty($body['returnedItems'] ?? $payload['returnedItems'] ?? null)) {
            $retItemsForRefund = $body['returnedItems'] ?? $payload['returnedItems'] ?? [];
            $refundPayments = $body['refundPayments'] ?? [];
            $salePayments = $body['salePayments'] ?? [];
            $amountDelta = (float)($body['totalAmount'] ?? $body['refundAmount'] ?? 0);

            $refundPayload = [
                'paymentId' => $id,
                'items' => $retItemsForRefund,
                'note' => $body['note'] ?? $payload['note'] ?? ($payload['reason'] ?? ''),
                'branchId' => $body['branchId'] ?? $payload['branchId'] ?? $payload['warehouseId'] ?? null,
                'channel' => $body['channel'] ?? $payload['channel'] ?? null,
                'value' => collect($retItemsForRefund)->sum(function ($i) {
                    return (float)($i['amount'] ?? $i['quantity'] ?? 0) * (float)($i['value'] ?? $i['price'] ?? 0);
                }),
                'status' => 'completed',
                'amount' => collect($retItemsForRefund)->sum(function ($i) {
                    return (float)($i['amount'] ?? $i['quantity'] ?? 0);
                }),
                'totalPayableAmount' => abs($amountDelta),
                'refundPayments' => $refundPayments,
                'salePayments' => $salePayments,
                'amountDelta' => $amountDelta,
            ];
            try {
                $this->createRecord($this->table('product-refunds'), $refundPayload, 'product-refunds');
            } catch (\Throwable $e) {
                // non-fatal: main sale status/stock already processed
            }

            // Create a proper sale invoice for the "mua mới / replacement" part of exchange.
            // This makes the replacement a first-class completed sale (visible in retail/wholesale lists, reports, etc).
            // Stock was already adjusted above; we create only the record here.
            $repItems = $body['replacementItems'] ?? $payload['replacementItems'] ?? [];
            if (!empty($repItems)) {
                $origPayload = is_array($record->payload) ? $record->payload : [];
                $repPayload = [
                    'code' => ($body['code'] ?? 'HD') . '-EX' . substr($this->nextSuffix(), -4),
                    'customerId' => $origPayload['customerId'] ?? $body['customerId'] ?? null,
                    'branchId' => $body['branchId'] ?? $payload['branchId'] ?? $origPayload['branchId'] ?? null,
                    'items' => $repItems,
                    'note' => 'Phần mua mới từ đổi trả (exchange) của HĐ ' . ($origPayload['code'] ?? $id),
                    'status' => 'completed',
                    'value' => collect($repItems)->sum(function ($i) {
                        return (float)($i['amount'] ?? $i['quantity'] ?? 0) * (float)($i['value'] ?? $i['price'] ?? 0);
                    }),
                    'amountProducts' => collect($repItems)->sum(function ($i) {
                        return (float)($i['amount'] ?? $i['quantity'] ?? 0);
                    }),
                    'typePayment' => $salePayments, // when customer pays extra (delta < 0)
                    'paymentLines' => $salePayments,
                    'settlementValue' => $amountDelta < 0 ? abs($amountDelta) : 0,
                    'isExchangeReplacement' => true,
                    'originalSaleId' => $id,
                    'exchangeSource' => 'return-exchange',
                ];
                try {
                    $replacementSaleRecord = $this->createRecord($this->table('sale-payments'), $repPayload, 'sale-payments');
                    $replacementSale = $this->serialize($replacementSaleRecord);
                } catch (\Throwable $e) {
                    // non-fatal
                }
            }

            // Make the sale payload immediately carry refund linkage info (in addition to dynamic enrich compute on reads).
            // This reduces the "special flow" gap between return-exchange and pure /products/refunds.
            try {
                $saleRec = $this->findRecord($table, $id);
                $sp = is_array($saleRec->payload) ? $saleRec->payload : [];
                $sp['refundStatus'] = 'partial'; // will be recomputed accurately on next load via enrich
                $sp['activeRefundCount'] = (int)($sp['activeRefundCount'] ?? 0) + 1;
                $sp['lastRefundAt'] = now()->toISOString();
                $saleRec->forceFill(['payload' => $sp])->save();
            } catch (\Throwable $e) {
                // non-fatal
            }
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

        $base = $this->serialize($record);
        if ($replacementSale) {
            $base['replacementSale'] = $replacementSale;
        }
        return response()->json($base);
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
                'channel' => $payload['channel'] ?? $payload['orderSource'] ?? null,
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
                'channel' => $payload['channel'] ?? null,
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
        $branchIdRaw = $payload['branchId'] ?? $payload['warehouseId'] ?? $payload['branch_id'] ?? null;
        $branch = $this->branch($branchIdRaw) ?? Branch::query()->first();
        if (!$branch) return;
        // Support items, returnedItems (refund/exchange), replacementItems
        $items = $payload['items'] ?? $payload['returnedItems'] ?? $payload['replacementItems'] ?? [];
        foreach ($items as $line) {
            $rawPid = $line['productId'] ?? $line['product_id'] ?? null;
            $pid = is_array($rawPid) ? ($rawPid['_id'] ?? $rawPid['id'] ?? null) : $rawPid;
            $product = $this->product($pid);
            if (!$product || $product->type === 'service') continue;
            $qty = (float) ($line['amount'] ?? $line['quantity'] ?? $line['qty'] ?? 0) * $direction;
            $stock = ProductBranchStock::query()->firstOrCreate(
                ['product_id' => $product->id, 'branch_id' => $branch->id],
                ['qty' => 0, 'locked_quantity' => 0]
            );
            $newQty = max(0, (float) $stock->qty + $qty);
            $stock->forceFill(['qty' => $newQty])->save();
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

    /**
     * Ensure minimal demo data exists (branches + products + sample sales).
     * Called on successful login so the app is usable immediately without manual seeding.
     */
    private function ensureDemoData(): void
    {
        try {
            if (Branch::count() === 0) {
                $b1 = Branch::create(['mongo_id' => $this->localMongoId(), 'name' => 'Cửa hàng Trung tâm', 'code' => 'CN01', 'phone' => '0901234567', 'address' => '123 Nguyễn Trãi, Q1', 'is_active' => true]);
                $b2 = Branch::create(['mongo_id' => $this->localMongoId(), 'name' => 'Chi nhánh Thủ Đức', 'code' => 'CN02', 'phone' => '0907654321', 'address' => '456 Võ Văn Ngân', 'is_active' => true]);
            } else {
                $b1 = Branch::first();
                $b2 = Branch::skip(1)->first() ?: $b1;
            }

            if (Product::count() === 0) {
                $p1 = Product::create(['mongo_id' => $this->localMongoId(), 'name' => 'Son môi Lady Red', 'code' => 'SP001', 'price' => 250000, 'cost' => 120000, 'qty' => 45, 'type' => 'product', 'unit' => 'cái', 'allows_sale' => true, 'status' => 'Mới', 'barcode' => '8931234567890']);
                $p2 = Product::create(['mongo_id' => $this->localMongoId(), 'name' => 'Kem dưỡng da ban ngày', 'code' => 'SP002', 'price' => 320000, 'cost' => 150000, 'qty' => 30, 'type' => 'product', 'unit' => 'hộp', 'allows_sale' => true, 'status' => 'Mới']);
                $p3 = Product::create(['mongo_id' => $this->localMongoId(), 'name' => 'Nước hoa mini 20ml', 'code' => 'SP003', 'price' => 450000, 'cost' => 210000, 'qty' => 18, 'type' => 'product', 'unit' => 'chai', 'allows_sale' => true, 'status' => 'Mới']);

                ProductBranchStock::firstOrCreate(['product_id' => $p1->id, 'branch_id' => $b1?->id], ['mongo_id' => $this->localMongoId(), 'qty' => 30]);
                ProductBranchStock::firstOrCreate(['product_id' => $p1->id, 'branch_id' => $b2?->id], ['mongo_id' => $this->localMongoId(), 'qty' => 15]);
                ProductBranchStock::firstOrCreate(['product_id' => $p2->id, 'branch_id' => $b1?->id], ['mongo_id' => $this->localMongoId(), 'qty' => 20]);
            }

            if (Customer::count() === 0) {
                Customer::create(['mongo_id' => $this->localMongoId(), 'name' => 'Nguyễn Thị Lan', 'code' => 'KH001', 'phone' => '0912345678', 'type' => 'person']);
            }

            $saleTable = (new MirrorRecord())->forTable('sale_payments')->newQuery();
            if ($saleTable->count() === 0) {
                $payload = [
                    'code' => 'HD' . now()->format('ymd') . '01',
                    'customerName' => 'Nguyễn Thị Lan',
                    'items' => [['productId' => 'SP001', 'amount' => 1, 'price' => 250000, 'value' => 250000]],
                    'totalAmount' => 250000,
                    'valuePayment' => 250000,
                    'status' => 'completed',
                    'branchId' => $b1?->id,
                ];
                $saleTable->create([
                    'mongo_id' => $this->localMongoId(),
                    'code' => $payload['code'],
                    'status' => 'completed',
                    'business_date' => now(),
                    'value_payment' => 250000,
                    'payload' => $payload,
                    'branch_id' => $b1?->id,
                ]);
            }
        } catch (\Throwable $e) {
            // non-fatal for login; demo data is best-effort
        }
    }
}
