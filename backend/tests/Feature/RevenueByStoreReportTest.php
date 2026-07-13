<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\MirrorRecord;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class RevenueByStoreReportTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;
    private Branch $branch2;
    private Branch $inactiveBranch;
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

        $this->branch2 = Branch::create([
            'mongo_id' => 'branch000000000000000002',
            'name' => 'Kho HCM',
            'code' => 'HCM',
            'is_active' => true,
        ]);

        $this->inactiveBranch = Branch::create([
            'mongo_id' => 'branch000000000000000003',
            'name' => 'Kho Da Nang (dong)',
            'code' => 'DN',
            'is_active' => false,
        ]);

        $this->staff = User::create([
            'mongo_id' => 'user00000000000000000001',
            'name' => 'Nhan vien A',
            'email' => 'staff-store-a@example.test',
            'password' => bcrypt('password'),
            'role' => 'STAFF',
            'status' => 'ACTIVE',
            'is_active' => true,
        ]);

        // Completed retail sale — branch HN
        (new MirrorRecord())->forTable('sale_payments')->newQuery()->create([
            'mongo_id' => 'sale00000000000000000001',
            'code' => 'HD-R-001',
            'status' => 'completed',
            'type' => 'retail',
            'branch_id' => $this->branch->id,
            'branch_mongo_id' => $this->branch->mongo_id,
            'user_id' => $this->staff->id,
            'author_id' => $this->staff->id,
            'value' => 90000,
            'value_payment' => 90000,
            'discount_value' => 10000,
            'amount_products' => 2,
            'total_cost' => 40000,
            'business_date' => Carbon::parse('2026-07-01 10:00:00'),
            'completed_at' => Carbon::parse('2026-07-01 10:00:00'),
            'payment_lines' => [['method' => 'Tiền mặt', 'amount' => 90000]],
            'items' => [
                ['amount' => 2, 'value' => 50000, 'total' => 100000],
            ],
            'payload' => [
                'type' => 'retail',
                'channel' => 'store',
                'discountValue' => 10000,
                'value' => 90000,
            ],
        ]);

        // Completed wholesale sale — branch HCM
        (new MirrorRecord())->forTable('sale_payments')->newQuery()->create([
            'mongo_id' => 'sale00000000000000000002',
            'code' => 'HD-W-001',
            'status' => 'completed',
            'type' => 'wholesale',
            'branch_id' => $this->branch2->id,
            'branch_mongo_id' => $this->branch2->mongo_id,
            'user_id' => $this->staff->id,
            'value' => 200000,
            'value_payment' => 200000,
            'discount_value' => 0,
            'amount_products' => 5,
            'business_date' => Carbon::parse('2026-07-02 14:00:00'),
            'completed_at' => Carbon::parse('2026-07-02 14:00:00'),
            'payment_lines' => [['method' => 'Chuyển khoản', 'amount' => 200000]],
            'items' => [['amount' => 5, 'value' => 40000, 'total' => 200000]],
            'payload' => ['type' => 'wholesale', 'channel' => 'store'],
        ]);

        // Inactive branch sale (historical)
        (new MirrorRecord())->forTable('sale_payments')->newQuery()->create([
            'mongo_id' => 'sale00000000000000000005',
            'code' => 'HD-DN-001',
            'status' => 'completed',
            'type' => 'retail',
            'branch_id' => $this->inactiveBranch->id,
            'branch_mongo_id' => $this->inactiveBranch->mongo_id,
            'user_id' => $this->staff->id,
            'value' => 50000,
            'value_payment' => 50000,
            'discount_value' => 0,
            'amount_products' => 1,
            'business_date' => Carbon::parse('2026-07-01 16:00:00'),
            'completed_at' => Carbon::parse('2026-07-01 16:00:00'),
            'payment_lines' => [['method' => 'Tiền mặt', 'amount' => 50000]],
            'items' => [['amount' => 1, 'value' => 50000, 'total' => 50000]],
            'payload' => ['type' => 'retail', 'channel' => 'store'],
        ]);

        // Sale without branch → unknown group
        (new MirrorRecord())->forTable('sale_payments')->newQuery()->create([
            'mongo_id' => 'sale00000000000000000006',
            'code' => 'HD-UNK-001',
            'status' => 'completed',
            'type' => 'retail',
            'branch_id' => null,
            'user_id' => $this->staff->id,
            'value' => 30000,
            'value_payment' => 30000,
            'discount_value' => 0,
            'amount_products' => 1,
            'business_date' => Carbon::parse('2026-07-02 09:00:00'),
            'completed_at' => Carbon::parse('2026-07-02 09:00:00'),
            'payment_lines' => [['method' => 'Tiền mặt', 'amount' => 30000]],
            'items' => [['amount' => 1, 'value' => 30000, 'total' => 30000]],
            'payload' => ['type' => 'retail', 'channel' => 'store'],
        ]);

        // Draft — excluded by default
        (new MirrorRecord())->forTable('sale_payments')->newQuery()->create([
            'mongo_id' => 'sale00000000000000000003',
            'code' => 'HD-DRAFT',
            'status' => 'draft',
            'type' => 'retail',
            'branch_id' => $this->branch->id,
            'value' => 50000,
            'value_payment' => 0,
            'business_date' => Carbon::parse('2026-07-01 12:00:00'),
            'payload' => ['type' => 'retail'],
        ]);

        // Cancelled — excluded by default
        (new MirrorRecord())->forTable('sale_payments')->newQuery()->create([
            'mongo_id' => 'sale00000000000000000004',
            'code' => 'HD-CANCEL',
            'status' => 'cancelled',
            'type' => 'retail',
            'branch_id' => $this->branch->id,
            'value' => 30000,
            'value_payment' => 30000,
            'business_date' => Carbon::parse('2026-07-01 13:00:00'),
            'payload' => ['type' => 'retail'],
        ]);

        // Refund linked to first sale via payment_mongo_id (no direct branch_id)
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
            'items' => [['amount' => 1, 'value' => 20000]],
            'payload' => [
                'channel' => 'store',
                'value' => 20000,
            ],
        ]);
    }

    public function test_options_endpoint_lists_stores_including_inactive(): void
    {
        $response = $this->getJson('/api/reports/revenue/store/options');

        $response->assertOk()
            ->assertJsonStructure([
                'stores',
                'staff',
                'channels',
                'invoiceStatuses',
                'compareModes',
                'metrics',
                'sortOptions',
                'trendGranularities',
                'perPageOptions',
                'timezone',
                'currency',
                'formulas',
            ])
            ->assertJsonPath('timezone', 'Asia/Ho_Chi_Minh')
            ->assertJsonPath('currency', 'VND');

        $stores = collect($response->json('stores'));
        $this->assertTrue($stores->contains(fn ($s) => $s['code'] === 'HN'));
        $this->assertTrue($stores->contains(fn ($s) => $s['code'] === 'DN' && $s['isActive'] === false));
    }

    public function test_report_groups_by_store_with_correct_formulas(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/store?from=2026-07-01&to=2026-07-03&compare=previous_period&metric=netRevenue'
        );

        $response->assertOk()
            ->assertJsonStructure([
                'filters' => ['from', 'to', 'storeIds', 'status', 'metric', 'timezone'],
                'summary' => [
                    'storeCount',
                    'grossRevenue',
                    'discountAmount',
                    'revenue',
                    'refundAmount',
                    'netRevenue',
                    'invoiceCount',
                    'itemQuantity',
                    'averageOrderValue',
                    'topStore',
                ],
                'ranking',
                'trend' => ['granularity', 'series'],
                'breakdowns' => ['revenueShareByStore', 'channels', 'paymentMethods', 'staff'],
                'table' => ['data', 'pagination', 'totals'],
                'meta' => ['generatedAt', 'currency', 'timezone', 'hasCostData'],
                'comparison' => ['period', 'metrics'],
            ]);

        // 4 completed sales (draft+cancelled excluded)
        $this->assertSame(4, $response->json('summary.invoiceCount'));
        // revenue = 90000 + 200000 + 50000 + 30000
        $this->assertEquals(370000.0, $response->json('summary.revenue'));
        // discount = 10000
        $this->assertEquals(10000.0, $response->json('summary.discountAmount'));
        // gross = 100000 + 200000 + 50000 + 30000
        $this->assertEquals(380000.0, $response->json('summary.grossRevenue'));
        // refund = 20000 only from product_refunds
        $this->assertEquals(20000.0, $response->json('summary.refundAmount'));
        // net = 370000 - 20000
        $this->assertEquals(350000.0, $response->json('summary.netRevenue'));
        // qty = 2+5+1+1
        $this->assertEquals(9.0, $response->json('summary.itemQuantity'));
        // aov = 370000 / 4
        $this->assertEquals(92500.0, $response->json('summary.averageOrderValue'));

        $ranking = collect($response->json('ranking'));
        $this->assertGreaterThanOrEqual(3, $ranking->count());

        $hn = $ranking->firstWhere('storeCode', 'HN');
        $this->assertNotNull($hn);
        $this->assertEquals(90000.0, $hn['revenue']);
        $this->assertEquals(20000.0, $hn['refundAmount']);
        $this->assertEquals(70000.0, $hn['netRevenue']);
        $this->assertEquals(10000.0, $hn['discountAmount']);
        $this->assertEquals(100000.0, $hn['grossRevenue']);

        $hcm = $ranking->firstWhere('storeCode', 'HCM');
        $this->assertNotNull($hcm);
        $this->assertEquals(200000.0, $hcm['revenue']);
        $this->assertEquals(0.0, $hcm['refundAmount']);

        $dn = $ranking->firstWhere('storeCode', 'DN');
        $this->assertNotNull($dn);
        $this->assertFalse($dn['isActive']);
        $this->assertEquals(50000.0, $dn['revenue']);

        $unknown = $ranking->firstWhere('storeId', 'unknown');
        $this->assertNotNull($unknown);
        $this->assertEquals(30000.0, $unknown['revenue']);
        $this->assertSame('Chưa xác định', $unknown['storeName']);

        // Share percents sum ~100 when net > 0
        $shareSum = $ranking->sum('revenueSharePercent');
        $this->assertEqualsWithDelta(100.0, $shareSum, 0.2);

        // Totals equal summary aggregates
        $this->assertEquals(370000.0, $response->json('table.totals.revenue'));
        $this->assertEquals(20000.0, $response->json('table.totals.refundAmount'));
    }

    public function test_refund_resolved_via_payment_mongo_id_not_double_counted(): void
    {
        // Sale already has no refunded_value field counted; only product_refunds contributes.
        // Create second refund would double — we assert single 20000 and HN net correct.
        $response = $this->getJson(
            '/api/reports/revenue/store?from=2026-07-01&to=2026-07-03&compare=none&storeIds[]='.$this->branch->id
        );

        $response->assertOk();
        $this->assertSame(1, $response->json('summary.invoiceCount'));
        $this->assertEquals(90000.0, $response->json('summary.revenue'));
        $this->assertEquals(20000.0, $response->json('summary.refundAmount'));
        $this->assertEquals(70000.0, $response->json('summary.netRevenue'));
        // meta counts prove one sale and one refund loaded (no double load)
        $this->assertSame(1, $response->json('meta.saleCountLoaded'));
        $this->assertSame(1, $response->json('meta.refundCountLoaded'));
    }

    public function test_draft_and_cancelled_excluded_by_default(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/store?from=2026-07-01&to=2026-07-03&compare=none&storeIds[]='.$this->branch->id
        );

        $response->assertOk();
        // Only one completed sale for HN
        $this->assertSame(1, $response->json('summary.invoiceCount'));
        $this->assertNotEquals(140000.0, $response->json('summary.revenue')); // would be if draft+cancel included
    }

    public function test_channel_filter_retail(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/store?from=2026-07-01&to=2026-07-03&compare=none&channel=retail'
        );

        $response->assertOk();
        // HN 90k + DN 50k + unknown 30k = 170k (wholesale HCM excluded)
        $this->assertEquals(170000.0, $response->json('summary.revenue'));
        $this->assertSame(3, $response->json('summary.invoiceCount'));
    }

    public function test_payment_method_filter(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/store?from=2026-07-01&to=2026-07-03&compare=none&paymentMethod='.urlencode('Chuyển khoản')
        );

        $response->assertOk();
        $this->assertSame(1, $response->json('summary.invoiceCount'));
        $this->assertEquals(200000.0, $response->json('summary.revenue'));
    }

    public function test_search_by_store_name(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/store?from=2026-07-01&to=2026-07-03&compare=none&search=Ha%20Noi'
        );

        $response->assertOk();
        $this->assertSame(1, $response->json('summary.storeCount'));
        $this->assertEquals(90000.0, $response->json('summary.revenue'));
    }

    public function test_sort_and_pagination(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/store?from=2026-07-01&to=2026-07-03&compare=none&sortBy=revenue&sortDirection=desc&perPage=20&page=1'
        );

        $response->assertOk()
            ->assertJsonPath('table.pagination.page', 1)
            ->assertJsonPath('table.pagination.perPage', 20);

        $data = $response->json('table.data');
        $this->assertCount(4, $data);
        // sortDirection=desc → revenue[i] >= revenue[i+1]
        $this->assertTrue($data[0]['revenue'] >= $data[1]['revenue']);
        $this->assertTrue($data[1]['revenue'] >= $data[2]['revenue']);
        $this->assertTrue($data[2]['revenue'] >= $data[3]['revenue']);
        $this->assertSame(4, $response->json('table.pagination.total'));
        $this->assertSame(1, $response->json('table.pagination.totalPages'));
    }

    public function test_cost_null_when_missing_on_some_stores(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/store?from=2026-07-01&to=2026-07-03&compare=none'
        );

        $response->assertOk();
        // Only one sale has total_cost → summary still has cost from that sale
        $this->assertEquals(40000.0, $response->json('summary.costAmount'));
        $this->assertTrue($response->json('meta.hasCostData'));

        $hcm = collect($response->json('ranking'))->firstWhere('storeCode', 'HCM');
        $this->assertNull($hcm['costAmount']);
        $this->assertNull($hcm['grossProfit']);
    }

    public function test_empty_range_returns_stable_zeros(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/store?from=2020-01-01&to=2020-01-07&compare=none'
        );

        $response->assertOk();
        $this->assertSame(0, $response->json('summary.invoiceCount'));
        $this->assertEquals(0.0, $response->json('summary.revenue'));
        $this->assertEquals(0.0, $response->json('summary.netRevenue'));
        $this->assertEquals(0.0, $response->json('summary.averageOrderValue'));
        $this->assertSame([], $response->json('ranking'));
    }

    public function test_invalid_date_range_returns_422(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/store?from=2026-07-10&to=2026-07-01'
        );

        $response->assertStatus(422);
    }

    public function test_invalid_enum_returns_422(): void
    {
        $this->getJson(
            '/api/reports/revenue/store?from=2026-07-01&to=2026-07-03&metric=invalid'
        )->assertStatus(422);

        $this->getJson(
            '/api/reports/revenue/store?from=2026-07-01&to=2026-07-03&perPage=15'
        )->assertStatus(422);

        $this->getJson(
            '/api/reports/revenue/store?from=2026-07-01&to=2026-07-03&channel=online'
        )->assertStatus(422);
    }

    public function test_report_is_get_only(): void
    {
        $response = $this->postJson('/api/reports/revenue/store', []);
        $this->assertTrue(in_array($response->status(), [404, 405], true));
    }

    public function test_api_does_not_mutate_records(): void
    {
        $salesBefore = (new MirrorRecord())->forTable('sale_payments')->newQuery()->count();
        $refundsBefore = (new MirrorRecord())->forTable('product_refunds')->newQuery()->count();

        $this->getJson(
            '/api/reports/revenue/store?from=2026-07-01&to=2026-07-03&compare=none'
        )->assertOk();

        $this->assertSame(
            $salesBefore,
            (new MirrorRecord())->forTable('sale_payments')->newQuery()->count()
        );
        $this->assertSame(
            $refundsBefore,
            (new MirrorRecord())->forTable('product_refunds')->newQuery()->count()
        );
    }

    public function test_compare_previous_period_shape(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/store?from=2026-07-01&to=2026-07-03&compare=previous_period'
        );

        $response->assertOk();
        $this->assertNotNull($response->json('comparison.period.from'));
        $this->assertNotNull($response->json('comparison.metrics.netRevenue'));
        $this->assertArrayHasKey('changePercent', $response->json('comparison.metrics.netRevenue'));
    }

    public function test_top_store_in_summary(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/store?from=2026-07-01&to=2026-07-03&compare=none'
        );

        $response->assertOk();
        $top = $response->json('summary.topStore');
        $this->assertNotNull($top);
        // HCM has highest net (200000)
        $this->assertSame('HCM', $top['code']);
        $this->assertEquals(200000.0, $top['netRevenue']);
    }
}
