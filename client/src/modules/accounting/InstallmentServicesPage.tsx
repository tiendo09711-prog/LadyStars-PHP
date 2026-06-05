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

  useEffect(() => {
    fetchItems();
  }, []);

  const handleFilter = () => {
    fetchItems();
  };

  return (
    <div className="installment-page">
      <div className="installment-header">
        <div className="installment-actions">
          <button className="btn-add-installment">
            <i className="fa-solid fa-plus"></i> Thêm dịch vụ trả góp
          </button>
          <button className="btn-fee-table">
            <i className="fa-solid fa-list"></i> Bảng phí dịch vụ trả góp
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
          <input 
            type="text" 
            placeholder="Địa chỉ" 
            className="installment-filter-input"
            value={filters.address}
            onChange={e => setFilters(f => ({...f, address: e.target.value}))}
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
              <th style={{ width: '100px' }}>ID</th>
              <th style={{ minWidth: '250px' }}>Tên</th>
              <th style={{ width: '150px' }}>Mã đối tượng</th>
              <th style={{ width: '150px' }}>Điện thoại</th>
              <th style={{ width: '150px' }}>Người tạo</th>
              <th style={{ width: '60px' }}>
                <button className="btn-gear-installment">
                  <i className="fa-solid fa-gear"></i>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center" style={{padding: '20px'}}>Đang tải...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="text-center" style={{padding: '20px'}}>Chưa có dữ liệu. Hãy thêm dịch vụ trả góp hoặc tải file CSV.</td></tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td className="text-center">{item.id}</td>
                  <td>{item.name}</td>
                  <td className="text-center">{item.targetCode}</td>
                  <td className="text-center">{item.phone}</td>
                  <td className="text-center">{item.creator}</td>
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
    </div>
  );
}
