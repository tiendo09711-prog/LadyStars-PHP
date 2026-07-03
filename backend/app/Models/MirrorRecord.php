<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MirrorRecord extends Model
{
    public const TABLES = [
        'sale-channels' => 'sale_channels',
        'payment-methods' => 'payment_methods',
        'sale-payments' => 'sale_payments',
        'product-refunds' => 'product_refunds',
        'product-logs' => 'product_logs',
        'product-edit-logs' => 'product_edit_logs',
        'inventory-vouchers' => 'inventory_vouchers',
        'inventory-products' => 'inventory_products',
        'warehouse-transfers' => 'warehouse_transfers',
        'transfer-audit-logs' => 'transfer_audit_logs',
        'inventory-checks' => 'inventory_checks',
        'inventory-check-products' => 'inventory_check_products',
        'customer-cares' => 'customer_cares',
        'vendors' => 'vendors',
        'audit-logs' => 'audit_logs',
        'menu-items' => 'menu_items',
        'permissions' => 'permissions',
        'roles' => 'roles',
        'store-settings' => 'store_settings',
    ];

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:3',
            'value' => 'decimal:2',
            'total' => 'decimal:2',
            'business_date' => 'datetime',
            'payload' => 'array',
            'items' => 'array',
            'payment_lines' => 'array',
            'lines' => 'array',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
            'value_payment' => 'decimal:2',
            'refunded_value' => 'decimal:2',
            'refund_fee' => 'decimal:2',
            'completed_at' => 'datetime',
            'record_date' => 'datetime',
        ];
    }

    public function forTable(string $table): self
    {
        $this->setTable($table);

        return $this;
    }
}
