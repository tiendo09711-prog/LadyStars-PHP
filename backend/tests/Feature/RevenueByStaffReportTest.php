<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\MirrorRecord;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class RevenueByStaffReportTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;
    private Branch $branch2;
    private User $staffA;
    private User $staffB;
    private User $inactiveStaff;

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

        $this->staffA = User::create([
            'mongo_id' => 'user00000000000000000001',
            'name' => 'Nhan vien A',
            'email' => 'staff-a@example.test',
            'password' => bcrypt('password'),
            'role' => 'STAFF',
            'status' => 'ACTIVE',
            'is_active' => true,
        ]);

        $this->staffB = User::create([
            'mongo_id' => 'user00000000000000000002',
            'name' => 'Nhan vien B',
            'email' => 'staff-b@example.test',
            'password' => bcrypt('password'),
            'role' => 'STAFF',
            'status' => 'ACTIVE',
            'is_active' => true,
        ]);

        $this->inactiveStaff = User::create([
            'mongo_id' => 'user00000000000000000003',
            'name' => 'Nhan vien Nghi',
            'email' => 'staff-off@example.test',
            'password' => bcrypt('password'),
            'role' => 'STAFF',
            'status' => 'LOCKED',
            'is_active' => false,
        ]);

        // Staff A — retail completed HN
        (new MirrorRecord())->forTable('sale_payments')->newQuery()->create([
            'mongo_id' => 'sale00000000000000000001',
            'code' => 'HD-R-001',
            'status' => 'completed',
            'type' => 'retail',
            'branch_id' => $this->branch->id,
            'branch_mongo_id' => $this->branch->mongo_id,
            'user_id' => $this->staffA->id,
            'author_id' => $this->staffA->id,
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

        // Staff B — wholesale completed HCM
        (new MirrorRecord())->forTable('sale_payments')->newQuery()->create([
            'mongo_id' => 'sale00000000000000000002',
            'code' => 'HD-W-001',
            'status' => 'completed',
            'type' => 'wholesale',
            'branch_id' => $this->branch2->id,
            'branch_mongo_id' => $this->branch2->mongo_id,
            'user_id' => $this->staffB->id,
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

        // Inactive staff historical sale
        (new MirrorRecord())->forTable('sale_payments')->newQuery()->create([
            'mongo_id' => 'sale00000000000000000005',
            'code' => 'HD-OFF-001',
            'status' => 'completed',
            'type' => 'retail',
            'branch_id' => $this->branch->id,
            'branch_mongo_id' => $this->branch->mongo_id,
            'user_id' => $this->inactiveStaff->id,
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

        // Sale without staff → unknown group
        (new MirrorRecord())->forTable('sale_payments')->newQuery()->create([
            'mongo_id' => 'sale00000000000000000006',
            'code' => 'HD-UNK-001',
            'status' => 'completed',
            'type' => 'retail',
            'branch_id' => $this->branch->id,
            'user_id' => null,
            'author_id' => null,
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
            'user_id' => $this->staffA->id,
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
            'user_id' => $this->staffA->id,
            'value' => 30000,
            'value_payment' => 30000,
            'business_date' => Carbon::parse('2026-07-01 13:00:00'),
            'payload' => ['type' => 'retail'],
        ]);

        // Refund attributed to staff A
        (new MirrorRecord())->forTable('product_refunds')->newQuery()->create([
            'mongo_id' => 'refund00000000000000001',
            'code' => 'TH-001',
            'status' => 'completed',
            'payment_mongo_id' => 'sale00000000000000000001',
            'value' => 20000,
            'total' => 20000,
            'business_date' => Carbon::parse('2026-07-03 09:00:00'),
            'completed_at' => Carbon::parse('2026-07-03 09:00:00'),
            'user_id' => $this->staffA->id,
            'items' => [['amount' => 1, 'value' => 20000]],
            'payload' => [
                'channel' => 'store',
                'value' => 20000,
            ],
        ]);
    }

    public function test_options_endpoint_lists_staff_including_inactive(): void
    {
        $response = $this->getJson('/api/reports/revenue/staff/options');

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

        $staff = collect($response->json('staff'));
        $this->assertTrue($staff->contains(fn ($s) => $s['email'] === 'staff-a@example.test'));
        $this->assertTrue($staff->contains(fn ($s) => $s['email'] === 'staff-off@example.test' && $s['isActive'] === false));
    }

    public function test_report_groups_by_staff_with_correct_formulas(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/staff?from=2026-07-01&to=2026-07-03&compare=previous_period&metric=netRevenue'
        );

        $response->assertOk()
            ->assertJsonStructure([
                'filters' => ['from', 'to', 'staffIds', 'status', 'metric', 'timezone'],
                'summary' => [
                    'staffCount',
                    'grossRevenue',
                    'discountAmount',
                    'revenue',
                    'refundAmount',
                    'netRevenue',
                    'invoiceCount',
                    'itemQuantity',
                    'averageOrderValue',
                    'topStaff',
                ],
                'ranking',
                'trend' => ['granularity', 'series'],
                'breakdowns' => ['revenueShareByStaff', 'channels', 'paymentMethods', 'stores'],
                'table' => ['data', 'pagination', 'totals'],
                'meta' => ['generatedAt', 'currency', 'timezone', 'hasCostData'],
                'comparison' => ['period', 'metrics'],
            ]);

        // 4 completed sales (draft+cancelled excluded)
        $this->assertSame(4, $response->json('summary.invoiceCount'));
        // revenue = 90000 + 200000 + 50000 + 30000
        $this->assertEquals(370000.0, $response->json('summary.revenue'));
        $this->assertEquals(10000.0, $response->json('summary.discountAmount'));
        $this->assertEquals(380000.0, $response->json('summary.grossRevenue'));
        $this->assertEquals(20000.0, $response->json('summary.refundAmount'));
        $this->assertEquals(350000.0, $response->json('summary.netRevenue'));
        $this->assertEquals(9.0, $response->json('summary.itemQuantity'));
        $this->assertEquals(92500.0, $response->json('summary.averageOrderValue'));

        $ranking = collect($response->json('ranking'));
        $this->assertGreaterThanOrEqual(3, $ranking->count());

        $a = $ranking->firstWhere('staffId', (string) $this->staffA->id);
        $this->assertNotNull($a);
        $this->assertEquals(90000.0, $a['revenue']);
        $this->assertEquals(20000.0, $a['refundAmount']);
        $this->assertEquals(70000.0, $a['netRevenue']);
        $this->assertEquals(10000.0, $a['discountAmount']);
        $this->assertEquals(100000.0, $a['grossRevenue']);

        $b = $ranking->firstWhere('staffId', (string) $this->staffB->id);
        $this->assertNotNull($b);
        $this->assertEquals(200000.0, $b['revenue']);
        $this->assertEquals(0.0, $b['refundAmount']);

        $off = $ranking->firstWhere('staffId', (string) $this->inactiveStaff->id);
        $this->assertNotNull($off);
        $this->assertFalse($off['isActive']);
        $this->assertEquals(50000.0, $off['revenue']);

        $unknown = $ranking->firstWhere('staffId', 'unknown');
        $this->assertNotNull($unknown);
        $this->assertEquals(30000.0, $unknown['revenue']);
        $this->assertSame('Chưa xác định', $unknown['staffName']);

        $shareSum = $ranking->sum('revenueSharePercent');
        $this->assertEqualsWithDelta(100.0, $shareSum, 0.2);

        $this->assertEquals(370000.0, $response->json('table.totals.revenue'));
        $this->assertEquals(20000.0, $response->json('table.totals.refundAmount'));
    }

    public function test_staff_filter_and_refund_attribution(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/staff?from=2026-07-01&to=2026-07-03&compare=none&staffIds[]='.$this->staffA->id
        );

        $response->assertOk();
        $this->assertSame(1, $response->json('summary.invoiceCount'));
        $this->assertEquals(90000.0, $response->json('summary.revenue'));
        $this->assertEquals(20000.0, $response->json('summary.refundAmount'));
        $this->assertEquals(70000.0, $response->json('summary.netRevenue'));
        $this->assertSame(1, $response->json('meta.saleCountLoaded'));
        $this->assertSame(1, $response->json('meta.refundCountLoaded'));
    }

    public function test_draft_and_cancelled_excluded_by_default(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/staff?from=2026-07-01&to=2026-07-03&compare=none&staffIds[]='.$this->staffA->id
        );

        $response->assertOk();
        $this->assertSame(1, $response->json('summary.invoiceCount'));
        $this->assertNotEquals(170000.0, $response->json('summary.revenue'));
    }

    public function test_channel_filter_retail(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/staff?from=2026-07-01&to=2026-07-03&compare=none&channel=retail'
        );

        $response->assertOk();
        // A 90k + inactive 50k + unknown 30k = 170k (wholesale B excluded)
        $this->assertEquals(170000.0, $response->json('summary.revenue'));
        $this->assertSame(3, $response->json('summary.invoiceCount'));
    }

    public function test_store_filter(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/staff?from=2026-07-01&to=2026-07-03&compare=none&storeId='.$this->branch2->id
        );

        $response->assertOk();
        $this->assertSame(1, $response->json('summary.invoiceCount'));
        $this->assertEquals(200000.0, $response->json('summary.revenue'));
    }

    public function test_search_by_staff_name(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/staff?from=2026-07-01&to=2026-07-03&compare=none&search=Nhan%20vien%20A'
        );

        $response->assertOk();
        $this->assertSame(1, $response->json('summary.staffCount'));
        $this->assertEquals(90000.0, $response->json('summary.revenue'));
    }

    public function test_sort_and_pagination(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/staff?from=2026-07-01&to=2026-07-03&compare=none&sortBy=revenue&sortDirection=desc&perPage=20&page=1'
        );

        $response->assertOk()
            ->assertJsonPath('table.pagination.page', 1)
            ->assertJsonPath('table.pagination.perPage', 20);

        $data = $response->json('table.data');
        $this->assertCount(4, $data);
        $this->assertTrue($data[0]['revenue'] >= $data[1]['revenue']);
        $this->assertTrue($data[1]['revenue'] >= $data[2]['revenue']);
        $this->assertTrue($data[2]['revenue'] >= $data[3]['revenue']);
        $this->assertSame(4, $response->json('table.pagination.total'));
    }

    public function test_validation_rejects_bad_dates_and_sort(): void
    {
        $this->getJson('/api/reports/revenue/staff?from=2026-07-10&to=2026-07-01')
            ->assertStatus(422);

        $this->getJson('/api/reports/revenue/staff?from=2026-07-01&to=2026-07-03&sortBy=password')
            ->assertStatus(422);

        $this->getJson('/api/reports/revenue/staff?from=2026-07-01&to=2026-07-03&perPage=999')
            ->assertStatus(422);

        $this->getJson('/api/reports/revenue/staff?from=2026-07-01&to=2026-07-03&channel=online')
            ->assertStatus(422);
    }

    public function test_empty_range_returns_stable_zeros(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/staff?from=2020-01-01&to=2020-01-02&compare=none'
        );

        $response->assertOk();
        $this->assertSame(0, $response->json('summary.invoiceCount'));
        $this->assertEquals(0.0, $response->json('summary.revenue'));
        $this->assertEquals(0.0, $response->json('summary.netRevenue'));
        $this->assertSame(0, $response->json('summary.staffCount'));
        $this->assertNull($response->json('summary.topStaff'));
        $this->assertSame([], $response->json('ranking'));
    }

    public function test_response_does_not_expose_sensitive_user_fields(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/staff?from=2026-07-01&to=2026-07-03&compare=none'
        );

        $response->assertOk();
        $body = json_encode($response->json());
        $this->assertStringNotContainsString('password', $body);
        $this->assertStringNotContainsString('remember_token', $body);
        $this->assertStringNotContainsString('token_version', $body);
    }
}
