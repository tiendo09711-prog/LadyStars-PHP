<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('sale_payments', 'sale_channel_id')) {
            Schema::table('sale_payments', function (Blueprint $table) {
            $table->string('sale_channel_id', 24)->nullable()->index()->after('branch_mongo_id');
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete()->after('customer_mongo_id');
            $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete()->after('branch_mongo_id');
            $table->decimal('amount_products', 18, 3)->nullable()->after('amount');
            $table->decimal('total_cost', 18, 2)->nullable()->after('amount_products');
            $table->decimal('discount_value', 18, 2)->nullable()->after('total_cost');
            $table->string('discount_type')->nullable()->after('discount_value');
            $table->decimal('tendered_value', 18, 2)->nullable()->after('value_payment');
            $table->decimal('settlement_value', 18, 2)->nullable()->after('tendered_value');
            $table->boolean('is_delivery')->default(false)->after('settlement_value');
            $table->boolean('is_cod')->default(false)->after('is_delivery');
                $table->index(['customer_id', 'completed_at']);
            });
        }

        if (!Schema::hasColumn('inventory_vouchers', 'import_export_type')) {
            Schema::table('inventory_vouchers', function (Blueprint $table) {
            $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete()->after('warehouse_mongo_id');
            $table->string('import_export_type')->nullable()->index()->after('type');
            $table->string('voucher_code')->nullable()->index()->after('import_export_type');
            $table->foreignId('product_id')->nullable()->constrained('products')->nullOnDelete()->after('product_mongo_id');
            $table->decimal('qty', 18, 3)->nullable()->after('value');
            $table->decimal('unit_price', 18, 2)->nullable()->after('qty');
            $table->string('refer_code')->nullable()->after('voucher_code');
            $table->decimal('total_amount', 18, 2)->nullable()->after('total');
            $table->index(['branch_id', 'business_date']);
                $table->index(['import_export_type', 'business_date']);
            });
        }

        if (!Schema::hasColumn('inventory_products', 'inventory_voucher_mongo_id')) {
            Schema::table('inventory_products', function (Blueprint $table) {
            $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete()->after('inventory_voucher_mongo_id');
            $table->foreignId('product_id')->nullable()->constrained('products')->nullOnDelete()->after('product_mongo_id');
            $table->decimal('qty', 18, 3)->nullable()->after('value');
            $table->decimal('unit_price', 18, 2)->nullable()->after('qty');
            $table->string('refer_code')->nullable()->after('code');
            $table->index(['inventory_voucher_mongo_id', 'product_id']);
                $table->index(['branch_id', 'business_date']);
            });
        }

        if (!Schema::hasColumn('warehouse_transfers', 'from_branch_id')) {
            Schema::table('warehouse_transfers', function (Blueprint $table) {
            $table->foreignId('from_branch_id')->nullable()->constrained('branches')->nullOnDelete()->after('from_branch_mongo_id');
            $table->foreignId('to_branch_id')->nullable()->constrained('branches')->nullOnDelete()->after('to_branch_mongo_id');
            $table->date('date_send')->nullable()->after('to_branch_id');
            $table->date('date_take')->nullable()->after('date_send');
                $table->index(['from_branch_id', 'business_date']);
                $table->index(['to_branch_id', 'business_date']);
            });
        }

        if (!Schema::hasColumn('customer_cares', 'details')) {
            Schema::table('customer_cares', function (Blueprint $table) {
            $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete()->after('user_mongo_id');
            $table->text('details')->nullable()->after('branch_id');
            $table->text('reason')->nullable()->after('details');
            $table->text('description')->nullable()->after('reason');
            $table->string('creator')->nullable()->after('description');
            $table->string('customer_name')->nullable()->after('customer_code');
            $table->index(['customer_code', 'record_date']);
                $table->index(['record_date', 'branch_id']);
            });
        }

        if (!Schema::hasColumn('product_edit_logs', 'product_id')) {
            Schema::table('product_edit_logs', function (Blueprint $table) {
            $table->foreignId('product_id')->nullable()->constrained('products')->nullOnDelete()->after('product_mongo_id');
            $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete()->after('branch_mongo_id');
            $table->string('field_name')->nullable()->index()->after('branch_id');
            $table->text('old_value')->nullable()->after('field_name');
            $table->text('new_value')->nullable()->after('old_value');
            $table->string('product_code')->nullable()->after('code');
            $table->string('product_name')->nullable()->after('product_code');
            $table->index(['product_id', 'business_date']);
                $table->index(['field_name', 'business_date']);
            });
        }
    }

    public function down(): void
    {
        foreach ([
            'sale_payments' => ['sale_channel_id', 'customer_id', 'branch_id', 'amount_products', 'total_cost', 'discount_value', 'discount_type', 'tendered_value', 'settlement_value', 'is_delivery', 'is_cod'],
            'inventory_vouchers' => ['branch_id', 'import_export_type', 'voucher_code', 'product_id', 'qty', 'unit_price', 'refer_code', 'total_amount'],
            'inventory_products' => ['branch_id', 'product_id', 'qty', 'unit_price', 'refer_code'],
            'warehouse_transfers' => ['from_branch_id', 'to_branch_id', 'date_send', 'date_take'],
            'customer_cares' => ['branch_id', 'details', 'reason', 'description', 'creator', 'customer_name'],
            'product_edit_logs' => ['product_id', 'branch_id', 'field_name', 'old_value', 'new_value', 'product_code', 'product_name'],
        ] as $table => $columns) {
            Schema::table($table, function (Blueprint $blueprint) use ($columns) {
                foreach ($columns as $column) {
                    if (in_array($column, ['customer_id', 'branch_id', 'product_id', 'from_branch_id', 'to_branch_id'], true)) {
                        $blueprint->dropForeign([$column]);
                    }
                }
                foreach ($columns as $column) {
                    $blueprint->dropColumn($column);
                }
            });
        }
    }
};
