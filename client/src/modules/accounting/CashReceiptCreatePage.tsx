import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Upload, DollarSign, Calendar, Info, MessageSquare } from 'lucide-react';
import { http } from '../../core/api/http';

export function CashReceiptCreatePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    targetType: 'Khách hàng',
    accountName: 'Tiền mặt Hà Nội',
    targetName: '',
    targetCode: '',
    type: 'Phiếu thu',
    voucherType: 'Phiếu XNK',
    voucherId: '',
    amount: 0,
    note: '',
    attachment: null as File | null,
  });

  const [afterSaveAction, setAfterSaveAction] = useState<'continue' | 'list'>('list');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  
  // Data for targets
  const [dbCustomers, setDbCustomers] = useState<any[]>([]);
  const [dbStaffs, setDbStaffs] = useState<any[]>([]);
  const [dbVendors, setDbVendors] = useState<any[]>([]);
  const [showTargetDropdown, setShowTargetDropdown] = useState(false);

  useEffect(() => {
    Promise.all([
      http.get('/staff'),
      http.get('/customers/customers'),
      http.get('/vendors/vendors')
    ]).then(([staffRes, custRes, vendorRes]) => {
      setDbStaffs(staffRes.data?.items || []);
      setDbCustomers(custRes.data?.items || []);
      setDbVendors(vendorRes.data?.items || []);
    }).catch(err => console.error("Error fetching target dependencies:", err));
  }, []);

  const handleChange = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleTargetTypeChange = (value: string) => {
    setForm(prev => ({
      ...prev,
      targetType: value,
      targetName: '',
      targetCode: ''
    }));
  };

  const getTargetList = () => {
    if (form.targetType === 'Khách hàng') return dbCustomers;
    if (form.targetType === 'Nhân viên') return dbStaffs;
    if (form.targetType === 'Nhà cung cấp') return dbVendors;
    return [];
  };

  const filteredTargets = getTargetList().filter((t: any) => 
    t.name?.toLowerCase().includes(form.targetName.toLowerCase()) || 
    t.phone?.includes(form.targetName) ||
    t.code?.toLowerCase().includes(form.targetName.toLowerCase())
  );

  const handleSave = async (e: React.FormEvent, print: boolean = false) => {
    e.preventDefault();
    if (!form.amount) {
      setError('Vui lòng nhập số tiền hợp lệ');
      return;
    }
    setError('');
    setIsSaving(true);

    try {
      const payload = {
        transactionId: Math.floor(1000000 + Math.random() * 9000000).toString(),
        date: new Date(form.date),
        type: form.type,
        accountName: form.accountName,
        targetCode: form.targetCode,
        targetName: form.targetName,
        voucherType: form.voucherType,
        voucherId: form.voucherId,
        revenue: form.type === 'Phiếu thu' ? form.amount : 0,
        expense: form.type === 'Phiếu chi' ? form.amount : 0,
        description: form.note,
        creatorName: 'Admin',
      };

      // Normally we would upload form.attachment here if there's an endpoint
      // const formData = new FormData();
      // formData.append('file', form.attachment);
      // await http.post('/upload', formData);

      await http.post('/accounting/cash-transactions', payload);
      
      if (print) {
        window.print();
      }

      if (afterSaveAction === 'list') {
        navigate('/accounting/cash');
      } else {
        setForm((prev) => ({
          ...prev,
          targetName: '',
          targetCode: '',
          voucherId: '',
          amount: 0,
          note: '',
          attachment: null
        }));
      }
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || 'Đã xảy ra lỗi khi lưu.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <button 
          onClick={() => navigate('/accounting/cash')}
          style={{ 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            width: '40px', height: '40px', borderRadius: '8px', 
            border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#475569'
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Lập phiếu thu chi</h1>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', padding: '12px 16px', borderRadius: '8px', marginBottom: '24px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      <form style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '24px', alignItems: 'start' }}>
        <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
            <Info size={18} color="#64748b" />
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: 0 }}>Thông tin</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '13px', color: '#64748b' }}>Ngày thu chi</span>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0 12px' }}>
                <input 
                  type="date" 
                  value={form.date} 
                  onChange={(e) => handleChange('date', e.target.value)}
                  style={{ border: 'none', outline: 'none', padding: '10px 0', width: '100%', color: '#1e293b', fontSize: '14px' }}
                />
                <Calendar size={16} color="#94a3b8" />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '13px', color: '#64748b' }}>Loại đối tượng <span style={{color: '#ef4444'}}>*</span></span>
              <select 
                value={form.targetType} 
                onChange={(e) => handleTargetTypeChange(e.target.value)}
                style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px 12px', outline: 'none', color: '#1e293b', fontSize: '14px' }}
              >
                <option value="Khách hàng">Khách hàng</option>
                <option value="Nhà cung cấp">Nhà cung cấp</option>
                <option value="Nhân viên">Nhân viên</option>
                <option value="Khác">Khác</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '13px', color: '#64748b' }}>Tài khoản tiền mặt <span style={{color: '#ef4444'}}>*</span></span>
              <select 
                value={form.accountName} 
                onChange={(e) => handleChange('accountName', e.target.value)}
                style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px 12px', outline: 'none', color: '#1e293b', fontSize: '14px' }}
              >
                <option value="Tiền mặt Hà Nội">Tiền mặt Hà Nội</option>
                <option value="Tiền mặt HCM">Tiền mặt HCM</option>
                <option value="Ngân hàng">Ngân hàng</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative' }}>
              <span style={{ fontSize: '13px', color: '#64748b' }}>Đối tượng</span>
              <input 
                type="text" 
                placeholder="Tìm kiếm đối tượng..."
                value={form.targetName} 
                onFocus={() => setShowTargetDropdown(true)}
                onBlur={() => setTimeout(() => setShowTargetDropdown(false), 200)}
                onChange={(e) => {
                  handleChange('targetName', e.target.value);
                  setShowTargetDropdown(true);
                }}
                style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px 12px', outline: 'none', color: '#1e293b', fontSize: '14px' }}
              />
              {showTargetDropdown && form.targetType !== 'Khác' && filteredTargets.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', marginTop: '4px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', maxHeight: '200px', overflowY: 'auto' }}>
                  {filteredTargets.map(t => (
                    <div key={t._id} onClick={() => {
                      setForm(prev => ({
                        ...prev, targetName: t.name, targetCode: t.code || t._id
                      }));
                      setShowTargetDropdown(false);
                    }} style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ fontWeight: '600', fontSize: '13px' }}>{t.name}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>{t.phone || t.code || t.email}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '13px', color: '#64748b' }}>Loại phiếu <span style={{color: '#ef4444'}}>*</span></span>
              <select 
                value={form.type} 
                onChange={(e) => handleChange('type', e.target.value)}
                style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px 12px', outline: 'none', color: '#1e293b', fontSize: '14px' }}
              >
                <option value="Phiếu thu">Phiếu thu</option>
                <option value="Phiếu chi">Phiếu chi</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '13px', color: '#64748b' }}>Loại chứng từ</span>
              <select 
                value={form.voucherType} 
                onChange={(e) => handleChange('voucherType', e.target.value)}
                style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px 12px', outline: 'none', color: '#1e293b', fontSize: '14px' }}
              >
                <option value="Phiếu XNK">Phiếu XNK</option>
                <option value="Hóa đơn">Hóa đơn</option>
                <option value="Khác">Khác</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '13px', color: '#64748b' }}>Đính kèm file</span>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
                <input 
                  type="text" 
                  readOnly 
                  placeholder={form.attachment ? form.attachment.name : "Chọn file jpg, jpeg, gif, png, doc,,. <= 8MB"} 
                  style={{ border: 'none', padding: '10px 12px', outline: 'none', flex: 1, fontSize: '13px' }}
                />
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  style={{ display: 'none' }} 
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleChange('attachment', e.target.files[0]);
                    }
                  }}
                />
                <button 
                  type="button" 
                  onClick={() => fileInputRef.current?.click()}
                  style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '0 16px', height: '100%', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                >
                  <Upload size={14} /> File
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '13px', color: '#64748b' }}>ID chứng từ</span>
              <input 
                type="text" 
                value={form.voucherId} 
                onChange={(e) => handleChange('voucherId', e.target.value)}
                style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px 12px', outline: 'none', color: '#1e293b', fontSize: '14px' }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
              <DollarSign size={18} color="#64748b" />
              <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: 0 }}>Thanh toán</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0 16px' }}>
                <DollarSign size={16} color="#94a3b8" />
                <input 
                  type="number" 
                  min={0}
                  placeholder="Số tiền (*)" 
                  value={form.amount || ''} 
                  onChange={(e) => handleChange('amount', Number(e.target.value) || 0)}
                  style={{ border: 'none', outline: 'none', padding: '14px 0', width: '100%', color: '#0f172a', fontSize: '16px', fontWeight: '600' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '12px 16px' }}>
                <MessageSquare size={16} color="#94a3b8" style={{ marginTop: '2px' }} />
                <textarea 
                  placeholder="Ghi chú" 
                  value={form.note} 
                  onChange={(e) => handleChange('note', e.target.value)}
                  rows={4}
                  style={{ border: 'none', outline: 'none', width: '100%', color: '#1e293b', fontSize: '14px', resize: 'vertical' }}
                />
              </div>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px', color: '#475569' }}>
                <input 
                  type="radio" 
                  name="afterSave" 
                  checked={afterSaveAction === 'continue'} 
                  onChange={() => setAfterSaveAction('continue')} 
                  style={{ cursor: 'pointer' }}
                />
                Tiếp tục thêm
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px', color: '#475569' }}>
                <input 
                  type="radio" 
                  name="afterSave" 
                  checked={afterSaveAction === 'list'} 
                  onChange={() => setAfterSaveAction('list')} 
                  style={{ cursor: 'pointer' }}
                />
                Xem danh sách
              </label>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                type="button"
                disabled={isSaving}
                onClick={(e) => handleSave(e, false)}
                style={{ 
                  background: '#22c55e', color: '#fff', border: 'none', borderRadius: '6px', 
                  padding: '10px 24px', fontSize: '14px', fontWeight: '600', cursor: isSaving ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '8px', opacity: isSaving ? 0.7 : 1
                }}
              >
                <Save size={16} /> Lưu
              </button>
              
              <button 
                type="button"
                disabled={isSaving}
                onClick={(e) => handleSave(e, true)}
                style={{ 
                  background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', 
                  padding: '10px 24px', fontSize: '14px', fontWeight: '600', cursor: isSaving ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '8px', opacity: isSaving ? 0.7 : 1
                }}
              >
                <Save size={16} /> Lưu và in
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
