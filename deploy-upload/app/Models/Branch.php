<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Branch extends Model
{
    protected $fillable = [
        'mongo_id',
        'name',
        'code',
        'phone',
        'address',
        'is_active',
        'invoice_profile',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'invoice_profile' => 'array',
        ];
    }

    public function stocks(): HasMany
    {
        return $this->hasMany(ProductBranchStock::class);
    }
}
