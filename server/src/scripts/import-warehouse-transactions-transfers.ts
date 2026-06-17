import fs from 'fs';
import os from 'os';
import path from 'path';
import mongoose from 'mongoose';
import xlsxPkg from 'xlsx';
import { connectDatabase } from '../config/database.js';
import {
  InventoryProduct,
  InventoryVoucher,
  WarehouseTransfer,
} from '../modules/warehouse/warehouse.models.js';

type Row = Record<string, any>;

const xlsx = xlsxPkg as typeof import('xlsx');
const dataDir = process.env.WAREHOUSE_DATA_DIR || path.join(os.homedir(), 'Downloads');

const files = {
  vouchers: path.join(dataDir, 'Phiếu xuất nhập kho.xlsx'),
  products: path.join(dataDir, 'Sản phẩm xuất nhập kho.xlsx'),
  transfersAll: path.join(dataDir, 'Kho hàng - Tất cả.xlsx'),
  transfersDraft: path.join(dataDir, 'Kho hàng - Phiếu nháp.xlsx'),
  transfersOutgoing: path.join(dataDir, 'Kho hàng - Đang chuyển đi .xlsx'),
  transfersIncoming: path.join(dataDir, 'Kho hàng - Sắp chuyển đến.xlsx'),
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
  if (!raw) return undefined;
  const vn = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (vn) {
    return new Date(Number(vn[3]), Number(vn[2]) - 1, Number(vn[1]), Number(vn[4] || 12), Number(vn[5] || 0), Number(vn[6] || 0));
  }

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), Number(iso[4] || 12), Number(iso[5] || 0), Number(iso[6] || 0));
  }

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
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

function splitTransferWarehouses(raw: string) {
  const cleaned = raw.replace(/\[.*?\]/g, '').replace(/\s+tới\s+/i, ' - ').trim();
  const parts = cleaned.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  return { fromWarehouse: parts[0] || '', toWarehouse: parts[1] || '' };
}

async function resetCollections() {
  await Promise.all([
    InventoryVoucher.deleteMany({}),
    InventoryProduct.deleteMany({}),
    WarehouseTransfer.deleteMany({}),
  ]);
}

async function importVouchers() {
  const rows = readRows(files.vouchers);
  const docs = rows
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
      warehouseLabel: text(row['Kho hàng_1']),
      type: text(row['Kiểu']),
      supplier: text(row['Nhà cung cấp']),
      spCount: money(row['SP']),
      qty: money(row['SL']),
      totalAmount: money(row['Tổng tiền']),
      discount: money(row['Chiết khấu']),
      creator: text(row['Người tạo']),
      customer: text(row['Tên khách hàng']),
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

  if (docs.length) await InventoryVoucher.insertMany(docs);
  summary.vouchers_excel_rows = rows.length;
  summary.vouchers_imported = docs.length;
}

async function importProducts() {
  const rows = readRows(files.products);
  const docs = rows
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

  if (docs.length) await InventoryProduct.insertMany(docs);
  summary.products_excel_rows = rows.length;
  summary.products_imported = docs.length;
}

function addTransfer(transferMap: Map<string, any>, row: Row, tab: string, source: 'all' | 'status') {
  const id = text(row['ID']);
  if (!id) return;
  const existing = transferMap.get(id) || { id, tabs: [] };
  if (!existing.tabs.includes(tab)) existing.tabs.push(tab);

  const warehouse = source === 'all' ? text(row['Kho hàng']) || text(row['Mã kho']) : text(row['Kho']);
  const split = splitTransferWarehouses(warehouse);
  Object.assign(existing, {
    date: text(row['Ngày']) || existing.date,
    type: text(row['Kiểu']) || existing.type,
    warehouse: warehouse || existing.warehouse,
    fromWarehouse: split.fromWarehouse || existing.fromWarehouse,
    toWarehouse: split.toWarehouse || existing.toWarehouse,
    requestVoucher: text(row['Phiếu yêu cầu XNK']) || existing.requestVoucher,
    warehouseCode: text(row['Mã kho']) || existing.warehouseCode,
    warehouseLabel: text(row['Kho hàng_1']) || existing.warehouseLabel,
    label: text(row['Nhãn hóa đơn XNK']) || existing.label,
    qty: money(row['Tổng SL']) || existing.qty || 0,
    spCount: money(row['Số lượng SP'] || row['Số SP']) || existing.spCount || 0,
    totalAmount: money(row['Tổng tiền']) || existing.totalAmount || 0,
    totalSaleAmount: money(row['Tổng tiền theo giá bán']) || existing.totalSaleAmount || 0,
    discount: money(row['Chiết khấu']) || existing.discount || 0,
    creator: text(row['Người tạo'] || row['Người lập phiếu']) || existing.creator,
    customer: text(row['Khách hàng']) || existing.customer,
    customerDob: text(row['Ngày sinh']) || existing.customerDob,
    customerPhone: text(row['Điện thoại']) || existing.customerPhone,
    invoiceVat: text(row['Hóa đơn vat']) || existing.invoiceVat,
    seller: text(row['Nhân viên bán hàng']) || existing.seller,
    coupon: text(row['Mã Coupon']) || existing.coupon,
    note: text(row['Mô tả'] || row['Ghi chú']) || existing.note,
    timeCreated: text(row['Thời gian lập phiếu'] || row['Ngày tạo']) || existing.timeCreated,
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
}

async function importTransfers() {
  const transferMap = new Map<string, any>();
  const allRows = readRows(files.transfersAll);
  const draftRows = readRows(files.transfersDraft);
  const outgoingRows = readRows(files.transfersOutgoing);
  const incomingRows = readRows(files.transfersIncoming);

  allRows.forEach((row) => addTransfer(transferMap, row, 'all', 'all'));
  draftRows.forEach((row) => addTransfer(transferMap, row, 'draft', 'status'));
  outgoingRows.forEach((row) => addTransfer(transferMap, row, 'transferring', 'status'));
  incomingRows.forEach((row) => addTransfer(transferMap, row, 'incoming', 'status'));

  const docs = [...transferMap.values()];
  if (docs.length) await WarehouseTransfer.insertMany(docs);

  summary.transfers_all_excel_rows = allRows.length;
  summary.transfers_draft_excel_rows = draftRows.length;
  summary.transfers_outgoing_excel_rows = outgoingRows.length;
  summary.transfers_incoming_excel_rows = incomingRows.length;
  summary.transfers_imported_unique = docs.length;
  summary.transfers_all_tab = docs.filter((doc) => doc.tabs.includes('all')).length;
  summary.transfers_draft_tab = docs.filter((doc) => doc.tabs.includes('draft')).length;
  summary.transfers_outgoing_tab = docs.filter((doc) => doc.tabs.includes('transferring')).length;
  summary.transfers_incoming_tab = docs.filter((doc) => doc.tabs.includes('incoming')).length;
}

async function validate() {
  summary.db_inventory_vouchers = await InventoryVoucher.countDocuments();
  summary.db_inventory_products = await InventoryProduct.countDocuments();
  summary.db_warehouse_transfers = await WarehouseTransfer.countDocuments();
  summary.db_transfers_all = await WarehouseTransfer.countDocuments({ tabs: 'all' });
  summary.db_transfers_draft = await WarehouseTransfer.countDocuments({ tabs: 'draft' });
  summary.db_transfers_outgoing = await WarehouseTransfer.countDocuments({ tabs: 'transferring' });
  summary.db_transfers_incoming = await WarehouseTransfer.countDocuments({ tabs: 'incoming' });
}

async function main() {
  ensureFiles();
  await connectDatabase();
  await resetCollections();
  await importVouchers();
  await importProducts();
  await importTransfers();
  await validate();
  console.log(JSON.stringify({ dataDir, summary }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
