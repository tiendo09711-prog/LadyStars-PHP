import { useState, useEffect } from 'react';
import { Download, Plus, ChevronDown, Settings, Menu, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { http } from '../../core/api/http';
import { CustomSelect } from '../../core/components/ui/CustomSelect';
import { DateRangePicker } from '../../core/components/ui/DateRangePicker';
import './CustomerDebtPage.css';

export function CustomerDebtPage() {
  const [activeTab, setActiveTab] = useState('all');
  const [stats, setStats] = useState<any>({ all: 0, due_date: 0, overdue: 0, today: 0, next_7_days: 0, over_7_days: 0 });
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [dateRange, setDateRange] = useState<{start: Date | null, end: Date | null}>({ start: null, end: null });
  const [customerType, setCustomerType] = useState('');
  const [debtType, setDebtType] = useState('');

  const customerTypeOptions = [
    { value: 'retail', label: 'Khách lẻ' },
    { value: 'wholesale', label: 'Khách sỉ' }
  ];

  const debtTypeOptions = [
    { value: 'has_debt', label: 'Có nợ' },
    { value: 'no_debt', label: 'Không nợ' }
  ];

  const tabs = [
    { id: 'all', label: 'Tất cả', key: 'all' },
    { id: 'due_date', label: 'Hạn thanh toán', key: 'due_date' },
    { id: 'overdue', label: 'Nợ quá hạn', key: 'overdue' },
    { id: 'today', label: 'Hạn hôm nay', key: 'today' },
    { id: 'next_7_days', label: 'Hạn 7 ngày tới', key: 'next_7_days' },
    { id: 'over_7_days', label: 'Hạn trên 7 ngày', key: 'over_7_days' },
  ];

  useEffect(() => {
    http.get('/accounting/debt/customers/stats').then(res => setStats(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    http.get(`/accounting/debt/customers/summary?tab=${activeTab}&page=${page}&limit=50`)
      .then(res => {
        setItems(res.data.items || []);
        setTotal(res.data.total || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeTab, page]);

  const formatMoney = (val: number) => {
    if (!val) return '';
    return Number(val).toLocaleString('vi-VN');
  };

  const totalGhiNo = items.reduce((sum, item) => sum + (item.incurredReceivable || 0), 0);
  const totalGhiCo = items.reduce((sum, item) => sum + (item.incurredPayable || 0), 0);
  const totalNoPhaiThu = items.reduce((sum, item) => sum + (item.finalReceivable || 0), 0);
  const totalCoPhaiTra = items.reduce((sum, item) => sum + (item.finalPayable || 0), 0);

  const handleExportCSV = () => {
    const csv = [
      ['Khách hàng', 'SĐT', 'Nợ đầu kì', 'Có đầu kì', 'Ghi nợ', 'Ghi có', 'Nợ cuối kì', 'Có cuối kì'].join(','),
      ...items.map(item => [
        `"${item.code} - ${item.customerName || ''}"`,
        `"${item.phone || ''}"`,
        item.initialReceivable || 0,
        item.initialPayable || 0,
        item.incurredReceivable || 0,
        item.incurredPayable || 0,
        item.finalReceivable || 0,
        item.finalPayable || 0
      ].join(','))
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cong_no_khach_hang_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="debt-page">
      <div className="debt-tabs">
        {tabs.map(tab => (
          <div 
            key={tab.id} 
            className={`debt-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => { setActiveTab(tab.id); setPage(1); }}
          >
            {tab.label} {tab.id !== 'all' && <span className="tab-badge">{stats[tab.key] || 0}</span>}
          </div>
        ))}
      </div>

      <div className="debt-filters">
        <input className="debt-filter-input" placeholder="ID" style={{ width: 100 }} />
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <input className="debt-filter-input" placeholder="Khách hàng" style={{ width: 200 }} />
        <CustomSelect 
          options={customerTypeOptions}
          value={customerType}
          onChange={setCustomerType}
          placeholder="Loại khách hàng"
          width={180}
        />
        <CustomSelect 
          options={debtTypeOptions}
          value={debtType}
          onChange={setDebtType}
          placeholder="Công nợ"
          width={150}
        />
        <button className="btn-filter">Lọc <ChevronDown size={14} /></button>
      </div>

      <div className="debt-actions-bar">
        <div className="debt-actions-left">
          <button className="btn-outline-debt" onClick={handleExportCSV}>
            <Download size={14} /> Xuất dữ liệu
          </button>
          <button className="btn-outline-debt">
            <Plus size={14} /> Tính tổng phải thu khách hàng
          </button>
        </div>
        
        <div className="pagination-controls">
          <span>{items.length > 0 ? (page - 1) * 50 + 1 : 0} - {Math.min(page * 50, total)} / {total.toLocaleString('vi-VN')}</span>
          <button className="pagination-btn" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft size={16} /></button>
          <button className="pagination-btn" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}><ChevronLeft size={16} /></button>
          <button className="pagination-btn" disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)}><ChevronRight size={16} /></button>
          <button className="pagination-btn" disabled={page * 50 >= total} onClick={() => setPage(Math.ceil(total / 50))}><ChevronsRight size={16} /></button>
        </div>
      </div>

      <div className="debt-table-wrapper">
        <table className="debt-table">
          <thead>
            <tr>
              <th rowSpan={2}>#<br/>[1]</th>
              <th rowSpan={2} className="text-left">Khách hàng<br/>[2]</th>
              <th rowSpan={2} className="text-left">Số điện thoại<br/>[3]</th>
              <th colSpan={2} className="center">Số dư đầu kì</th>
              <th colSpan={2} className="center">Phát sinh trong kì</th>
              <th colSpan={2} className="center">Số dư cuối kì</th>
              <th rowSpan={2} style={{ width: 40 }}><Settings size={14} /></th>
            </tr>
            <tr>
              <th>Nợ [Phải thu]<br/>[4]</th>
              <th>Có [Phải trả]<br/>[5]</th>
              <th>Ghi nợ<br/>[6]</th>
              <th>Ghi có<br/>[7]</th>
              <th>Nợ [Phải thu] = 4 + 6 - 5 - 7</th>
              <th>Có [Phải trả] = 5 + 7 - 4 - 6</th>
            </tr>
          </thead>
          <tbody>
            <tr className="row-total">
              <td colSpan={3} className="text-center">Tổng</td>
              <td></td>
              <td></td>
              <td>{formatMoney(totalGhiNo)}</td>
              <td>{formatMoney(totalGhiCo)}</td>
              <td>{formatMoney(totalNoPhaiThu)}</td>
              <td>{formatMoney(totalCoPhaiTra)}</td>
              <td></td>
            </tr>
            {loading ? (
              <tr><td colSpan={10} className="text-center">Đang tải dữ liệu...</td></tr>
            ) : items.map((item, index) => (
              <tr key={item._id}>
                <td className="text-center">{(page - 1) * 50 + index + 1}</td>
                <td className="text-left text-blue">{item.code} - {item.customerName}</td>
                <td className="text-left text-blue">{item.phone}</td>
                <td>{formatMoney(item.initialReceivable)}</td>
                <td>{formatMoney(item.initialPayable)}</td>
                <td>{formatMoney(item.incurredReceivable)}</td>
                <td>{formatMoney(item.incurredPayable)}</td>
                <td>{formatMoney(item.finalReceivable)}</td>
                <td>{formatMoney(item.finalPayable)}</td>
                <td className="text-center">
                  <button className="action-menu-btn"><Menu size={14} /> <ChevronDown size={12} /></button>
                </td>
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr><td colSpan={10} className="text-center">Chưa có dữ liệu phù hợp</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
