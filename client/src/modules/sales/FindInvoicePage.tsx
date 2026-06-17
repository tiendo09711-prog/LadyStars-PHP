import { useState, useEffect } from 'react';
import { Search, RotateCcw, FileDown, Calendar, User, Phone, ShoppingCart, FileText, AlertCircle } from 'lucide-react';
import { http } from '../../core/api/http';

type ProductDetail = {
  _id: string;
  name: string;
  code: string;
  price: number;
};

type SaleItem = {
  productId: ProductDetail | null;
  amount: number;
  total: number;
};

type CustomerDetail = {
  _id: string;
  name: string;
  phone: string;
  code: string;
};

type AuthorDetail = {
  _id: string;
  name: string;
  username: string;
};

type Invoice = {
  _id: string;
  code: string;
  customerId: CustomerDetail | null;
  authorId: AuthorDetail | null;
  userId: AuthorDetail | null;
  items: SaleItem[];
  value: number;
  status: string;
  note: string;
  createdAt: string;
};

export function FindInvoicePage({ channel = 'store' }: { channel?: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filters State
  const [invoiceCode, setInvoiceCode] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const loadInvoices = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (invoiceCode.trim()) params.append('code', invoiceCode.trim());
      if (customerPhone.trim()) params.append('customerPhone', customerPhone.trim());
      if (fromDate) params.append('fromDate', fromDate);
      if (toDate) params.append('toDate', toDate);
      if (channel) params.append('channel', channel);
      
      const response = await http.get(`/products/sales?${params.toString()}`);
      setInvoices(response.data.items ?? []);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || 'Không thể tải dữ liệu hóa đơn.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadInvoices();
  };

  const handleReset = () => {
    setInvoiceCode('');
    setCustomerPhone('');
    setFromDate('');
    setToDate('');
    // Trigger reloading with empty params
    setTimeout(() => {
      setLoading(true);
      http.get('/products/sales')
        .then(res => setInvoices(res.data.items ?? []))
        .catch(err => setError('Không thể tải dữ liệu hóa đơn.'))
        .finally(() => setLoading(false));
    }, 50);
  };

  const exportCsv = () => {
    if (invoices.length === 0) {
      alert('Không có dữ liệu để xuất.');
      return;
    }
    const headers = ['Mã hóa đơn', 'Người tạo', 'Khách hàng', 'SĐT Khách hàng', 'Sản phẩm', 'Tổng tiền', 'Ngày tạo', 'Ghi chú'];
    const rows = invoices.map(item => {
      const creator = item.authorId?.name || item.userId?.name || 'Hệ thống';
      const customerName = item.customerId?.name || 'Khách vãng lai';
      const phone = item.customerId?.phone || '';
      const products = item.items?.map(it => `${it.productId?.name || 'Sản phẩm'} (x${it.amount})`).join('; ') || '';
      const amount = item.value || 0;
      const date = new Date(item.createdAt).toLocaleString('vi-VN');
      const note = item.note || '';

      return [
        `"${item.code}"`,
        `"${creator.replace(/"/g, '""')}"`,
        `"${customerName.replace(/"/g, '""')}"`,
        `"${phone}"`,
        `"${products.replace(/"/g, '""')}"`,
        amount,
        `"${date}"`,
        `"${note.replace(/"/g, '""')}"`
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `tim-hoa-don-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const statusClass = (status: string) => {
    const s = String(status).toLowerCase();
    if (['completed', 'success', 'paid'].includes(s)) return 'success';
    if (['draft', 'pending', 'wait'].includes(s)) return 'warning';
    if (['cancelled', 'cancel', 'refunded'].includes(s)) return 'danger';
    return 'primary';
  };

  const formatStatus = (status: string) => {
    const s = String(status).toLowerCase();
    if (s === 'completed') return 'Hoàn thành';
    if (s === 'draft') return 'Nháp';
    if (s === 'pending') return 'Chờ thanh toán';
    if (s === 'cancelled') return 'Đã hủy';
    if (s === 'refunded') return 'Đã trả hàng';
    return status;
  };

  return (
    <div className="page-stack">
      {/* Title block */}
      <div className="page-heading">
        <div className="page-title-block">
          <div className="page-icon">
            <Search size={22} />
          </div>
          <div>
            <h1>Tìm hóa đơn — Cửa hàng</h1>
            <p>Tra cứu hóa đơn bán lẻ và bán sỉ qua kênh Cửa hàng</p>
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-light" type="button" onClick={loadInvoices} title="Làm mới">
            <RotateCcw size={16} /> Làm mới
          </button>
          <button className="btn btn-success" type="button" onClick={exportCsv} title="Xuất CSV">
            <FileDown size={16} /> Xuất Excel/CSV
          </button>
        </div>
      </div>

      {/* Grid: Filters (Left) & Data Table (Right) */}
      <div className="module-grid">
        {/* Filter Panel */}
        <aside className="filter-panel">
          <div className="panel-title">
            <Search size={18} />
            <span>Bộ lọc hóa đơn</span>
          </div>

          <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>ID Hóa đơn</label>
              <div className="search-box">
                <FileText size={16} style={{ color: 'var(--muted)' }} />
                <input 
                  type="text" 
                  value={invoiceCode} 
                  onChange={(e) => setInvoiceCode(e.target.value)} 
                  placeholder="Mã hóa đơn (ví dụ: BH...)" 
                />
              </div>
            </div>

            <div>
              <label className="field-label" style={{ marginTop: 0 }}>SĐT Khách hàng</label>
              <div className="search-box">
                <Phone size={16} style={{ color: 'var(--muted)' }} />
                <input 
                  type="text" 
                  value={customerPhone} 
                  onChange={(e) => setCustomerPhone(e.target.value)} 
                  placeholder="Nhập số điện thoại..." 
                />
              </div>
            </div>

            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Từ ngày</label>
              <div className="search-box">
                <Calendar size={16} style={{ color: 'var(--muted)' }} />
                <input 
                  type="date" 
                  value={fromDate} 
                  onChange={(e) => setFromDate(e.target.value)} 
                />
              </div>
            </div>

            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Đến ngày</label>
              <div className="search-box">
                <Calendar size={16} style={{ color: 'var(--muted)' }} />
                <input 
                  type="date" 
                  value={toDate} 
                  onChange={(e) => setToDate(e.target.value)} 
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <button className="btn btn-primary" type="submit" style={{ flex: 1, justifyContent: 'center' }}>
                Tìm kiếm
              </button>
              <button 
                className="btn btn-light" 
                type="button" 
                onClick={handleReset} 
                title="Làm mới bộ lọc"
                style={{ padding: '0 12px' }}
              >
                <RotateCcw size={16} />
              </button>
            </div>
          </form>
        </aside>

        {/* Data Card */}
        <section className="data-card">
          <div className="data-card-header">
            <div>
              <h2>Danh sách hóa đơn tìm thấy</h2>
              <span className="record-badge">{invoices.length} hóa đơn</span>
            </div>
            {error && <span className="error-chip"><AlertCircle size={14} style={{ marginRight: 4, display: 'inline' }} /> {error}</span>}
          </div>

          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="check-cell"><input type="checkbox" aria-label="Chọn tất cả" /></th>
                  <th>Mã hóa đơn</th>
                  <th>Ngày tạo</th>
                  <th>Người tạo</th>
                  <th>Khách hàng</th>
                  <th>Sản phẩm</th>
                  <th>Tổng tiền</th>
                  <th>Trạng thái</th>
                  <th>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={9} className="empty-cell">Đang tìm kiếm hóa đơn...</td>
                  </tr>
                )}
                {!loading && invoices.length === 0 && (
                  <tr>
                    <td colSpan={9} className="empty-cell">Không tìm thấy hóa đơn nào khớp với bộ lọc.</td>
                  </tr>
                )}
                {!loading && invoices.map((item) => {
                  const creator = item.authorId?.name || item.userId?.name || 'Hệ thống';
                  const customerName = item.customerId?.name || 'Khách vãng lai';
                  const customerPhone = item.customerId?.phone;

                  return (
                    <tr key={item._id}>
                      <td className="check-cell">
                        <input type="checkbox" aria-label={`Chọn ${item.code}`} />
                      </td>
                      <td style={{ fontWeight: 800, color: 'var(--primary)' }}>
                        {item.code}
                      </td>
                      <td>
                        <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
                          {new Date(item.createdAt).toLocaleString('vi-VN')}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <User size={14} style={{ color: 'var(--muted)' }} />
                          <span>{creator}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <strong style={{ fontSize: '13.5px' }}>{customerName}</strong>
                          {customerPhone && (
                            <span style={{ fontSize: '12px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                              <Phone size={10} /> {customerPhone}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'normal', maxWidth: '300px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {item.items?.map((it, idx) => (
                            <div 
                              key={idx} 
                              style={{ 
                                display: 'flex', 
                                justifyContent: 'space-between',
                                background: '#f8fafc',
                                padding: '4px 8px',
                                borderRadius: '6px',
                                fontSize: '12.5px',
                                border: '1px solid var(--border-soft)'
                              }}
                            >
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                                {it.productId?.name || 'Sản phẩm đã xóa'}
                              </span>
                              <strong style={{ color: 'var(--muted)' }}>x{it.amount}</strong>
                            </div>
                          ))}
                          {(!item.items || item.items.length === 0) && (
                            <span style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: '12px' }}>Không có sản phẩm</span>
                          )}
                        </div>
                      </td>
                      <td style={{ fontWeight: 800, color: '#0f172a' }}>
                        {(item.value || 0).toLocaleString('vi-VN')} đ
                      </td>
                      <td>
                        <span className={`status-badge ${statusClass(item.status)}`}>
                          {formatStatus(item.status)}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'normal', maxWidth: '150px', fontSize: '13px', color: 'var(--muted)' }}>
                        {item.note || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
