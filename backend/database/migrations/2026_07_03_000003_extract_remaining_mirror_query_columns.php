<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private function addColumns(string $table, string $guardColumn, callable $callback): void
    {
        if (!Schema::hasColumn($table, $guardColumn)) {
            Schema::table($table, $callback);
        }
    }

    public function up(): void
    {
        $this->addColumns('sale_payments', 'note', function (Blueprint $table) {
            $table->text('note')->nullable()->after('is_cod');
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete()->after('note');
            $table->foreignId('author_id')->nullable()->constrained('users')->nullOnDelete()->after('user_id');
            $table->json('payment_lines')->nullable()->after('author_id');
            $table->json('items')->nullable()->after('payment_lines');
            $table->index(['user_id', 'completed_at']);
            $table->index(['author_id', 'completed_at']);
        });

        $this->addColumns('product_refunds', 'original_total_amount', function (Blueprint $table) {
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete()->after('payment_mongo_id');
            $table->foreignId('user_created_id')->nullable()->constrained('users')->nullOnDelete()->after('user_id');
            $table->decimal('discount_value', 18, 2)->nullable()->after('refund_fee');
            $table->string('discount_type')->nullable()->after('discount_value');
            $table->string('refund_fee_type')->nullable()->after('discount_type');
            $table->decimal('original_total_amount', 18, 2)->nullable()->after('refund_fee_type');
            $table->decimal('total_payable_amount', 18, 2)->nullable()->after('original_total_amount');
            $table->decimal('settlement_value', 18, 2)->nullable()->after('total_payable_amount');
            $table->text('note')->nullable()->after('settlement_value');
            $table->json('payment_lines')->nullable()->after('note');
            $table->json('items')->nullable()->after('payment_lines');
            $table->index(['user_id', 'completed_at']);
            $table->index(['status', 'completed_at']);
        });

        $this->addColumns('product_logs', 'source_type', function (Blueprint $table) {
            $table->foreignId('product_id')->nullable()->constrained('products')->nullOnDelete()->after('product_mongo_id');
            $table->string('source_type')->nullable()->index()->after('product_id');
            $table->string('source_mongo_id', 24)->nullable()->index()->after('source_type');
            $table->decimal('value_before', 18, 2)->nullable()->after('source_mongo_id');
            $table->decimal('value_after', 18, 2)->nullable()->after('value_before');
            $table->decimal('amount_before', 18, 3)->nullable()->after('value_after');
            $table->decimal('amount_after', 18, 3)->nullable()->after('amount_before');
            $table->index(['product_id', 'business_date']);
            $table->index(['source_type', 'business_date']);
        });

        $this->addColumns('product_edit_logs', 'created_by', function (Blueprint $table) {
            $table->string('created_by')->nullable()->index()->after('product_name');
            $table->index(['product_code', 'business_date']);
        });

        $this->addColumns('inventory_vouchers', 'warehouse_name', function (Blueprint $table) {
            $table->string('warehouse_name')->nullable()->index()->after('warehouse_mongo_id');
            $table->string('warehouse_code')->nullable()->index()->after('warehouse_name');
            $table->unsignedInteger('sp_count')->nullable()->after('unit_price');
            $table->decimal('discount', 18, 2)->nullable()->after('total_amount');
            $table->string('creator')->nullable()->index()->after('discount');
            $table->string('customer_phone')->nullable()->index()->after('creator');
            $table->string('supplier')->nullable()->after('customer_phone');
            $table->string('seller')->nullable()->after('supplier');
            $table->text('note')->nullable()->after('seller');
            $table->index(['warehouse_name', 'business_date']);
        });

        $this->addColumns('inventory_products', 'product_code', function (Blueprint $table) {
            $table->string('warehouse_name')->nullable()->index()->after('branch_id');
            $table->string('product_code')->nullable()->index()->after('product_id');
            $table->string('product_name')->nullable()->index()->after('product_code');
            $table->string('barcode')->nullable()->index()->after('product_name');
            $table->decimal('import_qty', 18, 3)->nullable()->after('qty');
            $table->decimal('export_qty', 18, 3)->nullable()->after('import_qty');
            $table->decimal('cost', 18, 2)->nullable()->after('unit_price');
            $table->decimal('discount', 18, 2)->nullable()->after('cost');
            $table->decimal('total_amount', 18, 2)->nullable()->after('discount');
            $table->string('creator')->nullable()->index()->after('total_amount');
            $table->string('customer_name')->nullable()->index()->after('creator');
            $table->string('parent_code')->nullable()->index()->after('customer_name');
            $table->index(['product_code', 'business_date']);
        });

        $this->addColumns('warehouse_transfers', 'source_warehouse_name', function (Blueprint $table) {
            $table->string('source_warehouse_name')->nullable()->index()->after('date_take');
            $table->string('destination_warehouse_name')->nullable()->index()->after('source_warehouse_name');
            $table->decimal('qty', 18, 3)->nullable()->after('destination_warehouse_name');
            $table->unsignedInteger('sp_count')->nullable()->after('qty');
            $table->decimal('total_amount', 18, 2)->nullable()->after('sp_count');
            $table->string('creator')->nullable()->index()->after('total_amount');
            $table->string('source')->nullable()->index()->after('creator');
            $table->string('source_export_bill_mongo_id', 24)->nullable()->index()->after('source');
            $table->string('destination_import_bill_mongo_id', 24)->nullable()->index()->after('source_export_bill_mongo_id');
            $table->json('lines')->nullable()->after('destination_import_bill_mongo_id');
        });

        $this->addColumns('transfer_audit_logs', 'transfer_request_mongo_id', function (Blueprint $table) {
            $table->string('transfer_request_mongo_id', 24)->nullable()->index()->after('transfer_mongo_id');
            $table->string('actor_mongo_id', 24)->nullable()->index()->after('action_type');
            $table->string('actor_role')->nullable()->index()->after('actor_mongo_id');
            $table->string('previous_status')->nullable()->index()->after('actor_role');
            $table->string('next_status')->nullable()->index()->after('previous_status');
            $table->text('reason')->nullable()->after('next_status');
            $table->index(['action_type', 'business_date']);
        });

        $this->addColumns('inventory_checks', 'warehouse_name', function (Blueprint $table) {
            $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete()->after('branch_mongo_id');
            $table->string('warehouse_name')->nullable()->index()->after('branch_id');
            $table->string('creator')->nullable()->index()->after('warehouse_name');
            $table->unsignedInteger('sp_count')->nullable()->after('creator');
            $table->decimal('qty', 18, 3)->nullable()->after('sp_count');
            $table->text('note')->nullable()->after('qty');
            $table->text('missing_sp')->nullable()->after('note');
            $table->text('balance')->nullable()->after('missing_sp');
            $table->index(['warehouse_name', 'business_date']);
        });

        $this->addColumns('inventory_check_products', 'product_code', function (Blueprint $table) {
            $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete()->after('branch_mongo_id');
            $table->foreignId('product_id')->nullable()->constrained('products')->nullOnDelete()->after('product_mongo_id');
            $table->string('warehouse_name')->nullable()->index()->after('branch_id');
            $table->string('external_id')->nullable()->index()->after('warehouse_name');
            $table->string('product_code')->nullable()->index()->after('product_id');
            $table->string('product_name')->nullable()->index()->after('product_code');
            $table->string('barcode')->nullable()->index()->after('product_name');
            $table->decimal('cost', 18, 2)->nullable()->after('barcode');
            $table->decimal('price', 18, 2)->nullable()->after('cost');
            $table->decimal('stock', 18, 3)->nullable()->after('price');
            $table->decimal('transferring', 18, 3)->nullable()->after('stock');
            $table->decimal('actual_stock', 18, 3)->nullable()->after('transferring');
            $table->decimal('difference', 18, 3)->nullable()->after('actual_stock');
            $table->decimal('holding', 18, 3)->nullable()->after('difference');
            $table->text('description')->nullable()->after('holding');
            $table->index(['product_code', 'business_date']);
            $table->index(['branch_id', 'business_date']);
        });

        $this->addColumns('vendors', 'phone', function (Blueprint $table) {
            $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete()->after('branch_mongo_id');
            $table->string('phone')->nullable()->index()->after('branch_id');
            $table->string('email')->nullable()->index()->after('phone');
            $table->string('vat')->nullable()->after('email');
            $table->string('company')->nullable()->after('vat');
            $table->text('address')->nullable()->after('company');
            $table->decimal('debt', 18, 2)->nullable()->after('address');
            $table->decimal('total_purchase', 18, 2)->nullable()->after('debt');
            $table->foreignId('user_created_id')->nullable()->constrained('users')->nullOnDelete()->after('total_purchase');
            $table->text('note')->nullable()->after('user_created_id');
        });

        $this->addColumns('sale_channels', 'sort_order', function (Blueprint $table) {
            $table->text('description')->nullable()->after('name');
            $table->integer('sort_order')->nullable()->index()->after('description');
            $table->boolean('is_active')->default(true)->index()->after('sort_order');
            $table->boolean('is_default')->default(false)->index()->after('is_active');
        });

        $this->addColumns('payment_methods', 'target_payment_status', function (Blueprint $table) {
            $table->string('target_payment_status')->nullable()->index()->after('code');
            $table->integer('sort_order')->nullable()->index()->after('target_payment_status');
            $table->boolean('is_active')->default(true)->index()->after('sort_order');
        });

        $this->addColumns('audit_logs', 'resource', function (Blueprint $table) {
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete()->after('user_mongo_id');
            $table->string('user_name')->nullable()->index()->after('user_id');
            $table->string('user_email')->nullable()->index()->after('user_name');
            $table->string('module')->nullable()->index()->after('entity_type');
            $table->string('resource')->nullable()->index()->after('module');
            $table->string('resource_mongo_id', 24)->nullable()->index()->after('resource');
            $table->string('ip')->nullable()->after('resource_mongo_id');
            $table->text('user_agent')->nullable()->after('ip');
        });
    }

    public function down(): void
    {
        // Local conversion tables only; rollback is intentionally not automated to avoid
        // dropping query columns from an already-synced local migration workspace.
    }
};
