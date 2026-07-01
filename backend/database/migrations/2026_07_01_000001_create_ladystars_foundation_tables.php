<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('branches', function (Blueprint $table) {
            $table->id();
            $table->string('mongo_id', 24)->nullable()->unique();
            $table->string('name');
            $table->string('code')->collation('utf8mb4_bin')->unique();
            $table->string('phone')->nullable();
            $table->text('address')->nullable();
            $table->boolean('is_active')->default(true);
            $table->json('invoice_profile')->nullable();
            $table->timestamps();

            $table->index(['name', 'code']);
        });

        Schema::create('user_warehouse_assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['user_id', 'branch_id']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->foreign('branch_id')->references('id')->on('branches')->nullOnDelete();
            $table->foreign('default_warehouse_id')->references('id')->on('branches')->nullOnDelete();
            $table->foreign('created_by_id')->references('id')->on('users')->nullOnDelete();
        });

        Schema::create('customer_groups', function (Blueprint $table) {
            $table->id();
            $table->string('mongo_id', 24)->nullable()->unique();
            $table->string('name')->collation('utf8mb4_bin')->unique();
            $table->string('type')->default('1');
            $table->text('note')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->string('mongo_id', 24)->nullable()->unique();
            $table->enum('type', ['person', 'company'])->default('person');
            $table->string('name');
            $table->string('code')->collation('utf8mb4_bin')->unique();
            $table->string('phone')->nullable();
            $table->string('phone2')->nullable();
            $table->string('card_id')->nullable();
            $table->string('email')->nullable();
            $table->date('birthday')->nullable();
            $table->enum('sex', ['female', 'male', 'other'])->default('female');
            $table->string('customer_level')->nullable();
            $table->text('address')->nullable();
            $table->text('address_location')->nullable();
            $table->string('province_id')->nullable();
            $table->string('district_id')->nullable();
            $table->string('ward_id')->nullable();
            $table->string('company')->nullable();
            $table->string('vat')->nullable();
            $table->string('facebook')->nullable();
            $table->text('note')->nullable();
            $table->decimal('total_spent', 18, 2)->default(0);
            $table->unsignedInteger('purchase_count')->default(0);
            $table->decimal('purchase_product_quantity', 18, 3)->default(0);
            $table->integer('points')->default(0);
            $table->timestamp('first_purchase_date')->nullable();
            $table->timestamp('last_purchase_date')->nullable();
            $table->integer('days_since_last_purchase')->nullable();
            $table->integer('purchase_cycle_days')->nullable();
            $table->json('tags')->nullable();
            $table->enum('status', ['active', 'inactive'])->default('active');
            $table->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();

            $table->index(['branch_id', 'name']);
            $table->index(['branch_id', 'phone']);
            $table->index(['branch_id', 'card_id']);
            $table->index(['name', 'code']);
        });

        Schema::create('customer_customer_group', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->foreignId('customer_group_id')->constrained()->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['customer_id', 'customer_group_id']);
        });

        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->string('mongo_id', 24)->nullable()->unique();
            $table->string('external_id')->nullable()->collation('utf8mb4_bin')->unique();
            $table->string('name')->collation('utf8mb4_bin')->unique();
            $table->string('code')->nullable()->collation('utf8mb4_bin')->unique();
            $table->foreignId('parent_id')->nullable()->constrained('categories')->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->boolean('is_active')->default(true);
            $table->boolean('is_visible')->default(true);
            $table->unsignedInteger('product_count')->default(0);
            $table->string('url')->nullable();
            $table->timestamps();

            $table->index(['name', 'code']);
        });

        Schema::create('trademarks', function (Blueprint $table) {
            $table->id();
            $table->string('mongo_id', 24)->nullable()->unique();
            $table->string('name')->collation('utf8mb4_bin')->unique();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('shelves', function (Blueprint $table) {
            $table->id();
            $table->string('mongo_id', 24)->nullable()->unique();
            $table->string('name')->collation('utf8mb4_bin')->unique();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->string('mongo_id', 24)->nullable()->unique();
            $table->string('external_id')->nullable()->collation('utf8mb4_bin')->unique();
            $table->string('name');
            $table->string('code')->collation('utf8mb4_bin')->unique();
            $table->foreignId('category_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('trademark_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('shelf_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('cost', 18, 2)->default(0);
            $table->decimal('price', 18, 2)->default(0);
            $table->decimal('wholesale_price', 18, 2)->default(0);
            $table->decimal('clearance_price', 18, 2)->default(0);
            $table->boolean('clearance_active')->default(false);
            $table->text('clearance_note')->nullable();
            $table->timestamp('clearance_started_at')->nullable();
            $table->decimal('qty', 18, 3)->default(0);
            $table->decimal('weight', 18, 3)->nullable();
            $table->enum('weight_type', ['gram', 'kg'])->default('gram');
            $table->boolean('allows_sale')->default(true);
            $table->string('unit')->nullable();
            $table->decimal('min_quantity', 18, 3)->default(0);
            $table->decimal('max_quantity', 18, 3)->default(999999999);
            $table->enum('type', ['product', 'service', 'combo'])->default('product');
            $table->text('description')->nullable();
            $table->text('note')->nullable();
            $table->json('units')->nullable();
            $table->json('elements')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('status')->default('Má»›i');
            $table->string('category_name')->nullable();
            $table->string('trademark_name')->nullable();
            $table->string('supplier_name')->nullable();
            $table->string('origin')->nullable();
            $table->string('color')->nullable();
            $table->string('size')->nullable();
            $table->string('barcode')->nullable();
            $table->string('parent_code')->nullable();
            $table->string('parent_name')->nullable();
            $table->json('extra')->nullable();
            $table->timestamps();

            $table->index(['name', 'code']);
            $table->index('barcode');
            $table->index('parent_code');
        });

        Schema::create('product_branch_stocks', function (Blueprint $table) {
            $table->id();
            $table->string('mongo_id', 24)->nullable()->unique();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->decimal('qty', 18, 3)->default(0);
            $table->decimal('locked_quantity', 18, 3)->default(0);
            $table->decimal('min_quantity', 18, 3)->default(0);
            $table->decimal('max_quantity', 18, 3)->default(999999999);
            $table->timestamps();

            $table->unique(['product_id', 'branch_id']);
            $table->index(['branch_id', 'qty']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_branch_stocks');
        Schema::dropIfExists('products');
        Schema::dropIfExists('shelves');
        Schema::dropIfExists('trademarks');
        Schema::dropIfExists('categories');
        Schema::dropIfExists('customer_customer_group');
        Schema::dropIfExists('customers');
        Schema::dropIfExists('customer_groups');

        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['branch_id']);
            $table->dropForeign(['default_warehouse_id']);
            $table->dropForeign(['created_by_id']);
        });

        Schema::dropIfExists('user_warehouse_assignments');
        Schema::dropIfExists('branches');
    }
};

