<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\MirrorRecord;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class RevenueByTimeReportTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;
    private Branch $branch2;
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

        $this->staff = User::create([
            'mongo_id' => 'user00000000000000000001',
            'name' => 'Nhan vien A',
            'email' => 'staff-a@example.test',
            'password' => bcrypt('password'),
            'role' => 'STAFF',
            'status' => 'ACTIVE',
            'is_active' => true,
        ]);

        // Completed retail sale day 1
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

        // Completed wholesale sale day 2
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

        // Draft — must be excluded by default
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

        // Refund linked to first sale
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
                'branchId' => $this->branch->id,
                'value' => 20000,
            ],
        ]);
    }

    public function test_options_endpoint_is_read_only_and_lists_filters(): void
    {
        $response = $this->getJson('/api/reports/revenue/time/options');

        $response->assertOk()
            ->assertJsonStructure([
                'stores',
                'staff',
                'channels',
                'invoiceStatuses',
                'granularities',
                'timezone',
                'currency',
                'formulas',
            ])
            ->assertJsonPath('timezone', 'Asia/Ho_Chi_Minh')
            ->assertJsonPath('currency', 'VND');

        $storeCodes = collect($response->json('stores'))->pluck('code')->all();
        $this->assertContains('HN', $storeCodes);
    }

    public function test_report_aggregates_completed_sales_and_refunds(): void
    {
        $response = $this->getJson('/api/reports/revenue/time?from=2026-07-01&to=2026-07-03&granularity=day&compare=previous_period');

        $response->assertOk()
            ->assertJsonStructure([
                'filters' => ['from', 'to', 'granularity', 'timezone'],
                'summary' => [
                    'grossRevenue',
                    'discountAmount',
                    'revenue',
                    'refundAmount',
                    'netRevenue',
                    'invoiceCount',
                    'itemQuantity',
                    'averageOrderValue',
                ],
                'timeline',
                'breakdowns' => ['stores', 'channels', 'paymentMethods', 'staff'],
                'table' => ['data', 'pagination', 'totals'],
                'meta' => ['generatedAt', 'currency', 'timezone'],
                'comparison' => ['period', 'metrics'],
            ]);

        // 2 completed invoices only (draft + cancelled excluded)
        $this->assertSame(2, $response->json('summary.invoiceCount'));
        // revenue = 90000 + 200000
        $this->assertEquals(290000.0, $response->json('summary.revenue'));
        // discount = 10000
        $this->assertEquals(10000.0, $response->json('summary.discountAmount'));
        // gross = 100000 + 200000
        $this->assertEquals(300000.0, $response->json('summary.grossRevenue'));
        // refund = 20000
        $this->assertEquals(20000.0, $response->json('summary.refundAmount'));
        // net = 290000 - 20000
        $this->assertEquals(270000.0, $response->json('summary.netRevenue'));
        // qty = 2 + 5
        $this->assertEquals(7.0, $response->json('summary.itemQuantity'));
        // cost present on one sale only → still counted
        $this->assertEquals(40000.0, $response->json('summary.costAmount'));

        $this->assertSame('VND', $response->json('meta.currency'));
        $this->assertNotEmpty($response->json('timeline'));
    }

    public function test_store_filter_limits_sales(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/time?from=2026-07-01&to=2026-07-03&granularity=day&storeId='.$this->branch->id.'&compare=none'
        );

        $response->assertOk();
        $this->assertSame(1, $response->json('summary.invoiceCount'));
        $this->assertEquals(90000.0, $response->json('summary.revenue'));
    }

    public function test_channel_retail_filter(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/time?from=2026-07-01&to=2026-07-03&granularity=day&channel=retail&compare=none'
        );

        $response->assertOk();
        $this->assertSame(1, $response->json('summary.invoiceCount'));
        $this->assertEquals(90000.0, $response->json('summary.revenue'));
    }

    public function test_invalid_date_range_returns_422(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/time?from=2026-07-10&to=2026-07-01&granularity=day'
        );

        $response->assertStatus(422);
    }

    public function test_hour_granularity_rejects_too_wide_range(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/time?from=2026-01-01&to=2026-03-01&granularity=hour'
        );

        $response->assertStatus(422);
    }

    public function test_report_is_get_only_no_post_route(): void
    {
        $response = $this->postJson('/api/reports/revenue/time', []);
        $this->assertTrue(in_array($response->status(), [404, 405], true));
    }

    public function test_pagination_and_sort(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/time?from=2026-07-01&to=2026-07-03&granularity=day&perPage=20&page=1&sortBy=revenue&sortDirection=desc&compare=none'
        );

        $response->assertOk()
            ->assertJsonPath('table.pagination.page', 1)
            ->assertJsonPath('table.pagination.perPage', 20);

        $data = $response->json('table.data');
        $this->assertIsArray($data);
        $this->assertNotEmpty($data);
    }

    public function test_summary_invariants_and_aov_formula(): void
    {
        $response = $this->getJson(
            '/api/reports/revenue/time?from=2026-07-01&to=2026-07-03&granularity=day&compare=none'
        );

        $response->assertOk();
        $s = $response->json('summary');
        $this->assertEqualsWithDelta($s['grossRevenue'], $s['revenue'] + $s['discountAmount'], 0.02);
        $this->assertEqualsWithDelta($s['netRevenue'], $s['revenue'] - $s['refundAmount'], 0.02);
        $this->assertEqualsWithDelta(
            $s['averageOrderValue'],
            $s['invoiceCount'] > 0 ? $s['revenue'] / $s['invoiceCount'] : 0,
            0.02
        );

        $totals = $response->json('table.totals');
        $this->assertEqualsWithDelta($s['revenue'], $totals['revenue'], 0.02);
        $this->assertEqualsWithDelta($s['invoiceCount'], $totals['invoiceCount'], 0.02);
    }

    public function test_payment_breakdown_uses_actual_line_amounts(): void
    {
        (new MirrorRecord())->forTable('sale_payments')->newQuery()->create([
            'mongo_id' => 'sale00000000000000000010',
            'code' => 'HD-SPLIT',
            'status' => 'completed',
            'type' => 'retail',
            'branch_id' => $this->branch->id,
            'user_id' => $this->staff->id,
            'value' => 100000,
            'value_payment' => 100000,
            'discount_value' => 0,
            'amount_products' => 1,
            'business_date' => Carbon::parse('2026-07-04 10:00:00'),
            'completed_at' => Carbon::parse('2026-07-04 10:00:00'),
            'payment_lines' => [
                ['method' => 'Tiền mặt', 'amount' => 30000],
                ['method' => 'Chuyển khoản', 'amount' => 70000],
            ],
            'items' => [['amount' => 1, 'value' => 100000]],
            'payload' => ['type' => 'retail', 'channel' => 'store'],
        ]);

        $response = $this->getJson(
            '/api/reports/revenue/time?from=2026-07-04&to=2026-07-04&granularity=day&compare=none'
        );

        $response->assertOk();
        $methods = collect($response->json('breakdowns.paymentMethods'));
        $cash = $methods->first(fn ($m) => mb_strtolower($m['label']) === mb_strtolower('Tiền mặt'));
        $transfer = $methods->first(fn ($m) => mb_strtolower($m['label']) === mb_strtolower('Chuyển khoản'));
        $this->assertNotNull($cash);
        $this->assertNotNull($transfer);
        $this->assertEquals(30000.0, $cash['revenue']);
        $this->assertEquals(70000.0, $transfer['revenue']);
        $this->assertSame('actual_line_amounts', $response->json('breakdowns.meta.paymentMethods.allocationMode'));
    }

    public function test_missing_type_and_staff_attribution_flags(): void
    {
        (new MirrorRecord())->forTable('sale_payments')->newQuery()->create([
            'mongo_id' => 'sale00000000000000000011',
            'code' => 'HD-NO-ATTR',
            'status' => 'completed',
            'type' => null,
            'branch_id' => $this->branch->id,
            'user_id' => null,
            'author_id' => null,
            'value' => 50000,
            'value_payment' => 50000,
            'discount_value' => 0,
            'amount_products' => 1,
            'business_date' => Carbon::parse('2026-07-05 11:00:00'),
            'completed_at' => Carbon::parse('2026-07-05 11:00:00'),
            'payment_lines' => [['method' => 'Tiền mặt', 'amount' => 50000]],
            'items' => [['amount' => 1]],
            'payload' => [],
        ]);

        $response = $this->getJson(
            '/api/reports/revenue/time?from=2026-07-05&to=2026-07-05&granularity=day&compare=none'
        );

        $response->assertOk();
        $this->assertFalse($response->json('breakdowns.meta.channels.hasMeaningfulAttribution'));
        $this->assertFalse($response->json('breakdowns.meta.staff.hasMeaningfulAttribution'));
        $this->assertFalse($response->json('meta.attribution.invoiceType.hasMeaningfulAttribution'));
        $this->assertFalse($response->json('meta.attribution.staff.hasMeaningfulAttribution'));
        $this->assertStringContainsString(
            'loại hóa đơn',
            (string) $response->json('breakdowns.meta.channels.message')
        );
    }

    public function test_options_include_capabilities_and_formulas(): void
    {
        $response = $this->getJson('/api/reports/revenue/time/options');
        $response->assertOk()
            ->assertJsonStructure([
                'capabilities' => ['invoiceType', 'staff', 'saleChannel', 'store', 'paymentMethod'],
                'formulas' => ['averageOrderValue', 'paymentBreakdown'],
            ]);
        $this->assertStringContainsString(
            'revenue / invoiceCount',
            (string) $response->json('formulas.averageOrderValue')
        );
    }


    public function test_options_and_validation_use_actual_sales_dimensions(): void
    {
        $options = $this->getJson('/api/reports/revenue/time/options');
        $options->assertOk();

        $this->assertSame(['retail', 'wholesale'], collect($options->json('channels'))->pluck('value')->sort()->values()->all());
        $this->assertSame(['store'], collect($options->json('saleChannels'))->pluck('value')->values()->all());
        $this->assertSame([(string) $this->staff->id], collect($options->json('staff'))->pluck('id')->values()->all());
        $this->assertTrue($options->json('capabilities.invoiceType.filterEnabled'));
        $this->assertTrue($options->json('capabilities.saleChannel.filterEnabled'));
        $this->assertTrue($options->json('capabilities.staff.filterEnabled'));

        $this->getJson(
            '/api/reports/revenue/time?from=2026-07-01&to=2026-07-03&granularity=day&channel=online'
        )->assertStatus(422);
        $this->getJson(
            '/api/reports/revenue/time?from=2026-07-01&to=2026-07-03&granularity=day&saleChannel=shopee'
        )->assertStatus(422);
    }


    public function test_refund_without_branch_metadata_excluded_when_store_filtered(): void
    {
        // Refund in range without branch metadata
        (new MirrorRecord())->forTable('product_refunds')->newQuery()->create([
            'mongo_id' => 'refund00000000000000099',
            'code' => 'TH-NO-BRANCH',
            'status' => 'completed',
            'value' => 15000,
            'total' => 15000,
            'business_date' => Carbon::parse('2026-07-01 15:00:00'),
            'completed_at' => Carbon::parse('2026-07-01 15:00:00'),
            'payload' => [],
        ]);

        $all = $this->getJson(
            '/api/reports/revenue/time?from=2026-07-01&to=2026-07-03&granularity=day&compare=none'
        );
        $all->assertOk();
        // base fixture refund 20000 + orphan 15000
        $this->assertEquals(35000.0, $all->json('summary.refundAmount'));

        $filtered = $this->getJson(
            '/api/reports/revenue/time?from=2026-07-01&to=2026-07-03&granularity=day&compare=none&storeId='.$this->branch->id
        );
        $filtered->assertOk();
        // Orphan refund without branch must not be assigned to the store filter.
        // Fixture refund has payload.branchId = branch id so still counted if resolvable.
        $this->assertGreaterThanOrEqual(1, (int) $filtered->json('meta.refunds.excludedMissingStore'));
        $this->assertLessThanOrEqual(20000.0, $filtered->json('summary.refundAmount'));
    }

    public function test_channel_filter_with_no_type_returns_empty_sales(): void
    {
        (new MirrorRecord())->forTable('sale_payments')->newQuery()->create([
            'mongo_id' => 'sale00000000000000000012',
            'code' => 'HD-NULL-TYPE',
            'status' => 'completed',
            'type' => null,
            'branch_id' => $this->branch->id,
            'value' => 11000,
            'value_payment' => 11000,
            'business_date' => Carbon::parse('2026-07-06 09:00:00'),
            'payment_lines' => [['method' => 'Tiền mặt', 'amount' => 11000]],
            'payload' => [],
        ]);

        $response = $this->getJson(
            '/api/reports/revenue/time?from=2026-07-06&to=2026-07-06&granularity=day&channel=retail&compare=none'
        );
        $response->assertOk();
        $this->assertSame(0, $response->json('summary.invoiceCount'));
    }
}
