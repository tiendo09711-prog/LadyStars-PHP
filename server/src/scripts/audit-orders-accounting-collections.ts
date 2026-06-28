/**
 * Dry-run audit for Orders & Accounting MongoDB collections.
 *
 * Default (dry-run): only reads collection names + document counts, prints a
 * verdict table. Does NOT write, drop, or delete anything.
 *
 * --apply: DANGEROUS. Drops ONLY collections verdict == SAFE_TO_DELETE, one by
 * one (never dropDatabase / deleteMany({}) / wildcard). Requires:
 *   - env COLLECTION_CLEANUP_APPLY=I_CONFIRM_COLLECTION_DROP
 *   - env COLLECTION_CLEANUP_BACKUP_PATH set to an off-repo backup location
 *   - an interactive "yes" confirmation on stdin
 * This task does NOT run --apply. Run it manually only after a verified backup.
 *
 * Usage:
 *   npx tsx src/scripts/audit-orders-accounting-collections.ts            # dry-run
 *   npx tsx src/scripts/audit-orders-accounting-collections.ts --apply     # guarded
 */
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';

type Entry = { module: 'Orders' | 'Accounting'; model: string; collection: string };

const ORDERS_COLLECTIONS: Entry[] = [
  { module: 'Orders', model: 'Order', collection: 'orders' },
  { module: 'Orders', model: 'OrderDuplicate', collection: 'orderduplicates' },
  { module: 'Orders', model: 'OrderHandover', collection: 'orderhandovers' },
  { module: 'Orders', model: 'OrderDispute', collection: 'orderdisputes' },
  { module: 'Orders', model: 'OrderCodControl', collection: 'ordercodcontrols' },
  { module: 'Orders', model: 'OrderSource', collection: 'ordersources' },
  { module: 'Orders', model: 'OrderHistory', collection: 'orderhistories' },
];

const ACCOUNTING_COLLECTIONS: Entry[] = [
  { module: 'Accounting', model: 'AccountingType', collection: 'accountingtypes' },
  { module: 'Accounting', model: 'PayPerson', collection: 'paypeople' },
  { module: 'Accounting', model: 'Receipt', collection: 'receipts' },
  { module: 'Accounting', model: 'ExpensePayment', collection: 'expensepayments' },
  { module: 'Accounting', model: 'CashTransaction', collection: 'cashtransactions' },
  { module: 'Accounting', model: 'BankTransaction', collection: 'banktransactions' },
  { module: 'Accounting', model: 'SummaryTransaction', collection: 'summarytransactions' },
  { module: 'Accounting', model: 'CustomerDebtSummary', collection: 'customerdebtsummaries' },
  { module: 'Accounting', model: 'CustomerDebtRecord', collection: 'customerdebtrecords' },
  { module: 'Accounting', model: 'StaffDebtSummary', collection: 'staffdebtsummaries' },
  { module: 'Accounting', model: 'VendorDebtSummary', collection: 'vendordebtsummaries' },
  { module: 'Accounting', model: 'VendorDebtRecord', collection: 'vendordebtrecords' },
  { module: 'Accounting', model: 'LogBookEntry', collection: 'logbookentries' },
  { module: 'Accounting', model: 'InstallmentCollection', collection: 'installmentcollections' },
  { module: 'Accounting', model: 'AccountingTransactionLog', collection: 'accountingtransactionlogs' },
  { module: 'Accounting', model: 'AccountingAccount', collection: 'accountingaccounts' },
  { module: 'Accounting', model: 'InstallmentService', collection: 'installmentservices' },
  { module: 'Accounting', model: 'InstallmentSetting', collection: 'installmentsettings' },
];

// Collections still owned by KEPT modules (product, customer, warehouse, vendor,
// auth, system, reports). If any Orders/Accounting collection
// name collides with one of these it must NOT be dropped.
const KEPT_COLLECTIONS = new Set([
  'users', 'storesettings', 'branches', 'permissions', 'roles', 'menuitems', 'auditlogs',
  'products', 'productbranchstocks', 'categories', 'trademarks', 'shelves', 'batches',
  'salepayments', 'salechannels', 'deliverypartners', 'paymentmethods', 'productrefunds',
  'stockadjustments', 'productlogs', 'producteditlogs', 'retailinvoices', 'wholesaleinvoices',
  'customers', 'customergroups', 'customercareevents', 'customerlevels', 'customercaretypes', 'customercarereasons',
  'inventoryproducts', 'inventoryvouchers', 'warehousetransfers', 'inventorychecks', 'inventorycheckproducts',
  'vendors', 'vendorgroups', 'vendorpurchases', 'vendorrefunds', 'vendortransfers',
  'revenuetime',
]);

type Verdict = 'SAFE_TO_DELETE' | 'SHARED_DO_NOT_DELETE' | 'NEED_REVIEW';

type Row = {
  module: string;
  collection: string;
  model: string;
  exists: boolean;
  docs: number;
  referencedByKept: boolean;
  verdict: Verdict;
};

async function buildRows(db: mongoose.mongo.Db): Promise<Row[]> {
  const existing = new Set(await db.listCollections().toArray().then((cols) => cols.map((c) => c.name)));
  const rows: Row[] = [];
  for (const entry of [...ORDERS_COLLECTIONS, ...ACCOUNTING_COLLECTIONS]) {
    const exists = existing.has(entry.collection);
    let docs = 0;
    if (exists) {
      docs = await db.collection(entry.collection).countDocuments();
    }
    const referencedByKept = KEPT_COLLECTIONS.has(entry.collection);
    let verdict: Verdict;
    if (referencedByKept) {
      verdict = 'SHARED_DO_NOT_DELETE';
    } else if (exists) {
      verdict = 'SAFE_TO_DELETE';
    } else {
      verdict = 'NEED_REVIEW';
    }
    rows.push({
      module: entry.module,
      collection: entry.collection,
      model: entry.model,
      exists,
      docs,
      referencedByKept,
      verdict,
    });
  }
  return rows;
}

function printTable(rows: Row[]): void {
  const header = ['module', 'collection', 'model', 'exists', 'docs', 'refByKept', 'verdict'];
  const cell = (v: unknown, w: number) => String(v).padEnd(w);
  console.log(header.map((h, i) => cell(h, [10, 28, 26, 7, 8, 11, 22][i])).join(' | '));
  console.log('-'.repeat(120));
  for (const r of rows) {
    console.log(
      [r.module, r.collection, r.model, r.exists, r.docs, r.referencedByKept, r.verdict]
        .map((v, i) => cell(v, [10, 28, 26, 7, 8, 11, 22][i]))
        .join(' | '),
    );
  }
  const safe = rows.filter((r) => r.verdict === 'SAFE_TO_DELETE');
  const shared = rows.filter((r) => r.verdict === 'SHARED_DO_NOT_DELETE');
  const review = rows.filter((r) => r.verdict === 'NEED_REVIEW');
  console.log('\nSummary:');
  console.log(`  SAFE_TO_DELETE        : ${safe.length} (total docs: ${safe.reduce((s, r) => s + r.docs, 0)})`);
  console.log(`  SHARED_DO_NOT_DELETE  : ${shared.length}`);
  console.log(`  NEED_REVIEW           : ${review.length}`);
}

async function run() {
  const apply = process.argv.includes('--apply');
  await connectDatabase();
  const db = mongoose.connection.db!;
  const rows = await buildRows(db);
  printTable(rows);

  if (!apply) {
    console.log('\nDry-run only. No data was modified. Run with --apply to drop SAFE_TO_DELETE collections (guarded).');
    await mongoose.disconnect();
    return;
  }

  // --apply: guarded, drops only SAFE_TO_DELETE collections individually.
  const ack = process.env.COLLECTION_CLEANUP_APPLY;
  const backup = process.env.COLLECTION_CLEANUP_BACKUP_PATH;
  if (ack !== 'I_CONFIRM_COLLECTION_DROP' || !backup) {
    console.error('\n[apply] ABORTED. Requires COLLECTION_CLEANUP_APPLY=I_CONFIRM_COLLECTION_DROP and COLLECTION_CLEANUP_BACKUP_PATH. No data modified.');
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`\n[apply] Backup path declared: ${backup}`);
  console.log('[apply] Type "yes" to drop all SAFE_TO_DELETE collections:');
  const answer = await new Promise<string>((resolve) => {
    process.stdin.once('data', (data) => resolve(data.toString().trim().toLowerCase()));
  });
  if (answer !== 'yes') {
    console.error('[apply] Not confirmed. No data modified.');
    await mongoose.disconnect();
    process.exit(1);
  }
  for (const r of rows.filter((r) => r.verdict === 'SAFE_TO_DELETE' && r.exists)) {
    try {
      await db.collection(r.collection).drop();
      console.log(`[apply] dropped ${r.collection}`);
    } catch (err) {
      console.error(`[apply] failed ${r.collection}:`, (err as Error).message);
    }
  }
  console.log('[apply] done.');
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('[audit] failed', err);
  await mongoose.disconnect();
  process.exit(1);
});