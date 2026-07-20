<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private function binaryString(Blueprint $table, string $column, ?int $length = null)
    {
        $definition = $length === null ? $table->string($column) : $table->string($column, $length);

        if (DB::connection()->getDriverName() === 'mysql') {
            $definition->collation('utf8mb4_bin');
        }

        return $definition;
    }

    private function createMongoMirrorTable(string $tableName, callable $extraColumns = null): void
    {
        Schema::create($tableName, function (Blueprint $table) use ($extraColumns) {
            $table->id();
            $table->string('mongo_id', 24)->unique();
            $this->binaryString($table, 'code')->nullable()->unique();
            $table->string('name')->nullable();
            $table->string('status')->nullable()->index();
            $table->string('type')->nullable()->index();
            $table->decimal('amount', 18, 3)->nullable();
            $table->decimal('value', 18, 2)->nullable();
            $table->decimal('total', 18, 2)->nullable();
            $table->string('branch_mongo_id', 24)->nullable()->index();
            $table->string('customer_mongo_id', 24)->nullable()->index();
            $table->string('product_mongo_id', 24)->nullable()->index();
            $table->string('user_mongo_id', 24)->nullable()->index();
            $table->timestamp('business_date')->nullable()->index();
            $table->json('payload')->nullable();
            $table->timestamps();

            if ($extraColumns !== null) {
                $extraColumns($table);
            }

            $table->index(['status', 'business_date']);
            $table->index(['type', 'business_date']);
        });
    }

    public function up(): void
    {
        $this->createMongoMirrorTable('sale_channels');
        $this->createMongoMirrorTable('payment_methods');
        $this->createMongoMirrorTable('sale_payments', function (Blueprint $table) {
            $table->decimal('value_payment', 18, 2)->nullable();
            $table->decimal('refunded_value', 18, 2)->nullable();
            $table->string('refund_status')->nullable()->index();
            $table->timestamp('completed_at')->nullable()->index();
        });
        $this->createMongoMirrorTable('product_refunds', function (Blueprint $table) {
            $table->string('payment_mongo_id', 24)->nullable()->index();
            $table->decimal('refund_fee', 18, 2)->nullable();
            $table->timestamp('completed_at')->nullable()->index();
        });
        $this->createMongoMirrorTable('product_logs');
        $this->createMongoMirrorTable('product_edit_logs');
        $this->createMongoMirrorTable('inventory_vouchers', function (Blueprint $table) {
            $table->string('warehouse_mongo_id', 24)->nullable()->index();
        });
        $this->createMongoMirrorTable('inventory_products', function (Blueprint $table) {
            $table->string('inventory_voucher_mongo_id', 24)->nullable()->index();
        });
        $this->createMongoMirrorTable('warehouse_transfers', function (Blueprint $table) {
            $table->string('from_branch_mongo_id', 24)->nullable()->index();
            $table->string('to_branch_mongo_id', 24)->nullable()->index();
        });
        $this->createMongoMirrorTable('transfer_audit_logs', function (Blueprint $table) {
            $table->string('transfer_mongo_id', 24)->nullable()->index();
            $table->string('action_type')->nullable()->index();
        });
        $this->createMongoMirrorTable('inventory_checks');
        $this->createMongoMirrorTable('inventory_check_products');
        $this->createMongoMirrorTable('customer_cares', function (Blueprint $table) {
            $table->string('customer_code')->nullable()->index();
            $table->string('customer_phone')->nullable()->index();
            $table->timestamp('record_date')->nullable()->index();
        });
        $this->createMongoMirrorTable('vendors');
        $this->createMongoMirrorTable('audit_logs', function (Blueprint $table) {
            $table->string('action')->nullable()->index();
            $table->string('entity_type')->nullable()->index();
            $table->string('entity_mongo_id', 24)->nullable()->index();
        });
        $this->createMongoMirrorTable('menu_items');
        $this->createMongoMirrorTable('permissions');
        $this->createMongoMirrorTable('roles');
        $this->createMongoMirrorTable('store_settings');
    }

    public function down(): void
    {
        foreach ([
            'store_settings',
            'roles',
            'permissions',
            'menu_items',
            'audit_logs',
            'vendors',
            'customer_cares',
            'inventory_check_products',
            'inventory_checks',
            'transfer_audit_logs',
            'warehouse_transfers',
            'inventory_products',
            'inventory_vouchers',
            'product_edit_logs',
            'product_logs',
            'product_refunds',
            'sale_payments',
            'payment_methods',
            'sale_channels',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
