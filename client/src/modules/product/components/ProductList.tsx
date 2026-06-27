import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Boxes,
  CheckSquare,
  ChevronDown,
  Download,
  Eye,
  FileDown,
  FileUp,
  MoreHorizontal,
  PackageCheck,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Tag,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  code128 as renderCode128,
  code39 as renderCode39,
  drawingSVG,
  ean13 as renderEan13,
  qrcode as renderQrCode,
} from '@bwip-js/generic';
import * as XLSX from 'xlsx';
import { createPortal } from 'react-dom';
import {
  productApi,
  type ProductSavePayload,
  type ProductWarehouseStock,
} from '../../../core/api/product.api';
import { http } from '../../../core/api/http';
import { Pagination } from '../../../core/components/Pagination';
import { useProductScanTarget } from '../../../core/hooks/productScanner';
import type { ICategory, IProduct } from '../../../types/product.type';
import { ExportExcelModal, type ColumnOption } from './ExportExcelModal';

function formatMoney(value?: number) {
  return `${Number(value || 0).toLocaleString('vi-VN')} đ`;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getStatusClass(status?: string) {
  const normalized = (status || '').toLowerCase();
  if (['mới', 'active'].includes(normalized)) return 'success';
  if (['ngừng', 'inactive'].includes(normalized)) return 'danger';
  return normalized ? 'warning' : '';
}

interface BranchOption {
  _id: string;
  name: string;
  code?: string;
  isActive?: boolean;
}

type BarcodeType = 'AUTO' | 'EAN13' | 'C128' | 'C39' | 'C128A' | 'QRCODE';
type ResolvedBarcodeType = 'EAN13' | 'C128' | 'C39' | 'C128A' | 'QRCODE';

const BARCODE_RENDER_SCALE = 3;
const BARCODE_QUIET_PADDING = 10;
const BARCODE_1D_HEIGHT = 10.7;

const BARCODE_TYPE_LABELS: Record<ResolvedBarcodeType, string> = {
  EAN13: 'EAN-13',
  C128: 'Code 128',
  C128A: 'Code 128A',
  C39: 'Code 39',
  QRCODE: 'QR Code',
};

function barcodeTypeLabel(type: ResolvedBarcodeType) {
  return BARCODE_TYPE_LABELS[type] ?? type;
}

function resolveBarcodeType(value: string, requestedType: BarcodeType): ResolvedBarcodeType {
  if (requestedType !== 'AUTO') return requestedType;
  return isValidEan13(value.trim()) ? 'EAN13' : 'C128';
}

interface PaperTemplate {
  id: string;
  title: string;
  size: string;
  pageWidthMm: number;
  pageHeightMm: number;
  labelWidthMm: number;
  labelHeightMm: number;
  columns: number;
  rows?: number;
  gapXmm?: number;
  gapYmm?: number;
  previewClass: 'roll' | 'sheet' | 'jewelry';
}

const PRODUCT_STATUS_OPTIONS = ['Mới', 'Đang bán', 'Ngừng bán', 'Hết hàng'];

const DEFAULT_BARCODE_PAPER_ID = 'a4-65';

const PAPER_TEMPLATES: PaperTemplate[] = [
  { id: 'roll-105x22-3', title: 'Mẫu giấy cuộn 3 nhãn', size: 'Mỗi nhãn 35x22mm, 3 nhãn ngang.', pageWidthMm: 105, pageHeightMm: 22, labelWidthMm: 35, labelHeightMm: 22, columns: 3, previewClass: 'roll' },
  { id: 'roll-70x22-2', title: 'Mẫu giấy cuộn 2 nhãn', size: 'Mỗi nhãn 35x22mm, 2 nhãn ngang.', pageWidthMm: 70, pageHeightMm: 22, labelWidthMm: 35, labelHeightMm: 22, columns: 2, previewClass: 'roll' },
  { id: 'roll-70x22-1', title: 'Mẫu giấy cuộn 1 nhãn', size: 'Mỗi nhãn 70x22mm.', pageWidthMm: 70, pageHeightMm: 22, labelWidthMm: 70, labelHeightMm: 22, columns: 1, previewClass: 'roll' },
  { id: 'a4-65', title: 'Mẫu giấy 65 nhãn', size: 'Khổ A4, Tomy 145 - tem 38.1x21.2mm.', pageWidthMm: 210, pageHeightMm: 297, labelWidthMm: 38.1, labelHeightMm: 21.2, columns: 5, rows: 13, gapXmm: 2.55, gapYmm: 0, previewClass: 'sheet' },
  { id: 'roll-77x22-2', title: 'Mẫu giấy cuộn 2 nhãn', size: 'Mỗi nhãn 38.5x22mm, 2 nhãn ngang.', pageWidthMm: 77, pageHeightMm: 22, labelWidthMm: 38.5, labelHeightMm: 22, columns: 2, previewClass: 'roll' },
  { id: 'roll-40x25-1', title: 'Mẫu giấy cuộn 1 nhãn', size: 'Mỗi nhãn 40x25mm.', pageWidthMm: 40, pageHeightMm: 25, labelWidthMm: 40, labelHeightMm: 25, columns: 1, previewClass: 'roll' },
  { id: 'a4-180', title: 'Mẫu giấy 180 nhãn', size: 'Khổ A4 - tem 20x15mm.', pageWidthMm: 210, pageHeightMm: 297, labelWidthMm: 20, labelHeightMm: 15, columns: 10, rows: 18, gapXmm: 0, gapYmm: 0, previewClass: 'sheet' },
  { id: 'roll-50x40-2', title: 'Mẫu giấy cuộn 2 nhãn', size: 'Mỗi nhãn 50x40mm, 2 nhãn ngang.', pageWidthMm: 100, pageHeightMm: 40, labelWidthMm: 50, labelHeightMm: 40, columns: 2, previewClass: 'roll' },
  { id: 'roll-40x30-1', title: 'Mẫu giấy cuộn 1 nhãn', size: 'Mỗi nhãn 40x30mm.', pageWidthMm: 40, pageHeightMm: 30, labelWidthMm: 40, labelHeightMm: 30, columns: 1, previewClass: 'roll' },
  { id: 'roll-50x30-1', title: 'Mẫu giấy cuộn 1 nhãn', size: 'Mỗi nhãn 50x30mm.', pageWidthMm: 50, pageHeightMm: 30, labelWidthMm: 50, labelHeightMm: 30, columns: 1, previewClass: 'roll' },
  { id: 'roll-30x20-2', title: 'Mẫu giấy cuộn 2 nhãn', size: 'Mỗi nhãn 30x20mm, 2 nhãn ngang.', pageWidthMm: 60, pageHeightMm: 20, labelWidthMm: 30, labelHeightMm: 20, columns: 2, previewClass: 'roll' },
  { id: 'jewelry-80x10', title: 'Mẫu tem trang sức / kính mắt', size: 'Mỗi nhãn 80x10mm.', pageWidthMm: 80, pageHeightMm: 10, labelWidthMm: 80, labelHeightMm: 10, columns: 1, previewClass: 'jewelry' },
  { id: 'a4-30', title: 'Mẫu giấy 30 nhãn', size: 'Khổ A4, Tomy 144 - tem 67x28mm.', pageWidthMm: 210, pageHeightMm: 297, labelWidthMm: 67, labelHeightMm: 28, columns: 3, rows: 10, gapXmm: 3, gapYmm: 0, previewClass: 'sheet' },
  { id: 'a4-48', title: 'Mẫu giấy 48 nhãn', size: 'Khổ A4, Tomy 132 - tem 45.7x21.2mm.', pageWidthMm: 210, pageHeightMm: 297, labelWidthMm: 45.7, labelHeightMm: 21.2, columns: 4, rows: 12, gapXmm: 4, gapYmm: 0, previewClass: 'sheet' },
];

function normalizeBarcodeValue(product: IProduct) {
  return String(product.barcode || product.code || product._id || '').trim();
}

function computeEan13CheckDigit(value: string) {
  const digits = value.slice(0, 12).split('').map(Number);
  const sum = digits.reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
}

function isValidEan13(value: string) {
  return /^\d{13}$/.test(value) && computeEan13CheckDigit(value.slice(0, 12)) === value[12];
}

function isValidCode39(value: string) {
  return /^[0-9A-Z .\-/$+%]+$/.test(value);
}

type BarcodeBuildResult = {
  svg: string;
  requestedType: BarcodeType;
  actualType: ResolvedBarcodeType;
  standard: string;
  encodedValue: string;
  naturalWidth: number;
  naturalHeight: number;
  aspectRatio: number;
  warning?: string;
  error?: string;
};

function readSvgViewBox(svg: string): { width: number; height: number } {
  const match = svg.match(/viewBox=["']0 0 ([\d.]+) ([\d.]+)["']/);
  if (!match) return { width: 0, height: 0 };
  return { width: Number(match[1]) || 0, height: Number(match[2]) || 0 };
}

function decorateBarcodeSvg(svg: string, result: Omit<BarcodeBuildResult, 'svg'>) {
  const classes = result.actualType === 'QRCODE' ? 'barcode-svg qr' : 'barcode-svg';
  return svg.replace(
    '<svg ',
    `<svg class="${classes}" preserveAspectRatio="xMidYMid meet" data-barcode-type="${result.actualType}" data-barcode-requested-type="${result.requestedType}" data-barcode-standard="${result.standard}" data-barcode-value="${escapeHtml(result.encodedValue)}" data-barcode-natural-width="${result.naturalWidth}" data-barcode-natural-height="${result.naturalHeight}" role="img" aria-label="${escapeHtml(`${barcodeTypeLabel(result.actualType)}: ${result.encodedValue}`)}" `,
  );
}

function buildBarcodeResult(value: string, requestedType: BarcodeType): BarcodeBuildResult {
  const text = value.trim() || '0';
  const resolved = resolveBarcodeType(text, requestedType);
  const empty = (actualType: ResolvedBarcodeType, standard: string, error: string): BarcodeBuildResult => ({
    requestedType, actualType, standard, encodedValue: text, naturalWidth: 0, naturalHeight: 0, aspectRatio: 0, error, svg: `<span class="barcode-svg-error">${escapeHtml(error)}</span>`,
  });
  const build = (actualType: ResolvedBarcodeType, standard: string, render: () => string, warning?: string): BarcodeBuildResult => {
    const rawSvg = render();
    const { width, height } = readSvgViewBox(rawSvg);
    const aspectRatio = height > 0 ? width / height : 0;
    const meta = { requestedType, actualType, standard, encodedValue: text, naturalWidth: width, naturalHeight: height, aspectRatio, warning };
    return { ...meta, svg: decorateBarcodeSvg(rawSvg, meta) };
  };

  try {
    if (resolved === 'QRCODE') {
      return build('QRCODE', 'qrcode', () => renderQrCode({ bcid: 'qrcode', text, scale: BARCODE_RENDER_SCALE, paddingwidth: 4, paddingheight: 4 }, drawingSVG()));
    }
    if (resolved === 'EAN13') {
      if (!isValidEan13(text)) {
        return empty('EAN13', 'ean13', 'Mã không hợp lệ EAN-13. Hãy chọn "Tự động (khuyến nghị)" hoặc "Code 128" để in nguyên mã gốc.');
      }
      return build('EAN13', 'ean13', () => renderEan13({ bcid: 'ean13', text, scale: BARCODE_RENDER_SCALE, height: BARCODE_1D_HEIGHT, includetext: false, paddingwidth: BARCODE_QUIET_PADDING, paddingheight: 2 }, drawingSVG()));
    }
    if (resolved === 'C39') {
      const code39Text = text.toUpperCase();
      if (!isValidCode39(code39Text)) {
        return empty('C39', 'code39', 'Mã có ký tự không hỗ trợ Code 39. Chọn "Tự động (khuyến nghị)" hoặc "Code 128" để in nguyên mã gốc.');
      }
      return build('C39', 'code39', () => renderCode39({ bcid: 'code39', text: code39Text, scale: BARCODE_RENDER_SCALE, height: BARCODE_1D_HEIGHT, includetext: false, paddingwidth: BARCODE_QUIET_PADDING, paddingheight: 2 }, drawingSVG()));
    }
    if (resolved === 'C128A') {
      return build('C128A', 'code128a', () => renderCode128({ bcid: 'code128a', text, scale: BARCODE_RENDER_SCALE, height: BARCODE_1D_HEIGHT, includetext: false, paddingwidth: BARCODE_QUIET_PADDING, paddingheight: 2 }, drawingSVG()));
    }
    return build('C128', 'code128', () => renderCode128({ bcid: 'code128', text, scale: BARCODE_RENDER_SCALE, height: BARCODE_1D_HEIGHT, includetext: false, paddingwidth: BARCODE_QUIET_PADDING, paddingheight: 2 }, drawingSVG()));
  } catch (error) {
    console.error(`Không thể tạo mã ${requestedType}:`, error);
    return empty(resolved, resolved.toLowerCase(), 'Không thể tạo mã vạch cho dữ liệu này.');
  }
}

function buildBarcodeSvg(value: string, type: BarcodeType) {
  return buildBarcodeResult(value, type).svg;
}

function BarcodeSvg({ value, type }: { value: string; type: BarcodeType }) {
  return <span className="barcode-art" dangerouslySetInnerHTML={{ __html: buildBarcodeSvg(value, type) }} />;
}

const PX_TO_MM = 25.4 / 96;

type BarcodePrintFlags = {
  showStore: boolean;
  showCode: boolean;
  showName: boolean;
  showThreeLineName: boolean;
  showPrice: boolean;
  showOldPrice: boolean;
};

function getLabelLayoutMetrics({ paper, showStore, showCode, showName, showThreeLineName, showPrice, showOldPrice }: BarcodePrintFlags & { paper: PaperTemplate }) {
  const labelPaddingYmm = Math.max(0.5, Math.min(1.4, paper.labelHeightMm * 0.055));
  const labelPaddingXmm = Math.max(0.7, Math.min(2, paper.labelWidthMm * 0.045));
  const storeFontPx = Math.max(7, Math.min(10, paper.labelHeightMm * 0.38));
  const codeFontPx = Math.max(7, Math.min(10, paper.labelHeightMm * 0.34));
  const nameFontPx = Math.max(7, Math.min(10, paper.labelHeightMm * 0.36));
  const priceFontPx = Math.max(8, Math.min(13, paper.labelHeightMm * 0.48));
  const rowGapMm = 0.25;
  let textHeightMm = 0;
  let rowCount = 0;
  const addTextRow = (heightMm: number) => { textHeightMm += heightMm; rowCount += 1; };
  const compactText = paper.labelHeightMm < 22;
  if (showStore) addTextRow(storeFontPx * (compactText ? 0.82 : 1.2) * PX_TO_MM);
  if (showCode) addTextRow(codeFontPx * (compactText ? 0.78 : 1.1) * PX_TO_MM);
  if (showName) addTextRow(nameFontPx * (compactText ? (showThreeLineName ? 1.65 : 0.8) : (showThreeLineName ? 3.1 : 1.35)) * PX_TO_MM);
  if (showPrice) addTextRow(priceFontPx * (compactText ? 0.82 : 1.1) * PX_TO_MM);
  if (showOldPrice) addTextRow(Math.max(7, priceFontPx - 2) * (compactText ? 0.75 : 1.05) * PX_TO_MM);
  if (rowCount > 0) textHeightMm += rowCount * rowGapMm;
  return {
    labelPaddingYmm,
    labelPaddingXmm,
    storeFontPx,
    codeFontPx,
    nameFontPx,
    priceFontPx,
    rowGapMm,
    availableBarcodeWidthMm: Math.max(0, paper.labelWidthMm - labelPaddingXmm * 2),
    availableBarcodeHeightMm: Math.max(0, paper.labelHeightMm - labelPaddingYmm * 2 - textHeightMm),
  };
}

function getBarcodePhysicalSize(result: BarcodeBuildResult, paper: PaperTemplate, flags: BarcodePrintFlags) {
  const metrics = getLabelLayoutMetrics({ paper, ...flags });
  if (result.error || result.naturalWidth <= 0 || result.naturalHeight <= 0 || metrics.availableBarcodeWidthMm <= 0 || metrics.availableBarcodeHeightMm <= 0) {
    return { ...metrics, widthMm: 0, heightMm: 0, moduleWidthMm: 0, quietZoneMm: 0 };
  }
  const aspectRatio = result.aspectRatio || result.naturalWidth / result.naturalHeight;
  let widthMm = metrics.availableBarcodeWidthMm;
  let heightMm = widthMm / aspectRatio;
  if (heightMm > metrics.availableBarcodeHeightMm) {
    heightMm = metrics.availableBarcodeHeightMm;
    widthMm = heightMm * aspectRatio;
  }
  const moduleWidthMm = result.actualType === 'QRCODE' ? widthMm / Math.max(1, result.naturalWidth) : (BARCODE_RENDER_SCALE * widthMm) / result.naturalWidth;
  const quietZoneMm = result.actualType === 'QRCODE' ? moduleWidthMm * 4 : (BARCODE_QUIET_PADDING * BARCODE_RENDER_SCALE * widthMm) / result.naturalWidth;
  return { ...metrics, widthMm, heightMm, moduleWidthMm, quietZoneMm };
}

function getBarcodeDensityIssues(product: IProduct, result: BarcodeBuildResult, paper: PaperTemplate, flags: BarcodePrintFlags) {
  if (result.error) return [];
  const size = getBarcodePhysicalSize(result, paper, flags);
  const label = barcodeTypeLabel(result.actualType);
  const code = product.code || result.encodedValue;
  const issues: string[] = [];
  if (size.widthMm <= 0 || size.heightMm <= 0) {
    issues.push(`${code}: Không thể in an toàn: ${label} trên khổ ${paper.labelWidthMm}×${paper.labelHeightMm}mm không còn đủ vùng trống cho barcode sau khi hiển thị nội dung tem. Hãy chọn khổ lớn hơn hoặc ẩn bớt thông tin trên tem.`);
    return issues;
  }
  if (result.actualType !== 'QRCODE') {
    const minModuleMm = result.actualType === 'EAN13' ? 0.264 : result.actualType === 'C39' ? 0.23 : 0.21;
    const minHeightMm = result.actualType === 'EAN13' ? 4.6 : 4;
    if (size.moduleWidthMm < minModuleMm) issues.push(`${code}: Không thể in an toàn: ${label} trên khổ ${paper.labelWidthMm}×${paper.labelHeightMm}mm chỉ còn chiều rộng vạch ${size.moduleWidthMm.toFixed(3)}mm (cần tối thiểu ${minModuleMm.toFixed(3)}mm). Hãy chọn khổ lớn hơn, ẩn bớt thông tin trên tem hoặc dùng template phù hợp.`);
    if (size.heightMm < minHeightMm) issues.push(`${code}: Không thể in an toàn: ${label} chỉ còn cao ${size.heightMm.toFixed(1)}mm sau khi hiển thị nội dung chữ. Hãy chọn khổ cao hơn hoặc ẩn bớt tên/giá/shop.`);
    if (size.quietZoneMm < 1.5) issues.push(`${code}: Không thể in an toàn: quiet zone hai bên chỉ còn ${size.quietZoneMm.toFixed(1)}mm. Hãy chọn khổ lớn hơn hoặc giảm nội dung trên tem.`);
  }
  return issues;
}


function DeleteConfirm({
  product,
  onConfirm,
  onCancel,
}: {
  product: IProduct;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" style={{ maxWidth: 460 }} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ color: '#b91c1c' }}>Xác nhận xóa</h2>
            <p>Hành động này không thể hoàn tác.</p>
          </div>
          <button className="icon-button" onClick={onCancel} type="button">
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 18 }}>
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            Bạn có chắc muốn xóa sản phẩm <strong>{product.name}</strong> ({product.code}) không?
          </p>
        </div>

        <div className="modal-footer">
          <button className="btn btn-light" type="button" onClick={onCancel}>
            Hủy
          </button>
          <button
            className="btn btn-primary"
            type="button"
            style={{ background: '#ef4444', borderColor: '#ef4444' }}
            onClick={onConfirm}
          >
            <Trash2 size={16} />
            Xóa
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailModal({ product, onClose }: { product: IProduct; onClose: () => void }) {
  const rows: Array<[string, string]> = [
    ['Mã sản phẩm', product.code],
    ['Barcode', product.barcode || '—'],
    ['Loại', product.type || '—'],
    ['Danh mục', product.categoryName || '—'],
    ['Thương hiệu', product.trademarkName || '—'],
    ['Nhà cung cấp', product.supplierName || '—'],
    ['Đơn vị', product.unit || '—'],
    ['Giá vốn', formatMoney(product.cost)],
    ['Giá bán', formatMoney(product.price)],
    ['Giá bán lẻ', formatMoney(product.branchPrice)],
    ['Giá cũ', formatMoney(product.oldPrice)],
    ['Giá sỉ', formatMoney(product.wholesalePrice)],
    ['VAT (%)', String(product.vat ?? '—')],
    ['Tổng tồn', String(product.qty ?? 0)],
    ['Có thể bán', String(product.availableStock ?? 0)],
    ['Bảo hành (tháng)', String(product.warrantyMonths ?? '—')],
    ['Màu sắc', product.color || '—'],
    ['Kích cỡ', product.size || '—'],
    ['Xuất xứ', product.origin || '—'],
    ['Ngày tạo', new Date(product.createdAt).toLocaleDateString('vi-VN')],
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card modal-card-wide"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2>Chi tiết sản phẩm</h2>
            <p>{product.name}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 18 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <span className={`status-badge ${getStatusClass(product.status)}`}>{product.status || 'Mới'}</span>
          </div>

          <div className="form-grid">
            {rows.map(([label, value]) => (
              <div className="form-field" key={label}>
                <span>{label}</span>
                <div
                  style={{
                    padding: '10px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    background: '#f8fafc',
                    color: '#0f172a',
                  }}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-light" type="button" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

interface ProductFormProps {
  product?: IProduct | null;
  onSave: (data: ProductSavePayload) => void;
  onClose: () => void;
  saving: boolean;
  error?: string;
}

interface FieldErrors {
  code?: string;
  name?: string;
  barcode?: string;
  type?: string;
  unit?: string;
  price?: string;
  weight?: string;
  size?: string;
  color?: string;
  categoryId?: string;
  warehouses?: string;
  cost?: string;
  wholesalePrice?: string;
}

const PRODUCT_TYPE_OPTIONS = [
  { value: 'product', label: 'Sản phẩm' },
  { value: 'service', label: 'Dịch vụ' },
  { value: 'combo', label: 'Combo' },
];

const PRODUCT_UNIT_OPTIONS = [
  'cái', 'chiếc', 'hộp', 'lốc', 'thùng', 'kg', 'gram', 'g', 'lít', 'l', 'mét', 'm', 'cặp', 'đôi', 'set', 'gói', 'chai', 'lon', 'tuýp', 'túi',
];

function isValidNonNegativeNumber(value: string) {
  if (value.trim() === '') return true;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0;
}

function ProductForm({ product, onSave, onClose, saving, error }: ProductFormProps) {
  const isEdit = Boolean(product);
  const formRef = useRef<HTMLDivElement>(null);
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [form, setForm] = useState<Partial<IProduct>>(product ? { ...product } : { type: 'product', status: 'Mới' });
  const [categories, setCategories] = useState<ICategory[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [productStocks, setProductStocks] = useState<ProductWarehouseStock[]>([]);
  const [loadingStocks, setLoadingStocks] = useState(isEdit);
  const [warehouseQuantities, setWarehouseQuantities] = useState<Record<string, string>>({});
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState<Set<string>>(new Set());
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');

  useEffect(() => {
    let mounted = true;
    productApi
      .getCategories({ limit: 1000 })
      .then((response) => {
        if (mounted) setCategories(response.items || []);
      })
      .catch((loadError) => {
        console.error('Lỗi tải danh mục sản phẩm:', loadError);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoadingBranches(true);
    http
      .get('/system/branches', { params: { limit: 1000 } })
      .then((response) => {
        if (!mounted) return;
        const activeBranches: BranchOption[] = (response.data?.items || [])
          .filter((branch: BranchOption) => branch.isActive !== false);
        setBranches(activeBranches);
      })
      .catch((loadError) => {
        console.error('Lỗi tải kho hàng:', loadError);
        if (mounted) setFormError('Không tải được danh sách kho hàng.');
      })
      .finally(() => {
        if (mounted) setLoadingBranches(false);
      });

    if (product?._id) {
      setLoadingStocks(true);
      productApi
        .getProductStocks(product._id)
        .then((response) => {
          if (!mounted) return;
          const stocks = response.items || [];
          setProductStocks(stocks);
          const quantities: Record<string, string> = {};
          const ids = new Set<string>();
          stocks.forEach((stock) => {
            quantities[stock.warehouseId] = String(stock.quantity ?? 0);
            ids.add(stock.warehouseId);
          });
          setWarehouseQuantities(quantities);
          setSelectedWarehouseIds(ids);
        })
        .catch((loadError) => {
          console.error('Lỗi tải tồn kho sản phẩm:', loadError);
          if (mounted) setFormError('Không tải được tồn kho theo kho hàng.');
        })
        .finally(() => {
          if (mounted) setLoadingStocks(false);
        });
    } else {
      // Create mode: no warehouse pre-selected to force explicit selection.
      setWarehouseQuantities({});
      setSelectedWarehouseIds(new Set());
    }

    return () => {
      mounted = false;
    };
  }, [isEdit, product?._id]);

  const updateField = (key: keyof IProduct, value: string | number) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  };

  const toggleWarehouse = (warehouseId: string) => {
    setSelectedWarehouseIds((current) => {
      const next = new Set(current);
      if (next.has(warehouseId)) {
        if (next.size === 1) return current; // do not remove the last warehouse
        next.delete(warehouseId);
        setWarehouseQuantities((qty) => {
          const copy = { ...qty };
          delete copy[warehouseId];
          return copy;
        });
      } else {
        next.add(warehouseId);
        setWarehouseQuantities((qty) => ({ ...qty, [warehouseId]: qty[warehouseId] ?? '0' }));
      }
      setFieldErrors((errors) => ({ ...errors, warehouses: undefined }));
      return next;
    });
  };

  const setWarehouseQuantity = (warehouseId: string, value: string) => {
    if (!/^\d*$/.test(value)) return;
    setWarehouseQuantities((current) => ({ ...current, [warehouseId]: value }));
    setFieldErrors((errors) => ({ ...errors, warehouses: undefined }));
  };

  const validateForm = (): FieldErrors => {
    const errors: FieldErrors = {};

    if (!String(form.name ?? '').trim()) errors.name = 'Vui lòng nhập tên sản phẩm.';

    if (!String(form.type ?? '').trim()) errors.type = 'Vui lòng chọn loại sản phẩm.';
    if (!String(form.unit ?? '').trim()) errors.unit = 'Vui lòng chọn đơn vị.';

    const priceRaw = String(form.price ?? '').trim();
    if (priceRaw === '') errors.price = 'Vui lòng nhập giá bán hợp lệ.';
    else if (!isValidNonNegativeNumber(priceRaw)) errors.price = 'Vui lòng nhập giá bán hợp lệ.';

    const weightRaw = String(form.weight ?? '').trim();
    if (weightRaw === '') errors.weight = 'Khối lượng phải là số không âm.';
    else if (!isValidNonNegativeNumber(weightRaw)) errors.weight = 'Khối lượng phải là số không âm.';

    if (!String(form.size ?? '').trim()) errors.size = 'Vui lòng nhập kích cỡ.';
    if (!String(form.color ?? '').trim()) errors.color = 'Vui lòng nhập màu sắc.';
    if (!String(form.categoryId ?? '').trim()) errors.categoryId = 'Vui lòng chọn danh mục.';

    if (selectedWarehouseIds.size === 0) errors.warehouses = 'Vui lòng chọn ít nhất một kho hàng.';
    else {
      const invalidQty = Array.from(selectedWarehouseIds).find((id) => {
        const raw = String(warehouseQuantities[id] ?? '').trim();
        return raw === '' || !/^\d+$/.test(raw);
      });
      if (invalidQty) errors.warehouses = 'Số lượng tồn kho phải là số nguyên không âm.';
    }

    const costRaw = String(form.cost ?? '').trim();
    if (costRaw !== '' && !isValidNonNegativeNumber(costRaw)) errors.cost = 'Giá vốn phải là số không âm.';
    const wholesaleRaw = String(form.wholesalePrice ?? '').trim();
    if (wholesaleRaw !== '' && !isValidNonNegativeNumber(wholesaleRaw)) errors.wholesalePrice = 'Giá sỉ phải là số không âm.';

    return errors;
  };

  const focusFirstError = (errors: FieldErrors) => {
    const order: (keyof FieldErrors)[] = ['name', 'type', 'unit', 'price', 'weight', 'size', 'color', 'categoryId', 'warehouses', 'cost', 'wholesalePrice'];
    const firstKey = order.find((key) => errors[key]);
    if (firstKey && fieldRefs.current[firstKey]) {
      fieldRefs.current[firstKey]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const input = fieldRefs.current[firstKey]?.querySelector('input, select');
      if (input) (input as HTMLInputElement).focus({ preventScroll: true });
    }
  };

  const handleSubmit = () => {
    const errors = validateForm();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      const firstMessage = Object.values(errors).find(Boolean) as string;
      setFormError(firstMessage);
      focusFirstError(errors);
      return;
    }
    setFormError('');

    const trimmedName = String(form.name ?? '').trim();
    const trimmedSize = String(form.size ?? '').trim();
    const trimmedColor = String(form.color ?? '').trim();
    const trimmedUnit = String(form.unit ?? '').trim();

    const payload: ProductSavePayload = {
      ...form,
      name: trimmedName,
      size: trimmedSize,
      color: trimmedColor,
      unit: trimmedUnit,
      cost: form.cost === undefined || form.cost === null || String(form.cost).trim() === '' ? 0 : Number(form.cost),
      wholesalePrice: form.wholesalePrice === undefined || form.wholesalePrice === null || String(form.wholesalePrice).trim() === '' ? 0 : Number(form.wholesalePrice),
      price: Number(form.price),
      weight: Number(form.weight),
    };
    delete payload.trademarkName;
    delete payload.supplierName;
    delete payload.qty;
    delete payload.availableStock;
    delete payload.code;
    delete payload.barcode;

    if (!isEdit) {
      payload.initialStocks = Array.from(selectedWarehouseIds).map((warehouseId) => ({
        warehouseId,
        quantity: Number(warehouseQuantities[warehouseId] || 0),
      }));
    } else {
      payload.initialStocks = Array.from(selectedWarehouseIds).map((warehouseId) => ({
        warehouseId,
        quantity: Number(warehouseQuantities[warehouseId] ?? 0),
      }));
      // Send only warehouse lines the user actually changed to preserve untouched stock rows.
      const changedLines = (payload.initialStocks || []).filter((line) => {
        const existing = productStocks.find((stock) => stock.warehouseId === line.warehouseId);
        return !existing || existing.quantity !== line.quantity;
      });
      if (changedLines.length) {
        payload.initialStocks = changedLines;
      } else {
        delete payload.initialStocks;
      }
    }

    onSave(payload);
  };

  const setFieldRef = (key: keyof FieldErrors) => (node: HTMLDivElement | null) => {
    fieldRefs.current[key] = node;
  };

  const selectedStocks = Array.from(selectedWarehouseIds).map((id) => {
    const branch = branches.find((item) => item._id === id);
    const stock = productStocks.find((item) => item.warehouseId === id);
    return {
      warehouseId: id,
      name: stock?.warehouseName || branch?.name || id,
      code: stock?.warehouseCode || branch?.code,
      quantity: warehouseQuantities[id] ?? '0',
      existing: stock?.quantity ?? null,
    };
  });

  const availableBranches = branches.filter((branch) => !selectedWarehouseIds.has(branch._id));
  const totalStock = selectedStocks.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card modal-card-wide"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(event) => event.stopPropagation()}
        ref={formRef}
      >
        <div className="modal-header">
          <div>
            <h2>{isEdit ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}</h2>
            <p>{isEdit ? `Đang cập nhật: ${product?.name}` : 'Điền thông tin để tạo sản phẩm mới.'}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {error || formError ? <div className="form-error">{formError || error}</div> : null}

        <div className="form-grid" style={{ position: 'relative' }}>
          <div className="form-field" ref={setFieldRef('code')}>
            <span>Mã sản phẩm</span>
            <input
              type="text"
              value={isEdit ? String(form.code ?? '') : 'Tự động tạo khi lưu'}
              className={fieldErrors.code ? 'input-error' : ''}
              disabled
            />
            {fieldErrors.code ? <span className="field-error-text">{fieldErrors.code}</span> : null}
          </div>

          <div className="form-field" ref={setFieldRef('name')}>
            <span>Tên sản phẩm *</span>
            <input
              type="text"
              value={String(form.name ?? '')}
              className={fieldErrors.name ? 'input-error' : ''}
              onChange={(event) => updateField('name', event.target.value)}
            />
            {fieldErrors.name ? <span className="field-error-text">{fieldErrors.name}</span> : null}
          </div>

          <div className="form-field" ref={setFieldRef('barcode')}>
            <span>Mã vạch</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={isEdit ? String(form.barcode ?? '') : 'Tự động tạo khi lưu'}
              className={fieldErrors.barcode ? 'input-error' : ''}
              disabled
            />
            {fieldErrors.barcode ? <span className="field-error-text">{fieldErrors.barcode}</span> : null}
          </div>

          <div className="form-field" ref={setFieldRef('type')}>
            <span>Loại sản phẩm *</span>
            <select
              value={String(form.type ?? '')}
              className={fieldErrors.type ? 'input-error' : ''}
              onChange={(event) => updateField('type', event.target.value)}
            >
              <option value="">-- Chọn loại sản phẩm --</option>
              {PRODUCT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            {fieldErrors.type ? <span className="field-error-text">{fieldErrors.type}</span> : null}
          </div>

          <div className="form-field" ref={setFieldRef('unit')}>
            <span>Đơn vị *</span>
            <select
              value={String(form.unit ?? '')}
              className={fieldErrors.unit ? 'input-error' : ''}
              onChange={(event) => updateField('unit', event.target.value)}
            >
              <option value="">-- Chọn đơn vị --</option>
              {PRODUCT_UNIT_OPTIONS.map((unit) => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>
            {fieldErrors.unit ? <span className="field-error-text">{fieldErrors.unit}</span> : null}
          </div>

          <div className="form-field" ref={setFieldRef('categoryId')}>
            <span>Danh mục *</span>
            <select
              value={String(form.categoryId ?? '')}
              className={fieldErrors.categoryId ? 'input-error' : ''}
              onChange={(event) => {
                const selectedId = event.target.value;
                const matchedCategory = categories.find((category) => category._id === selectedId);
                setForm((current) => ({
                  ...current,
                  categoryId: selectedId || undefined,
                  categoryName: matchedCategory?.name || '',
                }));
                setFieldErrors((current) => ({ ...current, categoryId: undefined }));
              }}
            >
              <option value="">-- Chọn danh mục --</option>
              {categories.map((category) => (
                <option key={category._id} value={category._id}>{category.name}</option>
              ))}
            </select>
            {fieldErrors.categoryId ? <span className="field-error-text">{fieldErrors.categoryId}</span> : null}
          </div>

          <div className="form-field" ref={setFieldRef('price')}>
            <span>Giá bán *</span>
            <input
              type="number"
              min={0}
              step="any"
              value={String(form.price ?? '')}
              className={fieldErrors.price ? 'input-error' : ''}
              onChange={(event) => updateField('price', event.target.value)}
            />
            {fieldErrors.price ? <span className="field-error-text">{fieldErrors.price}</span> : null}
          </div>

          <div className="form-field" ref={setFieldRef('weight')}>
            <span>Khối lượng (g) *</span>
            <input
              type="number"
              min={0}
              step="any"
              value={String(form.weight ?? '')}
              className={fieldErrors.weight ? 'input-error' : ''}
              onChange={(event) => updateField('weight', event.target.value)}
            />
            {fieldErrors.weight ? <span className="field-error-text">{fieldErrors.weight}</span> : null}
          </div>

          <div className="form-field" ref={setFieldRef('size')}>
            <span>Kích cỡ *</span>
            <input
              type="text"
              value={String(form.size ?? '')}
              className={fieldErrors.size ? 'input-error' : ''}
              onChange={(event) => updateField('size', event.target.value)}
            />
            {fieldErrors.size ? <span className="field-error-text">{fieldErrors.size}</span> : null}
          </div>

          <div className="form-field" ref={setFieldRef('color')}>
            <span>Màu sắc *</span>
            <input
              type="text"
              value={String(form.color ?? '')}
              className={fieldErrors.color ? 'input-error' : ''}
              onChange={(event) => updateField('color', event.target.value)}
            />
            {fieldErrors.color ? <span className="field-error-text">{fieldErrors.color}</span> : null}
          </div>

          <div className="form-field">
            <span>Giá vốn</span>
            <input
              type="number"
              min={0}
              step="any"
              value={String(form.cost ?? '')}
              placeholder="0"
              className={fieldErrors.cost ? 'input-error' : ''}
              onChange={(event) => updateField('cost', event.target.value)}
            />
            {fieldErrors.cost ? <span className="field-error-text">{fieldErrors.cost}</span> : null}
          </div>

          <div className="form-field">
            <span>Giá sỉ</span>
            <input
              type="number"
              min={0}
              step="any"
              value={String(form.wholesalePrice ?? '')}
              placeholder="0"
              className={fieldErrors.wholesalePrice ? 'input-error' : ''}
              onChange={(event) => updateField('wholesalePrice', event.target.value)}
            />
            {fieldErrors.wholesalePrice ? <span className="field-error-text">{fieldErrors.wholesalePrice}</span> : null}
          </div>

          <div className="form-field">
            <span>Trạng thái</span>
            <select
              value={String(form.status ?? 'Mới')}
              onChange={(event) => updateField('status', event.target.value)}
            >
              <option value="Mới">Mới</option>
              <option value="Đang giao">Đang giao</option>
              <option value="Ngừng">Ngừng</option>
            </select>
          </div>

          <div className="form-field">
            <span>VAT (%)</span>
            <input
              type="number"
              min={0}
              value={String(form.vat ?? '')}
              onChange={(event) => updateField('vat', Number(event.target.value))}
            />
          </div>

          <div className="form-field">
            <span>Bảo hành (tháng)</span>
            <input
              type="number"
              min={0}
              value={String(form.warrantyMonths ?? '')}
              onChange={(event) => updateField('warrantyMonths', Number(event.target.value))}
            />
          </div>

          <div className="form-field">
            <span>Xuất xứ</span>
            <input
              type="text"
              value={String(form.origin ?? '')}
              onChange={(event) => updateField('origin', event.target.value)}
            />
          </div>

          <section className="products-warehouse-panel" ref={setFieldRef('warehouses')}>
            <div className="products-warehouse-head">
              <strong>Kho hàng và tồn kho *</strong>
              <p>
                Đã chọn {selectedStocks.length} kho · Tổng tồn: <strong>{totalStock.toLocaleString('vi-VN')}</strong>
              </p>
            </div>

            {fieldErrors.warehouses ? <span className="field-error-text">{fieldErrors.warehouses}</span> : null}

            <div className="products-warehouse-add">
              <select
                aria-label="Thêm kho hàng"
                value=""
                disabled={loadingBranches || availableBranches.length === 0}
                onChange={(event) => {
                  const id = event.target.value;
                  if (id) toggleWarehouse(id);
                  event.target.value = '';
                }}
              >
                <option value="">{loadingBranches ? 'Đang tải kho hàng...' : availableBranches.length ? '-- Thêm kho hàng --' : 'Đã chọn hết kho đang hoạt động'}</option>
                {availableBranches.map((branch) => (
                  <option key={branch._id} value={branch._id}>{branch.name}{branch.code ? ` (${branch.code})` : ''}</option>
                ))}
              </select>
            </div>

            {selectedStocks.length > 0 ? (
              <div className="products-warehouse-table">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Kho hàng</th>
                      <th style={{ width: 220 }}>Số lượng tồn *</th>
                      {isEdit ? <th style={{ width: 120 }}>Tồn hiện tại</th> : null}
                      <th style={{ width: 80 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedStocks.map((row) => (
                      <tr key={row.warehouseId}>
                        <td>{row.name}{row.code ? ` (${row.code})` : ''}</td>
                        <td>
                          <input
                            aria-label={`Số lượng tồn ${row.name}`}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={row.quantity}
                            className={fieldErrors.warehouses && (String(row.quantity).trim() === '' || !/^\d+$/.test(String(row.quantity).trim())) ? 'input-error' : ''}
                            onChange={(event) => setWarehouseQuantity(row.warehouseId, event.target.value)}
                          />
                        </td>
                        {isEdit ? <td>{row.existing !== null ? row.existing.toLocaleString('vi-VN') : '—'}</td> : null}
                        <td>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Bỏ kho ${row.name}`}
                            title="Bỏ kho hàng"
                            disabled={selectedStocks.length === 1}
                            onClick={() => toggleWarehouse(row.warehouseId)}
                          >
                            <X size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="products-warehouse-empty">Chưa chọn kho hàng nào. Vui lòng thêm ít nhất một kho.</p>
            )}
          </section>
        </div>

        <div className="modal-footer">
          <button className="btn btn-light" type="button" onClick={onClose} disabled={saving}>
            Hủy
          </button>
          <button className="btn btn-primary" type="button" onClick={handleSubmit} disabled={saving || loadingBranches || loadingStocks}>
            {saving ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Tạo sản phẩm'}
          </button>
        </div>
      </div>
    </div>
  );
}


function ImportModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (result: {
    created: number;
    updated: number;
    skipped: number;
    stockAdded: number;
    errors?: string[];
    voucherId?: string | null;
  }) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [importMode, setImportMode] = useState<'Thêm mới' | 'Cập nhật thông tin'>('Thêm mới');
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [loadingBranches, setLoadingBranches] = useState(true);

  useEffect(() => {
    let mounted = true;

    http
      .get('/system/branches', { params: { limit: 1000 } })
      .then((response) => {
        if (!mounted) return;

        const items = response.data?.items || [];
        setBranches(items);

        const defaultBranch = items[0];
        setSelectedBranchId(defaultBranch?._id || '');
      })
      .catch((error) => {
        console.error('Lỗi tải kho hàng:', error);
        if (mounted) {
          setMessage('Không tải được danh sách kho hàng.');
        }
      })
      .finally(() => {
        if (mounted) {
          setLoadingBranches(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const selectedBranch = branches.find((branch) => branch._id === selectedBranchId);

  const downloadSampleCsv = () => {
    const headers = [
      'Tên sản phẩm',
      'Đơn vị tính',
      'Giá nhập',
      'Giá bán',
      'Giá sỉ',
      'Tồn trong kho',
      'Danh mục',
      'Thương hiệu',
      'Nhà cung cấp',
      'Màu sắc',
      'Kích thước',
      'Trạng thái',
    ];
    const rows = [
      ['Áo thun nữ basic', 'Cái', '120000', '199000', '180000', '10', 'Áo nữ', 'Lady Stars', 'Nhà cung cấp A', 'Trắng', 'M', 'Mới'],
    ];
    const escapeCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map((row) => row.map(escapeCell).join(';')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mau-import-san-pham.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!file) {
      setMessage('Vui lòng chọn file Excel để nhập.');
      return;
    }

    if (!selectedBranch) {
      setMessage('Vui lòng chọn kho nhập.');
      return;
    }

    setLoading(true);
    setMessage('Đang xử lý file import...');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('warehouse', selectedBranch.name);
    formData.append('branchId', selectedBranch._id);
    if (selectedBranch.code) {
      formData.append('branchCode', selectedBranch.code);
    }
    formData.append('importMode', importMode);

    try {
      const response = await http.post('/products/products/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setMessage('Nhập dữ liệu thành công.');
      window.setTimeout(() => {
        onSuccess(response.data.summary);
      }, 300);
    } catch (error: any) {
      setMessage(error.response?.data?.message || 'Có lỗi khi nhập file.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 620 }} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Nhập dữ liệu sản phẩm</h2>
            <p>Nhập file Excel để thêm mới hoặc cập nhật danh sách sản phẩm.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} disabled={loading}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-grid" style={{ padding: 0, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <div className="form-field">
              <span>Kho hàng nhập tồn *</span>
              <select
                value={selectedBranchId}
                onChange={(event) => setSelectedBranchId(event.target.value)}
                disabled={loadingBranches || loading}
              >
                {loadingBranches ? <option value="">Đang tải kho hàng...</option> : null}
                {!loadingBranches && branches.length === 0 ? <option value="">Không có kho hàng</option> : null}
                {branches.map((branch) => (
                  <option key={branch._id} value={branch._id}>
                    {branch.name}
                    {branch.code ? ` (${branch.code})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <span>Chế độ với dòng trùng mã</span>
              <select
                value={importMode}
                onChange={(event) => setImportMode(event.target.value as 'Thêm mới' | 'Cập nhật thông tin')}
                disabled={loading}
              >
                <option value="Thêm mới">Thêm mới (bỏ qua dòng trùng)</option>
                <option value="Cập nhật thông tin">Cập nhật thông tin (sửa dữ liệu và cộng tồn)</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!loading) {
                fileInputRef.current?.click();
              }
            }}
            style={{
              border: '2px dashed var(--border)',
              borderRadius: 18,
              padding: '34px 20px',
              background: '#f8fafc',
              color: '#475569',
              display: 'grid',
              gap: 10,
              placeItems: 'center',
            }}
          >
            <UploadCloud size={34} />
            <strong>{file ? file.name : 'Chọn file Excel (.xlsx, .xls, .csv)'}</strong>
            <span style={{ fontSize: 13 }}>Nhấn để chọn file cần import</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />

          {message ? (
            <p
              style={{
                margin: 0,
                color: message.toLowerCase().includes('lỗi') || message.toLowerCase().includes('không') ? '#b91c1c' : '#047857',
                fontWeight: 700,
              }}
            >
              {message}
            </p>
          ) : null}

          <div className="products-note-card" style={{ boxShadow: 'none', display: 'grid', gap: 10 }}>
            <strong>File import mẫu</strong>
            <span style={{ color: '#64748b', fontSize: 13 }}>
              Tải file CSV mẫu, điền dữ liệu sản phẩm theo đúng cột; mã sản phẩm và mã vạch sẽ được tự động tạo khi import.
            </span>
            <button className="btn btn-light" type="button" onClick={downloadSampleCsv} disabled={loading} style={{ justifySelf: 'flex-start' }}>
              <Download size={16} />
              Tải file mẫu CSV
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-light" type="button" onClick={onClose} disabled={loading}>
            Hủy
          </button>
          <button className="btn btn-primary" type="button" onClick={handleImport} disabled={loading || !file}>
            <FileUp size={16} />
            {loading ? 'Đang xử lý...' : 'Upload và nhập'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkStatusModal({
  selectedCount,
  statusOptions,
  loading,
  onClose,
  onApply,
}: {
  selectedCount: number;
  statusOptions: string[];
  loading: boolean;
  onClose: () => void;
  onApply: (status: string) => void;
}) {
  const [status, setStatus] = useState(statusOptions[0] || 'Mới');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card products-bulk-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Sửa trạng thái sản phẩm</h2>
            <p>Áp dụng cho {selectedCount.toLocaleString('vi-VN')} sản phẩm đã chọn.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} disabled={loading}>
            <X size={18} />
          </button>
        </div>
        <div className="products-modal-body">
          <label className="form-field">
            <span>Trạng thái bán</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)} disabled={loading}>
              {statusOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="modal-footer">
          <button className="btn btn-light" type="button" onClick={onClose} disabled={loading}>Hủy</button>
          <button className="btn btn-primary" type="button" onClick={() => onApply(status)} disabled={loading || !status}>
            {loading ? 'Đang cập nhật...' : 'Cập nhật'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkCategoryModal({
  selectedCount,
  categories,
  loading,
  onClose,
  onApply,
}: {
  selectedCount: number;
  categories: ICategory[];
  loading: boolean;
  onClose: () => void;
  onApply: (category: ICategory) => void;
}) {
  const [categoryId, setCategoryId] = useState('');
  const selectedCategory = categories.find((category) => category._id === categoryId);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card products-bulk-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Cập nhật danh mục</h2>
            <p>Áp dụng cho {selectedCount.toLocaleString('vi-VN')} sản phẩm đã chọn.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} disabled={loading}>
            <X size={18} />
          </button>
        </div>
        <div className="products-modal-body">
          <label className="form-field">
            <span>Danh mục</span>
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={loading}>
              <option value="">Chọn danh mục</option>
              {categories.map((category) => (
                <option key={category._id} value={category._id}>{category.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="modal-footer">
          <button className="btn btn-light" type="button" onClick={onClose} disabled={loading}>Hủy</button>
          <button className="btn btn-primary" type="button" onClick={() => selectedCategory && onApply(selectedCategory)} disabled={loading || !selectedCategory}>
            {loading ? 'Đang cập nhật...' : 'Cập nhật'}
          </button>
        </div>
      </div>
    </div>
  );
}

function getBarcodePrintIssues(rows: Array<{ product: IProduct; qty: number }>, barcodeType: BarcodeType) {
  return rows
    .map((row) => {
      const value = normalizeBarcodeValue(row.product);
      const result = buildBarcodeResult(value, barcodeType);
      return result.error ? `${row.product.code || value}: ${result.error}` : '';
    })
    .filter(Boolean);
}

function buildPrintDocument({
  rows, barcodeType, paper, marginLeft, marginTop, showStore, storeName, showCode, showName, showThreeLineName, showPrice, showOldPrice, currencySuffix,
}: {
  rows: Array<{ product: IProduct; qty: number }>; barcodeType: BarcodeType; paper: PaperTemplate; marginLeft: number; marginTop: number; showStore: boolean; storeName: string; showCode: boolean; showName: boolean; showThreeLineName: boolean; showPrice: boolean; showOldPrice: boolean; currencySuffix: string;
}) {
  const labels = rows.flatMap((row) => Array.from({ length: Math.max(1, row.qty) }, () => row.product));
  const gapXmm = paper.gapXmm ?? 0;
  const gapYmm = paper.gapYmm ?? 0;
  const gridWidthMm = paper.columns * paper.labelWidthMm + Math.max(0, paper.columns - 1) * gapXmm;
  const gridHeightMm = (paper.rows ?? 1) * paper.labelHeightMm + Math.max(0, (paper.rows ?? 1) - 1) * gapYmm;
  const safeMarginLeft = Math.min(Math.max(0, marginLeft), Math.max(0, paper.pageWidthMm - gridWidthMm));
  const safeMarginTop = Math.min(Math.max(0, marginTop), Math.max(0, paper.pageHeightMm - gridHeightMm));
  const metrics = getLabelLayoutMetrics({ paper, showStore, showCode, showName, showThreeLineName, showPrice, showOldPrice });
  const safeCurrencySuffix = escapeHtml(currencySuffix);
  const labelsPerPage = Math.max(1, paper.columns * (paper.rows ?? 1));
  const pageChunks: IProduct[][] = [];
  for (let index = 0; index < labels.length; index += labelsPerPage) pageChunks.push(labels.slice(index, index + labelsPerPage));
  const flags = { showStore, showCode, showName, showThreeLineName, showPrice, showOldPrice };
  const renderLabel = (product: IProduct) => {
    const value = normalizeBarcodeValue(product);
    const barcode = buildBarcodeResult(value, barcodeType);
    const size = getBarcodePhysicalSize(barcode, paper, flags);
    return `<article class="print-label" data-label-width-mm="${paper.labelWidthMm}" data-label-height-mm="${paper.labelHeightMm}" data-barcode-actual-type="${barcode.actualType}" data-barcode-width-mm="${size.widthMm.toFixed(2)}" data-barcode-height-mm="${size.heightMm.toFixed(2)}" data-module-width-mm="${size.moduleWidthMm.toFixed(3)}">
      ${showStore && storeName.trim() ? `<div class="print-store">${escapeHtml(storeName)}</div>` : ''}
      <div class="print-barcode" style="--barcode-width-mm:${size.widthMm.toFixed(2)}mm;--barcode-height-mm:${size.heightMm.toFixed(2)}mm">${barcode.svg}</div>
      ${showCode ? `<div class="print-code">${escapeHtml(barcode.encodedValue)}</div>` : ''}
      ${showName ? `<div class="print-name${showThreeLineName ? ' three' : ''}">${escapeHtml(product.name)}</div>` : ''}
      ${showPrice ? `<div class="print-price">${Number(product.price || 0).toLocaleString('vi-VN')} ${safeCurrencySuffix}</div>` : ''}
      ${showOldPrice && product.oldPrice ? `<div class="print-old-price">${Number(product.oldPrice || 0).toLocaleString('vi-VN')} ${safeCurrencySuffix}</div>` : ''}
    </article>`;
  };
  const pagesHtml = pageChunks.map((chunk, pageIndex) => `<main class="print-page" data-page-index="${pageIndex + 1}" data-page-width-mm="${paper.pageWidthMm}" data-page-height-mm="${paper.pageHeightMm}"><section class="sheet">${chunk.map(renderLabel).join('')}</section></main>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>In mã vạch sản phẩm</title>
    <style>
      @page { size: ${paper.pageWidthMm}mm ${paper.pageHeightMm}mm; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #fff; font-family: Arial, sans-serif; color: #111827; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .print-page { width: ${paper.pageWidthMm}mm; height: ${paper.pageHeightMm}mm; padding: ${safeMarginTop}mm 0 0 ${safeMarginLeft}mm; overflow: hidden; break-after: page; page-break-after: always; background: #fff; }
      .print-page:last-child { break-after: auto; page-break-after: auto; }
      .sheet { display: grid; grid-template-columns: repeat(${paper.columns}, ${paper.labelWidthMm}mm); grid-auto-rows: ${paper.labelHeightMm}mm; column-gap: ${gapXmm}mm; row-gap: ${gapYmm}mm; align-content: start; justify-content: start; }
      .print-label { width: ${paper.labelWidthMm}mm; height: ${paper.labelHeightMm}mm; padding: ${metrics.labelPaddingYmm}mm ${metrics.labelPaddingXmm}mm; overflow: hidden; text-align: center; break-inside: avoid; page-break-inside: avoid; display: grid; grid-template-rows: auto minmax(0, 1fr) auto auto auto auto; row-gap: ${metrics.rowGapMm}mm; align-items: center; background: #fff; }
      .print-store { min-height: 1.2em; font-size: ${metrics.storeFontPx}px; font-weight: 800; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .print-barcode { min-width: 0; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: visible; background: #fff; }
      .print-barcode .barcode-svg { width: var(--barcode-width-mm); height: var(--barcode-height-mm); max-width: 100%; max-height: 100%; display: block; fill: #000; background: #fff; }
      .print-barcode .barcode-svg path { stroke: #000; }
      .print-barcode .barcode-svg-error { display: block; color: #b91c1c; font-size: 8px; line-height: 1.1; }
      .print-code { font-size: ${metrics.codeFontPx}px; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .print-name { font-size: ${metrics.nameFontPx}px; line-height: 1.05; max-height: ${showThreeLineName ? Math.max(9, paper.labelHeightMm * 0.28) : Math.max(5, paper.labelHeightMm * 0.16)}mm; overflow: hidden; }
      .print-name.three { max-height: ${Math.max(9, paper.labelHeightMm * 0.32)}mm; }
      .print-price { font-size: ${metrics.priceFontPx}px; font-weight: 900; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .print-old-price { font-size: ${Math.max(7, metrics.priceFontPx - 2)}px; text-decoration: line-through; color: #6b7280; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      @media print { html, body { width: ${paper.pageWidthMm}mm; } .print-page { margin: 0; } }
    </style></head><body>${pagesHtml}</body></html>`;
}

type BarcodePrintSettings = {
  settingsVersion: 2;
  barcodeType: BarcodeType;
  paperId: string;
  showStore: boolean;
  storeName: string;
  showCode: boolean;
  showName: boolean;
  showThreeLineName: boolean;
  showPrice: boolean;
  showOldPrice: boolean;
  currencySuffix: string;
  marginLeft: number;
  marginTop: number;
  recentPaperIds: string[];
};

const BARCODE_SETTINGS_KEY = 'barcodePrintSettings';
const BARCODE_RECENT_PAPER_LIMIT = 3;
const BARCODE_RECENT_PAPER_HISTORY = 8;

function normalizeBarcodePrintSettings(parsed: unknown): Partial<BarcodePrintSettings> {
  if (!parsed || typeof parsed !== 'object') return {};
  const source = parsed as Record<string, unknown>;
  const validTypes: BarcodeType[] = ['AUTO', 'EAN13', 'C128', 'C39', 'C128A', 'QRCODE'];
  const legacyMigration = source.settingsVersion !== 2;
  const rawType = typeof source.barcodeType === 'string' && validTypes.includes(source.barcodeType as BarcodeType)
    ? source.barcodeType as BarcodeType
    : 'AUTO';
  const barcodeType = legacyMigration && rawType === 'C39' ? 'AUTO' : rawType;
  const recentPaperIds = Array.isArray(source.recentPaperIds)
    ? source.recentPaperIds.filter((id): id is string => typeof id === 'string' && PAPER_TEMPLATES.some((paper) => paper.id === id))
    : undefined;
  return {
    settingsVersion: 2,
    barcodeType,
    paperId: typeof source.paperId === 'string' && PAPER_TEMPLATES.some((paper) => paper.id === source.paperId) ? source.paperId : undefined,
    showStore: typeof source.showStore === 'boolean' ? source.showStore : undefined,
    storeName: typeof source.storeName === 'string' ? source.storeName : undefined,
    showCode: typeof source.showCode === 'boolean' ? source.showCode : undefined,
    showName: typeof source.showName === 'boolean' ? source.showName : undefined,
    showThreeLineName: typeof source.showThreeLineName === 'boolean' ? source.showThreeLineName : undefined,
    showPrice: typeof source.showPrice === 'boolean' ? source.showPrice : undefined,
    showOldPrice: typeof source.showOldPrice === 'boolean' ? source.showOldPrice : undefined,
    currencySuffix: typeof source.currencySuffix === 'string' ? source.currencySuffix : undefined,
    marginLeft: typeof source.marginLeft === 'number' && Number.isFinite(source.marginLeft) ? source.marginLeft : undefined,
    marginTop: typeof source.marginTop === 'number' && Number.isFinite(source.marginTop) ? source.marginTop : undefined,
    recentPaperIds,
  };
}

function loadBarcodePrintSettings(): Partial<BarcodePrintSettings> {
  try {
    const raw = window.localStorage.getItem(BARCODE_SETTINGS_KEY);
    if (!raw) return {};
    return normalizeBarcodePrintSettings(JSON.parse(raw));
  } catch {
    return {};
  }
}

function buildRecentPaperIds(history: string[], paperId: string): string[] {
  return [paperId, ...history.filter((id) => id !== paperId)].slice(0, BARCODE_RECENT_PAPER_HISTORY);
}

function BarcodePrintWorkspace({
  products,
  onBack,
  onClearSelection,
}: {
  products: IProduct[];
  onBack: () => void;
  onClearSelection: () => void;
}) {
  const savedSettings = useMemo(() => loadBarcodePrintSettings(), []);
  const [rows, setRows] = useState(() => products.map((product) => ({ product, qty: 1 })));
  const [barcodeType, setBarcodeType] = useState<BarcodeType>(savedSettings.barcodeType ?? 'AUTO');
  const [paperId, setPaperId] = useState<string>(() => {
    const id = savedSettings.paperId;
    return id && PAPER_TEMPLATES.some((paper) => paper.id === id) ? id : DEFAULT_BARCODE_PAPER_ID;
  });
  const [recentPaperIds, setRecentPaperIds] = useState<string[]>(() => {
    const list = Array.isArray(savedSettings.recentPaperIds) ? savedSettings.recentPaperIds : [];
    return list.filter((id) => PAPER_TEMPLATES.some((paper) => paper.id === id));
  });
  const [showAllPapers, setShowAllPapers] = useState(false);
  const [showStore, setShowStore] = useState(savedSettings.showStore ?? true);
  const [storeName, setStoreName] = useState(typeof savedSettings.storeName === 'string' ? savedSettings.storeName : '');
  const [loadingStoreName, setLoadingStoreName] = useState(!('storeName' in savedSettings));
  const [showCode, setShowCode] = useState(savedSettings.showCode ?? false);
  const [showName, setShowName] = useState(savedSettings.showName ?? true);
  const [showPrice, setShowPrice] = useState(savedSettings.showPrice ?? true);
  const [showOldPrice, setShowOldPrice] = useState(savedSettings.showOldPrice ?? false);
  const [showThreeLineName, setShowThreeLineName] = useState(savedSettings.showThreeLineName ?? false);
  const [currencySuffix, setCurrencySuffix] = useState(typeof savedSettings.currencySuffix === 'string' && savedSettings.currencySuffix.length > 0 ? savedSettings.currencySuffix : 'đ');
  const [marginLeft, setMarginLeft] = useState(typeof savedSettings.marginLeft === 'number' && Number.isFinite(savedSettings.marginLeft) ? savedSettings.marginLeft : 0);
  const [marginTop, setMarginTop] = useState(typeof savedSettings.marginTop === 'number' && Number.isFinite(savedSettings.marginTop) ? savedSettings.marginTop : 0);
  const [barcodeSearch, setBarcodeSearch] = useState('');
  const barcodeSearchRef = useRef<HTMLInputElement>(null);
  const [barcodeSearchResults, setBarcodeSearchResults] = useState<IProduct[]>([]);
  const [barcodeSearchLoading, setBarcodeSearchLoading] = useState(false);
  const [barcodeSearchError, setBarcodeSearchError] = useState('');
  const [barcodeSearchOpen, setBarcodeSearchOpen] = useState(false);
  const [openPrintAction, setOpenPrintAction] = useState(false);
  const barcodeSearchRequestRef = useRef(0);
  const barcodeSearchBlurTimerRef = useRef<number | null>(null);
  const printingRef = useRef(false);
  const selectedPaper = PAPER_TEMPLATES.find((paper) => paper.id === paperId)
    || PAPER_TEMPLATES.find((paper) => paper.id === DEFAULT_BARCODE_PAPER_ID)
    || PAPER_TEMPLATES[0];
  const recentPapers = useMemo(() => recentPaperIds
    .map((id) => PAPER_TEMPLATES.find((paper) => paper.id === id))
    .filter((paper): paper is PaperTemplate => Boolean(paper))
    .slice(0, BARCODE_RECENT_PAPER_LIMIT), [recentPaperIds]);

  const visiblePapers = useMemo(() => {
    if (showAllPapers) return PAPER_TEMPLATES;
    const list: PaperTemplate[] = [];
    const selected = PAPER_TEMPLATES.find((paper) => paper.id === paperId) || selectedPaper;
    if (selected) list.push(selected);
    for (const paper of recentPapers) {
      if (list.length >= BARCODE_RECENT_PAPER_LIMIT) break;
      if (!list.some((entry) => entry.id === paper.id)) list.push(paper);
    }
    for (const paper of PAPER_TEMPLATES) {
      if (list.length >= BARCODE_RECENT_PAPER_LIMIT) break;
      if (!list.some((entry) => entry.id === paper.id)) list.push(paper);
    }
    return list;
  }, [showAllPapers, recentPapers, paperId, selectedPaper]);
  const previewProduct = rows[0]?.product || products[0];
  const previewBarcodeValue = previewProduct ? normalizeBarcodeValue(previewProduct) : '';
  const previewBarcodeResult = buildBarcodeResult(previewBarcodeValue, barcodeType);
  const printFlags = { showStore, showCode, showName, showThreeLineName, showPrice, showOldPrice };
  const previewDensityIssues: string[] = [];
  const rowIds = useMemo(() => new Set(rows.map((row) => row.product._id)), [rows]);

  const selectPaper = (id: string) => {
    setPaperId(id);
    setRecentPaperIds((current) => buildRecentPaperIds(current, id));
  };

  useEffect(() => {
    const next: BarcodePrintSettings = {
      settingsVersion: 2,
      barcodeType,
      paperId,
      showStore,
      storeName,
      showCode,
      showName,
      showThreeLineName,
      showPrice,
      showOldPrice,
      currencySuffix,
      marginLeft,
      marginTop,
      recentPaperIds,
    };
    try {
      window.localStorage.setItem(BARCODE_SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // localStorage can be disabled by browser privacy settings.
    }
  }, [barcodeType, paperId, showStore, storeName, showCode, showName, showThreeLineName, showPrice, showOldPrice, currencySuffix, marginLeft, marginTop, recentPaperIds]);

  useEffect(() => {
    if ('storeName' in savedSettings) {
      setLoadingStoreName(false);
      return;
    }
    let active = true;
    http.get('/settings/store')
      .then((response) => {
        if (active) setStoreName(String(response.data?.shopName || ''));
      })
      .catch(() => {
        if (active) setStoreName('');
      })
      .finally(() => {
        if (active) setLoadingStoreName(false);
      });
    return () => {
      active = false;
    };
  }, [savedSettings]);

  const fetchProductsForBarcodeSearch = async (query: string) => {
    const responses = await Promise.allSettled([
      productApi.getProducts({ page: 1, limit: 8, q: query }),
      productApi.getProducts({ page: 1, limit: 8, code: query }),
      productApi.getProducts({ page: 1, limit: 8, barcode: query }),
    ]);
    const successfulResponses = responses
      .filter((response): response is PromiseFulfilledResult<Awaited<ReturnType<typeof productApi.getProducts>>> => response.status === 'fulfilled')
      .map((response) => response.value);
    if (successfulResponses.length === 0) throw new Error('Không thể tải kết quả tìm kiếm sản phẩm.');

    const uniqueProducts = new Map<string, IProduct>();
    successfulResponses
      .flatMap((response) => response.items || [])
      .forEach((product) => uniqueProducts.set(product._id, product));
    return Array.from(uniqueProducts.values()).slice(0, 8);
  };

  useEffect(() => {
    const query = barcodeSearch.trim();
    if (!query) {
      setBarcodeSearchResults([]);
      setBarcodeSearchLoading(false);
      setBarcodeSearchError('');
      setBarcodeSearchOpen(false);
      return;
    }

    const requestId = barcodeSearchRequestRef.current + 1;
    barcodeSearchRequestRef.current = requestId;
    setBarcodeSearchLoading(true);
    setBarcodeSearchError('');
    setBarcodeSearchOpen(true);

    const timer = window.setTimeout(async () => {
      try {
        const productsFound = await fetchProductsForBarcodeSearch(query);
        if (barcodeSearchRequestRef.current !== requestId) return;
        setBarcodeSearchResults(productsFound);
      } catch (error) {
        if (barcodeSearchRequestRef.current !== requestId) return;
        console.error('Lỗi tìm sản phẩm để in mã vạch:', error);
        setBarcodeSearchResults([]);
        setBarcodeSearchError('Không thể tìm sản phẩm. Vui lòng thử lại.');
      } finally {
        if (barcodeSearchRequestRef.current === requestId) setBarcodeSearchLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [barcodeSearch]);

  const addProductToPrint = (product: IProduct) => {
    setRows((current) => {
      const existing = current.find((row) => row.product._id === product._id);
      if (existing) {
        return current.map((row) => row.product._id === product._id ? { ...row, qty: row.qty + 1 } : row);
      }
      return [...current, { product, qty: 1 }];
    });
    setBarcodeSearch('');
    setBarcodeSearchResults([]);
    setBarcodeSearchOpen(false);
  };

  const handleBarcodeScan = async (rawBarcode: string) => {
    const query = rawBarcode.trim();
    if (!query) return;
    const lower = query.toLocaleLowerCase('vi-VN');
    try {
      const productsFound = await fetchProductsForBarcodeSearch(query);
      const exactMatch = productsFound.find((product) =>
        [product.barcode, product.code].some((value) => String(value || '').trim().toLocaleLowerCase('vi-VN') === lower),
      );
      if (exactMatch) {
        addProductToPrint(exactMatch);
        window.setTimeout(() => barcodeSearchRef.current?.focus(), 0);
        return;
      }
      if (productsFound.length > 0) {
        setBarcodeSearch(query);
        setBarcodeSearchResults(productsFound);
        setBarcodeSearchOpen(true);
        return;
      }
      setBarcodeSearch(query);
      setBarcodeSearchOpen(true);
    } catch (error) {
      console.error('Lỗi quét mã vạch vào danh sách in:', error);
      setBarcodeSearch(query);
      setBarcodeSearchError('Không thể tìm sản phẩm từ mã vừa quét.');
      setBarcodeSearchOpen(true);
    }
  };

  useProductScanTarget(barcodeSearchRef, handleBarcodeScan);

  const handleBarcodeSearchKeyDown = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();

    const query = barcodeSearch.trim().toLocaleLowerCase('vi-VN');
    if (!query) return;

    let productsFound = barcodeSearchResults;
    if (barcodeSearchLoading || productsFound.length === 0) {
      const requestId = barcodeSearchRequestRef.current + 1;
      barcodeSearchRequestRef.current = requestId;
      setBarcodeSearchLoading(true);
      setBarcodeSearchError('');
      setBarcodeSearchOpen(true);
      try {
        productsFound = await fetchProductsForBarcodeSearch(barcodeSearch.trim());
        if (barcodeSearchRequestRef.current !== requestId) return;
        setBarcodeSearchResults(productsFound);
      } catch (error) {
        if (barcodeSearchRequestRef.current !== requestId) return;
        console.error('Lỗi đọc barcode từ máy quét:', error);
        setBarcodeSearchError('Không thể tìm sản phẩm từ mã vừa quét.');
        return;
      } finally {
        if (barcodeSearchRequestRef.current === requestId) setBarcodeSearchLoading(false);
      }
    }

    const exactMatch = productsFound.find((product) => (
      [product.barcode, product.code]
        .some((value) => String(value || '').trim().toLocaleLowerCase('vi-VN') === query)
    ));
    if (exactMatch || productsFound[0]) addProductToPrint(exactMatch || productsFound[0]);
  };

  const updateQty = (productId: string, qty: number) => {
    setRows((current) => current.map((row) => row.product._id === productId ? { ...row, qty: Math.max(1, qty || 1) } : row));
  };

  const removeRow = (productId: string) => {
    setRows((current) => current.filter((row) => row.product._id !== productId));
  };

  const exportRows = () => {
    const mappedRows = rows.map((row) => ({
      'Mã sản phẩm': row.product.code,
      'Tên sản phẩm': row.product.name,
      'Mã vạch': normalizeBarcodeValue(row.product),
      'Giá bán': row.product.price || 0,
      'Số lượng tem': row.qty,
    }));
    const worksheet = XLSX.utils.json_to_sheet(mappedRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'In ma vach');
    XLSX.writeFile(workbook, `in-ma-vach-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const openPrintPreview = (paper: PaperTemplate) => {
    if (printingRef.current) return;
    if (rows.length === 0) {
      alert('Vui lòng giữ lại ít nhất một sản phẩm để in mã vạch.');
      return;
    }

    const printIssues = getBarcodePrintIssues(rows, barcodeType);
    if (printIssues.length) {
      alert(`Không thể in an toàn:\n${printIssues.slice(0, 5).join('\n')}`);
      return;
    }

    setRecentPaperIds((current) => buildRecentPaperIds(current, paper.id));
    if (paperId !== paper.id) setPaperId(paper.id);

    const html = buildPrintDocument({
      rows: rows,
      barcodeType,
      paper,
      marginLeft,
      marginTop,
      showStore,
      storeName,
      showCode,
      showName,
      showThreeLineName,
      showPrice,
      showOldPrice,
      currencySuffix,
    });
    printingRef.current = true;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      printingRef.current = false;
      alert('Trình duyệt đang chặn cửa sổ in. Vui lòng cho phép pop-up để xem và in mã vạch. Vui lòng cho phép pop-up rồi bấm lại.');
      return;
    }
    printWindow.opener = null;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    const expectedLabels = rows.reduce((total, row) => total + Math.max(1, row.qty), 0);
    let didPrint = false;
    const firePrint = () => {
      if (didPrint) return;
      didPrint = true;
      try { printWindow.focus(); } catch { /* ignore focus errors */ }
      try { printWindow.print(); } catch { /* ignore print errors */ }
      printingRef.current = false;
    };
    const schedule = (callback: () => void) => {
      if (typeof printWindow.requestAnimationFrame === 'function') printWindow.requestAnimationFrame(callback);
      else if (typeof printWindow.setTimeout === 'function') printWindow.setTimeout(callback, 60);
      else callback();
    };
    const pollReady = (attemptsLeft: number) => {
      if (didPrint) return;
      const doc = printWindow.document;
      const canInspect = typeof doc.querySelectorAll === 'function';
      let ready = true;
      if (canInspect) {
        const nodes = doc.querySelectorAll('svg.barcode-svg, span.barcode-svg-error');
        const barcodesReady = expectedLabels > 0 ? nodes.length >= expectedLabels : nodes.length > 0;
        ready = barcodesReady && (doc.readyState === 'complete' || doc.readyState === 'interactive');
      }
      if (ready || attemptsLeft <= 0) {
        firePrint();
        return;
      }
      schedule(() => pollReady(attemptsLeft - 1));
    };
    if (typeof printWindow.addEventListener === 'function') {
      printWindow.addEventListener('afterprint', () => { try { printWindow.close(); } catch { /* ignore close errors */ } }, { once: true });
    }
    schedule(() => pollReady(24));
  };

  return (
    <div className="barcode-page">
      <div className="barcode-page-header">
        <div className="barcode-heading">
          <button className="btn btn-light barcode-back-button" type="button" onClick={onBack}>Quay lại danh sách</button>
          <div>
            <span className="barcode-eyebrow">Không gian in tem</span>
            <h2>In mã vạch sản phẩm</h2>
            <p>{rows.length.toLocaleString('vi-VN')} sản phẩm • {rows.reduce((total, row) => total + row.qty, 0).toLocaleString('vi-VN')} tem sẽ in</p>
          </div>
        </div>
        <div className="products-bulk-menu products-floating-menu">
          <button className="btn products-dropdown-button" type="button" aria-expanded={openPrintAction} onClick={() => setOpenPrintAction((current) => !current)}>
            <span>Thao tác</span>
            <ChevronDown size={15} />
          </button>
          {openPrintAction ? (
            <div className="products-floating-dropdown products-bulk-dropdown">
              <button className="products-dropdown-item" type="button" onClick={() => { setOpenPrintAction(false); exportRows(); }}>
                <Download size={15} />
                <span>Xuất dữ liệu</span>
              </button>
              <button className="products-dropdown-item danger" type="button" onClick={() => { setRows([]); onClearSelection(); setOpenPrintAction(false); }}>
                <Trash2 size={15} />
                <span>Xóa danh sách toàn bộ đã chọn</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="barcode-layout">
        <section className="barcode-card barcode-products-card">
          <div className="barcode-card-title">
            <span><PackageCheck size={18} /> <strong>Sản phẩm đã chọn</strong></span>
            <span className="barcode-card-count">{rows.length.toLocaleString('vi-VN')} sản phẩm</span>
          </div>
          <div className="barcode-toolbar">
            <div className="barcode-product-search">
              <label className="barcode-search-row">
                <Search size={16} />
                <input
                  ref={barcodeSearchRef}
                  value={barcodeSearch}
                  onChange={(event) => setBarcodeSearch(event.target.value)}
                  onFocus={() => {
                    if (barcodeSearchBlurTimerRef.current !== null) {
                      window.clearTimeout(barcodeSearchBlurTimerRef.current);
                      barcodeSearchBlurTimerRef.current = null;
                    }
                    if (barcodeSearch.trim()) setBarcodeSearchOpen(true);
                  }}
                  onBlur={() => {
                    barcodeSearchBlurTimerRef.current = window.setTimeout(() => {
                      setBarcodeSearchOpen(false);
                      barcodeSearchBlurTimerRef.current = null;
                    }, 120);
                  }}
                  onKeyDown={handleBarcodeSearchKeyDown}
                  data-product-search-scan="true" data-product-search-primary="true" placeholder="Tìm hoặc quét tên, mã sản phẩm, barcode"
                  autoComplete="off"
                  aria-expanded={barcodeSearchOpen}
                  aria-controls="barcode-product-results"
                />
                {barcodeSearch ? (
                  <button type="button" onClick={() => setBarcodeSearch('')} aria-label="Xóa từ khóa tìm kiếm">
                    <X size={15} />
                  </button>
                ) : null}
              </label>
              {barcodeSearchOpen ? (
                <div className="barcode-search-dropdown" id="barcode-product-results" role="listbox">
                  {barcodeSearchLoading ? <div className="barcode-search-state">Đang tìm sản phẩm...</div> : null}
                  {!barcodeSearchLoading && barcodeSearchError ? <div className="barcode-search-state error">{barcodeSearchError}</div> : null}
                  {!barcodeSearchLoading && !barcodeSearchError && barcodeSearchResults.length === 0 ? (
                    <div className="barcode-search-state">Không tìm thấy sản phẩm phù hợp.</div>
                  ) : null}
                  {!barcodeSearchLoading && barcodeSearchResults.map((product) => {
                    const alreadyAdded = rowIds.has(product._id);
                    return (
                      <button
                        className="barcode-search-result"
                        type="button"
                        role="option"
                        key={product._id}
                        onClick={() => addProductToPrint(product)}
                      >
                        <span className="barcode-search-result-main">
                          <strong>{product.name}</strong>
                          <small>{product.code}{product.barcode ? ` • ${product.barcode}` : ''}</small>
                        </span>
                        <span className="barcode-search-result-side">
                          <strong>{formatMoney(product.price)}</strong>
                          <small>{alreadyAdded ? 'Đã có • thêm 1 tem' : 'Thêm sản phẩm'}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <span className="barcode-toolbar-note">Giá bán hiện tại</span>
          </div>
          <div className="products-table-wrap">
            <table className="data-table barcode-table">
              <thead>
                <tr>
                  <th>Mã</th>
                  <th>Mã sản phẩm</th>
                  <th>Tên sản phẩm</th>
                  <th>Giá bán lẻ</th>
                  <th>SL</th>
                  <th>Xóa</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={6} className="empty-cell">Chưa có sản phẩm để in.</td></tr>
                ) : rows.map((row) => (
                  <tr key={row.product._id}>
                    <td>{normalizeBarcodeValue(row.product)}</td>
                    <td>{row.product.code}</td>
                    <td>{row.product.name}</td>
                    <td className="products-price">{formatMoney(row.product.price)}</td>
                    <td><input aria-label={`Số lượng tem ${row.product.name}`} className="barcode-qty" type="number" min={1} value={row.qty} onChange={(event) => updateQty(row.product._id, Number(event.target.value))} /></td>
                    <td><button className="icon-button danger" aria-label={`Xóa ${row.product.name} khỏi danh sách in`} type="button" onClick={() => removeRow(row.product._id)}><Trash2 size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="barcode-side">
          <section className="barcode-card">
            <div className="barcode-card-title"><Settings size={18} /> <strong>Cấu hình in tem</strong></div>
            <div className="barcode-preview-label">
              {showStore && storeName.trim() ? <div className="barcode-preview-store">{storeName}</div> : null}
              <BarcodeSvg value={previewBarcodeValue} type={barcodeType} />
              {showCode ? <div className="barcode-preview-code">{previewBarcodeValue}</div> : null}
              {showName ? <div className={`barcode-preview-name ${showThreeLineName ? 'three' : ''}`}>{previewProduct?.name || 'Tên sản phẩm'}</div> : null}
              {showPrice ? <div className="barcode-preview-price">{Number(previewProduct?.price || 0).toLocaleString('vi-VN')} {currencySuffix}</div> : null}
              {showOldPrice && previewProduct?.oldPrice ? <div className="barcode-preview-old-price">{Number(previewProduct.oldPrice).toLocaleString('vi-VN')} {currencySuffix}</div> : null}
            </div>
            <div className={previewBarcodeResult.error || previewDensityIssues.length ? 'barcode-standard-note danger' : previewBarcodeResult.warning ? 'barcode-standard-note warning' : 'barcode-standard-note'}>
              Chuẩn in thực tế: {barcodeTypeLabel(previewBarcodeResult.actualType)}{previewBarcodeResult.warning ? ` · ${previewBarcodeResult.warning}` : ''}{previewBarcodeResult.error ? ` · ${previewBarcodeResult.error}` : ''}{previewDensityIssues[0] ? ` · ${previewDensityIssues[0]}` : ''}
            </div>

            <div className="barcode-settings">
            <label className="barcode-config-row">
              <span>Loại mã</span>
              <select value={barcodeType} onChange={(event) => setBarcodeType(event.target.value as BarcodeType)}>
                <option value="AUTO">Tự động (khuyến nghị)</option>
                <option value="EAN13">EAN-13</option>
                <option value="C128">Code 128</option>
                <option value="C128A">Code 128A</option>
                <option value="C39">Code 39 (nâng cao)</option>
                <option value="QRCODE">QR Code</option>
              </select>
            </label>
            <label className="barcode-switch-row"><input type="checkbox" checked={showStore} onChange={(event) => setShowStore(event.target.checked)} /> Hiện tên shop</label>
            {showStore ? <input aria-label="Tên shop trên tem" className="barcode-text-input" value={storeName} onChange={(event) => setStoreName(event.target.value)} disabled={loadingStoreName} placeholder={loadingStoreName ? 'Đang tải tên cửa hàng...' : 'Nhập tên shop'} /> : null}
            <label className="barcode-switch-row"><input type="checkbox" checked={showCode} onChange={(event) => setShowCode(event.target.checked)} /> Hiện mã sản phẩm</label>
            <label className="barcode-switch-row"><input type="checkbox" checked={showName} onChange={(event) => setShowName(event.target.checked)} /> Hiện tên sản phẩm</label>
            <label className={`barcode-switch-row ${!showName ? 'is-disabled' : ''}`}><input type="checkbox" checked={showThreeLineName} disabled={!showName} onChange={(event) => setShowThreeLineName(event.target.checked)} /> Hiện 3 dòng tên sản phẩm</label>
            <label className="barcode-switch-row"><input type="checkbox" checked={showPrice} onChange={(event) => setShowPrice(event.target.checked)} /> Hiện giá sản phẩm</label>
            <label className="barcode-switch-row"><input type="checkbox" checked={showOldPrice} onChange={(event) => setShowOldPrice(event.target.checked)} /> Hiện giá cũ</label>
            <label className="barcode-config-row"><span>Đơn vị tiền sau giá bán</span><input value={currencySuffix} onChange={(event) => setCurrencySuffix(event.target.value)} /></label>
            </div>
          </section>

          <section className="barcode-card">
            <div className="barcode-card-title"><Tag size={18} /> <strong>Chọn khổ giấy và in</strong></div>
            <p className="barcode-print-guide">Để quét chính xác: chọn đúng khổ giấy trong driver máy in, Margins = None, Scale = 100% / Actual size và tắt Fit to page.</p>
            <div className="barcode-margin-row">
              <label>Trái: <input type="number" value={marginLeft} onChange={(event) => setMarginLeft(Number(event.target.value))} /></label>
              <label>Trên: <input type="number" value={marginTop} onChange={(event) => setMarginTop(Number(event.target.value))} /></label>
            </div>
            <button className="barcode-show-all" type="button" onClick={() => setShowAllPapers((current) => !current)}>
              {showAllPapers ? 'Ẩn bớt khổ giấy' : 'Hiển thị tất cả 14 khổ giấy'}
            </button>
            <div className="barcode-paper-list">
              {visiblePapers.map((paper) => (
                <article className="barcode-paper-item" key={paper.id}>
                  <label>
                    <input type="radio" checked={paperId === paper.id} onChange={() => selectPaper(paper.id)} />
                    <span><strong>{paper.title}</strong><em>- {paper.size}</em></span>
                  </label>
                  <div className={`barcode-paper-preview ${paper.previewClass}`} aria-hidden="true" />
                  <button className="btn barcode-print-button" type="button" onClick={() => openPrintPreview(paper)}>
                    <Eye size={15} />
                    Xem và in
                  </button>
                </article>
              ))}
            </div>
            <button className="btn barcode-print-main" type="button" onClick={() => openPrintPreview(selectedPaper)}>
              <Printer size={15} />
              Xem và in khổ đang chọn
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}

export function ProductList({
  onBarcodeWorkspaceChange,
  actionSlot,
}: {
  onBarcodeWorkspaceChange?: (open: boolean) => void;
  actionSlot?: React.RefObject<HTMLDivElement | null>;
}) {
  const [items, setItems] = useState<IProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [draftSearch, setDraftSearch] = useState('');
  const productListSearchRef = useRef<HTMLInputElement>(null);
  const [draftStatus, setDraftStatus] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [appliedStatus, setAppliedStatus] = useState('');
  const [sortField, setSortField] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 15;

  const [detailItem, setDetailItem] = useState<IProduct | null>(null);
  const [editItem, setEditItem] = useState<IProduct | null | undefined>(undefined);
  const [deleteItem, setDeleteItem] = useState<IProduct | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [openAddMenu, setOpenAddMenu] = useState(false);
  const [openBulkMenu, setOpenBulkMenu] = useState(false);
  const [openBulkStatusMenu, setOpenBulkStatusMenu] = useState(false);
  const [openRowActionId, setOpenRowActionId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [showBarcodePrint, setShowBarcodePrint] = useState(false);
  const [showBulkStatusModal, setShowBulkStatusModal] = useState(false);
  const [showBulkCategoryModal, setShowBulkCategoryModal] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [categories, setCategories] = useState<ICategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    stockAdded: number;
    errors?: string[];
    voucherId?: string | null;
  } | null>(null);

  const exportColumns: ColumnOption[] = useMemo(
    () => [
      { label: 'Mã SP', key: 'code', getValue: (product: IProduct) => product.code },
      { label: 'Tên sản phẩm', key: 'name', getValue: (product: IProduct) => product.name },
      { label: 'Mã vạch', key: 'barcode', getValue: (product: IProduct) => product.barcode || '' },
      { label: 'Danh mục', key: 'categoryName', getValue: (product: IProduct) => product.categoryName || '' },
      { label: 'Nhà cung cấp', key: 'supplierName', getValue: (product: IProduct) => product.supplierName || '' },
      { label: 'Đơn vị', key: 'unit', getValue: (product: IProduct) => product.unit || '' },
      { label: 'Giá vốn', key: 'cost', getValue: (product: IProduct) => product.cost || 0 },
      { label: 'Giá bán', key: 'price', getValue: (product: IProduct) => product.price || 0 },
      { label: 'Giá sỉ', key: 'wholesalePrice', getValue: (product: IProduct) => product.wholesalePrice || 0 },
      { label: 'Tổng tồn', key: 'qty', getValue: (product: IProduct) => product.qty || 0 },
      { label: 'Trạng thái', key: 'status', getValue: (product: IProduct) => product.status || 'Mới' },
      {
        label: 'Ngày tạo',
        key: 'createdAt',
        getValue: (product: IProduct) => new Date(product.createdAt).toLocaleDateString('vi-VN'),
      },
    ],
    [],
  );

  const selectedProducts = useMemo(
    () => items.filter((item) => selectedIds.has(item._id)),
    [items, selectedIds],
  );

  const statusOptions = useMemo(() => {
    const values = new Set(PRODUCT_STATUS_OPTIONS);
    items.forEach((item) => {
      if (item.status) values.add(item.status);
    });
    return Array.from(values);
  }, [items]);

  const allCurrentPageSelected = items.length > 0 && items.every((item) => selectedIds.has(item._id));

  const toggleCurrentPageSelection = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allCurrentPageSelected) {
        items.forEach((item) => next.delete(item._id));
      } else {
        items.forEach((item) => next.add(item._id));
      }
      return next;
    });
  };

  const toggleRowSelection = (productId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const requireSelection = () => {
    if (selectedIds.size > 0) return true;
    alert('Vui lòng tích chọn ít nhất một sản phẩm trước khi thao tác.');
    return false;
  };

  const ensureCategories = async () => {
    if (categories.length > 0 || loadingCategories) return;
    setLoadingCategories(true);
    try {
      const response = await productApi.getCategories({ limit: 1000 });
      setCategories(response.items || []);
    } catch (error) {
      console.error('Lỗi tải danh mục sản phẩm:', error);
      alert('Không tải được danh mục sản phẩm.');
    } finally {
      setLoadingCategories(false);
    }
  };

  const load = async () => {
    setLoading(true);

    try {
      const response = await productApi.getProducts({
        page,
        limit,
        q: appliedSearch || undefined,
        status: appliedStatus || undefined,
        sort: sortField,
        order: sortOrder,
      });

      setItems(response.items);
      setTotal(response.total);
    } catch (error) {
      console.error('Lỗi tải sản phẩm:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [page, appliedSearch, appliedStatus, sortField, sortOrder]);

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setAppliedSearch(draftSearch.trim());
    setAppliedStatus(draftStatus);
  };

  const handleProductListScan = (barcode: string) => {
    const query = barcode.trim();
    if (!query) return;
    setDraftSearch(query);
    setAppliedSearch(query);
    setAppliedStatus('');
    setPage(1);
    window.setTimeout(() => productListSearchRef.current?.focus(), 0);
  };

  useProductScanTarget(productListSearchRef, handleProductListScan);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortField(field);
    setSortOrder('desc');
  };

  const handleSave = async (payload: ProductSavePayload) => {
    if (!payload.name?.trim()) {
      setSaveError('Tên sản phẩm là bắt buộc.');
      return;
    }

    setSaving(true);
    setSaveError('');

    try {
      if (editItem?._id) {
        await productApi.updateProduct(editItem._id, payload);
      } else {
        await productApi.createProduct(payload);
      }

      setEditItem(undefined);
      setPage(1);
      await load();
    } catch (error: any) {
      setSaveError(error?.response?.data?.message || 'Không thể lưu sản phẩm. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;

    try {
      await productApi.deleteProduct(deleteItem._id);
      setDeleteItem(null);
      await load();
    } catch (error) {
      console.error('Lỗi xóa sản phẩm:', error);
      alert('Xóa sản phẩm thất bại.');
    }
  };

  const handleBulkStatus = async (status: string) => {
    if (!requireSelection()) return;
    setBulkLoading(true);
    try {
      await Promise.all(Array.from(selectedIds).map((id) => productApi.updateProduct(id, { status })));
      setShowBulkStatusModal(false);
      setOpenBulkMenu(false);
      setOpenBulkStatusMenu(false);
      await load();
    } catch (error: any) {
      console.error('Lỗi đổi trạng thái sản phẩm:', error);
      alert(error?.response?.data?.message || 'Đổi trạng thái sản phẩm thất bại.');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkCategory = async (category: ICategory) => {
    if (!requireSelection()) return;
    setBulkLoading(true);
    try {
      await Promise.all(Array.from(selectedIds).map((id) => productApi.updateProduct(id, { categoryId: category._id, categoryName: category.name })));
      setShowBulkCategoryModal(false);
      setOpenBulkMenu(false);
      await load();
    } catch (error) {
      console.error('Lỗi cập nhật danh mục sản phẩm:', error);
      alert('Cập nhật danh mục thất bại.');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!requireSelection()) return;
    const ok = window.confirm(`Bạn có chắc muốn xóa ${selectedIds.size.toLocaleString('vi-VN')} sản phẩm đã chọn không?`);
    if (!ok) return;

    setBulkLoading(true);
    try {
      await Promise.all(Array.from(selectedIds).map((id) => productApi.deleteProduct(id)));
      setSelectedIds(new Set());
      setOpenBulkMenu(false);
      await load();
    } catch (error) {
      console.error('Lỗi xóa nhiều sản phẩm:', error);
      alert('Xóa các dòng đã chọn thất bại.');
    } finally {
      setBulkLoading(false);
    }
  };

  const openBarcodePrint = () => {
    if (!requireSelection()) return;
    if (selectedProducts.length === 0) {
      alert('Vui lòng tích chọn sản phẩm đang hiển thị trên trang này để in mã vạch.');
      return;
    }
    setOpenBulkMenu(false);
    setShowBarcodePrint(true);
    onBarcodeWorkspaceChange?.(true);
  };

  const openBulkCategoryModal = async () => {
    if (!requireSelection()) return;
    setOpenBulkMenu(false);
    await ensureCategories();
    setShowBulkCategoryModal(true);
  };

  const handleExcelExport = async (
    exportType: 'current' | 'all',
    filename: string,
    sheetName: string,
    selectedColumns: { key: string; customLabel: string }[],
  ) => {
    setExportLoading(true);

    try {
      let dataToExport: IProduct[] = [];

      if (exportType === 'current') {
        dataToExport = items;
      } else {
        const pageSize = 100;
        const firstPage = await productApi.getProducts({
          page: 1,
          limit: pageSize,
          q: appliedSearch || undefined,
          status: appliedStatus || undefined,
          sort: sortField,
          order: sortOrder,
        });

        let allItems = [...firstPage.items];
        const pagesToFetch = Math.ceil(firstPage.total / pageSize);

        if (pagesToFetch > 1) {
          const responses = await Promise.all(
            Array.from({ length: pagesToFetch - 1 }, (_, index) =>
              productApi.getProducts({
                page: index + 2,
                limit: pageSize,
                q: appliedSearch || undefined,
                status: appliedStatus || undefined,
                sort: sortField,
                order: sortOrder,
              }),
            ),
          );

          responses.forEach((response) => {
            allItems = allItems.concat(response.items);
          });
        }

        dataToExport = allItems;
      }

      const mappedRows = dataToExport.map((product) => {
        const row: Record<string, unknown> = {};
        selectedColumns.forEach((column) => {
          const exportColumn = exportColumns.find((item) => item.key === column.key);
          row[column.customLabel] = exportColumn ? exportColumn.getValue(product) : '';
        });
        return row;
      });

      const worksheet = XLSX.utils.json_to_sheet(mappedRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      XLSX.writeFile(workbook, `${filename}.xlsx`);
      setShowExportModal(false);
    } catch (error) {
      console.error('Lỗi xuất Excel sản phẩm:', error);
      alert('Xuất Excel thất bại.');
    } finally {
      setExportLoading(false);
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown size={13} style={{ opacity: 0.4 }} />;
    return sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />;
  };

  if (showBarcodePrint) {
    return (
      <BarcodePrintWorkspace
        products={selectedProducts}
        onBack={() => {
          setShowBarcodePrint(false);
          onBarcodeWorkspaceChange?.(false);
        }}
        onClearSelection={() => setSelectedIds(new Set())}
      />
    );
  }

  return (
    <div className="products-panel">
      <section className="products-control-card">
        <div className="products-stat-row">
          <span className="record-badge">{total.toLocaleString('vi-VN')} bản ghi</span>
          <span className="products-stat-chip">
            <Boxes size={14} />
            Trang {page} / {Math.max(1, Math.ceil(total / limit))}
          </span>
          <span className="products-stat-chip">
            <ShieldAlert size={14} />
            Tổng tồn đồng bộ từ tồn kho từng kho
          </span>
        </div>

        {actionSlot?.current
          ? createPortal(
              <div className="products-action-row">
                <div className="products-primary-actions">
                  <div className="products-split-add products-floating-menu">
                    <button className="btn products-add-button" type="button" onClick={() => { setSaveError(''); setEditItem(null); }}>
                      <Plus size={15} />
                      Thêm mới
                    </button>
                    <button className="btn products-add-button products-split-toggle" type="button" onClick={() => setOpenAddMenu((current) => !current)} aria-label="Mở menu thêm mới">
                      <ChevronDown size={15} />
                    </button>
                    {openAddMenu ? (
                      <div className="products-floating-dropdown products-add-dropdown">
                        <button className="products-dropdown-item" type="button" onClick={() => { setOpenAddMenu(false); setShowImport(true); }}>
                          <FileUp size={15} />
                          <span>Nhập từ file</span>
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="products-bulk-menu products-floating-menu">
                    <button className="btn products-dropdown-button" type="button" onClick={() => setOpenBulkMenu((current) => !current)}>
                      <span>Thao tác</span>
                      <ChevronDown size={15} />
                    </button>
                    {openBulkMenu ? (
                      <div className="products-floating-dropdown products-bulk-dropdown">
                        <button className="products-dropdown-item" type="button" onClick={() => { setOpenBulkMenu(false); setShowExportModal(true); }}>
                          <FileDown size={15} />
                          <span>Xuất dữ liệu</span>
                        </button>
                        <button className="products-dropdown-item" type="button" onClick={openBarcodePrint}>
                          <Printer size={15} />
                          <span>In mã vạch</span>
                        </button>
                        <div className="products-dropdown-group">
                          <button className="products-dropdown-item" type="button" onClick={() => {
                            if (!requireSelection()) return;
                            setOpenBulkStatusMenu((current) => !current);
                          }}>
                            <RefreshCw size={15} />
                            <span>Đổi trạng thái sản phẩm</span>
                            <ChevronDown size={14} />
                          </button>
                          {openBulkStatusMenu ? (
                            <div className="products-sub-dropdown">
                              {statusOptions.map((status) => (
                                <button className="products-dropdown-item" type="button" key={status} disabled={bulkLoading} onClick={() => handleBulkStatus(status)}>
                                  {status}
                                </button>
                              ))}
                              <button className="products-dropdown-item" type="button" disabled={bulkLoading} onClick={() => { setOpenBulkMenu(false); setShowBulkStatusModal(true); }}>
                                Tùy chọn khác...
                              </button>
                            </div>
                          ) : null}
                        </div>
                        <button className="products-dropdown-item danger" type="button" disabled={bulkLoading} onClick={handleBulkDelete}>
                          <Trash2 size={15} />
                          <span>Xóa các dòng đã chọn</span>
                        </button>
                        <button className="products-dropdown-item" type="button" disabled={bulkLoading || loadingCategories} onClick={() => void openBulkCategoryModal()}>
                          <CheckSquare size={15} />
                          <span>Cập nhật danh mục</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <span className="products-selected-count">Đã chọn {selectedIds.size.toLocaleString('vi-VN')}</span>
                </div>

                <div className="products-secondary-actions">
                  <button className="btn btn-light" type="button" onClick={() => void load()} title="Làm mới dữ liệu">
                    <RefreshCw size={15} />
                    Làm mới
                  </button>
                </div>
              </div>,
              actionSlot.current,
            )
          : null}
        <form className="products-filter-form" onSubmit={handleSearch}>
          <div className="products-filter-grid products-grid-products">
            <label className="products-inline-field">
              <span>Tên, mã sản phẩm</span>
              <div className="products-inline-control">
                <Search size={16} />
                <input
                  ref={productListSearchRef}
                  value={draftSearch}
                  onChange={(event) => setDraftSearch(event.target.value)}
                  data-product-search-scan="true" data-product-search-primary="true" placeholder="Tìm theo tên, mã hoặc barcode..."
                />
              </div>
            </label>

            <label className="products-inline-field">
              <span>Trạng thái</span>
              <div className="products-inline-control">
                <select value={draftStatus} onChange={(event) => setDraftStatus(event.target.value)}>
                  <option value="">Tất cả trạng thái</option>
                  <option value="Mới">Mới</option>
                  <option value="Đang giao">Đang giao</option>
                  <option value="Ngừng">Ngừng</option>
                </select>
              </div>
            </label>

            <button className="btn btn-primary products-filter-submit" type="submit">
              <Search size={15} />
              Lọc
            </button>
          </div>

        </form>
      </section>

      <section className="products-table-card">
        <div className="products-table-topbar">
          <div>
            <strong>Bảng dữ liệu sản phẩm</strong>

          </div>
          <div className="products-table-hint">
            <ArrowUpDown size={14} />
            Sắp xếp theo {sortField} ({sortOrder === 'asc' ? 'tăng dần' : 'giảm dần'})
          </div>
        </div>

        <div className="products-table-wrap">
          <table className="data-table products-data-table">
            <thead>
              <tr>
                <th className="check-cell">
                  <input
                    type="checkbox"
                    aria-label="Chọn tất cả sản phẩm"
                    checked={allCurrentPageSelected}
                    onChange={toggleCurrentPageSelection}
                  />
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('code')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <SortIcon field="code" />
                    Mã SP
                  </div>
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <SortIcon field="name" />
                    Tên sản phẩm
                  </div>
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('barcode')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <SortIcon field="barcode" />
                    Mã vạch
                  </div>
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('cost')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <SortIcon field="cost" />
                    Giá vốn
                  </div>
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('price')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <SortIcon field="price" />
                    Giá bán
                  </div>
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('qty')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <SortIcon field="qty" />
                    Tổng tồn
                  </div>
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('status')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <SortIcon field="status" />
                    Trạng thái
                  </div>
                </th>
                <th className="action-cell">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="empty-cell">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              ) : null}

              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="empty-cell">
                    Chưa có dữ liệu sản phẩm.
                  </td>
                </tr>
              ) : null}

              {!loading
                ? items.map((item) => (
                    <tr key={item._id}>
                      <td className="check-cell">
                        <input
                          type="checkbox"
                          aria-label={`Chọn sản phẩm ${item.code}`}
                          checked={selectedIds.has(item._id)}
                          onChange={() => toggleRowSelection(item._id)}
                        />
                      </td>
                      <td>
                        <span className="products-code">{item.code}</span>
                      </td>
                      <td className="products-name-cell">
                        <div className="products-name-main">{item.name}</div>
                        {item.categoryName ? <div className="products-name-sub">{item.categoryName}</div> : null}
                      </td>
                      <td className="products-barcode">{item.barcode || '—'}</td>
                      <td className="products-price">{formatMoney(item.cost)}</td>
                      <td className="products-price products-price-sale">{formatMoney(item.price)}</td>
                      <td className="products-stock">{Number(item.qty || 0).toLocaleString('vi-VN')}</td>
                      <td>
                        <span className={`status-badge ${getStatusClass(item.status)}`}>{item.status || 'Mới'}</span>
                      </td>
                      <td className="action-cell">
                        <div className="products-actions">
                          <button
                            className="icon-button products-row-menu-button"
                            type="button"
                            title="Thao tác"
                            onClick={() => setOpenRowActionId((current) => (current === item._id ? null : item._id))}
                          >
                            <MoreHorizontal size={17} />
                          </button>
                          {openRowActionId === item._id ? (
                            <div className="products-row-action-menu">
                              <button type="button" onClick={() => { setDetailItem(item); setOpenRowActionId(null); }}>
                                <Eye size={15} />
                                Chi tiết
                              </button>
                              <button type="button" onClick={() => { setSaveError(''); setEditItem(item); setOpenRowActionId(null); }}>
                                <Pencil size={15} />
                                Sửa
                              </button>
                              <button className="danger" type="button" onClick={() => { setDeleteItem(item); setOpenRowActionId(null); }}>
                                <Trash2 size={15} />
                                Xóa
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>

        <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
      </section>

      {detailItem ? <DetailModal product={detailItem} onClose={() => setDetailItem(null)} /> : null}

      {editItem !== undefined ? (
        <ProductForm
          product={editItem}
          onSave={handleSave}
          onClose={() => setEditItem(undefined)}
          saving={saving}
          error={saveError}
        />
      ) : null}

      {deleteItem ? <DeleteConfirm product={deleteItem} onConfirm={() => void handleDelete()} onCancel={() => setDeleteItem(null)} /> : null}

      {showImport ? (
        <ImportModal
          onClose={() => setShowImport(false)}
          onSuccess={(result) => {
            setShowImport(false);
            setImportResult(result);
            void load();
          }}
        />
      ) : null}

      {importResult ? (
        <div className="modal-backdrop" onClick={() => setImportResult(null)}>
          <div className="modal-card" style={{ maxWidth: 520 }} onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 style={{ color: '#059669' }}>Import thành công</h2>
                <p>Kết quả xử lý file sản phẩm.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setImportResult(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: 18, display: 'grid', gap: 12 }}>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                <li>
                  <strong>{importResult.created}</strong> sản phẩm được tạo mới
                </li>
                <li>
                  <strong>{importResult.updated}</strong> sản phẩm được cập nhật
                </li>
                <li>
                  <strong>{importResult.skipped}</strong> dòng bị bỏ qua
                </li>
                <li>
                  <strong>{importResult.stockAdded}</strong> đơn vị tồn kho đã được cộng
                </li>
              </ul>

              {importResult.voucherId ? (
                <p style={{ margin: 0 }}>
                  Phiếu nhập kho tự động: <strong>{importResult.voucherId}</strong>
                </p>
              ) : null}

              {importResult.errors?.length ? (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: '1px solid #fecaca',
                    background: '#fef2f2',
                    color: '#b91c1c',
                    maxHeight: 180,
                    overflowY: 'auto',
                  }}
                >
                  <strong>Cảnh báo khi import</strong>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {importResult.errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="modal-footer">
              <button className="btn btn-primary" type="button" onClick={() => setImportResult(null)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showBulkStatusModal ? (
        <BulkStatusModal
          selectedCount={selectedIds.size}
          statusOptions={statusOptions}
          loading={bulkLoading}
          onClose={() => setShowBulkStatusModal(false)}
          onApply={(status) => void handleBulkStatus(status)}
        />
      ) : null}

      {showBulkCategoryModal ? (
        <BulkCategoryModal
          selectedCount={selectedIds.size}
          categories={categories}
          loading={bulkLoading || loadingCategories}
          onClose={() => setShowBulkCategoryModal(false)}
          onApply={(category) => void handleBulkCategory(category)}
        />
      ) : null}

      {showExportModal ? (
        <ExportExcelModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          title="Xuất Excel - Danh sách sản phẩm"
          defaultFilename={`danh-sach-san-pham-${new Date().toISOString().slice(0, 10)}`}
          columns={exportColumns}
          onExport={handleExcelExport}
          loading={exportLoading}
        />
      ) : null}
    </div>
  );
}
