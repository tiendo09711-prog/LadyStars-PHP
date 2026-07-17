<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\MirrorRecord;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class InventoryPendingTransfersReportTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;
    private Branch $branch2;

    protected function setUp(): void
    {
        parent::setUp();
        $this->branch = Branch::create([
            'mongo_id' => 'whp000000000000000000001',
            'name' => 'Kho A',
            'code' => 'A',
            'is_active' => true,
        ]);
        $this->branch2 = Branch::create([
            'mongo_id' => 'whp000000000000000000002',
            'name' => 'Kho B',
            'code' => 'B',
            'is_active' => true,
        ]);

        (new MirrorRecord())->forTable('warehouse_transfers')->newQuery()->create([
            'mongo_id' => 'tfp000000000000000000001',
            'code' => 'CK-P-001',
            'status' => 'DRAFT',
            'from_branch_mongo_id' => $this->branch->mongo_id,
            'to_branch_mongo_id' => $this->branch2->mongo_id,
            'business_date' => Carbon::now()->subDays(5),
            'payload' => [
                'code' => 'CK-P-001',
                'sourceWarehouseId' => $this->branch->mongo_id,
                'destinationWarehouseId' => $this->branch2->mongo_id,
                'lines' => [['requestedQuantity' => 3, 'productCode' => 'SP01']],
            ],
        ]);

        (new MirrorRecord())->forTable('warehouse_transfers')->newQuery()->create([
            'mongo_id' => 'tfp000000000000000000002',
            'code' => 'CK-P-002',
            'status' => 'IN_TRANSIT',
            'from_branch_mongo_id' => $this->branch->mongo_id,
            'to_branch_mongo_id' => $this->branch2->mongo_id,
            'business_date' => Carbon::now()->subDays(1),
            'payload' => [
                'code' => 'CK-P-002',
                'lines' => [['requestedQuantity' => 2]],
            ],
        ]);

        // Completed — must never appear in pending report.
        (new MirrorRecord())->forTable('warehouse_transfers')->newQuery()->create([
            'mongo_id' => 'tfp000000000000000000099',
            'code' => 'CK-DONE',
            'status' => 'COMPLETED',
            'from_branch_mongo_id' => $this->branch->mongo_id,
            'to_branch_mongo_id' => $this->branch2->mongo_id,
            'business_date' => Carbon::now()->subDays(2),
            'payload' => ['code' => 'CK-DONE', 'lines' => [['requestedQuantity' => 9]]],
        ]);
    }

    public function test_only_pending_canonical_statuses(): void
    {
        $response = $this->getJson('/api/reports/inventory/pending-transfers');
        $response->assertOk();
        $statuses = collect($response->json('table.data'))->pluck('status')->unique()->values()->all();
        foreach ($statuses as $status) {
            $this->assertContains($status, ['DRAFT', 'IN_TRANSIT', 'RETURN_IN_PROGRESS']);
        }
        $this->assertSame(2, (int) $response->json('summary.totalPending'));
        $codes = collect($response->json('table.data'))->pluck('code')->all();
        $this->assertNotContains('CK-DONE', $codes);
    }

    public function test_aggregate_independent_of_page(): void
    {
        $p1 = $this->getJson('/api/reports/inventory/pending-transfers?perPage=1&page=1');
        $p2 = $this->getJson('/api/reports/inventory/pending-transfers?perPage=1&page=2');
        $p1->assertOk();
        $p2->assertOk();
        $this->assertSame($p1->json('summary'), $p2->json('summary'));
        $this->assertSame($p1->json('breakdowns'), $p2->json('breakdowns'));
    }

    public function test_source_destination_filter(): void
    {
        $response = $this->getJson('/api/reports/inventory/pending-transfers?sourceWarehouseId='.$this->branch->mongo_id.'&destinationWarehouseId='.$this->branch2->mongo_id);
        $response->assertOk();
        $this->assertGreaterThanOrEqual(1, (int) $response->json('table.pagination.total'));
    }

    public function test_status_filter_rejects_non_pending(): void
    {
        $response = $this->getJson('/api/reports/inventory/pending-transfers?status=COMPLETED');
        $response->assertStatus(422);
    }
}
