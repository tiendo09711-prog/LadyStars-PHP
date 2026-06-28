import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import xlsxPkg from 'xlsx';
import bcrypt from 'bcryptjs';
import { connectDatabase } from '../config/database.js';
import { User } from '../core/auth/user.model.js';
import { AuditLog } from '../core/audit/audit.model.js';
import { Branch } from '../core/org/branch.model.js';
import { StoreSetting } from '../core/settings/settings.model.js';
import { Customer, CustomerCare, CustomerGroup } from '../modules/customer/customer.models.js';
import {
  Batch,
  Category,
  DeliveryPartner,
  PaymentMethod,
  Product,
  ProductBranchStock,
  ProductEditLog,
  ProductLog,
  ProductRefund,
  SaleChannel,
  SalePayment,
  Shelf,
  StockAdjustment,
  Trademark,
} from '../modules/product/product.models.js';
import {
  InventoryCheck,
  InventoryCheckProduct,
  InventoryProduct,
  InventoryVoucher,
  WarehouseTransfer,
} from '../modules/warehouse/warehouse.models.js';
import {
  Vendor,
  VendorGroup,
  VendorPurchase,
  VendorRefund,
  VendorTransfer,
} from '../modules/vendor/vendor.models.js';

type Row = Record<string, any>;

const xlsx = xlsxPkg as typeof import('xlsx');

const projectRoot = fs.existsSync(path.join(process.cwd(), 'server'))
  ? process.cwd()
  : path.resolve(process.cwd(), '..');
const dataRoot = path.join(projectRoot, 'Bảng dữ liệu');

const files = {
  categories: path.join(dataRoot, 'Danh mục nền', 'Danh mục sản phẩm.xlsx'),
  products: path.join(dataRoot, 'Sản phẩm và tồn kho', 'Danh sách sản phẩm.xlsx'),
  inventory: path.join(dataRoot, 'Sản phẩm và tồn kho', 'Tồn Kho.xlsx'),
  productLogs: path.join(dataRoot, 'Sản phẩm và tồn kho', 'Lịch sử sửa xóa sản phẩm.xlsx'),
  customersAll: path.join(dataRoot, 'Khách hàng', 'Khách Hàng - tab Tất cả.xlsx'),
  customersHighValue: path.join(dataRoot, 'Khách hàng', 'Khách hàng - tab Mua nhiều.xlsx'),
  customersFrequent: path.join(dataRoot, 'Khách hàng', 'Khách hàng - tab Mua thường xuyên.xlsx'),
  customersBirthdayHighValue: path.join(dataRoot, 'Khách hàng', 'Khách hàng - tab Mua nhiều, sinh nhật trong tháng.xlsx'),
  customersInactive: path.join(dataRoot, 'Khách hàng', 'Khách Hàng - tab Lâu chưa mua.xlsx'),
  customerCare: path.join(dataRoot, 'Khách hàng', 'Lịch sử chăm sóc khách hàng.xlsx'),
  retailSales: path.join(dataRoot, 'Bán hàng đơn hàng', 'Bán lẻ tất cả hóa đơn.xlsx'),
  vouchers: path.join(dataRoot, 'Kho vận', 'Phiếu xuất nhập kho.xlsx'),
  voucherProducts: path.join(dataRoot, 'Kho vận', 'Sản phẩm xuất phiếu trong kho.xlsx'),
  transfersAll: path.join(dataRoot, 'Kho vận', 'Chuyển kho - tất cả.xlsx'),
  transfersDraft: path.join(dataRoot, 'Kho vận', 'Chuyển kho - phiếu nháp.xlsx'),
  transfersIncoming: path.join(dataRoot, 'Kho vận', 'Chuyển kho - sắp chuyển đến.xlsx'),
  transfersOutgoing: path.join(dataRoot, 'Kho vận', 'Chuyển kho - đang chuyển đi.xlsx'),
  inventoryChecks: path.join(dataRoot, 'Kho vận', 'Kiểm kho.xlsx'),
  inventoryCheckProducts: path.join(dataRoot, 'Kho vận', 'Sản phẩm kiểm kho.xlsx'),
  cash: path.join(dataRoot, 'Kế toán', 'Sổ quỹ tiền mặt.xlsx'),
  bank: path.join(dataRoot, 'Kế toán', 'Sổ quỹ ngân hàng.xlsx'),
  summary: path.join(dataRoot, 'Kế toán', 'Tổng hợp thu chi.xlsx'),
  accounts: path.join(dataRoot, 'Kế toán', 'Tài khoản kế toán.xlsx'),
  journalEntries: path.join(dataRoot, 'Kế toán', 'Bút toán.xlsx'),
  customerDebt: path.join(dataRoot, 'Kế toán', 'Công nợ khách hàng.xlsx'),
};

const summary: Record<string, number> = {};
const warnings: string[] = [];

function count(name: string, value: number) {
  summary[name] = value;
}

function text(value: any): string {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function money(value: any): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value)
    .replace(/\s/g, '')
    .replace(/,/g, '')
    .replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
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
  const vn = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (vn) {
    return new Date(
      Number(vn[3]),
      Number(vn[2]) - 1,
      Number(vn[1]),
      Number(vn[4] || 12),
      Number(vn[5] || 0),
      Number(vn[6] || 0),
    );
  }

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (iso) {
    return new Date(
      Number(iso[1]),
      Number(iso[2]) - 1,
      Number(iso[3]),
      Number(iso[4] || 12),
      Number(iso[5] || 0),
      Number(iso[6] || 0),
    );
  }

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function displayDate(value: any): string {
  const d = parseDate(value);
  if (!d) return text(value);
  return d.toLocaleDateString('vi-VN');
}

function readRows(file: string): Row[] {
  if (!fs.existsSync(file)) {
    warnings.push(`Không tìm thấy file: ${file}`);
    return [];
  }
  const workbook = xlsx.readFile(file, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_json<Row>(sheet, { defval: '', raw: false });
}

function customerKey(row: Row): string {
  const id = text(row['ID']);
  if (id) return `id:${id}`;
  const phone = text(row['Số điện thoại'] || row['SĐT Khách hàng'] || row['Điện thoại']);
  if (phone) return `phone:${phone}`;
  return `name:${text(row['Tên khách hàng'] || row['Khách hàng']).toLowerCase()}`;
}

function customerCode(row: Row): string {
  return text(row['Mã khách hàng']) || `KH.${text(row['ID']) || customerKey(row).replace(/[^a-zA-Z0-9]/g, '.')}`;
}

function saleChannelName() {
  return 'Bán tại cửa hàng';
}

function branchCodeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('hcm') || lower.includes('hồ chí minh')) return 'HCM';
  return 'HN';
}

function gender(value: string): 'female' | 'male' | 'other' {
  const lower = value.toLowerCase();
  if (lower.includes('nam')) return 'male';
  if (lower.includes('nữ') || lower.includes('nu')) return 'female';
  return 'other';
}

function productType(value: string): 'product' | 'service' | 'combo' {
  const lower = value.toLowerCase();
  if (lower.includes('dịch') || lower.includes('dich')) return 'service';
  if (lower.includes('combo')) return 'combo';
  return 'product';
}

function productCode(row: Row, index: number): string {
  const code = text(row['Mã sản phẩm']);
  if (code) return code;
  const id = text(row['ID sản phẩm'] || row['ID']);
  if (id) return `SP.${id}`;
  const barcode = text(row['Mã vạch']);
  if (barcode) return `BAR.${barcode}`;
  return `SP.ROW.${index + 1}`;
}

async function resetCollections() {
  await Promise.all([
    AuditLog.deleteMany({}),
    ProductLog.deleteMany({}),
    ProductEditLog.deleteMany({}),
    ProductBranchStock.deleteMany({}),
    Batch.deleteMany({}),
    ProductRefund.deleteMany({}),
    SalePayment.deleteMany({}),
    StockAdjustment.deleteMany({}),
    Product.deleteMany({}),
    Category.deleteMany({}),
    Trademark.deleteMany({}),
    Shelf.deleteMany({}),
    SaleChannel.deleteMany({}),
    DeliveryPartner.deleteMany({}),
    PaymentMethod.deleteMany({}),
    CustomerCare.deleteMany({}),
    CustomerGroup.deleteMany({}),
    Customer.deleteMany({}),
    VendorPurchase.deleteMany({}),
    VendorRefund.deleteMany({}),
    VendorTransfer.deleteMany({}),
    VendorGroup.deleteMany({}),
    Vendor.deleteMany({}),
    InventoryProduct.deleteMany({}),
    InventoryVoucher.deleteMany({}),
    WarehouseTransfer.deleteMany({}),
    InventoryCheckProduct.deleteMany({}),
    InventoryCheck.deleteMany({}),
    Branch.deleteMany({}),
  ]);

  await User.deleteMany({ isRootOwner: { $ne: true }, email: { $ne: 'admin@myerp.local' } });
}

async function ensureAdmin() {
  const passwordHash = await bcrypt.hash('admin123', 10);
  const admin = await User.findOneAndUpdate(
    { email: 'admin@myerp.local' },
    {
      $setOnInsert: { name: 'Admin', passwordHash },
      $set: { role: 'owner', status: 'open', isRootOwner: true, isActive: true },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await StoreSetting.findOneAndUpdate(
    { singletonKey: 'store' },
    { $set: { singletonKey: 'store', shopName: 'LadyStars' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return admin;
}

async function importBranches(adminId: mongoose.Types.ObjectId) {
  const branches = await Branch.insertMany([
    { name: 'Kho Hà Nội', code: 'HN', isActive: true },
    { name: 'Kho HCM', code: 'HCM', isActive: true },
  ]);
  await User.updateMany({}, { $set: { branchId: branches[0]._id, isActive: true } });
  count('branches', branches.length);
  return {
    adminId,
    hn: branches.find((b) => b.code === 'HN')!,
    hcm: branches.find((b) => b.code === 'HCM')!,
  };
}

async function importBaseCatalogs(adminId: mongoose.Types.ObjectId) {
  const rows = readRows(files.categories);
  const categoryDocs = rows
    .filter((r) => text(r['Tên danh mục']))
    .map((r) => ({
      name: text(r['Tên danh mục']),
      code: text(r['Mã danh mục']) || text(r['ID']),
      userId: adminId,
      isActive: text(r['Hoạt động']) === 'Hoạt động',
      isVisible: text(r['Hiển thị']) === 'Hiển thị',
      productCount: money(r['Số sản phẩm']),
      url: text(r['Link trên website']),
      externalId: text(r['ID']),
      externalParentId: text(r['ParentId']),
      createdAt: parseDate(r['Ngày tạo']),
      updatedAt: parseDate(r['Ngày tạo']),
    }));

  const categories = categoryDocs.length ? await Category.insertMany(categoryDocs as any[]) : [];
  const categoryByExternalId = new Map(categories.map((c: any) => [String(c.externalId || ''), c]));
  for (const category of categories as any[]) {
    if (category.externalParentId && categoryByExternalId.has(String(category.externalParentId))) {
      category.parentId = categoryByExternalId.get(String(category.externalParentId))._id;
      await category.save();
    }
  }

  const productRows = readRows(files.products);
  const trademarkNames = new Map<string, string>();
  const supplierNames = new Map<string, string>();
  for (const row of productRows) {
    const trademark = text(row['Thương hiệu']);
    if (trademark) trademarkNames.set(trademark.toLowerCase(), trademark);
    const supplier = text(row['Nhà cung cấp']);
    if (supplier) supplierNames.set(supplier.toLowerCase(), supplier);
  }

  const trademarks = await Trademark.insertMany([...trademarkNames.values()].map((name) => ({ name, userId: adminId })));
  const vendors = await Vendor.insertMany([...supplierNames.values()].map((name, index) => ({
    name,
    code: `NCC.${index + 1}`,
    type: 'company',
    status: 'active',
    userCreatedId: adminId,
  })));

  await SaleChannel.create({
    name: saleChannelName(),
    description: 'Kênh bán trực tiếp tại cửa hàng',
    sortOrder: 1,
    isActive: true,
    isDefault: true,
  });

  await PaymentMethod.insertMany([
    { name: 'Tiền mặt', code: 'cash', targetPaymentStatus: 'paid', sortOrder: 1, isActive: true },
    { name: 'Chuyển khoản', code: 'bank_transfer', targetPaymentStatus: 'paid', sortOrder: 2, isActive: true },
    { name: 'Quẹt thẻ', code: 'card', targetPaymentStatus: 'paid', sortOrder: 3, isActive: true },
    { name: 'Trả góp', code: 'installment', targetPaymentStatus: 'paid', sortOrder: 4, isActive: true },
    { name: 'COD', code: 'cod', targetPaymentStatus: 'unpaid', sortOrder: 5, isActive: false },
  ]);

  count('categories', categories.length);
  count('trademarks', trademarks.length);
  count('vendors_inferred', vendors.length);
  count('sale_channels', 1);
  count('payment_methods', 5);
}

async function importProducts(adminId: mongoose.Types.ObjectId) {
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
    if (seen.has(code)) {
      code = `${code}.${text(row['ID sản phẩm']) || index + 1}`;
    }
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
      qty: 0,
      weight: money(row['Cân nặng cả vỏ hộp']),
      unit: text(row['Đơn vị tính']) || 'Cái',
      status: text(row['Trạng thái']) || 'Mới',
      type: productType(text(row['Loại sản phẩm'])),
      allowsSale: true,
      description: text(row['Tên khác']),
      externalProductId: text(row['ID sản phẩm']),
      imageUrl: text(row['Link ảnh sản phẩm']),
      websiteUrl: text(row['Link trên website']),
      userId: adminId,
      createdAt,
      updatedAt: createdAt,
    });
  });

  const products = docs.length ? await Product.insertMany(docs) : [];
  count('products', products.length);
}

async function importInventory(branches: { hn: any; hcm: any }) {
  const productList = await Product.find();
  const byCode = new Map(productList.map((p: any) => [String(p.code), p]));
  const byBarcode = new Map(productList.map((p: any) => [String(p.barcode || ''), p]).filter(([key]) => key));
  const byExternalId = new Map(productList.map((p: any) => [String(p.externalProductId || ''), p]).filter(([key]) => key));
  const rows = readRows(files.inventory);
  const stocks: any[] = [];
  let linked = 0;

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
    const total = hnQty + hcmQty;
    product.qty = total;
    product.price = money(row['Giá']) || product.price;
    product.cost = money(row['Giá vốn']) || money(row['Giá nhập']) || product.cost;
    product.wholesalePrice = money(row['Giá bán sỉ']) || product.wholesalePrice;
    await product.save();
    stocks.push({ productId: product._id, branchId: branches.hn._id, qty: hnQty, minQuantity: 0, maxQuantity: 999999999 });
    stocks.push({ productId: product._id, branchId: branches.hcm._id, qty: hcmQty, minQuantity: 0, maxQuantity: 999999999 });
    linked++;
  }

  if (stocks.length) await ProductBranchStock.insertMany(stocks);
  count('inventory_rows', linked);
  count('branch_stock_records', stocks.length);
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
  count('product_edit_logs', docs.length);
}

async function importCustomers(adminId: mongoose.Types.ObjectId, branches: { hn: any; hcm: any }) {
  const tagFiles: Array<[string, string]> = [
    ['high_value', files.customersHighValue],
    ['frequent', files.customersFrequent],
    ['birthday_high_value', files.customersBirthdayHighValue],
    ['inactive', files.customersInactive],
  ];
  const tagMap = new Map<string, Set<string>>();
  for (const [tag, file] of tagFiles) {
    for (const row of readRows(file)) {
      const key = customerKey(row);
      if (!tagMap.has(key)) tagMap.set(key, new Set());
      tagMap.get(key)!.add(tag);
    }
  }

  const rows = readRows(files.customersAll);
  const docs: any[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const key = customerKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    const code = customerCode(row);
    const branchId = branchCodeFromName(text(row['Cửa hàng bắt đầu'])) === 'HCM' ? branches.hcm._id : branches.hn._id;
    const birthday = parseDate(row['Ngày sinh']);
    const address = [text(row['Địa chỉ']), text(row['Phường/xã']), text(row['Quận/huyện']), text(row['Thành phố'])]
      .filter(Boolean)
      .join(', ');
    const startDate = parseDate(row['Ngày bắt đầu']);
    docs.push({
      type: text(row['Loại']).toLowerCase().includes('công') ? 'company' : 'person',
      code,
      name: text(row['Tên khách hàng']) || code,
      phone: text(row['Số điện thoại']),
      email: text(row['Email']),
      birthday,
      sex: gender(text(row['Giới tính'])),
      address,
      provinceId: text(row['Thành phố']),
      districtId: text(row['Quận/huyện']),
      wardId: text(row['Phường/xã']),
      company: text(row['Tên công ty']),
      vat: text(row['Mã số thuế']),
      note: text(row['CMT']),
      purchaseCount: money(row['Số lần mua']),
      totalSpent: 0,
      points: 0,
      status: 'active',
      branchId,
      tags: Array.from(tagMap.get(key) || []),
      externalCustomerId: text(row['ID']),
      firstStoreName: text(row['Cửa hàng bắt đầu']),
      lastStoreName: text(row['Cửa hàng mua cuối cùng']),
      productCount: money(row['Số lượng sản phẩm']),
      startedAt: startDate,
      userId: adminId,
      createdAt: startDate,
      updatedAt: startDate,
    });
  }

  if (docs.length) await Customer.insertMany(docs);
  count('customers', docs.length);
}

async function importCustomerCare() {
  const rows = readRows(files.customerCare);
  const docs = rows
    .filter((row) => text(row['ID']))
    .map((row) => ({
      code: text(row['ID']),
      customerCode: text(row['Mã khách hàng']),
      customerName: text(row['Khách hàng']),
      customerPhone: text(row['Điện thoại']),
      details: text(row['Chi tiết']),
      reason: text(row['Lý do']),
      description: text(row['Mô tả']),
      creator: text(row['Người tạo']),
      recordDate: parseDate(row['Ngày tạo']),
      createdAt: parseDate(row['Ngày tạo']),
      updatedAt: parseDate(row['Ngày tạo']),
    }));
  if (docs.length) await CustomerCare.insertMany(docs);
  count('customer_care', docs.length);
}

async function ensureProduct(row: Row): Promise<any> {
  const code = text(row['Mã sản phẩm']);
  const barcode = text(row['Mã vạch']);
  const product = await Product.findOne({
    $or: [
      ...(code ? [{ code }] : []),
      ...(barcode ? [{ barcode }] : []),
    ],
  });
  if (product) return product;

  const fallbackCode = code || (barcode ? `BAR.${barcode}` : `SP.MISSING.${Date.now()}.${Math.floor(Math.random() * 1000)}`);
  warnings.push(`Tạo sản phẩm tạm do không thấy trong danh sách sản phẩm: ${fallbackCode}`);
  return Product.create({
    code: fallbackCode,
    barcode,
    name: text(row['Tên sản phẩm'] || row['Sản phẩm']) || fallbackCode,
    price: money(row['Giá bán'] || row['Giá']),
    cost: money(row['Giá vốn']),
    unit: text(row['Đơn vị tính']) || 'Cái',
    qty: 0,
    status: 'Mới',
    allowsSale: true,
    type: 'product',
  });
}

async function findCustomerForSale(row: Row): Promise<any | null> {
  const rawCode = text(row['Mã khách hàng']);
  const phone = text(row['SĐT Khách hàng']);
  const name = text(row['Tên khách hàng']);
  if (rawCode) {
    const byCode = await Customer.findOne({ code: rawCode });
    if (byCode) return byCode;
  }
  if (phone) {
    const byPhone = await Customer.findOne({ phone });
    if (byPhone) return byPhone;
  }
  if (name) {
    const byName = await Customer.findOne({ name });
    if (byName) return byName;
  }
  if (!name && !phone) return null;

  const code = rawCode || `KH.SALE.${text(row['ID']) || Date.now()}`;
  return Customer.create({
    code,
    name: name || 'Khách lẻ',
    phone,
    email: text(row['Email khách hàng']),
    birthday: parseDate(row['Ngày sinh khách hàng']),
    sex: gender(text(row['Giới tính khách hàng'])),
    address: text(row['Địa chỉ khách hàng']),
    type: 'person',
    status: 'active',
  });
}

async function importRetailSales(branches: { hn: any; hcm: any }) {
  const rows = readRows(files.retailSales).filter((row) => text(row['ID']));
  const saleChannel = await SaleChannel.findOne({ name: saleChannelName() });
  const paymentMethods = await PaymentMethod.find();
  const methodByCode = new Map(paymentMethods.map((m: any) => [m.code, m]));
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const id = text(row['ID']);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id)!.push(row);
  }

  const docs: any[] = [];
  for (const [id, groupRows] of groups) {
    const first = groupRows[0];
    const branch = branchCodeFromName(text(first['Kho'])) === 'HCM' ? branches.hcm : branches.hn;
    const customer = await findCustomerForSale(first);
    const items = [];
    let amountProducts = 0;
    let totalCost = 0;
    let grossValue = 0;
    let discountValue = 0;

    for (const row of groupRows) {
      const product = await ensureProduct(row);
      const qty = money(row['Số lượng']) || 1;
      const price = money(row['Giá bán']);
      const cost = money(row['Giá vốn']) || product.cost || 0;
      const discount = money(row['Chiết khấu']);
      const total = money(row['Doanh thu SP sau chiết khấu']) || money(row['Tổng tiền']) || Math.max(price * qty - discount, 0);
      amountProducts += qty;
      totalCost += cost * qty;
      grossValue += total;
      discountValue += discount;
      items.push({
        productId: product._id,
        amount: qty,
        value: price,
        cost,
        discountValue: discount,
        discountType: 'number',
        total,
        note: text(row['Ghi chú sản phẩm']),
      });
    }

    const cash = groupRows.reduce((sum, row) => sum + money(row['Tiền mặt']), 0);
    const bank = groupRows.reduce((sum, row) => sum + money(row['Chuyển khoản']), 0);
    const card = groupRows.reduce((sum, row) => sum + money(row['Quẹt thẻ']), 0);
    const installment = groupRows.reduce((sum, row) => sum + money(row['Trả góp']), 0);
    const value = groupRows.reduce((sum, row) => sum + money(row['Tổng tiền']), 0) || grossValue;
    const valuePayment = cash + bank + card + installment || value;
    const typePayment = [
      cash ? { methodId: methodByCode.get('cash')?._id, amount: cash } : null,
      bank ? { methodId: methodByCode.get('bank_transfer')?._id, amount: bank } : null,
      card ? { methodId: methodByCode.get('card')?._id, amount: card } : null,
      installment ? { methodId: methodByCode.get('installment')?._id, amount: installment } : null,
    ].filter(Boolean);
    const createdAt = parseDate(first['Ngày']) || new Date();

    docs.push({
      code: id,
      branchId: branch._id,
      customerId: customer?._id,
      amountProducts,
      totalCost,
      discountValue,
      discountType: 'number',
      value,
      valuePayment,
      typePayment,
      isDelivery: false,
      saleChannelId: saleChannel?._id,
      isCod: false,
      status: 'completed',
      note: text(first['Mô tả']),
      completedAt: createdAt,
      items,
      createdAt,
      updatedAt: createdAt,
      cashierName: text(first['NV thu ngân']),
      salespersonName: text(first['NV Bán hàng']),
      sourceType: text(first['Kiểu']),
    });
  }

  if (docs.length) await SalePayment.insertMany(docs);
  count('retail_sales', docs.length);
}

async function importWarehouse() {
  const voucherRows = readRows(files.vouchers);
  const vouchers = voucherRows
    .filter((row) => text(row['ID']))
    .map((row) => ({
      date: text(row['Ngày']),
      voucherId: text(row['ID']),
      orderId: text(row['ID đơn hàng']),
      warehouse: text(row['Kho hàng']),
      relatedVoucher: text(row['Phiếu liên quan']),
      requestVoucher: text(row['Phiếu yêu cầu XNK']),
      warrantyId: text(row['ID phiếu bảo hành']),
      warehouseCode: text(row['Mã kho']),
      type: text(row['Kiểu']),
      supplier: text(row['Nhà cung cấp']),
      spCount: money(row['SP']),
      qty: money(row['SL']),
      totalAmount: money(row['Tổng tiền']),
      discount: money(row['Chiết khấu']),
      creator: text(row['Người tạo']),
      customerDob: text(row['Ngày sinh khách hàng']),
      customerPhone: text(row['SĐT Khách hàng']),
      note: text(row['Ghi chú']),
      invoice: text(row['Hóa đơn']),
      createdAtStr: text(row['Ngày tạo']),
      seller: text(row['Nhân viên bán hàng']),
      code: text(row['Mã']),
      invoiceLabel: text(row['Nhãn hóa đơn XNK']),
      createdAt: parseDate(row['Ngày tạo'] || row['Ngày']),
      updatedAt: parseDate(row['Ngày tạo'] || row['Ngày']),
    }));
  if (vouchers.length) await InventoryVoucher.insertMany(vouchers);

  const productRows = readRows(files.voucherProducts);
  const invProducts = productRows
    .filter((row) => text(row['ID']))
    .map((row) => ({
      id: text(row['ID']),
      voucherId: text(row['ID phiếu XNK']),
      warrantyId: text(row['ID phiếu bảo hành']),
      warehouse: text(row['Kho hàng']),
      date: text(row['Ngày']),
      parentCode: text(row['Mã sản phẩm cha']),
      parentName: text(row['Tên sản phẩm cha']),
      productCode: text(row['Mã sản phẩm']),
      productName: text(row['Sản phẩm']),
      barcode: text(row['Mã vạch']),
      imei: text(row['IMEI']),
      batch: text(row['Lô hàng']),
      supplier: text(row['Nhà cung cấp']),
      type: text(row['Kiểu']),
      category: text(row['Danh mục']),
      importQty: money(row['Số lượng nhập']),
      exportQty: money(row['Số lượng xuất']),
      minUnitQty: money(row['SL quy đổi theo đơn vị nhỏ nhất']),
      price: money(row['Giá']),
      vat: money(row['VAT']),
      vatType: text(row['Loại vat']),
      cost: money(row['Giá vốn']),
      amount: money(row['Tiền']),
      discount: money(row['Chiết khấu']),
      totalAmount: money(row['Tổng tiền']),
      extendedWarranty: text(row['Bảo hành mở rộng']),
      description: text(row['Mô tả']),
      createdAtStr: text(row['Ngày tạo']),
      unit: text(row['Đơn vị tính']),
      currentPrice: money(row['Giá bán hiện tại']),
      totalPriceAmount: money(row['Tổng tiền giá bán']),
      seller: text(row['Nhân viên bán hàng']),
      creator: text(row['Người tạo']),
      customer: text(row['Khách hàng']),
      createdAt: parseDate(row['Ngày tạo'] || row['Ngày']),
      updatedAt: parseDate(row['Ngày tạo'] || row['Ngày']),
    }));
  if (invProducts.length) await InventoryProduct.insertMany(invProducts);

  count('inventory_vouchers', vouchers.length);
  count('inventory_products', invProducts.length);
}

function splitTransferWarehouses(raw: string) {
  const cleaned = raw.replace(/\[.*?\]/g, '').replace(/\s+tới\s+/i, ' - ').trim();
  const parts = cleaned.split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  return { fromWarehouse: parts[0] || '', toWarehouse: parts[1] || '' };
}

async function importTransfers() {
  const transferMap = new Map<string, any>();

  const addTransfer = (row: Row, tab: string, source: 'summary' | 'index') => {
    const id = source === 'summary'
      ? text(row['Phiếu yêu cầu XNK']) || text(row['ID'])
      : text(row['ID']);
    if (!id) return;
    const existing = transferMap.get(id) || { id, tabs: [] };
    if (!existing.tabs.includes(tab)) existing.tabs.push(tab);

    const warehouse = source === 'summary' ? text(row['Kho hàng']) || text(row['Mã kho']) : text(row['Kho']);
    const split = splitTransferWarehouses(warehouse);
    Object.assign(existing, {
      date: text(row['Ngày']) || existing.date,
      type: text(row['Kiểu']) || existing.type,
      warehouse: warehouse || existing.warehouse,
      fromWarehouse: split.fromWarehouse || existing.fromWarehouse,
      toWarehouse: split.toWarehouse || existing.toWarehouse,
      label: text(row['Nhãn hóa đơn XNK']) || existing.label,
      qty: money(row['Tổng SL'] || row['SL']) || existing.qty || 0,
      spCount: money(row['Số lượng SP'] || row['Số SP'] || row['SP']) || existing.spCount || 0,
      totalAmount: money(row['Tổng tiền theo giá bán'] || row['Tổng tiền']) || existing.totalAmount || 0,
      creator: text(row['Người tạo'] || row['Người lập phiếu']) || existing.creator,
      note: text(row['Mô tả'] || row['Ghi chú']) || existing.note,
      timeCreated: text(row['Thời gian lập phiếu']) || existing.timeCreated,
      approvedBy: text(row['Duyệt']) || existing.approvedBy,
      dateApproved: text(row['Ngày Duyệt']) || existing.dateApproved,
      confirmedBy: text(row['Xác nhận']) || existing.confirmedBy,
      dateConfirmed: text(row['Ngày xác nhận']) || existing.dateConfirmed,
      cancelledBy: text(row['Người hủy']) || existing.cancelledBy,
      cancelledAt: text(row['Thời gian hủy']) || existing.cancelledAt,
      createdAt: parseDate(row['Thời gian lập phiếu'] || row['Ngày tạo'] || row['Ngày']) || existing.createdAt,
      updatedAt: parseDate(row['Thời gian lập phiếu'] || row['Ngày tạo'] || row['Ngày']) || existing.updatedAt,
    });
    transferMap.set(id, existing);
  };

  readRows(files.transfersAll).forEach((row) => addTransfer(row, 'all', 'summary'));
  readRows(files.transfersDraft).forEach((row) => addTransfer(row, 'draft', 'index'));
  readRows(files.transfersIncoming).forEach((row) => addTransfer(row, 'incoming', 'index'));
  readRows(files.transfersOutgoing).forEach((row) => addTransfer(row, 'transferring', 'index'));

  const docs = Array.from(transferMap.values());
  if (docs.length) await WarehouseTransfer.insertMany(docs);
  count('warehouse_transfers', docs.length);
}

async function importInventoryChecks() {
  const checks = readRows(files.inventoryChecks)
    .filter((row) => text(row['ID']))
    .map((row) => ({
      id: text(row['ID']),
      date: text(row['Ngày']),
      type: text(row['Loại kiểm kho']),
      warehouse: text(row['Kho']),
      creator: text(row['Người tạo']),
      spCount: money(row['SP']),
      qty: money(row['SL']),
      note: text(row['Ghi chú']),
      missingSp: text(row['SP thiếu']),
      balance: text(row['Bù trừ kiểm kho']),
      createdAt: parseDate(row['Ngày']),
      updatedAt: parseDate(row['Ngày']),
    }));
  if (checks.length) await InventoryCheck.insertMany(checks);

  const products = readRows(files.inventoryCheckProducts)
    .filter((row) => text(row['ID']) || text(row['Tên sản phẩm']))
    .map((row) => ({
      externalId: text(row['ID']),
      date: text(row['Ngày']),
      warehouse: text(row['Kho']),
      productCode: text(row['Mã sản phẩm']),
      barcode: text(row['Mã vạch']),
      productName: text(row['Tên sản phẩm']),
      cost: money(row['Giá vốn']),
      price: money(row['Giá bán']),
      stock: money(row['Tồn']),
      transferring: money(row['Đang chuyển']),
      holding: money(row['Tạm giữ']),
      actualStock: money(row['Tồn thực tế']),
      difference: money(row['Chênh lệch']),
      imei: text(row['IMEI']),
      description: text(row['Mô tả']),
      createdAt: parseDate(row['Ngày']),
      updatedAt: parseDate(row['Ngày']),
    }));
  if (products.length) await InventoryCheckProduct.insertMany(products);

  count('inventory_checks', checks.length);
  count('inventory_check_products', products.length);
}

function transactionDoc(row: Row) {
  const date = parseDate(row['Ngày'] || row['Ngày tạo']) || new Date();
  return {
    transactionId: text(row['ID']),
    date,
    type: text(row['Loại'] || row['Loại phiếu']),
    accountCode: text(row['Mã tài khoản']),
    accountName: text(row['Tên tài khoản']),
    contraAccountCode: text(row['Mã tài khoản đối ứng']),
    contraAccountName: text(row['Tên tài khoản đối ứng']),
    targetCode: text(row['Mã đối tượng']),
    targetName: text(row['Tên đối tượng'] || row['Đối tượng']),
    voucherType: text(row['Loại chứng từ']),
    voucherId: text(row['ID chứng từ']),
    revenue: money(row['Thu']),
    expense: money(row['Chi']),
    description: text(row['Diễn giải']),
    creatorName: text(row['Người tạo']),
    createdAt: parseDate(row['Ngày tạo']) || date,
    updatedAt: parseDate(row['Ngày tạo']) || date,
  };
}

async function run() {
  await connectDatabase();
  console.log('[import] Resetting old business data...');
  await resetCollections();

  const admin = await ensureAdmin();
  const branches = await importBranches(admin._id);
  await importBaseCatalogs(admin._id);
  await importProducts(admin._id);
  await importInventory(branches);
  await importProductLogs();
  await importCustomers(admin._id, branches);
  await importCustomerCare();
  await importRetailSales(branches);
  await importWarehouse();
  await importTransfers();
  await importInventoryChecks();

  console.log('\n[import] Done.');
  for (const [key, value] of Object.entries(summary)) {
    console.log(` - ${key}: ${value}`);
  }
  if (warnings.length) {
    console.log('\n[import] Warnings:');
    for (const warning of warnings.slice(0, 50)) console.log(` - ${warning}`);
    if (warnings.length > 50) console.log(` - ...and ${warnings.length - 50} more`);
  }
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error('[import] Failed:', error);
  await mongoose.disconnect();
  process.exit(1);
});
