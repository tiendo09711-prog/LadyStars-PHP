<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\MirrorRecord;
use App\Models\Product;
use App\Models\ProductBranchStock;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class DashboardOverviewTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Branch $branch;
    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::parse('2026-07-20 12:00:00', config('app.timezone')));

        $this->admin = User::create([
            'name' => 'Dashboard Admin',
            'email' => 'dashboard.admin@example.test',
            'password' => 'secret',
            'role' => 'ADMIN',
            'status' => 'ACTIVE',
            'is_root_owner' => false,
            'is_active' => true,
        ]);

        $this->branch = Branch::create([
            'mongo_id' => 'branchdash000000000001',
            'name' => 'Kho Hà Nội',
            'code' => 'HN',
            'is_active' => true,
        ]);

        $this->product = Product::create([
            'mongo_id' => 'productdash00000000001',
            'name' => 'SP Dashboard',
            'code' => 'DASH-01',
            'price' => 1000000,
            'cost' => 500000,
            'qty' => 5,
            'allows_sale' => true,
            'status' => 'Mới',
        ]);

        ProductBranchStock::create([
            'mongo_id' => 'stockdash0000000000001',
            'product_id' => $this->product->id,
            'branch_id' => $this->branch->id,
            'qty' => 5,
            'locked_quantity' => 0,
            'min_quantity' => 0,
            'max_quantity' => 999999,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function authHeaders(): array
    {
        return ['Authorization' => 'Bearer local-laravel-token-'.$this->admin->id];
    }

    private function seedSale(string $mongoId, string $code, Carbon $day, float $value, array $items): void
    {
        (new MirrorRecord())->forTable('sale_payments')->newQuery()->create([
            'mongo_id' => $mongoId,
            'code' => $code,
            'status' => 'completed',
            'type' => 'retail',
            'branch_id' => $this->branch->id,
            'business_date' => $day->copy()->setTime(10, 0),
            'completed_at' => $day->copy()->setTime(10, 0),
            'value_payment' => $value,
            'total' => $value,
            'value' => $value,
            'items' => $items,
            'payload' => ['items' => $items, 'code' => $code],
        ]);
    }

    public function test_chart_previous_period_walks_forward_not_backward(): void
    {
        // Current window 14–20 Jul: only 15th has revenue 1_000_000
        $this->seedSale('sale_cur_15', 'HD-C15', Carbon::parse('2026-07-15'), 1_000_000, [
            ['productId' => $this->product->id, 'amount' => 1, 'value' => 1_000_000, 'name' => $this->product->name],
        ]);
        // Correct previous window day for chart slot 15/07 is 08/07 (offset +1 from start 14 → prev start 07)
        // If bug walks backward, slot 15 would map to 06/07 instead.
        $this->seedSale('sale_prev_08', 'HD-P08', Carbon::parse('2026-07-08'), 2_000_000, [
            ['productId' => $this->product->id, 'amount' => 1, 'value' => 2_000_000, 'name' => $this->product->name],
        ]);
        $this->seedSale('sale_wrong_06', 'HD-W06', Carbon::parse('2026-07-06'), 9_000_000, [
            ['productId' => $this->product->id, 'amount' => 1, 'value' => 9_000_000, 'name' => $this->product->name],
        ]);
        // Day 07 (prev start) should appear on chart date 14
        $this->seedSale('sale_prev_07', 'HD-P07', Carbon::parse('2026-07-07'), 3_000_000, [
            ['productId' => $this->product->id, 'amount' => 1, 'value' => 3_000_000, 'name' => $this->product->name],
        ]);

        $response = $this->withHeaders($this->authHeaders())
            ->getJson('/api/dashboard?chartRange='.urlencode('7 ngày'));

        $response->assertOk();
        $chart = collect($response->json('chartData'));
        $this->assertCount(7, $chart);
        $this->assertSame('2026-07-14', $chart[0]['fullDate']);
        $this->assertSame('2026-07-20', $chart[6]['fullDate']);

        $byDate = $chart->keyBy('fullDate');
        // 14/07 → previous day 07/07
        $this->assertEquals(3_000_000.0, (float) $byDate['2026-07-14']['prevRevenue']);
        // 15/07 → previous day 08/07 (NOT 06/07)
        $this->assertEquals(2_000_000.0, (float) $byDate['2026-07-15']['prevRevenue']);
        $this->assertEquals(1_000_000.0, (float) $byDate['2026-07-15']['revenue']);

        $prevTotal = $chart->sum(fn ($row) => (float) $row['prevRevenue']);
        // Must include 07+08 only from our seeds (3M+2M), not 06 (9M)
        $this->assertEquals(5_000_000.0, $prevTotal);
        $this->assertEquals(5_000_000.0, (float) $response->json('totals.previousPeriodRevenue'));

        $this->assertNotEmpty($response->json('stores'));
        $this->assertSame('Kho Hà Nội', $response->json('stores.0.name'));
    }

    public function test_storage_duration_reads_last_sold_from_payload_items_when_items_column_empty(): void
    {
        $lastSold = Carbon::parse('2026-06-10 09:00:00');

        (new MirrorRecord())->forTable('sale_payments')->newQuery()->create([
            'mongo_id' => 'sale_payload_only_000001',
            'code' => 'HD-PAYLOAD',
            'status' => 'completed',
            'completed_at' => $lastSold,
            'business_date' => $lastSold,
            'value_payment' => 500000,
            'items' => null,
            'payload' => [
                'items' => [
                    [
                        'productId' => $this->product->id,
                        'productCode' => $this->product->code,
                        'name' => $this->product->name,
                        'amount' => 1,
                        'value' => 500000,
                    ],
                ],
            ],
        ]);

        $response = $this->withHeaders($this->authHeaders())
            ->getJson('/api/products/storage-duration?q=DASH-01&limit=5&thresholdDays=30');

        $response->assertOk()
            ->assertJsonPath('items.0.code', 'DASH-01')
            ->assertJsonPath('items.0.lastSoldDate', $lastSold->toIso8601String())
            ->assertJsonPath('items.0.status', 'slow_selling');
    }

    public function test_top_products_uses_payload_items_and_product_code_fallback(): void
    {
        $day = Carbon::parse('2026-07-18 11:00:00');
        (new MirrorRecord())->forTable('sale_payments')->newQuery()->create([
            'mongo_id' => 'sale_top_code_00000001',
            'code' => 'HD-TOP',
            'status' => 'completed',
            'branch_id' => $this->branch->id,
            'business_date' => $day,
            'completed_at' => $day,
            'value_payment' => 4_000_000,
            'items' => null,
            'payload' => [
                'items' => [
                    [
                        'productId' => null,
                        'productCode' => $this->product->code,
                        'name' => $this->product->name,
                        'amount' => 2,
                        'value' => 4_000_000,
                    ],
                ],
            ],
        ]);

        $response = $this->withHeaders($this->authHeaders())
            ->getJson('/api/dashboard?topRange='.urlencode('7 ngày').'&topLimit=10');

        $response->assertOk();
        $top = collect($response->json('topProducts'));
        $this->assertTrue($top->contains(fn ($row) => ($row['code'] ?? '') === 'DASH-01'));
        $hit = $top->first(fn ($row) => ($row['code'] ?? '') === 'DASH-01');
        $this->assertEquals(2.0, (float) $hit['qtySold']);
        $this->assertEquals(4_000_000.0, (float) $hit['revenue']);
    }
}
