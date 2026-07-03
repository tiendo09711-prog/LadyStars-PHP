<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductBranchStock extends Model
{
    protected $fillable = [
        'mongo_id',
        'product_id',
        'branch_id',
        'qty',
        'locked_quantity',
        'min_quantity',
        'max_quantity',
    ];

    protected function casts(): array
    {
        return [
            'qty' => 'decimal:3',
            'locked_quantity' => 'decimal:3',
            'min_quantity' => 'decimal:3',
            'max_quantity' => 'decimal:3',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }
}
