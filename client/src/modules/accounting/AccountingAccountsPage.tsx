import { useState, useEffect } from 'react';
import { http } from '../../core/api/http';
import './AccountingAccountsPage.css';

interface Account {
  id: string;
  code: string;
  name: string;
  warehouse: string;
  status: string;
  creator: string;
  createdAt: string;
}

export function AccountingAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ accountId: '', type: '' });

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (filters.accountId) query.append('accountId', filters.accountId);
      if (filters.type) query.append('type', filters.type);
      
      const res = await http.get(`/accounting/accounts-list?${query.toString()}`);
      setAccounts(res.data.items || []);
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleFilter = () => {
    fetchAccounts();
  };

  return (
    <div className="accounts-page">
      <div className="accounts-card">
        
        {/* Header Options */}
        <div className="accounts-header">
          <div className="header-left">
            <button className="btn-add">
              <i className="fa-solid fa-plus"></i> Thêm mới
            </button>
            <div className="dropdown-container">
              <button className="btn-actions">
                Thao tác <i className="fa-solid fa-chevron-down" style={{fontSize: '10px', marginLeft: '3px'}}></i>
              </button>
            </div>
          </div>
          <div className="header-right">
            <input 
              type="text" 
              placeholder="ID Tài khoản" 
              className="filter-input"
              value={filters.accountId}
              onChange={e => setFilters(f => ({...f, accountId: e.target.value}))}
            />
            <select 
              className="filter-select"
              value={filters.type}
              onChange={e => setFilters(f => ({...f, type: e.target.value}))}
            >
              <option value="">Loại</option>
              <option value="Tài sản">Tài sản</option>
              <option value="Nguồn vốn">Nguồn vốn</option>
            </select>
            <button 
              onClick={handleFilter}
              className="btn-filter"
            >
              Lọc
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="table-responsive">
          <table className="accounts-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}><input type="checkbox" /></th>
                <th style={{ width: '50px' }}>#</th>
                <th style={{ width: '100px' }}>ID</th>
                <th style={{ width: '140px' }}>Code</th>
                <th style={{ minWidth: '300px' }}>Tên</th>
                <th style={{ width: '150px' }}>Kho hàng</th>
                <th style={{ width: '100px' }}>Tình trạng</th>
                <th style={{ width: '160px' }}>Người tạo</th>
                <th style={{ width: '60px' }}><button className="btn-gear"><i className="fa-solid fa-gear"></i></button></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center" style={{padding: '20px'}}>Đang tải...</td></tr>
              ) : accounts.length === 0 ? (
                <tr><td colSpan={9} className="text-center" style={{padding: '20px'}}>Không có dữ liệu</td></tr>
              ) : (
                accounts.map((acc, idx) => {
                  const depth = Math.max(0, acc.code.length - 3);
                  
                  return (
                    <tr key={acc.id}>
                      <td className="text-center"><input type="checkbox" /></td>
                      <td className="text-center">{idx + 1}</td>
                      <td className="text-center">{acc.id}</td>
                      <td className="text-center" style={{ paddingLeft: `${10 + depth * 15}px`, textAlign: 'left' }}>
                        {acc.code}
                      </td>
                      <td style={{ paddingLeft: `${10 + depth * 30}px` }}>
                        {depth === 1 ? <i className="fa-solid fa-money-bill-1-wave child-icon"></i> : depth >= 2 ? <i className="fa-solid fa-money-check-dollar child-icon"></i> : null}
                        {acc.name}
                      </td>
                      <td className="text-center">
                        {acc.warehouse && (
                          <span className="badge-warehouse">
                            {acc.warehouse}
                          </span>
                        )}
                      </td>
                      <td className="text-center">
                        {acc.status === 'Kích hoạt' ? (
                          <i className="fa-solid fa-check text-success" title="Kích hoạt"></i>
                        ) : (
                          <i className="fa-solid fa-check text-success" title={acc.status}></i>
                        )}
                      </td>
                      <td>{acc.creator}</td>
                      <td className="text-center">
                        <button className="btn-row-action">
                          <i className="fa-solid fa-bars"></i>
                          <i className="fa-solid fa-chevron-down" style={{fontSize: '9px'}}></i>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
