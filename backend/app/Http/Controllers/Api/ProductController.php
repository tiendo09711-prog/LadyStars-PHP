<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\MirrorRecord;
use App\Models\Product;
use App\Models\ProductBranchStock;
use App\Support\ApiPagination;
use App\Support\NodeShape;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ProductController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $perPage = min(max((int) $request->query('limit', $request->query('perPage', 20)), 1), 5000);
        $query = Product::query()->with('category')->orderBy('name')->orderBy('id');

        if ($search = trim((string) $request->query('q', $request->query('search', '')))) {
            $query->where(function ($builder) use ($search): void {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%")
                    ->orWhere('barcode', 'like', "%{$search}%")
                    ->orWhere('category_name', 'like', "%{$search}%");
            });
        }

        if ($categoryId = $request->query('categoryId')) $query->where('category_id', $categoryId);
        if ($request->has('allowsSale')) $query->where('allows_sale', filter_var($request->query('allowsSale'), FILTER_VALIDATE_BOOLEAN));

        $payload = ApiPagination::nodeCompatible($query->paginate($perPage));
        $items = collect($payload['items'])->map(fn (Product $product): array => NodeShape::product($product))->all();
        $payload['items'] = $items;
        $payload['data'] = $items;

        return response()->json($payload);
    }

    public function store(Request $request): JsonResponse
    {
        $payload = $this->validatedPayload($request);
        $stocks = $payload['initialStocks'] ?? [];
        unset($payload['initialStocks']);
        $payload['code'] = $payload['code'] ?: $this->nextCode();
        $payload['barcode'] = $payload['barcode'] ?: $this->nextBarcode();

        try {
            $product = DB::transaction(function () use ($payload, $stocks): Product {
                $product = Product::query()->create($payload);
                $this->syncInitialStocks($product, $stocks);
                $this->refreshProductQty($product);
                return $product->load('category');
            });
        } catch (QueryException $error) {
            return $this->duplicateResponse($error);
        }

        return response()->json(NodeShape::product($product), 201);
    }

    public function show(Product $product): JsonResponse
    {
        return response()->json(NodeShape::product($product->load(['category', 'stocks.branch'])));
    }

    public function update(Request $request, Product $product): JsonResponse
    {
        $payload = $this->validatedPayload($request, $product);
        $stocks = $payload['initialStocks'] ?? null;
        unset($payload['initialStocks']);
        if (($payload['code'] ?? '') === '') unset($payload['code']);
        if (($payload['barcode'] ?? '') === '') unset($payload['barcode']);

        try {
            $product = DB::transaction(function () use ($product, $payload, $stocks): Product {
                $product->update($payload);
                if (is_array($stocks)) $this->syncInitialStocks($product, $stocks);
                $this->refreshProductQty($product);
                return $product->load('category');
            });
        } catch (QueryException $error) {
            return $this->duplicateResponse($error);
        }

        return response()->json(NodeShape::product($product));
    }

    public function destroy(Product $product): JsonResponse
    {
        $blockingReason = $this->productDeleteBlockingReason($product);
        if ($blockingReason !== null) {
            return response()->json(['message' => $blockingReason], 409);
        }

        $product->delete();

        return response()->json(['ok' => true, 'message' => 'Deleted']);
    }

    public function stocks(Product $product): JsonResponse
    {
        $stocks = $product->stocks()->with(['branch', 'product.category'])->orderBy('branch_id')->get();
        $items = $stocks->map(fn (ProductBranchStock $stock): array => NodeShape::stock($stock))->values();

        return response()->json([
            'data' => $items,
            'items' => $items,
            'totalQuantity' => (float) $stocks->sum('qty'),
        ]);
    }

    public function inventories(Request $request): JsonResponse
    {
        $perPage = min(max((int) $request->query('limit', $request->query('perPage', 50)), 1), 5000);
        $query = ProductBranchStock::query()
            ->with(['product.category', 'branch'])
            ->orderBy('branch_id')
            ->orderBy('product_id');

        if ($branchId = $request->query('branchId')) $query->where('branch_id', $branchId);

        if ($search = trim((string) $request->query('q', $request->query('search', '')))) {
            $query->whereHas('product', function ($builder) use ($search): void {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%")
                    ->orWhere('barcode', 'like', "%{$search}%");
            });
        }

        $payload = ApiPagination::nodeCompatible($query->paginate($perPage));
        $items = collect($payload['items'])->map(fn (ProductBranchStock $stock): array => NodeShape::stock($stock))->all();
        $payload['items'] = $items;
        $payload['data'] = $items;

        return response()->json($payload);
    }

    public function updateInventory(Request $request, ProductBranchStock $stock): JsonResponse
    {
        $data = $request->validate([
            'qty' => ['nullable', 'numeric', 'min:0'],
            'quantity' => ['nullable', 'numeric', 'min:0'],
            'lockedQuantity' => ['nullable', 'numeric', 'min:0'],
            'minQuantity' => ['nullable', 'numeric', 'min:0'],
            'maxQuantity' => ['nullable', 'numeric', 'min:0'],
        ]);

        DB::transaction(function () use ($stock, $data): void {
            $beforeQty = (float) $stock->qty;
            $nextQty = (float) ($data['quantity'] ?? $data['qty'] ?? $stock->qty);

            $stock->update([
                'qty' => $nextQty,
                'locked_quantity' => $data['lockedQuantity'] ?? $stock->locked_quantity,
                'min_quantity' => $data['minQuantity'] ?? $stock->min_quantity,
                'max_quantity' => $data['maxQuantity'] ?? $stock->max_quantity,
            ]);
            $this->refreshProductQty($stock->product);
            $this->writeLocalStockAdjustmentLog($stock->fresh()->load(['product', 'branch']), $beforeQty, $nextQty);
        });

        return response()->json(NodeShape::stock($stock->fresh()->load(['branch', 'product.category'])));
    }

    public function categories(Request $request): JsonResponse
    {
        $perPage = min(max((int) $request->query('limit', $request->query('perPage', 100)), 1), 5000);
        $query = Category::query()->orderBy('name');
        if ($search = trim((string) $request->query('q', $request->query('search', '')))) {
            $query->where(fn ($builder) => $builder->where('name', 'like', "%{$search}%")->orWhere('code', 'like', "%{$search}%"));
        }
        $payload = ApiPagination::nodeCompatible($query->paginate($perPage));
        $items = collect($payload['items'])->map(fn (Category $category): array => NodeShape::category($category))->all();
        $payload['items'] = $items;
        $payload['data'] = $items;

        return response()->json($payload);
    }

    public function placeholders(): JsonResponse
    {
        return response()->json([
            'data' => Product::query()
                ->where('status', 'MIGRATION_PLACEHOLDER')
                ->orderBy('code')
                ->get(['id', 'mongo_id', 'name', 'code', 'status', 'note', 'extra']),
        ]);
    }


    private function productDeleteBlockingReason(Product $product): ?string
    {
        if ($product->stocks()->where(function ($query): void {
            $query->where('qty', '>', 0)->orWhere('locked_quantity', '>', 0);
        })->exists()) {
            return 'Kh?ng th? x?a s?n ph?m ?ang c?n t?n kho ho?c t?n kh?a. H?y ??a t?n v? 0 tr??c.';
        }

        $mirrorChecks = [
            ['sale_payments', 'items'],
            ['product_refunds', 'items'],
            ['inventory_vouchers', 'product_id'],
            ['inventory_products', 'product_id'],
            ['warehouse_transfers', 'lines'],
            ['product_logs', 'product_id'],
        ];

        foreach ($mirrorChecks as [$table, $column]) {
            $query = (new MirrorRecord())->forTable($table)->newQuery();
            if (in_array($column, ['product_id'], true) && $query->where('product_id', $product->id)->exists()) {
                return 'Kh?ng th? x?a s?n ph?m ?? c? ch?ng t?/log nghi?p v? li?n quan.';
            }

            if ($query->where('product_mongo_id', $product->mongo_id)->exists()) {
                return 'Kh?ng th? x?a s?n ph?m ?? c? ch?ng t?/log nghi?p v? li?n quan.';
            }

            if ($column !== 'product_id' && $query->where('payload', 'like', '%'.$product->code.'%')->exists()) {
                return 'Kh?ng th? x?a s?n ph?m ?? c? ch?ng t?/log nghi?p v? li?n quan.';
            }
        }

        return null;
    }

    private function writeLocalStockAdjustmentLog(ProductBranchStock $stock, float $beforeQty, float $nextQty): void
    {
        if (abs($beforeQty - $nextQty) < 0.0001) {
            return;
        }

        $product = $stock->product;
        $branch = $stock->branch;
        $mongoId = 'localstock'.str_pad((string) (int) (microtime(true) * 1000), 14, '0', STR_PAD_LEFT);

        (new MirrorRecord())->forTable('product_logs')->newQuery()->create([
            'mongo_id' => substr($mongoId, 0, 24),
            'code' => 'LOCAL-STOCK-'.$stock->id.'-'.now()->format('YmdHis'),
            'name' => 'Local stock adjustment',
            'status' => 'LOCAL_ADJUSTMENT',
            'type' => 'stock_adjustment',
            'amount' => $nextQty - $beforeQty,
            'branch_mongo_id' => $branch?->mongo_id,
            'product_mongo_id' => $product?->mongo_id,
            'business_date' => now(),
            'product_id' => $product?->id,
            'source_type' => 'LOCAL_STOCK_UPDATE',
            'source_mongo_id' => null,
            'value_before' => $beforeQty,
            'value_after' => $nextQty,
            'amount_before' => $beforeQty,
            'amount_after' => $nextQty,
            'payload' => [
                'source' => 'Laravel local stock update',
                'stockId' => $stock->id,
                'productId' => $product?->id,
                'productCode' => $product?->code,
                'productName' => $product?->name,
                'branchId' => $branch?->id,
                'branchName' => $branch?->name,
                'beforeQty' => $beforeQty,
                'afterQty' => $nextQty,
            ],
        ]);
    }

    private function validatedPayload(Request $request, ?Product $product = null): array
    {
        $id = $product?->id;
        $data = $request->validate([
            'code' => ['nullable', 'string', 'max:255', Rule::unique('products', 'code')->ignore($id)],
            'barcode' => ['nullable', 'string', 'max:255', Rule::unique('products', 'barcode')->ignore($id)],
            'type' => ['nullable', Rule::in(['product', 'service', 'combo'])],
            'name' => ['required', 'string', 'max:255'],
            'unit' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', 'string', 'max:255'],
            'categoryId' => ['nullable', 'integer', 'exists:categories,id'],
            'categoryName' => ['nullable', 'string', 'max:255'],
            'cost' => ['nullable', 'numeric', 'min:0'],
            'price' => ['nullable', 'numeric', 'min:0'],
            'wholesalePrice' => ['nullable', 'numeric', 'min:0'],
            'clearancePrice' => ['nullable', 'numeric', 'min:0'],
            'clearanceActive' => ['nullable', 'boolean'],
            'clearanceNote' => ['nullable', 'string'],
            'weight' => ['nullable', 'numeric', 'min:0'],
            'weightType' => ['nullable', Rule::in(['gram', 'kg'])],
            'allowsSale' => ['nullable', 'boolean'],
            'minQuantity' => ['nullable', 'numeric', 'min:0'],
            'maxQuantity' => ['nullable', 'numeric', 'min:0'],
            'description' => ['nullable', 'string'],
            'note' => ['nullable', 'string'],
            'origin' => ['nullable', 'string', 'max:255'],
            'color' => ['nullable', 'string', 'max:255'],
            'size' => ['nullable', 'string', 'max:255'],
            'parentCode' => ['nullable', 'string', 'max:255'],
            'parentName' => ['nullable', 'string', 'max:255'],
            'initialStocks' => ['nullable', 'array'],
            'initialStocks.*.warehouseId' => ['required_with:initialStocks', 'integer', 'exists:branches,id'],
            'initialStocks.*.quantity' => ['required_with:initialStocks', 'numeric', 'min:0'],
        ]);

        $category = !empty($data['categoryId']) ? Category::query()->find($data['categoryId']) : null;

        return [
            'code' => trim((string) ($data['code'] ?? '')),
            'barcode' => trim((string) ($data['barcode'] ?? '')) ?: null,
            'type' => $data['type'] ?? 'product',
            'name' => trim((string) $data['name']),
            'unit' => $data['unit'] ?? null,
            'status' => $data['status'] ?? 'M?i',
            'category_id' => $data['categoryId'] ?? null,
            'category_name' => $data['categoryName'] ?? $category?->name,
            'cost' => $data['cost'] ?? 0,
            'price' => $data['price'] ?? 0,
            'wholesale_price' => $data['wholesalePrice'] ?? 0,
            'clearance_price' => $data['clearancePrice'] ?? 0,
            'clearance_active' => $data['clearanceActive'] ?? false,
            'clearance_note' => $data['clearanceNote'] ?? null,
            'weight' => $data['weight'] ?? null,
            'weight_type' => $data['weightType'] ?? 'gram',
            'allows_sale' => $data['allowsSale'] ?? true,
            'min_quantity' => $data['minQuantity'] ?? 0,
            'max_quantity' => $data['maxQuantity'] ?? 999999999,
            'description' => $data['description'] ?? null,
            'note' => $data['note'] ?? null,
            'origin' => $data['origin'] ?? null,
            'color' => $data['color'] ?? null,
            'size' => $data['size'] ?? null,
            'parent_code' => $data['parentCode'] ?? null,
            'parent_name' => $data['parentName'] ?? null,
            'initialStocks' => $data['initialStocks'] ?? [],
        ];
    }

    private function syncInitialStocks(Product $product, array $stocks): void
    {
        foreach ($stocks as $line) {
            ProductBranchStock::query()->updateOrCreate(
                ['product_id' => $product->id, 'branch_id' => (int) $line['warehouseId']],
                ['qty' => (float) $line['quantity'], 'locked_quantity' => 0, 'min_quantity' => 0, 'max_quantity' => 999999999]
            );
        }
    }

    private function refreshProductQty(Product $product): void
    {
        $product->forceFill(['qty' => (float) $product->stocks()->sum('qty')])->save();
    }

    private function nextCode(): string
    {
        return 'SP'.now()->format('ymdHis');
    }

    private function nextBarcode(): string
    {
        return '20'.now()->format('ymdHis');
    }

    private function duplicateResponse(QueryException $error): JsonResponse
    {
        if (str_contains($error->getMessage(), 'UNIQUE') || (int) ($error->errorInfo[1] ?? 0) === 1062) {
            return response()->json(['message' => 'M? s?n ph?m ho?c m? v?ch ?? t?n t?i.'], 409);
        }

        throw $error;
    }
}
