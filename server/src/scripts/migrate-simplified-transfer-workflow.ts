import fs from 'fs';
import os from 'os';
import path from 'path';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { InventoryVoucher, TransferAuditLog, WarehouseTransfer } from '../modules/warehouse/warehouse.models.js';

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const BACKUP = process.argv.includes('--backup') || APPLY;
const NEW_STATUSES = new Set(['DRAFT', 'IN_TRANSIT', 'COMPLETED', 'RETURNED', 'CANCELLED']);
const LEGACY_STATUSES = ['PENDING_REQUEST_APPROVAL', 'APPROVED_TO_DISPATCH', 'PENDING_DISPATCH_APPROVAL', 'PENDING_RECEIPT_APPROVAL', 'REJECTED'];

type VoucherCounts = { exportCount: number; importCount: number; returnCount: number };

function nowStamp() { return new Date().toISOString().replace(/[:.]/g, '-'); }
function backupDir() { return path.join(os.homedir(), 'LadyStars-mongo-backups', `simplified-transfer-${nowStamp()}`); }
function statusCount(items: Array<{ _id: unknown; count: number }>) { return Object.fromEntries(items.map((item) => [String(item._id), item.count])); }
function nextStatus(status: string, counts: VoucherCounts) {
  if (!status) return counts.exportCount > 0 ? 'IN_TRANSIT' : 'DRAFT';
  if (status === 'DRAFT') return 'DRAFT';
  if (status === 'PENDING_REQUEST_APPROVAL') return counts.exportCount === 0 ? 'DRAFT' : null;
  if (status === 'APPROVED_TO_DISPATCH') return counts.exportCount === 0 ? 'DRAFT' : null;
  if (status === 'PENDING_DISPATCH_APPROVAL') return counts.exportCount > 0 ? 'IN_TRANSIT' : 'DRAFT';
  if (status === 'IN_TRANSIT') return counts.exportCount > 0 && counts.importCount === 0 && counts.returnCount === 0 ? 'IN_TRANSIT' : null;
  if (status === 'PENDING_RECEIPT_APPROVAL') return counts.importCount > 0 ? 'COMPLETED' : 'IN_TRANSIT';
  if (status === 'COMPLETED') return 'COMPLETED';
  if (status === 'RETURNED') return 'RETURNED';
  if (status === 'CANCELLED') return 'CANCELLED';
  if (status === 'REJECTED') return 'CANCELLED';
  return null;
}
function inconsistent(status: string, counts: VoucherCounts) {
  if (counts.exportCount > 1 || counts.importCount > 1 || counts.returnCount > 1) return 'DUPLICATE_TRANSFER_VOUCHER';
  if (status === 'COMPLETED' && counts.importCount === 0) return 'COMPLETED_WITHOUT_IMPORT_TRANSFER';
  if (status === 'RETURNED' && counts.returnCount === 0) return 'RETURNED_WITHOUT_RETURN_TRANSFER';
  if (status === 'IN_TRANSIT' && counts.importCount > 0 && counts.returnCount > 0) return 'IN_TRANSIT_WITH_IMPORT_AND_RETURN';
  return '';
}
async function countsForTransfer(transfer: any): Promise<VoucherCounts> {
  const related = [transfer.id, transfer.code, String(transfer._id)].filter(Boolean);
  const vouchers = await InventoryVoucher.find({ $or: [{ transferRequestId: transfer._id }, { relatedVoucher: { $in: related } }, { requestVoucher: { $in: related } }] }).select('type').lean();
  return {
    exportCount: vouchers.filter((v: any) => v.type === 'EXPORT_TRANSFER').length,
    importCount: vouchers.filter((v: any) => v.type === 'IMPORT_TRANSFER').length,
    returnCount: vouchers.filter((v: any) => v.type === 'RETURN_TRANSFER').length,
  };
}
async function writeBackup(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  const [transfers, audits, statusBefore, voucherByType] = await Promise.all([
    WarehouseTransfer.find({}).lean(),
    TransferAuditLog.find({}).lean(),
    WarehouseTransfer.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    InventoryVoucher.aggregate([{ $match: { type: { $in: ['EXPORT_TRANSFER', 'IMPORT_TRANSFER', 'RETURN_TRANSFER'] } } }, { $group: { _id: '$type', count: { $sum: 1 } } }]),
  ]);
  fs.writeFileSync(path.join(dir, 'warehouse-transfers.json'), JSON.stringify(transfers, null, 2));
  fs.writeFileSync(path.join(dir, 'transfer-audit-logs.json'), JSON.stringify(audits, null, 2));
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({ createdAt: new Date().toISOString(), transferCount: transfers.length, auditCount: audits.length, statusBefore: statusCount(statusBefore), voucherByType: statusCount(voucherByType) }, null, 2));
}
async function main() {
  await mongoose.connect(env.mongoUri);
  const backupPath = BACKUP ? backupDir() : '';
  if (backupPath) await writeBackup(backupPath);
  const [beforeAgg, voucherBeforeAgg] = await Promise.all([
    WarehouseTransfer.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    InventoryVoucher.aggregate([{ $match: { type: { $in: ['EXPORT_TRANSFER', 'IMPORT_TRANSFER', 'RETURN_TRANSFER'] } } }, { $group: { _id: '$type', count: { $sum: 1 } } }]),
  ]);
  const transfers = await WarehouseTransfer.find({}).lean();
  const planned: Array<{ id: string; fromStatus: string; toStatus: string }> = [];
  const anomalies: Array<{ id: string; status: string; reason: string; counts: VoucherCounts }> = [];
  for (const transfer of transfers) {
    const status = String((transfer as any).status || '');
    const counts = await countsForTransfer(transfer);
    const anomaly = inconsistent(status, counts);
    const mapped = nextStatus(status, counts);
    if (anomaly || !mapped) { anomalies.push({ id: String((transfer as any).id || (transfer as any)._id), status, reason: anomaly || 'UNSAFE_STATUS_VOUCHER_MAPPING', counts }); continue; }
    if (mapped !== status) planned.push({ id: String((transfer as any)._id), fromStatus: status, toStatus: mapped });
  }
  if (APPLY) {
    for (const item of planned) {
      const transfer = await WarehouseTransfer.findByIdAndUpdate(item.id, { $set: { status: item.toStatus }, $inc: { version: 1 } }, { new: true });
      if (transfer) await TransferAuditLog.create({ transferRequestId: transfer._id, actionType: 'WORKFLOW_MIGRATED', previousStatus: item.fromStatus, nextStatus: item.toStatus, actorRole: 'SYSTEM', reason: 'Simplified warehouse transfer workflow migration', metadata: { migration: 'simplified-transfer-workflow', dryRun: false } });
    }
  }
  const [afterAgg, voucherAfterAgg, oldLeft] = await Promise.all([
    WarehouseTransfer.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    InventoryVoucher.aggregate([{ $match: { type: { $in: ['EXPORT_TRANSFER', 'IMPORT_TRANSFER', 'RETURN_TRANSFER'] } } }, { $group: { _id: '$type', count: { $sum: 1 } } }]),
    WarehouseTransfer.countDocuments({ status: { $nin: [...NEW_STATUSES] } }),
  ]);
  console.log(JSON.stringify({ mode: DRY_RUN ? 'dry-run' : 'apply', backupPath: backupPath || null, beforeStatus: statusCount(beforeAgg), afterStatus: statusCount(afterAgg), plannedCount: planned.length, planned, anomalies, oldStatusLeft: oldLeft, voucherBefore: statusCount(voucherBeforeAgg), voucherAfter: statusCount(voucherAfterAgg), stockChangedDirectly: false }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (err) => { console.error(JSON.stringify({ ok: false, message: err.message || 'Migration failed' })); await mongoose.disconnect().catch(() => undefined); process.exit(1); });
