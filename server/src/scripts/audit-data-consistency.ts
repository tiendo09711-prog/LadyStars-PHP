import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import xlsxPkg from 'xlsx';
import { connectDatabase } from '../config/database.js';
import {
  Product,
  ProductBranchStock,
  ProductRefund,
  SalePayment,
} from '../modules/product/product.models.js';
import {
  InventoryProduct,
  InventoryVoucher,
  WarehouseTransfer,
} from '../modules/warehouse/warehouse.models.js';

type Row = Record<string, any>;

const xlsx = xlsxPkg as typeof import('xlsx');
const projectRoot = process.cwd().endsWith(`${path.sep}server`)
  ? path.resolve(process.cwd(), '..')
  : process.cwd();
const dataDir = path.join(projectRoot, 'Bảng dữ liệu');

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

function readRows(fileName: string): Row[] {
  const file = path.join(dataDir, fileName);
  if (!fs.existsSync(file)) return [];
  const workbook = xlsx.readFile(file, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_json<Row>(sheet, { defval: '', raw: false });
}

function groupBy(rows: Row[], key: string) {
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const id = text(row[key]);
    if (!id) continue;
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id)!.push(row);
  }
  return grouped;
}

function summarizeSales(rows: Row[]) {
  const grouped = groupBy(rows, 'ID');
  const byDay: Record<string, number> = {};
  let revenue = 0;
  let itemRevenue = 0;
  let qty = 0;

  for (const invoiceRows of grouped.values()) {
    const first = invoiceRows[0];
    const invoiceRevenue = hasValue(first['Tổng tiền'])
      ? money(first['Tổng tiền'])
      : invoiceRows.reduce((sum, row) => sum + money(row['Doanh thu SP sau chiết khấu']), 0);
    const day = text(first['Ngày']).split(' ')[0];
    revenue += invoiceRevenue;
    if (day) byDay[day] = (byDay[day] ?? 0) + invoiceRevenue;
    for (const row of invoiceRows) {
      qty += money(row['Số lượng']);
      itemRevenue += money(row['Doanh thu SP sau chiết khấu']);
    }
  }

  return { rows: rows.length, invoices: grouped.size, revenue, itemRevenue, qty, byDay };
}

function summarizeRefunds(rows: Row[]) {
  const grouped = groupBy(rows, 'ID');
  let value = 0;
  let qty = 0;
  for (const refundRows of grouped.values()) {
    const first = refundRows[0];
    value += hasValue(first['Tổng tiền']) ? money(first['Tổng tiền']) : money(first['Trả lại']);
    for (const row of refundRows) qty += money(row['Số lượng']);
  }
  return { rows: rows.length, refunds: grouped.size, value, qty };
}

function summarizeInventory(rows: Row[]) {
  let hn = 0;
  let hcm = 0;
  let total = 0;
  let costValue = 0;
  let saleValue = 0;
  for (const row of rows) {
    const rowHn = money(row['Kho Hà Nội']);
    const rowHcm = money(row['Kho HCM']);
    const rowTotal = hasValue(row['Tổng tồn']) ? money(row['Tổng tồn']) : rowHn + rowHcm;
    const cost = money(row['Giá vốn']) || money(row['Giá nhập']);
    const price = money(row['Giá']);
    hn += rowHn;
    hcm += rowHcm;
    total += rowTotal;
    costValue += rowTotal * cost;
    saleValue += rowTotal * price;
  }
  return { rows: rows.length, hn, hcm, total, costValue, saleValue };
}


async function dbSalesByDay() {
  return SalePayment.aggregate([
    { $match: { status: 'completed' } },
    {
      $group: {
        _id: { $dateToString: { format: '%d/%m/%Y', date: '$createdAt', timezone: 'Asia/Ho_Chi_Minh' } },
        value: { $sum: '$value' },
        itemTotal: { $sum: { $sum: '$items.total' } },
        qty: { $sum: '$amountProducts' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: -1 } },
  ]);
}

async function main() {
  const excel = {
    products: { rows: readRows('Danh sách sản phẩm.xlsx').length },
    inventory: summarizeInventory(readRows('Tồn kho.xlsx')),
    sales: summarizeSales(readRows('Bán lẻ - Tất cả.xlsx')),
    refunds: summarizeRefunds(readRows('Trả hàng.xlsx')),
    warehouse: {
      vouchers: readRows('Phiếu xuất nhập kho.xlsx').length,
      products: readRows('Sản phẩm xuất nhập kho.xlsx').length,
      transfersAll: readRows('Kho hàng - Tất cả.xlsx').length,
      transfersDraft: readRows('Kho hàng - Phiếu nháp.xlsx').length,
      transfersOutgoing: readRows('Kho hàng - Đang chuyển đi .xlsx').length,
      transfersIncoming: readRows('Kho hàng - Sắp chuyển đến.xlsx').length,
    },
  };

  await connectDatabase();

  const [
    dbSaleAgg,
    dbRefundAgg,
    dbStockAgg,
    dbStockByBranch,
    dbWarehouse,
    dbSaleByDay,
  ] = await Promise.all([
    SalePayment.aggregate([
      {
        $group: {
          _id: null,
          rows: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          value: { $sum: '$value' },
          itemTotal: { $sum: { $sum: '$items.total' } },
          qty: { $sum: '$amountProducts' },
        },
      },
    ]),
    ProductRefund.aggregate([
      { $group: { _id: null, rows: { $sum: 1 }, value: { $sum: '$value' }, qty: { $sum: '$amount' } } },
    ]),
    ProductBranchStock.aggregate([
      { $group: { _id: null, rows: { $sum: 1 }, qty: { $sum: '$qty' } } },
    ]),
    ProductBranchStock.aggregate([
      { $lookup: { from: 'branches', localField: 'branchId', foreignField: '_id', as: 'branch' } },
      { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } },
      { $group: { _id: '$branch.name', rows: { $sum: 1 }, qty: { $sum: '$qty' } } },
      { $sort: { _id: 1 } },
    ]),
    Promise.all([
      InventoryVoucher.countDocuments(),
      InventoryProduct.countDocuments(),
      WarehouseTransfer.countDocuments(),
    ]),
    dbSalesByDay(),
  ]);

  const db = {
    products: { rows: await Product.countDocuments() },
    inventory: { ...(dbStockAgg[0] ?? { rows: 0, qty: 0 }), byBranch: dbStockByBranch },
    sales: dbSaleAgg[0] ?? { rows: 0, completed: 0, value: 0, itemTotal: 0, qty: 0 },
    salesByDay: Object.fromEntries(dbSaleByDay.map((row: any) => [row._id, row])),
    refunds: dbRefundAgg[0] ?? { rows: 0, value: 0, qty: 0 },
    warehouse: { vouchers: dbWarehouse[0], products: dbWarehouse[1], transfers: dbWarehouse[2] },
  };

  const watchDays = ['12/06/2026', '13/06/2026', '14/06/2026', '15/06/2026', '16/06/2026', '17/06/2026'];
  const chartCheck = watchDays.map((day) => ({
    day,
    excelInvoiceValue: excel.sales.byDay[day] ?? 0,
    dbInvoiceValue: db.salesByDay[day]?.value ?? 0,
    dbItemTotal: db.salesByDay[day]?.itemTotal ?? 0,
    dbInvoiceCount: db.salesByDay[day]?.count ?? 0,
  }));

  console.log(JSON.stringify({ dataDir, excel, db, chartCheck }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
