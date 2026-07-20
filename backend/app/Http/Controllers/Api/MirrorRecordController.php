<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\MirrorRecord;
use App\Models\Product;
use App\Models\User;
use App\Support\LocalToken;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class MirrorRecordController extends Controller
{
    private const SETTINGS_RESOURCES = ['audit-logs', 'menu-items', 'permissions', 'roles', 'store-settings'];

    private const PUBLIC_TRANSFER_STATUSES = [
        'DRAFT' => 'Chờ xác nhận xuất',
        'IN_TRANSIT' => 'Đang chuyển',
        'RETURN_IN_PROGRESS' => 'Đang chờ nhận lại hàng trả',
        'COMPLETED' => 'Hoàn thành',
        'RETURNED' => 'Đã trả hàng / Đã mở khóa',
        'CANCELLED' => 'Đã hủy',
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

    /**
     * Gate sensitive inventory-check mirror aliases (same sensitivity as /inventory-audits).
     */
    private function requireAuthForSensitiveResource(Request $request): ?JsonResponse
    {
        $user = LocalToken::resolve($request);
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated. Vui lòng đăng nhập lại.'], 401);
        }

        return null;
    }

    private function enrich(array $serialized, string $resource, string $table): array
    {
        $serialized = match ($resource) {
            'product-refunds' => $this->enrichRefund($serialized),
            'sale-payments' => $this->enrichSalePayment($serialized),
            'warehouse-transfers' => $this->enrichWarehouseTransfer($serialized),
            'payment-methods' => $this->enrichPaymentMethod($serialized),
            default => $serialized,
        };

        if ($resource === 'customer-cares') {
            $serialized = $this->enrichCustomerCare($serialized);
        }

        return $serialized;
    }

    /**
     * Normalize payment method mirror rows for FE consumers
     * (RetailInvoiceCreatePage, RefundInvoiceCreatePage, SalesPage).
     */
    private function enrichPaymentMethod(array $serialized): array
    {
        $code = (string) ($serialized['code'] ?? '');
        $name = (string) ($serialized['name'] ?? '');

        $isActive = true;
        if (array_key_exists('isActive', $serialized)) {
            $isActive = (bool) $serialized['isActive'];
        } elseif (array_key_exists('is_active', $serialized)) {
            $isActive = (bool) $serialized['is_active'];
        } elseif (isset($serialized['status'])) {
            $status = strtolower((string) $serialized['status']);
            $isActive = !in_array($status, ['inactive', 'disabled', '0', 'false'], true);
        }

        $sortOrder = (int) ($serialized['sortOrder'] ?? $serialized['sort_order'] ?? 0);

        $serialized['code'] = $code;
        $serialized['name'] = $name !== '' ? $name : ($code !== '' ? $code : 'Phương thức thanh toán');
        $serialized['isActive'] = $isActive;
        $serialized['is_active'] = $isActive;
        $serialized['sortOrder'] = $sortOrder;
        $serialized['sort_order'] = $sortOrder;

        return $serialized;
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

    private function normalizeTransferLine(array $line, string $status = '', string $kind = 'NORMAL_TRANSFER'): array
    {
        $quantity = (float) ($line['requestedQuantity'] ?? $line['quantity'] ?? $line['amount'] ?? 0);
        $hasExplicitLock = array_key_exists('lockedQuantity', $line) || array_key_exists('locked_quantity', $line);
        $rawLock = $hasExplicitLock
            ? (float) ($line['lockedQuantity'] ?? $line['locked_quantity'] ?? 0)
            : null;

        return array_merge($line, [
            'productId' => $line['productId'] ?? $line['product_id'] ?? null,
            'productCode' => $line['productCode'] ?? $line['product_code'] ?? null,
            'productName' => $line['productName'] ?? $line['product_name'] ?? null,
            'unit' => $line['unit'] ?? '',
            'requestedQuantity' => (float) ($line['requestedQuantity'] ?? $quantity),
            'dispatchedQuantity' => (float) ($line['dispatchedQuantity'] ?? $line['dispatched_quantity'] ?? $quantity),
            'receivedQuantity' => (float) ($line['receivedQuantity'] ?? $line['received_quantity'] ?? $quantity),
            // Effective lock is status-aware — never default terminal/draft lines to requested qty.
            'lockedQuantity' => $this->effectiveTransferLineLock($status, $kind, $quantity, $rawLock),
            'note' => $line['note'] ?? '',
        ]);
    }

    /**
     * Effective locked quantity for display/invariants.
     * DRAFT/COMPLETED/RETURNED/CANCELLED => 0.
     * RETURN_OF_TRANSFER docs do not hold the stock lock (original does).
     * IN_TRANSIT / RETURN_IN_PROGRESS normal: explicit lock, else legacy fallback = requested qty.
     */
    private function effectiveTransferLineLock(string $status, string $kind, float $quantity, ?float $rawLock): float
    {
        if (in_array($status, ['DRAFT', 'COMPLETED', 'RETURNED', 'CANCELLED'], true)) {
            return 0.0;
        }

        if ($kind === 'RETURN_OF_TRANSFER') {
            return 0.0;
        }

        if (in_array($status, ['IN_TRANSIT', 'RETURN_IN_PROGRESS'], true)) {
            if ($rawLock !== null) {
                return max(0.0, $rawLock);
            }

            return max(0.0, $quantity);
        }

        return 0.0;
    }

    private function enrichWarehouseTransfer(array $serialized): array
    {
        $status = $this->normalizeStatus((string) ($serialized['status'] ?? ''));
        $rawKind = strtoupper((string) ($serialized['kind'] ?? $serialized['type'] ?? 'NORMAL_TRANSFER'));
        $kind = in_array($rawKind, ['RETURN', 'RETURN_OF_TRANSFER'], true) ? 'RETURN_OF_TRANSFER' : 'NORMAL_TRANSFER';
        $lines = is_array($serialized['lines'] ?? null) ? $serialized['lines'] : [];
        $lines = array_values(array_map(
            fn ($line): array => $this->normalizeTransferLine(is_array($line) ? $line : [], $status, $kind),
            $lines
        ));
        $qty = array_sum(array_map(fn (array $line): float => (float) ($line['requestedQuantity'] ?? 0), $lines));
        $lockedQty = array_sum(array_map(fn (array $line): float => (float) ($line['lockedQuantity'] ?? 0), $lines));

        $serialized['status'] = $status;
        $serialized['statusLabel'] = $this->transferStatusLabel($status);
        $serialized['statusTone'] = $this->transferStatusTone($status);
        $serialized['kind'] = $kind;
        $serialized['lines'] = $lines;
        $serialized['spCount'] = (int) ($serialized['spCount'] ?? $serialized['sp_count'] ?? count($lines));
        $serialized['qty'] = (float) ($serialized['qty'] ?? $qty);
        // Always recompute from status-aware line locks — do not trust stale payload lockedQuantity.
        $serialized['lockedQuantity'] = $lockedQty;
        $serialized['sourceWarehouseId'] = $serialized['sourceWarehouseId'] ?? $serialized['from_branch_mongo_id'] ?? null;
        $serialized['destinationWarehouseId'] = $serialized['destinationWarehouseId'] ?? $serialized['to_branch_mongo_id'] ?? null;
        $serialized['sourceWarehouseName'] = $serialized['sourceWarehouseName'] ?? $serialized['source_warehouse_name'] ?? null;
        $serialized['destinationWarehouseName'] = $serialized['destinationWarehouseName'] ?? $serialized['destination_warehouse_name'] ?? null;

        // Resolve warehouse display names from MySQL branches when payload/legacy rows lack names.
        if (empty($serialized['sourceWarehouseName']) && !empty($serialized['sourceWarehouseId'])) {
            $sourceBranch = Branch::query()
                ->where('mongo_id', $serialized['sourceWarehouseId'])
                ->orWhere('id', $serialized['sourceWarehouseId'])
                ->first();
            if ($sourceBranch) {
                $serialized['sourceWarehouseName'] = $sourceBranch->name;
                $serialized['sourceWarehouseId'] = $sourceBranch->mongo_id ?: (string) $sourceBranch->id;
            }
        }
        if (empty($serialized['destinationWarehouseName']) && !empty($serialized['destinationWarehouseId'])) {
            $destBranch = Branch::query()
                ->where('mongo_id', $serialized['destinationWarehouseId'])
                ->orWhere('id', $serialized['destinationWarehouseId'])
                ->first();
            if ($destBranch) {
                $serialized['destinationWarehouseName'] = $destBranch->name;
                $serialized['destinationWarehouseId'] = $destBranch->mongo_id ?: (string) $destBranch->id;
            }
        }
        $serialized['sourceExportBillId'] = $serialized['sourceExportBillId'] ?? $serialized['source_export_bill_mongo_id'] ?? null;
        $serialized['destinationImportBillId'] = $serialized['destinationImportBillId'] ?? $serialized['destination_import_bill_mongo_id'] ?? null;

        // Normalize common display fields from mirror columns (business_date, created_at, creator) so FE display (date/createdAt/creator) is reliable regardless of payload shape.
        $serialized['date'] = $serialized['date'] ?? $serialized['business_date'] ?? $serialized['created_at'] ?? $serialized['date_send'] ?? null;
        $serialized['createdAt'] = $serialized['createdAt'] ?? $serialized['created_at'] ?? $serialized['date'] ?? null;
        $serialized['creator'] = $serialized['creator'] ?? $serialized['created_by'] ?? null;

        // Permission flags: admin/root = 2 chiều; employee = 1 chiều theo kho được gán.
        $access = $this->resolveTransferWarehouseAccess(request());
        $sourceId = (string) ($serialized['sourceWarehouseId'] ?? '');
        $destId = (string) ($serialized['destinationWarehouseId'] ?? '');
        $canActOnSource = $access['isAdminOrRoot'] || ($sourceId !== '' && in_array($sourceId, $access['warehouseMongoIds'], true));
        $canActOnDest = $access['isAdminOrRoot'] || ($destId !== '' && in_array($destId, $access['warehouseMongoIds'], true));

        $serialized['canEdit'] = $status === 'DRAFT' && $canActOnSource;
        $serialized['canCancel'] = $status === 'DRAFT' && $canActOnSource;
        $serialized['canConfirmSource'] = $status === 'DRAFT' && $canActOnSource;
        $serialized['canConfirmDestination'] = $status === 'IN_TRANSIT' && $canActOnDest;
        $serialized['canReturn'] = $status === 'IN_TRANSIT' && $kind !== 'RETURN_OF_TRANSFER' && ($canActOnSource || $canActOnDest);
        $serialized['canPrint'] = $status === 'COMPLETED' || $status === 'RETURN_IN_PROGRESS' || $status === 'IN_TRANSIT';
        $serialized['audits'] = $serialized['audits'] ?? [];

        return $serialized;
    }

    /**
     * Resolve warehouse access for transfer UI/actions.
     * Admin/root owner: all active warehouses (2-way). Employee: assigned/default warehouses only (1-way).
     *
     * @return array{user: ?User, isAdminOrRoot: bool, warehouseMongoIds: array<int, string>, localBranchIds: array<int, int>}
     */
    private function resolveTransferWarehouseAccess(?Request $request = null): array
    {
        $request = $request ?? request();
        $user = LocalToken::resolve($request);

        $activeBranches = Branch::query()
            ->where('is_active', true)
            ->get(['id', 'mongo_id']);

        if (! $user) {
            return [
                'user' => null,
                'isAdminOrRoot' => false,
                'warehouseMongoIds' => [],
                'localBranchIds' => [],
            ];
        }

        $role = strtoupper((string) ($user->role ?: 'EMPLOYEE'));
        $isAdminOrRoot = (bool) $user->is_root_owner || $role === 'ADMIN';

        if ($isAdminOrRoot) {
            return [
                'user' => $user,
                'isAdminOrRoot' => true,
                'warehouseMongoIds' => $activeBranches->pluck('mongo_id')->filter()->values()->all(),
                'localBranchIds' => $activeBranches->pluck('id')->map(fn ($id) => (int) $id)->all(),
            ];
        }

        $localIds = [];
        if ($user->default_warehouse_id) {
            $localIds[] = (int) $user->default_warehouse_id;
        }
        if ($user->branch_id) {
            $localIds[] = (int) $user->branch_id;
        }
        if (Schema::hasTable('user_warehouse_assignments')) {
            $assignRows = DB::table('user_warehouse_assignments')
                ->where('user_id', $user->id)
                ->pluck('branch_id')
                ->map(fn ($v) => (int) $v)
                ->all();
            $localIds = array_merge($localIds, $assignRows);
        }
        $localIds = array_values(array_unique(array_filter($localIds)));

        $branchMap = $activeBranches->keyBy('id');
        $mongoIds = [];
        foreach ($localIds as $lid) {
            if ($b = $branchMap->get($lid)) {
                if ($b->mongo_id) {
                    $mongoIds[] = (string) $b->mongo_id;
                }
            }
        }

        return [
            'user' => $user,
            'isAdminOrRoot' => false,
            'warehouseMongoIds' => array_values(array_unique($mongoIds)),
            'localBranchIds' => $localIds,
        ];
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

        // Normalize createdAt for consistent date display in refund list (createdAt / business_date / created_at)
        $serialized['createdAt'] = $serialized['createdAt'] ?? $serialized['created_at'] ?? $serialized['business_date'] ?? null;
        if (!isset($serialized['created_at']) || $serialized['created_at'] === null) {
            $serialized['created_at'] = $serialized['createdAt'];
        }

        return $serialized;
    }

    private function enrichSalePayment(array $serialized): array
    {
        $branchIdRaw = $serialized['branch_mongo_id'] ?? $serialized['branchId'] ?? null;
        if ($branchIdRaw && !is_array($branchIdRaw)) {
            $branch = $this->lookupBranchForSale((string) $branchIdRaw);
            if ($branch) {
                $serialized['branchId'] = $branch;
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

        // Legacy import rows often only have denormalized customerName/phone in payload.
        if (empty($serialized['customerId']) || (!is_array($serialized['customerId']) && !$serialized['customerId'])) {
            $customerName = $serialized['customerName'] ?? $serialized['customer_name'] ?? null;
            $customerPhone = $serialized['customerPhone'] ?? $serialized['customer_phone'] ?? null;
            if ($customerName || $customerPhone) {
                $serialized['customerId'] = [
                    'name' => $customerName ?: 'Khách lẻ',
                    'phone' => $customerPhone,
                ];
            }
        }

        // Enrich creator/author name from users table (MySQL) so retail list/detail/export shows real staff name instead of '—'
        $authorIdRaw = $serialized['author_id'] ?? $serialized['user_id'] ?? $serialized['authorId'] ?? $serialized['userId'] ?? null;
        $authorId = is_array($authorIdRaw) ? ($authorIdRaw['id'] ?? $authorIdRaw['_id'] ?? null) : $authorIdRaw;
        if ($authorId && !is_array($serialized['authorId'] ?? null)) {
            $user = User::query()
                ->where('id', $authorId)
                ->orWhere('mongo_id', $authorId)
                ->first();
            if ($user) {
                $serialized['authorId'] = [
                    '_id' => $user->mongo_id ?: (string) $user->id,
                    'id' => $user->id,
                    'name' => $user->name,
                ];
                $serialized['userId'] = $serialized['authorId'];
            }
        }

        // Creator string from legacy import when user join is unavailable.
        if (empty($serialized['authorId']) && !empty($serialized['creator'])) {
            $serialized['authorId'] = [
                'name' => (string) $serialized['creator'],
            ];
            $serialized['userId'] = $serialized['authorId'];
        }

        $items = $serialized['items'] ?? [];
        if (is_array($items)) {
            foreach ($items as $index => $item) {
                if (!is_array($item)) {
                    continue;
                }
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
                // Normalize line totals for list gross / print.
                if (!isset($item['value']) && isset($item['price'])) {
                    $item['value'] = $item['price'];
                }
                if (!isset($item['productName']) && isset($item['name'])) {
                    $item['productName'] = $item['name'];
                }
                $items[$index] = $item;
            }
            $serialized['items'] = $items;
        }

        // Monetary normalization: legacy import uses totalAmount / valuePayment; column value may be null.
        $value = $serialized['value'] ?? null;
        $valueFromItems = false;
        if ($value === null || $value === '' || !is_numeric($value)) {
            $value = $serialized['totalAmount'] ?? $serialized['total_amount'] ?? null;
        }
        if (($value === null || $value === '' || !is_numeric($value)) && is_array($serialized['items'] ?? null)) {
            $value = 0;
            $valueFromItems = true;
            foreach ($serialized['items'] as $item) {
                if (!is_array($item)) {
                    continue;
                }
                $lineTotal = $item['total'] ?? null;
                if ($lineTotal === null || $lineTotal === '' || !is_numeric($lineTotal)) {
                    $unit = (float) ($item['value'] ?? $item['price'] ?? 0);
                    $qty = (float) ($item['amount'] ?? $item['quantity'] ?? 0);
                    $lineTotal = $unit * $qty;
                }
                $value += (float) $lineTotal;
            }
        }

        $discount = $serialized['discountValue'] ?? $serialized['discount_value'] ?? $serialized['discount'] ?? 0;
        $serialized['discountValue'] = is_numeric($discount) ? (float) $discount : 0;
        $discountType = $serialized['discountType']
            ?? $serialized['discount_type']
            ?? (isset($serialized['discount']) && is_numeric($serialized['discount']) ? 'number' : 'number');
        $serialized['discountType'] = $discountType;

        // When net total was reconstructed from line items only (legacy retail create
        // omitted `value`), apply order-level discount so totals match payments.
        // percent rate is only valid in (0, 100]; larger values are treated as money
        // (legacy rows sometimes store money amount with discount_type=percent).
        $grossFromItems = (float) ($value ?? 0);
        if ($valueFromItems && $serialized['discountValue'] > 0 && $grossFromItems > 0) {
            $typeNorm = strtolower(trim((string) $discountType));
            $isPercent = in_array($typeNorm, ['percent', 'percentage', '%'], true);
            $discEntered = (float) $serialized['discountValue'];
            if ($isPercent && $discEntered > 0 && $discEntered <= 100) {
                $value = max(0.0, round($grossFromItems * (1 - ($discEntered / 100)), 2));
            } else {
                // fixed money, or percent type with mis-tagged money amount (>100)
                $value = max(0.0, round($grossFromItems - $discEntered, 2));
            }
        }

        $serialized['value'] = (float) ($value ?? 0);

        $paid = $serialized['valuePayment'] ?? $serialized['value_payment'] ?? null;
        if ($paid === null || $paid === '' || !is_numeric($paid)) {
            $paid = $serialized['value'];
        }
        $serialized['valuePayment'] = (float) $paid;
        $serialized['value_payment'] = $serialized['valuePayment'];

        // Normalize payment lines for FE paymentRows (expects typePayment[].methodId.name + amount).
        if (empty($serialized['typePayment']) && !empty($serialized['payment_lines']) && is_array($serialized['payment_lines'])) {
            $serialized['typePayment'] = array_values(array_filter(array_map(function ($line) {
                if (!is_array($line)) {
                    return null;
                }
                $amount = (float) ($line['amount'] ?? 0);
                if ($amount <= 0) {
                    return null;
                }
                $label = $line['methodId']['name'] ?? $line['method'] ?? $line['name'] ?? 'Thanh toán';

                return [
                    'methodId' => is_array($line['methodId'] ?? null)
                        ? $line['methodId']
                        : ['name' => (string) $label, 'code' => $line['code'] ?? null],
                    'amount' => $amount,
                ];
            }, $serialized['payment_lines'])));
        }

        // Build typePayment rows from legacy paymentMethod label when structured lines are missing.
        if (empty($serialized['typePayment'])) {
            $methodLabel = $serialized['paymentMethod'] ?? $serialized['payment_method'] ?? null;
            if ($methodLabel && $serialized['valuePayment'] > 0) {
                $serialized['typePayment'] = [[
                    'methodId' => [
                        'name' => (string) $methodLabel,
                        'code' => null,
                    ],
                    'amount' => $serialized['valuePayment'],
                ]];
            }
        }

        $serialized['createdAt'] = $serialized['createdAt']
            ?? $serialized['created_at']
            ?? $serialized['business_date']
            ?? null;
        if (!isset($serialized['created_at']) || $serialized['created_at'] === null) {
            $serialized['created_at'] = $serialized['createdAt'];
        }

        // Compute refund linkage so Retail list + guards (refundStatus, remaining, activeCount) stay in sync
        $refundInfo = $this->computeSaleRefundSummary($serialized);
        $serialized = array_merge($serialized, $refundInfo);

        return $serialized;
    }

    private function lookupBranchForSale(?string $identifier): ?array
    {
        if (!$identifier) return null;

        // Prefer direct Branch model (source of truth post branches integration)
        $b = Branch::query()
            ->where('id', $identifier)
            ->orWhere('mongo_id', $identifier)
            ->orWhere('code', $identifier)
            ->first();
        if ($b) {
            return [
                '_id' => $b->mongo_id ?: (string) $b->id,
                'id' => $b->id,
                'name' => $b->name,
                'code' => $b->code,
                'address' => $b->address,
                'phone' => $b->phone,
                'invoiceProfile' => $b->invoice_profile ?? null,
            ];
        }

        // Fallback to mirror record if branches were stored via mirror
        $record = $this->mirrorRecord('branches', $identifier);
        if ($record) {
            return [
                '_id' => $record['_id'] ?? $identifier,
                'name' => $record['name'] ?? null,
                'code' => $record['code'] ?? null,
                'address' => $record['address'] ?? null,
                'phone' => $record['phone'] ?? null,
                'invoiceProfile' => $record['invoiceProfile'] ?? $record['invoice_profile'] ?? null,
            ];
        }
        return null;
    }

    /**
     * Search customer-cares by ticket code, customer identity, reason/details/description/creator.
     * Matches both denormalized SQL columns and legacy JSON payload camelCase/snake keys so
     * keyword search aligns with enrichCustomerCare display fields (CARE-012).
     * Scoped only to customer-cares — does not change SEARCH_COLUMNS for other resources.
     */
    private function applyCustomerCareSearch($query, string $search, $columns): void
    {
        $like = '%'.$search.'%';

        $query->where(function ($builder) use ($like, $columns): void {
            foreach ([
                'code',
                'customer_name',
                'customer_phone',
                'customer_code',
                'reason',
                'description',
                'details',
                'creator',
                'name',
            ] as $column) {
                if ($columns->has($column)) {
                    $builder->orWhere($column, 'like', $like);
                }
            }

            // Payload keys used by FE/enrich (portable Laravel JSON path, same style as product-refunds).
            foreach ([
                'code',
                'customerName',
                'customer_name',
                'name',
                'customerPhone',
                'customer_phone',
                'customerCode',
                'customer_code',
                'reason',
                'description',
                'details',
                'creator',
            ] as $jsonKey) {
                $builder->orWhere('payload->'.$jsonKey, 'like', $like);
            }
        });
    }

    /**
     * Search product-refunds by refund code, original invoice code, payment id,
     * and customer name/phone (denormalized payload + linked sale_payments/customers).
     * Scoped only to product-refunds resource.
     * Uses Laravel JSON path syntax for MySQL/SQLite portability (no JSON_UNQUOTE).
     */
    private function applyProductRefundSearch($query, string $search, $columns): void
    {
        // Escape LIKE wildcards so RF-027 keywords like % _ \ do not expand to full-table scans.
        // MySQL default ESCAPE is backslash, so \% and \_ are literals.
        $escaped = addcslashes($search, "%_\\");
        $like = '%'.$escaped.'%';
        $salePaymentsTable = MirrorRecord::TABLES['sale-payments'] ?? 'sale_payments';
        $customersTable = 'customers';

        $query->where(function ($builder) use ($like, $columns, $salePaymentsTable, $customersTable): void {
            // Column matches when present on product_refunds.
            foreach (['code', 'name', 'customer_name', 'customer_phone', 'note', 'payment_mongo_id'] as $column) {
                if ($columns->has($column)) {
                    $builder->orWhere($column, 'like', $like);
                }
            }

            // Payload denormalized fields written by return-exchange (portable JSON path).
            foreach ([
                'code',
                'note',
                'customerName',
                'customerPhone',
                'customer_name',
                'customer_phone',
                'paymentCode',
                'payment_code',
                'paymentId',
                'payment_mongo_id',
            ] as $jsonKey) {
                $builder->orWhere('payload->'.$jsonKey, 'like', $like);
            }

            // Linked original sale by payment_mongo_id / payload.paymentId → sale_payments.code
            if (Schema::hasTable($salePaymentsTable)) {
                $builder->orWhereExists(function ($sub) use ($like, $salePaymentsTable, $columns): void {
                    $sub->select(DB::raw(1))
                        ->from($salePaymentsTable.' as sp')
                        ->where(function ($link) use ($columns): void {
                            if ($columns->has('payment_mongo_id')) {
                                $link->whereColumn('sp.mongo_id', 'product_refunds.payment_mongo_id')
                                    ->orWhereColumn('sp.code', 'product_refunds.payment_mongo_id');
                            }
                            $link->orWhereColumn('sp.mongo_id', 'product_refunds.payload->paymentId')
                                ->orWhereColumn('sp.mongo_id', 'product_refunds.payload->payment_mongo_id');
                        })
                        ->where(function ($saleMatch) use ($like): void {
                            $saleMatch->where('sp.code', 'like', $like)
                                ->orWhere('sp.mongo_id', 'like', $like)
                                ->orWhere('sp.payload->code', 'like', $like)
                                ->orWhere('sp.payload->customerName', 'like', $like)
                                ->orWhere('sp.payload->customerPhone', 'like', $like);
                        });
                });

                // Linked customer name/phone via sale_payments
                if (Schema::hasTable($customersTable)) {
                    $builder->orWhereExists(function ($sub) use ($like, $salePaymentsTable, $customersTable, $columns): void {
                        $sub->select(DB::raw(1))
                            ->from($salePaymentsTable.' as sp')
                            ->join($customersTable.' as c', 'c.mongo_id', '=', 'sp.customer_mongo_id')
                            ->where(function ($link) use ($columns): void {
                                if ($columns->has('payment_mongo_id')) {
                                    $link->whereColumn('sp.mongo_id', 'product_refunds.payment_mongo_id');
                                }
                                $link->orWhereColumn('sp.mongo_id', 'product_refunds.payload->paymentId');
                            })
                            ->where(function ($custMatch) use ($like): void {
                                $custMatch->where('c.name', 'like', $like)
                                    ->orWhere('c.phone', 'like', $like)
                                    ->orWhere('c.code', 'like', $like);
                            });
                    });
                }
            }
        });
    }

    private function computeSaleRefundSummary(array $serialized): array
    {
        $saleId = (string) ($serialized['_id'] ?? $serialized['id'] ?? $serialized['mongoId'] ?? '');
        $saleMongo = (string) ($serialized['mongoId'] ?? $serialized['_id'] ?? '');
        if (!$saleId && !$saleMongo) {
            return ['refundStatus' => 'none', 'refund_status' => 'none', 'remainingReturnableQuantity' => 0, 'activeRefundCount' => 0];
        }

        // Targeted query (use payment_mongo_id column + json fallback) instead of full table scan + php filter
        $possibleIds = array_values(array_unique(array_filter([
            $saleId,
            $saleMongo,
            (string) ($serialized['localId'] ?? ''),
        ])));

        $refundQuery = (new MirrorRecord())->forTable('product_refunds')->newQuery();
        $refundQuery->where(function ($q) use ($possibleIds) {
            if (!empty($possibleIds)) {
                $q->whereIn('payment_mongo_id', $possibleIds);
            }
            foreach ($possibleIds as $pid) {
                if ($pid !== '') {
                    $q->orWhereRaw("JSON_EXTRACT(payload, '$.paymentId') = ?", [$pid]);
                    $q->orWhereRaw("JSON_EXTRACT(payload, '$.payment_mongo_id') = ?", [$pid]);
                    $q->orWhereRaw("JSON_EXTRACT(payload, '$.payment_id') = ?", [$pid]);
                }
            }
        });

        $linked = $refundQuery->get();

        $active = $linked->filter(fn ($r) => strtoupper((string) ($r->status ?? '')) !== 'CANCELLED');
        $activeCount = $active->count();

        $returnedQty = 0.0;
        $returnedByProduct = [];
        foreach ($linked as $r) {
            $its = is_array($r->payload['items'] ?? null)
                ? $r->payload['items']
                : (is_array($r->getAttribute('items')) ? $r->getAttribute('items') : []);
            foreach ($its as $it) {
                $q = (float) ($it['amount'] ?? $it['quantity'] ?? $it['qty'] ?? 0);
                $pidRaw = $it['productId'] ?? $it['product_id'] ?? '';
                $pid = is_array($pidRaw) ? ($pidRaw['_id'] ?? $pidRaw['id'] ?? '') : $pidRaw;
                if ($pid) {
                    $returnedByProduct[$pid] = ($returnedByProduct[$pid] ?? 0) + $q;
                }
                $returnedQty += $q;
            }
        }

        $soldQty = 0.0;
        $saleItems = is_array($serialized['items'] ?? null) ? $serialized['items'] : [];
        foreach ($saleItems as $it) {
            $soldQty += (float) ($it['amount'] ?? $it['quantity'] ?? $it['qty'] ?? 0);
        }

        $remaining = max(0, $soldQty - $returnedQty);
        $rStatus = 'none';
        if ($activeCount > 0 || $returnedQty > 0) {
            $rStatus = $remaining <= 0 ? 'full' : 'partial';
        }

        return [
            'refundStatus' => $rStatus,
            'refund_status' => $rStatus,
            'remainingReturnableQuantity' => $remaining,
            'activeRefundCount' => $activeCount,
            'returnedQuantityByProduct' => $returnedByProduct,
        ];
    }

    public function index(Request $request, string $resource): JsonResponse
    {
        $table = MirrorRecord::TABLES[$resource] ?? null;

        abort_if($table === null, 404, 'Unknown mirror resource.');

        if (in_array($resource, self::SETTINGS_RESOURCES, true)) {
            if ($deny = $this->requireSettingsAdmin($request)) {
                return $deny;
            }
        }

        // inventory-checks / inventory-check-products: same data as /inventory-audits — require auth.
        if (in_array($resource, ['inventory-checks', 'inventory-check-products'], true)) {
            if ($deny = $this->requireAuthForSensitiveResource($request)) {
                return $deny;
            }
        }

        $page = max((int) $request->query('page', 1), 1);
        $limitParam = $request->query('limit', $request->query('perPage', 20));
        $limit = min(max((int) $limitParam, 1), 5000);
        $query = (new MirrorRecord())->forTable($table)->newQuery();
        $columns = collect(Schema::getColumnListing($table))->flip();

        // Cap search length to keep product-refund EXISTS/LIKE queries bounded (RF-027).
        $search = mb_substr(trim((string) $request->query('q', $request->query('search', $request->query('keyword', '')))), 0, 120);
        if ($resource === 'sale-payments') {
            $search = trim((string) $request->query('invoiceCode', $request->query('code', $search)));
        } elseif ($resource === 'warehouse-transfers') {
            $search = trim((string) $request->query('id', $request->query('code', $search)));
        }
        if ($search !== '') {
            if ($resource === 'product-refunds') {
                // Dedicated search for refund list: code, original invoice, customer name/phone.
                // Do not broaden SEARCH_COLUMNS for other resources (BUG C).
                $this->applyProductRefundSearch($query, $search, $columns);
            } elseif ($resource === 'customer-cares') {
                // Care list displays customerName from column OR payload camelCase (enrichCustomerCare).
                // Generic SEARCH_COLUMNS only hits SQL columns, so payload-only names (e.g. "Chị Huệ") miss.
                $this->applyCustomerCareSearch($query, $search, $columns);
            } else {
                $query->where(function ($builder) use ($search, $columns): void {
                    foreach (self::SEARCH_COLUMNS as $column) {
                        if ($columns->has($column)) {
                            $builder->orWhere($column, 'like', "%{$search}%");
                        }
                    }
                });
            }
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
                if ($resource === 'sale-payments' && $field === 'type' && $value === 'retail') {
                    // For retail lists: include records with type='retail' OR no type (legacy without explicit type)
                    $query->where(function ($q) use ($field, $value) {
                        $q->where($field, $value)->orWhereNull($field);
                    });
                } elseif (is_string($value) && str_contains($value, ',')) {
                    $query->whereIn($field, array_filter(array_map('trim', explode(',', $value))));
                } else {
                    $query->where($field, $value);
                }
            }
        }

        // Support camelCase aliases from FE (e.g. logType) and date filters for product-edit-logs
        if ($resource === 'product-edit-logs') {
            $logAliases = [
                'logType' => 'log_type',
                'logAction' => 'log_action',
                'createdBy' => 'created_by',
            ];
            foreach ($logAliases as $camel => $snake) {
                if ($columns->has($snake)) {
                    $val = $request->query($camel, $request->query($snake));
                    if ($val !== null && $val !== '') {
                        $query->where($snake, $val);
                    }
                }
            }
            // Ưu tiên business_date (nghiệp vụ) cho filter ngày lịch sử, fallback created_at
            $dateCol = $columns->has('business_date') ? 'business_date' : ($columns->has('created_at') ? 'created_at' : null);
            if ($dateCol) {
                if ($from = trim((string) $request->query('fromDate', ''))) {
                    $query->whereDate($dateCol, '>=', $from);
                }
                if ($to = trim((string) $request->query('toDate', ''))) {
                    $query->whereDate($dateCol, '<=', $to);
                }
            }
        }

        // Support reason/creator filters for customer cares (columns not in generic FILTER_COLUMNS)
        if ($resource === 'customer-cares') {
            if ($request->filled('reason') && $columns->has('reason')) {
                $query->where('reason', $request->query('reason'));
            }
            if ($request->filled('creator') && $columns->has('creator')) {
                $query->where('creator', $request->query('creator'));
            }
        }

        if ($resource === 'sale-payments') {
            $this->applySalePaymentExtraFilters($request, $query, $columns);
        } elseif ($resource === 'warehouse-transfers') {
            $this->applyWarehouseTransferFilters($request, $query, $columns);
        }

        // Apply channel filter for product-refunds (scoped per sales-channel like /sales-channels/store/refund).
        // Strict: only records with explicit matching channel (no auto-include of null-channel legacy records).
        // Per audit: null channel records are not assumed to belong to 'store' unless payment/order provides mapping.
        // Total/pagination computed at query level before enrich.
        if ($resource === 'product-refunds') {
            $ch = trim((string) $request->query('channel', ''));
            if ($ch !== '') {
                if ($columns->has('channel')) {
                    $query->where('channel', $ch);
                } else {
                    $query->where(function ($q) use ($ch) {
                        $q->whereRaw("JSON_EXTRACT(payload, '$.channel') = ?", [$ch])
                          ->orWhereRaw("JSON_EXTRACT(payload, '$.orderSource') = ?", [$ch])
                          ->orWhereRaw("JSON_EXTRACT(payload, '$.saleChannel') = ?", [$ch]);
                    });
                }
            }
        }

        $sortInput = (string) $request->query('sort', 'business_date');
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
        $sort = $sortAliases[$sortInput] ?? $sortInput;

        if ($resource === 'product-edit-logs') {
            // Ưu tiên business_date cho sort thời gian log, createdAt alias sang business_date
            if ($sort === 'created_at' || $sortInput === 'createdAt') {
                $sort = 'business_date';
            }
            if (!$columns->has($sort)) {
                $sort = $columns->has('business_date') ? 'business_date' : 'created_at';
            }
        } else {
            if (!$columns->has($sort)) {
                $sort = $columns->has('business_date') ? 'business_date' : 'created_at';
            }
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

        // Post-filter safety net (for any records that bypassed query filter, e.g. very old payloads).
        // For product-refunds: strict match only (nulls excluded, as they are not proven to belong to the channel).
        if ($resource === 'sale-payments' || $resource === 'product-refunds') {
            $ch = trim((string) $request->query('channel', ''));
            if ($ch !== '') {
                $items = array_values(array_filter($items, function ($rec) use ($ch, $resource) {
                    $c = $rec['channel'] ?? $rec['orderSource'] ?? $rec['saleChannel'] ?? null;
                    if ($resource === 'product-refunds') {
                        return (string) $c === $ch; // strict for refunds
                    }
                    return $c === null || (string) $c === $ch; // legacy lenient for sales
                }));
            }
        }

        // Normalize product-edit-logs to provide camelCase fields expected by frontend (productCode, productName, logType, etc.)
        // Backend stores snake_case (product_code, ...) from legacy + columns; ensure both for compat.
        if ($resource === 'product-edit-logs') {
            $items = array_map(function (array $rec): array {
                $rec['productCode'] = $rec['productCode'] ?? $rec['product_code'] ?? $rec['code'] ?? $rec['product_id'] ?? '';
                $rec['productName'] = $rec['productName'] ?? $rec['product_name'] ?? $rec['name'] ?? '';
                $rec['logType'] = $rec['logType'] ?? $rec['log_type'] ?? '';
                $rec['logAction'] = $rec['logAction'] ?? $rec['log_action'] ?? '';
                $rec['createdBy'] = $rec['createdBy'] ?? $rec['created_by'] ?? $rec['creator'] ?? '';
                // Ưu tiên business_date (nghiệp vụ log) cho createdAt, fallback created_at
                $rec['createdAt'] = $rec['createdAt'] ?? $rec['business_date'] ?? $rec['created_at'] ?? null;
                if (!isset($rec['business_date']) || $rec['business_date'] === null) {
                    $rec['business_date'] = $rec['createdAt'];
                }
                // ensure snake too
                if (!isset($rec['product_code']) || $rec['product_code'] === '') {
                    $rec['product_code'] = $rec['productCode'];
                }
                if (!isset($rec['product_name']) || $rec['product_name'] === '') {
                    $rec['product_name'] = $rec['productName'];
                }
                if (!isset($rec['log_type']) || $rec['log_type'] === '') {
                    $rec['log_type'] = $rec['logType'];
                }
                if (!isset($rec['log_action']) || $rec['log_action'] === '') {
                    $rec['log_action'] = $rec['logAction'];
                }
                if (!isset($rec['created_by']) || $rec['created_by'] === '') {
                    $rec['created_by'] = $rec['createdBy'];
                }
                if (!isset($rec['created_at']) || $rec['created_at'] === null) {
                    $rec['created_at'] = $rec['createdAt'];
                }
                return $rec;
            }, $items);
        }

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
        // Server-side channel filter (supports direct column from writes + JSON payload fallback for legacy).
        // Lenient: include records where channel matches or is not set (so legacy data without channel still appears for default 'store').
        $ch = trim((string) $request->query('channel', ''));
        if ($ch !== '') {
            if ($columns->has('channel')) {
                $query->where(function ($q) use ($ch) {
                    $q->where('channel', $ch)->orWhereNull('channel');
                });
            } else {
                $query->where(function ($q) use ($ch) {
                    $q->whereRaw("JSON_EXTRACT(payload, '$.channel') = ?", [$ch])
                      ->orWhereRaw("JSON_EXTRACT(payload, '$.orderSource') = ?", [$ch])
                      ->orWhereRaw("JSON_EXTRACT(payload, '$.saleChannel') = ?", [$ch])
                      ->orWhereNull(DB::raw("JSON_EXTRACT(payload, '$.channel')"));
                });
            }
        }

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
            // Support both mongo (24char) and local numeric product ids (for local sqlite mirror)
            $matchingProductIds = Product::query()
                ->where(function ($builder) use ($productKeyword): void {
                    $builder->where('name', 'like', "%{$productKeyword}%")
                        ->orWhere('code', 'like', "%{$productKeyword}%")
                        ->orWhere('barcode', 'like', "%{$productKeyword}%");
                })
                ->pluck('mongo_id')
                ->map(fn ($id): string => (string) $id)
                ->filter()
                ->merge(
                    Product::query()
                        ->where(function ($builder) use ($productKeyword): void {
                            $builder->where('name', 'like', "%{$productKeyword}%")
                                ->orWhere('code', 'like', "%{$productKeyword}%")
                                ->orWhere('barcode', 'like', "%{$productKeyword}%");
                        })
                        ->pluck('id')
                        ->map(fn ($id): string => (string) $id)
                        ->filter()
                )
                ->unique()
                ->values()
                ->all();

            if (empty($matchingProductIds)) {
                $query->whereRaw('1 = 0');
                return;
            }

            $jsonValues = collect($matchingProductIds)
                ->map(fn ($id): string => DB::getPdo()->quote($id))
                ->implode(',');

            // Support variable length ids (mongo or local numeric strings)
            $query->whereRaw(
                'EXISTS (SELECT 1 FROM JSON_TABLE(items, "$[*]" COLUMNS(productId VARCHAR(255) PATH "$.productId")) AS jt WHERE jt.productId IN ('.$jsonValues.'))'
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

        // Scope tabs by warehouse membership for non-admin (1 chiều):
        // draft/outgoing → kho nguồn thuộc user; incoming → kho đích thuộc user.
        $access = $this->resolveTransferWarehouseAccess($request);
        if (! $access['isAdminOrRoot'] && $access['warehouseMongoIds'] !== []) {
            $mongoIds = $access['warehouseMongoIds'];
            $localIds = $access['localBranchIds'];
            if ($tab === 'draft' || $tab === 'outgoing') {
                $query->where(function ($builder) use ($columns, $mongoIds, $localIds): void {
                    if ($columns->has('from_branch_mongo_id')) {
                        $builder->whereIn('from_branch_mongo_id', $mongoIds);
                    }
                    if ($columns->has('from_branch_id') && $localIds !== []) {
                        $builder->orWhereIn('from_branch_id', $localIds);
                    }
                });
            } elseif ($tab === 'incoming') {
                $query->where(function ($builder) use ($columns, $mongoIds, $localIds): void {
                    if ($columns->has('to_branch_mongo_id')) {
                        $builder->whereIn('to_branch_mongo_id', $mongoIds);
                    }
                    if ($columns->has('to_branch_id') && $localIds !== []) {
                        $builder->orWhereIn('to_branch_id', $localIds);
                    }
                });
            }
            // tab=all: still visible for transparency of assigned warehouses only
            if ($tab === 'all' && ! $request->filled('sourceWarehouseId') && ! $request->filled('destinationWarehouseId')) {
                $query->where(function ($builder) use ($columns, $mongoIds, $localIds): void {
                    if ($columns->has('from_branch_mongo_id')) {
                        $builder->whereIn('from_branch_mongo_id', $mongoIds);
                    }
                    if ($columns->has('to_branch_mongo_id')) {
                        $builder->orWhereIn('to_branch_mongo_id', $mongoIds);
                    }
                    if ($columns->has('from_branch_id') && $localIds !== []) {
                        $builder->orWhereIn('from_branch_id', $localIds);
                    }
                    if ($columns->has('to_branch_id') && $localIds !== []) {
                        $builder->orWhereIn('to_branch_id', $localIds);
                    }
                });
            }
        } elseif (! $access['isAdminOrRoot'] && $access['warehouseMongoIds'] === [] && $access['user'] !== null) {
            // Employee without warehouse assignment: empty list (do not leak all transfers)
            $query->whereRaw('1 = 0');
        }

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

        if (in_array($resource, self::SETTINGS_RESOURCES, true)) {
            if ($deny = $this->requireSettingsAdmin($request)) {
                return $deny;
            }
        }

        if (in_array($resource, ['inventory-checks', 'inventory-check-products'], true)) {
            if ($deny = $this->requireAuthForSensitiveResource($request)) {
                return $deny;
            }
        }

        $query = (new MirrorRecord())->forTable($table)->newQuery();
        $record = ctype_digit($id)
            ? $query->where('id', (int) $id)->first()
            : $query->where('mongo_id', $id)->first();

        if (! $record) {
            $message = match ($resource) {
                'warehouse-transfers' => 'Không tải được chi tiết đơn chuyển kho.',
                'inventory-vouchers' => 'Không tải được chi tiết phiếu kho.',
                'sale-payments' => 'Không tải được chi tiết hóa đơn.',
                'product-refunds' => 'Không tải được chi tiết phiếu trả hàng.',
                default => 'Không tìm thấy bản ghi.',
            };

            return response()->json(['message' => $message], 404);
        }

        return response()->json($this->enrich($this->serialize($record), $resource, $table));
    }

    private function requireSettingsAdmin(Request $request): ?JsonResponse
    {
        $user = LocalToken::resolve($request);
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated. Vui lòng đăng nhập lại.'], 401);
        }
        if (! $user->is_root_owner && strtoupper((string) $user->role) !== 'ADMIN') {
            return response()->json(['message' => 'Chỉ Admin hoặc Root Owner được truy cập dữ liệu cài đặt.'], 403);
        }

        return null;
    }

    public function warehouseTransferMeta(Request $request): JsonResponse
    {
        // Extract current user from Authorization header (same pattern as LocalContextController::me)
        // Token format: "Bearer local-laravel-token-{userId}"
        $user = LocalToken::resolve($request);

        // Always return all active branches for dropdown options (warehouses list is global)
        $activeBranches = Branch::query()
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'mongo_id', 'name', 'code']);

        $warehouses = $activeBranches
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

        // Compute userWarehouseIds using SAME ID system as warehouses.value (mongo_id)
        $userWarehouseIds = [];
        $role = 'GUEST';
        $isRootOwner = false;

        if ($user) {
            $role = $user->role ?: 'EMPLOYEE';
            $isRootOwner = (bool) $user->is_root_owner;
            $isAdminOrRoot = ($role === 'ADMIN' || $isRootOwner);

            // Collect local branch ids from user + assignments
            $localIds = [];
            if ($user->default_warehouse_id) {
                $localIds[] = (int) $user->default_warehouse_id;
            }
            if ($user->branch_id) {
                $localIds[] = (int) $user->branch_id;
            }
            $assignRows = DB::table('user_warehouse_assignments')
                ->where('user_id', $user->id)
                ->pluck('branch_id')
                ->map(fn ($v) => (int) $v)
                ->all();
            $localIds = array_unique(array_merge($localIds, $assignRows));

            if ($isAdminOrRoot) {
                // Admin / root owner sees all active warehouses
                $userWarehouseIds = $activeBranches
                    ->pluck('mongo_id')
                    ->filter()
                    ->values()
                    ->all();
            } elseif (!empty($localIds)) {
                $branchMap = $activeBranches->keyBy('id');
                foreach ($localIds as $lid) {
                    if ($b = $branchMap->get($lid)) {
                        if ($b->mongo_id) {
                            $userWarehouseIds[] = $b->mongo_id;
                        }
                    }
                }
                $userWarehouseIds = array_values(array_unique($userWarehouseIds));
            }
            // else: regular user with no assignments -> empty list
        }
        // If no identifiable user from token: do not pretend ADMIN, use GUEST + empty ids
        // (warehouses list still provided so UI dropdowns continue to work)

        return response()->json([
            'role' => $role,
            'isRootOwner' => $isRootOwner,
            'userWarehouseIds' => $userWarehouseIds,
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

    private function enrichCustomerCare(array $serialized): array
    {
        // Normalize camelCase fields that FE (CustomerCarePage) exclusively uses for display, edit, sort, export, links.
        // Legacy/mirror import + extract migrations populate snake_case columns (customer_name, record_date, ...)
        // while payload may carry camel. Always provide camel aliases so UI shows real MySQL values (no '—').
        $serialized['code'] = $serialized['code'] ?? ($serialized['id'] ?? null);
        $serialized['recordDate'] = $serialized['recordDate'] ?? $serialized['record_date'] ?? $serialized['business_date'] ?? null;
        $serialized['createdAt'] = $serialized['createdAt'] ?? $serialized['created_at'] ?? null;
        $serialized['updatedAt'] = $serialized['updatedAt'] ?? $serialized['updated_at'] ?? null;
        $serialized['customerCode'] = $serialized['customerCode'] ?? $serialized['customer_code'] ?? null;
        $serialized['customerName'] = $serialized['customerName'] ?? $serialized['customer_name'] ?? $serialized['name'] ?? null;
        $serialized['customerPhone'] = $serialized['customerPhone'] ?? $serialized['customer_phone'] ?? null;
        $serialized['details'] = $serialized['details'] ?? null;
        $serialized['reason'] = $serialized['reason'] ?? null;
        $serialized['description'] = $serialized['description'] ?? null;
        $serialized['creator'] = $serialized['creator'] ?? null;

        // Ensure customerId is present for linking in FE (works for old + new records)
        $cid = $serialized['customerId'] ?? $serialized['customer_id'] ?? $serialized['customer_mongo_id'] ?? null;

        if (!$cid) {
            $code = $serialized['customerCode'] ?? $serialized['customer_code'] ?? null;
            $phone = $serialized['customerPhone'] ?? $serialized['customer_phone'] ?? null;
            $name = $serialized['customerName'] ?? $serialized['customer_name'] ?? null;

            if ($code || $phone) {
                $q = Customer::query();
                if ($code) {
                    $q->where('code', $code);
                } elseif ($phone) {
                    $q->where(function ($b) use ($phone) {
                        $b->where('phone', $phone)->orWhere('phone2', $phone);
                    });
                }
                $cust = $q->first();
                if ($cust) {
                    $serialized['customerId'] = (string) $cust->id;
                    $serialized['customer_id'] = $cust->id;
                    $serialized['customer_mongo_id'] = $cust->mongo_id;
                    if (empty($serialized['customerCode'] ?? null) && empty($serialized['customer_code'] ?? null)) {
                        $serialized['customerCode'] = $cust->code;
                    }
                    if (empty($serialized['customerName'] ?? null) && empty($serialized['customer_name'] ?? null)) {
                        $serialized['customerName'] = $cust->name;
                    }
                    if (empty($serialized['customerPhone'] ?? null) && empty($serialized['customer_phone'] ?? null)) {
                        $serialized['customerPhone'] = $cust->phone;
                    }
                }
            }
        } elseif (is_numeric($cid) || (is_string($cid) && ctype_digit($cid))) {
            // If we only have numeric id but want consistent string for FE routes
            $serialized['customerId'] = (string) $cid;
        }

        return $serialized;
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
