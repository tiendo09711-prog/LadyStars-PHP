import { useState, useEffect } from 'react';
import { X, Trash2, Search, Upload, Download, DollarSign, Phone, Mail, AtSign, PhoneIncoming, FileDown } from 'lucide-react';
import { http } from '../../../core/api/http';

export type CareActionType = 'Tặng điểm' | 'Trừ điểm' | 'Tặng tiền tích lũy' | 'Trừ tiền tích lũy' | 'Gọi điện' | 'Nhắn tin' | 'Gửi email' | 'Nhận cuộc gọi' | 'Import hành động chăm sóc';

export const CareActionIcons: Record<CareActionType, any> = {
  'Tặng điểm': <Upload size={16} />,
  'Trừ điểm': <Download size={16} />,
  'Tặng tiền tích lũy': <DollarSign size={16} />,
  'Trừ tiền tích lũy': <DollarSign size={16} />,
  'Gọi điện': <Phone size={16} />,
  'Nhắn tin': <Mail size={16} />,
  'Gửi email': <AtSign size={16} />,
  'Nhận cuộc gọi': <PhoneIncoming size={16} />,
  'Import hành động chăm sóc': <FileDown size={16} />
};

export function CustomerCareActionModal({
  action,
  onClose,
  onSuccess
}: {
  action: CareActionType;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState('');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [creatorName, setCreatorName] = useState('');
  useEffect(() => {
    http.get('/auth/me')
      .then(res => setCreatorName(res.data?.name || ''))
      .catch(() => setCreatorName(''));
  }, []);
  
  const showValueField = ['Tặng điểm', 'Trừ điểm', 'Tặng tiền tích lũy', 'Trừ tiền tích lũy'].includes(action);

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      // Gửi request tìm kiếm
      http.get('/customers/customers', { params: { q: searchQuery, limit: 20 } })
        .then(res => {
          setSearchResults(res.data.items || []);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectCustomer = (cust: any) => {
    if (!selectedCustomers.find(c => c._id === cust._id)) {
      setSelectedCustomers([...selectedCustomers, cust]);
    }
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleRemoveCustomer = (id: string) => {
    setSelectedCustomers(selectedCustomers.filter(c => c._id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCustomers.length === 0) {
      alert('Vui lòng chọn ít nhất một khách hàng!');
      return;
    }
    if (showValueField && !value) {
      alert('Vui lòng nhập trị giá!');
      return;
    }

    setIsSubmitting(true);
    try {
      await Promise.all(selectedCustomers.map(cust => {
         const code = `CC${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
         return http.post('/customers/care', {
           code,
           customerCode: cust.code,
           customerName: cust.name,
           customerPhone: cust.phone,
           details: showValueField ? `${value} (${action})` : action,
           reason: reason,
          description: note,
           creator: creatorName || undefined,
          recordDate: new Date().toISOString()
         });
      }));
      onSuccess();
    } catch (err) {
      alert('Có lỗi xảy ra khi lưu!');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (action === 'Import hành động chăm sóc') {
    return (
      <div className="modal-backdrop" role="presentation" style={{ zIndex: 1000 }}>
        <form className="modal-card" onSubmit={(e) => { e.preventDefault(); alert('Chức năng import đang được phát triển'); onClose(); }} style={{ maxWidth: 800, width: '100%' }}>
          <div className="modal-header">
            <div>
              <h2>Import chăm sóc khách hàng</h2>
            </div>
            <button className="icon-button" type="button" onClick={onClose} title="Đóng">
              <X size={18} />
            </button>
          </div>
          
          <div style={{ padding: '1.25rem' }}>
            <div style={{ backgroundColor: '#e0f7fa', padding: '1rem', borderRadius: 4, border: '1px solid #b2ebf2', marginBottom: '1.5rem', color: '#006064' }}>
              Tải file mẫu Excel <a href="#" style={{ color: '#00838f', textDecoration: 'underline' }}>Excel Nhanh.vn_Import_Customer_Care_v0.2.0.xlsm</a>
            </div>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label className="form-field">
                  <span>Loại *</span>
                  <select required>
                    <option value="">- Loại -</option>
                    <option value="point">Điểm</option>
                    <option value="money">Tiền</option>
                  </select>
                </label>
                <label className="form-field" style={{ marginTop: '1rem' }}>
                  <span>File Excel *</span>
                  <input type="file" accept=".xlsx,.xls,.xlsm" required />
                </label>
              </div>
              <div>
                <label className="form-field">
                  <span>Kiểu tặng</span>
                  <select>
                    <option value="">- Kiểu tặng -</option>
                    <option value="tang_diem">Tặng điểm</option>
                    <option value="tru_diem">Trừ điểm</option>
                  </select>
                </label>
                <label className="form-field" style={{ marginTop: '1rem' }}>
                  <span>Lý do</span>
                  <input type="text" placeholder="- Lý do -" />
                </label>
              </div>
            </div>
          </div>

          <div className="modal-footer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '1rem' }}>
            <button className="btn btn-primary" type="submit" disabled={isSubmitting}>Lưu</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted-color)' }}>
              <span style={{ border: '1px solid currentColor', borderRadius: '50%', width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>?</span>
              Không chèn các kí tự đặc biệt (@,# ,$,/,-, ...) vào tên của file import
            </div>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" role="presentation" style={{ zIndex: 1000 }}>
      <form className="modal-card" onSubmit={handleSubmit} style={{ maxWidth: 800, width: '100%' }}>
        <div className="modal-header">
          <div>
            <h2>{action}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="Đóng">
            <X size={18} />
          </button>
        </div>
        
        <div style={{ padding: '1.25rem' }}>
          <div style={{ padding: '1rem', border: '1px solid var(--surface-300)', borderRadius: 8, marginBottom: '1rem' }}>
            <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
               <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', border: '1px solid', fontSize: 12 }}>i</span>
               Thông tin cơ bản
            </h4>
            
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: '1rem' }}>
               <label className="form-field">
                 <span>Kiểu tặng</span>
                 <input type="text" value={action} readOnly style={{ background: 'var(--surface-100)' }} />
               </label>
               <label className="form-field">
                 <span>Lý do</span>
                 <input type="text" placeholder="- Lý do -" value={reason} onChange={e => setReason(e.target.value)} />
               </label>
               {showValueField && (
                 <label className="form-field">
                   <span>Trị giá (*)</span>
                   <input type="number" required value={value} onChange={e => setValue(e.target.value)} />
                 </label>
               )}
            </div>

            <div className="form-grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
               <label className="form-field" style={{ position: 'relative' }}>
                 <span>Khách hàng</span>
                 <input 
                   type="text" 
                   placeholder="Tìm kiếm khách hàng..." 
                   value={searchQuery}
                   onChange={e => setSearchQuery(e.target.value)}
                 />
                 {searchResults.length > 0 && (
                   <ul style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface-0)', border: '1px solid var(--surface-200)', borderRadius: 4, zIndex: 10, maxHeight: 200, overflowY: 'auto', listStyle: 'none', padding: 0, margin: 0, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                     {searchResults.map(r => (
                       <li 
                         key={r._id} 
                         onClick={() => handleSelectCustomer(r)}
                         style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--surface-100)' }}
                       >
                         <strong>{r.name}</strong> - {r.phone}
                       </li>
                     ))}
                   </ul>
                 )}
               </label>
               <label className="form-field">
                 <span>Ghi chú</span>
                 <input type="text" value={note} onChange={e => setNote(e.target.value)} />
               </label>
            </div>
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid var(--surface-200)', borderRadius: 4 }}>
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 50, textAlign: 'center' }}>#</th>
                  <th>Khách hàng</th>
                  <th>Mã khách hàng</th>
                  <th>Điện thoại</th>
                  <th style={{ width: 80, textAlign: 'center' }}>Xóa</th>
                </tr>
              </thead>
              <tbody>
                {selectedCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted-color)' }}>
                      Chưa có khách hàng nào được chọn
                    </td>
                  </tr>
                ) : (
                  selectedCustomers.map((cust, idx) => (
                    <tr key={cust._id}>
                      <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                      <td>{cust.name}</td>
                      <td>{cust.code}</td>
                      <td>{cust.phone}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button type="button" className="icon-button danger" onClick={() => handleRemoveCustomer(cust._id)}>
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </form>
    </div>
  );
}
