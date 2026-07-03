<?php

use App\Http\Controllers\Api\BranchController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\CustomerGroupController;
use App\Http\Controllers\Api\LocalContextController;
use App\Http\Controllers\Api\MirrorRecordController;
use App\Http\Controllers\Api\ProductController;
use Illuminate\Support\Facades\Route;

Route::get('/auth/me', [LocalContextController::class, 'me']);
Route::get('/settings/store', [LocalContextController::class, 'store']);

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
Route::get('/customers/care/{id}', [MirrorRecordController::class, 'show'])->defaults('resource', 'customer-cares');
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
Route::get('/products/products/{product}/stocks', [ProductController::class, 'stocks']);
Route::get('/products/products/{product}', [ProductController::class, 'show']);
Route::patch('/products/products/{product}', [ProductController::class, 'update']);
Route::delete('/products/products/{product}', [ProductController::class, 'destroy']);
Route::get('/products/inventories', [ProductController::class, 'inventories']);
Route::put('/products/inventories/{stock}', [ProductController::class, 'updateInventory']);
Route::get('/products/categories', [ProductController::class, 'categories']);
Route::get('/products/sales', [MirrorRecordController::class, 'index'])->defaults('resource', 'sale-payments');
Route::get('/products/sales/{id}', [MirrorRecordController::class, 'show'])->defaults('resource', 'sale-payments');
Route::get('/products/payments', [MirrorRecordController::class, 'index'])->defaults('resource', 'sale-payments');
Route::get('/products/payments/{id}', [MirrorRecordController::class, 'show'])->defaults('resource', 'sale-payments');
Route::get('/products/refunds', [MirrorRecordController::class, 'index'])->defaults('resource', 'product-refunds');
Route::get('/products/refunds/{id}', [MirrorRecordController::class, 'show'])->defaults('resource', 'product-refunds');
Route::get('/products/logs', [MirrorRecordController::class, 'index'])->defaults('resource', 'product-logs');
Route::get('/products/logs/{id}', [MirrorRecordController::class, 'show'])->defaults('resource', 'product-logs');
Route::get('/products/edit-logs', [MirrorRecordController::class, 'index'])->defaults('resource', 'product-edit-logs');
Route::get('/products/edit-logs/{id}', [MirrorRecordController::class, 'show'])->defaults('resource', 'product-edit-logs');
Route::get('/products/{product}/stocks', [ProductController::class, 'stocks']);
Route::get('/products/{product}', [ProductController::class, 'show']);
Route::get('/inventories', [ProductController::class, 'inventories']);
Route::get('/migration/placeholders/products', [ProductController::class, 'placeholders']);

Route::get('/warehouse/vouchers', [MirrorRecordController::class, 'index'])->defaults('resource', 'inventory-vouchers');
Route::get('/warehouse/vouchers/{id}', [MirrorRecordController::class, 'show'])->defaults('resource', 'inventory-vouchers');
Route::get('/warehouse/products', [MirrorRecordController::class, 'index'])->defaults('resource', 'inventory-products');
Route::get('/warehouse/products/{id}', [MirrorRecordController::class, 'show'])->defaults('resource', 'inventory-products');
Route::get('/warehouse/transfers', [MirrorRecordController::class, 'index'])->defaults('resource', 'warehouse-transfers');
Route::get('/warehouse/transfers/meta', [MirrorRecordController::class, 'warehouseTransferMeta']);
Route::get('/warehouse/transfers/{id}', [MirrorRecordController::class, 'show'])->defaults('resource', 'warehouse-transfers');
Route::get('/warehouse/transfer-audit-logs', [MirrorRecordController::class, 'index'])->defaults('resource', 'transfer-audit-logs');
Route::get('/warehouse/checks', [MirrorRecordController::class, 'index'])->defaults('resource', 'inventory-checks');
Route::get('/warehouse/checks/{id}', [MirrorRecordController::class, 'show'])->defaults('resource', 'inventory-checks');
Route::get('/warehouse/check-products', [MirrorRecordController::class, 'index'])->defaults('resource', 'inventory-check-products');
Route::get('/warehouse/check-products/{id}', [MirrorRecordController::class, 'show'])->defaults('resource', 'inventory-check-products');

Route::get('/mirror-resources', [MirrorRecordController::class, 'resources']);
Route::get('/mirror/{resource}', [MirrorRecordController::class, 'index']);
Route::get('/mirror/{resource}/{id}', [MirrorRecordController::class, 'show']);
