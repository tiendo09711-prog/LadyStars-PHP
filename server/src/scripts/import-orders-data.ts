import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import xlsxPkg from 'xlsx';
import { connectDatabase } from '../config/database.js';
import { User } from '../core/auth/user.model.js';
import { Order, OrderDuplicate } from '../modules/orders/orders.models.js';
import { Product } from '../modules/product/product.models.js';

type Row = Record<string, any>;

const xlsx = xlsxPkg as typeof import('xlsx');
const projectRoot = process.cwd().endsWith(`${path.sep}server`)
  ? path.resolve(process.cwd(), '..')
  : process.cwd();
const dataDir = process.env.ORDERS_DATA_DIR || path.join(projectRoot, 'Bảng dữ liệu');

const files = {
  orders: path.join(dataDir, 'Đơn hàng - Tất cả.xlsx'),
  duplicates: path.join(dataDir, 'Đơn trùng.xlsx'),
};

const summary: Record<string, number> = {};

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
  const vn = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (vn) {
    return new Date(Number(vn[3]), Number(vn[2]) - 1, Number(vn[1]), Number(vn[4] || 12), Number(vn[5] || 0), Number(vn[6] || 0));
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function readRows(file: string): Row[] {
  if (!fs.existsSync(file)) return [];
  const workbook = xlsx.readFile(file, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_json<Row>(sheet, { defval: '', raw: false });
}

function groupById(rows: Row[]) {
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const id = text(row.ID);
    if (!id) continue;
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id)!.push(row);
  }
  return grouped;
}

async function main() {
  await connectDatabase();
  const [admin, products] = await Promise.all([
    User.findOne({ email: 'admin@myerp.local' }) || User.findOne(),
    Product.find(),
  ]);
  const productByCode = new Map(products.map((product: any) => [text(product.code), product]).filter(([key]) => key));
  const productByBarcode = new Map(products.map((product: any) => [text(product.barcode), product]).filter(([key]) => key));

  const rows = readRows(files.orders);
  const grouped = groupById(rows);
  const orderOps: any[] = [];
  let missingProducts = 0;

  for (const [orderId, orderRows] of grouped) {
    const first = orderRows[0];
    const createdAt = parseDate(first['Thời gian']) || parseDate(first['Ngày thành công']) || new Date();
    const productsInOrder = orderRows
      .map((row) => {
        const product = productByCode.get(text(row['Mã sản phẩm'])) || productByBarcode.get(text(row['Mã vạch']));
        if (!product && (text(row['Mã sản phẩm']) || text(row['Mã vạch']))) missingProducts++;
        return {
          productId: product?._id,
          sku: text(row['Mã sản phẩm']) || text(row['Mã vạch']),
          productName: text(row['Sản phẩm']) || text(row['Tên sản phẩm cha']) || text(row['Mã sản phẩm']),
          quantity: money(row['Số lượng']) || 1,
          scannedQuantity: 0,
        };
      })
      .filter((item) => item.sku || item.productName);

    const totalAmount = money(first['Giá trị đơn hàng'])
      || orderRows.reduce((total, row) => total + money(row['Giá sản phẩm sau chiết khấu']), 0);
    const transferMoney = money(first['Tiền chuyển khoản']) + money(first['Tiền quẹt thẻ']) + money(first['Tiền đặt cọc']);
    const codAmount = money(first['Tổng thu']) || money(first['Phí thu tiền hộ']);

    const doc = {
      orderCode: orderId,
      customerName: text(first['Tên khách hàng']) || 'Khách lẻ',
      customerPhone: text(first['Số điện thoại']),
      shippingAddress: [
        text(first['Địa chỉ']),
        text(first['Phường/xã']),
        text(first['Quận huyện']),
        text(first['Thành phố']),
      ].filter(Boolean).join(', '),
      paymentMethod: transferMoney > 0 ? 'Chuyển khoản' : 'COD',
      totalAmount,
      status: text(first['Trạng thái']) || 'Cần xử lí',
      warehouse: text(first['Kho lấy hàng']) || text(first['Kho tạo đơn']),
      deliveryStatus: text(first['Trạng thái đối soát']) || text(first['Thanh toán cho doanh nghiệp']) || 'Chờ lấy hàng',
      note: [text(first['Ghi chú nội bộ']), text(first['Ghi chú của khách']), text(first['Ghi chú HVC'])].filter(Boolean).join(' | '),
      products: productsInOrder,
      eInvoiceStatus: text(first['Trạng thái hóa đơn điện tử']) || 'Chưa tạo',
      carrier: text(first['Hãng vận chuyển']),
      shippingFee: money(first['Phí vận chuyển']),
      codAmount,
      userId: admin?._id,
      orderType: text(first['Loại đơn']),
      source: text(first['Nguồn']),
      sourceName: text(first['Nguồn đơn hàng']),
      apiOrderId: text(first['ID Đơn hàng API']),
      trackingCode: text(first['Mã vận đơn']),
      successDate: text(first['Ngày thành công']),
      successTime: text(first['Giờ thành công']),
      createdAt,
      updatedAt: createdAt,
    };

    orderOps.push({
      updateOne: {
        filter: { orderCode: orderId },
        update: { $set: doc },
        upsert: true,
      },
    });
  }

  const duplicateRows = readRows(files.duplicates);
  const duplicateOps = duplicateRows.map((row, index) => {
    const phone = text(row['Số điện thoại']);
    const code = phone ? `DUP.${phone}` : `DUP.${index + 1}`;
    const doc = {
      orderCode: code,
      duplicateCode: code,
      customerName: text(row['Tên khách']),
      customerPhone: phone,
      totalAmount: money(row['Tổng đơn']),
      reason: text(row['Địa chỉ']),
      status: 'Mới',
      userId: admin?._id,
    };
    return {
      updateOne: {
        filter: { orderCode: code, duplicateCode: code },
        update: { $set: doc },
        upsert: true,
      },
    };
  });

  await Promise.all([Order.deleteMany({}), OrderDuplicate.deleteMany({})]);
  if (orderOps.length) await Order.bulkWrite(orderOps, { ordered: false, timestamps: false });
  if (duplicateOps.length) await OrderDuplicate.bulkWrite(duplicateOps, { ordered: false, timestamps: false });

  const orderAgg = await Order.aggregate([
    { $group: { _id: null, rows: { $sum: 1 }, total: { $sum: '$totalAmount' } } },
  ]);
  const duplicateCount = await OrderDuplicate.countDocuments();
  summary.order_excel_rows = rows.length;
  summary.order_groups = grouped.size;
  summary.order_imported = orderAgg[0]?.rows ?? 0;
  summary.order_total = orderAgg[0]?.total ?? 0;
  summary.order_duplicate_rows = duplicateRows.length;
  summary.order_duplicates_imported = duplicateCount;
  summary.order_missing_product_lines = missingProducts;

  console.log(JSON.stringify({ dataDir, summary }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
