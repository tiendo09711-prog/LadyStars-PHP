import { useState, useEffect } from 'react';
import { http } from '../../core/api/http';
import './InstallmentServicesPage.css';

interface InstallmentServiceData {
  id: string;
  name: string;
  targetCode: string;
  phone: string;
  address: string;
  creator: string;
  createdAt: string;
}

export function InstallmentServicesPage() {
  const [items, setItems] = useState<InstallmentServiceData[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    id: '',
    targetCode: '',
    name: '',
    phone: '',
    address: ''
  });

  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    targetCode: '',
    phone: '',
    address: '',
    totalAmount: 0,
    prepaidAmount: 0,
    months: 1,
    interestRate: 0,
    monthlyPayment: 0
  });
  const [settingsData, setSettingsData] = useState({ id: '', defaultInterestRate: 1.5, lateFeeRate: 0.1 });

  const fetchItems = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (filters.id) query.append('id', filters.id);
      if (filters.targetCode) query.append('targetCode', filters.targetCode);
      if (filters.name) query.append('name', filters.name);
      if (filters.phone) query.append('phone', filters.phone);
      if (filters.address) query.append('address', filters.address);
      
      const res = await http.get(`/accounting/installment-services?${query.toString()}`);
      setItems(res.data.items || []);
    } catch (error) {
      console.error('Failed to fetch installment services:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const res = await http.get('/accounting/installment-settings');
      if (res.data.items && res.data.items.length > 0) {
        const set = res.data.items[0];
        setSettingsData({ id: set._id, defaultInterestRate: set.defaultInterestRate, lateFeeRate: set.lateFeeRate });
      }
    } catch (err) {
      console.error('Failed to load settings', err);
    }
  };

  useEffect(() => {
    fetchItems();
    loadSettings();
  }, []);

  const handleFilter = () => {
    fetchItems();
  };

  const handleOpenAddModal = () => {
    setFormData({
      name: '',
      targetCode: '',
      phone: '',
      address: '',
      totalAmount: 0,
      prepaidAmount: 0,
      months: 1,
      interestRate: settingsData.defaultInterestRate,
      monthlyPayment: 0
    });
    setShowAddModal(true);
  };

  const calculateMonthly = (data: typeof formData) => {
    const principal = data.totalAmount - data.prepaidAmount;
    if (principal <= 0 || data.months <= 0) return 0;
    const monthlyPrincipal = principal / data.months;
    const monthlyInterest = principal * (data.interestRate / 100);
    return Math.round(monthlyPrincipal + monthlyInterest);
  };

  const handleAddSubmit = async () => {
    try {
      const payload = {
        ...formData,
        id: `HD_${Date.now()}`,
        monthlyPayment: calculateMonthly(formData),
        creator: 'Admin'
      };
      await http.post('/accounting/installment-services', payload);
      setShowAddModal(false);
      fetchItems();
    } catch (err: any) {
      alert('Lỗi tạo hợp đồng: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleSettingsSubmit = async () => {
    try {
      if (settingsData.id) {
        await http.put(`/accounting/installment-settings/${settingsData.id}`, settingsData);
      } else {
        await http.post('/accounting/installment-settings', settingsData);
      }
      await loadSettings();
      setShowSettingsModal(false);
      setTimeout(() => alert('Cập nhật cài đặt thành công!'), 100);
    } catch (err: any) {
      alert('Lỗi lưu cài đặt: ' + (err.response?.data?.message || err.message));
    }
  };

  return (
    <div className="installment-page">
      <div className="installment-header">
        <div className="installment-actions">
          <button className="btn-add-installment" onClick={handleOpenAddModal}>
            <i className="fa-solid fa-plus"></i> Thêm dịch vụ trả góp
          </button>
          <button className="btn-fee-table" onClick={() => setShowSettingsModal(true)}>
            <i className="fa-solid fa-gear"></i> Cài đặt Lãi suất & Phí
          </button>
        </div>
        
        <div className="installment-filters">
          <input 
            type="text" 
            placeholder="ID" 
            className="installment-filter-input"
            value={filters.id}
            onChange={e => setFilters(f => ({...f, id: e.target.value}))}
          />
          <input 
            type="text" 
            placeholder="Mã đối tượng" 
            className="installment-filter-input"
            value={filters.targetCode}
            onChange={e => setFilters(f => ({...f, targetCode: e.target.value}))}
          />
          <input 
            type="text" 
            placeholder="Tên" 
            className="installment-filter-input"
            value={filters.name}
            onChange={e => setFilters(f => ({...f, name: e.target.value}))}
          />
          <input 
            type="text" 
            placeholder="Điện thoại" 
            className="installment-filter-input"
            value={filters.phone}
            onChange={e => setFilters(f => ({...f, phone: e.target.value}))}
          />
          <button 
            onClick={handleFilter}
            className="btn-filter-installment"
          >
            Lọc
          </button>
        </div>
      </div>

      <div className="installment-table-container">
        <table className="installment-table">
          <thead>
            <tr>
              <th style={{ width: '100px' }}>ID Hợp đồng</th>
              <th style={{ minWidth: '150px' }}>Tên Khách Hàng</th>
              <th style={{ width: '120px' }}>Điện thoại</th>
              <th style={{ width: '120px' }}>Tổng tiền</th>
              <th style={{ width: '100px' }}>Kỳ hạn</th>
              <th style={{ width: '100px' }}>Lãi suất</th>
              <th style={{ width: '120px' }}>Mỗi tháng</th>
              <th style={{ width: '60px' }}>
                <i className="fa-solid fa-gear"></i>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center" style={{padding: '20px'}}>Đang tải...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={8} className="text-center" style={{padding: '20px'}}>Chưa có dữ liệu.</td></tr>
            ) : (
              items.map((item: any) => (
                <tr key={item.id}>
                  <td className="text-center">{item.id}</td>
                  <td>{item.name}</td>
                  <td className="text-center">{item.phone}</td>
                  <td className="text-right">{(item.totalAmount || 0).toLocaleString('vi-VN')}</td>
                  <td className="text-center">{item.months || 1} tháng</td>
                  <td className="text-center">{item.interestRate || 0}%</td>
                  <td className="text-right" style={{color: 'green', fontWeight: 'bold'}}>{(item.monthlyPayment || 0).toLocaleString('vi-VN')}</td>
                  <td className="text-center">
                    <button className="btn-gear-installment" style={{fontSize: '12px'}}>
                      <i className="fa-solid fa-bars"></i>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowSettingsModal(false)} style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000}}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{background: '#fff', padding: '20px', borderRadius: '8px', width: '400px'}}>
            <h3 style={{marginTop: 0, marginBottom: '20px'}}>Cài đặt Lãi suất Trả góp</h3>
            <div style={{marginBottom: '15px'}}>
              <label style={{display: 'block', marginBottom: '5px'}}>Lãi suất mặc định (% / tháng)</label>
              <input type="number" step="0.1" className="installment-filter-input" style={{width: '100%', boxSizing: 'border-box'}} value={settingsData.defaultInterestRate} onChange={e => setSettingsData({...settingsData, defaultInterestRate: Number(e.target.value)})} />
            </div>
            <div style={{marginBottom: '15px'}}>
              <label style={{display: 'block', marginBottom: '5px'}}>Phí phạt trả chậm (% / ngày)</label>
              <input type="number" step="0.1" className="installment-filter-input" style={{width: '100%', boxSizing: 'border-box'}} value={settingsData.lateFeeRate} onChange={e => setSettingsData({...settingsData, lateFeeRate: Number(e.target.value)})} />
            </div>
            <div style={{display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px'}}>
              <button onClick={() => setShowSettingsModal(false)} style={{padding: '6px 12px', border: '1px solid #ccc', borderRadius: '4px', background: '#fff', cursor: 'pointer'}}>Hủy</button>
              <button onClick={handleSettingsSubmit} style={{padding: '6px 12px', border: 'none', borderRadius: '4px', background: '#007bff', color: '#fff', cursor: 'pointer'}}>Lưu cài đặt</button>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)} style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000}}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{background: '#fff', padding: '20px', borderRadius: '8px', width: '600px'}}>
            <h3 style={{marginTop: 0, marginBottom: '20px'}}>Thêm Hợp Đồng Trả Góp</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
              <div>
                <label style={{display: 'block', marginBottom: '5px'}}>Tên Khách Hàng</label>
                <input className="installment-filter-input" style={{width: '100%', boxSizing: 'border-box'}} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div>
                <label style={{display: 'block', marginBottom: '5px'}}>Mã Khách Hàng</label>
                <input className="installment-filter-input" style={{width: '100%', boxSizing: 'border-box'}} value={formData.targetCode} onChange={e => setFormData({...formData, targetCode: e.target.value})} />
              </div>
              <div>
                <label style={{display: 'block', marginBottom: '5px'}}>Số điện thoại</label>
                <input className="installment-filter-input" style={{width: '100%', boxSizing: 'border-box'}} value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
              </div>
              <div>
                <label style={{display: 'block', marginBottom: '5px'}}>Tổng tiền hợp đồng</label>
                <input type="number" className="installment-filter-input" style={{width: '100%', boxSizing: 'border-box'}} value={formData.totalAmount} onChange={e => setFormData({...formData, totalAmount: Number(e.target.value)})} />
              </div>
              <div>
                <label style={{display: 'block', marginBottom: '5px'}}>Đã trả trước</label>
                <input type="number" className="installment-filter-input" style={{width: '100%', boxSizing: 'border-box'}} value={formData.prepaidAmount} onChange={e => setFormData({...formData, prepaidAmount: Number(e.target.value)})} />
              </div>
              <div>
                <label style={{display: 'block', marginBottom: '5px'}}>Số tháng trả góp</label>
                <input type="number" className="installment-filter-input" style={{width: '100%', boxSizing: 'border-box'}} value={formData.months} onChange={e => setFormData({...formData, months: Number(e.target.value)})} />
              </div>
              <div>
                <label style={{display: 'block', marginBottom: '5px'}}>Lãi suất (% / tháng)</label>
                <input type="number" step="0.1" className="installment-filter-input" style={{width: '100%', boxSizing: 'border-box'}} value={formData.interestRate} onChange={e => setFormData({...formData, interestRate: Number(e.target.value)})} />
              </div>
              <div>
                <label style={{display: 'block', marginBottom: '5px'}}>Tiền đóng mỗi tháng (Dự kiến)</label>
                <input type="text" readOnly className="installment-filter-input" style={{width: '100%', boxSizing: 'border-box', backgroundColor: '#e9ecef', color: '#495057', fontWeight: 'bold'}} value={calculateMonthly(formData).toLocaleString('vi-VN')} />
              </div>
            </div>
            
            <div style={{display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px'}}>
              <button onClick={() => setShowAddModal(false)} style={{padding: '6px 12px', border: '1px solid #ccc', borderRadius: '4px', background: '#fff', cursor: 'pointer'}}>Hủy</button>
              <button onClick={handleAddSubmit} style={{padding: '6px 12px', border: 'none', borderRadius: '4px', background: '#007bff', color: '#fff', cursor: 'pointer'}}>Lưu hợp đồng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
