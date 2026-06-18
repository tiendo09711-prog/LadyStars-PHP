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
import { Batch, Product, ProductBranchStock } from '../product/product.models.js';
import multer from 'multer';
import * as xlsx from 'xlsx';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

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
