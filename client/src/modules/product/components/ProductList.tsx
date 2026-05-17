import { useEffect, useState } from 'react';
import { FileDown, FileUp, Filter, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { productApi } from '../../../core/api/product.api';
import type { IProduct } from '../../../types/product.type';
import { Pagination } from '../../../core/components/Pagination';

export function ProductList() {
  const [items, setItems] = useState<IProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const load = async () => {
    setLoading(true);
    try {
      const res = await productApi.getProducts({ 
        page, 
        limit, 
        q: search,
        categoryName: filterCategory || undefined,
        status: filterStatus || undefined
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
  }, [page, filterCategory, filterStatus]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  const formatMoney = (val?: number) => {
    return `${Number(val || 0).toLocaleString('vi-VN')} đ`;
  };

  const statusClass = (status?: string) => {
    const s = String(status || '').toLowerCase();
    if (['mới', 'active', 'đang giao'].includes(s)) return 'success';
    if (['ngừng', 'inactive', 'lỗi'].includes(s)) return 'danger';
    return 'warning';
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
                placeholder="Tên SP, mã, barcode..." 
              />
            </div>

            <label className="field-label" style={{ marginTop: '16px' }}>Trạng thái</label>
            <div className="quick-filter-list">
              <button type="button" className={!filterStatus ? 'active' : ''} onClick={() => setFilterStatus('')}>Tất cả</button>
              <button type="button" className={filterStatus === 'Mới' ? 'active' : ''} onClick={() => setFilterStatus('Mới')}>Mới</button>
              <button type="button" className={filterStatus === 'Đang giao' ? 'active' : ''} onClick={() => setFilterStatus('Đang giao')}>Đang giao</button>
              <button type="button" className={filterStatus === 'Ngừng' ? 'active' : ''} onClick={() => setFilterStatus('Ngừng')}>Ngừng</button>
            </div>

            <button type="submit" style={{ display: 'none' }}>Tìm</button>
          </form>

          <div className="quick-actions">
            <span>Thao tác nhanh</span>
            <button className="btn btn-primary full" type="button">
              <Plus size={16} /> Tạo sản phẩm
            </button>
          </div>
        </aside>

        <section className="data-card">
          <div className="data-card-header">
            <div>
              <h2>Sản phẩm</h2>
              <span className="record-badge">{total} bản ghi</span>
            </div>
            <div className="page-actions" style={{ gap: '8px', display: 'flex' }}>
              <button className="btn btn-light" type="button" onClick={load} title="Làm mới">
                <RefreshCw size={16} /> Làm mới
              </button>
              <button className="btn btn-outline" type="button">
                <FileUp size={16} /> Import File
              </button>
              <button className="btn btn-success" type="button">
                <FileDown size={16} /> Xuất Excel
              </button>
              <button className="btn btn-primary" type="button">
                <Plus size={16} /> Thêm sản phẩm
              </button>
            </div>
          </div>
          
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="check-cell"><input type="checkbox" /></th>
                  <th>Mã SP</th>
                  <th>Tên sản phẩm</th>
                  <th>ĐVT</th>
                  <th>Giá nhập (Vốn)</th>
                  <th>Giá bán</th>
                  <th>Tổng tồn</th>
                  <th>Trạng thái</th>
                  <th className="action-cell">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={9} className="empty-cell">Đang tải dữ liệu...</td></tr>}
                {!loading && items.length === 0 && <tr><td colSpan={9} className="empty-cell">Chưa có dữ liệu.</td></tr>}
                {!loading && items.map((item) => (
                  <tr key={item._id}>
                    <td className="check-cell"><input type="checkbox" /></td>
                    <td><strong>{item.code}</strong></td>
                    <td style={{ maxWidth: '250px' }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.name}
                      </div>
                      {item.categoryName && <small style={{ color: '#666' }}>{item.categoryName}</small>}
                    </td>
                    <td>{item.unit || '-'}</td>
                    <td>{formatMoney(item.cost)}</td>
                    <td>{formatMoney(item.price)}</td>
                    <td>{Number(item.qty || 0).toLocaleString('vi-VN')}</td>
                    <td>
                      <span className={`status-badge ${statusClass(item.status)}`}>
                        {item.status || 'Mới'}
                      </span>
                    </td>
                    <td className="action-cell">
                      <button className="mini-action" type="button">Chi tiết</button>
                      <button className="mini-action" type="button">Sửa</button>
                      <button className="icon-button danger" type="button"><Trash2 size={16} /></button>
                    </td>
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
