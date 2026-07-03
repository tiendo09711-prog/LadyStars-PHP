<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerGroup;
use App\Support\ApiPagination;
use App\Support\NodeShape;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class CustomerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $perPage = min(max((int) $request->query('limit', $request->query('perPage', 20)), 1), 5000);
        $query = Customer::query()->with(['branch', 'groups'])->orderByDesc('created_at')->orderByDesc('id');

        if ($search = trim((string) $request->query('q', $request->query('search', $request->query('keyword', ''))))) {
            $query->where(function ($builder) use ($search): void {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('phone2', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('card_id', 'like', "%{$search}%");
            });
        }

        foreach ([
            'code' => 'code',
            'name' => 'name',
            'phone' => 'phone',
            'email' => 'email',
            'cardId' => 'card_id',
            'customerLevel' => 'customer_level',
            'type' => 'type',
            'status' => 'status',
        ] as $param => $column) {
            if ($request->filled($param)) {
                $value = trim((string) $request->query($param));
                $query->where($column, in_array($column, ['type', 'status'], true) ? '=' : 'like', in_array($column, ['type', 'status'], true) ? $value : "%{$value}%");
            }
        }

        if ($branchId = $request->query('branchId')) {
            $query->where('branch_id', $branchId);
        }

        if ($groupId = $request->query('groupId')) {
            $query->whereHas('groups', fn ($builder) => $builder->where('customer_groups.id', $groupId));
        }

        $sortAliases = [
            'createdAt' => 'created_at',
            'updatedAt' => 'updated_at',
            'cardId' => 'card_id',
            'customerLevel' => 'customer_level',
            'totalSpent' => 'total_spent',
            'purchaseCount' => 'purchase_count',
            'purchaseProductQuantity' => 'purchase_product_quantity',
            'firstPurchaseDate' => 'first_purchase_date',
            'lastPurchaseDate' => 'last_purchase_date',
            'purchaseCycleDays' => 'purchase_cycle_days',
            'daysSinceLastPurchase' => 'days_since_last_purchase',
        ];
        $sort = $sortAliases[(string) $request->query('sort')] ?? (string) $request->query('sort', 'created_at');
        $allowedSorts = ['created_at', 'updated_at', 'name', 'code', 'type', 'phone', 'card_id', 'customer_level', 'status', 'total_spent', 'points', 'purchase_count', 'purchase_product_quantity', 'first_purchase_date', 'last_purchase_date', 'purchase_cycle_days', 'days_since_last_purchase'];
        if (!in_array($sort, $allowedSorts, true)) $sort = 'created_at';
        $query->reorder($sort, $request->query('order') === 'asc' ? 'asc' : 'desc')->orderByDesc('id');

        $payload = ApiPagination::nodeCompatible($query->paginate($perPage));
        $items = collect($payload['items'])->map(fn (Customer $customer): array => NodeShape::customer($customer))->all();
        $payload['items'] = $items;
        $payload['data'] = $items;

        return response()->json($payload);
    }

    public function meta(): JsonResponse
    {
        return response()->json([
            'customerTypes' => [
                ['value' => 'person', 'label' => 'C? nh?n'],
                ['value' => 'company', 'label' => 'C?ng ty'],
            ],
            'levels' => Customer::query()->whereNotNull('customer_level')->where('customer_level', '<>', '')->distinct()->orderBy('customer_level')->pluck('customer_level')->values(),
            'groups' => CustomerGroup::query()->orderBy('name')->get(['id', 'name', 'type'])->map(fn (CustomerGroup $group): array => [
                '_id' => (string) $group->id,
                'id' => $group->id,
                'name' => $group->name,
                'type' => $group->type,
            ])->values(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $payload = $this->validatedPayload($request);
        $groups = $payload['groups'] ?? [];
        unset($payload['groups']);
        $payload['code'] = $payload['code'] ?: $this->nextCode();

        try {
            $customer = DB::transaction(function () use ($payload, $groups): Customer {
                $customer = Customer::query()->create($payload);
                $customer->groups()->sync($groups);
                return $customer->load(['branch', 'groups']);
            });
        } catch (QueryException $error) {
            return $this->duplicateResponse($error);
        }

        return response()->json(NodeShape::customer($customer), 201);
    }

    public function show(Customer $customer): JsonResponse
    {
        return response()->json(NodeShape::customer($customer->load(['branch', 'groups'])));
    }

    public function update(Request $request, Customer $customer): JsonResponse
    {
        $payload = $this->validatedPayload($request, $customer);
        $groups = $payload['groups'] ?? null;
        unset($payload['groups']);
        if (($payload['code'] ?? '') === '') unset($payload['code']);

        try {
            $customer = DB::transaction(function () use ($customer, $payload, $groups): Customer {
                $customer->update($payload);
                if (is_array($groups)) $customer->groups()->sync($groups);
                return $customer->load(['branch', 'groups']);
            });
        } catch (QueryException $error) {
            return $this->duplicateResponse($error);
        }

        return response()->json(NodeShape::customer($customer));
    }

    public function destroy(Customer $customer): JsonResponse
    {
        $customer->groups()->detach();
        $customer->delete();

        return response()->json(['ok' => true, 'message' => 'Deleted']);
    }

    private function validatedPayload(Request $request, ?Customer $customer = null): array
    {
        $id = $customer?->id;
        $data = $request->validate([
            'branchId' => ['nullable', 'integer', 'exists:branches,id'],
            'code' => ['nullable', 'string', 'max:255', Rule::unique('customers', 'code')->ignore($id)],
            'name' => ['required', 'string', 'max:255'],
            'type' => ['nullable', Rule::in(['person', 'company'])],
            'phone' => ['nullable', 'string', 'max:255'],
            'phone2' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'cardId' => ['nullable', 'string', 'max:255'],
            'customerLevel' => ['nullable', 'string', 'max:255'],
            'birthday' => ['nullable', 'date'],
            'sex' => ['nullable', Rule::in(['female', 'male', 'other'])],
            'addressLocation' => ['nullable', 'string'],
            'address' => ['nullable', 'string'],
            'company' => ['nullable', 'string', 'max:255'],
            'vat' => ['nullable', 'string', 'max:255'],
            'facebook' => ['nullable', 'string', 'max:255'],
            'note' => ['nullable', 'string'],
            'status' => ['nullable', Rule::in(['active', 'inactive'])],
            'groups' => ['nullable', 'array'],
            'groups.*' => ['integer', 'exists:customer_groups,id'],
        ]);

        return [
            'branch_id' => $data['branchId'] ?? null,
            'code' => trim((string) ($data['code'] ?? '')),
            'name' => trim((string) $data['name']),
            'type' => $data['type'] ?? 'person',
            'phone' => $data['phone'] ?? null,
            'phone2' => $data['phone2'] ?? null,
            'email' => $data['email'] ?? null,
            'card_id' => $data['cardId'] ?? null,
            'customer_level' => $data['customerLevel'] ?? null,
            'birthday' => $data['birthday'] ?? null,
            'sex' => $data['sex'] ?? 'female',
            'address_location' => $data['addressLocation'] ?? null,
            'address' => $data['address'] ?? null,
            'company' => $data['company'] ?? null,
            'vat' => $data['vat'] ?? null,
            'facebook' => $data['facebook'] ?? null,
            'note' => $data['note'] ?? null,
            'status' => $data['status'] ?? 'active',
            'groups' => $data['groups'] ?? [],
        ];
    }

    private function nextCode(): string
    {
        return 'KH'.now()->format('ymdHis');
    }

    private function duplicateResponse(QueryException $error): JsonResponse
    {
        if (str_contains($error->getMessage(), 'UNIQUE') || (int) ($error->errorInfo[1] ?? 0) === 1062) {
            return response()->json(['message' => 'M? kh?ch h?ng ?? t?n t?i.'], 409);
        }

        throw $error;
    }
}
