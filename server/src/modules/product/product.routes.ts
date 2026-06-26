import { Router } from 'express';
import { crudRoutes } from '../../core/utils/routeFactory.js';
import { writeAuditLog } from '../../core/audit/audit.service.js';
import { Batch, Category, DeliveryPartner, PaymentMethod, Product, ProductBranchStock, ProductLog, ProductRefund, SaleChannel, SalePayment, Shelf, StockAdjustment, Trademark, ProductEditLog } from './product.models.js';
import {
  buildProductRefundPayload,
  buildSalePaymentPayload,
  cancelSalePayment,
  completeProductRefund,
  completeSalePayment,
  completeStockAdjustment,
  createReturnExchange,
  moveProductQty,
  reviseCompletedSalePayment,
} from './product.service.js';
import { Branch } from '../../core/org/branch.model.js';
import { resolveBranchReference } from '../../core/org/branch.service.js';
import { Customer } from '../customer/customer.models.js';
import { Order } from '../orders/orders.models.js';
import multer from 'multer';
import * as xlsx from 'xlsx';
import mongoose from 'mongoose';
import { InventoryProduct, InventoryVoucher } from '../warehouse/warehouse.models.js';
import { getAssignedWarehouseIds, isAdminUser } from '../../core/middleware/auth.js';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

function nextCode(prefix: string) {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(2, 14);
  return `${prefix}${stamp}`;
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

function parseNumber(value: any): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return value;
  const normalized = String(value).replace(/,/g, '').trim();
  return Number(normalized) || 0;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

﻿const PRODUCT_TYPES = ['product', 'service', 'combo'];

function randomDigits(length: number) {
  let value = '';
  for (let index = 0; index < length; index += 1) value += Math.floor(Math.random() * 10);
  return value;
}

function ean13Checksum(first12Digits: string) {
  const sum = first12Digits
    .split('')
    .reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
}

function buildGeneratedBarcode() {
  const body = `20${Date.now().toString().slice(-5)}${randomDigits(5)}`;
  return `${body}${ean13Checksum(body)}`;
}

async function generateProductIdentity(session?: mongoose.ClientSession) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = `${Date.now().toString(36).toUpperCase()}${randomDigits(4)}`;
    const code = `SP-${suffix}`;
    const barcode = buildGeneratedBarcode();
    const existing = await Product.findOne({ $or: [{ code }, { barcode }] }).session(session || null).select('_id');
    if (!existing) return { code, barcode };
  }
  const error: any = new Error('Không thể tự động tạo mã sản phẩm/mã vạch không trùng. Vui lòng thử lại.');
  error.status = 409;
  throw error;
}

function toNumberOrZero(value: any): number {
  const number = parseNumber(value);
  return Number.isFinite(number) ? number : 0;
}

function validateProductFields(payload: any): string[] {
  const errors: string[] = [];

  const require = (condition: boolean, message: string) => {
    if (!condition) errors.push(message);
  };

  const code = String(payload.code ?? '').trim();
  const name = String(payload.name ?? '').trim();
  const barcode = String(payload.barcode ?? '').trim();
  const type = String(payload.type ?? '').trim();
  const unit = String(payload.unit ?? '').trim();
  const size = String(payload.size ?? '').trim();
  const color = String(payload.color ?? '').trim();
  const categoryId = String(payload.categoryId ?? '').trim();
  const price = payload.price;
  const weight = payload.weight;
  const cost = payload.cost;
  const wholesalePrice = payload.wholesalePrice;

  require(name.length > 0, 'Vui lòng nhập tên sản phẩm.');
  require(barcode.length === 0 || /^\d+$/.test(barcode), 'Mã vạch chỉ được chứa chữ số.');
  require(type.length > 0, 'Vui lòng chọn loại sản phẩm.');
  require(type.length === 0 || PRODUCT_TYPES.includes(type), 'Loại sản phẩm không hợp lệ.');
  require(unit.length > 0, 'Vui lòng chọn đơn vị.');

  const priceValid = price !== undefined && price !== null && price !== '' && Number.isFinite(Number(price)) && Number(price) >= 0;
  require(priceValid, 'Vui lòng nhập giá bán hợp lệ.');

  const weightValid = weight !== undefined && weight !== null && weight !== '' && Number.isFinite(Number(weight)) && Number(weight) >= 0;
  require(weightValid, 'Khối lượng phải là số không âm.');

  const costValid = cost === undefined || cost === null || cost === '' || (Number.isFinite(Number(cost)) && Number(cost) >= 0);
  require(costValid, 'Giá vốn phải là số không âm.');

  const wholesaleValid = wholesalePrice === undefined || wholesalePrice === null || wholesalePrice === '' || (Number.isFinite(Number(wholesalePrice)) && Number(wholesalePrice) >= 0);
  require(wholesaleValid, 'Giá sỉ phải là số không âm.');

  require(size.length > 0, 'Vui lòng nhập kích cỡ.');
  require(color.length > 0, 'Vui lòng nhập màu sắc.');
  require(categoryId.length > 0, 'Vui lòng chọn danh mục.');
  require(categoryId.length === 0 || mongoose.isValidObjectId(categoryId), 'Danh mục không hợp lệ.');

  return errors;
}

function applyMoneyDefaults(payload: any) {
  if (payload.cost === undefined || payload.cost === null || payload.cost === '') payload.cost = 0; else payload.cost = toNumberOrZero(payload.cost);
  if (payload.wholesalePrice === undefined || payload.wholesalePrice === null || payload.wholesalePrice === '') payload.wholesalePrice = 0; else payload.wholesalePrice = toNumberOrZero(payload.wholesalePrice);
  if (payload.price !== undefined && payload.price !== null && payload.price !== '') payload.price = toNumberOrZero(payload.price);
  if (payload.weight !== undefined && payload.weight !== null && payload.weight !== '') payload.weight = toNumberOrZero(payload.weight);
}

function sanitizeProductPayload(raw: any) {
  const payload = { ...raw };
  for (const key of [
    '_id',
    'code',
    'barcode',
    'createdAt',
    'updatedAt',
    '__v',
    'qty',
    'availableStock',
    'initialStocks',
    'stockAdjustment',
    'trademarkName',
    'supplierName',
  ]) {
    delete payload[key];
  }
  return payload;
}

function normalizeStockLines(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();

  return raw.map((line: any, index) => {
    const warehouseId = String(line?.warehouseId || '').trim();
    const quantity = Number(line?.quantity);
    if (!mongoose.isValidObjectId(warehouseId)) {
      const error: any = new Error(`Kho hàng ở dòng ${index + 1} không hợp lệ.`);
      error.status = 400;
      throw error;
    }
    if (!Number.isInteger(quantity) || quantity < 0) {
      const error: any = new Error(`Số lượng tồn kho ở dòng ${index + 1} phải là số nguyên không âm.`);
      error.status = 400;
      throw error;
    }
    if (seen.has(warehouseId)) {
      const error: any = new Error('Không được gửi trùng kho hàng trong cùng một yêu cầu.');
      error.status = 400;
      throw error;
    }
    seen.add(warehouseId);
    return { warehouseId, quantity };
  });
}

function assignedWarehouseScope(req: any) {
  if (isAdminUser(req.user)) return null;
  return getAssignedWarehouseIds(req.user).filter((id) => mongoose.isValidObjectId(id));
}

function scopeObjectIds(req: any) {
  const warehouseScope = assignedWarehouseScope(req);
  if (warehouseScope === null) return null;
  if (!warehouseScope.length) {
    const error: any = new Error('No assigned warehouse');
    error.status = 403;
    throw error;
  }
  return warehouseScope.map((id) => new mongoose.Types.ObjectId(id));
}

function ensureBranchInScope(req: any, branchId: unknown) {
  const warehouseScope = assignedWarehouseScope(req);
  if (warehouseScope === null) return;
  if (!warehouseScope.length) {
    const error: any = new Error('No assigned warehouse');
    error.status = 403;
    throw error;
  }
  const targetBranchId = String(branchId || '').trim();
  if (!warehouseScope.includes(targetBranchId)) {
    const error: any = new Error('Branch is outside employee warehouse scope');
    error.status = 403;
    throw error;
  }
}

async function requireExplicitBranchForDocumentCreate(req: any, branchId: unknown) {
  const targetBranchId = String(branchId || '').trim();
  if (!targetBranchId || !mongoose.isValidObjectId(targetBranchId)) {
    const error: any = new Error('Vui lòng chọn kho thực hiện hợp lệ trước khi tạo chứng từ.');
    error.status = 400;
    throw error;
  }
  if (isAdminUser(req.user)) {
    const branch = await Branch.exists({ _id: targetBranchId, isActive: { $ne: false } });
    if (!branch) {
      const error: any = new Error('Kho thực hiện không hợp lệ hoặc đã ngưng hoạt động.');
      error.status = 400;
      throw error;
    }
    return;
  }
  ensureBranchInScope(req, targetBranchId);
}

function scopedSaleFilter(req: any, extra: Record<string, any> = {}) {
  const branchIds = scopeObjectIds(req);
  if (branchIds === null) return extra;
  return { ...extra, branchId: { $in: branchIds } };
}

async function findScopedSale(req: any, selector: Record<string, any>) {
  return SalePayment.findOne(scopedSaleFilter(req, selector));
}

async function findScopedRefund(req: any, refundId: string) {
  const refund = await ProductRefund.findById(refundId).populate('paymentId', 'branchId code value status');
  if (!refund) return null;
  const warehouseScope = assignedWarehouseScope(req);
  if (warehouseScope === null) return refund;
  if (!warehouseScope.length) return null;
  const paymentBranchId = String((refund.paymentId as any)?.branchId || '');
  return warehouseScope.includes(paymentBranchId) ? refund : null;
}

async function scopedProductIdsForWarehouses(branchIds: string[]) {
  if (!branchIds.length) return [];
  return ProductBranchStock.distinct('productId', { branchId: { $in: branchIds }, qty: { $gt: 0 } });
}

async function getStockTotals(productIds: mongoose.Types.ObjectId[], branchIds?: string[] | null) {
  if (!productIds.length) return new Map<string, number>();
  const match: Record<string, any> = { productId: { $in: productIds } };
  if (branchIds) match.branchId = { $in: branchIds };
  const totals = await ProductBranchStock.aggregate([
    { $match: match },
    { $group: { _id: '$productId', quantity: { $sum: '$qty' } } },
  ]);
  return new Map(totals.map((row: any) => [String(row._id), Number(row.quantity || 0)]));
}

function publicProductForRole(item: any, limited: boolean) {
  if (!limited) return item;
  const { cost, initialStocks, ...rest } = item;
  return rest;
}

async function populateSale(query: any) {
  return query
    .populate('items.productId', 'code name price cost qty unit type allowsSale')
    .populate('saleChannelId', 'name')
    .populate('customerId', 'name code phone')
    .populate('branchId', 'name code address phone')
    .populate('userId', 'name email')
    .populate('authorId', 'name email')
    .populate('typePayment.methodId', 'name code');
}

function saleHasGiftItems(sale: any) {
  return Array.isArray(sale?.items) && sale.items.some((item: any) => item?.isGift === true || item?.gift === true || item?.giftForProductId);
}

async function decorateSales(input: any) {
  const docs = Array.isArray(input) ? input : input ? [input] : [];
  if (!docs.length) return Array.isArray(input) ? [] : null;

  const saleIds = docs
    .map((doc) => String(doc?._id || '').trim())
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const refundRows = saleIds.length
    ? await ProductRefund.aggregate([
      { $match: { paymentId: { $in: saleIds }, status: { $ne: 'cancelled' } } },
      {
        $group: {
          _id: '$paymentId',
          activeRefundCount: { $sum: 1 },
          completedRefundCount: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
          returnedQuantity: {
            $sum: {
              $cond: [{ $eq: ['$status', 'completed'] }, { $ifNull: ['$amount', 0] }, 0],
            },
          },
        },
      },
    ])
    : [];
  const refundItemRows = saleIds.length
    ? await ProductRefund.aggregate([
      { $match: { paymentId: { $in: saleIds }, status: 'completed' } },
      { $unwind: { path: '$items', preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: { paymentId: '$paymentId', productId: '$items.productId' },
          quantity: { $sum: { $ifNull: ['$items.amount', 0] } },
        },
      },
    ])
    : [];

  const refundMap = new Map(refundRows.map((row: any) => [String(row._id), row]));
  const refundItemMap = new Map<string, Record<string, number>>();
  for (const row of refundItemRows) {
    const saleId = String(row?._id?.paymentId || '');
    const productId = String(row?._id?.productId || '');
    if (!saleId || !productId) continue;
    const current = refundItemMap.get(saleId) || {};
    current[productId] = Number(row.quantity || 0);
    refundItemMap.set(saleId, current);
  }
  const decorated = docs.map((doc) => {
    const sale = typeof doc?.toObject === 'function' ? doc.toObject() : { ...doc };
    const refundMeta = refundMap.get(String(sale._id)) || {};
    const returnedQuantityByProduct = refundItemMap.get(String(sale._id)) || {};
    const activeRefundCount = Number(refundMeta.activeRefundCount || 0);
    const returnedQuantity = Number(refundMeta.returnedQuantity || 0);
    const totalSoldQuantity = Array.isArray(sale.items)
      ? sale.items.reduce((sum: number, item: any) => sum + (Number(item?.amount) || 0), 0)
      : 0;
    const remainingReturnableQuantity = Math.max(totalSoldQuantity - returnedQuantity, 0);
    const status = String(sale.status || '').toLowerCase();
    const refundStatus = String(sale.refundStatus || 'none');
    const hasGiftItems = saleHasGiftItems(sale);

    return {
      ...sale,
      hasGiftItems,
      activeRefundCount,
      returnedQuantityByProduct,
      remainingReturnableQuantity,
      canPrintGiftInvoice: hasGiftItems,
      canRefund: status === 'completed' && refundStatus !== 'full' && remainingReturnableQuantity > 0,
      canEdit: status === 'completed' && refundStatus === 'none' && activeRefundCount === 0,
      canDelete: status === 'draft' || (status === 'cancelled' && activeRefundCount === 0) || (status === 'completed' && activeRefundCount === 0),
    };
  });

  return Array.isArray(input) ? decorated : decorated[0];
}

async function populateRefund(query: any) {
  return query.populate('paymentId', 'code value status').populate('items.productId', 'code name price qty unit type');
}

async function generateCategoryCode() {
  const categories = await Category.find({ code: /^DM-\d+$/i }).select('code').lean();
  let maxNumber = 0;
  for (const category of categories) {
    const match = String((category as any).code || '').trim().toUpperCase().match(/^DM-(\d+)$/);
    if (!match) continue;
    maxNumber = Math.max(maxNumber, Number(match[1]));
  }
  return `DM-${String(maxNumber + 1).padStart(4, '0')}`;
}

router.get('/categories', async (req, res) => {
  const page = Math.max(Number(req.query.page ?? 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit ?? 15), 1), 5000);
  const q = String(req.query.q ?? '').trim();
  const sortField = req.query.sort ? String(req.query.sort) : 'createdAt';
  const sortOrder = req.query.order === 'asc' ? 1 : -1;
  const filter: Record<string, any> = q
    ? { $or: [{ name: { $regex: q, $options: 'i' } }, { code: { $regex: q, $options: 'i' } }] }
    : {};

  for (const [key, val] of Object.entries(req.query)) {
    if (['page', 'limit', 'q', 'sort', 'order'].includes(key)) continue;
    const strVal = String(val ?? '').trim();
    if (!strVal) continue;
    if ((key === '_id' || key.endsWith('Id')) && mongoose.Types.ObjectId.isValid(strVal)) {
      filter[key] = new mongoose.Types.ObjectId(strVal);
    } else {
      filter[key] = { $regex: `^${strVal}$`, $options: 'i' };
    }
  }

  const [items, total] = await Promise.all([
    Category.aggregate([
      { $match: filter },
      { $sort: { [sortField]: sortOrder } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      {
        $lookup: {
          from: Product.collection.name,
          localField: '_id',
          foreignField: 'categoryId',
          as: 'products',
        },
      },
      { $addFields: { productCount: { $size: '$products' } } },
      { $project: { products: 0 } },
    ]),
    Category.countDocuments(filter),
  ]);

  res.json({ items, total, page, limit });
});

router.post('/categories', async (req, res) => {
  try {
    const payload = { ...req.body, code: String(req.body?.code || '').trim() || await generateCategoryCode() };
    const item = await Category.create(payload);
    await writeAuditLog(req, {
      action: 'crud.create',
      module: 'Category',
      resource: 'Category',
      resourceId: item.id,
      after: item,
    });
    res.status(201).json(item);
  } catch (err: any) {
    if (err?.code === 11000) return res.status(409).json({ message: 'M� danh m?c ho?c t�n danh m?c d� t?n t?i.' });
    throw err;
  }
});

router.delete('/categories/:id', async (req, res) => {
  const categoryId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(categoryId)) return res.status(400).json({ message: 'Invalid category id' });

  const [childCount, productCount] = await Promise.all([
    Category.countDocuments({ parentId: categoryId }),
    Product.countDocuments({ categoryId }),
  ]);
  if (childCount > 0 || productCount > 0) {
    return res.status(409).json({ message: 'Danh mục đang có danh mục con hoặc sản phẩm, không thể xóa.' });
  }

  const item = await Category.findByIdAndDelete(categoryId);
  if (!item) return res.status(404).json({ message: 'Not found' });
  await writeAuditLog(req, {
    action: 'crud.delete',
    module: 'Category',
    resource: 'Category',
    resourceId: item.id,
    before: item,
  });
  res.status(204).send();
});

router.use('/categories', crudRoutes(Category));
router.use('/trademarks', crudRoutes(Trademark));
router.use('/shelves', crudRoutes(Shelf));

// Import Excel Endpoint
router.post('/products/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Không tìm thấy file tải lên' });
    }

    const { warehouse, importMode, branchId: requestedBranchId, branchCode: requestedBranchCode } = req.body; // importMode: 'Thêm mới' | 'Cập nhật thông tin'
    if (!warehouse) {
      return res.status(400).json({ message: 'Vui lòng chọn Kho hàng' });
    }

    // 1. Resolve branch
    const branch = await resolveBranchReference({
      branchId: requestedBranchId,
      warehouse,
      warehouseCode: requestedBranchCode,
      allowInactive: true,
    });
    if (!branch) {
      return res.status(400).json({ message: 'Vui long chon kho thuc hien hop le truoc khi nhap file.' });
    }
    const branchId = branch?._id;
    const warehouseName = warehouse || branch.name;

    // 2. Parse Excel
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json<any>(workbook.Sheets[sheetName]);

    let created = 0, updated = 0, skipped = 0, stockAdded = 0;
    const errors: string[] = [];

    const voucherId = 'PNK-' + Math.floor(Math.random() * 900000 + 100000);
    const date = new Date().toISOString().slice(0, 10);
    let totalQty = 0;
    let totalAmount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const code = row['M\u00e3 s\u1ea3n ph\u1ea9m']?.toString().trim();
      const name = row['T\u00ean s\u1ea3n ph\u1ea9m']?.toString().trim();

      if (!name) {
        errors.push(`D\u00f2ng ${i + 2}: Thi\u1ebfu t\u00ean s\u1ea3n ph\u1ea9m`);
        continue;
      }

      // Map fields
      const costStr = row['Gi\u00e1 nh\u1eadp'] || row['Gi\u00e1 v\u1ed1n'] || row['Gi\u00e1 v\u1ed1n (\u0110)'] || 0;
      const priceStr = row['Gi\u00e1 b\u00e1n'] || row['Gi\u00e1 b\u00e1n (\u0110)'] || 0;
      const wholesalePriceStr = row['Gi\u00e1 s\u1ec9'] || row['Gi\u00e1 s\u1ec9 (\u0110)'] || 0;
      const qtyStr = row['T\u1ed3n trong kho'] || row['T\u1ed3n'] || row['T\u1ed5ng t\u1ed3n'] || 0;

      const cost = Number(costStr.toString().replace(/,/g, '')) || 0;
      const price = Number(priceStr.toString().replace(/,/g, '')) || 0;
      const wholesalePrice = Number(wholesalePriceStr.toString().replace(/,/g, '')) || 0;
      const qty = Number(qtyStr.toString().replace(/,/g, '')) || 0;

      const metadata = {
        name,
        unit: row['\u0110\u01a1n v\u1ecb t\u00ednh']?.toString() || row['\u0110\u01a1n v\u1ecb']?.toString(),
        cost,
        price,
        wholesalePrice,
        categoryName: row['Danh m\u1ee5c']?.toString(),
        trademarkName: row['Th\u01b0\u01a1ng hi\u1ec7u']?.toString(),
        supplierName: row['Nh\u00e0 cung c\u1ea5p']?.toString(),
        color: row['M\u00e0u s\u1eafc']?.toString(),
        size: row['K\u00edch th\u01b0\u1edbc']?.toString() || row['K\u00edch c\u1ee1']?.toString(),
        status: row['Tr\u1ea1ng th\u00e1i']?.toString() || 'M\u1edbi',
        type: 'product'
      };

      let product = code ? await Product.findOne({ code }) : null;

      if (!product) {
        // Mới
        const identity = await generateProductIdentity();
        product = await Product.create({ ...metadata, ...identity, qty: 0 });
        created++;
      } else {
        if (importMode === 'Thêm mới') {
          // Bỏ qua dòng trùng mã nếu chọn "Thêm mới"
          skipped++;
          continue;
        } else {
          // Cập nhật thông tin
          await Product.updateOne({ _id: product._id }, { $set: metadata });
          updated++;
        }
      }

      // Nhập kho
      if (qty > 0) {
        const lineAmount = qty * cost;
        totalQty += qty;
        totalAmount += lineAmount;
        stockAdded += qty;

        const invProduct = await InventoryProduct.create({
          id: 'TX-' + Math.floor(Math.random() * 900000 + 100000),
          voucherId,
          date,
          warehouse: warehouseName,
          productCode: product.code,
          productName: product.name,
          type: 'import',
          importQty: qty,
          exportQty: 0,
          price: cost,
          totalAmount: lineAmount,
          creator: (req as any).user?.name || 'Admin',
          unit: product.unit,
          cost: cost,
          note: 'Nhập từ file Excel'
        });

        await moveProductQty({
          productId: product._id,
          branchId,
          sourceType: 'InventoryProduct',
          sourceId: invProduct._id,
          amount: qty,
          valueAfter: cost
        });
      }
    }

    if (totalQty > 0) {
      await InventoryVoucher.create({
        voucherId,
        date,
        warehouse: warehouseName,
        type: 'import',
        supplier: '',
        spCount: created + updated,
        qty: totalQty,
        totalAmount,
        discount: 0,
        creator: (req as any).user?.name || 'Admin',
        note: 'Nhập kho hàng loạt từ file Excel'
      });
    }

    res.json({
      success: true,
      summary: { created, updated, skipped, stockAdded, errors, voucherId: totalQty > 0 ? voucherId : null }
    });

  } catch (err: any) {
    console.error('Import error:', err);
    res.status(err.status || 500).json({ message: err.message || 'Lỗi server khi nhập file' });
  }
});

router.get('/products', async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit ?? 15), 1), 5000);
    const q = String(req.query.q ?? '').trim();
    const sortField = String(req.query.sort || 'createdAt');
    const sortOrder = req.query.order === 'asc' ? 1 : -1;
    const filter: any = {};

    if (q) {
      const query = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ name: query }, { code: query }, { barcode: query }];
    }
    for (const field of ['status', 'code', 'barcode', 'categoryId']) {
      const value = String(req.query[field] || '').trim();
      if (!value) continue;
      if (field === 'categoryId' && mongoose.isValidObjectId(value)) filter[field] = value;
      else filter[field] = new RegExp(`^${escapeRegex(value)}$`, 'i');
    }

    const warehouseScope = assignedWarehouseScope(req as any);
    if (warehouseScope) {
      if (!warehouseScope.length) return res.status(403).json({ message: 'No assigned warehouse' });
      filter._id = { $in: await scopedProductIdsForWarehouses(warehouseScope) };
    }

    const [items, total] = await Promise.all([
      Product.find(filter).sort({ [sortField]: sortOrder }).skip((page - 1) * limit).limit(limit).lean(),
      Product.countDocuments(filter),
    ]);
    const totals = await getStockTotals(items.map((item: any) => item._id), warehouseScope);
    res.json({
      items: items.map((item: any) => publicProductForRole({ ...item, qty: totals.get(String(item._id)) || 0 }, Boolean(warehouseScope))),
      total,
      page,
      limit,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Không thể tải danh sách sản phẩm.' });
  }
});

router.get('/products/:id/stocks', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Sản phẩm không hợp lệ.' });
    const product = await Product.findById(req.params.id).select('_id');
    if (!product) return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });

    const warehouseScope = assignedWarehouseScope(req as any);
    if (warehouseScope && !warehouseScope.length) return res.status(403).json({ message: 'No assigned warehouse' });
    const stockFilter: Record<string, any> = { productId: product._id };
    if (warehouseScope) stockFilter.branchId = { $in: warehouseScope };
    const rows = await ProductBranchStock.find(stockFilter)
      .populate('branchId', 'name code isActive')
      .sort({ createdAt: 1 })
      .lean();
    const items = rows
      .filter((row: any) => row.branchId)
      .map((row: any) => ({
        _id: String(row._id),
        warehouseId: String(row.branchId._id),
        warehouseName: row.branchId.name,
        warehouseCode: row.branchId.code,
        quantity: Number(row.qty || 0),
      }));
    res.json({ items, totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0) });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Không thể tải tồn kho theo kho hàng.' });
  }
});

router.get('/products/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Sản phẩm không hợp lệ.' });
    const item = await Product.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
    const warehouseScope = assignedWarehouseScope(req as any);
    if (warehouseScope && !warehouseScope.length) return res.status(403).json({ message: 'No assigned warehouse' });
    const totals = await getStockTotals([item._id], warehouseScope);
    if (warehouseScope && !totals.get(String(item._id))) return res.status(403).json({ message: 'Product is outside employee warehouse scope' });
    res.json(publicProductForRole({ ...item, qty: totals.get(String(item._id)) || 0 }, Boolean(warehouseScope)));
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Không thể tải sản phẩm.' });
  }
});

router.post('/products', async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const payload = sanitizeProductPayload(req.body);
    const initialStocks = normalizeStockLines(req.body.initialStocks);
    const fieldErrors = validateProductFields(payload);
    if (fieldErrors.length) {
      return res.status(400).json({ message: fieldErrors[0], errors: fieldErrors });
    }
    applyMoneyDefaults(payload);
    if (initialStocks.length === 0) {
      return res.status(400).json({ message: 'Vui lòng chọn ít nhất một kho hàng.' });
    }

    const warehouseIds = initialStocks.map((line) => line.warehouseId);
    const warehouses = warehouseIds.length
      ? await Branch.find({ _id: { $in: warehouseIds }, isActive: { $ne: false } }).select('_id')
      : [];
    if (warehouses.length !== warehouseIds.length) {
      return res.status(400).json({ message: 'Có kho hàng không tồn tại hoặc đã ngừng hoạt động.' });
    }

    let created: any;
    await session.withTransaction(async () => {
      const identity = await generateProductIdentity(session);
      payload.code = identity.code;
      payload.barcode = identity.barcode;
      const [item] = await Product.create([{ ...payload, qty: 0 }], { session });
      created = item;
      let runningTotal = 0;

      for (const line of initialStocks) {
        await ProductBranchStock.create([{
          productId: item._id,
          branchId: line.warehouseId,
          qty: line.quantity,
          minQuantity: item.minQuantity,
          maxQuantity: item.maxQuantity,
        }], { session });
        if (line.quantity > 0) {
          await ProductLog.create([{
            productId: item._id,
            sourceType: 'PRODUCT_CREATE_INITIAL_STOCK',
            sourceId: item._id,
            amount: line.quantity,
            valueBefore: item.price,
            valueAfter: item.price,
            amountBefore: runningTotal,
            amountAfter: runningTotal + line.quantity,
          }], { session });
        }
        runningTotal += line.quantity;
      }

      item.qty = runningTotal;
      await item.save({ session });
      await ProductEditLog.create([{
        productCode: item.code,
        productName: item.name,
        logType: 'Tạo sản phẩm',
        logAction: `Tạo sản phẩm với tổng tồn ban đầu ${runningTotal}`,
        createdBy: (req as any).user?.name || (req as any).user?.email || 'Admin',
      }], { session });
    });

    await writeAuditLog(req, {
      action: 'product.create_with_initial_stock',
      module: 'Product',
      resource: 'Product',
      resourceId: created.id,
      after: created,
    });
    res.status(201).json(created);
  } catch (err: any) {
    if (err?.code === 11000) return res.status(409).json({ message: 'Mã sản phẩm đã tồn tại.' });
    res.status(err.status || 500).json({ message: err.message || 'Không thể tạo sản phẩm.' });
  } finally {
    await session.endSession();
  }
});

router.patch('/products/:id', async (req, res) => {
  const session = await mongoose.startSession();
  try {
﻿    const productPayload = sanitizeProductPayload(req.body);
    const adjustment = req.body.stockAdjustment;
    let normalizedAdjustment: { warehouseId: string; quantity: number } | undefined;
    const editInitialStocks = normalizeStockLines(req.body.initialStocks);
    const hasEditStocks = editInitialStocks.length > 0;
    const hasAdjustment = adjustment !== undefined;

    if (hasAdjustment) {
      [normalizedAdjustment] = normalizeStockLines([adjustment]);
      const warehouse = await Branch.findById(normalizedAdjustment.warehouseId).select('_id');
      if (!warehouse) return res.status(400).json({ message: 'Kho hàng không tồn tại.' });
    }

    if (hasEditStocks) {
      const warehouseIds = editInitialStocks.map((line) => line.warehouseId);
      const warehouses = await Branch.find({ _id: { $in: warehouseIds }, isActive: { $ne: false } }).select('_id');
      if (warehouses.length !== warehouseIds.length) {
        return res.status(400).json({ message: 'Có kho hàng không tồn tại hoặc đã ngừng hoạt động.' });
      }
    }

    let updated: any;
    let before: any;
    await session.withTransaction(async () => {
      before = await Product.findById(req.params.id).session(session);
      if (!before) {
        const error: any = new Error('Không tìm thấy sản phẩm.');
        error.status = 404;
        throw error;
      }

      // Full product form sends name; partial updates such as bulk status/category
      // must not fail because older products miss fields now required by the form.
      if (Object.prototype.hasOwnProperty.call(productPayload, 'name')) {
        const merged = { ...(before.toObject ? before.toObject() : before), ...productPayload };
        const fieldErrors = validateProductFields(merged);
        if (fieldErrors.length) {
          const error: any = new Error(fieldErrors[0]);
          error.status = 400;
          error.errors = fieldErrors;
          throw error;
        }
      }
      applyMoneyDefaults(productPayload);

      const existingStocks = await ProductBranchStock.find({ productId: before._id }).session(session);
      const existingWarehouseIds = new Set(existingStocks.map((stock) => String(stock.branchId)));

      if (Object.keys(productPayload).length) {
        await Product.updateOne({ _id: before._id }, { $set: productPayload }, { runValidators: true, session });
      }

      // Multi-warehouse upsert: update existing stock rows or create new ones.
      // Only rows explicitly provided are written; untouched existing rows keep their qty.
      for (const line of editInitialStocks) {
        const stock = existingStocks.find((item) => String(item.branchId) === line.warehouseId);
        if (stock) {
          const quantityBefore = Number(stock.qty || 0);
          if (quantityBefore === line.quantity) continue;
          stock.qty = line.quantity;
          await stock.save({ session });
          await ProductLog.create([{
            productId: before._id,
            sourceType: 'PRODUCT_EDIT_ADJUSTMENT',
            sourceId: before._id,
            amount: line.quantity - quantityBefore,
            valueBefore: before.price,
            valueAfter: productPayload.price ?? before.price,
            amountBefore: quantityBefore,
            amountAfter: line.quantity,
          }], { session });
        } else if (!existingWarehouseIds.has(line.warehouseId)) {
          await ProductBranchStock.create([{
            productId: before._id,
            branchId: line.warehouseId,
            qty: line.quantity,
            minQuantity: before.minQuantity,
            maxQuantity: before.maxQuantity,
          }], { session });
          await ProductLog.create([{
            productId: before._id,
            sourceType: 'PRODUCT_EDIT_ADD_WAREHOUSE',
            sourceId: before._id,
            amount: line.quantity,
            valueBefore: before.price,
            valueAfter: productPayload.price ?? before.price,
            amountBefore: 0,
            amountAfter: line.quantity,
          }], { session });
        }
      }

      if (normalizedAdjustment && !hasEditStocks) {
        const stock = await ProductBranchStock.findOne({
          productId: before._id,
          branchId: normalizedAdjustment.warehouseId,
        }).session(session);
        if (!stock) {
          const error: any = new Error('Sản phẩm chưa có bản ghi tồn kho tại kho hàng đã chọn.');
          error.status = 422;
          throw error;
        }

        const quantityBefore = Number(stock.qty || 0);
        stock.qty = normalizedAdjustment.quantity;
        await stock.save({ session });

        if (quantityBefore !== normalizedAdjustment.quantity) {
          await ProductLog.create([{
            productId: before._id,
            sourceType: 'PRODUCT_EDIT_ADJUSTMENT',
            sourceId: before._id,
            amount: normalizedAdjustment.quantity - quantityBefore,
            valueBefore: before.price,
            valueAfter: productPayload.price ?? before.price,
            amountBefore: quantityBefore,
            amountAfter: normalizedAdjustment.quantity,
          }], { session });
        }
      }

      const totals = await ProductBranchStock.aggregate([
        { $match: { productId: before._id } },
        { $group: { _id: '$productId', quantity: { $sum: '$qty' } } },
      ]).session(session);
      const totalQuantity = Number(totals[0]?.quantity || 0);
      await Product.updateOne({ _id: before._id }, { $set: { qty: totalQuantity } }, { session });

      const changedStocks = hasEditStocks || normalizedAdjustment;
      updated = await Product.findById(before._id).session(session);
      await ProductEditLog.create([{
        productCode: updated.code,
        productName: updated.name,
        logType: 'Sửa sản phẩm',
        logAction: changedStocks ? 'Cập nhật thông tin và tồn kho theo kho hàng' : 'Cập nhật thông tin sản phẩm',
        createdBy: (req as any).user?.name || (req as any).user?.email || 'Admin',
      }], { session });
    });

    await writeAuditLog(req, {
      action: (hasEditStocks || normalizedAdjustment) ? 'product.update_with_stock_adjustment' : 'product.update_master',
      module: 'Product',
      resource: 'Product',
      resourceId: updated.id,
      before,
      after: updated,
    });
    res.json(updated);

  } catch (err: any) {
    if (err?.code === 11000) return res.status(409).json({ message: 'Mã sản phẩm đã tồn tại.' });
    res.status(err.status || 500).json({ message: err.message || 'Không thể cập nhật sản phẩm.' });
  } finally {
    await session.endSession();
  }
});
router.use('/products', crudRoutes(Product));
router.use('/branch-stocks', crudRoutes(ProductBranchStock));
router.use('/sale-channels', crudRoutes(SaleChannel));
router.use('/delivery-partners', crudRoutes(DeliveryPartner));
router.use('/payment-methods', crudRoutes(PaymentMethod));
router.use('/stock-adjustments', crudRoutes(StockAdjustment));
router.use('/logs', crudRoutes(ProductLog));

router.post('/batches/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Không tìm thấy file tải lên' });

    const mode = String(req.body.mode || 'upsert');
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json<any>(workbook.Sheets[sheetName], { defval: '' });

    if (!rows.length) {
      return res.json({ success: true, summary: { created: 0, updated: 0, skipped: 0, errors: ['File không có dòng dữ liệu'] } });
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const line = i + 2;
      const batchNumber = String(row['Số lô'] || row['So lo'] || row['batchNumber'] || '').trim();
      const productKey = String(row['Sản phẩm'] || row['San pham'] || row['Mã sản phẩm'] || row['Ma san pham'] || '').trim();

      if (!batchNumber) { errors.push(`Dòng ${line}: Thiếu Số lô`); skipped++; continue; }
      if (!productKey) { errors.push(`Dòng ${line}: Thiếu Sản phẩm`); skipped++; continue; }

      const product = await Product.findOne({ $or: [{ code: productKey }, { name: productKey }] });
      if (!product) { errors.push(`Dòng ${line}: Không tìm thấy sản phẩm '${productKey}'`); skipped++; continue; }

      const manufactureDate = parseExcelDate(row['Ngày sản xuất'] || row['Ngay san xuat']);
      const expiryDate = parseExcelDate(row['Ngày hết hạn'] || row['Ngay het han']);
      const payload = {
        batchNumber,
        productId: product._id,
        qty: parseNumber(row['Tồn kho'] || row['Ton kho'] || row['qty']),
        manufactureDate,
        expiryDate,
        cost: parseNumber(row['Giá nhập'] || row['Gia nhap'] || (product as any).cost),
        status: computeBatchStatus(expiryDate),
        note: row['ID'] ? `Import ID: ${row['ID']}` : undefined,
      };

      const existing = await Batch.findOne({ batchNumber, productId: product._id });
      if (existing) {
        if (mode === 'create') { skipped++; continue; }
        await Batch.updateOne({ _id: existing._id }, { $set: payload }, { runValidators: true });
        updated++;
      } else {
        await Batch.create(payload);
        created++;
      }
    }

    res.json({ success: true, summary: { created, updated, skipped, errors } });
  } catch (err: any) {
    console.error('Batch import error:', err);
    res.status(500).json({ message: err.message || 'Lỗi import lô hàng' });
  }
});

router.use('/batches', crudRoutes(Batch));



router.get('/sales', async (req, res) => {
  const page = Math.max(Number(req.query.page ?? 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit ?? 15), 1), 5000);

  const filter: any = scopedSaleFilter(req as any);
  const invoiceCode = String(req.query.invoiceCode ?? req.query.code ?? '').trim();
  if (invoiceCode) {
    filter.code = new RegExp(escapeRegex(invoiceCode), 'i');
  }
  if (req.query.status) {
    filter.status = String(req.query.status).trim();
  }
  const storeId = String(req.query.storeId ?? req.query.branchId ?? '').trim();
  if (storeId && mongoose.isValidObjectId(storeId)) {
    ensureBranchInScope(req as any, storeId);
    filter.branchId = new mongoose.Types.ObjectId(storeId);
  }

  const customerKeyword = String(req.query.customerKeyword ?? req.query.customerPhone ?? '').trim();
  if (customerKeyword) {
    const keyword = new RegExp(escapeRegex(customerKeyword), 'i');
    const customers = await Customer.find({
      $or: [{ name: keyword }, { phone: keyword }, { code: keyword }],
    }).select('_id');
    filter.customerId = { $in: customers.map(c => c._id) };
  }

  const productKeyword = String(req.query.productKeyword ?? '').trim();
  if (productKeyword) {
    const keyword = new RegExp(escapeRegex(productKeyword), 'i');
    const products = await Product.find({
      $or: [{ name: keyword }, { code: keyword }],
    }).select('_id');
    filter['items.productId'] = { $in: products.map(product => product._id) };
  }

  const dateFrom = String(req.query.dateFrom ?? req.query.fromDate ?? '').trim();
  const dateTo = String(req.query.dateTo ?? req.query.toDate ?? '').trim();
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(`${dateFrom}T00:00:00.000+07:00`);
    if (dateTo) filter.createdAt.$lte = new Date(`${dateTo}T23:59:59.999+07:00`);
  }

  const [items, total] = await Promise.all([
    populateSale(SalePayment.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)),
    SalePayment.countDocuments(filter),
  ]);
  res.json({ items: await decorateSales(items), total, page, limit });
});

router.post('/sales', async (req, res) => {
  await requireExplicitBranchForDocumentCreate(req as any, req.body.branchId);
  ensureBranchInScope(req as any, req.body.branchId);
  const payload = await buildSalePaymentPayload({
    ...req.body,
    code: req.body.code || nextCode('BH'),
    status: req.body.status || 'draft',
    userId: (req as any).user?.sub,
  });
  const item = await SalePayment.create(payload);
  const populated = await populateSale(SalePayment.findById(item._id));
  await writeAuditLog(req, { action: 'sales.create', module: 'sales', resource: 'SalePayment', resourceId: item.id, after: populated });
  res.status(201).json(await decorateSales(populated));
});

router.post('/sales/:id/complete', async (req, res) => {
  const payment = await findScopedSale(req as any, { _id: req.params.id });
  if (!payment) return res.status(404).json({ message: 'Not found' });
  const item = await completeSalePayment(req.params.id);
  const populated = await populateSale(SalePayment.findById(item._id));
  await writeAuditLog(req, { action: 'sales.complete', module: 'sales', resource: 'SalePayment', resourceId: item.id, after: populated });
  res.json(await decorateSales(populated));
});

router.get('/sales/:id', async (req, res) => {
  const scopedSale = await findScopedSale(req as any, { _id: req.params.id });
  if (!scopedSale) return res.status(404).json({ message: 'Not found' });
  const item = await populateSale(SalePayment.findById(scopedSale._id));
  if (!item) return res.status(404).json({ message: 'Not found' });
  res.json(await decorateSales(item));
});

router.patch('/sales/:id', async (req, res) => {
  const before = await findScopedSale(req as any, { _id: req.params.id });
  if (!before) return res.status(404).json({ message: 'Not found' });
  ensureBranchInScope(req as any, before.branchId);
  let item: any;
  if (before.status === 'completed') {
    item = await reviseCompletedSalePayment(req.params.id, {
      ...req.body,
      userId: (req as any).user?.sub || before.userId,
    });
  } else {
    if (before.status === 'cancelled') return res.status(422).json({ message: 'Cancelled sale cannot be edited' });
    const payload = await buildSalePaymentPayload({
      ...req.body,
      branchId: before.branchId,
      code: before.code,
      status: req.body.status || before.status,
      userId: before.userId,
      authorId: before.authorId || before.userId,
      refundStatus: before.refundStatus || 'none',
      refundedValue: before.refundedValue || 0,
      createdAt: before.createdAt,
    });
    payload.branchId = before.branchId;
    payload.userId = before.userId;
    payload.authorId = before.authorId || before.userId;
    item = await SalePayment.findOneAndUpdate(scopedSaleFilter(req as any, { _id: req.params.id }), payload, { new: true, runValidators: true });
  }
  const populated = await populateSale(SalePayment.findById(item?._id));
  await writeAuditLog(req, { action: 'sales.update', module: 'sales', resource: 'SalePayment', resourceId: item?.id, before, after: populated });
  res.json(await decorateSales(populated));
});

router.post('/sales/:id/cancel', async (req, res) => {
  const payment = await findScopedSale(req as any, { _id: req.params.id });
  if (!payment) return res.status(404).json({ message: 'Not found' });
  const before = typeof payment.toObject === 'function' ? payment.toObject() : payment;
  const item = await cancelSalePayment(req.params.id);
  const populated = await populateSale(SalePayment.findById(item?._id));
  await writeAuditLog(req, { action: 'sales.cancel', module: 'sales', resource: 'SalePayment', resourceId: item.id, before, after: populated });
  res.json(await decorateSales(populated));
});

router.delete('/sales/:id', async (req, res) => {
  const item = await findScopedSale(req as any, { _id: req.params.id });
  if (!item) return res.status(404).json({ message: 'Not found' });
  const activeRefundCount = await ProductRefund.countDocuments({ paymentId: item._id, status: { $ne: 'cancelled' } });
  if (item.status === 'completed') return res.status(422).json({ message: 'Completed sale must be cancelled instead of deleted' });
  if (item.status === 'cancelled' && activeRefundCount > 0) {
    return res.status(422).json({ message: 'Cancelled sale with return or exchange documents cannot be deleted' });
  }
  await item.deleteOne();
  await writeAuditLog(req, { action: 'sales.delete', module: 'sales', resource: 'SalePayment', resourceId: item.id, before: item });
  res.status(204).send();
});

router.post('/sales/:id/return-exchange', async (req, res) => {
  const sale = await findScopedSale(req as any, { _id: req.params.id });
  if (!sale) return res.status(404).json({ message: 'Not found' });
  if (!sale.branchId) {
    await requireExplicitBranchForDocumentCreate(req as any, req.body.branchId);
  }

  const result = await createReturnExchange(req.params.id, {
    ...req.body,
    userId: (req as any).user?.sub,
  });

  const populatedSale = result.sale?._id ? await populateSale(SalePayment.findById(result.sale._id)) : null;
  const populatedReplacementSale = result.replacementSale?._id ? await populateSale(SalePayment.findById(result.replacementSale._id)) : null;
  const populatedRefund = result.refund?._id ? await populateRefund(ProductRefund.findById(result.refund._id)) : null;

  if (populatedRefund) {
    await writeAuditLog(req, {
      action: 'sales_refund.create',
      module: 'sales',
      resource: 'ProductRefund',
      resourceId: populatedRefund.id,
      after: populatedRefund,
    });
  }
  if (populatedReplacementSale) {
    await writeAuditLog(req, {
      action: 'sales.create',
      module: 'sales',
      resource: 'SalePayment',
      resourceId: populatedReplacementSale.id,
      after: populatedReplacementSale,
    });
  }
  if (populatedSale) {
    await writeAuditLog(req, {
      action: 'sales.return_exchange',
      module: 'sales',
      resource: 'SalePayment',
      resourceId: populatedSale.id,
      before: sale,
      after: populatedSale,
    });
  }

  res.status(201).json({
    sale: await decorateSales(populatedSale),
    refund: populatedRefund,
    replacementSale: await decorateSales(populatedReplacementSale),
  });
});

router.get('/refunds', async (req, res) => {
  const page = Math.max(Number(req.query.page ?? 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit ?? 15), 1), 5000);
  const filter: any = {};
  if (req.query.code) filter.code = new RegExp(String(req.query.code).trim(), 'i');
  if (req.query.status) filter.status = String(req.query.status).trim();
  const branchIds = scopeObjectIds(req as any);
  if (branchIds) {
    const paymentIds = await SalePayment.find({ branchId: { $in: branchIds } }).distinct('_id');
    filter.paymentId = { $in: paymentIds };
  }
  const [items, total] = await Promise.all([
    populateRefund(ProductRefund.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)),
    ProductRefund.countDocuments(filter),
  ]);
  res.json({ items, total, page, limit });
});

router.post('/refunds', async (req, res) => {
  const payment = await findScopedSale(req as any, { _id: req.body.paymentId });
  if (!payment) return res.status(404).json({ message: 'Sale payment not found' });
  const payload = await buildProductRefundPayload({
    ...req.body,
    code: req.body.code || nextCode('THB'),
    status: req.body.status || 'draft',
    userId: (req as any).user?.sub,
    userCreatedId: (req as any).user?.sub,
  });
  const item = await ProductRefund.create(payload);
  const populated = await populateRefund(ProductRefund.findById(item._id));
  await writeAuditLog(req, { action: 'sales_refund.create', module: 'sales', resource: 'ProductRefund', resourceId: item.id, after: populated });
  res.status(201).json(populated);
});

router.post('/refunds/:id/complete', async (req, res) => {
  const refund = await findScopedRefund(req as any, req.params.id);
  if (!refund) return res.status(404).json({ message: 'Not found' });
  const item = await completeProductRefund(req.params.id);
  const populated = await populateRefund(ProductRefund.findById(item._id));
  await writeAuditLog(req, { action: 'sales_refund.complete', module: 'sales', resource: 'ProductRefund', resourceId: item.id, after: populated });
  res.json(populated);
});

router.get('/refunds/:id', async (req, res) => {
  const refund = await findScopedRefund(req as any, req.params.id);
  if (!refund) return res.status(404).json({ message: 'Not found' });
  const item = await populateRefund(ProductRefund.findById(refund._id));
  if (!item) return res.status(404).json({ message: 'Not found' });
  res.json(item);
});

router.patch('/refunds/:id', async (req, res) => {
  const before = await findScopedRefund(req as any, req.params.id);
  if (!before) return res.status(404).json({ message: 'Not found' });
  if (before.status === 'completed') return res.status(422).json({ message: 'Completed refund cannot be edited' });

  let item;
  if (req.body.status === 'completed') {
    await ProductRefund.findByIdAndUpdate(req.params.id, { note: req.body.note, code: req.body.code });
    item = await completeProductRefund(req.params.id);
  } else {
    item = await ProductRefund.findByIdAndUpdate(req.params.id, {
      code: req.body.code || before.code,
      note: req.body.note,
      status: req.body.status || before.status,
      userId: before.userId,
      userCreatedId: before.userCreatedId || before.userId,
    }, { new: true, runValidators: true });
  }

  const populated = await populateRefund(ProductRefund.findById(item?._id));
  await writeAuditLog(req, { action: 'sales_refund.update', module: 'sales', resource: 'ProductRefund', resourceId: item?.id, before, after: populated });
  res.json(populated);
});

router.delete('/refunds/:id', async (req, res) => {
  const item = await findScopedRefund(req as any, req.params.id);
  if (!item) return res.status(404).json({ message: 'Not found' });
  if (item.status === 'completed') return res.status(422).json({ message: 'Completed refund cannot be deleted' });
  await item.deleteOne();
  await writeAuditLog(req, { action: 'sales_refund.delete', module: 'sales', resource: 'ProductRefund', resourceId: item.id, before: item });
  res.status(204).send();
});

router.post('/stock-adjustments/:id/complete', async (req, res) => {
  const item = await completeStockAdjustment(req.params.id);
  await writeAuditLog(req, { action: 'stock_adjustment.complete', module: 'inventory', resource: 'StockAdjustment', resourceId: item.id, after: item });
  res.json(item);
});

router.get('/storage-duration', async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit ?? 15), 1), 100);
    const q = req.query.q ? String(req.query.q).trim() : '';
    const categoryId = req.query.categoryId ? String(req.query.categoryId) : '';
    const trademarkId = req.query.trademarkId ? String(req.query.trademarkId) : '';
    const tab = req.query.tab ? String(req.query.tab) : 'all'; // all, unsold_long, slow_selling
    const branchId = req.query.branchId ? String(req.query.branchId).trim() : '';

    const minStartDays = req.query.minStartDays ? Number(req.query.minStartDays) : 0;
    const minSoldDays = req.query.minSoldDays ? Number(req.query.minSoldDays) : 0;
    const minStock = req.query.minStock ? Number(req.query.minStock) : 1; // default to > 0

    let targetBranchId: any = null;
    let branchName = '';

    if (branchId) {
      if (branchId === 'hanoi' || branchId === 'hcm') {
        const branchCode = branchId === 'hanoi' ? 'HN' : 'HCM';
        const branch = await Branch.findOne({ code: branchCode }).lean();
        if (branch) {
          targetBranchId = branch._id;
          branchName = branch.name;
        }
      } else if (/^[0-9a-fA-F]{24}$/.test(branchId)) {
        const branch = await Branch.findById(branchId).lean();
        if (branch) {
          targetBranchId = branch._id;
          branchName = branch.name;
        }
      }
    }

    const productQuery: any = {};
    const branchStockMap = new Map<string, number>();

    if (targetBranchId) {
      const stocks = await ProductBranchStock.find({ branchId: targetBranchId, qty: { $gte: minStock } }).lean();
      productQuery._id = { $in: stocks.map(s => s.productId) };
      for (const s of stocks) {
        branchStockMap.set(String(s.productId), s.qty);
      }
    } else {
      productQuery.qty = { $gte: minStock };
    }

    const andConditions: any[] = [];

    if (q) {
      andConditions.push({
        $or: [
          { name: new RegExp(q, 'i') },
          { code: new RegExp(q, 'i') }
        ]
      });
    }
    if (categoryId) {
      const category = await Category.findById(categoryId).lean();
      if (category) {
        andConditions.push({
          $or: [
            { categoryId: categoryId },
            { categoryName: category.name }
          ]
        });
      } else {
        productQuery.categoryId = categoryId;
      }
    }
    if (trademarkId) {
      productQuery.trademarkId = trademarkId;
    }

    if (andConditions.length > 0) {
      productQuery.$and = andConditions;
    }

    const products = await Product.find(productQuery).lean();
    const productIds = products.map(p => p._id);
    const productCodes = products.map(p => p.code).filter(Boolean);

    // Fetch all related transactions in parallel for O(1) in-memory resolution
    const [batches, salePayments, orders, stockAdjustments] = await Promise.all([
      Batch.find({ productId: { $in: productIds } }).lean(),
      SalePayment.find(
        targetBranchId
          ? { status: 'completed', 'items.productId': { $in: productIds }, branchId: targetBranchId }
          : { status: 'completed', 'items.productId': { $in: productIds } }
      ).lean(),
      Order.find(
        targetBranchId && branchName
          ? { 'products.productId': { $in: productIds }, status: { $ne: 'Đã hủy' }, warehouse: branchName }
          : { 'products.productId': { $in: productIds }, status: { $ne: 'Đã hủy' } }
      ).lean(),
      StockAdjustment.find(
        targetBranchId
          ? { status: 'completed', 'items.productId': { $in: productIds }, branchId: targetBranchId }
          : { status: 'completed', 'items.productId': { $in: productIds } }
      ).lean()
    ]);

    // Build Maps for O(1) lookup inside loop
    const batchesMap = new Map<string, any[]>();
    for (const b of batches) {
      const pidStr = String(b.productId);
      if (!batchesMap.has(pidStr)) batchesMap.set(pidStr, []);
      batchesMap.get(pidStr)!.push(b);
    }

    const salePaymentsMap = new Map<string, any>();
    for (const s of salePayments) {
      for (const item of s.items || []) {
        const pidStr = String(item.productId);
        const existing = salePaymentsMap.get(pidStr);
        const currentLoc = s.completedAt || s.createdAt;
        if (!existing || new Date(currentLoc) > new Date(existing.completedAt || existing.createdAt)) {
          salePaymentsMap.set(pidStr, s);
        }
      }
    }


    const ordersMap = new Map<string, any>();
    for (const o of orders) {
      for (const item of o.products || []) {
        const pidStr = String(item.productId);
        const existing = ordersMap.get(pidStr);
        if (!existing || new Date(o.createdAt) > new Date(existing.createdAt)) {
          ordersMap.set(pidStr, o);
        }
      }
    }

    const stockAdjustmentsMap = new Map<string, any>();
    for (const sa of stockAdjustments) {
      for (const item of sa.items || []) {
        const pidStr = String(item.productId);
        const existing = stockAdjustmentsMap.get(pidStr);
        const currentLoc = sa.balanceDate || sa.createdAt;
        if (!existing || new Date(currentLoc) > new Date(existing.balanceDate || existing.createdAt)) {
          stockAdjustmentsMap.set(pidStr, sa);
        }
      }
    }

    const resultItems: any[] = [];
    const nowMs = Date.now();

    let totalProducts = 0;
    let unsoldLong = 0;
    let slowSelling = 0;
    let totalValue = 0;

    for (const product of products) {
      const productQty = targetBranchId ? (branchStockMap.get(String(product._id)) || 0) : (product.qty || 0);

      // Find oldest and newest batch in memory
      const productBatches = batchesMap.get(String(product._id)) || [];
      let oldestBatch = null;
      let newestBatch = null;

      if (productBatches.length > 0) {
        const sortedOldest = [...productBatches].sort((a, b) => {
          const dateA = new Date(a.manufactureDate || a.createdAt).getTime();
          const dateB = new Date(b.manufactureDate || b.createdAt).getTime();
          return dateA - dateB;
        });
        oldestBatch = sortedOldest[0];

        const sortedNewest = [...productBatches].sort((a, b) => {
          const dateA = new Date(a.createdAt || a.manufactureDate).getTime();
          const dateB = new Date(b.createdAt || b.manufactureDate).getTime();
          return dateB - dateA;
        });
        newestBatch = sortedNewest[0];
      }

      // Find last sold from the maps
      const lastSale = salePaymentsMap.get(String(product._id));

      const lastOrder = ordersMap.get(String(product._id));

      const firstTransactionDate = oldestBatch
        ? (oldestBatch.manufactureDate || oldestBatch.createdAt || product.createdAt)
        : product.createdAt;

      // Newest transaction includes batch and stock adjustments
      let lastTransactionDate = product.updatedAt || product.createdAt;
      if (newestBatch) {
        const batchDate = newestBatch.createdAt || newestBatch.manufactureDate;
        if (batchDate && new Date(batchDate) > new Date(lastTransactionDate)) {
          lastTransactionDate = batchDate;
        }
      }
      const lastAdjustment = stockAdjustmentsMap.get(String(product._id));
      if (lastAdjustment) {
        const adjDate = lastAdjustment.balanceDate || lastAdjustment.createdAt;
        if (adjDate && new Date(adjDate) > new Date(lastTransactionDate)) {
          lastTransactionDate = adjDate;
        }
      }

      // Max Sold Date from all 4 sales channels
      let lastSoldDate: any = null;
      const soldDates: Date[] = [];
      if (lastSale) soldDates.push(new Date(lastSale.completedAt || lastSale.createdAt));

      if (lastOrder) soldDates.push(new Date(lastOrder.createdAt));

      if (soldDates.length > 0) {
        lastSoldDate = new Date(Math.max(...soldDates.map(d => d.getTime())));
      }

      const firstTxMs = new Date(firstTransactionDate).getTime();
      const lastTxMs = new Date(lastTransactionDate).getTime();

      const daysFromStart = Math.max(0, Math.floor((nowMs - firstTxMs) / (1000 * 60 * 60 * 24)));
      const daysFromLast = Math.max(0, Math.floor((nowMs - lastTxMs) / (1000 * 60 * 60 * 24)));
      const daysFromLastSold = lastSoldDate
        ? Math.max(0, Math.floor((nowMs - new Date(lastSoldDate).getTime()) / (1000 * 60 * 60 * 24)))
        : null;

      // Update KPI statistics (for all active products before tab filter)
      totalProducts++;
      totalValue += (product.cost || 0) * productQty;
      if (daysFromStart >= 30 && lastSoldDate === null) {
        unsoldLong++;
      }
      if (lastSoldDate !== null && daysFromLastSold !== null && daysFromLastSold >= 30) {
        slowSelling++;
      }

      // Filter by Tab
      if (tab === 'unsold_long') {
        if (daysFromStart < 30 || lastSoldDate !== null) {
          continue;
        }
      } else if (tab === 'slow_selling') {
        if (lastSoldDate === null || (daysFromLastSold !== null && daysFromLastSold < 30)) {
          continue;
        }
      }

      // Filter by custom input numbers
      if (minStartDays > 0 && daysFromStart < minStartDays) {
        continue;
      }
      if (minSoldDays > 0) {
        if (daysFromLastSold === null || daysFromLastSold < minSoldDays) {
          continue;
        }
      }

      resultItems.push({
        _id: product._id,
        code: product.code,
        name: product.name,
        supplierName: product.supplierName || '',
        categoryName: product.categoryName || '',
        cost: product.cost || 0,
        price: product.price || 0,
        qty: productQty,
        globalQty: product.qty || 0,
        firstTransactionDate: firstTransactionDate ? new Date(firstTransactionDate).toISOString() : undefined,
        lastTransactionDate: lastTransactionDate ? new Date(lastTransactionDate).toISOString() : undefined,
        lastSoldDate: lastSoldDate ? new Date(lastSoldDate).toISOString() : undefined,
        daysFromStart,
        daysFromLast,
        daysFromLastSold
      });
    }

    const total = resultItems.length;
    const startIndex = (page - 1) * limit;
    const paginatedItems = resultItems.slice(startIndex, startIndex + limit);

    res.json({
      items: paginatedItems,
      total,
      page,
      limit,
      kpis: {
        totalProducts,
        unsoldLong,
        slowSelling,
        totalValue
      }
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Lỗi server' });
  }
});

router.get('/inventories', async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit ?? 15), 1), 5000);
    const q = req.query.q ? String(req.query.q).trim() : '';
    const branchId = req.query.branchId ? String(req.query.branchId).trim() : '';
    const categoryId = req.query.categoryId ? String(req.query.categoryId).trim() : '';
    const sortField = req.query.sort ? String(req.query.sort) : 'createdAt';
    const sortOrder = req.query.order === 'asc' ? 1 : -1;

    // Find branches
    const branchCN = await resolveBranchReference({ warehouse: 'Chi nhánh trung tâm', warehouseCode: 'CN001', allowInactive: true });
    const branchHN = await resolveBranchReference({ warehouse: 'Kho Hà Nội', warehouseCode: 'HN', allowInactive: true });
    const branchHCM = await resolveBranchReference({ warehouse: 'Kho HCM', warehouseCode: 'HCM', allowInactive: true });
    const objectIdLike = /^[a-f\d]{24}$/i;
    const selectedBranchId =
      objectIdLike.test(branchId)
        ? branchId
        : branchId === 'hanoi'
          ? String(branchHN?._id || '')
          : branchId === 'hcm'
            ? String(branchHCM?._id || '')
            : '';

    const warehouseScope = assignedWarehouseScope(req as any);
    if (warehouseScope && !warehouseScope.length) return res.status(403).json({ message: 'No assigned warehouse' });
    if (warehouseScope && selectedBranchId && !warehouseScope.includes(selectedBranchId)) {
      return res.status(403).json({ message: 'Warehouse is outside employee scope' });
    }
    const inventoryBranchIds = warehouseScope
      ? (selectedBranchId ? [selectedBranchId] : warehouseScope)
      : (selectedBranchId ? [selectedBranchId] : null);

    const filter: any = {};
    if (categoryId) {
      filter.categoryId = categoryId;
    }

    // Filter by visible warehouse scope.
    if (inventoryBranchIds) {
      const stocks = await ProductBranchStock.find({ branchId: { $in: inventoryBranchIds }, qty: { $gt: 0 } }).lean();
      filter._id = { $in: stocks.map(s => s.productId) };
    }

    // Search query
    if (q) {
      filter.$or = [
        { name: new RegExp(q, 'i') },
        { code: new RegExp(q, 'i') },
        { barcode: new RegExp(q, 'i') }
      ];
    }

    // Find products matching the filter
    const products = await Product.find(filter).lean();

    // Fetch all stock records for the found products in one query
    const productIds = products.map(p => p._id);
    const stockQuery: Record<string, any> = { productId: { $in: productIds } };
    if (warehouseScope) stockQuery.branchId = { $in: warehouseScope };
    const stocksList = await ProductBranchStock.find(stockQuery).lean();

    const branchIds = [...new Set(stocksList.map((stock: any) => String(stock.branchId)).filter(Boolean))];
    const branchList = branchIds.length ? await Branch.find({ _id: { $in: branchIds } }).select('_id code name').lean() : [];
    const branchCodeById = new Map(branchList.map((branch: any) => [String(branch._id), String(branch.code || '')]));

    // Group stocks by productId
    const stockMap = new Map<string, any[]>();
    for (const s of stocksList) {
      const pidStr = String(s.productId);
      if (!stockMap.has(pidStr)) {
        stockMap.set(pidStr, []);
      }
      stockMap.get(pidStr)!.push(s);
    }

    // Map to inventory items with real stocks
    const allItems = [];
    for (const p of products) {
      const pAny = p as any;
      const stocks = stockMap.get(String(pAny._id)) || [];
      const stockCN = stocks.find(s => String(s.branchId) === String(branchCN?._id))?.qty || 0;
      const stockHanoi = stocks.find(s => String(s.branchId) === String(branchHN?._id))?.qty || 0;
      const stockHCM = stocks.find(s => String(s.branchId) === String(branchHCM?._id))?.qty || 0;
      const selectedStock = selectedBranchId
        ? stocks.find(s => String(s.branchId) === selectedBranchId)?.qty || 0
        : undefined;
      const totalStocks = selectedBranchId ? stocks.filter(s => String(s.branchId) === selectedBranchId) : stocks;
      const scopedTotalStock = totalStocks.reduce((sum, stock) => sum + Number(stock.qty || 0), 0);
      const stockByBranchId: Record<string, number> = {};
      const stockByBranchCode: Record<string, number> = {};
      for (const stock of stocks) {
        const stockBranchId = String(stock.branchId);
        const qty = Number(stock.qty || 0);
        stockByBranchId[stockBranchId] = (stockByBranchId[stockBranchId] || 0) + qty;
        const stockBranchCode = branchCodeById.get(stockBranchId);
        if (stockBranchCode) stockByBranchCode[stockBranchCode] = (stockByBranchCode[stockBranchCode] || 0) + qty;
      }
      const isLimited = Boolean(warehouseScope);

      allItems.push({
        _id: pAny._id,
        code: pAny.code,
        name: pAny.name,
        barcode: pAny.barcode || '',
        parentCode: pAny.parentCode || '',
        parentName: pAny.parentName || '',
        weight: pAny.weight || 0,
        price: pAny.price || 0,
        cost: isLimited ? undefined : pAny.cost || 0,
        importPrice: isLimited ? undefined : pAny.cost || 0,
        wholesalePrice: isLimited ? undefined : pAny.wholesalePrice || 0,
        totalStock: scopedTotalStock,
        stockCN,
        stockHanoi,
        stockHCM,
        selectedStock,
        stockByBranchId,
        stockByBranchCode,
        unit: pAny.unit || '',
        createdAt: pAny.createdAt
      });
    }

    // Sort the list
    allItems.sort((a: any, b: any) => {
      if (sortField === 'createdAt') {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return sortOrder * (dateA - dateB);
      }

      let valA = a[sortField];
      let valB = b[sortField];

      if (sortField.startsWith('stock_')) {
        const branchSortId = sortField.slice('stock_'.length);
        valA = a.stockByBranchId?.[branchSortId] || 0;
        valB = b.stockByBranchId?.[branchSortId] || 0;
      }

      // Handle string case-insensitive comparison
      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortOrder * valA.localeCompare(valB, 'vi');
      }

      const numA = Number(valA) || 0;
      const numB = Number(valB) || 0;

      if (numA < numB) return -sortOrder;
      if (numA > numB) return sortOrder;
      return 0;
    });

    const total = allItems.length;
    const startIndex = (page - 1) * limit;
    const paginatedItems = allItems.slice(startIndex, startIndex + limit);

    res.json({
      items: paginatedItems,
      total,
      page,
      limit
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Lỗi server' });
  }
});

router.get('/edit-logs', async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit ?? 15), 1), 100);
    const q = req.query.q ? String(req.query.q).trim() : '';
    const logType = req.query.logType ? String(req.query.logType).trim() : '';
    const logAction = req.query.logAction ? String(req.query.logAction).trim() : '';
    const createdBy = req.query.createdBy ? String(req.query.createdBy).trim() : '';
    const fromDate = req.query.fromDate ? String(req.query.fromDate).trim() : '';
    const toDate = req.query.toDate ? String(req.query.toDate).trim() : '';

    const filter: any = {};

    if (q) {
      filter.$or = [
        { productCode: new RegExp(q, 'i') },
        { productName: new RegExp(q, 'i') },
        { createdBy: new RegExp(q, 'i') }
      ];
    }

    if (logType) {
      filter.logType = logType;
    }

    if (logAction) {
      filter.logAction = logAction;
    }

    if (createdBy) {
      filter.createdBy = createdBy;
    }

    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) {
        filter.createdAt.$gte = new Date(fromDate);
      }
      if (toDate) {
        const endOfDay = new Date(toDate);
        endOfDay.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = endOfDay;
      }
    }

    const [items, total, logTypes, logActions, editors] = await Promise.all([
      ProductEditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      ProductEditLog.countDocuments(filter),
      ProductEditLog.distinct('logType'),
      ProductEditLog.distinct('logAction'),
      ProductEditLog.distinct('createdBy'),
    ]);

    const toneByLogType = Object.fromEntries(
      logTypes
        .filter(Boolean)
        .map((type) => [type, String(type).toLowerCase().includes('xóa') ? 'danger' : 'warning']),
    );

    res.json({
      items,
      total,
      page,
      limit,
      meta: {
        logTypes: logTypes.filter(Boolean).sort((left, right) => String(left).localeCompare(String(right), 'vi')),
        logActions: logActions.filter(Boolean).sort((left, right) => String(left).localeCompare(String(right), 'vi')),
        editors: editors.filter(Boolean).sort((left, right) => String(left).localeCompare(String(right), 'vi')),
        toneByLogType,
      },
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Lỗi server' });
  }
});

export default router;
