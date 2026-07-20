<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('product_edit_logs')) {
            return;
        }

        $driver = DB::connection()->getDriverName();

        if ($driver === 'mysql') {
            DB::statement(<<<'SQL'
                UPDATE product_edit_logs
                SET
                    log_type = COALESCE(NULLIF(log_type, ''), NULLIF(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.logType')), ''), NULLIF(field_name, '')),
                    log_action = COALESCE(NULLIF(log_action, ''), NULLIF(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.logAction')), ''), NULLIF(new_value, ''))
                WHERE (log_type IS NULL OR log_type = '' OR log_action IS NULL OR log_action = '')
            SQL);

            return;
        }

        if ($driver === 'sqlite') {
            DB::statement(<<<'SQL'
                UPDATE product_edit_logs
                SET
                    log_type = COALESCE(NULLIF(log_type, ''), NULLIF(json_extract(payload, '$.logType'), ''), NULLIF(field_name, '')),
                    log_action = COALESCE(NULLIF(log_action, ''), NULLIF(json_extract(payload, '$.logAction'), ''), NULLIF(new_value, ''))
                WHERE (log_type IS NULL OR log_type = '' OR log_action IS NULL OR log_action = '')
            SQL);
        }
    }

    public function down(): void
    {
        // Local conversion data only; backfill rollback is intentionally manual.
    }
};
