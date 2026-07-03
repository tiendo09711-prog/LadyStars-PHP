<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_edit_logs', function (Blueprint $table) {
            if (!Schema::hasColumn('product_edit_logs', 'log_type')) {
                $table->string('log_type')->nullable()->index()->after('created_by');
            }

            if (!Schema::hasColumn('product_edit_logs', 'log_action')) {
                $table->string('log_action')->nullable()->index()->after('log_type');
            }
        });
    }

    public function down(): void
    {
        // Local conversion tables only; keep rollback manual to avoid dropping synced data.
    }
};
