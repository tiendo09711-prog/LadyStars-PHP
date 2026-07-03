<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Category;
use App\Models\Customer;
use App\Models\CustomerGroup;
use App\Models\MirrorRecord;
use App\Models\Product;
use App\Models\ProductBranchStock;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WriteFlowApiTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;
    private Category $category;
    private CustomerGroup $group;
    private Product $product;
    private ProductBranchStock $stock;

    protected function setUp(): void
    {
        parent::setUp();

        $this->branch = Branch::create([
            'mongo_id' => 'branch000000000000000001',
            'name' => 'Kho HN',
            'code' => 'HN',
            'is_active' => true,
        ]);

        $this->category = Category::create([
            'mongo_id' => 'category00000000000001',
            'name' => 'T?c gi?',
            'code' => 'TOC-GIA',
            'is_active' => true,
            'is_visible' => true,
        ]);

        $this->group = CustomerGroup::create([
            'name' => 'VIP',
            'type' => '1',
        ]);

        $this->product = Product::create([
            'mongo_id' => 'product000000000000001',
            'name' => 'M?i test',
            'code' => 'SP001',
            'category_id' => $this->category->id,
            'category_name' => $this->category->name,
            'price' => 100000,
            'cost' => 50000,
            'qty' => 12,
            'allows_sale' => true,
            'unit' => 'c?i',
            'status' => 'M?i',
            'type' => 'product',
        ]);

        $this->stock = ProductBranchStock::create([
            'mongo_id' => 'stock00000000000000001',
            'product_id' => $this->product->id,
            'branch_id' => $this->branch->id,
            'qty' => 12,
            'locked_quantity' => 0,
            'min_quantity' => 0,
            'max_quantity' => 999999999,
        ]);
    }

    public function test_customer_write_flow_works(): void
    {
        $created = $this->postJson('/api/customers/customers', [
            'branchId' => $this->branch->id,
            'code' => 'KHNEW',
            'name' => 'Kh?ch Test',
            'type' => 'person',
            'phone' => '0901000001',
            'customerLevel' => 'VIP',
            'groups' => [$this->group->id],
        ]);

        $created->assertCreated()
            ->assertJsonPath('_id', '1')
            ->assertJsonPath('code', 'KHNEW')
            ->assertJsonPath('branchId', (string) $this->branch->id)
            ->assertJsonPath('groups.0._id', (string) $this->group->id);

        $customerId = $created->json('_id');

        $updated = $this->patchJson('/api/customers/customers/'.$customerId, [
            'name' => 'Kh?ch Test Updated',
            'status' => 'inactive',
            'groups' => [],
        ]);

        $updated->assertOk()
            ->assertJsonPath('name', 'Kh?ch Test Updated')
            ->assertJsonPath('status', 'inactive');

        $meta = $this->getJson('/api/customers/customers/meta');
        $meta->assertOk()->assertJsonPath('groups.0._id', (string) $this->group->id);

        $deleted = $this->deleteJson('/api/customers/customers/'.$customerId);
        $deleted->assertOk()->assertJsonPath('ok', true);
    }

    public function test_product_write_flow_works(): void
    {
        $created = $this->postJson('/api/products/products', [
            'code' => 'SPNEW',
            'name' => 'S?n ph?m Test',
            'type' => 'product',
            'unit' => 'c?i',
            'categoryId' => $this->category->id,
            'price' => 150000,
            'cost' => 70000,
            'allowsSale' => true,
            'initialStocks' => [
                ['warehouseId' => $this->branch->id, 'quantity' => 5],
            ],
        ]);

        $created->assertCreated()
            ->assertJsonPath('code', 'SPNEW')
            ->assertJsonPath('categoryId', (string) $this->category->id)
            ->assertJsonPath('qty', 5);

        $productId = $created->json('_id');

        $stocks = $this->getJson('/api/products/products/'.$productId.'/stocks');
        $stocks->assertOk()
            ->assertJsonPath('items.0.warehouseId', (string) $this->branch->id)
            ->assertJsonPath('items.0.quantity', 5);

        $updated = $this->patchJson('/api/products/products/'.$productId, [
            'name' => 'S?n ph?m Test Updated',
            'price' => 160000,
            'categoryId' => $this->category->id,
            'type' => 'product',
        ]);

        $updated->assertOk()
            ->assertJsonPath('name', 'S?n ph?m Test Updated')
            ->assertJsonPath('price', 160000);

        ProductBranchStock::query()->where('product_id', $productId)->update(['qty' => 0, 'locked_quantity' => 0]);

        $deleted = $this->deleteJson('/api/products/products/'.$productId);
        $deleted->assertOk()->assertJsonPath('ok', true);
    }

    public function test_product_delete_is_blocked_when_stock_or_business_logs_exist(): void
    {
        $blockedByStock = $this->deleteJson('/api/products/products/'.$this->product->id);
        $blockedByStock->assertStatus(409)
            ->assertJsonPath('message', 'Kh?ng th? x?a s?n ph?m ?ang c?n t?n kho ho?c t?n kh?a. H?y ??a t?n v? 0 tr??c.');

        $this->stock->update(['qty' => 0, 'locked_quantity' => 0]);
        (new MirrorRecord())->forTable('product_logs')->newQuery()->create([
            'mongo_id' => 'log000000000000000000001',
            'code' => 'LOG-SP001',
            'product_id' => $this->product->id,
            'product_mongo_id' => $this->product->mongo_id,
            'business_date' => now(),
            'payload' => ['productCode' => $this->product->code],
        ]);

        $blockedByLog = $this->deleteJson('/api/products/products/'.$this->product->id);
        $blockedByLog->assertStatus(409)
            ->assertJsonPath('message', 'Kh?ng th? x?a s?n ph?m ?? c? ch?ng t?/log nghi?p v? li?n quan.');
    }

    public function test_inventory_write_flow_works(): void
    {
        $updated = $this->putJson('/api/products/inventories/'.$this->stock->id, [
            'quantity' => 20,
            'lockedQuantity' => 2,
            'minQuantity' => 1,
            'maxQuantity' => 200,
        ]);

        $updated->assertOk()
            ->assertJsonPath('_id', (string) $this->stock->id)
            ->assertJsonPath('quantity', 20)
            ->assertJsonPath('lockedQuantity', 2)
            ->assertJsonPath('warehouseId', (string) $this->branch->id);

        $this->assertDatabaseHas('products', [
            'id' => $this->product->id,
            'qty' => 20,
        ]);
        $this->assertDatabaseHas('product_logs', [
            'product_id' => $this->product->id,
            'type' => 'stock_adjustment',
            'status' => 'LOCAL_ADJUSTMENT',
        ]);
    }
    public function test_local_frontend_bootstrap_endpoints_are_available(): void
    {
        User::query()->create([
            'mongo_id' => 'user00000000000000000001',
            'name' => 'Admin Local',
            'email' => 'admin.local@example.test',
            'password' => 'secret',
            'role' => 'ADMIN',
            'status' => 'ACTIVE',
            'branch_id' => $this->branch->id,
            'default_warehouse_id' => $this->branch->id,
            'is_root_owner' => true,
            'is_active' => true,
        ]);
        (new MirrorRecord())->forTable('store_settings')->newQuery()->create([
            'mongo_id' => 'storesetting00000000001',
            'name' => 'LadyStars DB',
            'payload' => ['shopName' => 'LadyStars DB', 'phone' => '0900000000'],
        ]);

        $auth = $this->getJson('/api/auth/me');
        $auth->assertOk()
            ->assertJsonPath('role', 'ADMIN')
            ->assertJsonPath('email', 'admin.local@example.test')
            ->assertJsonPath('branchId', (string) $this->branch->id);

        $settings = $this->getJson('/api/settings/store');
        $settings->assertOk()
            ->assertJsonPath('shopName', 'LadyStars DB')
            ->assertJsonPath('phone', '0900000000');

        $branches = $this->getJson('/api/system/branches?limit=10');
        $branches->assertOk()
            ->assertJsonPath('items.0._id', (string) $this->branch->id);

        $branch = $this->getJson('/api/system/branches/'.$this->branch->id);
        $branch->assertOk()
            ->assertJsonPath('_id', (string) $this->branch->id)
            ->assertJsonPath('code', 'HN');
    }

}
