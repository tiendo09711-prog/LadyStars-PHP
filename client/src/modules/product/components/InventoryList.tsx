import { useEffect, useState } from 'react';
import { FileDown, Filter, RefreshCw, Search } from 'lucide-react';
import { productApi } from '../../../core/api/product.api';
import type { IInventory } from '../../../types/product.type';
import { Pagination } from '../../../core/components/Pagination';

export function InventoryList() {
  const [items, setItems] = useState<IInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('');
  
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const load = async () => {
    setLoading(true);
    try {
      const res = await productApi.getInventories({ 
        page, 
        limit, 
        q: search,
        branchId: filterWarehouse || undefined
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
  }, [page, filterWarehouse]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  const formatMoney = (val?: number) => {
    return `${Number(val || 0).toLocaleString('vi-VN')} đ`;
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
                placeholder="Tên SP, mã SP..." 
              />
            </div>

            <label className="field-label" style={{ marginTop: '16px' }}>Lọc theo kho</label>
            <div className="quick-filter-list">
              <button type="button" className={!filterWarehouse ? 'active' : ''} onClick={() => setFilterWarehouse('')}>Tất cả</button>
              <button type="button" className={filterWarehouse === 'hanoi' ? 'active' : ''} onClick={() => setFilterWarehouse('hanoi')}>Kho Hà Nội</button>
              <button type="button" className={filterWarehouse === 'hcm' ? 'active' : ''} onClick={() => setFilterWarehouse('hcm')}>Kho HCM</button>
            </div>

            <button type="submit" style={{ display: 'none' }}>Tìm</button>
          </form>
        </aside>

        <section className="data-card">
          <div className="data-card-header">
            <div>
              <h2>Tồn kho chi tiết</h2>
              <span className="record-badge">{total} bản ghi</span>
            </div>
            <div className="page-actions" style={{ gap: '8px', display: 'flex' }}>
              <button className="btn btn-light" type="button" onClick={load} title="Làm mới">
                <RefreshCw size={16} /> Làm mới
              </button>
              <button className="btn btn-success" type="button">
                <FileDown size={16} /> Xuất file
              </button>
            </div>
          </div>
          
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã SP</th>
                  <th>Tên sản phẩm</th>
                  <th>Giá nhập (Vốn)</th>
                  <th>Giá bán</th>
                  <th>Kho Hà Nội</th>
                  <th>Kho HCM</th>
                  <th>Tổng tồn</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={7} className="empty-cell">Đang tải dữ liệu...</td></tr>}
                {!loading && items.length === 0 && <tr><td colSpan={7} className="empty-cell">Chưa có dữ liệu.</td></tr>}
                {!loading && items.map((item) => (
                  <tr key={item._id}>
                    <td><strong>{item.code}</strong></td>
                    <td style={{ maxWidth: '250px' }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.name}
                      </div>
                    </td>
                    <td>{formatMoney(item.cost)}</td>
                    <td>{formatMoney(item.price)}</td>
                    <td style={{ color: '#2563eb', fontWeight: 500 }}>{Number(item.stockHanoi || 0).toLocaleString('vi-VN')}</td>
                    <td style={{ color: '#ea580c', fontWeight: 500 }}>{Number(item.stockHCM || 0).toLocaleString('vi-VN')}</td>
                    <td><strong>{Number(item.totalStock || 0).toLocaleString('vi-VN')}</strong></td>
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
