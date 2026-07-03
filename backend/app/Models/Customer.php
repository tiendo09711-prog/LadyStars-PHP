<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Customer extends Model
{
    protected $fillable = [
        'mongo_id',
        'type',
        'name',
        'code',
        'phone',
        'phone2',
        'card_id',
        'email',
        'birthday',
        'sex',
        'customer_level',
        'address',
        'address_location',
        'province_id',
        'district_id',
        'ward_id',
        'company',
        'vat',
        'facebook',
        'note',
        'total_spent',
        'purchase_count',
        'purchase_product_quantity',
        'points',
        'first_purchase_date',
        'last_purchase_date',
        'days_since_last_purchase',
        'purchase_cycle_days',
        'tags',
        'status',
        'branch_id',
        'user_id',
    ];

    protected function casts(): array
    {
        return [
            'birthday' => 'date',
            'total_spent' => 'decimal:2',
            'purchase_count' => 'integer',
            'purchase_product_quantity' => 'decimal:3',
            'points' => 'integer',
            'first_purchase_date' => 'datetime',
            'last_purchase_date' => 'datetime',
            'days_since_last_purchase' => 'integer',
            'purchase_cycle_days' => 'integer',
            'tags' => 'array',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }
}
