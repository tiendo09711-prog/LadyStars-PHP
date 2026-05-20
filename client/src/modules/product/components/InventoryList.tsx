import { useEffect, useState, useMemo } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, FileDown, Filter, RefreshCw, Search } from 'lucide-react';
import { productApi } from '../../../core/api/product.api';
import type { IInventory } from '../../../types/product.type';
import { Pagination } from '../../../core/components/Pagination';
import * as XLSX from 'xlsx';
import { ExportExcelModal, ColumnOption } from './ExportExcelModal';
 
export function InventoryList() {
  const [items, setItems] = useState<IInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('');
  
  const [sortField, setSortField] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;
 
  const load = async () => {
    setLoading(true);
    try {
      const res = await productApi.getInventories({ 
        page, 
        limit, 
        q: search || undefined,
        branchId: filterWarehouse || undefined,
        sort: sortField,
        order: sortOrder
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
  }, [page, filterWarehouse, sortField, sortOrder]);

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const exportColumns: ColumnOption[] = useMemo(() => [
    { label: 'Mã SP', key: 'code', getValue: (item: IInventory) => item.code },
    { label: 'Tên sản phẩm', key: 'name', getValue: (item: IInventory) => item.name },
    { label: 'Giá nhập (Vốn)', key: 'cost', getValue: (item: IInventory) => item.cost ?? 0 },
    { label: 'Giá bán', key: 'price', getValue: (item: IInventory) => item.price ?? 0 },
    { label: 'Kho Hà Nội', key: 'stockHanoi', getValue: (item: IInventory) => item.stockHanoi ?? 0 },
    { label: 'Kho HCM', key: 'stockHCM', getValue: (item: IInventory) => item.stockHCM ?? 0 },
    { label: 'Tổng tồn', key: 'totalStock', getValue: (item: IInventory) => item.totalStock ?? 0 },
  ], []);

  const handleExcelExport = async (
    exportType: 'current' | 'all',
    filename: string,
    sheetName: string,
    selectedCols: { key: string; customLabel: string }[]
  ) => {
    setExportLoading(true);
    try {
      let dataToExport: IInventory[] = [];
      if (exportType === 'current') {
        dataToExport = items;
      } else {
        const fetchPage = async (p: number, l: number) => {
          return await productApi.getInventories({
            page: p,
            limit: l,
            q: search || undefined,
            branchId: filterWarehouse || undefined,
            sort: sortField,
            order: sortOrder,
          });
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

  const formatMoney = (val?: number) => {
    return `${Number(val || 0).toLocaleString('vi-VN')} đ`;
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown size={13} style={{ opacity: 0.3 }} />;
    return sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />;
  };

  const thStyle = { cursor: 'pointer', userSelect: 'none' as const };
  const thInner = { display: 'flex', alignItems: 'center', gap: '4px' };

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
              <button type="button" className={!filterWarehouse ? 'active' : ''} onClick={() => { setFilterWarehouse(''); setPage(1); }}>Tất cả</button>
              <button type="button" className={filterWarehouse === 'hanoi' ? 'active' : ''} onClick={() => { setFilterWarehouse('hanoi'); setPage(1); }}>Kho Hà Nội</button>
              <button type="button" className={filterWarehouse === 'hcm' ? 'active' : ''} onClick={() => { setFilterWarehouse('hcm'); setPage(1); }}>Kho HCM</button>
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
              <button className="btn btn-success" type="button" onClick={() => setShowExportModal(true)}>
                <FileDown size={16} /> Xuất Excel
              </button>
            </div>
          </div>
          
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={thStyle} onClick={() => handleSort('code')}><div style={thInner}><SortIcon field="code" />Mã SP</div></th>
                  <th style={thStyle} onClick={() => handleSort('name')}><div style={thInner}><SortIcon field="name" />Tên sản phẩm</div></th>
                  <th style={thStyle} onClick={() => handleSort('cost')}><div style={thInner}><SortIcon field="cost" />Giá nhập (Vốn)</div></th>
                  <th style={thStyle} onClick={() => handleSort('price')}><div style={thInner}><SortIcon field="price" />Giá bán</div></th>
                  <th style={thStyle} onClick={() => handleSort('stockHanoi')}><div style={thInner}><SortIcon field="stockHanoi" />Kho Hà Nội</div></th>
                  <th style={thStyle} onClick={() => handleSort('stockHCM')}><div style={thInner}><SortIcon field="stockHCM" />Kho HCM</div></th>
                  <th style={thStyle} onClick={() => handleSort('totalStock')}><div style={thInner}><SortIcon field="totalStock" />Tổng tồn</div></th>
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
      {showExportModal && (
        <ExportExcelModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          title="Xuất Excel - Tồn kho chi tiết"
          defaultFilename={`ton-kho-chi-tiet-${new Date().toISOString().slice(0, 10)}`}
          columns={exportColumns}
          onExport={handleExcelExport}
          loading={exportLoading}
        />
      )}
    </div>
  );
}
