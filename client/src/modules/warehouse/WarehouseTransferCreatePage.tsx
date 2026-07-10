import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, Plus, Search, Shuffle, Trash2 } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { http } from '../../core/api/http';
import { useProductScanTarget } from '../../core/hooks/productScanner';
import './warehouseRecords.css';

type Warehouse = { value: string; label: string; code?: string };
type Product = { _id: string; id?: string | number; code: string; name: string; barcode?: string; unit?: string; cost?: number; qty?: number; selectedStock?: number; lockedQuantity?: number; availableStock?: number };
type InventoryStockItem = Product & { product?: Partial<Product> & { id?: string | number }; productId?: string; quantity?: number };
type Line = { productId: string; quantity: number; unit: string; batchCode: string; imei: string; note: string };

function stockOf(product?: Product) { return Number(product?.availableStock ?? product?.selectedStock ?? product?.qty ?? 0); }
function totalStockOf(product?: Product) { return Number(product?.selectedStock ?? product?.qty ?? 0); }
function lockedOf(product?: Product) { return Number(product?.lockedQuantity || 0); }
function normalizeInventoryProduct(item: InventoryStockItem): Product {
  const source = item.product || item;
  const totalStock = Number(item.selectedStock ?? item.quantity ?? item.qty ?? 0);
  const lockedQuantity = Number(item.lockedQuantity || 0);
  return {
    _id: String(source._id || source.id || item.productId || item._id),
    code: String(source.code || item.code || ''),
    name: String(source.name || item.name || ''),
    barcode: source.barcode || item.barcode,
    unit: source.unit || item.unit,
    cost: Number(source.cost ?? item.cost ?? 0),
    qty: totalStock,
    selectedStock: totalStock,
    lockedQuantity,
    availableStock: Number(item.availableStock ?? Math.max(0, totalStock - lockedQuantity)),
  };
}

export function WarehouseTransferCreatePage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const editMode = Boolean(id);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [destinationWarehouses, setDestinationWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [destinationWarehouseId, setDestinationWarehouseId] = useState('');
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const productSearchRef = useRef<HTMLInputElement>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productLoadError, setProductLoadError] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editStatus, setEditStatus] = useState('');

  const sourceName = warehouses.find((item) => item.value === sourceWarehouseId)?.label || '-';
  const destinationName = (destinationWarehouses.find((item) => item.value === destinationWarehouseId) || warehouses.find((item) => item.value === destinationWarehouseId))?.label || '-';
  const warehousesValid = Boolean(sourceWarehouseId && destinationWarehouseId && sourceWarehouseId !== destinationWarehouseId);
  const isInTransitEdit = editMode && editStatus === 'IN_TRANSIT';
  const searchHelper = warehousesValid ? `Có thể chuyển = tồn thực - số lượng đang khóa tại ${sourceName}.` : 'Chọn kho nguồn và kho đích trước khi tìm sản phẩm.';
  const filteredProducts = products.filter((product) => `${product.code} ${product.name} ${product.barcode || ''}`.toLowerCase().includes(search.toLowerCase().trim()));
  const totalQty = useMemo(() => lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0), [lines]);

  useEffect(() => {
    http.get('/warehouse/transfers/meta')
      .then((response) => {
        setWarehouses(response.data?.warehouses || []);
        setDestinationWarehouses(response.data?.destinationWarehouses || response.data?.warehouses || []);
      })
      .catch(() => setError('Không tải được danh sách kho.'));
  }, []);

  useEffect(() => {
    if (editMode) return;
    const prefillSource = searchParams.get('sourceWarehouseId') || '';
    const prefillDestination = searchParams.get('destinationWarehouseId') || '';
    const prefillNote = searchParams.get('note') || '';
    if (prefillSource) setSourceWarehouseId(prefillSource);
    if (prefillDestination) setDestinationWarehouseId(prefillDestination);
    if (prefillNote) setNote(prefillNote);
  }, [editMode, searchParams]);

  useEffect(() => {
    if (!id) return;
    http.get(`/warehouse/transfers/${id}`).then((response) => {
      const data = response.data;
      setEditStatus(data.status || '');
      if (!data.canEdit) setError('Bạn không có quyền sửa đơn chuyển kho này hoặc trạng thái hiện tại không cho phép sửa.');
      setSourceWarehouseId(data.sourceWarehouseId || '');
      setDestinationWarehouseId(data.destinationWarehouseId || '');
      setLabel(data.label || '');
      setNote(data.note || '');
      setLines((data.lines || []).map((line: any) => ({
        productId: String(line.productId?._id || line.productId || ''),
        quantity: Number(line.requestedQuantity || line.quantity || 1),
        unit: line.unit || '',
        batchCode: line.batchCode || line.batch || '',
        imei: line.imei || '',
        note: line.note || ''
      })));
    }).catch((err) => setError(err.response?.data?.message || 'Không tải được đơn chuyển kho.'));
  }, [id]);

  useEffect(() => {
    setSearch('');
    setSuggestionsOpen(false);
    setProductLoadError('');
    if (!warehousesValid) {
      setProducts([]);
      return;
    }
    let active = true;
    setLoadingProducts(true);
    http.get('/products/inventories', { params: { limit: 5000, branchId: sourceWarehouseId } })
      .then((response) => {
        if (!active) return;
        const items = (response.data?.items || [])
          .map((item: InventoryStockItem) => normalizeInventoryProduct(item))
          .filter((item: Product) => stockOf(item) > 0);
        setProducts(items);
      })
      .catch(() => {
        if (!active) return;
        setProducts([]);
        setProductLoadError('Không tải được tồn kho kho nguồn.');
      })
      .finally(() => { if (active) setLoadingProducts(false); });
    return () => { active = false; };
  }, [sourceWarehouseId, destinationWarehouseId, warehousesValid]);

  useEffect(() => {
    if (editMode || !products.length || !warehousesValid) return;
    const productId = searchParams.get('productId') || '';
    const productCode = searchParams.get('productCode') || '';
    const quantity = Math.max(1, Number(searchParams.get('quantity') || 1));
    if (!productId && !productCode) return;
    const product = products.find((item) => item._id === productId || item.code === productCode);
    if (!product) return;
    setLines([{ productId: product._id, quantity: Math.min(quantity, Math.max(1, stockOf(product))), unit: product.unit || '', batchCode: '', imei: '', note: 'Đề xuất từ báo cáo hàng tồn lâu / bán chậm' }]);
    setSearch(`${product.code} ${product.name}`);
  }, [editMode, products, searchParams, warehousesValid]);

  const resetLinesIfNeeded = () => {
    if (!lines.length) return true;
    if (!window.confirm('Đổi kho sẽ xóa danh sách sản phẩm hiện tại. Bạn muốn tiếp tục?')) return false;
    setLines([]);
    return true;
  };

  const changeSourceWarehouse = (nextValue: string) => {
    if (nextValue === destinationWarehouseId && nextValue) {
      setError('Kho nguồn và kho đích không được trùng nhau.');
      return;
    }
    if (!resetLinesIfNeeded()) return;
    setError('');
    setSourceWarehouseId(nextValue);
  };

  const changeDestinationWarehouse = (nextValue: string) => {
    if (nextValue === sourceWarehouseId && nextValue) {
      setError('Kho nguồn và kho đích không được trùng nhau.');
      return;
    }
    if (!resetLinesIfNeeded()) return;
    setError('');
    setDestinationWarehouseId(nextValue);
  };

  const handleProductScan = (rawBarcode: string) => {
    if (!warehousesValid) return;
    const lower = rawBarcode.trim().toLowerCase();
    const barcodeMatches = products.filter((p) => String(p.barcode || '').trim().toLowerCase() === lower);
    const codeMatches = barcodeMatches.length ? [] : products.filter((p) => String(p.code || '').trim().toLowerCase() === lower);
    const exactMatches = barcodeMatches.length ? barcodeMatches : codeMatches;
    if (exactMatches.length === 1) {
      selectProduct(exactMatches[0]);
      window.setTimeout(() => productSearchRef.current?.focus(), 0);
      return;
    }
    setSearch(rawBarcode.trim());
    setSuggestionsOpen(true);
  };

  useProductScanTarget(productSearchRef, handleProductScan);

  const selectProduct = (product: Product) => {
    if (!warehousesValid) return;
    setLines((current) => {
      const existingIndex = current.findIndex((line) => line.productId === product._id);
      if (existingIndex >= 0) return current.map((line, index) => index === existingIndex ? { ...line, unit: product.unit || line.unit } : line);
      return [...current, { productId: product._id, quantity: 1, unit: product.unit || '', batchCode: '', imei: '', note: '' }];
    });
    setSearch('');
    setSuggestionsOpen(false);
  };

  const addLine = () => {
    if (!warehousesValid || !filteredProducts.length) return;
    selectProduct(filteredProducts[0]);
  };

  const removeLine = (index: number) => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  const updateLine = (index: number, patch: Partial<Line>) => setLines((current) => current.map((line, lineIndex) => {
    if (lineIndex !== index) return line;
    const next = { ...line, ...patch };
    const product = products.find((item) => item._id === next.productId);
    if (patch.productId) next.unit = product?.unit || '';
    if (patch.quantity !== undefined) next.quantity = Math.min(Math.max(1, Number(patch.quantity || 1)), Math.max(1, stockOf(product)));
    return next;
  }));

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setSuccess('');
    if (!sourceWarehouseId || !destinationWarehouseId) return setError('Vui lòng chọn rõ kho nguồn và kho đích.');
    if (sourceWarehouseId === destinationWarehouseId) return setError('Kho nguồn và kho đích không được trùng nhau.');
    if (!lines.length) return setError('Vui lòng thêm ít nhất một sản phẩm.');
    const productIds = new Set<string>();
    for (const line of lines) {
      const product = products.find((item) => item._id === line.productId);
      if (!line.productId || !product) return setError('Vui lòng chọn sản phẩm hợp lệ từ tồn kho nguồn.');
      if (productIds.has(line.productId)) return setError('Không được chọn trùng sản phẩm trong cùng đơn.');
      productIds.add(line.productId);
      if (!Number.isInteger(Number(line.quantity)) || Number(line.quantity) <= 0) return setError('Số lượng phải là số nguyên dương.');
      if (Number(line.quantity) > stockOf(product)) return setError(`Số lượng ${product.code} không được vượt tồn kho kho nguồn.`);
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

  return <form className="workspace-page wr-transfer-create compact-page" onSubmit={submit}>
    <div className="page-heading wr-transfer-hero">
      <div className="page-title-block"><button className="btn btn-light" type="button" onClick={() => navigate('/warehouse/transfers')}><ArrowLeft size={16} /> Quay lại</button><div className="page-icon"><Shuffle size={22} /></div><div><h1>{editMode ? 'Sửa đơn chuyển kho' : 'Tạo đơn chuyển kho'}</h1><p>Đơn lưu ở trạng thái Chờ xác nhận xuất. Backend sẽ kiểm tra tồn kho lại khi xác nhận xuất.</p></div></div>
      <div className="page-actions"><button className="btn btn-light" type="button" onClick={() => navigate('/warehouse/transfers')}>Hủy</button><button className="btn btn-primary" type="submit" disabled={saving || !warehousesValid || !lines.length}>{saving ? 'Đang lưu...' : (editMode ? 'Cập nhật đơn' : 'Tạo đơn cần duyệt')}</button></div>
    </div>
    {isInTransitEdit && <div className="data-alert" role="status">Đơn đã xác nhận xuất, hệ thống sẽ kiểm tra số lượng khả dụng/khóa trước khi cập nhật. Không thể đổi kho nguồn/kho đích.</div>}{error && <div className="data-alert" role="alert">{error}</div>}{success && <div className="wr-notice">{success}</div>}
    <div className="wr-transfer-layout">
      <section className="data-card wr-products-card"><div className="data-card-header wr-products-header"><div><h2>Danh sách sản phẩm chuyển</h2><span className="record-badge">{lines.length} SP · {totalQty} SL</span></div><div className="wr-product-search"><div className="search-box"><Search size={16} /><input ref={productSearchRef} data-testid="transfer-product-search" data-product-search-scan="true" data-product-search-primary="true" aria-label="Tìm mã/tên/mã vạch sản phẩm" value={search} disabled={!warehousesValid} onFocus={() => warehousesValid && setSuggestionsOpen(true)} onChange={(event) => { setSearch(event.target.value); setSuggestionsOpen(true); }} placeholder={warehousesValid ? 'Tìm mã/tên/mã vạch sản phẩm' : 'Chọn kho nguồn và kho đích trước khi tìm sản phẩm.'} /></div><span className="wr-search-helper">{searchHelper}</span>{suggestionsOpen && warehousesValid && <div className="wr-suggestions" data-testid="transfer-product-suggestions">{loadingProducts && <div className="wr-suggestion-state">Đang tải tồn kho...</div>}{!loadingProducts && productLoadError && <div className="wr-suggestion-state error">{productLoadError}</div>}{!loadingProducts && !productLoadError && !filteredProducts.length && <div className="wr-suggestion-state">Không tìm thấy sản phẩm còn tồn tại {sourceName}.</div>}{!loadingProducts && !productLoadError && filteredProducts.slice(0, 30).map((product) => <button className="wr-suggestion-item" type="button" key={product._id} onMouseDown={(event) => { event.preventDefault(); selectProduct(product); }}><span><strong>{product.code}</strong><em>{product.name}</em><small>{product.barcode || 'Không có mã vạch'}</small></span><span><small>{product.unit || '-'}</small><b>Có thể chuyển: {stockOf(product).toLocaleString('vi-VN')} (Tồn {totalStockOf(product).toLocaleString('vi-VN')} − Khóa {lockedOf(product).toLocaleString('vi-VN')})</b></span></button>)}</div>}</div><button className="btn btn-outline" type="button" onClick={addLine} disabled={!warehousesValid || loadingProducts || !filteredProducts.length}><Plus size={15} /> Thêm dòng</button></div><div className="table-scroll"><table className="data-table"><thead><tr><th></th><th>Mã SP</th><th>Sản phẩm</th><th>Có thể chuyển</th><th>SL chuyển</th><th>ĐVT</th><th>Lô</th><th>IMEI</th><th>Ghi chú</th></tr></thead><tbody>{!lines.length && <tr><td className="empty-cell" colSpan={9}>{warehousesValid ? 'Tìm sản phẩm còn tồn ở kho nguồn để thêm vào đơn.' : 'Chọn kho nguồn và kho đích trước khi tìm sản phẩm.'}</td></tr>}{lines.map((line, index) => { const product = products.find((item) => item._id === line.productId); return <tr key={index}><td><button className="icon-button danger" type="button" onClick={() => removeLine(index)}><Trash2 size={14} /></button></td><td><select value={line.productId} disabled={!warehousesValid} onChange={(event) => updateLine(index, { productId: event.target.value })}><option value="">Chọn</option>{products.map((item) => <option key={item._id} value={item._id}>{item.code}</option>)}</select></td><td><strong>{product?.name || '-'}</strong><span className="wr-sub">{product?.barcode || ''}</span></td><td className="right">{stockOf(product).toLocaleString('vi-VN')}<span className="wr-sub">Tồn {totalStockOf(product).toLocaleString('vi-VN')} · Khóa {lockedOf(product).toLocaleString('vi-VN')}</span></td><td><input type="number" min={1} max={Math.max(1, stockOf(product))} value={line.quantity || ''} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })} /></td><td><input value={line.unit} onChange={(event) => updateLine(index, { unit: event.target.value })} /></td><td><input value={line.batchCode} onChange={(event) => updateLine(index, { batchCode: event.target.value })} /></td><td><input value={line.imei} onChange={(event) => updateLine(index, { imei: event.target.value })} /></td><td><input value={line.note} onChange={(event) => updateLine(index, { note: event.target.value })} /></td></tr>; })}</tbody></table></div></section>
      <aside className="wr-transfer-side"><div className="filter-panel"><div className="panel-title"><Shuffle size={16} /> Thông tin chuyển kho</div><label className="field-label">Kho nguồn *</label><select data-testid="transfer-source-warehouse" value={sourceWarehouseId} disabled={isInTransitEdit} onChange={(event) => changeSourceWarehouse(event.target.value)}><option value="">-- Chọn kho nguồn --</option>{warehouses.map((item) => <option key={item.value} value={item.value} disabled={item.value === destinationWarehouseId}>{item.label}</option>)}</select><div className="wr-flow-arrow"><ChevronRight size={18} /></div><label className="field-label">Kho đích *</label><select data-testid="transfer-destination-warehouse" value={destinationWarehouseId} disabled={isInTransitEdit} onChange={(event) => changeDestinationWarehouse(event.target.value)}><option value="">-- Chọn kho đích --</option>{destinationWarehouses.map((item) => <option key={item.value} value={item.value} disabled={item.value === sourceWarehouseId}>{item.label}</option>)}</select><label className="field-label">Nhãn phiếu</label><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="VD: Chuyển hàng bổ sung" /><label className="field-label">Ghi chú</label><textarea aria-label="Ghi chú" value={note} onChange={(event) => setNote(event.target.value)} rows={4} /></div><div className="filter-panel wr-transfer-summary"><div><strong>{sourceName}</strong><ChevronRight size={18} /><strong>{destinationName}</strong></div><span>{lines.length} sản phẩm · {totalQty} số lượng</span></div><button className="btn btn-primary full" type="submit" disabled={saving || !warehousesValid || !lines.length}>{saving ? 'Đang lưu...' : (editMode ? 'Cập nhật đơn' : 'Tạo đơn cần duyệt')}</button></aside>
    </div>
  </form>;
}
