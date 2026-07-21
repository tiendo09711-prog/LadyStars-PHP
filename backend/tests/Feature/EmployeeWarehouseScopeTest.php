<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Product;
use App\Models\ProductBranchStock;
use App\Models\User;
use App\Support\LocalToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * EMPLOYEE warehouse assignment must scope sales pickers and stock-affecting writes.
 */
class EmployeeWarehouseScopeTest extends TestCase
{
    use RefreshDatabase;

    private Branch $saigon;

    private Branch $hanoi;

    private Product $product;

    private Customer $customer;

    private User $employee;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->saigon = Branch::create([
            'mongo_id' => 'branchsg000000000000001',
            'name' => 'Kho Sài Gòn',
            'code' => 'SG',
            'is_active' => true,
        ]);
        $this->hanoi = Branch::create([
            'mongo_id' => 'branchhn000000000000001',
            'name' => 'Kho Hà Nội',
            'code' => 'HN',
            'is_active' => true,
        ]);

        $category = Category::create([
            'mongo_id' => 'categoryscope000000001',
            'name' => 'Danh mục scope',
            'code' => 'SCOPE-CAT',
            'is_active' => true,
            'is_visible' => true,
        ]);
        $this->product = Product::create([
            'mongo_id' => 'productscope0000000001',
            'name' => 'SP Scope',
            'code' => 'SPSCOPE',
            'category_id' => $category->id,
            'price' => 100000,
            'cost' => 50000,
            'qty' => 20,
            'allows_sale' => true,
            'type' => 'product',
            'status' => 'Mới',
        ]);
        foreach ([$this->saigon, $this->hanoi] as $branch) {
            ProductBranchStock::create([
                'mongo_id' => 'stockscope'.str_pad((string) $branch->id, 12, '0', STR_PAD_LEFT),
                'product_id' => $this->product->id,
                'branch_id' => $branch->id,
                'qty' => 10,
                'locked_quantity' => 0,
                'min_quantity' => 0,
                'max_quantity' => 999999999,
            ]);
        }

        $this->customer = Customer::create([
            'mongo_id' => 'customerscope000000001',
            'name' => 'Khách scope',
            'code' => 'KHSCOPE',
            'phone' => '0911111111',
            'status' => 'active',
            'branch_id' => $this->saigon->id,
        ]);

        $this->admin = User::create([
            'name' => 'Admin Scope',
            'email' => 'admin.scope@example.test',
            'password' => 'secret',
            'role' => 'ADMIN',
            'status' => 'ACTIVE',
            'is_root_owner' => true,
            'is_active' => true,
        ]);

        $this->employee = User::create([
            'name' => 'NV Sài Gòn',
            'email' => 'employee.sg@example.test',
            'password' => 'secret',
            'role' => 'EMPLOYEE',
            'status' => 'ACTIVE',
            'is_root_owner' => false,
            'is_active' => true,
            'default_warehouse_id' => $this->saigon->id,
        ]);
        DB::table('user_warehouse_assignments')->insert([
            'user_id' => $this->employee->id,
            'branch_id' => $this->saigon->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_employee_branch_list_only_shows_assigned_warehouses(): void
    {
        $response = $this->withToken(LocalToken::issue($this->employee))
            ->getJson('/api/system/branches?limit=50');

        $response->assertOk();
        $ids = collect($response->json('items'))->pluck('_id')->map(fn ($id) => (string) $id)->all();
        $this->assertContains((string) $this->saigon->id, $ids);
        $this->assertNotContains((string) $this->hanoi->id, $ids);
        $this->assertCount(1, $ids);
    }

    public function test_admin_branch_list_shows_all_warehouses(): void
    {
        $response = $this->withToken(LocalToken::issue($this->admin))
            ->getJson('/api/system/branches?limit=50');

        $response->assertOk();
        $ids = collect($response->json('items'))->pluck('_id')->map(fn ($id) => (string) $id)->all();
        $this->assertContains((string) $this->saigon->id, $ids);
        $this->assertContains((string) $this->hanoi->id, $ids);
    }

    public function test_auth_me_returns_assigned_warehouse_ids_for_employee(): void
    {
        $response = $this->withToken(LocalToken::issue($this->employee))
            ->getJson('/api/auth/me');

        $response->assertOk()
            ->assertJsonPath('role', 'EMPLOYEE');
        $assigned = $response->json('assignedWarehouseIds') ?? [];
        $this->assertContains((string) $this->saigon->id, array_map('strval', $assigned));
        $this->assertNotContains((string) $this->hanoi->id, array_map('strval', $assigned));
    }

    public function test_employee_can_create_sale_on_assigned_warehouse(): void
    {
        $response = $this->withToken(LocalToken::issue($this->employee))
            ->postJson('/api/products/sales', [
                'branchId' => (string) $this->saigon->id,
                'customerId' => (string) $this->customer->id,
                'channel' => 'store',
                'type' => 'retail',
                'status' => 'draft',
                'valuePayment' => 100000,
                'items' => [[
                    'productId' => (string) $this->product->id,
                    'amount' => 1,
                    'value' => 100000,
                ]],
            ]);

        $response->assertCreated();
    }

    public function test_employee_cannot_create_sale_on_unassigned_warehouse(): void
    {
        $beforeQty = ProductBranchStock::query()
            ->where('product_id', $this->product->id)
            ->where('branch_id', $this->hanoi->id)
            ->value('qty');

        $response = $this->withToken(LocalToken::issue($this->employee))
            ->postJson('/api/products/sales', [
                'branchId' => (string) $this->hanoi->id,
                'customerId' => (string) $this->customer->id,
                'channel' => 'store',
                'type' => 'retail',
                'status' => 'draft',
                'valuePayment' => 100000,
                'items' => [[
                    'productId' => (string) $this->product->id,
                    'amount' => 1,
                    'value' => 100000,
                ]],
            ]);

        $response->assertForbidden();
        $this->assertDatabaseHas('product_branch_stocks', [
            'product_id' => $this->product->id,
            'branch_id' => $this->hanoi->id,
            'qty' => $beforeQty,
        ]);
    }

    public function test_employee_cannot_create_inventory_voucher_on_unassigned_warehouse(): void
    {
        $response = $this->withToken(LocalToken::issue($this->employee))
            ->postJson('/api/warehouse/vouchers', [
                'branchId' => (string) $this->hanoi->id,
                'type' => 'import',
                'status' => 'completed',
                'items' => [[
                    'productId' => (string) $this->product->id,
                    'amount' => 1,
                ]],
            ]);

        $response->assertForbidden();
    }

    public function test_employee_product_list_scopes_to_assigned_warehouse_stock(): void
    {
        // Product only in Hanoi — employee SG must not see it when listing without branch filter.
        $hanoiOnly = Product::create([
            'mongo_id' => 'productscopehanoi000001',
            'name' => 'SP Only HN',
            'code' => 'SPHANOI',
            'price' => 50000,
            'cost' => 20000,
            'qty' => 5,
            'allows_sale' => true,
            'type' => 'product',
            'status' => 'Mới',
        ]);
        ProductBranchStock::create([
            'mongo_id' => 'stockscopehanoi000001',
            'product_id' => $hanoiOnly->id,
            'branch_id' => $this->hanoi->id,
            'qty' => 5,
            'locked_quantity' => 0,
            'min_quantity' => 0,
            'max_quantity' => 999999999,
        ]);
        // Zero-stock row at SG must not expose the full catalog product.
        $zeroAtSg = Product::create([
            'mongo_id' => 'productscopezerosg00001',
            'name' => 'SP Zero SG',
            'code' => 'SPZEROSG',
            'price' => 10000,
            'cost' => 5000,
            'qty' => 0,
            'allows_sale' => true,
            'type' => 'product',
            'status' => 'Mới',
        ]);
        ProductBranchStock::create([
            'mongo_id' => 'stockscopezerosg000001',
            'product_id' => $zeroAtSg->id,
            'branch_id' => $this->saigon->id,
            'qty' => 0,
            'locked_quantity' => 0,
            'min_quantity' => 0,
            'max_quantity' => 999999999,
        ]);

        $response = $this->withToken(LocalToken::issue($this->employee))
            ->getJson('/api/products/products?limit=100');
        $response->assertOk();
        $codes = collect($response->json('items'))->pluck('code')->all();
        $this->assertContains('SPSCOPE', $codes);
        $this->assertNotContains('SPHANOI', $codes);
        $this->assertNotContains('SPZEROSG', $codes);

        // Explicit unassigned branch filter is forbidden.
        $this->withToken(LocalToken::issue($this->employee))
            ->getJson('/api/products/products?branchId='.$this->hanoi->id)
            ->assertForbidden();
    }

    public function test_employee_inventories_hides_other_warehouse_stock_columns(): void
    {
        $response = $this->withToken(LocalToken::issue($this->employee))
            ->getJson('/api/products/inventories?limit=50');
        $response->assertOk();
        $item = collect($response->json('items'))->firstWhere('code', 'SPSCOPE');
        $this->assertNotNull($item);
        $stockByBranch = $item['stockByBranchId'] ?? [];
        $this->assertArrayHasKey((string) $this->saigon->id, $stockByBranch);
        $this->assertArrayNotHasKey((string) $this->hanoi->id, $stockByBranch);
        // totalStock for employee is sum of assigned warehouses only (SG=10, not +HN).
        $this->assertEquals(10.0, (float) ($item['totalStock'] ?? 0));

        $zeroAtSg = Product::create([
            'mongo_id' => 'productscopezeroinv0001',
            'name' => 'SP Zero Inv',
            'code' => 'SPZEROINV',
            'price' => 10000,
            'cost' => 5000,
            'qty' => 0,
            'allows_sale' => true,
            'type' => 'product',
            'status' => 'Mới',
        ]);
        ProductBranchStock::create([
            'mongo_id' => 'stockscopezeroinv00001',
            'product_id' => $zeroAtSg->id,
            'branch_id' => $this->saigon->id,
            'qty' => 0,
            'locked_quantity' => 0,
            'min_quantity' => 0,
            'max_quantity' => 999999999,
        ]);
        $again = $this->withToken(LocalToken::issue($this->employee))
            ->getJson('/api/products/inventories?limit=50');
        $again->assertOk();
        $this->assertNotContains('SPZEROINV', collect($again->json('items'))->pluck('code')->all());
    }

    public function test_employee_storage_duration_scopes_to_assigned_warehouse(): void
    {
        $hanoiOnly = Product::create([
            'mongo_id' => 'productscopesdhn0000001',
            'name' => 'SP SD HN',
            'code' => 'SPSDHN',
            'price' => 50000,
            'cost' => 20000,
            'qty' => 8,
            'allows_sale' => true,
            'type' => 'product',
            'status' => 'Mới',
        ]);
        ProductBranchStock::create([
            'mongo_id' => 'stockscopeesdhn000001',
            'product_id' => $hanoiOnly->id,
            'branch_id' => $this->hanoi->id,
            'qty' => 8,
            'locked_quantity' => 0,
            'min_quantity' => 0,
            'max_quantity' => 999999999,
        ]);

        $response = $this->withToken(LocalToken::issue($this->employee))
            ->getJson('/api/products/storage-duration?limit=100');
        $response->assertOk();
        $codes = collect($response->json('items'))->pluck('code')->all();
        $this->assertContains('SPSCOPE', $codes);
        $this->assertNotContains('SPSDHN', $codes);

        $this->withToken(LocalToken::issue($this->employee))
            ->getJson('/api/products/storage-duration?branchId='.$this->hanoi->id)
            ->assertForbidden();
    }

    public function test_employee_transfer_meta_source_scoped_destination_full(): void
    {
        $response = $this->withToken(LocalToken::issue($this->employee))
            ->getJson('/api/warehouse/transfers/meta');
        $response->assertOk();

        $sourceValues = collect($response->json('warehouses'))->pluck('value')->map(fn ($v) => (string) $v)->all();
        $destValues = collect($response->json('destinationWarehouses'))->pluck('value')->map(fn ($v) => (string) $v)->all();
        $userIds = collect($response->json('userWarehouseIds'))->map(fn ($v) => (string) $v)->all();

        $this->assertContains((string) $this->saigon->mongo_id, $sourceValues);
        $this->assertNotContains((string) $this->hanoi->mongo_id, $sourceValues);
        $this->assertContains((string) $this->saigon->mongo_id, $destValues);
        $this->assertContains((string) $this->hanoi->mongo_id, $destValues);
        $this->assertContains((string) $this->saigon->mongo_id, $userIds);
    }

    public function test_employee_cannot_create_transfer_from_unassigned_source(): void
    {
        $response = $this->withToken(LocalToken::issue($this->employee))
            ->postJson('/api/warehouse/transfers', [
                'sourceWarehouseId' => (string) $this->hanoi->mongo_id,
                'destinationWarehouseId' => (string) $this->saigon->mongo_id,
                'lines' => [[
                    'productId' => (string) $this->product->id,
                    'requestedQuantity' => 1,
                ]],
            ]);

        $response->assertForbidden();
    }

    public function test_employee_can_create_transfer_from_assigned_source_to_any_dest(): void
    {
        $response = $this->withToken(LocalToken::issue($this->employee))
            ->postJson('/api/warehouse/transfers', [
                'sourceWarehouseId' => (string) $this->saigon->mongo_id,
                'destinationWarehouseId' => (string) $this->hanoi->mongo_id,
                'lines' => [[
                    'productId' => (string) $this->product->id,
                    'requestedQuantity' => 1,
                ]],
            ]);

        $response->assertCreated();
    }

    public function test_employee_transactions_meta_only_lists_assigned_warehouses(): void
    {
        $response = $this->withToken(LocalToken::issue($this->employee))
            ->getJson('/api/warehouse/transactions/meta');
        $response->assertOk();
        $values = collect($response->json('warehouses'))->pluck('value')->map(fn ($v) => (string) $v)->all();
        $localIds = collect($response->json('warehouses'))->pluck('localId')->map(fn ($v) => (int) $v)->all();
        $this->assertContains((int) $this->saigon->id, $localIds);
        $this->assertNotContains((int) $this->hanoi->id, $localIds);
        $this->assertTrue(
            in_array((string) $this->saigon->mongo_id, $values, true)
            || in_array((string) $this->saigon->id, $values, true)
        );
    }

    public function test_employee_audit_meta_only_lists_assigned_warehouses(): void
    {
        $response = $this->withToken(LocalToken::issue($this->employee))
            ->getJson('/api/inventory-audits/meta');
        $response->assertOk();
        $values = collect($response->json('warehouses'))->pluck('value')->map(fn ($v) => (string) $v)->all();
        $this->assertContains((string) $this->saigon->id, $values);
        $this->assertNotContains((string) $this->hanoi->id, $values);
    }

    public function test_employee_sales_list_scopes_to_assigned_warehouse(): void
    {
        $saleTable = (new \App\Models\MirrorRecord())->forTable('sale_payments')->getTable();
        $attrs = function (array $base) use ($saleTable): array {
            $columns = array_flip(\Illuminate\Support\Facades\Schema::getColumnListing($saleTable));
            return array_filter($base, fn ($key) => isset($columns[$key]), ARRAY_FILTER_USE_KEY);
        };

        (new \App\Models\MirrorRecord())->forTable('sale_payments')->newQuery()->create($attrs([
            'mongo_id' => 'salescope0000000000001',
            'code' => 'HD-SG-SCOPE',
            'name' => 'Sale SG',
            'status' => 'completed',
            'type' => 'retail',
            'branch_id' => $this->saigon->id,
            'branch_mongo_id' => $this->saigon->mongo_id,
            'payload' => ['branchId' => (string) $this->saigon->id, 'channel' => 'store', 'type' => 'retail'],
            'value_payment' => 100000,
        ]));
        (new \App\Models\MirrorRecord())->forTable('sale_payments')->newQuery()->create($attrs([
            'mongo_id' => 'salescope0000000000002',
            'code' => 'HD-HN-SCOPE',
            'name' => 'Sale HN',
            'status' => 'completed',
            'type' => 'retail',
            'branch_id' => $this->hanoi->id,
            'branch_mongo_id' => $this->hanoi->mongo_id,
            'payload' => ['branchId' => (string) $this->hanoi->id, 'channel' => 'store', 'type' => 'retail'],
            'value_payment' => 200000,
        ]));

        $allScoped = $this->withToken(LocalToken::issue($this->employee))
            ->getJson('/api/products/sales?type=retail&channel=store&limit=50');
        $allScoped->assertOk();
        $codes = collect($allScoped->json('items'))->pluck('code')->all();
        $this->assertContains('HD-SG-SCOPE', $codes);
        $this->assertNotContains('HD-HN-SCOPE', $codes);

        $wrongStore = $this->withToken(LocalToken::issue($this->employee))
            ->getJson('/api/products/sales?type=retail&channel=store&storeId='.$this->hanoi->id.'&limit=50');
        $wrongStore->assertOk();
        $this->assertSame([], $wrongStore->json('items') ?? []);
    }
}
