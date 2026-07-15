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
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class WriteFlowApiTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;
    private Category $category;
    private CustomerGroup $group;
    private Product $product;
    private ProductBranchStock $stock;
    private User $admin;
    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::create([
            'name' => 'Admin Product Test',
            'email' => 'admin.product@example.test',
            'password' => 'secret',
            'role' => 'ADMIN',
            'status' => 'ACTIVE',
            'is_root_owner' => true,
            'is_active' => true,
        ]);

        $this->employee = User::create([
            'name' => 'Employee Product Test',
            'email' => 'employee.product@example.test',
            'password' => 'secret',
            'role' => 'EMPLOYEE',
            'status' => 'ACTIVE',
            'is_root_owner' => false,
            'is_active' => true,
        ]);

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

    private function adminHeaders(): array
    {
        return ['Authorization' => 'Bearer local-laravel-token-'.$this->admin->id];
    }

    private function employeeHeaders(): array
    {
        return ['Authorization' => 'Bearer local-laravel-token-'.$this->employee->id];
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

        $updated = $this->withHeaders($this->adminHeaders())->patchJson('/api/products/products/'.$productId, [
            'name' => 'S?n ph?m Test Updated',
            'price' => 160000,
            'categoryId' => $this->category->id,
            'type' => 'product',
        ]);

        $updated->assertOk()
            ->assertJsonPath('name', 'S?n ph?m Test Updated')
            ->assertJsonPath('price', 160000);

        ProductBranchStock::query()->where('product_id', $productId)->update(['qty' => 0, 'locked_quantity' => 0]);

        $deleted = $this->withHeaders($this->adminHeaders())->deleteJson('/api/products/products/'.$productId);
        $deleted->assertOk()->assertJsonPath('ok', true);
    }


    public function test_category_partial_status_update_keeps_existing_fields(): void
    {
        $parent = Category::create([
            'mongo_id' => 'categoryparent0000001',
            'name' => 'Parent category',
            'code' => 'CAT-PARENT',
            'is_active' => true,
            'is_visible' => true,
        ]);
        $category = Category::create([
            'mongo_id' => 'categorychild00000001',
            'name' => 'Child category',
            'code' => 'CAT-CHILD',
            'parent_id' => $parent->id,
            'is_active' => true,
            'is_visible' => true,
        ]);

        $response = $this->patchJson('/api/products/categories/'.$category->id, [
            'isActive' => false,
        ]);

        $response->assertOk()
            ->assertJsonPath('code', 'CAT-CHILD')
            ->assertJsonPath('parentId', (string) $parent->id)
            ->assertJsonPath('isActive', false);

        $this->assertDatabaseHas('categories', [
            'id' => $category->id,
            'code' => 'CAT-CHILD',
            'parent_id' => $parent->id,
            'is_active' => false,
        ]);
    }

    public function test_product_import_update_mode_updates_existing_product(): void
    {
        $csv = "code;name;qty;price\nSP001;Imported product name;3;123456\n";
        $file = UploadedFile::fake()->createWithContent('products.csv', $csv);

        $response = $this->withHeaders($this->adminHeaders())->post('/api/products/products/import', [
            'file' => $file,
            'branchId' => $this->branch->id,
            'importMode' => 'Cập nhật thông tin',
        ]);

        $response->assertOk()
            ->assertJsonPath('summary.updated', 1)
            ->assertJsonPath('summary.created', 0)
            ->assertJsonPath('summary.skipped', 0);

        $this->product->refresh();
        $this->assertSame('Imported product name', $this->product->name);
        $this->assertSame(123456.0, (float) $this->product->price);
        $this->assertDatabaseHas('product_branch_stocks', [
            'product_id' => $this->product->id,
            'branch_id' => $this->branch->id,
            'qty' => 15,
        ]);
    }

    public function test_employee_cannot_update_or_delete_product_via_api(): void
    {
        $beforeName = $this->product->name;

        $patched = $this->withHeaders($this->employeeHeaders())->patchJson('/api/products/products/'.$this->product->id, [
            'name' => 'HACKED BY EMP',
        ]);
        $patched->assertForbidden();
        $this->assertSame($beforeName, $this->product->fresh()->name);

        $this->stock->update(['qty' => 0, 'locked_quantity' => 0]);
        $deleted = $this->withHeaders($this->employeeHeaders())->deleteJson('/api/products/products/'.$this->product->id);
        $deleted->assertForbidden();
        $this->assertDatabaseHas('products', ['id' => $this->product->id]);

        $anon = $this->patchJson('/api/products/products/'.$this->product->id, ['name' => 'ANON']);
        $anon->assertForbidden();
    }

    public function test_employee_import_update_mode_is_forced_to_add_only(): void
    {
        $csv = "code;name;qty;price\nSP001;Should Not Update;3;999\nSPNEWIMP;Brand New Import;1;1000\n";
        $file = UploadedFile::fake()->createWithContent('products-emp.csv', $csv);

        $response = $this->withHeaders($this->employeeHeaders())->post('/api/products/products/import', [
            'file' => $file,
            'branchId' => $this->branch->id,
            'importMode' => 'Cập nhật thông tin',
        ]);

        $response->assertOk()
            ->assertJsonPath('summary.updated', 0)
            ->assertJsonPath('summary.created', 1)
            ->assertJsonPath('summary.skipped', 1);

        $this->product->refresh();
        $this->assertSame('M?i test', $this->product->name);
        $this->assertDatabaseHas('product_branch_stocks', [
            'product_id' => $this->product->id,
            'branch_id' => $this->branch->id,
            'qty' => 12,
        ]);
        $this->assertDatabaseHas('products', ['code' => 'SPNEWIMP', 'name' => 'Brand New Import']);
    }

    public function test_product_delete_is_blocked_when_stock_or_business_logs_exist(): void
    {
        $blockedByStock = $this->withHeaders($this->adminHeaders())->deleteJson('/api/products/products/'.$this->product->id);
        $blockedByStock->assertStatus(409)
            ->assertJsonPath('message', 'Không thể xóa sản phẩm đang còn tồn kho hoặc tồn khóa. Hãy đưa tồn về 0 trước.');

        $this->stock->update(['qty' => 0, 'locked_quantity' => 0]);
        (new MirrorRecord())->forTable('product_logs')->newQuery()->create([
            'mongo_id' => 'log000000000000000000001',
            'code' => 'LOG-SP001',
            'product_id' => $this->product->id,
            'product_mongo_id' => $this->product->mongo_id,
            'business_date' => now(),
            'payload' => ['productCode' => $this->product->code],
        ]);

        $blockedByLog = $this->withHeaders($this->adminHeaders())->deleteJson('/api/products/products/'.$this->product->id);
        $blockedByLog->assertStatus(409)
            ->assertJsonPath('message', 'Không thể xóa sản phẩm đã có chứng từ/log nghiệp vụ liên quan.');
    }

    public function test_product_create_requires_name(): void
    {
        $response = $this->postJson('/api/products/products', [
            'code' => 'SPNONAME',
            'type' => 'product',
            'unit' => 'cai',
            'price' => 1000,
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['name']);
    }

    public function test_product_partial_patch_status_does_not_require_name_or_reset_fields(): void
    {
        $before = $this->product->fresh();

        $response = $this->withHeaders($this->adminHeaders())->patchJson('/api/products/products/'.$this->product->id, [
            'status' => 'Đang bán',
        ]);

        $response->assertOk()
            ->assertJsonPath('status', 'Đang bán')
            ->assertJsonPath('name', $before->name)
            ->assertJsonPath('code', $before->code)
            ->assertJsonPath('unit', $before->unit)
            ->assertJsonPath('categoryId', (string) $before->category_id);
        $this->assertEquals((float) $before->price, (float) $response->json('price'));
        $this->assertEquals((float) $before->cost, (float) $response->json('cost'));

        $this->assertDatabaseHas('products', [
            'id' => $this->product->id,
            'status' => 'Đang bán',
            'name' => $before->name,
            'code' => $before->code,
            'category_id' => $before->category_id,
            'price' => $before->price,
            'cost' => $before->cost,
            'unit' => $before->unit,
        ]);
    }

    public function test_product_partial_patch_category_preserves_other_fields(): void
    {
        $other = Category::create([
            'mongo_id' => 'category00000000000099',
            'name' => 'Category B',
            'code' => 'CAT-B',
            'is_active' => true,
            'is_visible' => true,
        ]);
        $before = $this->product->fresh();

        $response = $this->withHeaders($this->adminHeaders())->patchJson('/api/products/products/'.$this->product->id, [
            'categoryId' => $other->id,
            'categoryName' => $other->name,
        ]);

        $response->assertOk()
            ->assertJsonPath('categoryId', (string) $other->id)
            ->assertJsonPath('name', $before->name)
            ->assertJsonPath('status', $before->status);
        $this->assertEquals((float) $before->price, (float) $response->json('price'));

        $this->assertDatabaseHas('products', [
            'id' => $this->product->id,
            'category_id' => $other->id,
            'category_name' => $other->name,
            'name' => $before->name,
            'status' => $before->status,
            'price' => $before->price,
        ]);
    }

    public function test_product_partial_patch_rejects_negative_price(): void
    {
        $response = $this->withHeaders($this->adminHeaders())->patchJson('/api/products/products/'.$this->product->id, [
            'price' => -10,
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['price']);
        $this->assertSame((float) $this->product->fresh()->price, (float) $this->product->price);
    }

    public function test_product_partial_patch_rejects_missing_category(): void
    {
        $response = $this->withHeaders($this->adminHeaders())->patchJson('/api/products/products/'.$this->product->id, [
            'categoryId' => 999999,
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['categoryId']);
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

        $user = User::query()->where('email', 'admin.local@example.test')->firstOrFail();
        $auth = $this->withHeaders([
            'Authorization' => 'Bearer local-laravel-token-'.$user->id,
        ])->getJson('/api/auth/me');
        $auth->assertOk()
            ->assertJsonPath('role', 'ADMIN')
            ->assertJsonPath('email', 'admin.local@example.test')
            ->assertJsonPath('branchId', (string) $this->branch->id);

        // Invalid/missing tokens must not bootstrap ADMIN.
        $this->withHeaders(['Authorization' => 'Bearer invalid-token'])->getJson('/api/auth/me')->assertUnauthorized();
        $this->flushHeaders();
        $this->getJson('/api/auth/me')->assertUnauthorized();

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
