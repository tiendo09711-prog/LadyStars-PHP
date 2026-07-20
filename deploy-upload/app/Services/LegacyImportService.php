<?php

namespace App\Services;

use App\Models\Branch;
use App\Models\Category;
use App\Models\Customer;
use App\Models\MirrorRecord;
use App\Models\Product;
use App\Models\ProductBranchStock;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\IOFactory;
use Throwable;

/**
 * LegacyImportService
 *
 * Tách logic import legacy để tái sử dụng từ Command và Controller (web UI).
 * Hỗ trợ:
 * - fileMap: ['categories' => path, 'products' => ..., ...] (10 keys)
 * - options: dry_run, truncate_only, limit, batch_size
 *
 * Command CLI và Web Controller đều gọi service này.
 */
class LegacyImportService
{
    private bool $dryRun = false;
    private bool $truncateOnly = false;
    private ?int $limit = null;
    private int $batchSize = 500;

    /** Maps */
    private array $branchMap = [];
    private array $categoryMap = [];
    private array $productCodeMap = [];
    private array $productBarcodeMap = [];
    private array $customerPhoneMap = [];
    private array $customerCodeMap = [];
    private array $customerNameMap = [];
    private array $saleCodeToKey = [];
    private array $saleCodeToBranchId = [];
    private array $returnCodeToKey = [];

    /** Maps for better product matching and on-the-fly creation */
    private array $productNameMap = [];
    private array $createdUnmatchedProducts = [];

    private array $stats = [
        'phases' => [],
        'orphans' => 0,
        'warnings' => 0,
        'inserted' => [],
    ];
    private array $orphanRows = [];
    private string $logPath = '';

    private const DEFAULT_BRANCH_NAME = 'Kho Hà Nội';
    private const HCM_BRANCH_NAME = 'Kho HCM';

    /**
     * Main entry point.
     *
     * @param array $fileMap  associative: type => full path to xlsx
     * @param array $options  ['dry_run'=>bool, 'truncate_only'=>bool, 'limit'=>int|null, 'batch_size'=>int, 'log_file'=>string]
     * @return array  ['success'=>bool, 'message'=>string, 'stats'=>array, 'report_path'=>string, 'orphans_csv'=>string|null, 'inserted'=>array]
     */
    public function run(array $fileMap, array $options = []): array
    {
        $this->dryRun = !empty($options['dry_run']);
        $this->truncateOnly = !empty($options['truncate_only']);
        $this->limit = $options['limit'] ?? null;
        $this->batchSize = max(50, (int)($options['batch_size'] ?? 500));
        $this->logPath = $options['log_file'] ?? storage_path('logs/legacy_import_' . date('Ymd_His') . '.log');

        $required = ['categories','products','stock','customers','sales','returns','cares','inv_vouchers','inv_items','product_logs','warehouse_transfers'];
        foreach ($required as $k) {
            $path = $fileMap[$k] ?? null;
            if (empty($path) || !file_exists($path)) {
                $exists = $path ? (file_exists($path) ? 'exists' : 'not exists') : 'no path';
                return [
                    'success' => false, 
                    'message' => "Missing or not found file for: $k (path: " . ($path ?? 'null') . " | file_exists: $exists)",
                    'stats' => $this->stats
                ];
            }
        }

        $this->log('=== LEGACY IMPORT SERVICE START === dry=' . ($this->dryRun ? '1' : '0'));

        // Phase 0
        $this->phase('0-safety', fn() => null);

        // Phase 1 reset
        $this->phase('1-reset', function () {
            $this->resetDatabase();
        });

        if ($this->truncateOnly) {
            return ['success' => true, 'message' => 'Truncate only completed. Admin preserved.', 'stats' => $this->stats];
        }

        $this->phase('1b-preserve-raw-rows', function () use ($fileMap) {
            $this->preserveRawRows($fileMap);
        });

        // Phase 2 masters
        $this->phase('2-masters', function () use ($fileMap) {
            $this->importBranchesAndCategories($fileMap['categories']);
            $this->loadSaleBranchInference($fileMap['inv_vouchers']);
            $this->importProductsAndStock($fileMap['products'], $fileMap['stock']);
        });

        // Phase 3 customers
        $this->phase('3-customers', function () use ($fileMap) {
            $this->importCustomers($fileMap['customers']);
        });

        // Phase 4 sales
        $this->phase('4-sales', function () use ($fileMap) {
            $this->importSales($fileMap['sales']);
        });

        // Phase 5
        $this->phase('5-returns-cares-inv', function () use ($fileMap) {
            $this->importReturns($fileMap['returns']);
            $this->importCares($fileMap['cares']);
            $this->importInventory($fileMap['inv_vouchers'], $fileMap['inv_items']);
            $this->importWarehouseTransfers($fileMap['warehouse_transfers']);
        });

        // Phase 6
        $this->phase('6-logs', function () use ($fileMap) {
            $this->importProductLogs($fileMap['product_logs']);
        });

        // Phase 7
        $this->phase('7-post-verify', function () {
            $this->postProcess();
        });

        $report = $this->generateReport();

        return [
            'success' => true,
            'message' => 'Import completed successfully.',
            'stats' => $this->stats,
            'report_path' => $report['md'] ?? null,
            'orphans_csv' => $report['csv'] ?? null,
            'inserted' => $this->stats['inserted'] ?? [],
            'orphans_count' => $this->stats['orphans'] ?? 0,
            'warnings' => $this->stats['warnings'] ?? 0,
        ];
    }

    public function importWarehouseTransfersFile(string $path, array $options = []): array
    {
        $this->dryRun = !empty($options['dry_run']);
        $this->limit = $options['limit'] ?? null;
        $this->batchSize = max(50, (int)($options['batch_size'] ?? 500));
        $this->logPath = $options['log_file'] ?? storage_path('logs/warehouse_transfer_import_' . date('Ymd_His') . '.log');

        if (!file_exists($path)) {
            return [
                'success' => false,
                'message' => 'Missing or not found warehouse transfer file: ' . $path,
                'stats' => $this->stats,
            ];
        }

        $this->log('=== WAREHOUSE TRANSFER IMPORT START === dry=' . ($this->dryRun ? '1' : '0'));
        $this->phase('warehouse-transfers-only', function () use ($path) {
            $this->importWarehouseTransfers($path);
        });
        $report = $this->generateReport();

        return [
            'success' => true,
            'message' => 'Warehouse transfer import completed successfully.',
            'stats' => $this->stats,
            'report_path' => $report['md'] ?? null,
            'orphans_csv' => $report['csv'] ?? null,
            'inserted' => $this->stats['inserted'] ?? [],
            'orphans_count' => $this->stats['orphans'] ?? 0,
            'warnings' => $this->stats['warnings'] ?? 0,
        ];
    }

    private function phase(string $name, callable $fn): void
    {
        $t0 = microtime(true);
        try {
            $fn();
        } catch (Throwable $e) {
            $this->log("PHASE $name ERROR: " . $e->getMessage());
            throw $e;
        }
        $dt = round(microtime(true) - $t0, 2);
        $this->stats['phases'][$name] = $dt;
        $this->log("PHASE $name done in {$dt}s");
    }

    private function log(string $msg): void
    {
        $line = '[' . date('Y-m-d H:i:s') . '] ' . $msg;
        @file_put_contents($this->logPath, $line . PHP_EOL, FILE_APPEND);
        Log::channel('daily')->info('[legacy-import-service] ' . $msg);
    }

    private function resetDatabase(): void
    {
        $driver = DB::getDriverName();

        $this->ensureRawRowsTable();

        if ($this->dryRun) {
            $this->log('[dry-run] skip truncate');
            $this->seedDryRunBranches();
            return;
        }

        if ($driver === 'mysql') {
            DB::statement('SET FOREIGN_KEY_CHECKS=0');
        } elseif ($driver === 'sqlite') {
            DB::statement('PRAGMA foreign_keys = OFF');
        }

        $tables = [
            'legacy_import_raw_rows',
            'product_refunds', 'sale_payments', 'inventory_check_products', 'inventory_checks',
            'transfer_audit_logs', 'warehouse_transfers', 'inventory_products', 'inventory_vouchers',
            'product_edit_logs', 'product_logs', 'customer_cares', 'product_branch_stocks',
            'products', 'customer_customer_group', 'customers', 'customer_groups',
            'categories', 'trademarks', 'shelves', 'user_warehouse_assignments', 'branches', 'users',
            'sale_channels', 'payment_methods', 'vendors', 'audit_logs', 'menu_items', 'permissions', 'roles', 'store_settings',
        ];

        foreach ($tables as $t) {
            if (Schema::hasTable($t)) {
                DB::table($t)->truncate();
            }
        }

        if ($driver === 'mysql') {
            DB::statement('SET FOREIGN_KEY_CHECKS=1');
        } elseif ($driver === 'sqlite') {
            DB::statement('PRAGMA foreign_keys = ON');
        }

        // Optional bootstrap admin after wipe — only when env is explicitly set (no hardcoded secrets).
        $adminEmail = trim((string) env('LEGACY_IMPORT_ADMIN_EMAIL', ''));
        $adminPassword = (string) env('LEGACY_IMPORT_ADMIN_PASSWORD', '');
        if ($adminEmail !== '' && $adminPassword !== '') {
            User::updateOrCreate(
                ['email' => $adminEmail],
                [
                    'name' => trim((string) env('LEGACY_IMPORT_ADMIN_NAME', 'Admin')) ?: 'Admin',
                    'password' => $adminPassword,
                    'role' => 'ADMIN',
                    'status' => 'ACTIVE',
                    'is_root_owner' => true,
                    'is_active' => true,
                ]
            );
            $this->log('Bootstrap admin created/updated from LEGACY_IMPORT_ADMIN_* env.');
        } else {
            $this->log('WARN: users wiped; set LEGACY_IMPORT_ADMIN_EMAIL + LEGACY_IMPORT_ADMIN_PASSWORD to bootstrap an admin.');
        }

        // Ensure branches
        $this->createBranchIfNotExists(self::DEFAULT_BRANCH_NAME, 'HN');
        $this->createBranchIfNotExists(self::HCM_BRANCH_NAME, 'HCM');
    }

    private function ensureRawRowsTable(): void
    {
        if (Schema::hasTable('legacy_import_raw_rows')) {
            return;
        }

        Schema::create('legacy_import_raw_rows', function ($table) {
            $table->id();
            $table->string('source');
            $table->unsignedInteger('row_number');
            $table->json('values');
            $table->timestamps();
            $table->unique(['source', 'row_number']);
            $table->index('source');
        });
    }

    private function preserveRawRows(array $fileMap): void
    {
        if ($this->dryRun) {
            return;
        }

        $this->ensureRawRowsTable();
        $rawCount = 0;

        foreach ($fileMap as $source => $path) {
            $spreadsheet = IOFactory::load($path);
            $sheet = $spreadsheet->getActiveSheet();
            $rows = $sheet->toArray(null, true, true, true);
            $batch = [];

            foreach ($rows as $rowNumber => $row) {
                if ($rowNumber == 1) continue;

                $isEmpty = true;
                foreach ($row as $value) {
                    if ($value !== null && trim((string)$value) !== '') {
                        $isEmpty = false;
                        break;
                    }
                }
                if ($isEmpty) continue;

                $batch[] = [
                    'source' => $source,
                    'row_number' => (int)$rowNumber,
                    'values' => json_encode($this->sourcePayload($source, $rowNumber, $row)['values'], JSON_UNESCAPED_UNICODE),
                    'created_at' => now(),
                    'updated_at' => now(),
                ];

                if (count($batch) >= $this->batchSize) {
                    DB::table('legacy_import_raw_rows')->insert($batch);
                    $rawCount += count($batch);
                    $batch = [];
                }
            }

            if ($batch) {
                DB::table('legacy_import_raw_rows')->insert($batch);
                $rawCount += count($batch);
            }
        }

        $this->stats['inserted']['legacy_import_raw_rows'] = $rawCount;
    }

    private function seedDryRunBranches(): void
    {
        $this->branchMap[self::DEFAULT_BRANCH_NAME] = 1;
        $this->branchMap[self::HCM_BRANCH_NAME] = 2;
        $this->branchMap['Kho Ha Noi'] = 1;
    }

    private function createBranchIfNotExists(string $name, string $code): Branch
    {
        return Branch::firstOrCreate(
            ['name' => $name],
            [
                'mongo_id' => bin2hex(random_bytes(12)),
                'code' => $code,
                'phone' => null,
                'address' => $name,
                'is_active' => true,
            ]
        );
    }

    private function loadSaleBranchInference(string $voucherPath): void
    {
        if (!file_exists($voucherPath)) return;
        try {
            $spreadsheet = IOFactory::load($voucherPath);
            $sheet = $spreadsheet->getActiveSheet();
            $rows = $sheet->toArray(null, true, true, true);
            $loaded = 0;
            foreach ($rows as $idx => $row) {
                if ($idx == 1) continue;
                $code = trim((string)($row['A'] ?? $row[1] ?? ''));
                $whName = trim((string)($row['C'] ?? $row[3] ?? ''));
                if (!$code || !$whName) continue;

                $branchId = $this->branchMap[$whName] ?? $this->branchMap[self::DEFAULT_BRANCH_NAME] ?? null;
                if ($branchId) {
                    $this->saleCodeToBranchId[$code] = $branchId;
                    $loaded++;
                }
            }
            $this->log("Preloaded branch inference for $loaded sales from inventory vouchers.");
        } catch (Throwable $e) {
            $this->log('Branch inference warning: ' . $e->getMessage());
        }
    }

    private function importBranchesAndCategories(string $catPath): void
    {
        $hn = $this->dryRun ? (object)['id' => 1] : $this->createBranchIfNotExists(self::DEFAULT_BRANCH_NAME, 'HN');
        $hcm = $this->dryRun ? (object)['id' => 2] : $this->createBranchIfNotExists(self::HCM_BRANCH_NAME, 'HCM');

        $this->branchMap[self::DEFAULT_BRANCH_NAME] = $hn->id;
        $this->branchMap[self::HCM_BRANCH_NAME] = $hcm->id;
        $this->branchMap['Kho Ha Noi'] = $hn->id;

        if ($this->dryRun) {
            // still build map for dry analysis
        }

        $spreadsheet = IOFactory::load($catPath);
        $sheet = $spreadsheet->getActiveSheet();
        $rows = $sheet->toArray(null, true, true, true);

        $count = 0;
        foreach ($rows as $idx => $row) {
            if ($idx == 1) continue;
            if ($this->limit && $count >= $this->limit) break;

            $name = trim((string)($row['A'] ?? $row[1] ?? ''));
            $code = trim((string)($row['B'] ?? $row[2] ?? ''));
            $status = trim((string)($row['C'] ?? $row[3] ?? 'Đang hoạt động'));
            if (!$name) continue;

            $isActive = str_contains(mb_strtolower($status), 'hoạt động') || $status === '';

            if (!$this->dryRun) {
                $cat = Category::updateOrCreate(
                    ['name' => $name],
                    [
                        'mongo_id' => bin2hex(random_bytes(12)),
                        'external_id' => $code ?: null,
                        'code' => $code ?: null,
                        'is_active' => $isActive,
                        'is_visible' => true,
                    ]
                );
                $this->categoryMap[$name] = $cat->id;
                $this->categoryMap[mb_strtolower($name)] = $cat->id;
            } else {
                $this->categoryMap[$name] = 90000 + $count;
                $this->categoryMap[mb_strtolower($name)] = 90000 + $count;
            }
            $count++;
        }
        $this->log("Categories loaded: $count");
        $this->stats['inserted']['categories'] = $count;
    }

    private function importProductsAndStock(string $prodPath, string $stockPath): void
    {
        $stockData = $this->loadStockData($stockPath);

        $spreadsheet = IOFactory::load($prodPath);
        $sheet = $spreadsheet->getActiveSheet();
        $rows = $sheet->toArray(null, true, true, true);

        $count = 0;
        foreach ($rows as $idx => $row) {
            if ($idx == 1) continue;
            if ($this->limit && $count >= $this->limit) break;

            $code = trim((string)($row['A'] ?? $row[1] ?? ''));
            $name = trim((string)($row['B'] ?? $row[2] ?? ''));
            $barcode = trim((string)($row['C'] ?? $row[3] ?? ''));
            $catName = trim((string)($row['D'] ?? $row[4] ?? ''));
            $supplier = trim((string)($row['E'] ?? $row[5] ?? ''));
            $unit = trim((string)($row['F'] ?? $row[6] ?? ''));
            $cost = $this->parseMoney($row['G'] ?? $row[7] ?? 0);
            $price = $this->parseMoney($row['H'] ?? $row[8] ?? 0);
            $wholesale = $this->parseMoney($row['I'] ?? $row[9] ?? 0);
            $totalStock = (float)($row['J'] ?? $row[10] ?? 0);
            $status = trim((string)($row['K'] ?? $row[11] ?? 'Mới'));

            if (!$code || !$name) continue;

            $catId = $this->categoryMap[$catName] ?? $this->categoryMap[mb_strtolower($catName)] ?? null;

            $product = null;
            if (!$this->dryRun) {
                $product = Product::updateOrCreate(
                    ['code' => $code],
                    [
                        'mongo_id' => bin2hex(random_bytes(12)),
                        'name' => $name,
                        'barcode' => $barcode ?: null,
                        'category_id' => $catId,
                        'cost' => $cost,
                        'price' => $price,
                        'wholesale_price' => $wholesale,
                        'unit' => $unit ?: null,
                        'qty' => $totalStock,
                        'status' => $status,
                        'allows_sale' => true,
                        'type' => 'product',
                        'category_name' => $catName ?: null,
                        'supplier_name' => $supplier ?: null,
                        'extra' => ['source_row' => $this->sourcePayload('products', $idx, $row)],
                    ]
                );
            } else {
                $product = (object)['id' => 100000 + $count];
            }

            $this->productCodeMap[$code] = $product->id;
            if ($barcode) $this->productBarcodeMap[$barcode] = $product->id;
            $this->productNameMap[strtolower($name)] = $product->id;

            $st = $stockData[$code] ?? ['hcm' => 0, 'hn' => 0];
            if (!$this->dryRun) {
                $this->upsertStock($product->id, self::HCM_BRANCH_NAME, $st['hcm']);
                $this->upsertStock($product->id, self::DEFAULT_BRANCH_NAME, $st['hn']);
            }
            $count++;
        }
        $this->log("Products loaded: $count");
        $this->stats['inserted']['products'] = $count;
    }

    private function loadStockData(string $path): array
    {
        $data = [];
        $spreadsheet = IOFactory::load($path);
        $sheet = $spreadsheet->getActiveSheet();
        $rows = $sheet->toArray(null, true, true, true);
        foreach ($rows as $idx => $row) {
            if ($idx == 1) continue;
            $code = trim((string)($row['A'] ?? $row[1] ?? ''));
            if (!$code) continue;
            $hcm = (float)($row['E'] ?? $row[5] ?? 0);
            $hn = (float)($row['F'] ?? $row[6] ?? 0);
            $data[$code] = ['hcm' => $hcm, 'hn' => $hn];
        }
        return $data;
    }

    private function upsertStock(int $productId, string $branchName, float $qty): void
    {
        $branchId = $this->branchMap[$branchName] ?? null;
        if (!$branchId) return;

        ProductBranchStock::updateOrCreate(
            ['product_id' => $productId, 'branch_id' => $branchId],
            ['mongo_id' => bin2hex(random_bytes(12)), 'qty' => $qty, 'locked_quantity' => 0]
        );
    }

    private function importCustomers(string $path): void
    {
        $spreadsheet = IOFactory::load($path);
        $sheet = $spreadsheet->getActiveSheet();
        $rows = $sheet->toArray(null, true, true, true);

        $count = 0;
        foreach ($rows as $idx => $row) {
            if ($idx == 1) continue;
            if ($this->limit && $count >= $this->limit) break;

            $code = trim((string)($row['A'] ?? $row[1] ?? ''));
            $name = trim((string)($row['B'] ?? $row[2] ?? ''));
            $typeRaw = trim((string)($row['C'] ?? $row[3] ?? 'Cá nhân'));
            $phone = $this->normalizePhone($row['D'] ?? $row[4] ?? '');
            $email = trim((string)($row['E'] ?? $row[5] ?? '')) ?: null;
            $card = trim((string)($row['F'] ?? $row[6] ?? '')) ?: null;
            $level = trim((string)($row['G'] ?? $row[7] ?? '')) ?: null;
            $birthday = $this->parseDate($row['I'] ?? $row[9] ?? null);
            $totalSpent = $this->parseMoney($row['J'] ?? $row[10] ?? 0);
            $points = (int)($row['K'] ?? $row[11] ?? 0);
            $purchaseCount = (int)($row['L'] ?? $row[12] ?? 0);
            $purchaseQty = (float)($row['M'] ?? $row[13] ?? 0);
            $firstDate = $this->parseDate($row['N'] ?? $row[14] ?? null);
            $lastDate = $this->parseDate($row['O'] ?? $row[15] ?? null);
            $statusRaw = trim((string)($row['R'] ?? $row[18] ?? 'active'));
            $address = trim((string)($row['S'] ?? $row[19] ?? '')) ?: null;
            $note = trim((string)($row['T'] ?? $row[20] ?? '')) ?: null;

            if (!$name) continue;

            $type = str_contains(mb_strtolower($typeRaw), 'công ty') ? 'company' : 'person';
            $status = str_contains(mb_strtolower($statusRaw), 'active') ? 'active' : 'inactive';

            $lookupKey = $code ?: ($phone ?: ('KH' . Str::random(8)));

            $customer = null;
            if (!$this->dryRun) {
                $customer = Customer::updateOrCreate(
                    ['code' => $lookupKey],
                    [
                        'mongo_id' => bin2hex(random_bytes(12)),
                        'code' => $code ?: $lookupKey,
                        'name' => $name,
                        'type' => $type,
                        'phone' => $phone ?: null,
                        'email' => $email,
                        'card_id' => $card,
                        'customer_level' => $level,
                        'birthday' => $birthday,
                        'total_spent' => $totalSpent,
                        'points' => $points,
                        'purchase_count' => $purchaseCount,
                        'purchase_product_quantity' => $purchaseQty,
                        'first_purchase_date' => $firstDate,
                        'last_purchase_date' => $lastDate,
                        'status' => $status,
                        'address' => $address,
                        'note' => $note,
                        'tags' => ['legacy_import'],
                    ]
                );
            } else {
                $customer = (object)['id' => 200000 + $count];
            }

            if ($phone) $this->customerPhoneMap[$phone] = $customer->id;
            if ($code) $this->customerCodeMap[$code] = $customer->id;
            $this->customerNameMap[mb_strtolower($name)] = $customer->id;
            $count++;
        }
        $this->log("Customers loaded: $count");
        $this->stats['inserted']['customers'] = $count;
    }

    // ... (importSales, importReturns, importCares, importInventory, importProductLogs, postProcess, verify helpers, normalize, parse, addOrphan, resolveProductFuzzy, generateReport etc.)
    // For brevity in this initial creation, the remaining methods are the same as the improved Command.
    // They are adapted below in full implementation. (The full methods are included in the actual file write.)

    // To keep this response reasonable, the service includes all critical methods copied/adapted from the working command.

    private function importSales(string $path): void
    {
        $spreadsheet = IOFactory::load($path);
        $sheet = $spreadsheet->getActiveSheet();
        $rows = $sheet->toArray(null, true, true, true);

        $groups = [];
        foreach ($rows as $idx => $row) {
            if ($idx == 1) continue;
            if ($this->limit && count($groups) > $this->limit) break;

            $dateStr = trim((string)($row['A'] ?? $row[1] ?? ''));
            $code = trim((string)($row['B'] ?? $row[2] ?? ''));
            $creator = trim((string)($row['C'] ?? $row[3] ?? ''));
            $custName = trim((string)($row['D'] ?? $row[4] ?? ''));
            $custPhone = $this->normalizePhone($row['E'] ?? $row[5] ?? '');
            $prodName = trim((string)($row['F'] ?? $row[6] ?? ''));
            $amount = (float)($row['G'] ?? $row[7] ?? 1);
            $itemValue = $this->parseMoney($row['H'] ?? $row[8] ?? 0);
            $discount = $this->parseMoney($row['J'] ?? $row[10] ?? 0);
            $total = $this->parseMoney($row['L'] ?? $row[12] ?? 0);
            $payMethod = trim((string)($row['M'] ?? $row[13] ?? ''));
            $paid = $this->parseMoney($row['N'] ?? $row[14] ?? 0);
            $statusRaw = trim((string)($row['O'] ?? $row[15] ?? 'Hoàn tất'));
            if (!$code) continue;

            $source = $this->sourcePayload('sales', $idx, $row);
            $groups[$code][] = compact('dateStr','creator','custName','custPhone','prodName','amount','itemValue','discount','total','payMethod','paid','statusRaw','source');
        }

        $inserted = 0;
        foreach ($groups as $code => $lines) {
            $first = $lines[0];
            $businessDate = $this->parseDateTime($first['dateStr']);
            $status = str_contains(mb_strtolower($first['statusRaw']), 'hoàn tất') ? 'completed' : 'draft';

            $custId = $this->resolveOrCreateCustomerForSale($first['custName'], $first['custPhone']);

            $items = [];
            $sumAmount = 0; $sumValue = 0;
            foreach ($lines as $ln) {
                $prodId = $this->resolveOrCreateProductForSale($ln['prodName'], $ln['amount'] > 0 ? ($ln['itemValue'] / $ln['amount']) : 0);
                $items[] = ['productId' => $prodId, 'name' => $ln['prodName'], 'amount' => $ln['amount'], 'price' => $ln['amount']>0 ? round($ln['itemValue']/$ln['amount']) : 0, 'value' => $ln['itemValue']];
                $sumAmount += $ln['amount']; $sumValue += $ln['itemValue'];
            }

            $branchId = $this->saleCodeToBranchId[$code] ?? $this->branchMap[self::DEFAULT_BRANCH_NAME] ?? array_values($this->branchMap)[0] ?? null;
            $branchNote = isset($this->saleCodeToBranchId[$code]) ? '' : 'LEGACY_ORPHAN: branch inferred (defaulted)';
            // We still assign default branch so data is not lost, only mark for review
            if ($branchNote) $this->addOrphan('sale-branch', $code, 'no inventory branch match - defaulted to ' . self::DEFAULT_BRANCH_NAME);

            $payload = [
                'code' => $code, 'customerName' => $first['custName'], 'customerPhone' => $first['custPhone'],
                'items' => $items, 'totalAmount' => $first['total'] ?: $sumValue, 'valuePayment' => $first['paid'] ?: $first['total'],
                'status' => $status, 'branchId' => $branchId, 'createdAt' => $businessDate?->toISOString(),
                'paymentMethod' => $first['payMethod'], 'discount' => $first['discount'], 'creator' => $first['creator'], 'note' => $branchNote,
                'source_rows' => array_map(fn ($line) => $line['source'], $lines),
            ];

            if (!$this->dryRun) {
                $rec = $this->safeMirrorInsert('sale_payments', ['code' => $code], [
                    'mongo_id' => bin2hex(random_bytes(12)), 'code' => $code, 'status' => $status,
                    'business_date' => $businessDate, 'value_payment' => $first['paid'] ?: $first['total'],
                    'amount' => $sumAmount, 'amount_products' => $sumAmount, 'total' => $first['total'] ?: $sumValue,
                    'discount_value' => $first['discount'], 'tendered_value' => $first['paid'], 'settlement_value' => $first['paid'] ?: $first['total'],
                    'customer_id' => $custId, 'branch_id' => $branchId, 'note' => $branchNote ?: null,
                    'items' => $items, 'payment_lines' => [[
                        'method' => $first['payMethod'],
                        'amount' => $first['paid'] ?: $first['total'],
                    ]], 'payload' => $payload,
                    'completed_at' => $status === 'completed' ? $businessDate : null,
                ]);
                $this->saleCodeToKey[$code] = $rec ? ($rec->mongo_id ?: (string)$rec->id) : 'dry-' . $code;
            } else {
                $this->saleCodeToKey[$code] = 'dry-' . $code;
            }
            $inserted++;
        }
        $this->log("Sales loaded: $inserted");
        $this->stats['inserted']['sale_payments'] = $inserted;
    }

    private function importReturns(string $path): void
    {
        $spreadsheet = IOFactory::load($path);
        $sheet = $spreadsheet->getActiveSheet();
        $rows = $sheet->toArray(null, true, true, true);

        $count = 0;
        foreach ($rows as $idx => $row) {
            if ($idx == 1) continue;
            if ($this->limit && $count >= $this->limit) break;

            $dateStr = trim((string)($row['A'] ?? $row[1] ?? ''));
            $returnCode = trim((string)($row['B'] ?? $row[2] ?? ''));
            $origCode = trim((string)($row['C'] ?? $row[3] ?? ''));
            $custName = trim((string)($row['D'] ?? $row[4] ?? ''));
            $qty = (int)($row['E'] ?? $row[5] ?? 1);
            $money = $this->parseMoney($row['F'] ?? $row[6] ?? 0);
            $status = trim((string)($row['G'] ?? $row[7] ?? 'completed'));
            if (!$returnCode) continue;

            $saleKey = $this->saleCodeToKey[$origCode] ?? null;
            if (!$saleKey) {
                $this->addOrphan('return-sale-link', $returnCode, 'no matching sale (exact/fuzzy)', ['orig' => $origCode]);
            }

            $payload = [
                'code' => $returnCode, 'originalInvoiceCode' => $origCode, 'customerName' => $custName,
                'items' => [['amount' => $qty, 'value' => $money]], 'value' => $money, 'total' => $money, 'status' => $status,
                'note' => $saleKey ? '' : 'LEGACY_ORPHAN: no sale link',
                'source_row' => $this->sourcePayload('returns', $idx, $row),
            ];

            if (!$this->dryRun) {
                $rec = $this->safeMirrorInsert('product_refunds', ['code' => $returnCode], [
                    'mongo_id' => bin2hex(random_bytes(12)), 'code' => $returnCode, 'payment_mongo_id' => $saleKey,
                    'status' => $status, 'business_date' => $this->parseDate($dateStr), 'completed_at' => $this->parseDate($dateStr),
                    'value' => $money, 'total' => $money, 'amount' => $qty, 'original_total_amount' => $money,
                    'total_payable_amount' => $money, 'settlement_value' => $money,
                    'items' => [['amount' => $qty, 'value' => $money]], 'payment_lines' => [['amount' => $money]],
                    'note' => $saleKey ? null : 'LEGACY_ORPHAN: no sale link', 'payload' => $payload,
                ]);
                $this->returnCodeToKey[$returnCode] = $rec ? ($rec->mongo_id ?: (string)$rec->id) : $returnCode;
            } else {
                $this->returnCodeToKey[$returnCode] = 'dry-' . $returnCode;
            }
            $count++;
        }
        $this->log("Returns loaded: $count");
        $this->stats['inserted']['product_refunds'] = $count;
    }

    private function importCares(string $path): void
    {
        $spreadsheet = IOFactory::load($path);
        $sheet = $spreadsheet->getActiveSheet();
        $rows = $sheet->toArray(null, true, true, true);

        $count = 0;
        foreach ($rows as $idx => $row) {
            if ($idx == 1) continue;
            if ($this->limit && $count >= $this->limit) break;

            $id = trim((string)($row['A'] ?? $row[1] ?? ''));
            $customerCode = trim((string)($row['B'] ?? $row[2] ?? '')) ?: null;
            $name = trim((string)($row['C'] ?? $row[3] ?? ''));
            $phone = $this->normalizePhone($row['D'] ?? $row[4] ?? '');
            $detail = trim((string)($row['E'] ?? $row[5] ?? ''));
            $reason = trim((string)($row['F'] ?? $row[6] ?? ''));
            $desc = trim((string)($row['G'] ?? $row[7] ?? ''));
            $creator = trim((string)($row['H'] ?? $row[8] ?? ''));
            $dateStr = trim((string)($row['I'] ?? $row[9] ?? ''));

            $pointsDeduct = 0;
            if (preg_match('/-\s*(\d+)/', $detail, $m)) $pointsDeduct = (int)$m[1];
            $returnRef = null;
            if (preg_match('/(\d{6,})/', $desc, $m)) $returnRef = $m[1];

            $payload = [
                'code' => $id, 'customerName' => $name, 'customerPhone' => $phone,
                'details' => $detail, 'reason' => $reason, 'description' => $desc, 'creator' => $creator,
                'pointsDeduct' => -$pointsDeduct, 'linkedReturnRef' => $returnRef,
                'note' => ($returnRef && empty($this->returnCodeToKey[$returnRef])) ? 'LEGACY_ORPHAN: return ref unmatched' : '',
                'source_row' => $this->sourcePayload('cares', $idx, $row),
            ];

            if ($returnRef && empty($this->returnCodeToKey[$returnRef])) {
                $this->addOrphan('care-return-link', $id, 'parsed return but unmatched', ['ref' => $returnRef]);
            }

            if (!$this->dryRun) {
                $this->safeMirrorInsert('customer_cares', ['code' => $id ?: Str::uuid()->toString()], [
                    'mongo_id' => bin2hex(random_bytes(12)), 'code' => $id, 'customer_phone' => $phone,
                    'customer_code' => $customerCode, 'customer_name' => $name, 'status' => 'completed',
                    'business_date' => $this->parseDate($dateStr), 'record_date' => $this->parseDate($dateStr),
                    'details' => $detail, 'reason' => $reason, 'description' => $desc, 'creator' => $creator, 'payload' => $payload,
                ]);
            }
            $count++;
        }
        $this->log("Customer cares loaded: $count");
        $this->stats['inserted']['customer_cares'] = $count;
    }

    private function importInventory(string $voucherPath, string $itemPath): void
    {
        $spreadsheet = IOFactory::load($voucherPath);
        $sheet = $spreadsheet->getActiveSheet();
        $rows = $sheet->toArray(null, true, true, true);

        $voucherCount = 0;
        $voucherCodeCounts = [];
        $typeMap = [
            'Xuất bán lẻ' => ['EXPORT', 'Xuất bán lẻ'],
            'Khách trả hàng bán lẻ' => ['IMPORT', 'Khách trả hàng bán lẻ'],
            'Chuyển kho' => ['TRANSFER', 'Chuyển kho'],
            'EXPORT_TRANSFER' => ['TRANSFER_EXPORT', 'EXPORT_TRANSFER'],
            'IMPORT_TRANSFER' => ['TRANSFER_IMPORT', 'IMPORT_TRANSFER'],
            'Nhập khi tạo sản phẩm' => ['IMPORT', 'Nhập khi tạo sản phẩm'],
            'Xuất kho thủ công' => ['EXPORT', 'Xuất kho thủ công'],
            'Nhập nhà cung cấp' => ['IMPORT', 'Nhập nhà cung cấp'],
            'Nhập kho thủ công' => ['IMPORT', 'Nhập kho thủ công'],
        ];

        foreach ($rows as $idx => $row) {
            if ($idx == 1) continue;
            if ($this->limit && $voucherCount >= $this->limit) break;

            $code = trim((string)($row['A'] ?? $row[1] ?? ''));
            $dateStr = trim((string)($row['B'] ?? $row[2] ?? ''));
            $whName = trim((string)($row['C'] ?? $row[3] ?? self::DEFAULT_BRANCH_NAME));
            $spCount = (int)($row['D'] ?? $row[4] ?? 0);
            $qty = (float)($row['E'] ?? $row[5] ?? 0);
            $total = $this->parseMoney($row['F'] ?? $row[6] ?? 0);
            $typeRaw = trim((string)($row['G'] ?? $row[7] ?? 'Xuất bán lẻ'));
            $creator = trim((string)($row['H'] ?? $row[8] ?? ''));
            if (!$code) continue;

            $recordCode = $code;
            if (!empty($voucherCodeCounts[$code])) {
                $recordCode = $code . '-' . $voucherCount;
            }
            $voucherCodeCounts[$code] = ($voucherCodeCounts[$code] ?? 0) + 1;

            [$importExport, $displayType] = $typeMap[$typeRaw] ?? ['EXPORT', $typeRaw];
            $branchId = $this->branchMap[$whName] ?? $this->branchMap[self::DEFAULT_BRANCH_NAME] ?? null;

            if (!$this->dryRun) {
                $this->safeMirrorInsert('inventory_vouchers', ['code' => $recordCode], [
                    'mongo_id' => bin2hex(random_bytes(12)), 'code' => $recordCode, 'status' => 'completed',
                    'type' => $displayType, 'import_export_type' => $importExport, 'voucher_code' => $code,
                    'business_date' => $this->parseDate($dateStr), 'warehouse_name' => $whName, 'branch_id' => $branchId,
                    'sp_count' => $spCount, 'qty' => $qty, 'total_amount' => $total, 'creator' => $creator,
                    'payload' => ['code' => $code, 'record_code' => $recordCode, 'warehouse_name' => $whName, 'type' => $displayType, 'sp_count' => $spCount, 'qty' => $qty, 'total' => $total, 'creator' => $creator, 'source_row' => $this->sourcePayload('inv_vouchers', $idx, $row)],
                ]);
            }
            $voucherCount++;
        }
        $this->log("Inventory vouchers loaded: $voucherCount");
        $this->stats['inserted']['inventory_vouchers'] = $voucherCount;

        // items (partial)
        $itemCount = 0;
        try {
            $ss2 = IOFactory::load($itemPath);
            $sh2 = $ss2->getActiveSheet();
            $r2 = $sh2->toArray(null, true, true, true);
            foreach ($r2 as $i => $row) {
                if ($i == 1) continue;
                if ($this->limit && $itemCount >= $this->limit) break;
                $code = trim((string)($row['A'] ?? $row[1] ?? ''));
                $dateStr = trim((string)($row['B'] ?? $row[2] ?? ''));
                $wh = trim((string)($row['C'] ?? $row[3] ?? ''));
                $prodCode = trim((string)($row['D'] ?? $row[4] ?? ''));
                $prodName = trim((string)($row['E'] ?? $row[5] ?? ''));
                $qty = (float)($row['G'] ?? $row[7] ?? 0);
                $price = $this->parseMoney($row['H'] ?? $row[8] ?? 0);
                $typeRaw = trim((string)($row['J'] ?? $row[10] ?? ''));
                if (!$code) continue;

                $prodId = $this->resolveOrCreateProductForInventory($prodCode, $prodName, $price, $code);
                $branchId = $this->branchMap[$wh] ?? $this->branchMap[self::DEFAULT_BRANCH_NAME] ?? null;
                $lineCode = $code . '-' . ($prodCode ?: md5($prodName)) . '-' . $itemCount;

                if (!$this->dryRun) {
                    $this->safeMirrorInsert('inventory_products', ['code' => $lineCode], [
                        'mongo_id' => bin2hex(random_bytes(12)), 'code' => $lineCode, 'refer_code' => $code,
                        'inventory_voucher_mongo_id' => $code, 'business_date' => $this->parseDate($dateStr),
                        'warehouse_name' => $wh, 'branch_id' => $branchId, 'branch_mongo_id' => $branchId ? (string)$branchId : null,
                        'product_id' => $prodId, 'product_mongo_id' => $prodId ? (string)$prodId : null,
                        'product_code' => $prodCode, 'product_name' => $prodName, 'name' => $prodName, 'qty' => $qty,
                        'unit_price' => $price, 'total_amount' => $qty * $price, 'type' => $typeRaw,
                        'payload' => array_merge(compact('code','lineCode','prodCode','prodName','qty','price'), ['source_row' => $this->sourcePayload('inv_items', $i, $row)]),
                    ]);
                }
                $itemCount++;
            }
        } catch (Throwable $e) {
            $this->log('Inventory items warning: ' . $e->getMessage());
        }
        $this->log("Inventory items loaded: $itemCount");
        $this->stats['inserted']['inventory_products'] = $itemCount;
    }


    private function importWarehouseTransfers(string $path): void
    {
        $spreadsheet = IOFactory::load($path);
        $sheet = $spreadsheet->getActiveSheet();
        $rows = $sheet->toArray(null, true, true, true);

        $count = 0;
        foreach ($rows as $idx => $row) {
            if ($idx == 1) continue;
            if ($this->limit && $count >= $this->limit) break;

            $code = trim((string)($row['A'] ?? $row[1] ?? ''));
            if ($code === '') continue;

            $date = $this->parseDate($row['B'] ?? $row[2] ?? null);
            $direction = trim((string)($row['C'] ?? $row[3] ?? ''));
            $spCount = (int)($row['D'] ?? $row[4] ?? 0);
            $qty = (float)($row['E'] ?? $row[5] ?? 0);
            $creator = trim((string)($row['F'] ?? $row[6] ?? ''));
            $statusLabel = trim((string)($row['G'] ?? $row[7] ?? ''));
            $note = trim((string)($row['H'] ?? $row[8] ?? ''));

            [$sourceName, $destinationName] = array_pad(
                preg_split('/\s*(?:→|->|=>|-->|—>|-)\s*/u', $direction, 2),
                2,
                null
            );
            $sourceName = trim((string)$sourceName);
            $destinationName = trim((string)$destinationName);

            $sourceBranch = $this->resolveBranchByName($sourceName);
            $destinationBranch = $this->resolveBranchByName($destinationName);
            $status = $this->transferStatusFromLabel($statusLabel);
            $businessDate = $date?->copy()->startOfDay();
            $createdAt = $businessDate?->copy();
            $mongoId = substr(md5('legacy-transfer|' . $code), 0, 24);
            $lineQty = $qty > 0 ? $qty : max($spCount, 0);
            $lineCount = max($spCount, 1);
            $lines = [[
                '_id' => $mongoId . '-summary',
                'productId' => null,
                'productCode' => null,
                'productName' => 'Tổng hợp từ file Đơn chuyển kho',
                'unit' => '',
                'requestedQuantity' => $lineQty,
                'dispatchedQuantity' => $lineQty,
                'receivedQuantity' => $lineQty,
                'lockedQuantity' => 0,
                'note' => $spCount > 0 ? ('Số SP: ' . $spCount) : '',
            ]];

            $payload = [
                '_id' => $mongoId,
                'id' => $code,
                'code' => $code,
                'date' => $date?->toDateString(),
                'createdAt' => $createdAt?->toIso8601String(),
                'sourceWarehouseId' => $sourceBranch?->mongo_id,
                'destinationWarehouseId' => $destinationBranch?->mongo_id,
                'sourceWarehouseName' => $sourceName ?: $sourceBranch?->name,
                'destinationWarehouseName' => $destinationName ?: $destinationBranch?->name,
                'spCount' => $spCount,
                'qty' => $qty,
                'creator' => $creator,
                'status' => $status,
                'statusLabel' => $statusLabel ?: null,
                'kind' => 'NORMAL_TRANSFER',
                'note' => $note,
                'lines' => $lines,
                'source_row' => $this->sourcePayload('warehouse_transfers', $idx, $row),
                'legacy_import' => true,
                'legacy_export_file' => 'Đơn chuyển kho.xlsx',
            ];

            if (!$this->dryRun) {
                $this->safeMirrorInsert('warehouse_transfers', ['code' => $code], [
                    'mongo_id' => $mongoId,
                    'code' => $code,
                    'name' => $code,
                    'status' => $status,
                    'type' => 'NORMAL_TRANSFER',
                    'amount' => $qty,
                    'total' => $qty,
                    'business_date' => $businessDate,
                    'from_branch_mongo_id' => $sourceBranch?->mongo_id,
                    'to_branch_mongo_id' => $destinationBranch?->mongo_id,
                    'from_branch_id' => $sourceBranch?->id,
                    'to_branch_id' => $destinationBranch?->id,
                    'date_send' => $date?->toDateString(),
                    'date_take' => $status === 'COMPLETED' ? $date?->toDateString() : null,
                    'payload' => $payload,
                    'created_at' => $createdAt ?? now(),
                    'updated_at' => now(),
                ]);
            }
            $count++;
        }

        $this->log("Warehouse transfers loaded: $count");
        $this->stats['inserted']['warehouse_transfers'] = $count;
    }

    private function resolveBranchByName(?string $name): ?Branch
    {
        $name = trim((string)$name);
        if ($name === '') {
            return null;
        }

        $normalized = Str::lower(Str::ascii($name));
        $branch = Branch::query()->get()->first(function (Branch $branch) use ($normalized): bool {
            return Str::lower(Str::ascii((string)$branch->name)) === $normalized;
        });

        if ($branch) {
            return $branch;
        }

        $code = Str::upper(Str::substr(Str::slug($name, ''), 0, 12)) ?: null;
        return $this->createBranchIfNotExists($name, $code ?: Str::upper(Str::substr(md5($name), 0, 8)));
    }

    private function transferStatusFromLabel(string $label): string
    {
        $normalized = Str::lower(Str::ascii(trim($label)));
        return match (true) {
            str_contains($normalized, 'hoan thanh') => 'COMPLETED',
            str_contains($normalized, 'dang chuyen') => 'IN_TRANSIT',
            str_contains($normalized, 'huy') => 'CANCELLED',
            str_contains($normalized, 'tra') => 'RETURNED',
            str_contains($normalized, 'duyet'), str_contains($normalized, 'xac nhan') => 'DRAFT',
            default => 'DRAFT',
        };
    }

    private function importProductLogs(string $path): void
    {
        $spreadsheet = IOFactory::load($path);
        $sheet = $spreadsheet->getActiveSheet();
        $rows = $sheet->toArray(null, true, true, true);

        $count = 0;
        foreach ($rows as $idx => $row) {
            if ($idx == 1) continue;
            if ($this->limit && $count >= $this->limit) break;

            $code = trim((string)($row['A'] ?? $row[1] ?? ''));
            $name = trim((string)($row['B'] ?? $row[2] ?? ''));
            $logType = trim((string)($row['C'] ?? $row[3] ?? ''));
            $logAction = trim((string)($row['D'] ?? $row[4] ?? ''));
            $actor = trim((string)($row['E'] ?? $row[5] ?? ''));
            $timeStr = trim((string)($row['F'] ?? $row[6] ?? ''));
            if (!$code) continue;

            $prodId = $this->resolveOrCreateProductForLog($code, $name);

            if (!$this->dryRun) {
                $uniqueCode = $code . '-' . $count;
                $this->safeMirrorInsert('product_edit_logs', ['code' => $uniqueCode], [
                    'mongo_id' => bin2hex(random_bytes(12)), 'code' => $uniqueCode, 'product_code' => $code,
                    'product_name' => $name, 'product_id' => $prodId, 'product_mongo_id' => $prodId ? (string)$prodId : null,
                    'created_by' => $actor, 'business_date' => $this->parseDateTime($timeStr),
                    'payload' => ['productCode' => $code, 'logType' => $logType, 'logAction' => $logAction, 'actor' => $actor, 'source_row' => $this->sourcePayload('product_logs', $idx, $row)],
                ]);
            }
            $count++;
        }
        $this->log("Product edit logs loaded: $count");
        $this->stats['inserted']['product_edit_logs'] = $count;
    }

    private function postProcess(): void
    {
        if ($this->dryRun) {
            $this->log('[dry] post-process would sync products.qty');
            return;
        }
        $products = Product::with('stocks')->get();
        $synced = 0;
        foreach ($products as $p) {
            $sum = $p->stocks->sum('qty');
            if ($sum > 0 && abs($p->qty - $sum) > 0.01) {
                $p->update(['qty' => $sum]);
                $synced++;
            }
        }
        $this->log("Post-process: synced $synced products qty from stocks.");
    }

    private function addOrphan(string $type, string $identifier, string $reason, array $sample = []): void
    {
        $this->stats['orphans']++;
        $this->orphanRows[] = ['type' => $type, 'id' => $identifier, 'reason' => $reason, 'sample' => $sample];
        $this->log("ORPHAN[$type]: $identifier - $reason");
    }

    private function resolveProductFuzzy(string $nameOrCode): ?array
    {
        $code = trim($nameOrCode);
        if (isset($this->productCodeMap[$code])) return ['id' => $this->productCodeMap[$code], 'method' => 'code'];
        if (isset($this->productBarcodeMap[$code])) return ['id' => $this->productBarcodeMap[$code], 'method' => 'barcode'];

        $lower = mb_strtolower($code);

        // Exact name match
        if (isset($this->productNameMap[$lower])) {
            return ['id' => $this->productNameMap[$lower], 'method' => 'name-exact'];
        }

        // Improved fuzzy: contains + similar_text
        $bestId = null;
        $bestScore = 0;
        foreach ($this->productNameMap as $pname => $pid) {
            if (mb_strpos($pname, $lower) !== false || mb_strpos($lower, $pname) !== false) {
                $this->stats['warnings']++;
                return ['id' => $pid, 'method' => 'fuzzy-contains'];
            }
            similar_text($lower, $pname, $percent);
            if ($percent > $bestScore && $percent > 65) {
                $bestScore = $percent;
                $bestId = $pid;
            }
        }
        if ($bestId) {
            $this->stats['warnings']++;
            $this->log("FUZZY product match ($bestScore%): '$nameOrCode'");
            return ['id' => $bestId, 'method' => 'fuzzy-similar'];
        }

        return null;
    }

    private function resolveOrCreateCustomerForSale(string $name, string $phone): ?int
    {
        if ($phone && isset($this->customerPhoneMap[$phone])) {
            return $this->customerPhoneMap[$phone];
        }

        $lowerName = mb_strtolower(trim($name));
        if ($lowerName && isset($this->customerNameMap[$lowerName])) {
            return $this->customerNameMap[$lowerName];
        }

        if ($lowerName === '' && $phone === '') {
            return null;
        }

        $lookupKey = $phone ?: 'LEG-CUS-' . substr(md5($lowerName), 0, 10);
        if ($this->dryRun) {
            $id = 400000 + count($this->customerNameMap);
        } else {
            $customer = Customer::firstOrCreate(
                ['code' => $lookupKey],
                [
                    'mongo_id' => bin2hex(random_bytes(12)),
                    'type' => 'person',
                    'name' => $name ?: 'Khách lẻ',
                    'phone' => $phone ?: null,
                    'status' => 'active',
                    'note' => 'Legacy import placeholder: sale without customer master row',
                    'tags' => ['legacy_placeholder'],
                ]
            );
            $id = $customer->id;
        }

        if ($phone) $this->customerPhoneMap[$phone] = $id;
        if ($lowerName) $this->customerNameMap[$lowerName] = $id;
        $this->addOrphan('customer-created-from-sale', $name ?: $phone, 'auto-created placeholder to preserve sale customer link', ['phone' => $phone]);

        return $id;
    }

    private function resolveOrCreateProductForInventory(string $code, string $name, float $unitPrice, string $voucherCode): int
    {
        if ($code && isset($this->productCodeMap[$code])) {
            return $this->productCodeMap[$code];
        }

        $matchValue = $code ?: $name;
        if ($matchValue) {
            $res = $this->resolveProductFuzzy($matchValue);
            if ($res && !empty($res['id'])) {
                return $res['id'];
            }
        }

        $displayName = $name ?: ('Legacy inventory item ' . $voucherCode);
        return $this->createLegacyPlaceholderProduct($code, $displayName, $unitPrice, 'inventory item without product master');
    }

    private function resolveOrCreateProductForLog(string $code, string $name): int
    {
        if ($code && isset($this->productCodeMap[$code])) {
            return $this->productCodeMap[$code];
        }

        $matchValue = $code ?: $name;
        if ($matchValue) {
            $res = $this->resolveProductFuzzy($matchValue);
            if ($res && !empty($res['id'])) {
                return $res['id'];
            }
        }

        $displayName = $name ?: ('Legacy product log ' . ($code ?: Str::uuid()->toString()));
        return $this->createLegacyPlaceholderProduct($code, $displayName, 0, 'product log without product master');
    }

    private function createLegacyPlaceholderProduct(string $code, string $name, float $unitPrice, string $reason): int
    {
        $lookup = $code ?: 'LEG-' . substr(md5(mb_strtolower($name)), 0, 10);
        if (isset($this->productCodeMap[$lookup])) {
            return $this->productCodeMap[$lookup];
        }

        if ($this->dryRun) {
            $id = 500000 + count($this->productCodeMap);
        } else {
            $product = Product::firstOrCreate(
                ['code' => $lookup],
                [
                    'mongo_id' => bin2hex(random_bytes(12)),
                    'name' => $name,
                    'price' => $unitPrice > 0 ? $unitPrice : 0,
                    'cost' => 0,
                    'wholesale_price' => 0,
                    'qty' => 0,
                    'allows_sale' => true,
                    'type' => 'product',
                    'status' => 'Legacy placeholder',
                    'category_name' => 'Legacy Unmatched',
                    'extra' => ['legacy_placeholder_reason' => $reason],
                ]
            );
            $id = $product->id;
        }

        $this->productCodeMap[$lookup] = $id;
        $this->productNameMap[mb_strtolower($name)] = $id;
        $this->addOrphan('product-created-placeholder', $lookup, $reason, ['name' => $name]);

        return $id;
    }

    /**
     * Resolve product for sale line. Create placeholder if no match to avoid losing data.
     */
    private function resolveOrCreateProductForSale(string $prodName, float $unitPrice): int
    {
        $res = $this->resolveProductFuzzy($prodName);
        if ($res && !empty($res['id'])) {
            return $res['id'];
        }

        $lower = mb_strtolower(trim($prodName));
        if (isset($this->createdUnmatchedProducts[$lower])) {
            return $this->createdUnmatchedProducts[$lower];
        }

        if ($this->dryRun) {
            $id = 300000 + count($this->createdUnmatchedProducts);
            $this->createdUnmatchedProducts[$lower] = $id;
            $this->productNameMap[$lower] = $id;
            $this->addOrphan('product-created-from-sale', $prodName, 'dry-run placeholder to preserve sale line', ['price' => $unitPrice]);
            return $id;
        }

        $safeCode = 'LEG-' . substr(md5($lower), 0, 8);
        $product = Product::firstOrCreate(
            ['name' => $prodName],
            [
                'mongo_id' => bin2hex(random_bytes(12)),
                'code' => $safeCode,
                'name' => $prodName,
                'price' => $unitPrice > 0 ? $unitPrice : 0,
                'cost' => 0,
                'wholesale_price' => 0,
                'allows_sale' => true,
                'type' => 'product',
                'status' => 'Legacy (auto-created)',
                'category_name' => 'Legacy Unmatched',
            ]
        );

        $this->createdUnmatchedProducts[$lower] = $product->id;
        $this->productCodeMap[$safeCode] = $product->id;
        $this->productNameMap[$lower] = $product->id;

        $this->addOrphan('product-created-from-sale', $prodName, 'auto-created placeholder to preserve sale line', ['price' => $unitPrice]);
        return $product->id;
    }

    private function normalizePhone($val): string
    {
        $p = preg_replace('/\D+/', '', (string)$val);
        if (strlen($p) >= 10 && str_starts_with($p, '84')) {
            $p = '0' . substr($p, 2);
        }
        return $p;
    }

    private function parseMoney($val): float
    {
        if (is_numeric($val)) return (float)$val;
        $s = preg_replace('/[^\d\.\,]/', '', (string)$val);
        if ($s === '') return 0.0;
        $s = str_replace('.', '', $s);
        $s = str_replace(',', '.', $s);
        return (float)$s;
    }

    private function sourcePayload(string $source, int|string $rowNumber, array $row): array
    {
        $values = [];
        foreach ($row as $column => $value) {
            $columnName = is_string($column) ? $column : (string)$column;
            $values[$columnName] = $value;
        }

        return [
            'source' => $source,
            'row_number' => (int)$rowNumber,
            'values' => $values,
        ];
    }

    private function parseDate($val): ?Carbon
    {
        if (!$val) return null;
        if (is_numeric($val)) {
            try { return Carbon::instance(\PhpOffice\PhpSpreadsheet\Shared\Date::excelToDateTimeObject((float)$val)); } catch (Throwable $e) {}
        }
        $s = trim((string)$val);
        if ($s === '' || $s === '—' || $s === '-') return null;
        $formats = ['d/m/Y', 'd/m/y', 'j/n/Y', 'j/n/y', 'Y-m-d'];
        foreach ($formats as $f) {
            try { return Carbon::createFromFormat($f, $s); } catch (Throwable $e) {}
        }
        try { return Carbon::parse($s); } catch (Throwable $e) { return null; }
    }

    private function parseDateTime($val): ?Carbon
    {
        if (!$val) return null;
        if (is_numeric($val)) {
            try { return Carbon::instance(\PhpOffice\PhpSpreadsheet\Shared\Date::excelToDateTimeObject((float)$val)); } catch (Throwable $e) {}
        }
        $s = trim((string)$val);
        if ($s === '' || $s === '—' || $s === '-') return null;
        if (preg_match('/(\d{1,2}:\d{2})\s+(\d{1,2}\/\d{1,2}\/\d{4})/', $s, $m)) {
            try { return Carbon::createFromFormat('H:i d/m/Y', $m[1].' '.$m[2]); } catch (Throwable $e) {}
        }
        if (preg_match('/(\d{1,2}:\d{2}:\d{2})\s+(\d{1,2}\/\d{1,2}\/\d{4})/', $s, $m)) {
            try { return Carbon::createFromFormat('H:i:s d/m/Y', $m[1].' '.$m[2]); } catch (Throwable $e) {}
        }
        return $this->parseDate($s);
    }

    private function generateReport(): array
    {
        $reportPath = storage_path('logs/import_report_' . date('Ymd') . '.md');
        $csvPath = storage_path('logs/import_orphans_' . date('Ymd') . '.csv');

        $md = "# Legacy Import Report " . date('Y-m-d H:i') . "\n\n";
        $md .= "DryRun: " . ($this->dryRun ? 'yes' : 'no') . "\n\n";
        $md .= "## Stats\n" . json_encode($this->stats, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n";
        file_put_contents($reportPath, $md);

        if ($this->orphanRows) {
            $fp = fopen($csvPath, 'w');
            fputcsv($fp, ['type', 'id', 'reason', 'sample']);
            foreach ($this->orphanRows as $o) fputcsv($fp, [$o['type'] ?? '', $o['id'] ?? '', $o['reason'] ?? '', json_encode($o['sample'] ?? [])]);
            fclose($fp);
        }

        return ['md' => $reportPath, 'csv' => $this->orphanRows ? $csvPath : null];
    }

    /**
     * Helper to safely insert into mirror tables by only using columns that exist.
     * Returns the model instance (or null in dry-run).
     */
    private function safeMirrorInsert(string $table, array $search, array $values)
    {
        if ($this->dryRun) {
            return null;
        }

        $columns = Schema::getColumnListing($table);
        $filtered = array_intersect_key($values, array_flip($columns));

        if (isset($values['payload']) && !isset($filtered['payload'])) {
            $filtered['payload'] = $values['payload'];
        }

        return (new MirrorRecord())->forTable($table)->updateOrCreate($search, $filtered);
    }
}
