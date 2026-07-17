<?php

namespace App\Services;

use App\Models\InventoryStockMovement;
use App\Models\ProductBranchStock;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class InventoryMovementRecorder
{
    private static bool $suppressed = false;

    public static function suppress(bool $value): void
    {
        self::$suppressed = $value;
    }

    public function recordStockChange(ProductBranchStock $stock, bool $created): void
    {
        if (self::$suppressed || (! $created && ! $stock->wasChanged('qty')) || ! Schema::hasTable('inventory_stock_movements')) {
            return;
        }

        $before = $created ? 0.0 : (float) ($stock->getPrevious()['qty'] ?? $stock->getOriginal('qty'));
        $after = (float) $stock->qty;
        $eventId = (string) Str::uuid();

        $routeSource = request()?->route('id') ?: request()?->route('stock');
        $sourceId = is_object($routeSource) && isset($routeSource->id) ? (string) $routeSource->id : (is_scalar($routeSource) ? (string) $routeSource : null);

        InventoryStockMovement::query()->create([
            'event_id' => $eventId,
            'stock_id' => $stock->id,
            'product_id' => $stock->product_id,
            'branch_id' => $stock->branch_id,
            'movement_type' => 'STOCK_CHANGE',
            'quantity_before' => $before,
            'quantity_delta' => $after - $before,
            'quantity_after' => $after,
            'unit_cost' => (float) ($stock->product()->value('cost') ?? 0),
            'source_type' => request()?->route()?->getName() ?: request()?->path(),
            'source_id' => $sourceId,
            'idempotency_key' => 'event:'.$eventId,
            'occurred_at' => now(),
            'metadata' => ['method' => request()?->method()],
        ]);
    }
}
