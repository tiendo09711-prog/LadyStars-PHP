<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Category;
use App\Models\Customer;
use App\Models\MirrorRecord;
use App\Models\Product;
use App\Models\ProductBranchStock;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LocalWriteApiTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;
    private Product $product;
    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->branch = Branch::create([
            'mongo_id' => 'branchlocal000000000001',
            'name' => 'Kho Local',
            'code' => 'LOCAL',
            'is_active' => true,
        ]);
        $category = Category::create([
            'mongo_id' => 'categorylocal000000001',
            'name' => 'Danh mục local',
            'code' => 'LOCAL-CAT',
            'is_active' => true,
            'is_visible' => true,
        ]);
        $this->product = Product::create([
            'mongo_id' => 'productlocal0000000001',
            'name' => 'Sản phẩm local',
            'code' => 'SPLOCAL',
            'category_id' => $category->id,
            'price' => 100000,
            'cost' => 50000,
            'qty' => 10,
            'allows_sale' => true,
            'type' => 'product',
            'status' => 'Mới',
        ]);
        ProductBranchStock::create([
            'mongo_id' => 'stocklocal000000000001',
            'product_id' => $this->product->id,
            'branch_id' => $this->branch->id,
            'qty' => 10,
            'locked_quantity' => 0,
            'min_quantity' => 0,
            'max_quantity' => 999999999,
        ]);
        $this->customer = Customer::create([
            'mongo_id' => 'customerlocal000000001',
            'name' => 'Khách local',
            'code' => 'KHLOCAL',
            'phone' => '0900000000',
            'status' => 'active',
            'branch_id' => $this->branch->id,
        ]);
        User::create([
            'mongo_id' => 'userlocal00000000000001',
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
    }

    public function test_local_login_returns_frontend_token(): void
    {
        $response = $this->postJson('/api/auth/login', [
            'email' => 'admin.local@example.test',
            'password' => 'anything',
        ]);

        $response->assertOk()
            ->assertJsonPath('token', 'local-laravel-token')
            ->assertJsonPath('user.email', 'admin.local@example.test');
    }

    public function test_customer_care_local_crud_works(): void
    {
        $created = $this->postJson('/api/customers/care', [
            'code' => 'CSLOCAL',
            'customerCode' => $this->customer->code,
            'customerName' => $this->customer->name,
            'customerPhone' => $this->customer->phone,
            'details' => 'Gọi chăm sóc',
            'reason' => 'Nhắc lịch',
            'creator' => 'Admin Local',
            'recordDate' => now()->toISOString(),
        ]);

        $created->assertCreated()
            ->assertJsonPath('code', 'CSLOCAL')
            ->assertJsonPath('customerPhone', '0900000000');

        $id = $created->json('_id');
        $updated = $this->patchJson('/api/customers/care/'.$id, ['reason' => 'Đổi lý do']);
        $updated->assertOk()->assertJsonPath('reason', 'Đổi lý do');

        $this->deleteJson('/api/customers/care/'.$id)->assertOk()->assertJsonPath('ok', true);
    }

    public function test_sale_create_and_complete_updates_local_stock(): void
    {
        $created = $this->postJson('/api/products/sales', [
            'branchId' => (string) $this->branch->id,
            'customerId' => (string) $this->customer->id,
            'status' => 'draft',
            'valuePayment' => 200000,
            'items' => [[
                'productId' => (string) $this->product->id,
                'amount' => 2,
                'value' => 100000,
            ]],
        ]);

        $created->assertCreated()->assertJsonPath('status', 'draft');
        $this->postJson('/api/products/sales/'.$created->json('_id').'/complete')
            ->assertOk()
            ->assertJsonPath('status', 'completed');

        $this->assertDatabaseHas('product_branch_stocks', [
            'product_id' => $this->product->id,
            'branch_id' => $this->branch->id,
            'qty' => 8,
        ]);
    }

    public function test_warehouse_voucher_and_transfer_local_writes_work(): void
    {
        $voucher = $this->postJson('/api/warehouse/vouchers', [
            'voucherId' => 'PNK-LOCAL',
            'warehouse' => (string) $this->branch->id,
            'type' => 'import',
            'spCount' => 1,
            'qty' => 3,
            'totalAmount' => 300000,
            'creator' => 'Admin Local',
        ]);
        $voucher->assertCreated()->assertJsonPath('code', 'PNK-LOCAL');

        $transfer = $this->postJson('/api/warehouse/transfers', [
            'sourceWarehouseId' => (string) $this->branch->id,
            'destinationWarehouseId' => (string) $this->branch->id,
            'status' => 'DRAFT',
            'lines' => [[
                'productId' => (string) $this->product->id,
                'quantity' => 1,
            ]],
        ]);
        $transfer->assertCreated()->assertJsonPath('status', 'DRAFT');

        $this->postJson('/api/warehouse/transfers/'.$transfer->json('_id').'/confirm-source')
            ->assertOk()
            ->assertJsonPath('status', 'IN_TRANSIT');
    }

    public function test_inventory_audit_local_endpoints_are_available(): void
    {
        $this->getJson('/api/inventory-audits/meta')->assertOk();
        $created = $this->postJson('/api/inventory-audits', [
            'code' => 'KKLOCAL',
            'warehouseId' => (string) $this->branch->id,
            'status' => 'DRAFT',
            'items' => [],
        ]);

        $created->assertCreated()->assertJsonPath('code', 'KKLOCAL');
        $this->postJson('/api/inventory-audits/'.$created->json('_id').'/submit')
            ->assertOk()
            ->assertJsonPath('status', 'IN_TRANSIT');
    }
}
