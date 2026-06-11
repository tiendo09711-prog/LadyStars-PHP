import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft, 
  Calendar, 
  DollarSign, 
  FileText, 
  Mail, 
  Phone, 
  Save, 
  Tag, 
  User, 
  Warehouse, 
  Briefcase, 
  Percent, 
  Facebook, 
  MapPin, 
  CreditCard, 
  Info,
  CheckCircle,
  AlertCircle,
  Search
} from 'lucide-react';
import { http } from '../../core/api/http';

const getStockForWarehouse = (prod: any, wh: string) => {
  if (!wh) return prod.totalStock ?? prod.qty ?? 0;
  if (wh.includes('trung tâm')) return prod.stockCN ?? prod.totalStock ?? prod.qty ?? 0;
  if (wh.includes('Hà Nội') || wh.includes('chính')) return prod.stockHanoi ?? prod.totalStock ?? prod.qty ?? 0;
  if (wh.includes('HCM') || wh.includes('Hồ Chí Minh')) return prod.stockHCM ?? prod.totalStock ?? prod.qty ?? 0;
  return prod.totalStock ?? prod.qty ?? 0;
};

export function RetailInvoiceCreatePage() {
  const { channel } = useParams();
  const [searchParams] = useSearchParams();
  const branchId = searchParams.get('branchId');
  const navigate = useNavigate();

  // Branch details state
  const [branch, setBranch] = useState<any>(null);
  const [loadingBranch, setLoadingBranch] = useState(false);

  // Form state
  const [form, setForm] = useState({
    id: 'HDLE-' + Math.floor(100000 + Math.random() * 900000), // Random unique invoice ID
    date: new Date().toLocaleString('vi-VN'),
    type: 'Xuất bán lẻ [L]',
    salesperson: '',
    phone: '',
    customerName: '',
    email: '',
    facebook: '',
    dob: '',
    addressLocation: '',
    address: '',
    cardId: '',
    customerLevel: '',
    orderSource: 'Cửa hàng',
    productCode: '',
    productName: '',
    discount: 0,
    vat: 0,
    coupon: '',
    paymentMethod: 'Tiền mặt',
    totalAmount: 0,
    note: '',
    status: 'Mới',
  });

  const [dbProducts, setDbProducts] = useState<any[]>([]);
  const [dbCustomers, setDbCustomers] = useState<any[]>([]);
  const [dbStaffs, setDbStaffs] = useState<any[]>([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [maxStock, setMaxStock] = useState(0);

  // Local helper states for pricing calculation
  const [price, setPrice] = useState<number>(0);
  const [quantity, setQuantity] = useState<number>(1);
  const [useAutoCalculate, setUseAutoCalculate] = useState<boolean>(true);

  // Error and saving states
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
        })
        .catch((err) => {
          console.error("Lỗi lấy thông tin kho:", err);
        })
        .finally(() => {
          setLoadingBranch(false);
        });
    }
  }, [branchId]);

  useEffect(() => {
    // Fetch users, customers, and products
    Promise.all([
      http.get('/auth/me'),
      http.get('/staff'),
      http.get('/customers/customers'),
      http.get('/products/inventories', { params: { limit: 5000 } })
    ]).then(([meRes, staffRes, custRes, prodRes]) => {
      setForm(prev => ({ ...prev, salesperson: meRes.data?.name || '' }));
      setDbStaffs(staffRes.data?.items || []);
      setDbCustomers(custRes.data?.items || []);
      setDbProducts(prodRes.data?.items || []);
    }).catch(err => console.error("Error fetching dependencies:", err));
  }, []);

  // Handle auto-calculation
  useEffect(() => {
    if (useAutoCalculate) {
      const subtotal = price * quantity;
      const discountVal = Number(form.discount) || 0;
      const vatVal = Number(form.vat) || 0;
      
      const discounted = Math.max(0, subtotal - discountVal);
      const taxAmount = Math.round(discounted * (vatVal / 100));
      const finalTotal = discounted + taxAmount;

      setForm(prev => ({
        ...prev,
        totalAmount: finalTotal
      }));
    }
  }, [price, quantity, form.discount, form.vat, useAutoCalculate]);

  const handleChange = (field: string, value: any) => {
    setForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!form.customerName.trim()) {
      setErrorMessage('Vui lòng nhập tên khách hàng');
      return;
    }
    if (!form.productCode.trim()) {
      setErrorMessage('Vui lòng chọn sản phẩm');
      return;
    }

    // Find productId from selected productCode
    const selectedProduct = dbProducts.find((p: any) => p.code === form.productCode);
    if (!selectedProduct) {
      setErrorMessage('Sản phẩm không tồn tại trong hệ thống. Vui lòng chọn lại.');
      return;
    }
    if (quantity <= 0) {
      setErrorMessage('Số lượng phải lớn hơn 0');
      return;
    }

    setIsSaving(true);
    try {
      // 1. Auto-save new customer if not found
      const isExistingCustomer = dbCustomers.some(
        (c: any) => c.name?.toLowerCase() === form.customerName.toLowerCase() && (c.phone === form.phone || !form.phone)
      );
      if (!isExistingCustomer) {
        await http.post('/customers/customers', {
          name: form.customerName,
          phone: form.phone,
          email: form.email,
          facebook: form.facebook,
          dob: form.dob,
          cardId: form.cardId,
          customerLevel: form.customerLevel,
          addressLocation: form.addressLocation,
          address: form.address,
        }).catch(e => console.log('Lỗi tạo khách hàng tự động:', e));
      }

      // 2. Find customerId if exists
      const existingCustomer = dbCustomers.find(
        (c: any) => c.name?.toLowerCase() === form.customerName.toLowerCase()
      );

      // 3. Build SalePayment payload with proper ObjectId references
      const salePayload = {
        branchId: branchId,
        customerId: existingCustomer?._id ?? null,
        note: form.note,
        salesperson: form.salesperson,
        orderSource: form.orderSource,
        paymentMethod: form.paymentMethod,
        discountValue: Number(form.discount) || 0,
        discountType: 'number' as const,
        status: 'draft',
        // items drives inventory deduction in completeSalePayment()
        items: [{
          productId: selectedProduct._id,
          amount: quantity,
          value: price,
          discountValue: 0,
          discountType: 'number',
        }],
      };

      // 4. Create the sale (draft - no inventory change yet)
      const createRes = await http.post('/products/sales', salePayload);
      const saleId = createRes.data._id;

      // 5. Complete it immediately → deducts inventory + records in salepayments
      await http.post(`/products/sales/${saleId}/complete`);

      setSuccessMessage(`✅ Hóa đơn đã được lưu & tồn kho đã được trừ tự động! Mã: ${createRes.data.code}`);
      setTimeout(() => {
        navigate(`/sales-channels/${channel}/retail`);
      }, 1800);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.response?.data?.message ?? 'Đã xảy ra lỗi khi lưu hóa đơn.');
      setIsSaving(false);
    }
  };


  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button 
            type="button" 
            onClick={() => navigate(`/sales-channels/${channel}/retail`)}
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
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#0f172a'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.color = '#475569'; }}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Thêm Hóa Đơn Lẻ Mới</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <Warehouse size={14} color="#64748b" />
              <span style={{ fontSize: '13px', color: '#64748b' }}>
                Kho xuất: {loadingBranch ? 'Đang tải...' : (branch ? `${branch.name} (${branch.code})` : 'Chưa chọn kho')}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            type="button"
            className="btn btn-light"
            onClick={() => navigate(`/sales-channels/${channel}/retail`)}
            style={{ borderRadius: '10px', padding: '10px 20px', fontSize: '14px', border: '1px solid #cbd5e1', background: '#ffffff', fontWeight: '600', color: '#475569' }}
          >
            Hủy bỏ
          </button>
          <button 
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            style={{ 
              borderRadius: '10px', 
              padding: '10px 24px', 
              fontSize: '14px', 
              fontWeight: '600', 
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', 
              color: '#ffffff',
              border: 'none', 
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.7 : 1
            }}
          >
            <Save size={16} />
            {isSaving ? 'Đang lưu...' : 'Lưu hóa đơn'}
          </button>
        </div>
      </div>

      {/* Alert Notices */}
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

      {/* Main Grid Layout */}
      <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px', alignItems: 'start' }}>
        
        {/* Left Side: Invoice Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Card 1: General Info & Staff */}
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: '#dbeafe', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                <Briefcase size={15} />
              </div>
              <h2 style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Thông Tin Chung & Nhân Viên</h2>
            </div>
            
            <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Mã hóa đơn <span style={{ color: '#ef4444' }}>*</span></span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 10px', background: '#f8fafc' }}>
                  <Info size={14} color="#94a3b8" />
                  <input 
                    type="text" 
                    readOnly
                    value={form.id} 
                    style={{ border: 'none', background: 'transparent', outline: 'none', padding: '10px 0', width: '100%', color: '#64748b' }} 
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Ngày lập hóa đơn <span style={{ color: '#ef4444' }}>*</span></span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 10px', background: '#ffffff' }}>
                  <Calendar size={14} color="#94a3b8" />
                  <input 
                    type="text" 
                    required
                    value={form.date} 
                    onChange={(e) => handleChange('date', e.target.value)} 
                    style={{ border: 'none', background: 'transparent', outline: 'none', padding: '10px 0', width: '100%', color: '#1e293b' }} 
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Kiểu hóa đơn <span style={{ color: '#ef4444' }}>*</span></span>
                <select 
                  value={form.type} 
                  onChange={(e) => handleChange('type', e.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', color: '#1e293b', background: '#ffffff' }}
                >
                  <option value="Xuất bán lẻ [L]">Xuất bán lẻ [L]</option>
                  <option value="Xuất mẫu [M]">Xuất mẫu [M]</option>
                  <option value="Tặng kèm [T]">Tặng kèm [T]</option>
                  <option value="Khác">Khác</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Nguồn đơn hàng</span>
                <input 
                  type="text" 
                  value={form.orderSource} 
                  onChange={(e) => handleChange('orderSource', e.target.value)} 
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', color: '#1e293b', background: '#ffffff' }} 
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: 'span 2' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Nhân viên bán hàng</span>
                <select 
                  value={form.salesperson} 
                  onChange={(e) => handleChange('salesperson', e.target.value)} 
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', color: '#1e293b', background: '#ffffff' }} 
                >
                  <option value="">-- Chọn nhân viên --</option>
                  {dbStaffs.map(staff => (
                    <option key={staff._id} value={staff.name}>{staff.name}</option>
                  ))}
                  {form.salesperson && !dbStaffs.some(s => s.name === form.salesperson) && (
                    <option value={form.salesperson}>{form.salesperson}</option>
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* Card 2: Customer Info */}
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: '#e0f2fe', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7' }}>
                <User size={15} />
              </div>
              <h2 style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Thông Tin Khách Hàng</h2>
            </div>
            
            <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Tên khách hàng <span style={{ color: '#ef4444' }}>*</span></span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 10px', background: '#ffffff' }}>
                  <User size={14} color="#94a3b8" />
                  <input 
                    type="text" 
                    required
                    placeholder="Nhập họ tên khách hàng" 
                    value={form.customerName} 
                    onFocus={() => setShowCustomerDropdown(true)}
                    onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                    onChange={(e) => {
                      handleChange('customerName', e.target.value);
                      setShowCustomerDropdown(true);
                    }} 
                    style={{ border: 'none', background: 'transparent', outline: 'none', padding: '10px 0', width: '100%', color: '#1e293b' }} 
                  />
                </div>
                {showCustomerDropdown && form.customerName.trim().length > 0 && dbCustomers.filter(c => c.name?.toLowerCase().includes(form.customerName.toLowerCase()) || c.phone?.includes(form.customerName)).length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', marginTop: '4px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', maxHeight: '200px', overflowY: 'auto' }}>
                    {dbCustomers.filter(c => c.name?.toLowerCase().includes(form.customerName.toLowerCase()) || c.phone?.includes(form.customerName)).map(c => (
                      <div key={c._id} onClick={() => {
                        setForm(prev => ({
                          ...prev, customerName: c.name, phone: c.phone || '', email: c.email || '', facebook: c.facebook || '',
                          dob: c.dob || '', cardId: c.cardId || '', customerLevel: c.customerLevel || '', addressLocation: c.addressLocation || '', address: c.address || ''
                        }));
                        setShowCustomerDropdown(false);
                      }} style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}>
                        <div style={{ fontWeight: '600', fontSize: '13px' }}>{c.name} - {c.phone}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Số điện thoại</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 10px', background: '#ffffff' }}>
                  <Phone size={14} color="#94a3b8" />
                  <input 
                    type="text" 
                    placeholder="Nhập số điện thoại" 
                    value={form.phone} 
                    onChange={(e) => handleChange('phone', e.target.value)} 
                    style={{ border: 'none', background: 'transparent', outline: 'none', padding: '10px 0', width: '100%', color: '#1e293b' }} 
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Email</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 10px', background: '#ffffff' }}>
                  <Mail size={14} color="#94a3b8" />
                  <input 
                    type="email" 
                    placeholder="example@mail.com" 
                    value={form.email} 
                    onChange={(e) => handleChange('email', e.target.value)} 
                    style={{ border: 'none', background: 'transparent', outline: 'none', padding: '10px 0', width: '100%', color: '#1e293b' }} 
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Ngày sinh</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 10px', background: '#ffffff' }}>
                  <Calendar size={14} color="#94a3b8" />
                  <input 
                    type="date" 
                    value={form.dob} 
                    onChange={(e) => handleChange('dob', e.target.value)} 
                    style={{ border: 'none', background: 'transparent', outline: 'none', padding: '10px 0', width: '100%', color: '#1e293b' }} 
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Facebook</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 10px', background: '#ffffff' }}>
                  <Facebook size={14} color="#94a3b8" />
                  <input 
                    type="text" 
                    placeholder="Link hoặc tên Facebook" 
                    value={form.facebook} 
                    onChange={(e) => handleChange('facebook', e.target.value)} 
                    style={{ border: 'none', background: 'transparent', outline: 'none', padding: '10px 0', width: '100%', color: '#1e293b' }} 
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Mã thẻ thành viên / VIP</span>
                <input 
                  type="text" 
                  placeholder="Mã thẻ khách hàng" 
                  value={form.cardId} 
                  onChange={(e) => handleChange('cardId', e.target.value)} 
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', color: '#1e293b', background: '#ffffff' }} 
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Cấp độ thành viên</span>
                <select 
                  value={form.customerLevel} 
                  onChange={(e) => handleChange('customerLevel', e.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', color: '#1e293b', background: '#ffffff' }}
                >
                  <option value="">-- Chưa xếp hạng --</option>
                  <option value="Thành viên">Thành viên</option>
                  <option value="Thân thiết">Thân thiết</option>
                  <option value="Vàng (Gold)">Vàng (Gold)</option>
                  <option value="Kim cương (Diamond)">Kim cương (Diamond)</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Khu vực (Tỉnh, Quận, Phường)</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 10px', background: '#ffffff' }}>
                  <MapPin size={14} color="#94a3b8" />
                  <input 
                    type="text" 
                    placeholder="Tỉnh/Thành, Quận/Huyện, Phường/Xã" 
                    value={form.addressLocation} 
                    onChange={(e) => handleChange('addressLocation', e.target.value)} 
                    style={{ border: 'none', background: 'transparent', outline: 'none', padding: '10px 0', width: '100%', color: '#1e293b' }} 
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: 'span 2' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Địa chỉ chi tiết</span>
                <input 
                  type="text" 
                  placeholder="Số nhà, ngõ ngách, tên đường..." 
                  value={form.address} 
                  onChange={(e) => handleChange('address', e.target.value)} 
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', color: '#1e293b', background: '#ffffff' }} 
                />
              </div>
            </div>
          </div>



          {/* Card 4: Product Info */}
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: '#ecfdf5', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
                <Tag size={15} />
              </div>
              <h2 style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Thông Tin Sản Phẩm & Đơn Giá</h2>
            </div>
            
            <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: 'span 2', position: 'relative' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Tìm chọn sản phẩm <span style={{ color: '#ef4444' }}>*</span></span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 10px', background: '#ffffff' }}>
                  <Search size={14} color="#94a3b8" />
                  <input 
                    type="text" 
                    placeholder="Tìm theo mã hoặc tên sản phẩm..." 
                    value={form.productName} 
                    onFocus={() => setShowProductDropdown(true)}
                    onBlur={() => setTimeout(() => setShowProductDropdown(false), 200)}
                    onChange={(e) => { handleChange('productName', e.target.value); setShowProductDropdown(true); }} 
                    style={{ border: 'none', background: 'transparent', outline: 'none', padding: '10px 0', width: '100%', color: '#1e293b' }} 
                  />
                </div>
                {showProductDropdown && dbProducts.filter(p => {
                  const matchesSearch = p.name?.toLowerCase().includes(form.productName.toLowerCase()) || p.code?.toLowerCase().includes(form.productName.toLowerCase());
                  const stock = getStockForWarehouse(p, branch?.name);
                  return matchesSearch && stock > 0;
                }).length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', marginTop: '4px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', maxHeight: '250px', overflowY: 'auto' }}>
                    {dbProducts.filter(p => {
                      const matchesSearch = p.name?.toLowerCase().includes(form.productName.toLowerCase()) || p.code?.toLowerCase().includes(form.productName.toLowerCase());
                      const stock = getStockForWarehouse(p, branch?.name);
                      return matchesSearch && stock > 0;
                    }).map(p => {
                      const stock = getStockForWarehouse(p, branch?.name);
                      return (
                        <div key={p.code} onClick={() => {
                          setForm(prev => ({ ...prev, productCode: p.code, productName: p.name }));
                          setPrice(p.price || 0);
                          setMaxStock(stock);
                          setQuantity(1);
                          setShowProductDropdown(false);
                        }} style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontWeight: '600', fontSize: '13px', color: '#1e293b' }}>{p.name}</div>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>Mã: {p.code} | Giá: {(p.price||0).toLocaleString()}đ</div>
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: '#10b981' }}>
                            Tồn kho: {stock}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Mã sản phẩm (Tự điền)</span>
                <input 
                  type="text" 
                  readOnly
                  value={form.productCode} 
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', color: '#64748b', background: '#f8fafc' }} 
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Đơn giá (VNĐ)</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0 10px', background: '#ffffff' }}>
                  <DollarSign size={14} color="#94a3b8" />
                  <input 
                    type="number" 
                    min={0}
                    value={price || ''} 
                    onChange={(e) => setPrice(Number(e.target.value) || 0)} 
                    style={{ border: 'none', background: 'transparent', outline: 'none', padding: '10px 0', width: '100%', color: '#1e293b' }} 
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>
                  Số lượng {maxStock > 0 && <span style={{ color: '#10b981', fontWeight: '500' }}>(Tồn: {maxStock})</span>}
                </span>
                <input 
                  type="number" 
                  min={1}
                  max={maxStock > 0 ? maxStock : undefined}
                  value={quantity} 
                  onChange={(e) => {
                    let val = Math.max(1, Number(e.target.value) || 1);
                    if (maxStock > 0 && val > maxStock) val = maxStock;
                    setQuantity(val);
                  }} 
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', color: '#1e293b', background: '#ffffff' }} 
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Mã giảm giá / Coupon</span>
                <input 
                  type="text" 
                  placeholder="Mã coupon áp dụng" 
                  value={form.coupon} 
                  onChange={(e) => handleChange('coupon', e.target.value)} 
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', color: '#1e293b', background: '#ffffff' }} 
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', gridColumn: 'span 2', marginTop: '8px', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                <input 
                  type="checkbox" 
                  id="auto_calc"
                  checked={useAutoCalculate} 
                  onChange={(e) => setUseAutoCalculate(e.target.checked)} 
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="auto_calc" style={{ fontSize: '13px', fontWeight: '600', color: '#475569', cursor: 'pointer' }}>
                  Tự động tính tổng tiền dựa trên đơn giá, số lượng, chiết khấu và VAT (%)
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Payment Summary & Action Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', position: 'sticky', top: '92px' }}>
          
          {/* Billing Card */}
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: '#fee2e2', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                <CreditCard size={15} />
              </div>
              <h2 style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Thanh Toán & Tóm Tắt</h2>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              
              {/* Calculations Breakdowns */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b' }}>
                  <span>Tạm tính (Sản phẩm):</span>
                  <span style={{ fontWeight: '600', color: '#334155' }}>
                    {(price * quantity).toLocaleString('vi-VN')} đ
                  </span>
                </div>

                {/* Discount field */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: '#64748b' }}>Chiết khấu trực tiếp (đ):</span>
                    <input 
                      type="number" 
                      min={0}
                      value={form.discount || ''}
                      onChange={(e) => handleChange('discount', Number(e.target.value) || 0)}
                      style={{ width: '120px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', textAlign: 'right', fontSize: '13px', fontWeight: '600', outline: 'none' }}
                    />
                  </div>
                </div>

                {/* VAT field */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: '#64748b' }}>VAT (%):</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input 
                        type="number" 
                        min={0}
                        max={100}
                        value={form.vat || ''}
                        onChange={(e) => handleChange('vat', Number(e.target.value) || 0)}
                        style={{ width: '80px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', textAlign: 'right', fontSize: '13px', fontWeight: '600', outline: 'none' }}
                      />
                      <Percent size={13} color="#64748b" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Total Amount field */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Tổng tiền phải thanh toán</span>
                {useAutoCalculate ? (
                  <div style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#15803d', fontSize: '22px', fontWeight: '800', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
                    {form.totalAmount.toLocaleString('vi-VN')} đ
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '2px solid #2563eb', borderRadius: '10px', padding: '0 12px', background: '#ffffff' }}>
                    <DollarSign size={18} color="#2563eb" />
                    <input 
                      type="number" 
                      min={0}
                      value={form.totalAmount || ''} 
                      onChange={(e) => handleChange('totalAmount', Number(e.target.value) || 0)} 
                      style={{ border: 'none', background: 'transparent', outline: 'none', padding: '12px 0', width: '100%', color: '#0f172a', fontSize: '18px', fontWeight: '800' }} 
                    />
                  </div>
                )}
                {useAutoCalculate && (
                  <span style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', fontStyle: 'italic' }}>
                    Tính toán tự động dựa trên chiết khấu & thuế VAT
                  </span>
                )}
              </div>

              {/* Payment Method Selector */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Phương thức thanh toán</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {['Tiền mặt', 'Chuyển khoản', 'Quẹt thẻ', 'Khác'].map(method => {
                    const isSelected = form.paymentMethod === method;
                    return (
                      <button 
                        key={method}
                        type="button"
                        onClick={() => handleChange('paymentMethod', method)}
                        style={{
                          padding: '10px 8px',
                          borderRadius: '8px',
                          border: isSelected ? '2px solid #2563eb' : '1px solid #cbd5e1',
                          background: isSelected ? '#eff6ff' : '#ffffff',
                          color: isSelected ? '#2563eb' : '#475569',
                          fontWeight: '700',
                          fontSize: '13px',
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                      >
                        {method}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Order Status */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Trạng thái hóa đơn</span>
                <select 
                  value={form.status} 
                  onChange={(e) => handleChange('status', e.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', color: '#1e293b', background: '#ffffff', fontWeight: '600' }}
                >
                  <option value="Mới" style={{ color: '#b45309' }}>Mới (Chưa thanh toán)</option>
                  <option value="Đã thanh toán" style={{ color: '#047857' }}>Đã thanh toán</option>
                  <option value="Đã hủy" style={{ color: '#b91c1c' }}>Đã hủy</option>
                </select>
              </div>

              {/* Note / Memo */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Ghi chú hóa đơn</span>
                <textarea 
                  placeholder="Ghi chú thêm về đơn hàng hoặc giao hàng..." 
                  value={form.note} 
                  onChange={(e) => handleChange('note', e.target.value)} 
                  rows={3} 
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 12px', outline: 'none', color: '#1e293b', background: '#ffffff', resize: 'vertical' }}
                />
              </div>

            </div>
          </div>
          
          {/* Quick Submit Block */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button 
              type="submit"
              disabled={isSaving}
              style={{ 
                width: '100%',
                borderRadius: '10px', 
                padding: '12px 24px', 
                fontSize: '15px', 
                fontWeight: '700', 
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', 
                color: '#ffffff',
                border: 'none', 
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                opacity: isSaving ? 0.7 : 1
              }}
            >
              <Save size={18} />
              {isSaving ? 'Đang lưu hóa đơn...' : 'Xác nhận & Lưu'}
            </button>
          </div>

        </div>

      </form>
      
    </div>
  );
}
