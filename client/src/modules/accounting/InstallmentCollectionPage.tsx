import React, { useState, useEffect, useRef } from 'react';
import { Plus, FileDown, ChevronDown, Settings, Upload } from 'lucide-react';
import { http } from '../../core/api/http';

export function InstallmentCollectionPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    transactionId: '',
    dateRange: '05/05/2026 - 05/06/2026',
    vendorName: '',
    contractCode: ''
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await http.get('/accounting/installment-collections');
      setItems(response.data.items || []);
    } catch (err) {
      console.error('Failed to load data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleImportCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      
      const parsedItems = lines.slice(1).map(line => {
        const values = line.split(';');
        return {
          transactionId: values[0] || `TG${Date.now()}${Math.floor(Math.random()*1000)}`,
          accountCode: values[1] || '',
          accountName: values[2] || '',
          date: values[3] ? new Date(values[3]) : new Date(),
          cashier: values[4] || '',
          customerName: values[5] || '',
          customerPhone: values[6] || '',
          serviceCode: values[7] || '',
          serviceName: values[8] || '',
          contractCode: values[9] || '',
          dueDate: values[10] ? new Date(values[10]) : null,
          amount: Number(values[11] || 0),
          status: values[12] || '',
          vendorName: '',
          note: ''
        };
      });

      try {
        await http.post('/accounting/installment-collections/bulk', { items: parsedItems });
        alert(`Đã nhập thành công ${parsedItems.length} bản ghi!`);
        loadData();
      } catch (err: any) {
        alert('Lỗi import: ' + (err.response?.data?.message || err.message));
      }
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Filter items locally based on filter state
  const filteredItems = items.filter(item => {
    if (filters.transactionId && !item.transactionId?.toLowerCase().includes(filters.transactionId.toLowerCase())) return false;
    if (filters.vendorName && !item.vendorName?.toLowerCase().includes(filters.vendorName.toLowerCase())) return false;
    if (filters.contractCode && !item.contractCode?.toLowerCase().includes(filters.contractCode.toLowerCase())) return false;
    return true;
  });

  const [showAddModal, setShowAddModal] = useState(false);

  const handleExportCSV = () => {
    const csv = [
      ['ID phiếu thu', 'Ngày thu tiền', 'Quỹ tiền', 'Khách hàng', 'Dịch vụ trả góp', 'Mã hợp đồng', 'Ghi chú', 'Số tiền', 'Trạng thái'].join(','),
      ...filteredItems.map(item => [
        `"${item.transactionId || ''}"`,
        `"${item.date ? new Date(item.date).toLocaleDateString('vi-VN') : ''}"`,
        `"${item.accountName || ''}"`,
        `"${item.customerName || ''}"`,
        `"${item.serviceName || ''}"`,
        `"${item.contractCode || ''}"`,
        `"${item.note || ''}"`,
        item.amount || 0,
        `"${item.status || ''}"`
      ].join(','))
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `phieu_thu_tra_gop_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const [formData, setFormData] = useState({
    contractCode: '',
    amount: 0,
    date: new Date().toISOString().substring(0, 10),
    cashier: 'Admin',
    status: 'Thành công',
    note: ''
  });

  const handleAddSubmit = async () => {
    if (!formData.contractCode || !formData.amount) return alert('Vui lòng nhập Mã hợp đồng và Số tiền');
    try {
      const payload = {
        transactionId: `PTTG_${Date.now()}`,
        contractCode: formData.contractCode,
        amount: formData.amount,
        date: new Date(formData.date),
        cashier: formData.cashier,
        status: formData.status,
        note: formData.note,
        accountName: 'Tiền mặt VNĐ', // Mặc định
        customerName: 'Khách hàng ' + formData.contractCode
      };
      // Gửi vào mảng items qua bulk để dùng endpoint sẵn có, hoặc tạo mới
      await http.post('/accounting/installment-collections/bulk', { items: [payload] });
      setShowAddModal(false);
      setFormData({ contractCode: '', amount: 0, date: new Date().toISOString().substring(0, 10), cashier: 'Admin', status: 'Thành công', note: '' });
      loadData();
    } catch (err: any) {
      alert('Lỗi thêm phiếu thu: ' + (err.response?.data?.message || err.message));
    }
  };

  return (
    <div style={{ padding: '20px', backgroundColor: '#eef2f6', minHeight: '100vh', fontFamily: '"Inter", sans-serif' }}>
      <input
        type="file"
        accept=".csv"
        style={{ display: 'none' }}
        ref={fileInputRef}
        onChange={handleImportCSV}
      />
      
      <div style={{ backgroundColor: '#fff', borderRadius: '4px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', paddingBottom: '20px' }}>
        
        {/* Top Filter Bar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px', gap: '10px', alignItems: 'center' }}>
          <input 
            type="text" 
            placeholder="ID phiếu thu" 
            value={filters.transactionId}
            onChange={e => handleFilterChange('transactionId', e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #ced4da', borderRadius: '4px', width: '150px', fontSize: '14px' }}
          />
          
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', top: '-8px', left: '8px', backgroundColor: '#fff', padding: '0 4px', fontSize: '11px', color: '#6c757d' }}>Ngày tạo</span>
            <input 
              type="text" 
              value={filters.dateRange}
              onChange={e => handleFilterChange('dateRange', e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #ced4da', borderRadius: '4px', width: '220px', fontSize: '14px' }}
            />
          </div>

          <input 
            type="text" 
            placeholder="Nhà cung cấp" 
            value={filters.vendorName}
            onChange={e => handleFilterChange('vendorName', e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #ced4da', borderRadius: '4px', width: '200px', fontSize: '14px' }}
          />

          <input 
            type="text" 
            placeholder="Mã hợp đồng tr..." 
            value={filters.contractCode}
            onChange={e => handleFilterChange('contractCode', e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #ced4da', borderRadius: '4px', width: '160px', fontSize: '14px' }}
          />

          <div style={{ display: 'flex', borderRadius: '4px', overflow: 'hidden' }}>
            <button style={{ backgroundColor: '#009688', color: '#fff', border: 'none', padding: '8px 16px', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              Lọc
            </button>
            <button style={{ backgroundColor: '#00897b', color: '#fff', border: 'none', borderLeft: '1px solid rgba(255,255,255,0.2)', padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <ChevronDown size={16} />
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', padding: '0 16px 16px 16px', gap: '10px' }}>
          <button onClick={() => setShowAddModal(true)} style={{ backgroundColor: '#4caf50', color: '#fff', border: 'none', borderRadius: '4px', padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 500 }}>
            <Plus size={16} /> Thêm mới
          </button>
          <button onClick={handleExportCSV} style={{ backgroundColor: '#fff', color: '#495057', border: '1px solid #ced4da', borderRadius: '4px', padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <FileDown size={14} /> Xuất dữ liệu
          </button>
          {/* Nút Import để tương tác thực tế với CSDL như yêu cầu */}
          <button 
            onClick={() => fileInputRef.current?.click()}
            style={{ backgroundColor: '#fff', color: '#009688', border: '1px solid #009688', borderRadius: '4px', padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <Upload size={14} /> Import CSV
          </button>
        </div>

        {/* Data Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa', borderTop: '1px solid #dee2e6', borderBottom: '1px solid #dee2e6' }}>
                <th style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6', width: '40px', textAlign: 'center' }}>
                  <input type="checkbox" style={{ margin: 0, cursor: 'pointer' }} />
                </th>
                <th style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6', fontWeight: 600, color: '#333' }}>ID</th>
                <th style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6', fontWeight: 600, color: '#333' }}>Ngày thu tiền</th>
                <th style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6', fontWeight: 600, color: '#333' }}>Quỹ tiền</th>
                <th style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6', fontWeight: 600, color: '#333' }}>Khách hàng</th>
                <th style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6', fontWeight: 600, color: '#333' }}>Dịch vụ trả góp</th>
                <th style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6', fontWeight: 600, color: '#333' }}>Mã hợp đồng</th>
                <th style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6', fontWeight: 600, color: '#333' }}>Ghi chú</th>
                <th style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6', fontWeight: 600, color: '#333' }}>Số tiền</th>
                <th style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6', fontWeight: 600, color: '#333' }}>Trạng thái</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', width: '50px', color: '#6c757d' }}>
                  <Settings size={16} />
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} style={{ padding: '20px', textAlign: 'center', color: '#6c757d' }}>Đang tải dữ liệu...</td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: '20px', textAlign: 'center', color: '#6c757d' }}>Chưa có dữ liệu. Hãy Import CSV để tải dữ liệu mẫu.</td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #dee2e6' }}>
                    <td style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6', textAlign: 'center' }}>
                      <input type="checkbox" style={{ cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6', color: '#0056b3' }}>{item.transactionId || '-'}</td>
                    <td style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6' }}>{item.date ? new Date(item.date).toLocaleDateString('vi-VN') : '-'}</td>
                    <td style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6' }}>{item.accountName || '-'}</td>
                    <td style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6' }}>{item.customerName || '-'}</td>
                    <td style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6' }}>{item.serviceName || '-'}</td>
                    <td style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6' }}>{item.contractCode || '-'}</td>
                    <td style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6' }}>{item.note || '-'}</td>
                    <td style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6', color: 'green', fontWeight: 'bold' }}>{item.amount ? item.amount.toLocaleString('vi-VN') : '0'}</td>
                    <td style={{ padding: '12px 16px', borderRight: '1px solid #dee2e6' }}>
                      <span style={{ backgroundColor: item.status === 'Thành công' ? '#e6f4ea' : '#f8f9fa', color: item.status === 'Thành công' ? '#1e8e3e' : '#333', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>
                        {item.status || '-'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      {/* Cài đặt từng dòng */}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000}} onClick={() => setShowAddModal(false)}>
          <div style={{background: '#fff', padding: '24px', borderRadius: '8px', width: '500px'}} onClick={e => e.stopPropagation()}>
            <h3 style={{marginTop: 0, marginBottom: '20px', fontSize: '18px', fontWeight: 600}}>Thêm phiếu thu trả góp</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500}}>Mã hợp đồng (*)</label>
                <input style={{width: '100%', padding: '8px 12px', border: '1px solid #ced4da', borderRadius: '4px', boxSizing: 'border-box'}} value={formData.contractCode} onChange={e => setFormData({...formData, contractCode: e.target.value})} placeholder="VD: HD_123" />
              </div>
              
              <div>
                <label style={{display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500}}>Số tiền (*)</label>
                <input type="number" style={{width: '100%', padding: '8px 12px', border: '1px solid #ced4da', borderRadius: '4px', boxSizing: 'border-box'}} value={formData.amount} onChange={e => setFormData({...formData, amount: Number(e.target.value)})} />
              </div>

              <div>
                <label style={{display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500}}>Ngày thu</label>
                <input type="date" style={{width: '100%', padding: '8px 12px', border: '1px solid #ced4da', borderRadius: '4px', boxSizing: 'border-box'}} value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
              </div>

              <div>
                <label style={{display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500}}>Người thu tiền</label>
                <input style={{width: '100%', padding: '8px 12px', border: '1px solid #ced4da', borderRadius: '4px', boxSizing: 'border-box'}} value={formData.cashier} onChange={e => setFormData({...formData, cashier: e.target.value})} />
              </div>

              <div>
                <label style={{display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500}}>Trạng thái</label>
                <select style={{width: '100%', padding: '8px 12px', border: '1px solid #ced4da', borderRadius: '4px', boxSizing: 'border-box'}} value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                  <option value="Thành công">Thành công</option>
                  <option value="Thất bại">Thất bại</option>
                  <option value="Chờ xử lý">Chờ xử lý</option>
                </select>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500}}>Ghi chú</label>
                <textarea rows={3} style={{width: '100%', padding: '8px 12px', border: '1px solid #ced4da', borderRadius: '4px', boxSizing: 'border-box'}} value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})}></textarea>
              </div>
            </div>

            <div style={{display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px'}}>
              <button onClick={() => setShowAddModal(false)} style={{padding: '8px 16px', border: '1px solid #ced4da', borderRadius: '4px', background: '#fff', cursor: 'pointer', fontWeight: 500}}>Hủy</button>
              <button onClick={handleAddSubmit} style={{padding: '8px 16px', border: 'none', borderRadius: '4px', background: '#009688', color: '#fff', cursor: 'pointer', fontWeight: 500}}>Lưu phiếu thu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
