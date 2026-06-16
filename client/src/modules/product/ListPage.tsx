import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Boxes, Layers3, MapPinned, Plus, RefreshCw, Tags, Trash2, Warehouse, X } from 'lucide-react';
import { DataModulePage, type DataModulePageProps } from '../../core/components/DataModulePage';
import { http } from '../../core/api/http';

type Product = {
  _id: string;
  code: string;
  name: string;
  type: 'product' | 'service' | 'combo';
  cost: number;
  price: number;
  qty: number;
  unit?: string;
};

type StockLine = {
  productId: string;
  actualStock: number;
};

type StockAdjustment = {
  _id: string;
  code: string;
  status: string;
  amount: number;
  deviation: number;
  value: number;
  createdAt: string;
  items: Array<{ productId: Product | string; amount: number; actualStock: number; quantityDifference: number }>;
};

const genericTabs: Array<DataModulePageProps & { key: string; label: string }> = [
  {
    key: 'products',
    label: 'Hàng hóa',
    title: 'Hàng hóa',
    subtitle: 'Danh mục sản phẩm, dịch vụ, combo, tồn kho và thiết lập giá',
    endpoint: '/products/products',
    icon: <Boxes size={24} />,
    primaryActionLabel: 'Thêm hàng hóa',
    fields: [
      { key: 'code', label: 'Mã hàng' },
      { key: 'name', label: 'Tên hàng hóa' },
      { key: 'type', label: 'Loại', type: 'status' },
      { key: 'price', label: 'Giá bán', type: 'money' },
      { key: 'qty', label: 'Tồn', type: 'number' },
      { key: 'unit', label: 'Đơn vị' },
    ],
    formFields: [
      { key: 'code', label: 'Mã hàng', required: true },
      { key: 'name', label: 'Tên hàng hóa', required: true },
      { key: 'type', label: 'Loại', type: 'select', options: [
        { label: 'Sản phẩm', value: 'product' },
        { label: 'Dịch vụ', value: 'service' },
        { label: 'Combo', value: 'combo' },
      ] },
      { key: 'cost', label: 'Giá vốn', type: 'number' },
      { key: 'price', label: 'Giá bán', type: 'number' },
      { key: 'unit', label: 'Đơn vị' },
      { key: 'minQuantity', label: 'Tồn ít nhất', type: 'number' },
      { key: 'maxQuantity', label: 'Tồn nhiều nhất', type: 'number' },
      { key: 'description', label: 'Mô tả', type: 'textarea' },
    ],
    createDefaults: { code: '', name: '', type: 'product', cost: 0, price: 0, qty: 0, unit: 'cái', minQuantity: 0, maxQuantity: 999999999, description: '' },
    quickFilters: [
      { label: 'Sản phẩm', value: 'product' },
      { label: 'Dịch vụ', value: 'service' },
      { label: 'Combo', value: 'combo' },
    ],
  },
  {
    key: 'categories',
    label: 'Nhóm hàng',
    title: 'Nhóm hàng',
    subtitle: 'Cây danh mục hàng hóa giống Polirium category',
    endpoint: '/products/categories',
    icon: <Layers3 size={24} />,
    primaryActionLabel: 'Thêm nhóm hàng',
    fields: [{ key: 'name', label: 'Tên nhóm' }, { key: 'createdAt', label: 'Ngày tạo', type: 'date' }],
    formFields: [{ key: 'name', label: 'Tên nhóm', required: true }],
    createDefaults: { name: '' },
  },
  {
    key: 'trademarks',
    label: 'Thương hiệu',
    title: 'Thương hiệu',
    subtitle: 'Danh mục thương hiệu hàng hóa',
    endpoint: '/products/trademarks',
    icon: <Tags size={24} />,
    primaryActionLabel: 'Thêm thương hiệu',
    fields: [{ key: 'name', label: 'Tên thương hiệu' }, { key: 'createdAt', label: 'Ngày tạo', type: 'date' }],
    formFields: [{ key: 'name', label: 'Tên thương hiệu', required: true }],
    createDefaults: { name: '' },
  },
  {
    key: 'shelves',
    label: 'Vị trí',
    title: 'Vị trí kho',
    subtitle: 'Kệ, vị trí lưu hàng',
    endpoint: '/products/shelves',
    icon: <MapPinned size={24} />,
    primaryActionLabel: 'Thêm vị trí',
    fields: [{ key: 'name', label: 'Vị trí' }, { key: 'createdAt', label: 'Ngày tạo', type: 'date' }],
    formFields: [{ key: 'name', label: 'Tên vị trí', required: true }],
    createDefaults: { name: '' },
  },
];

const tabs = [
  ...genericTabs.map((tab) => ({ key: tab.key, label: tab.label })),
  { key: 'stocks', label: 'Kiểm kho' },
];

function money(value: unknown) {
  return `${Number(value || 0).toLocaleString('vi-VN')} đ`;
}

function statusClass(status: string) {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'danger';
  return 'warning';
}

function productFrom(value: Product | string | undefined, products: Product[]) {
  if (!value) return undefined;
  if (typeof value === 'object') return value;
  return products.find((product) => product._id === value);
}

export function ProductListPage() {
  const [activeKey, setActiveKey] = useState('products');
  const genericTab = genericTabs.find((tab) => tab.key === activeKey);
  const genericPageProps = genericTab ? (({ key: _key, label: _label, ...props }) => props)(genericTab) : null;

  return (
    <div className="workspace-page">
      <div className="workspace-tabs" role="tablist" aria-label="Product tabs">
        {tabs.map((tab) => (
          <button className={tab.key === activeKey ? 'active' : ''} key={tab.key} type="button" onClick={() => setActiveKey(tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>
      {genericTab && genericPageProps && <DataModulePage key={genericTab.key} {...genericPageProps} />}
      {activeKey === 'stocks' && <StockAdjustments />}
    </div>
  );
}

function StockAdjustments() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stocks, setStocks] = useState<StockAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [code, setCode] = useState('');
  const [balanceDate, setBalanceDate] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<StockLine[]>([]);
  const [error, setError] = useState('');

  const stockProducts = useMemo(() => products.filter((product) => product.type !== 'service'), [products]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [productResponse, stockResponse] = await Promise.all([
        http.get('/products/products', { params: { limit: 100 } }),
        http.get('/products/stock-adjustments', { params: { limit: 100 } }),
      ]);
      setProducts(productResponse.data.items ?? []);
      setStocks(stockResponse.data.items ?? []);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Không tải được dữ liệu kiểm kho.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    const product = stockProducts[0];
    setCode('');
    setBalanceDate(new Date().toISOString().slice(0, 10));
    setNote('');
    setLines(product ? [{ productId: product._id, actualStock: Number(product.qty ?? 0) }] : []);
    setError('');
    setShowModal(true);
  };

  const addLine = () => {
    const product = stockProducts.find((item) => !lines.some((line) => line.productId === item._id)) ?? stockProducts[0];
    if (!product) return;
    setLines((current) => [...current, { productId: product._id, actualStock: Number(product.qty ?? 0) }]);
  };

  const updateLine = (index: number, patch: Partial<StockLine>) => {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const selectedLines = lines.filter((line) => line.productId);
    if (selectedLines.length === 0) {
      setError('Phiếu kiểm kho phải có ít nhất một dòng hàng.');
      return;
    }
    try {
      await http.post('/products/stock-adjustments', {
        code,
        balanceDate,
        status: 'draft',
        note,
        items: selectedLines.map((line) => ({ productId: line.productId, actualStock: Number(line.actualStock || 0) })),
      });
      setShowModal(false);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Không lưu được phiếu kiểm kho.');
    }
  };

  const complete = async (stock: StockAdjustment) => {
    if (!window.confirm(`Hoàn tất phiếu kiểm kho ${stock.code} và cập nhật tồn?`)) return;
    try {
      await http.post(`/products/stock-adjustments/${stock._id}/complete`);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Không hoàn tất được phiếu kiểm kho.');
    }
  };

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div className="page-title-block">
          <div className="page-icon"><Warehouse size={24} /></div>
          <div>
            <h1>Kiểm kho</h1>
            <p>Tạo phiếu kiểm theo từng sản phẩm, so sánh tồn hệ thống với tồn thực tế và cập nhật kho khi hoàn tất.</p>
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-light" type="button" onClick={load}><RefreshCw size={16} /> Làm mới</button>
          <button className="btn btn-primary" type="button" onClick={openCreate}><Plus size={16} /> Tạo phiếu kiểm</button>
        </div>
      </div>

      {error && <div className="error-chip">{error}</div>}

      <section className="data-card">
        <div className="data-card-header">
          <div>
            <h2>Phiếu kiểm kho</h2>
            <span className="record-badge">{stocks.length} bản ghi</span>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mã phiếu</th>
                <th>Dòng hàng</th>
                <th>Tổng SL</th>
                <th>Lệch</th>
                <th>Giá trị</th>
                <th>Trạng thái</th>
                <th>Ngày tạo</th>
                <th className="action-cell">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td className="empty-cell" colSpan={8}>Đang tải dữ liệu...</td></tr>}
              {!loading && stocks.length === 0 && <tr><td className="empty-cell" colSpan={8}>Chưa có phiếu kiểm kho.</td></tr>}
              {!loading && stocks.map((stock) => (
                <tr key={stock._id}>
                  <td><strong>{stock.code}</strong></td>
                  <td>
                    {stock.items?.map((item, index) => {
                      const product = productFrom(item.productId, products);
                      return <small key={`${stock._id}-${index}`}>{product?.code ?? '-'} - {product?.name ?? 'Hàng hóa'}</small>;
                    })}
                  </td>
                  <td>{Number(stock.amount ?? 0).toLocaleString('vi-VN')}</td>
                  <td>{Number(stock.deviation ?? 0).toLocaleString('vi-VN')}</td>
                  <td>{money(stock.value)}</td>
                  <td><span className={`status-badge ${statusClass(stock.status)}`}>{stock.status}</span></td>
                  <td>{new Date(stock.createdAt).toLocaleDateString('vi-VN')}</td>
                  <td className="action-cell">{stock.status !== 'completed' && <button className="mini-action" type="button" onClick={() => complete(stock)}>Hoàn tất</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showModal && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-card modal-card-wide" onSubmit={submit}>
            <div className="modal-header">
              <div>
                <h2>Tạo phiếu kiểm kho</h2>
                <p>Nhập tồn thực tế cho từng sản phẩm cần cân bằng.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setShowModal(false)} title="Đóng"><X size={18} /></button>
            </div>
            <div className="form-grid">
              <label className="form-field">
                <span>Mã phiếu</span>
                <input value={code} required onChange={(event) => setCode(event.target.value)} />
              </label>
              <label className="form-field">
                <span>Ngày cân bằng</span>
                <input type="date" value={balanceDate} onChange={(event) => setBalanceDate(event.target.value)} />
              </label>
              <label className="form-field wide">
                <span>Ghi chú</span>
                <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
              </label>
            </div>
            <div className="line-editor">
              <div className="line-editor-header">
                <strong>Hàng kiểm</strong>
                <button className="btn btn-light" type="button" onClick={addLine}><Plus size={16} /> Thêm dòng</button>
              </div>
              <div className="table-scroll">
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>Hàng hóa</th>
                      <th>Tồn hệ thống</th>
                      <th>Tồn thực tế</th>
                      <th>Lệch dự kiến</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, index) => {
                      const product = products.find((item) => item._id === line.productId);
                      const diff = Number(line.actualStock || 0) - Number(product?.qty ?? 0);
                      return (
                        <tr key={`${line.productId}-${index}`}>
                          <td>
                            <select value={line.productId} onChange={(event) => updateLine(index, { productId: event.target.value, actualStock: Number(products.find((item) => item._id === event.target.value)?.qty ?? 0) })}>
                              {stockProducts.map((item) => <option key={item._id} value={item._id}>{item.code} - {item.name}</option>)}
                            </select>
                          </td>
                          <td>{Number(product?.qty ?? 0).toLocaleString('vi-VN')} {product?.unit ?? ''}</td>
                          <td><input type="number" min={0} value={line.actualStock} onChange={(event) => updateLine(index, { actualStock: Number(event.target.value || 0) })} /></td>
                          <td>{diff.toLocaleString('vi-VN')}</td>
                          <td><button className="icon-button danger" type="button" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}><Trash2 size={16} /></button></td>
                        </tr>
                      );
                    })}
                    {lines.length === 0 && <tr><td className="empty-cell" colSpan={5}>Chưa có sản phẩm để kiểm kho.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="modal-footer">
              <button className="btn btn-light" type="button" onClick={() => setShowModal(false)}>Hủy</button>
              <button className="btn btn-primary" type="submit">Lưu phiếu kiểm</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
