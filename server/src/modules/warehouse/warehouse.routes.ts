import { Router } from 'express';
import crypto from 'crypto';
import mongoose, { Types } from 'mongoose';
import { crudRoutes } from '../../core/utils/routeFactory.js';
import {
  InventoryVoucher,
  InventoryProduct,
  WarehouseTransfer,
  InventoryCheck,
  InventoryCheckProduct,
  TransferAuditLog
} from './warehouse.models.js';
import { Branch } from '../../core/org/branch.model.js';
import { resolveBranchReference } from '../../core/org/branch.service.js';
import { getAssignedWarehouseIds, isAdminUser } from '../../core/middleware/auth.js';
import { moveProductQty } from '../product/product.service.js';
import {
  Batch,
  Product,
  ProductBranchStock,
  ProductLog,
  ProductRefund,
  SalePayment,
  StockAdjustment
} from '../product/product.models.js';
import multer from 'multer';
import * as xlsx from 'xlsx';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const router = Router();

const TRANSFER_STATUSES = [
  'DRAFT',
  'PENDING_REQUEST_APPROVAL',
  'APPROVED_TO_DISPATCH',
  'PENDING_DISPATCH_APPROVAL',
  'IN_TRANSIT',
  'PENDING_RECEIPT_APPROVAL',
 'PENDING_RETURN_APPROVAL',
 'COMPLETED',
 'RETURN_IN_PROGRESS',
 'RETURNED',
 'REJECTED',
 'CANCELLED',
] as const;

const PUBLIC_TRANSFER_STATUSES = ['DRAFT', 'IN_TRANSIT', 'RETURN_IN_PROGRESS', 'COMPLETED', 'RETURNED', 'CANCELLED'] as const;
const OUTGOING_STATUSES = ['IN_TRANSIT', 'RETURN_IN_PROGRESS'];
const INCOMING_STATUSES = ['IN_TRANSIT', 'RETURN_IN_PROGRESS'];
const LEGACY_APPROVAL_ACTIONS = ['submit', 'approve-request', 'reject-request', 'confirm-dispatch', 'approve-dispatch', 'confirm-receipt', 'reject-receipt', 'approve-receipt', 'approve-return'];
const IMPORT_SESSION_TTL_MS = 30 * 60 * 1000;
const transferImportSessions = new Map<string, { expiresAt: number; createdBy: string; fileName: string; fileHash: string; groups: any[]; summary: any }>();

function objectId(value: unknown) {
  const raw = String(value || '').trim();
  return Types.ObjectId.isValid(raw) ? new Types.ObjectId(raw) : undefined;
}

function normalizeCode(value: unknown) {
  return String(value || '').trim();
}

function isAdminActor(user: any) {
  return isAdminUser(user) || user?.role === 'owner' || user?.isRootOwner === true;
}

function actorWarehouseIds(user: any) {
  return [...getAssignedWarehouseIds(user), ...(Array.isArray(user?.warehouseIds) ? user.warehouseIds : []), ...(Array.isArray(user?.branchIds) ? user.branchIds : [])]
    .filter(Boolean)
    .map((value) => String(value));
}

function actorCanAccessWarehouse(user: any, warehouseId: unknown) {
  if (isAdminActor(user)) return true;
  return actorWarehouseIds(user).includes(String(warehouseId || ''));
}

function actorCanAccessTransfer(user: any, transfer: any) {
  if (isAdminActor(user)) return true;
  return actorCanAccessWarehouse(user, transfer.sourceWarehouseId || transfer.fromWarehouse) || actorCanAccessWarehouse(user, transfer.destinationWarehouseId || transfer.toWarehouse);
}

function actorCanCreateFrom(user: any, warehouseId: unknown) {
  return isAdminActor(user) || actorCanAccessWarehouse(user, warehouseId);
}

function actorName(req: any) {
  return req.user?.name || req.user?.email || 'System';
}

function actorId(req: any) {
  return objectId(req.user?.sub);
}

function makeTransferCode() {
  return `TRF-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function makeVoucherCode(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function transferPublicStatus(status: string) {
  const labels: Record<string, string> = {
    DRAFT: 'Chờ xác nhận xuất',
    PENDING_REQUEST_APPROVAL: 'Chờ xác nhận xuất',
    APPROVED_TO_DISPATCH: 'Chờ xác nhận xuất',
   PENDING_DISPATCH_APPROVAL: 'Đang chuyển',
   IN_TRANSIT: 'Đang chuyển',
   PENDING_RECEIPT_APPROVAL: 'Đang chuyển',
   PENDING_RETURN_APPROVAL: 'Đang chuyển',
   COMPLETED: 'Hoàn thành',
   RETURN_IN_PROGRESS: 'Đang chờ nhận lại hàng trả',
   RETURNED: 'Đã trả hàng / Đã mở khóa',
   REJECTED: 'Đã hủy',
    CANCELLED: 'Đã hủy',
  };
  return labels[status] || status;
}

function statusTone(status: string) {
  if (['COMPLETED', 'RETURNED'].includes(status)) return 'success';
  if (['REJECTED', 'CANCELLED'].includes(status)) return 'danger';
 if (['IN_TRANSIT', 'PENDING_RECEIPT_APPROVAL', 'PENDING_RETURN_APPROVAL'].includes(status)) return 'transfer';
 if (status === 'RETURN_IN_PROGRESS') return 'transfer';
 return 'adjustment';
}

function canCancelTransfer(transfer: any) {
  return String(transfer.status || '') === 'DRAFT';
}
function actorCanConfirmSource(user: any, transfer: any) {
  return isAdminActor(user) || actorCanAccessWarehouse(user, transfer.sourceWarehouseId || transfer.fromWarehouse);
}
function actorCanConfirmDestination(user: any, transfer: any) {
  return isAdminActor(user) || actorCanAccessWarehouse(user, transfer.destinationWarehouseId || transfer.toWarehouse);
}
function actorCanEditDraft(user: any, transfer: any) {
  return String(transfer.status || '') === 'DRAFT' && actorCanConfirmSource(user, transfer);
}

function availableTransferActions(transfer: any, user: any) {
  const status = String(transfer.status || 'DRAFT');
  const canSource = actorCanConfirmSource(user, transfer);
  const canDestination = actorCanConfirmDestination(user, transfer);
  const actions: Array<{ action: string; label: string; needsReason?: boolean; danger?: boolean }> = [];

  if (status === 'DRAFT' && canSource && (transfer.lines || []).length > 0) actions.push({ action: 'confirm-source', label: 'Xác nhận xuất' });
  if (status === 'IN_TRANSIT' && canDestination) actions.push({ action: 'confirm-destination', label: 'Xác nhận nhận hàng' });
  if (status === 'IN_TRANSIT' && canDestination && String(transfer.kind || 'NORMAL_TRANSFER') === 'NORMAL_TRANSFER' && !transfer.returnTransferId) {
    actions.push({ action: 'return', label: 'Báo trả hàng / Không nhận', needsReason: true, danger: true });
  }

  return actions;
}

async function checkMongoTransactionSupport() {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await WarehouseTransfer.findOne({ _id: { $exists: true } }).session(session).lean();
    });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, message: err.message || 'MongoDB transaction is not supported by this connection.' };
  } finally {
    await session.endSession();
  }
}

async function checkWarehouseTransferIndexes() {
  const indexes = await WarehouseTransfer.collection.indexes();
  const indexNames = new Set(indexes.map((index: any) => index.name));
  const required = [
    'status_1_sourceWarehouseId_1_destinationWarehouseId_1_createdAt_-1',
    'sourceExportBillId_1',
    'destinationImportBillId_1',
    'returnBillId_1',
    'importBatchId_1_externalImportCode_1',
  ];
  return {
    ok: required.every((name) => indexNames.has(name)),
    required,
    existing: indexes.map((index: any) => index.name),
    missing: required.filter((name) => !indexNames.has(name)),
  };
}

async function addTransferAudit(transfer: any, req: any, actionType: string, previousStatus: string, nextStatus: string, reason = '', metadata: any = {}, session?: any) {
  await TransferAuditLog.create([{
    transferRequestId: transfer._id,
    actionType,
    previousStatus,
    nextStatus,
    actorId: actorId(req),
    actorRole: isAdminActor(req.user) ? 'ADMIN' : 'EMPLOYEE',
    reason,
    metadata,
  }], { session });
}

async function readTransferOr404(id: string) {
  const transfer = await WarehouseTransfer.findOne({ $or: [{ _id: objectId(id) }, { id }, { code: id }] });
  if (!transfer) {
    const error: any = new Error('Không tìm thấy phiếu chuyển kho.');
    error.status = 404;
    throw error;
  }
  return transfer;
}

async function activeBranchOrError(id: unknown, label: string) {
  const branchId = objectId(id);
  if (!branchId) {
    const error: any = new Error(`${label} không hợp lệ.`);
    error.status = 400;
    throw error;
  }
  const branch = await Branch.findOne({ _id: branchId, isActive: { $ne: false } });
  if (!branch) {
    const error: any = new Error(`${label} không tồn tại hoặc đã ngừng hoạt động.`);
    error.status = 400;
    throw error;
  }
  return branch;
}

function isObjectIdLike(value: unknown): boolean {
  const raw = String(value || '').trim();
  return !!raw && /^[a-f\d]{24}$/i.test(raw) && Types.ObjectId.isValid(raw);
}

async function resolveWarehouseRef(idField: unknown, nameField: unknown, nameStored: unknown, session?: any) {
  if (isObjectIdLike(idField)) return { id: new Types.ObjectId(String(idField)), name: String(nameStored || '') };
  if (isObjectIdLike(nameField)) return { id: new Types.ObjectId(String(nameField)), name: String(nameStored || '') };
  const nameRaw = String(nameField || nameStored || '').trim();
  if (nameRaw) {
    const branch = await Branch.findOne({ $or: [{ name: nameRaw }, { code: nameRaw }] }).session(session || null).select('name code').lean();
    if (branch) return { id: branch._id as any, name: branch.name as string };
  }
  return { id: null, name: String(nameStored || nameField || '') };
}

async function normalizeTransferWarehouseRefs(transfer: any, session?: any) {
  const raw = await WarehouseTransfer.findById(transfer._id).session(session || null).lean();
  const source = await resolveWarehouseRef(raw?.sourceWarehouseId, raw?.fromWarehouse, raw?.sourceWarehouseName, session);
  const destination = await resolveWarehouseRef(raw?.destinationWarehouseId, raw?.toWarehouse, raw?.destinationWarehouseName, session);
  transfer.sourceWarehouseId = source.id;
  transfer.fromWarehouse = source.id;
  if (source.name) transfer.sourceWarehouseName = source.name;
  transfer.destinationWarehouseId = destination.id;
  transfer.toWarehouse = destination.id;
  if (destination.name) transfer.destinationWarehouseName = destination.name;
  if (source.id && destination.id) transfer.warehouse = `${source.name} -> ${destination.name}`;
}

async function buildTransferLines(rawLines: any[]) {
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    const error: any = new Error('Danh sách sản phẩm chuyển kho không được để trống.');
    error.status = 400;
    throw error;
  }
  const seen = new Set<string>();
  const lines = [];
  for (const raw of rawLines) {
    const productId = objectId(raw.productId);
    if (!productId) {
      const error: any = new Error('Sản phẩm không hợp lệ.');
      error.status = 400;
      throw error;
    }
    if (seen.has(String(productId))) {
      const error: any = new Error('Không được lặp cùng một sản phẩm trong một phiếu chuyển kho.');
      error.status = 400;
      throw error;
    }
    seen.add(String(productId));
    const product = await Product.findById(productId).lean();
    if (!product) {
      const error: any = new Error('Sản phẩm không tồn tại.');
      error.status = 400;
      throw error;
    }
    const qty = Number(raw.requestedQuantity ?? raw.quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      const error: any = new Error(`Số lượng yêu cầu của ${product.code || product.name} phải là số nguyên dương.`);
      error.status = 400;
      throw error;
    }
    lines.push({
      productId,
      productCode: product.code,
      productName: product.name,
      barcode: product.barcode || '',
      requestedQuantity: qty,
      approvedQuantity: Number(raw.approvedQuantity || qty),
      dispatchedQuantity: Number(raw.dispatchedQuantity || 0),
      receivedQuantity: Number(raw.receivedQuantity || 0),
      unitCostSnapshot: Number(product.cost || 0),
      unit: raw.unit || product.unit || '',
      batchCode: raw.batchCode || raw.batch || '',
      imei: raw.imei || '',
      note: raw.note || '',
    });
  }
  return lines;
}

function transferTotals(lines: any[]) {
  const qty = lines.reduce((sum, line) => sum + Number(line.requestedQuantity || line.quantity || 0), 0);
  const totalAmount = lines.reduce((sum, line) => sum + Number(line.requestedQuantity || line.quantity || 0) * Number(line.unitCostSnapshot || line.price || 0), 0);
  return { qty, spCount: lines.length, totalAmount };
}

async function assertEnoughSourceStock(transfer: any, session?: any) {
  for (const line of transfer.lines || []) {
    const qty = Number(line.approvedQuantity || line.requestedQuantity || 0);
    const stock = await ProductBranchStock.findOne({ productId: line.productId, branchId: transfer.sourceWarehouseId || transfer.fromWarehouse }).session(session || null);
    const currentQty = Number(stock?.qty || 0);
    const locked = Number(stock?.lockedQuantity || 0);
    const available = currentQty - locked;
    if (available < qty) {
      const error: any = new Error(`Sản phẩm ${line.productCode || line.productName} không đủ tồn khả dụng tại kho nguồn. Tồn hiện tại: ${currentQty}, đang khóa: ${locked}, khả dụng: ${available}, yêu cầu: ${qty}.`);
      error.status = 409;
      throw error;
    }
  }
}

async function moveStockStrict({ productId, branchId, amount, sourceType, sourceId, valueAfter, session }: any) {
  const product = await Product.findById(productId).session(session);
  if (!product || product.type === 'service') return;

  if (amount < 0) {
    const branchStock = await ProductBranchStock.findOneAndUpdate(
      { productId: product._id, branchId, qty: { $gte: Math.abs(amount) } },
      { $inc: { qty: amount }, $setOnInsert: { minQuantity: product.minQuantity, maxQuantity: product.maxQuantity } },
      { new: true, session },
    );
    if (!branchStock) {
      const error: any = new Error(`Tồn kho không đủ cho sản phẩm ${product.code || product.name}.`);
      error.status = 409;
      throw error;
    }
  } else if (branchId) {
    await ProductBranchStock.findOneAndUpdate(
      { productId: product._id, branchId },
      { $inc: { qty: amount }, $setOnInsert: { minQuantity: product.minQuantity, maxQuantity: product.maxQuantity } },
      { upsert: true, new: true, setDefaultsOnInsert: true, session },
    );
  }

  const before = Number(product.qty || 0);
  if (amount < 0 && before < Math.abs(amount)) {
    const error: any = new Error(`Tổng tồn kho không đủ cho sản phẩm ${product.code || product.name}.`);
    error.status = 409;
    throw error;
  }
  product.qty = before + amount;
  await product.save({ session });

  await ProductLog.create([{
    productId: product._id,
    sourceType,
    sourceId,
    amount,
    valueBefore: product.price,
    valueAfter: valueAfter ?? product.price,
    amountBefore: before,
    amountAfter: product.qty,
  }], { session });
}

// Tăng/giảm khóa (lockedQuantity) tại kho nguồn mà KHÔNG đụng qty.
// amount > 0: khóa thêm — yêu cầu available = qty - lockedQuantity >= amount (atomic), fail => 409.
// amount < 0: giải phóng khóa — yêu cầu lockedQuantity >= |amount| (atomic), fail => 500 (lock không đồng bộ).
async function reserveSourceStock({ productId, branchId, amount, session }: any) {
  if (!Number.isFinite(amount) || amount === 0) return;
  const product = await Product.findById(productId).session(session);
  if (!product || product.type === 'service') return;
  if (amount > 0) {
    const updated = await ProductBranchStock.findOneAndUpdate(
      { productId: product._id, branchId, $expr: { $gte: [{ $subtract: [{ $ifNull: ['$qty', 0] }, { $ifNull: ['$lockedQuantity', 0] }] }, amount] } },
      { $inc: { lockedQuantity: amount } },
      { new: true, session },
    );
    if (!updated) {
      const stock = await ProductBranchStock.findOne({ productId: product._id, branchId }).session(session).lean();
      const currentQty = Number(stock?.qty || 0);
      const locked = Number(stock?.lockedQuantity || 0);
      const available = currentQty - locked;
      const error: any = new Error(`Sản phẩm ${product.code || product.name} không đủ tồn khả dụng tại kho nguồn. Tồn hiện tại: ${currentQty}, đang khóa: ${locked}, khả dụng: ${available}, yêu cầu: ${amount}.`);
      error.status = 409;
      throw error;
    }
  } else {
    const release = Math.abs(amount);
    const updated = await ProductBranchStock.findOneAndUpdate(
      { productId: product._id, branchId, lockedQuantity: { $gte: release } },
      { $inc: { lockedQuantity: amount } },
      { new: true, session },
    );
    if (!updated) {
      const error: any = new Error(`Lock không đồng bộ cho sản phẩm ${product.code || product.name} tại kho nguồn.`);
      error.status = 500;
      throw error;
    }
  }
}

// Dùng ở confirm-destination NORMAL: trừ qty + giảm lock cùng lượng (atomic), rồi cộng kho đích bằng moveStockStrict.
async function consumeReservedStock({ productId, branchId, amount, sourceType, sourceId, valueAfter, session }: any) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const product = await Product.findById(productId).session(session);
  if (!product || product.type === 'service') return;
  const consumed = await ProductBranchStock.findOneAndUpdate(
    { productId: product._id, branchId, qty: { $gte: amount }, lockedQuantity: { $gte: amount } },
    { $inc: { qty: -amount, lockedQuantity: -amount }, $setOnInsert: { minQuantity: product.minQuantity, maxQuantity: product.maxQuantity } },
    { upsert: false, new: true, session },
  );
  if (!consumed) {
    const stock = await ProductBranchStock.findOne({ productId: product._id, branchId }).session(session).lean();
    const currentQty = Number(stock?.qty || 0);
    const locked = Number(stock?.lockedQuantity || 0);
    const available = currentQty - locked;
    const error: any = new Error(`Sản phẩm ${product.code || product.name} không đủ tồn khả dụng để trừ tại kho nguồn. Tồn hiện tại: ${currentQty}, đang khóa: ${locked}, khả dụng: ${available}, yêu cầu: ${amount}.`);
    error.status = 409;
    throw error;
  }
  const before = Number(product.qty || 0);
  product.qty = before - amount;
  await product.save({ session });
  await ProductLog.create([{
    productId: product._id,
    sourceType,
    sourceId,
    amount: -amount,
    valueBefore: product.price,
    valueAfter: valueAfter ?? product.price,
    amountBefore: before,
    amountAfter: product.qty,
  }], { session });
}

// Dùng ở confirm-destination RETURN_OF_TRANSFER: chỉ giải phóng lock của đơn gốc, KHÔNG đụng qty.
async function releaseReservation({ productId, branchId, amount, session }: any) {
  return reserveSourceStock({ productId, branchId, amount, session });
}

async function createTransferVoucher(transfer: any, req: any, kind: 'EXPORT_TRANSFER' | 'IMPORT_TRANSFER' | 'RETURN_TRANSFER', warehouseId: any, warehouseName: string, lines: any[], session: any) {
  const isExport = kind === 'EXPORT_TRANSFER';
  const voucherId = makeVoucherCode(kind === 'EXPORT_TRANSFER' ? 'PXCK' : kind === 'IMPORT_TRANSFER' ? 'PNCK' : 'PNHT');
  const totalQty = lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const totalAmount = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.price || 0), 0);
  const [voucher] = await InventoryVoucher.create([{
    voucherId,
    date: new Date().toISOString(),
    warehouse: warehouseName,
    warehouseCode: String(warehouseId),
    type: kind,
    relatedVoucher: transfer.id,
    requestVoucher: transfer.id,
    spCount: lines.length,
    qty: totalQty,
    totalAmount,
    creator: actorName(req),
    note: `${kind} từ phiếu chuyển kho ${transfer.id}`,
    transferRequestId: transfer._id,
    transferRequestCode: transfer.id,
  }], { session });

  for (const line of lines) {
    await InventoryProduct.create([{
      id: `${kind}-${transfer.id}-${line.productCode || line.productId}`,
      voucherId,
      date: new Date().toISOString(),
      warehouse: warehouseName,
      productCode: line.productCode || '',
      productName: line.productName || '',
      barcode: line.barcode || '',
      type: kind,
      importQty: isExport ? 0 : Number(line.quantity || 0),
      exportQty: isExport ? Number(line.quantity || 0) : 0,
      price: Number(line.price || 0),
      cost: Number(line.price || 0),
      totalAmount: Number(line.quantity || 0) * Number(line.price || 0),
      creator: actorName(req),
      unit: line.unit || '',
      batch: line.batchCode || '',
      imei: line.imei || '',
      note: line.note || '',
      transferRequestId: transfer._id,
      transferRequestCode: transfer.id,
    }], { session });
  }
  return voucher;
}

const transactionTypes = [
  { value: 'IMPORT', label: 'Nhập kho' },
  { value: 'EXPORT', label: 'Xuất kho' },
  { value: 'TRANSFER', label: 'Chuyển kho' },
  { value: 'ADJUSTMENT', label: 'Điều chỉnh kho' },
];

const transactionKinds = [
  { value: 'SUPPLIER_IMPORT', label: 'Nhập nhà cung cấp' },
  { value: 'CREATE_PRODUCT_IMPORT', label: 'Nhập khi tạo sản phẩm' },
  { value: 'MANUAL_IMPORT', label: 'Nhập kho thủ công' },
  { value: 'MANUAL_EXPORT', label: 'Xuất kho thủ công' },
  { value: 'RETAIL_SALE', label: 'Xuất bán lẻ' },
  { value: 'WHOLESALE_SALE', label: 'Xuất bán sỉ' },
  { value: 'RETAIL_REFUND', label: 'Khách trả hàng bán lẻ' },
  { value: 'WHOLESALE_REFUND', label: 'Khách trả hàng bán sỉ' },
  { value: 'TRANSFER', label: 'Chuyển kho' },
  { value: 'STOCK_ADJUSTMENT', label: 'Điều chỉnh kho' },
  { value: 'SALE_CANCEL', label: 'Hoàn tồn do hủy bán hàng' },
];

function asNumber(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asDate(value: any) {
  const parsed = parseExcelDate(value);
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : undefined;
}

function isoDate(value: any) {
  return asDate(value)?.toISOString() || '';
}

function normalizeText(value: any) {
  return String(value || '').trim().toLocaleLowerCase('vi-VN');
}

function kindLabel(kind: string) {
  if (kind === 'INVENTORY_AUDIT_IMPORT') return 'Nhập bù trừ kiểm kho';
  if (kind === 'INVENTORY_AUDIT_EXPORT') return 'Xuất bù trừ kiểm kho';
  return transactionKinds.find((option) => option.value === kind)?.label || kind;
}

function classifyInventoryVoucher(voucher: any) {
if (['EXPORT_TRANSFER', 'IMPORT_TRANSFER', 'RETURN_TRANSFER', 'INVENTORY_AUDIT_IMPORT', 'INVENTORY_AUDIT_EXPORT'].includes(String(voucher.type || ''))) return String(voucher.type);
  const type = normalizeText(voucher.type);
  const note = normalizeText(voucher.note);
  const supplier = normalizeText(voucher.supplier);

  if (type.includes('bán sỉ')) return 'WHOLESALE_SALE';
  if (type.includes('bán lẻ') || type.includes('bán hàng')) return 'RETAIL_SALE';
  if (type.includes('trả hàng')) return 'RETAIL_REFUND';
  if (type.includes('chuyển kho')) return 'TRANSFER';
  if (note.includes('tạo sản phẩm') || note.includes('tồn kho ban đầu')) return 'CREATE_PRODUCT_IMPORT';
  if (type.includes('xuất') || type === 'export') return 'MANUAL_EXPORT';
  if (supplier || type.includes('nhà cung cấp') || type.includes('nhập mua')) return 'SUPPLIER_IMPORT';
  return 'MANUAL_IMPORT';
}

function directionForKind(kind: string, quantity = 0) {
  if (kind === 'EXPORT_TRANSFER') return { type: 'EXPORT', label: 'Xuất chuyển kho', tone: 'transfer' };
  if (kind === 'IMPORT_TRANSFER') return { type: 'IMPORT', label: 'Nhập chuyển kho', tone: 'transfer' };
  if (kind === 'RETURN_TRANSFER') return { type: 'IMPORT', label: 'Hoàn tồn chuyển kho', tone: 'refund' };
  if (kind === 'TRANSFER') return { type: 'TRANSFER', label: 'Chuyển kho', tone: 'transfer' };
  if (kind === 'STOCK_ADJUSTMENT') {
    if (quantity > 0) return { type: 'ADJUSTMENT', label: 'Điều chỉnh tăng', tone: 'adjustment-in' };
    if (quantity < 0) return { type: 'ADJUSTMENT', label: 'Điều chỉnh giảm', tone: 'adjustment-out' };
    return { type: 'ADJUSTMENT', label: 'Điều chỉnh', tone: 'adjustment' };
  }
  if (['SUPPLIER_IMPORT', 'CREATE_PRODUCT_IMPORT', 'MANUAL_IMPORT', 'RETAIL_REFUND', 'WHOLESALE_REFUND', 'SALE_CANCEL', 'INVENTORY_AUDIT_IMPORT'].includes(kind)) {
    return { type: 'IMPORT', label: 'Nhập', tone: kind.includes('REFUND') || kind === 'SALE_CANCEL' ? 'refund' : 'import' };
  }
  return { type: 'EXPORT', label: 'Xuất', tone: 'export' };
}

function saleKind(sale: any) {
  return /^BHS-/i.test(String(sale?.code || '')) ? 'WHOLESALE_SALE' : 'RETAIL_SALE';
}

function getName(value: any) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.name || value.code || '';
}

function rowMatchesWarehouse(row: any, warehouseId: string) {
  if (!warehouseId) return true;
  return [row.warehouseId, row.fromWarehouseId, row.toWarehouseId].filter(Boolean).some((value) => String(value) === warehouseId);
}

function rowMatchesDate(row: any, fromDate: any, toDate: any) {
  const date = asDate(row.date);
  if (!date) return !fromDate && !toDate;
  const from = asDate(fromDate);
  const to = asDate(toDate);
  if (from) {
    from.setHours(0, 0, 0, 0);
    if (date < from) return false;
  }
  if (to) {
    to.setHours(23, 59, 59, 999);
    if (date > to) return false;
  }
  return true;
}

async function buildTransactionRows() {
  const [
    branches,
    vouchers,
    inventoryProducts,
    transfers,
    sales,
    refunds,
    adjustments,
  ] = await Promise.all([
    Branch.find({}).lean(),
    InventoryVoucher.find({}).lean(),
    InventoryProduct.find({}).lean(),
    WarehouseTransfer.find({}).lean(),
    SalePayment.find({ status: { $in: ['completed', 'refunded', 'cancelled'] } })
      .populate('branchId', 'name code')
      .populate('customerId', 'name code phone')
      .populate('userId', 'name')
      .populate('authorId', 'name')
      .populate('saleChannelId', 'name')
      .populate('items.productId', 'code name barcode unit price cost')
      .lean(),
    ProductRefund.find({ status: 'completed' })
      .populate({
        path: 'paymentId',
        select: 'code branchId customerId userId authorId',
        populate: [
          { path: 'branchId', select: 'name code' },
          { path: 'customerId', select: 'name code phone' },
          { path: 'userId', select: 'name' },
          { path: 'authorId', select: 'name' },
        ],
      })
      .populate('userId', 'name')
      .populate('userCreatedId', 'name')
      .populate('items.productId', 'code name barcode unit price cost')
      .lean(),
    StockAdjustment.find({ status: 'completed' })
      .populate('branchId', 'name code')
      .populate('userId', 'name')
      .populate('userCreatedId', 'name')
      .populate('items.productId', 'code name barcode unit price cost')
      .lean(),
  ]);

  const branchById = new Map(branches.map((branch: any) => [String(branch._id), branch]));
  const branchByName = new Map(branches.map((branch: any) => [normalizeText(branch.name), branch]));
  const inventoryItemsByVoucher = new Map<string, any[]>();
  for (const item of inventoryProducts) {
    const key = String(item.voucherId || '');
    if (!inventoryItemsByVoucher.has(key)) inventoryItemsByVoucher.set(key, []);
    inventoryItemsByVoucher.get(key)!.push(item);
  }

  const transferProductIds = transfers.flatMap((transfer: any) =>
    Array.isArray(transfer.lines) ? transfer.lines.map((line: any) => line.productId).filter(Boolean) : [],
  );
  const transferProducts = transferProductIds.length
    ? await Product.find({ _id: { $in: transferProductIds } }).select('code name barcode unit price cost').lean()
    : [];
  const productById = new Map(transferProducts.map((product: any) => [String(product._id), product]));

  const bills: any[] = [];
  const items: any[] = [];

  for (const voucher of vouchers) {
    const kind = classifyInventoryVoucher(voucher);
    if (['RETAIL_SALE', 'WHOLESALE_SALE', 'RETAIL_REFUND', 'WHOLESALE_REFUND'].includes(kind)) continue;
    if (kind === 'TRANSFER' && !(voucher as any).transferRequestId) continue;
    const voucherItems = inventoryItemsByVoucher.get(String(voucher.voucherId || '')) || [];
    const direction = directionForKind(kind);
    const branch = branchByName.get(normalizeText(voucher.warehouse));
    const totalQuantity = voucherItems.reduce((sum, item) => sum + asNumber(item.importQty || item.exportQty), 0);
    const totalAmount = voucherItems.reduce((sum, item) => sum + asNumber(item.totalAmount || item.amount), 0);
    const canDelete = ['SUPPLIER_IMPORT', 'MANUAL_IMPORT', 'MANUAL_EXPORT'].includes(kind) && voucherItems.length > 0;

    bills.push({
      rowKey: `inventory-voucher:${voucher._id}`,
      source: 'inventory-voucher',
      sourceId: String(voucher._id),
      code: voucher.voucherId,
      date: isoDate(voucher.date || voucher.createdAt),
      warehouseId: branch ? String(branch._id) : '',
      warehouseName: voucher.warehouse || branch?.name || '',
      fromWarehouseId: '',
      fromWarehouseName: '',
      toWarehouseId: '',
      toWarehouseName: '',
      type: direction.type,
      kind,
      kindLabel: kindLabel(kind),
      sourceModule: kind === 'CREATE_PRODUCT_IMPORT' ? 'PRODUCT' : 'WAREHOUSE',
      totalProductLines: asNumber(voucher.spCount) || voucherItems.length,
      totalQuantity: asNumber(voucher.qty) || totalQuantity,
      totalAmount: asNumber(voucher.totalAmount) || totalAmount,
      createdByName: voucher.creator || '',
      customerName: voucher.customerPhone || '',
      note: voucher.note || '',
      status: 'COMPLETED',
      directionLabel: direction.label,
      directionTone: direction.tone,
      canDelete,
    });

    for (const item of voucherItems) {
      const quantity = asNumber(item.importQty || item.exportQty);
      items.push({
        rowKey: `inventory-product:${item._id}`,
        source: 'inventory-voucher',
        sourceId: String(voucher._id),
        itemSourceId: String(item._id),
        billCode: voucher.voucherId,
        date: isoDate(item.date || voucher.date || item.createdAt),
        warehouseId: branch ? String(branch._id) : '',
        warehouseName: item.warehouse || voucher.warehouse || '',
        fromWarehouseId: '',
        fromWarehouseName: '',
        toWarehouseId: '',
        toWarehouseName: '',
        productId: '',
        productCode: item.productCode || '',
        productName: item.productName || '',
        barcode: item.barcode || '',
        imei: item.imei || '',
        quantity,
        unitPrice: asNumber(item.price),
        totalAmount: asNumber(item.totalAmount || item.amount) || quantity * asNumber(item.price),
        type: direction.type,
        kind,
        kindLabel: kindLabel(kind),
        sourceModule: kind === 'CREATE_PRODUCT_IMPORT' ? 'PRODUCT' : 'WAREHOUSE',
        note: item.note || voucher.note || '',
        directionLabel: direction.label,
        directionTone: direction.tone,
        canDelete: false,
      });
    }
  }

  for (const rawTransfer of transfers) {
    const transfer = rawTransfer as any;
    const fromBranch = branchById.get(String(transfer.fromWarehouse || ''));
    const toBranch = branchById.get(String(transfer.toWarehouse || ''));
    const lines = Array.isArray(transfer.lines) ? transfer.lines : [];
    const direction = directionForKind('TRANSFER');
    const totalQuantity = lines.reduce((sum: number, line: any) => sum + asNumber(line.quantity), 0);

    bills.push({
      rowKey: `transfer:${transfer._id}`,
      source: 'transfer',
      sourceId: String(transfer._id),
      code: transfer.id,
      date: isoDate(transfer.date || transfer.createdAt),
      warehouseId: '',
      warehouseName: transfer.warehouse || '',
      fromWarehouseId: String(transfer.fromWarehouse || ''),
      fromWarehouseName: fromBranch?.name || getName(transfer.fromWarehouse),
      toWarehouseId: String(transfer.toWarehouse || ''),
      toWarehouseName: toBranch?.name || getName(transfer.toWarehouse),
      type: direction.type,
      kind: 'TRANSFER',
      kindLabel: kindLabel('TRANSFER'),
      sourceModule: 'WAREHOUSE_TRANSFER',
      totalProductLines: asNumber(transfer.spCount) || lines.length,
      totalQuantity: asNumber(transfer.qty) || totalQuantity,
      totalAmount: asNumber(transfer.totalAmount),
      createdByName: transfer.creator || '',
      customerName: '',
      note: transfer.note || '',
      status: Array.isArray(transfer.tabs) && transfer.tabs.includes('draft') ? 'DRAFT' : 'COMPLETED',
      directionLabel: direction.label,
      directionTone: direction.tone,
      canDelete: false,
    });

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const product = productById.get(String(line.productId || ''));
      const quantity = asNumber(line.quantity);
      const unitPrice = asNumber(line.price || product?.cost);
      items.push({
        rowKey: `transfer-item:${transfer._id}:${index}`,
        source: 'transfer',
        sourceId: String(transfer._id),
        itemSourceId: `${transfer._id}:${index}`,
        billCode: transfer.id,
        date: isoDate(transfer.date || transfer.createdAt),
        warehouseId: '',
        warehouseName: '',
        fromWarehouseId: String(transfer.fromWarehouse || ''),
        fromWarehouseName: fromBranch?.name || '',
        toWarehouseId: String(transfer.toWarehouse || ''),
        toWarehouseName: toBranch?.name || '',
        productId: String(product?._id || line.productId || ''),
        productCode: product?.code || '',
        productName: product?.name || line.productName || '',
        barcode: product?.barcode || '',
        imei: line.imei || '',
        quantity,
        unitPrice,
        totalAmount: quantity * unitPrice,
        type: direction.type,
        kind: 'TRANSFER',
        kindLabel: kindLabel('TRANSFER'),
        sourceModule: 'WAREHOUSE_TRANSFER',
        note: line.note || transfer.note || '',
        directionLabel: direction.label,
        directionTone: direction.tone,
        canDelete: false,
      });
    }
  }

  for (const sale of sales as any[]) {
    const kind = sale.status === 'cancelled' ? 'SALE_CANCEL' : saleKind(sale);
    const direction = directionForKind(kind);
    const branch = sale.branchId as any;
    const saleItems = Array.isArray(sale.items) ? sale.items : [];
    const totalQuantity = saleItems.reduce((sum: number, item: any) => sum + asNumber(item.amount), 0);

    bills.push({
      rowKey: `sale:${sale._id}`,
      source: 'sale',
      sourceId: String(sale._id),
      code: sale.code,
      date: isoDate(sale.completedAt || sale.createdAt),
      warehouseId: String(branch?._id || ''),
      warehouseName: branch?.name || '',
      fromWarehouseId: '',
      fromWarehouseName: '',
      toWarehouseId: '',
      toWarehouseName: '',
      type: direction.type,
      kind,
      kindLabel: kindLabel(kind),
      sourceModule: kind === 'WHOLESALE_SALE' ? 'WHOLESALE' : kind === 'SALE_CANCEL' ? 'SALE_CANCEL' : 'RETAIL',
      totalProductLines: saleItems.length,
      totalQuantity: asNumber(sale.amountProducts) || totalQuantity,
      totalAmount: asNumber(sale.value),
      createdByName: getName(sale.authorId) || getName(sale.userId),
      customerName: getName(sale.customerId),
      customerPhone: sale.customerId?.phone || '',
      note: sale.note || '',
      status: String(sale.status || '').toUpperCase(),
      directionLabel: direction.label,
      directionTone: direction.tone,
      canDelete: false,
    });

    for (let index = 0; index < saleItems.length; index += 1) {
      const item = saleItems[index];
      const product = item.productId as any;
      const quantity = asNumber(item.amount);
      const unitPrice = asNumber(item.value);
      items.push({
        rowKey: `sale-item:${sale._id}:${index}`,
        source: 'sale',
        sourceId: String(sale._id),
        itemSourceId: `${sale._id}:${index}`,
        billCode: sale.code,
        date: isoDate(sale.completedAt || sale.createdAt),
        warehouseId: String(branch?._id || ''),
        warehouseName: branch?.name || '',
        fromWarehouseId: '',
        fromWarehouseName: '',
        toWarehouseId: '',
        toWarehouseName: '',
        productId: String(product?._id || item.productId || ''),
        productCode: product?.code || '',
        productName: product?.name || '',
        barcode: product?.barcode || '',
        imei: '',
        quantity,
        unitPrice,
        totalAmount: asNumber(item.total) || quantity * unitPrice,
        type: direction.type,
        kind,
        kindLabel: kindLabel(kind),
        sourceModule: kind === 'WHOLESALE_SALE' ? 'WHOLESALE' : kind === 'SALE_CANCEL' ? 'SALE_CANCEL' : 'RETAIL',
        note: item.note || sale.note || '',
        directionLabel: direction.label,
        directionTone: direction.tone,
        canDelete: false,
      });
    }
  }

  for (const refund of refunds as any[]) {
    const payment = refund.paymentId as any;
    const originalKind = saleKind(payment);
    const kind = originalKind === 'WHOLESALE_SALE' ? 'WHOLESALE_REFUND' : 'RETAIL_REFUND';
    const direction = directionForKind(kind);
    const branch = payment?.branchId as any;
    const refundItems = Array.isArray(refund.items) ? refund.items : [];
    const totalQuantity = refundItems.reduce((sum: number, item: any) => sum + asNumber(item.amount), 0);

    bills.push({
      rowKey: `refund:${refund._id}`,
      source: 'refund',
      sourceId: String(refund._id),
      code: refund.code,
      date: isoDate(refund.createdAt),
      warehouseId: String(branch?._id || ''),
      warehouseName: branch?.name || '',
      fromWarehouseId: '',
      fromWarehouseName: '',
      toWarehouseId: '',
      toWarehouseName: '',
      type: direction.type,
      kind,
      kindLabel: kindLabel(kind),
      sourceModule: kind === 'WHOLESALE_REFUND' ? 'WHOLESALE_REFUND' : 'RETAIL_REFUND',
      totalProductLines: refundItems.length,
      totalQuantity: asNumber(refund.amount) || totalQuantity,
      totalAmount: asNumber(refund.value || refund.totalPayableAmount),
      createdByName: getName(refund.userCreatedId) || getName(refund.userId) || getName(payment?.authorId) || getName(payment?.userId),
      customerName: getName(payment?.customerId),
      customerPhone: payment?.customerId?.phone || '',
      note: refund.note || '',
      relatedCode: payment?.code || '',
      status: 'COMPLETED',
      directionLabel: direction.label,
      directionTone: direction.tone,
      canDelete: false,
    });

    for (let index = 0; index < refundItems.length; index += 1) {
      const item = refundItems[index];
      const product = item.productId as any;
      const quantity = asNumber(item.amount);
      const unitPrice = asNumber(item.price);
      items.push({
        rowKey: `refund-item:${refund._id}:${index}`,
        source: 'refund',
        sourceId: String(refund._id),
        itemSourceId: `${refund._id}:${index}`,
        billCode: refund.code,
        date: isoDate(refund.createdAt),
        warehouseId: String(branch?._id || ''),
        warehouseName: branch?.name || '',
        fromWarehouseId: '',
        fromWarehouseName: '',
        toWarehouseId: '',
        toWarehouseName: '',
        productId: String(product?._id || item.productId || ''),
        productCode: product?.code || '',
        productName: product?.name || '',
        barcode: product?.barcode || '',
        imei: '',
        quantity,
        unitPrice,
        totalAmount: asNumber(item.value) || quantity * unitPrice,
        type: direction.type,
        kind,
        kindLabel: kindLabel(kind),
        sourceModule: kind === 'WHOLESALE_REFUND' ? 'WHOLESALE_REFUND' : 'RETAIL_REFUND',
        note: item.note || refund.note || '',
        directionLabel: direction.label,
        directionTone: direction.tone,
        canDelete: false,
      });
    }
  }

  for (const adjustment of adjustments as any[]) {
    const branch = adjustment.branchId as any;
    const adjustmentItems = Array.isArray(adjustment.items) ? adjustment.items : [];
    const totalQuantity = adjustmentItems.reduce((sum: number, item: any) => sum + Math.abs(asNumber(item.quantityDifference)), 0);
    const direction = directionForKind('STOCK_ADJUSTMENT', asNumber(adjustment.deviation));

    bills.push({
      rowKey: `adjustment:${adjustment._id}`,
      source: 'adjustment',
      sourceId: String(adjustment._id),
      code: adjustment.code,
      date: isoDate(adjustment.balanceDate || adjustment.createdAt),
      warehouseId: String(branch?._id || ''),
      warehouseName: branch?.name || '',
      fromWarehouseId: '',
      fromWarehouseName: '',
      toWarehouseId: '',
      toWarehouseName: '',
      type: direction.type,
      kind: 'STOCK_ADJUSTMENT',
      kindLabel: kindLabel('STOCK_ADJUSTMENT'),
      sourceModule: 'STOCK_ADJUSTMENT',
      totalProductLines: adjustmentItems.length,
      totalQuantity,
      totalAmount: asNumber(adjustment.value),
      createdByName: getName(adjustment.userCreatedId) || getName(adjustment.userId),
      customerName: '',
      note: adjustment.note || '',
      status: 'COMPLETED',
      directionLabel: direction.label,
      directionTone: direction.tone,
      canDelete: false,
    });

    for (let index = 0; index < adjustmentItems.length; index += 1) {
      const item = adjustmentItems[index];
      const product = item.productId as any;
      const difference = asNumber(item.quantityDifference);
      const itemDirection = directionForKind('STOCK_ADJUSTMENT', difference);
      const unitPrice = difference ? Math.abs(asNumber(item.valueDifference) / difference) : asNumber(product?.cost);
      items.push({
        rowKey: `adjustment-item:${adjustment._id}:${index}`,
        source: 'adjustment',
        sourceId: String(adjustment._id),
        itemSourceId: `${adjustment._id}:${index}`,
        billCode: adjustment.code,
        date: isoDate(adjustment.balanceDate || adjustment.createdAt),
        warehouseId: String(branch?._id || ''),
        warehouseName: branch?.name || '',
        fromWarehouseId: '',
        fromWarehouseName: '',
        toWarehouseId: '',
        toWarehouseName: '',
        productId: String(product?._id || item.productId || ''),
        productCode: product?.code || '',
        productName: product?.name || '',
        barcode: product?.barcode || '',
        imei: '',
        quantity: Math.abs(difference),
        signedQuantity: difference,
        unitPrice: Math.abs(unitPrice),
        totalAmount: Math.abs(asNumber(item.valueDifference)),
        type: itemDirection.type,
        kind: 'STOCK_ADJUSTMENT',
        kindLabel: kindLabel('STOCK_ADJUSTMENT'),
        sourceModule: 'STOCK_ADJUSTMENT',
        note: item.note || adjustment.note || '',
        directionLabel: itemDirection.label,
        directionTone: itemDirection.tone,
        canDelete: false,
      });
    }
  }

  const byNewest = (left: any, right: any) =>
    (asDate(right.date)?.getTime() || 0) - (asDate(left.date)?.getTime() || 0)
    || String(right.sourceId).localeCompare(String(left.sourceId));
  bills.sort(byNewest);
  items.sort(byNewest);
  return { bills, items, branches };
}

function filterTransactionRows(rows: any[], query: any, isItem = false) {
  const billId = normalizeText(query.billId || query.id);
  const productKeyword = normalizeText(query.productKeyword || query.product);
  return rows.filter((row) => {
    if (!rowMatchesWarehouse(row, String(query.warehouseId || ''))) return false;
    if (billId && !normalizeText(row.code || row.billCode).includes(billId)) return false;
    if (query.type && row.type !== String(query.type)) return false;
    if (query.kind && row.kind !== String(query.kind)) return false;
    if (!rowMatchesDate(row, query.fromDate, query.toDate)) return false;
    if (isItem && productKeyword) {
      const haystack = normalizeText([row.productName, row.productCode, row.barcode].filter(Boolean).join(' '));
      if (!haystack.includes(productKeyword)) return false;
    }
    return true;
  });
}

function paginateTransactionRows(rows: any[], query: any) {
  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 20), 1), 200);
  const total = rows.length;
  return { items: rows.slice((page - 1) * limit, page * limit), total, page, limit };
}

async function validateInventoryVoucherRollback(voucher: any) {
  const kind = classifyInventoryVoucher(voucher);
  if (!['SUPPLIER_IMPORT', 'MANUAL_IMPORT', 'MANUAL_EXPORT'].includes(kind)) {
    const error: any = new Error('Phiếu này phát sinh từ nghiệp vụ liên kết và không thể xóa tại trang kho.');
    error.status = 422;
    throw error;
  }
  const voucherItems = await InventoryProduct.find({ voucherId: voucher.voucherId }).lean();
  if (!voucherItems.length) {
    const error: any = new Error('Phiếu không có dòng sản phẩm để rollback tồn kho.');
    error.status = 422;
    throw error;
  }
  const branch = await resolveBranch(voucher.warehouse);
  if (!branch) {
    const error: any = new Error('Không xác định được kho của phiếu. Vui lòng kiểm tra lại kho trước khi xóa phiếu.');
    error.status = 400;
    throw error;
  }
  const operations = [];
  for (const item of voucherItems) {
    const product = await Product.findOne({ code: item.productCode });
    if (!product) {
      const error: any = new Error(`Không tìm thấy sản phẩm ${item.productCode || item.productName}.`);
      error.status = 422;
      throw error;
    }
    const movedQuantity = asNumber(item.importQty || item.exportQty);
    const rollbackAmount = item.importQty > 0 ? -movedQuantity : movedQuantity;
    if (rollbackAmount < 0) {
      const branchStock = branch ? await ProductBranchStock.findOne({ productId: product._id, branchId: branch._id }) : null;
      if (asNumber(product.qty) < movedQuantity || (branch && asNumber(branchStock?.qty) < movedQuantity)) {
        const error: any = new Error(`Không thể xóa phiếu vì tồn hiện tại của ${product.code} không đủ để hoàn tác.`);
        error.status = 422;
        throw error;
      }
    }
    operations.push({ product, item, branch, rollbackAmount });
  }
  return { voucherItems, operations };
}

async function rollbackInventoryVoucher(voucher: any) {
  const { voucherItems, operations } = await validateInventoryVoucherRollback(voucher);
  for (const operation of operations) {
    await moveProductQty({
      productId: operation.product._id,
      branchId: operation.branch?._id,
      sourceType: 'InventoryVoucherDelete',
      sourceId: voucher._id,
      amount: operation.rollbackAmount,
      valueAfter: asNumber(operation.item.price),
    });
  }
  await InventoryProduct.deleteMany({ _id: { $in: voucherItems.map((item: any) => item._id) } });
  await InventoryVoucher.deleteOne({ _id: voucher._id });
}

function textQuery(value: any) {
  const raw = String(value || '').trim();
  return raw ? new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : undefined;
}

function dateRangeQuery(from: any, to: any) {
  const query: any = {};
  const start = parseExcelDate(from);
  const end = parseExcelDate(to);
  if (start) query.$gte = start;
  if (end) {
    const next = new Date(end);
    next.setDate(next.getDate() + 1);
    query.$lt = next;
  }
  return Object.keys(query).length ? query : undefined;
}

async function distinctValues(Model: any, fields: string[]) {
  const meta: Record<string, string[]> = {};
  for (const field of fields) {
    const values = await Model.distinct(field, { [field]: { $nin: ['', null] } });
    meta[field] = values.map((value: any) => String(value)).filter(Boolean).sort((a: string, b: string) => a.localeCompare(b, 'vi'));
  }
  return meta;
}

async function listRecords(Model: any, filter: any, req: any, sortField = 'dateObj') {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 15), 1), 200);
  const [items, total] = await Promise.all([
    Model.find(filter).sort({ [sortField]: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Model.countDocuments(filter),
  ]);
  return { items, total, page, limit };
}

function parseNumber(value: any): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return value;
  return Number(String(value).replace(/,/g, '').trim()) || 0;
}

function parseExcelDate(value: any): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const parsed = xlsx.SSF.parse_date_code(value);
    if (!parsed) return undefined;
    return new Date(parsed.y, parsed.m - 1, parsed.d, 12, 0, 0);
  }
  const s = String(value).trim();
  if (!s) return undefined;
  const vn = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (vn) return new Date(Number(vn[3]), Number(vn[2]) - 1, Number(vn[1]), 12, 0, 0);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function computeBatchStatus(expiry?: Date): string {
  if (!expiry) return 'Còn hạn';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const e = new Date(expiry);
  e.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((e.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return 'Hết hạn';
  if (diffDays <= 30) return 'Sắp hết hạn';
  return 'Còn hạn';
}

async function resolveBranch(warehouse?: string, branchId?: string) {
  return resolveBranchReference({ branchId, warehouse, allowInactive: true });
}

function lineTotal(qty: number, price: number, item: any) {
  let amount = qty * price;
  const discount = parseNumber(item.discountValue ?? item.discount);
  if (item.discountType === '%') amount -= amount * discount / 100;
  else amount -= discount;
  const vat = parseNumber(item.vatValue ?? item.vat);
  if (item.vatType === '%') amount += amount * vat / 100;
  else amount += vat;
  return Math.max(0, amount);
}

async function createImportVoucher(req: any, payload: any) {
  const { date, warehouse, branchId: inputBranchId, type, supplier, note, items, updatePriceFlag } = payload;
  if (!Array.isArray(items) || items.length === 0) {
    const error: any = new Error('Danh sách sản phẩm nhập không được để trống');
    error.status = 400;
    throw error;
  }

  const branch = await resolveBranch(warehouse, inputBranchId);
  if (!branch) {
    const error: any = new Error('Vui lòng chọn kho thực hiện hợp lệ trước khi tạo phiếu nhập.');
    error.status = 400;
    throw error;
  }
  const branchId = branch?._id;
  const voucherId = 'PNK-' + Math.floor(Math.random() * 900000 + 100000);
  const spCount = items.length;
  let totalQty = 0;
  let totalAmount = 0;
  const savedItems = [];

  for (const item of items) {
    const product = await Product.findById(item.productId);
    if (!product) {
      const error: any = new Error(`Không tìm thấy sản phẩm với ID ${item.productId}`);
      error.status = 404;
      throw error;
    }

    const qty = Number(item.quantity || 0);
    const price = Number(item.price || 0);
    if (qty <= 0) {
      const error: any = new Error(`Số lượng nhập của [${product.code}] phải lớn hơn 0`);
      error.status = 400;
      throw error;
    }

    const lineAmount = lineTotal(qty, price, item);
    totalQty += qty;
    totalAmount += lineAmount;

    const invProduct = await InventoryProduct.create({
      id: 'TX-' + Math.floor(Math.random() * 900000 + 100000),
      voucherId,
      date: date || new Date().toISOString().slice(0, 10),
      warehouse,
      productCode: product.code,
      productName: product.name,
      type: 'import',
      importQty: qty,
      exportQty: 0,
      price,
      totalAmount: lineAmount,
      creator: req?.user?.name || 'Admin',
      unit: item.unit || product.unit,
      cost: price,
      batch: item.batchCode || item.batch || '',
      discount: parseNumber(item.discountValue),
      vat: parseNumber(item.vatValue),
      vatType: item.vatType || '',
      note: item.note || ''
    });

    if (updatePriceFlag) {
      product.cost = price;
      await product.save();
    }

    if (item.batchCode || item.batch || item.expiryDate) {
      const batchNumber = String(item.batchCode || item.batch || `${product.code}-${voucherId}`).trim();
      const expiryDate = parseExcelDate(item.expiryDate);
      await Batch.findOneAndUpdate(
        { batchNumber, productId: product._id, branchId },
        { $inc: { qty }, $set: { cost: price, expiryDate, status: computeBatchStatus(expiryDate), note: item.note || '' } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    await moveProductQty({ productId: product._id, branchId, sourceType: 'InventoryProduct', sourceId: invProduct._id, amount: qty, valueAfter: price });
    savedItems.push(invProduct);
  }

  const voucher = await InventoryVoucher.create({
    voucherId,
    date: date || new Date().toISOString().slice(0, 10),
    warehouse,
    type: type || 'import',
    supplier: supplier || '',
    spCount,
    qty: totalQty,
    totalAmount,
    discount: items.reduce((sum: number, l: any) => sum + (l.discountType === 'đ' ? Number(l.discountValue || 0) : 0), 0),
    creator: req?.user?.name || 'Admin',
    note: note || `Nhập kho tự động - Loại: ${type || 'Nhập mua'}`
  });

  return { voucher, items: savedItems };
}

// Endpoint giao dịch nhập kho đồng bộ
router.post('/vouchers/import', async (req, res) => {
  try {
    const result = await createImportVoucher(req as any, req.body);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Lỗi server khi nhập kho' });
  }
});

// Endpoint giao dịch xuất kho đồng bộ
router.post('/vouchers/export', async (req, res) => {
  const { date, warehouse, branchId: inputBranchId, type, supplier, note, items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Danh sách sản phẩm xuất không được để trống' });
  }

  try {
    const branch = await resolveBranch(warehouse, inputBranchId);
    if (!branch) {
      return res.status(400).json({ message: 'Vui lòng chọn kho thực hiện hợp lệ trước khi tạo phiếu xuất.' });
    }
    const branchId = branch?._id;

    if (type === 'Xuất bán lẻ' || type === 'Xuất bán sỉ') {
      return res.status(422).json({ message: 'Xuất bán hàng phải tạo ở module Bán hàng để đồng bộ doanh thu, khách hàng và kênh bán.' });
    }

    // 2. Sinh mã phiếu tự động
    const voucherId = 'PXK-' + Math.floor(Math.random() * 900000 + 100000);

    // 3. Tính toán các tổng số
    const spCount = items.length;
    let totalQty = 0;
    let totalAmount = 0;

    // Validate số lượng tồn kho trước khi thực hiện giao dịch
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({ message: `Không tìm thấy sản phẩm với ID ${item.productId}` });
      }
      const qty = Number(item.quantity || 0);
      if (qty <= 0) return res.status(400).json({ message: `Số lượng xuất của [${product.code}] phải lớn hơn 0` });

      let stockQty = 0;
      if (branchId) {
        const branchStock = await ProductBranchStock.findOne({ productId: product._id, branchId });
        stockQty = branchStock?.qty || 0;
      } else {
        stockQty = product.qty || 0;
      }

      if (qty > stockQty) {
        return res.status(400).json({
          message: `Sản phẩm [${product.code}] ${product.name} không đủ tồn kho để xuất. Tồn hiện tại ở kho này: ${stockQty}, yêu cầu xuất: ${qty}`
        });
      }
    }

    const savedItems = [];
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) continue;

      const qty = Number(item.quantity || 0);
      const price = Number(item.price || 0);

      const lineAmount = lineTotal(qty, price, item);

      totalQty += qty;
      totalAmount += lineAmount;

      // Lưu InventoryProduct
      const invProduct = await InventoryProduct.create({
        id: 'TX-' + Math.floor(Math.random() * 900000 + 100000),
        voucherId,
        date: date || new Date().toISOString().slice(0, 10),
        warehouse,
        productCode: product.code,
        productName: product.name,
        type: 'export',
        importQty: 0,
        exportQty: qty,
        price,
        totalAmount: lineAmount,
        creator: (req as any).user?.name || 'Admin',
        unit: item.unit || product.unit,
        cost: price,
        batch: item.batchCode || item.batch || '',
        discount: parseNumber(item.discountValue),
        vat: parseNumber(item.vatValue),
        vatType: item.vatType || '',
        note: item.note || ''
      });

      // Cập nhật kho thực
      await moveProductQty({
        productId: product._id,
        branchId,
        sourceType: 'InventoryProduct',
        sourceId: invProduct._id,
        amount: -qty,
        valueAfter: price
      });

      savedItems.push(invProduct);
    }

    // Tạo InventoryVoucher
    const voucher = await InventoryVoucher.create({
      voucherId,
      date: date || new Date().toISOString().slice(0, 10),
      warehouse,
      type: type || 'export',
      supplier: supplier || '',
      spCount,
      qty: totalQty,
      totalAmount,
      discount: items.reduce((sum, l) => sum + (l.discountType === 'đ' ? Number(l.discountValue || 0) : 0), 0),
      creator: (req as any).user?.name || 'Admin',
      note: note || `Xuất kho tự động - Loại: ${type || 'Xuất bán'}`
    });

    res.status(201).json({ voucher, items: savedItems });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Lỗi server khi xuất kho' });
  }
});

router.post('/vouchers/import-excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Vui lòng tải lên file Excel' });
    // Phase 3B-1b: khong tu fallback kho mac dinh; Admin phai chi ro kho thuc hien.
    const { warehouse, branchId, type = 'Nhập mua', note = '' } = req.body;
    if (!String(warehouse || '').trim()) {
      return res.status(400).json({ message: 'Vui lòng chọn kho thực hiện trước khi nhập dữ liệu.' });
    }
    // Bat buoc branchId hop le, khong tin warehouse name de tranh fallback ngam.
    const importBranchId = String(branchId || '').trim();
    if (!mongoose.isValidObjectId(importBranchId)) {
      return res.status(400).json({ message: 'Vui lòng chọn kho thực hiện hợp lệ trước khi nhập dữ liệu.' });
    }
    const importBranch = await Branch.findOne({ _id: importBranchId, isActive: { $ne: false } });
    if (!importBranch) {
      return res.status(400).json({ message: 'Kho thực hiện không hợp lệ hoặc đã ngưng hoạt động.' });
    }
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames.includes('XNK') ? 'XNK' : workbook.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json<any>(workbook.Sheets[sheetName], { defval: '' });
    const items: any[] = [];
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const productText = String(row['Sản phẩm'] || '').trim();
      if (!productText) continue;
      const product = await Product.findOne({ $or: [{ code: productText }, { name: productText }] });
      if (!product) {
        errors.push(`Dòng ${i + 2}: Không tìm thấy sản phẩm "${productText}"`);
        continue;
      }
      const qty = parseNumber(row['Số lượng']);
      if (qty <= 0) {
        errors.push(`Dòng ${i + 2}: Số lượng phải lớn hơn 0`);
        continue;
      }
      items.push({
        productId: product._id,
        quantity: qty,
        price: parseNumber(row['Giá']),
        discountValue: parseNumber(row['Chiết khấu']),
        discountType: 'đ',
        vatValue: 0,
        vatType: '%',
        unit: row['Đơn vị tính'] || product.unit,
        batchCode: row['Lô hàng'] || '',
        expiryDate: row['Ngày hết hạn'] || '',
        warningDays: parseNumber(row['Cảnh báo trước']),
        note: row['Ghi chú'] || ''
      });
    }

    if (!items.length) return res.status(400).json({ message: 'File không có dòng hợp lệ để nhập kho', errors });

    const result = await createImportVoucher(req as any, { warehouse, branchId, type, note: note || `Nhập kho từ Excel - File: ${req.file.originalname}`, items });
    return res.status(201).json({ ...result, errors });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || 'Lỗi import Excel XNK' });
  }
});

router.post('/transfers-legacy-disabled', async (_req, res) => {
  res.status(410).json({ message: 'Legacy transfer endpoint disabled. Use /warehouse/transfers state machine.' });
});

router.get('/transfers/meta', async (req, res) => {
  const branches = await Branch.find({ isActive: { $ne: false } }).sort({ name: 1, _id: 1 }).select('name code').lean();
  const userWarehouseIds = actorWarehouseIds((req as any).user);
  const visibleBranches = isAdminActor((req as any).user)
    ? branches
    : branches.filter((branch: any) => userWarehouseIds.includes(String(branch._id)));
  res.json({
    role: isAdminActor((req as any).user) ? 'ADMIN' : 'EMPLOYEE',
    userWarehouseIds,
    warehouses: visibleBranches.map((branch: any) => ({ value: String(branch._id), label: branch.name, code: branch.code })),
    destinationWarehouses: branches.map((branch: any) => ({ value: String(branch._id), label: branch.name, code: branch.code })),
    statuses: PUBLIC_TRANSFER_STATUSES.map((status) => ({ value: status, label: transferPublicStatus(status) })),
  });
});

router.get('/transfers/system-check', async (_req, res) => {
  const [transactionSupport, indexes] = await Promise.all([
    checkMongoTransactionSupport(),
    checkWarehouseTransferIndexes(),
  ]);
  res.json({
    ok: transactionSupport.ok && indexes.ok,
    transactionSupport,
    indexes,
  });
});

function serializeTransfer(row: any, user?: any) {
  const source = row.sourceWarehouseId || row.fromWarehouse;
  const destination = row.destinationWarehouseId || row.toWarehouse;
  const lines = Array.isArray(row.lines) ? row.lines : [];
  const totalRequested = lines.reduce((sum: number, line: any) => sum + Number(line.requestedQuantity || line.quantity || 0), 0);
  const status = String(row.status || 'DRAFT');
  const kind = String(row.kind || 'NORMAL_TRANSFER');
  const lockedQuantityTotal = lines.reduce((sum: number, line: any) => sum + Number(line.lockedQuantity || 0), 0);
  const hasSourceExportBill = Boolean(row.sourceExportBillId);
  const canEditDraft = user ? actorCanEditDraft(user, row) : false;
  const canSource = user ? actorCanConfirmSource(user, row) : false;
  const canDestination = user ? actorCanConfirmDestination(user, row) : false;
  const canEdit =
    user
      ? (canEditDraft) || (status === 'IN_TRANSIT' && kind === 'NORMAL_TRANSFER' && !row.returnTransferId && !row.destinationImportBillId && canSource)
      : false;
  const canPrint = status === 'COMPLETED' || (status === 'IN_TRANSIT' && (hasSourceExportBill || Boolean(row.dispatchConfirmedAt))) || status === 'RETURN_IN_PROGRESS';
  const canReturn = status === 'IN_TRANSIT' && kind === 'NORMAL_TRANSFER' && canDestination && !row.returnTransferId;
  return {
    ...row,
    sourceWarehouseId: String(source?._id || source || ''),
    destinationWarehouseId: String(destination?._id || destination || ''),
    sourceWarehouseName: row.sourceWarehouseName || getName(source),
    destinationWarehouseName: row.destinationWarehouseName || getName(destination),
    statusLabel: transferPublicStatus(row.status || 'DRAFT'),
    statusTone: statusTone(row.status || 'DRAFT'),
    totalRequestedQuantity: Number(row.qty || totalRequested),
    totalProductLines: Number(row.spCount || lines.length),
    canCancel: canCancelTransfer(row),
    kind,
    originTransferId: row.originTransferId ? String(row.originTransferId._id || row.originTransferId) : '',
    returnTransferId: row.returnTransferId ? String(row.returnTransferId._id || row.returnTransferId) : '',
    lockedQuantity: lockedQuantityTotal,
    canEdit,
    canConfirmSource: user ? (status === 'DRAFT' && canSource && lines.length > 0) : false,
    canConfirmDestination: user ? (status === 'IN_TRANSIT' && canDestination) : false,
    canReturn,
    canPrint,
    sourceConfirmedBy: row.dispatchConfirmedById,
    sourceConfirmedAt: row.dispatchConfirmedAt,
    destinationConfirmedBy: row.receiptConfirmedById,
    destinationConfirmedAt: row.receiptConfirmedAt,
    availableActions: user ? availableTransferActions(row, user) : [],
  };
}

const TRANSFER_USER_POPULATE_FIELDS = 'createdById requestApprovedById dispatchConfirmedById dispatchApprovedById receiptConfirmedById receiptApprovedById rejectedById cancelledById returnedById';

function transferListFilter(req: any) {
  const tab = String(req.query.tab || req.query.tabs || 'all');
  const filter: any = {};
  if (tab === 'draft') filter.status = 'DRAFT';
  if (tab === 'outgoing') filter.status = { $in: OUTGOING_STATUSES };
  if (tab === 'incoming') filter.status = { $in: INCOMING_STATUSES };
  if (req.query.status && TRANSFER_STATUSES.includes(String(req.query.status) as any)) filter.status = req.query.status;
  const sourceWarehouseId = objectId(req.query.sourceWarehouseId);
  const destinationWarehouseId = objectId(req.query.destinationWarehouseId);
  if (sourceWarehouseId) filter.sourceWarehouseId = sourceWarehouseId;
  if (destinationWarehouseId) filter.destinationWarehouseId = destinationWarehouseId;
  if (textQuery(req.query.id)) filter.$or = [{ id: textQuery(req.query.id) }, { code: textQuery(req.query.id) }];
  const range = dateRangeQuery(req.query.fromDate, req.query.toDate);
  if (range) filter.createdAt = range;
  if (!isAdminActor(req.user)) {
    const ids = actorWarehouseIds(req.user).map((id) => objectId(id)).filter(Boolean);
    if (tab === 'outgoing') filter.sourceWarehouseId = { $in: ids };
    else if (tab === 'incoming') filter.destinationWarehouseId = { $in: ids };
    else if (tab === 'draft') filter.sourceWarehouseId = { $in: ids };
    else filter.$and = [...(filter.$and || []), { $or: [{ sourceWarehouseId: { $in: ids } }, { destinationWarehouseId: { $in: ids } }] }];
  }
  return { tab, filter };
}

router.get('/transfers', async (req, res) => {
  const tab = String(req.query.tab || req.query.tabs || 'all');
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 200);
  const { filter } = transferListFilter(req);
  const [items, total] = await Promise.all([
    WarehouseTransfer.find(filter)
      .populate(TRANSFER_USER_POPULATE_FIELDS, 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    WarehouseTransfer.countDocuments(filter),
  ]);
  res.json({ items: items.map((item) => serializeTransfer(item, (req as any).user)), total, page, limit });
});

function readImportCell(row: any, names: string[]) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null && String(row[name]).trim() !== '') return String(row[name]).trim();
  }
  return '';
}

async function resolveImportBranch(value: string) {
  if (!value) return null;
  const byId = objectId(value);
  return Branch.findOne({
    isActive: { $ne: false },
    $or: [
      ...(byId ? [{ _id: byId }] : []),
      { code: value },
      { name: value },
      { name: textQuery(value) },
    ],
  }).lean();
}

async function resolveImportProduct(value: string) {
  if (!value) return null;
  const byId = objectId(value);
  return Product.findOne({
    $or: [
      ...(byId ? [{ _id: byId }] : []),
      { code: value },
      { barcode: value },
      { name: value },
    ],
  }).lean();
}

async function validateTransferImportRows(rows: any[], req: any, fileName: string, fileHash: string) {
  const rowResults: any[] = [];
  const groups = new Map<string, any>();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const excelRow = index + 2;
    const groupCode = readImportCell(row, ['Mã nhóm phiếu', 'Ma nhom phieu', 'Mã phiếu import', 'Import group', 'Group']);
    const sourceText = readImportCell(row, ['Kho nguồn', 'Kho xuat', 'Kho xuất', 'Source warehouse']);
    const destinationText = readImportCell(row, ['Kho đích', 'Kho nhận', 'Kho nhap', 'Destination warehouse']);
    const productText = readImportCell(row, ['Mã sản phẩm', 'Mã sản phẩm hoặc mã vạch', 'Sản phẩm', 'Product code', 'Barcode']);
    const qtyText = readImportCell(row, ['Số lượng yêu cầu', 'Số lượng', 'Quantity']);
    const note = readImportCell(row, ['Ghi chú phiếu', 'Ghi chú', 'Note']);
    const itemNote = readImportCell(row, ['Ghi chú dòng', 'Ghi chú sản phẩm', 'Item note']);
    const errors: any[] = [];
    if (!groupCode) errors.push({ column: 'Mã nhóm phiếu', message: 'Bắt buộc nhập mã nhóm phiếu để tránh gộp nhầm.' });
    const source = await resolveImportBranch(sourceText);
    const destination = await resolveImportBranch(destinationText);
    if (!source) errors.push({ column: 'Kho nguồn', message: 'Kho nguồn không tồn tại hoặc không active.' });
    if (!destination) errors.push({ column: 'Kho đích', message: 'Kho đích không tồn tại hoặc không active.' });
    if (source && destination && String(source._id) === String(destination._id)) errors.push({ column: 'Kho đích', message: 'Kho nguồn và kho đích không được trùng nhau.' });
    if (source && !actorCanCreateFrom(req.user, source._id)) errors.push({ column: 'Kho nguồn', message: 'User không có quyền tạo phiếu từ kho nguồn này.' });
    const product = await resolveImportProduct(productText);
    if (!product) errors.push({ column: 'Mã sản phẩm', message: 'Sản phẩm không tồn tại.' });
    const qty = Number(qtyText);
    if (!Number.isInteger(qty) || qty <= 0) errors.push({ column: 'Số lượng yêu cầu', message: 'Số lượng phải là số nguyên dương.' });
    if (groupCode && await WarehouseTransfer.exists({ externalImportCode: groupCode })) errors.push({ column: 'Mã nhóm phiếu', message: 'Mã nhóm phiếu đã được import trước đó.' });

    rowResults.push({ excelRow, groupCode, sourceText, destinationText, productText, requestedQuantity: qtyText, note, itemNote, errors });
    if (!errors.length && source && destination && product) {
      if (!groups.has(groupCode)) groups.set(groupCode, { groupCode, source, destination, note, items: [], excelRows: [] });
      const group = groups.get(groupCode);
      if (String(group.source._id) !== String(source._id) || String(group.destination._id) !== String(destination._id)) {
        rowResults[rowResults.length - 1].errors.push({ column: 'Kho nguồn/Kho đích', message: 'Các dòng cùng mã nhóm phiếu phải cùng kho nguồn và kho đích.' });
        continue;
      }
      if (group.items.some((item: any) => String(item.productId) === String(product._id))) {
        rowResults[rowResults.length - 1].errors.push({ column: 'Mã sản phẩm', message: 'Sản phẩm bị trùng trong cùng phiếu.' });
        continue;
      }
      group.items.push({ productId: product._id, productCode: product.code, productName: product.name, barcode: product.barcode || '', quantity: qty, unitCostSnapshot: Number(product.cost || 0), unit: product.unit || '', note: itemNote });
      group.excelRows.push(excelRow);
    }
  }
  const validGroups = [...groups.values()].filter((group) => group.items.length > 0);
  const errorRows = rowResults.filter((row) => row.errors.length > 0);
  return {
    importSessionId: crypto.createHash('sha256').update(`${fileHash}:${Date.now()}:${req.user?.sub || ''}`).digest('hex'),
    fileName,
    fileHash,
    rows: rowResults,
    groups: validGroups,
    summary: { validTransferCount: validGroups.length, validItemCount: validGroups.reduce((sum, group) => sum + group.items.length, 0), errorRowCount: errorRows.length, totalRowCount: rowResults.length },
  };
}

router.get('/transfers/import-template', (_req, res) => {
  const worksheet = xlsx.utils.aoa_to_sheet([
    ['Mã nhóm phiếu', 'Kho nguồn', 'Kho đích', 'Mã sản phẩm', 'Số lượng yêu cầu', 'Ghi chú phiếu', 'Ghi chú dòng'],
    ['TRF-IMPORT-001', 'HN', 'HCM', 'SP001', 1, 'Chuyển bổ sung hàng', ''],
  ]);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'TransferImport');
  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="warehouse-transfer-import-template.xlsx"');
  res.send(buffer);
});

router.post('/transfers/import/validate', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Vui lòng tải file import.' });
    const ext = req.file.originalname.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xlsm', 'csv'].includes(ext || '')) return res.status(400).json({ message: 'Chỉ hỗ trợ file .xlsx, .xlsm hoặc .csv.' });
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer', cellFormula: false, cellHTML: false, cellNF: false, cellStyles: false, cellDates: false, raw: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json<any>(sheet, { defval: '' }).filter((row) => Object.values(row).some((value) => String(value || '').trim() !== ''));
    const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const parsed = await validateTransferImportRows(rows, req as any, req.file.originalname, fileHash);
    transferImportSessions.set(parsed.importSessionId, { expiresAt: Date.now() + IMPORT_SESSION_TTL_MS, createdBy: String((req as any).user?.sub || ''), fileName: parsed.fileName, fileHash, groups: parsed.groups, summary: parsed.summary });
    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Không thể kiểm tra file import.' });
  }
});

router.post('/transfers/import/commit', async (req, res) => {
  const sessionData = transferImportSessions.get(String(req.body.importSessionId || ''));
  if (!sessionData || sessionData.expiresAt < Date.now() || sessionData.createdBy !== String((req as any).user?.sub || '')) return res.status(400).json({ message: 'Phiên import không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra dữ liệu lại.' });
  const submitForApproval = Boolean(req.body.submitForApproval);
  const importBatchId = crypto.createHash('sha256').update(`${sessionData.fileHash}:${sessionData.createdBy}`).digest('hex');
  const successes: any[] = [];
  const failures: any[] = [];
  for (const group of sessionData.groups) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        if (await WarehouseTransfer.exists({ externalImportCode: group.groupCode }).session(session)) {
          const error: any = new Error('Mã nhóm phiếu đã tồn tại.');
          error.status = 409;
          throw error;
        }
        const now = new Date();
        const lines = await buildTransferLines(group.items.map((item: any) => ({ productId: item.productId, quantity: item.quantity, note: item.note, unit: item.unit })));
        const totals = transferTotals(lines);
        const [transfer] = await WarehouseTransfer.create([{
          id: group.groupCode, code: group.groupCode, externalImportCode: group.groupCode, importBatchId, source: 'IMPORT_EXCEL', sourceFileName: sessionData.fileName, importedAt: now,
          date: now.toISOString(), dateObj: now, tabs: ['draft'], type: 'Chuyển kho', status: 'DRAFT',
          sourceWarehouseId: group.source._id, destinationWarehouseId: group.destination._id, fromWarehouse: group.source._id, toWarehouse: group.destination._id,
          sourceWarehouseName: group.source.name, destinationWarehouseName: group.destination.name, warehouse: `${group.source.name} -> ${group.destination.name}`,
          note: group.note || '', creator: actorName(req), createdById: actorId(req), qty: totals.qty, spCount: totals.spCount, totalAmount: totals.totalAmount, lines,
        }], { session });
        await addTransferAudit(transfer, req, 'TRANSFER_CREATED', '', 'DRAFT', group.note || '', { importBatchId, sourceFileName: sessionData.fileName, excelRows: group.excelRows }, session);
        successes.push({ groupCode: group.groupCode, transferId: String(transfer._id), status: transfer.status });
      });
    } catch (err: any) {
      failures.push({ groupCode: group.groupCode, message: err.message || 'Import phiếu thất bại.' });
    } finally {
      await session.endSession();
    }
  }
  transferImportSessions.delete(String(req.body.importSessionId || ''));
  res.status(failures.length ? 207 : 201).json({ importBatchId, successTransferCount: successes.length, failedTransferCount: failures.length, successes, failures, inventoryChanged: false });
});

router.get('/transfers/:id', async (req, res) => {
  const transfer = await readTransferOr404(req.params.id);
  if (!actorCanAccessTransfer((req as any).user, transfer)) return res.status(403).json({ message: 'Bạn không có quyền xem phiếu chuyển kho này.' });
  const populated = await WarehouseTransfer.findById(transfer._id).populate(TRANSFER_USER_POPULATE_FIELDS, 'name email').lean();
  const audits = await TransferAuditLog.find({ transferRequestId: transfer._id }).populate('actorId', 'name email').sort({ createdAt: 1 }).lean();
  res.json({ ...serializeTransfer(populated, (req as any).user), audits });
});

router.post('/transfers', async (req, res) => {
  try {
    const sourceBranch = await activeBranchOrError(req.body.sourceWarehouseId || req.body.fromWarehouse, 'Kho nguồn');
    const destinationBranch = await activeBranchOrError(req.body.destinationWarehouseId || req.body.toWarehouse, 'Kho đích');
    if (String(sourceBranch._id) === String(destinationBranch._id)) return res.status(400).json({ message: 'Kho nguồn và kho đích không được trùng nhau.' });
    if (!actorCanCreateFrom((req as any).user, sourceBranch._id)) return res.status(403).json({ message: 'Bạn không có quyền tạo phiếu từ kho nguồn này.' });
    const lines = await buildTransferLines(req.body.lines);
    const totals = transferTotals(lines);
    const now = new Date();
    const transfer = await WarehouseTransfer.create({
      id: req.body.id || makeTransferCode(), code: req.body.code || makeTransferCode(), date: now.toISOString(), dateObj: now,
      tabs: ['draft'], type: 'Chuyển kho', status: 'DRAFT',
      sourceWarehouseId: sourceBranch._id, destinationWarehouseId: destinationBranch._id, fromWarehouse: sourceBranch._id, toWarehouse: destinationBranch._id,
      sourceWarehouseName: sourceBranch.name, destinationWarehouseName: destinationBranch.name, warehouse: `${sourceBranch.name} -> ${destinationBranch.name}`,
      label: req.body.label || '', note: req.body.note || '', creator: actorName(req), createdById: actorId(req),
      qty: totals.qty, spCount: totals.spCount, totalAmount: totals.totalAmount, lines,
    });
    await addTransferAudit(transfer, req, 'TRANSFER_CREATED', '', 'DRAFT', req.body.note || '');
    res.status(201).json(serializeTransfer(transfer.toObject(), (req as any).user));
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Lỗi server khi tạo phiếu chuyển kho.' });
  }
});

router.post('/transfers/:id/actions/:action', async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let result: any;
    await session.withTransaction(async () => {
      const baseTransfer = await readTransferOr404(req.params.id);
      const transfer = await WarehouseTransfer.findById(baseTransfer._id).session(session);
      if (!transfer) throw new Error('Không tìm thấy phiếu chuyển kho.');
      if (!actorCanAccessTransfer((req as any).user, transfer)) {
        const error: any = new Error('Bạn không có quyền thao tác phiếu chuyển kho này.'); error.status = 403; throw error;
      }
      const action = req.params.action;
      const previous = String(transfer.status || 'DRAFT');
      const reason = String(req.body?.reason || '').trim();
      const now = new Date();
      const requireStatus = (...allowed: string[]) => { if (!allowed.includes(previous)) { const error: any = new Error(`Trạng thái hiện tại (${transferPublicStatus(previous)}) không cho phép thao tác này.`); error.status = 409; throw error; } };

      if (LEGACY_APPROVAL_ACTIONS.includes(action)) {
        const error: any = new Error('Quy trình duyệt cũ đã được thay bằng xác nhận xuất và xác nhận nhận.');
        error.status = 409;
        throw error;
      }
      if (action === 'cancel') {
        const error: any = new Error('Xóa mềm phiếu chuyển kho đã chuyển sang endpoint DELETE /warehouse/transfers/:id.');
        error.status = 409;
        throw error;
      }
      {
        const error: any = new Error('Thao tác không hợp lệ. Sử dụng endpoint xác nhận xuất / xác nhận nhận / hoàn chuyển.');
        error.status = 400;
        throw error;
      }

      result = {};
    });
    res.json(serializeTransfer(result, (req as any).user));
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Không thể thao tác phiếu chuyển kho.' });
  } finally {
    await session.endSession();
  }
});

router.get('/transactions/meta', async (_req, res) => {
  const branches = await Branch.find({ isActive: { $ne: false } }).sort({ name: 1, _id: 1 }).select('name code').lean();
  res.json({
    warehouses: branches.map((branch: any) => ({
      value: String(branch._id),
      label: branch.name,
      code: branch.code,
    })),
    types: transactionTypes,
    kinds: transactionKinds,
  });
});

/* legacy transfer implementation intentionally disabled below
legacyTransferPostDisabled(async (req, res, next) => {
  try {
    const { fromWarehouse, toWarehouse, lines, type, label, note, spCount, qty, creator, date, tabs } = req.body;

    if (!fromWarehouse || !toWarehouse || fromWarehouse === toWarehouse) {
      return res.status(400).json({ message: 'Kho xuất và kho nhập không hợp lệ' });
    }
    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ message: 'Danh sách sản phẩm trống' });
    }

    // Kiểm tra tồn kho trước khi chuyển
    for (const line of lines) {
      const q = Number(line.quantity);
      if (q <= 0) return res.status(400).json({ message: 'Số lượng chuyển phải lớn hơn 0' });

      const product = await Product.findById(line.productId);
      if (!product) {
        return res.status(400).json({ message: `Sản phẩm không tồn tại (ID: ${line.productId})` });
      }

      const branchStock = await ProductBranchStock.findOne({ productId: line.productId, branchId: fromWarehouse });
      const currentStock = branchStock?.qty || 0;

      if (currentStock < q) {
        return res.status(400).json({
          message: `Sản phẩm ${product.code || product.name} không đủ tồn kho tại kho xuất. Tồn hiện tại: ${currentStock}, Yêu cầu: ${q}`
        });
      }
    }

    // Lưu phiếu chuyển kho trước để lấy ID
    const transfer = await WarehouseTransfer.create({
      id: req.body.id || `TRF${Date.now()}`,
      date: date || new Date().toISOString(),
      tabs: tabs || ['all', 'draft'],
      type: type || 'Chuyển kho',
      fromWarehouse,
      toWarehouse,
      label,
      note,
      qty,
      spCount,
      creator: creator || 'System',
      lines
    });

    // Thực hiện trừ tồn kho nguồn và cộng tồn kho đích
    for (const line of lines) {
      const q = Number(line.quantity);
      if (q <= 0) continue;

      // Trừ kho xuất
      await moveProductQty({
        productId: line.productId,
        branchId: fromWarehouse,
        sourceType: 'WarehouseTransfer',
        sourceId: transfer._id,
        amount: -q
      });
      // Cộng kho nhập
      await moveProductQty({
        productId: line.productId,
        branchId: toWarehouse,
        sourceType: 'WarehouseTransfer',
        sourceId: transfer._id,
        amount: q
      });
    }

    res.status(201).json(transfer);
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Lỗi server khi chuyển kho' });
  }
});
*/

router.get('/transactions/meta', async (_req, res) => {
  const branches = await Branch.find({ isActive: { $ne: false } }).sort({ name: 1, _id: 1 }).select('name code').lean();
  res.json({
    warehouses: branches.map((branch: any) => ({
      value: String(branch._id),
      label: branch.name,
      code: branch.code,
    })),
    types: transactionTypes,
    kinds: transactionKinds,
  });
});

router.get('/transactions/bills', async (req, res) => {
  try {
    const { bills } = await buildTransactionRows();
    res.json(paginateTransactionRows(filterTransactionRows(bills, req.query), req.query));
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Không tải được danh sách phiếu xuất nhập kho.' });
  }
});

router.get('/transactions/items', async (req, res) => {
  try {
    const { items } = await buildTransactionRows();
    res.json(paginateTransactionRows(filterTransactionRows(items, req.query, true), req.query));
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Không tải được danh sách sản phẩm xuất nhập kho.' });
  }
});

router.get('/transactions/bills/:source/:id', async (req, res) => {
  try {
    const { bills, items } = await buildTransactionRows();
    const bill = bills.find((row) => row.source === req.params.source && row.sourceId === req.params.id);
    if (!bill) return res.status(404).json({ message: 'Không tìm thấy phiếu xuất nhập kho.' });
    res.json({
      ...bill,
      items: items.filter((row) => row.source === req.params.source && row.sourceId === req.params.id),
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Không tải được chi tiết phiếu.' });
  }
});

router.delete('/transactions/bills/:source/:id', async (req, res) => {
  try {
    if (req.params.source !== 'inventory-voucher') {
      return res.status(422).json({ message: 'Chứng từ liên kết phải được hủy tại module nghiệp vụ gốc.' });
    }
    const voucher = await InventoryVoucher.findById(req.params.id);
    if (!voucher) return res.status(404).json({ message: 'Không tìm thấy phiếu xuất nhập kho.' });
    await rollbackInventoryVoucher(voucher);
    res.json({ success: true, message: 'Đã xóa phiếu và hoàn tác tồn kho.' });
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Không thể xóa phiếu xuất nhập kho.' });
  }
});

router.post('/transactions/bills/bulk-delete', async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ message: 'Vui lòng chọn ít nhất một phiếu.' });
    if (rows.some((row: any) => row.source !== 'inventory-voucher')) {
      return res.status(422).json({ message: 'Danh sách có chứng từ liên kết. Hãy hủy chứng từ đó tại module nghiệp vụ gốc.' });
    }
    const vouchers = await InventoryVoucher.find({ _id: { $in: rows.map((row: any) => row.sourceId) } });
    if (vouchers.length !== rows.length) return res.status(404).json({ message: 'Một hoặc nhiều phiếu không còn tồn tại.' });
    for (const voucher of vouchers) await validateInventoryVoucherRollback(voucher);
    for (const voucher of vouchers) await rollbackInventoryVoucher(voucher);
    res.json({ success: true, message: `Đã xóa ${vouchers.length} phiếu và hoàn tác tồn kho.` });
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Không thể xóa các phiếu đã chọn.' });
  }
});

// Chứng từ nhập/xuất kho mới phải chỉ rõ kho thực hiện, không fallback kho ngầm.
router.post('/vouchers', (req, res, next) => {
  if (!String(req.body?.warehouse || '').trim()) {
    return res.status(400).json({ message: 'Vui lòng chọn kho thực hiện trước khi tạo phiếu.' });
  }
  next();
});
router.post('/products', (req, res, next) => {
  if (!String(req.body?.warehouse || '').trim()) {
    return res.status(400).json({ message: 'Vui lòng chọn kho thực hiện trước khi tạo phiếu.' });
  }
  next();
});
router.use('/vouchers', crudRoutes(InventoryVoucher));
router.use('/products', crudRoutes(InventoryProduct));
// Warehouse transfer uses the guarded state-machine routes above.
router.post('/checks', async (req, res, next) => {
  try {
    const { id, date, type, warehouse, creator, spCount, qty, note, missingSp, balance, lines } = req.body;

    if (!warehouse) return res.status(400).json({ message: 'Cửa hàng/Kho không hợp lệ' });
    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ message: 'Danh sách sản phẩm trống' });
    }

    // Lưu phiếu kiểm kho chính
    const check = await InventoryCheck.create({
      id: id || `PKK${Math.floor(Date.now() / 1000)}`,
      date: date || new Date().toISOString(),
      type,
      warehouse,
      creator,
      spCount,
      qty,
      note,
      missingSp,
      balance
    });

    // Xử lý từng sản phẩm
    for (const line of lines) {
      const difference = Number(line.difference || 0);

      // Lưu dòng chi tiết kiểm kho
      await InventoryCheckProduct.create({
        date: check.date,
        warehouse: check.warehouse,
        productName: line.productName,
        cost: line.cost,
        price: line.price,
        stock: line.stock,
        transferring: line.transferring,
        actualStock: line.actualStock,
        difference: difference,
        description: line.description,
        checkId: check._id,
        externalId: `CHK_PROD_${Date.now()}_${Math.random()}`,
        sourceView: 'audit'
      });

      if (difference !== 0) {
        // Cập nhật tồn kho (bù trừ)
        await moveProductQty({
          productId: line.productId,
          branchId: warehouse,
          sourceType: 'InventoryCheck',
          sourceId: check._id,
          amount: difference, // + nếu thừa, - nếu thiếu
          valueAfter: line.cost
        });
      }
    }

    res.status(201).json(check);
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Lỗi server khi lưu phiếu kiểm kho' });
  }
});

router.use('/checks', crudRoutes(InventoryCheck));
router.use('/check-products', crudRoutes(InventoryCheckProduct));

router.patch('/transfers/:id', async (req, res) => {
 const session = await mongoose.startSession();
 try {
   let result: any;
   await session.withTransaction(async () => {
     const baseTransfer = await readTransferOr404(req.params.id);
     if (!actorCanAccessTransfer((req as any).user, baseTransfer)) { const error: any = new Error('Bạn không có quyền xem phiếu chuyển kho này.'); error.status = 403; throw error; }
     const status = String(baseTransfer.status || 'DRAFT');
     const editableStatuses = ['DRAFT', 'IN_TRANSIT'];
     if (!editableStatuses.includes(status)) { const error: any = new Error('Chỉ được sửa phiếu ở trạng thái Chờ xác nhận xuất hoặc Đang chuyển.'); error.status = 409; throw error; }
     const transfer = await WarehouseTransfer.findById(baseTransfer._id).session(session);
     if (!transfer) { const error: any = new Error('Không tìm thấy phiếu chuyển kho.'); error.status = 404; throw error; }
     const currentStatus = String(transfer.status || 'DRAFT');
     if (!editableStatuses.includes(currentStatus)) { const error: any = new Error('Phiếu đã thay đổi trạng thái, không thể sửa.'); error.status = 409; throw error; }
     const previous = currentStatus;
     if (currentStatus === 'DRAFT') {
       if (!actorCanEditDraft((req as any).user, transfer)) { const error: any = new Error('Chỉ quản lý kho nguồn hoặc Admin được sửa phiếu nháp.'); error.status = 403; throw error; }
       const sourceBranch = await activeBranchOrError(req.body.sourceWarehouseId || req.body.fromWarehouse || baseTransfer.sourceWarehouseId, 'Kho nguồn');
       const destinationBranch = await activeBranchOrError(req.body.destinationWarehouseId || req.body.toWarehouse || baseTransfer.destinationWarehouseId, 'Kho đích');
       if (String(sourceBranch._id) === String(destinationBranch._id)) { const error: any = new Error('Kho nguồn và kho đích không được trùng nhau.'); error.status = 400; throw error; }
       if (String(sourceBranch._id) !== String(baseTransfer.sourceWarehouseId || baseTransfer.fromWarehouse || '')) {
         if (!actorCanCreateFrom((req as any).user, sourceBranch._id)) { const error: any = new Error('Bạn không có quyền chuyển sang kho nguồn này.'); error.status = 403; throw error; }
       }
       const lines = await buildTransferLines(req.body.lines || baseTransfer.lines);
       const totals = transferTotals(lines);
       transfer.sourceWarehouseId = sourceBranch._id as any; transfer.destinationWarehouseId = destinationBranch._id as any;
       transfer.fromWarehouse = sourceBranch._id as any; transfer.toWarehouse = destinationBranch._id as any;
       transfer.sourceWarehouseName = sourceBranch.name; transfer.destinationWarehouseName = destinationBranch.name;
       transfer.warehouse = `${sourceBranch.name} -> ${destinationBranch.name}`;
       transfer.label = String(req.body.label ?? transfer.label ?? '');
       transfer.note = String(req.body.note ?? transfer.note ?? '');
       transfer.lines = lines as any; transfer.qty = totals.qty; transfer.spCount = totals.spCount; transfer.totalAmount = totals.totalAmount;
       transfer.version = Number(transfer.version || 0) + 1;
       await transfer.save({ session });
       await addTransferAudit(transfer, req, 'TRANSFER_UPDATED', previous, 'DRAFT', '', {}, session);
       result = transfer.toObject();
       return;
     }
     // IN_TRANSIT: chỉ cho sửa khi NORMAL_TRANSFER, chưa nhận, chưa báo trả, có quyền kho nguồn.
     if (String(transfer.kind || 'NORMAL_TRANSFER') !== 'NORMAL_TRANSFER') { const error: any = new Error('Đơn trả hàng không được phép sửa số lượng.'); error.status = 409; throw error; }
     if (transfer.destinationImportBillId) { const error: any = new Error('Phiếu đã được xác nhận nhận, không thể sửa.'); error.status = 409; throw error; }
     if (transfer.returnTransferId) { const error: any = new Error('Phiếu đã được báo trả hàng, không thể sửa.'); error.status = 409; throw error; }
     if (!actorCanConfirmSource((req as any).user, transfer)) { const error: any = new Error('Chỉ quản lý kho nguồn hoặc Admin được sửa đơn đang chuyển.'); error.status = 403; throw error; }
     const incomingLines = await buildTransferLines(req.body.lines || baseTransfer.lines);
     const incomingByProduct = new Map(incomingLines.map((line: any) => [String(line.productId), line]));
      const currentProductIds = new Set((transfer.lines || []).map((line: any) => String(line.productId)));
      if (incomingByProduct.size !== currentProductIds.size || [...incomingByProduct.keys()].some((productId) => !currentProductIds.has(productId))) {
        const error: any = new Error('Đơn đang chuyển chỉ được sửa số lượng các sản phẩm đã khóa, không được thêm hoặc xóa dòng sản phẩm.');
        error.status = 409;
        throw error;
      }
     const beforeLockByProduct: Record<string, number> = {};
     for (const line of transfer.lines || []) {
       const oldLocked = Number(line.lockedQuantity || 0);
       beforeLockByProduct[String(line.productId)] = oldLocked;
       const incoming = incomingByProduct.get(String(line.productId));
       const newQty = Number(incoming?.requestedQuantity || 0);
       const delta = newQty - oldLocked;
       if (delta > 0) await reserveSourceStock({ productId: line.productId, branchId: transfer.sourceWarehouseId, amount: delta, session });
       if (delta < 0) await reserveSourceStock({ productId: line.productId, branchId: transfer.sourceWarehouseId, amount: delta, session });
       line.requestedQuantity = newQty;
       line.approvedQuantity = newQty;
       line.lockedQuantity = newQty;
       line.dispatchedQuantity = newQty;
     }
     const totals = transferTotals(incomingLines);
     transfer.label = String(req.body.label ?? transfer.label ?? '');
     transfer.note = String(req.body.note ?? transfer.note ?? '');
     transfer.qty = totals.qty; transfer.spCount = totals.spCount; transfer.totalAmount = totals.totalAmount;
     transfer.version = Number(transfer.version || 0) + 1;
     await transfer.save({ session });
     await addTransferAudit(transfer, req, 'TRANSFER_UPDATED_IN_TRANSIT', previous, 'IN_TRANSIT', '', { beforeLockByProduct }, session);
     result = transfer.toObject();
   });
   res.json(serializeTransfer(result, (req as any).user));
 } catch (err: any) {
   res.status(err.status || 500).json({ message: err.message || 'Lỗi server khi sửa phiếu chuyển kho.' });
 } finally {
   await session.endSession();
 }
});

router.delete('/transfers/:id', async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let result: any;
    await session.withTransaction(async () => {
      const baseTransfer = await readTransferOr404(req.params.id);
      const transfer = await WarehouseTransfer.findById(baseTransfer._id).session(session);
      if (!transfer) throw new Error('Không tìm thấy phiếu chuyển kho.');
      if (String(transfer.status || 'DRAFT') !== 'DRAFT') { const error: any = new Error('Chỉ hủy được phiếu ở trạng thái Chờ xác nhận xuất.'); error.status = 409; throw error; }
      if (!actorCanEditDraft((req as any).user, transfer)) { const error: any = new Error('Chỉ quản lý kho nguồn hoặc Admin được hủy phiếu.'); error.status = 403; throw error; }
      await normalizeTransferWarehouseRefs(transfer, session);
      const reason = String(req.body?.reason || '').trim();
      const previous = String(transfer.status || 'DRAFT');
      transfer.status = 'CANCELLED'; transfer.cancelledById = actorId(req); transfer.cancelledAt = new Date(); transfer.cancelReason = reason;
      transfer.version = Number(transfer.version || 0) + 1;
      await transfer.save({ session });
      await addTransferAudit(transfer, req, 'TRANSFER_CANCELLED', previous, 'CANCELLED', reason, {}, session);
      result = transfer.toObject();
    });
    res.json(serializeTransfer(result, (req as any).user));
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Không thể hủy phiếu chuyển kho.' });
  } finally {
    await session.endSession();
  }
});

async function runConfirmSource(req: any, res: any, session: any) {
  const baseTransfer = await readTransferOr404(req.params.id);
  const transfer = await WarehouseTransfer.findById(baseTransfer._id).session(session);
  if (!transfer) throw new Error('Không tìm thấy phiếu chuyển kho.');
  if (String(transfer.status || 'DRAFT') !== 'DRAFT') { const error: any = new Error('Chỉ xác nhận xuất được phiếu ở trạng thái Chờ xác nhận xuất.'); error.status = 409; throw error; }
  if (!actorCanConfirmSource(req.user, transfer)) { const error: any = new Error('Chỉ quản lý kho nguồn hoặc Admin được xác nhận xuất.'); error.status = 403; throw error; }
  if (transfer.sourceExportBillId) { const error: any = new Error('Phiếu đã được xác nhận xuất.'); error.status = 409; throw error; }
 await normalizeTransferWarehouseRefs(transfer, session);
 const previous = String(transfer.status || 'DRAFT');
 await assertEnoughSourceStock(transfer, session);
 const kind = String(transfer.kind || 'NORMAL_TRANSFER');
 const now = new Date();
 if (kind === 'RETURN_OF_TRANSFER') {
   // Đơn trả: chỉ chuyển trạng thái, KHÔNG lock thêm, KHÔNG trừ tồn, KHÔNG tạo voucher di chuyển tồn.
   for (const line of transfer.lines || []) {
     line.dispatchedQuantity = Number(line.requestedQuantity || line.dispatchedQuantity || 0);
     line.lockedQuantity = 0;
   }
   transfer.dispatchConfirmedById = actorId(req); transfer.dispatchConfirmedAt = now; transfer.status = 'IN_TRANSIT';
   transfer.version = Number(transfer.version || 0) + 1;
   await transfer.save({ session });
   await addTransferAudit(transfer, req, 'SOURCE_CONFIRMED', previous, 'IN_TRANSIT', '', { kind }, session);
   return transfer.toObject();
 }
 // NORMAL_TRANSFER: khóa (lock) tồn tại kho nguồn, KHÔNG trừ qty ngay. Vẫn tạo voucher EXPORT_TRANSFER để in phiếu.
 const voucherLines = (transfer.lines || []).map((line: any) => ({ ...(line.toObject?.() || line), quantity: Number(line.requestedQuantity || line.quantity || 0), price: Number(line.unitCostSnapshot || 0) }));
 const voucher = await createTransferVoucher(transfer, req, 'EXPORT_TRANSFER', transfer.sourceWarehouseId, transfer.sourceWarehouseName || String(transfer.sourceWarehouseId || ''), voucherLines, session);
 for (const line of transfer.lines || []) {
   const qty = Number(line.requestedQuantity || 0);
   await reserveSourceStock({ productId: line.productId, branchId: transfer.sourceWarehouseId, amount: qty, session });
   line.lockedQuantity = qty;
   line.dispatchedQuantity = qty;
 }
 transfer.sourceExportBillId = voucher._id; transfer.dispatchConfirmedById = actorId(req); transfer.dispatchConfirmedAt = now; transfer.status = 'IN_TRANSIT';
 transfer.version = Number(transfer.version || 0) + 1;
 await transfer.save({ session });
 await addTransferAudit(transfer, req, 'SOURCE_LOCKED', previous, 'IN_TRANSIT', '', { kind }, session);
 return transfer.toObject();
}

router.post('/transfers/:id/confirm-source', async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let result: any;
    await session.withTransaction(async () => { result = await runConfirmSource(req, res, session); });
    res.json(serializeTransfer(result, (req as any).user));
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Không thể xác nhận xuất.' });
  } finally {
    await session.endSession();
  }
});

async function runConfirmDestination(req: any, _res: any, session: any) {
  const baseTransfer = await readTransferOr404(req.params.id);
  const transfer = await WarehouseTransfer.findById(baseTransfer._id).session(session);
  if (!transfer) throw new Error('Không tìm thấy phiếu chuyển kho.');
  if (String(transfer.status || 'DRAFT') !== 'IN_TRANSIT') { const error: any = new Error('Chỉ xác nhận nhận được phiếu đang chuyển.'); error.status = 409; throw error; }
  if (!actorCanConfirmDestination(req.user, transfer)) { const error: any = new Error('Chỉ quản lý kho đích hoặc Admin được xác nhận nhận.'); error.status = 403; throw error; }
  if (transfer.destinationImportBillId) { const error: any = new Error('Phiếu đã được xác nhận nhận.'); error.status = 409; throw error; }
 const previous = String(transfer.status || 'DRAFT');
 const kind = String(transfer.kind || 'NORMAL_TRANSFER');
 const now = new Date();
 if (kind === 'RETURN_OF_TRANSFER') {
   if (!transfer.originTransferId) { const error: any = new Error('Đơn trả hàng không có đơn gốc liên kết.'); error.status = 409; throw error; }
   const origin = await WarehouseTransfer.findById(transfer.originTransferId).session(session);
   if (!origin) { const error: any = new Error('Không tìm thấy đơn gốc của đơn trả hàng.'); error.status = 409; throw error; }
   if (String(origin.status || '') !== 'RETURN_IN_PROGRESS') { const error: any = new Error('Đơn gốc không ở trạng thái đang chờ nhận lại hàng trả.'); error.status = 409; throw error; }
   for (const originLine of origin.lines || []) {
     const qty = Number(originLine.lockedQuantity || originLine.dispatchedQuantity || originLine.requestedQuantity || 0);
     await releaseReservation({ productId: originLine.productId, branchId: origin.sourceWarehouseId, amount: -qty, session });
     originLine.lockedQuantity = 0;
   }
   const originPrevious = String(origin.status || 'DRAFT');
   origin.status = 'RETURNED'; origin.returnedById = actorId(req); origin.returnedAt = now;
   origin.version = Number(origin.version || 0) + 1;
   await origin.save({ session });
   await addTransferAudit(origin, req, 'RETURNED', originPrevious, 'RETURNED', '', { returnTransferId: transfer._id }, session);
   for (const line of transfer.lines || []) { line.receivedQuantity = Number(line.requestedQuantity || line.dispatchedQuantity || 0); line.lockedQuantity = 0; }
   transfer.receiptConfirmedById = actorId(req); transfer.receiptConfirmedAt = now; transfer.status = 'COMPLETED';
   transfer.version = Number(transfer.version || 0) + 1;
   await transfer.save({ session });
   await addTransferAudit(transfer, req, 'RETURN_DESTINATION_CONFIRMED', previous, 'COMPLETED', '', { originTransferId: origin._id }, session);
   return transfer.toObject();
 }
 // NORMAL_TRANSFER: trừ qty + giảm lock (consume) tại kho nguồn, cộng qty kho đích, tạo IMPORT_TRANSFER.
 const voucherLines = (transfer.lines || []).map((line: any) => ({ ...(line.toObject?.() || line), quantity: Number(line.dispatchedQuantity || line.requestedQuantity || 0), price: Number(line.unitCostSnapshot || 0) }));
 const voucher = await createTransferVoucher(transfer, req, 'IMPORT_TRANSFER', transfer.destinationWarehouseId, transfer.destinationWarehouseName || String(transfer.destinationWarehouseId || ''), voucherLines, session);
 for (const line of transfer.lines || []) {
   const qty = Number(line.dispatchedQuantity || line.requestedQuantity || 0);
   await consumeReservedStock({ productId: line.productId, branchId: transfer.sourceWarehouseId, amount: qty, sourceType: 'WarehouseTransfer:IMPORT_TRANSFER', sourceId: voucher._id, valueAfter: line.unitCostSnapshot, session });
   await moveStockStrict({ productId: line.productId, branchId: transfer.destinationWarehouseId, amount: qty, sourceType: 'WarehouseTransfer:IMPORT_TRANSFER', sourceId: voucher._id, valueAfter: line.unitCostSnapshot, session });
   line.receivedQuantity = qty;
   line.lockedQuantity = 0;
 }
 transfer.destinationImportBillId = voucher._id; transfer.receiptConfirmedById = actorId(req); transfer.receiptConfirmedAt = now; transfer.status = 'COMPLETED';
 transfer.version = Number(transfer.version || 0) + 1;
 await transfer.save({ session });
 await addTransferAudit(transfer, req, 'DESTINATION_CONFIRMED', previous, 'COMPLETED', '', { kind }, session);
 return transfer.toObject();
}

router.post('/transfers/:id/confirm-destination', async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let result: any;
    await session.withTransaction(async () => { result = await runConfirmDestination(req, res, session); });
    res.json(serializeTransfer(result, (req as any).user));
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Không thể xác nhận nhận.' });
  } finally {
    await session.endSession();
  }
});

async function runReturn(req: any, _res: any, session: any) {
  const baseTransfer = await readTransferOr404(req.params.id);
  const transfer = await WarehouseTransfer.findById(baseTransfer._id).session(session);
  if (!transfer) throw new Error('Không tìm thấy phiếu chuyển kho.');
  if (String(transfer.status || 'DRAFT') !== 'IN_TRANSIT') { const error: any = new Error('Chỉ hoàn chuyển được phiếu đang chuyển.'); error.status = 409; throw error; }
  if (!actorCanConfirmDestination(req.user, transfer)) { const error: any = new Error('Chỉ quản lý kho đích hoặc Admin được báo hoàn chuyển.'); error.status = 403; throw error; }
  const reason = String(req.body?.reason || '').trim();
  if (!reason) { const error: any = new Error('Vui lòng nhập lý do hoàn chuyển.'); error.status = 400; throw error; }
 if (!transfer.sourceExportBillId) { const error: any = new Error('Phiếu chưa có chứng từ xuất, không thể hoàn.'); error.status = 409; throw error; }
 if (transfer.returnTransferId) { const error: any = new Error('Phiếu đã được báo trả hàng.'); error.status = 409; throw error; }
 if (String(transfer.kind || 'NORMAL_TRANSFER') !== 'NORMAL_TRANSFER') { const error: any = new Error('Chỉ đơn chuyển thường mới được báo trả hàng.'); error.status = 409; throw error; }
 const previous = String(transfer.status || 'DRAFT');
 // Tự động tạo đơn chuyển ngược B->A (RETURN_OF_TRANSFER). Lock tại kho A vẫn giữ, qty kho A vẫn nguyên.
 const now = new Date();
 const returnCode = makeTransferCode();
 const returnLines = (transfer.lines || []).map((line: any) => ({
   productId: line.productId,
   productCode: line.productCode,
   productName: line.productName,
   barcode: line.barcode,
   requestedQuantity: Number(line.dispatchedQuantity || line.requestedQuantity || 0),
   approvedQuantity: Number(line.dispatchedQuantity || line.requestedQuantity || 0),
   dispatchedQuantity: 0,
   receivedQuantity: 0,
   lockedQuantity: 0,
   unitCostSnapshot: Number(line.unitCostSnapshot || 0),
   unit: line.unit || '',
   batchCode: line.batchCode || '',
   imei: line.imei || '',
   note: '',
 }));
 const [returnTransfer] = await WarehouseTransfer.create([{
   id: returnCode, code: returnCode, tabs: ['draft'], date: now.toISOString(), dateObj: now,
   type: 'Trả hàng chuyển kho', status: 'DRAFT', kind: 'RETURN_OF_TRANSFER', originTransferId: transfer._id,
   sourceWarehouseId: transfer.destinationWarehouseId, destinationWarehouseId: transfer.sourceWarehouseId,
   fromWarehouse: transfer.destinationWarehouseId, toWarehouse: transfer.sourceWarehouseId,
   sourceWarehouseName: transfer.destinationWarehouseName, destinationWarehouseName: transfer.sourceWarehouseName,
   warehouse: `${transfer.destinationWarehouseName} -> ${transfer.sourceWarehouseName}`,
   label: '', note: `Trả hàng cho phiếu ${transfer.id}. Lý do: ${reason}`,
   creator: actorName(req), createdById: actorId(req),
   qty: Number(transfer.qty || 0), spCount: Number(transfer.spCount || returnLines.length), totalAmount: 0,
   lines: returnLines,
 }], { session });
 transfer.status = 'RETURN_IN_PROGRESS'; transfer.returnReason = reason; transfer.returnTransferId = returnTransfer._id;
 transfer.returnedById = actorId(req); transfer.returnedAt = now;
 transfer.version = Number(transfer.version || 0) + 1;
 await transfer.save({ session });
 await addTransferAudit(transfer, req, 'RETURN_REQUESTED', previous, 'RETURN_IN_PROGRESS', reason, { returnTransferId: returnTransfer._id }, session);
 await addTransferAudit(returnTransfer, req, 'RETURN_TRANSFER_CREATED', '', 'DRAFT', reason, { originTransferId: transfer._id }, session);
 return { origin: transfer.toObject(), returnTransfer: returnTransfer.toObject() };
}

router.post('/transfers/:id/return', async (req, res) => {
  const session = await mongoose.startSession();
  try {
   let result: any;
   await session.withTransaction(async () => { result = await runReturn(req, res, session); });
   const user = (req as any).user;
   res.json({ ...serializeTransfer(result.origin, user), returnTransfer: serializeTransfer(result.returnTransfer, user) });
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Không thể báo hoàn chuyển.' });
  } finally {
    await session.endSession();
  }
});

export default router;
