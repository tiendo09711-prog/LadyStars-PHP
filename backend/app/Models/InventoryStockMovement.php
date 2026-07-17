<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InventoryStockMovement extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'quantity_before' => 'decimal:3',
            'quantity_delta' => 'decimal:3',
            'quantity_after' => 'decimal:3',
            'unit_cost' => 'decimal:2',
            'occurred_at' => 'datetime',
            'metadata' => 'array',
        ];
    }
}
