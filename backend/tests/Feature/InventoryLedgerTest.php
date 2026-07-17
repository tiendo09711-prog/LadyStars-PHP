<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\InventoryStockMovement;
use App\Models\Product;
use App\Models\ProductBranchStock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InventoryLedgerTest extends TestCase
{
    use RefreshDatabase;

    public function test_stock_changes_append_contiguous_movements(): void
    {
        $branch = Branch::create(['name' => 'Kho A', 'code' => 'A', 'is_active' => true]);
        $product = Product::create(['name' => 'SP', 'code' => 'SP1', 'cost' => 100]);
        $stock = ProductBranchStock::create(['product_id' => $product->id, 'branch_id' => $branch->id, 'qty' => 10]);
        $stock->update(['qty' => 7]);
        $rows = InventoryStockMovement::query()->orderBy('id')->get();
        $this->assertCount(2, $rows);
        $this->assertSame(10.0, (float) $rows[0]->quantity_after);
        $this->assertSame(10.0, (float) $rows[1]->quantity_before);
        $this->assertSame(-3.0, (float) $rows[1]->quantity_delta);
        $this->assertSame(7.0, (float) $rows[1]->quantity_after);
    }

    public function test_backfill_dry_run_does_not_write_or_change_stock(): void
    {
        $branch = Branch::create(['name' => 'Kho A', 'code' => 'A', 'is_active' => true]);
        $product = Product::create(['name' => 'SP', 'code' => 'SP1', 'cost' => 100]);
        $stock = ProductBranchStock::create(['product_id' => $product->id, 'branch_id' => $branch->id, 'qty' => 10]);
        InventoryStockMovement::query()->delete();
        $this->artisan('inventory:ledger-backfill')->assertSuccessful();
        $this->assertDatabaseCount('inventory_stock_movements', 0);
        $this->assertSame(10.0, (float) $stock->fresh()->qty);
    }

    public function test_backfill_apply_is_idempotent_and_keeps_current_balance(): void
    {
        $branch = Branch::create(['name' => 'Kho A', 'code' => 'A', 'is_active' => true]);
        $product = Product::create(['name' => 'SP', 'code' => 'SP1', 'cost' => 100]);
        $stock = ProductBranchStock::create(['product_id' => $product->id, 'branch_id' => $branch->id, 'qty' => 10]);
        InventoryStockMovement::query()->delete();
        $arguments = ['--apply' => true, '--ack' => 'I_ACCEPT_INVENTORY_LEDGER_WRITES'];
        $this->artisan('inventory:ledger-backfill', $arguments)->assertSuccessful();
        $this->artisan('inventory:ledger-backfill', $arguments)->assertSuccessful();
        $this->assertDatabaseCount('inventory_stock_movements', 1);
        $this->assertDatabaseHas('inventory_stock_movements', ['movement_type' => 'OPENING_BALANCE', 'quantity_after' => 10]);
        $this->assertSame(10.0, (float) $stock->fresh()->qty);
    }

    public function test_reconciliation_endpoint_reports_verified_equation(): void
    {
        $branch = Branch::create(['name' => 'Kho A', 'code' => 'A', 'is_active' => true]);
        $product = Product::create(['name' => 'SP', 'code' => 'SP1', 'cost' => 100]);
        $stock = ProductBranchStock::create(['product_id' => $product->id, 'branch_id' => $branch->id, 'qty' => 10]);
        InventoryStockMovement::query()->update(['movement_type' => 'OPENING_BALANCE']);
        $stock->update(['qty' => 7]);
        $response = $this->getJson('/api/reports/inventory/reconciliation?fromDate='.now()->toDateString().'&toDate='.now()->toDateString());
        $response->assertOk()
            ->assertJsonPath('summary.reconciledRows', 1)
            ->assertJsonPath('summary.varianceRows', 0)
            ->assertJsonPath('rows.0.openingQty', 0)
            ->assertJsonPath('rows.0.qtyIn', 10)
            ->assertJsonPath('rows.0.qtyOut', 3)
            ->assertJsonPath('rows.0.closingQty', 7)
            ->assertJsonPath('rows.0.expectedClosingQty', 7)
            ->assertJsonPath('rows.0.isReconciled', true);
    }
}
