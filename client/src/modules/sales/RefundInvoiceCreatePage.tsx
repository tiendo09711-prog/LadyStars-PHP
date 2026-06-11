import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft, 
  Calendar, 
  DollarSign, 
  FileText, 
  Phone, 
  Save, 
  Tag, 
  User, 
  Warehouse, 
  Briefcase, 
  Percent, 
  CreditCard, 
  Info,
  CheckCircle,
  AlertCircle,
  Search,
  Trash2,
  PlusCircle,
  ShieldAlert,
  Coins,
  MapPin,
  Facebook,
  Printer,
  CalendarRange
} from 'lucide-react';
import { http } from '../../core/api/http';

interface RefundProduct {
  _id?: string;
  code: string;
  name: string;
  stock: number;
  qty: number;
  price: number;
  cost: number;
  unit: string;
  barcode?: string;
  imei?: string;
  batch?: string;
  brand?: string;
  vat: number;
  refundFee: number;
  extendedWarrantyName?: string;
  extendedWarrantyFee: number;
  gift?: string;
  giftCost: number;
  total: number;
}

export function RefundInvoiceCreatePage() {
  const { channel } = useParams();
  const [searchParams] = useSearchParams();
  const branchId = searchParams.get('branchId');
  const navigate = useNavigate();

  const [branch, setBranch] = useState<any>(null);
  const [loadingBranch, setLoadingBranch] = useState(false);

  // Form state structure matching Nhanh.vn Refund CSV and exchange functionality
  const [form, setForm] = useState({
    id: 'HDTH-' + Math.floor(100000 + Math.random() * 900000),
    date: new Date().toLocaleDateString('vi-VN') + ' ' + new Date().toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }),
    returnOrderId: '',
    receiver: 'Lê Sỹ Bách',
    salesAccount: '',
    salesperson: '',
    cashier: 'Lê Sỹ Bách',
    type: 'Trả lại bán lẻ [L]',
    warehouse: '',
    description: '', // Ghi chú hóa đơn trả
    newDescription: '', // Ghi chú hóa đơn mua mới
    returnFromInvoice: '',
    returnFromOrder: '',
    status: 'Mới',

    // Customer Info (Extended)
    customerPhone: '',
    customerName: '',
    email: '',
    address: '',
    gender: 'Nữ',
    facebook: '',
    birthday: '',
    customerLevel: 'Đồng',
    source: 'Trực tiếp',
    cardId: '',
    labels: '',
    province: '',
    district: '',
    ward: '',
    companyAddress: '',
    companyName: '',
    taxId: '',
    note: '', // Ghi chú khách hàng

    // Order Totals / Aggregates
    discount: 0, // Chiết khấu đơn hàng (F6)
    cash: 0,
    transfer: 0,
    card: 0, // Quẹt thẻ
    totalAmount: 0, // Tổng tiền chênh lệch (Cửa hàng trả khách nếu >0, Khách trả cửa hàng nếu <0)
    refundAmount: 0, // Thực tế trả khách (nếu totalAmount > 0)
    refundFee: 0, // Tổng phí trả hàng
    
    // Auto flags
    autoDiscount: false, // Bỏ chiết khấu tự động
    autoPoint: false, // Bỏ tích điểm tự động
    coupon: '',
    autoPrint: true, // Tự động in sau khi lưu hóa đơn(F10)
  });

  // Refunded Products state
  const [products, setProducts] = useState<RefundProduct[]>([]);
  
  // New Purchased Products state
  const [newProducts, setNewProducts] = useState<RefundProduct[]>([]);
  
  const [dbProducts, setDbProducts] = useState<any[]>([]);
  
  // Search state for refund products
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [productTypeTab, setProductTypeTab] = useState<'normal' | 'imei'>('normal');

  // Search state for new purchased products
  const [newSearchQuery, setNewSearchQuery] = useState('');
  const [showNewSearchResults, setShowNewSearchResults] = useState(false);
  const [newProductTypeTab, setNewProductTypeTab] = useState<'normal' | 'imei'>('normal');

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Fetch branch details
  useEffect(() => {
    if (branchId) {
      setLoadingBranch(true);
      http.get(`/system/branches/${branchId}`)
        .then((res) => {
          setBranch(res.data);
          setForm(prev => ({
            ...prev,
            warehouse: res.data?.name || ''
          }));
        })
        .catch((err) => {
          console.error("Lỗi lấy thông tin kho:", err);
        })
        .finally(() => {
          setLoadingBranch(false);
        });
    }
  }, [branchId]);

  // Load products list for local fast auto-suggest
  useEffect(() => {
    http.get('/products/products?limit=150')
      .then((res) => {
        setDbProducts(res.data.items ?? []);
      })
      .catch((err) => {
        console.error("Lỗi lấy danh sách sản phẩm:", err);
      });
  }, []);

  // Hotkeys Hook: F3 search, F4 phone search, F9 save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        const el = document.getElementById('product-search-input');
        if (el) el.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        const el = document.getElementById('customer-phone-input');
        if (el) el.focus();
      } else if (e.key === 'F9') {
        e.preventDefault();
        const btn = document.getElementById('save-invoice-btn');
        if (btn) btn.click();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-calculator engine for returns and purchases
  useEffect(() => {
    let tempReturnsSubtotal = 0;
    let tempReturnsRefundFee = 0;
    let tempReturnsVat = 0;
    let tempReturnsWarranty = 0;

    const updatedProducts = products.map(prod => {
      const lineTotal = Math.max(0, (prod.price * prod.qty) + (prod.vat || 0) + (prod.extendedWarrantyFee || 0) - (prod.refundFee || 0));
      tempReturnsSubtotal += prod.price * prod.qty;
      tempReturnsRefundFee += prod.refundFee || 0;
      tempReturnsVat += prod.vat || 0;
      tempReturnsWarranty += prod.extendedWarrantyFee || 0;
      return { ...prod, total: lineTotal };
    });

    const hasReturnsChanged = updatedProducts.some((p, i) => p.total !== products[i]?.total);
    if (hasReturnsChanged) {
      setProducts(updatedProducts);
      return;
    }

    let tempPurchasesSubtotal = 0;
    let tempPurchasesVat = 0;
    let tempPurchasesWarranty = 0;

    const updatedNewProducts = newProducts.map(prod => {
      const lineTotal = Math.max(0, (prod.price * prod.qty) + (prod.vat || 0) + (prod.extendedWarrantyFee || 0));
      tempPurchasesSubtotal += prod.price * prod.qty;
      tempPurchasesVat += prod.vat || 0;
      tempPurchasesWarranty += prod.extendedWarrantyFee || 0;
      return { ...prod, total: lineTotal };
    });

    const hasPurchasesChanged = updatedNewProducts.some((p, i) => p.total !== newProducts[i]?.total);
    if (hasPurchasesChanged) {
      setNewProducts(updatedNewProducts);
      return;
    }

    const orderDiscount = Number(form.discount) || 0;
    const totalReturns = tempReturnsSubtotal + tempReturnsVat + tempReturnsWarranty - tempReturnsRefundFee;
    const totalPurchases = tempPurchasesSubtotal + tempPurchasesVat + tempPurchasesWarranty;
    const netTotal = totalReturns - totalPurchases - orderDiscount;

    setForm(prev => {
      const calculatedRefundAmount = netTotal > 0 ? netTotal : 0;
      if (
        prev.totalAmount === netTotal &&
        prev.refundAmount === calculatedRefundAmount &&
        prev.refundFee === tempReturnsRefundFee
      ) {
        return prev;
      }
      return {
        ...prev,
        totalAmount: netTotal,
        refundAmount: calculatedRefundAmount,
        refundFee: tempReturnsRefundFee
      };
    });
  }, [
    products,
    newProducts,
    form.discount
  ]);

  const handleChange = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  // Look up customer by phone
  const lookupCustomer = async (phoneStr: string) => {
    if (!phoneStr.trim()) return;
    try {
      const res = await http.get(`/customers/customers?phone=${phoneStr.trim()}`);
      const list = res.data.items ?? [];
      if (list.length > 0) {
        const c = list[0];
        setForm(prev => ({
          ...prev,
          customerName: c.name || '',
          email: c.email || '',
          address: c.address || '',
          gender: c.gender || 'Nữ',
          facebook: c.facebook || '',
          birthday: c.birthday || '',
          customerLevel: c.customerLevel || 'Đồng',
          cardId: c.cardId || '',
          labels: c.labels || '',
          companyAddress: c.companyAddress || '',
          companyName: c.companyName || '',
          taxId: c.taxId || '',
          note: c.note || '',
        }));
      }
    } catch (err) {
      console.error("Lỗi tìm kiếm khách hàng:", err);
    }
  };

  // Add Product Helpers (Refund Products)
  const addProduct = (prod: any) => {
    const existing = products.find(p => p.code === prod.code);
    if (existing) {
      setProducts(products.map(p => p.code === prod.code ? { ...p, qty: p.qty + 1 } : p));
    } else {
      setProducts([
        ...products,
        {
          _id: prod._id,
          code: prod.code,
          name: prod.name,
          stock: prod.qty ?? 0,
          qty: 1,
          price: prod.price ?? 0,
          cost: prod.cost ?? 0,
          unit: prod.unit ?? 'Cái',
          barcode: prod.barcode ?? '',
          imei: '',
          batch: '',
          brand: prod.brand ?? '',
          vat: 0,
          refundFee: 0,
          extendedWarrantyFee: 0,
          giftCost: 0,
          total: prod.price ?? 0,
        }
      ]);
    }
    setSearchQuery('');
    setShowSearchResults(false);
  };

  const addCustomProduct = () => {
    setProducts([
      ...products,
      {
        code: 'SPM-' + Math.floor(1000 + Math.random() * 9000),
        name: searchQuery.trim() || 'Sản phẩm ngoài danh mục',
        stock: 0,
        qty: 1,
        price: 0,
        cost: 0,
        unit: 'Cái',
        imei: '',
        batch: '',
        brand: '',
        vat: 0,
        refundFee: 0,
        extendedWarrantyFee: 0,
        giftCost: 0,
        total: 0,
      }
    ]);
    setSearchQuery('');
    setShowSearchResults(false);
  };

  const handleProductChange = (index: number, key: keyof RefundProduct, val: any) => {
    const updated = [...products];
    updated[index] = { ...updated[index], [key]: val };
    setProducts(updated);
  };

  const removeProduct = (index: number) => {
    setProducts(products.filter((_, i) => i !== index));
  };

  // Add Product Helpers (New Purchase Products)
  const addNewProduct = (prod: any) => {
    const existing = newProducts.find(p => p.code === prod.code);
    if (existing) {
      setNewProducts(newProducts.map(p => p.code === prod.code ? { ...p, qty: p.qty + 1 } : p));
    } else {
      setNewProducts([
        ...newProducts,
        {
          _id: prod._id,
          code: prod.code,
          name: prod.name,
          stock: prod.qty ?? 0,
          qty: 1,
          price: prod.price ?? 0,
          cost: prod.cost ?? 0,
          unit: prod.unit ?? 'Cái',
          barcode: prod.barcode ?? '',
          imei: '',
          batch: '',
          brand: prod.brand ?? '',
          vat: 0,
          refundFee: 0,
          extendedWarrantyFee: 0,
          giftCost: 0,
          total: prod.price ?? 0,
        }
      ]);
    }
    setNewSearchQuery('');
    setShowNewSearchResults(false);
  };

  const addCustomNewProduct = () => {
    setNewProducts([
      ...newProducts,
      {
        code: 'SPM-' + Math.floor(1000 + Math.random() * 9000),
        name: newSearchQuery.trim() || 'Sản phẩm mua mới ngoài danh mục',
        stock: 0,
        qty: 1,
        price: 0,
        cost: 0,
        unit: 'Cái',
        imei: '',
        batch: '',
        brand: '',
        vat: 0,
        refundFee: 0,
        extendedWarrantyFee: 0,
        giftCost: 0,
        total: 0,
      }
    ]);
    setNewSearchQuery('');
    setShowNewSearchResults(false);
  };

  const handleNewProductChange = (index: number, key: keyof RefundProduct, val: any) => {
    const updated = [...newProducts];
    updated[index] = { ...updated[index], [key]: val };
    setNewProducts(updated);
  };

  const removeNewProduct = (index: number) => {
    setNewProducts(newProducts.filter((_, i) => i !== index));
  };

  // Save handler
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerName.trim()) {
      setErrorMessage('Vui lòng nhập tên khách hàng hoặc tìm kiếm bằng SĐT');
      return;
    }
    if (products.length === 0) {
      setErrorMessage('Vui lòng thêm ít nhất một sản phẩm để trả hàng');
      return;
    }

    setErrorMessage('');
    setIsSaving(true);

    const firstProduct = products[0];
    const totalQty = products.reduce((acc, p) => acc + p.qty, 0);

    const payload = {
      code: form.id,
      branchId: branchId,
      note: form.description,
      status: 'draft',
      amountProducts: totalQty,
      value: form.refundAmount,
      items: products.map(p => ({
        productId: p._id,
        amount: p.qty,
        value: p.price,
        discountValue: p.refundFee || 0,
        discountType: 'number',
        total: p.total,
        note: p.imei ? `IMEI: ${p.imei}` : ''
      })),
      // Future mapping for payment methods if necessary
      typePayment: [
        ...(form.cash > 0 ? [{ methodId: null, amount: form.cash }] : []),
        ...(form.transfer > 0 ? [{ methodId: null, amount: form.transfer }] : []),
        ...(form.card > 0 ? [{ methodId: null, amount: form.card }] : [])
      ]
    };

    try {
      const createRes = await http.post('/products/refunds', payload);
      const refundId = createRes.data._id;

      await http.post(`/products/refunds/${refundId}/complete`);

      setSuccessMessage('Hóa đơn đổi trả hàng đã được tạo và lưu kho thành công!');
      setTimeout(() => {
        navigate(`/sales-channels/${channel}/refund`);
      }, 1200);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.response?.data?.message ?? 'Lỗi khi lưu hóa đơn đổi trả hàng.');
      setIsSaving(false);
    }
  };

  const autocompleteList = searchQuery.trim() === '' ? [] : dbProducts.filter(p => 
    p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.code?.toLowerCase().includes(searchQuery.toLowerCase())
  ).slice(0, 10);

  const newAutocompleteList = newSearchQuery.trim() === '' ? [] : dbProducts.filter(p => 
    p.name?.toLowerCase().includes(newSearchQuery.toLowerCase()) ||
    p.code?.toLowerCase().includes(newSearchQuery.toLowerCase())
  ).slice(0, 10);

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '24px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      
      {/* Top Banner and Navigation Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button 
            type="button" 
            onClick={() => navigate(`/sales-channels/${channel}/refund`)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              width: '40px', 
              height: '40px', 
              borderRadius: '10px', 
              border: '1px solid #e2e8f0', 
              background: '#ffffff', 
              cursor: 'pointer',
              color: '#475569',
              transition: 'all 0.2s'
            }}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              Tạo Mới Hóa Đơn Trả Hàng
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Warehouse size={14} color="#7c3aed" />
                <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
                  Kho nhận trả: {loadingBranch ? 'Đang tải...' : (branch ? `${branch.name} (${branch.code})` : 'Chưa chọn kho')}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Briefcase size={14} color="#059669" />
                <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
                  Nhân viên nhận: {form.receiver}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            type="button"
            onClick={() => navigate(`/sales-channels/${channel}/refund`)}
            style={{ borderRadius: '10px', padding: '10px 20px', fontSize: '14px', border: '1px solid #cbd5e1', background: '#ffffff', fontWeight: '600', color: '#475569', cursor: 'pointer' }}
          >
            Hủy bỏ
          </button>
          <button 
            type="button"
            id="save-invoice-btn"
            disabled={isSaving}
            onClick={handleSave}
            style={{ 
              borderRadius: '10px', 
              padding: '10px 24px', 
              fontSize: '14px', 
              fontWeight: '600', 
              background: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)', 
              color: '#ffffff',
              border: 'none', 
              boxShadow: '0 4px 14px rgba(225, 29, 72, 0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.7 : 1
            }}
          >
            <Save size={16} />
            {isSaving ? 'Đang lưu...' : 'Lưu trả hàng (F9)'}
          </button>
        </div>
      </div>

      {errorMessage && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', padding: '14px 18px', borderRadius: '10px', marginBottom: '24px', fontSize: '14px', fontWeight: '500' }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#ecfdf5', border: '1px solid #6ee7b7', color: '#047857', padding: '14px 18px', borderRadius: '10px', marginBottom: '24px', fontSize: '14px', fontWeight: '500' }}>
          <CheckCircle size={18} style={{ flexShrink: 0 }} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Main 2-Columns Layout */}
      <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: '24px', alignItems: 'start' }}>
        
        {/* Left Column - Products, Staff & Notes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Products & Search Box */}
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              
              {/* Product Type Tabs */}
              <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '3px' }}>
                <button
                  type="button"
                  onClick={() => setProductTypeTab('normal')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    background: productTypeTab === 'normal' ? '#ffffff' : 'transparent',
                    color: productTypeTab === 'normal' ? '#e11d48' : '#64748b',
                    boxShadow: productTypeTab === 'normal' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    transition: 'all 0.15s'
                  }}
                >
                  Sản phẩm thường
                </button>
                <button
                  type="button"
                  onClick={() => setProductTypeTab('imei')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    background: productTypeTab === 'imei' ? '#ffffff' : 'transparent',
                    color: productTypeTab === 'imei' ? '#e11d48' : '#64748b',
                    boxShadow: productTypeTab === 'imei' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    transition: 'all 0.15s'
                  }}
                >
                  Sản phẩm IMEI
                </button>
              </div>

              {/* F3 Autocomplete Product Search Bar */}
              <div style={{ position: 'relative', width: '380px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 12px', background: '#ffffff' }}>
                  <Search size={16} color="#94a3b8" />
                  <input
                    type="text"
                    id="product-search-input"
                    placeholder="(F3) Tìm sản phẩm trả..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowSearchResults(true);
                    }}
                    onFocus={() => setShowSearchResults(true)}
                    style={{ border: 'none', background: 'transparent', outline: 'none', padding: '8px 0', width: '100%', fontSize: '13px', color: '#1e293b' }}
                  />
                </div>

                {/* Dropdown Suggestions */}
                {showSearchResults && searchQuery.trim() !== '' && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', marginTop: '6px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: '300px', overflowY: 'auto' }}>
                    {autocompleteList.length > 0 ? (
                      autocompleteList.map(prod => (
                        <div
                          key={prod._id}
                          onClick={() => addProduct(prod)}
                          style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#fff1f2'}
                          onMouseLeave={(e) => e.currentTarget.style.background = '#ffffff'}
                        >
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{prod.name}</div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Mã: {prod.code} | Giá bán: {(prod.price ?? 0).toLocaleString('vi-VN')} đ</div>
                          </div>
                          <PlusCircle size={16} color="#e11d48" />
                        </div>
                      ))
                    ) : (
                      <div style={{ padding: '12px', textAlign: 'center', fontSize: '13px', color: '#64748b' }}>
                        <span>Không tìm thấy sản phẩm. </span>
                        <button type="button" onClick={addCustomProduct} style={{ border: 'none', background: 'none', color: '#e11d48', fontWeight: '600', cursor: 'pointer', padding: 0 }}>
                          Thêm sản phẩm mới
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Products Refund Table */}
            <div style={{ overflowX: 'auto', padding: '12px' }}>
              {products.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: '12px' }}>
                  <ShieldAlert size={40} color="#cbd5e1" />
                  <span style={{ fontSize: '14px', color: '#94a3b8', textAlign: 'center' }}>
                    Chưa có hàng hóa nào được chọn để nhận trả. Nhấn F3 hoặc gõ vào thanh tìm kiếm để thêm sản phẩm.
                  </span>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: '600' }}>
                      <th style={{ padding: '12px 8px', width: '40px' }}>#</th>
                      <th style={{ padding: '12px 8px' }}>Sản phẩm</th>
                      <th style={{ padding: '12px 8px', width: '70px', textAlign: 'center' }}>SL Trả</th>
                      <th style={{ padding: '12px 8px', width: '105px', textAlign: 'right' }}>Giá bán</th>
                      <th style={{ padding: '12px 8px', width: '90px', textAlign: 'right' }}>Thuế VAT</th>
                      <th style={{ padding: '12px 8px', width: '100px', textAlign: 'right' }}>Phí trả hàng</th>
                      <th style={{ padding: '12px 8px', width: '100px', textAlign: 'right' }}>Tiền BHMR</th>
                      <th style={{ padding: '12px 8px', width: '115px', textAlign: 'right' }}>Tổng tiền nhận</th>
                      <th style={{ padding: '12px 8px', width: '40px', textAlign: 'center' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((prod, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                        {/* Index */}
                        <td style={{ padding: '12px 8px', color: '#64748b', fontWeight: '500' }}>{idx + 1}</td>
                        
                        {/* Product Detail & IMEI & Batch */}
                        <td style={{ padding: '12px 8px' }}>
                          <div style={{ fontWeight: '600', color: '#1e293b' }}>{prod.name}</div>
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', display: 'flex', gap: '8px' }}>
                            <span>Mã: {prod.code}</span>
                            {prod.brand && <span>| Hãng: {prod.brand}</span>}
                          </div>
                          
                          {/* IMEI / Batch Custom fields */}
                          <div style={{ marginTop: '6px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {(productTypeTab === 'imei' || prod.imei !== undefined) && (
                              <input
                                type="text"
                                placeholder="Mã IMEI..."
                                value={prod.imei || ''}
                                onChange={(e) => handleProductChange(idx, 'imei', e.target.value)}
                                style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', width: '130px', outline: 'none' }}
                              />
                            )}
                            <input
                              type="text"
                              placeholder="Lô hàng..."
                              value={prod.batch || ''}
                              onChange={(e) => handleProductChange(idx, 'batch', e.target.value)}
                              style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', width: '100px', outline: 'none' }}
                            />
                            <input
                              type="text"
                              placeholder="BHMR (Tên gói)..."
                              value={prod.extendedWarrantyName || ''}
                              onChange={(e) => handleProductChange(idx, 'extendedWarrantyName', e.target.value)}
                              style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', width: '120px', outline: 'none' }}
                            />
                          </div>
                        </td>

                        {/* Qty */}
                        <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                          <input
                            type="number"
                            min={1}
                            value={prod.qty}
                            onChange={(e) => handleProductChange(idx, 'qty', Math.max(1, Number(e.target.value) || 1))}
                            style={{ width: '55px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'center', fontWeight: '600', color: '#1e293b', outline: 'none' }}
                          />
                        </td>

                        {/* Price */}
                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                          <input
                            type="number"
                            min={0}
                            value={prod.price || ''}
                            onChange={(e) => handleProductChange(idx, 'price', Number(e.target.value) || 0)}
                            style={{ width: '90px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'right', fontWeight: '600', color: '#1e293b', outline: 'none' }}
                          />
                        </td>

                        {/* VAT */}
                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                          <input
                            type="number"
                            min={0}
                            placeholder="VAT"
                            value={prod.vat || ''}
                            onChange={(e) => handleProductChange(idx, 'vat', Number(e.target.value) || 0)}
                            style={{ width: '80px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'right', color: '#1e293b', outline: 'none' }}
                          />
                        </td>

                        {/* Refund Fee */}
                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                          <input
                            type="number"
                            min={0}
                            placeholder="Phí trả"
                            value={prod.refundFee || ''}
                            onChange={(e) => handleProductChange(idx, 'refundFee', Number(e.target.value) || 0)}
                            style={{ width: '85px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'right', color: '#e11d48', outline: 'none' }}
                          />
                        </td>

                        {/* Extended Warranty Fee */}
                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                          <input
                            type="number"
                            min={0}
                            placeholder="Tiền BH"
                            value={prod.extendedWarrantyFee || ''}
                            onChange={(e) => handleProductChange(idx, 'extendedWarrantyFee', Number(e.target.value) || 0)}
                            style={{ width: '85px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'right', color: '#1e293b', outline: 'none' }}
                          />
                        </td>

                        {/* Subtotal */}
                        <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: '700', color: '#1e293b' }}>
                          {(prod.total || 0).toLocaleString('vi-VN')} đ
                        </td>

                        {/* Remove */}
                        <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => removeProduct(idx)}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Products Purchase (Sản phẩm mua mới) Search & Table */}
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                  Sản phẩm mua mới (Hàng bán đi)
                </h3>
              </div>
              
              {/* Product Type Tabs */}
              <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '3px' }}>
                <button
                  type="button"
                  onClick={() => setNewProductTypeTab('normal')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    background: newProductTypeTab === 'normal' ? '#ffffff' : 'transparent',
                    color: newProductTypeTab === 'normal' ? '#e11d48' : '#64748b',
                    boxShadow: newProductTypeTab === 'normal' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    transition: 'all 0.15s'
                  }}
                >
                  Sản phẩm thường
                </button>
                <button
                  type="button"
                  onClick={() => setNewProductTypeTab('imei')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    background: newProductTypeTab === 'imei' ? '#ffffff' : 'transparent',
                    color: newProductTypeTab === 'imei' ? '#e11d48' : '#64748b',
                    boxShadow: newProductTypeTab === 'imei' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    transition: 'all 0.15s'
                  }}
                >
                  Sản phẩm IMEI
                </button>
              </div>

              {/* Autocomplete Product Search Bar */}
              <div style={{ position: 'relative', width: '380px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 12px', background: '#ffffff' }}>
                  <Search size={16} color="#94a3b8" />
                  <input
                    type="text"
                    id="new-product-search-input"
                    placeholder="Tìm sản phẩm mua mới..."
                    value={newSearchQuery}
                    onChange={(e) => {
                      setNewSearchQuery(e.target.value);
                      setShowNewSearchResults(true);
                    }}
                    onFocus={() => setShowNewSearchResults(true)}
                    style={{ border: 'none', background: 'transparent', outline: 'none', padding: '8px 0', width: '100%', fontSize: '13px', color: '#1e293b' }}
                  />
                </div>

                {/* Dropdown Suggestions */}
                {showNewSearchResults && newSearchQuery.trim() !== '' && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', marginTop: '6px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: '300px', overflowY: 'auto' }}>
                    {newAutocompleteList.length > 0 ? (
                      newAutocompleteList.map(prod => (
                        <div
                          key={prod._id}
                          onClick={() => addNewProduct(prod)}
                          style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#fff1f2'}
                          onMouseLeave={(e) => e.currentTarget.style.background = '#ffffff'}
                        >
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{prod.name}</div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Mã: {prod.code} | Giá bán: {(prod.price ?? 0).toLocaleString('vi-VN')} đ</div>
                          </div>
                          <PlusCircle size={16} color="#e11d48" />
                        </div>
                      ))
                    ) : (
                      <div style={{ padding: '12px', textAlign: 'center', fontSize: '13px', color: '#64748b' }}>
                        <span>Không tìm thấy sản phẩm. </span>
                        <button type="button" onClick={addCustomNewProduct} style={{ border: 'none', background: 'none', color: '#e11d48', fontWeight: '600', cursor: 'pointer', padding: 0 }}>
                          Thêm sản phẩm mới
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Products Purchase Table */}
            <div style={{ overflowX: 'auto', padding: '12px' }}>
              {newProducts.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: '12px' }}>
                  <ShieldAlert size={40} color="#cbd5e1" />
                  <span style={{ fontSize: '14px', color: '#94a3b8', textAlign: 'center' }}>
                    Chưa có hàng hóa nào được chọn để mua mới. Nhập thông tin vào thanh tìm kiếm để thêm sản phẩm mua mới.
                  </span>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: '600' }}>
                      <th style={{ padding: '12px 8px', width: '40px' }}>#</th>
                      <th style={{ padding: '12px 8px' }}>Sản phẩm mua mới</th>
                      <th style={{ padding: '12px 8px', width: '70px', textAlign: 'center' }}>SL Mua</th>
                      <th style={{ padding: '12px 8px', width: '105px', textAlign: 'right' }}>Giá bán</th>
                      <th style={{ padding: '12px 8px', width: '90px', textAlign: 'right' }}>Thuế VAT</th>
                      <th style={{ padding: '12px 8px', width: '100px', textAlign: 'right' }}>Tiền BHMR</th>
                      <th style={{ padding: '12px 8px', width: '115px', textAlign: 'right' }}>Thành tiền</th>
                      <th style={{ padding: '12px 8px', width: '40px', textAlign: 'center' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {newProducts.map((prod, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                        {/* Index */}
                        <td style={{ padding: '12px 8px', color: '#64748b', fontWeight: '500' }}>{idx + 1}</td>
                        
                        {/* Product Detail & IMEI & Batch */}
                        <td style={{ padding: '12px 8px' }}>
                          <div style={{ fontWeight: '600', color: '#1e293b' }}>{prod.name}</div>
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', display: 'flex', gap: '8px' }}>
                            <span>Mã: {prod.code}</span>
                            {prod.brand && <span>| Hãng: {prod.brand}</span>}
                          </div>
                          
                          {/* IMEI / Batch Custom fields */}
                          <div style={{ marginTop: '6px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {(newProductTypeTab === 'imei' || prod.imei !== undefined) && (
                              <input
                                type="text"
                                placeholder="Mã IMEI..."
                                value={prod.imei || ''}
                                onChange={(e) => handleNewProductChange(idx, 'imei', e.target.value)}
                                style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', width: '130px', outline: 'none' }}
                              />
                            )}
                            <input
                              type="text"
                              placeholder="Lô hàng..."
                              value={prod.batch || ''}
                              onChange={(e) => handleNewProductChange(idx, 'batch', e.target.value)}
                              style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', width: '100px', outline: 'none' }}
                            />
                            <input
                              type="text"
                              placeholder="BHMR (Tên gói)..."
                              value={prod.extendedWarrantyName || ''}
                              onChange={(e) => handleNewProductChange(idx, 'extendedWarrantyName', e.target.value)}
                              style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', width: '120px', outline: 'none' }}
                            />
                          </div>
                        </td>

                        {/* Qty */}
                        <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                          <input
                            type="number"
                            min={1}
                            value={prod.qty}
                            onChange={(e) => handleNewProductChange(idx, 'qty', Math.max(1, Number(e.target.value) || 1))}
                            style={{ width: '55px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'center', fontWeight: '600', color: '#1e293b', outline: 'none' }}
                          />
                        </td>

                        {/* Price */}
                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                          <input
                            type="number"
                            min={0}
                            value={prod.price || ''}
                            onChange={(e) => handleNewProductChange(idx, 'price', Number(e.target.value) || 0)}
                            style={{ width: '90px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'right', fontWeight: '600', color: '#1e293b', outline: 'none' }}
                          />
                        </td>

                        {/* VAT */}
                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                          <input
                            type="number"
                            min={0}
                            placeholder="VAT"
                            value={prod.vat || ''}
                            onChange={(e) => handleNewProductChange(idx, 'vat', Number(e.target.value) || 0)}
                            style={{ width: '80px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'right', color: '#1e293b', outline: 'none' }}
                          />
                        </td>

                        {/* Extended Warranty Fee */}
                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                          <input
                            type="number"
                            min={0}
                            placeholder="Tiền BH"
                            value={prod.extendedWarrantyFee || ''}
                            onChange={(e) => handleNewProductChange(idx, 'extendedWarrantyFee', Number(e.target.value) || 0)}
                            style={{ width: '85px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '6px', textAlign: 'right', color: '#1e293b', outline: 'none' }}
                          />
                        </td>

                        {/* Subtotal */}
                        <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: '700', color: '#1e293b' }}>
                          {(prod.total || 0).toLocaleString('vi-VN')} đ
                        </td>

                        {/* Remove */}
                        <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => removeNewProduct(idx)}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Refund details and related items */}
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '20px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={18} color="#e11d48" /> Thông tin Đơn hàng & Liên kết
            </h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Kiểu trả hàng</span>
                <select 
                  value={form.type} 
                  onChange={(e) => handleChange('type', e.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', fontSize: '13px', color: '#1e293b', background: '#ffffff' }}
                >
                  <option value="Trả lại bán lẻ [L]">Trả lại bán lẻ [L]</option>
                  <option value="Trả lại bán sỉ [S]">Trả lại bán sỉ [S]</option>
                  <option value="Trả hàng bảo hành">Trả hàng bảo hành</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Trả hàng từ hóa đơn (ID)</span>
                <input 
                  type="text" 
                  placeholder="VD: 14792939" 
                  value={form.returnFromInvoice} 
                  onChange={(e) => handleChange('returnFromInvoice', e.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', fontSize: '13px', color: '#1e293b' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Trả hàng từ đơn hàng (ID)</span>
                <input 
                  type="text" 
                  placeholder="ID đơn hàng gốc" 
                  value={form.returnFromOrder} 
                  onChange={(e) => handleChange('returnFromOrder', e.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', fontSize: '13px', color: '#1e293b' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Nhân viên nhận trả hàng</span>
                <input 
                  type="text" 
                  value={form.receiver} 
                  onChange={(e) => handleChange('receiver', e.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', fontSize: '13px', color: '#1e293b' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Nhân viên bán hàng gốc</span>
                <input 
                  type="text" 
                  placeholder="Nhân viên sỉ/lẻ ban đầu"
                  value={form.salesperson} 
                  onChange={(e) => handleChange('salesperson', e.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', fontSize: '13px', color: '#1e293b' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Tài khoản NVBH</span>
                <input 
                  type="text" 
                  placeholder="Tài khoản NVBH"
                  value={form.salesAccount} 
                  onChange={(e) => handleChange('salesAccount', e.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', fontSize: '13px', color: '#1e293b' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Ghi chú hóa đơn trả</span>
                <textarea 
                  rows={2}
                  placeholder="Nhập chi tiết lý do trả..."
                  value={form.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', fontSize: '13px', color: '#1e293b', resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Ghi chú hóa đơn mua</span>
                <textarea 
                  rows={2}
                  placeholder="Ghi chú hóa đơn mua..."
                  value={form.newDescription}
                  onChange={(e) => handleChange('newDescription', e.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', fontSize: '13px', color: '#1e293b', resize: 'vertical' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (30%) - Customer lookup & Payments */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Customer box */}
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '20px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={18} color="#e11d48" /> Thông tin khách hàng
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* SDT Search */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Số điện thoại (F4)</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 10px', flex: 1, background: '#ffffff' }}>
                    <Phone size={14} color="#94a3b8" />
                    <input
                      type="text"
                      id="customer-phone-input"
                      placeholder="Gõ SĐT tìm nhanh..."
                      value={form.customerPhone}
                      onChange={(e) => handleChange('customerPhone', e.target.value)}
                      style={{ border: 'none', background: 'transparent', outline: 'none', padding: '8px 0', width: '100%', fontSize: '13px', color: '#1e293b' }}
                    />
                  </div>
                  <button 
                    type="button" 
                    onClick={() => lookupCustomer(form.customerPhone)}
                    style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 12px', fontSize: '12px', fontWeight: '600', color: '#475569', cursor: 'pointer' }}
                  >
                    Tìm
                  </button>
                </div>
              </div>

              {/* Name & Member Card ID */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Họ và tên khách hàng</span>
                  <input
                    type="text"
                    placeholder="Tên khách hàng..."
                    value={form.customerName}
                    onChange={(e) => handleChange('customerName', e.target.value)}
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px', outline: 'none', fontSize: '13px', color: '#1e293b' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Mã thẻ thành viên</span>
                  <input
                    type="text"
                    placeholder="Mã thẻ..."
                    value={form.cardId}
                    onChange={(e) => handleChange('cardId', e.target.value)}
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px', outline: 'none', fontSize: '13px', color: '#1e293b' }}
                  />
                </div>
              </div>

              {/* Email & Gender */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Email</span>
                  <input
                    type="email"
                    placeholder="email@example.com"
                    value={form.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px', outline: 'none', fontSize: '13px', color: '#1e293b' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Giới tính</span>
                  <select
                    value={form.gender}
                    onChange={(e) => handleChange('gender', e.target.value)}
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px', outline: 'none', fontSize: '13px', color: '#1e293b', background: '#ffffff' }}
                  >
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                  </select>
                </div>
              </div>

              {/* Facebook & Birthday */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Facebook</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 10px', background: '#ffffff' }}>
                    <Facebook size={14} color="#3b5998" />
                    <input
                      type="text"
                      placeholder="Facebook link/username..."
                      value={form.facebook}
                      onChange={(e) => handleChange('facebook', e.target.value)}
                      style={{ border: 'none', background: 'transparent', outline: 'none', padding: '8px 0', width: '100%', fontSize: '13px', color: '#1e293b' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Ngày sinh</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 10px', background: '#ffffff' }}>
                    <CalendarRange size={14} color="#94a3b8" />
                    <input
                      type="text"
                      placeholder="DD/MM/YYYY"
                      value={form.birthday}
                      onChange={(e) => handleChange('birthday', e.target.value)}
                      style={{ border: 'none', background: 'transparent', outline: 'none', padding: '8px 0', width: '100%', fontSize: '13px', color: '#1e293b' }}
                    />
                  </div>
                </div>
              </div>

              {/* Order Source & Level */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Nguồn đơn hàng</span>
                  <select
                    value={form.source}
                    onChange={(e) => handleChange('source', e.target.value)}
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px', outline: 'none', fontSize: '13px', color: '#1e293b', background: '#ffffff' }}
                  >
                    <option value="Trực tiếp">Trực tiếp</option>
                    <option value="Facebook">Facebook</option>
                    <option value="Instagram">Instagram</option>
                    <option value="Website">Website</option>
                    <option value="Shopee">Shopee</option>
                    <option value="Lazada">Lazada</option>
                    <option value="TikTok Shop">TikTok Shop</option>
                    <option value="Khác">Khác</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Cấp độ khách hàng</span>
                  <select
                    value={form.customerLevel}
                    onChange={(e) => handleChange('customerLevel', e.target.value)}
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px', outline: 'none', fontSize: '13px', color: '#1e293b', background: '#ffffff' }}
                  >
                    <option value="Đồng">Đồng</option>
                    <option value="Bạc">Bạc</option>
                    <option value="Vàng">Vàng</option>
                    <option value="Kim Cương">Kim Cương</option>
                  </select>
                </div>
              </div>

              {/* Labels */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Nhãn khách hàng</span>
                <input
                  type="text"
                  placeholder="Nhãn (ví dụ: VIP, Than thiet)..."
                  value={form.labels}
                  onChange={(e) => handleChange('labels', e.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px', outline: 'none', fontSize: '13px', color: '#1e293b' }}
                />
              </div>

              {/* Note */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Ghi chú khách hàng</span>
                <textarea
                  rows={1}
                  placeholder="Ghi chú nội bộ về khách..."
                  value={form.note}
                  onChange={(e) => handleChange('note', e.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px', outline: 'none', fontSize: '13px', color: '#1e293b', resize: 'vertical' }}
                />
              </div>

              {/* Collapsible address and company details */}
              <details style={{ marginTop: '4px', borderTop: '1px dashed #e2e8f0', paddingTop: '10px' }}>
                <summary style={{ cursor: 'pointer', fontSize: '12px', fontWeight: '700', color: '#64748b', outline: 'none' }}>
                  Địa chỉ chi tiết & Công ty
                </summary>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Tỉnh/Thành</span>
                      <input
                        type="text"
                        placeholder="Tỉnh/Thành..."
                        value={form.province}
                        onChange={(e) => handleChange('province', e.target.value)}
                        style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', outline: 'none' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Quận/Huyện</span>
                      <input
                        type="text"
                        placeholder="Quận/Huyện..."
                        value={form.district}
                        onChange={(e) => handleChange('district', e.target.value)}
                        style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', outline: 'none' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Phường/Xã</span>
                      <input
                        type="text"
                        placeholder="Phường/Xã..."
                        value={form.ward}
                        onChange={(e) => handleChange('ward', e.target.value)}
                        style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', outline: 'none' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Địa chỉ liên hệ</span>
                    <textarea
                      rows={2}
                      placeholder="Số nhà, tên đường..."
                      value={form.address}
                      onChange={(e) => handleChange('address', e.target.value)}
                      style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', outline: 'none', resize: 'vertical' }}
                    />
                  </div>

                  <div style={{ borderTop: '1px dotted #e2e8f0', margin: '4px 0' }}></div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Tên công ty</span>
                    <input
                      type="text"
                      placeholder="Tên công ty (nếu xuất HĐ)..."
                      value={form.companyName}
                      onChange={(e) => handleChange('companyName', e.target.value)}
                      style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', outline: 'none' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Địa chỉ công ty</span>
                      <input
                        type="text"
                        placeholder="Địa chỉ công ty..."
                        value={form.companyAddress}
                        onChange={(e) => handleChange('companyAddress', e.target.value)}
                        style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', outline: 'none' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Mã số thuế</span>
                      <input
                        type="text"
                        placeholder="MST..."
                        value={form.taxId}
                        onChange={(e) => handleChange('taxId', e.target.value)}
                        style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', outline: 'none' }}
                      />
                    </div>
                  </div>
                </div>
              </details>
            </div>
          </div>

          {/* Refund payment summary box */}
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '20px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Coins size={18} color="#e11d48" /> Chi tiết đổi trả & Thanh toán
            </h2>

            {/* Calculations Breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '14px', marginBottom: '14px' }}>
              
              {/* Return total */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: '#64748b', fontWeight: '500' }}>Tổng tiền nhận trả (Hàng trả):</span>
                <span style={{ fontWeight: '600', color: '#1e293b' }}>
                  {(() => {
                    const rTotal = products.reduce((acc, p) => acc + (p.price * p.qty), 0);
                    const rVat = products.reduce((acc, p) => acc + (p.vat || 0), 0);
                    const rWarr = products.reduce((acc, p) => acc + (p.extendedWarrantyFee || 0), 0);
                    return (rTotal + rVat + rWarr).toLocaleString('vi-VN');
                  })()} đ
                </span>
              </div>

              {/* Purchase total */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: '#64748b', fontWeight: '500' }}>Tổng tiền mua mới (Hàng mua):</span>
                <span style={{ fontWeight: '600', color: '#1e293b' }}>
                  {(() => {
                    const pTotal = newProducts.reduce((acc, p) => acc + (p.price * p.qty), 0);
                    const pVat = newProducts.reduce((acc, p) => acc + (p.vat || 0), 0);
                    const pWarr = newProducts.reduce((acc, p) => acc + (p.extendedWarrantyFee || 0), 0);
                    return (pTotal + pVat + pWarr).toLocaleString('vi-VN');
                  })()} đ
                </span>
              </div>

              {/* Refund fee total */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: '#64748b' }}>Phí trả hàng (-) :</span>
                <span style={{ fontWeight: '600', color: '#e11d48' }}>
                  {form.refundFee.toLocaleString('vi-VN')} đ
                </span>
              </div>

              {/* Order discount */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                <span style={{ color: '#64748b' }}>Chiết khấu đơn:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="number"
                    min={0}
                    value={form.discount || ''}
                    onChange={(e) => handleChange('discount', Number(e.target.value) || 0)}
                    style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 8px', fontSize: '13px', width: '90px', textAlign: 'right', outline: 'none', fontWeight: '600' }}
                  />
                  <span style={{ fontSize: '12px', color: '#64748b' }}>đ</span>
                </div>
              </div>

              {/* Coupon code */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                <span style={{ color: '#64748b' }}>Coupon mã giảm:</span>
                <input
                  type="text"
                  placeholder="Nhập mã..."
                  value={form.coupon}
                  onChange={(e) => handleChange('coupon', e.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 8px', fontSize: '13px', width: '110px', textAlign: 'right', outline: 'none', color: '#1e293b' }}
                />
              </div>

              {/* Automation Toggles */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px', background: '#f8fafc', padding: '8px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#475569', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.autoDiscount}
                    onChange={(e) => handleChange('autoDiscount', e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>Bỏ chiết khấu tự động</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#475569', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.autoPoint}
                    onChange={(e) => handleChange('autoPoint', e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>Bỏ tích điểm tự động</span>
                </label>
              </div>
            </div>

            {/* Total Amount Difference */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <span style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>
                {form.totalAmount > 0 ? 'Tổng tiền trả khách:' : form.totalAmount < 0 ? 'Khách cần thanh toán:' : 'Tổng tiền chênh lệch:'}
              </span>
              <span style={{ 
                fontSize: '18px', 
                fontWeight: '800', 
                color: form.totalAmount > 0 ? '#10b981' : form.totalAmount < 0 ? '#ef4444' : '#64748b' 
              }}>
                {Math.abs(form.totalAmount).toLocaleString('vi-VN')} đ
              </span>
            </div>

            {/* Payment breakdowns split */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#f8fafc', borderRadius: '10px', padding: '14px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '700', color: '#475569', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CreditCard size={14} /> Phân phối tiền
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#475569' }}>Tiền mặt:</span>
                  <input
                    type="number"
                    min={0}
                    value={form.cash || ''}
                    onChange={(e) => handleChange('cash', Number(e.target.value) || 0)}
                    style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 8px', fontSize: '13px', width: '130px', textAlign: 'right', outline: 'none' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#475569' }}>Chuyển khoản:</span>
                  <input
                    type="number"
                    min={0}
                    value={form.transfer || ''}
                    onChange={(e) => handleChange('transfer', Number(e.target.value) || 0)}
                    style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 8px', fontSize: '13px', width: '130px', textAlign: 'right', outline: 'none' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#475569' }}>Quẹt thẻ:</span>
                  <input
                    type="number"
                    min={0}
                    value={form.card || ''}
                    onChange={(e) => handleChange('card', Number(e.target.value) || 0)}
                    style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 8px', fontSize: '13px', width: '130px', textAlign: 'right', outline: 'none' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed #cbd5e1', paddingTop: '8px', marginTop: '4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#64748b' }}>
                    {form.totalAmount >= 0 ? 'Còn nợ khách:' : 'Khách còn nợ:'}
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>
                    {Math.max(0, Math.abs(form.totalAmount) - (form.cash + form.transfer + form.card)).toLocaleString('vi-VN')} đ
                  </span>
                </div>
              </div>
            </div>

            {/* Auto Print Selection */}
            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-start' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#475569', cursor: 'pointer', fontWeight: '500' }}>
                <input
                  type="checkbox"
                  checked={form.autoPrint}
                  onChange={(e) => handleChange('autoPrint', e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Printer size={14} color="#64748b" /> Tự động in sau khi lưu hóa đơn (F10)
                </span>
              </label>
            </div>
          </div>
        </div>

      </form>
    </div>
  );
}
