import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  CreditCard,
  LoaderCircle,
  Package,
  Plus,
  Save,
  Search,
  Store,
  Trash2,
  User,
  Warehouse,
} from 'lucide-react';
import { http } from '../../core/api/http';

type SaleLine = {
  productId: string;
  code: string;
  name: string;
  quantity: number;
  price: number;
  stock: number;
  originalQuantity: number;
};

type PaymentMethodOption = {
  _id: string;
  name: string;
  code: string;
  sortOrder?: number;
  isActive?: boolean;
};

type PaymentLine = {
  key: string;
  methodId: string;
  amount: number;
};

const createPaymentLine = (methodId = '', amount = 0): PaymentLine => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  methodId,
  amount,
});

const getAvailableStock = (product: any) =>
  Number(product?.selectedStock ?? product?.totalStock ?? product?.qty ?? 0);

const formatMoney = (value: number) =>
  new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(value) || 0);

export function RetailInvoiceCreatePage() {
  const { channel = 'store' } = useParams();
  const [searchParams] = useSearchParams();
  const requestedBranchId = searchParams.get('branchId') || '';
  const editId = searchParams.get('editId');
  const navigate = useNavigate();

  const [branch, setBranch] = useState<any>(null);
  const [activeBranchId, setActiveBranchId] = useState(requestedBranchId);
  const [dbProducts, setDbProducts] = useState<any[]>([]);
  const [dbCustomers, setDbCustomers] = useState<any[]>([]);
  const [customerSuggestions, setCustomerSuggestions] = useState<any[]>([]);
  const [dbStaffs, setDbStaffs] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [loadedSale, setLoadedSale] = useState<any>(null);
  const [products, setProducts] = useState<SaleLine[]>([]);
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [form, setForm] = useState({
    invoiceCode: '',
    salesperson: '',
    customerName: '',
    phone: '',
    email: '',
    facebook: '',
    dob: '',
    addressLocation: '',
    address: '',
    cardId: '',
    customerLevel: '',
    orderSource: 'Cửa hàng',
    discount: 0,
    discountType: 'fixed' as 'fixed' | 'percentage',
    coupon: '',
    note: '',
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const [meRes, staffRes, methodRes, editRes] = await Promise.all([
          http.get('/auth/me'),
          http.get('/staff').catch(() => null),
          http.get('/products/payment-methods', { params: { limit: 5000 } }),
          editId ? http.get(`/products/sales/${editId}`) : Promise.resolve(null),
        ]);

        if (cancelled) return;

        const sale = editRes?.data;
        setLoadedSale(sale || null);
        const saleBranchId = sale?.branchId?._id || sale?.branchId || '';
        const targetBranchId = requestedBranchId || saleBranchId;
        if (!targetBranchId) throw new Error('Hóa đơn bán lẻ cần một cửa hàng/kho xuất hàng.');

        const [branchRes, productRes] = await Promise.all([
          http.get(`/system/branches/${targetBranchId}`),
          http.get('/products/inventories', { params: { branchId: targetBranchId, limit: 5000 } }),
        ]);

        if (cancelled) return;

        const methods = (methodRes.data?.items || [])
          .filter((method: PaymentMethodOption) => method.isActive !== false)
          .sort((a: PaymentMethodOption, b: PaymentMethodOption) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
        const inventoryProducts = productRes.data?.items || [];

        setActiveBranchId(targetBranchId);
        setBranch(branchRes.data);
        setDbProducts(inventoryProducts);
        setDbStaffs(staffRes?.data?.items || []);
        setPaymentMethods(methods);
        setForm((current) => ({
          ...current,
          salesperson: meRes.data?.name || '',
        }));

        if (sale) {
          setForm((current) => ({
            ...current,
            invoiceCode: sale.code || '',
            salesperson: sale.authorId?.name || sale.userId?.name || current.salesperson,
            customerName: sale.customerId?.name || '',
            phone: sale.customerId?.phone || '',
            email: sale.customerId?.email || '',
            address: sale.customerId?.address || '',
            note: sale.note || '',
            discount: Number(sale.discountValue) || 0,
            discountType: sale.discountType === 'percent' ? 'percentage' : 'fixed',
          }));

          setProducts((sale.items || []).map((item: any) => {
            const productId = item.productId?._id || item.productId;
            const inventory = inventoryProducts.find((product: any) => product._id === productId);
            const originalQuantity = Number(item.amount) || 1;
            return {
              productId,
              code: item.productId?.code || inventory?.code || '',
              name: item.productId?.name || inventory?.name || 'Sản phẩm',
              quantity: originalQuantity,
              price: Number(item.value) || 0,
              stock: getAvailableStock(inventory),
              originalQuantity,
            };
          }));

          const existingPayments = (sale.typePayment || [])
            .map((line: any) => ({
              key: `${line.methodId?._id || line.methodId}-${Math.random().toString(36).slice(2)}`,
              methodId: line.methodId?._id || line.methodId || '',
              amount: Number(line.amount) || 0,
            }))
            .filter((line: PaymentLine) => line.methodId);
          setPaymentLines(
            existingPayments.length > 0
              ? existingPayments
              : [createPaymentLine(methods[0]?._id || '', Number(sale.valuePayment || sale.value) || 0)],
          );
        } else {
          setPaymentLines([createPaymentLine(methods[0]?._id || '', 0)]);
        }
      } catch (err: any) {
        if (!cancelled) setErrorMessage(err.response?.data?.message || err.message || 'Không tải được dữ liệu tạo hóa đơn.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [editId, requestedBranchId]);

  const subtotal = useMemo(
    () => products.reduce((sum, product) => sum + product.price * product.quantity, 0),
    [products],
  );
  const discountAmount = useMemo(() => {
    const entered = Math.max(0, Number(form.discount) || 0);
    return form.discountType === 'percentage'
      ? Math.min(subtotal, subtotal * Math.min(entered, 100) / 100)
      : Math.min(subtotal, entered);
  }, [form.discount, form.discountType, subtotal]);
  const totalAmount = Math.max(0, Math.round(subtotal - discountAmount));
  const paidAmount = paymentLines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
  const remainingAmount = totalAmount - paidAmount;

  useEffect(() => {
    setPaymentLines((current) => {
      if (current.length !== 1) return current;
      if (current[0].amount === totalAmount) return current;
      return [{ ...current[0], amount: totalAmount }];
    });
  }, [totalAmount]);

  const filteredProducts = useMemo(() => {
    const keyword = productSearch.trim().toLowerCase();
    if (!keyword) return [];
    return dbProducts
      .filter((product) => {
        const matches = product.name?.toLowerCase().includes(keyword)
          || product.code?.toLowerCase().includes(keyword)
          || product.barcode?.toLowerCase().includes(keyword);
        return matches && getAvailableStock(product) > 0;
      })
      .slice(0, 30);
  }, [dbProducts, productSearch]);

  useEffect(() => {
    if (!showCustomerDropdown) {
      setCustomerSuggestions([]);
      return;
    }
    const keyword = form.customerName.trim();
    if (!keyword) {
      setCustomerSuggestions([]);
      return;
    }
    const timeout = window.setTimeout(() => {
      http.get('/customers/customers', {
        params: {
          keyword,
          limit: 20,
          sort: 'lastPurchaseDate',
          order: 'desc',
        },
      })
        .then((response) => setCustomerSuggestions(response.data?.items || []))
        .catch(() => setCustomerSuggestions([]));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [form.customerName, showCustomerDropdown]);

  const addProduct = (product: any) => {
    const stock = getAvailableStock(product);
    setProducts((current) => {
      const index = current.findIndex((line) => line.productId === product._id);
      if (index < 0) {
        return [...current, {
          productId: product._id,
          code: product.code,
          name: product.name,
          quantity: 1,
          price: Number(product.price) || 0,
          stock,
          originalQuantity: 0,
        }];
      }
      return current.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        const maxQuantity = line.stock + line.originalQuantity;
        return { ...line, quantity: Math.min(line.quantity + 1, maxQuantity) };
      });
    });
    setProductSearch('');
    setShowProductDropdown(false);
  };

  const updateProduct = (index: number, field: 'quantity' | 'price', value: number) => {
    setProducts((current) => current.map((line, lineIndex) => {
      if (lineIndex !== index) return line;
      if (field === 'price') return { ...line, price: Math.max(0, value || 0) };
      const maxQuantity = line.stock + line.originalQuantity;
      return { ...line, quantity: Math.min(Math.max(1, value || 1), maxQuantity) };
    }));
  };

  const removeProduct = (index: number) => {
    setProducts((current) => current.filter((_, lineIndex) => lineIndex !== index));
  };

  const addPaymentLine = () => {
    const usedMethods = new Set(paymentLines.map((line) => line.methodId));
    const nextMethod = paymentMethods.find((method) => !usedMethods.has(method._id));
    if (!nextMethod) {
      setErrorMessage('Đã sử dụng tất cả phương thức thanh toán đang hoạt động.');
      return;
    }
    setErrorMessage('');
    setPaymentLines((current) => [...current, createPaymentLine(nextMethod._id, Math.max(0, remainingAmount))]);
  };

  const updatePaymentLine = (key: string, field: 'methodId' | 'amount', value: string | number) => {
    setPaymentLines((current) => current.map((line) => (
      line.key === key
        ? { ...line, [field]: field === 'amount' ? Math.max(0, Number(value) || 0) : String(value) }
        : line
    )));
  };

  const removePaymentLine = (key: string) => {
    setPaymentLines((current) => current.filter((line) => line.key !== key));
  };

  const selectCustomer = (customer: any) => {
    setForm((current) => ({
      ...current,
      customerName: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      facebook: customer.facebook || '',
      dob: customer.birthday ? new Date(customer.birthday).toISOString().split('T')[0] : '',
      addressLocation: customer.addressLocation || '',
      address: customer.address || '',
      cardId: customer.cardId || '',
      customerLevel: customer.customerLevel || '',
    }));
    setShowCustomerDropdown(false);
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage('');

    if (!activeBranchId) return setErrorMessage('Vui lòng chọn cửa hàng/kho xuất hàng.');
    if (!form.customerName.trim()) return setErrorMessage('Vui lòng nhập tên khách hàng.');
    if (products.length === 0) return setErrorMessage('Vui lòng thêm ít nhất một sản phẩm.');
    if (products.some((line) => line.quantity > line.stock + line.originalQuantity)) {
      return setErrorMessage('Số lượng sản phẩm vượt quá tồn kho của cửa hàng.');
    }
    if (paymentLines.length === 0 || paymentLines.some((line) => !line.methodId || line.amount <= 0)) {
      return setErrorMessage('Mỗi dòng thanh toán phải có phương thức và số tiền lớn hơn 0.');
    }
    if (new Set(paymentLines.map((line) => line.methodId)).size !== paymentLines.length) {
      return setErrorMessage('Một phương thức thanh toán chỉ được chọn một lần.');
    }
    if (Math.abs(remainingAmount) > 0.5) {
      return setErrorMessage(
        remainingAmount > 0
          ? `Còn thiếu ${formatMoney(remainingAmount)} đ tiền thanh toán.`
          : `Số tiền thanh toán đang vượt ${formatMoney(Math.abs(remainingAmount))} đ.`,
      );
    }

    setIsSaving(true);
    try {
      let customerId: string | null = null;
      const normalizedPhone = form.phone.trim();
      const existingCustomerResponse = await http.get('/customers/customers', {
        params: normalizedPhone
          ? { phone: normalizedPhone, limit: 5 }
          : { name: form.customerName.trim(), limit: 5 },
      }).catch(() => ({ data: { items: [] } }));
      const existingCustomer = (existingCustomerResponse.data?.items || []).find((customer: any) => (
        normalizedPhone
          ? customer.phone === normalizedPhone
          : customer.name?.trim().toLowerCase() === form.customerName.trim().toLowerCase()
      ));

      if (existingCustomer) {
        customerId = existingCustomer._id;
      } else {
        const customerResponse = await http.post('/customers/customers', {
          name: form.customerName.trim(),
          phone: normalizedPhone,
          email: form.email,
          facebook: form.facebook,
          dob: form.dob,
          cardId: form.cardId,
          customerLevel: form.customerLevel,
          addressLocation: form.addressLocation,
          address: form.address,
        });
        customerId = customerResponse.data._id;
        setDbCustomers((current) => [customerResponse.data, ...current]);
        setCustomerSuggestions((current) => [customerResponse.data, ...current.filter((item) => item._id !== customerResponse.data._id)]);
      }

      const payload = {

        branchId: activeBranchId,
        customerId,
        note: form.note,
        salesperson: form.salesperson,
        orderSource: form.orderSource,
        discountValue: discountAmount,
        discountType: 'number',
        valuePayment: paidAmount,
        typePayment: paymentLines.map((line) => ({ methodId: line.methodId, amount: line.amount })),
        status: loadedSale?.status || 'draft',
        items: products.map((line) => ({
          productId: line.productId,
          amount: line.quantity,
          value: line.price,
          discountValue: 0,
          discountType: 'number',
        })),
      };

      let saleResponse;
      let createResponse: any;
      if (editId) {
        saleResponse = await http.patch(`/products/sales/${editId}`, payload);
        createResponse = saleResponse;
      } else {
        saleResponse = await http.post('/products/sales', payload);
        createResponse = saleResponse;
        await http.post(`/products/sales/${saleResponse.data._id}/complete`);
      }
      setSuccessMessage(`Hóa đơn ${createResponse.data.code} đã được lưu và trừ tồn kho thành công.`);
      window.setTimeout(() => navigate(`/sales-channels/${channel}/retail`), 1200);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Đã xảy ra lỗi khi lưu hóa đơn.');
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="retail-create-loading">
        <style>{styles}</style>
        <LoaderCircle className="spin" size={28} />
        <span>Đang tải dữ liệu bán lẻ...</span>
      </div>
    );
  }

  return (
    <div className="retail-create-page">
      <style>{styles}</style>

      <header className="retail-create-header">
        <div>
          <button type="button" onClick={() => navigate(`/sales-channels/${channel}/retail`)} aria-label="Quay lại">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1>{editId ? 'Sửa hóa đơn bán lẻ' : 'Thêm hóa đơn bán lẻ'}</h1>
            <span><Warehouse size={14} /> {branch ? `${branch.name} (${branch.code || '—'})` : 'Chưa xác định kho'}</span>
          </div>
        </div>
        <button className="create-save-top" type="submit" form="retail-create-form" disabled={isSaving}>
          <Save size={16} /> {isSaving ? 'Đang lưu...' : 'Lưu hóa đơn'}
        </button>
      </header>

      {errorMessage && <div className="create-alert error"><AlertCircle size={18} /><span>{errorMessage}</span></div>}
      {successMessage && <div className="create-alert success"><CheckCircle size={18} /><span>{successMessage}</span></div>}

      <form id="retail-create-form" className="retail-create-layout" onSubmit={handleSave}>
        <main>
          <section className="create-card">
            <h2><Store size={17} /> Thông tin chung</h2>
            <div className="create-form-grid">
              <label>
                <span>Mã hóa đơn</span>
                <input readOnly value={form.invoiceCode || 'Tự động khi lưu'} />
              </label>
              <label>
                <span>Nhân viên bán hàng</span>
                <select value={form.salesperson} onChange={(event) => setForm((current) => ({ ...current, salesperson: event.target.value }))}>
                  <option value="">— Chọn nhân viên —</option>
                  {dbStaffs.map((staff) => <option key={staff._id} value={staff.name}>{staff.name}</option>)}
                  {form.salesperson && !dbStaffs.some((staff) => staff.name === form.salesperson) && (
                    <option value={form.salesperson}>{form.salesperson}</option>
                  )}
                </select>
              </label>
              <label>
                <span>Nguồn đơn hàng</span>
                <input value={form.orderSource} onChange={(event) => setForm((current) => ({ ...current, orderSource: event.target.value }))} />
              </label>
              <label>
                <span>Mã coupon</span>
                <input value={form.coupon} onChange={(event) => setForm((current) => ({ ...current, coupon: event.target.value }))} />
              </label>
            </div>
          </section>

          <section className="create-card">
            <h2><User size={17} /> Khách hàng</h2>
            <div className="create-form-grid">
              <label className="customer-search">
                <span>Tên khách hàng *</span>
                <input
                  required
                  value={form.customerName}
                  placeholder="Nhập họ tên hoặc số điện thoại"
                  onFocus={() => setShowCustomerDropdown(true)}
                  onBlur={() => window.setTimeout(() => setShowCustomerDropdown(false), 150)}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, customerName: event.target.value }));
                    setShowCustomerDropdown(true);
                  }}
                />
                {showCustomerDropdown && customerSuggestions.length > 0 && (
                  <div className="create-dropdown">
                    {customerSuggestions.map((customer) => (
                      <button type="button" key={customer._id} onMouseDown={(event) => event.preventDefault()} onClick={() => selectCustomer(customer)}>
                        <strong>{customer.name}</strong><span>{customer.phone || '—'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </label>
              <label><span>Số điện thoại</span><input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></label>
              <label><span>Email</span><input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></label>
              <label><span>Facebook</span><input value={form.facebook} onChange={(event) => setForm((current) => ({ ...current, facebook: event.target.value }))} /></label>
              <label><span>Ngày sinh</span><input type="date" value={form.dob} onChange={(event) => setForm((current) => ({ ...current, dob: event.target.value }))} /></label>
              <label><span>Mã thẻ</span><input value={form.cardId} onChange={(event) => setForm((current) => ({ ...current, cardId: event.target.value }))} /></label>
              <label><span>Cấp độ thành viên</span><input value={form.customerLevel} onChange={(event) => setForm((current) => ({ ...current, customerLevel: event.target.value }))} /></label>
              <label><span>Khu vực</span><input value={form.addressLocation} onChange={(event) => setForm((current) => ({ ...current, addressLocation: event.target.value }))} /></label>
              <label className="wide"><span>Địa chỉ</span><input value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} /></label>
            </div>
          </section>

          <section className="create-card product-card">
            <div className="create-card-heading">
              <h2><Package size={17} /> Sản phẩm ({products.length})</h2>
              <span>Tổng số lượng: {products.reduce((sum, line) => sum + line.quantity, 0)}</span>
            </div>
            <div className="product-search">
              <Search size={16} />
              <input
                id="retail-product-search"
                value={productSearch}
                placeholder="Tìm theo mã, barcode hoặc tên sản phẩm..."
                onFocus={() => setShowProductDropdown(true)}
                onBlur={() => window.setTimeout(() => setShowProductDropdown(false), 150)}
                onChange={(event) => {
                  setProductSearch(event.target.value);
                  setShowProductDropdown(true);
                }}
              />
              {showProductDropdown && filteredProducts.length > 0 && (
                <div className="create-dropdown product-results">
                  {filteredProducts.map((product) => (
                    <button type="button" key={product._id} onMouseDown={(event) => event.preventDefault()} onClick={() => addProduct(product)}>
                      <span><strong>{product.name}</strong><small>{product.code} · {formatMoney(product.price)} đ</small></span>
                      <em>Tồn: {getAvailableStock(product)}</em>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="create-table-scroll">
              <table>
                <thead><tr><th>#</th><th>Sản phẩm</th><th className="number">Tồn</th><th className="number">Số lượng</th><th className="number">Đơn giá</th><th className="number">Thành tiền</th><th /></tr></thead>
                <tbody>
                  {products.map((line, index) => (
                    <tr key={line.productId}>
                      <td>{index + 1}</td>
                      <td><div className="line-product"><strong>{line.name}</strong><span>{line.code}</span></div></td>
                      <td className="number">{line.stock + line.originalQuantity}</td>
                      <td className="number">
                        <input
                          aria-label={`Số lượng ${line.code}`}
                          type="number"
                          min={1}
                          max={line.stock + line.originalQuantity}
                          value={line.quantity}
                          onChange={(event) => updateProduct(index, 'quantity', Number(event.target.value))}
                        />
                      </td>
                      <td className="number">
                        <input
                          aria-label={`Đơn giá ${line.code}`}
                          type="number"
                          min={0}
                          value={line.price}
                          onChange={(event) => updateProduct(index, 'price', Number(event.target.value))}
                        />
                      </td>
                      <td className="number line-total">{formatMoney(line.price * line.quantity)} đ</td>
                      <td><button className="remove-line" type="button" onClick={() => removeProduct(index)} aria-label={`Xóa ${line.code}`}><Trash2 size={16} /></button></td>
                    </tr>
                  ))}
                  {products.length === 0 && <tr><td colSpan={7}><div className="create-empty">Chưa có sản phẩm trong hóa đơn.</div></td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </main>

        <aside>
          <section className="create-card payment-card">
            <h2><CreditCard size={17} /> Thanh toán</h2>
            <dl className="payment-summary">
              <div><dt>Tiền hàng</dt><dd>{formatMoney(subtotal)} đ</dd></div>
              <div className="discount-row">
                <dt>Giảm giá</dt>
                <dd>
                  <input type="number" min={0} value={form.discount || ''} onChange={(event) => setForm((current) => ({ ...current, discount: Number(event.target.value) || 0 }))} />
                  <button type="button" onClick={() => setForm((current) => ({ ...current, discountType: current.discountType === 'fixed' ? 'percentage' : 'fixed' }))}>
                    {form.discountType === 'percentage' ? '%' : 'đ'}
                  </button>
                </dd>
              </div>
              <div className="grand"><dt>Tổng thanh toán</dt><dd>{formatMoney(totalAmount)} đ</dd></div>
            </dl>

            <div className="payment-heading">
              <strong>Phương thức thanh toán</strong>
              <button type="button" onClick={addPaymentLine} disabled={paymentLines.length >= paymentMethods.length}>
                <Plus size={14} /> Thêm phương thức
              </button>
            </div>

            <div className="payment-lines">
              {paymentLines.map((line) => (
                <div className="payment-line" key={line.key}>
                  <select
                    aria-label="Phương thức thanh toán"
                    value={line.methodId}
                    onChange={(event) => updatePaymentLine(line.key, 'methodId', event.target.value)}
                  >
                    <option value="">— Chọn phương thức —</option>
                    {paymentMethods.map((method) => (
                      <option
                        key={method._id}
                        value={method._id}
                        disabled={paymentLines.some((other) => other.key !== line.key && other.methodId === method._id)}
                      >
                        {method.name}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="Số tiền thanh toán"
                    type="number"
                    min={0}
                    value={line.amount || ''}
                    onChange={(event) => updatePaymentLine(line.key, 'amount', event.target.value)}
                  />
                  <button type="button" onClick={() => removePaymentLine(line.key)} disabled={paymentLines.length === 1} aria-label="Xóa phương thức thanh toán">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>

            <div className={`payment-balance ${Math.abs(remainingAmount) <= 0.5 ? 'balanced' : 'unbalanced'}`}>
              <span>{remainingAmount >= 0 ? 'Còn phải thanh toán' : 'Thanh toán vượt'}</span>
              <strong>{formatMoney(Math.abs(remainingAmount))} đ</strong>
            </div>

            <label className="note-field">
              <span>Ghi chú hóa đơn</span>
              <textarea rows={4} value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} />
            </label>

            <button className="submit-sale" type="submit" disabled={isSaving}>
              <Save size={17} /> {isSaving ? 'Đang lưu hóa đơn...' : 'Xác nhận & Lưu'}
            </button>
          </section>
        </aside>
      </form>
    </div>
  );
}

const styles = `
.retail-create-page{max-width:1480px;margin:0 auto;padding:20px;color:#25313e;font-family:Inter,system-ui,sans-serif}
.retail-create-loading{min-height:360px;display:flex;align-items:center;justify-content:center;gap:10px;color:#667586}.spin{animation:retailCreateSpin 1s linear infinite}@keyframes retailCreateSpin{to{transform:rotate(360deg)}}
.retail-create-header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}.retail-create-header>div{display:flex;align-items:center;gap:12px}.retail-create-header>div>button{width:38px;height:38px;display:inline-flex;align-items:center;justify-content:center;border:1px solid #d4dce4;border-radius:6px;background:#fff;cursor:pointer}.retail-create-header h1{margin:0;font-size:22px}.retail-create-header span{display:flex;align-items:center;gap:5px;margin-top:4px;color:#687786;font-size:12px}
.create-save-top,.submit-sale{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:0;border-radius:6px;background:#1677d2;color:#fff;font-weight:750;cursor:pointer}.create-save-top{height:38px;padding:0 16px}.create-save-top:disabled,.submit-sale:disabled{opacity:.6;cursor:not-allowed}
.create-alert{display:flex;align-items:center;gap:9px;margin-bottom:14px;padding:11px 13px;border-radius:6px;font-size:13px}.create-alert.error{border:1px solid #efb3ae;background:#fff3f2;color:#b42318}.create-alert.success{border:1px solid #a8dfb5;background:#effbf2;color:#187b31}
.retail-create-layout{display:grid;grid-template-columns:minmax(0,1fr) 390px;gap:18px;align-items:start}.retail-create-layout main{display:flex;flex-direction:column;gap:16px}.retail-create-layout aside{position:sticky;top:18px}
.create-card{background:#fff;border:1px solid #d9e0e6;border-radius:8px;box-shadow:0 1px 2px rgba(20,35,50,.04);overflow:visible}.create-card>h2,.create-card-heading{display:flex;align-items:center;gap:8px;margin:0;padding:12px 15px;border-bottom:1px solid #e1e6eb;background:#f7f9fb;font-size:14px}.create-card-heading{justify-content:space-between}.create-card-heading h2{display:flex;align-items:center;gap:8px;margin:0;font-size:14px}.create-card-heading>span{color:#667586;font-size:12px}
.create-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px;padding:15px}.create-form-grid label,.note-field{display:flex;flex-direction:column;gap:5px;position:relative}.create-form-grid label.wide{grid-column:1/-1}.create-form-grid label>span,.note-field>span{color:#52616f;font-size:12px;font-weight:700}
.create-form-grid input,.create-form-grid select,.note-field textarea{width:100%;min-width:0;padding:9px 10px;border:1px solid #cfd8e1;border-radius:5px;background:#fff;color:#25313e;font:inherit;font-size:13px;outline:0}.create-form-grid input:focus,.create-form-grid select:focus,.note-field textarea:focus{border-color:#168cf0;box-shadow:0 0 0 2px rgba(22,140,240,.1)}.create-form-grid input:read-only{background:#f4f6f8;color:#708090}
.create-dropdown{position:absolute;z-index:30;top:100%;left:0;right:0;max-height:260px;margin-top:4px;padding:5px;overflow:auto;border:1px solid #ccd6df;border-radius:6px;background:#fff;box-shadow:0 12px 28px rgba(30,50,70,.17)}.create-dropdown button{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px;border:0;border-radius:4px;background:transparent;color:#263442;text-align:left;cursor:pointer}.create-dropdown button:hover{background:#edf6fd}.create-dropdown button span{display:flex;flex-direction:column;gap:2px}.create-dropdown button span:last-child,.create-dropdown small{color:#718091;font-size:11px}.create-dropdown em{color:#23833c;font-size:12px;font-style:normal;font-weight:700}
.product-search{position:relative;display:flex;align-items:center;gap:8px;margin:14px;padding:0 11px;border:1px solid #cfd8e1;border-radius:6px}.product-search>input{width:100%;padding:10px 0;border:0;outline:0;font:inherit;font-size:13px}.product-results{top:42px}
.create-table-scroll{overflow:auto;border-top:1px solid #e1e6eb}.create-table-scroll table{width:100%;min-width:760px;border-collapse:collapse;font-size:12px}.create-table-scroll th{padding:8px 10px;background:#eef2f5;border-bottom:1px solid #c8d1da;color:#394754;text-align:left}.create-table-scroll td{padding:9px 10px;border-bottom:1px solid #e2e7ec}.create-table-scroll .number{text-align:right}.create-table-scroll input{width:92px;padding:6px;border:1px solid #cfd8e1;border-radius:4px;text-align:right}.line-product{display:flex;flex-direction:column;gap:2px}.line-product span{color:#718091;font-size:11px}.line-total{color:#148536;font-weight:750}.remove-line,.payment-line>button{width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;border:1px solid #e0b7b3;border-radius:5px;background:#fff5f4;color:#c33930;cursor:pointer}.remove-line:disabled,.payment-line>button:disabled{opacity:.4;cursor:not-allowed}.create-empty{padding:40px;text-align:center;color:#718091}
.payment-card{overflow:hidden}.payment-summary{margin:0;padding:13px 15px}.payment-summary>div{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0}.payment-summary dt{color:#657483}.payment-summary dd{margin:0;font-weight:700}.payment-summary .grand{margin-top:6px;padding-top:12px;border-top:1px solid #dce3e9;font-size:15px}.payment-summary .grand dd{color:#168535;font-size:19px}.discount-row dd{display:flex;gap:4px}.discount-row input{width:86px;padding:6px;border:1px solid #cfd8e1;border-radius:4px;text-align:right}.discount-row button{width:34px;border:1px solid #cfd8e1;border-radius:4px;background:#f5f7f9;font-weight:750;cursor:pointer}
.payment-heading{display:flex;align-items:center;justify-content:space-between;padding:10px 15px;border-top:1px solid #e1e6eb}.payment-heading strong{font-size:13px}.payment-heading button{display:inline-flex;align-items:center;gap:4px;border:0;background:transparent;color:#0878cc;font-weight:700;font-size:12px;cursor:pointer}.payment-heading button:disabled{opacity:.45;cursor:not-allowed}
.payment-lines{display:flex;flex-direction:column;gap:8px;padding:0 15px 12px}.payment-line{display:grid;grid-template-columns:minmax(0,1fr) 120px auto;gap:7px}.payment-line select,.payment-line input{min-width:0;padding:8px;border:1px solid #cfd8e1;border-radius:5px;background:#fff;font:inherit;font-size:12px}.payment-line input{text-align:right}
.payment-balance{display:flex;justify-content:space-between;gap:10px;margin:0 15px 14px;padding:10px;border-radius:5px;font-size:12px}.payment-balance.balanced{background:#edf9f0;color:#207b37}.payment-balance.unbalanced{background:#fff5e5;color:#956100}.note-field{padding:0 15px 14px}.note-field textarea{resize:vertical}.submit-sale{width:calc(100% - 30px);height:42px;margin:0 15px 15px}
@media(max-width:1050px){.retail-create-layout{grid-template-columns:1fr}.retail-create-layout aside{position:static}}@media(max-width:680px){.retail-create-page{padding:12px}.retail-create-header{align-items:flex-start}.create-save-top{display:none}.create-form-grid{grid-template-columns:1fr}.create-form-grid label.wide{grid-column:auto}.payment-line{grid-template-columns:1fr 100px auto}}
`;
