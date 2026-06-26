const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.resolve(file), 'utf8');
}

const productList = read('client/src/modules/product/components/ProductList.tsx');
const retail = read('client/src/modules/sales/RetailInvoiceCreatePage.tsx');
const wholesale = read('client/src/modules/sales/WholesaleInvoiceCreatePage.tsx');
const refund = read('client/src/modules/sales/RefundInvoiceCreatePage.tsx');
const transfer = read('client/src/modules/warehouse/WarehouseTransferCreatePage.tsx');
const audit = read('client/src/modules/warehouse/WarehouseAuditCreatePage.tsx');
const importPage = read('client/src/modules/warehouse/ProductImportPage.tsx');
const exportPage = read('client/src/modules/warehouse/ProductExportPage.tsx');
const voucherImport = read('client/src/modules/warehouse/VoucherImportPage.tsx');
const voucherExport = read('client/src/modules/warehouse/VoucherExportPage.tsx');
const scannerHook = read('client/src/core/hooks/productScanner.ts');
const appLayout = read('client/src/core/layout/AppLayout.tsx');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(scannerHook.includes('useProductScanTarget'), 'scanner registry hook missing');
assert(scannerHook.includes('product-scan'), 'scanner custom event missing');
assert(scannerHook.includes('DUPLICATE_LOCK_MS'), 'scanner duplicate lock missing');
assert(scannerHook.includes('resolveProductSearchTarget'), 'scanner target resolver missing');
assert(appLayout.includes('useProductScannerBridge'), 'scanner bridge not mounted');
assert(productList.includes('handleProductListScan'), 'product list scan handler missing');
assert(productList.includes('handleBarcodeScan'), 'barcode workspace scan handler missing');
assert(retail.includes('useProductScanTarget'), 'retail scan target missing');
assert(retail.includes('handleProductScan'), 'retail scan handler missing');
assert(retail.includes('currentUser'), 'retail current user missing');
assert(wholesale.includes('useProductScanTarget'), 'wholesale scan target missing');
assert(refund.includes('useProductScanTarget'), 'refund scan target missing');
assert(transfer.includes('useProductScanTarget'), 'transfer scan target missing');
assert(audit.includes('useProductScanTarget'), 'audit scan target missing');
assert(importPage.includes('useProductScanTarget'), 'import scan target missing');
assert(exportPage.includes('useProductScanTarget'), 'export scan target missing');
assert(voucherImport.includes('useProductScanTarget'), 'voucher import scan target missing');
assert(voucherExport.includes('useProductScanTarget'), 'voucher export scan target missing');
assert(!scannerHook.includes('barcode-print'), 'scanner should not include barcode-print mode');
assert(productList.includes('grid-template-rows'), 'print label grid layout missing');
assert(productList.includes('print-store'), 'print store region missing');
assert(productList.includes('print-barcode'), 'print barcode region missing');

console.log('barcode-scanner-static-check: PASS');
