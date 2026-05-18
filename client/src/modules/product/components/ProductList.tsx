import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, FileDown, FileUp, Filter, Pencil, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { productApi } from '../../../core/api/product.api';
import type { IProduct } from '../../../types/product.type';
import { Pagination } from '../../../core/components/Pagination';

// ─── Delete Confirm Dialog ───────────────────────────────────────────────────
function DeleteConfirm({ product, onConfirm, onCancel }: { product: IProduct; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ color: '#b91c1c' }}>Xác nhận xóa</h2>
            <p>Thao tác này không thể hoàn tác.</p>
          </div>
          <button className="icon-button" onClick={onCancel}><X size={18} /></button>
        </div>
        <div style={{ padding: '18px' }}>
          <p>Bạn có chắc chắn muốn xóa sản phẩm <strong>"{product.name}"</strong> ({product.code})?</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-light" onClick={onCancel}>Hủy</button>
          <button className="btn btn-primary" style={{ background: '#ef4444', borderColor: '#ef4444' }} onClick={onConfirm}>
            <Trash2 size={16} /> Xóa
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Modal ────────────────────────────────────────────────────────────
function DetailModal({ product, onClose }: { product: IProduct; onClose: () => void }) {
  const fmt = (v?: number) => `${Number(v || 0).toLocaleString('vi-VN')} đ`;
  const statusLabel = (s?: string) => s || 'Mới';
  const statusCls = (s?: string) => {
    const v = (s || '').toLowerCase();
    if (['mới', 'active'].includes(v)) return 'success';
    if (['ngừng', 'inactive'].includes(v)) return 'danger';
    return 'warning';
  };

  const rows: [string, string][] = [
    ['Mã sản phẩm', product.code],
    ['Barcode', product.barcode || '—'],
    ['Loại', product.type || '—'],
    ['Danh mục', product.categoryName || '—'],
    ['Thương hiệu', product.trademarkName || '—'],
    ['Nhà cung cấp', product.supplierName || '—'],
    ['Đơn vị', product.unit || '—'],
    ['Giá vốn', fmt(product.cost)],
    ['Giá bán', fmt(product.price)],
    ['Giá bán lẻ', fmt(product.branchPrice)],
    ['Giá cũ', fmt(product.oldPrice)],
    ['Giá sỉ', fmt(product.wholesalePrice)],
    ['VAT (%)', String(product.vat ?? '—')],
    ['Tổng tồn', String(product.qty ?? 0)],
    ['Khả dụng', String(product.availableStock ?? 0)],
    ['Bảo hành (tháng)', String(product.warrantyMonths ?? '—')],
    ['Màu sắc', product.color || '—'],
    ['Kích cỡ', product.size || '—'],
    ['Xuất xứ', product.origin || '—'],
    ['Ngày tạo', new Date(product.createdAt).toLocaleDateString('vi-VN')],
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <div>
            <h2>Chi tiết sản phẩm</h2>
            <p>{product.name}</p>
          </div>
          <button className="icon-button" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ padding: '18px' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px' }}>
            <span className={`status-badge ${statusCls(product.status)}`}>{statusLabel(product.status)}</span>
          </div>
          <div className="form-grid">
            {rows.map(([label, value]) => (
              <div className="form-field" key={label}>
                <span>{label}</span>
                <div style={{ padding: '9px 11px', border: '1px solid var(--border)', borderRadius: '8px', background: '#f8fafc', color: '#1e293b' }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-light" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit / Create Modal ─────────────────────────────────────────────────────
interface ProductFormProps {
  product?: IProduct | null;
  onSave: (data: Partial<IProduct>) => void;
  onClose: () => void;
  saving: boolean;
  error?: string;
}

function ProductForm({ product, onSave, onClose, saving, error }: ProductFormProps) {
  const isEdit = !!product;
  const [form, setForm] = useState<Partial<IProduct>>(product ? { ...product } : { type: 'Sản phẩm', status: 'Mới' });

  const set = (k: keyof IProduct, v: string | number) => setForm(f => ({ ...f, [k]: v }));

  const fields: { key: keyof IProduct; label: string; type?: string; options?: string[] }[] = [
    { key: 'code', label: 'Mã sản phẩm *' },
    { key: 'name', label: 'Tên sản phẩm *' },
    { key: 'barcode', label: 'Mã vạch' },
    { key: 'type', label: 'Loại sản phẩm', options: ['Sản phẩm', 'Dịch vụ', 'Combo'] },
    { key: 'unit', label: 'Đơn vị' },
    { key: 'status', label: 'Trạng thái', options: ['Mới', 'Đang giao', 'Ngừng'] },
    { key: 'cost', label: 'Giá vốn', type: 'number' },
    { key: 'price', label: 'Giá bán', type: 'number' },
    { key: 'wholesalePrice', label: 'Giá sỉ', type: 'number' },
    { key: 'vat', label: 'VAT (%)', type: 'number' },
    { key: 'warrantyMonths', label: 'Bảo hành (tháng)', type: 'number' },
    { key: 'weight', label: 'Khối lượng (g)', type: 'number' },
    { key: 'color', label: 'Màu sắc' },
    { key: 'size', label: 'Kích cỡ' },
    { key: 'origin', label: 'Xuất xứ' },
    { key: 'categoryName', label: 'Danh mục' },
    { key: 'trademarkName', label: 'Thương hiệu' },
    { key: 'supplierName', label: 'Nhà cung cấp' },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <div>
            <h2>{isEdit ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}</h2>
            <p>{isEdit ? `Đang sửa: ${product?.name}` : 'Điền thông tin để tạo sản phẩm mới'}</p>
          </div>
          <button className="icon-button" onClick={onClose}><X size={18} /></button>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-grid">
          {fields.map(f => (
            <div className="form-field" key={f.key}>
              <span>{f.label}</span>
              {f.options ? (
                <select value={String(form[f.key] ?? '')} onChange={e => set(f.key, e.target.value)}>
                  <option value="">-- Chọn --</option>
                  {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  type={f.type || 'text'}
                  value={String(form[f.key] ?? '')}
                  onChange={e => set(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn btn-light" onClick={onClose} disabled={saving}>Hủy</button>
          <button className="btn btn-primary" disabled={saving} onClick={() => onSave(form)}>
            {saving ? 'Đang lưu...' : (isEdit ? 'Cập nhật' : 'Tạo sản phẩm')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Import Modal ────────────────────────────────────────────────────────────
function ImportModal({ onClose }: { onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState('');

  const handleImport = async () => {
    if (!file) { setMsg('Vui lòng chọn file.'); return; }
    const fd = new FormData();
    fd.append('file', file);
    try {
      setMsg('Đang nhập...');
      // NOTE: update endpoint when server supports it
      // await http.post('/products/products/import', fd);
      setMsg('Nhập file thành công! (Demo - endpoint chưa có)');
    } catch {
      setMsg('Lỗi khi nhập file.');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div><h2>Nhập File (Import)</h2><p>Chọn file Excel (.xlsx) để nhập sản phẩm</p></div>
          <button className="icon-button" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div
            style={{ border: '2px dashed var(--border)', borderRadius: '8px', padding: '32px', textAlign: 'center', cursor: 'pointer', background: '#f8fafc' }}
            onClick={() => fileRef.current?.click()}
          >
            <FileUp size={32} style={{ color: 'var(--muted)', marginBottom: '8px' }} />
            <p style={{ margin: 0, color: 'var(--muted)', fontWeight: 700 }}>{file ? file.name : 'Click để chọn file Excel (.xlsx)'}</p>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] || null)} />
          {msg && <p style={{ margin: 0, color: msg.includes('Lỗi') ? '#b91c1c' : '#047857', fontWeight: 700 }}>{msg}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-light" onClick={onClose}>Đóng</button>
          <button className="btn btn-primary" onClick={handleImport}><FileUp size={16} /> Nhập file</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function ProductList() {
  const [items, setItems] = useState<IProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [sortField, setSortField] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  // Modals
  const [detailItem, setDetailItem] = useState<IProduct | null>(null);
  const [editItem, setEditItem] = useState<IProduct | null | undefined>(undefined); // undefined = closed, null = create new
  const [deleteItem, setDeleteItem] = useState<IProduct | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await productApi.getProducts({
        page,
        limit,
        q: search || undefined,
        status: filterStatus || undefined,
        sort: sortField,
        order: sortOrder
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, filterStatus, sortField, sortOrder]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  const handleSort = (field: string) => {
    if (sortField === field) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortOrder('desc'); }
  };

  const handleSave = async (data: Partial<IProduct>) => {
    if (!data.code?.trim() || !data.name?.trim()) { setSaveError('Mã và tên sản phẩm là bắt buộc.'); return; }
    setSaving(true); setSaveError('');
    try {
      if (editItem?._id) await productApi.updateProduct(editItem._id, data);
      else await productApi.createProduct(data);
      setEditItem(undefined);
      setPage(1);
      load();
    } catch (err: any) {
      setSaveError(err?.response?.data?.message || 'Lưu thất bại. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    try {
      await productApi.deleteProduct(deleteItem._id);
      setDeleteItem(null);
      load();
    } catch {
      alert('Xóa thất bại!');
    }
  };

  const handleExport = useCallback(async () => {
    try {
      // Fetch all matching products (up to 5000) without pagination
      const res = await productApi.getProducts({
        page: 1,
        limit: 5000,
        q: search || undefined,
        status: filterStatus || undefined,
        sort: sortField,
        order: sortOrder,
      });

      const headers = ['Mã SP', 'Tên sản phẩm', 'Mã vạch', 'Danh mục', 'Nhà cung cấp', 'Đơn vị', 'Giá vốn', 'Giá bán', 'Giá sỉ', 'Tổng tồn', 'Trạng thái', 'Ngày tạo'];
      const rows = res.items.map(p => [
        p.code,
        p.name,
        p.barcode ?? '',
        p.categoryName ?? '',
        p.supplierName ?? '',
        p.unit ?? '',
        p.cost ?? 0,
        p.price ?? 0,
        p.wholesalePrice ?? 0,
        p.qty ?? 0,
        p.status ?? 'Mới',
        new Date(p.createdAt).toLocaleDateString('vi-VN'),
      ]);

      const escape = (v: string | number) => {
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
      };

      const csvContent = '\uFEFF' + // BOM for Excel UTF-8
        [headers, ...rows].map(row => row.map(escape).join(',')).join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `san-pham-${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Xuất file thất bại!');
    }
  }, [search, filterStatus, sortField, sortOrder]);

  const fmt = (v?: number) => `${Number(v || 0).toLocaleString('vi-VN')} đ`;

  const statusCls = (s?: string) => {
    const v = (s || '').toLowerCase();
    if (['mới', 'active'].includes(v)) return 'success';
    if (['ngừng', 'inactive'].includes(v)) return 'danger';
    if (v) return 'warning';
    return '';
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown size={13} style={{ opacity: 0.3 }} />;
    return sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />;
  };

  const thStyle = { cursor: 'pointer', userSelect: 'none' as const };
  const thInner = { display: 'flex', alignItems: 'center', gap: '4px' };

  return (
    <div className="page-stack">
      <div className="module-grid">
        {/* Filter Panel */}
        <aside className="filter-panel">
          <div className="panel-title"><Filter size={18} /><span>Bộ lọc</span></div>
          <form onSubmit={handleSearch}>
            <label className="field-label">Tìm kiếm</label>
            <div className="search-box">
              <Search size={16} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tên SP, mã, barcode..." />
            </div>
            <label className="field-label" style={{ marginTop: '16px' }}>Trạng thái</label>
            <div className="quick-filter-list">
              {[['', 'Tất cả'], ['Mới', 'Mới'], ['Đang giao', 'Đang giao'], ['Ngừng', 'Ngừng']].map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  className={filterStatus === val ? 'active' : ''}
                  onClick={() => { setFilterStatus(val); setPage(1); }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button type="submit" style={{ marginTop: '12px' }} className="btn btn-outline full">
              <Search size={15} /> Tìm kiếm
            </button>
          </form>
        </aside>

        {/* Data Card */}
        <section className="data-card">
          <div className="data-card-header">
            <div>
              <h2>Sản phẩm</h2>
              <span className="record-badge">{total} bản ghi</span>
            </div>
            <div className="page-actions">
              <button className="btn btn-light" onClick={load} title="Làm mới"><RefreshCw size={15} /> Làm mới</button>
              <button className="btn btn-outline" onClick={() => setShowImport(true)}><FileUp size={15} /> Import</button>
              <button className="btn btn-light" style={{ borderColor: '#bbf7d0', color: '#047857' }} onClick={handleExport}><FileDown size={15} /> Xuất Excel</button>
              <button className="btn btn-primary" onClick={() => { setSaveError(''); setEditItem(null); }}><Plus size={15} /> Thêm sản phẩm</button>
            </div>
          </div>

          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="check-cell"><input type="checkbox" /></th>
                  <th style={thStyle} onClick={() => handleSort('code')}><div style={thInner}><SortIcon field="code" />Mã SP</div></th>
                  <th style={thStyle} onClick={() => handleSort('name')}><div style={thInner}><SortIcon field="name" />Tên sản phẩm</div></th>
                  <th style={thStyle} onClick={() => handleSort('barcode')}><div style={thInner}><SortIcon field="barcode" />Mã vạch</div></th>
                  <th style={thStyle} onClick={() => handleSort('cost')}><div style={thInner}><SortIcon field="cost" />Giá nhập</div></th>
                  <th style={thStyle} onClick={() => handleSort('price')}><div style={thInner}><SortIcon field="price" />Giá bán</div></th>
                  <th style={thStyle} onClick={() => handleSort('qty')}><div style={thInner}><SortIcon field="qty" />Tổng tồn</div></th>
                  <th style={thStyle} onClick={() => handleSort('status')}><div style={thInner}><SortIcon field="status" />Trạng thái</div></th>
                  <th className="action-cell" style={{ width: 120 }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={9} className="empty-cell">Đang tải dữ liệu...</td></tr>}
                {!loading && items.length === 0 && <tr><td colSpan={9} className="empty-cell">Chưa có dữ liệu.</td></tr>}
                {!loading && items.map(item => (
                  <tr key={item._id}>
                    <td className="check-cell"><input type="checkbox" /></td>
                    <td><strong>{item.code}</strong></td>
                    <td style={{ maxWidth: 240 }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                      {item.categoryName && <small style={{ color: '#64748b' }}>{item.categoryName}</small>}
                    </td>
                    <td>{item.barcode || '—'}</td>
                    <td>{fmt(item.cost)}</td>
                    <td>{fmt(item.price)}</td>
                    <td>{Number(item.qty || 0).toLocaleString('vi-VN')}</td>
                    <td>
                      <span className={`status-badge ${statusCls(item.status)}`}>
                        {item.status || 'Mới'}
                      </span>
                    </td>
                    <td className="action-cell" style={{ whiteSpace: 'nowrap' }}>
                      <button className="icon-button" title="Chi tiết" onClick={() => setDetailItem(item)}><Eye size={15} /></button>
                      <button className="icon-button" title="Sửa" style={{ margin: '0 4px' }} onClick={() => { setSaveError(''); setEditItem(item); }}><Pencil size={15} /></button>
                      <button className="icon-button danger" title="Xóa" onClick={() => setDeleteItem(item)}><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
        </section>
      </div>

      {/* Modals */}
      {detailItem && <DetailModal product={detailItem} onClose={() => setDetailItem(null)} />}
      {editItem !== undefined && (
        <ProductForm
          product={editItem}
          onSave={handleSave}
          onClose={() => setEditItem(undefined)}
          saving={saving}
          error={saveError}
        />
      )}
      {deleteItem && <DeleteConfirm product={deleteItem} onConfirm={handleDelete} onCancel={() => setDeleteItem(null)} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </div>
  );
}
