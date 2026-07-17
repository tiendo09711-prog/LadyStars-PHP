<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory_stock_movements', function (Blueprint $table) {
            $table->id();
            $table->uuid('event_id')->unique();
            $table->foreignId('stock_id')->nullable()->constrained('product_branch_stocks')->nullOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->string('movement_type', 50);
            $table->decimal('quantity_before', 18, 3);
            $table->decimal('quantity_delta', 18, 3);
            $table->decimal('quantity_after', 18, 3);
            $table->decimal('unit_cost', 18, 2)->default(0);
            $table->string('source_type', 100)->nullable();
            $table->string('source_id', 100)->nullable();
            $table->string('idempotency_key', 191)->unique();
            $table->timestamp('occurred_at')->index();
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->index(['product_id', 'branch_id', 'occurred_at'], 'inventory_movement_scope_date_idx');
            $table->index(['movement_type', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_stock_movements');
    }
};
