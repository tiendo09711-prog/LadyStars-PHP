import fs from 'fs';
import os from 'os';
import path from 'path';
import mongoose from 'mongoose';
import xlsxPkg from 'xlsx';
import { connectDatabase } from '../config/database.js';
import { User } from '../core/auth/user.model.js';
import { Branch } from '../core/org/branch.model.js';
import {
  Batch,
  Category,
  DeliveryPartner,
  PaymentMethod,
  Product,
  ProductBranchStock,
  ProductEditLog,
  ProductLog,
  SaleChannel,
  Shelf,
  StockAdjustment,
  Trademark,
} from '../modules/product/product.models.js';
import {
  Vendor,
  VendorGroup,
  VendorPurchase,
  VendorRefund,
  VendorTransfer,
} from '../modules/vendor/vendor.models.js';

type Row = Record<string, any>;

const xlsx = xlsxPkg as typeof import('xlsx');
const dataDir = process.env.PHASE12_DATA_DIR || path.join(os.homedir(), 'Downloads');
const projectRoot = process.cwd().endsWith(`${path.sep}server`)
  ? path.resolve(process.cwd(), '..')
  : process.cwd();
const candidateDirs = [
  dataDir,
  path.join(projectRoot, 'Bảng dữ liệu'),
  path.join(os.homedir(), 'Downloads'),
];

function normalizeFileName(value: string) {
  return value.normalize('NFC').toLowerCase();
}

function resolveDataFile(fileName: string) {
  const normalized = normalizeFileName(fileName);
  for (const dir of candidateDirs) {
    try {
      const entries = fs.readdirSync(dir) as string[];
      const exact = entries.find((entry) => normalizeFileName(entry) === normalized);
      if (exact) return path.join(dir, exact);
    } catch {
      // Try next candidate directory.
    }
  }
  return path.join(dataDir, fileName);
}

const files = {
  vendors: resolveDataFile('Nhà cung cấp.xlsx'),
  categories: resolveDataFile('Danh mục .xlsx'),
  products: resolveDataFile('Danh sách sản phẩm.xlsx'),
  inventory: resolveDataFile('Tồn kho.xlsx'),
  productLogs: resolveDataFile('Lịch sử sửa xóa.xlsx'),
};

const summary: Record<string, number> = {};
const warnings: string[] = [];

function count(key: string, value: number) {
  summary[key] = value;
}

function text(value: any): string {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function money(value: any): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value).replace(/\s/g, '').replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value: any): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number') {
    const parsed = xlsx.SSF.parse_date_code(value);
    if (!parsed) return undefined;
    return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 12, parsed.M || 0, parsed.S || 0);
  }

  const raw = text(value);
  if (!raw) return undefined;
  const vn = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (vn) {
    return new Date(Number(vn[3]), Number(vn[2]) - 1, Number(vn[1]), Number(vn[4] || 12), Number(vn[5] || 0), Number(vn[6] || 0));
  }

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), Number(iso[4] || 12), Number(iso[5] || 0), Number(iso[6] || 0));
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function readRows(file: string): Row[] {
  const workbook = xlsx.readFile(file, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_json<Row>(sheet, { defval: '', raw: false });
}

function ensureDataFiles() {
  const missing = Object.entries(files).filter(([, file]) => !fs.existsSync(file));
  if (missing.length) {
    throw new Error(`Thiếu file import: ${missing.map(([key, file]) => `${key}=${file}`).join('; ')}`);
  }
}

function productCode(row: Row, index: number): string {
  return text(row['Mã sản phẩm'])
    || (text(row['ID sản phẩm']) ? `SP.${text(row['ID sản phẩm'])}` : '')
    || (text(row['Mã vạch']) ? `BAR.${text(row['Mã vạch'])}` : '')
    || `SP.ROW.${index + 1}`;
}

function productType(value: string): 'product' | 'service' | 'combo' {
  const lower = value.toLowerCase();
  if (lower.includes('dịch') || lower.includes('dich')) return 'service';
  if (lower.includes('combo')) return 'combo';
  return 'product';
}

function isActiveStatus(value: string) {
  const lower = value.toLowerCase();
  return lower.includes('hoạt') || lower.includes('đang');
}

async function resetPhase12Collections() {
  await Promise.all([
    ProductLog.deleteMany({}),
    ProductEditLog.deleteMany({}),
    ProductBranchStock.deleteMany({}),
    Batch.deleteMany({}),
    StockAdjustment.deleteMany({}),
    Product.deleteMany({}),
    Category.deleteMany({}),
    Trademark.deleteMany({}),
    Shelf.deleteMany({}),
    SaleChannel.deleteMany({}),
    DeliveryPartner.deleteMany({}),
    PaymentMethod.deleteMany({}),
    VendorPurchase.deleteMany({}),
    VendorRefund.deleteMany({}),
    VendorTransfer.deleteMany({}),
    VendorGroup.deleteMany({}),
    Vendor.deleteMany({}),
  ]);

  await Branch.deleteMany({ code: { $nin: ['HN', 'HCM'] } });
}

async function ensureBranches() {
  const hn = await Branch.findOneAndUpdate(
    { code: 'HN' },
    { name: 'Kho Hà Nội', code: 'HN', isDefault: true, isActive: true },
    { upsert: true, new: true },
  );
  const hcm = await Branch.findOneAndUpdate(
    { code: 'HCM' },
    { name: 'Kho HCM', code: 'HCM', isDefault: false, isActive: true },
    { upsert: true, new: true },
  );

  count('branches', await Branch.countDocuments({ code: { $in: ['HN', 'HCM'] } }));
  return { hn, hcm };
}

async function adminId() {
  const admin = await User.findOne({ email: 'admin@myerp.local' }) || await User.findOne({ isRootOwner: true }) || await User.findOne();
  return admin?._id;
}

async function importCategories(userId: mongoose.Types.ObjectId | undefined) {
  const rows = readRows(files.categories);
  const docs: any[] = [];
  const byExternalId = new Map<string, any>();
  const seenNames = new Set<string>();

  for (const row of rows) {
    const name = text(row['Tên danh mục']);
    if (!name || seenNames.has(name)) continue;
    seenNames.add(name);
    const doc = {
      name,
      code: text(row['Mã danh mục']) || text(row['ID']) || name,
      userId,
      isActive: isActiveStatus(text(row['Hoạt động'])),
      isVisible: text(row['Hiển thị']).toLowerCase() === 'hiển thị',
      productCount: money(row['Số sản phẩm']),
      url: text(row['Link trên website']),
      externalId: text(row['ID']),
      externalParentId: text(row['ParentId']),
      createdAt: parseDate(row['Ngày tạo']),
      updatedAt: parseDate(row['Ngày tạo']),
    };
    docs.push(doc);
  }

  const categories = docs.length ? await Category.insertMany(docs as any[]) : [];
  for (const category of categories as any[]) {
    if (category.externalId) byExternalId.set(String(category.externalId), category);
  }
  for (const category of categories as any[]) {
    if (category.externalParentId && byExternalId.has(String(category.externalParentId))) {
      category.parentId = byExternalId.get(String(category.externalParentId))._id;
      await category.save();
    }
  }

  count('categories_excel_rows', rows.length);
  count('categories_imported', categories.length);
}

async function importVendors(userId: mongoose.Types.ObjectId | undefined) {
  const rows = readRows(files.vendors);
  const docs: any[] = [];
  const seen = new Set<string>();

  for (const [index, row] of rows.entries()) {
    const name = text(row['Tên nhà cung cấp']);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    docs.push({
      name,
      code: text(row['Mã nhà cung cấp']) || `NCC.${text(row['ID']) || index + 1}`,
      type: text(row['Loại']).toLowerCase().includes('cá') ? 'person' : 'company',
      phone: text(row['Điện thoại']),
      email: text(row['Email']),
      address: text(row['Địa chỉ']),
      note: text(row['Ghi chú']),
      status: text(row['Trạng thái']).toLowerCase().includes('ngừng') ? 'inactive' : 'active',
      externalId: text(row['ID']),
      bankName: text(row['Ngân hàng']),
      bankBranch: text(row['Chi nhánh']),
      bankAccountNumber: text(row['Số tài khoản']),
      bankAccountName: text(row['Chủ tài khoản']),
      userCreatedId: userId,
    });
  }

  const vendors = docs.length ? await Vendor.insertMany(docs) : [];
  count('vendors_excel_rows', rows.length);
  count('vendors_imported', vendors.length);
}

async function importTrademarks(userId: mongoose.Types.ObjectId | undefined) {
  const rows = readRows(files.products);
  const names = new Map<string, string>();
  for (const row of rows) {
    const name = text(row['Thương hiệu']);
    if (name) names.set(name.toLowerCase(), name);
  }
  const docs = [...names.values()].map((name) => ({ name, userId }));
  const trademarks = docs.length ? await Trademark.insertMany(docs) : [];
  count('trademarks_imported', trademarks.length);
}

async function importProducts(userId: mongoose.Types.ObjectId | undefined) {
  const rows = readRows(files.products);
  const categories = await Category.find().lean();
  const trademarks = await Trademark.find().lean();
  const categoryByName = new Map(categories.map((c: any) => [String(c.name).toLowerCase(), c]));
  const categoryByCode = new Map(categories.map((c: any) => [String(c.code || '').toLowerCase(), c]));
  const trademarkByName = new Map(trademarks.map((t: any) => [String(t.name).toLowerCase(), t]));
  const seen = new Set<string>();
  const docs: any[] = [];

  rows.forEach((row, index) => {
    let code = productCode(row, index);
    if (seen.has(code)) code = `${code}.${text(row['ID sản phẩm']) || index + 1}`;
    seen.add(code);

    const category = categoryByCode.get(text(row['Mã danh mục']).toLowerCase())
      || categoryByName.get(text(row['Danh mục']).toLowerCase());
    const trademark = trademarkByName.get(text(row['Thương hiệu']).toLowerCase());
    const createdAt = parseDate(row['Ngày tạo']);

    docs.push({
      code,
      name: text(row['Tên sản phẩm']) || code,
      barcode: text(row['Mã vạch']),
      parentCode: text(row['Mã sản phẩm cha']),
      parentName: text(row['Tên sản phẩm cha']),
      categoryId: category?._id,
      trademarkId: trademark?._id,
      categoryName: text(row['Danh mục']),
      trademarkName: text(row['Thương hiệu']),
      supplierName: text(row['Nhà cung cấp']),
      origin: text(row['Xuất xứ']),
      color: text(row['Màu sắc']),
      size: text(row['Kích thước']),
      cost: money(row['Giá vốn']) || money(row['Giá nhập']),
      price: money(row['Giá bán']),
      wholesalePrice: money(row['Giá sỉ']),
      qty: money(row['Tồn']),
      weight: money(row['Cân nặng cả vỏ hộp']),
      unit: text(row['Đơn vị tính']) || 'Cái',
      status: text(row['Trạng thái']) || 'Mới',
      type: productType(text(row['Loại sản phẩm'])),
      allowsSale: true,
      description: text(row['Tên khác']),
      externalProductId: text(row['ID sản phẩm']),
      externalParentId: text(row['Id sản phẩm cha']),
      oldPrice: money(row['Giá cũ']),
      totalStockFromList: money(row['Tổng tồn']),
      availableStockFromList: money(row['Có thể bán']),
      imageUrl: text(row['Link ảnh sản phẩm']),
      websiteUrl: text(row['Link trên website']),
      userId,
      createdAt,
      updatedAt: createdAt,
    });
  });

  const products = docs.length ? await Product.insertMany(docs) : [];
  count('products_excel_rows', rows.length);
  count('products_imported', products.length);
}

async function importInventory(branches: { hn: any; hcm: any }) {
  const products = await Product.find();
  const byCode = new Map(products.map((p: any) => [String(p.code), p]));
  const byBarcode = new Map(products.map((p: any) => [String(p.barcode || ''), p]).filter(([key]) => key));
  const byExternalId = new Map(products.map((p: any) => [String(p.externalProductId || ''), p]).filter(([key]) => key));
  const rows = readRows(files.inventory);
  const stocks: any[] = [];
  let linked = 0;
  let totalQty = 0;

  for (const row of rows) {
    const product = byCode.get(text(row['Mã sản phẩm']))
      || byBarcode.get(text(row['Mã vạch']))
      || byExternalId.get(text(row['ID']));
    if (!product) {
      warnings.push(`Không tìm thấy sản phẩm tồn kho: ${text(row['Mã sản phẩm']) || text(row['ID'])}`);
      continue;
    }

    const hnQty = money(row['Kho Hà Nội']);
    const hcmQty = money(row['Kho HCM']);
    const rowQty = hnQty + hcmQty;
    totalQty += rowQty;

    product.qty = rowQty;
    product.price = money(row['Giá']) || product.price;
    product.cost = money(row['Giá vốn']) || money(row['Giá nhập']) || product.cost;
    product.wholesalePrice = money(row['Giá bán sỉ']) || product.wholesalePrice;
    await product.save();

    stocks.push({ productId: product._id, branchId: branches.hn._id, qty: hnQty, minQuantity: 0, maxQuantity: 999999999 });
    stocks.push({ productId: product._id, branchId: branches.hcm._id, qty: hcmQty, minQuantity: 0, maxQuantity: 999999999 });
    linked++;
  }

  if (stocks.length) await ProductBranchStock.insertMany(stocks);
  count('inventory_excel_rows', rows.length);
  count('inventory_rows_linked', linked);
  count('branch_stock_records', stocks.length);
  count('inventory_total_qty_from_excel', totalQty);
}

async function importProductLogs() {
  const rows = readRows(files.productLogs);
  const docs = rows
    .filter((row) => text(row['Loại log']) || text(row['Mã sản phẩm']) || text(row['Tên sản phẩm']))
    .map((row, index) => {
      const createdAt = parseDate(row['Thời gian']);
      return {
        productCode: text(row['Mã sản phẩm']) || `UNKNOWN.${index + 1}`,
        productName: text(row['Tên sản phẩm']) || 'UNKNOWN',
        logType: text(row['Loại log']) || 'Sửa sản phẩm',
        logAction: text(row['Kiểu log']) || 'Không có dữ liệu',
        createdBy: text(row['Người sửa']) || 'Admin',
        createdAt,
        updatedAt: createdAt,
      };
    });

  if (docs.length) await ProductEditLog.insertMany(docs);
  count('product_logs_excel_rows', rows.length);
  count('product_edit_logs_imported', docs.length);
}

async function validateImport() {
  const stockAgg = await ProductBranchStock.aggregate([
    { $group: { _id: null, totalQty: { $sum: '$qty' }, rows: { $sum: 1 } } },
  ]);
  const productAgg = await Product.aggregate([
    { $group: { _id: null, totalQty: { $sum: '$qty' }, rows: { $sum: 1 } } },
  ]);

  count('db_products', productAgg[0]?.rows ?? 0);
  count('db_product_qty_sum', productAgg[0]?.totalQty ?? 0);
  count('db_branch_stock_records', stockAgg[0]?.rows ?? 0);
  count('db_branch_stock_qty_sum', stockAgg[0]?.totalQty ?? 0);
  count('db_categories', await Category.countDocuments());
  count('db_vendors', await Vendor.countDocuments());
  count('db_trademarks', await Trademark.countDocuments());
  count('db_product_edit_logs', await ProductEditLog.countDocuments());
}

async function main() {
  ensureDataFiles();
  await connectDatabase();
  const userId = await adminId();

  await resetPhase12Collections();
  const branches = await ensureBranches();
  await importCategories(userId);
  await importVendors(userId);
  await importTrademarks(userId);
  await importProducts(userId);
  await importInventory(branches);
  await importProductLogs();
  await validateImport();

  console.log(JSON.stringify({ dataDir, summary, warnings }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
