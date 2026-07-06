<?php
require __DIR__.'/vendor/autoload.php';
$app = require __DIR__.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use App\Models\MirrorRecord;
$check = (new MirrorRecord())->forTable('inventory_checks')->newQuery()->where('code','4072')->first();
echo "check code=".$check->code." id=".$check->id."\n";
$ps = (new MirrorRecord())->forTable('inventory_check_products')->newQuery()->where('code','4072')->get();
echo "products by code=4072 count=".$ps->count()."\n";
$all = (new MirrorRecord())->forTable('inventory_check_products')->newQuery()->limit(3)->get(['code','product_code','business_date']);
foreach($all as $p){ echo "code=".$p->code." prod=".$p->product_code." date=".optional($p->business_date)->toDateString()."\n"; }
