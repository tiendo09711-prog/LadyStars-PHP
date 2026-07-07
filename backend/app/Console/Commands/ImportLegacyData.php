<?php

namespace App\Console\Commands;

use App\Services\LegacyImportService;
use Illuminate\Console\Command;
use Throwable;

/**
 * CLI wrapper cho Legacy Import.
 * Toàn bộ logic thực tế nằm ở LegacyImportService (tái sử dụng cho cả Web UI).
 */
class ImportLegacyData extends Command
{
    protected $signature = 'import:legacy-data
        {--dry-run : Chạy thử, không ghi DB}
        {--truncate-only : Chỉ truncate, không import}
        {--verify : Chạy verify}
        {--force : Bỏ qua xác nhận}
        {--limit= : Giới hạn dòng}
        {--batch-size=500}
        {--log-file=}';

    protected $description = 'Import legacy data từ Excel (sử dụng LegacyImportService)';

    public function handle(): int
    {
        $dryRun = (bool)$this->option('dry-run');
        $truncateOnly = (bool)$this->option('truncate-only');
        $verifyOnly = (bool)$this->option('verify');
        $limit = $this->option('limit') ? (int)$this->option('limit') : null;

        $this->info('=== LADYSTARS LEGACY IMPORT (via Service) ===');
        $this->info("dry-run=$dryRun truncate-only=$truncateOnly verify=$verifyOnly");

        $base = 'c:/Users/tiend/Downloads/';
        $fileMap = [
            'categories' => $base . 'Danh mục.xlsx',
            'products' => $this->firstExistingPath([
                $base . 'Sản phảm - Sản phẩm.xlsx',
                $base . 'Sản phẩm - Sản phẩm.xlsx',
            ]),
            'stock' => $base . 'Tồn kho.xlsx',
            'customers' => $base . 'Danh sách khách hàng.xlsx',
            'sales' => $base . 'Bán lẻ.xlsx',
            'returns' => $base . 'Hóa đơn trả hàng.xlsx',
            'cares' => $base . 'Danh sách phiếu chăm sóc.xlsx',
            'inv_vouchers' => $base . 'Xuất nhập kho - Phiếu xuất nhập kho.xlsx',
            'inv_items' => $base . 'Xuất nhập kho - Sản phẩm xuất nhập kho.xlsx',
            'product_logs' => $base . 'Sản phẩm - Lịch sử sửa xóa (1).xlsx',
        ];

        foreach ($fileMap as $k => $p) {
            if (!file_exists($p)) {
                $this->error("MISSING FILE: $k => $p");
                return self::FAILURE;
            }
        }

        if (!$dryRun && !$verifyOnly && !$this->option('force')) {
            if (!$this->confirm('CẢNH BÁO: XÓA dữ liệu cũ + IMPORT mới từ Excel? (Không thể hoàn tác)', false)) {
                $this->warn('Đã hủy.');
                return self::SUCCESS;
            }
        }

        if ($verifyOnly) {
            $this->info('Verify mode - chạy service dry-run để phân tích...');
            app(LegacyImportService::class)->run($fileMap, ['dry_run' => true, 'limit' => $limit]);
            $this->info('Verify completed.');
            return self::SUCCESS;
        }

        $result = app(LegacyImportService::class)->run($fileMap, [
            'dry_run' => $dryRun,
            'truncate_only' => $truncateOnly,
            'limit' => $limit,
        ]);

        if ($result['success'] ?? false) {
            $this->info('SUCCESS. Orphans: ' . ($result['orphans_count'] ?? 0));
            if (!empty($result['report_path'])) $this->line('Report: ' . $result['report_path']);
            if (!empty($result['orphans_csv'])) $this->line('Orphans CSV: ' . $result['orphans_csv']);
        } else {
            $this->error($result['message'] ?? 'Import failed');
            return self::FAILURE;
        }

        return self::SUCCESS;
    }

    private function firstExistingPath(array $paths): string
    {
        foreach ($paths as $path) {
            if (file_exists($path)) {
                return $path;
            }
        }

        return $paths[0];
    }
}
