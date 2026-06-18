import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Boxes,
  CheckSquare,
  ChevronDown,
  Clock3,
  Download,
  Eye,
  FileDown,
  FileUp,
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
import * as XLSX from 'xlsx';
import { productApi } from '../../../core/api/product.api';
import { http } from '../../../core/api/http';
import { Pagination } from '../../../core/components/Pagination';
import type { ICategory, IProduct } from '../../../types/product.type';
import { ExportExcelModal, type ColumnOption } from './ExportExcelModal';

function formatMoney(value?: number) {
  return `${Number(value || 0).toLocaleString('vi-VN')} đ`;
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
  isDefault?: boolean;
}

type BarcodeType = 'EAN13' | 'C128' | 'C39' | 'C128A' | 'QRCODE';

interface PaperTemplate {
  id: string;
  title: string;
  size: string;
  widthMm: number;
  heightMm: number;
  columns: number;
  rows?: number;
  previewClass: 'roll' | 'sheet' | 'jewelry';
}

const PRODUCT_STATUS_OPTIONS = ['Mới', 'Đang bán', 'Ngừng bán', 'Hết hàng'];

const PAPER_TEMPLATES: PaperTemplate[] = [
  { id: 'roll-105x22-3', title: 'Mẫu giấy cuộn 3 nhãn', size: 'Khổ 105x22mm.', widthMm: 105, heightMm: 22, columns: 3, previewClass: 'roll' },
  { id: 'roll-70x22-2', title: 'Mẫu giấy cuộn 2 nhãn', size: 'Khổ 70x22mm.', widthMm: 70, heightMm: 22, columns: 2, previewClass: 'roll' },
  { id: 'a4-65', title: 'Mẫu giấy 65 nhãn', size: 'Khổ A4, Tomy 145 - 210x297mm.', widthMm: 210, heightMm: 297, columns: 5, rows: 13, previewClass: 'sheet' },
  { id: 'roll-77x22-2', title: 'Mẫu giấy cuộn 2 nhãn', size: 'Khổ 77x22mm.', widthMm: 77, heightMm: 22, columns: 2, previewClass: 'roll' },
  { id: 'roll-40x25-1', title: 'Mẫu giấy cuộn 1 nhãn', size: 'Khổ 40x25mm.', widthMm: 40, heightMm: 25, columns: 1, previewClass: 'roll' },
  { id: 'a4-180', title: 'Mẫu giấy 180 nhãn', size: 'Khổ A4 - 20x15mm.', widthMm: 210, heightMm: 297, columns: 10, rows: 18, previewClass: 'sheet' },
  { id: 'roll-50x40-2', title: 'Mẫu giấy cuộn 2 nhãn', size: 'Khổ 50x40mm.', widthMm: 50, heightMm: 40, columns: 2, previewClass: 'roll' },
  { id: 'roll-40x30-1', title: 'Mẫu giấy cuộn 1 nhãn', size: 'Khổ 40x30mm.', widthMm: 40, heightMm: 30, columns: 1, previewClass: 'roll' },
  { id: 'roll-50x30-1', title: 'Mẫu giấy cuộn 1 nhãn', size: 'Khổ 50x30mm.', widthMm: 50, heightMm: 30, columns: 1, previewClass: 'roll' },
  { id: 'roll-30x20-2', title: 'Mẫu giấy cuộn 2 nhãn', size: 'Khổ 30x20mm.', widthMm: 30, heightMm: 20, columns: 2, previewClass: 'roll' },
  { id: 'jewelry-80x10', title: 'Mẫu tem trang sức / kính mắt', size: 'Khổ 80x10mm.', widthMm: 80, heightMm: 10, columns: 1, previewClass: 'jewelry' },
  { id: 'a4-30', title: 'Mẫu giấy 30 nhãn', size: 'Khổ A4, Tomy 144 - 67x28mm.', widthMm: 210, heightMm: 297, columns: 3, rows: 10, previewClass: 'sheet' },
  { id: 'a4-48', title: 'Mẫu giấy 48 nhãn', size: 'Khổ A4, Tomy 132, 45.7mm x 21.2mm', widthMm: 210, heightMm: 297, columns: 4, rows: 12, previewClass: 'sheet' },
];

const CODE39_PATTERNS: Record<string, string> = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw',
  '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
  A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn',
  F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn',
  K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww', O: 'wnnnwnnwn',
  P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn',
  U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn',
  Z: 'nwwnwnnnn', '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '*': 'nwnnwnwnn',
  '$': 'nwnwnwnnn', '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn',
};

function normalizeBarcodeValue(product: IProduct) {
  return String(product.barcode || product.code || product._id || '').trim();
}

function buildCode39Svg(value: string, height = 42) {
  const encoded = `*${value.toUpperCase().replace(/[^0-9A-Z .\-/$+%]/g, '-')}*`;
  let x = 0;
  const bars: string[] = [];

  encoded.split('').forEach((char) => {
    const pattern = CODE39_PATTERNS[char] || CODE39_PATTERNS['-'];
    pattern.split('').forEach((widthFlag, index) => {
      const width = widthFlag === 'w' ? 3 : 1;
      if (index % 2 === 0) {
        bars.push(`<rect x="${x}" y="0" width="${width}" height="${height}" />`);
      }
      x += width;
    });
    x += 1;
  });

  return `<svg class="barcode-svg" viewBox="0 0 ${x} ${height}" preserveAspectRatio="none" role="img">${bars.join('')}</svg>`;
}

function buildQrLikeSvg(value: string) {
  const size = 21;
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  const cells: string[] = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      const dark = finder ? x === 0 || y === 0 || x === 6 || y === 6 || (x > 1 && x < 5 && y > 1 && y < 5) : ((x * 17 + y * 23 + hash) % 5) < 2;
      if (dark) cells.push(`<rect x="${x}" y="${y}" width="1" height="1" />`);
    }
  }

  return `<svg class="barcode-svg qr" viewBox="0 0 ${size} ${size}" preserveAspectRatio="xMidYMid meet" role="img">${cells.join('')}</svg>`;
}

function computeEan13CheckDigit(value: string) {
  const digits = value.slice(0, 12).split('').map(Number);
  const sum = digits.reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
}

function buildEan13Svg(value: string, height = 42) {
  const numeric = value.replace(/\D/g, '');
  if (numeric.length < 12) return buildCode39Svg(value, height);

  const base = numeric.slice(0, 12);
  const ean = numeric.length >= 13 ? numeric.slice(0, 13) : `${base}${computeEan13CheckDigit(base)}`;
  const leftOdd: Record<string, string> = {
    '0': '0001101', '1': '0011001', '2': '0010011', '3': '0111101', '4': '0100011',
    '5': '0110001', '6': '0101111', '7': '0111011', '8': '0110111', '9': '0001011',
  };
  const leftEven: Record<string, string> = {
    '0': '0100111', '1': '0110011', '2': '0011011', '3': '0100001', '4': '0011101',
    '5': '0111001', '6': '0000101', '7': '0010001', '8': '0001001', '9': '0010111',
  };
  const right: Record<string, string> = {
    '0': '1110010', '1': '1100110', '2': '1101100', '3': '1000010', '4': '1011100',
    '5': '1001110', '6': '1010000', '7': '1000100', '8': '1001000', '9': '1110100',
  };
  const parity: Record<string, string> = {
    '0': 'OOOOOO', '1': 'OOEOEE', '2': 'OOEEOE', '3': 'OOEEEO', '4': 'OEOOEE',
    '5': 'OEEOOE', '6': 'OEEEOO', '7': 'OEOEOE', '8': 'OEOEEO', '9': 'OEEOEO',
  };

  let pattern = '101';
  const leftParity = parity[ean[0]] || parity['0'];
  for (let index = 1; index <= 6; index += 1) {
    pattern += leftParity[index - 1] === 'O' ? leftOdd[ean[index]] : leftEven[ean[index]];
  }
  pattern += '01010';
  for (let index = 7; index <= 12; index += 1) {
    pattern += right[ean[index]];
  }
  pattern += '101';

  const bars = pattern.split('').map((bit, index) => bit === '1' ? `<rect x="${index}" y="0" width="1" height="${height}" />` : '').join('');
  return `<svg class="barcode-svg" viewBox="0 0 ${pattern.length} ${height}" preserveAspectRatio="none" role="img">${bars}</svg>`;
}

function buildBarcodeSvg(value: string, type: BarcodeType) {
  if (type === 'QRCODE') return buildQrLikeSvg(value);
  if (type === 'EAN13') return buildEan13Svg(value || '0');
  return buildCode39Svg(value || '0');
}

function BarcodeSvg({ value, type }: { value: string; type: BarcodeType }) {
  return <span className="barcode-art" dangerouslySetInnerHTML={{ __html: buildBarcodeSvg(value, type) }} />;
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
  onSave: (data: Partial<IProduct>) => void;
  onClose: () => void;
  saving: boolean;
  error?: string;
}

function ProductForm({ product, onSave, onClose, saving, error }: ProductFormProps) {
  const navigate = useNavigate();
  const isEdit = Boolean(product);
  const [form, setForm] = useState<Partial<IProduct>>(product ? { ...product } : { type: 'product', status: 'Mới' });
  const [categories, setCategories] = useState<ICategory[]>([]);

  useEffect(() => {
    let mounted = true;

    productApi
      .getCategories({ limit: 1000 })
      .then((response) => {
        if (mounted) {
          setCategories(response.items || []);
        }
      })
      .catch((error) => {
        console.error('Lỗi tải danh mục sản phẩm:', error);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const updateField = (key: keyof IProduct, value: string | number) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const fields: Array<{
    key: keyof IProduct;
    label: string;
    type?: 'text' | 'number';
    options?: Array<{ value: string; label: string }>;
  }> = [
    { key: 'code', label: 'Mã sản phẩm *' },
    { key: 'name', label: 'Tên sản phẩm *' },
    { key: 'barcode', label: 'Mã vạch' },
    {
      key: 'type',
      label: 'Loại sản phẩm',
      options: [
        { value: 'product', label: 'Sản phẩm' },
        { value: 'service', label: 'Dịch vụ' },
        { value: 'combo', label: 'Combo' },
      ],
    },
    { key: 'unit', label: 'Đơn vị' },
    {
      key: 'status',
      label: 'Trạng thái',
      options: [
        { value: 'Mới', label: 'Mới' },
        { value: 'Đang giao', label: 'Đang giao' },
        { value: 'Ngừng', label: 'Ngừng' },
      ],
    },
    { key: 'cost', label: 'Giá vốn', type: 'number' },
    { key: 'price', label: 'Giá bán', type: 'number' },
    { key: 'wholesalePrice', label: 'Giá sỉ', type: 'number' },
    { key: 'vat', label: 'VAT (%)', type: 'number' },
    { key: 'warrantyMonths', label: 'Bảo hành (tháng)', type: 'number' },
    { key: 'weight', label: 'Khối lượng (g)', type: 'number' },
    { key: 'color', label: 'Màu sắc' },
    { key: 'size', label: 'Kích cỡ' },
    { key: 'origin', label: 'Xuất xứ' },
    { key: 'categoryId', label: 'Danh mục' },
    { key: 'trademarkName', label: 'Thương hiệu' },
    { key: 'supplierName', label: 'Nhà cung cấp' },
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
            <h2>{isEdit ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}</h2>
            <p>{isEdit ? `Đang cập nhật: ${product?.name}` : 'Điền thông tin để tạo sản phẩm mới.'}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {error ? <div className="form-error">{error}</div> : null}

        <div className="form-grid">
          {fields.map((field) => {
            if (field.key === 'categoryId') {
              return (
                <div className="form-field" key={field.key}>
                  <span>{field.label}</span>
                  <select
                    value={String(form.categoryId ?? '')}
                    onChange={(event) => {
                      const selectedId = event.target.value;
                      const matchedCategory = categories.find((category) => category._id === selectedId);

                      setForm((current) => ({
                        ...current,
                        categoryId: selectedId || undefined,
                        categoryName: matchedCategory?.name || '',
                      }));
                    }}
                  >
                    <option value="">-- Chọn danh mục --</option>
                    {categories.map((category) => (
                      <option key={category._id} value={category._id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
              );
            }

            return (
              <div className="form-field" key={field.key}>
                <span>{field.label}</span>
                {field.options ? (
                  <select
                    value={String(form[field.key] ?? '')}
                    onChange={(event) => updateField(field.key, event.target.value)}
                  >
                    <option value="">-- Chọn --</option>
                    {field.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type || 'text'}
                    value={String(form[field.key] ?? '')}
                    onChange={(event) =>
                      updateField(
                        field.key,
                        field.type === 'number' ? Number(event.target.value) : event.target.value,
                      )
                    }
                  />
                )}
              </div>
            );
          })}

          <div
            style={{
              gridColumn: '1 / -1',
              padding: 14,
              borderRadius: 16,
              border: '1px solid #fed7aa',
              background: '#fff7ed',
              color: '#9a3412',
              lineHeight: 1.6,
              fontSize: 13,
            }}
          >
            <strong>Lưu ý:</strong> Không cập nhật tồn kho tại đây. Nếu cần nhập hoặc điều chỉnh số lượng, hãy dùng{' '}
            <span
              role="link"
              tabIndex={0}
              style={{ fontWeight: 800, textDecoration: 'underline', cursor: 'pointer' }}
              onClick={() => {
                onClose();
                navigate(`/warehouse/transactions/vouchers/import${product?._id ? `?productId=${product._id}` : ''}`);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onClose();
                  navigate(`/warehouse/transactions/vouchers/import${product?._id ? `?productId=${product._id}` : ''}`);
                }
              }}
            >
              phần xuất nhập kho
            </span>
            .
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-light" type="button" onClick={onClose} disabled={saving}>
            Hủy
          </button>
          <button className="btn btn-primary" type="button" onClick={() => onSave(form)} disabled={saving}>
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

        const defaultBranch = items.find((branch: BranchOption) => branch.isDefault) || items[0];
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

          <div className="products-note-card" style={{ boxShadow: 'none' }}>
            <strong>Lưu ý import</strong>
            <ul>
              <li>Chế độ thêm mới sẽ bỏ qua các dòng có mã sản phẩm đã tồn tại.</li>
              <li>Chế độ cập nhật thông tin sẽ sửa lại dữ liệu sản phẩm và cộng thêm số lượng tồn từ file.</li>
              <li>Nếu trong file có số lượng lớn hơn 0, hệ thống sẽ tự tạo phiếu nhập kho.</li>
            </ul>
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

function buildPrintDocument({
  rows,
  barcodeType,
  paper,
  marginLeft,
  marginTop,
  showStore,
  storeName,
  showCode,
  showName,
  showPrice,
  showOldPrice,
  currencySuffix,
}: {
  rows: Array<{ product: IProduct; qty: number }>;
  barcodeType: BarcodeType;
  paper: PaperTemplate;
  marginLeft: number;
  marginTop: number;
  showStore: boolean;
  storeName: string;
  showCode: boolean;
  showName: boolean;
  showPrice: boolean;
  showOldPrice: boolean;
  currencySuffix: string;
}) {
  const labels = rows.flatMap((row) => Array.from({ length: Math.max(1, row.qty) }, () => row.product));
  const labelWidth = paper.rows ? paper.widthMm / paper.columns : paper.widthMm / paper.columns;
  const labelHeight = paper.rows ? paper.heightMm / paper.rows : paper.heightMm;
  const labelHtml = labels.map((product) => {
    const value = normalizeBarcodeValue(product);
    return `<article class="print-label">
      ${showStore ? `<div class="print-store">${storeName}</div>` : ''}
      ${buildBarcodeSvg(value, barcodeType)}
      ${showCode ? `<div class="print-code">${value}</div>` : ''}
      ${showName ? `<div class="print-name">${product.name}</div>` : ''}
      ${showPrice ? `<div class="print-price">${Number(product.price || 0).toLocaleString('vi-VN')} ${currencySuffix}</div>` : ''}
      ${showOldPrice && product.oldPrice ? `<div class="print-old-price">${Number(product.oldPrice || 0).toLocaleString('vi-VN')} ${currencySuffix}</div>` : ''}
    </article>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>In mã vạch sản phẩm</title>
    <style>
      @page { size: ${paper.rows ? 'A4' : `${paper.widthMm}mm ${paper.heightMm}mm`}; margin: ${marginTop}mm 0 0 ${marginLeft}mm; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #fff; font-family: Arial, sans-serif; color: #111827; }
      .sheet { display: grid; grid-template-columns: repeat(${paper.columns}, ${labelWidth}mm); align-content: start; }
      .print-label { width: ${labelWidth}mm; height: ${labelHeight}mm; padding: 1.2mm 2mm; overflow: hidden; text-align: center; break-inside: avoid; }
      .print-store { font-size: 8px; font-weight: 700; line-height: 1; }
      .barcode-svg { width: 100%; height: ${Math.max(7, labelHeight * 0.35)}mm; display: block; fill: #000; }
      .barcode-svg.qr { height: ${Math.max(8, labelHeight * 0.46)}mm; }
      .print-code { font-size: 7px; line-height: 1.1; }
      .print-name { font-size: 8px; line-height: 1.05; max-height: 16px; overflow: hidden; }
      .print-price { font-size: 9px; font-weight: 800; line-height: 1.1; }
      .print-old-price { font-size: 8px; text-decoration: line-through; color: #6b7280; }
    </style></head><body><main class="sheet">${labelHtml}</main><script>window.onload = () => window.print();</script></body></html>`;
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
  const [rows, setRows] = useState(() => products.map((product) => ({ product, qty: 1 })));
  const [barcodeType, setBarcodeType] = useState<BarcodeType>('EAN13');
  const [paperId, setPaperId] = useState(PAPER_TEMPLATES[1].id);
  const [showAllPapers, setShowAllPapers] = useState(false);
  const [showStore, setShowStore] = useState(true);
  const [storeName, setStoreName] = useState('LADYSTARS');
  const [showCode, setShowCode] = useState(false);
  const [showName, setShowName] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [showOldPrice, setShowOldPrice] = useState(false);
  const [showThreeLineName, setShowThreeLineName] = useState(false);
  const [currencySuffix, setCurrencySuffix] = useState('đ');
  const [marginLeft, setMarginLeft] = useState(0);
  const [marginTop, setMarginTop] = useState(0);
  const [openPrintAction, setOpenPrintAction] = useState(false);
  const selectedPaper = PAPER_TEMPLATES.find((paper) => paper.id === paperId) || PAPER_TEMPLATES[1];
  const visiblePapers = showAllPapers ? PAPER_TEMPLATES : PAPER_TEMPLATES.slice(0, 1);
  const previewProduct = rows[0]?.product || products[0];
  const previewBarcodeValue = previewProduct ? normalizeBarcodeValue(previewProduct) : 'LADYSTARS';

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
    if (rows.length === 0) {
      alert('Vui lòng giữ lại ít nhất một sản phẩm để in mã vạch.');
      return;
    }

    const html = buildPrintDocument({
      rows,
      barcodeType,
      paper,
      marginLeft,
      marginTop,
      showStore,
      storeName,
      showCode,
      showName,
      showPrice,
      showOldPrice,
      currencySuffix,
    });
    const printWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (!printWindow) {
      alert('Trình duyệt đang chặn cửa sổ in. Vui lòng cho phép pop-up để xem và in.');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="barcode-page">
      <div className="barcode-page-header">
        <div>
          <button className="btn btn-light" type="button" onClick={onBack}>Quay lại danh sách</button>
          <h2>In mã vạch sản phẩm</h2>
          <p>Đang in tem cho {rows.length.toLocaleString('vi-VN')} sản phẩm đã chọn.</p>
        </div>
        <div className="products-bulk-menu">
          <button className="btn products-dropdown-button" type="button" onClick={() => setOpenPrintAction((current) => !current)}>
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
          <div className="barcode-card-title"><PackageCheck size={18} /> <strong>Sản phẩm tự chọn</strong></div>
          <div className="barcode-branch-select">- Lấy giá sản phẩm theo chi nhánh -</div>
          <div className="barcode-search-row">
            <button className="btn btn-light" type="button"><Search size={15} /></button>
            <input value="" readOnly placeholder="Nhập sản phẩm" />
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
                    <td><input className="barcode-qty" type="number" min={1} value={row.qty} onChange={(event) => updateQty(row.product._id, Number(event.target.value))} /></td>
                    <td><button className="icon-button danger" type="button" onClick={() => removeRow(row.product._id)}><Trash2 size={15} /></button></td>
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
              {showStore ? <div className="barcode-preview-store">{storeName}</div> : null}
              <BarcodeSvg value={previewBarcodeValue} type={barcodeType} />
              {showCode ? <div className="barcode-preview-code">{previewBarcodeValue}</div> : null}
              {showName ? <div className={`barcode-preview-name ${showThreeLineName ? 'three' : ''}`}>{previewProduct?.name || 'Tên sản phẩm'}</div> : null}
              {showPrice ? <div className="barcode-preview-price">{formatMoney(previewProduct?.price || 0)}</div> : null}
            </div>

            <label className="barcode-config-row">
              <span>Loại mã</span>
              <select value={barcodeType} onChange={(event) => setBarcodeType(event.target.value as BarcodeType)}>
                <option value="EAN13">EAN13</option>
                <option value="C128">C128</option>
                <option value="C39">C39</option>
                <option value="C128A">C128A</option>
                <option value="QRCODE">QRCODE</option>
              </select>
            </label>
            <label className="barcode-switch-row"><input type="checkbox" checked={showStore} onChange={(event) => setShowStore(event.target.checked)} /> Hiện tên shop</label>
            {showStore ? <input className="barcode-text-input" value={storeName} onChange={(event) => setStoreName(event.target.value)} /> : null}
            <label className="barcode-switch-row"><input type="checkbox" checked={showCode} onChange={(event) => setShowCode(event.target.checked)} /> Hiện mã sản phẩm</label>
            <label className="barcode-switch-row"><input type="checkbox" checked={showName} onChange={(event) => setShowName(event.target.checked)} /> Hiện tên sản phẩm</label>
            <label className="barcode-switch-row"><input type="checkbox" checked={showThreeLineName} onChange={(event) => setShowThreeLineName(event.target.checked)} /> Hiện 3 dòng tên sản phẩm</label>
            <label className="barcode-switch-row"><input type="checkbox" checked={showPrice} onChange={(event) => setShowPrice(event.target.checked)} /> Hiện giá sản phẩm</label>
            <label className="barcode-switch-row"><input type="checkbox" checked={showOldPrice} onChange={(event) => setShowOldPrice(event.target.checked)} /> Hiện giá cũ</label>
            <label className="barcode-config-row"><span>Đơn vị tiền sau giá bán</span><input value={currencySuffix} onChange={(event) => setCurrencySuffix(event.target.value)} /></label>
          </section>

          <section className="barcode-card">
            <div className="barcode-card-title"><Tag size={18} /> <strong>Chọn khổ giấy và in</strong></div>
            <div className="barcode-margin-row">
              <label>Trái: <input type="number" value={marginLeft} onChange={(event) => setMarginLeft(Number(event.target.value))} /></label>
              <label>Trên: <input type="number" value={marginTop} onChange={(event) => setMarginTop(Number(event.target.value))} /></label>
            </div>
            <button className="barcode-show-all" type="button" onClick={() => setShowAllPapers((current) => !current)}>
              {showAllPapers ? 'Thu gọn khổ giấy' : 'Hiển thị tất cả khổ giấy'}
            </button>
            <div className="barcode-paper-list">
              {visiblePapers.map((paper) => (
                <article className="barcode-paper-item" key={paper.id}>
                  <label>
                    <input type="radio" checked={paperId === paper.id} onChange={() => setPaperId(paper.id)} />
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

export function ProductList({ onShowHistory }: { onShowHistory?: () => void }) {
  const [items, setItems] = useState<IProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [draftSearch, setDraftSearch] = useState('');
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

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortField(field);
    setSortOrder('desc');
  };

  const handleSave = async (payload: Partial<IProduct>) => {
    if (!payload.code?.trim() || !payload.name?.trim()) {
      setSaveError('Mã và tên sản phẩm là bắt buộc.');
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
    } catch (error) {
      console.error('Lỗi đổi trạng thái sản phẩm:', error);
      alert('Đổi trạng thái sản phẩm thất bại.');
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
        onBack={() => setShowBarcodePrint(false)}
        onClearSelection={() => setSelectedIds(new Set())}
      />
    );
  }

  return (
    <div className="products-panel">
      <section className="products-control-card">
        <div className="products-control-top">
          <div className="products-title-stack">
            <h2>Danh sách sản phẩm</h2>
            <p>Giữ nguyên luồng quản lý cũ, chỉ tổ chức lại giao diện để thao tác nhanh và sáng hơn.</p>
            <div className="products-stat-row">
              <span className="record-badge">{total.toLocaleString('vi-VN')} bản ghi</span>
              <span className="products-stat-chip">
                <Boxes size={14} />
                Trang {page} / {Math.max(1, Math.ceil(total / limit))}
              </span>
              <span className="products-stat-chip">
                <ShieldAlert size={14} />
                Tồn kho vẫn cập nhật tại xuất nhập kho
              </span>
            </div>
          </div>

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
              <button className="btn btn-light" type="button" onClick={onShowHistory} title="Xem lịch sử sửa xóa">
                <Clock3 size={15} />
                Lịch sử
              </button>
            </div>
          </div>
        </div>

        <form className="products-filter-form" onSubmit={handleSearch}>
          <div className="products-filter-grid products-grid-products">
            <label className="products-inline-field">
              <span>Tên, mã sản phẩm</span>
              <div className="products-inline-control">
                <Search size={16} />
                <input
                  value={draftSearch}
                  onChange={(event) => setDraftSearch(event.target.value)}
                  placeholder="Tìm theo tên, mã hoặc barcode..."
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

          <div className="products-filter-note">
            <p>
              Bộ lọc hiện đang bám đúng API cũ: tìm kiếm theo <strong>q</strong> và lọc theo <strong>status</strong>.
            </p>
          </div>
        </form>
      </section>

      <section className="products-table-card">
        <div className="products-table-topbar">
          <div>
            <strong>Bảng dữ liệu sản phẩm</strong>
            <span>Nhấn vào tiêu đề cột để đổi thứ tự sắp xếp, giữ nguyên như hành vi ban đầu.</span>
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
                          <button className="icon-button" type="button" title="Chi tiết" onClick={() => setDetailItem(item)}>
                            <Eye size={15} />
                          </button>
                          <button
                            className="icon-button"
                            type="button"
                            title="Sửa"
                            onClick={() => {
                              setSaveError('');
                              setEditItem(item);
                            }}
                          >
                            <Pencil size={15} />
                          </button>
                          <button className="icon-button danger" type="button" title="Xóa" onClick={() => setDeleteItem(item)}>
                            <Trash2 size={15} />
                          </button>
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

      <section className="products-note-card">
        <strong>Ghi nhớ chức năng cũ</strong>
        <p>
          Các nút thêm, sửa, xóa, import, xuất Excel và liên kết sang lịch sử đều đang được giữ nguyên luồng API. Chỉ phần bố
          cục và trình bày được làm lại.
        </p>
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
