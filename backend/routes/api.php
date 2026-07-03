<?php

use App\Http\Controllers\Api\BranchController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\MirrorRecordController;
use App\Http\Controllers\Api\ProductController;
use Illuminate\Support\Facades\Route;

Route::get('/branches', [BranchController::class, 'index']);
Route::get('/system/branches', [BranchController::class, 'index']);
Route::get('/branches/{branch}', [BranchController::class, 'show']);

Route::get('/customers', [CustomerController::class, 'index']);
Route::get('/customers/customers', [CustomerController::class, 'index']);
Route::get('/customers/customers/{customer}', [CustomerController::class, 'show']);
Route::get('/customers/{customer}', [CustomerController::class, 'show']);

Route::get('/products', [ProductController::class, 'index']);
Route::get('/products/placeholders', [ProductController::class, 'placeholders']);
Route::get('/products/products', [ProductController::class, 'index']);
Route::get('/products/products/{product}/stocks', [ProductController::class, 'stocks']);
Route::get('/products/products/{product}', [ProductController::class, 'show']);
Route::get('/products/inventories', [ProductController::class, 'inventories']);
Route::get('/products/{product}/stocks', [ProductController::class, 'stocks']);
Route::get('/products/{product}', [ProductController::class, 'show']);
Route::get('/inventories', [ProductController::class, 'inventories']);
Route::get('/migration/placeholders/products', [ProductController::class, 'placeholders']);

Route::get('/mirror-resources', [MirrorRecordController::class, 'resources']);
Route::get('/mirror/{resource}', [MirrorRecordController::class, 'index']);
Route::get('/mirror/{resource}/{id}', [MirrorRecordController::class, 'show'])->whereNumber('id');
