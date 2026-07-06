<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$ctrl = new App\Http\Controllers\Api\MirrorRecordController();
try {
  $resp = $ctrl->show('product-refunds','6a43672a0783ee10d4a57438');
  echo "status=".$resp->getStatusCode()."\n";
  $j = json_decode($resp->getContent(),true);
  echo "paymentId.code = ".($j['paymentId']['code'] ?? 'NULL')."\n";
  echo "paymentId.customerId.name = ".($j['paymentId']['customerId']['name'] ?? 'NULL')."\n";
  echo "paymentId.branchId.name = ".($j['paymentId']['branchId']['name'] ?? 'NULL')."\n";
  echo "items[0].productId.name = ".($j['items'][0]['productId']['name'] ?? 'NULL')."\n";
} catch (\Throwable $e) {
  echo "EXC: ".get_class($e).": ".$e->getMessage()."\n";
}
