<?php

namespace App\Console\Commands;

use App\Models\InventoryStockMovement;
use App\Models\ProductBranchStock;
use App\Services\InventoryMovementRecorder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class BackfillInventoryMovements extends Command
{
    protected $signature = 'inventory:ledger-backfill {--apply} {--ack=}';
    protected $description = 'Report ledger coverage and optionally establish opening balance anchors';

    public function handle(): int
    {
        if (! Schema::hasTable('inventory_stock_movements')) {
            $this->error('Missing inventory_stock_movements table. Run migration first.');
            return self::FAILURE;
        }

        $stocks = ProductBranchStock::query()->with('product:id,cost')->get();
        $anchored = InventoryStockMovement::query()->where('movement_type', 'OPENING_BALANCE')->count();
        $missing = $stocks->filter(fn (ProductBranchStock $stock) => ! InventoryStockMovement::query()
            ->where('product_id', $stock->product_id)->where('branch_id', $stock->branch_id)
            ->where('movement_type', 'OPENING_BALANCE')->exists());

        $this->table(['Metric', 'Value'], [
            ['Stock rows', $stocks->count()],
            ['Existing anchors', $anchored],
            ['Missing anchors', $missing->count()],
            ['Current quantity', number_format((float) $stocks->sum('qty'), 3, '.', '')],
        ]);

        if (! $this->option('apply')) {
            $this->info('DRY RUN only. No MySQL data changed.');
            return self::SUCCESS;
        }
        if ($this->option('ack') !== 'I_ACCEPT_INVENTORY_LEDGER_WRITES') {
            $this->error('Apply requires --ack=I_ACCEPT_INVENTORY_LEDGER_WRITES');
            return self::FAILURE;
        }

        DB::transaction(function () use ($missing): void {
            InventoryMovementRecorder::suppress(true);
            try {
                foreach ($missing as $stock) {
                    InventoryStockMovement::query()->create([
                        'event_id' => (string) Str::uuid(),
                        'stock_id' => $stock->id,
                        'product_id' => $stock->product_id,
                        'branch_id' => $stock->branch_id,
                        'movement_type' => 'OPENING_BALANCE',
                        'quantity_before' => 0,
                        'quantity_delta' => (float) $stock->qty,
                        'quantity_after' => (float) $stock->qty,
                        'unit_cost' => (float) ($stock->product?->cost ?? 0),
                        'source_type' => 'BACKFILL_ANCHOR',
                        'source_id' => (string) $stock->id,
                        'idempotency_key' => 'opening:'.$stock->product_id.':'.$stock->branch_id,
                        'occurred_at' => now(),
                        'metadata' => ['basis' => 'product_branch_stocks current balance'],
                    ]);
                }
            } finally {
                InventoryMovementRecorder::suppress(false);
            }
        });

        $this->info('Opening balance anchors created: '.$missing->count());
        return self::SUCCESS;
    }
}
