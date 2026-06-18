import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, FileDown, FileUp, Filter, Layers, Pencil, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { productApi } from '../../core/api/product.api';
import type { IProduct, IBatch } from '../../types/product.type';
import { Pagination } from '../../core/components/Pagination';

function DeleteConfirm({ batch, onConfirm, onCancel }: { batch: IBatch; onConfirm: () => void; onCancel: () => void }) {
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
          <p>Bạn có chắc chắn muốn xóa lô sản phẩm <strong>"{batch.batchNumber}"</strong>?</p>
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

function DetailModal({ batch, onClose }: { batch: IBatch; onClose: () => void }) {
  const fmt = (v?: number) => `${Number(v || 0).toLocaleString('vi-VN')} đ`;
  const product = batch.productId as IProduct | null;

  const getDaysRemaining = (expiryDateStr?: string) => {
    if (!expiryDateStr) return '—';
    const expiry = new Date(expiryDateStr);
    const today = new Date();
    expiry.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return `Quá hạn ${Math.abs(diffDays)} ngày`;
    if (diffDays === 0) return 'Hết hạn hôm nay';
    return `${diffDays} ngày`;
  };

  const statusCls = (s?: string) => {
    const v = (s || '').toLowerCase();
    if (v === 'còn hạn') return 'success';
    if (v === 'sắp hết hạn') return 'warning';
    if (v === 'hết hạn') return 'danger';
    if (v === 'ngừng sử dụng') return 'danger';
    return '';
  };

  const rows: [string, string][] = [
    ['Số lô hàng', batch.batchNumber],
    ['Sản phẩm liên kết', product ? `${product.name} (${product.code})` : '—'],
    ['Đơn vị sản phẩm', product?.unit || '—'],
    ['Giá nhập lô', fmt(batch.cost)],
    ['Số tồn lô hàng', String(batch.qty ?? 0)],
    ['Ngày sản xuất', batch.manufactureDate ? new Date(batch.manufactureDate).toLocaleDateString('vi-VN') : '—'],
    ['Ngày hết hạn', batch.expiryDate ? new Date(batch.expiryDate).toLocaleDateString('vi-VN') : '—'],
    ['Số ngày còn lại', getDaysRemaining(batch.expiryDate)],
    ['Ghi chú', batch.note || '—'],
    ['Ngày tạo bản ghi', new Date(batch.createdAt).toLocaleDateString('vi-VN')],
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <div>
            <h2>Chi tiết lô sản phẩm</h2>
            <p>Lô: {batch.batchNumber}</p>
          </div>
          <button className="icon-button" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ padding: '18px' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px' }}>
            <span className={`status-badge ${statusCls(batch.status)}`}>{batch.status || 'Còn hạn'}</span>
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

interface BatchFormProps {
  batch?: IBatch | null;
  onSave: (data: Partial<IBatch>) => void;
  onClose: () => void;
  saving: boolean;
  error?: string;
}

function BatchForm({ batch, onSave, onClose, saving, error }: BatchFormProps) {
  const isEdit = !!batch;

  const formatDateForInput = (d?: string) => {
    if (!d) return '';
    return new Date(d).toISOString().slice(0, 10);
  };

  const [form, setForm] = useState<Partial<IBatch>>(
    batch
      ? {
        ...batch,
        productId: (batch.productId && typeof batch.productId === 'object') ? batch.productId._id : (batch.productId || ''),
        manufactureDate: formatDateForInput(batch.manufactureDate),
        expiryDate: formatDateForInput(batch.expiryDate),
      }
      : { status: 'Còn hạn', qty: 0, cost: 0 }
  );

  const [products, setProducts] = useState<IProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  useEffect(() => {
    setLoadingProducts(true);
    productApi.getProducts({ limit: 1000 })
      .then(res => {
        setProducts(res.items);
      })
      .catch(err => console.error('Error fetching products for dropdown:', err))
      .finally(() => setLoadingProducts(false));
  }, []);

  const set = (k: keyof IBatch, v: any) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <div>
            <h2>{isEdit ? 'Sửa lô sản phẩm' : 'Thêm lô sản phẩm'}</h2>
            <p>{isEdit ? `Đang sửa lô: ${batch?.batchNumber}` : 'Điền thông tin để tạo lô sản phẩm mới'}</p>
          </div>
          <button className="icon-button" onClick={onClose}><X size={18} /></button>
        </div>
        {error && <div className="form-error" style={{ margin: '16px' }}>{error}</div>}

        <div className="form-grid" style={{ padding: '16px' }}>
          <div className="form-field">
            <span>Số lô hàng *</span>
            <input
              type="text"
              placeholder="VD: LOT-2026-05"
              value={form.batchNumber || ''}
              onChange={e => set('batchNumber', e.target.value)}
            />
          </div>

          <div className="form-field">
            <span>Sản phẩm liên kết *</span>
            <select
              value={String(form.productId || '')}
              onChange={e => set('productId', e.target.value)}
              disabled={loadingProducts}
            >
              <option value="">-- Chọn sản phẩm --</option>
              {products.map(p => (
                <option key={p._id} value={p._id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <span>Giá nhập lô</span>
            <input
              type="number"
              min="0"
              value={form.cost ?? ''}
              onChange={e => set('cost', Number(e.target.value))}
            />
          </div>

          <div className="form-field">
            <span>Số tồn lô hàng</span>
            <input
              type="number"
              min="0"
              value={form.qty ?? ''}
              onChange={e => set('qty', Number(e.target.value))}
            />
          </div>

          <div className="form-field">
            <span>Ngày sản xuất</span>
            <input
              type="date"
              value={form.manufactureDate || ''}
              onChange={e => set('manufactureDate', e.target.value)}
            />
          </div>

          <div className="form-field">
            <span>Ngày hết hạn</span>
            <input
              type="date"
              value={form.expiryDate || ''}
              onChange={e => set('expiryDate', e.target.value)}
            />
          </div>

          <div className="form-field">
            <span>Trạng thái</span>
            <select
              value={form.status || 'Còn hạn'}
              onChange={e => set('status', e.target.value)}
            >
              <option value="Còn hạn">Còn hạn</option>
              <option value="Sắp hết hạn">Sắp hết hạn</option>
              <option value="Hết hạn">Hết hạn</option>
              <option value="Ngừng sử dụng">Ngừng sử dụng</option>
            </select>
          </div>

          <div className="form-field" style={{ gridColumn: 'span 2' }}>
            <span>Ghi chú</span>
            <input
              type="text"
              value={form.note || ''}
              onChange={e => set('note', e.target.value)}
              placeholder="Nhập ghi chú thêm..."
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-light" onClick={onClose} disabled={saving}>Hủy</button>
          <button className="btn btn-primary" disabled={saving} onClick={() => onSave(form)}>
            {saving ? 'Đang lưu...' : (isEdit ? 'Cập nhật' : 'Tạo lô sản phẩm')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    if (!file) { setMsg('Vui lòng chọn file.'); return; }
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { setMsg('Chỉ hỗ trợ file .xlsx, .xls hoặc .csv.'); return; }
    try {
      setImporting(true);
      setErrors([]);
      setMsg('Đang nhập...');
      const res = await productApi.importBatches(file, 'upsert');
      const summary = res.summary;
      setMsg(`Import xong: tạo ${summary.created}, cập nhật ${summary.updated}, bỏ qua ${summary.skipped}, lỗi ${summary.errors?.length || 0}.`);
      setErrors(summary.errors || []);
      onImported();
    } catch (err: any) {
      setMsg(err?.response?.data?.message || 'Lỗi khi nhập file.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div><h2>Nhập File Lô Hàng (Import)</h2><p>Chọn file Excel (.xlsx) để nhập danh sách lô</p></div>
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
          {errors.length > 0 && (
            <div style={{ maxHeight: 140, overflowY: 'auto', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 10 }}>
              {errors.map((error, index) => <div key={index} style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>)}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-light" onClick={onClose} disabled={importing}>Đóng</button>
          <button className="btn btn-primary" onClick={handleImport} disabled={importing}><FileUp size={16} /> {importing ? 'Đang nhập...' : 'Nhập file'}</button>
        </div>
      </div>
    </div>
  );
}

export function BatchPage() {
  const [items, setItems] = useState<IBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [sortField, setSortField] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 15;

  const [detailItem, setDetailItem] = useState<IBatch | null>(null);
  const [editItem, setEditItem] = useState<IBatch | null | undefined>(undefined);
  const [deleteItem, setDeleteItem] = useState<IBatch | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await productApi.getBatches({
        page,
        limit,
        q: search || undefined,
        status: filterStatus || undefined,
        sort: sortField,
        order: sortOrder,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      console.error('Error loading batches:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [page, filterStatus, sortField, sortOrder]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(o => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleSave = async (data: Partial<IBatch>) => {
    if (!data.batchNumber?.trim() || !data.productId) {
      setSaveError('Số lô hàng và sản phẩm liên kết là bắt buộc.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      if (editItem?._id) {
        await productApi.updateBatch(editItem._id, data);
      } else {
        await productApi.createBatch(data);
      }
      setEditItem(undefined);
      setPage(1);
      load();
    } catch (err: any) {
      setSaveError(err?.response?.data?.message || 'Lưu thất bại. Vui lòng kiểm tra lại dữ liệu.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    try {
      await productApi.deleteBatch(deleteItem._id);
      setDeleteItem(null);
      load();
    } catch {
      alert('Xóa thất bại!');
    }
  };

  const handleExport = useCallback(async () => {
    try {
      const res = await productApi.getBatches({
        page: 1,
        limit: 5000,
        q: search || undefined,
        status: filterStatus || undefined,
        sort: sortField,
        order: sortOrder,
      });

      const headers = ['Số lô', 'Mã sản phẩm', 'Tên sản phẩm', 'Giá nhập', 'Số tồn', 'Ngày sản xuất', 'Ngày hết hạn', 'Trạng thái', 'Ghi chú'];
      const rows = res.items.map(b => {
        const prod = b.productId as IProduct | null;
        return [
          b.batchNumber,
          prod ? prod.code : '',
          prod ? prod.name : '',
          b.cost ?? 0,
          b.qty ?? 0,
          b.manufactureDate ? new Date(b.manufactureDate).toLocaleDateString('vi-VN') : '',
          b.expiryDate ? new Date(b.expiryDate).toLocaleDateString('vi-VN') : '',
          b.status || 'Còn hạn',
          b.note ?? '',
        ];
      });

      const escape = (v: string | number) => {
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
      };

      const csvContent = '\uFEFF' + [headers, ...rows].map(row => row.map(escape).join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lo-san-pham-${new Date().toISOString().slice(0, 10)}.csv`;
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

  const getDaysRemaining = (expiryDateStr?: string) => {
    if (!expiryDateStr) return '—';
    const expiry = new Date(expiryDateStr);
    const today = new Date();
    expiry.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return `Quá hạn ${Math.abs(diffDays)} ngày`;
    if (diffDays === 0) return 'Hết hạn hôm nay';
    return `${diffDays} ngày`;
  };

  const statusCls = (s?: string) => {
    const v = (s || '').toLowerCase();
    if (v === 'còn hạn') return 'success';
    if (v === 'sắp hết hạn') return 'warning';
    if (v === 'hết hạn') return 'danger';
    if (v === 'ngừng sử dụng') return 'danger';
    return '';
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown size={13} style={{ opacity: 0.3 }} />;
    return sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />;
  };

  const thStyle = { cursor: 'pointer', userSelect: 'none' as const };
  const thInner = { display: 'flex', alignItems: 'center', gap: '4px' };
  const statusOptions: Array<[string, string]> = [
    ['', 'Tất cả'],
    ['Còn hạn', 'Còn hạn'],
    ['Sắp hết hạn', 'Sắp hết hạn'],
    ['Hết hạn', 'Hết hạn'],
    ['Ngừng sử dụng', 'Ngừng sử dụng'],
  ];

  return (
    <div className="workspace-page batch-page">
      <div className="page-heading">
        <div className="page-title-block">
          <div className="page-icon"><Layers size={22} /></div>
          <div>
            <h1>Lô sản phẩm</h1>
            <p>Quản lý hạn dùng, số lô và tồn kho theo từng lô hàng mà không thay đổi logic dữ liệu hiện có.</p>
          </div>
        </div>
      </div>

      <div className="page-stack batch-page-stack">
        <section className="data-card batch-toolbar-card">
          <div className="batch-toolbar-top">
            <div className="batch-toolbar-summary">
              <div className="batch-toolbar-summary-title">
                <Filter size={18} />
                <span>Bộ lọc và thao tác</span>
              </div>
              <p>Giữ nguyên search, filter trạng thái, import/export và các thao tác tạo sửa xóa hiện có.</p>
            </div>

            <div className="page-actions batch-toolbar-actions">
              <button
                className="btn btn-primary batch-btn-add"
                aria-label="Thêm lô hàng"
                onClick={() => { setSaveError(''); setEditItem(null); }}
              >
                <Plus size={15} /> Thêm mới
              </button>
              <button className="btn btn-outline" onClick={() => setShowImport(true)}>
                <FileUp size={15} /> Import
              </button>
              <button
                className="btn btn-light batch-btn-export"
                aria-label="Xuất Excel"
                onClick={handleExport}
              >
                <FileDown size={15} /> Xuất dữ liệu
              </button>
              <button className="btn btn-light" onClick={load} title="Làm mới">
                <RefreshCw size={15} /> Làm mới
              </button>
            </div>
          </div>

          <form className="batch-filter-form" onSubmit={handleSearch}>
            <label className="batch-filter-field">
              <span>ID / Lô sản phẩm</span>
              <div className="search-box batch-filter-input">
                <Search size={16} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Nhập số lô..."
                />
              </div>
            </label>

            <label className="batch-filter-field">
              <span>Trạng thái</span>
              <select
                className="batch-filter-select"
                value={filterStatus}
                onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
              >
                {statusOptions.map(([value, label]) => (
                  <option key={value || 'all'} value={value}>{label}</option>
                ))}
              </select>
            </label>

            <div className="batch-filter-actions">
              <button type="submit" className="btn btn-primary" aria-label="Tìm kiếm">
                <Search size={15} /> Lọc
              </button>
            </div>
          </form>

          <div className="quick-filter-list batch-quick-filter-list">
            {statusOptions.map(([val, label]) => (
              <button
                key={val || 'all'}
                type="button"
                className={filterStatus === val ? 'active' : ''}
                onClick={() => { setFilterStatus(val); setPage(1); }}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="data-card batch-table-card">
          <div className="data-card-header batch-table-header">
            <div>
              <h2>Danh sách lô hàng</h2>
              <p className="batch-table-subtitle">Bảng dữ liệu đang giữ nguyên sort, modal thao tác và phân trang.</p>
            </div>
            <span className="record-badge">{total} bản ghi</span>
          </div>

          <div className="table-scroll">
            <table className="data-table batch-data-table">
              <thead>
                <tr>
                  <th className="check-cell"><input type="checkbox" /></th>
                  <th>ID</th>
                  <th style={thStyle} onClick={() => handleSort('batchNumber')}><div style={thInner}><SortIcon field="batchNumber" />Số lô</div></th>
                  <th>Tên sản phẩm</th>
                  <th style={thStyle} onClick={() => handleSort('status')}><div style={thInner}><SortIcon field="status" />Trạng thái</div></th>
                  <th style={thStyle} onClick={() => handleSort('cost')}><div style={thInner}><SortIcon field="cost" />Giá nhập</div></th>
                  <th style={thStyle} onClick={() => handleSort('manufactureDate')}><div style={thInner}><SortIcon field="manufactureDate" />Ngày sản xuất</div></th>
                  <th style={thStyle} onClick={() => handleSort('expiryDate')}><div style={thInner}><SortIcon field="expiryDate" />Ngày hết hạn</div></th>
                  <th>Số ngày còn hạn</th>
                  <th style={thStyle} onClick={() => handleSort('qty')}><div style={thInner}><SortIcon field="qty" />Số tồn</div></th>
                  <th className="action-cell" style={{ width: 120 }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={11} className="empty-cell">Đang tải dữ liệu...</td></tr>}
                {!loading && items.length === 0 && <tr><td colSpan={11} className="empty-cell">Chưa có lô hàng nào được ghi nhận.</td></tr>}
                {!loading && items.map((item, index) => {
                  const prod = item.productId as IProduct | null;
                  const rowNumber = ((page - 1) * limit) + index + 1;

                  return (
                    <tr key={item._id}>
                      <td className="check-cell"><input type="checkbox" /></td>
                      <td className="batch-row-id">{rowNumber}</td>
                      <td><strong>{item.batchNumber}</strong></td>
                      <td style={{ maxWidth: 220 }}>
                        <div className="batch-product-cell" title={prod?.name || ''}>
                          {prod?.name || '—'}
                        </div>
                        {prod && <small style={{ color: '#64748b' }}>Mã SP: {prod.code}</small>}
                      </td>
                      <td>
                        <span className={`status-badge ${statusCls(item.status)}`}>
                          {item.status || 'Còn hạn'}
                        </span>
                      </td>
                      <td>{fmt(item.cost)}</td>
                      <td>{item.manufactureDate ? new Date(item.manufactureDate).toLocaleDateString('vi-VN') : '—'}</td>
                      <td>{item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('vi-VN') : '—'}</td>
                      <td>{getDaysRemaining(item.expiryDate)}</td>
                      <td>{Number(item.qty || 0).toLocaleString('vi-VN')}</td>
                      <td className="action-cell batch-action-cell">
                        <button className="icon-button" title="Chi tiết" onClick={() => setDetailItem(item)}><Eye size={15} /></button>
                        <button className="icon-button" title="Sửa" style={{ margin: '0 4px' }} onClick={() => { setSaveError(''); setEditItem(item); }}><Pencil size={15} /></button>
                        <button className="icon-button danger" title="Xóa" onClick={() => setDeleteItem(item)}><Trash2 size={15} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
        </section>
      </div>

      {detailItem && <DetailModal batch={detailItem} onClose={() => setDetailItem(null)} />}
      {editItem !== undefined && (
        <BatchForm
          batch={editItem}
          onSave={handleSave}
          onClose={() => setEditItem(undefined)}
          saving={saving}
          error={saveError}
        />
      )}
      {deleteItem && <DeleteConfirm batch={deleteItem} onConfirm={handleDelete} onCancel={() => setDeleteItem(null)} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} onImported={load} />}
    </div>
  );
}
