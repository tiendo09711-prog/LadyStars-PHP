<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Support\ApiPagination;
use App\Support\NodeShape;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BranchController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $perPage = min(max((int) $request->query('limit', $request->query('perPage', 5000)), 1), 5000);
        $query = Branch::query()->orderBy('name');

        if ($search = trim((string) $request->query('q', $request->query('search', '')))) {
            $query->where(function ($builder) use ($search): void {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        $payload = ApiPagination::nodeCompatible($query->paginate($perPage));
        $items = collect($payload['items'])->map(fn (Branch $branch): array => NodeShape::branch($branch))->all();
        $payload['items'] = $items;
        $payload['data'] = $items;

        return response()->json($payload);
    }

    public function show(Branch $branch): JsonResponse
    {
        return response()->json(NodeShape::branch($branch));
    }
}
