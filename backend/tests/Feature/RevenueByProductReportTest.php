<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Category;
use App\Models\MirrorRecord;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class RevenueByProductReportTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;
    private Category $category;
    private Category $category2;
    private Product $productA;
    private Product $productB;
    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();

        $this->branch = Branch::create([
            'mongo_id' => 'branch000000000000000001',
            'name' => 'Kho Ha Noi',
            'code' => 'HN',
            'is_active' => true,
        ]);

        $this->category = Category::create([
            'mongo_id' => 'category00000000000001',
            'name' => 'Toc gia',
            'code' => 'TOC',
            'is_active' => true,
            'is_visible' => true,
        ]);

        $this->category2 = Category::create([
            'mongo_id' => 'category00000000000002',
            'name' => 'Phu kien',
            'code' => 'PK',
            'is_active' => true,
            'is_visible' => true,
        ]);

        $this->productA = Product::create([
            'mongo_id' => 'product000000000000001',
            'name' => 'Mai gia A',
            'code' => 'SP-A',
            'category_id' => $this->category->id,
            'category_name' => 'Toc gia',
            'trademark_name' => 'BrandX',
            'price' => 100000,
            'cost' => 40000,
            'qty' => 10,
            'allows_sale' => true,
            'unit' => 'cai',
            'status' => 'Moi',
        ]);

        $this->productB = Product::create([
            'mongo_id' => 'product000000000000002',
            'name' => 'Kep toc B',
            'code' => 'SP-B',
            'category_id' => $this->category2->id,
            'category_name' => 'Phu kien',
            'trademark_name' => 'BrandY',
            'price' => 50000,
            'cost' => 20000,
            'qty' => 20,
            'allows_sale' => true,
            'unit' => 'cai',
            'status' => 'Moi',
        ]);

        $this->staff = User::create([
            'mongo_id' => 'user00000000000000000001',
            'name' => 'Nhan vien A',
            'email' => 'staff-product-a@example.test',
            'password' => bcrypt('password'),
            'role' => 'STAFF',
            'status' => 'ACTIVE',
            'is_active' => true,
        ]);

        // Sale 1: retail — product A x2 (total 180k after line discount 20k), product B x1 (50k)
        (new MirrorRecord())->forTable('sale_payments')->newQuery()->create([
            'mongo_id' => 'sale00000000000000000001',
            'code' => 'HD-R-001',
            'status' => 'completed',
            'type' => 'retail',
            'branch_id' => $this->branch->id,
            'user_id' => $this->staff->id,
            'author_id' => $this->staff->id,
            'value' => 230000,
            'value_payment' => 230000,
            'discount_value' => 0,
            'amount_products' => 3,
            'business_date' => Carbon::parse('2026-07-01 10:00:00'),
            'completed_at' => Carbon::parse('2026-07-01 10:00:00'),
            'payment_lines' => [['method' => 'Tiền mặt', 'amount' => 230000]],
            'items' => [
                [
                    'productId' => $this->productA->mongo_id,
                    'name' => 'Mai gia A',
                    'code' => 'SP-A',
                    'amount' => 2,
                    'value' => 100000,
                    'total' => 180000,
                    'discountValue' => 20000,
                ],
                [
                    'productId' => $this->productB->mongo_id,
                    'name' => 'Kep toc B',
                    'code' => 'SP-B',
                    'amount' => 1,
                    'value' => 50000,
                    'total' => 50000,
                    'discountValue' => 0,
                ],
            ],
            'payload' => ['type' => 'retail', 'channel' => 'store'],
        ]);

        // Sale 2: wholesale — product B x5 total 200k
        (new MirrorRecord())->forTable('sale_payments')->newQuery()->create([
            'mongo_id' => 'sale00000000000000000002',
            'code' => 'HD-W-001',
            'status' => 'completed',
            'type' => 'wholesale',
            'branch_id' => $this->branch->id,
            'user_id' => $this->staff->id,
            'value' => 200000,
            'value_payment' => 200000,
            'discount_value' => 0,
            'amount_products' => 5,
            'business_date' => Carbon::parse('2026-07-02 14:00:00'),
            'completed_at' => Carbon::parse('2026-07-02 14:00:00'),
            'payment_lines' => [['method' => 'Chuyển khoản', 'amount' => 200000]],
            'items' => [
                [
                    'productId' => $this->productB->id, // local PK form
                    'name' => 'Kep toc B',
                    'code' => 'SP-B',
                    'amount' => 5,
                    'value' => 40000,
                    'total' => 200000,
                ],
            ],
            'payload' => ['type' => 'wholesale', 'channel' => 'store'],
        ]);

        // Draft — excluded
        (new MirrorRecord())->forTable('sale_payments')->newQuery()->create([
            'mongo_id' => 'sale00000000000000000003',
            'code' => 'HD-DRAFT',
            'status' => 'draft',
            'type' => 'retail',
            'branch_id' => $this->branch->id,
            'value' => 99999,
            'value_payment' => 0,
            'business_date' => Carbon::parse('2026-07-01 12:00:00'),
            'items' => [
                [
                    'productId' => $this->productA->mongo_id,
                    'amount' => 1,
                    'total' => 99999,
                ],
            ],
            'payload' => ['type' => 'retail'],
        ]);

        // Refund of product A: 1 unit / 20000
        (new MirrorRecord())->forTable('product_refunds')->newQuery()->create([
            'mongo_id' => 'refund00000000000000001',
            'code' => 'TH-001',
            'status' => 'completed',
            'payment_mongo_id' => 'sale00000000000000000001',
            'value' => 20000,
            'total' => 20000,
            'business_date' => Carbon::parse('2026-07-03 09:00:00'),
            'completed_at' => Carbon::parse('2026-07-03 09:00:00'),
            'user_id' => $this->staff->id,
            'items' => [
                [
                    'productId' => $this->productA->mongo_id,
                    'amount' => 1,
                    'value' => 20000,
                    'total' => 20000,
                ],
            ],
            'payload' => ['channel' => 'store', 'value' => 20000, 'branchId' => (string) $this->branch->id],
        ]);
    }

    public function test_options_endpoint(): void
    {
        $response = $this->getJson('/api/reports/revenue/products/options');

        $response->assertOk()
            ->assertJsonStructure([
                'stores',
                'categories',
                'staff',
                'channels',
                'invoiceStatuses',
                'metrics',
                'topOptions',
                'perPageOptions',
                'timezone',
                'currency',
                'formulas',
            ])
            ->assertJsonPath('timezone', 'Asia/Ho_Chi_Minh')
            ->assertJsonPath('currency', 'VND');
    }

    public function test_report_aggregates_by_product_with_correct_formulas(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/products?from=2026-07-01&to=2026-07-03&compare=none&top=10'
        );

        $response->assertOk()
            ->assertJsonStructure([
                'filters' => ['from', 'to', 'status', 'metric', 'timezone'],
                'summary' => [
                    'productCount',
                    'grossRevenue',
                    'discountAmount',
                    'revenue',
                    'refundAmount',
                    'netRevenue',
                    'invoiceCount',
                    'itemQuantity',
                    'qtyReturned',
                    'averageSellingPrice',
                    'topProduct',
                ],
                'ranking',
                'timeline',
                'trend' => ['granularity', 'series'],
                'pareto' => ['totalNetRevenue', 'points'],
                'breakdowns' => ['categories', 'trademarks', 'channels'],
                'table' => ['data', 'pagination', 'totals'],
                'meta' => ['generatedAt', 'currency', 'timezone'],
            ]);

        // Line revenue: A 180000 + B 50000 + B 200000 = 430000
        $this->assertEquals(430000.0, $response->json('summary.revenue'));
        // Line discount only on A: 20000
        $this->assertEquals(20000.0, $response->json('summary.discountAmount'));
        // gross = revenue + line discount
        $this->assertEquals(450000.0, $response->json('summary.grossRevenue'));
        // refund from product A line: 20000
        $this->assertEquals(20000.0, $response->json('summary.refundAmount'));
        // net = 430000 - 20000
        $this->assertEquals(410000.0, $response->json('summary.netRevenue'));
        // qty: 2 + 1 + 5 = 8
        $this->assertEquals(8.0, $response->json('summary.itemQuantity'));
        // qty returned A: 1
        $this->assertEquals(1.0, $response->json('summary.qtyReturned'));
        // 2 completed invoices (draft excluded)
        $this->assertSame(2, $response->json('summary.invoiceCount'));
        // 2 products
        $this->assertSame(2, $response->json('summary.productCount'));

        $ranking = collect($response->json('ranking'));
        $prodA = $ranking->first(fn ($r) => $r['productCode'] === 'SP-A');
        $prodB = $ranking->first(fn ($r) => $r['productCode'] === 'SP-B');

        $this->assertNotNull($prodA);
        $this->assertNotNull($prodB);

        $this->assertEquals(180000.0, $prodA['revenue']);
        $this->assertEquals(20000.0, $prodA['discountAmount']);
        $this->assertEquals(200000.0, $prodA['grossRevenue']);
        $this->assertEquals(20000.0, $prodA['refundAmount']);
        $this->assertEquals(160000.0, $prodA['netRevenue']);
        $this->assertEquals(2.0, $prodA['itemQuantity']);
        $this->assertEquals(1.0, $prodA['qtyReturned']);
        $this->assertSame(1, $prodA['invoiceCount']);
        $this->assertEquals(90000.0, $prodA['averageSellingPrice']); // 180000/2

        $this->assertEquals(250000.0, $prodB['revenue']); // 50k + 200k
        $this->assertEquals(0.0, $prodB['refundAmount']);
        $this->assertEquals(250000.0, $prodB['netRevenue']);
        $this->assertEquals(6.0, $prodB['itemQuantity']);
        $this->assertSame(2, $prodB['invoiceCount']); // appears in both sales

        // Totals match summary revenue/refund
        $this->assertEquals(430000.0, $response->json('table.totals.revenue'));
        $this->assertEquals(20000.0, $response->json('table.totals.refundAmount'));

        // Category breakdown present
        $cats = collect($response->json('breakdowns.categories'));
        $this->assertTrue($cats->contains(fn ($c) => str_contains($c['label'], 'Toc') || str_contains($c['label'], 'Phu')));
    }

    public function test_draft_excluded_and_channel_filter(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/products?from=2026-07-01&to=2026-07-03&compare=none&channel=retail&top=10'
        );

        $response->assertOk();
        // Only sale 1: revenue 230000
        $this->assertEquals(230000.0, $response->json('summary.revenue'));
        $this->assertSame(1, $response->json('summary.invoiceCount'));
        // draft not included
        $this->assertNotEquals(329999.0, $response->json('summary.revenue'));
    }

    public function test_category_filter(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/products?from=2026-07-01&to=2026-07-03&compare=none&top=10&categoryIds[]='.$this->category->id
        );

        $response->assertOk();
        $this->assertSame(1, $response->json('summary.productCount'));
        $this->assertEquals(180000.0, $response->json('summary.revenue'));
        $this->assertEquals('SP-A', $response->json('ranking.0.productCode'));
    }

    public function test_search_filter(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/products?from=2026-07-01&to=2026-07-03&compare=none&top=10&search=SP-B'
        );

        $response->assertOk();
        $this->assertSame(1, $response->json('summary.productCount'));
        $this->assertEquals(250000.0, $response->json('summary.revenue'));
    }

    public function test_validation_rejects_invalid_dates_and_sort(): void
    {
        $this->getJson('/api/reports/revenue/products?from=2026-07-10&to=2026-07-01&top=10')
            ->assertStatus(422);

        $this->getJson('/api/reports/revenue/products?from=2026-07-01&to=2026-07-03&sortBy=hack&top=10')
            ->assertStatus(422);

        $this->getJson('/api/reports/revenue/products?from=2026-07-01&to=2026-07-03&top=99')
            ->assertStatus(422);

        $this->getJson('/api/reports/revenue/products?from=2026-07-01&to=2026-07-03&metric=notreal&top=10')
            ->assertStatus(422);
    }

    public function test_pagination_and_sort(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/products?from=2026-07-01&to=2026-07-03&compare=none&top=10&perPage=20&page=1&sortBy=revenue&sortDirection=desc'
        );

        $response->assertOk();
        $this->assertSame(20, $response->json('table.pagination.perPage'));
        $this->assertSame(2, $response->json('table.pagination.total'));
        $this->assertSame(1, $response->json('table.pagination.totalPages'));
        $this->assertCount(2, $response->json('table.data'));
        // Highest revenue is B (250k)
        $this->assertEquals('SP-B', $response->json('table.data.0.productCode'));
        $this->assertEquals('SP-A', $response->json('table.data.1.productCode'));

        $asc = $this->getJson(
            '/api/reports/revenue/products?from=2026-07-01&to=2026-07-03&compare=none&top=10&sortBy=revenue&sortDirection=asc'
        );
        $asc->assertOk();
        $this->assertEquals('SP-A', $asc->json('table.data.0.productCode'));
    }

    public function test_empty_range_returns_zeros(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/products?from=2020-01-01&to=2020-01-07&compare=none&top=10'
        );

        $response->assertOk();
        $this->assertSame(0, $response->json('summary.productCount'));
        $this->assertEquals(0.0, $response->json('summary.revenue'));
        $this->assertSame(0, $response->json('summary.invoiceCount'));
        $this->assertSame([], $response->json('ranking'));
        $this->assertSame(0, $response->json('table.pagination.total'));
    }
}
