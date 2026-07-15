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

        if ($resource === 'inventory-checks') {
            $warehouseId = trim((string) ($payload['warehouseId'] ?? $payload['branchId'] ?? $payload['warehouse'] ?? ''));
            if ($warehouseId === '') {
                return response()->json(['message' => 'Vui lòng chọn kho hàng.'], 422);
            }
            if (!$this->branch($warehouseId)) {
                return response()->json(['message' => 'Kho hàng không hợp lệ.'], 422);
            }
        }

        // Ensure channel (from sales-channels routing) is captured even if not in body
        // This fixes sales created from /sales-channels/{channel}/... not having 'channel' in payload
        if (empty($payload['channel'])) {
            $ch = $request->query('channel') ?? $request->input('channel') ?? $request->input('orderSource');
            if ($ch) {
                $payload['channel'] = $ch;
            }
        }

        try {
            $record = DB::transaction(function () use ($table, $payload, $resource) {
                $created = $this->createRecord($table, $payload, $resource);
                if ($resource === 'inventory-checks') {
                    $this->syncInventoryCheckProducts($created, $payload['items'] ?? $payload['lines'] ?? []);
                }
                // Phiếu nhập/xuất kho: UI lưu một bước (không complete) — áp tồn ngay khi tạo.
                if ($resource === 'inventory-vouchers') {
                    $this->applyInventoryVoucherStock($payload);
                }

                return $created;
            });
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($this->serialize($record), 201);
    }

    public function updateMirror(Request $request): JsonResponse
    {
        $resource = (string) $request->route('resource');
        $id = (string) $request->route('id');
        $table = $this->table($resource);
        $record = $this->findRecord($table, $id);
        $oldPayload = is_array($record->payload) ? $record->payload : [];
        $payload = array_merge($oldPayload, $request->all());

        if ($resource === 'inventory-checks') {
            $currentStatus = strtoupper((string) ($record->status ?? (is_array($record->payload) ? ($record->payload['status'] ?? 'DRAFT') : 'DRAFT')));
            // Terminal / submitted audits are not editable via PATCH.
            if (in_array($currentStatus, ['SUBMITTED', 'RECONCILED', 'CANCELLED'], true)) {
                return response()->json([
                    'message' => 'Không thể sửa phiếu kiểm kho ở trạng thái '.$currentStatus.'.',
                ], 422);
            }
            $warehouseId = trim((string) ($payload['warehouseId'] ?? $payload['branchId'] ?? $payload['warehouse'] ?? ''));
            if ($warehouseId === '') {
                return response()->json(['message' => 'Vui lòng chọn kho hàng.'], 422);
            }
            if (!$this->branch($warehouseId)) {
                return response()->json(['message' => 'Kho hàng không hợp lệ.'], 422);
            }
        }

        // Sale edit: only ADMIN may patch completed invoices; cancelled invoices are locked.
        if ($resource === 'sale-payments') {
            $saleStatus = strtolower((string) ($record->status ?? $oldPayload['status'] ?? ''));
            if ($saleStatus === 'cancelled') {
                return response()->json(['message' => 'Hóa đơn đã hủy nên không thể sửa.'], 422);
            }
            if ($saleStatus === 'completed' && !$this->isLocalAdmin($request)) {
                return response()->json([
                    'message' => 'Chỉ tài khoản admin mới được sửa hóa đơn đã hoàn tất.',
                ], 403);
            }
            $refundStatus = strtolower((string) ($oldPayload['refundStatus'] ?? 'none'));
            $activeRefundCount = (int) ($oldPayload['activeRefundCount'] ?? 0);
            if ($saleStatus === 'completed' && ($refundStatus === 'full' || $refundStatus === 'partial' || $activeRefundCount > 0)) {
                return response()->json([
                    'message' => 'Hóa đơn đã phát sinh đổi trả nên không thể sửa.',
                ], 422);
            }
        }

        // Capture channel on update/edit too
        if (empty($payload['channel'])) {
            $ch = $request->query('channel') ?? $request->input('channel') ?? $request->input('orderSource');
            if ($ch) {
                $payload['channel'] = $ch;
            }
        }

        $requestBody = $request->all();
        try {
            DB::transaction(function () use ($record, $table, $payload, $resource, $requestBody, $oldPayload): void {
                // Completed sale edit: apply stock delta (restore old lines, deduct new lines).
                if ($resource === 'sale-payments' && strtolower((string) ($record->status ?? '')) === 'completed') {
                    $this->applySaleStockDelta($oldPayload, $payload);
                }
                $record->forceFill($this->attributes($table, $payload, $resource, $record))->save();
                // Sync product lines when client sends items/lines (create/edit audit form).
                if ($resource === 'inventory-checks' && (array_key_exists('items', $requestBody) || array_key_exists('lines', $requestBody))) {
                    $this->syncInventoryCheckProducts($record, $payload['items'] ?? $payload['lines'] ?? []);
                }
            });
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $record->refresh();

        return response()->json($this->serialize($record));
    }

    public function deleteMirror(Request $request): JsonResponse
    {
        $resource = (string) $request->route('resource');
        $id = (string) $request->route('id');
        $table = $this->table($resource);
        $record = $this->findRecord($table, $id);

        // Sale delete is admin-only (matches retail/wholesale UI).
        if ($resource === 'sale-payments' && !$this->isLocalAdmin($request)) {
            return response()->json([
                'message' => 'Chỉ tài khoản admin mới được xóa hóa đơn.',
            ], 403);
        }

        if ($resource === 'warehouse-transfers') {
            $currentStatus = strtoupper((string) ($record->status ?? ''));
            if ($currentStatus !== 'DRAFT') {
                return response()->json([
                    'message' => 'Chỉ được hủy đơn chuyển kho ở trạng thái Chờ xác nhận xuất (DRAFT).',
                ], 422);
            }

            $payload = is_array($record->payload) ? $record->payload : [];
            $payload['status'] = 'CANCELLED';
            $payload['cancelledAt'] = now()->toISOString();
            $payload['lockedQuantity'] = 0;
            $payload['lines'] = $this->withLineLockedQuantity($payload['lines'] ?? [], 0);
            if ($request->filled('reason')) {
                $payload['cancelReason'] = $request->input('reason');
            }
            $record->forceFill(['status' => 'CANCELLED', 'payload' => $payload])->save();

            return response()->json($this->serialize($record));
        }

        if ($resource === 'inventory-checks') {
            $payload = is_array($record->payload) ? $record->payload : [];
            $currentStatus = strtoupper((string) ($record->status ?? $payload['status'] ?? 'DRAFT'));
            if ($currentStatus !== 'DRAFT') {
                return response()->json([
                    'message' => 'Chỉ được xóa phiếu kiểm kho ở trạng thái nháp (DRAFT).',
                ], 422);
            }
            // Remove product lines tied to this audit only (by code + mongo_id).
            $this->deleteInventoryCheckProducts($record);
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

        // Warehouse transfers: dedicated state machine + stock effects (isolated from other resources).
        if ($resource === 'warehouse-transfers') {
            return $this->actionWarehouseTransfer($request, $record, $action);
        }

        // Sale cancel is admin-only (matches retail/wholesale UI hide of Xóa/Hủy).
        if ($resource === 'sale-payments' && $action === 'cancel' && !$this->isLocalAdmin($request)) {
            return response()->json([
                'message' => 'Chỉ tài khoản admin mới được hủy hóa đơn.',
            ], 403);
        }

        if ($resource === 'inventory-checks') {
            $currentStatus = strtoupper((string) ($record->status ?? $payload['status'] ?? 'DRAFT'));

            // Permission gates: reconcile / reverse-reconcile require ADMIN or root owner.
            if (in_array($action, ['reconcile', 'reverse-reconcile'], true) && !$this->isLocalAdmin($request)) {
                return response()->json([
                    'message' => 'Chỉ quản trị viên (ADMIN/root) mới được thực hiện thao tác bù trừ / đảo bù trừ kiểm kho.',
                ], 403);
            }

            if ($action === 'submit') {
                if (!in_array($currentStatus, ['DRAFT', 'COUNTING'], true)) {
                    return response()->json(['message' => 'Không thể submit phiếu ở trạng thái hiện tại.'], 422);
                }
                $status = 'SUBMITTED';
            } elseif ($action === 'reconcile') {
                if ($currentStatus === 'RECONCILED') {
                    return response()->json(['message' => 'Phiếu kiểm kho đã được bù trừ, không thể bù trừ lại.'], 422);
                }
                if ($currentStatus !== 'SUBMITTED') {
                    return response()->json(['message' => 'Chỉ bù trừ được phiếu đã nộp (SUBMITTED).'], 422);
                }
                try {
                    // Bù trừ: đặt tồn kho đang kiểm = số lượng thực tế (physical).
                    $this->applyInventoryAuditStock($payload, 'to_physical');
                } catch (\InvalidArgumentException $e) {
                    return response()->json(['message' => $e->getMessage()], 422);
                }
                $status = 'RECONCILED';
            } elseif ($action === 'reverse-reconcile') {
                if ($currentStatus !== 'RECONCILED') {
                    return response()->json(['message' => 'Chỉ đảo bù trừ được phiếu đã bù trừ.'], 422);
                }
                try {
                    // Đảo bù trừ: khôi phục tồn về snapshot hệ thống lúc kiểm.
                    $this->applyInventoryAuditStock($payload, 'to_system');
                } catch (\InvalidArgumentException $e) {
                    return response()->json(['message' => $e->getMessage()], 422);
                }
                $status = 'COUNTING';
            } elseif ($action === 'cancel') {
                if (in_array($currentStatus, ['RECONCILED', 'CANCELLED'], true)) {
                    return response()->json(['message' => 'Không thể hủy phiếu đã bù trừ hoặc đã hủy.'], 422);
                }
                if (!in_array($currentStatus, ['DRAFT', 'COUNTING', 'SUBMITTED'], true)) {
                    return response()->json(['message' => 'Không thể hủy phiếu ở trạng thái hiện tại.'], 422);
                }
                $status = 'CANCELLED';
            } elseif ($action === 'resnapshot') {
                if ($currentStatus !== 'COUNTING') {
                    return response()->json(['message' => 'Chỉ chụp lại snapshot được phiếu đang kiểm (COUNTING).'], 422);
                }
                $status = 'COUNTING';
            } else {
                $status = $record->status;
            }
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

        // Route POST .../return-exchange currently defaults action='return' (api.php).
        // Treat both 'return' and 'return-exchange' as the full return-exchange business flow
        // so stock + product-refund + replacement stay in sync (BUG A).
        $isReturnExchange = $resource === 'sale-payments' && in_array($action, ['return', 'return-exchange'], true);

        if ($isReturnExchange) {
            $status = $originalStatus; // do not pollute sale status; refunds tracked separately
        }

        try {
            if ($action === 'complete' && $resource === 'sale-payments' && $record->status !== 'completed') {
                $this->applySaleStock($payload, -1);
            }
            if ($action === 'cancel' && $resource === 'sale-payments' && $record->status === 'completed') {
                $this->applySaleStock($payload, 1);
            }
            if ($action === 'complete' && $resource === 'product-refunds' && $record->status !== 'completed') {
                $this->applySaleStock($payload, 1); // refund complete restores stock to branch
            }
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
        $body = $request->all();

        if ($isReturnExchange) {
            return $this->actionSaleReturnExchange($request, $record, $table, $id, $payload, $body, $originalStatus, $action);
        }

        $payload['status'] = $status;
        $payload[$action.'At'] = now()->toISOString();
        if ($request->filled('reason')) $payload['reason'] = $request->input('reason');

        $updates = ['status' => $status, 'payload' => $payload];
        if ($action === 'complete' && Schema::hasColumn($table, 'completed_at')) {
            $updates['completed_at'] = now();
        }
        $record->forceFill($updates)->save();

        return response()->json($this->serialize($record));
    }

    /**
     * Full return / exchange flow for sale-payments.
     * Accepts route action 'return' (current FE endpoint) and 'return-exchange'.
     * Atomically: stock adjust + product-refund create + optional replacement sale + sale linkage.
     */
    private function actionSaleReturnExchange(
        Request $request,
        MirrorRecord $record,
        string $table,
        string $id,
        array $payload,
        array $body,
        mixed $originalStatus,
        string $action,
    ): JsonResponse {
        $saleStatus = strtolower((string) ($originalStatus ?? $payload['status'] ?? ''));
        if ($saleStatus === 'cancelled') {
            return response()->json(['message' => 'Hóa đơn đã hủy nên không thể đổi trả.'], 422);
        }
        if ($saleStatus !== 'completed') {
            return response()->json(['message' => 'Chỉ hóa đơn đã hoàn tất mới được đổi trả.'], 422);
        }

        $retItems = $body['returnedItems'] ?? $payload['returnedItems'] ?? [];
        if (!is_array($retItems) || $retItems === []) {
            return response()->json(['message' => 'Vui lòng chọn ít nhất một sản phẩm trả hàng.'], 422);
        }

        // Reject over-return: qty returned cannot exceed sold - already returned for each product.
        $soldByProduct = [];
        foreach (($payload['items'] ?? []) as $line) {
            if (!is_array($line)) {
                continue;
            }
            $rawPid = $line['productId'] ?? $line['product_id'] ?? null;
            $pid = is_array($rawPid) ? ($rawPid['_id'] ?? $rawPid['id'] ?? null) : $rawPid;
            if ($pid === null || $pid === '') {
                continue;
            }
            $key = (string) $pid;
            $soldByProduct[$key] = ($soldByProduct[$key] ?? 0.0) + (float) ($line['amount'] ?? $line['quantity'] ?? $line['qty'] ?? 0);
        }
        $alreadyReturnedByProduct = [];
        foreach (($payload['returnedItemsHistory'] ?? $payload['returnedItems'] ?? []) as $line) {
            // Historical aggregate if present on sale payload after prior refunds.
            if (!is_array($line)) {
                continue;
            }
            $rawPid = $line['productId'] ?? $line['product_id'] ?? null;
            $pid = is_array($rawPid) ? ($rawPid['_id'] ?? $rawPid['id'] ?? null) : $rawPid;
            if ($pid === null || $pid === '') {
                continue;
            }
            $key = (string) $pid;
            $alreadyReturnedByProduct[$key] = ($alreadyReturnedByProduct[$key] ?? 0.0)
                + (float) ($line['amount'] ?? $line['quantity'] ?? $line['qty'] ?? 0);
        }
        // Prefer denormalized remaining map / returnedAmounts if FE/backend wrote them.
        if (is_array($payload['returnedAmountsByProduct'] ?? null)) {
            foreach ($payload['returnedAmountsByProduct'] as $pid => $qty) {
                $alreadyReturnedByProduct[(string) $pid] = (float) $qty;
            }
        }
        $requestReturnByProduct = [];
        foreach ($retItems as $line) {
            if (!is_array($line)) {
                continue;
            }
            $rawPid = $line['productId'] ?? $line['product_id'] ?? null;
            $pid = is_array($rawPid) ? ($rawPid['_id'] ?? $rawPid['id'] ?? null) : $rawPid;
            if ($pid === null || $pid === '') {
                continue;
            }
            $key = (string) $pid;
            $qty = (float) ($line['amount'] ?? $line['quantity'] ?? $line['qty'] ?? 0);
            if ($qty <= 0) {
                return response()->json(['message' => 'Số lượng trả hàng phải lớn hơn 0.'], 422);
            }
            $requestReturnByProduct[$key] = ($requestReturnByProduct[$key] ?? 0.0) + $qty;
        }
        foreach ($requestReturnByProduct as $pid => $qty) {
            $sold = (float) ($soldByProduct[$pid] ?? 0);
            $already = (float) ($alreadyReturnedByProduct[$pid] ?? 0);
            $remaining = max(0.0, $sold - $already);
            if ($qty > $remaining + 1e-9) {
                return response()->json([
                    'message' => 'Số lượng trả vượt quá số lượng còn được trả (còn '.$remaining.', yêu cầu '.$qty.').',
                ], 422);
            }
        }

        $repItems = $body['replacementItems'] ?? $payload['replacementItems'] ?? [];
        if (!is_array($repItems)) {
            $repItems = [];
        }

        $refundPayments = is_array($body['refundPayments'] ?? null) ? $body['refundPayments'] : [];
        $salePayments = is_array($body['salePayments'] ?? null) ? $body['salePayments'] : [];

        // Prefer explicit FE totals; fall back to amountDelta / refundAmount; last resort compute from lines.
        $hasExplicitTotal = array_key_exists('totalAmount', $body)
            || array_key_exists('amountDelta', $body)
            || array_key_exists('refundAmount', $body);
        $amountDelta = (float) ($body['totalAmount'] ?? $body['amountDelta'] ?? $body['refundAmount'] ?? 0);
        if (!$hasExplicitTotal) {
            $returnedValue = collect($retItems)->sum(function ($i) {
                return (float) ($i['amount'] ?? $i['quantity'] ?? 0) * (float) ($i['value'] ?? $i['price'] ?? 0);
            });
            $replacementValue = collect($repItems)->sum(function ($i) {
                return (float) ($i['amount'] ?? $i['quantity'] ?? 0) * (float) ($i['value'] ?? $i['price'] ?? 0);
            });
            $amountDelta = $returnedValue - $replacementValue;
        }

        $branchId = $body['branchId'] ?? $payload['branchId'] ?? $payload['warehouseId'] ?? null;
        $channel = trim((string) ($body['channel'] ?? $payload['channel'] ?? $payload['orderSource'] ?? $payload['saleChannel'] ?? ''));
        if ($channel === '') {
            $channel = null;
        }

        $saleMongoId = (string) ($record->mongo_id ?: $id);
        $saleCode = (string) ($record->code ?? $payload['code'] ?? $id);
        $customerId = $payload['customerId'] ?? $body['customerId'] ?? null;
        $customerName = null;
        $customerPhone = null;
        if (is_array($customerId)) {
            $customerName = $customerId['name'] ?? null;
            $customerPhone = $customerId['phone'] ?? null;
            $customerId = $customerId['_id'] ?? $customerId['id'] ?? null;
        }
        $customerName = $body['customerName'] ?? $payload['customerName'] ?? $customerName;
        $customerPhone = $body['customerPhone'] ?? $payload['customerPhone'] ?? $customerPhone;
        if ((!$customerName || !$customerPhone) && $customerId) {
            $cust = $this->customer($customerId);
            if ($cust) {
                $customerName = $customerName ?: $cust->name;
                $customerPhone = $customerPhone ?: $cust->phone;
            }
        }

        $returnedAmount = collect($retItems)->sum(fn ($i) => (float) ($i['amount'] ?? $i['quantity'] ?? 0));
        $returnedValue = collect($retItems)->sum(function ($i) {
            return (float) ($i['amount'] ?? $i['quantity'] ?? 0) * (float) ($i['value'] ?? $i['price'] ?? 0);
        });

        $createdRefund = null;
        $replacementSale = null;

        $reason = $request->filled('reason') ? $request->input('reason') : null;

        try {
            DB::transaction(function () use (
                $record,
                $payload,
                $body,
                $retItems,
                $repItems,
                $refundPayments,
                $salePayments,
                $amountDelta,
                $branchId,
                $channel,
                $saleMongoId,
                $saleCode,
                $customerId,
                $customerName,
                $customerPhone,
                $returnedAmount,
                $returnedValue,
                $action,
                $originalStatus,
                $reason,
                &$createdRefund,
                &$replacementSale,
            ): void {
                // +stock returned, -stock replacements (exactly once)
                $stockBase = array_merge($payload, ['branchId' => $branchId ?? ($payload['branchId'] ?? null)]);
                $this->applySaleStock(array_merge($stockBase, ['items' => $retItems]), 1);
                if ($repItems !== []) {
                    $this->applySaleStock(array_merge($stockBase, ['items' => $repItems]), -1);
                }

                $refundPayload = [
                    'code' => $body['code'] ?? null,
                    'paymentId' => $saleMongoId,
                    'payment_mongo_id' => $saleMongoId,
                    'paymentCode' => $saleCode,
                    'items' => $retItems,
                    'note' => $body['note'] ?? $payload['note'] ?? ($payload['reason'] ?? ''),
                    'branchId' => $branchId,
                    'channel' => $channel,
                    'customerId' => $customerId,
                    'customerName' => $customerName,
                    'customerPhone' => $customerPhone,
                    'value' => $returnedValue,
                    'status' => 'completed',
                    'amount' => $returnedAmount,
                    'totalPayableAmount' => abs($amountDelta),
                    'refundPayments' => $amountDelta >= 0 ? $refundPayments : [],
                    'salePayments' => $amountDelta < 0 ? $salePayments : [],
                    'paymentLines' => $amountDelta >= 0 ? $refundPayments : $salePayments,
                    'amountDelta' => $amountDelta,
                    'totalAmount' => $amountDelta,
                    'refundAmount' => $amountDelta > 0 ? $amountDelta : 0,
                    'settlementValue' => $amountDelta < 0 ? abs($amountDelta) : 0,
                ];
                $createdRefund = $this->createRecord($this->table('product-refunds'), $refundPayload, 'product-refunds');

                if ($repItems !== []) {
                    $saleType = $payload['type'] ?? null;
                    $repPayload = [
                        'code' => ($body['code'] ?? $saleCode ?? 'HD').'-EX'.substr($this->nextSuffix(), -4),
                        'customerId' => $customerId,
                        'customerName' => $customerName,
                        'customerPhone' => $customerPhone,
                        'branchId' => $branchId ?? ($payload['branchId'] ?? null),
                        'channel' => $channel,
                        'type' => $saleType,
                        'items' => $repItems,
                        'note' => 'Phần mua mới từ đổi trả (exchange) của HĐ '.$saleCode,
                        'status' => 'completed',
                        'value' => collect($repItems)->sum(function ($i) {
                            return (float) ($i['amount'] ?? $i['quantity'] ?? 0) * (float) ($i['value'] ?? $i['price'] ?? 0);
                        }),
                        'amountProducts' => collect($repItems)->sum(function ($i) {
                            return (float) ($i['amount'] ?? $i['quantity'] ?? 0);
                        }),
                        'typePayment' => $amountDelta < 0 ? $salePayments : [],
                        'paymentLines' => $amountDelta < 0 ? $salePayments : [],
                        'settlementValue' => $amountDelta < 0 ? abs($amountDelta) : 0,
                        'valuePayment' => $amountDelta < 0 ? abs($amountDelta) : 0,
                        'isExchangeReplacement' => true,
                        'originalSaleId' => $saleMongoId,
                        'exchangeSource' => 'return-exchange',
                    ];
                    $replacementSaleRecord = $this->createRecord($this->table('sale-payments'), $repPayload, 'sale-payments');
                    $replacementSale = $this->serialize($replacementSaleRecord);
                }

                // Sale linkage markers (refundStatus recomputed accurately on read via enrich).
                $sp = is_array($record->payload) ? $record->payload : [];
                $sp['status'] = $originalStatus;
                $sp['activeRefundCount'] = (int) ($sp['activeRefundCount'] ?? 0) + 1;
                $sp['lastRefundAt'] = now()->toISOString();
                $sp[$action.'At'] = now()->toISOString();
                if ($reason !== null && $reason !== '') {
                    $sp['reason'] = $reason;
                }
                // Accumulate returned quantities so subsequent over-return checks stay accurate.
                $returnedMap = is_array($sp['returnedAmountsByProduct'] ?? null) ? $sp['returnedAmountsByProduct'] : [];
                foreach ($retItems as $line) {
                    if (!is_array($line)) {
                        continue;
                    }
                    $rawPid = $line['productId'] ?? $line['product_id'] ?? null;
                    $pid = is_array($rawPid) ? ($rawPid['_id'] ?? $rawPid['id'] ?? null) : $rawPid;
                    if ($pid === null || $pid === '') {
                        continue;
                    }
                    $key = (string) $pid;
                    $returnedMap[$key] = (float) ($returnedMap[$key] ?? 0)
                        + (float) ($line['amount'] ?? $line['quantity'] ?? $line['qty'] ?? 0);
                }
                $sp['returnedAmountsByProduct'] = $returnedMap;
                // Hint only; list/detail of sales recompute via computeSaleRefundSummary.
                if (!isset($sp['refundStatus']) || $sp['refundStatus'] === 'none' || $sp['refundStatus'] === null) {
                    $sp['refundStatus'] = 'partial';
                }
                $record->forceFill([
                    'status' => $originalStatus,
                    'payload' => $sp,
                ])->save();
            });
        } catch (\Throwable $e) {
            return response()->json([
                'message' => $e->getMessage() !== ''
                    ? $e->getMessage()
                    : 'Lỗi khi lưu phiếu đổi trả hàng.',
            ], 500);
        }

        $record->refresh();
        $base = $this->serialize($record);
        if ($createdRefund) {
            $base['refund'] = $this->serialize($createdRefund);
        }
        if ($replacementSale) {
            $base['replacementSale'] = $replacementSale;
        }
        $base['sale'] = $base;

        return response()->json($base);
    }

    /**
     * State machine + stock/lock effects for warehouse-transfers only.
     *
     * NORMAL_TRANSFER:
     * - confirm-source (DRAFT→IN_TRANSIT): lock source available qty
     * - confirm-destination (IN_TRANSIT→COMPLETED): move stock source→dest and unlock
     * - return (IN_TRANSIT→RETURN_IN_PROGRESS): create RETURN_OF_TRANSFER, keep lock, no stock move
     *
     * RETURN_OF_TRANSFER:
     * - confirm-source (DRAFT→IN_TRANSIT): no stock lock (goods never left original source)
     * - confirm-destination (IN_TRANSIT→COMPLETED): unlock original source only; original→RETURNED
     */
    private function actionWarehouseTransfer(Request $request, MirrorRecord $record, string $action): JsonResponse
    {
        $table = $this->table('warehouse-transfers');
        $payload = is_array($record->payload) ? $record->payload : [];
        $status = strtoupper((string) ($record->status ?? $payload['status'] ?? ''));
        $kind = $this->transferKind($payload);
        $allowed = ['confirm-source', 'confirm-destination', 'return'];

        if (! in_array($action, $allowed, true)) {
            return response()->json([
                'message' => 'Thao tác chuyển kho không được hỗ trợ: '.$action,
            ], 422);
        }

        try {
            return match ($action) {
                'confirm-source' => $this->warehouseTransferConfirmSource($record, $payload, $status, $kind),
                'confirm-destination' => $this->warehouseTransferConfirmDestination($record, $payload, $status, $kind),
                'return' => $this->warehouseTransferReturn($request, $record, $payload, $status, $kind, $table),
                default => response()->json(['message' => 'Thao tác chuyển kho không được hỗ trợ.'], 422),
            };
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function transferKind(array $payload): string
    {
        $raw = strtoupper((string) ($payload['kind'] ?? $payload['type'] ?? 'NORMAL_TRANSFER'));

        return in_array($raw, ['RETURN', 'RETURN_OF_TRANSFER'], true)
            ? 'RETURN_OF_TRANSFER'
            : 'NORMAL_TRANSFER';
    }

    private function withLineLockedQuantity(mixed $lines, float $lockedPerLineOrZero): array
    {
        if (! is_array($lines)) {
            return [];
        }

        return array_values(array_map(function ($line) use ($lockedPerLineOrZero) {
            if (! is_array($line)) {
                return $line;
            }
            $line['lockedQuantity'] = $lockedPerLineOrZero;

            return $line;
        }, $lines));
    }

    private function withLinesLockedToRequested(mixed $lines): array
    {
        if (! is_array($lines)) {
            return [];
        }

        return array_values(array_map(function ($line) {
            if (! is_array($line)) {
                return $line;
            }
            $qty = (float) ($line['requestedQuantity'] ?? $line['quantity'] ?? $line['amount'] ?? 0);
            $line['lockedQuantity'] = $qty;

            return $line;
        }, $lines));
    }

    private function warehouseTransferConfirmSource(
        MirrorRecord $record,
        array $payload,
        string $status,
        string $kind
    ): JsonResponse {
        if ($status !== 'DRAFT') {
            return response()->json([
                'message' => 'Chỉ xác nhận xuất được đơn ở trạng thái Chờ xác nhận xuất (DRAFT).',
            ], 422);
        }

        if ($kind === 'RETURN_OF_TRANSFER') {
            // Return doc: no physical lock at return-source (goods never left original source).
            $payload['status'] = 'IN_TRANSIT';
            $payload['kind'] = 'RETURN_OF_TRANSFER';
            $payload['type'] = $payload['type'] ?? 'return';
            $payload['sourceConfirmedAt'] = now()->toISOString();
            $payload['lockedQuantity'] = 0;
            $payload['lines'] = $this->withLineLockedQuantity($payload['lines'] ?? [], 0);
            $record->forceFill(['status' => 'IN_TRANSIT', 'payload' => $payload])->save();

            return response()->json($this->serialize($record));
        }

        $this->applyTransferSourceLock($payload, true);
        $payload['status'] = 'IN_TRANSIT';
        $payload['sourceConfirmedAt'] = now()->toISOString();
        $payload['lines'] = $this->withLinesLockedToRequested($payload['lines'] ?? []);
        $payload['lockedQuantity'] = collect($payload['lines'])->sum(
            fn ($line) => (float) (is_array($line) ? ($line['lockedQuantity'] ?? 0) : 0)
        );
        $record->forceFill(['status' => 'IN_TRANSIT', 'payload' => $payload])->save();

        return response()->json($this->serialize($record));
    }

    private function warehouseTransferConfirmDestination(
        MirrorRecord $record,
        array $payload,
        string $status,
        string $kind
    ): JsonResponse {
        if ($status !== 'IN_TRANSIT') {
            return response()->json([
                'message' => 'Chỉ xác nhận nhận hàng được đơn đang chuyển (IN_TRANSIT).',
            ], 422);
        }

        if ($kind === 'RETURN_OF_TRANSFER') {
            return $this->warehouseTransferReceiveReturn($record, $payload);
        }

        $this->applyTransferReceive($payload);
        $payload['status'] = 'COMPLETED';
        $payload['destinationConfirmedAt'] = now()->toISOString();
        $payload['lockedQuantity'] = 0;
        $payload['lines'] = $this->withLineLockedQuantity($payload['lines'] ?? [], 0);
        $record->forceFill(['status' => 'COMPLETED', 'payload' => $payload])->save();

        return response()->json($this->serialize($record));
    }

    private function warehouseTransferReceiveReturn(MirrorRecord $returnRecord, array $returnPayload): JsonResponse
    {
        $originId = (string) ($returnPayload['originTransferId'] ?? '');
        if ($originId === '') {
            throw new \InvalidArgumentException('Đơn trả hàng thiếu liên kết đơn gốc (originTransferId).');
        }

        $table = $this->table('warehouse-transfers');
        $original = $this->findRecord($table, $originId);
        $originalPayload = is_array($original->payload) ? $original->payload : [];
        $originalStatus = strtoupper((string) ($original->status ?? $originalPayload['status'] ?? ''));

        if ($originalStatus !== 'RETURN_IN_PROGRESS') {
            throw new \InvalidArgumentException(
                'Đơn gốc phải ở trạng thái Đang chờ nhận lại hàng trả (RETURN_IN_PROGRESS).'
            );
        }

        // Unlock stock at ORIGINAL source only — no physical qty move (goods never left source).
        $this->applyTransferSourceLock($originalPayload, false);

        $originalPayload['status'] = 'RETURNED';
        $originalPayload['lockedQuantity'] = 0;
        $originalPayload['lines'] = $this->withLineLockedQuantity($originalPayload['lines'] ?? [], 0);
        $originalPayload['returnReceivedAt'] = now()->toISOString();
        $originalPayload['returnTransferId'] = $originalPayload['returnTransferId']
            ?? ($returnRecord->mongo_id ?: (string) $returnRecord->id);
        $original->forceFill(['status' => 'RETURNED', 'payload' => $originalPayload])->save();

        $returnPayload['status'] = 'COMPLETED';
        $returnPayload['kind'] = 'RETURN_OF_TRANSFER';
        $returnPayload['destinationConfirmedAt'] = now()->toISOString();
        $returnPayload['lockedQuantity'] = 0;
        $returnPayload['lines'] = $this->withLineLockedQuantity($returnPayload['lines'] ?? [], 0);
        $returnPayload['originTransferId'] = $returnPayload['originTransferId']
            ?? ($original->mongo_id ?: (string) $original->id);
        $returnRecord->forceFill(['status' => 'COMPLETED', 'payload' => $returnPayload])->save();

        $base = $this->serialize($returnRecord);
        $base['originTransfer'] = $this->serialize($original);

        return response()->json($base);
    }

    private function warehouseTransferReturn(
        Request $request,
        MirrorRecord $record,
        array $payload,
        string $status,
        string $kind,
        string $table
    ): JsonResponse {
        if ($status !== 'IN_TRANSIT') {
            return response()->json([
                'message' => 'Chỉ báo hoàn chuyển được đơn đang chuyển (IN_TRANSIT).',
            ], 422);
        }

        if ($kind === 'RETURN_OF_TRANSFER') {
            return response()->json([
                'message' => 'Không thể hoàn chuyển trên đơn trả hàng.',
            ], 422);
        }

        $reason = trim((string) $request->input('reason', ''));
        if ($reason === '') {
            return response()->json([
                'message' => 'Vui lòng nhập lý do trả hàng / không nhận.',
            ], 422);
        }

        if (! empty($payload['returnTransferId'])) {
            return response()->json([
                'message' => 'Đơn chuyển này đã có đơn trả hàng, không tạo thêm.',
            ], 422);
        }

        $lines = is_array($payload['lines'] ?? null) ? $payload['lines'] : [];
        $returnCode = 'TR-'.$this->nextSuffix();

        $return = DB::transaction(function () use ($record, $payload, $table, $lines, $reason, $returnCode) {
            $returnPayload = [
                'code' => $returnCode,
                'id' => $returnCode,
                'status' => 'IN_TRANSIT',
                'type' => 'return',
                'kind' => 'RETURN_OF_TRANSFER',
                'originTransferId' => $record->mongo_id ?: (string) $record->id,
                'sourceWarehouseId' => $payload['destinationWarehouseId'] ?? null,
                'destinationWarehouseId' => $payload['sourceWarehouseId'] ?? null,
                'sourceWarehouseName' => $payload['destinationWarehouseName'] ?? null,
                'destinationWarehouseName' => $payload['sourceWarehouseName'] ?? null,
                'lines' => $this->withLineLockedQuantity($lines, 0),
                'qty' => $payload['qty'] ?? collect($lines)->sum(
                    fn ($l) => (float) (is_array($l) ? ($l['requestedQuantity'] ?? $l['quantity'] ?? 0) : 0)
                ),
                'spCount' => $payload['spCount'] ?? count($lines),
                'reason' => $reason,
                'lockedQuantity' => 0,
                'note' => $payload['note'] ?? '',
            ];

            $returnRecord = $this->createRecord($table, $returnPayload, 'warehouse-transfers');

            $payload['status'] = 'RETURN_IN_PROGRESS';
            $payload['reason'] = $reason;
            $payload['returnAt'] = now()->toISOString();
            $payload['returnTransferId'] = $returnRecord->mongo_id ?: (string) $returnRecord->id;
            // Keep line locks on original while awaiting return receive.
            $payload['lines'] = $this->withLinesLockedToRequested($payload['lines'] ?? []);
            $payload['lockedQuantity'] = collect($payload['lines'])->sum(
                fn ($line) => (float) (is_array($line) ? ($line['lockedQuantity'] ?? 0) : 0)
            );
            $record->forceFill(['status' => 'RETURN_IN_PROGRESS', 'payload' => $payload])->save();

            return $returnRecord;
        });

        return response()->json([
            'ok' => true,
            'status' => 'RETURN_IN_PROGRESS',
            'returnTransfer' => $this->serialize($return),
            'originTransfer' => $this->serialize($record->fresh()),
        ]);
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

        // Warehouse transfers: persist display fields in payload (table may lack name/qty/lines columns).
        if ($resource === 'warehouse-transfers') {
            $fromBranch = $this->branch($payload['sourceWarehouseId'] ?? null);
            $toBranch = $this->branch($payload['destinationWarehouseId'] ?? null);
            $normalizedLines = [];
            foreach (is_array($items) ? $items : [] as $line) {
                if (!is_array($line)) {
                    continue;
                }
                $rawPid = $line['productId'] ?? $line['product_id'] ?? null;
                $pid = is_array($rawPid) ? ($rawPid['_id'] ?? $rawPid['id'] ?? null) : $rawPid;
                $lineProduct = $this->product($pid);
                $qty = (float) ($line['requestedQuantity'] ?? $line['quantity'] ?? $line['amount'] ?? 0);
                // DRAFT (and default create) must not pretent stock is locked; actions set locks later.
                $lineLock = array_key_exists('lockedQuantity', $line) || array_key_exists('locked_quantity', $line)
                    ? (float) ($line['lockedQuantity'] ?? $line['locked_quantity'] ?? 0)
                    : 0.0;
                $statusUpper = strtoupper((string) ($payload['status'] ?? $status ?? 'DRAFT'));
                if (in_array($statusUpper, ['DRAFT', 'COMPLETED', 'RETURNED', 'CANCELLED'], true)) {
                    $lineLock = 0.0;
                }
                $normalizedLines[] = array_merge($line, [
                    'productId' => $lineProduct?->mongo_id ?? $pid,
                    'productCode' => $line['productCode'] ?? $lineProduct?->code,
                    'productName' => $line['productName'] ?? $lineProduct?->name,
                    'unit' => $line['unit'] ?? $lineProduct?->unit ?? '',
                    'quantity' => $qty,
                    'requestedQuantity' => $qty,
                    'dispatchedQuantity' => (float) ($line['dispatchedQuantity'] ?? $qty),
                    'receivedQuantity' => (float) ($line['receivedQuantity'] ?? $qty),
                    'lockedQuantity' => $lineLock,
                    'note' => $line['note'] ?? '',
                ]);
            }
            $items = $normalizedLines;
            $payload['lines'] = $normalizedLines;
            $payload['sourceWarehouseId'] = $fromBranch?->mongo_id ?? ($payload['sourceWarehouseId'] ?? null);
            $payload['destinationWarehouseId'] = $toBranch?->mongo_id ?? ($payload['destinationWarehouseId'] ?? null);
            $payload['sourceWarehouseName'] = $fromBranch?->name ?? ($payload['sourceWarehouseName'] ?? null);
            $payload['destinationWarehouseName'] = $toBranch?->name ?? ($payload['destinationWarehouseName'] ?? null);
            $payload['kind'] = $payload['kind']
                ?? (in_array(strtoupper((string) ($payload['type'] ?? '')), ['RETURN', 'RETURN_OF_TRANSFER'], true)
                    ? 'RETURN_OF_TRANSFER'
                    : 'NORMAL_TRANSFER');
            $payload['qty'] = collect($normalizedLines)->sum(fn (array $line): float => (float) ($line['requestedQuantity'] ?? 0));
            $payload['spCount'] = count($normalizedLines);
            $payload['lockedQuantity'] = collect($normalizedLines)->sum(fn (array $line): float => (float) ($line['lockedQuantity'] ?? 0));
            $payload['id'] = $payload['id'] ?? $code;
        }

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
                'qty' => collect($items ?? [])->sum(fn ($i) => (float) (
                    $i['physicalQuantity']
                    ?? $i['actualStock']
                    ?? $i['actual_stock']
                    ?? 0
                )),
                'note' => $payload['note'] ?? null,
                'missing_sp' => $payload['missingSp'] ?? null,
                'balance' => $payload['balance'] ?? null,
            ],
        ][$table] ?? [];

        return $this->onlyExisting($table, array_merge($attrs, $extra));
    }

    /**
     * Lock (or unlock) transfer quantities at source warehouse without changing on-hand qty.
     * @param  bool  $lock  true = lock on confirm-source, false = unlock (rollback helper)
     */
    private function applyTransferSourceLock(array $payload, bool $lock): void
    {
        $source = $this->branch($payload['sourceWarehouseId'] ?? null);
        if (!$source) {
            throw new \InvalidArgumentException('Không xác định được kho nguồn để khóa tồn.');
        }

        $lines = is_array($payload['lines'] ?? null) ? $payload['lines'] : [];
        if ($lines === []) {
            throw new \InvalidArgumentException('Đơn chuyển kho không có dòng sản phẩm.');
        }

        DB::transaction(function () use ($lines, $source, $lock): void {
            foreach ($lines as $line) {
                if (!is_array($line)) {
                    continue;
                }
                $rawPid = $line['productId'] ?? $line['product_id'] ?? null;
                $pid = is_array($rawPid) ? ($rawPid['_id'] ?? $rawPid['id'] ?? null) : $rawPid;
                $product = $this->product($pid);
                if (!$product || $product->type === 'service') {
                    continue;
                }
                $qty = (float) ($line['requestedQuantity'] ?? $line['quantity'] ?? $line['amount'] ?? 0);
                if ($qty <= 0) {
                    continue;
                }

                $stock = ProductBranchStock::query()->firstOrCreate(
                    ['product_id' => $product->id, 'branch_id' => $source->id],
                    ['qty' => 0, 'locked_quantity' => 0, 'mongo_id' => $this->localMongoId()]
                );

                $onHand = (float) $stock->qty;
                $locked = (float) $stock->locked_quantity;
                if ($lock) {
                    $available = $onHand - $locked;
                    if ($available + 1e-9 < $qty) {
                        throw new \InvalidArgumentException(
                            "Không đủ tồn khả dụng để xuất {$product->code}: cần {$qty}, còn {$available}."
                        );
                    }
                    $stock->forceFill(['locked_quantity' => $locked + $qty])->save();
                } else {
                    $stock->forceFill(['locked_quantity' => max(0, $locked - $qty)])->save();
                }
            }
        });
    }

    /**
     * Receive transfer at destination: deduct+unlock source, add destination on-hand.
     */
    private function applyTransferReceive(array $payload): void
    {
        $source = $this->branch($payload['sourceWarehouseId'] ?? null);
        $destination = $this->branch($payload['destinationWarehouseId'] ?? null);
        if (!$source || !$destination) {
            throw new \InvalidArgumentException('Không xác định được kho nguồn/kho đích để nhận hàng.');
        }

        $lines = is_array($payload['lines'] ?? null) ? $payload['lines'] : [];
        if ($lines === []) {
            throw new \InvalidArgumentException('Đơn chuyển kho không có dòng sản phẩm.');
        }

        DB::transaction(function () use ($lines, $source, $destination): void {
            foreach ($lines as $line) {
                if (!is_array($line)) {
                    continue;
                }
                $rawPid = $line['productId'] ?? $line['product_id'] ?? null;
                $pid = is_array($rawPid) ? ($rawPid['_id'] ?? $rawPid['id'] ?? null) : $rawPid;
                $product = $this->product($pid);
                if (!$product || $product->type === 'service') {
                    continue;
                }
                $qty = (float) ($line['requestedQuantity'] ?? $line['quantity'] ?? $line['amount'] ?? 0);
                if ($qty <= 0) {
                    continue;
                }

                $sourceStock = ProductBranchStock::query()->firstOrCreate(
                    ['product_id' => $product->id, 'branch_id' => $source->id],
                    ['qty' => 0, 'locked_quantity' => 0, 'mongo_id' => $this->localMongoId()]
                );
                $destStock = ProductBranchStock::query()->firstOrCreate(
                    ['product_id' => $product->id, 'branch_id' => $destination->id],
                    ['qty' => 0, 'locked_quantity' => 0, 'mongo_id' => $this->localMongoId()]
                );

                $sourceQty = (float) $sourceStock->qty;
                $sourceLocked = (float) $sourceStock->locked_quantity;
                if ($sourceQty + 1e-9 < $qty) {
                    throw new \InvalidArgumentException(
                        "Không đủ tồn kho nguồn để hoàn tất {$product->code}: cần {$qty}, còn {$sourceQty}."
                    );
                }

                $sourceStock->forceFill([
                    'qty' => max(0, $sourceQty - $qty),
                    'locked_quantity' => max(0, $sourceLocked - $qty),
                ])->save();
                $destStock->forceFill([
                    'qty' => (float) $destStock->qty + $qty,
                ])->save();
                $product->forceFill(['qty' => (float) $product->stocks()->sum('qty')])->save();
            }
        });
    }

    /**
     * Apply stock for inventory import/export vouchers created in a single save step.
     * import / nhap → +qty; export / xuat → -qty. Draft-only types without items are no-ops.
     */
    private function applyInventoryVoucherStock(array $payload): void
    {
        $type = strtolower(trim((string) (
            $payload['type']
            ?? $payload['importExportType']
            ?? $payload['import_export_type']
            ?? ''
        )));
        $typeAscii = strtolower((string) Str::ascii($type));
        $direction = 0;
        if (in_array($typeAscii, ['import', 'nhap', 'in', 'stock_in', 'nhap kho'], true)
            || str_contains($typeAscii, 'nhap')
            || str_contains($typeAscii, 'import')) {
            $direction = 1;
        } elseif (in_array($typeAscii, ['export', 'xuat', 'out', 'stock_out', 'xuat kho'], true)
            || str_contains($typeAscii, 'xuat')
            || str_contains($typeAscii, 'export')) {
            $direction = -1;
        }
        if ($direction === 0) {
            return;
        }
        // Normalize items key for applySaleStock (supports items/lines).
        $items = $payload['items'] ?? $payload['lines'] ?? $payload['products'] ?? [];
        if (!is_array($items) || $items === []) {
            return;
        }
        $this->applySaleStock(array_merge($payload, ['items' => $items]), $direction);
    }

    /**
     * Inventory audit reconcile: set branch stock to physical qty (or restore system snapshot).
     * Lines without a counted physical quantity are skipped (not adjusted).
     *
     * @param  'to_physical'|'to_system'  $mode
     */
    private function applyInventoryAuditStock(array $payload, string $mode): void
    {
        $branch = $this->branch($payload['warehouseId'] ?? $payload['branchId'] ?? $payload['warehouse'] ?? null);
        if (!$branch) {
            throw new \InvalidArgumentException('Không xác định được kho để bù trừ kiểm kho.');
        }
        $items = $payload['items'] ?? $payload['lines'] ?? [];
        if (!is_array($items) || $items === []) {
            return;
        }

        DB::transaction(function () use ($items, $branch, $mode): void {
            foreach ($items as $line) {
                if (!is_array($line)) {
                    continue;
                }
                $rawPid = $line['productId'] ?? $line['product_id'] ?? null;
                $pid = is_array($rawPid) ? ($rawPid['_id'] ?? $rawPid['id'] ?? null) : $rawPid;
                $product = $this->product($pid);
                if (!$product || $product->type === 'service') {
                    continue;
                }
                $physicalRaw = $line['physicalQuantity'] ?? $line['actualStock'] ?? $line['actual_stock'] ?? null;
                if ($physicalRaw === null || $physicalRaw === '') {
                    // Not counted — leave stock unchanged.
                    continue;
                }
                $system = (float) ($line['systemQuantitySnapshot'] ?? $line['stock'] ?? $line['system_quantity'] ?? 0);
                $physical = (float) $physicalRaw;
                $target = $mode === 'to_system' ? $system : $physical;
                if ($target < 0) {
                    throw new \InvalidArgumentException(
                        'Số lượng tồn sau bù trừ không được âm (sản phẩm '.($product->code ?: $product->name).').'
                    );
                }
                $stock = ProductBranchStock::query()->firstOrCreate(
                    ['product_id' => $product->id, 'branch_id' => $branch->id],
                    ['qty' => 0, 'locked_quantity' => 0, 'mongo_id' => $this->localMongoId()]
                );
                $stock->forceFill(['qty' => $target])->save();
                $product->forceFill(['qty' => (float) $product->stocks()->sum('qty')])->save();
            }
        });
    }

    private function applySaleStock(array $payload, int $direction): void
    {
        $branchIdRaw = $payload['branchId'] ?? $payload['warehouseId'] ?? $payload['warehouse'] ?? $payload['branch_id'] ?? null;
        $branch = $this->branch($branchIdRaw) ?? Branch::query()->first();
        if (!$branch) return;
        // Support items, returnedItems (refund/exchange), replacementItems
        $items = $payload['items'] ?? $payload['returnedItems'] ?? $payload['replacementItems'] ?? [];
        foreach ($items as $line) {
            if (!is_array($line)) {
                continue;
            }
            $rawPid = $line['productId'] ?? $line['product_id'] ?? null;
            $pid = is_array($rawPid) ? ($rawPid['_id'] ?? $rawPid['id'] ?? null) : $rawPid;
            $product = $this->product($pid);
            if (!$product || $product->type === 'service') continue;
            $lineQty = (float) ($line['amount'] ?? $line['quantity'] ?? $line['qty'] ?? 0);
            if ($lineQty <= 0) {
                continue;
            }
            $qty = $lineQty * $direction;
            $stock = ProductBranchStock::query()->firstOrCreate(
                ['product_id' => $product->id, 'branch_id' => $branch->id],
                ['qty' => 0, 'locked_quantity' => 0, 'mongo_id' => $this->localMongoId()]
            );
            $current = (float) $stock->qty;
            // Selling (direction < 0) must not go below zero — reject oversell.
            if ($qty < 0 && $current + 1e-9 < abs($qty)) {
                throw new \InvalidArgumentException(
                    'Số lượng sản phẩm "'.($product->name ?: $product->code).'" vượt quá tồn kho của cửa hàng (cần '
                    .abs($qty).', còn '.$current.').'
                );
            }
            $newQty = max(0, $current + $qty);
            $stock->forceFill(['qty' => $newQty])->save();
            $product->forceFill(['qty' => (float) $product->stocks()->sum('qty')])->save();
        }
    }

    /**
     * When editing a completed sale, adjust stock by line delta only:
     * sold more → decrease stock; sold less → restore stock.
     */
    private function applySaleStockDelta(array $oldPayload, array $newPayload): void
    {
        $branchIdRaw = $newPayload['branchId']
            ?? $newPayload['warehouseId']
            ?? $oldPayload['branchId']
            ?? $oldPayload['warehouseId']
            ?? null;
        $branch = $this->branch($branchIdRaw);
        if (!$branch) {
            throw new \InvalidArgumentException('Không xác định được kho để điều chỉnh tồn khi sửa hóa đơn.');
        }

        $sumByProduct = static function (array $payload): array {
            $map = [];
            $items = $payload['items'] ?? [];
            if (!is_array($items)) {
                return $map;
            }
            foreach ($items as $line) {
                if (!is_array($line)) {
                    continue;
                }
                $rawPid = $line['productId'] ?? $line['product_id'] ?? null;
                $pid = is_array($rawPid) ? ($rawPid['_id'] ?? $rawPid['id'] ?? null) : $rawPid;
                if ($pid === null || $pid === '') {
                    continue;
                }
                $key = (string) $pid;
                $map[$key] = ($map[$key] ?? 0.0) + (float) ($line['amount'] ?? $line['quantity'] ?? $line['qty'] ?? 0);
            }

            return $map;
        };

        $oldMap = $sumByProduct($oldPayload);
        $newMap = $sumByProduct($newPayload);
        $productIds = array_unique(array_merge(array_keys($oldMap), array_keys($newMap)));

        foreach ($productIds as $pid) {
            $oldQty = (float) ($oldMap[$pid] ?? 0);
            $newQty = (float) ($newMap[$pid] ?? 0);
            $deltaSold = $newQty - $oldQty; // positive = sold more → stock decreases
            if (abs($deltaSold) < 1e-9) {
                continue;
            }
            $product = $this->product($pid);
            if (!$product || $product->type === 'service') {
                continue;
            }
            $stock = ProductBranchStock::query()->firstOrCreate(
                ['product_id' => $product->id, 'branch_id' => $branch->id],
                ['qty' => 0, 'locked_quantity' => 0, 'mongo_id' => $this->localMongoId()]
            );
            $current = (float) $stock->qty;
            if ($deltaSold > 0 && $current + 1e-9 < $deltaSold) {
                throw new \InvalidArgumentException(
                    'Số lượng sản phẩm "'.($product->name ?: $product->code).'" vượt quá tồn kho của cửa hàng (cần thêm '
                    .$deltaSold.', còn '.$current.').'
                );
            }
            $stock->forceFill(['qty' => max(0, $current - $deltaSold)])->save();
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

    /**
     * Keep inventory_check_products in sync so /inventory-audit-items list is not empty
     * when items live primarily in the parent audit payload.
     */
    private function syncInventoryCheckProducts(MirrorRecord $audit, mixed $items): void
    {
        if (!is_array($items)) {
            $items = [];
        }

        $this->deleteInventoryCheckProducts($audit);

        $branch = $this->branch($audit->branch_id ?? $audit->branch_mongo_id ?? null);
        $payloadRoot = is_array($audit->payload) ? $audit->payload : [];
        $warehouseId = (string) ($payloadRoot['warehouseId'] ?? $branch?->id ?? $audit->branch_id ?? '');
        $warehouseName = (string) ($payloadRoot['warehouseName'] ?? $payloadRoot['warehouse'] ?? $branch?->name ?? $audit->warehouse_name ?? '');

        foreach ($items as $index => $line) {
            if (!is_array($line)) {
                continue;
            }
            $productId = $line['productId'] ?? $line['product_id'] ?? null;
            $product = $this->product($productId);
            $system = (float) ($line['systemQuantitySnapshot'] ?? $line['stock'] ?? $line['system_quantity'] ?? 0);
            $physicalRaw = $line['physicalQuantity'] ?? $line['actualStock'] ?? $line['actual_stock'] ?? null;
            $physical = ($physicalRaw === null || $physicalRaw === '') ? null : (float) $physicalRaw;
            $variance = (float) ($line['varianceQuantity'] ?? $line['difference'] ?? (
                $physical === null ? 0 : ($physical - $system)
            ));

            $linePayload = array_merge($line, [
                'auditId' => (string) ($audit->mongo_id ?: $audit->id),
                'auditCode' => (string) ($audit->code ?? ''),
                'warehouseId' => $warehouseId,
                'warehouse' => $warehouseName,
                'warehouseName' => $warehouseName,
                'productId' => (string) ($product?->id ?? $productId ?? ''),
                'productCode' => (string) ($line['productCodeSnapshot'] ?? $line['productCode'] ?? $line['product_code'] ?? $product?->code ?? ''),
                'productName' => (string) ($line['productNameSnapshot'] ?? $line['productName'] ?? $line['product_name'] ?? $product?->name ?? ''),
                'barcode' => (string) ($line['barcodeSnapshot'] ?? $line['barcode'] ?? $product?->barcode ?? ''),
                'stock' => $system,
                'systemQuantitySnapshot' => $system,
                'actualStock' => $physical,
                'physicalQuantity' => $physical,
                'difference' => $variance,
                'varianceQuantity' => $variance,
                'description' => (string) ($line['note'] ?? $line['description'] ?? ''),
                'createdAt' => now()->toISOString(),
            ]);

            // `code` is UNIQUE on mirror tables — use per-line code, keep parent audit code in payload.
            $lineCode = trim((string) ($audit->code ?? ''));
            $lineCode = $lineCode !== '' ? ($lineCode.'#'.$index) : ('LINE-'.$this->nextSuffix().'-'.$index);

            $attrs = $this->onlyExisting('inventory_check_products', [
                'mongo_id' => $this->localMongoId(),
                'code' => $lineCode,
                'name' => $linePayload['productName'] ?: null,
                'status' => (string) ($audit->status ?? 'DRAFT'),
                'type' => null,
                'amount' => $physical,
                'value' => null,
                'total' => null,
                'branch_mongo_id' => $branch?->mongo_id ?? $audit->branch_mongo_id,
                'product_mongo_id' => $product?->mongo_id,
                'business_date' => $audit->business_date ?? now(),
                'payload' => $linePayload,
                'branch_id' => $branch?->id ?? $audit->branch_id,
                'product_id' => $product?->id,
                'product_code' => $linePayload['productCode'] ?: null,
                'product_name' => $linePayload['productName'] ?: null,
                'barcode' => $linePayload['barcode'] ?: null,
                'stock' => $system,
                'actual_stock' => $physical,
                'difference' => $variance,
                'warehouse_name' => $warehouseName ?: null,
            ]);

            (new MirrorRecord())->forTable('inventory_check_products')->newQuery()->create($attrs);
        }
    }

    private function deleteInventoryCheckProducts(MirrorRecord $audit): void
    {
        $code = trim((string) ($audit->code ?? ''));
        $auditKey = (string) ($audit->mongo_id ?: $audit->id);
        if ($code === '' && $auditKey === '') {
            return;
        }

        // Strict scope: parent code, per-line "{code}#n", or payload.auditId.
        (new MirrorRecord())->forTable('inventory_check_products')->newQuery()
            ->where(function ($builder) use ($code, $auditKey): void {
                if ($code !== '') {
                    $builder->where('code', $code)
                        ->orWhere('code', 'like', $code.'#%')
                        ->orWhere('payload->auditCode', $code);
                }
                if ($auditKey !== '') {
                    $builder->orWhere('payload->auditId', $auditKey);
                }
            })
            ->delete();
    }

    private function onlyExisting(string $table, array $attrs): array
    {
        $columns = array_flip(Schema::getColumnListing($table));
        return array_filter($attrs, fn ($key) => isset($columns[$key]), ARRAY_FILTER_USE_KEY);
    }

    /**
     * Admin gate: requires valid local-laravel-token-{id} for ADMIN or root owner.
     * Used for inventory audit reconcile and sale cancel/delete/edit of completed invoices.
     * Does not use unauthenticated ADMIN fallback (unlike /auth/me).
     */
    private function isLocalAdmin(Request $request): bool
    {
        $authHeader = (string) $request->header('Authorization', '');
        if (!preg_match('/local-laravel-token-(\d+)/', $authHeader, $matches)) {
            return false;
        }
        $user = User::find((int) $matches[1]);
        if (!$user) {
            return false;
        }

        return (bool) $user->is_root_owner || strtoupper((string) $user->role) === 'ADMIN';
    }

    /** @deprecated Use isLocalAdmin() — kept as alias for older call sites / clarity in inventory audit. */
    private function isInventoryAuditAdmin(Request $request): bool
    {
        return $this->isLocalAdmin($request);
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

            // Standard payment methods required by retail/wholesale create forms.
            $pmTable = (new MirrorRecord())->forTable('payment_methods')->newQuery();
            if ($pmTable->count() === 0) {
                $defaults = [
                    ['code' => 'cash', 'name' => 'Tiền mặt', 'sortOrder' => 1],
                    ['code' => 'bank_transfer', 'name' => 'Chuyển khoản', 'sortOrder' => 2],
                    ['code' => 'installment', 'name' => 'Trả góp', 'sortOrder' => 3],
                ];
                foreach ($defaults as $method) {
                    $pmTable->create([
                        'mongo_id' => $this->localMongoId(),
                        'code' => $method['code'],
                        'name' => $method['name'],
                        'status' => 'active',
                        'business_date' => now(),
                        'payload' => [
                            'code' => $method['code'],
                            'name' => $method['name'],
                            'isActive' => true,
                            'sortOrder' => $method['sortOrder'],
                        ],
                    ]);
                }
            }
        } catch (\Throwable $e) {
            // non-fatal for login; demo data is best-effort
        }
    }
}
