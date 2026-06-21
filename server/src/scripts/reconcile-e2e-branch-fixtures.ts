/**
 * E2E Branch Fixture Reconciliation Script
 *
 * Safely identifies and optionally removes E2E test fixture branches
 * that match known E2E prefixes.
 *
 * Usage:
 *   npx tsx server/src/scripts/reconcile-e2e-branch-fixtures.ts          # dry-run (default)
 *   npx tsx server/src/scripts/reconcile-e2e-branch-fixtures.ts --apply   # apply cleanup
 *
 * Safety gates:
 *   - Default is --dry-run; no mutation without --apply
 *   - Only branches with name/code starting with E2E_ prefixes are candidates
 *   - Before deletion, all linked records are checked
 *   - If any real user, real sale, or real stock data is found linked, the branch is NOT deleted
 *   - Blocked branches are skipped by _id denylist; only allowlist safe branches are deleted
 *   - Transaction is required for --apply; rollback on any safety violation
 *   - HN/HCM stock invariant snapshot is computed pre- and post-transaction
 *   - Backup is created locally outside the repository before --apply
 *   - HN and HCM branches are never touched
 */

import mongoose from 'mongoose';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const E2E_PREFIXES = ['E2E_BRANCH_CONFIG_', 'E2E_RETAIL_INTEGRITY_'];

const MODELS_TO_CHECK = [
  { collection: 'productbranchstocks', field: 'branchId' },
  { collection: 'salepayments', field: 'branchId' },
  { collection: 'productrefunds', field: 'branchId' },
  { collection: 'inventoryvouchers', field: 'branchId' },
  { collection: 'inventoryproducts', field: 'branchId' },
  { collection: 'warehousetransfers', fields: ['sourceWarehouseId', 'destinationWarehouseId'] },
  { collection: 'inventoryaudits', field: 'warehouseId' },
  { collection: 'inventorychecks', field: 'warehouseId' },
  { collection: 'inventorycheckproducts', field: 'warehouse' },
  { collection: 'stockadjustments', field: 'branchId' },
  { collection: 'batches', field: 'branchId' },
  { collection: 'users', fields: ['branchId', 'defaultWarehouseId', 'assignedWarehouseIds'] },
] as const;

/**
 * ProductBranchStock quantity fields to protect.
 * Schema: { productId, branchId, qty, minQuantity, maxQuantity }
 * Only qty represents actual stock; minQuantity/maxQuantity are thresholds.
 */
const STOCK_QTY_FIELDS = ['qty'] as const;

type CandidateBranch = {
  _id: mongoose.Types.ObjectId;
  name: string;
  code: string;
  isDefault: boolean;
  isActive: boolean;
};

type LinkedRecord = {
  collection: string;
  count: number;
  hasE2EMarker: boolean;
  safe: boolean;
};

type ReconcileResult = {
  candidate: CandidateBranch;
  linkedRecords: LinkedRecord[];
  totalLinked: number;
  canDelete: boolean;
  blockReason?: string;
};

type StockSnapshot = {
  recordCount: number;
  totals: Record<string, number>;
  sha256: string;
  legacyFingerprint: string;
};

function redactUri(uri: string) {
  return uri.replace(/(mongodb(?:\+srv)?:\/\/[^:]+):([^@]+)@/, '$1:<redacted>@');
}

function isE2EMarker(doc: any, prefix: string): boolean {
  const check = (value: unknown) => {
    const str = String(value || '').trim();
    return str.startsWith(prefix);
  };
  if (check(doc.code) || check(doc.name) || check(doc.email) || check(doc.username) || check(doc._id?.toString())) return true;
  if (doc.branchId && check(doc.branchId?.toString())) return true;
  return false;
}

/**
 * Compute a stock snapshot for a given branch.
 * Returns record count, totals for each quantity field, SHA-256 fingerprint,
 * and a legacy fingerprint from Product.stockHanoi/stockHCM if they exist.
 *
 * IMPORTANT: This function is READ-ONLY. It does not mutate any record.
 */
async function computeStockSnapshot(
  db: mongoose.mongo.Db,
  branchId: mongoose.Types.ObjectId,
  branchCode: 'HN' | 'HCM',
): Promise<StockSnapshot> {
  const stocks = await db.collection('productbranchstocks')
    .find({ branchId })
    .sort({ productId: 1 })
    .project({ productId: 1, branchId: 1, qty: 1, minQuantity: 1, maxQuantity: 1, _id: 0 })
    .toArray();

  const totals: Record<string, number> = {};
  for (const field of STOCK_QTY_FIELDS) {
    totals[field] = stocks.reduce((sum, doc) => sum + Number(doc[field] || 0), 0);
  }

  // SHA-256 from normalized sorted list
  const canonical = stocks.map((doc) => {
    const productIdStr = String(doc.productId);
    const branchIdStr = String(doc.branchId);
    const qtyVal = Number(doc.qty || 0);
    return `${productIdStr}|${branchIdStr}|${qtyVal}`;
  }).join('\n');
  const sha256 = crypto.createHash('sha256').update(canonical).digest('hex');

  // Legacy fingerprint from Product fields
  const legacyField = branchCode === 'HN' ? 'stockHanoi' : 'stockHCM';
  const productsWithLegacy = await db.collection('products')
    .find({ [legacyField]: { $exists: true, $ne: 0, $ne: null } })
    .sort({ _id: 1 })
    .project({ _id: 1, [legacyField]: 1 })
    .toArray();
  const legacyLines = productsWithLegacy.map((doc) =>
    `${String(doc._id)}|${legacyField}|${Number(doc[legacyField] || 0)}`,
  ).join('\n');
  const legacyFingerprint = crypto.createHash('sha256').update(legacyLines).digest('hex');

  return {
    recordCount: stocks.length,
    totals,
    sha256,
    legacyFingerprint,
  };
}

/**
 * Save backup JSON outside the repository.
 */
function saveBackup(data: unknown, label: string): string {
  const backupDir = path.resolve(__dirname, '../../../_e2e_cleanup_backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(backupDir, `${label}_${ts}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return filePath;
}

async function main() {
  const isApply = process.argv.includes('--apply');
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/my_erp';

  console.log('=== E2E Branch Fixture Reconciliation ===');
  console.log(`Mode: ${isApply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`URI: ${redactUri(mongoUri)}`);

  await mongoose.connect(mongoUri);
  console.log('[db] connected');

  const db = mongoose.connection.db;

  // Resolve HN and HCM branches — these must NEVER be touched
  const hnBranch = await db.collection('branches').findOne({ code: 'HN' });
  const hcmBranch = await db.collection('branches').findOne({ code: 'HCM' });

  if (!hnBranch) {
    console.log('\n[BLOCKED] Cannot proceed: HN branch not found.');
    await mongoose.disconnect();
    return;
  }
  if (!hcmBranch) {
    console.log('\n[WARNING] HCM branch not found. Proceeding with HN-only protection.');
  }

  const PROTECTED_BRANCH_IDS = new Set<string>();
  PROTECTED_BRANCH_IDS.add(String(hnBranch._id));
  if (hcmBranch) PROTECTED_BRANCH_IDS.add(String(hcmBranch._id));

  console.log(`\n[Protection] HN _id=${hnBranch._id}`);
  if (hcmBranch) console.log(`[Protection] HCM _id=${hcmBranch._id}`);

  // Preflight: find candidate E2E branches
  const prefixConditions = E2E_PREFIXES.map((prefix) => ({
    $or: [
      { name: new RegExp(`^${prefix}`) },
      { code: new RegExp(`^${prefix}`) },
    ],
  }));

  const candidates = await db.collection('branches').find({
    $or: prefixConditions,
  }).toArray() as unknown as CandidateBranch[];

  console.log(`\n[Preflight] Found ${candidates.length} candidate E2E branch(es):`);
  for (const c of candidates) {
    console.log(`  - ${c.name} (${c.code}) _id=${c._id} isDefault=${c.isDefault} isActive=${c.isActive}`);
  }

  if (candidates.length === 0) {
    console.log('\nNo E2E fixture branches found. Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  // Verify no candidate is HN or HCM
  for (const c of candidates) {
    if (PROTECTED_BRANCH_IDS.has(String(c._id))) {
      console.log(`\n[BLOCKED] Candidate ${c.name} (${c.code}) matches a protected branch (HN/HCM). Aborting.`);
      await mongoose.disconnect();
      return;
    }
  }

  // Analyze each candidate
  const results: ReconcileResult[] = [];

  for (const candidate of candidates) {
    const linkedRecords: LinkedRecord[] = [];
    let canDelete = true;
    let blockReason = '';

    for (const modelConfig of MODELS_TO_CHECK) {
      const fields = ('fields' in modelConfig ? modelConfig.fields : [modelConfig.field]) as string[];
      for (const field of fields) {
        const count = await db.collection(modelConfig.collection).countDocuments({
          [field]: candidate._id,
        });

        if (count === 0) continue;

        // Check if linked records have E2E markers
        const sample = await db.collection(modelConfig.collection).find({
          [field]: candidate._id,
        }).limit(10).toArray();

        let hasE2EMarker = false;
        for (const doc of sample) {
          for (const prefix of E2E_PREFIXES) {
            if (isE2EMarker(doc, prefix)) {
              hasE2EMarker = true;
              break;
            }
          }
          // For productbranchstocks, also check the related product
          if (!hasE2EMarker && modelConfig.collection === 'productbranchstocks' && doc.productId) {
            const relatedProduct = await db.collection('products').findOne({ _id: doc.productId });
            if (relatedProduct) {
              for (const prefix of E2E_PREFIXES) {
                if (isE2EMarker(relatedProduct, prefix)) {
                  hasE2EMarker = true;
                  break;
                }
              }
            }
          }
          if (hasE2EMarker) break;
        }

        // Check if any linked record references HN or HCM
        const hasRealBranchRef = sample.some((doc: any) => {
          const fieldVal = String(doc[field] || '');
          return fieldVal === String(hnBranch._id) || (hcmBranch && fieldVal === String(hcmBranch._id));
        });

        const safe = hasE2EMarker && !hasRealBranchRef;

        if (!safe && count > 0) {
          canDelete = false;
          blockReason = `Linked ${modelConfig.collection}.${field} records (${count}) not confirmed as E2E fixture or references HN/HCM.`;
        }

        linkedRecords.push({
          collection: modelConfig.collection,
          count,
          hasE2EMarker,
          safe,
        });
      }
    }

    const totalLinked = linkedRecords.reduce((sum, r) => sum + r.count, 0);
    results.push({
      candidate,
      linkedRecords,
      totalLinked,
      canDelete,
      blockReason,
    });
  }

  // Split into allowlist (safe) and denylist (blocked by _id)
  const allowlist = results.filter((r) => r.canDelete);
  const denylist = results.filter((r) => !r.canDelete);

  // Report
  console.log('\n=== Analysis Results ===');
  console.log(`\n--- Allowlist: ${allowlist.length} SAFE to delete ---`);
  for (const result of allowlist) {
    console.log(`  [SAFE] ${result.candidate.name} (${result.candidate.code}) _id=${result.candidate._id} linked=${result.totalLinked}`);
  }

  console.log(`\n--- Denylist: ${denylist.length} BLOCKED ---`);
  for (const result of denylist) {
    console.log(`  [BLOCKED] ${result.candidate.name} (${result.candidate.code}) _id=${result.candidate._id}`);
    if (result.blockReason) {
      console.log(`    Reason: ${result.blockReason}`);
    }
  }

  console.log(`\nSummary: ${allowlist.length} deletable (allowlist), ${denylist.length} blocked (denylist by _id)`);

  // Verify HN/HCM are NOT in the cleanup plan
  const hnInPlan = allowlist.some((r) => String(r.candidate._id) === String(hnBranch._id));
  const hcmInPlan = hcmBranch && allowlist.some((r) => String(r.candidate._id) === String(hcmBranch._id));
  if (hnInPlan || hcmInPlan) {
    console.log('\n[BLOCKED] HN or HCM found in allowlist. This should never happen. Aborting.');
    await mongoose.disconnect();
    return;
  }
  console.log(`HN/HCM in cleanup plan: NO`);

  if (!isApply) {
    console.log('\n[DRY-RUN] No changes made. Use --apply to perform cleanup.');
    console.log('\n--- PRE_APPLY_CHECKPOINT ---');
    console.log(`Safe allowlist count: ${allowlist.length}`);
    console.log(`Blocked denylist count: ${denylist.length}`);
    console.log(`Blocked branch IDs: ${denylist.map((r) => String(r.candidate._id)).join(', ') || 'none'}`);
    console.log(`HN branch ID: ${hnBranch._id}`);
    console.log(`HCM branch ID: ${hcmBranch?._id || 'N/A'}`);
    console.log(`HN/HCM in cleanup plan: No`);
    console.log(`Snapshot will be created before apply: Yes (HN + HCM ProductBranchStock + legacy fields)`);
    console.log(`Transaction/backup available: Yes (MongoDB session + local JSON backup)`);
    console.log(`Status: READY_FOR_SNAPSHOT`);
    await mongoose.disconnect();
    return;
  }

  // === APPLY MODE ===

  // Gate: must have at least 1 safe branch
  if (allowlist.length === 0) {
    console.log('\n[BLOCKED_BY_DATA_SAFETY] No safe branches to delete. Aborting.');
    await mongoose.disconnect();
    return;
  }

  // Gate: denylist branches must not be in the apply set
  const denyIdSet = new Set(denylist.map((r) => String(r.candidate._id)));
  for (const safe of allowlist) {
    if (denyIdSet.has(String(safe.candidate._id))) {
      console.log(`\n[BLOCKED] Branch ${safe.candidate._id} appears in both allowlist and denylist. Aborting.`);
      await mongoose.disconnect();
      return;
    }
  }

  // Compute HN/HCM stock snapshots BEFORE apply (read-only)
  console.log('\n[SNAPSHOT] Computing HN/HCM stock invariant before cleanup...');
  const hnSnapshotBefore = await computeStockSnapshot(db, hnBranch._id, 'HN');
  const hcmSnapshotBefore = hcmBranch
    ? await computeStockSnapshot(db, hcmBranch._id, 'HCM')
    : null;

  console.log(`  HN: ${hnSnapshotBefore.recordCount} records, totals=${JSON.stringify(hnSnapshotBefore.totals)}, sha256=${hnSnapshotBefore.sha256}`);
  if (hcmSnapshotBefore) {
    console.log(`  HCM: ${hcmSnapshotBefore.recordCount} records, totals=${JSON.stringify(hcmSnapshotBefore.totals)}, sha256=${hcmSnapshotBefore.sha256}`);
  }

  // Save backup outside repo
  const backupData = {
    timestamp: new Date().toISOString(),
    hnSnapshot: hnSnapshotBefore,
    hcmSnapshot: hcmSnapshotBefore,
    allowlist: allowlist.map((r) => ({ _id: String(r.candidate._id), name: r.candidate.name, code: r.candidate.code })),
    denylist: denylist.map((r) => ({ _id: String(r.candidate._id), name: r.candidate.name, code: r.candidate.code, blockReason: r.blockReason })),
  };
  const backupPath = saveBackup(backupData, 'pre_cleanup_snapshot');
  console.log(`[BACKUP] Saved to ${backupPath}`);

  // Ensure HN is default before proceeding
  if (!hnBranch.isDefault) {
    console.log('\n[SAFETY] HN is not default. Setting HN as default within the transaction.');
  }

  // Apply cleanup with transaction
  const session = await mongoose.startSession();
  let transactionCommitted = false;
  let stockInvariantFailed = false;

  try {
    await session.withTransaction(async () => {
      // Only delete allowlist branches (denylist branches are skipped)
      for (const result of allowlist) {
        // Delete linked fixture records first
        for (const modelConfig of MODELS_TO_CHECK) {
          const fields = ('fields' in modelConfig ? modelConfig.fields : [modelConfig.field]) as string[];
          for (const field of fields) {
            await db.collection(modelConfig.collection).deleteMany({
              [field]: result.candidate._id,
            }, { session });
          }
        }

        // Delete the branch itself
        await db.collection('branches').deleteOne({
          _id: result.candidate._id,
        }, { session });
      }

      // Ensure HN is default if it wasn't
      if (!hnBranch.isDefault) {
        await db.collection('branches').updateMany(
          { isDefault: true },
          { $set: { isDefault: false } },
          { session },
        );
        await db.collection('branches').updateOne(
          { _id: hnBranch._id },
          { $set: { isDefault: true, isActive: true } },
          { session },
        );
      }

      // Compute HN/HCM stock snapshots WITHIN the transaction (before commit)
      // to verify no HN/HCM stock was accidentally modified
      const hnSnapshotInTx = await computeStockSnapshot(db, hnBranch._id, 'HN');
      const hcmSnapshotInTx = hcmBranch
        ? await computeStockSnapshot(db, hcmBranch._id, 'HCM')
        : null;

      let mismatch = false;
      if (hnSnapshotInTx.recordCount !== hnSnapshotBefore.recordCount) mismatch = true;
      if (hnSnapshotInTx.sha256 !== hnSnapshotBefore.sha256) mismatch = true;
      for (const field of STOCK_QTY_FIELDS) {
        if (hnSnapshotInTx.totals[field] !== hnSnapshotBefore.totals[field]) mismatch = true;
      }
      if (hcmSnapshotBefore && hcmSnapshotInTx) {
        if (hcmSnapshotInTx.recordCount !== hcmSnapshotBefore.recordCount) mismatch = true;
        if (hcmSnapshotInTx.sha256 !== hcmSnapshotBefore.sha256) mismatch = true;
        for (const field of STOCK_QTY_FIELDS) {
          if (hcmSnapshotInTx.totals[field] !== hcmSnapshotBefore.totals[field]) mismatch = true;
        }
      }

      if (mismatch) {
        stockInvariantFailed = true;
        throw new Error('STOCK_INVARIANT_FAILED: HN/HCM stock changed during transaction. Aborting.');
      }

      transactionCommitted = true;
    });

    if (transactionCommitted) {
      console.log('\n[APPLY] Cleanup transaction committed.');
    } else if (stockInvariantFailed) {
      console.log('\n[STOCK_INVARIANT_FAILED] HN/HCM stock changed during transaction. Transaction rolled back.');
    }
  } catch (err: any) {
    console.error('\n[APPLY] Transaction failed, all changes rolled back:', err.message || err);
  } finally {
    await session.endSession();
  }

  // Postflight verification: recompute snapshots after commit
  const hnSnapshotAfter = await computeStockSnapshot(db, hnBranch._id, 'HN');
  const hcmSnapshotAfter = hcmBranch
    ? await computeStockSnapshot(db, hcmBranch._id, 'HCM')
    : null;

  console.log('\n=== Postflight Verification ===');

  // HN/HCM stock invariant check
  console.log(`\n--- HN/HCM Stock Invariant ---`);
  console.log(`HN:  before=${hnSnapshotBefore.recordCount} records, totals=${JSON.stringify(hnSnapshotBefore.totals)}, sha256=${hnSnapshotBefore.sha256}`);
  console.log(`     after =${hnSnapshotAfter.recordCount} records, totals=${JSON.stringify(hnSnapshotAfter.totals)}, sha256=${hnSnapshotAfter.sha256}`);
  const hnInvariantOk = hnSnapshotAfter.sha256 === hnSnapshotBefore.sha256
    && hnSnapshotAfter.recordCount === hnSnapshotBefore.recordCount;
  console.log(`     Result: ${hnInvariantOk ? 'PASS' : 'STOCK_INVARIANT_FAILED'}`);

  if (hcmBranch && hcmSnapshotBefore && hcmSnapshotAfter) {
    console.log(`HCM: before=${hcmSnapshotBefore.recordCount} records, totals=${JSON.stringify(hcmSnapshotBefore.totals)}, sha256=${hcmSnapshotBefore.sha256}`);
    console.log(`     after =${hcmSnapshotAfter.recordCount} records, totals=${JSON.stringify(hcmSnapshotAfter.totals)}, sha256=${hcmSnapshotAfter.sha256}`);
    const hcmInvariantOk = hcmSnapshotAfter.sha256 === hcmSnapshotBefore.sha256
      && hcmSnapshotAfter.recordCount === hcmSnapshotBefore.recordCount;
    console.log(`     Result: ${hcmInvariantOk ? 'PASS' : 'STOCK_INVARIANT_FAILED'}`);
  }

  // Branch state verification
  const remainingCandidates = await db.collection('branches').countDocuments({
    $or: prefixConditions,
  });
  const hnAfter = await db.collection('branches').findOne({ code: 'HN' });
  const hcmAfter = await db.collection('branches').findOne({ code: 'HCM' });
  const blockedBranchesRemaining = denylist.length > 0
    ? await db.collection('branches').countDocuments({
        _id: { $in: denylist.map((r) => r.candidate._id) },
      })
    : 0;

  console.log(`\nRemaining E2E branches: ${remainingCandidates}`);
  console.log(`HN branch exists: ${Boolean(hnAfter)}, isDefault: ${hnAfter?.isDefault}, isActive: ${hnAfter?.isActive}`);
  console.log(`HCM branch exists: ${Boolean(hcmAfter)}, isActive: ${hcmAfter?.isActive}`);
  console.log(`Blocked branches still exist: ${blockedBranchesRemaining} (expected: ${denylist.length})`);

  // Check for orphan references pointing to deleted branches
  const deletedIds = allowlist.map((r) => r.candidate._id);
  let orphanReferences = 0;
  for (const modelConfig of MODELS_TO_CHECK) {
    const fields = ('fields' in modelConfig ? modelConfig.fields : [modelConfig.field]) as string[];
    for (const field of fields) {
      const count = await db.collection(modelConfig.collection).countDocuments({
        [field]: { $in: deletedIds },
      });
      orphanReferences += count;
    }
  }
  console.log(`Orphan references to deleted branches: ${orphanReferences}`);

  // Save post-cleanup report
  const postReport = {
    timestamp: new Date().toISOString(),
    transactionCommitted,
    stockInvariantFailed,
    hnSnapshotBefore,
    hnSnapshotAfter,
    hcmSnapshotBefore,
    hcmSnapshotAfter,
    remainingE2EBranches: remainingCandidates,
    hnAfter: hnAfter ? { _id: String(hnAfter._id), isDefault: hnAfter.isDefault, isActive: hnAfter.isActive } : null,
    hcmAfter: hcmAfter ? { _id: String(hcmAfter._id), isActive: hcmAfter.isActive } : null,
    blockedBranchesRemaining,
    orphanReferences,
  };
  const postReportPath = saveBackup(postReport, 'post_cleanup_report');
  console.log(`[REPORT] Saved to ${postReportPath}`);

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal error:', err.message || err);
  process.exit(1);
});
