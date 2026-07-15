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
        $list->assertOk()
            ->assertJsonPath('data.0.code', 'SP001')
            ->assertJsonStructure(['meta' => ['statuses']]);

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

    public function test_inventories_branch_filter_returns_full_stockBy_and_total_is_full(): void
    {
        $b2 = Branch::create(['mongo_id' => 'br2', 'name' => 'B2', 'code' => 'B2', 'is_active' => true]);
        $p = Product::create([
            'mongo_id' => 'pmb', 'name' => 'MultiB', 'code' => 'MB01', 'price' => 1, 'cost' => 1, 'allows_sale' => true,
        ]);
        ProductBranchStock::create(['product_id' => $p->id, 'branch_id' => $this->branch->id, 'qty' => 4, 'locked_quantity' => 1]);
        ProductBranchStock::create(['product_id' => $p->id, 'branch_id' => $b2->id, 'qty' => 9, 'locked_quantity' => 0]);

        $r = $this->getJson('/api/products/inventories?branchId='.$this->branch->id.'&perPage=5');
        $r->assertOk()
            ->assertJsonPath('data.0.code', 'MB01')
            ->assertJsonPath('data.0.stockByBranchId.'.$this->branch->id, 4)
            ->assertJsonPath('data.0.stockByBranchId.'.$b2->id, 9)
            ->assertJsonPath('data.0.totalStock', 13);
    }

    public function test_inventories_sellable_respects_locked_and_branch(): void
    {
        $b2 = Branch::create(['mongo_id' => 'br3', 'name' => 'B3', 'code' => 'B3', 'is_active' => true]);
        $p = Product::create(['mongo_id' => 'psl', 'name' => 'SL', 'code' => 'SL01', 'price' => 1, 'cost' => 1, 'allows_sale' => true]);
        ProductBranchStock::create(['product_id' => $p->id, 'branch_id' => $b2->id, 'qty' => 3, 'locked_quantity' => 3]); // sell=0

        $r = $this->getJson('/api/products/inventories?branchId='.$b2->id.'&stockStatus=sellable&perPage=5');
        $codes = collect($r->json('data') ?? [])->pluck('code')->all();
        $this->assertNotContains('SL01', $codes);
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

    /**
     * CARE-012: search must match display name from payload when SQL customer_name is empty.
     */
    public function test_customer_care_search_matches_payload_customer_name_and_columns(): void
    {
        (new MirrorRecord())->forTable('customer_cares')->newQuery()->create([
            'mongo_id' => 'carepayload000000000001',
            'code' => 'CARE-PAYLOAD-001',
            'customer_name' => null,
            'customer_phone' => null,
            'customer_code' => null,
            'details' => 'Trừ điểm',
            'reason' => 'Thu hồi điểm',
            'description' => 'Payload name only',
            'creator' => 'Tester Care',
            'record_date' => now(),
            'business_date' => now(),
            'payload' => [
                'code' => 'CARE-PAYLOAD-001',
                'customerName' => 'Chị Huệ Unicode Test',
                'customerPhone' => '0367100999',
                'customerCode' => 'KH-HUE-TEST',
            ],
        ]);

        (new MirrorRecord())->forTable('customer_cares')->newQuery()->create([
            'mongo_id' => 'carecolumn000000000001',
            'code' => 'CARE-COL-002',
            'customer_name' => 'Nguyễn Văn Column',
            'customer_phone' => '0911000222',
            'details' => 'Gọi điện',
            'reason' => 'Chăm sóc',
            'creator' => 'Admin Col',
            'record_date' => now(),
            'business_date' => now(),
            'payload' => ['code' => 'CARE-COL-002'],
        ]);

        $byPayloadName = $this->getJson('/api/customers/care?q='.rawurlencode('Chị Huệ Unicode Test').'&limit=20');
        $byPayloadName->assertOk();
        $this->assertGreaterThanOrEqual(1, (int) $byPayloadName->json('total'));
        $names = collect($byPayloadName->json('items'))->map(fn ($row) => $row['customerName'] ?? $row['customer_name'] ?? '')->all();
        $this->assertTrue(
            collect($names)->contains(fn ($n) => str_contains((string) $n, 'Chị Huệ')),
            'Expected payload customerName match in care search results'
        );

        $byPartial = $this->getJson('/api/customers/care?q='.rawurlencode('Huệ').'&limit=20');
        $byPartial->assertOk();
        $this->assertGreaterThanOrEqual(1, (int) $byPartial->json('total'));

        $byPhone = $this->getJson('/api/customers/care?q=0367100999&limit=20');
        $byPhone->assertOk()
            ->assertJsonPath('total', 1);

        $byCode = $this->getJson('/api/customers/care?q=CARE-COL-002&limit=20');
        $byCode->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('items.0.code', 'CARE-COL-002');

        $byColumnName = $this->getJson('/api/customers/care?q='.rawurlencode('Nguyễn Văn Column').'&limit=20');
        $byColumnName->assertOk();
        $this->assertGreaterThanOrEqual(1, (int) $byColumnName->json('total'));

        $missing = $this->getJson('/api/customers/care?q=ZZZ_NO_MATCH_CARE_SEARCH_999&limit=20');
        $missing->assertOk()
            ->assertJsonPath('total', 0);
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
            ->assertJsonPath('items.0.productCode', 'SP001')
            ->assertJsonPath('items.0.productName', $this->product->name)
            ->assertJsonPath('meta.logTypes.0', 'Cập nhật')
            ->assertJsonPath('meta.logActions.0', 'update')
            ->assertJsonPath('meta.editors.0', 'Admin')
            ->assertJsonPath('meta.toneByLogType.Cập nhật', 'warning');
        // createdAt phải ưu tiên business_date (đã set trong fixture)
        $respCreatedAt = $response->json('items.0.createdAt');
        $this->assertNotNull($respCreatedAt);
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

        // Additional coverage: branch filter should return scoped qty/globalQty/branchQty and not break shape
        $responseBranch = $this->getJson('/api/products/storage-duration?limit=5&branchId=' . $this->branch->id);
        $responseBranch->assertOk()
            ->assertJsonStructure([
                'items' => [
                    '*' => ['id', 'code', 'qty', 'globalQty', 'branchQty', 'branchName', 'status'],
                ],
                'kpis',
            ]);
    }

    public function test_storage_duration_matches_integer_local_product_id_and_legacy_inventory_mongo_field(): void
    {
        $lastSoldDate = now()->subDays(45)->setMicrosecond(0);
        $firstInventoryDate = now()->subDays(100)->setMicrosecond(0);
        $lastInventoryDate = now()->subDays(12)->setMicrosecond(0);

        // Live import stores productId as integer local PK in sale_payments.items JSON.
        (new MirrorRecord())->forTable('sale_payments')->newQuery()->create([
            'mongo_id' => 'saleintlocal000000000001',
            'code' => 'HD-INT',
            'status' => 'completed',
            'completed_at' => $lastSoldDate,
            'business_date' => $lastSoldDate,
            'items' => [['productId' => $this->product->id, 'productCode' => $this->product->code, 'name' => $this->product->name]],
            'payload' => ['code' => 'HD-INT'],
        ]);

        // Live inventory_products.product_mongo_id often holds local PK string, not hex mongo_id.
        (new MirrorRecord())->forTable('inventory_products')->newQuery()->create([
            'mongo_id' => 'invlegacy00000000000001',
            'product_mongo_id' => (string) $this->product->id,
            'business_date' => $firstInventoryDate,
            'payload' => ['legacy' => true],
        ]);
        (new MirrorRecord())->forTable('inventory_products')->newQuery()->create([
            'mongo_id' => 'invlegacy00000000000002',
            'product_mongo_id' => (string) $this->product->id,
            'business_date' => $lastInventoryDate,
            'payload' => ['legacy' => true],
        ]);

        $response = $this->getJson('/api/products/storage-duration?q=SP001&limit=10&thresholdDays=30');

        $response->assertOk()
            ->assertJsonPath('items.0.code', 'SP001')
            ->assertJsonPath('items.0.lastSoldDate', $lastSoldDate->toIso8601String())
            ->assertJsonPath('items.0.daysFromLastSold', 45)
            ->assertJsonPath('items.0.status', 'slow_selling')
            ->assertJsonPath('items.0.firstTransactionDate', $firstInventoryDate->toISOString())
            ->assertJsonPath('items.0.lastTransactionDate', $lastInventoryDate->toISOString())
            ->assertJsonPath('items.0.daysFromStart', 100);

        $slow = $this->getJson('/api/products/storage-duration?q=SP001&tab=slow_selling&thresholdDays=30');
        $slow->assertOk()->assertJsonPath('total', 1)->assertJsonPath('kpis.slowSelling', 1);
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
            ->assertJsonPath('role', 'GUEST')
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

    public function test_warehouse_transactions_meta_and_list_use_mysql_data(): void
    {
        $businessDate = now()->subDays(2);

        (new MirrorRecord())->forTable('inventory_vouchers')->newQuery()->create([
            'mongo_id' => 'voucher-tx-export-0001',
            'code' => 'PX-TX-001',
            'voucher_code' => 'PX-TX-001',
            'type' => 'Xuất bán lẻ',
            'import_export_type' => 'EXPORT',
            'warehouse_name' => $this->branch->name,
            'warehouse_mongo_id' => null,
            'branch_mongo_id' => null,
            'qty' => 3,
            'sp_count' => 1,
            'total_amount' => 300000,
            'creator' => 'Tester',
            'business_date' => $businessDate,
            'payload' => [
                'type' => 'Xuất bán lẻ',
                'import_export_type' => 'EXPORT',
                'warehouse_name' => $this->branch->name,
            ],
        ]);

        (new MirrorRecord())->forTable('inventory_vouchers')->newQuery()->create([
            'mongo_id' => 'voucher-tx-import-0001',
            'code' => 'PN-TX-001',
            'voucher_code' => 'PN-TX-001',
            'type' => 'Nhập khi tạo sản phẩm',
            'import_export_type' => 'IMPORT',
            'warehouse_name' => $this->branch->name,
            'qty' => 5,
            'sp_count' => 1,
            'total_amount' => 500000,
            'business_date' => $businessDate,
            'payload' => [
                'type' => 'Nhập khi tạo sản phẩm',
                'import_export_type' => 'IMPORT',
            ],
        ]);

        (new MirrorRecord())->forTable('inventory_products')->newQuery()->create([
            'mongo_id' => 'inv-line-tx-0001',
            'code' => 'PX-TX-001-LINE',
            'name' => 'Sản phẩm giao dịch test',
            'type' => 'Xuất bán lẻ',
            'branch_mongo_id' => (string) $this->branch->id,
            'product_mongo_id' => $this->product->mongo_id,
            'inventory_voucher_mongo_id' => 'voucher-tx-export-0001',
            'business_date' => $businessDate,
            'payload' => [
                'qty' => 2,
                'price' => 150000,
                'prodCode' => 'SP-TX-01',
                'prodName' => 'Sản phẩm giao dịch test',
                'code' => 'PX-TX-001',
                'source_row' => [
                    'values' => [
                        'C' => $this->branch->name,
                        'D' => 'SP-TX-01',
                        'E' => 'Sản phẩm giao dịch test',
                        'F' => '8900000000011',
                        'G' => '2',
                        'H' => '150000',
                        'I' => '300000',
                        'J' => 'Xuất bán lẻ',
                    ],
                ],
            ],
        ]);

        $meta = $this->getJson('/api/warehouse/transactions/meta');
        $meta->assertOk()
            ->assertJsonPath('warehouses.0.value', $this->branch->mongo_id)
            ->assertJsonPath('types.0.value', 'IMPORT')
            ->assertJsonPath('types.1.value', 'EXPORT');

        $exportBills = $this->getJson('/api/warehouse/transactions/bills?type=EXPORT&fromDate='.$businessDate->toDateString().'&toDate='.$businessDate->toDateString().'&limit=20');
        $exportBills->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('items.0.code', 'PX-TX-001')
            ->assertJsonPath('items.0.type', 'EXPORT')
            ->assertJsonPath('items.0.warehouseName', $this->branch->name)
            ->assertJsonPath('items.0.directionTone', 'export');

        $byWarehouse = $this->getJson('/api/warehouse/transactions/bills?warehouseId='.$this->branch->mongo_id.'&fromDate='.$businessDate->toDateString().'&toDate='.$businessDate->toDateString().'&limit=20');
        $byWarehouse->assertOk()
            ->assertJsonPath('total', 2);

        $items = $this->getJson('/api/warehouse/transactions/items?productKeyword=SP-TX-01&fromDate='.$businessDate->toDateString().'&toDate='.$businessDate->toDateString().'&limit=20');
        $items->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('items.0.productCode', 'SP-TX-01')
            ->assertJsonPath('items.0.productName', 'Sản phẩm giao dịch test')
            ->assertJsonPath('items.0.warehouseName', $this->branch->name)
            ->assertJsonPath('items.0.quantity', 2)
            ->assertJsonPath('items.0.unitPrice', 150000);

        $detail = $this->getJson('/api/warehouse/transactions/bills/inventory-voucher/voucher-tx-export-0001');
        $detail->assertOk()
            ->assertJsonPath('code', 'PX-TX-001')
            ->assertJsonPath('warehouseName', $this->branch->name)
            ->assertJsonPath('items.0.productCode', 'SP-TX-01')
            ->assertJsonPath('items.0.productName', 'Sản phẩm giao dịch test');

        $page2 = $this->getJson('/api/warehouse/transactions/bills?type=EXPORT&fromDate='.$businessDate->toDateString().'&toDate='.$businessDate->toDateString().'&page=1&limit=20');
        $page2->assertOk()
            ->assertJsonStructure([
                'items',
                'data',
                'total',
                'page',
                'limit',
                'per_page',
                'current_page',
                'last_page',
            ]);
    }

    public function test_warehouse_transactions_rejects_inverted_date_range(): void
    {
        $bills = $this->getJson('/api/warehouse/transactions/bills?fromDate=2026-12-31&toDate=2020-01-01&limit=20');
        $bills->assertStatus(422)
            ->assertJsonPath('message', 'Từ ngày không được lớn hơn Đến ngày.');

        $items = $this->getJson('/api/warehouse/transactions/items?fromDate=2026-12-31&toDate=2020-01-01&limit=20');
        $items->assertStatus(422)
            ->assertJsonPath('message', 'Từ ngày không được lớn hơn Đến ngày.');
    }

    public function test_warehouse_transactions_accepts_valid_date_range(): void
    {
        $response = $this->getJson('/api/warehouse/transactions/bills?fromDate=2026-01-01&toDate=2026-12-31&limit=20');
        $response->assertOk()
            ->assertJsonStructure([
                'items',
                'data',
                'total',
                'page',
                'limit',
                'per_page',
                'current_page',
                'last_page',
            ]);
    }

    public function test_payment_methods_endpoints_are_readable(): void
    {
        (new MirrorRecord())->forTable('payment_methods')->newQuery()->create([
            'mongo_id' => 'paymethod00000000000001',
            'code' => 'cash',
            'name' => 'Tiền mặt',
            'status' => 'active',
            'business_date' => now(),
            'payload' => [
                'code' => 'cash',
                'name' => 'Tiền mặt',
                'isActive' => true,
                'sortOrder' => 1,
            ],
        ]);

        (new MirrorRecord())->forTable('payment_methods')->newQuery()->create([
            'mongo_id' => 'paymethod00000000000002',
            'code' => 'bank_transfer',
            'name' => 'Chuyển khoản',
            'status' => 'inactive',
            'business_date' => now(),
            'payload' => [
                'code' => 'bank_transfer',
                'name' => 'Chuyển khoản',
                'isActive' => false,
                'sortOrder' => 2,
            ],
        ]);

        $canonical = $this->getJson('/api/products/payment-methods?limit=500');
        $canonical->assertOk()
            ->assertJsonStructure([
                'items' => [
                    '*' => ['_id', 'id', 'code', 'name', 'isActive', 'sortOrder'],
                ],
                'data',
                'total',
                'page',
                'limit',
            ])
            ->assertJsonPath('total', 2);

        $codes = collect($canonical->json('items'))->pluck('code')->all();
        $this->assertContains('cash', $codes);
        $this->assertContains('bank_transfer', $codes);

        $cash = collect($canonical->json('items'))->firstWhere('code', 'cash');
        $this->assertTrue((bool) ($cash['isActive'] ?? false));
        $this->assertSame(1, (int) ($cash['sortOrder'] ?? 0));

        $alias = $this->getJson('/api/products/payment-methods/standard?limit=500');
        $alias->assertOk()
            ->assertJsonPath('total', 2)
            ->assertJsonStructure([
                'items' => [
                    '*' => ['_id', 'code', 'name', 'isActive', 'sortOrder'],
                ],
            ]);
    }

    public function test_sale_payment_list_normalizes_legacy_total_amount_for_kpi(): void
    {
        (new MirrorRecord())->forTable('sale_payments')->newQuery()->create([
            'mongo_id' => 'salekpi0000000000000001',
            'code' => 'KPI001',
            'status' => 'completed',
            'type' => 'retail',
            'branch_mongo_id' => $this->branch->mongo_id,
            'branch_id' => $this->branch->id,
            'value' => null,
            'value_payment' => 4800000,
            'business_date' => now(),
            'completed_at' => now(),
            'items' => [[
                'name' => 'Sản phẩm KPI',
                'price' => 4800000,
                'value' => 4800000,
                'amount' => 1,
            ]],
            'payload' => [
                'code' => 'KPI001',
                'totalAmount' => 4800000,
                'valuePayment' => 4800000,
                'paymentMethod' => 'Tiền mặt',
                'customerName' => 'Khách KPI',
                'customerPhone' => '0900000111',
                'items' => [[
                    'name' => 'Sản phẩm KPI',
                    'price' => 4800000,
                    'value' => 4800000,
                    'amount' => 1,
                ]],
            ],
        ]);

        $response = $this->getJson('/api/products/sales?invoiceCode=KPI001&type=retail&limit=5');
        $response->assertOk()
            ->assertJsonPath('items.0.code', 'KPI001')
            ->assertJsonPath('items.0.value', 4800000)
            ->assertJsonPath('items.0.valuePayment', 4800000);

        $item = $response->json('items.0');
        $this->assertNotEmpty($item['typePayment'] ?? null);
        $this->assertSame('Khách KPI', $item['customerId']['name'] ?? null);
    }
}
