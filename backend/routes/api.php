<?php

use App\Http\Controllers\Api\BranchController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\CustomerGroupController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\LocalContextController;
use App\Http\Controllers\Api\LocalWriteController;
use App\Http\Controllers\Api\MirrorRecordController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\WarehouseTransactionController;
use App\Http\Controllers\Api\InventoryAuditController;
use Illuminate\Support\Facades\Route;

Route::post('/auth/login', [LocalWriteController::class, 'login']);
Route::get('/auth/me', [LocalContextController::class, 'me']);
Route::get('/settings/store', [LocalContextController::class, 'store']);
Route::patch('/settings/store', [LocalWriteController::class, 'updateStore']);

Route::post('/settings/security/change-owner-account', fn () => response()->json(['ok' => true, 'message' => 'Updated locally.']));
Route::post('/settings/security/change-password', fn () => response()->json(['ok' => true, 'message' => 'Password changed locally.']));
Route::post('/settings/security/logout-user-sessions', fn () => response()->json(['ok' => true, 'message' => 'Sessions revoked locally.']));

Route::get('/dashboard', [DashboardController::class, 'index']);
Route::get('/dashboard/daily-products', [DashboardController::class, 'dailyProducts']);

Route::get('/staff', fn () => response()->json([
    'items' => \App\Models\User::query()->orderBy('name')->get()->map(fn ($user) => [
        '_id' => (string) $user->id,
        'id' => $user->id,
        'name' => $user->name,
        'email' => $user->email,
        'phone' => $user->phone,
        'role' => $user->role,
        'status' => $user->status,
        'branchId' => $user->branch_id ? (string) $user->branch_id : null,
        'defaultWarehouseId' => $user->default_warehouse_id ? (string) $user->default_warehouse_id : null,
        'isRootOwner' => (bool) $user->is_root_owner,
        'isActive' => (bool) $user->is_active,
    ])->values(),
    'total' => \App\Models\User::query()->count(),
]));
Route::post('/staff', fn () => response()->json(['ok' => true, 'message' => 'Staff write is stubbed locally.'], 201));
Route::patch('/staff/{id}', fn ($id) => response()->json(['ok' => true, '_id' => (string) $id]));
Route::patch('/staff/{id}/{action}', fn ($id, $action) => response()->json(['ok' => true, '_id' => (string) $id, 'action' => $action]));
Route::post('/staff/{id}/reset-password', fn ($id) => response()->json(['ok' => true, '_id' => (string) $id]));
Route::delete('/staff/{id}', fn ($id) => response()->json(['ok' => true, '_id' => (string) $id]));

Route::get('/branches', [BranchController::class, 'index']);
Route::get('/system/branches', [BranchController::class, 'index']);
Route::get('/system/branches/{branch}', [BranchController::class, 'show']);
Route::get('/branches/{branch}', [BranchController::class, 'show']);

Route::get('/customers', [CustomerController::class, 'index']);
Route::get('/customers/customers', [CustomerController::class, 'index']);
Route::get('/customers/customers/meta', [CustomerController::class, 'meta']);
Route::post('/customers/customers', [CustomerController::class, 'store']);
Route::get('/customers/customers/{customer}', [CustomerController::class, 'show']);
Route::patch('/customers/customers/{customer}', [CustomerController::class, 'update']);
Route::delete('/customers/customers/{customer}', [CustomerController::class, 'destroy']);
Route::get('/customers/care/meta', [MirrorRecordController::class, 'customerCareMeta']);
Route::get('/customers/care', [MirrorRecordController::class, 'index'])->defaults('resource', 'customer-cares');
Route::post('/customers/care', [LocalWriteController::class, 'storeMirror'])->defaults('resource', 'customer-cares');
Route::get('/customers/care/{id}', [MirrorRecordController::class, 'show'])->defaults('resource', 'customer-cares');
Route::patch('/customers/care/{id}', [LocalWriteController::class, 'updateMirror'])->defaults('resource', 'customer-cares');
Route::delete('/customers/care/{id}', [LocalWriteController::class, 'deleteMirror'])->defaults('resource', 'customer-cares');
Route::get('/customers/{customer}', [CustomerController::class, 'show']);
Route::get('/customers/groups', [CustomerGroupController::class, 'index']);
Route::post('/customers/groups', [CustomerGroupController::class, 'store']);
Route::get('/customers/groups/{group}', [CustomerGroupController::class, 'show']);
Route::patch('/customers/groups/{group}', [CustomerGroupController::class, 'update']);
Route::delete('/customers/groups/{group}', [CustomerGroupController::class, 'destroy']);

Route::get('/products', [ProductController::class, 'index']);
Route::get('/products/placeholders', [ProductController::class, 'placeholders']);
Route::get('/products/products', [ProductController::class, 'index']);
Route::post('/products/products', [ProductController::class, 'store']);
Route::post('/products/products/import', [ProductController::class, 'import']);
Route::get('/products/products/{product}/stocks', [ProductController::class, 'stocks']);
Route::get('/products/products/{product}', [ProductController::class, 'show']);
Route::patch('/products/products/{product}', [ProductController::class, 'update']);
Route::delete('/products/products/{product}', [ProductController::class, 'destroy']);
Route::get('/products/inventories', [ProductController::class, 'inventories']);
Route::put('/products/inventories/{stock}', [ProductController::class, 'updateInventory']);
Route::get('/products/storage-duration', [ProductController::class, 'storageDuration']);
Route::get('/products/categories', [ProductController::class, 'categories']);
Route::post('/products/categories', [ProductController::class, 'storeCategory']);
Route::patch('/products/categories/{category}', [ProductController::class, 'updateCategory']);
Route::delete('/products/categories/{category}', [ProductController::class, 'destroyCategory']);
Route::get('/products/sales', [MirrorRecordController::class, 'index'])->defaults('resource', 'sale-payments');
Route::post('/products/sales', [LocalWriteController::class, 'storeMirror'])->defaults('resource', 'sale-payments');
Route::get('/products/sales/{id}', [MirrorRecordController::class, 'show'])->defaults('resource', 'sale-payments');
Route::patch('/products/sales/{id}', [LocalWriteController::class, 'updateMirror'])->defaults('resource', 'sale-payments');
Route::delete('/products/sales/{id}', [LocalWriteController::class, 'deleteMirror'])->defaults('resource', 'sale-payments');
Route::post('/products/sales/{id}/complete', [LocalWriteController::class, 'action'])->defaults('resource', 'sale-payments')->defaults('action', 'complete');
Route::post('/products/sales/{id}/cancel', [LocalWriteController::class, 'action'])->defaults('resource', 'sale-payments')->defaults('action', 'cancel');
Route::post('/products/sales/{id}/return-exchange', [LocalWriteController::class, 'action'])->defaults('resource', 'sale-payments')->defaults('action', 'return');
Route::get('/products/payments', [MirrorRecordController::class, 'index'])->defaults('resource', 'sale-payments');
Route::get('/products/payments/{id}', [MirrorRecordController::class, 'show'])->defaults('resource', 'sale-payments');
Route::get('/products/refunds', [MirrorRecordController::class, 'index'])->defaults('resource', 'product-refunds');
Route::post('/products/refunds', [LocalWriteController::class, 'storeMirror'])->defaults('resource', 'product-refunds');
Route::get('/products/refunds/{id}', [MirrorRecordController::class, 'show'])->defaults('resource', 'product-refunds');
Route::post('/products/refunds/{id}/complete', [LocalWriteController::class, 'action'])->defaults('resource', 'product-refunds')->defaults('action', 'complete');
Route::get('/products/logs', [MirrorRecordController::class, 'index'])->defaults('resource', 'product-logs');
Route::get('/products/logs/{id}', [MirrorRecordController::class, 'show'])->defaults('resource', 'product-logs');
Route::get('/products/edit-logs', [MirrorRecordController::class, 'index'])->defaults('resource', 'product-edit-logs');
Route::get('/products/edit-logs/{id}', [MirrorRecordController::class, 'show'])->defaults('resource', 'product-edit-logs');
Route::get('/products/{product}/stocks', [ProductController::class, 'stocks']);
Route::get('/products/{product}', [ProductController::class, 'show']);
Route::get('/inventories', [ProductController::class, 'inventories']);
Route::get('/migration/placeholders/products', [ProductController::class, 'placeholders']);

Route::get('/warehouse/vouchers', [MirrorRecordController::class, 'index'])->defaults('resource', 'inventory-vouchers');
Route::post('/warehouse/vouchers', [LocalWriteController::class, 'storeMirror'])->defaults('resource', 'inventory-vouchers');
Route::get('/warehouse/vouchers/{id}', [MirrorRecordController::class, 'show'])->defaults('resource', 'inventory-vouchers');
Route::post('/warehouse/vouchers/import', [LocalWriteController::class, 'storeMirror'])->defaults('resource', 'inventory-vouchers');
Route::post('/warehouse/vouchers/export', [LocalWriteController::class, 'storeMirror'])->defaults('resource', 'inventory-vouchers');
Route::post('/warehouse/vouchers/import-excel', [LocalWriteController::class, 'storeMirror'])->defaults('resource', 'inventory-vouchers');
Route::get('/warehouse/products', [MirrorRecordController::class, 'index'])->defaults('resource', 'inventory-products');
Route::post('/warehouse/products', [LocalWriteController::class, 'storeMirror'])->defaults('resource', 'inventory-products');
Route::get('/warehouse/products/{id}', [MirrorRecordController::class, 'show'])->defaults('resource', 'inventory-products');
Route::get('/warehouse/transactions/meta', [WarehouseTransactionController::class, 'meta']);
Route::get('/warehouse/transactions/{tab}', [WarehouseTransactionController::class, 'index'])->where('tab', 'bills|items');
Route::get('/warehouse/transactions/bills/{source}/{sourceId}', [WarehouseTransactionController::class, 'show'])->where('source', 'inventory-voucher|warehouse-transfer');
Route::delete('/warehouse/transactions/bills/{source}/{sourceId}', [WarehouseTransactionController::class, 'destroy'])->where('source', 'inventory-voucher|warehouse-transfer');
Route::post('/warehouse/transactions/bills/bulk-delete', [WarehouseTransactionController::class, 'bulkDelete']);
Route::get('/warehouse/transfers', [MirrorRecordController::class, 'index'])->defaults('resource', 'warehouse-transfers');
Route::post('/warehouse/transfers', [LocalWriteController::class, 'storeMirror'])->defaults('resource', 'warehouse-transfers');
Route::get('/warehouse/transfers/meta', [MirrorRecordController::class, 'warehouseTransferMeta']);
Route::get('/warehouse/transfers/{id}', [MirrorRecordController::class, 'show'])->defaults('resource', 'warehouse-transfers');
Route::patch('/warehouse/transfers/{id}', [LocalWriteController::class, 'updateMirror'])->defaults('resource', 'warehouse-transfers');
Route::delete('/warehouse/transfers/{id}', [LocalWriteController::class, 'deleteMirror'])->defaults('resource', 'warehouse-transfers');
Route::post('/warehouse/transfers/{id}/{action}', [LocalWriteController::class, 'action'])->defaults('resource', 'warehouse-transfers');
Route::get('/warehouse/transfer-audit-logs', [MirrorRecordController::class, 'index'])->defaults('resource', 'transfer-audit-logs');
Route::get('/warehouse/checks', [MirrorRecordController::class, 'index'])->defaults('resource', 'inventory-checks');
Route::get('/warehouse/checks/{id}', [MirrorRecordController::class, 'show'])->defaults('resource', 'inventory-checks');
Route::get('/warehouse/check-products', [MirrorRecordController::class, 'index'])->defaults('resource', 'inventory-check-products');
Route::get('/warehouse/check-products/{id}', [MirrorRecordController::class, 'show'])->defaults('resource', 'inventory-check-products');

Route::get('/inventory-audits', [InventoryAuditController::class, 'index']);
Route::get('/inventory-audits/meta', [InventoryAuditController::class, 'meta']);
Route::get('/inventory-audits/dashboard', [InventoryAuditController::class, 'dashboard']);
Route::get('/inventory-audits/suggestions', [InventoryAuditController::class, 'suggestions']);
Route::get('/inventory-audits/assignable-users', [InventoryAuditController::class, 'assignableUsers']);
Route::get('/inventory-audits/shelves', [InventoryAuditController::class, 'shelves']);
Route::get('/inventory-audits/export', [InventoryAuditController::class, 'export']);
Route::get('/inventory-audit-items', [InventoryAuditController::class, 'indexItems']);
Route::get('/inventory-audit-items/export', [InventoryAuditController::class, 'export'])->defaults('kind', 'items');
Route::post('/inventory-audits', [LocalWriteController::class, 'storeMirror'])->defaults('resource', 'inventory-checks');
Route::post('/inventory-audits/merge', [LocalWriteController::class, 'storeMirror'])->defaults('resource', 'inventory-checks');
Route::get('/inventory-audits/{id}', [InventoryAuditController::class, 'show']);
Route::patch('/inventory-audits/{id}', [LocalWriteController::class, 'updateMirror'])->defaults('resource', 'inventory-checks');
Route::delete('/inventory-audits/{id}', [LocalWriteController::class, 'deleteMirror'])->defaults('resource', 'inventory-checks');
Route::post('/inventory-audits/{id}/{action}', [LocalWriteController::class, 'action'])->defaults('resource', 'inventory-checks');

Route::post('/products/stock-adjustments', [LocalWriteController::class, 'storeMirror'])->defaults('resource', 'product-logs');
Route::post('/products/stock-adjustments/{id}/complete', [LocalWriteController::class, 'action'])->defaults('resource', 'product-logs')->defaults('action', 'complete');

Route::get('/mirror-resources', [MirrorRecordController::class, 'resources']);
Route::get('/mirror/{resource}', [MirrorRecordController::class, 'index']);
Route::post('/mirror/{resource}', [LocalWriteController::class, 'storeMirror']);
Route::get('/mirror/{resource}/{id}', [MirrorRecordController::class, 'show']);
Route::patch('/mirror/{resource}/{id}', [LocalWriteController::class, 'updateMirror']);
Route::delete('/mirror/{resource}/{id}', [LocalWriteController::class, 'deleteMirror']);
