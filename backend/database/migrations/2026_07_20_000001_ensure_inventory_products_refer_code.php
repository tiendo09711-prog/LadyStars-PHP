<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Repair gap from 2026_07_03_000002: inventory_products.refer_code was only
 * added inside "if (!hasColumn branch_id)", so DBs that already had branch_id
 * (or got it from a later migration) never received refer_code.
 * Full import SQL and warehouse reports require this column.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('inventory_products')) {
            return;
        }

        if (!Schema::hasColumn('inventory_products', 'refer_code')) {
            Schema::table('inventory_products', function (Blueprint $table) {
                if (Schema::hasColumn('inventory_products', 'code')) {
                    $table->string('refer_code')->nullable()->after('code');
                } else {
                    $table->string('refer_code')->nullable();
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('inventory_products') && Schema::hasColumn('inventory_products', 'refer_code')) {
            Schema::table('inventory_products', function (Blueprint $table) {
                $table->dropColumn('refer_code');
            });
        }
    }
};
