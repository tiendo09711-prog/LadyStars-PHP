<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    protected $fillable = [
        'mongo_id',
        'external_id',
        'name',
        'code',
        'category_id',
        'trademark_id',
        'shelf_id',
        'cost',
        'price',
        'wholesale_price',
        'clearance_price',
        'clearance_active',
        'clearance_note',
        'clearance_started_at',
        'qty',
        'weight',
        'weight_type',
        'allows_sale',
        'unit',
        'min_quantity',
        'max_quantity',
        'type',
        'description',
        'note',
        'units',
        'elements',
        'user_id',
        'status',
        'category_name',
        'trademark_name',
        'supplier_name',
        'origin',
        'color',
        'size',
        'barcode',
        'parent_code',
        'parent_name',
        'extra',
    ];

    protected function casts(): array
    {
        return [
            'cost' => 'decimal:2',
            'price' => 'decimal:2',
            'wholesale_price' => 'decimal:2',
            'clearance_price' => 'decimal:2',
            'clearance_active' => 'boolean',
            'clearance_started_at' => 'datetime',
            'qty' => 'decimal:3',
            'weight' => 'decimal:3',
            'allows_sale' => 'boolean',
            'min_quantity' => 'decimal:3',
            'max_quantity' => 'decimal:3',
            'units' => 'array',
            'elements' => 'array',
            'extra' => 'array',
        ];
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function stocks(): HasMany
    {
        return $this->hasMany(ProductBranchStock::class);
    }
}
