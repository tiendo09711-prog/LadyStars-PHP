<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MirrorRecord;
use App\Support\LocalToken;
use Illuminate\Http\JsonResponse;

class LocalContextController extends Controller
{
    public function me(): JsonResponse
    {
        // Require a valid login token (local-laravel-token-{userId}).
        // Invalid/missing tokens must not fall back to ADMIN (DB-AU-002 / security).
        $user = LocalToken::resolve(request());
        if ($user) {
            if (($user->is_active === null || (bool) $user->is_active) && strtoupper((string) ($user->status ?? 'ACTIVE')) !== 'INACTIVE') {
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
        }

        return response()->json([
            'message' => 'Unauthenticated.',
        ], 401);
    }

    public function store(): JsonResponse
    {
        $record = (new MirrorRecord())->forTable('store_settings')->newQuery()
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->first();
        $payload = is_array($record?->payload) ? $record->payload : [];

        return response()->json([
            'shopName' => $payload['shopName'] ?? $payload['name'] ?? $record?->name ?? 'LadyStars',
            'logoUrl' => $payload['logoUrl'] ?? $payload['logo'] ?? null,
            'address' => $payload['address'] ?? null,
            'phone' => $payload['phone'] ?? null,
            'taxCode' => $payload['taxCode'] ?? $payload['vat'] ?? null,
        ]);
    }
}
