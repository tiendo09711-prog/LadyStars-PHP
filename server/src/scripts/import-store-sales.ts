import fs from 'fs';
import os from 'os';
import path from 'path';
import mongoose from 'mongoose';
import xlsxPkg from 'xlsx';
import { connectDatabase } from '../config/database.js';
import { User } from '../core/auth/user.model.js';
import { Branch } from '../core/org/branch.model.js';
import { Customer } from '../modules/customer/customer.models.js';
import {
  PaymentMethod,
  Product,
  ProductRefund,
  SaleChannel,
  SalePayment,
} from '../modules/product/product.models.js';

type Row = Record<string, any>;

const xlsx = xlsxPkg as typeof import('xlsx');
const projectRoot = process.cwd().endsWith(`${path.sep}server`)
  ? path.resolve(process.cwd(), '..')
  : process.cwd();
const dataDir = process.env.STORE_SALES_DATA_DIR || path.join(projectRoot, 'Bảng dữ liệu');

function resolveDataFile(fileName: string) {
  const candidates = [dataDir, path.join(projectRoot, 'Bảng dữ liệu'), path.join(os.homedir(), 'Downloads')];
  const normalized = fileName.normalize('NFC').toLowerCase();
  for (const dir of candidates) {
    try {
      const match = fs.readdirSync(dir).find((entry) => entry.normalize('NFC').toLowerCase() === normalized);
      if (match) return path.join(dir, match);
    } catch {
      // Try next data directory.
    }
  }
  return path.join(dataDir, fileName);
}

const files = {
  retail: resolveDataFile('Bán lẻ - Tất cả.xlsx'),
  refunds: resolveDataFile('Trả hàng.xlsx'),
};

const summary: Record<string, number> = {};
const warnings: string[] = [];

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

function hasValue(value: any): boolean {
  return value !== undefined && value !== null && text(value) !== '';
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

function ensureFiles() {
  const missing = Object.entries(files).filter(([, file]) => !fs.existsSync(file));
  if (missing.length) throw new Error(`Thiếu file import: ${missing.map(([key, file]) => `${key}=${file}`).join('; ')}`);
}

function gender(value: string): 'female' | 'male' | 'other' {
  const lower = value.toLowerCase();
  if (lower.includes('nam')) return 'male';
  if (lower.includes('nữ') || lower.includes('nu')) return 'female';
  return 'other';
}

function branchCode(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes('hcm') || lower.includes('hồ chí minh')) return 'HCM';
  return 'HN';
}

async function ensureSaleSetup() {
  const saleChannel = await SaleChannel.findOneAndUpdate(
    { name: 'Bán tại cửa hàng' },
    { name: 'Bán tại cửa hàng', description: 'Kênh bán trực tiếp tại cửa hàng', sortOrder: 1, isActive: true, isDefault: true },
    { upsert: true, new: true },
  );

  const paymentDefs = [
    { name: 'Tiền mặt', code: 'cash', targetPaymentStatus: 'paid', sortOrder: 1, isActive: true },
    { name: 'Chuyển khoản', code: 'bank_transfer', targetPaymentStatus: 'paid', sortOrder: 2, isActive: true },
    { name: 'Quẹt thẻ', code: 'card', targetPaymentStatus: 'paid', sortOrder: 3, isActive: true },
    { name: 'Trả góp', code: 'installment', targetPaymentStatus: 'paid', sortOrder: 4, isActive: true },
  ];
  for (const method of paymentDefs) {
    await PaymentMethod.findOneAndUpdate({ code: method.code }, method, { upsert: true });
  }

  const methods = await PaymentMethod.find();
  return {
    saleChannel,
    paymentMethodByCode: new Map(methods.map((method: any) => [String(method.code), method])),
  };
}

async function resetSalesData() {
  await Promise.all([
    ProductRefund.deleteMany({}),
    SalePayment.deleteMany({}),
    Customer.updateMany(
      {},
      {
        $set: { totalSpent: 0, purchaseCount: 0 },
        $unset: { lastPurchaseDate: '', daysSinceLastPurchase: '' },
      },
    ),
  ]);
}

async function preloadRefs() {
  const [products, branches, users] = await Promise.all([
    Product.find(),
    Branch.find(),
    User.find(),
  ]);
  return {
    productByCode: new Map(products.map((product: any) => [String(product.code || '').trim(), product]).filter(([key]) => key)),
    productByBarcode: new Map(products.map((product: any) => [String(product.barcode || '').trim(), product]).filter(([key]) => key)),
    branchByCode: new Map(branches.map((branch: any) => [String(branch.code), branch])),
    userByName: new Map(users.map((user: any) => [String(user.name || '').toLowerCase(), user])),
    admin: users.find((user: any) => user.email === 'admin@myerp.local') || users[0],
  };
}

async function customerFromRow(row: Row, refs: any) {
  const phone = text(row['SĐT Khách hàng']);
  const name = text(row['Tên khách hàng']) || 'Khách vãng lai';
  const code = text(row['Mã khách hàng']) || (phone ? `KH.${phone}` : `KH.SALE.${name.toLowerCase().replace(/[^a-z0-9]+/gi, '.').slice(0, 40)}`);
  const birthday = parseDate(row['Ngày sinh khách hàng']);

  if (!phone && !text(row['Mã khách hàng']) && name === 'Khách vãng lai') return undefined;

  const query = phone ? { phone } : { code };
  return Customer.findOneAndUpdate(
    query,
    {
      $setOnInsert: {
        code,
        birthday,
        sex: gender(text(row['Giới tính khách hàng'])),
        status: 'active',
        userId: refs.admin?._id,
      },
      $set: {
        name,
        phone,
        email: text(row['Email khách hàng']),
        address: text(row['Địa chỉ khách hàng']),
      },
    },
    { upsert: true, new: true },
  );
}

function paymentLines(row: Row, paymentMethodByCode: Map<string, any>) {
  const pairs = [
    ['cash', money(row['Tiền mặt'])],
    ['bank_transfer', money(row['Chuyển khoản'])],
    ['card', money(row['Quẹt thẻ'])],
    ['installment', money(row['Trả góp'])],
  ] as const;
  return pairs
    .filter(([, amount]) => amount > 0)
    .map(([code, amount]) => ({ methodId: paymentMethodByCode.get(code)?._id, amount }))
    .filter((line) => line.methodId);
}

async function importRetailSales() {
  const rows = readRows(files.retail);
  const refs = await preloadRefs();
  const { saleChannel, paymentMethodByCode } = await ensureSaleSetup();
  const grouped = new Map<string, Row[]>();

  for (const row of rows) {
    const id = text(row['ID']);
    if (!id) continue;
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id)!.push(row);
  }

  const docs: any[] = [];
  const customerStats = new Map<string, { totalSpent: number; purchaseCount: number; lastPurchaseDate?: Date }>();
  let missingProducts = 0;

  for (const [invoiceId, invoiceRows] of grouped) {
    const first = invoiceRows[0];
    const branch = refs.branchByCode.get(branchCode(text(first['Kho'])));
    const customer = await customerFromRow(first, refs);
    const author = refs.userByName.get(text(first['NV thu ngân']).toLowerCase()) || refs.admin;
    const createdAt = parseDate(first['Ngày']) || new Date();
    const items: any[] = [];
    let amountProducts = 0;
    let totalCost = 0;
    let itemRevenue = 0;

    for (const row of invoiceRows) {
      const product = refs.productByCode.get(text(row['Mã sản phẩm'])) || refs.productByBarcode.get(text(row['Mã vạch']));
      if (!product) {
        missingProducts++;
        warnings.push(`Không tìm thấy sản phẩm bán lẻ ${text(row['Mã sản phẩm']) || text(row['Mã vạch'])} ở hóa đơn ${invoiceId}`);
        continue;
      }
      const qty = money(row['Số lượng']) || 1;
      const price = money(row['Giá bán']);
      const cost = money(row['Giá vốn']) || product.cost || 0;
      const total = hasValue(row['Doanh thu SP sau chiết khấu'])
        ? money(row['Doanh thu SP sau chiết khấu'])
        : hasValue(row['Tổng tiền'])
          ? money(row['Tổng tiền'])
          : price * qty;
      const discount = money(row['Chiết khấu']);
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
      amountProducts += qty;
      totalCost += cost * qty;
      itemRevenue += total;
    }

    if (!items.length) continue;
    const value = hasValue(first['Tổng tiền']) ? money(first['Tổng tiền']) : itemRevenue;
    const valuePayment = money(first['Tiền khách đưa']) || money(first['Tiền mặt']) + money(first['Chuyển khoản']) + money(first['Quẹt thẻ']) + money(first['Trả góp']) || value;

    docs.push({
      branchId: branch?._id,
      customerId: customer?._id,
      code: invoiceId,
      amountProducts,
      totalCost,
      discountValue: money(first['Chiết khấu']),
      discountType: 'number',
      value,
      valuePayment,
      typePayment: paymentLines(first, paymentMethodByCode),
      isDelivery: false,
      saleChannelId: saleChannel._id,
      isCod: false,
      userId: refs.admin?._id,
      authorId: author?._id,
      status: 'completed',
      note: text(first['Mô tả']),
      completedAt: createdAt,
      items,
      externalOrderId: text(first['ID đơn hàng']),
      cashierName: text(first['NV thu ngân']),
      sellerName: text(first['NV Bán hàng']),
      technicianName: text(first['Nhân viên kỹ thuật']),
      saleType: text(first['Kiểu']),
      customerName: text(first['Tên khách hàng']),
      customerPhone: text(first['SĐT Khách hàng']),
      invoiceLabel: text(first['Nhãn hóa đơn bán lẻ']),
      createdAt,
      updatedAt: createdAt,
    });

    if (customer?._id) {
      const key = String(customer._id);
      const current = customerStats.get(key) || { totalSpent: 0, purchaseCount: 0, lastPurchaseDate: undefined };
      current.totalSpent += value;
      current.purchaseCount += 1;
      if (!current.lastPurchaseDate || createdAt > current.lastPurchaseDate) current.lastPurchaseDate = createdAt;
      customerStats.set(key, current);
    }
  }

  if (docs.length) {
    await SalePayment.bulkWrite(
      docs.map((doc) => ({
        updateOne: {
          filter: { code: doc.code },
          update: { $set: doc },
          upsert: true,
        },
      })),
      { ordered: false, timestamps: false },
    );
  }
  for (const [customerId, stats] of customerStats) {
    await Customer.findByIdAndUpdate(customerId, {
      $inc: { totalSpent: stats.totalSpent, purchaseCount: stats.purchaseCount },
      $max: { lastPurchaseDate: stats.lastPurchaseDate },
    });
  }

  summary.retail_excel_rows = rows.length;
  summary.retail_invoice_groups = grouped.size;
  summary.retail_imported = docs.length;
  summary.retail_excel_revenue = docs.reduce((total, doc) => total + (doc.value || 0), 0);
  summary.retail_missing_product_lines = missingProducts;
}

async function importRefunds() {
  const rows = readRows(files.refunds);
  const refs = await preloadRefs();
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const id = text(row['ID']);
    if (!id) continue;
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id)!.push(row);
  }

  const docs: any[] = [];
  let missingProducts = 0;
  let missingSales = 0;

  for (const [refundId, refundRows] of grouped) {
    const first = refundRows[0];
    const sale = await SalePayment.findOne({ code: text(first['Trả hàng từ hóa đơn']) });
    if (!sale) {
      missingSales++;
      warnings.push(`Không tìm thấy hóa đơn gốc ${text(first['Trả hàng từ hóa đơn'])} cho phiếu trả ${refundId}`);
    }
    const createdAt = parseDate(first['Ngày']) || new Date();
    const items: any[] = [];
    let amount = 0;

    for (const row of refundRows) {
      const product = refs.productByCode.get(text(row['Mã sản phẩm']));
      if (!product) {
        missingProducts++;
        warnings.push(`Không tìm thấy sản phẩm trả hàng ${text(row['Mã sản phẩm'])} ở phiếu ${refundId}`);
        continue;
      }
      const qty = money(row['Số lượng']) || 1;
      const price = money(row['Giá bán']);
      const value = hasValue(row['Trả lại'])
        ? money(row['Trả lại'])
        : hasValue(row['Doanh thu'])
          ? money(row['Doanh thu'])
          : price * qty;
      items.push({
        productId: product._id,
        amount: qty,
        price,
        discountValue: money(row['Phí trả hàng']),
        discountType: 'number',
        value,
      });
      amount += qty;
    }

    if (!items.length) continue;
    docs.push({
      paymentId: sale?._id || (await SalePayment.findOne())?._id,
      code: refundId,
      discountValue: money(first['Chiết khấu']),
      discountType: 'number',
      refundFee: money(first['Phí trả hàng']),
      refundFeeType: 'number',
      amount,
      originalTotalAmount: money(first['Doanh thu']),
      totalPayableAmount: money(first['Tổng tiền']),
      value: hasValue(first['Tổng tiền']) ? money(first['Tổng tiền']) : money(first['Trả lại']),
      status: 'completed',
      userId: refs.admin?._id,
      userCreatedId: refs.admin?._id,
      note: text(first['Mô tả']),
      items,
      refundType: text(first['Kiểu']),
      warehouseName: text(first['Kho']),
      receiverName: text(first['Nhân viên nhận trả hàng']),
      cashierName: text(first['Nhân viên thu ngân']),
      customerName: text(first['Tên khách hàng']),
      customerPhone: text(first['SĐT Khách hàng']),
      originalInvoiceCode: text(first['Trả hàng từ hóa đơn']),
      createdAt,
      updatedAt: createdAt,
    });
  }

  if (docs.length) {
    await ProductRefund.bulkWrite(
      docs.map((doc) => ({
        updateOne: {
          filter: { code: doc.code },
          update: { $set: doc },
          upsert: true,
        },
      })),
      { ordered: false, timestamps: false },
    );
  }
  summary.refund_excel_rows = rows.length;
  summary.refund_groups = grouped.size;
  summary.refunds_imported = docs.length;
  summary.refund_excel_value = docs.reduce((total, doc) => total + (doc.value || 0), 0);
  summary.refund_missing_product_lines = missingProducts;
  summary.refund_missing_original_sales = missingSales;
}

async function validate() {
  const saleAgg = await SalePayment.aggregate([
    { $group: { _id: null, total: { $sum: '$value' }, qty: { $sum: '$amountProducts' }, rows: { $sum: 1 } } },
  ]);
  const refundAgg = await ProductRefund.aggregate([
    { $group: { _id: null, total: { $sum: '$value' }, qty: { $sum: '$amount' }, rows: { $sum: 1 } } },
  ]);
  summary.db_sales = saleAgg[0]?.rows ?? 0;
  summary.db_sales_revenue = saleAgg[0]?.total ?? 0;
  summary.db_sales_qty = saleAgg[0]?.qty ?? 0;
  summary.db_refunds = refundAgg[0]?.rows ?? 0;
  summary.db_refund_value = refundAgg[0]?.total ?? 0;
  summary.db_refund_qty = refundAgg[0]?.qty ?? 0;
  summary.db_sale_channels = await SaleChannel.countDocuments();
  summary.db_payment_methods = await PaymentMethod.countDocuments();
}

async function main() {
  ensureFiles();
  await connectDatabase();
  await resetSalesData();
  await ensureSaleSetup();
  await importRetailSales();
  await importRefunds();
  await validate();
  console.log(JSON.stringify({ dataDir, summary, warnings: warnings.slice(0, 50), warningCount: warnings.length }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
