import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { CreditCard, History, Plus, RefreshCw, RotateCcw, ShoppingCart, Store, Trash2, Truck, X } from 'lucide-react';
import { DataModulePage, type DataModulePageProps } from '../../core/components/DataModulePage';
import { http } from '../../core/api/http';

type Product = {
  _id: string;
  code: string;
  name: string;
  type: 'product' | 'service' | 'combo';
  price: number;
  cost: number;
  qty: number;
  clearancePrice?: number;
  clearanceActive?: boolean;
  unit?: string;
  allowsSale?: boolean;
};

type SaleLine = {
  productId: string;
  amount: number;
  value: number;
};

type SaleItem = {
  productId: Product | string;
  amount: number;
  value: number;
  total: number;
};

type SalePayment = {
  _id: string;
  code: string;
  status: string;
  amountProducts: number;
  totalCost: number;
  value: number;
  valuePayment: number;
  createdAt: string;
  items: SaleItem[];
};

type RefundLine = {
  productId: string;
  amount: number;
  price: number;
};

type ProductRefund = {
  _id: string;
  code: string;
  status: string;
  amount: number;
  value: number;
  createdAt: string;
  paymentId?: SalePayment | { _id: string; code: string };
  items: Array<{ productId: Product | string; amount: number; price: number; value: number }>;
};

const genericTabs: Array<DataModulePageProps & { key: string; label: string }> = [
  {
    key: 'methods',
    label: 'Thanh toán',
    title: 'Phương thức thanh toán',
    subtitle: 'Tiền mặt, thẻ, chuyển khoản và trạng thái đích',
    endpoint: '/products/payment-methods',
    icon: <CreditCard size={24} />,
    primaryActionLabel: 'Thêm phương thức',
    fields: [
      { key: 'code', label: 'Mã' },
      { key: 'name', label: 'Tên' },
      { key: 'targetPaymentStatus', label: 'Trạng thái đích', type: 'status' },
      { key: 'isActive', label: 'Hoạt động', type: 'status' },
    ],
    formFields: [
      { key: 'code', label: 'Mã', required: true },
      { key: 'name', label: 'Tên', required: true },
      { key: 'targetPaymentStatus', label: 'Trạng thái đích' },
      { key: 'sortOrder', label: 'Thứ tự', type: 'number' },
    ],
    createDefaults: { code: '', name: '', targetPaymentStatus: 'paid', sortOrder: 0 },
  },
  {
    key: 'channels',
    label: 'Kênh bán',
    title: 'Kênh bán',
    subtitle: 'Cửa hàng, online, sàn thương mại hoặc nguồn bán khác',
    endpoint: '/products/sale-channels',
    icon: <Store size={24} />,
    primaryActionLabel: 'Thêm kênh bán',
    fields: [{ key: 'name', label: 'Tên kênh' }, { key: 'isDefault', label: 'Mặc định', type: 'status' }, { key: 'isActive', label: 'Hoạt động', type: 'status' }],
    formFields: [{ key: 'name', label: 'Tên kênh', required: true }, { key: 'description', label: 'Mô tả', type: 'textarea' }, { key: 'sortOrder', label: 'Thứ tự', type: 'number' }],
    createDefaults: { name: '', description: '', sortOrder: 0 },
  },
  {
    key: 'delivery',
    label: 'Giao hàng',
    title: 'Đối tác giao hàng',
    subtitle: 'Đối tác vận chuyển, phí, liên hệ và trạng thái',
    endpoint: '/products/delivery-partners',
    icon: <Truck size={24} />,
    primaryActionLabel: 'Thêm đối tác',
    fields: [{ key: 'code', label: 'Mã' }, { key: 'name', label: 'Tên' }, { key: 'type', label: 'Loại', type: 'status' }, { key: 'phone', label: 'SĐT' }, { key: 'isActive', label: 'Hoạt động', type: 'status' }],
    formFields: [
      { key: 'code', label: 'Mã', required: true },
      { key: 'name', label: 'Tên', required: true },
      { key: 'type', label: 'Loại', type: 'select', options: [{ label: 'Cá nhân', value: 'person' }, { label: 'Công ty', value: 'company' }] },
      { key: 'phone', label: 'Số điện thoại' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'address', label: 'Địa chỉ' },
      { key: 'note', label: 'Ghi chú', type: 'textarea' },
    ],
    createDefaults: { code: '', name: '', type: 'company', phone: '', email: '', address: '', note: '' },
  },
  {
    key: 'logs',
    label: 'Log tồn',
    title: 'Log tồn kho',
    subtitle: 'Lịch sử biến động tồn từ bán, hoàn, nhập, trả và chuyển kho',
    endpoint: '/products/logs',
    icon: <History size={24} />,
    primaryActionLabel: 'Ghi log thủ công',
    fields: [
      { key: 'sourceType', label: 'Nguồn' },
      { key: 'amount', label: 'Số lượng', type: 'number' },
      { key: 'amountBefore', label: 'Trước', type: 'number' },
      { key: 'amountAfter', label: 'Sau', type: 'number' },
      { key: 'createdAt', label: 'Ngày', type: 'date' },
    ],
    formFields: [
      { key: 'productId', label: 'ID hàng hóa', required: true },
      { key: 'sourceType', label: 'Nguồn', required: true },
      { key: 'sourceId', label: 'ID nguồn', required: true },
      { key: 'amount', label: 'Số lượng', type: 'number' },
    ],
    createDefaults: { productId: '', sourceType: 'Manual', sourceId: '', amount: 0 },
  },
];

const tabs = [
  { key: 'sales', label: 'Bán hàng' },
  { key: 'refunds', label: 'Trả hàng bán' },
  ...genericTabs.map((tab) => ({ key: tab.key, label: tab.label })),
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

function apiMessage(err: any) {
  const message = err.response?.data?.message ?? 'Không thể lưu dữ liệu.';
  const map: Record<string, string> = {
    'Sale must include at least one product': 'Đơn bán phải có ít nhất một dòng hàng.',
    'Refund must include at least one product': 'Phiếu trả phải có ít nhất một dòng hàng.',
    'Product not found': 'Không tìm thấy hàng hóa đã chọn.',
    'Refund item must belong to the selected sale': 'Hàng trả phải thuộc đơn bán đã chọn.',
    'Refund quantity exceeds sold quantity': 'Số lượng trả vượt quá số lượng đã bán.',
  };
  return map[message] ?? message;
}

export function SalesPage() {
  const [activeKey, setActiveKey] = useState('sales');
  const genericTab = genericTabs.find((tab) => tab.key === activeKey);
  const genericPageProps = genericTab ? (({ key: _key, label: _label, ...props }) => props)(genericTab) : null;

  return (
    <div className="workspace-page">
      <div className="workspace-tabs" role="tablist" aria-label="Sales tabs">
        {tabs.map((tab) => (
          <button className={tab.key === activeKey ? 'active' : ''} key={tab.key} type="button" onClick={() => setActiveKey(tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>
      {activeKey === 'sales' && <SalesOrders />}
      {activeKey === 'refunds' && <SalesRefunds />}
      {genericTab && genericPageProps && <DataModulePage key={genericTab.key} {...genericPageProps} />}
    </div>
  );
}

function SalesOrders() {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<SalePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [code, setCode] = useState('');
  const [valuePayment, setValuePayment] = useState(0);
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [error, setError] = useState('');

  const sellableProducts = useMemo(() => (
    products.filter((product) => product.allowsSale !== false && (product.type === 'service' || Number(product.qty ?? 0) > 0))
  ), [products]);

  const totals = useMemo(() => {
    return lines.reduce((sum, line) => {
      const product = products.find((item) => item._id === line.productId);
      const total = Number(line.amount || 0) * Number(line.value || product?.price || 0);
      return { amount: sum.amount + Number(line.amount || 0), value: sum.value + total };
    }, { amount: 0, value: 0 });
  }, [lines, products]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [productResponse, saleResponse] = await Promise.all([
        http.get('/products/products', { params: { limit: 100 } }),
        http.get('/products/sales', { params: { limit: 100 } }),
      ]);
      setProducts(productResponse.data.items ?? []);
      setSales(saleResponse.data.items ?? []);
    } catch (err: any) {
      setError(apiMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    const firstProduct = sellableProducts[0];
    setCode('');
    setValuePayment(0);
    setNote('');
    setLines(firstProduct ? [{ productId: firstProduct._id, amount: 1, value: Number(firstProduct.price ?? 0) }] : []);
    setError('');
    setShowModal(true);
  };

  const updateLine = (index: number, patch: Partial<SaleLine>) => {
    setLines((current) => current.map((line, lineIndex) => {
      if (lineIndex !== index) return line;
      const next = { ...line, ...patch };
      if (patch.productId) {
        const product = products.find((item) => item._id === patch.productId);
        next.value = Number(product?.price ?? 0);
      }
      return next;
    }));
  };

  const addLine = () => {
    const product = sellableProducts.find((item) => !lines.some((line) => line.productId === item._id)) ?? sellableProducts[0];
    if (!product) return;
    setLines((current) => [...current, { productId: product._id, amount: 1, value: Number(product.price ?? 0) }]);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const selectedLines = lines.filter((line) => line.productId && Number(line.amount) > 0);
    if (selectedLines.length === 0) {
      setError('Đơn bán phải có ít nhất một dòng hàng.');
      return;
    }
    for (const line of selectedLines) {
      const product = products.find((item) => item._id === line.productId);
      if (product?.type !== 'service' && Number(line.amount) > Number(product?.qty ?? 0)) {
        setError(`Tồn kho của ${product?.code} không đủ để bán.`);
        return;
      }
    }
    try {
      await http.post('/products/sales', {
        code,
        valuePayment,
        note,
        status: 'draft',
        items: selectedLines,
      });
      setShowModal(false);
      await load();
    } catch (err: any) {
      setError(apiMessage(err));
    }
  };

  const complete = async (sale: SalePayment) => {
    if (!window.confirm(`Hoàn tất đơn ${sale.code} và trừ tồn kho?`)) return;
    try {
      await http.post(`/products/sales/${sale._id}/complete`);
      await load();
    } catch (err: any) {
      setError(apiMessage(err));
    }
  };

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div className="page-title-block">
          <div className="page-icon"><ShoppingCart size={24} /></div>
          <div>
            <h1>Bán hàng</h1>
            <p>Tạo đơn bán từ hàng hóa đang có trong kho, tự tính tổng tiền và trừ tồn khi hoàn tất.</p>
          </div>
        </div>
        <div className="page-actions"><button className="btn btn-light" type="button" onClick={() => { window.location.href = '/products/storage-duration?tab=slow_selling'; }}>Hàng tồn lâu nên ưu tiên bán</button>
          <button className="btn btn-light" type="button" onClick={load}><RefreshCw size={16} /> Làm mới</button>
          <button className="btn btn-primary" type="button" onClick={openCreate}><Plus size={16} /> Tạo đơn bán</button>
        </div>
      </div>

      <div className="metric-row">
        <div className="metric-card"><span>Hàng có thể bán</span><strong>{sellableProducts.length}</strong></div>
        <div className="metric-card success"><span>Doanh thu đã hoàn tất</span><strong>{money(sales.filter((sale) => sale.status === 'completed').reduce((sum, sale) => sum + Number(sale.value ?? 0), 0))}</strong></div>
        <div className="metric-card warning"><span>Đơn nháp</span><strong>{sales.filter((sale) => sale.status === 'draft').length}</strong></div>
      </div>

      {error && <div className="error-chip">{error}</div>}

      <section className="data-card">
        <div className="data-card-header">
          <div>
            <h2>Đơn bán</h2>
            <span className="record-badge">{sales.length} bản ghi</span>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mã đơn</th>
                <th>Dòng hàng</th>
                <th>SL</th>
                <th>Tổng tiền</th>
                <th>Đã thanh toán</th>
                <th>Trạng thái</th>
                <th>Ngày tạo</th>
                <th className="action-cell">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td className="empty-cell" colSpan={8}>Đang tải dữ liệu...</td></tr>}
              {!loading && sales.length === 0 && <tr><td className="empty-cell" colSpan={8}>Chưa có đơn bán.</td></tr>}
              {!loading && sales.map((sale) => (
                <tr key={sale._id}>
                  <td><strong>{sale.code}</strong></td>
                  <td>
                    {sale.items?.map((item, index) => {
                      const product = productFrom(item.productId, products);
                      return <small key={`${sale._id}-${index}`}>{product?.code ?? '-'} - {product?.name ?? 'Hàng hóa'}</small>;
                    })}
                  </td>
                  <td>{Number(sale.amountProducts ?? 0).toLocaleString('vi-VN')}</td>
                  <td>{money(sale.value)}</td>
                  <td>{money(sale.valuePayment)}</td>
                  <td><span className={`status-badge ${statusClass(sale.status)}`}>{sale.status}</span></td>
                  <td>{new Date(sale.createdAt).toLocaleDateString('vi-VN')}</td>
                  <td className="action-cell">
                    {sale.status !== 'completed' && <button className="mini-action" type="button" onClick={() => complete(sale)}>Hoàn tất</button>}
                  </td>
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
                <h2>Tạo đơn bán</h2>
                <p>Chọn hàng thật trong kho trước khi lưu đơn.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setShowModal(false)} title="Đóng"><X size={18} /></button>
            </div>
            <div className="form-grid">
              <label className="form-field">
                <span>Mã đơn</span>
                <input value={code} placeholder="Tự sinh nếu bỏ trống" onChange={(event) => setCode(event.target.value)} />
              </label>
              <label className="form-field">
                <span>Đã thanh toán</span>
                <input type="number" min={0} value={valuePayment} onChange={(event) => setValuePayment(Number(event.target.value || 0))} />
              </label>
              <label className="form-field wide">
                <span>Ghi chú</span>
                <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
              </label>
            </div>

            <div className="line-editor">
              <div className="line-editor-header">
                <strong>Hàng bán</strong>
                <button className="btn btn-light" type="button" onClick={addLine}><Plus size={16} /> Thêm dòng</button>
              </div>
              <div className="table-scroll">
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>Hàng hóa</th>
                      <th>Tồn</th>
                      <th>SL bán</th>
                      <th>Đơn giá</th>
                      <th>Thành tiền</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, index) => {
                      const product = products.find((item) => item._id === line.productId);
                      return (
                        <tr key={`${line.productId}-${index}`}>
                          <td>
                            <select value={line.productId} onChange={(event) => updateLine(index, { productId: event.target.value })}>
                              {sellableProducts.map((item) => <option key={item._id} value={item._id}>{item.code} - {item.name}</option>)}
                            </select>
                          </td>
                          <td>{product?.type === 'service' ? 'Dịch vụ' : `${Number(product?.qty ?? 0).toLocaleString('vi-VN')} ${product?.unit ?? ''}`}</td>
                          <td><input type="number" min={1} max={product?.type === 'service' ? undefined : Number(product?.qty ?? 0)} value={line.amount} onChange={(event) => updateLine(index, { amount: Number(event.target.value || 0) })} /></td>
                          <td>
                            <input type="number" min={0} value={line.value} onChange={(event) => updateLine(index, { value: Number(event.target.value || 0) })} />
                            {product?.clearanceActive && product?.clearancePrice ? (
                              <button type="button" className="mini-action" onClick={() => updateLine(index, { value: Number(product.clearancePrice) })} title="Áp dụng giá xả hàng riêng, không đổi giá bán chính">
                                Giá xả: {money(product.clearancePrice)}
                              </button>
                            ) : null}
                          </td>
                          <td>{money(Number(line.amount || 0) * Number(line.value || 0))}</td>
                          <td><button className="icon-button danger" type="button" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}><Trash2 size={16} /></button></td>
                        </tr>
                      );
                    })}
                    {lines.length === 0 && <tr><td className="empty-cell" colSpan={6}>Không có hàng nào đang còn tồn để bán.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="summary-strip">
              <span>Tổng SL: <strong>{totals.amount.toLocaleString('vi-VN')}</strong></span>
              <span>Tổng tiền: <strong>{money(totals.value)}</strong></span>
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="modal-footer">
              <button className="btn btn-light" type="button" onClick={() => setShowModal(false)}>Hủy</button>
              <button className="btn btn-primary" type="submit">Lưu đơn bán</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function SalesRefunds() {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<SalePayment[]>([]);
  const [refunds, setRefunds] = useState<ProductRefund[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [paymentId, setPaymentId] = useState('');
  const [code, setCode] = useState('');
  const [lines, setLines] = useState<RefundLine[]>([]);
  const [error, setError] = useState('');

  const completedSales = sales.filter((sale) => sale.status === 'completed');
  const selectedSale = completedSales.find((sale) => sale._id === paymentId);
  const totalRefund = lines.reduce((sum, line) => sum + Number(line.amount || 0) * Number(line.price || 0), 0);

  const load = async () => {
    setError('');
    try {
      const [productResponse, saleResponse, refundResponse] = await Promise.all([
        http.get('/products/products', { params: { limit: 100 } }),
        http.get('/products/sales', { params: { limit: 100 } }),
        http.get('/products/refunds', { params: { limit: 100 } }),
      ]);
      setProducts(productResponse.data.items ?? []);
      setSales(saleResponse.data.items ?? []);
      setRefunds(refundResponse.data.items ?? []);
    } catch (err: any) {
      setError(apiMessage(err));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    const sale = completedSales[0];
    setCode('');
    setPaymentId(sale?._id ?? '');
    setLines((sale?.items ?? []).map((item) => {
      const product = productFrom(item.productId, products);
      return { productId: product?._id ?? String(item.productId), amount: 0, price: Number(item.value ?? product?.price ?? 0) };
    }));
    setError('');
    setShowModal(true);
  };

  const changeSale = (id: string) => {
    const sale = completedSales.find((item) => item._id === id);
    setPaymentId(id);
    setLines((sale?.items ?? []).map((item) => {
      const product = productFrom(item.productId, products);
      return { productId: product?._id ?? String(item.productId), amount: 0, price: Number(item.value ?? product?.price ?? 0) };
    }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const selectedLines = lines.filter((line) => Number(line.amount) > 0);
    if (!paymentId || selectedLines.length === 0) {
      setError('Chọn đơn bán và nhập ít nhất một dòng hàng trả.');
      return;
    }
    try {
      await http.post('/products/refunds', { code, paymentId, status: 'draft', items: selectedLines });
      setShowModal(false);
      await load();
    } catch (err: any) {
      setError(apiMessage(err));
    }
  };

  const complete = async (refund: ProductRefund) => {
    if (!window.confirm(`Hoàn tất phiếu trả ${refund.code} và nhập lại tồn kho?`)) return;
    try {
      await http.post(`/products/refunds/${refund._id}/complete`);
      await load();
    } catch (err: any) {
      setError(apiMessage(err));
    }
  };

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div className="page-title-block">
          <div className="page-icon"><RotateCcw size={24} /></div>
          <div>
            <h1>Trả hàng bán</h1>
            <p>Tạo phiếu trả từ đơn bán đã hoàn tất, nhập lại đúng sản phẩm vào kho khi hoàn tất.</p>
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-light" type="button" onClick={load}><RefreshCw size={16} /> Làm mới</button>
          <button className="btn btn-primary" type="button" onClick={openCreate}><Plus size={16} /> Tạo phiếu trả</button>
        </div>
      </div>
      {error && <div className="error-chip">{error}</div>}
      <section className="data-card">
        <div className="data-card-header">
          <div>
            <h2>Phiếu trả hàng bán</h2>
            <span className="record-badge">{refunds.length} bản ghi</span>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mã phiếu</th>
                <th>Đơn bán</th>
                <th>Hàng trả</th>
                <th>SL</th>
                <th>Tiền trả</th>
                <th>Trạng thái</th>
                <th className="action-cell">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {refunds.length === 0 && <tr><td className="empty-cell" colSpan={7}>Chưa có phiếu trả.</td></tr>}
              {refunds.map((refund) => (
                <tr key={refund._id}>
                  <td><strong>{refund.code}</strong></td>
                  <td>{typeof refund.paymentId === 'object' ? refund.paymentId?.code : '-'}</td>
                  <td>
                    {refund.items.map((item, index) => {
                      const product = productFrom(item.productId, products);
                      return <small key={`${refund._id}-${index}`}>{product?.code ?? '-'} - {product?.name ?? 'Hàng hóa'}</small>;
                    })}
                  </td>
                  <td>{Number(refund.amount ?? 0).toLocaleString('vi-VN')}</td>
                  <td>{money(refund.value)}</td>
                  <td><span className={`status-badge ${statusClass(refund.status)}`}>{refund.status}</span></td>
                  <td className="action-cell">{refund.status !== 'completed' && <button className="mini-action" type="button" onClick={() => complete(refund)}>Hoàn tất</button>}</td>
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
                <h2>Tạo phiếu trả hàng bán</h2>
                <p>Chỉ trả các sản phẩm thuộc đơn bán đã hoàn tất.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setShowModal(false)} title="Đóng"><X size={18} /></button>
            </div>
            <div className="form-grid">
              <label className="form-field">
                <span>Mã phiếu</span>
                <input value={code} placeholder="Tự sinh nếu bỏ trống" onChange={(event) => setCode(event.target.value)} />
              </label>
              <label className="form-field">
                <span>Đơn bán</span>
                <select value={paymentId} onChange={(event) => changeSale(event.target.value)}>
                  {completedSales.map((sale) => <option key={sale._id} value={sale._id}>{sale.code} - {money(sale.value)}</option>)}
                </select>
              </label>
            </div>
            <div className="line-editor">
              <div className="line-editor-header"><strong>Hàng trả</strong></div>
              <div className="table-scroll">
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>Hàng hóa</th>
                      <th>Đã bán</th>
                      <th>SL trả</th>
                      <th>Đơn giá</th>
                      <th>Tiền trả</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, index) => {
                      const product = products.find((item) => item._id === line.productId);
                      const saleItem = selectedSale?.items.find((item) => productFrom(item.productId, products)?._id === line.productId);
                      return (
                        <tr key={line.productId}>
                          <td>{product?.code} - {product?.name}</td>
                          <td>{Number(saleItem?.amount ?? 0).toLocaleString('vi-VN')}</td>
                          <td><input type="number" min={0} max={Number(saleItem?.amount ?? 0)} value={line.amount} onChange={(event) => setLines((current) => current.map((item, lineIndex) => lineIndex === index ? { ...item, amount: Number(event.target.value || 0) } : item))} /></td>
                          <td>{money(line.price)}</td>
                          <td>{money(Number(line.amount || 0) * Number(line.price || 0))}</td>
                        </tr>
                      );
                    })}
                    {lines.length === 0 && <tr><td className="empty-cell" colSpan={5}>Chưa có đơn bán hoàn tất để trả hàng.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="summary-strip"><span>Tiền trả: <strong>{money(totalRefund)}</strong></span></div>
            {error && <div className="form-error">{error}</div>}
            <div className="modal-footer">
              <button className="btn btn-light" type="button" onClick={() => setShowModal(false)}>Hủy</button>
              <button className="btn btn-primary" type="submit">Lưu phiếu trả</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
