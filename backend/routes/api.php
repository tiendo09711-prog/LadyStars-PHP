<?php

use App\Http\Controllers\Api\BranchController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\CustomerGroupController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\LocalContextController;
use App\Http\Controllers\Api\LocalWriteController;
use App\Http\Controllers\Api\MirrorRecordController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\RevenueByProductReportController;
use App\Http\Controllers\Api\RevenueByStaffReportController;
use App\Http\Controllers\Api\RevenueByStoreReportController;
use App\Http\Controllers\Api\RevenueByTimeReportController;
use App\Http\Controllers\Api\WarehouseTransactionController;
use App\Http\Controllers\Api\InventoryAuditController;
use App\Models\Branch;
use App\Models\MirrorRecord;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
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

// Reports (read-only)
Route::get('/reports/revenue/time/options', [RevenueByTimeReportController::class, 'options']);
Route::get('/reports/revenue/time', [RevenueByTimeReportController::class, 'index']);
Route::get('/reports/revenue/store/options', [RevenueByStoreReportController::class, 'options']);
Route::get('/reports/revenue/store', [RevenueByStoreReportController::class, 'index']);
Route::get('/reports/revenue/staff/options', [RevenueByStaffReportController::class, 'options']);
Route::get('/reports/revenue/staff', [RevenueByStaffReportController::class, 'index']);
Route::get('/reports/revenue/products/options', [RevenueByProductReportController::class, 'options']);
Route::get('/reports/revenue/products', [RevenueByProductReportController::class, 'index']);

Route::get('/staff', function () {
    $users = User::query()->orderBy('name')->get();
    $creatorIds = $users->pluck('created_by_id')->filter()->unique()->values()->all();
    $creators = User::whereIn('id', $creatorIds)->get()->keyBy('id');

    $assignRows = DB::table('user_warehouse_assignments')
        ->whereIn('user_id', $users->pluck('id'))
        ->get()
        ->groupBy('user_id');
    $branchIds = collect($assignRows)->flatMap(fn ($rows) => $rows->pluck('branch_id'))
        ->merge($users->pluck('default_warehouse_id'))
        ->filter()
        ->unique()
        ->values()
        ->all();
    $branchMap = Branch::whereIn('id', $branchIds)->get()->keyBy('id');

    $items = $users->map(function ($user) use ($assignRows, $branchMap, $creators) {
        $aids = $assignRows->get($user->id, collect());
        $assigned = $aids->map(function ($row) use ($branchMap) {
            $b = $branchMap->get($row->branch_id);
            return $b ? ['_id' => (string)$b->id, 'id' => $b->id, 'name' => $b->name, 'code' => $b->code] : null;
        })->filter()->values()->all();
        $names = collect($assigned)->pluck('name')->filter()->values()->all();

        return [
            '_id' => (string) $user->id,
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'role' => $user->role,
            'status' => $user->status,
            'branchId' => $user->branch_id ? (string) $user->branch_id : null,
            'defaultWarehouseId' => $user->default_warehouse_id ? (string) $user->default_warehouse_id : null,
            'assignedWarehouseIds' => $assigned,
            'warehouseNames' => $names,
            'isRootOwner' => (bool) $user->is_root_owner,
            'isActive' => (bool) $user->is_active,
            'lastLoginAt' => $user->last_login_at ? $user->last_login_at->toISOString() : null,
            'createdAt' => $user->created_at ? $user->created_at->toISOString() : null,
            'updatedAt' => $user->updated_at ? $user->updated_at->toISOString() : null,
            'createdById' => $user->created_by_id && $creators->has($user->created_by_id)
                ? ['_id' => (string)$user->created_by_id, 'name' => $creators->get($user->created_by_id)->name ?? null]
                : ($user->created_by_id ? (string)$user->created_by_id : null),
        ];
    })->values();

    return response()->json(['items' => $items, 'total' => $items->count()]);
});

Route::post('/staff', function (Request $request) {
    $name = trim((string) $request->input('name'));
    $email = trim((string) $request->input('email'));
    $password = (string) $request->input('password');
    $phone = trim((string) $request->input('phone'));
    $status = (string) $request->input('status', 'ACTIVE');
    $assigned = $request->input('assignedWarehouseIds', []);
    $default = $request->input('defaultWarehouseId') ?: (is_array($assigned) && count($assigned) ? $assigned[0] : null);

    if (!$name || !$email || strlen($password) < 6) {
        return response()->json(['message' => 'Thiếu thông tin bắt buộc (Tên, Email, Mật khẩu >=6).'], 422);
    }
    if (User::where('email', $email)->exists()) {
        return response()->json(['message' => 'Email đã tồn tại trong hệ thống.'], 422);
    }

    $creator = User::query()->where('role', 'ADMIN')->orWhere('is_root_owner', true)->orderByDesc('is_root_owner')->first() ?? User::query()->first();

    $user = User::create([
        'name' => $name,
        'email' => $email,
        'password' => $password,
        'phone' => $phone ?: null,
        'role' => 'EMPLOYEE',
        'status' => $status,
        'default_warehouse_id' => $default ? (int)$default : null,
        'created_by_id' => $creator?->id,
        'is_active' => $status === 'ACTIVE',
        'is_root_owner' => false,
    ]);

    $aids = is_array($assigned) ? $assigned : ($assigned ? [$assigned] : []);
    $aids = array_unique(array_filter(array_map('intval', $aids)));
    DB::table('user_warehouse_assignments')->where('user_id', $user->id)->delete();
    foreach ($aids as $bid) {
        if (Branch::where('id', $bid)->exists()) {
            DB::table('user_warehouse_assignments')->insert(['user_id' => $user->id, 'branch_id' => $bid, 'created_at' => now(), 'updated_at' => now()]);
        }
    }
    return response()->json(['ok' => true, '_id' => (string)$user->id], 201);
});

Route::patch('/staff/{id}', function (Request $request, $id) {
    $user = User::findOrFail($id);
    if ($user->is_root_owner) {
        return response()->json(['message' => 'Không thể sửa tài khoản root owner.'], 403);
    }
    $data = [];
    if ($request->has('name')) $data['name'] = trim((string)$request->input('name'));
    if ($request->has('email')) {
        $em = trim((string)$request->input('email'));
        if (User::where('email', $em)->where('id', '!=', $id)->exists()) return response()->json(['message' => 'Email đã tồn tại.'], 422);
        $data['email'] = $em;
    }
    if ($request->has('phone')) $data['phone'] = trim((string)$request->input('phone'));
    if ($request->has('status')) {
        $st = (string)$request->input('status');
        $data['status'] = $st;
        $data['is_active'] = $st === 'ACTIVE';
        $data['locked_at'] = $st === 'LOCKED' ? now() : null;
    }
    if ($request->has('defaultWarehouseId')) {
        $dw = $request->input('defaultWarehouseId');
        $data['default_warehouse_id'] = $dw ? (int)$dw : null;
    }
    if ($data) $user->update($data);

    if ($request->has('assignedWarehouseIds')) {
        $aids = $request->input('assignedWarehouseIds', []);
        $aids = is_array($aids) ? $aids : ($aids ? [$aids] : []);
        $aids = array_unique(array_filter(array_map('intval', $aids)));
        DB::table('user_warehouse_assignments')->where('user_id', $user->id)->delete();
        foreach ($aids as $bid) {
            if (Branch::where('id', $bid)->exists()) {
                DB::table('user_warehouse_assignments')->insert(['user_id' => $user->id, 'branch_id' => $bid, 'created_at' => now(), 'updated_at' => now()]);
            }
        }
    }
    return response()->json(['ok' => true, '_id' => (string)$id]);
});

Route::patch('/staff/{id}/{action}', function ($id, $action) {
    $user = User::findOrFail($id);
    if ($user->is_root_owner) return response()->json(['message' => 'Không thể thay đổi trạng thái root owner.'], 403);
    if ($action === 'lock') {
        $user->update(['status' => 'LOCKED', 'locked_at' => now(), 'is_active' => false]);
    } elseif ($action === 'open') {
        $user->update(['status' => 'ACTIVE', 'locked_at' => null, 'is_active' => true]);
    }
    return response()->json(['ok' => true, '_id' => (string)$id, 'action' => $action]);
});

Route::post('/staff/{id}/reset-password', function (Request $request, $id) {
    $user = User::findOrFail($id);
    if ($user->is_root_owner) return response()->json(['message' => 'Không thể reset mật khẩu root owner.'], 403);
    $pw = (string)$request->input('password', '');
    if (strlen($pw) < 6) return response()->json(['message' => 'Mật khẩu mới phải có ít nhất 6 ký tự.'], 422);
    $user->password = $pw;
    $user->save();
    return response()->json(['ok' => true, '_id' => (string)$id]);
});

Route::delete('/staff/{id}', function ($id) {
    $user = User::findOrFail($id);
    if ($user->is_root_owner) return response()->json(['message' => 'Không thể xóa root owner.'], 403);
    if ($user->status !== 'LOCKED') return response()->json(['message' => 'Phải khóa tài khoản trước khi xóa.'], 422);
    DB::table('user_warehouse_assignments')->where('user_id', $user->id)->delete();
    $user->delete();
    return response()->json(['ok' => true, '_id' => (string)$id]);
});

Route::get('/staff/{id}/stats', function ($id) {
    $req = request();
    $user = User::findOrFail($id);
    $name = $user->name;
    $staffId = $user->id;
    $from = $req->query('from');
    $to = $req->query('to');

    $allSales = (new MirrorRecord())->forTable('sale_payments')->newQuery()->get();
    $sales = $allSales->filter(function ($r) use ($name, $staffId) {
        $p = is_array($r->payload) ? $r->payload : [];
        $sp = $p['salesperson'] ?? $p['techStaff'] ?? $p['staff'] ?? $p['author'] ?? '';
        $matchName = (is_string($sp) && $sp === $name);
        $matchId = (($r->user_id ?? null) == $staffId) || (($r->author_id ?? null) == $staffId);
        return $matchName || $matchId;
    });
    if ($from) $sales = $sales->filter(fn($r) => ($d = $r->completed_at ?? $r->business_date ?? $r->created_at) && $d->toDateString() >= $from);
    if ($to) $sales = $sales->filter(fn($r) => ($d = $r->completed_at ?? $r->business_date ?? $r->created_at) && $d->toDateString() <= $to);
    $completed = $sales->filter(fn($r) => in_array(strtolower((string)($r->status ?? '')), ['completed','','done']));
    $salesCount = $completed->count();
    $revenue = (float)$completed->sum(fn($r) => (is_array($r->payload)?$r->payload:[])['total'] ?? (is_array($r->payload)?$r->payload:[])['value'] ?? $r->value_payment ?? 0);
    $paid = (float)$completed->sum(fn($r) => (is_array($r->payload)?$r->payload:[])['paid'] ?? $r->settlement_value ?? $r->value_payment ?? 0);
    $debt = max(0, $revenue - $paid);

    $allRef = (new MirrorRecord())->forTable('product_refunds')->newQuery()->get();
    $refs = $allRef->filter(function ($r) use ($name, $staffId) {
        $p = is_array($r->payload) ? $r->payload : [];
        $sp = $p['salesperson'] ?? $p['techStaff'] ?? $p['staff'] ?? $p['createdBy'] ?? $p['author'] ?? '';
        $matchName = (is_string($sp) && $sp === $name);
        $matchId = (($r->user_id ?? null) == $staffId) || (($r->user_created_id ?? null) == $staffId) || (($r->author_id ?? null) == $staffId);
        return $matchName || $matchId;
    });
    if ($from) $refs = $refs->filter(fn($r) => ($d = $r->completed_at ?? $r->business_date ?? $r->created_at) && $d->toDateString() >= $from);
    if ($to) $refs = $refs->filter(fn($r) => ($d = $r->completed_at ?? $r->business_date ?? $r->created_at) && $d->toDateString() <= $to);
    $refundCount = $refs->count();

    return response()->json(['summary' => ['salesCount' => $salesCount, 'revenue' => $revenue, 'paid' => $paid, 'debt' => $debt, 'refundCount' => $refundCount], 'from' => $from, 'to' => $to]);
});

Route::get('/staff/{id}/activity', function ($id) {
    $req = request();
    $user = User::findOrFail($id);
    $name = $user->name;
    $staffId = $user->id;
    $from = $req->query('from');
    $to = $req->query('to');

    $allSales = (new MirrorRecord())->forTable('sale_payments')->newQuery()->get();
    $sales = $allSales->filter(function ($r) use ($name, $staffId) {
        $p = is_array($r->payload) ? $r->payload : [];
        $sp = $p['salesperson'] ?? $p['techStaff'] ?? $p['staff'] ?? $p['author'] ?? '';
        $matchName = (is_string($sp) && $sp === $name);
        $matchId = (($r->user_id ?? null) == $staffId) || (($r->author_id ?? null) == $staffId);
        return $matchName || $matchId;
    });
    if ($from) $sales = $sales->filter(fn($r) => ($d = $r->completed_at ?? $r->business_date ?? $r->created_at) && $d->toDateString() >= $from);
    if ($to) $sales = $sales->filter(fn($r) => ($d = $r->completed_at ?? $r->business_date ?? $r->created_at) && $d->toDateString() <= $to);

    $allRef = (new MirrorRecord())->forTable('product_refunds')->newQuery()->get();
    $refs = $allRef->filter(function ($r) use ($name, $staffId) {
        $p = is_array($r->payload) ? $r->payload : [];
        $sp = $p['salesperson'] ?? $p['techStaff'] ?? $p['staff'] ?? $p['createdBy'] ?? $p['author'] ?? '';
        $matchName = (is_string($sp) && $sp === $name);
        $matchId = (($r->user_id ?? null) == $staffId) || (($r->user_created_id ?? null) == $staffId) || (($r->author_id ?? null) == $staffId);
        return $matchName || $matchId;
    });
    if ($from) $refs = $refs->filter(fn($r) => ($d = $r->completed_at ?? $r->business_date ?? $r->created_at) && $d->toDateString() >= $from);
    if ($to) $refs = $refs->filter(fn($r) => ($d = $r->completed_at ?? $r->business_date ?? $r->created_at) && $d->toDateString() <= $to);

    $items = collect();
    foreach ($sales->sortByDesc(fn($r) => $r->completed_at ?? $r->business_date ?? $r->created_at)->take(40) as $r) {
        $p = is_array($r->payload) ? $r->payload : [];
        $items->push(['_id' => 'sp-'.$r->getKey(), 'createdAt' => $r->completed_at?$r->completed_at->toISOString():($r->business_date?$r->business_date->toISOString():null), 'action' => strtoupper((string)($r->status?:'sale')), 'module' => 'sale-payments', 'resource' => $p['code'] ?? $r->getKey()]);
    }
    foreach ($refs->sortByDesc(fn($r) => $r->completed_at ?? $r->business_date ?? $r->created_at)->take(20) as $r) {
        $p = is_array($r->payload) ? $r->payload : [];
        $items->push(['_id' => 'rf-'.$r->getKey(), 'createdAt' => $r->completed_at?$r->completed_at->toISOString():($r->business_date?$r->business_date->toISOString():null), 'action' => 'REFUND', 'module' => 'product-refunds', 'resource' => $p['code'] ?? $r->getKey()]);
    }
    $sorted = $items->sortByDesc('createdAt')->take(80)->values()->all();
    return response()->json(['items' => $sorted]);
});

Route::get('/branches', [BranchController::class, 'index']);
Route::get('/system/branches', [BranchController::class, 'index']);
Route::get('/system/branches/{branch}', [BranchController::class, 'show']);
Route::get('/branches/{branch}', [BranchController::class, 'show']);

// Branch write + usage routes (enable full management from /warehouse/branches UI)
Route::post('/branches', [BranchController::class, 'store']);
Route::post('/system/branches', [BranchController::class, 'store']);
Route::get('/branches/{branch}/usage', [BranchController::class, 'usage']);
Route::get('/system/branches/{branch}/usage', [BranchController::class, 'usage']);
Route::patch('/branches/{branch}', [BranchController::class, 'update']);
Route::patch('/system/branches/{branch}', [BranchController::class, 'update']);
Route::post('/branches/{branch}/activate', [BranchController::class, 'activate']);
Route::post('/system/branches/{branch}/activate', [BranchController::class, 'activate']);
Route::post('/branches/{branch}/deactivate', [BranchController::class, 'deactivate']);
Route::post('/system/branches/{branch}/deactivate', [BranchController::class, 'deactivate']);
Route::delete('/branches/{branch}', [BranchController::class, 'destroy']);
Route::delete('/system/branches/{branch}', [BranchController::class, 'destroy']);

Route::get('/customers', [CustomerController::class, 'index']);
Route::get('/customers/customers', [CustomerController::class, 'index']);
Route::get('/customers/customers/meta', [CustomerController::class, 'meta']);
Route::post('/customers/customers', [CustomerController::class, 'store']);
Route::get('/customers/customers/{customer}/detail', [CustomerController::class, 'detail']);
Route::get('/customers/customers/{customer}', [CustomerController::class, 'show']);
Route::patch('/customers/customers/{customer}', [CustomerController::class, 'update']);
Route::delete('/customers/customers/{customer}', [CustomerController::class, 'destroy']);
Route::post('/customers/sync-metrics', [CustomerController::class, 'syncMetrics']);
Route::post('/customers/customers/sync-metrics', [CustomerController::class, 'syncMetrics']);
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
// Payment methods (read-only mirror). Declare /standard before any dynamic /{id} segment.
Route::get('/products/payment-methods/standard', [MirrorRecordController::class, 'index'])->defaults('resource', 'payment-methods');
Route::get('/products/payment-methods', [MirrorRecordController::class, 'index'])->defaults('resource', 'payment-methods');

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
