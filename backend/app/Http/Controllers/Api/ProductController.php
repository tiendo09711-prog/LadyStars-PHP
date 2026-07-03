<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ProductBranchStock;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $perPage = min(max((int) $request->query('perPage', 20), 1), 100);
        $query = Product::query()
            ->with('category:id,name,code')
            ->orderBy('name')
            ->orderBy('id');

        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(function ($builder) use ($search): void {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%")
                    ->orWhere('barcode', 'like', "%{$search}%")
                    ->orWhere('category_name', 'like', "%{$search}%");
            });
        }

        if ($categoryId = $request->query('categoryId')) {
            $query->where('category_id', $categoryId);
        }

        if ($request->has('allowsSale')) {
            $query->where('allows_sale', filter_var($request->query('allowsSale'), FILTER_VALIDATE_BOOLEAN));
        }

        return response()->json($query->paginate($perPage));
    }

    public function show(Product $product): JsonResponse
    {
        return response()->json([
            'data' => $product->load([
                'category:id,name,code',
                'stocks.branch:id,name,code',
            ]),
        ]);
    }

    public function stocks(Product $product): JsonResponse
    {
        $stocks = $product->stocks()
            ->with('branch:id,name,code')
            ->orderBy('branch_id')
            ->get();

        return response()->json([
            'data' => $stocks,
            'items' => $stocks,
            'totalQuantity' => (float) $stocks->sum('qty'),
        ]);
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

    public function inventories(Request $request): JsonResponse
    {
        $perPage = min(max((int) $request->query('perPage', 50), 1), 100);
        $query = ProductBranchStock::query()
            ->with([
                'product:id,name,code,price,cost,unit,type,allows_sale,status,category_name',
                'branch:id,name,code',
            ])
            ->orderBy('branch_id')
            ->orderBy('product_id');

        if ($branchId = $request->query('branchId')) {
            $query->where('branch_id', $branchId);
        }

        if ($search = trim((string) $request->query('search', ''))) {
            $query->whereHas('product', function ($builder) use ($search): void {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%")
                    ->orWhere('barcode', 'like', "%{$search}%");
            });
        }

        return response()->json($query->paginate($perPage));
    }
}
