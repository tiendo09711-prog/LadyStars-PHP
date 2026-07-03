<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MirrorRecord;
use App\Models\User;
use Illuminate\Http\JsonResponse;

class LocalContextController extends Controller
{
    public function me(): JsonResponse
    {
        $user = User::query()
            ->where(function ($query): void {
                $query->where('role', 'ADMIN')->orWhere('is_root_owner', true);
            })
            ->orderByDesc('is_root_owner')
            ->orderBy('id')
            ->first()
            ?? User::query()->orderBy('id')->first();

        if (!$user) {
            return response()->json([
                'name' => 'Laravel Local Tester',
                'email' => 'local@ladystars.test',
                'role' => 'ADMIN',
                'status' => 'ACTIVE',
                'branchId' => null,
                'defaultWarehouseId' => null,
                'isRootOwner' => true,
            ]);
        }

        return response()->json([
            '_id' => (string) $user->id,
            'id' => $user->id,
            'mongoId' => $user->mongo_id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'role' => $user->role,
            'status' => $user->status,
            'branchId' => $user->branch_id ? (string) $user->branch_id : null,
            'defaultWarehouseId' => $user->default_warehouse_id ? (string) $user->default_warehouse_id : null,
            'isRootOwner' => (bool) $user->is_root_owner,
            'isActive' => (bool) $user->is_active,
        ]);
    }

    public function store(): JsonResponse
    {
        $record = (new MirrorRecord())->forTable('store_settings')->newQuery()
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->first();
        $payload = is_array($record?->payload) ? $record->payload : [];

        return response()->json([
            'shopName' => $payload['shopName'] ?? $payload['name'] ?? $record?->name ?? 'LadyStars Laravel Local',
            'logoUrl' => $payload['logoUrl'] ?? $payload['logo'] ?? null,
            'address' => $payload['address'] ?? null,
            'phone' => $payload['phone'] ?? null,
            'taxCode' => $payload['taxCode'] ?? $payload['vat'] ?? null,
        ]);
    }
}
