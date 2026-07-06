<?php
require __DIR__.'/vendor/autoload.php';
$app = require __DIR__.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use App\Models\MirrorRecord;
$rec = (new MirrorRecord())->forTable('inventory_checks')->newQuery()->orderBy('id')->first();
echo "CODE=".$rec->code." STATUS=".$rec->status." TYPE=".$rec->type.PHP_EOL;
echo "PAYLOAD=".json_encode($rec->payload, JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT).PHP_EOL;
echo "--- products sample ---".PHP_EOL;
$ps = (new MirrorRecord())->forTable('inventory_check_products')->newQuery()->limit(2)->get();
foreach($ps as $p){ echo json_encode($p->payload, JSON_UNESCAPED_UNICODE).PHP_EOL; }
