<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MirrorRecord;
use App\Models\User;
use App\Support\LocalToken;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class SettingsController extends Controller
{
    public function store(): JsonResponse
    {
        $record = (new MirrorRecord())->forTable('store_settings')->newQuery()
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->first();

        return response()->json($this->storePayload($record));
    }

    public function updateStore(Request $request): JsonResponse
    {
        $data = $request->validate([
            'shopName' => ['required', 'string', 'max:150'],
            'logoUrl' => ['nullable', 'url:http,https', 'max:2048'],
            'address' => ['nullable', 'string', 'max:1000'],
            'phone' => ['nullable', 'string', 'max:30', 'regex:/^[0-9+().\s-]*$/'],
            'taxCode' => ['nullable', 'string', 'max:30', 'regex:/^[A-Za-z0-9.-]*$/'],
        ]);

        $actor = $request->user();
        $record = (new MirrorRecord())->forTable('store_settings')->newQuery()->orderByDesc('id')->first()
            ?? (new MirrorRecord())->forTable('store_settings')->newQuery()->create([
                'mongo_id' => $this->mongoId(),
                'name' => 'LadyStars Local',
                'payload' => [],
            ]);
        $before = $this->storePayload($record);
        $payload = [
            'shopName' => trim($data['shopName']),
            'logoUrl' => trim((string) ($data['logoUrl'] ?? '')),
            'address' => trim((string) ($data['address'] ?? '')),
            'phone' => trim((string) ($data['phone'] ?? '')),
            'taxCode' => trim((string) ($data['taxCode'] ?? '')),
        ];

        DB::transaction(function () use ($record, $payload, $before, $actor): void {
            $record->forceFill(['name' => $payload['shopName'], 'payload' => $payload])->save();
            $changedFields = collect($payload)
                ->filter(fn ($value, $field) => ($before[$field] ?? '') !== $value)
                ->keys()
                ->values()
                ->all();
            $this->audit($actor, 'UPDATE_STORE_SETTINGS', 'settings', 'store-settings', (string) $record->getKey(), [
                'changedFields' => $changedFields,
            ]);
        });

        return response()->json($payload);
    }

    public function permissions(): JsonResponse
    {
        return $this->systemResource('permissions');
    }

    public function roles(): JsonResponse
    {
        return $this->systemResource('roles');
    }

    public function menus(): JsonResponse
    {
        return $this->systemResource('menu_items');
    }

    public function auditLogs(Request $request): JsonResponse
    {
        $data = $request->validate([
            'page' => ['nullable', 'integer', 'min:1'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:200'],
            'module' => ['nullable', 'string', 'max:100'],
            'action' => ['nullable', 'string', 'max:100'],
            'q' => ['nullable', 'string', 'max:120'],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d'],
        ]);

        $page = (int) ($data['page'] ?? 1);
        $limit = (int) ($data['limit'] ?? 50);
        $query = (new MirrorRecord())->forTable('audit_logs')->newQuery();

        if (!empty($data['action'])) {
            $query->where('action', $data['action']);
        }
        if (!empty($data['module'])) {
            $module = $data['module'];
            $query->where(function ($builder) use ($module): void {
                $builder->where('entity_type', $module)->orWhere('payload->module', $module);
            });
        }
        if (!empty($data['q'])) {
            $search = $data['q'];
            $query->where(function ($builder) use ($search): void {
                $builder->where('action', 'like', "%{$search}%")
                    ->orWhere('entity_type', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%")
                    ->orWhere('payload', 'like', "%{$search}%");
            });
        }
        if (!empty($data['from'])) {
            $query->whereDate('created_at', '>=', $data['from']);
        }
        if (!empty($data['to'])) {
            $query->whereDate('created_at', '<=', $data['to']);
        }

        $total = (clone $query)->count();
        $items = $query->orderByDesc('created_at')->orderByDesc('id')
            ->skip(($page - 1) * $limit)
            ->limit($limit)
            ->get()
            ->map(fn (MirrorRecord $record): array => $this->auditShape($record))
            ->values();

        return response()->json([
            'items' => $items,
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'totalPages' => max(1, (int) ceil($total / $limit)),
        ]);
    }

    public function staffOptions(): JsonResponse
    {
        $items = User::query()
            ->where('role', 'EMPLOYEE')
            ->where('is_root_owner', false)
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'status', 'is_active'])
            ->map(fn (User $user): array => [
                '_id' => (string) $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'status' => $user->status,
                'isActive' => (bool) $user->is_active,
            ])
            ->values();

        return response()->json(['items' => $items, 'total' => $items->count()]);
    }

    public function changeOwnerAccount(Request $request): JsonResponse
    {
        $owner = $request->user();
        if (!$owner || ! $owner->is_root_owner) {
            return response()->json(['message' => 'Chỉ Root Owner được đổi tài khoản Owner.'], 403);
        }

        $data = $request->validate([
            'currentPassword' => ['required', 'string'],
            'newEmail' => ['nullable', 'email', 'max:255', Rule::unique('users', 'email')->ignore($owner->id)],
            'newPassword' => ['nullable', 'string', 'min:8', 'max:255'],
        ]);
        if (empty($data['newEmail']) && empty($data['newPassword'])) {
            return response()->json(['message' => 'Nhập email mới hoặc mật khẩu mới.'], 422);
        }
        if (!$this->passwordMatches($owner, $data['currentPassword'])) {
            return response()->json(['message' => 'Current password is incorrect'], 422);
        }

        $changedFields = [];
        DB::transaction(function () use ($owner, $data, &$changedFields): void {
            if (!empty($data['newEmail']) && $data['newEmail'] !== $owner->email) {
                $owner->email = trim($data['newEmail']);
                $changedFields[] = 'email';
            }
            if (!empty($data['newPassword'])) {
                $owner->password = $data['newPassword'];
                $changedFields[] = 'password';
            }
            $owner->token_version = (int) $owner->token_version + 1;
            $owner->save();
            $this->audit($owner, 'CHANGE_OWNER_ACCOUNT', 'security', 'user', (string) $owner->id, [
                'changedFields' => $changedFields,
            ]);
        });

        return response()->json([
            'ok' => true,
            'token' => LocalToken::issue($owner),
            'user' => $this->userShape($owner),
        ]);
    }

    public function changeStaffPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'userId' => ['required', 'integer', 'exists:users,id'],
            'newPassword' => ['required', 'string', 'min:8', 'max:255'],
        ]);
        $staff = User::query()->findOrFail($data['userId']);
        if ($staff->is_root_owner || strtoupper((string) $staff->role) !== 'EMPLOYEE') {
            return response()->json(['message' => 'Chỉ được đặt lại mật khẩu tài khoản nhân viên.'], 422);
        }

        DB::transaction(function () use ($staff, $data, $request): void {
            $staff->password = $data['newPassword'];
            $staff->token_version = (int) $staff->token_version + 1;
            $staff->save();
            $this->audit($request->user(), 'RESET_STAFF_PASSWORD', 'security', 'user', (string) $staff->id, [
                'targetUserName' => $staff->name,
                'targetUserEmail' => $staff->email,
            ]);
        });

        return response()->json(['ok' => true, 'userId' => (string) $staff->id]);
    }

    public function logoutStaffSessions(Request $request): JsonResponse
    {
        $data = $request->validate([
            'userId' => ['required', 'integer', 'exists:users,id'],
        ]);
        $staff = User::query()->findOrFail($data['userId']);
        if ($staff->is_root_owner || strtoupper((string) $staff->role) !== 'EMPLOYEE') {
            return response()->json(['message' => 'Chỉ được thu hồi phiên tài khoản nhân viên.'], 422);
        }

        DB::transaction(function () use ($staff, $request): void {
            $staff->token_version = (int) $staff->token_version + 1;
            $staff->save();
            DB::table('sessions')->where('user_id', $staff->id)->delete();
            $this->audit($request->user(), 'REVOKE_STAFF_SESSIONS', 'security', 'user', (string) $staff->id, [
                'targetUserName' => $staff->name,
                'targetUserEmail' => $staff->email,
            ]);
        });

        return response()->json(['ok' => true, 'userId' => (string) $staff->id]);
    }

    private function systemResource(string $table): JsonResponse
    {
        $items = (new MirrorRecord())->forTable($table)->newQuery()
            ->orderBy('name')
            ->orderBy('id')
            ->limit(500)
            ->get()
            ->map(function (MirrorRecord $record): array {
                $payload = is_array($record->payload) ? $record->payload : [];
                return array_merge($record->only(['name', 'status', 'type']), $payload, [
                    '_id' => (string) ($payload['_id'] ?? $record->mongo_id ?? $record->id),
                ]);
            })
            ->values();

        return response()->json(['items' => $items, 'total' => $items->count()]);
    }

    private function storePayload(?MirrorRecord $record): array
    {
        $payload = is_array($record?->payload) ? $record->payload : [];
        return [
            'shopName' => $payload['shopName'] ?? $payload['name'] ?? $record?->name ?? 'LadyStars Laravel Local',
            'logoUrl' => $payload['logoUrl'] ?? $payload['logo'] ?? '',
            'address' => $payload['address'] ?? '',
            'phone' => $payload['phone'] ?? '',
            'taxCode' => $payload['taxCode'] ?? $payload['vat'] ?? '',
        ];
    }

    private function auditShape(MirrorRecord $record): array
    {
        $payload = is_array($record->payload) ? $record->payload : [];
        return [
            '_id' => (string) ($record->mongo_id ?: $record->id),
            'action' => $record->action ?? $payload['action'] ?? '-',
            'module' => $payload['module'] ?? $record->entity_type ?? '-',
            'userName' => $payload['userName'] ?? $payload['actorName'] ?? null,
            'userEmail' => $payload['userEmail'] ?? $payload['actorEmail'] ?? null,
            'resource' => $payload['resource'] ?? $record->entity_type ?? null,
            'resourceId' => $payload['resourceId'] ?? $record->entity_mongo_id ?? null,
            'details' => $payload['details'] ?? [],
            'createdAt' => optional($record->created_at)->toISOString(),
        ];
    }

    private function userShape(User $user): array
    {
        return [
            '_id' => (string) $user->id,
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'status' => $user->status,
            'isRootOwner' => (bool) $user->is_root_owner,
            'isActive' => (bool) $user->is_active,
        ];
    }

    private function audit(?User $actor, string $action, string $module, string $resource, string $resourceId, array $details = []): void
    {
        (new MirrorRecord())->forTable('audit_logs')->newQuery()->create([
            'mongo_id' => $this->mongoId(),
            'name' => $action,
            'action' => $action,
            'entity_type' => $resource,
            'entity_mongo_id' => strlen($resourceId) === 24 ? $resourceId : null,
            'payload' => [
                'module' => $module,
                'resource' => $resource,
                'resourceId' => $resourceId,
                'userName' => $actor?->name,
                'userEmail' => $actor?->email,
                'details' => $details,
            ],
        ]);
    }

    private function mongoId(): string
    {
        return strtolower(Str::random(24));
    }

    private function passwordMatches(User $user, string $password): bool
    {
        $stored = (string) $user->getAuthPassword();
        if ($stored === '') {
            return false;
        }

        try {
            if (Hash::check($password, $stored)) {
                return true;
            }
            if (str_starts_with($stored, '$2') || str_starts_with($stored, '$argon2')) {
                return false;
            }
        } catch (\Throwable) {
        }

        return hash_equals($stored, $password);
    }
}
