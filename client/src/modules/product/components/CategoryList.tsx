import { useEffect, useState, useMemo } from 'react';
import { Filter, Plus, RefreshCw, Search, Trash2, FileDown, X } from 'lucide-react';
import { productApi } from '../../../core/api/product.api';
import type { ICategory, IInventory } from '../../../types/product.type';
import { Pagination } from '../../../core/components/Pagination';
import * as XLSX from 'xlsx';
import { ExportExcelModal, ColumnOption } from './ExportExcelModal';

export function CategoryList() {
  const [items, setItems] = useState<ICategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const [viewProductsCategory, setViewProductsCategory] = useState<ICategory | null>(null);

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

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const exportColumns: ColumnOption[] = useMemo(() => [
    { label: 'Tên danh mục', key: 'name', getValue: (item: ICategory) => item.name },
    { label: 'Mã danh mục', key: 'code', getValue: (item: ICategory) => item.code || '' },
    { label: 'Trạng thái', key: 'isActive', getValue: (item: ICategory) => item.isActive !== false ? 'Đang hoạt động' : 'Ngừng' },
    { label: 'Hiển thị', key: 'isVisible', getValue: (item: ICategory) => item.isVisible !== false ? 'Có' : 'Không' },
    { label: 'Số sản phẩm', key: 'productCount', getValue: (item: ICategory) => item.productCount || 0 },
    { label: 'Ngày tạo', key: 'createdAt', getValue: (item: ICategory) => new Date(item.createdAt).toLocaleDateString('vi-VN') },
  ], []);

  const handleExcelExport = async (
    exportType: 'current' | 'all',
    filename: string,
    sheetName: string,
    selectedCols: { key: string; customLabel: string }[]
  ) => {
    setExportLoading(true);
    try {
      let dataToExport: ICategory[] = [];
      if (exportType === 'current') {
        dataToExport = items;
      } else {
        const fetchPage = async (p: number, l: number) => {
          return await productApi.getCategories({ page: p, limit: l, q: search || undefined });
        };

        const pageSize = 100;
        const firstPage = await fetchPage(1, pageSize);
        let allItems = [...firstPage.items];
        const totalItems = firstPage.total;

        if (totalItems > pageSize) {
          const pagesToFetch = Math.ceil(totalItems / pageSize);
          const promises = [];
          for (let pageNum = 2; pageNum <= pagesToFetch; pageNum++) {
            promises.push(fetchPage(pageNum, pageSize));
          }
          const results = await Promise.all(promises);
          results.forEach(res => {
            allItems = allItems.concat(res.items);
          });
        }
        dataToExport = allItems;
      }

      const mappedData = dataToExport.map(item => {
        const row: Record<string, any> = {};
        selectedCols.forEach(col => {
          const matchingCol = exportColumns.find(c => c.key === col.key);
          row[col.customLabel] = matchingCol ? matchingCol.getValue(item) : '';
        });
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(mappedData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, `${filename}.xlsx`);
      setShowExportModal(false);
    } catch (err) {
      console.error(err);
      alert('Xuất file thất bại!');
    } finally {
      setExportLoading(false);
    }
  };

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
                <RefreshCw size={16} /> Làm mới
              </button>
              <button className="btn btn-light" style={{ borderColor: '#bbf7d0', color: '#047857' }} onClick={() => setShowExportModal(true)} title="Xuất Excel">
                <FileDown size={15} /> Xuất Excel
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
                    <td>
                      <span 
                        style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600 }}
                        onClick={() => setViewProductsCategory(item)}
                        title="Bấm để xem sản phẩm thuộc danh mục này"
                      >
                        {item.name}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${item.isActive !== false ? 'success' : 'danger'}`}>
                        {item.isActive !== false ? 'Đang hoạt động' : 'Ngừng'}
                      </span>
                    </td>
                    <td>{item.isVisible !== false ? 'Có' : 'Không'}</td>
                    <td>
                      <span 
                        style={{ cursor: 'pointer', textDecoration: 'underline', color: '#2563eb', fontWeight: 500 }}
                        onClick={() => setViewProductsCategory(item)}
                        title="Bấm để xem sản phẩm thuộc danh mục này"
                      >
                        {item.productCount || 0}
                      </span>
                    </td>
                    <td>{new Date(item.createdAt).toLocaleDateString('vi-VN')}</td>
                    <td className="action-cell">
                      <button className="mini-action" type="button" onClick={() => setViewProductsCategory(item)}>Xem sản phẩm</button>
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
      {showExportModal && (
        <ExportExcelModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          title="Xuất Excel - Danh mục sản phẩm"
          defaultFilename={`danh-muc-san-pham-${new Date().toISOString().slice(0, 10)}`}
          columns={exportColumns}
          onExport={handleExcelExport}
          loading={exportLoading}
        />
      )}
      {viewProductsCategory && (
        <CategoryProductsModal
          category={viewProductsCategory}
          onClose={() => setViewProductsCategory(null)}
        />
      )}
    </div>
  );
}

// ─── Modal xem sản phẩm thuộc danh mục ──────────────────────────────────────────
interface CategoryProductsModalProps {
  category: ICategory;
  onClose: () => void;
}

function CategoryProductsModal({ category, onClose }: CategoryProductsModalProps) {
  const [items, setItems] = useState<IInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  const load = async () => {
    setLoading(true);
    try {
      const res = await productApi.getInventories({
        page,
        limit,
        q: search || undefined,
        categoryId: category._id
      });
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [page, search]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  const formatMoney = (val?: number) => {
    return `${Number(val || 0).toLocaleString('vi-VN')} đ`;
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div 
        className="modal-card modal-card-wide" 
        onClick={e => e.stopPropagation()} 
        style={{ 
          maxHeight: '90vh', 
          overflowY: 'auto',
          maxWidth: '900px',
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)'
        }}
      >
        <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b' }}>
              Sản phẩm trong danh mục: <span style={{ color: '#3b82f6' }}>{category.name}</span>
            </h2>
            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Tổng số: <strong>{total}</strong> sản phẩm</p>
          </div>
          <button className="icon-button" onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ padding: '18px 24px' }}>
          {/* Quick Search */}
          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
            <form onSubmit={handleSearch} style={{ width: '300px' }}>
              <div className="search-box">
                <Search size={16} />
                <input 
                  value={search} 
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }} 
                  placeholder="Tìm sản phẩm trong danh mục..." 
                />
              </div>
            </form>
          </div>

          <div className="table-scroll" style={{ borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <table className="data-table">
              <thead style={{ background: '#f1f5f9' }}>
                <tr>
                  <th style={{ color: '#475569', fontWeight: 600 }}>Mã SP</th>
                  <th style={{ color: '#475569', fontWeight: 600 }}>Tên sản phẩm</th>
                  <th style={{ color: '#475569', fontWeight: 600 }}>Giá nhập</th>
                  <th style={{ color: '#475569', fontWeight: 600 }}>Giá bán</th>
                  <th style={{ color: '#475569', fontWeight: 600 }}>Kho Hà Nội</th>
                  <th style={{ color: '#475569', fontWeight: 600 }}>Kho HCM</th>
                  <th style={{ color: '#475569', fontWeight: 600 }}>Tổng tồn</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={7} className="empty-cell">Đang tải dữ liệu...</td></tr>}
                {!loading && items.length === 0 && <tr><td colSpan={7} className="empty-cell">Không có sản phẩm nào thuộc danh mục này.</td></tr>}
                {!loading && items.map((item) => (
                  <tr key={item._id}>
                    <td><strong style={{ color: '#475569' }}>{item.code}</strong></td>
                    <td style={{ maxWidth: '280px' }}>
                      <div style={{ fontWeight: 500, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.name}>
                        {item.name}
                      </div>
                    </td>
                    <td style={{ color: '#dc2626' }}>{formatMoney(item.cost)}</td>
                    <td style={{ color: '#16a34a', fontWeight: 500 }}>{formatMoney(item.price)}</td>
                    <td style={{ color: '#2563eb', fontWeight: 500 }}>{Number(item.stockHanoi || 0).toLocaleString('vi-VN')}</td>
                    <td style={{ color: '#ea580c', fontWeight: 500 }}>{Number(item.stockHCM || 0).toLocaleString('vi-VN')}</td>
                    <td><strong style={{ color: '#0f172a' }}>{Number(item.totalStock || 0).toLocaleString('vi-VN')}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div style={{ marginTop: '16px' }}>
            <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
          </div>
        </div>

        <div className="modal-footer" style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
          <button className="btn btn-light" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}
