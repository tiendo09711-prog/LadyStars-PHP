import { useState, useEffect } from 'react';
import { http } from '../../core/api/http';
import './AccountingAccountsPage.css';

interface Account {
  _id: string;
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
  const [filters, setFilters] = useState({ search: '', type: '' });
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ code: '', name: '', warehouse: '', status: 'Kích hoạt' });

  // New states for interactive buttons
  const [showActionDropdown, setShowActionDropdown] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (filters.search) query.append('search', filters.search);
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

  useEffect(() => {
    if (!showActionDropdown) return;
    const handleClose = () => setShowActionDropdown(false);
    window.addEventListener('click', handleClose);
    return () => window.removeEventListener('click', handleClose);
  }, [showActionDropdown]);

  const handleFilter = () => {
    fetchAccounts();
  };

  const handleSave = async () => {
    if (!formData.code || !formData.name) return alert('Vui lòng nhập mã và tên tài khoản');
    try {
      await http.post('/accounting/accounts', {
        id: `ACC_${Date.now()}`,
        code: formData.code,
        name: formData.name,
        warehouse: formData.warehouse,
        status: formData.status,
        creator: 'Admin'
      });
      setShowModal(false);
      setFormData({ code: '', name: '', warehouse: '', status: 'Kích hoạt' });
      fetchAccounts();
    } catch (err: any) {
      alert('Lỗi: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc muốn xóa tài khoản này?')) return;
    try {
      await http.delete(`/accounting/accounts/${id}`);
      fetchAccounts();
    } catch (err) {
      alert('Lỗi khi xóa');
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(accounts.map(a => a._id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) newSelected.add(id);
    else newSelected.delete(id);
    setSelectedIds(newSelected);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Bạn có chắc muốn xóa ${selectedIds.size} tài khoản đã chọn?`)) return;
    try {
      // Deleting one by one as fallback
      for (const id of Array.from(selectedIds)) {
        await http.delete(`/accounting/accounts/${id}`);
      }
      setSelectedIds(new Set());
      fetchAccounts();
    } catch (err) {
      alert('Lỗi khi xóa hàng loạt');
    }
  };

  const handleExportCSV = () => {
    const csv = [
      ['ID', 'Mã tài khoản', 'Tên', 'Kho hàng', 'Trạng thái', 'Người tạo'].join(','),
      ...accounts.map(acc => [
        `"${acc.id}"`,
        `"${acc.code}"`,
        `"${acc.name}"`,
        `"${acc.warehouse || ''}"`,
        `"${acc.status}"`,
        `"${acc.creator}"`
      ].join(','))
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `he_thong_tai_khoan_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="accounts-page">
      <div className="accounts-card">
        
        {/* Header Options */}
        <div className="accounts-header">
          <div className="header-left">
            <button className="btn-add" onClick={() => setShowModal(true)}>
              <i className="fa-solid fa-plus"></i> Thêm mới
            </button>
            <div className="dropdown-container">
              <button 
                className="btn-actions" 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowActionDropdown(!showActionDropdown);
                }}
              >
                Thao tác {selectedIds.size > 0 ? `(${selectedIds.size})` : ''} <i className="fa-solid fa-chevron-down" style={{fontSize: '10px', marginLeft: '3px'}}></i>
              </button>
              {showActionDropdown && (
                <div className="dropdown-menu" style={{ position: 'absolute', top: '100%', left: 0, minWidth: '150px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '4px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 10 }}>
                  <button className="dropdown-item" style={{ padding: '8px 12px', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer' }} onClick={handleExportCSV}>
                    <i className="fa-solid fa-file-export" style={{ marginRight: '8px' }}></i> Xuất Excel/CSV
                  </button>
                  <button 
                    className="dropdown-item text-danger" 
                    style={{ padding: '8px 12px', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444' }} 
                    disabled={selectedIds.size === 0}
                    onClick={handleBulkDelete}
                  >
                    <i className="fa-solid fa-trash" style={{ marginRight: '8px' }}></i> Xóa các mục đã chọn
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="header-right">
            <input 
              type="text" 
              placeholder="Mã/Tên Tài khoản" 
              className="filter-input"
              value={filters.search}
              onChange={e => setFilters(f => ({...f, search: e.target.value}))}
            />
            <button onClick={handleFilter} className="btn-filter">
              Lọc
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="table-responsive">
          <table className="accounts-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input 
                    type="checkbox" 
                    checked={accounts.length > 0 && selectedIds.size === accounts.length}
                    onChange={handleSelectAll}
                  />
                </th>
                <th style={{ width: '50px' }}>#</th>
                <th style={{ width: '100px' }}>ID</th>
                <th style={{ width: '140px' }}>Code</th>
                <th style={{ minWidth: '300px' }}>Tên</th>
                <th style={{ width: '150px' }}>Kho hàng</th>
                <th style={{ width: '100px' }}>Tình trạng</th>
                <th style={{ width: '160px' }}>Người tạo</th>
                <th style={{ width: '60px' }}><i className="fa-solid fa-gear"></i></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center" style={{padding: '20px'}}>Đang tải...</td></tr>
              ) : accounts.length === 0 ? (
                <tr><td colSpan={9} className="text-center" style={{padding: '20px'}}>Không có dữ liệu</td></tr>
              ) : (
                accounts.map((acc, idx) => {
                  const safeCode = acc.code || '';
                  const depth = Math.max(0, safeCode.length - 3);
                  return (
                    <tr key={acc.id || safeCode}>
                      <td className="text-center">
                        <input 
                          type="checkbox" 
                          checked={selectedIds.has(acc._id)}
                          onChange={(e) => handleSelectRow(acc._id, e.target.checked)}
                        />
                      </td>
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
                        {acc.warehouse && <span className="badge-warehouse">{acc.warehouse}</span>}
                      </td>
                      <td className="text-center">
                        {acc.status === 'Kích hoạt' ? (
                          <i className="fa-solid fa-check text-success" title="Kích hoạt"></i>
                        ) : (
                          <span className="text-muted">{acc.status}</span>
                        )}
                      </td>
                      <td>{acc.creator}</td>
                      <td className="text-center">
                        <button className="btn-row-action" onClick={() => handleDelete(acc._id)} style={{color: 'red', border: 'none', background: 'transparent', cursor: 'pointer'}}>
                          <i className="fa-solid fa-trash"></i>
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

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)} style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000}}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{background: '#fff', padding: '20px', borderRadius: '8px', width: '400px'}}>
            <h3 style={{marginTop: 0, marginBottom: '20px'}}>Thêm tài khoản</h3>
            <div style={{marginBottom: '15px'}}>
              <label style={{display: 'block', marginBottom: '5px'}}>Mã tài khoản (*)</label>
              <input className="filter-input" style={{width: '100%', boxSizing: 'border-box'}} value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} placeholder="VD: 1111" />
            </div>
            <div style={{marginBottom: '15px'}}>
              <label style={{display: 'block', marginBottom: '5px'}}>Tên tài khoản (*)</label>
              <input className="filter-input" style={{width: '100%', boxSizing: 'border-box'}} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="VD: Tiền mặt VNĐ" />
            </div>
            <div style={{display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px'}}>
              <button onClick={() => setShowModal(false)} style={{padding: '6px 12px', border: '1px solid #ccc', borderRadius: '4px', background: '#fff', cursor: 'pointer'}}>Hủy</button>
              <button onClick={handleSave} style={{padding: '6px 12px', border: 'none', borderRadius: '4px', background: '#007bff', color: '#fff', cursor: 'pointer'}}>Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

