import { useEffect, useState } from 'react';
import { Filter, RefreshCw, Search } from 'lucide-react';
import { productApi } from '../../../core/api/product.api';
import type { IProductHistory } from '../../../types/product.type';
import { Pagination } from '../../../core/components/Pagination';

export function ProductHistory() {
  const [items, setItems] = useState<IProductHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const load = async () => {
    setLoading(true);
    try {
      const res = await productApi.getProductLogs({ 
        page, 
        limit, 
        q: search 
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  return (
    <div className="page-stack">
      <div className="module-grid">
        <aside className="filter-panel">
          <div className="panel-title">
            <Filter size={18} />
            <span>Bộ lọc</span>
          </div>
          
          <form onSubmit={handleSearch}>
            <label className="field-label">Tìm kiếm</label>
            <div className="search-box">
              <Search size={16} />
              <input 
                value={search} 
                onChange={(e) => setSearch(e.target.value)} 
                placeholder="Mã SP, tên SP, người thao tác..." 
              />
            </div>
            <button type="submit" style={{ display: 'none' }}>Tìm</button>
          </form>
        </aside>

        <section className="data-card">
          <div className="data-card-header">
            <div>
              <h2>Lịch sử sửa/xóa</h2>
              <span className="record-badge">{total} bản ghi</span>
            </div>
            <div className="page-actions" style={{ gap: '8px', display: 'flex' }}>
              <button className="btn btn-light" type="button" onClick={load} title="Làm mới">
                <RefreshCw size={16} /> Làm mới
              </button>
            </div>
          </div>
          
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã SP</th>
                  <th>Tên sản phẩm</th>
                  <th>Loại log</th>
                  <th>Kiểu log</th>
                  <th>Người thao tác</th>
                  <th>Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={6} className="empty-cell">Đang tải dữ liệu...</td></tr>}
                {!loading && items.length === 0 && <tr><td colSpan={6} className="empty-cell">Chưa có dữ liệu lịch sử.</td></tr>}
                {!loading && items.map((item) => (
                  <tr key={item._id}>
                    <td><strong>{item.productCode || '-'}</strong></td>
                    <td style={{ maxWidth: '250px' }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.productName || '-'}
                      </div>
                    </td>
                    <td><span className="status-badge warning">{item.logType || 'Hệ thống'}</span></td>
                    <td>{item.logAction || '-'}</td>
                    <td>{item.createdBy || '-'}</td>
                    <td>{new Date(item.createdAt).toLocaleString('vi-VN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
        </section>
      </div>
    </div>
  );
}
