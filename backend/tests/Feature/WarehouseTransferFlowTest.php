<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Category;
use App\Models\MirrorRecord;
use App\Models\Product;
use App\Models\ProductBranchStock;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Isolated warehouse-transfer flow tests (SQLite :memory: via phpunit.xml).
 * Does not touch MySQL ladystars_php.
 */
class WarehouseTransferFlowTest extends TestCase
{
    use RefreshDatabase;

    private Branch $source;
    private Branch $destination;
    private Product $product;
    private Product $productB;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->source = Branch::create([
            'mongo_id' => 'whsrc000000000000000001',
            'name' => 'Kho Nguồn Test',
            'code' => 'SRC',
            'is_active' => true,
        ]);
        $this->destination = Branch::create([
            'mongo_id' => 'whdst000000000000000001',
            'name' => 'Kho Đích Test',
            'code' => 'DST',
            'is_active' => true,
        ]);
        $category = Category::create([
            'mongo_id' => 'catxfer000000000000001',
            'name' => 'Cat Transfer',
            'code' => 'CAT-XFER',
            'is_active' => true,
            'is_visible' => true,
        ]);
        $this->product = Product::create([
            'mongo_id' => 'prodxfer000000000000001',
            'name' => 'SP Transfer A',
            'code' => 'SP-XFER-A',
            'category_id' => $category->id,
            'price' => 10000,
            'cost' => 5000,
            'qty' => 12,
            'allows_sale' => true,
            'type' => 'product',
            'status' => 'Mới',
        ]);
        $this->productB = Product::create([
            'mongo_id' => 'prodxfer000000000000002',
            'name' => 'SP Transfer B',
            'code' => 'SP-XFER-B',
            'category_id' => $category->id,
            'price' => 20000,
            'cost' => 8000,
            'qty' => 5,
            'allows_sale' => true,
            'type' => 'product',
            'status' => 'Mới',
        ]);
        ProductBranchStock::create([
            'mongo_id' => 'stocksrc000000000000001',
            'product_id' => $this->product->id,
            'branch_id' => $this->source->id,
            'qty' => 10,
            'locked_quantity' => 0,
            'min_quantity' => 0,
            'max_quantity' => 999999999,
        ]);
        ProductBranchStock::create([
            'mongo_id' => 'stockdst000000000000001',
            'product_id' => $this->product->id,
            'branch_id' => $this->destination->id,
            'qty' => 2,
            'locked_quantity' => 0,
            'min_quantity' => 0,
            'max_quantity' => 999999999,
        ]);
        ProductBranchStock::create([
            'mongo_id' => 'stocksrc000000000000002',
            'product_id' => $this->productB->id,
            'branch_id' => $this->source->id,
            'qty' => 5,
            'locked_quantity' => 0,
            'min_quantity' => 0,
            'max_quantity' => 999999999,
        ]);
        ProductBranchStock::create([
            'mongo_id' => 'stockdst000000000000002',
            'product_id' => $this->productB->id,
            'branch_id' => $this->destination->id,
            'qty' => 1,
            'locked_quantity' => 0,
            'min_quantity' => 0,
            'max_quantity' => 999999999,
        ]);
        $this->admin = User::create([
            'mongo_id' => 'userxfer000000000000001',
            'name' => 'Admin Transfer',
            'email' => 'admin.transfer@example.test',
            'password' => 'secret',
            'role' => 'ADMIN',
            'status' => 'ACTIVE',
            'branch_id' => $this->source->id,
            'default_warehouse_id' => $this->source->id,
            'is_root_owner' => true,
            'is_active' => true,
        ]);
        $this->withHeaders([
            'Authorization' => 'Bearer local-laravel-token-'.$this->admin->id,
        ]);
    }

    private function stock(int $productId, int $branchId): ProductBranchStock
    {
        return ProductBranchStock::query()
            ->where('product_id', $productId)
            ->where('branch_id', $branchId)
            ->firstOrFail();
    }

    private function createTransfer(array $overrides = [])
    {
        $payload = array_merge([
            'sourceWarehouseId' => $this->source->mongo_id,
            'destinationWarehouseId' => $this->destination->mongo_id,
            'status' => 'DRAFT',
            'lines' => [[
                'productId' => $this->product->mongo_id,
                'quantity' => 3,
            ]],
        ], $overrides);

        return $this->postJson('/api/warehouse/transfers', $payload);
    }

    private function getTransfer(string $id)
    {
        return $this->getJson('/api/warehouse/transfers/'.$id);
    }

    private function assertStock(int $productId, int $branchId, float $qty, float $locked): void
    {
        $row = $this->stock($productId, $branchId);
        $this->assertEqualsWithDelta($qty, (float) $row->qty, 1e-6, "qty branch={$branchId}");
        $this->assertEqualsWithDelta($locked, (float) $row->locked_quantity, 1e-6, "locked branch={$branchId}");
    }

    // ------------------------------------------------------------------
    // VI.A enrich lockedQuantity
    // ------------------------------------------------------------------

    public function test_draft_locked_quantity_is_zero_even_if_line_only_has_requested(): void
    {
        $created = $this->createTransfer()->assertCreated();
        $id = $created->json('_id');

        $detail = $this->getTransfer($id)->assertOk();
        $detail->assertJsonPath('status', 'DRAFT')
            ->assertJsonPath('lockedQuantity', 0)
            ->assertJsonPath('qty', 3)
            ->assertJsonPath('spCount', 1)
            ->assertJsonPath('lines.0.requestedQuantity', 3)
            ->assertJsonPath('lines.0.lockedQuantity', 0);

        $this->assertStock($this->product->id, $this->source->id, 10, 0);
        $this->assertStock($this->product->id, $this->destination->id, 2, 0);
    }

    public function test_completed_and_cancelled_locked_quantity_zero_despite_legacy_payload(): void
    {
        $table = 'warehouse_transfers';
        $completed = (new MirrorRecord())->forTable($table)->newQuery()->create([
            'mongo_id' => 'legacydone000000000001',
            'code' => 'CK-LEGACY-DONE',
            'status' => 'COMPLETED',
            'from_branch_mongo_id' => $this->source->mongo_id,
            'to_branch_mongo_id' => $this->destination->mongo_id,
            'qty' => 3,
            'sp_count' => 1,
            'payload' => [
                'status' => 'COMPLETED',
                'kind' => 'NORMAL_TRANSFER',
                'sourceWarehouseId' => $this->source->mongo_id,
                'destinationWarehouseId' => $this->destination->mongo_id,
                'qty' => 3,
                'spCount' => 1,
                'lockedQuantity' => 3,
                'lines' => [[
                    'productId' => $this->product->mongo_id,
                    'requestedQuantity' => 3,
                    // legacy: no lockedQuantity field — must NOT fallback to 3 for COMPLETED
                ]],
            ],
        ]);

        $cancelled = (new MirrorRecord())->forTable($table)->newQuery()->create([
            'mongo_id' => 'legacycancel0000000001',
            'code' => 'CK-LEGACY-CANCEL',
            'status' => 'CANCELLED',
            'from_branch_mongo_id' => $this->source->mongo_id,
            'to_branch_mongo_id' => $this->destination->mongo_id,
            'qty' => 2,
            'sp_count' => 1,
            'payload' => [
                'status' => 'CANCELLED',
                'kind' => 'NORMAL_TRANSFER',
                'sourceWarehouseId' => $this->source->mongo_id,
                'destinationWarehouseId' => $this->destination->mongo_id,
                'qty' => 2,
                'lockedQuantity' => 2,
                'lines' => [[
                    'productId' => $this->product->mongo_id,
                    'requestedQuantity' => 2,
                    'lockedQuantity' => 2,
                ]],
            ],
        ]);

        $returned = (new MirrorRecord())->forTable($table)->newQuery()->create([
            'mongo_id' => 'legacyreturned00000001',
            'code' => 'CK-LEGACY-RET',
            'status' => 'RETURNED',
            'from_branch_mongo_id' => $this->source->mongo_id,
            'to_branch_mongo_id' => $this->destination->mongo_id,
            'qty' => 1,
            'sp_count' => 1,
            'payload' => [
                'status' => 'RETURNED',
                'kind' => 'NORMAL_TRANSFER',
                'sourceWarehouseId' => $this->source->mongo_id,
                'destinationWarehouseId' => $this->destination->mongo_id,
                'qty' => 1,
                'lines' => [[
                    'productId' => $this->product->mongo_id,
                    'requestedQuantity' => 1,
                ]],
            ],
        ]);

        $this->getTransfer($completed->mongo_id)->assertOk()
            ->assertJsonPath('lockedQuantity', 0)
            ->assertJsonPath('lines.0.lockedQuantity', 0)
            ->assertJsonPath('lines.0.requestedQuantity', 3)
            ->assertJsonPath('qty', 3);

        $this->getTransfer($cancelled->mongo_id)->assertOk()
            ->assertJsonPath('lockedQuantity', 0)
            ->assertJsonPath('lines.0.lockedQuantity', 0)
            ->assertJsonPath('qty', 2);

        $this->getTransfer($returned->mongo_id)->assertOk()
            ->assertJsonPath('lockedQuantity', 0)
            ->assertJsonPath('lines.0.lockedQuantity', 0)
            ->assertJsonPath('qty', 1);
    }

    public function test_in_transit_legacy_missing_lock_falls_back_to_requested_qty(): void
    {
        $row = (new MirrorRecord())->forTable('warehouse_transfers')->newQuery()->create([
            'mongo_id' => 'legacytransit000000001',
            'code' => 'CK-LEGACY-IT',
            'status' => 'IN_TRANSIT',
            'from_branch_mongo_id' => $this->source->mongo_id,
            'to_branch_mongo_id' => $this->destination->mongo_id,
            'qty' => 4,
            'sp_count' => 1,
            'payload' => [
                'status' => 'IN_TRANSIT',
                'kind' => 'NORMAL_TRANSFER',
                'sourceWarehouseId' => $this->source->mongo_id,
                'destinationWarehouseId' => $this->destination->mongo_id,
                'qty' => 4,
                'lines' => [[
                    'productId' => $this->product->mongo_id,
                    'requestedQuantity' => 4,
                ]],
            ],
        ]);

        $this->getTransfer($row->mongo_id)->assertOk()
            ->assertJsonPath('status', 'IN_TRANSIT')
            ->assertJsonPath('lockedQuantity', 4)
            ->assertJsonPath('lines.0.lockedQuantity', 4)
            ->assertJsonPath('lines.0.requestedQuantity', 4);
    }

    // ------------------------------------------------------------------
    // VI.C normal stock flow
    // ------------------------------------------------------------------

    public function test_normal_confirm_source_and_destination_stock_flow(): void
    {
        $created = $this->createTransfer()->assertCreated();
        $id = $created->json('_id');

        $this->assertStock($this->product->id, $this->source->id, 10, 0);
        $this->assertStock($this->product->id, $this->destination->id, 2, 0);

        $this->postJson("/api/warehouse/transfers/{$id}/confirm-source")
            ->assertOk()
            ->assertJsonPath('status', 'IN_TRANSIT');

        $this->assertStock($this->product->id, $this->source->id, 10, 3);
        $this->assertStock($this->product->id, $this->destination->id, 2, 0);

        $detail = $this->getTransfer($id)->assertOk();
        $detail->assertJsonPath('status', 'IN_TRANSIT')
            ->assertJsonPath('lockedQuantity', 3)
            ->assertJsonPath('canConfirmDestination', true);

        $this->postJson("/api/warehouse/transfers/{$id}/confirm-destination")
            ->assertOk()
            ->assertJsonPath('status', 'COMPLETED');

        $this->assertStock($this->product->id, $this->source->id, 7, 0);
        $this->assertStock($this->product->id, $this->destination->id, 5, 0);

        $this->getTransfer($id)->assertOk()
            ->assertJsonPath('status', 'COMPLETED')
            ->assertJsonPath('lockedQuantity', 0)
            ->assertJsonPath('canConfirmDestination', false);

        $this->product->refresh();
        $sum = (float) ProductBranchStock::query()->where('product_id', $this->product->id)->sum('qty');
        $this->assertEqualsWithDelta($sum, (float) $this->product->qty, 1e-6);

        // Double confirm-destination rejected
        $beforeSrc = $this->stock($this->product->id, $this->source->id)->toArray();
        $beforeDst = $this->stock($this->product->id, $this->destination->id)->toArray();
        $this->postJson("/api/warehouse/transfers/{$id}/confirm-destination")
            ->assertStatus(422);
        $this->assertStock($this->product->id, $this->source->id, (float) $beforeSrc['qty'], (float) $beforeSrc['locked_quantity']);
        $this->assertStock($this->product->id, $this->destination->id, (float) $beforeDst['qty'], (float) $beforeDst['locked_quantity']);
        $this->getTransfer($id)->assertOk()->assertJsonPath('status', 'COMPLETED');
    }

    // ------------------------------------------------------------------
    // VI.B state transition guards
    // ------------------------------------------------------------------

    public function test_invalid_transitions_are_rejected_without_side_effects(): void
    {
        $created = $this->createTransfer()->assertCreated();
        $id = $created->json('_id');

        $this->postJson("/api/warehouse/transfers/{$id}/confirm-destination")->assertStatus(422);
        $this->postJson("/api/warehouse/transfers/{$id}/return", ['reason' => 'x'])->assertStatus(422);
        $this->postJson("/api/warehouse/transfers/{$id}/not-a-real-action")->assertStatus(422);

        $this->assertStock($this->product->id, $this->source->id, 10, 0);
        $this->getTransfer($id)->assertOk()->assertJsonPath('status', 'DRAFT');

        $this->postJson("/api/warehouse/transfers/{$id}/confirm-source")->assertOk();
        $this->postJson("/api/warehouse/transfers/{$id}/confirm-source")->assertStatus(422);
        $this->assertStock($this->product->id, $this->source->id, 10, 3);

        $this->postJson("/api/warehouse/transfers/{$id}/confirm-destination")->assertOk();
        $this->postJson("/api/warehouse/transfers/{$id}/confirm-source")->assertStatus(422);
        $this->postJson("/api/warehouse/transfers/{$id}/return", ['reason' => 'late'])->assertStatus(422);
        $this->assertStock($this->product->id, $this->source->id, 7, 0);
        $this->assertStock($this->product->id, $this->destination->id, 5, 0);
    }

    public function test_cancel_draft_soft_cancels_without_stock_change(): void
    {
        $created = $this->createTransfer()->assertCreated();
        $id = $created->json('_id');

        $this->deleteJson("/api/warehouse/transfers/{$id}")
            ->assertOk()
            ->assertJsonPath('status', 'CANCELLED');

        $this->assertStock($this->product->id, $this->source->id, 10, 0);
        $this->getTransfer($id)->assertOk()
            ->assertJsonPath('status', 'CANCELLED')
            ->assertJsonPath('lockedQuantity', 0)
            ->assertJsonPath('canConfirmSource', false);

        $this->postJson("/api/warehouse/transfers/{$id}/confirm-source")->assertStatus(422);
        $this->deleteJson("/api/warehouse/transfers/{$id}")->assertStatus(422);
    }

    // ------------------------------------------------------------------
    // VI.D return flow
    // ------------------------------------------------------------------

    public function test_return_flow_unlocks_original_without_stock_movement(): void
    {
        $created = $this->createTransfer()->assertCreated();
        $id = $created->json('_id');

        $this->postJson("/api/warehouse/transfers/{$id}/confirm-source")->assertOk();
        $this->assertStock($this->product->id, $this->source->id, 10, 3);
        $this->assertStock($this->product->id, $this->destination->id, 2, 0);

        $returned = $this->postJson("/api/warehouse/transfers/{$id}/return", [
            'reason' => 'Không nhận hàng E2E',
        ])->assertOk();

        $returned->assertJsonPath('ok', true)
            ->assertJsonPath('status', 'RETURN_IN_PROGRESS')
            ->assertJsonPath('returnTransfer.kind', 'RETURN_OF_TRANSFER')
            ->assertJsonPath('returnTransfer.status', 'IN_TRANSIT');

        $returnId = $returned->json('returnTransfer._id');
        $this->assertNotEmpty($returnId);

        $this->assertStock($this->product->id, $this->source->id, 10, 3);
        $this->assertStock($this->product->id, $this->destination->id, 2, 0);

        $origin = $this->getTransfer($id)->assertOk();
        $origin->assertJsonPath('status', 'RETURN_IN_PROGRESS')
            ->assertJsonPath('lockedQuantity', 3)
            ->assertJsonPath('returnTransferId', $returnId);

        $returnDetail = $this->getTransfer($returnId)->assertOk();
        $returnDetail->assertJsonPath('kind', 'RETURN_OF_TRANSFER')
            ->assertJsonPath('originTransferId', $id)
            ->assertJsonPath('sourceWarehouseId', $this->destination->mongo_id)
            ->assertJsonPath('destinationWarehouseId', $this->source->mongo_id)
            ->assertJsonPath('lockedQuantity', 0)
            ->assertJsonPath('canConfirmDestination', true)
            ->assertJsonPath('canReturn', false);

        // Second return rejected
        $this->postJson("/api/warehouse/transfers/{$id}/return", ['reason' => 'again'])->assertStatus(422);
        $count = (new MirrorRecord())->forTable('warehouse_transfers')->newQuery()
            ->where('status', 'IN_TRANSIT')
            ->get()
            ->filter(function ($row) use ($id) {
                $p = is_array($row->payload) ? $row->payload : [];

                return ($p['originTransferId'] ?? null) === $id;
            })
            ->count();
        $this->assertSame(1, $count);

        // Receive return: unlock only
        $this->postJson("/api/warehouse/transfers/{$returnId}/confirm-destination")
            ->assertOk()
            ->assertJsonPath('status', 'COMPLETED');

        $this->assertStock($this->product->id, $this->source->id, 10, 0);
        $this->assertStock($this->product->id, $this->destination->id, 2, 0);

        $this->getTransfer($id)->assertOk()
            ->assertJsonPath('status', 'RETURNED')
            ->assertJsonPath('lockedQuantity', 0);

        $this->getTransfer($returnId)->assertOk()
            ->assertJsonPath('status', 'COMPLETED')
            ->assertJsonPath('lockedQuantity', 0);

        // Double receive rejected
        $this->postJson("/api/warehouse/transfers/{$returnId}/confirm-destination")->assertStatus(422);
        $this->assertStock($this->product->id, $this->source->id, 10, 0);
        $this->assertStock($this->product->id, $this->destination->id, 2, 0);
    }

    public function test_return_requires_reason(): void
    {
        $created = $this->createTransfer()->assertCreated();
        $id = $created->json('_id');
        $this->postJson("/api/warehouse/transfers/{$id}/confirm-source")->assertOk();

        $this->postJson("/api/warehouse/transfers/{$id}/return", ['reason' => '   '])
            ->assertStatus(422);
        $this->postJson("/api/warehouse/transfers/{$id}/return", [])
            ->assertStatus(422);

        $this->getTransfer($id)->assertOk()->assertJsonPath('status', 'IN_TRANSIT');
        $this->assertStock($this->product->id, $this->source->id, 10, 3);
    }

    // ------------------------------------------------------------------
    // VI.E rollback / atomicity
    // ------------------------------------------------------------------

    public function test_confirm_source_insufficient_stock_rolls_back(): void
    {
        $created = $this->createTransfer([
            'lines' => [[
                'productId' => $this->product->mongo_id,
                'quantity' => 99,
            ]],
        ])->assertCreated();
        $id = $created->json('_id');

        $this->postJson("/api/warehouse/transfers/{$id}/confirm-source")
            ->assertStatus(422);

        $this->getTransfer($id)->assertOk()->assertJsonPath('status', 'DRAFT');
        $this->assertStock($this->product->id, $this->source->id, 10, 0);
    }

    public function test_multi_line_confirm_source_partial_failure_rolls_back_all_locks(): void
    {
        // productB only has 5 — request 4 + 10 fails on second line after first would lock
        $created = $this->createTransfer([
            'lines' => [
                ['productId' => $this->product->mongo_id, 'quantity' => 4],
                ['productId' => $this->productB->mongo_id, 'quantity' => 10],
            ],
        ])->assertCreated();
        $id = $created->json('_id');

        $this->postJson("/api/warehouse/transfers/{$id}/confirm-source")->assertStatus(422);

        $this->getTransfer($id)->assertOk()->assertJsonPath('status', 'DRAFT');
        $this->assertStock($this->product->id, $this->source->id, 10, 0);
        $this->assertStock($this->productB->id, $this->source->id, 5, 0);
    }

    public function test_receive_return_without_origin_fails_without_stock_change(): void
    {
        $orphan = (new MirrorRecord())->forTable('warehouse_transfers')->newQuery()->create([
            'mongo_id' => 'orphanreturn0000000001',
            'code' => 'TR-ORPHAN',
            'status' => 'IN_TRANSIT',
            'from_branch_mongo_id' => $this->destination->mongo_id,
            'to_branch_mongo_id' => $this->source->mongo_id,
            'qty' => 3,
            'sp_count' => 1,
            'type' => 'return',
            'payload' => [
                'status' => 'IN_TRANSIT',
                'kind' => 'RETURN_OF_TRANSFER',
                'type' => 'return',
                // missing originTransferId
                'sourceWarehouseId' => $this->destination->mongo_id,
                'destinationWarehouseId' => $this->source->mongo_id,
                'lines' => [[
                    'productId' => $this->product->mongo_id,
                    'requestedQuantity' => 3,
                    'lockedQuantity' => 0,
                ]],
                'lockedQuantity' => 0,
            ],
        ]);

        // lock source as if original was in progress
        $this->stock($this->product->id, $this->source->id)->forceFill(['locked_quantity' => 3])->save();

        $this->postJson('/api/warehouse/transfers/'.$orphan->mongo_id.'/confirm-destination')
            ->assertStatus(422);

        $this->assertStock($this->product->id, $this->source->id, 10, 3);
        $this->assertStock($this->product->id, $this->destination->id, 2, 0);
        $this->getTransfer($orphan->mongo_id)->assertOk()->assertJsonPath('status', 'IN_TRANSIT');
    }

    public function test_receive_return_when_original_not_return_in_progress_fails(): void
    {
        $created = $this->createTransfer()->assertCreated();
        $id = $created->json('_id');
        $this->postJson("/api/warehouse/transfers/{$id}/confirm-source")->assertOk();

        $returnResp = $this->postJson("/api/warehouse/transfers/{$id}/return", [
            'reason' => 'Test wrong original state',
        ])->assertOk();
        $returnId = $returnResp->json('returnTransfer._id');

        // Force original away from RETURN_IN_PROGRESS
        $original = (new MirrorRecord())->forTable('warehouse_transfers')->newQuery()
            ->where('mongo_id', $id)->firstOrFail();
        $p = is_array($original->payload) ? $original->payload : [];
        $p['status'] = 'IN_TRANSIT';
        $original->forceFill(['status' => 'IN_TRANSIT', 'payload' => $p])->save();

        $this->postJson("/api/warehouse/transfers/{$returnId}/confirm-destination")->assertStatus(422);

        $this->assertStock($this->product->id, $this->source->id, 10, 3);
        $this->getTransfer($returnId)->assertOk()->assertJsonPath('status', 'IN_TRANSIT');
    }
}
