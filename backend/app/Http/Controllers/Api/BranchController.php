<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\MirrorRecord;
use App\Models\ProductBranchStock;
use App\Models\User;
use App\Support\ApiPagination;
use App\Support\NodeShape;
use App\Support\LocalToken;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class BranchController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $perPage = min(max((int) $request->query('limit', $request->query('perPage', 5000)), 1), 5000);
        $query = Branch::query()->orderBy('name');

        $includeInactive = filter_var(
            $request->query('includeInactive', $request->query('include_inactive', false)),
            FILTER_VALIDATE_BOOLEAN
        );
        if (!$includeInactive) {
            $query->where('is_active', true);
        }

        if ($search = trim((string) $request->query('q', $request->query('search', '')))) {
            $query->where(function ($builder) use ($search): void {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('address', 'like', "%{$search}%");
            });
        }

        $payload = ApiPagination::nodeCompatible($query->paginate($perPage));
        $items = collect($payload['items'])->map(fn (Branch $branch): array => NodeShape::branch($branch))->all();
        $payload['items'] = $items;
        $payload['data'] = $items;

        return response()->json($payload);
    }

    public function show(string $branch): JsonResponse
    {
        $branch = $this->findBranch($branch);
        return response()->json(NodeShape::branch($branch));
    }

    public function store(Request $request): JsonResponse
    {
        $this->requireConfirmedAdmin($request);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'code' => ['required', 'string', 'max:50'],
            'address' => ['nullable', 'string', 'max:1000'],
            'phone' => ['nullable', 'string', 'max:50'],
            'invoiceProfile' => ['nullable', 'array'],
        ]);

        $code = strtoupper(trim($data['code']));
        if (Branch::where('code', $code)->exists()) {
            return response()->json(['message' => 'Mã kho đã tồn tại.'], 422);
        }

        $branch = Branch::create([
            'name' => trim($data['name']),
            'code' => $code,
            'address' => trim((string) ($data['address'] ?? '')),
            'phone' => trim((string) ($data['phone'] ?? '')),
            'is_active' => true,
            'invoice_profile' => $data['invoiceProfile'] ?? null,
        ]);

        return response()->json(NodeShape::branch($branch), 201);
    }

    public function update(Request $request, string $branch): JsonResponse
    {
        $this->requireConfirmedAdmin($request);

        $branch = $this->findBranch($branch);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'address' => ['nullable', 'string', 'max:1000'],
            'phone' => ['nullable', 'string', 'max:50'],
            'invoiceProfile' => ['nullable', 'array'],
        ]);

        $branch->update([
            'name' => trim($data['name']),
            'address' => trim((string) ($data['address'] ?? '')),
            'phone' => trim((string) ($data['phone'] ?? '')),
            'invoice_profile' => $data['invoiceProfile'] ?? $branch->invoice_profile,
        ]);

        return response()->json(NodeShape::branch($branch->fresh()));
    }

    public function activate(Request $request, string $branch): JsonResponse
    {
        $this->requireConfirmedAdmin($request);

        $branch = $this->findBranch($branch);
        $branch->update(['is_active' => true]);

        return response()->json(NodeShape::branch($branch->fresh()));
    }

    public function deactivate(Request $request, string $branch): JsonResponse
    {
        $this->requireConfirmedAdmin($request);

        $branch = $this->findBranch($branch);
        $branch->update(['is_active' => false]);

        return response()->json(NodeShape::branch($branch->fresh()));
    }

    public function destroy(Request $request, string $branch): JsonResponse
    {
        $this->requireConfirmedAdmin($request);

        $branch = $this->findBranch($branch);
        $usage = $this->computeUsage($branch);

        if ($usage['totalLinked'] > 0) {
            return response()->json([
                'message' => 'Không thể xóa kho hàng vì còn dữ liệu liên kết.',
                'usage' => $usage,
            ], 409);
        }

        $branch->delete();

        return response()->json(['ok' => true]);
    }

    public function usage(string $branch): JsonResponse
    {
        $branch = $this->findBranch($branch);
        $usage = $this->computeUsage($branch);
        return response()->json($usage);
    }

    private function findBranch(string $identifier): Branch
    {
        return Branch::query()
            ->where('id', $identifier)
            ->orWhere('mongo_id', $identifier)
            ->firstOrFail();
    }

    /**
     * Resolve caller from local-laravel-token-{id}, require ADMIN/root, then re-confirm
     * password of THAT same user. No loose fallbacks (no "admin", no length-based bypass).
     */
    private function requireConfirmedAdmin(Request $request): User
    {
        $user = $this->requireAdminUser($request);
        $this->validateAdminPassword($request, $user);

        return $user;
    }

    /**
     * Writes REQUIRE a valid login token (local-laravel-token-ID) that resolves to ADMIN/root.
     * No unauthenticated fallback (unlike /auth/me which bootstraps UI).
     */
    private function requireAdminUser(Request $request): User
    {
        $user = LocalToken::resolve($request);

        if (!$user || (! $user->is_root_owner && strtoupper((string) $user->role) !== 'ADMIN')) {
            abort(403, 'Chỉ quản trị viên (ADMIN/root) mới được thực hiện thao tác quản lý kho hàng.');
        }

        // Align with login: locked / inactive accounts cannot perform privileged writes.
        if (($user->status === 'LOCKED') || ($user->is_active === false)) {
            abort(403, 'Chỉ quản trị viên (ADMIN/root) mới được thực hiện thao tác quản lý kho hàng.');
        }

        return $user;
    }

    /**
     * Re-confirm password of the authenticated caller only (not any other ADMIN/root).
     */
    private function validateAdminPassword(Request $request, User $user): void
    {
        $password = trim((string) $request->input('adminPassword', ''));
        if ($password === '') {
            abort(422, 'Vui lòng nhập mật khẩu Admin để xác nhận thao tác.');
        }

        if (! $this->passwordMatches($user, $password)) {
            abort(403, 'Mật khẩu Admin không đúng.');
        }
    }

    /**
     * Match password against the caller's stored credential:
     * - bcrypt/argon via Hash::check when stored value is a hash
     * - exact equality only for legacy non-hash stored passwords
     * - empty stored password always fails
     * - never length-based or hard-coded "admin" fallbacks
     */
    private function passwordMatches(User $user, string $password): bool
    {
        $stored = (string) ($user->getAuthPassword() ?? $user->password ?? '');
        if ($stored === '') {
            return false;
        }

        try {
            if (Hash::check($password, $stored)) {
                return true;
            }
            // Valid hash that does not match → reject (no loose fallback).
            if ($this->looksLikePasswordHash($stored)) {
                return false;
            }

            // Legacy plaintext / non-bcrypt storage: exact match only.
            return hash_equals($stored, $password);
        } catch (\Throwable $e) {
            // Hash driver cannot process stored value → legacy exact match only.
            return hash_equals($stored, $password);
        }
    }

    private function looksLikePasswordHash(string $stored): bool
    {
        return str_starts_with($stored, '$2y$')
            || str_starts_with($stored, '$2a$')
            || str_starts_with($stored, '$2b$')
            || str_starts_with($stored, '$argon2id$')
            || str_starts_with($stored, '$argon2i$')
            || str_starts_with($stored, '$argon2d$');
    }

    private function computeUsage(Branch $branch): array
    {
        $id = $branch->id;
        $mongo = $branch->mongo_id;

        $links = [
            'productBranchStocks' => ProductBranchStock::where('branch_id', $id)->count(),
            'salePayments' => $this->countByBranch('sale_payments', $id, $mongo),
            'productRefunds' => $this->countByBranch('product_refunds', $id, $mongo),
            'inventoryVouchers' => $this->countByBranch('inventory_vouchers', $id, $mongo),
            'inventoryProducts' => $this->countByBranch('inventory_products', $id, $mongo),
            'warehouseTransferSource' => $this->countTransfer('warehouse_transfers', 'from_branch_id', 'from_branch_mongo_id', $id, $mongo),
            'warehouseTransferDestination' => $this->countTransfer('warehouse_transfers', 'to_branch_id', 'to_branch_mongo_id', $id, $mongo),
            'inventoryAudits' => $this->countByBranch('inventory_checks', $id, $mongo),
            'inventoryChecks' => $this->countByBranch('inventory_checks', $id, $mongo),
            'inventoryCheckProducts' => $this->countByBranch('inventory_check_products', $id, $mongo),
            'stockAdjustments' => $this->countStockAdjustments($id, $mongo),
            'batches' => $this->countByBranch('product_batches', $id, $mongo),
            'usersBranchId' => User::where('branch_id', $id)->count(),
            'usersDefaultWarehouseId' => User::where('default_warehouse_id', $id)->count(),
            'usersAssignedWarehouseIds' => DB::table('user_warehouse_assignments')->where('branch_id', $id)->count(),
        ];

        $totalLinked = array_sum(array_map('intval', $links));

        return [
            'branchId' => (string) $branch->id,
            'branchName' => $branch->name,
            'isActive' => (bool) $branch->is_active,
            'totalLinked' => $totalLinked,
            'links' => $links,
        ];
    }

    private function countByBranch(string $table, int $id, ?string $mongo): int
    {
        try {
            $q = (new MirrorRecord())->forTable($table)->newQuery()->where('branch_id', $id);
            if ($mongo) {
                $q->orWhere('branch_mongo_id', $mongo);
            }
            return (int) $q->count();
        } catch (\Throwable $e) {
            return 0;
        }
    }

    private function countTransfer(string $table, string $idCol, string $mongoCol, int $id, ?string $mongo): int
    {
        try {
            $q = (new MirrorRecord())->forTable($table)->newQuery()->where($idCol, $id);
            if ($mongo) {
                $q->orWhere($mongoCol, $mongo);
            }
            return (int) $q->count();
        } catch (\Throwable $e) {
            return 0;
        }
    }

    private function countStockAdjustments(int $id, ?string $mongo): int
    {
        try {
            $q = (new MirrorRecord())->forTable('product_logs')->newQuery()
                ->where('type', 'stock_adjustment')
                ->where(function ($qq) use ($id, $mongo) {
                    $qq->where('branch_id', $id);
                    if ($mongo) {
                        $qq->orWhere('branch_mongo_id', $mongo);
                    }
                });
            return (int) $q->count();
        } catch (\Throwable $e) {
            return 0;
        }
    }
}
