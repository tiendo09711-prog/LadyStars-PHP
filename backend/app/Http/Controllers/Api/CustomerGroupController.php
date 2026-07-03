<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CustomerGroup;
use App\Support\ApiPagination;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CustomerGroupController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $perPage = min(max((int) $request->query('limit', $request->query('perPage', 100)), 1), 5000);
        $query = CustomerGroup::query()->orderBy('name');
        if ($search = trim((string) $request->query('q', $request->query('search', '')))) {
            $query->where(fn ($builder) => $builder->where('name', 'like', "%{$search}%")->orWhere('type', 'like', "%{$search}%"));
        }
        $payload = ApiPagination::nodeCompatible($query->paginate($perPage));
        $items = collect($payload['items'])->map(fn (CustomerGroup $group): array => $this->serialize($group))->all();
        $payload['items'] = $items;
        $payload['data'] = $items;

        return response()->json($payload);
    }

    public function store(Request $request): JsonResponse
    {
        try {
            $group = CustomerGroup::query()->create($this->payload($request));
        } catch (QueryException $error) {
            return $this->duplicateResponse($error);
        }

        return response()->json($this->serialize($group), 201);
    }

    public function show(CustomerGroup $group): JsonResponse
    {
        return response()->json($this->serialize($group));
    }

    public function update(Request $request, CustomerGroup $group): JsonResponse
    {
        try {
            $group->update($this->payload($request, $group));
        } catch (QueryException $error) {
            return $this->duplicateResponse($error);
        }

        return response()->json($this->serialize($group));
    }

    public function destroy(CustomerGroup $group): JsonResponse
    {
        $group->delete();

        return response()->json(['ok' => true, 'message' => 'Deleted']);
    }

    private function payload(Request $request, ?CustomerGroup $group = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255', Rule::unique('customer_groups', 'name')->ignore($group?->id)],
            'type' => ['nullable', 'string', 'max:255'],
            'note' => ['nullable', 'string'],
        ]) + ['type' => '1'];
    }

    private function serialize(CustomerGroup $group): array
    {
        return [
            '_id' => (string) $group->id,
            'id' => $group->id,
            'mongoId' => $group->mongo_id,
            'name' => $group->name,
            'type' => $group->type,
            'note' => $group->note,
            'createdAt' => optional($group->created_at)->toISOString(),
            'updatedAt' => optional($group->updated_at)->toISOString(),
        ];
    }

    private function duplicateResponse(QueryException $error): JsonResponse
    {
        if (str_contains($error->getMessage(), 'UNIQUE') || (int) ($error->errorInfo[1] ?? 0) === 1062) {
            return response()->json(['message' => 'T?n nh?m kh?ch h?ng ?? t?n t?i.'], 409);
        }

        throw $error;
    }
}
