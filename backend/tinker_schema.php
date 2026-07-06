<?php
require __DIR__.'/vendor/autoload.php';
$app = require __DIR__.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use Illuminate\Support\Facades\Schema;
echo "inventory_checks: ".implode(',', Schema::getColumnListing('inventory_checks')).PHP_EOL;
echo "--- products ---".PHP_EOL;
echo "inventory_check_products: ".implode(',', Schema::getColumnListing('inventory_check_products')).PHP_EOL;
echo "--- vouchers ---".PHP_EOL;
echo "inventory_vouchers: ".implode(',', Schema::getColumnListing('inventory_vouchers')).PHP_EOL;
