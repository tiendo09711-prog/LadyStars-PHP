<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Product;
use App\Models\ProductBranchStock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReadOnlyApiTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;
    private Customer $customer;
    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();

        $this->branch = Branch::create([
            'mongo_id' => 'branch000000000000000001',
            'name' => 'Kho HÃ  Ná»™i',
            'code' => 'HN',
            'phone' => '0900000000',
            'is_active' => true,
        ]);

        $category = Category::create([
            'mongo_id' => 'category00000000000001',
            'name' => 'TÃ³c giáº£',
            'code' => 'TOC-GIA',
            'is_active' => true,
            'is_visible' => true,
        ]);

        $this->customer = Customer::create([
            'mongo_id' => 'customer00000000000001',
            'name' => 'Nguyá»…n Thá»‹ A',
            'code' => 'KH001',
            'phone' => '0912345678',
            'email' => 'customer@example.test',
            'status' => 'active',
            'branch_id' => $this->branch->id,
        ]);

        $this->product = Product::create([
            'mongo_id' => 'product000000000000001',
            'name' => 'MÃ¡i giáº£ test',
            'code' => 'SP001',
            'category_id' => $category->id,
            'price' => 100000,
            'cost' => 50000,
            'qty' => 12,
            'allows_sale' => true,
            'unit' => 'cÃ¡i',
            'status' => 'Má»›i',
            'category_name' => 'TÃ³c giáº£',
        ]);

        ProductBranchStock::create([
            'mongo_id' => 'stock00000000000000001',
            'product_id' => $this->product->id,
            'branch_id' => $this->branch->id,
            'qty' => 12,
            'locked_quantity' => 0,
            'min_quantity' => 0,
            'max_quantity' => 999999999,
        ]);
    }

    public function test_branches_endpoint_returns_list(): void
    {
        $response = $this->getJson('/api/branches');

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [
                    '*' => ['id', 'name', 'code', 'is_active'],
                ],
                'total',
            ])
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.code', 'HN');
    }

    public function test_customers_endpoint_supports_pagination(): void
    {
        $response = $this->getJson('/api/customers?perPage=5');

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [
                    '*' => ['id', 'name', 'code', 'status'],
                ],
                'current_page',
                'per_page',
                'total',
            ])
            ->assertJsonPath('per_page', 5)
            ->assertJsonPath('total', 1);
    }

    public function test_products_endpoint_supports_search(): void
    {
        $response = $this->getJson('/api/products?search=SP001&perPage=10');

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [
                    '*' => ['id', 'name', 'code', 'status'],
                ],
            ])
            ->assertJsonPath('data.0.code', 'SP001');
    }

    public function test_product_stocks_endpoint_returns_related_branch(): void
    {
        $response = $this->getJson('/api/products/'.$this->product->id.'/stocks');

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [
                    '*' => ['id', 'qty', 'branch' => ['id', 'name', 'code']],
                ],
            ])
            ->assertJsonPath('data.0.branch.code', 'HN');
    }

    public function test_inventories_endpoint_filters_by_branch(): void
    {
        $response = $this->getJson('/api/inventories?branchId='.$this->branch->id.'&perPage=10');

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [
                    '*' => ['id', 'qty', 'product', 'branch'],
                ],
            ])
            ->assertJsonPath('data.0.branch.id', $this->branch->id)
            ->assertJsonPath('data.0.product.code', 'SP001');
    }

    public function test_frontend_compatible_product_routes_return_expected_shapes(): void
    {
        $list = $this->getJson('/api/products/products?search=SP001&perPage=10');
        $list->assertOk()->assertJsonPath('data.0.code', 'SP001');

        $stocks = $this->getJson('/api/products/products/'.$this->product->id.'/stocks');
        $stocks->assertOk()
            ->assertJsonStructure(['data', 'items', 'totalQuantity'])
            ->assertJsonPath('items.0.branch.code', 'HN');
    }

    public function test_frontend_compatible_customer_and_inventory_routes_return_expected_shapes(): void
    {
        $customers = $this->getJson('/api/customers/customers?search=KH001&perPage=10');
        $customers->assertOk()->assertJsonPath('data.0.code', 'KH001');

        $inventories = $this->getJson('/api/products/inventories?branchId='.$this->branch->id.'&perPage=10');
        $inventories->assertOk()->assertJsonPath('data.0.product.code', 'SP001');
    }

    public function test_placeholder_products_endpoint_is_available(): void
    {
        Product::create([
            'mongo_id' => 'placeholder000000000001',
            'name' => 'MIGRATION PLACEHOLDER PRODUCT placeholder000000000001',
            'code' => 'MISSING-placeholder000000000001',
            'status' => 'MIGRATION_PLACEHOLDER',
            'allows_sale' => false,
            'type' => 'product',
        ]);

        $response = $this->getJson('/api/migration/placeholders/products');

        $response->assertOk()
            ->assertJsonPath('data.0.status', 'MIGRATION_PLACEHOLDER');
    }
}
