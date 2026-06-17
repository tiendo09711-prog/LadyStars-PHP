import fs from 'fs';
import os from 'os';
import path from 'path';
import mongoose from 'mongoose';
import xlsxPkg from 'xlsx';
import { connectDatabase } from '../config/database.js';
import {
  WarehouseDraftProduct,
  WarehouseDraftVoucher,
  WarehouseProductLog,
  WarehouseVoucherLog,
} from '../modules/warehouse/warehouse.models.js';

type Row = Record<string, any>;

const xlsx = xlsxPkg as typeof import('xlsx');
const dataDir = process.env.WAREHOUSE_DRAFT_DATA_DIR || path.join(os.homedir(), 'Downloads');

const files = {
  draftVouchers: path.join(dataDir, 'Phiếu XNK nháp.xlsx'),
  draftProducts: path.join(dataDir, 'Sản phẩm XNK nháp.xlsx'),
  voucherLogs: path.join(dataDir, 'Log sửa xóa phiếu XNK.xlsx'),
  productLogs: path.join(dataDir, 'Log sửa xóa sản phẩm XNK.xlsx'),
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

function splitWarehouse(value: string) {
  const parts = value.split(/\s+-\s+|→|->/).map((part) => part.trim()).filter(Boolean);
  return {
    fromWarehouse: parts[0] || value,
    toWarehouse: parts[1] || '',
  };
}

async function resetCollections() {
  await Promise.all([
    WarehouseDraftVoucher.deleteMany({}),
    WarehouseDraftProduct.deleteMany({}),
    WarehouseVoucherLog.deleteMany({}),
    WarehouseProductLog.deleteMany({}),
  ]);
}

async function importDraftVouchers() {
  const rows = readRows(files.draftVouchers);
  const docs = rows
    .filter((row) => text(row['ID']))
    .map((row) => {
      const warehouse = text(row['Kho hàng']);
      const split = splitWarehouse(warehouse);
      return {
        externalId: text(row['ID']),
        date: text(row['Ngày']),
        dateObj: parseDate(row['Ngày']),
        type: text(row['Kiểu']),
        warehouse,
        ...split,
        vendor: text(row['Nhà cung cấp']),
        spCount: money(row['Số lượng SP']),
        qty: money(row['Tổng SL']),
        totalAmount: money(row['Tổng tiền']),
        creator: text(row['Người tạo']),
        customer: text(row['Khách hàng']),
        timeCreated: text(row['Thời gian lập phiếu']),
        timeCreatedObj: parseDate(row['Thời gian lập phiếu']),
        note: text(row['Ghi chú']),
        approvedBy: text(row['Duyệt']),
        approvedAt: text(row['Ngày Duyệt']),
        approvedAtObj: parseDate(row['Ngày Duyệt']),
        confirmedBy: text(row['Xác nhận']),
        confirmedAt: text(row['Ngày xác nhận']),
        confirmedAtObj: parseDate(row['Ngày xác nhận']),
        canceledBy: text(row['Người hủy']),
        canceledAt: text(row['Thời gian hủy']),
        label: text(row['Nhãn phiếu XNK nháp']),
      };
    });
  if (docs.length) await WarehouseDraftVoucher.insertMany(docs);
  summary.draft_vouchers_excel_rows = rows.length;
  summary.draft_vouchers_imported = docs.length;
}

async function importDraftProducts() {
  const rows = readRows(files.draftProducts);
  const docs = rows
    .filter((row) => text(row['ID']))
    .map((row) => {
      const warehouse = text(row['Kho']);
      const split = splitWarehouse(warehouse);
      return {
        externalId: text(row['ID']),
        requestId: text(row['ID Phiếu yêu cầu']),
        warehouse,
        ...split,
        date: text(row['Ngày']),
        dateObj: parseDate(row['Ngày']),
        creator: text(row['Người lập']),
        productCode: text(row['Mã SP']),
        barcode: text(row['Mã vạch']),
        productName: text(row['Tên SP']),
        salePrice: money(row['Giá bán']),
        type: text(row['Kiểu']),
        requestedQty: money(row['SL']),
        requestedPrice: money(row['Giá YC']),
        amount: money(row['Thành tiền']),
        description: text(row['Mô tả']),
        approvedAt: text(row['Ngày Duyệt']),
        approvedAtObj: parseDate(row['Ngày Duyệt']),
        approvedQty: money(row['SL duyệt']),
        approvedValue: money(row['Giá trị duyệt']),
        confirmedAt: text(row['Ngày xác nhận']),
        confirmedAtObj: parseDate(row['Ngày xác nhận']),
        xnkQty: money(row['SL XNK']),
        confirmedValue: money(row['Giá trị xác nhận']),
        vendor: text(row['NCC']),
      };
    });
  if (docs.length) await WarehouseDraftProduct.insertMany(docs);
  summary.draft_products_excel_rows = rows.length;
  summary.draft_products_imported = docs.length;
}

async function importVoucherLogs() {
  const rows = readRows(files.voucherLogs);
  const docs = rows
    .filter((row) => text(row['ID hóa đơn đơn nháp']) || text(row['Kiểu log']) || text(row['Loại XNK']) || text(row['Người thao tác']) || text(row['Thời gian tạo']))
    .map((row) => ({
      draftVoucherId: text(row['ID hóa đơn đơn nháp']),
      logType: text(row['Kiểu log']),
      xnkCategory: text(row['Loại XNK']),
      xnkType: text(row['Kiểu XNK']),
      xnkDate: text(row['Ngày XNK']),
      xnkDateObj: parseDate(row['Ngày XNK']),
      customer: text(row['Khách hàng']),
      actor: text(row['Người thao tác']),
      createdAtStr: text(row['Thời gian tạo']),
      createdAtObj: parseDate(row['Thời gian tạo']),
    }));
  if (docs.length) await WarehouseVoucherLog.insertMany(docs);
  summary.voucher_logs_excel_rows = rows.length;
  summary.voucher_logs_imported = docs.length;
}

async function importProductLogs() {
  const rows = readRows(files.productLogs);
  const docs = rows
    .filter((row) => text(row['ID phiếu XNK']) || text(row['ID sản phẩm XNK']))
    .map((row) => ({
      voucherId: text(row['ID phiếu XNK']),
      inventoryProductId: text(row['ID sản phẩm XNK']),
      logType: text(row['Kiểu log']),
      xnkCategory: text(row['Loại XNK']),
      xnkType: text(row['Kiểu XNK']),
      productName: text(row['Sản phẩm']),
      imei: text(row['IMEI']),
      qty: money(row['Số lượng']),
      price: money(row['Giá']),
      actor: text(row['Người thao tác']),
      createdAtStr: text(row['Thời gian tạo']),
      createdAtObj: parseDate(row['Thời gian tạo']),
    }));
  if (docs.length) await WarehouseProductLog.insertMany(docs);
  summary.product_logs_excel_rows = rows.length;
  summary.product_logs_imported = docs.length;
}

async function validate() {
  summary.db_draft_vouchers = await WarehouseDraftVoucher.countDocuments();
  summary.db_draft_products = await WarehouseDraftProduct.countDocuments();
  summary.db_voucher_logs = await WarehouseVoucherLog.countDocuments();
  summary.db_product_logs = await WarehouseProductLog.countDocuments();
}

async function main() {
  ensureFiles();
  await connectDatabase();
  await resetCollections();
  await importDraftVouchers();
  await importDraftProducts();
  await importVoucherLogs();
  await importProductLogs();
  await validate();
  console.log(JSON.stringify({ dataDir, summary }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
