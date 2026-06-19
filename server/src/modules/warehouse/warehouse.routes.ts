import { Router } from 'express';
import { crudRoutes } from '../../core/utils/routeFactory.js';
import {
  InventoryVoucher,
  InventoryProduct,
  WarehouseTransfer,
  InventoryCheck,
  InventoryCheckProduct,
  WarehouseDraftVoucher,
  WarehouseDraftProduct,
  WarehouseVoucherLog,
  WarehouseProductLog
} from './warehouse.models.js';
import { Branch } from '../../core/org/branch.model.js';
import { moveProductQty } from '../product/product.service.js';
import {
  Batch,
  Product,
  ProductBranchStock,
  ProductRefund,
  SalePayment,
  StockAdjustment
} from '../product/product.models.js';
import multer from 'multer';
import * as xlsx from 'xlsx';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

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
  return transactionKinds.find((option) => option.value === kind)?.label || kind;
}

function classifyInventoryVoucher(voucher: any) {
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
  if (kind === 'TRANSFER') return { type: 'TRANSFER', label: 'Chuyển kho', tone: 'transfer' };
  if (kind === 'STOCK_ADJUSTMENT') {
    if (quantity > 0) return { type: 'ADJUSTMENT', label: 'Điều chỉnh tăng', tone: 'adjustment-in' };
    if (quantity < 0) return { type: 'ADJUSTMENT', label: 'Điều chỉnh giảm', tone: 'adjustment-out' };
    return { type: 'ADJUSTMENT', label: 'Điều chỉnh', tone: 'adjustment' };
  }
  if (['SUPPLIER_IMPORT', 'CREATE_PRODUCT_IMPORT', 'MANUAL_IMPORT', 'RETAIL_REFUND', 'WHOLESALE_REFUND', 'SALE_CANCEL'].includes(kind)) {
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
    if (['RETAIL_SALE', 'WHOLESALE_SALE', 'RETAIL_REFUND', 'WHOLESALE_REFUND', 'TRANSFER'].includes(kind)) continue;
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
  if (branchId) {
    const byId = await Branch.findById(branchId);
    if (byId) return byId;
  }
  const branchMap: Record<string, string> = {
    'Chi nhánh trung tâm': 'CN001',
    'Kho Hà Nội': 'HN',
    'Kho HCM': 'HCM',
    'Kho Hồ Chí Minh': 'HCM',
    'Kho chính': 'HN'
  };
  const code = branchMap[warehouse || ''] || 'CN001';
  return await Branch.findOne({ code }) || await Branch.findOne({ isDefault: true }) || await Branch.findOne();
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

router.get('/draft-vouchers', async (req, res) => {
  const filter: any = {};
  if (textQuery(req.query.warehouse)) filter.warehouse = textQuery(req.query.warehouse);
  if (textQuery(req.query.fromWarehouse)) filter.fromWarehouse = textQuery(req.query.fromWarehouse);
  if (textQuery(req.query.toWarehouse)) filter.toWarehouse = textQuery(req.query.toWarehouse);
  if (textQuery(req.query.id)) filter.externalId = textQuery(req.query.id);
  const range = dateRangeQuery(req.query.fromDate, req.query.toDate);
  if (range) filter.timeCreatedObj = range;

  const [data, meta] = await Promise.all([
    listRecords(WarehouseDraftVoucher, filter, req, 'timeCreatedObj'),
    distinctValues(WarehouseDraftVoucher, ['warehouse', 'fromWarehouse', 'toWarehouse', 'type', 'creator']),
  ]);
  res.json({ ...data, meta });
});

router.get('/draft-products', async (req, res) => {
  const filter: any = {};
  if (textQuery(req.query.warehouse)) filter.warehouse = textQuery(req.query.warehouse);
  if (textQuery(req.query.fromWarehouse)) filter.fromWarehouse = textQuery(req.query.fromWarehouse);
  if (textQuery(req.query.toWarehouse)) filter.toWarehouse = textQuery(req.query.toWarehouse);
  if (textQuery(req.query.id)) filter.externalId = textQuery(req.query.id);
  if (textQuery(req.query.voucherId)) filter.requestId = textQuery(req.query.voucherId);
  if (textQuery(req.query.product)) {
    const q = textQuery(req.query.product);
    filter.$or = [{ productName: q }, { productCode: q }, { barcode: q }];
  }
  const range = dateRangeQuery(req.query.fromDate, req.query.toDate);
  if (range) filter.dateObj = range;

  const [data, meta] = await Promise.all([
    listRecords(WarehouseDraftProduct, filter, req, 'dateObj'),
    distinctValues(WarehouseDraftProduct, ['warehouse', 'fromWarehouse', 'toWarehouse', 'type', 'creator']),
  ]);
  res.json({ ...data, meta });
});

router.get('/history-vouchers', async (req, res) => {
  const filter: any = {};
  if (textQuery(req.query.warehouse)) filter.xnkType = textQuery(req.query.warehouse);
  if (textQuery(req.query.voucherId)) filter.draftVoucherId = textQuery(req.query.voucherId);
  if (textQuery(req.query.logType)) filter.logType = textQuery(req.query.logType);
  if (textQuery(req.query.xnkCategory)) filter.xnkCategory = textQuery(req.query.xnkCategory);
  if (textQuery(req.query.xnkType)) filter.xnkType = textQuery(req.query.xnkType);
  const range = dateRangeQuery(req.query.fromDate, req.query.toDate);
  if (range) filter.createdAtObj = range;

  const [data, meta] = await Promise.all([
    listRecords(WarehouseVoucherLog, filter, req, 'createdAtObj'),
    distinctValues(WarehouseVoucherLog, ['logType', 'xnkCategory', 'xnkType', 'actor']),
  ]);
  res.json({ ...data, meta });
});

router.get('/history-products', async (req, res) => {
  const filter: any = {};
  if (textQuery(req.query.warehouse)) filter.xnkType = textQuery(req.query.warehouse);
  if (textQuery(req.query.productId)) filter.inventoryProductId = textQuery(req.query.productId);
  if (textQuery(req.query.voucherId)) filter.voucherId = textQuery(req.query.voucherId);
  if (textQuery(req.query.logType)) filter.logType = textQuery(req.query.logType);
  if (textQuery(req.query.xnkCategory)) filter.xnkCategory = textQuery(req.query.xnkCategory);
  if (textQuery(req.query.xnkType)) filter.xnkType = textQuery(req.query.xnkType);
  if (textQuery(req.query.product)) filter.productName = textQuery(req.query.product);
  const range = dateRangeQuery(req.query.fromDate, req.query.toDate);
  if (range) filter.createdAtObj = range;

  const [data, meta] = await Promise.all([
    listRecords(WarehouseProductLog, filter, req, 'createdAtObj'),
    distinctValues(WarehouseProductLog, ['logType', 'xnkCategory', 'xnkType', 'actor']),
  ]);
  res.json({ ...data, meta });
});

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
    const { warehouse = 'Chi nhánh trung tâm', type = 'Nhập mua', note = '' } = req.body;
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

    const result = await createImportVoucher(req as any, { warehouse, type, note: note || `Nhập kho từ Excel - File: ${req.file.originalname}`, items });
    return res.status(201).json({ ...result, errors });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || 'Lỗi import Excel XNK' });
  }
});

router.post('/transfers', async (req, res, next) => {
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

router.get('/transactions/meta', async (_req, res) => {
  const branches = await Branch.find({ isActive: { $ne: false } }).sort({ isDefault: -1, name: 1 }).select('name code isDefault').lean();
  res.json({
    warehouses: branches.map((branch: any) => ({
      value: String(branch._id),
      label: branch.name,
      code: branch.code,
      isDefault: Boolean(branch.isDefault),
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

router.use('/vouchers', crudRoutes(InventoryVoucher));
router.use('/products', crudRoutes(InventoryProduct));
router.use('/transfers', crudRoutes(WarehouseTransfer));
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

export default router;
