import { useEffect, useState } from 'react';
import { Filter, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { productApi } from '../../../core/api/product.api';
import type { ICategory } from '../../../types/product.type';
import { Pagination } from '../../../core/components/Pagination';

export function CategoryList() {
  const [items, setItems] = useState<ICategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const load = async () => {
    setLoading(true);
    try {
      const res = await productApi.getCategories({ page, limit, q: search });
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
                placeholder="Tên danh mục, mã..." 
              />
            </div>
            <button type="submit" style={{ display: 'none' }}>Tìm</button>
          </form>
          <div className="quick-actions">
            <span>Thao tác nhanh</span>
            <button className="btn btn-primary full" type="button">
              <Plus size={16} /> Tạo danh mục
            </button>
          </div>
        </aside>

        <section className="data-card">
          <div className="data-card-header">
            <div>
              <h2>Danh mục</h2>
              <span className="record-badge">{total} bản ghi</span>
            </div>
            <div className="page-actions" style={{ gap: '8px', display: 'flex' }}>
              <button className="btn btn-light" type="button" onClick={load} title="Làm mới">
                <RefreshCw size={16} />
              </button>
              <button className="btn btn-primary" type="button">
                <Plus size={16} /> Thêm danh mục
              </button>
            </div>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="check-cell"><input type="checkbox" /></th>
                  <th>Mã danh mục</th>
                  <th>Tên danh mục</th>
                  <th>Hoạt động</th>
                  <th>Hiển thị</th>
                  <th>Số sản phẩm</th>
                  <th>Ngày tạo</th>
                  <th className="action-cell">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={8} className="empty-cell">Đang tải dữ liệu...</td></tr>}
                {!loading && items.length === 0 && <tr><td colSpan={8} className="empty-cell">Chưa có dữ liệu.</td></tr>}
                {!loading && items.map((item) => (
                  <tr key={item._id}>
                    <td className="check-cell"><input type="checkbox" /></td>
                    <td>{item.code || '-'}</td>
                    <td>{item.name}</td>
                    <td>
                      <span className={`status-badge ${item.isActive !== false ? 'success' : 'danger'}`}>
                        {item.isActive !== false ? 'Đang hoạt động' : 'Ngừng'}
                      </span>
                    </td>
                    <td>{item.isVisible !== false ? 'Có' : 'Không'}</td>
                    <td>{item.productCount || 0}</td>
                    <td>{new Date(item.createdAt).toLocaleDateString('vi-VN')}</td>
                    <td className="action-cell">
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
