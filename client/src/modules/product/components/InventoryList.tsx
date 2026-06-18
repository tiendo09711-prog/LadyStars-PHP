import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, FileDown, RefreshCw, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Pagination } from '../../../core/components/Pagination';
import { productApi } from '../../../core/api/product.api';
import type { IInventory } from '../../../types/product.type';
import { ColumnOption, ExportExcelModal } from './ExportExcelModal';

export function InventoryList() {
  const [items, setItems] = useState<IInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [sortField, setSortField] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

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
        order: sortOrder,
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

  const exportColumns: ColumnOption[] = useMemo(
    () => [
      { label: 'Mã SP', key: 'code', getValue: (item: IInventory) => item.code },
      { label: 'Tên sản phẩm', key: 'name', getValue: (item: IInventory) => item.name },
      { label: 'Giá nhập (Vốn)', key: 'cost', getValue: (item: IInventory) => item.cost ?? 0 },
      { label: 'Giá bán', key: 'price', getValue: (item: IInventory) => item.price ?? 0 },
      { label: 'Kho Hà Nội', key: 'stockHanoi', getValue: (item: IInventory) => item.stockHanoi ?? 0 },
      { label: 'Kho HCM', key: 'stockHCM', getValue: (item: IInventory) => item.stockHCM ?? 0 },
      { label: 'Tổng tồn', key: 'totalStock', getValue: (item: IInventory) => item.totalStock ?? 0 },
    ],
    [],
  );

  const handleExcelExport = async (
    exportType: 'current' | 'all',
    filename: string,
    sheetName: string,
    selectedCols: { key: string; customLabel: string }[],
  ) => {
    setExportLoading(true);
    try {
      let dataToExport: IInventory[] = [];
      if (exportType === 'current') {
        dataToExport = items;
      } else {
        const fetchPage = async (nextPage: number, nextLimit: number) =>
          productApi.getInventories({
            page: nextPage,
            limit: nextLimit,
            q: search || undefined,
            branchId: filterWarehouse || undefined,
            sort: sortField,
            order: sortOrder,
          });

        const pageSize = 100;
        const firstPage = await fetchPage(1, pageSize);
        let allItems = [...firstPage.items];
        const totalItems = firstPage.total;

        if (totalItems > pageSize) {
          const pagesToFetch = Math.ceil(totalItems / pageSize);
          const promises = [];
          for (let pageNum = 2; pageNum <= pagesToFetch; pageNum += 1) {
            promises.push(fetchPage(pageNum, pageSize));
          }
          const results = await Promise.all(promises);
          results.forEach((res) => {
            allItems = allItems.concat(res.items);
          });
        }
        dataToExport = allItems;
      }

      const mappedData = dataToExport.map((item) => {
        const row: Record<string, unknown> = {};
        selectedCols.forEach((col) => {
          const matchingCol = exportColumns.find((column) => column.key === col.key);
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

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const formatMoney = (val?: number) => `${Number(val || 0).toLocaleString('vi-VN')} đ`;

  const warehouseFilterLabel =
    filterWarehouse === 'hanoi' ? 'Kho Hà Nội' : filterWarehouse === 'hcm' ? 'Kho HCM' : 'Tất cả kho';

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown size={13} style={{ opacity: 0.32 }} />;
    return sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />;
  };

  const thStyle = { cursor: 'pointer', userSelect: 'none' as const };
  const thInner = { display: 'flex', alignItems: 'center', gap: '6px' };

  return (
    <div className="page-stack inventory-page-shell">
      <section className="data-card inventory-toolbar-card">
        <div className="inventory-toolbar-top">
          <div className="inventory-hero-copy">
            <span className="inventory-hero-eyebrow">Inventory Overview</span>
            <h2>Tồn kho theo kho hàng</h2>
            <p>Giữ nguyên dữ liệu và API hiện tại, tập trung hiển thị rõ số lượng tồn và thao tác lọc nhanh hơn.</p>
          </div>
          <div className="inventory-hero-stats">
            <div className="inventory-hero-stat">
              <span className="inventory-hero-stat-label">Bộ lọc hiện tại</span>
              <strong>{warehouseFilterLabel}</strong>
            </div>
            <div className="inventory-hero-stat">
              <span className="inventory-hero-stat-label">Tổng bản ghi</span>
              <strong>{total.toLocaleString('vi-VN')}</strong>
            </div>
          </div>
        </div>

        <form className="inventory-filter-bar" onSubmit={handleSearch}>
          <div className="inventory-filter-field inventory-filter-field-search">
            <label className="inventory-filter-label">Tìm kiếm sản phẩm</label>
            <div className="search-box inventory-search-box">
              <Search size={16} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tên SP, mã SP..." />
            </div>
          </div>

          <div className="inventory-filter-field">
            <label className="inventory-filter-label">Kho hiển thị</label>
            <select
              className="form-control inventory-select"
              value={filterWarehouse}
              onChange={(e) => {
                setFilterWarehouse(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Tất cả kho</option>
              <option value="hanoi">Kho Hà Nội</option>
              <option value="hcm">Kho HCM</option>
            </select>
          </div>

          <div className="inventory-filter-actions">
            <button className="btn inventory-btn inventory-btn-primary" type="submit">
              <span className="inventory-btn-glow" />
              <span>Lọc</span>
            </button>
            <button className="btn inventory-btn inventory-btn-secondary" type="button" onClick={load} title="Làm mới">
              <RefreshCw size={16} />
              <span>Làm mới</span>
            </button>
            <button className="btn inventory-btn inventory-btn-accent" type="button" onClick={() => setShowExportModal(true)}>
              <FileDown size={16} />
              <span>Xuất Excel</span>
            </button>
          </div>
        </form>

        <div className="inventory-quick-row">
          <div className="quick-filter-list inventory-quick-filter-list">
            <button
              type="button"
              className={!filterWarehouse ? 'active' : ''}
              onClick={() => {
                setFilterWarehouse('');
                setPage(1);
              }}
            >
              Tất cả
            </button>
            <button
              type="button"
              className={filterWarehouse === 'hanoi' ? 'active' : ''}
              onClick={() => {
                setFilterWarehouse('hanoi');
                setPage(1);
              }}
            >
              Kho Hà Nội
            </button>
            <button
              type="button"
              className={filterWarehouse === 'hcm' ? 'active' : ''}
              onClick={() => {
                setFilterWarehouse('hcm');
                setPage(1);
              }}
            >
              Kho HCM
            </button>
          </div>

          <div className="inventory-quick-summary">
            <span className="inventory-summary-pill">{warehouseFilterLabel}</span>
            <span className="record-badge">{total} bản ghi</span>
          </div>
        </div>
      </section>

      <section className="data-card inventory-table-card">
        <div className="data-card-header inventory-table-header">
          <div>
            <h2>Tồn kho chi tiết</h2>
            <p className="inventory-table-subtitle">
              Bảng chỉ còn chế độ xem, ưu tiên khả năng đọc nhanh, canh cột gọn và tương phản rõ hơn ở các ô số lượng.
            </p>
          </div>
        </div>

        <div className="table-scroll inventory-table-scroll">
          <table className="data-table inventory-data-table">
            <thead>
              <tr>
                <th style={thStyle} onClick={() => handleSort('code')}>
                  <div style={thInner}>
                    <SortIcon field="code" />
                    Mã SP
                  </div>
                </th>
                <th style={thStyle} onClick={() => handleSort('name')}>
                  <div style={thInner}>
                    <SortIcon field="name" />
                    Sản phẩm
                  </div>
                </th>
                <th style={thStyle} onClick={() => handleSort('cost')}>
                  <div style={thInner}>
                    <SortIcon field="cost" />
                    Giá nhập
                  </div>
                </th>
                <th style={thStyle} onClick={() => handleSort('price')}>
                  <div style={thInner}>
                    <SortIcon field="price" />
                    Giá bán
                  </div>
                </th>
                <th style={thStyle} onClick={() => handleSort('stockHanoi')}>
                  <div style={thInner}>
                    <SortIcon field="stockHanoi" />
                    Kho Hà Nội
                  </div>
                </th>
                <th style={thStyle} onClick={() => handleSort('stockHCM')}>
                  <div style={thInner}>
                    <SortIcon field="stockHCM" />
                    Kho HCM
                  </div>
                </th>
                <th style={thStyle} onClick={() => handleSort('totalStock')}>
                  <div style={thInner}>
                    <SortIcon field="totalStock" />
                    Tổng tồn
                  </div>
                </th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              )}

              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    Chưa có dữ liệu.
                  </td>
                </tr>
              )}

              {!loading &&
                items.map((item) => (
                  <tr key={item._id}>
                    <td className="inventory-code-cell">
                      <strong>{item.code}</strong>
                    </td>
                    <td className="inventory-product-cell">
                      <div className="inventory-product-name" title={item.name}>
                        {item.name}
                      </div>
                      <small>{item.code}</small>
                    </td>
                    <td className="inventory-money-cell">{formatMoney(item.cost)}</td>
                    <td className="inventory-money-cell">{formatMoney(item.price)}</td>
                    <td className="inventory-number-cell inventory-number-hanoi">
                      <span>{Number(item.stockHanoi || 0).toLocaleString('vi-VN')}</span>
                    </td>
                    <td className="inventory-number-cell inventory-number-hcm">
                      <span>{Number(item.stockHCM || 0).toLocaleString('vi-VN')}</span>
                    </td>
                    <td className="inventory-number-cell inventory-number-total">
                      <strong>{Number(item.totalStock || 0).toLocaleString('vi-VN')}</strong>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="inventory-table-footer">
          <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
        </div>
      </section>

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
