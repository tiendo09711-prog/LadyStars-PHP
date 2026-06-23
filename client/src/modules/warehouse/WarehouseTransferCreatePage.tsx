import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Plus, Shuffle, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { http } from '../../core/api/http';

type Warehouse = { value: string; label: string; code?: string };
type Product = { _id: string; code: string; name: string; barcode?: string; unit?: string; cost?: number; qty?: number; selectedStock?: number };
type Line = { productId: string; quantity: number; unit: string; batchCode: string; imei: string; note: string };

function stockOf(product?: Product) {
  return Number(product?.selectedStock ?? product?.qty ?? 0);
}

export function WarehouseTransferCreatePage() {
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [destinationWarehouseId, setDestinationWarehouseId] = useState('');
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [submitForApproval, setSubmitForApproval] = useState(true);
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    http.get('/warehouse/transfers/meta').then((response) => {
      const options: Warehouse[] = response.data?.warehouses || [];
      setWarehouses(options);
    }).catch(() => setError('Không tải được danh sách kho.'));
  }, []);

  useEffect(() => {
    if (!sourceWarehouseId) return;
    http.get('/products/inventories', { params: { limit: 5000, branchId: sourceWarehouseId } })
      .then((response) => {
        const items = (response.data?.items || []).map((item: Product) => ({ ...item, qty: stockOf(item) })).filter((item: Product) => stockOf(item) > 0);
        setProducts(items);
        setLines((current) => current.filter((line) => items.some((product: Product) => product._id === line.productId)));
      })
      .catch(() => setProducts([]));
  }, [sourceWarehouseId]);

  const sourceName = warehouses.find((item) => item.value === sourceWarehouseId)?.label || 'Kho nguồn';
  const destinationName = warehouses.find((item) => item.value === destinationWarehouseId)?.label || 'Kho đích';
  const filteredProducts = products.filter((product) => `${product.code} ${product.name} ${product.barcode || ''}`.toLowerCase().includes(search.toLowerCase()));
  const totalQty = useMemo(() => lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0), [lines]);

  const createLine = (product?: Product): Line => ({ productId: product?._id || '', quantity: 1, unit: product?.unit || '', batchCode: '', imei: '', note: '' });
  const addLine = () => setLines((current) => [...current, createLine(filteredProducts[0] || products[0])]);
  const removeLine = (index: number) => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  const updateLine = (index: number, patch: Partial<Line>) => {
    setLines((current) => current.map((line, lineIndex) => {
      if (lineIndex !== index) return line;
      const next = { ...line, ...patch };
      if (patch.productId) {
        const product = products.find((item) => item._id === patch.productId);
        next.unit = product?.unit || '';
        next.quantity = Math.min(Math.max(Number(next.quantity || 1), 1), Math.max(stockOf(product), 1));
      }
      if (patch.quantity !== undefined) {
        const product = products.find((item) => item._id === next.productId);
        next.quantity = Math.min(Math.max(Number(patch.quantity || 1), 1), Math.max(stockOf(product), 1));
      }
      return next;
    }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(''); setSuccess('');
    if (!sourceWarehouseId || !destinationWarehouseId) return setError('Vui l?ng ch?n r? kho ngu?n v? kho ??ch.');
    if (sourceWarehouseId === destinationWarehouseId) return setError('Kho ngu?n v? kho ??ch kh?ng ???c tr?ng nhau.');
    if (!lines.length) return setError('Vui lòng thêm ít nhất một sản phẩm.');
    const productIds = new Set<string>();
    for (const line of lines) {
      const product = products.find((item) => item._id === line.productId);
      if (!product) return setError('Vui lòng chọn sản phẩm hợp lệ.');
      if (productIds.has(line.productId)) return setError('Không được chọn trùng sản phẩm trong cùng phiếu.');
      productIds.add(line.productId);
      if (!Number.isInteger(Number(line.quantity)) || Number(line.quantity) <= 0) return setError('Số lượng phải là số nguyên dương.');
      if (Number(line.quantity) > stockOf(product)) return setError(`Sản phẩm ${product.code} vượt tồn kho nguồn (${stockOf(product)}).`);
    }

    setSaving(true);
    try {
      const response = await http.post('/warehouse/transfers', {
        sourceWarehouseId,
        destinationWarehouseId,
        label,
        note,
        submitForApproval,
        lines,
      });
      setSuccess(submitForApproval ? 'Đã tạo phiếu và gửi Admin duyệt. Tồn kho chưa thay đổi.' : 'Đã lưu nháp. Tồn kho chưa thay đổi.');
      setTimeout(() => navigate(`/warehouse/transfers/${response.data?._id || response.data?.id}`), 800);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không lưu được phiếu chuyển kho.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="workspace-page" onSubmit={submit}>
      <div className="page-heading">
        <div className="page-title-block">
          <button className="btn btn-light" type="button" onClick={() => navigate('/warehouse/transfers')}><ArrowLeft size={16} /> Quay lại</button>
          <div className="page-icon"><Shuffle size={22} /></div>
          <div><h1>Thêm mới phiếu chuyển kho</h1><p>Lưu nháp hoặc gửi Admin duyệt. Bước này không thay đổi tồn kho.</p></div>
        </div>
        <div className="page-actions"><button className="btn btn-light" type="button" onClick={() => navigate('/warehouse/transfers')}>Hủy</button><button className="btn btn-primary" type="submit" disabled={saving || !sourceWarehouseId || !destinationWarehouseId || sourceWarehouseId === destinationWarehouseId}>{saving ? 'Đang lưu...' : (submitForApproval ? 'Lưu và gửi duyệt' : 'Lưu nháp')}</button></div>
      </div>

      {error && <div className="data-alert" role="alert">{error}</div>}
      {success && <div className="wr-notice">{success}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18, alignItems: 'start' }}>
        <section className="data-card">
          <div className="data-card-header"><div><h2>Danh sách sản phẩm chuyển</h2><span className="record-badge">{lines.length} SP · {totalQty} SL</span></div><div className="search-box" style={{ minWidth: 260 }}><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã/tên/mã vạch sản phẩm" /></div><button className="btn btn-outline" type="button" onClick={addLine}><Plus size={15} /> Thêm dòng</button></div>
          <div className="table-scroll"><table className="data-table"><thead><tr><th></th><th>Mã SP</th><th>Sản phẩm</th><th>Tồn kho nguồn</th><th>SL yêu cầu</th><th>ĐVT</th><th>Lô</th><th>IMEI</th><th>Ghi chú</th></tr></thead><tbody>{!lines.length && <tr><td className="empty-cell" colSpan={9}>Chưa có sản phẩm. Nhấn “Thêm dòng” để bắt đầu.</td></tr>}{lines.map((line, index) => { const product = products.find((item) => item._id === line.productId); return <tr key={index}><td><button className="icon-button danger" type="button" onClick={() => removeLine(index)}><Trash2 size={14} /></button></td><td><select value={line.productId} onChange={(event) => updateLine(index, { productId: event.target.value })}><option value="">Chọn</option>{filteredProducts.map((item) => <option key={item._id} value={item._id}>{item.code}</option>)}</select></td><td><strong>{product?.name || '-'}</strong><span className="wr-sub">{product?.barcode || ''}</span></td><td className="right">{stockOf(product).toLocaleString('vi-VN')}</td><td><input type="number" min={1} max={stockOf(product)} value={line.quantity || ''} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })} /></td><td><input value={line.unit} onChange={(event) => updateLine(index, { unit: event.target.value })} /></td><td><input value={line.batchCode} onChange={(event) => updateLine(index, { batchCode: event.target.value })} /></td><td><input value={line.imei} onChange={(event) => updateLine(index, { imei: event.target.value })} /></td><td><input value={line.note} onChange={(event) => updateLine(index, { note: event.target.value })} /></td></tr>; })}</tbody></table></div>
        </section>

        <aside style={{ display: 'grid', gap: 14 }}>
          <div className="filter-panel"><div className="panel-title"><Shuffle size={16} /> Th?ng tin chuy?n kho</div><label className="field-label">Kho ngu?n *</label><select value={sourceWarehouseId} onChange={(event) => setSourceWarehouseId(event.target.value)}><option value="">-- Ch?n kho ngu?n --</option>{warehouses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><div style={{ textAlign: 'center', padding: 8 }}><ChevronRight size={18} style={{ transform: 'rotate(90deg)' }} /></div><label className="field-label">Kho ??ch *</label><select value={destinationWarehouseId} onChange={(event) => setDestinationWarehouseId(event.target.value)}><option value="">-- Ch?n kho ??ch --</option>{warehouses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><label className="field-label">Nh?n phi?u</label><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="VD: Chuy?n h?ng b? sung" /><label className="field-label">Ghi ch?</label><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} /></div>
          <div className="filter-panel" style={{ background: 'linear-gradient(135deg,#eff6ff,#f0fdf4)' }}><strong>{sourceName}</strong><ChevronRight size={18} /><strong>{destinationName}</strong><div style={{ marginTop: 10, color: 'var(--muted)' }}>{lines.length} sản phẩm · {totalQty} số lượng</div></div>
          <div className="filter-panel"><label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 700 }}><input type="checkbox" checked={submitForApproval} onChange={(event) => setSubmitForApproval(event.target.checked)} /> Gửi Admin duyệt sau khi lưu</label></div>
          <button className="btn btn-primary full" type="submit" disabled={saving || !sourceWarehouseId || !destinationWarehouseId || sourceWarehouseId === destinationWarehouseId}>{saving ? 'Đang lưu...' : (submitForApproval ? 'Lưu và gửi duyệt' : 'Lưu nháp')}</button>
        </aside>
      </div>
    </form>
  );
}
