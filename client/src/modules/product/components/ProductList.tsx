import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Boxes,
  Clock3,
  Eye,
  FileDown,
  FileUp,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
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
  const limit = 20;

  const [detailItem, setDetailItem] = useState<IProduct | null>(null);
  const [editItem, setEditItem] = useState<IProduct | null | undefined>(undefined);
  const [deleteItem, setDeleteItem] = useState<IProduct | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
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
            <button className="btn btn-light" type="button" onClick={() => void load()} title="Làm mới dữ liệu">
              <RefreshCw size={15} />
              Làm mới
            </button>
            <button className="btn btn-light" type="button" onClick={onShowHistory} title="Xem lịch sử sửa xóa">
              <Clock3 size={15} />
              Lịch sử
            </button>
            <button className="btn btn-outline" type="button" onClick={() => setShowImport(true)}>
              <FileUp size={15} />
              Import
            </button>
            <button
              className="btn btn-light"
              type="button"
              style={{ borderColor: '#bbf7d0', color: '#047857' }}
              onClick={() => setShowExportModal(true)}
            >
              <FileDown size={15} />
              Xuất Excel
            </button>
            <button className="btn btn-primary" type="button" onClick={() => { setSaveError(''); setEditItem(null); }}>
              <Plus size={15} />
              Thêm sản phẩm
            </button>
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
                  <input type="checkbox" aria-label="Chọn tất cả sản phẩm" />
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
                        <input type="checkbox" aria-label={`Chọn sản phẩm ${item.code}`} />
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
