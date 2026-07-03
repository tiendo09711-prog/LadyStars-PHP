<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class CustomerGroup extends Model
{
    protected $fillable = [
        'mongo_id',
        'name',
        'type',
        'note',
        'user_id',
    ];

    public function customers(): BelongsToMany
    {
        return $this->belongsToMany(Customer::class, 'customer_customer_group')->withTimestamps();
    }
}
