import { useState, useEffect } from 'react';
import { Download, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { http } from '../../core/api/http';
import { CustomSelect } from '../../core/components/ui/CustomSelect';
import { DateRangePicker } from '../../core/components/ui/DateRangePicker';
import './StaffDebtPage.css';

export function StaffDebtPage() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  
  // Filter states
  const [warehouse, setWarehouse] = useState('');
  const [dateRange, setDateRange] = useState<{start: Date | null, end: Date | null}>({ start: null, end: null });
  
  const warehouseOptions = [
    { value: 'hn', label: 'Kho Hà Nội' },
    { value: 'hcm', label: 'Kho HCM' }
  ];

  useEffect(() => {
    setLoading(true);
    http.get(`/accounting/debt/staff/summary?page=${page}&limit=50`)
      .then(res => {
        setItems(res.data.items || []);
        setTotal(res.data.total || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [page]);

  const formatMoney = (val: number) => {
    if (!val) return '';
    return Number(val).toLocaleString('vi-VN');
  };

  return (
    <div className="staff-debt-page">
      <div className="staff-debt-filters">
        <CustomSelect 
          options={warehouseOptions} 
          value={warehouse} 
          onChange={setWarehouse} 
          placeholder="Kho hàng" 
          width={180} 
        />
        <input className="staff-filter-input" placeholder="ID Hóa đơn" style={{ width: 150 }} />
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <input className="staff-filter-input" placeholder="Hạn thanh toán" style={{ width: 180 }} />
        <input className="staff-filter-input" placeholder="NV Bán hàng" style={{ width: 180 }} />
        <button className="btn-filter-staff">Lọc</button>
      </div>

      <div className="staff-actions-bar">
        <button className="btn-outline-staff">
          <Download size={14} /> Xuất dữ liệu
        </button>
        
        <div className="staff-pagination">
          <span>{items.length > 0 ? (page - 1) * 50 + 1 : 0} - {Math.min(page * 50, total)} / {total.toLocaleString('vi-VN')}</span>
          <button className="pagination-btn" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft size={16} /></button>
          <button className="pagination-btn" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}><ChevronLeft size={16} /></button>
          <button className="pagination-btn" disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)}><ChevronRight size={16} /></button>
          <button className="pagination-btn" disabled={page * 50 >= total} onClick={() => setPage(Math.ceil(total / 50))}><ChevronsRight size={16} /></button>
        </div>
      </div>

      <div className="staff-table-wrapper">
        <table className="staff-table">
          <thead>
            <tr>
              <th style={{ width: 50 }}>#</th>
              <th style={{ textAlign: 'left' }}>Nhân viên bán hàng</th>
              <th>Đã thu (Bán lẻ, Bán sỉ)</th>
              <th>Đã thu (Đơn hàng)</th>
              <th>Còn nợ</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: 30, color: '#64748b' }}>Đang tải dữ liệu...</td></tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 40, background: '#fff5f5', color: '#c53030', border: '1px solid #fed7d7' }}>
                  Không tìm thấy dữ liệu
                </td>
              </tr>
            ) : (
              items.map((item, index) => (
                <tr key={item._id}>
                  <td>{(page - 1) * 50 + index + 1}</td>
                  <td>{item.staffName}</td>
                  <td style={{ color: '#0ea5e9' }}>{formatMoney(item.collectedRetail)}</td>
                  <td style={{ color: '#0ea5e9' }}>{formatMoney(item.collectedOrders)}</td>
                  <td style={{ color: '#0ea5e9' }}>{formatMoney(item.remainingDebt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
