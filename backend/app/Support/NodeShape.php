<?php

namespace App\Support;

use App\Models\Branch;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Product;
use App\Models\ProductBranchStock;
use Illuminate\Database\Eloquent\Model;

class NodeShape
{
    public static function branch(Branch $branch): array
    {
        return [
            '_id' => (string) $branch->id,
            'id' => $branch->id,
            'mongoId' => $branch->mongo_id,
            'name' => $branch->name,
            'code' => $branch->code,
            'phone' => $branch->phone,
            'address' => $branch->address,
            'isActive' => (bool) $branch->is_active,
            'is_active' => (bool) $branch->is_active,
            'invoiceProfile' => $branch->invoice_profile,
            'createdAt' => optional($branch->created_at)->toISOString(),
            'updatedAt' => optional($branch->updated_at)->toISOString(),
        ];
    }

    public static function category(Category $category): array
    {
        return [
            '_id' => (string) $category->id,
            'id' => $category->id,
            'mongoId' => $category->mongo_id,
            'externalId' => $category->external_id,
            'name' => $category->name,
            'code' => $category->code,
            'parentId' => $category->parent_id ? (string) $category->parent_id : null,
            'isActive' => (bool) $category->is_active,
            'isVisible' => (bool) $category->is_visible,
            'productCount' => (int) $category->product_count,
            'url' => $category->url,
            'createdAt' => optional($category->created_at)->toISOString(),
            'updatedAt' => optional($category->updated_at)->toISOString(),
        ];
    }

    public static function customer(Customer $customer): array
    {
        $groups = $customer->relationLoaded('groups')
            ? $customer->groups->map(fn (Model $group): array => [
                '_id' => (string) $group->getKey(),
                'id' => $group->getKey(),
                'name' => $group->getAttribute('name'),
                'type' => $group->getAttribute('type'),
            ])->values()->all()
            : [];

        return [
            '_id' => (string) $customer->id,
            'id' => $customer->id,
            'mongoId' => $customer->mongo_id,
            'type' => $customer->type,
            'name' => $customer->name,
            'code' => $customer->code,
            'phone' => $customer->phone,
            'phone2' => $customer->phone2,
            'cardId' => $customer->card_id,
            'card_id' => $customer->card_id,
            'email' => $customer->email,
            'birthday' => optional($customer->birthday)->toDateString(),
            'sex' => $customer->sex,
            'customerLevel' => $customer->customer_level,
            'customer_level' => $customer->customer_level,
            'address' => $customer->address,
            'addressLocation' => $customer->address_location,
            'address_location' => $customer->address_location,
            'company' => $customer->company,
            'vat' => $customer->vat,
            'facebook' => $customer->facebook,
            'note' => $customer->note,
            'totalSpent' => (float) $customer->total_spent,
            'purchaseCount' => (int) $customer->purchase_count,
            'purchaseProductQuantity' => (float) $customer->purchase_product_quantity,
            'points' => (int) $customer->points,
            'firstPurchaseDate' => optional($customer->first_purchase_date)->toISOString(),
            'lastPurchaseDate' => optional($customer->last_purchase_date)->toISOString(),
            'daysSinceLastPurchase' => $customer->days_since_last_purchase,
            'purchaseCycleDays' => $customer->purchase_cycle_days,
            'tags' => $customer->tags,
            'status' => $customer->status,
            'branchId' => $customer->branch_id ? (string) $customer->branch_id : null,
            'branch_id' => $customer->branch_id,
            'branch' => $customer->relationLoaded('branch') && $customer->branch ? self::branch($customer->branch) : null,
            'groups' => $groups,
            'groupNames' => collect($groups)->pluck('name')->filter()->values()->all(),
            'createdAt' => optional($customer->created_at)->toISOString(),
            'updatedAt' => optional($customer->updated_at)->toISOString(),
        ];
    }

    public static function product(Product $product): array
    {

        return [
            '_id' => (string) $product->id,
            'id' => $product->id,
            'mongoId' => $product->mongo_id,
            'externalId' => $product->external_id,
            'barcode' => $product->barcode,
            'type' => $product->type,
            'code' => $product->code,
            'name' => $product->name,
            'unit' => $product->unit,
            'status' => $product->status,
            'categoryId' => $product->category_id ? (string) $product->category_id : null,
            'category_id' => $product->category_id,
            'categoryName' => $product->category_name,
            'category_name' => $product->category_name,
            'category' => $product->relationLoaded('category') && $product->category ? self::category($product->category) : null,
            'trademarkName' => $product->trademark_name,
            'supplierName' => $product->supplier_name,
            'parentCode' => $product->parent_code,
            'parentName' => $product->parent_name,
            'cost' => (float) $product->cost,
            'price' => (float) $product->price,
            'wholesalePrice' => (float) $product->wholesale_price,
            'clearancePrice' => (float) $product->clearance_price,
            'clearanceActive' => (bool) $product->clearance_active,
            'clearanceNote' => $product->clearance_note,
            'clearanceStartedAt' => optional($product->clearance_started_at)->toISOString(),
            'qty' => (float) $product->qty,
            'weight' => $product->weight !== null ? (float) $product->weight : null,
            'weightType' => $product->weight_type,
            'allowsSale' => (bool) $product->allows_sale,
            'minQuantity' => (float) $product->min_quantity,
            'maxQuantity' => (float) $product->max_quantity,
            'description' => $product->description,
            'note' => $product->note,
            'units' => $product->units,
            'elements' => $product->elements,
            'origin' => $product->origin,
            'color' => $product->color,
            'size' => $product->size,
            'extra' => $product->extra,
            'createdAt' => optional($product->created_at)->toISOString(),
            'updatedAt' => optional($product->updated_at)->toISOString(),
        ];
    }

    public static function stock(ProductBranchStock $stock): array
    {
        $branch = $stock->relationLoaded('branch') ? $stock->branch : null;
        $product = $stock->relationLoaded('product') ? $stock->product : null;

        return [
            '_id' => (string) $stock->id,
            'id' => $stock->id,
            'mongoId' => $stock->mongo_id,
            'productId' => (string) $stock->product_id,
            'branchId' => (string) $stock->branch_id,
            'warehouseId' => (string) $stock->branch_id,
            'warehouseName' => $branch?->name,
            'warehouseCode' => $branch?->code,
            'quantity' => (float) $stock->qty,
            'qty' => (float) $stock->qty,
            'lockedQuantity' => (float) $stock->locked_quantity,
            'minQuantity' => (float) $stock->min_quantity,
            'maxQuantity' => (float) $stock->max_quantity,
            'product' => $product ? self::product($product) : null,
            'branch' => $branch ? self::branch($branch) : null,
            'createdAt' => optional($stock->created_at)->toISOString(),
            'updatedAt' => optional($stock->updated_at)->toISOString(),
        ];
    }

    public static function inventory(Product $product): array
    {
        $stocks = $product->relationLoaded('stocks') ? $product->stocks : collect();

        $stockByBranchId = [];
        $stockByBranchCode = [];
        $totalStock = 0.0;
        $legacyHanoi = 0.0;
        $legacyHcm = 0.0;
        $legacyCenter = 0.0;

        foreach ($stocks as $stock) {
            $branchId = (string) $stock->branch_id;
            $qty = (float) $stock->qty;
            $branch = $stock->relationLoaded('branch') ? $stock->branch : null;

            if (isset($stockByBranchId[$branchId])) {
                $stockByBranchId[$branchId] += $qty;
            } else {
                $stockByBranchId[$branchId] = $qty;
            }

            if ($branch) {
                $code = (string) $branch->code;
                if (isset($stockByBranchCode[$code])) {
                    $stockByBranchCode[$code] += $qty;
                } else {
                    $stockByBranchCode[$code] = $qty;
                }
                if ($code === 'HN') $legacyHanoi += $qty;
                if ($code === 'HCM') $legacyHcm += $qty;
                if ($code === 'CN001') $legacyCenter += $qty;
            }

            $totalStock += $qty;
        }

        $primaryStock = $stocks->first();
        $primaryBranch = $primaryStock && $primaryStock->relationLoaded('branch') ? $primaryStock->branch : null;

        return [
            '_id' => (string) $product->id,
            'id' => $product->id,
            'mongoId' => $product->mongo_id,
            'barcode' => $product->barcode,
            'code' => $product->code,
            'name' => $product->name,
            'cost' => (float) $product->cost,
            'price' => (float) $product->price,
            'wholesalePrice' => (float) $product->wholesale_price,
            'status' => $product->status,
            'stockByBranchId' => $stockByBranchId,
            'stockByBranchCode' => $stockByBranchCode,
            'stockHanoi' => $legacyHanoi,
            'stockHCM' => $legacyHcm,
            'stockCN' => $legacyCenter,
            'totalStock' => $totalStock,
            'qty' => $primaryStock ? (float) $primaryStock->qty : $totalStock,
            'quantity' => $primaryStock ? (float) $primaryStock->qty : $totalStock,
            'product' => self::product($product),
            'branch' => $primaryBranch ? self::branch($primaryBranch) : null,
            'createdAt' => optional($product->created_at)->toISOString(),
            'updatedAt' => optional($product->updated_at)->toISOString(),
        ];
    }
}
