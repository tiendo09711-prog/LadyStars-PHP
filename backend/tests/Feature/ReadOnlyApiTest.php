<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Category;
use App\Models\Customer;
use App\Models\MirrorRecord;
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
                    '*' => ['id', 'code', 'name', 'totalStock', 'stockByBranchId', 'stockByBranchCode'],
                ],
            ])
            ->assertJsonPath('data.0.code', 'SP001')
            ->assertJsonPath('data.0.totalStock', 12)
            ->assertJsonPath('data.0.stockByBranchId.'.$this->branch->id, 12)
            ->assertJsonPath('data.0.stockByBranchCode.HN', 12);
    }

    public function test_inventories_endpoint_sorts_by_branch_stock(): void
    {
        $secondBranch = Branch::create([
            'mongo_id' => 'branch000000000000000002',
            'name' => 'Kho HCM',
            'code' => 'HCM',
            'is_active' => true,
        ]);

        $productWithHigherTotalButLowerHanoiStock = Product::create([
            'mongo_id' => 'product000000000000002',
            'name' => 'Mai gia sort test',
            'code' => 'SP002',
            'category_id' => $this->product->category_id,
            'price' => 120000,
            'cost' => 60000,
            'qty' => 55,
            'allows_sale' => true,
            'unit' => 'cai',
            'status' => 'Moi',
            'category_name' => $this->product->category_name,
        ]);

        ProductBranchStock::create([
            'mongo_id' => 'stock00000000000000002',
            'product_id' => $productWithHigherTotalButLowerHanoiStock->id,
            'branch_id' => $this->branch->id,
            'qty' => 5,
            'locked_quantity' => 0,
            'min_quantity' => 0,
            'max_quantity' => 999999999,
        ]);

        ProductBranchStock::create([
            'mongo_id' => 'stock00000000000000003',
            'product_id' => $productWithHigherTotalButLowerHanoiStock->id,
            'branch_id' => $secondBranch->id,
            'qty' => 50,
            'locked_quantity' => 0,
            'min_quantity' => 0,
            'max_quantity' => 999999999,
        ]);

        $hanoiSort = $this->getJson('/api/products/inventories?sort=stock_'.$this->branch->id.'&order=desc&perPage=10');
        $hanoiSort->assertOk()
            ->assertJsonPath('data.0.code', 'SP001')
            ->assertJsonPath('data.1.code', 'SP002')
            ->assertJsonPath('data.0.stockByBranchId.'.$this->branch->id, 12)
            ->assertJsonPath('data.1.stockByBranchId.'.$this->branch->id, 5);

        $hcmSort = $this->getJson('/api/products/inventories?sort=stock_'.$secondBranch->id.'&order=desc&perPage=10');
        $hcmSort->assertOk()
            ->assertJsonPath('data.0.code', 'SP002')
            ->assertJsonPath('data.0.stockByBranchId.'.$secondBranch->id, 50);
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
        $inventories->assertOk()
            ->assertJsonPath('data.0.code', 'SP001')
            ->assertJsonPath('data.0.stockByBranchId.'.$this->branch->id, 12)
            ->assertJsonPath('data.0.totalStock', 12);
    }

    public function test_mirror_alias_routes_return_node_compatible_shapes(): void
    {
        (new MirrorRecord())->forTable('sale_payments')->newQuery()->create([
            'mongo_id' => 'sale000000000000000001',
            'code' => 'HD001',
            'status' => 'completed',
            'type' => 'retail',
            'branch_mongo_id' => $this->branch->mongo_id,
            'branch_id' => $this->branch->id,
            'customer_mongo_id' => $this->customer->mongo_id,
            'customer_id' => $this->customer->id,
            'amount_products' => 1,
            'value' => 100000,
            'value_payment' => 100000,
            'business_date' => now(),
            'completed_at' => now(),
            'items' => [['productCode' => $this->product->code]],
            'payment_lines' => [['method' => 'cash']],
            'payload' => ['code' => 'HD001'],
        ]);

        $response = $this->getJson('/api/products/payments?q=HD001&limit=5');

        $response->assertOk()
            ->assertJsonStructure([
                'items' => [
                    '*' => ['id', 'code', 'status', 'branch_id', 'customer_id'],
                ],
                'data',
                'total',
                'page',
                'limit',
            ])
            ->assertJsonPath('items.0.code', 'HD001')
            ->assertJsonPath('total', 1)
            ->assertJsonPath('limit', 5);

        $salesAlias = $this->getJson('/api/products/sales?invoiceCode=HD001&limit=5');
        $salesAlias->assertOk()
            ->assertJsonPath('items.0.code', 'HD001')
            ->assertJsonPath('total', 1);
    }

    public function test_warehouse_and_customer_mirror_aliases_are_readable(): void
    {
        (new MirrorRecord())->forTable('inventory_vouchers')->newQuery()->create([
            'mongo_id' => 'voucher000000000000001',
            'code' => 'PX001',
            'voucher_code' => 'PX001',
            'warehouse_name' => 'Kho Hà Nội',
            'import_export_type' => 'Xuất bán lẻ',
            'branch_mongo_id' => $this->branch->mongo_id,
            'branch_id' => $this->branch->id,
            'qty' => 1,
            'total_amount' => 100000,
            'business_date' => now(),
            'payload' => ['voucherId' => 'PX001'],
        ]);

        (new MirrorRecord())->forTable('customer_cares')->newQuery()->create([
            'mongo_id' => 'care00000000000000001',
            'code' => 'CSKH001',
            'customer_name' => 'Nguyễn Thị A',
            'customer_phone' => '0912345678',
            'details' => 'Gọi chăm sóc',
            'reason' => 'Sau bán hàng',
            'creator' => 'Admin',
            'record_date' => now(),
            'business_date' => now(),
            'payload' => ['code' => 'CSKH001'],
        ]);

        $voucher = $this->getJson('/api/warehouse/vouchers?q=PX001&limit=10');
        $voucher->assertOk()
            ->assertJsonPath('items.0.voucher_code', 'PX001')
            ->assertJsonPath('items.0.branch_id', $this->branch->id);

        $care = $this->getJson('/api/customers/care?q=0912345678&limit=10');
        $care->assertOk()
            ->assertJsonPath('items.0.customer_phone', '0912345678')
            ->assertJsonPath('total', 1);

        $careMeta = $this->getJson('/api/customers/care/meta');
        $careMeta->assertOk()
            ->assertJsonPath('reasons.0', 'Sau bán hàng')
            ->assertJsonPath('creators.0', 'Admin');
    }

    public function test_product_edit_logs_include_frontend_meta(): void
    {
        (new MirrorRecord())->forTable('product_edit_logs')->newQuery()->create([
            'mongo_id' => 'editlog000000000000001',
            'code' => 'LOG001',
            'product_mongo_id' => $this->product->mongo_id,
            'product_id' => $this->product->id,
            'product_code' => $this->product->code,
            'product_name' => $this->product->name,
            'field_name' => 'price',
            'old_value' => '90000',
            'new_value' => '100000',
            'log_type' => 'Cập nhật',
            'log_action' => 'update',
            'created_by' => 'Admin',
            'business_date' => now(),
            'payload' => ['productCode' => $this->product->code],
        ]);

        $response = $this->getJson('/api/products/edit-logs?q=SP001&limit=10');

        $response->assertOk()
            ->assertJsonPath('items.0.product_code', 'SP001')
            ->assertJsonPath('meta.logTypes.0', 'Cập nhật')
            ->assertJsonPath('meta.logActions.0', 'update')
            ->assertJsonPath('meta.editors.0', 'Admin')
            ->assertJsonPath('meta.toneByLogType.Cập nhật', 'warning');
    }


    public function test_storage_duration_ignores_cancelled_last_sale_and_uses_inventory_product_fallbacks(): void
    {
        $olderSaleDate = now()->subDays(40)->setMicrosecond(0);
        $cancelledSaleDate = now()->subDays(5)->setMicrosecond(0);
        $firstInventoryDate = now()->subDays(90)->setMicrosecond(0);
        $lastInventoryDate = now()->subDays(20)->setMicrosecond(0);

        (new MirrorRecord())->forTable('sale_payments')->newQuery()->create([
            'mongo_id' => 'saleold000000000000001',
            'code' => 'HD-OLD',
            'status' => 'completed',
            'completed_at' => $olderSaleDate,
            'business_date' => $olderSaleDate,
            'items' => [['productId' => $this->product->mongo_id, 'productCode' => $this->product->code]],
            'payload' => ['code' => 'HD-OLD'],
        ]);

        (new MirrorRecord())->forTable('sale_payments')->newQuery()->create([
            'mongo_id' => 'salecan000000000000001',
            'code' => 'HD-CANCEL',
            'status' => 'completed',
            'completed_at' => $cancelledSaleDate,
            'business_date' => $cancelledSaleDate,
            'items' => [['productId' => $this->product->mongo_id, 'productCode' => $this->product->code]],
            'payload' => ['code' => 'HD-CANCEL'],
        ]);

        (new MirrorRecord())->forTable('product_logs')->newQuery()->create([
            'mongo_id' => 'logcancel0000000000001',
            'product_id' => $this->product->id,
            'product_mongo_id' => $this->product->mongo_id,
            'source_type' => 'SalePaymentCancel',
            'source_mongo_id' => 'salecan000000000000001',
            'business_date' => now()->subDays(4),
            'payload' => ['sourceType' => 'SalePaymentCancel'],
        ]);

        (new MirrorRecord())->forTable('inventory_products')->newQuery()->create([
            'mongo_id' => 'invfirst00000000000001',
            'product_mongo_id' => $this->product->mongo_id,
            'product_code' => $this->product->code,
            'business_date' => $firstInventoryDate,
            'payload' => ['productCode' => $this->product->code],
        ]);

        (new MirrorRecord())->forTable('inventory_products')->newQuery()->create([
            'mongo_id' => 'invlast000000000000001',
            'product_code' => $this->product->code,
            'business_date' => $lastInventoryDate,
            'payload' => ['productCode' => $this->product->code],
        ]);

        $response = $this->getJson('/api/products/storage-duration?q=SP001&limit=10&thresholdDays=30');

        $response->assertOk()
            ->assertJsonPath('items.0.code', 'SP001')
            ->assertJsonPath('items.0.firstTransactionDate', $firstInventoryDate->toISOString())
            ->assertJsonPath('items.0.lastTransactionDate', $lastInventoryDate->toISOString())
            ->assertJsonPath('items.0.lastSoldDate', $olderSaleDate->toIso8601String())
            ->assertJsonPath('items.0.daysFromLastSold', 40);
    }

    public function test_warehouse_transfer_meta_matches_frontend_contract(): void
    {
        $response = $this->getJson('/api/warehouse/transfers/meta');

        $response->assertOk()
            ->assertJsonStructure([
                'role',
                'userWarehouseIds',
                'warehouses' => [
                    '*' => ['value', 'label', 'code'],
                ],
                'destinationWarehouses' => [
                    '*' => ['value', 'label', 'code'],
                ],
                'statuses' => [
                    '*' => ['value', 'label'],
                ],
            ])
            ->assertJsonPath('role', 'ADMIN')
            ->assertJsonPath('warehouses.0.value', $this->branch->mongo_id)
            ->assertJsonPath('destinationWarehouses.0.value', $this->branch->mongo_id)
            ->assertJsonPath('statuses.0.value', 'DRAFT');
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
