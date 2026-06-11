import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Settings2, Shuffle, ChevronRight } from 'lucide-react';
import { http } from '../../core/api/http';

type Product = {
  _id: string;
  code: string;
  name: string;
  price: number;
  cost: number;
  qty: number;
  unit?: string;
};

type TransferLine = {
  productId: string;
  batchCode: string;
  imei: string;
  unit: string;
  quantity: number;
  note: string;
};

// const WAREHOUSES = ['Kho tổng', 'Cửa hàng chi nhánh 1', 'Cửa hàng chi nhánh 2', 'Kho bảo hành'];

const MOCK_PRODUCTS: Product[] = [
  { _id: 'mock-1', code: 'SP001', name: 'Kem chống nắng LadyStars SPF 50+', price: 150000, cost: 90000, qty: 120, unit: 'tuýp' },
  { _id: 'mock-2', code: 'SP002', name: 'Sữa rửa mặt dịu nhẹ LadyStars', price: 120000, cost: 70000, qty: 85, unit: 'chai' },
  { _id: 'mock-3', code: 'SP003', name: 'Serum tế bào gốc trẻ hóa da', price: 450000, cost: 280000, qty: 40, unit: 'lọ' },
  { _id: 'mock-4', code: 'SP004', name: 'Son dưỡng môi nhung mịn LadyStars', price: 95000, cost: 55000, qty: 150, unit: 'thỏi' },
];

export function WarehouseTransferCreatePage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const [fromWarehouse, setFromWarehouse] = useState('');
  const [toWarehouse, setToWarehouse] = useState('');
  const [sysBranches, setSysBranches] = useState<any[]>([]);
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [afterSubmitAction, setAfterSubmitAction] = useState<'detail' | 'continue'>('detail');
  const [searchQuery, setSearchQuery] = useState('');
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [showConfig, setShowConfig] = useState(false);
  const [colVisible, setColVisible] = useState({
    stt: true, image: false, batch: true, imei: true, unit: true, note: false,
  });

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await http.get('/products/products', { params: { limit: 100 } });
        const items = response.data?.items;
        setProducts(items?.length ? items : MOCK_PRODUCTS);
      } catch {
        setProducts(MOCK_PRODUCTS);
      }
    };
    const fetchBranches = async () => {
      try {
        const res = await http.get('/system/branches');
        const branches = res.data?.items || [];
        setSysBranches(branches);
        if (branches.length > 0) {
          setFromWarehouse(branches[0]._id);
          setToWarehouse(branches.length > 1 ? branches[1]._id : branches[0]._id);
        }
      } catch (err) {}
    };
    fetchProducts();
    fetchBranches();
  }, []);

  useEffect(() => {
    if (products.length > 0 && lines.length === 0) {
      setLines([createLine(products[0])]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  function createLine(product: Product): TransferLine {
    return { productId: product._id, batchCode: '', imei: '', unit: product.unit || 'cái', quantity: 1, note: '' };
  }

  const addLine = () => {
    if (!products.length) return;
    setLines(prev => [...prev, createLine(products[0])]);
  };

  const removeLine = (i: number) => setLines(prev => prev.filter((_, idx) => idx !== i));

  const updateLine = (i: number, field: keyof TransferLine, value: string | number) => {
    setLines(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === 'productId') {
        const p = products.find(x => x._id === value);
        if (p) next[i].unit = p.unit || 'cái';
      }
      return next;
    });
  };

  const totalQty = useMemo(() => lines.reduce((s, l) => s + (l.quantity || 0), 0), [lines]);
  const totalSP = lines.length;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setSuccessMsg('');
    if (!lines.length) { setError('Vui lòng thêm ít nhất 1 sản phẩm.'); return; }
    if (lines.some(l => !l.productId || l.quantity <= 0)) {
      setError('Tất cả sản phẩm phải có số lượng > 0.'); return;
    }
    setSaving(true);
    try {
      const fromBranch = sysBranches.find(b => b._id === fromWarehouse);
      const toBranch = sysBranches.find(b => b._id === toWarehouse);

      await http.post('/warehouse/transfers', {
        id: `TRF${Date.now()}`, date: new Date().toISOString(),
        tabs: ['all', 'draft'], type: 'Chuyển kho',
        fromWarehouse, toWarehouse, 
        warehouse: `${fromBranch?.name || fromWarehouse} -> ${toBranch?.name || toWarehouse}`,
        label, note,
        qty: totalQty, spCount: totalSP, creator: 'Current User',
        lines: lines.map(l => ({ productId: l.productId, quantity: l.quantity, batchCode: l.batchCode, imei: l.imei, unit: l.unit, note: l.note })),
      });
      setSuccessMsg('✓ Tạo phiếu chuyển kho thành công!');
      if (afterSubmitAction === 'detail') {
        setTimeout(() => navigate('/warehouse/transfers'), 1200);
      } else {
        setLines([createLine(products[0])]);
        setNote(''); setLabel('');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const filtered = products.filter(
    p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const colCount = 2 + (colVisible.stt ? 1 : 0) + (colVisible.image ? 1 : 0)
    + (colVisible.batch ? 1 : 0) + (colVisible.imei ? 1 : 0)
    + (colVisible.unit ? 1 : 0) + (colVisible.note ? 1 : 0);

  return (
    <div className="workspace-page">

      {/* ── HEADER ─────────────────────────────────── */}
      <div className="page-heading">
        <div className="page-title-block">
          <button
            className="btn btn-light"
            type="button"
            onClick={() => navigate(-1)}
            style={{ width: 42, height: 42, padding: 0, justifyContent: 'center', borderRadius: 10 }}
            title="Quay lại"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="page-icon" style={{ background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', color: 'var(--primary)' }}>
            <Shuffle size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: 22 }}>Thêm mới phiếu chuyển kho</h1>
            <p style={{ margin: '3px 0 0', color: 'var(--muted)', fontSize: 13 }}>
              Tạo phiếu chuyển sản phẩm nội bộ giữa các kho/chi nhánh
            </p>
          </div>
        </div>
        <div className="page-actions">
          {error && (
            <span style={{ background: 'var(--danger-soft)', color: '#b91c1c', padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>
              {error}
            </span>
          )}
          {successMsg && (
            <span style={{ background: 'var(--success-soft)', color: '#047857', padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>
              {successMsg}
            </span>
          )}
          <button className="btn btn-light" type="button" onClick={() => navigate(-1)}>Hủy bỏ</button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            style={{ opacity: saving ? 0.7 : 1 }}
          >
            <Shuffle size={15} />
            {saving ? 'Đang lưu...' : 'Lưu phiếu chuyển kho'}
          </button>
        </div>
      </div>

      {/* ── WAREHOUSE ROUTE BANNER ──────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
        border: '1px solid #bfdbfe',
        borderRadius: 12,
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ background: 'var(--primary)', color: '#fff', borderRadius: 8, padding: '4px 12px', fontWeight: 800, fontSize: 13 }}>
            {sysBranches.find(b => b._id === fromWarehouse)?.name || fromWarehouse}
          </div>
          <ChevronRight size={18} style={{ color: 'var(--primary)' }} />
          <div style={{ background: 'var(--success)', color: '#fff', borderRadius: 8, padding: '4px 12px', fontWeight: 800, fontSize: 13 }}>
            {sysBranches.find(b => b._id === toWarehouse)?.name || toWarehouse}
          </div>
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 13, marginLeft: 'auto' }}>
          <strong style={{ color: '#0f172a' }}>{totalSP}</strong> sản phẩm &nbsp;·&nbsp;
          Tổng SL: <strong style={{ color: 'var(--primary)' }}>{totalQty}</strong>
        </div>
      </div>

      {/* ── MAIN BODY: 2 COLUMNS ────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 18, alignItems: 'start' }}>

        {/* LEFT — Product table card */}
        <div className="data-card" style={{ overflow: 'hidden' }}>
          {/* Card header / toolbar */}
          <div className="data-card-header">
            <div>
              <h2 style={{ fontSize: 15 }}>Danh sách sản phẩm chuyển</h2>
              <span className="record-badge">{totalSP} SP · {totalQty} SL</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div className="search-box" style={{ minWidth: 220 }}>
                <input
                  type="text"
                  placeholder="Tìm sản phẩm (F3)..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <button className="btn btn-outline" type="button" onClick={addLine} style={{ whiteSpace: 'nowrap' }}>
                <Plus size={15} /> Thêm dòng
              </button>
              <div className="dropdown-container">
                <button className="btn btn-light" type="button" onClick={() => setShowConfig(v => !v)} title="Tùy chỉnh cột">
                  <Settings2 size={15} />
                </button>
                {showConfig && (
                  <div className="dropdown-menu" style={{ minWidth: 180 }}>
                    {([
                      ['stt', 'STT'],
                      ['image', 'Ảnh sản phẩm'],
                      ['batch', 'Lô hàng'],
                      ['imei', 'IMEI'],
                      ['unit', 'Đơn vị tính'],
                      ['note', 'Ghi chú dòng'],
                    ] as [keyof typeof colVisible, string][]).map(([key, lbl]) => (
                      <label key={key} className="dropdown-item" style={{ cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={colVisible[key]}
                          onChange={e => setColVisible(v => ({ ...v, [key]: e.target.checked }))}
                          style={{ accentColor: 'var(--primary)' }}
                        />
                        {lbl}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 44 }}></th>
                  {colVisible.stt && <th style={{ width: 48 }}>STT</th>}
                  {colVisible.image && <th style={{ width: 56 }}>Ảnh</th>}
                  <th style={{ minWidth: 120 }}>Mã SP</th>
                  <th style={{ minWidth: 200 }}>Tên sản phẩm</th>
                  {colVisible.batch && <th style={{ minWidth: 110 }}>Lô hàng</th>}
                  {colVisible.imei && <th style={{ minWidth: 130 }}>IMEI</th>}
                  {colVisible.unit && <th style={{ minWidth: 90 }}>Đơn vị</th>}
                  <th style={{ width: 90, textAlign: 'right' }}>Số lượng</th>
                  {colVisible.note && <th style={{ minWidth: 140 }}>Ghi chú</th>}
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={colCount} className="empty-cell">
                      Chưa có sản phẩm — nhấn <strong>Thêm dòng</strong> để bắt đầu
                    </td>
                  </tr>
                )}
                {lines.map((line, i) => {
                  const product = products.find(p => p._id === line.productId);
                  return (
                    <tr key={i}>
                      <td style={{ padding: '8px 12px' }}>
                        <button
                          className="icon-button danger"
                          type="button"
                          onClick={() => removeLine(i)}
                          title="Xóa dòng"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                      {colVisible.stt && (
                        <td style={{ color: 'var(--muted)', fontWeight: 700, fontSize: 13 }}>{i + 1}</td>
                      )}
                      {colVisible.image && (
                        <td>
                          <div style={{
                            width: 36, height: 36, borderRadius: 8,
                            background: 'var(--border-soft)',
                            border: '1px solid var(--border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--muted)', fontSize: 10,
                          }}>IMG</div>
                        </td>
                      )}
                      <td>
                        <select
                          style={{
                            border: '1px solid var(--border)', borderRadius: 8,
                            padding: '6px 8px', outline: 0, background: '#fff',
                            minWidth: 120, width: '100%', fontSize: 13,
                          }}
                          value={line.productId}
                          onChange={e => updateLine(i, 'productId', e.target.value)}
                        >
                          <option value="">-- Chọn --</option>
                          {filtered.map(p => (
                            <option key={p._id} value={p._id}>{p.code}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{product?.name || <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Chọn sản phẩm</span>}</div>
                        {product && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Tồn: {product.qty} {product.unit}</div>}
                      </td>
                      {colVisible.batch && (
                        <td>
                          <input
                            type="text"
                            style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', outline: 0, background: '#fff', width: '100%', fontSize: 13 }}
                            placeholder="Lô..."
                            value={line.batchCode}
                            onChange={e => updateLine(i, 'batchCode', e.target.value)}
                          />
                        </td>
                      )}
                      {colVisible.imei && (
                        <td>
                          <input
                            type="text"
                            style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', outline: 0, background: '#fff', width: '100%', fontSize: 13 }}
                            placeholder="IMEI..."
                            value={line.imei}
                            onChange={e => updateLine(i, 'imei', e.target.value)}
                          />
                        </td>
                      )}
                      {colVisible.unit && (
                        <td>
                          <input
                            type="text"
                            style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', outline: 0, background: '#fff', width: 80, fontSize: 13 }}
                            value={line.unit}
                            onChange={e => updateLine(i, 'unit', e.target.value)}
                          />
                        </td>
                      )}
                      <td style={{ textAlign: 'right' }}>
                        <input
                          type="number"
                          min={1}
                          style={{
                            border: '1px solid #bfdbfe', borderRadius: 8,
                            padding: '6px 8px', outline: 0,
                            background: 'var(--primary-soft)', color: 'var(--primary)',
                            fontWeight: 800, width: 80, textAlign: 'right', fontSize: 14,
                          }}
                          value={line.quantity || ''}
                          onChange={e => updateLine(i, 'quantity', Number(e.target.value))}
                        />
                      </td>
                      {colVisible.note && (
                        <td>
                          <input
                            type="text"
                            style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', outline: 0, background: '#fff', width: '100%', fontSize: 13 }}
                            placeholder="Ghi chú..."
                            value={line.note}
                            onChange={e => updateLine(i, 'note', e.target.value)}
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              {lines.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#f8fafc' }}>
                    <td
                      colSpan={colCount - 1}
                      style={{ textAlign: 'right', padding: '12px 14px', fontWeight: 700, fontSize: 13, color: 'var(--muted)' }}
                    >
                      Tổng số lượng:
                    </td>
                    <td style={{ textAlign: 'right', padding: '12px 14px', fontWeight: 800, fontSize: 16, color: 'var(--primary)' }}>
                      {totalQty}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Add line button below table */}
          <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border-soft)' }}>
            <button className="btn btn-outline" type="button" onClick={addLine} style={{ fontSize: 13 }}>
              <Plus size={14} /> Thêm sản phẩm
            </button>
          </div>
        </div>

        {/* RIGHT — Detail panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Transfer info card */}
          <div className="filter-panel" style={{ position: 'sticky', top: 88 }}>
            <div className="panel-title">
              <Shuffle size={16} style={{ color: 'var(--primary)' }} />
              Thông tin chuyển kho
            </div>

            <label className="field-label">Từ kho</label>
            <select
              style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', outline: 0, background: '#fff', width: '100%', fontSize: 14, marginBottom: 2 }}
              value={fromWarehouse}
              onChange={e => setFromWarehouse(e.target.value)}
            >
              {sysBranches.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
            </select>

            <div style={{ textAlign: 'center', padding: '6px 0', color: 'var(--primary)' }}>
              <ChevronRight size={18} style={{ transform: 'rotate(90deg)' }} />
            </div>

            <label className="field-label" style={{ marginTop: 0 }}>Đến kho</label>
            <select
              style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', outline: 0, background: '#fff', width: '100%', fontSize: 14 }}
              value={toWarehouse}
              onChange={e => setToWarehouse(e.target.value)}
            >
              {sysBranches.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
            </select>

            <label className="field-label">Nhãn phiếu</label>
            <input
              type="text"
              style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', outline: 0, background: '#fff', width: '100%', fontSize: 14 }}
              placeholder="Ví dụ: Chuyển hàng nội bộ Q2..."
              value={label}
              onChange={e => setLabel(e.target.value)}
            />

            <label className="field-label">Ghi chú</label>
            <textarea
              style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', outline: 0, background: '#fff', width: '100%', fontSize: 14, resize: 'vertical', minHeight: 80 }}
              placeholder="Ghi chú thêm..."
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>

          {/* After-save card */}
          <div className="filter-panel">
            <div className="panel-title" style={{ marginBottom: 12, fontSize: 13 }}>Thao tác sau khi lưu</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { value: 'detail', label: 'Xem chi tiết phiếu chuyển kho' },
                { value: 'continue', label: 'Tiếp tục lập phiếu mới' },
              ].map(opt => (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                    padding: '10px 12px', borderRadius: 8, border: '1px solid',
                    fontSize: 13, fontWeight: 600,
                    borderColor: afterSubmitAction === opt.value ? '#bfdbfe' : 'var(--border)',
                    background: afterSubmitAction === opt.value ? 'var(--primary-soft)' : '#fff',
                    color: afterSubmitAction === opt.value ? 'var(--primary)' : '#475569',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <input
                    type="radio"
                    name="afterSubmit"
                    checked={afterSubmitAction === opt.value as 'detail' | 'continue'}
                    onChange={() => setAfterSubmitAction(opt.value as 'detail' | 'continue')}
                    style={{ accentColor: 'var(--primary)' }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* Summary card */}
          {lines.length > 0 && (
            <div className="filter-panel" style={{ background: 'linear-gradient(135deg, #eff6ff, #f0fdf4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700 }}>Số sản phẩm</span>
                <strong style={{ color: '#0f172a' }}>{totalSP} SP</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700 }}>Tổng số lượng</span>
                <strong style={{ color: 'var(--primary)', fontSize: 18 }}>{totalQty}</strong>
              </div>
            </div>
          )}

          {/* Save button */}
          <button
            className="btn btn-primary full"
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            style={{ minHeight: 44, fontSize: 14, opacity: saving ? 0.7 : 1 }}
          >
            <Shuffle size={16} />
            {saving ? 'Đang lưu...' : 'Lưu phiếu chuyển kho'}
          </button>
        </div>
      </div>
    </div>
  );
}
