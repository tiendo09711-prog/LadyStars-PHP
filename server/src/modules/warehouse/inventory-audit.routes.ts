import { Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { Branch } from '../../core/org/branch.model.js';
import { getAssignedWarehouseIds, isAdminUser } from '../../core/middleware/auth.js';
import {
  InventoryAudit,
  InventoryAuditItem,
  InventoryAuditLog,
  InventoryProduct,
  InventoryVoucher,
  WarehouseTransfer,
} from './warehouse.models.js';
import { Product, ProductBranchStock, ProductLog, Shelf } from '../product/product.models.js';

const router = Router();
const inventoryAuditItemsRouter = Router();

const AUDIT_STATUSES = ['DRAFT', 'COUNTING', 'SUBMITTED', 'RECONCILED', 'CANCELLED'] as const;
const AUDIT_TYPES = ['BY_PRODUCT', 'FULL_WAREHOUSE'] as const;
const TRANSFER_PENDING_STATUSES = ['IN_TRANSIT'];
const VARIANCE_REASONS = ['BROKEN', 'EXPIRED', 'LOSS', 'FOUND', 'DATA_ERROR', 'OTHER'] as const;

function varianceReasonLabel(reason: string) {
  const labels: Record<string, string> = {
    BROKEN: 'Hỏng/vỡ',
    EXPIRED: 'Hết hạn',
    LOSS: 'Thất thoát',
    FOUND: 'Tìm thấy/thừa thực tế',
    DATA_ERROR: 'Sai dữ liệu trước đó',
    OTHER: 'Khác',
  };
  return labels[reason] || reason || '';
}

function objectId(value: unknown) {
  const raw = String(value || '').trim();
  return Types.ObjectId.isValid(raw) ? new Types.ObjectId(raw) : undefined;
}

function isAdminActor(user: any) {
  return isAdminUser(user) || user?.role === 'owner' || user?.isRootOwner === true;
}

function actorWarehouseIds(user: any) {
  return [
    ...getAssignedWarehouseIds(user),
    ...(Array.isArray(user?.warehouseIds) ? user.warehouseIds : []),
    ...(Array.isArray(user?.branchIds) ? user.branchIds : []),
  ]
    .filter(Boolean)
    .map((value) => String(value));
}

function actorCanAccessWarehouse(user: any, warehouseId: unknown) {
  if (isAdminActor(user)) return true;
  return actorWarehouseIds(user).includes(String(warehouseId || ''));
}

function actorName(req: any) {
  return req.user?.name || req.user?.email || 'System';
}

function actorId(req: any) {
  return objectId(req.user?.sub);
}

function auditTypeLabel(type: string) {
  if (type === 'FULL_WAREHOUSE') return 'Toàn kho';
  return 'Theo sản phẩm';
}

function auditStatusLabel(status: string) {
  const labels: Record<string, string> = {
    DRAFT: 'Nháp',
    COUNTING: 'Đang kiểm',
    SUBMITTED: 'Chờ bù trừ',
    RECONCILED: 'Đã bù trừ',
    CANCELLED: 'Đã hủy',
  };
  return labels[status] || status;
}

function makeAuditCode() {
  return `AUD-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function makeVoucherCode(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function toIntegerOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) return NaN;
  return number;
}

function normalizeVarianceReason(value: unknown) {
  const reason = String(value || '').trim().toUpperCase();
  return VARIANCE_REASONS.includes(reason as any) ? reason : '';
}

function optionalObjectId(value: unknown) {
  const raw = String(value || '').trim();
  return Types.ObjectId.isValid(raw) ? new Types.ObjectId(raw) : undefined;
}

function booleanInput(value: unknown) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function startOfDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setHours(23, 59, 59, 999);
  return date;
}

async function ensureActiveWarehouse(warehouseId: unknown) {
  const id = objectId(warehouseId);
  if (!id) {
    const error: any = new Error('Kho hàng không hợp lệ.');
    error.status = 400;
    throw error;
  }
  const warehouse = await Branch.findOne({ _id: id, isActive: { $ne: false } }).lean();
  if (!warehouse) {
    const error: any = new Error('Kho hàng không tồn tại hoặc đã ngừng hoạt động.');
    error.status = 400;
    throw error;
  }
  return warehouse;
}

async function loadAuditOrThrow(idOrCode: string, session?: mongoose.ClientSession) {
  const byId = objectId(idOrCode);
  const query = byId
    ? { $or: [{ _id: byId }, { code: idOrCode }] }
    : { code: idOrCode };
  const audit = await InventoryAudit.findOne(query).session(session || null);
  if (!audit) {
    const error: any = new Error('Không tìm thấy phiếu kiểm kho.');
    error.status = 404;
    throw error;
  }
  return audit;
}

function assertWarehouseScope(req: any, warehouseId: unknown) {
  if (!actorCanAccessWarehouse(req.user, warehouseId)) {
    const error: any = new Error('Bạn không có quyền thao tác với kho này.');
    error.status = 403;
    throw error;
  }
}

function assertAdminReconcile(req: any) {
  if (!isAdminActor(req.user)) {
    const error: any = new Error('Chỉ Admin mới được bù trừ kiểm kho.');
    error.status = 403;
    throw error;
  }
}

async function writeAuditLog(
  inventoryAuditId: Types.ObjectId,
  req: any,
  actionType: string,
  previousStatus: string,
  nextStatus: string,
  reason = '',
  metadata: Record<string, unknown> = {},
  session?: mongoose.ClientSession,
) {
  await InventoryAuditLog.create([{
    inventoryAuditId,
    actionType,
    actorId: actorId(req),
    previousStatus,
    nextStatus,
    reason,
    metadata,
  }], { session });
}

function deriveVariance(systemQuantitySnapshot: number, physicalQuantity: number | null) {
  if (physicalQuantity === null) return 0;
  return Number(physicalQuantity) - Number(systemQuantitySnapshot || 0);
}

function transferPendingQuantity(line: any) {
  return Number(
    line.dispatchedQuantity
    || line.approvedQuantity
    || line.requestedQuantity
    || line.quantity
    || 0,
  );
}

async function buildInTransitMap(productIds: string[], warehouseId: string) {
  const transfers = await WarehouseTransfer.find({
    status: { $in: TRANSFER_PENDING_STATUSES },
    $or: [
      { sourceWarehouseId: objectId(warehouseId) },
      { destinationWarehouseId: objectId(warehouseId) },
      { fromWarehouse: objectId(warehouseId) },
      { toWarehouse: objectId(warehouseId) },
    ],
    'lines.productId': { $in: productIds.map((value) => new Types.ObjectId(value)) },
  }).lean();

  const map = new Map<string, number>();
  for (const transfer of transfers) {
    const isSource = String(transfer.sourceWarehouseId || transfer.fromWarehouse || '') === warehouseId;
    const isDestination = String(transfer.destinationWarehouseId || transfer.toWarehouse || '') === warehouseId;
    for (const line of transfer.lines || []) {
      const productId = String(line.productId || '');
      if (!productId || !productIds.includes(productId)) continue;
      if (!isSource && !isDestination) continue;
      map.set(productId, (map.get(productId) || 0) + Math.abs(transferPendingQuantity(line)));
    }
  }
  return map;
}

async function resolveSnapshotProducts(auditType: string, warehouseId: string, rawItems: any[]) {
  if (auditType === 'FULL_WAREHOUSE') {
    const stocks = await ProductBranchStock.find({ branchId: objectId(warehouseId) }).lean();
    const uniqueProductIds = [...new Set(stocks.map((stock) => String(stock.productId || '')).filter(Boolean))];
    if (!uniqueProductIds.length) {
      const error: any = new Error('Kho chưa có sản phẩm nào để kiểm kho toàn kho.');
      error.status = 400;
      throw error;
    }
    const products = await Product.find({
      _id: { $in: uniqueProductIds.map((value) => new Types.ObjectId(value)) },
      type: { $ne: 'service' },
    }).lean();
    const productMap = new Map(products.map((product: any) => [String(product._id), product]));
    return uniqueProductIds
      .map((productId) => productMap.get(productId))
      .filter(Boolean)
      .map((product: any) => ({ product, input: rawItems.find((item) => String(item.productId || '') === String(product._id)) || {} }));
  }

  if (!Array.isArray(rawItems) || !rawItems.length) {
    const error: any = new Error('Vui lòng chọn ít nhất một sản phẩm để kiểm kho.');
    error.status = 400;
    throw error;
  }

  const seen = new Set<string>();
  const productIds: string[] = [];
  for (const item of rawItems) {
    const id = String(item.productId || '').trim();
    const parsed = objectId(id);
    if (!parsed) {
      const error: any = new Error('Sản phẩm kiểm kho không hợp lệ.');
      error.status = 400;
      throw error;
    }
    if (seen.has(String(parsed))) {
      const error: any = new Error('Không được chọn trùng sản phẩm trong cùng một phiếu kiểm kho.');
      error.status = 400;
      throw error;
    }
    seen.add(String(parsed));
    productIds.push(String(parsed));
  }

  const products = await Product.find({
    _id: { $in: productIds.map((value) => new Types.ObjectId(value)) },
    type: { $ne: 'service' },
  }).lean();
  if (products.length !== productIds.length) {
    const error: any = new Error('Có sản phẩm kiểm kho không tồn tại hoặc không hợp lệ.');
    error.status = 400;
    throw error;
  }
  const productMap = new Map(products.map((product: any) => [String(product._id), product]));
  return productIds.map((productId) => ({
    product: productMap.get(productId),
    input: rawItems.find((item) => String(item.productId || '') === productId) || {},
  }));
}

async function buildSnapshotItems(
  auditType: string,
  warehouseId: string,
  rawItems: any[],
  preserveMap = new Map<string, any>(),
) {
  const resolved = await resolveSnapshotProducts(auditType, warehouseId, rawItems);
  const productIds = resolved.map(({ product }) => String(product._id));
  const branchStocks = await ProductBranchStock.find({
    branchId: objectId(warehouseId),
    productId: { $in: productIds.map((value) => new Types.ObjectId(value)) },
  }).lean();
  const stockMap = new Map(branchStocks.map((stock: any) => [String(stock.productId), Number(stock.qty || 0)]));
  const inTransitMap = await buildInTransitMap(productIds, warehouseId);

  return resolved.map(({ product, input }) => {
    const preserved = preserveMap.get(String(product._id));
    const resolvedPhysical = toIntegerOrNull(
      input.physicalQuantity ?? preserved?.physicalQuantity ?? null,
    );
    if (Number.isNaN(resolvedPhysical)) {
      const error: any = new Error(`Số lượng thực tế của ${product.code || product.name} phải là số nguyên không âm.`);
      error.status = 400;
      throw error;
    }

    const systemQuantitySnapshot = Number(stockMap.get(String(product._id)) || 0);
    const physicalQuantity = resolvedPhysical === null ? null : Number(resolvedPhysical);
    return {
      productId: product._id,
      productCodeSnapshot: product.code || '',
      barcodeSnapshot: product.barcode || '',
      productNameSnapshot: product.name || '',
      unitSnapshot: product.unit || '',
      costPriceSnapshot: Number(product.cost || 0),
      salePriceSnapshot: Number(product.price || 0),
      systemQuantitySnapshot,
      inTransitQuantitySnapshot: Number(inTransitMap.get(String(product._id)) || 0),
      physicalQuantity,
      varianceQuantity: deriveVariance(systemQuantitySnapshot, physicalQuantity),
      note: String(input.note ?? preserved?.note ?? '').trim(),
      physicalQuantity2: (() => {
        const second = toIntegerOrNull(input.physicalQuantity2 ?? preserved?.physicalQuantity2 ?? null);
        if (Number.isNaN(second)) {
          const error: any = new Error(`Số lượng đêm lần 2 của ${product.code || product.name} phải là số nguyên không âm.`);
          error.status = 400;
          throw error;
        }
        return second === null ? null : Number(second);
      })(),
      countedById: physicalQuantity === null ? undefined : objectId(input.countedById || preserved?.countedById || ''),
      countedAt: physicalQuantity === null ? undefined : new Date(),
      countedById2: objectId(input.countedById2 || preserved?.countedById2 || ''),
      countedAt2: input.physicalQuantity2 === null || input.physicalQuantity2 === undefined || input.physicalQuantity2 === '' ? preserved?.countedAt2 : new Date(),
      assignedToId: optionalObjectId(input.assignedToId ?? preserved?.assignedToId ?? ''),
      location: String(input.location ?? preserved?.location ?? '').trim(),
      varianceReason: normalizeVarianceReason(input.varianceReason ?? preserved?.varianceReason ?? ''),
    };
  });
}

async function replaceAuditItems(
  inventoryAuditId: Types.ObjectId,
  items: Array<Record<string, unknown>>,
  session: mongoose.ClientSession,
) {
  await InventoryAuditItem.deleteMany({ inventoryAuditId }).session(session);
  if (!items.length) return;
  await InventoryAuditItem.insertMany(
    items.map((item) => ({ ...item, inventoryAuditId })),
    { session },
  );
}

async function syncPhysicalCounts(
  audit: any,
  rawItems: any[],
  req: any,
  session: mongoose.ClientSession,
) {
  const items = await InventoryAuditItem.find({ inventoryAuditId: audit._id }).session(session);
  const incomingMap = new Map<string, any>();
  for (const item of rawItems || []) {
    const productId = String(item.productId || '').trim();
    if (productId) incomingMap.set(productId, item);
  }

  for (const item of items) {
    const incoming = incomingMap.get(String(item.productId || ''));
    if (!incoming) continue;
    const resolvedPhysical = toIntegerOrNull(incoming.physicalQuantity);
    if (Number.isNaN(resolvedPhysical)) {
      const error: any = new Error(`Số lượng thực tế của ${item.productCodeSnapshot || item.productNameSnapshot} phải là số nguyên không âm.`);
      error.status = 400;
      throw error;
    }
    const resolvedPhysical2 = toIntegerOrNull(incoming.physicalQuantity2);
    if (Number.isNaN(resolvedPhysical2)) {
      const error: any = new Error(`Số lượng đêm lần 2 của ${item.productCodeSnapshot || item.productNameSnapshot} phải là số nguyên không âm.`);
      error.status = 400;
      throw error;
    }
    item.physicalQuantity = resolvedPhysical === null ? null : Number(resolvedPhysical);
    item.physicalQuantity2 = resolvedPhysical2 === null ? null : Number(resolvedPhysical2);
    item.varianceQuantity = deriveVariance(Number(item.systemQuantitySnapshot || 0), item.physicalQuantity);
    item.note = String(incoming.note ?? item.note ?? '').trim();
    item.assignedToId = optionalObjectId(incoming.assignedToId ?? item.assignedToId ?? '');
    item.location = String(incoming.location ?? item.location ?? '').trim();
    item.varianceReason = normalizeVarianceReason(incoming.varianceReason ?? item.varianceReason ?? '');
    if (item.physicalQuantity === null) {
      item.countedById = undefined;
      item.countedAt = undefined;
    } else {
      item.countedById = actorId(req) || item.countedById;
      item.countedAt = new Date();
    }
    if (item.physicalQuantity2 === null) {
      item.countedById2 = undefined;
      item.countedAt2 = undefined;
    } else {
      item.countedById2 = optionalObjectId(incoming.countedById2) || item.countedById2 || actorId(req);
      item.countedAt2 = new Date();
    }
    await item.save({ session });
  }
}

async function branchNameMap(ids: string[]) {
  const branches = await Branch.find({ _id: { $in: ids.map((value) => new Types.ObjectId(value)) } }).lean();
  return new Map(branches.map((branch: any) => [String(branch._id), branch]));
}

async function userNameMap(ids: string[]) {
  const users = await mongoose.connection.collection('users')
    .find({ _id: { $in: ids.map((value) => new Types.ObjectId(value)) } }, { projection: { name: 1, email: 1 } })
    .toArray();
  return new Map(users.map((user: any) => [String(user._id), user]));
}

function userDisplay(userMap: Map<string, any>, id: unknown) {
  const user = userMap.get(String(id || ''));
  return user?.name || user?.email || '—';
}

function summarizeItems(items: any[]) {
  return items.reduce((summary, item) => {
    const systemQty = Number(item.systemQuantitySnapshot || 0);
    const physicalQty = item.physicalQuantity === null || item.physicalQuantity === undefined
      ? null
      : Number(item.physicalQuantity || 0);
    const variance = Number(item.varianceQuantity || 0);
    summary.itemCount += 1;
    summary.systemQuantityTotal += systemQty;
    summary.inTransitQuantityTotal += Number(item.inTransitQuantitySnapshot || 0);
    if (physicalQty !== null) summary.physicalQuantityTotal += physicalQty;
    summary.varianceQuantityTotal += variance;
    if (variance > 0) {
      summary.excessItemCount += 1;
      summary.totalIncreaseQuantity += variance;
    } else if (variance < 0) {
      summary.shortageItemCount += 1;
      summary.totalDecreaseQuantity += Math.abs(variance);
    } else {
      summary.zeroVarianceItemCount += 1;
    }
    if (physicalQty !== null) summary.countedItemCount += 1;
    return summary;
  }, {
    itemCount: 0,
    countedItemCount: 0,
    systemQuantityTotal: 0,
    inTransitQuantityTotal: 0,
    physicalQuantityTotal: 0,
    varianceQuantityTotal: 0,
    excessItemCount: 0,
    shortageItemCount: 0,
    zeroVarianceItemCount: 0,
    totalIncreaseQuantity: 0,
    totalDecreaseQuantity: 0,
  });
}

async function buildAuditView(audit: any, req: any, options?: { includeItems?: boolean; includeLogs?: boolean }) {
  const includeItems = Boolean(options?.includeItems);
  const includeLogs = Boolean(options?.includeLogs);
  const items = includeItems
    ? await InventoryAuditItem.find({ inventoryAuditId: audit._id }).sort({ productNameSnapshot: 1 }).lean()
    : [];
  const logs = includeLogs
    ? await InventoryAuditLog.find({ inventoryAuditId: audit._id }).sort({ createdAt: -1 }).lean()
    : [];

  const warehouseMap = await branchNameMap([String(audit.warehouseId)]);
  const userIds = [
    audit.createdById,
    audit.submittedById,
    audit.reconciledById,
    audit.cancelledById,
    ...items.map((item: any) => item.countedById).filter(Boolean),
    ...items.map((item: any) => item.countedById2).filter(Boolean),
    ...items.map((item: any) => item.assignedToId).filter(Boolean),
    ...logs.map((log: any) => log.actorId).filter(Boolean),
  ].filter(Boolean).map((value) => String(value));
  const users = await userNameMap([...new Set(userIds)]);
  const summary = summarizeItems(items);

  return {
    _id: String(audit._id),
    code: audit.code,
    warehouseId: String(audit.warehouseId),
    warehouseName: warehouseMap.get(String(audit.warehouseId))?.name || '—',
    auditType: audit.auditType,
    auditTypeLabel: auditTypeLabel(String(audit.auditType || '')),
    status: audit.status,
    statusLabel: auditStatusLabel(String(audit.status || '')),
    note: audit.note || '',
    snapshotAt: audit.snapshotAt,
    createdAt: audit.createdAt,
    updatedAt: audit.updatedAt,
    createdById: audit.createdById ? String(audit.createdById) : null,
    createdByName: userDisplay(users, audit.createdById),
    submittedById: audit.submittedById ? String(audit.submittedById) : null,
    submittedByName: userDisplay(users, audit.submittedById),
    submittedAt: audit.submittedAt,
    reconciledById: audit.reconciledById ? String(audit.reconciledById) : null,
    reconciledByName: userDisplay(users, audit.reconciledById),
    reconciledAt: audit.reconciledAt,
    cancelledById: audit.cancelledById ? String(audit.cancelledById) : null,
    cancelledByName: userDisplay(users, audit.cancelledById),
    cancelledAt: audit.cancelledAt,
    cancelReason: audit.cancelReason || '',
    linkedInventoryBillId: audit.linkedInventoryBillId ? String(audit.linkedInventoryBillId) : null,
    linkedInventoryBillIds: Array.isArray(audit.linkedInventoryBillIds)
      ? audit.linkedInventoryBillIds.map((value: any) => String(value))
      : [],
    linkedInventoryBillCodes: Array.isArray(audit.linkedInventoryBillCodes) ? audit.linkedInventoryBillCodes : [],
    mergedIntoAuditId: audit.mergedIntoAuditId ? String(audit.mergedIntoAuditId) : null,
    sourceAuditIds: Array.isArray(audit.sourceAuditIds) ? audit.sourceAuditIds.map((value: any) => String(value)) : [],
    version: Number(audit.version || 0),
    blindMode: Boolean(audit.blindMode),
    doubleCount: Boolean(audit.doubleCount),
    reversedById: audit.reversedById ? String(audit.reversedById) : null,
    reversedByName: userDisplay(users, audit.reversedById),
    reversedAt: audit.reversedAt,
    reversalVoucherIds: Array.isArray(audit.reversalVoucherIds) ? audit.reversalVoucherIds.map((value: any) => String(value)) : [],
    reversalVoucherCodes: Array.isArray(audit.reversalVoucherCodes) ? audit.reversalVoucherCodes : [],
    summary,
    canDelete: String(audit.status) === 'DRAFT' && !audit.linkedInventoryBillId && !(audit.linkedInventoryBillIds || []).length,
    availableActions: availableAuditActions(audit, summary, req.user),
    items: includeItems
      ? items.map((item: any) => ({
          _id: String(item._id),
          inventoryAuditId: String(item.inventoryAuditId),
          productId: String(item.productId),
          productCodeSnapshot: item.productCodeSnapshot || '',
          barcodeSnapshot: item.barcodeSnapshot || '',
          productNameSnapshot: item.productNameSnapshot || '',
          unitSnapshot: item.unitSnapshot || '',
          costPriceSnapshot: Number(item.costPriceSnapshot || 0),
          salePriceSnapshot: Number(item.salePriceSnapshot || 0),
          systemQuantitySnapshot: Number(item.systemQuantitySnapshot || 0),
          inTransitQuantitySnapshot: Number(item.inTransitQuantitySnapshot || 0),
          physicalQuantity: item.physicalQuantity === null || item.physicalQuantity === undefined ? null : Number(item.physicalQuantity || 0),
          physicalQuantity2: item.physicalQuantity2 === null || item.physicalQuantity2 === undefined ? null : Number(item.physicalQuantity2 || 0),
          varianceQuantity: Number(item.varianceQuantity || 0),
          note: item.note || '',
          varianceReason: item.varianceReason || '',
          varianceReasonLabel: varianceReasonLabel(String(item.varianceReason || '')),
          location: item.location || '',
          assignedToId: item.assignedToId ? String(item.assignedToId) : null,
          assignedToName: userDisplay(users, item.assignedToId),
          countedById: item.countedById ? String(item.countedById) : null,
          countedByName: userDisplay(users, item.countedById),
          countedAt: item.countedAt,
          countedById2: item.countedById2 ? String(item.countedById2) : null,
          countedByName2: userDisplay(users, item.countedById2),
          countedAt2: item.countedAt2,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        }))
      : undefined,
    logs: includeLogs
      ? logs.map((log: any) => ({
          _id: String(log._id),
          actionType: log.actionType,
          actorId: log.actorId ? String(log.actorId) : null,
          actorName: userDisplay(users, log.actorId),
          previousStatus: log.previousStatus || '',
          nextStatus: log.nextStatus || '',
          reason: log.reason || '',
          metadata: log.metadata || {},
          createdAt: log.createdAt,
        }))
      : undefined,
  };
}

function availableAuditActions(audit: any, summary: ReturnType<typeof summarizeItems>, user: any) {
  const actions: Array<{ action: string; label: string; needsReason?: boolean; danger?: boolean }> = [];
  const status = String(audit.status || 'DRAFT');
  const isAdmin = isAdminActor(user);
  const canAccessWarehouse = actorCanAccessWarehouse(user, audit.warehouseId);
  const alreadyMerged = Boolean(audit.mergedIntoAuditId);
  const hasLinkedBills = Boolean(audit.linkedInventoryBillId) || Boolean((audit.linkedInventoryBillIds || []).length);

  if (!canAccessWarehouse || alreadyMerged) return actions;

  if (['DRAFT', 'COUNTING'].includes(status)) {
    actions.push({ action: 'submit', label: 'Gửi kiểm kho' });
    actions.push({ action: 'cancel', label: 'Hủy phiếu', needsReason: true, danger: true });
  } else if (status === 'SUBMITTED') {
    if (isAdmin && summary.varianceQuantityTotal !== 0 && !hasLinkedBills) {
      actions.push({ action: 'reconcile', label: 'Bù trừ kiểm kho', danger: false });
    }
    actions.push({ action: 'cancel', label: 'Hủy phiếu', needsReason: true, danger: true });
  }

  return actions;
}

async function auditSummaryMap(audits: any[]) {
  const auditIds = audits.map((audit) => audit._id);
  const items = await InventoryAuditItem.find({ inventoryAuditId: { $in: auditIds } }).lean();
  const grouped = new Map<string, any[]>();
  for (const item of items) {
    const key = String(item.inventoryAuditId);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }
  return new Map(
    audits.map((audit) => [String(audit._id), summarizeItems(grouped.get(String(audit._id)) || [])]),
  );
}

function buildAuditFilter(req: any) {
  const filter: Record<string, any> = {};
  const assignedWarehouses = actorWarehouseIds(req.user);
  if (!isAdminActor(req.user)) {
    if (!assignedWarehouses.length) {
      const error: any = new Error('Bạn chưa được gán kho để xem kiểm kho.');
      error.status = 403;
      throw error;
    }
    filter.warehouseId = { $in: assignedWarehouses.map((value) => new Types.ObjectId(value)) };
  }

  const warehouseId = String(req.query.warehouseId || '').trim();
  if (warehouseId) {
    assertWarehouseScope(req, warehouseId);
    filter.warehouseId = objectId(warehouseId);
  }

  const auditType = String(req.query.auditType || '').trim();
  if (auditType) filter.auditType = auditType;

  const keyword = String(req.query.keyword || req.query.code || req.query.id || '').trim();
  if (keyword) filter.code = { $regex: escapeRegex(keyword), $options: 'i' };

  const auditId = String(req.query.auditId || '').trim();
  if (auditId) {
    const parsedAuditId = objectId(auditId);
    if (parsedAuditId) filter._id = parsedAuditId;
    else filter.code = { $regex: escapeRegex(auditId), $options: 'i' };
  }

  const note = String(req.query.note || '').trim();
  if (note) filter.note = { $regex: escapeRegex(note), $options: 'i' };

  const createdFrom = startOfDay(String(req.query.createdFrom || req.query.dateFrom || '').trim());
  const createdTo = endOfDay(String(req.query.createdTo || req.query.dateTo || '').trim());
  if (createdFrom || createdTo) {
    filter.createdAt = {};
    if (createdFrom) filter.createdAt.$gte = createdFrom;
    if (createdTo) filter.createdAt.$lte = createdTo;
  }

  const reconciledFrom = startOfDay(String(req.query.reconciledFrom || '').trim());
  const reconciledTo = endOfDay(String(req.query.reconciledTo || '').trim());
  if (reconciledFrom || reconciledTo) {
    filter.reconciledAt = {};
    if (reconciledFrom) filter.reconciledAt.$gte = reconciledFrom;
    if (reconciledTo) filter.reconciledAt.$lte = reconciledTo;
  }

  const reconciliationStatus = String(req.query.reconciliationStatus || '').trim().toUpperCase();
  if (reconciliationStatus === 'RECONCILED') filter.status = 'RECONCILED';
  if (reconciliationStatus === 'UNRECONCILED') filter.status = { $ne: 'RECONCILED' };
  if (AUDIT_STATUSES.includes(reconciliationStatus as any)) filter.status = reconciliationStatus;

  return filter;
}

function csvEscape(value: unknown) {
  const raw = value === null || value === undefined ? '' : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

async function createInventoryAuditVoucher(
  audit: any,
  warehouse: any,
  req: any,
  session: mongoose.ClientSession,
) {
  const items = await InventoryAuditItem.find({ inventoryAuditId: audit._id }).session(session);
  const positiveItems = items.filter((item: any) => Number(item.varianceQuantity || 0) > 0);
  const negativeItems = items.filter((item: any) => Number(item.varianceQuantity || 0) < 0);
  const createdVouchers: any[] = [];

  const createVoucher = async (
    type: 'INVENTORY_AUDIT_IMPORT' | 'INVENTORY_AUDIT_EXPORT',
    lines: any[],
  ) => {
    if (!lines.length) return;
    const voucherCode = makeVoucherCode(type === 'INVENTORY_AUDIT_IMPORT' ? 'PKKN' : 'PKKX');
    const totalQty = lines.reduce((sum, line) => sum + Math.abs(Number(line.varianceQuantity || 0)), 0);
    const totalAmount = lines.reduce((sum, line) => sum + Math.abs(Number(line.varianceQuantity || 0)) * Number(line.costPriceSnapshot || 0), 0);
    const [voucher] = await InventoryVoucher.create([{
      voucherId: voucherCode,
      date: new Date().toISOString(),
      warehouse: warehouse.name,
      warehouseCode: String(warehouse._id),
      type,
      relatedVoucher: audit.code,
      requestVoucher: audit.code,
      spCount: lines.length,
      qty: totalQty,
      totalAmount,
      creator: actorName(req),
      note: `${type} từ phiếu kiểm kho ${audit.code}`,
      inventoryAuditId: audit._id,
      inventoryAuditCode: audit.code,
    }], { session });

    for (const line of lines) {
      const variance = Number(line.varianceQuantity || 0);
      const quantity = Math.abs(variance);
      const isImport = variance > 0;
      const productLineId = `${type}-${audit.code}-${line.productCodeSnapshot}-${String(line._id)}`;
      await InventoryProduct.create([{
        id: productLineId,
        voucherId: voucherCode,
        date: new Date().toISOString(),
        warehouse: warehouse.name,
        productCode: line.productCodeSnapshot || '',
        productName: line.productNameSnapshot || '',
        barcode: line.barcodeSnapshot || '',
        type,
        importQty: isImport ? quantity : 0,
        exportQty: isImport ? 0 : quantity,
        price: Number(line.salePriceSnapshot || 0),
        cost: Number(line.costPriceSnapshot || 0),
        totalAmount: quantity * Number(line.costPriceSnapshot || 0),
        creator: actorName(req),
        unit: line.unitSnapshot || '',
        note: line.note || '',
        inventoryAuditId: audit._id,
        inventoryAuditCode: audit.code,
      }], { session });

      await moveStockStrict({
        productId: line.productId,
        branchId: audit.warehouseId,
        amount: variance,
        sourceType: type,
        sourceId: voucher._id,
        valueAfter: Number(line.costPriceSnapshot || 0),
        session,
      });
    }

    createdVouchers.push(voucher);
  };

  await createVoucher('INVENTORY_AUDIT_IMPORT', positiveItems);
  await createVoucher('INVENTORY_AUDIT_EXPORT', negativeItems);
  return createdVouchers;
}

async function moveStockStrict({
  productId,
  branchId,
  amount,
  sourceType,
  sourceId,
  valueAfter,
  session,
}: {
  productId: unknown;
  branchId: unknown;
  amount: number;
  sourceType: string;
  sourceId: unknown;
  valueAfter?: number;
  session: mongoose.ClientSession;
}) {
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
  } else {
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
    valueBefore: Number(product.price || 0),
    valueAfter: valueAfter ?? Number(product.price || 0),
    amountBefore: before,
    amountAfter: product.qty,
  }], { session });
}

router.get('/meta', async (req, res) => {
  try {
    const user = (req as any).user;
    const warehouseIds = actorWarehouseIds(user);
    const branchFilter = !isAdminActor(user)
      ? { _id: { $in: warehouseIds.map((value) => new Types.ObjectId(value)) }, isActive: { $ne: false } }
      : { isActive: { $ne: false } };
    const warehouses = await Branch.find(branchFilter).sort({ name: 1, _id: 1 }).select('name code').lean();
    res.json({
      role: isAdminActor(user) ? 'ADMIN' : 'EMPLOYEE',
      warehouses: warehouses.map((warehouse: any) => ({
        value: String(warehouse._id),
        label: warehouse.name,
        code: warehouse.code,
      })),
      auditTypes: AUDIT_TYPES.map((value) => ({ value, label: auditTypeLabel(value) })),
      statuses: AUDIT_STATUSES.map((value) => ({ value, label: auditStatusLabel(value) })),
      varianceReasons: VARIANCE_REASONS.map((value) => ({ value, label: varianceReasonLabel(value) })),
      reconciliationStatuses: [
        { value: 'UNRECONCILED', label: 'Chưa bù trừ' },
        { value: 'RECONCILED', label: 'Đã bù trừ' },
      ],
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Không tải được metadata kiểm kho.' });
  }
});

router.get('/assignable-users', async (req, res) => {
  try {
    const user = (req as any).user;
    const requestedWarehouseId = String(req.query.warehouseId || '').trim();
    const assignedWarehouses = actorWarehouseIds(user);
    const warehouseIds = requestedWarehouseId
      ? [requestedWarehouseId]
      : isAdminActor(user)
        ? []
        : assignedWarehouses;

    if (requestedWarehouseId) assertWarehouseScope(req, requestedWarehouseId);
    if (!isAdminActor(user) && !warehouseIds.length) {
      const error: any = new Error('Bạn chưa được gán kho để xem người đêm.');
      error.status = 403;
      throw error;
    }

    const filter: Record<string, any> = { deletedAt: { $exists: false } };
    if (warehouseIds.length) {
      filter.$or = [
        { defaultWarehouseId: { $in: warehouseIds.map((value) => new Types.ObjectId(value)) } },
        { assignedWarehouseIds: { $in: warehouseIds.map((value) => new Types.ObjectId(value)) } },
        { warehouseIds: { $in: warehouseIds.map((value) => new Types.ObjectId(value)) } },
        { branchIds: { $in: warehouseIds.map((value) => new Types.ObjectId(value)) } },
      ];
    }

    const users = await mongoose.connection.collection('users')
      .find(filter, { projection: { name: 1, email: 1, role: 1, status: 1, defaultWarehouseId: 1, assignedWarehouseIds: 1 } })
      .sort({ name: 1, email: 1 })
      .limit(500)
      .toArray();
    res.json({
      items: users.map((item: any) => ({
        value: String(item._id),
        label: item.name || item.email || String(item._id),
        email: item.email || '',
        role: item.role || '',
        status: item.status || '',
      })),
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Không tải được danh sách người đêm.' });
  }
});

router.get('/shelves', async (_req, res) => {
  try {
    const shelves = await Shelf.find({}).sort({ name: 1 }).select('name').limit(500).lean();
    res.json({ items: shelves.map((shelf: any) => ({ value: String(shelf._id), label: shelf.name || '' })) });
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Không tải được danh sách kệ.' });
  }
});

router.get('/dashboard', async (req, res) => {
  try {
    const filter = buildAuditFilter(req);
    const audits = await InventoryAudit.find(filter).sort({ createdAt: -1 }).limit(1000).lean();
    const summaryMap = await auditSummaryMap(audits);
    const byStatus = AUDIT_STATUSES.map((status) => ({
      status,
      label: auditStatusLabel(status),
      count: audits.filter((audit: any) => String(audit.status || '') === status).length,
    }));
    let totalVarianceQuantity = 0;
    let totalIncreaseQuantity = 0;
    let totalDecreaseQuantity = 0;
    let countedItemCount = 0;
    let itemCount = 0;
    for (const audit of audits) {
      const summary = summaryMap.get(String(audit._id)) || summarizeItems([]);
      totalVarianceQuantity += Number(summary.varianceQuantityTotal || 0);
      totalIncreaseQuantity += Number(summary.totalIncreaseQuantity || 0);
      totalDecreaseQuantity += Number(summary.totalDecreaseQuantity || 0);
      countedItemCount += Number(summary.countedItemCount || 0);
      itemCount += Number(summary.itemCount || 0);
    }
    res.json({
      totalAudits: audits.length,
      byStatus,
      itemCount,
      countedItemCount,
      totalVarianceQuantity,
      totalIncreaseQuantity,
      totalDecreaseQuantity,
      recentAudits: audits.slice(0, 6).map((audit: any) => ({
        _id: String(audit._id),
        code: audit.code,
        status: audit.status,
        statusLabel: auditStatusLabel(String(audit.status || '')),
        createdAt: audit.createdAt,
        summary: summaryMap.get(String(audit._id)) || summarizeItems([]),
      })),
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Không tải được dashboard kiểm kho.' });
  }
});

router.get('/suggestions', async (req, res) => {
  try {
    const warehouseId = String(req.query.warehouseId || '').trim();
    if (!warehouseId) {
      const error: any = new Error('Vui lòng chọn kho để xem gợi ý kiểm kho.');
      error.status = 400;
      throw error;
    }
    assertWarehouseScope(req, warehouseId);
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const recentItems = await InventoryAuditItem.find({ updatedAt: { $gte: since } }).sort({ updatedAt: -1 }).limit(5000).lean();
    const recentByProduct = new Map<string, any>();
    for (const item of recentItems) {
      const key = String(item.productId || '');
      if (!recentByProduct.has(key)) recentByProduct.set(key, item);
    }
    const stocks = await ProductBranchStock.find({ branchId: objectId(warehouseId), qty: { $gt: 0 } }).sort({ qty: -1 }).limit(300).lean();
    const productIds = stocks.map((stock: any) => String(stock.productId || '')).filter(Boolean);
    const products = await Product.find({ _id: { $in: productIds.map((value) => new Types.ObjectId(value)) }, type: { $ne: 'service' } }).lean();
    const productMap = new Map(products.map((product: any) => [String(product._id), product]));
    const suggestions = stocks.map((stock: any) => {
      const product = productMap.get(String(stock.productId));
      const last = recentByProduct.get(String(stock.productId));
      const daysSinceCount = last?.updatedAt ? Math.floor((Date.now() - new Date(last.updatedAt).getTime()) / 86400000) : null;
      const absVariance = Math.abs(Number(last?.varianceQuantity || 0));
      const stockQty = Number(stock.qty || 0);
      const riskScore = (daysSinceCount === null ? 45 : Math.min(daysSinceCount, 120)) + absVariance * 5 + Math.min(stockQty, 200) / 10;
      const reasons: string[] = [];
      if (daysSinceCount === null) reasons.push('Chưa từng kiểm gần đây');
      if (daysSinceCount !== null && daysSinceCount >= 30) reasons.push(`Đã ${daysSinceCount} ngày chưa kiểm`);
      if (absVariance > 0) reasons.push(`Lần trước lệch ${absVariance}`);
      if (stockQty >= 20) reasons.push(`Tồn hiện tại cao (${stockQty})`);
      return product ? {
        productId: String(product._id),
        productCode: product.code || '',
        productName: product.name || '',
        barcode: product.barcode || '',
        unit: product.unit || '',
        currentStock: stockQty,
        lastAuditAt: last?.updatedAt || null,
        lastVarianceQuantity: Number(last?.varianceQuantity || 0),
        riskScore,
        reasons,
      } : null;
    }).filter(Boolean).sort((a: any, b: any) => b.riskScore - a.riskScore).slice(0, 30);
    res.json({ items: suggestions });
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Không tải được gợi ý kiểm kho.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const filter = buildAuditFilter(req);
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 200);
    const sortField = String(req.query.sort || 'createdAt');
    const sortOrder = String(req.query.order || 'desc') === 'asc' ? 1 : -1;

    const [audits, total] = await Promise.all([
      InventoryAudit.find(filter)
        .sort({ [sortField]: sortOrder, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      InventoryAudit.countDocuments(filter),
    ]);

    const summaryMap = await auditSummaryMap(audits);
    const warehouseMap = await branchNameMap([...new Set(audits.map((audit: any) => String(audit.warehouseId)))]);
    const userIds = [
      ...audits.map((audit: any) => audit.createdById),
      ...audits.map((audit: any) => audit.submittedById),
      ...audits.map((audit: any) => audit.reconciledById),
      ...audits.map((audit: any) => audit.cancelledById),
    ].filter(Boolean).map((value) => String(value));
    const userMap = await userNameMap([...new Set(userIds)]);

    const items = audits.map((audit: any) => {
      const summary = summaryMap.get(String(audit._id)) || summarizeItems([]);
      return {
        _id: String(audit._id),
        code: audit.code,
        warehouseId: String(audit.warehouseId),
        warehouseName: warehouseMap.get(String(audit.warehouseId))?.name || '—',
        auditType: audit.auditType,
        auditTypeLabel: auditTypeLabel(String(audit.auditType || '')),
        status: audit.status,
        statusLabel: auditStatusLabel(String(audit.status || '')),
        note: audit.note || '',
        blindMode: Boolean(audit.blindMode),
        doubleCount: Boolean(audit.doubleCount),
        createdAt: audit.createdAt,
        updatedAt: audit.updatedAt,
        snapshotAt: audit.snapshotAt,
        createdByName: userDisplay(userMap, audit.createdById),
        submittedByName: userDisplay(userMap, audit.submittedById),
        reconciledByName: userDisplay(userMap, audit.reconciledById),
        submittedAt: audit.submittedAt,
        reconciledAt: audit.reconciledAt,
        linkedInventoryBillId: audit.linkedInventoryBillId ? String(audit.linkedInventoryBillId) : null,
        linkedInventoryBillIds: Array.isArray(audit.linkedInventoryBillIds)
          ? audit.linkedInventoryBillIds.map((value: any) => String(value))
          : [],
        linkedInventoryBillCodes: Array.isArray(audit.linkedInventoryBillCodes) ? audit.linkedInventoryBillCodes : [],
        mergedIntoAuditId: audit.mergedIntoAuditId ? String(audit.mergedIntoAuditId) : null,
        summary,
        canDelete: String(audit.status) === 'DRAFT' && !audit.linkedInventoryBillId && !(audit.linkedInventoryBillIds || []).length,
        availableActions: availableAuditActions(audit, summary, (req as any).user),
      };
    });

    res.json({ items, total, page, limit });
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Không tải được danh sách kiểm kho.' });
  }
});

router.get('/export', async (req, res) => {
  try {
    const filter = buildAuditFilter(req);
    const audits = await InventoryAudit.find(filter).sort({ createdAt: -1 }).limit(5000).lean();
    const summaryMap = await auditSummaryMap(audits);
    const warehouseMap = await branchNameMap([...new Set(audits.map((audit: any) => String(audit.warehouseId)))]);
    const userMap = await userNameMap(
      [...new Set(audits.map((audit: any) => String(audit.createdById || '')).filter(Boolean))],
    );

    const lines = [
      ['Mã phiếu', 'Ngày tạo', 'Kho', 'Loại kiểm kho', 'Trạng thái', 'Người tạo', 'Số dòng', 'Tổng tồn hệ thống', 'Tổng tồn thực tế', 'Tổng chênh lệch', 'Ghi chú'],
      ...audits.map((audit: any) => {
        const summary = summaryMap.get(String(audit._id)) || summarizeItems([]);
        return [
          audit.code,
          audit.createdAt ? new Date(audit.createdAt).toLocaleString('vi-VN') : '',
          warehouseMap.get(String(audit.warehouseId))?.name || '',
          auditTypeLabel(String(audit.auditType || '')),
          auditStatusLabel(String(audit.status || '')),
          userDisplay(userMap, audit.createdById),
          summary.itemCount,
          summary.systemQuantityTotal,
          summary.physicalQuantityTotal,
          summary.varianceQuantityTotal,
          audit.note || '',
        ];
      }),
    ];

    const csv = lines.map((line) => line.map(csvEscape).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory-audits.csv"');
    res.send(`\uFEFF${csv}`);
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Không xuất được dữ liệu kiểm kho.' });
  }
});

router.post('/', async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let created: any = null;
    await session.withTransaction(async () => {
      const warehouse = await ensureActiveWarehouse(req.body.warehouseId);
      assertWarehouseScope(req, warehouse._id);
      const auditType = String(req.body.auditType || 'BY_PRODUCT').trim().toUpperCase();
      if (!AUDIT_TYPES.includes(auditType as any)) {
        const error: any = new Error('Loại kiểm kho không hợp lệ.');
        error.status = 400;
        throw error;
      }

      const status = String(req.body.status || 'DRAFT').trim().toUpperCase();
      if (!['DRAFT', 'COUNTING'].includes(status)) {
        const error: any = new Error('Chỉ được tạo phiếu ở trạng thái Nháp hoặc Đang kiểm.');
        error.status = 400;
        throw error;
      }

      const items = await buildSnapshotItems(auditType, String(warehouse._id), Array.isArray(req.body.items) ? req.body.items : []);
      const [audit] = await InventoryAudit.create([{
        code: req.body.code || makeAuditCode(),
        warehouseId: warehouse._id,
        auditType,
        status,
        note: String(req.body.note || '').trim(),
        blindMode: booleanInput(req.body.blindMode),
        doubleCount: booleanInput(req.body.doubleCount),
        snapshotAt: new Date(),
        createdById: actorId(req),
        version: 0,
      }], { session });

      await replaceAuditItems(audit._id, items, session);
      await writeAuditLog(audit._id, req, 'CREATE', '', status, '', { itemCount: items.length, auditType }, session);
      created = audit;
    });

    const audit = await loadAuditOrThrow(String(created._id));
    res.status(201).json(await buildAuditView(audit, req, { includeItems: true, includeLogs: true }));
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Không tạo được phiếu kiểm kho.' });
  } finally {
    await session.endSession();
  }
});

router.post('/merge', async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let mergedAuditId = '';
    await session.withTransaction(async () => {
      const rawIds = Array.isArray(req.body.auditIds) ? req.body.auditIds : [];
      const auditIds = [...new Set<string>(rawIds.map((value: unknown) => String(value || '').trim()).filter(Boolean) as string[])];
      if (auditIds.length < 2) {
        const error: any = new Error('Vui lòng chọn ít nhất hai phiếu kiểm kho để gộp.');
        error.status = 400;
        throw error;
      }

      const audits = await InventoryAudit.find({
        _id: { $in: auditIds.map((value) => new Types.ObjectId(value)) },
      }).session(session);
      if (audits.length !== auditIds.length) {
        const error: any = new Error('Có phiếu kiểm kho không còn tồn tại.');
        error.status = 404;
        throw error;
      }

      const warehouseId = String(audits[0].warehouseId);
      for (const audit of audits) {
        assertWarehouseScope(req, audit.warehouseId);
        if (String(audit.warehouseId) !== warehouseId) {
          const error: any = new Error('Chỉ được gộp các phiếu cùng kho hàng.');
          error.status = 409;
          throw error;
        }
        if (['RECONCILED', 'CANCELLED'].includes(String(audit.status || ''))) {
          const error: any = new Error(`Phiếu ${audit.code} không ở trạng thái hợp lệ để gộp.`);
          error.status = 409;
          throw error;
        }
        if (audit.linkedInventoryBillId || (audit.linkedInventoryBillIds || []).length) {
          const error: any = new Error(`Phiếu ${audit.code} đã có chứng từ bù trừ nên không thể gộp.`);
          error.status = 409;
          throw error;
        }
        if (audit.mergedIntoAuditId) {
          const error: any = new Error(`Phiếu ${audit.code} đã được gộp vào phiếu khác.`);
          error.status = 409;
          throw error;
        }
      }

      const items = await InventoryAuditItem.find({
        inventoryAuditId: { $in: audits.map((audit) => audit._id) },
      }).session(session);
      const seenProductIds = new Set<string>();
      for (const item of items) {
        const productId = String(item.productId || '');
        if (seenProductIds.has(productId)) {
          const error: any = new Error('Không thể gộp phiếu khi có sản phẩm trùng giữa các phiếu nguồn.');
          error.status = 409;
          throw error;
        }
        seenProductIds.add(productId);
      }

      const newestSnapshotAt = audits
        .map((audit) => audit.snapshotAt || audit.createdAt)
        .filter(Boolean)
        .sort((a: any, b: any) => new Date(b).getTime() - new Date(a).getTime())[0];
      const [mergedAudit] = await InventoryAudit.create([{
        code: makeAuditCode(),
        warehouseId: audits[0].warehouseId,
        auditType: 'BY_PRODUCT',
        status: 'DRAFT',
        note: String(req.body.note || '').trim() || `Gộp từ ${audits.map((audit) => audit.code).join(', ')}`,
        snapshotAt: newestSnapshotAt || new Date(),
        createdById: actorId(req),
        sourceAuditIds: audits.map((audit) => audit._id),
        version: 0,
      }], { session });

      await replaceAuditItems(mergedAudit._id, items.map((item: any) => ({
        productId: item.productId,
        productCodeSnapshot: item.productCodeSnapshot,
        barcodeSnapshot: item.barcodeSnapshot,
        productNameSnapshot: item.productNameSnapshot,
        unitSnapshot: item.unitSnapshot,
        costPriceSnapshot: item.costPriceSnapshot,
        salePriceSnapshot: item.salePriceSnapshot,
        systemQuantitySnapshot: item.systemQuantitySnapshot,
        inTransitQuantitySnapshot: item.inTransitQuantitySnapshot,
        physicalQuantity: item.physicalQuantity,
        physicalQuantity2: item.physicalQuantity2,
        varianceQuantity: item.varianceQuantity,
        note: item.note,
        countedById: item.countedById,
        countedAt: item.countedAt,
        countedById2: item.countedById2,
        countedAt2: item.countedAt2,
        assignedToId: item.assignedToId,
        location: item.location,
        varianceReason: item.varianceReason,
      })), session);

      for (const audit of audits) {
        audit.mergedIntoAuditId = mergedAudit._id;
        audit.version = Number(audit.version || 0) + 1;
        await audit.save({ session });
        await writeAuditLog(audit._id, req, 'MERGED_SOURCE', String(audit.status || ''), String(audit.status || ''), '', {
          mergedIntoAuditId: mergedAudit._id,
          mergedIntoAuditCode: mergedAudit.code,
        }, session);
      }

      await writeAuditLog(mergedAudit._id, req, 'MERGE_CREATE', '', 'DRAFT', '', {
        sourceAuditIds: audits.map((audit) => String(audit._id)),
        sourceAuditCodes: audits.map((audit) => audit.code),
      }, session);
      mergedAuditId = String(mergedAudit._id);
    });

    const mergedAudit = await loadAuditOrThrow(mergedAuditId);
    res.status(201).json(await buildAuditView(mergedAudit, req, { includeItems: true, includeLogs: true }));
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Không gộp được phiếu kiểm kho.' });
  } finally {
    await session.endSession();
  }
});

router.get('/:id', async (req, res) => {
  try {
    const audit = await loadAuditOrThrow(String(req.params.id || ''));
    assertWarehouseScope(req, audit.warehouseId);
    res.json(await buildAuditView(audit, req, { includeItems: true, includeLogs: true }));
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Không tải được chi tiết phiếu kiểm kho.' });
  }
});

router.patch('/:id', async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const audit = await loadAuditOrThrow(String(req.params.id || ''), session);
      assertWarehouseScope(req, audit.warehouseId);
      if (['SUBMITTED', 'RECONCILED', 'CANCELLED'].includes(String(audit.status || ''))) {
        const error: any = new Error('Phiếu hiện tại không cho phép chỉnh sửa.');
        error.status = 409;
        throw error;
      }
      if (audit.mergedIntoAuditId) {
        const error: any = new Error('Phiếu nguồn đã được gộp nên không thể chỉnh sửa.');
        error.status = 409;
        throw error;
      }

      const previousStatus = String(audit.status || 'DRAFT');
      audit.note = String(req.body.note ?? audit.note ?? '').trim();
      if ('blindMode' in req.body) audit.blindMode = booleanInput(req.body.blindMode);
      if ('doubleCount' in req.body) audit.doubleCount = booleanInput(req.body.doubleCount);

      if (previousStatus === 'COUNTING') {
        if (req.body.warehouseId || req.body.auditType) {
          const error: any = new Error('Phiếu đang kiểm không được đổi kho hoặc loại kiểm kho.');
          error.status = 409;
          throw error;
        }
        if (Array.isArray(req.body.items)) {
          await syncPhysicalCounts(audit, req.body.items, req, session);
        }
        if (String(req.body.status || '').trim().toUpperCase() === 'DRAFT') {
          audit.status = 'DRAFT';
        }
      } else {
        const nextWarehouseId = String(req.body.warehouseId || audit.warehouseId);
        const nextAuditType = String(req.body.auditType || audit.auditType).trim().toUpperCase();
        if (!AUDIT_TYPES.includes(nextAuditType as any)) {
          const error: any = new Error('Loại kiểm kho không hợp lệ.');
          error.status = 400;
          throw error;
        }

        if (nextWarehouseId !== String(audit.warehouseId) || nextAuditType !== String(audit.auditType) || Array.isArray(req.body.items)) {
          const warehouse = await ensureActiveWarehouse(nextWarehouseId);
          assertWarehouseScope(req, warehouse._id);
          const currentItems = await InventoryAuditItem.find({ inventoryAuditId: audit._id }).session(session);
          const preserveMap = new Map(currentItems.map((item: any) => [String(item.productId), item]));
          const snapshotItems = await buildSnapshotItems(
            nextAuditType,
            String(warehouse._id),
            Array.isArray(req.body.items)
              ? req.body.items
              : currentItems.map((item: any) => ({
                  productId: item.productId,
                  physicalQuantity: item.physicalQuantity,
                  physicalQuantity2: item.physicalQuantity2,
                  note: item.note,
                  assignedToId: item.assignedToId,
                  location: item.location,
                  varianceReason: item.varianceReason,
                })),
            preserveMap,
          );
          audit.warehouseId = warehouse._id;
          audit.auditType = nextAuditType as any;
          audit.snapshotAt = new Date();
          await replaceAuditItems(audit._id, snapshotItems, session);
        } else if (Array.isArray(req.body.items)) {
          await syncPhysicalCounts(audit, req.body.items, req, session);
        }

        const requestedStatus = String(req.body.status || '').trim().toUpperCase();
        if (['DRAFT', 'COUNTING'].includes(requestedStatus)) {
          audit.status = requestedStatus as any;
        }
      }

      audit.version = Number(audit.version || 0) + 1;
      await audit.save({ session });
      await writeAuditLog(audit._id, req, 'UPDATE', previousStatus, String(audit.status || previousStatus), '', {
        version: audit.version,
      }, session);
    });

    const audit = await loadAuditOrThrow(String(req.params.id || ''));
    res.json(await buildAuditView(audit, req, { includeItems: true, includeLogs: true }));
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Không cập nhật được phiếu kiểm kho.' });
  } finally {
    await session.endSession();
  }
});

router.post('/:id/resnapshot', async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const audit = await loadAuditOrThrow(String(req.params.id || ''), session);
      assertWarehouseScope(req, audit.warehouseId);
      if (!['DRAFT', 'COUNTING'].includes(String(audit.status || ''))) {
        const error: any = new Error('Chỉ phiếu nháp hoặc đang kiểm mới được cập nhật lại snapshot.');
        error.status = 409;
        throw error;
      }
      const currentItems = await InventoryAuditItem.find({ inventoryAuditId: audit._id }).session(session);
      const preserveMap = new Map(currentItems.map((item: any) => [String(item.productId), item]));
      const snapshotItems = await buildSnapshotItems(
        String(audit.auditType || 'BY_PRODUCT'),
        String(audit.warehouseId),
        currentItems.map((item: any) => ({
          productId: item.productId,
          physicalQuantity: item.physicalQuantity,
          physicalQuantity2: item.physicalQuantity2,
          note: item.note,
          assignedToId: item.assignedToId,
          location: item.location,
          varianceReason: item.varianceReason,
        })),
        preserveMap,
      );
      await replaceAuditItems(audit._id, snapshotItems, session);
      const previousSnapshotAt = audit.snapshotAt;
      audit.snapshotAt = new Date();
      audit.version = Number(audit.version || 0) + 1;
      await audit.save({ session });
      await writeAuditLog(audit._id, req, 'RESNAPSHOT', String(audit.status || ''), String(audit.status || ''), '', {
        previousSnapshotAt,
        itemCount: snapshotItems.length,
      }, session);
    });

    const audit = await loadAuditOrThrow(String(req.params.id || ''));
    res.json(await buildAuditView(audit, req, { includeItems: true, includeLogs: true }));
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Không cập nhật lại snapshot kiểm kho được.' });
  } finally {
    await session.endSession();
  }
});

async function createInventoryAuditReversalVoucher(
  audit: any,
  warehouse: any,
  req: any,
  session: mongoose.ClientSession,
) {
  const items = await InventoryAuditItem.find({ inventoryAuditId: audit._id }).session(session);
  const reverseImportItems = items.filter((item: any) => Number(item.varianceQuantity || 0) < 0);
  const reverseExportItems = items.filter((item: any) => Number(item.varianceQuantity || 0) > 0);
  const createdVouchers: any[] = [];

  const createVoucher = async (
    type: 'INVENTORY_AUDIT_IMPORT' | 'INVENTORY_AUDIT_EXPORT',
    lines: any[],
  ) => {
    if (!lines.length) return;
    const voucherCode = makeVoucherCode(type === 'INVENTORY_AUDIT_IMPORT' ? 'PKKNR' : 'PKKXR');
    const totalQty = lines.reduce((sum, line) => sum + Math.abs(Number(line.varianceQuantity || 0)), 0);
    const totalAmount = lines.reduce((sum, line) => sum + Math.abs(Number(line.varianceQuantity || 0)) * Number(line.costPriceSnapshot || 0), 0);
    const [voucher] = await InventoryVoucher.create([{
      voucherId: voucherCode,
      date: new Date().toISOString(),
      warehouse: warehouse.name,
      warehouseCode: String(warehouse._id),
      type,
      relatedVoucher: audit.code,
      requestVoucher: audit.code,
      spCount: lines.length,
      qty: totalQty,
      totalAmount,
      creator: actorName(req),
      note: `Đảo bù trừ từ phiếu kiểm kho ${audit.code}`,
      inventoryAuditId: audit._id,
      inventoryAuditCode: audit.code,
      reversalOfInventoryAuditId: audit._id,
      reversalOfInventoryAuditCode: audit.code,
    }], { session });

    for (const line of lines) {
      const variance = Number(line.varianceQuantity || 0);
      const reverseAmount = -variance;
      const quantity = Math.abs(variance);
      const isImport = reverseAmount > 0;
      const productLineId = `${type}-REV-${audit.code}-${line.productCodeSnapshot}-${String(line._id)}`;
      await InventoryProduct.create([{
        id: productLineId,
        voucherId: voucherCode,
        date: new Date().toISOString(),
        warehouse: warehouse.name,
        productCode: line.productCodeSnapshot || '',
        productName: line.productNameSnapshot || '',
        barcode: line.barcodeSnapshot || '',
        type,
        importQty: isImport ? quantity : 0,
        exportQty: isImport ? 0 : quantity,
        price: Number(line.salePriceSnapshot || 0),
        cost: Number(line.costPriceSnapshot || 0),
        totalAmount: quantity * Number(line.costPriceSnapshot || 0),
        creator: actorName(req),
        unit: line.unitSnapshot || '',
        note: line.note || '',
        inventoryAuditId: audit._id,
        inventoryAuditCode: audit.code,
        reversalOfInventoryAuditId: audit._id,
        reversalOfInventoryAuditCode: audit.code,
      }], { session });

      await moveStockStrict({
        productId: line.productId,
        branchId: audit.warehouseId,
        amount: reverseAmount,
        sourceType: `${type}_REVERSAL`,
        sourceId: voucher._id,
        valueAfter: Number(line.costPriceSnapshot || 0),
        session,
      });
    }

    createdVouchers.push(voucher);
  };

  await createVoucher('INVENTORY_AUDIT_IMPORT', reverseImportItems);
  await createVoucher('INVENTORY_AUDIT_EXPORT', reverseExportItems);
  return createdVouchers;
}

router.post('/:id/reverse-reconcile', async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let auditId = '';
    await session.withTransaction(async () => {
      const audit = await loadAuditOrThrow(String(req.params.id || ''), session);
      assertWarehouseScope(req, audit.warehouseId);
      assertAdminReconcile(req);
      if (String(audit.status || '') !== 'RECONCILED' || !(audit.linkedInventoryBillIds || []).length) {
        const error: any = new Error('Chỉ phiếu đã bù trừ mới được đảo bù trừ.');
        error.status = 409;
        throw error;
      }
      if (audit.reversedAt) {
        const error: any = new Error('Phiếu này đã được đảo bù trừ trước đó.');
        error.status = 409;
        throw error;
      }
      const warehouse = await ensureActiveWarehouse(audit.warehouseId);
      const reversalVouchers = await createInventoryAuditReversalVoucher(audit, warehouse, req, session);
      const currentItems = await InventoryAuditItem.find({ inventoryAuditId: audit._id }).session(session);
      const preserveMap = new Map(currentItems.map((item: any) => [String(item.productId), item]));
      const snapshotItems = await buildSnapshotItems(
        String(audit.auditType || 'BY_PRODUCT'),
        String(audit.warehouseId),
        currentItems.map((item: any) => ({
          productId: item.productId,
          physicalQuantity: item.physicalQuantity,
          physicalQuantity2: item.physicalQuantity2,
          note: item.note,
          assignedToId: item.assignedToId,
          location: item.location,
          varianceReason: item.varianceReason,
        })),
        preserveMap,
      );
      await replaceAuditItems(audit._id, snapshotItems, session);
      audit.status = 'SUBMITTED';
      audit.reversedById = actorId(req);
      audit.reversedAt = new Date();
      audit.reversalVoucherIds = reversalVouchers.map((voucher: any) => voucher._id);
      audit.reversalVoucherCodes = reversalVouchers.map((voucher: any) => voucher.voucherId);
      audit.linkedInventoryBillId = undefined;
      audit.linkedInventoryBillIds = [];
      audit.linkedInventoryBillCodes = [];
      audit.reconciledById = undefined;
      audit.reconciledAt = undefined;
      audit.snapshotAt = new Date();
      audit.version = Number(audit.version || 0) + 1;
      await audit.save({ session });
      await writeAuditLog(audit._id, req, 'REVERSE_RECONCILE', 'RECONCILED', 'SUBMITTED', String(req.body.reason || '').trim(), {
        reversalVoucherIds: reversalVouchers.map((voucher: any) => String(voucher._id)),
        reversalVoucherCodes: reversalVouchers.map((voucher: any) => voucher.voucherId),
      }, session);
      auditId = String(audit._id);
    });

    const audit = await loadAuditOrThrow(auditId || String(req.params.id || ''));
    res.json(await buildAuditView(audit, req, { includeItems: true, includeLogs: true }));
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Không đảo bù trừ kiểm kho được.' });
  } finally {
    await session.endSession();
  }
});

router.post('/:id/submit', async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const audit = await loadAuditOrThrow(String(req.params.id || ''), session);
      assertWarehouseScope(req, audit.warehouseId);
      if (!['DRAFT', 'COUNTING'].includes(String(audit.status || ''))) {
        const error: any = new Error('Chỉ phiếu nháp hoặc đang kiểm mới được submit.');
        error.status = 409;
        throw error;
      }
      if (audit.mergedIntoAuditId) {
        const error: any = new Error('Phiếu nguồn đã được gộp nên không thể submit.');
        error.status = 409;
        throw error;
      }

      const items = await InventoryAuditItem.find({ inventoryAuditId: audit._id }).session(session);
      if (!items.length) {
        const error: any = new Error('Phiếu kiểm kho không có sản phẩm nào.');
        error.status = 400;
        throw error;
      }
      for (const item of items) {
        const physical = toIntegerOrNull(item.physicalQuantity);
        if (physical === null || Number.isNaN(physical)) {
          const error: any = new Error(`Sản phẩm ${item.productCodeSnapshot || item.productNameSnapshot} chưa có tồn thực tế hợp lệ.`);
          error.status = 400;
          throw error;
        }
        if (Boolean(audit.doubleCount)) {
          const physical2 = toIntegerOrNull(item.physicalQuantity2);
          if (physical2 === null || Number.isNaN(physical2)) {
            const error: any = new Error(`Sản phẩm ${item.productCodeSnapshot || item.productNameSnapshot} chưa có số đêm lần 2 hợp lệ.`);
            error.status = 400;
            throw error;
          }
          if (Number(physical2) !== Number(physical)) {
            const error: any = new Error(`Sản phẩm ${item.productCodeSnapshot || item.productNameSnapshot} lệch giữa 2 lần đêm. Vui lòng kiểm lại trước khi submit.`);
            error.status = 409;
            throw error;
          }
          item.physicalQuantity2 = Number(physical2);
          item.countedById2 = item.countedById2 || actorId(req);
          item.countedAt2 = item.countedAt2 || new Date();
        }
        item.physicalQuantity = Number(physical);
        item.varianceQuantity = deriveVariance(Number(item.systemQuantitySnapshot || 0), item.physicalQuantity);
        if (Number(item.varianceQuantity || 0) !== 0 && !normalizeVarianceReason(item.varianceReason)) {
          const error: any = new Error(`Sản phẩm ${item.productCodeSnapshot || item.productNameSnapshot} đang có chênh lệch, vui lòng chọn lý do chênh lệch.`);
          error.status = 400;
          throw error;
        }
        item.countedById = actorId(req) || item.countedById;
        item.countedAt = new Date();
        await item.save({ session });
      }

      const previousStatus = String(audit.status || 'DRAFT');
      audit.status = 'SUBMITTED';
      audit.submittedById = actorId(req);
      audit.submittedAt = new Date();
      audit.version = Number(audit.version || 0) + 1;
      await audit.save({ session });
      await writeAuditLog(audit._id, req, 'SUBMIT', previousStatus, 'SUBMITTED', '', {}, session);
    });

    const audit = await loadAuditOrThrow(String(req.params.id || ''));
    res.json(await buildAuditView(audit, req, { includeItems: true, includeLogs: true }));
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Không submit được phiếu kiểm kho.' });
  } finally {
    await session.endSession();
  }
});

router.post('/:id/reconcile', async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let responseAuditId = '';
    await session.withTransaction(async () => {
      const current = await loadAuditOrThrow(String(req.params.id || ''), session);
      assertWarehouseScope(req, current.warehouseId);
      assertAdminReconcile(req);

      if (String(current.status || '') === 'RECONCILED' && (current.linkedInventoryBillIds || []).length) {
        responseAuditId = String(current._id);
        return;
      }
      if (String(current.status || '') !== 'SUBMITTED') {
        const error: any = new Error('Chỉ phiếu đã submit mới được bù trừ.');
        error.status = 409;
        throw error;
      }
      if (current.mergedIntoAuditId) {
        const error: any = new Error('Phiếu nguồn đã được gộp nên không thể bù trừ.');
        error.status = 409;
        throw error;
      }
      if (current.linkedInventoryBillId || (current.linkedInventoryBillIds || []).length) {
        responseAuditId = String(current._id);
        return;
      }
      if (current.reconcileLockToken) {
        const error: any = new Error('Phiếu đang được bù trừ ở một yêu cầu khác.');
        error.status = 409;
        throw error;
      }

      const lockToken = new Types.ObjectId().toString();
      const audit = await InventoryAudit.findOneAndUpdate(
        { _id: current._id, status: 'SUBMITTED', reconcileLockToken: { $exists: false } },
        { $set: { reconcileLockToken: lockToken } },
        { new: true, session },
      );
      if (!audit) {
        const error: any = new Error('Phiếu đã thay đổi trạng thái trước khi bù trừ. Vui lòng tải lại.');
        error.status = 409;
        throw error;
      }

      const warehouse = await ensureActiveWarehouse(audit.warehouseId);
      const items = await InventoryAuditItem.find({ inventoryAuditId: audit._id }).session(session);
      const nonZeroItems = items.filter((item: any) => Number(item.varianceQuantity || 0) !== 0);
      if (!nonZeroItems.length) {
        const error: any = new Error('Phiếu không có dòng chênh lệch để bù trừ.');
        error.status = 400;
        throw error;
      }
      for (const item of items) {
        const physical = toIntegerOrNull(item.physicalQuantity);
        if (physical === null || Number.isNaN(physical)) {
          const error: any = new Error(`Sản phẩm ${item.productCodeSnapshot || item.productNameSnapshot} chưa có tồn thực tế hợp lệ.`);
          error.status = 400;
          throw error;
        }
      }

      const conflict = await ProductLog.findOne({
        productId: { $in: nonZeroItems.map((item: any) => item.productId) },
        createdAt: { $gt: audit.snapshotAt || audit.createdAt },
      }).sort({ createdAt: 1 }).session(session);
      if (conflict) {
        const conflictItem = nonZeroItems.find((item: any) => String(item.productId) === String(conflict.productId));
        const error: any = new Error(`Tồn kho đã biến động trong lúc kiểm ở sản phẩm ${conflictItem?.productCodeSnapshot || conflictItem?.productNameSnapshot || ''}. Vui lòng tạo lại hoặc kiểm lại phiếu.`);
        error.status = 409;
        throw error;
      }

      const createdVouchers = await createInventoryAuditVoucher(audit, warehouse, req, session);
      audit.linkedInventoryBillId = createdVouchers[0]?._id;
      audit.linkedInventoryBillIds = createdVouchers.map((voucher: any) => voucher._id);
      audit.linkedInventoryBillCodes = createdVouchers.map((voucher: any) => voucher.voucherId);
      audit.status = 'RECONCILED';
      audit.reconciledById = actorId(req);
      audit.reconciledAt = new Date();
      audit.reconcileLockToken = undefined;
      audit.version = Number(audit.version || 0) + 1;
      await audit.save({ session });
      await writeAuditLog(audit._id, req, 'RECONCILE', 'SUBMITTED', 'RECONCILED', '', {
        linkedInventoryBillIds: createdVouchers.map((voucher: any) => String(voucher._id)),
        linkedInventoryBillCodes: createdVouchers.map((voucher: any) => voucher.voucherId),
      }, session);
      responseAuditId = String(audit._id);
    });

    const audit = await loadAuditOrThrow(responseAuditId || String(req.params.id || ''));
    res.json(await buildAuditView(audit, req, { includeItems: true, includeLogs: true }));
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Không bù trừ được phiếu kiểm kho.' });
  } finally {
    await session.endSession();
  }
});

router.post('/:id/cancel', async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const audit = await loadAuditOrThrow(String(req.params.id || ''), session);
      assertWarehouseScope(req, audit.warehouseId);
      const previousStatus = String(audit.status || 'DRAFT');
      if (previousStatus === 'RECONCILED') {
        const error: any = new Error('Phiếu đã bù trừ không thể hủy.');
        error.status = 409;
        throw error;
      }
      const reason = String(req.body.reason || '').trim();
      if (!reason) {
        const error: any = new Error('Vui lòng nhập lý do hủy phiếu.');
        error.status = 400;
        throw error;
      }
      audit.status = 'CANCELLED';
      audit.cancelledById = actorId(req);
      audit.cancelledAt = new Date();
      audit.cancelReason = reason;
      audit.version = Number(audit.version || 0) + 1;
      await audit.save({ session });
      await writeAuditLog(audit._id, req, 'CANCEL', previousStatus, 'CANCELLED', reason, {}, session);
    });

    const audit = await loadAuditOrThrow(String(req.params.id || ''));
    res.json(await buildAuditView(audit, req, { includeItems: true, includeLogs: true }));
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Không hủy được phiếu kiểm kho.' });
  } finally {
    await session.endSession();
  }
});

router.delete('/:id', async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const audit = await loadAuditOrThrow(String(req.params.id || ''), session);
      assertWarehouseScope(req, audit.warehouseId);
      const logs = await InventoryAuditLog.find({ inventoryAuditId: audit._id }).session(session);
      const importantLogs = logs.filter((log: any) => !['CREATE', 'UPDATE'].includes(String(log.actionType || '')));
      if (
        String(audit.status || '') !== 'DRAFT'
        || audit.linkedInventoryBillId
        || (audit.linkedInventoryBillIds || []).length
        || importantLogs.length
        || audit.mergedIntoAuditId
      ) {
        const error: any = new Error('Phiếu hiện tại không đủ điều kiện để xóa vật lý. Hãy dùng hủy phiếu.');
        error.status = 409;
        throw error;
      }
      await InventoryAuditItem.deleteMany({ inventoryAuditId: audit._id }).session(session);
      await InventoryAuditLog.deleteMany({ inventoryAuditId: audit._id }).session(session);
      await InventoryAudit.deleteOne({ _id: audit._id }).session(session);
    });
    res.status(204).send();
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Không xóa được phiếu kiểm kho.' });
  } finally {
    await session.endSession();
  }
});

inventoryAuditItemsRouter.get('/', async (req, res) => {
  try {
    const auditFilter = buildAuditFilter(req);
    const audits = await InventoryAudit.find(auditFilter).select('_id code warehouseId createdAt').lean();
    const auditIds = audits.map((audit: any) => audit._id);
    if (!auditIds.length) {
      return res.json({ items: [], total: 0, page: Math.max(Number(req.query.page || 1), 1), limit: Math.min(Math.max(Number(req.query.limit || 20), 1), 200) });
    }

    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 200);
    const itemFilter: Record<string, any> = { inventoryAuditId: { $in: auditIds } };
    const productKeyword = String(req.query.productKeyword || req.query.product || '').trim();
    if (productKeyword) {
      itemFilter.$or = [
        { productCodeSnapshot: { $regex: escapeRegex(productKeyword), $options: 'i' } },
        { barcodeSnapshot: { $regex: escapeRegex(productKeyword), $options: 'i' } },
        { productNameSnapshot: { $regex: escapeRegex(productKeyword), $options: 'i' } },
      ];
    }
    const varianceType = String(req.query.varianceType || '').trim().toUpperCase();
    if (varianceType === 'EXCESS') itemFilter.varianceQuantity = { $gt: 0 };
    if (varianceType === 'SHORTAGE') itemFilter.varianceQuantity = { $lt: 0 };
    if (varianceType === 'BALANCED') itemFilter.varianceQuantity = 0;

    const [items, total] = await Promise.all([
      InventoryAuditItem.find(itemFilter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      InventoryAuditItem.countDocuments(itemFilter),
    ]);

    const auditMap = new Map(audits.map((audit: any) => [String(audit._id), audit]));
    const warehouseMap = await branchNameMap([...new Set(audits.map((audit: any) => String(audit.warehouseId)))]);
    const userMap = await userNameMap(
      [...new Set(items.map((item: any) => String(item.countedById || '')).filter(Boolean))],
    );

    res.json({
      items: items.map((item: any) => {
        const audit = auditMap.get(String(item.inventoryAuditId));
        return {
          _id: String(item._id),
          auditId: String(item.inventoryAuditId),
          auditCode: audit?.code || '',
          warehouseId: audit?.warehouseId ? String(audit.warehouseId) : '',
          warehouseName: warehouseMap.get(String(audit?.warehouseId || ''))?.name || '—',
          createdAt: audit?.createdAt || item.createdAt,
          productId: String(item.productId),
          productCodeSnapshot: item.productCodeSnapshot || '',
          barcodeSnapshot: item.barcodeSnapshot || '',
          productNameSnapshot: item.productNameSnapshot || '',
          unitSnapshot: item.unitSnapshot || '',
          costPriceSnapshot: Number(item.costPriceSnapshot || 0),
          salePriceSnapshot: Number(item.salePriceSnapshot || 0),
          systemQuantitySnapshot: Number(item.systemQuantitySnapshot || 0),
          inTransitQuantitySnapshot: Number(item.inTransitQuantitySnapshot || 0),
          physicalQuantity: item.physicalQuantity === null || item.physicalQuantity === undefined ? null : Number(item.physicalQuantity || 0),
          varianceQuantity: Number(item.varianceQuantity || 0),
          note: item.note || '',
          countedByName: userDisplay(userMap, item.countedById),
          countedAt: item.countedAt,
        };
      }),
      total,
      page,
      limit,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Không tải được danh sách sản phẩm kiểm kho.' });
  }
});

inventoryAuditItemsRouter.get('/export', async (req, res) => {
  try {
    const auditFilter = buildAuditFilter(req);
    const audits = await InventoryAudit.find(auditFilter).select('_id code warehouseId createdAt').lean();
    const auditIds = audits.map((audit: any) => audit._id);
    if (!auditIds.length) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="inventory-audit-items.csv"');
      return res.send('\uFEFF');
    }
    const itemFilter: Record<string, any> = { inventoryAuditId: { $in: auditIds } };
    const productKeyword = String(req.query.productKeyword || req.query.product || '').trim();
    if (productKeyword) {
      itemFilter.$or = [
        { productCodeSnapshot: { $regex: escapeRegex(productKeyword), $options: 'i' } },
        { barcodeSnapshot: { $regex: escapeRegex(productKeyword), $options: 'i' } },
        { productNameSnapshot: { $regex: escapeRegex(productKeyword), $options: 'i' } },
      ];
    }
    const varianceType = String(req.query.varianceType || '').trim().toUpperCase();
    if (varianceType === 'EXCESS') itemFilter.varianceQuantity = { $gt: 0 };
    if (varianceType === 'SHORTAGE') itemFilter.varianceQuantity = { $lt: 0 };
    if (varianceType === 'BALANCED') itemFilter.varianceQuantity = 0;

    const items = await InventoryAuditItem.find(itemFilter).sort({ createdAt: -1 }).limit(5000).lean();
    const auditMap = new Map(audits.map((audit: any) => [String(audit._id), audit]));
    const warehouseMap = await branchNameMap([...new Set(audits.map((audit: any) => String(audit.warehouseId)))]);

    const lines = [
      ['Ngày', 'Mã phiếu', 'Kho', 'Mã SP', 'Tên sản phẩm', 'Giá vốn', 'Giá bán', 'Tồn hệ thống', 'Đang chuyển', 'Tồn thực tế', 'Chênh lệch', 'Ghi chú'],
      ...items.map((item: any) => {
        const audit = auditMap.get(String(item.inventoryAuditId));
        return [
          audit?.createdAt ? new Date(audit.createdAt).toLocaleString('vi-VN') : '',
          audit?.code || '',
          warehouseMap.get(String(audit?.warehouseId || ''))?.name || '',
          item.productCodeSnapshot || '',
          item.productNameSnapshot || '',
          Number(item.costPriceSnapshot || 0),
          Number(item.salePriceSnapshot || 0),
          Number(item.systemQuantitySnapshot || 0),
          Number(item.inTransitQuantitySnapshot || 0),
          item.physicalQuantity === null || item.physicalQuantity === undefined ? '' : Number(item.physicalQuantity || 0),
          Number(item.varianceQuantity || 0),
          item.note || '',
        ];
      }),
    ];
    const csv = lines.map((line) => line.map(csvEscape).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory-audit-items.csv"');
    res.send(`\uFEFF${csv}`);
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message || 'Không xuất được danh sách sản phẩm kiểm kho.' });
  }
});

export { inventoryAuditItemsRouter };
export default router;
