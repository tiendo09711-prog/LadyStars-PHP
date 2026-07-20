<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\MirrorRecord;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class InventoryInOutStockReportTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;
    private Branch $branch2;

    protected function setUp(): void
    {
        parent::setUp();

        $this->branch = Branch::create([
            'mongo_id' => 'wh0000000000000000000001',
            'name' => 'Kho Ha Noi',
            'code' => 'HN',
            'is_active' => true,
        ]);
        $this->branch2 = Branch::create([
            'mongo_id' => 'wh0000000000000000000002',
            'name' => 'Kho HCM',
            'code' => 'HCM',
            'is_active' => true,
        ]);

        // Import product line day 1
        (new MirrorRecord())->forTable('inventory_products')->newQuery()->create([
            'mongo_id' => 'ip0000000000000000000001',
            'code' => 'PN-001',
            'name' => 'Ao thun',
            'type' => 'IMPORT',
            'branch_mongo_id' => $this->branch->mongo_id,
            'warehouse_name' => $this->branch->name,
            'inventory_voucher_mongo_id' => 'iv0000000000000000000001',
            'qty' => 10,
            'total_amount' => 100000,
            'business_date' => Carbon::parse('2026-07-01 09:00:00'),
            'payload' => [
                'prodCode' => 'SP01',
                'prodName' => 'Ao thun',
                'qty' => 10,
                'price' => 10000,
                'total_amount' => 100000,
                'type' => 'IMPORT',
                'refer_code' => 'PN-001',
            ],
        ]);

        // Export product line day 2
        (new MirrorRecord())->forTable('inventory_products')->newQuery()->create([
            'mongo_id' => 'ip0000000000000000000002',
            'code' => 'PX-001',
            'name' => 'Ao thun',
            'type' => 'EXPORT',
            'branch_mongo_id' => $this->branch->mongo_id,
            'warehouse_name' => $this->branch->name,
            'inventory_voucher_mongo_id' => 'iv0000000000000000000002',
            'qty' => 3,
            'total_amount' => 45000,
            'business_date' => Carbon::parse('2026-07-02 11:00:00'),
            'payload' => [
                'prodCode' => 'SP01',
                'prodName' => 'Ao thun',
                'qty' => 3,
                'price' => 15000,
                'total_amount' => 45000,
                'type' => 'EXPORT',
                'refer_code' => 'PX-001',
            ],
        ]);

        // Transfer with two lines day 3
        (new MirrorRecord())->forTable('warehouse_transfers')->newQuery()->create([
            'mongo_id' => 'tf0000000000000000000001',
            'code' => 'CK-001',
            'status' => 'IN_TRANSIT',
            'from_branch_mongo_id' => $this->branch->mongo_id,
            'to_branch_mongo_id' => $this->branch2->mongo_id,
            'business_date' => Carbon::parse('2026-07-03 14:00:00'),
            'payload' => [
                'code' => 'CK-001',
                'sourceWarehouseId' => $this->branch->mongo_id,
                'destinationWarehouseId' => $this->branch2->mongo_id,
                'sourceWarehouseName' => $this->branch->name,
                'destinationWarehouseName' => $this->branch2->name,
                'lines' => [
                    [
                        'productCode' => 'SP01',
                        'productName' => 'Ao thun',
                        'requestedQuantity' => 2,
                        'unitPrice' => 10000,
                    ],
                    [
                        'productCode' => 'SP02',
                        'productName' => 'Quan jean',
                        'requestedQuantity' => 1,
                        'unitPrice' => 20000,
                    ],
                ],
            ],
        ]);

        // Outside range — must not affect default filtered set when dates exclude it
        (new MirrorRecord())->forTable('inventory_products')->newQuery()->create([
            'mongo_id' => 'ip0000000000000000000099',
            'code' => 'PN-OLD',
            'name' => 'Old item',
            'type' => 'IMPORT',
            'branch_mongo_id' => $this->branch2->mongo_id,
            'warehouse_name' => $this->branch2->name,
            'qty' => 50,
            'business_date' => Carbon::parse('2026-01-01 09:00:00'),
            'payload' => [
                'prodCode' => 'OLD',
                'prodName' => 'Old item',
                'qty' => 50,
                'type' => 'IMPORT',
            ],
        ]);
    }

    public function test_api_01_default_filters_and_shape(): void
    {
        $response = $this->getJson('/api/reports/inventory/in-out-stock?fromDate=2026-07-01&toDate=2026-07-03&perPage=20&page=1');
        $response->assertOk();
        $json = $response->json();

        $this->assertArrayHasKey('filters', $json);
        $this->assertArrayHasKey('summary', $json);
        $this->assertArrayHasKey('timeline', $json);
        $this->assertArrayHasKey('table', $json);
        $this->assertArrayHasKey('meta', $json);

        $this->assertSame('2026-07-01', $json['filters']['fromDate']);
        $this->assertSame('2026-07-03', $json['filters']['toDate']);
        $this->assertSame(10.0, (float) $json['summary']['totalIn']);
        $this->assertSame(6.0, (float) $json['summary']['totalOut']); // 3 export + 2 + 1 transfer
        $this->assertSame(4.0, (float) $json['summary']['netQty']);
        $this->assertSame(4, (int) $json['summary']['lineCount']);
        $this->assertIsFloat($json['summary']['totalIn'] + 0.0);
        $this->assertCount(3, $json['timeline']);
        $this->assertSame(4, (int) $json['table']['pagination']['total']);
    }

    public function test_api_02_date_validation(): void
    {
        $response = $this->getJson('/api/reports/inventory/in-out-stock?fromDate=2026-07-10&toDate=2026-07-01');
        $response->assertStatus(422);
        $this->assertStringContainsString('Từ ngày', (string) $response->json('message'));
    }

    public function test_api_03_branch_filter(): void
    {
        $response = $this->getJson('/api/reports/inventory/in-out-stock?fromDate=2026-07-01&toDate=2026-07-03&warehouseId='.$this->branch2->mongo_id);
        $response->assertOk();
        // Branch2 only appears as transfer destination; transfer is still matched by from/to filter.
        $this->assertGreaterThanOrEqual(1, (int) $response->json('table.pagination.total'));
        foreach ($response->json('table.data') as $row) {
            $this->assertTrue(
                str_contains((string) ($row['warehouseName'] ?? ''), 'HCM')
                || ($row['type'] ?? '') === 'TRANSFER'
            );
        }
    }

    public function test_api_04_product_keyword(): void
    {
        $response = $this->getJson('/api/reports/inventory/in-out-stock?fromDate=2026-07-01&toDate=2026-07-03&q=Quan%20jean');
        $response->assertOk();
        $this->assertSame(1, (int) $response->json('table.pagination.total'));
        $this->assertSame('SP02', $response->json('table.data.0.productCode'));
    }

    public function test_api_05_type_filter(): void
    {
        $response = $this->getJson('/api/reports/inventory/in-out-stock?fromDate=2026-07-01&toDate=2026-07-03&type=IMPORT');
        $response->assertOk();
        $this->assertSame(1, (int) $response->json('table.pagination.total'));
        $this->assertSame('IMPORT', $response->json('table.data.0.type'));
        $this->assertSame(10.0, (float) $response->json('summary.totalIn'));
        $this->assertSame(0.0, (float) $response->json('summary.totalOut'));
    }

    public function test_api_detail_path_and_source_for_rows(): void
    {
        $response = $this->getJson('/api/reports/inventory/in-out-stock?fromDate=2026-07-01&toDate=2026-07-03&perPage=20&page=1');
        $response->assertOk();

        $rows = $response->json('table.data');
        $this->assertNotEmpty($rows);

        $import = collect($rows)->firstWhere('type', 'IMPORT');
        $this->assertNotNull($import);
        $this->assertSame('inventory-voucher', $import['source']);
        $this->assertSame('iv0000000000000000000001', $import['sourceId']);
        $this->assertNotEmpty($import['detailPath']);
        $this->assertStringContainsString('source=inventory-voucher', (string) $import['detailPath']);
        $this->assertStringContainsString('sourceId=iv0000000000000000000001', (string) $import['detailPath']);

        $transfer = collect($rows)->firstWhere('type', 'TRANSFER');
        $this->assertNotNull($transfer);
        $this->assertSame('warehouse-transfer', $transfer['source']);
        $this->assertSame('tf0000000000000000000001', $transfer['sourceId']);
        $this->assertSame('/warehouse/transfers/tf0000000000000000000001', $transfer['detailPath']);
    }

    public function test_api_06_pagination(): void
    {
        $page1 = $this->getJson('/api/reports/inventory/in-out-stock?fromDate=2026-07-01&toDate=2026-07-03&perPage=2&page=1&sortBy=date&sortDir=asc');
        $page1->assertOk();
        $this->assertCount(2, $page1->json('table.data'));
        $this->assertSame(4, (int) $page1->json('table.pagination.total'));
        $this->assertSame(2, (int) $page1->json('table.pagination.totalPages'));

        $page2 = $this->getJson('/api/reports/inventory/in-out-stock?fromDate=2026-07-01&toDate=2026-07-03&perPage=2&page=2&sortBy=date&sortDir=asc');
        $page2->assertOk();
        $this->assertCount(2, $page2->json('table.data'));
        $this->assertNotEquals(
            $page1->json('table.data.0.id'),
            $page2->json('table.data.0.id')
        );
    }

    public function test_api_07_aggregate_independent_of_page(): void
    {
        $page1 = $this->getJson('/api/reports/inventory/in-out-stock?fromDate=2026-07-01&toDate=2026-07-03&perPage=1&page=1');
        $page2 = $this->getJson('/api/reports/inventory/in-out-stock?fromDate=2026-07-01&toDate=2026-07-03&perPage=1&page=2');
        $page1->assertOk();
        $page2->assertOk();
        $this->assertSame($page1->json('summary'), $page2->json('summary'));
        $this->assertSame($page1->json('timeline'), $page2->json('timeline'));
        $this->assertSame($page1->json('breakdowns'), $page2->json('breakdowns'));
        $this->assertSame(
            (float) $page1->json('table.totals.qtyIn'),
            (float) $page1->json('summary.totalIn')
        );
    }

    public function test_api_08_empty_result(): void
    {
        $response = $this->getJson('/api/reports/inventory/in-out-stock?fromDate=2025-01-01&toDate=2025-01-05');
        $response->assertOk();
        $this->assertSame(0, (int) $response->json('summary.lineCount'));
        $this->assertSame(0.0, (float) $response->json('summary.totalIn'));
        $this->assertSame([], $response->json('table.data'));
        $this->assertSame(0, (int) $response->json('table.pagination.total'));
    }

    public function test_api_11_timezone_boundary_inclusive(): void
    {
        $response = $this->getJson('/api/reports/inventory/in-out-stock?fromDate=2026-07-01&toDate=2026-07-01');
        $response->assertOk();
        $this->assertSame(1, (int) $response->json('table.pagination.total'));
        $this->assertSame(10.0, (float) $response->json('summary.totalIn'));
    }

    public function test_api_12_numeric_types_not_strings(): void
    {
        $response = $this->getJson('/api/reports/inventory/in-out-stock?fromDate=2026-07-01&toDate=2026-07-03');
        $response->assertOk();
        $summary = $response->json('summary');
        foreach (['totalIn', 'totalOut', 'netQty', 'valueIn', 'valueOut'] as $key) {
            $this->assertIsNumeric($summary[$key]);
            $this->assertFalse(is_string($summary[$key]), "{$key} must not be numeric string");
        }
        $row = $response->json('table.data.0');
        $this->assertIsNumeric($row['qtyIn']);
        $this->assertIsNumeric($row['qtyOut']);
    }

    public function test_export_full_filtered_set(): void
    {
        $response = $this->get('/api/reports/inventory/in-out-stock/export?fromDate=2026-07-01&toDate=2026-07-03');
        $response->assertOk();
        $this->assertStringContainsString('text/csv', (string) $response->headers->get('content-type'));
        $content = $response->streamedContent();
        $this->assertStringContainsString('PN-001', $content);
        $this->assertStringContainsString('CK-001', $content);
        $this->assertStringStartsWith("\xEF\xBB\xBF", $content);
    }

    public function test_options_endpoint(): void
    {
        $response = $this->getJson('/api/reports/inventory/in-out-stock/options');
        $response->assertOk();
        $this->assertNotEmpty($response->json('warehouses'));
        $this->assertNotEmpty($response->json('types'));
        $this->assertContains(20, $response->json('perPageOptions'));
    }
}
