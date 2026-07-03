<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MirrorRecord;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MirrorRecordController extends Controller
{
    public function index(Request $request, string $resource): JsonResponse
    {
        $table = MirrorRecord::TABLES[$resource] ?? null;

        abort_if($table === null, 404, 'Unknown mirror resource.');

        $perPage = min(max((int) $request->query('perPage', 20), 1), 100);
        $query = (new MirrorRecord())->forTable($table)->newQuery()->orderByDesc('business_date')->orderByDesc('id');

        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(function ($builder) use ($search): void {
                $builder->where('code', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%")
                    ->orWhere('status', 'like', "%{$search}%")
                    ->orWhere('type', 'like', "%{$search}%");
            });
        }

        foreach (['status', 'type', 'branch_mongo_id', 'customer_mongo_id', 'product_mongo_id', 'user_mongo_id'] as $field) {
            if ($request->filled($field)) {
                $query->where($field, $request->query($field));
            }
        }

        return response()->json($query->paginate($perPage));
    }

    public function show(string $resource, int $id): JsonResponse
    {
        $table = MirrorRecord::TABLES[$resource] ?? null;

        abort_if($table === null, 404, 'Unknown mirror resource.');

        $record = (new MirrorRecord())->forTable($table)->newQuery()->findOrFail($id);

        return response()->json(['data' => $record]);
    }

    public function resources(): JsonResponse
    {
        return response()->json(['data' => array_keys(MirrorRecord::TABLES)]);
    }
}

