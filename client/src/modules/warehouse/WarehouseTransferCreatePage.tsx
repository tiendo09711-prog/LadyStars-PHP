import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Plus, Shuffle, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { http } from '../../core/api/http';

type Warehouse = { value: string; label: string; code?: string };
type Product = { _id: string; code: string; name: string; barcode?: string; unit?: string; cost?: number; qty?: number; selectedStock?: number };
type Line = { productId: string; quantity: number; unit: string; batchCode: string; imei: string; note: string };
function stockOf(product?: Product) { return Number(product?.selectedStock ?? product?.qty ?? 0); }

export function WarehouseTransferCreatePage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const editMode = Boolean(id);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [destinationWarehouseId, setDestinationWarehouseId] = useState('');
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { http.get('/warehouse/transfers/meta').then((response) => setWarehouses(response.data?.warehouses || [])).catch(() => setError('Không tải được danh sách kho.')); }, []);
  useEffect(() => { if (!id) return; http.get(`/warehouse/transfers/${id}`).then((response) => { const data = response.data; if (data.status !== 'DRAFT') setError('Chỉ được sửa đơn ở trạng thái Chờ xác nhận xuất.'); setSourceWarehouseId(data.sourceWarehouseId || ''); setDestinationWarehouseId(data.destinationWarehouseId || ''); setLabel(data.label || ''); setNote(data.note || ''); setLines((data.lines || []).map((line: any) => ({ productId: String(line.productId?._id || line.productId || ''), quantity: Number(line.requestedQuantity || line.quantity || 1), unit: line.unit || '', batchCode: line.batchCode || line.batch || '', imei: line.imei || '', note: line.note || '' }))); }).catch((err) => setError(err.response?.data?.message || 'Không tải được đơn chuyển kho.')); }, [id]);
  useEffect(() => { if (!sourceWarehouseId) { setProducts([]); return; } http.get('/products/inventories', { params: { limit: 5000, branchId: sourceWarehouseId } }).then((response) => { const items = (response.data?.items || []).map((item: Product) => ({ ...item, qty: stockOf(item) })).filter((item: Product) => stockOf(item) > 0); setProducts(items); }).catch(() => setProducts([])); }, [sourceWarehouseId]);

  const sourceName = warehouses.find((item) => item.value === sourceWarehouseId)?.label || 'Kho nguồn';
  const destinationName = warehouses.find((item) => item.value === destinationWarehouseId)?.label || 'Kho đích';
  const filteredProducts = products.filter((product) => `${product.code} ${product.name} ${product.barcode || ''}`.toLowerCase().includes(search.toLowerCase()));
  const totalQty = useMemo(() => lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0), [lines]);
  const addLine = () => setLines((current) => [...current, { productId: filteredProducts[0]?._id || products[0]?._id || '', quantity: 1, unit: filteredProducts[0]?.unit || products[0]?.unit || '', batchCode: '', imei: '', note: '' }]);
  const removeLine = (index: number) => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  const updateLine = (index: number, patch: Partial<Line>) => setLines((current) => current.map((line, lineIndex) => { if (lineIndex !== index) return line; const next = { ...line, ...patch }; if (patch.productId) next.unit = products.find((item) => item._id === patch.productId)?.unit || ''; if (patch.quantity !== undefined) next.quantity = Math.max(1, Number(patch.quantity || 1)); return next; }));

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setSuccess('');
    if (!sourceWarehouseId || !destinationWarehouseId) return setError('Vui lòng chọn rõ kho nguồn và kho đích.');
    if (sourceWarehouseId === destinationWarehouseId) return setError('Kho nguồn và kho đích không được trùng nhau.');
    if (!lines.length) return setError('Vui lòng thêm ít nhất một sản phẩm.');
    const productIds = new Set<string>();
    for (const line of lines) {
      if (!line.productId) return setError('Vui lòng chọn sản phẩm hợp lệ.');
      if (productIds.has(line.productId)) return setError('Không được chọn trùng sản phẩm trong cùng đơn.');
      productIds.add(line.productId);
      if (!Number.isInteger(Number(line.quantity)) || Number(line.quantity) <= 0) return setError('Số lượng phải là số nguyên dương.');
    }
    setSaving(true);
    try {
      const payload = { sourceWarehouseId, destinationWarehouseId, label, note, lines };
      const response = editMode ? await http.patch(`/warehouse/transfers/${id}`, payload) : await http.post('/warehouse/transfers', payload);
      setSuccess(editMode ? 'Đã cập nhật đơn chuyển. Tồn kho chưa thay đổi.' : 'Đã tạo đơn cần duyệt. Tồn kho chưa thay đổi.');
      window.setTimeout(() => navigate(`/warehouse/transfers/${response.data?._id || id}`), 700);
    } catch (err: any) { setError(err.response?.data?.message || 'Không lưu được đơn chuyển kho.'); }
    finally { setSaving(false); }
  };

  return <form className="workspace-page" onSubmit={submit}><div className="page-heading"><div className="page-title-block"><button className="btn btn-light" type="button" onClick={() => navigate('/warehouse/transfers')}><ArrowLeft size={16} /> Quay lại</button><div className="page-icon"><Shuffle size={22} /></div><div><h1>{editMode ? 'Sửa đơn chuyển kho' : 'Tạo đơn chuyển kho'}</h1><p>Đơn lưu ở trạng thái Chờ xác nhận xuất. Backend sẽ kiểm tra tồn kho lại khi xác nhận xuất.</p></div></div><div className="page-actions"><button className="btn btn-light" type="button" onClick={() => navigate('/warehouse/transfers')}>Hủy</button><button className="btn btn-primary" type="submit" disabled={saving || !sourceWarehouseId || !destinationWarehouseId || sourceWarehouseId === destinationWarehouseId}>{saving ? 'Đang lưu...' : (editMode ? 'Cập nhật đơn' : 'Tạo đơn cần duyệt')}</button></div></div>{error && <div className="data-alert" role="alert">{error}</div>}{success && <div className="wr-notice">{success}</div>}<div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18, alignItems: 'start' }}><section className="data-card"><div className="data-card-header"><div><h2>Danh sách sản phẩm chuyển</h2><span className="record-badge">{lines.length} SP · {totalQty} SL</span></div><div className="search-box" style={{ minWidth: 260 }}><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã/tên/mã vạch sản phẩm" /></div><button className="btn btn-outline" type="button" onClick={addLine}><Plus size={15} /> Thêm dòng</button></div><div className="table-scroll"><table className="data-table"><thead><tr><th></th><th>Mã SP</th><th>Sản phẩm</th><th>Tồn kho nguồn</th><th>SL chuyển</th><th>ĐVT</th><th>Lô</th><th>IMEI</th><th>Ghi chú</th></tr></thead><tbody>{!lines.length && <tr><td className="empty-cell" colSpan={9}>Chưa có sản phẩm. Nhấn “Thêm dòng” để bắt đầu.</td></tr>}{lines.map((line, index) => { const product = products.find((item) => item._id === line.productId); return <tr key={index}><td><button className="icon-button danger" type="button" onClick={() => removeLine(index)}><Trash2 size={14} /></button></td><td><select value={line.productId} onChange={(event) => updateLine(index, { productId: event.target.value })}><option value="">Chọn</option>{filteredProducts.map((item) => <option key={item._id} value={item._id}>{item.code}</option>)}</select></td><td><strong>{product?.name || '-'}</strong><span className="wr-sub">{product?.barcode || ''}</span></td><td className="right">{stockOf(product).toLocaleString('vi-VN')}</td><td><input type="number" min={1} value={line.quantity || ''} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })} /></td><td><input value={line.unit} onChange={(event) => updateLine(index, { unit: event.target.value })} /></td><td><input value={line.batchCode} onChange={(event) => updateLine(index, { batchCode: event.target.value })} /></td><td><input value={line.imei} onChange={(event) => updateLine(index, { imei: event.target.value })} /></td><td><input value={line.note} onChange={(event) => updateLine(index, { note: event.target.value })} /></td></tr>; })}</tbody></table></div></section><aside style={{ display: 'grid', gap: 14 }}><div className="filter-panel"><div className="panel-title"><Shuffle size={16} /> Thông tin chuyển kho</div><label className="field-label">Kho nguồn *</label><select value={sourceWarehouseId} onChange={(event) => setSourceWarehouseId(event.target.value)}><option value="">-- Chọn kho nguồn --</option>{warehouses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><div style={{ textAlign: 'center', padding: 8 }}><ChevronRight size={18} style={{ transform: 'rotate(90deg)' }} /></div><label className="field-label">Kho đích *</label><select value={destinationWarehouseId} onChange={(event) => setDestinationWarehouseId(event.target.value)}><option value="">-- Chọn kho đích --</option>{warehouses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><label className="field-label">Nhãn phiếu</label><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="VD: Chuyển hàng bổ sung" /><label className="field-label">Ghi chú</label><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} /></div><div className="filter-panel" style={{ background: 'linear-gradient(135deg,#eff6ff,#f0fdf4)' }}><strong>{sourceName}</strong><ChevronRight size={18} /><strong>{destinationName}</strong><div style={{ marginTop: 10, color: 'var(--muted)' }}>{lines.length} sản phẩm · {totalQty} số lượng</div></div><button className="btn btn-primary full" type="submit" disabled={saving || !sourceWarehouseId || !destinationWarehouseId || sourceWarehouseId === destinationWarehouseId}>{saving ? 'Đang lưu...' : (editMode ? 'Cập nhật đơn' : 'Tạo đơn cần duyệt')}</button></aside></div></form>;
}
