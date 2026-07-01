import { buildInvoiceProfile, getBranch, getStoreSetting, type BranchRecord, type StoreSettingRecord } from '../../core/api/branch.api';
import { escapeReceiptHtml, writeAndPrintPopup, type ReceiptProfile } from '../sales/invoicePrint';

type TransferPrintData = {
  _id: string;
  id?: string;
  code?: string;
  status?: string;
  statusLabel?: string;
  kind?: string;
  originTransferId?: string;
  sourceExportBillId?: string;
  createdAt?: string;
  date?: string;
  sourceWarehouseId?: string;
  destinationWarehouseId?: string;
  sourceWarehouseName?: string;
  destinationWarehouseName?: string;
  creator?: string;
  createdById?: unknown;
  sourceConfirmedBy?: unknown;
  sourceConfirmedAt?: string;
  dispatchConfirmedById?: unknown;
  dispatchConfirmedAt?: string;
  destinationConfirmedBy?: unknown;
  destinationConfirmedAt?: string;
  receiptConfirmedById?: unknown;
  receiptConfirmedAt?: string;
  note?: string;
  qty?: number;
  spCount?: number;
  lines?: Array<{ productCode?: string; productName?: string; unit?: string; requestedQuantity?: number; dispatchedQuantity?: number; receivedQuantity?: number; lockedQuantity?: number }>;
};

function trim(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function displayDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN');
}

function displayUser(value: unknown, fallback = '-') {
  if (!value) return fallback;
  if (typeof value === 'string') return value || fallback;
  if (typeof value === 'object') {
    const user = value as { name?: string; email?: string };
    return user.name || user.email || fallback;
  }
  return fallback;
}

function qty(value: unknown) {
  return Number(value || 0).toLocaleString('vi-VN');
}

function profileFor(branch?: BranchRecord | null, store?: StoreSettingRecord | null) {
  return buildInvoiceProfile(branch || undefined, store || undefined);
}

function mergeProfile(source?: BranchRecord | null, destination?: BranchRecord | null, store?: StoreSettingRecord | null): ReceiptProfile {
  const sourceProfile = profileFor(source, store);
  const destinationProfile = profileFor(destination, store);
  const globalProfile = profileFor(null, store);
  return {
    ...sourceProfile,
    brandName: trim(sourceProfile.brandName) || trim(destinationProfile.brandName) || trim(globalProfile.brandName),
    branchName: trim(sourceProfile.branchName) || trim(destinationProfile.branchName) || trim(globalProfile.branchName),
    address: trim(sourceProfile.address) || trim(destinationProfile.address) || trim(globalProfile.address),
    phone: trim(sourceProfile.phone) || trim(destinationProfile.phone) || trim(globalProfile.phone),
    logoUrl: trim(sourceProfile.logoUrl) || trim(destinationProfile.logoUrl) || trim(globalProfile.logoUrl),
    footerText: trim(sourceProfile.footerText) || trim(destinationProfile.footerText) || trim(globalProfile.footerText),
    showBranchName: Boolean(sourceProfile.showBranchName ?? destinationProfile.showBranchName ?? globalProfile.showBranchName),
    showCashier: sourceProfile.showCashier !== false,
    showProductCode: Boolean(sourceProfile.showProductCode ?? destinationProfile.showProductCode ?? globalProfile.showProductCode),
    showLogo: Boolean(sourceProfile.showLogo ?? destinationProfile.showLogo ?? globalProfile.showLogo),
    templateConfig: sourceProfile.templateConfig || destinationProfile.templateConfig || globalProfile.templateConfig,
  };
}

async function resolvePrintProfile(transfer: TransferPrintData) {
  const [store, source, destination] = await Promise.all([
    getStoreSetting().catch(() => null),
    transfer.sourceWarehouseId ? getBranch(transfer.sourceWarehouseId).catch(() => null) : Promise.resolve(null),
    transfer.destinationWarehouseId ? getBranch(transfer.destinationWarehouseId).catch(() => null) : Promise.resolve(null),
  ]);
  return { profile: mergeProfile(source, destination, store), source, destination };
}

function transferStatusLabel(transfer: TransferPrintData) {
  if (transfer.statusLabel) return transfer.statusLabel;
  if (transfer.status === 'IN_TRANSIT') return 'Đã xác nhận xuất / Đang chuyển';
  if (transfer.status === 'RETURN_IN_PROGRESS') return 'Đang chờ nhận lại hàng trả';
  if (transfer.status === 'COMPLETED') return 'Hoàn thành';
  return transfer.status || '-';
}

function printedLineQty(transfer: TransferPrintData, line: NonNullable<TransferPrintData['lines']>[number]) {
  if (transfer.status === 'COMPLETED') return Number(line.receivedQuantity || line.dispatchedQuantity || line.requestedQuantity || 0);
  return Number(line.lockedQuantity || line.dispatchedQuantity || line.requestedQuantity || 0);
}

function buildTransferSlipHtml(transfer: TransferPrintData, profile: ReceiptProfile, source?: BranchRecord | null, destination?: BranchRecord | null) {
  const lines = transfer.lines || [];
  const title = transfer.kind === 'RETURN_OF_TRANSFER' ? 'PHIẾU TRẢ HÀNG CHUYỂN KHO' : 'ĐƠN CHUYỂN KHO';
  const totalQty = lines.reduce((sum, line) => sum + printedLineQty(transfer, line), 0);
  const rows = lines.map((line, index) => `<tr><td class=center>${index + 1}</td><td>${escapeReceiptHtml(line.productCode || '')}</td><td>${escapeReceiptHtml(line.productName || '')}</td><td>${escapeReceiptHtml(line.unit || '')}</td><td class=right>${qty(printedLineQty(transfer, line))}</td></tr>`).join('');
  const logo = profile.showLogo && profile.logoUrl ? `<p class=iv-logo><img src=${escapeReceiptHtml(profile.logoUrl)} alt=logo /></p>` : '';
  return `<!doctype html><html lang=vi><head><meta charset=utf-8 /><title>${escapeReceiptHtml(title)}</title><style>@page{margin:2mm}*{box-sizing:border-box}html,body{width:76mm;min-height:100%;margin:0;padding:0;overflow-x:hidden}body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:14px;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}.receipt{width:76mm;max-width:76mm;margin:0;padding:0 1mm;overflow:visible}.iv-header{text-align:center;overflow-wrap:anywhere}.iv-logo{margin:0 0 4px}.iv-logo img{max-width:46mm;max-height:18mm;object-fit:contain}.iv-brand{font-weight:700;font-size:18px;text-transform:uppercase}.iv-sub{overflow-wrap:anywhere}.iv-title{text-align:center;font-weight:700;font-size:20px;margin:10px 0;text-transform:uppercase;overflow-wrap:anywhere}.iv-meta{display:grid;grid-template-columns:1fr;gap:4px;margin:8px 0}.iv-meta>div,.iv-box div{min-width:0;overflow-wrap:anywhere;word-break:break-word}.iv-box{border:1px solid #111;padding:6px;margin:8px 0}.iv-table{width:100%;table-layout:fixed;border-collapse:collapse;margin:8px 0}.iv-table th,.iv-table td{border:1px solid #111;padding:4px 3px;vertical-align:top;overflow-wrap:anywhere;word-break:break-word;white-space:normal}.iv-table th{background:#f4f4f4}.iv-table th:nth-child(1),.iv-table td:nth-child(1){width:10%;text-align:center}.iv-table th:nth-child(2),.iv-table td:nth-child(2){width:20%}.iv-table th:nth-child(3),.iv-table td:nth-child(3){width:42%}.iv-table th:nth-child(4),.iv-table td:nth-child(4){width:13%;text-align:center}.iv-table th:nth-child(5),.iv-table td:nth-child(5){width:15%;text-align:right}.center{text-align:center}.right{text-align:right}h2{font-size:16px;margin:10px 0 6px;overflow-wrap:anywhere}.iv-sign{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:28px;text-align:center;font-weight:700}.iv-footer{text-align:center;margin-top:18px;border-top:1px dashed #111;padding-top:8px;overflow-wrap:anywhere}@media print{html,body{width:76mm}.receipt{width:76mm;max-width:76mm}.iv-table th{background:#f4f4f4!important}}</style></head><body><main class=receipt><header class=iv-header>${logo}<div class=iv-brand>${escapeReceiptHtml(profile.brandName)}</div>${profile.address ? `<div class=iv-sub>${escapeReceiptHtml(profile.address)}</div>` : ''}${profile.phone ? `<div class=iv-sub>Điện thoại: ${escapeReceiptHtml(profile.phone)}</div>` : ''}</header><h1 class=iv-title>${escapeReceiptHtml(title)}</h1><div class=iv-meta><div><strong>Mã phiếu:</strong> ${escapeReceiptHtml(transfer.id || transfer.code || transfer._id)}</div><div><strong>Ngày tạo:</strong> ${escapeReceiptHtml(displayDate(transfer.date || transfer.createdAt))}</div><div><strong>Trạng thái:</strong> ${escapeReceiptHtml(transferStatusLabel(transfer))}</div><div><strong>Người tạo:</strong> ${escapeReceiptHtml(transfer.creator || displayUser(transfer.createdById))}</div>${transfer.originTransferId ? `<div><strong>Đơn gốc:</strong> ${escapeReceiptHtml(transfer.originTransferId)}</div>` : ''}</div><section class=iv-box><div><strong>Kho nguồn:</strong> ${escapeReceiptHtml(transfer.sourceWarehouseName || source?.name || '')}</div><div><strong>Địa chỉ kho nguồn:</strong> ${escapeReceiptHtml(source?.address || '')}</div><div><strong>Kho đích:</strong> ${escapeReceiptHtml(transfer.destinationWarehouseName || destination?.name || '')}</div><div><strong>Địa chỉ kho đích:</strong> ${escapeReceiptHtml(destination?.address || '')}</div></section><div class=iv-meta><div><strong>Người xác nhận xuất:</strong> ${escapeReceiptHtml(displayUser(transfer.sourceConfirmedBy || transfer.dispatchConfirmedById))}</div><div><strong>Thời gian xuất:</strong> ${escapeReceiptHtml(displayDate(transfer.sourceConfirmedAt || transfer.dispatchConfirmedAt))}</div><div><strong>Người xác nhận nhận:</strong> ${escapeReceiptHtml(displayUser(transfer.destinationConfirmedBy || transfer.receiptConfirmedById))}</div><div><strong>Thời gian nhận:</strong> ${escapeReceiptHtml(displayDate(transfer.destinationConfirmedAt || transfer.receiptConfirmedAt))}</div></div><h2>BẢNG CHI TIẾT CHUYỂN KHO</h2><table class=iv-table><thead><tr><th>STT</th><th>Mã SP</th><th>Tên sản phẩm</th><th>Đơn vị</th><th>Số lượng</th></tr></thead><tbody>${rows}</tbody></table><div class=iv-meta><div><strong>Tổng số sản phẩm:</strong> ${qty(transfer.spCount || lines.length)}</div><div><strong>Tổng số lượng:</strong> ${qty(transfer.qty || totalQty)}</div><div style=grid-column:1/-1><strong>Ghi chú:</strong> ${escapeReceiptHtml(transfer.note || '-')}</div></div><div class=iv-sign><div>Chữ ký kho gửi</div><div>Chữ ký kho nhận</div></div><div class=iv-footer>${escapeReceiptHtml(profile.footerText)}</div></main></body></html>`;
}

export async function printWarehouseTransfer(transfer: TransferPrintData) {
  const canPrint = transfer.status === 'COMPLETED' || (transfer.status === 'IN_TRANSIT' && (transfer.sourceExportBillId || transfer.dispatchConfirmedAt)) || transfer.status === 'RETURN_IN_PROGRESS';
  if (!canPrint) throw new Error('Chỉ in được đơn chuyển kho đã xác nhận xuất, đang chờ nhận lại hàng trả hoặc đã hoàn thành.');
  const popup = window.open('', 'warehouse-transfer-print', 'width=960,height=720');
  if (!popup) throw new Error('Trình duyệt đã chặn cửa sổ in.');
  const { profile, source, destination } = await resolvePrintProfile(transfer);
  writeAndPrintPopup(popup, buildTransferSlipHtml(transfer, profile, source, destination));
}
