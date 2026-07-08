import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProductScanTarget } from '../../../core/hooks/productScanner';
import { ArrowDown, ArrowUp, ArrowUpDown, FileDown, RefreshCw, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Pagination } from '../../../core/components/Pagination';
import { productApi } from '../../../core/api/product.api';
import { listBranches } from '../../../core/api/branch.api';
import type { BranchRecord } from '../../../core/api/branch.api';
import type { IInventory } from '../../../types/product.type';
import { ColumnOption, ExportExcelModal } from './ExportExcelModal';
import { getInventoryBranchStock } from './inventoryStock';

export function InventoryList() {
  const navigate = useNavigate();
  const [items, setItems] = useState<IInventory[]>([]);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [branchesError, setBranchesError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [filterStockStatus, setFilterStockStatus] = useState('');
  const [sortField, setSortField] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalStockQuantity, setTotalStockQuantity] = useState(0);
  const [totalInventoryValue, setTotalInventoryValue] = useState(0);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const limit = 15;

  // Branches load riêng, có error state rõ ràng (không nuốt lỗi)
  useEffect(() => {
    setBranchesLoading(true);
    setBranchesError(null);
    listBranches({ page: 1, limit: 200 })
      .then(data => {
        setBranches((data.items || []).filter(b => b.isActive !== false));
      })
      .catch((e) => {
        console.error('Branch load error', e);
        setBranchesError('Không tải được danh sách kho. Một số cột kho có thể không hiển thị.');
        setBranches([]);
      })
      .finally(() => setBranchesLoading(false));
  }, []);

  const load = async (overrides?: { search?: string; page?: number }) => {
    const nextSearch = overrides?.search ?? search;
    const nextPage = overrides?.page ?? page;
    setLoading(true);
    setError(null);
    try {
      const res = await productApi.getInventories({
        page: nextPage,
        limit,
        q: nextSearch || undefined,
        branchId: filterWarehouse || undefined,
        stockStatus: filterStockStatus || undefined,
        sort: sortField,
        order: sortOrder,
      });
      setItems(res.items);
      setTotal(res.total);
      setTotalStockQuantity(typeof res.totalStockQuantity === 'number' ? res.totalStockQuantity : 0);
      setTotalInventoryValue(typeof res.totalInventoryValue === 'number' ? res.totalInventoryValue : 0);
    } catch (err) {
      console.error('Inventory load error', err);
      setError('Không tải được dữ liệu tồn kho. Vui lòng thử Làm mới hoặc kiểm tra kết nối.');
      setItems([]);
      setTotal(0);
      setTotalStockQuantity(0);
      setTotalInventoryValue(0);
    } finally {
      setLoading(false);
    }
  };

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    load();
  }, [page, filterWarehouse, filterStockStatus, sortField, sortOrder, refreshKey]);

  const getBranchStock = (item: IInventory, branch: BranchRecord) => getInventoryBranchStock(item, branch);

  // Export columns dùng key nhất quán với sort (stock_<id>) để tránh nhầm lẫn.
  // totalStock = tổng toàn hệ thống (full) — không phụ thuộc filter kho.
  const exportColumns: ColumnOption[] = useMemo(
    () => {
      const base: ColumnOption[] = [
        { label: 'Mã SP', key: 'code', getValue: (item: IInventory) => item.code },
        { label: 'Tên sản phẩm', key: 'name', getValue: (item: IInventory) => item.name },
        { label: 'Giá nhập (Vốn)', key: 'cost', getValue: (item: IInventory) => item.cost ?? 0 },
        { label: 'Giá bán', key: 'price', getValue: (item: IInventory) => item.price ?? 0 },
      ];
      // Dynamic branch columns — key dùng id (khớp BE sort stock_<id> và getInventoryBranchStock)
      if (branches.length > 0) {
        for (const branch of branches) {
          const branchKey = `stock_${branch._id}`;
          base.push({ label: branch.name, key: branchKey, getValue: (item: IInventory) => getBranchStock(item, branch) });
        }
      }
      base.push({ label: 'Tổng tồn', key: 'totalStock', getValue: (item: IInventory) => item.totalStock ?? 0 });
      base.push({ label: 'Trạng thái', key: 'status', getValue: (item: IInventory) => item.status || '' });
      return base;
    },
    [branches],
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
            stockStatus: filterStockStatus || undefined,
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
      console.error('Export error', err);
      alert('Xuất file thất bại! Vui lòng thử lại.');
    } finally {
      setExportLoading(false);
    }
  };

  const handleRefresh = () => {
    setSearch('');
    setFilterWarehouse('');
    setFilterStockStatus('');
    setSortField('createdAt');
    setSortOrder('desc');
    setPage(1);
    setError(null);
    setBranchesError(null);
    setTotalStockQuantity(0);
    setTotalInventoryValue(0);
    setRefreshKey((value) => value + 1);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (page === 1) {
      void load({ page: 1 });
    } else {
      setPage(1);
    }
  };

  const searchRef = useRef<HTMLInputElement>(null);
  useProductScanTarget(searchRef, (rawBarcode) => {
    const query = rawBarcode.trim();
    if (!query) return;
    setSearch(query);
    setPage(1);
    void load({ search: query, page: 1 });
  });

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
    branches.find(b => b._id === filterWarehouse)?.name || (filterWarehouse ? filterWarehouse : 'Tất cả kho');
  const stockStatusLabel =
    filterStockStatus === 'in_stock' ? 'Còn tồn' :
    filterStockStatus === 'sellable' ? 'Còn tồn có thể bán' :
    'Tất cả';

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown size={13} style={{ opacity: 0.32 }} />;
    return sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />;
  };

  const thStyle = { cursor: 'pointer', userSelect: 'none' as const };
  const thInner = { display: 'flex', alignItems: 'center', gap: '6px' };

  return (
    <div className="page-stack inventory-page-shell">
      <section className="data-card inventory-toolbar-card">
        {/* Compact Header */}
        <div className="inv-header">
          <span className="inv-badge">INVENTORY OVERVIEW</span>
          <h1 className="inv-title">Tồn kho theo kho hàng</h1>
          <p className="inv-desc">Dữ liệu thực từ MySQL theo từng kho (giữ nguyên logic & API cũ).</p>
        </div>

        {/* Top KPI Metrics Row - compact horizontal (uses existing totals & labels) */}
        <div className="inv-kpi-row">
          <div className="inv-kpi-card">
            <div className="inv-kpi-label">Tổng bản ghi</div>
            <div className="inv-kpi-value">{total.toLocaleString('vi-VN')}</div>
            <div className="inv-kpi-sub">Kho: {warehouseFilterLabel} | {stockStatusLabel}</div>
          </div>
          <div className="inv-kpi-card">
            <div className="inv-kpi-label">Tổng tồn</div>
            <div className="inv-kpi-value">{totalStockQuantity.toLocaleString('vi-VN')}</div>
          </div>
          <div className="inv-kpi-card inv-kpi-card--value">
            <div className="inv-kpi-label">Tổng trị giá</div>
            <div className="inv-kpi-value">{formatMoney(totalInventoryValue)}</div>
          </div>
          <div className="inv-kpi-card">
            <div className="inv-kpi-label">Bộ lọc</div>
            <div className="inv-kpi-value" style={{fontSize:'13px', fontWeight:600}}>{warehouseFilterLabel}</div>
            <div className="inv-kpi-sub">{stockStatusLabel}</div>
          </div>
        </div>

        {/* Compact horizontal filter bar - exact same handlers & state as before */}
        <form className="inv-filter-bar" onSubmit={handleSearch}>
          <div className="inv-search">
            <Search size={15} />
            <input
              ref={searchRef}
              data-product-search-scan="true"
              data-product-search-primary="true"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tên SP, mã SP..."
            />
          </div>

          <select
            className="inv-filter-select"
            value={filterWarehouse}
            onChange={(e) => {
              setFilterWarehouse(e.target.value);
              setPage(1);
            }}
            title="Lọc theo kho"
          >
            <option value="">Tất cả kho</option>
            {branches.map(b => (
              <option key={b._id} value={b._id}>{b.name}</option>
            ))}
          </select>

          <select
            className="inv-filter-select"
            value={filterStockStatus}
            onChange={(e) => {
              setFilterStockStatus(e.target.value);
              setPage(1);
            }}
            title="Còn tồn"
          >
            <option value="">Tất cả</option>
            <option value="in_stock">Còn tồn</option>
            <option value="sellable">Còn tồn có thể bán</option>
          </select>

          <div className="inv-filter-actions">
            <button type="submit" className="inv-btn inv-btn-primary">Lọc</button>
            <button type="button" className="inv-btn inv-btn-secondary" onClick={handleRefresh} title="Làm mới">
              <RefreshCw size={14} /> Làm mới
            </button>
            <button type="button" className="inv-btn inv-btn-accent" onClick={() => setShowExportModal(true)}>
              <FileDown size={14} /> Xuất dữ liệu
            </button>
          </div>
        </form>

        {/* Error states (unchanged) */}
        {(branchesError || error) && (
          <div className="inventory-error-bar" style={{ padding: '6px 10px', background: '#fff3cd', color: '#664d03', borderRadius: 4, marginBottom: 6, fontSize: 12 }}>
            {branchesError && <div>⚠ {branchesError}</div>}
            {error && <div>⚠ {error}</div>}
            <button className="btn btn-light" style={{ marginTop: 2, fontSize: 12 }} onClick={handleRefresh}>Thử lại</button>
          </div>
        )}

        {/* Compact quick warehouse filter pills - exact same onClick logic */}
        <div className="inv-quick-pills">
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
          {branches.map(b => (
            <button
              key={b._id}
              type="button"
              className={filterWarehouse === b._id ? 'active' : ''}
              onClick={() => {
                setFilterWarehouse(b._id);
                setPage(1);
              }}
            >
              {b.name}
            </button>
          ))}
        </div>
      </section>

      <section className="data-card inventory-table-card">
        <div className="data-card-header inventory-table-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '16px' }}>Tồn kho chi tiết</h2>
            <p className="inventory-table-subtitle" style={{ margin: '2px 0 0', fontSize: '12px' }}>
              Bảng chỉ chế độ xem (giữ nguyên cột kho động + logic cũ).
            </p>
          </div>
          <button className="btn btn-light" style={{ fontSize: '12px', padding: '4px 10px' }} onClick={() => navigate(`/products/storage-duration${filterWarehouse ? `?branchId=${filterWarehouse}` : ''}`)}>
            Xem tuổi tồn kho
          </button>
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
                {branches.map(b => (
                  <th key={b._id} style={thStyle} onClick={() => handleSort(`stock_${b._id}`)}>
                    <div style={thInner}>
                      <SortIcon field={`stock_${b._id}`} />
                      {b.name}
                    </div>
                  </th>
                ))}
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
                  <td colSpan={5 + (branches.length || 0)} className="empty-cell">
                    Đang tải dữ liệu tồn kho...
                  </td>
                </tr>
              )}

              {!loading && branchesLoading && (
                <tr>
                  <td colSpan={5 + (branches.length || 0)} className="empty-cell">
                    Đang tải danh sách kho...
                  </td>
                </tr>
              )}

              {!loading && !branchesLoading && items.length === 0 && !error && (
                <tr>
                  <td colSpan={5 + (branches.length || 0)} className="empty-cell">
                    Chưa có dữ liệu (có thể do filter hoặc kho chưa có sản phẩm).
                  </td>
                </tr>
              )}

              {!loading &&
                items.map((item) => (
                  <tr key={item._id}>
                    <td className="inventory-code-cell">
                      <button className="inventory-link-button" type="button" onClick={() => navigate(`/products/storage-duration?q=${encodeURIComponent(item.code)}${filterWarehouse ? `&branchId=${filterWarehouse}` : ''}`)}>
                        <strong>{item.code}</strong>
                      </button>
                    </td>
                    <td className="inventory-product-cell">
                      <div className="inventory-product-name" title={item.name}>
                        {item.name}
                      </div>
                      <small>{item.code}</small>
                    </td>
                    <td className="inventory-money-cell">{formatMoney(item.cost)}</td>
                    <td className="inventory-money-cell">{formatMoney(item.price)}</td>
                    {branches.map(b => (
                      <td key={b._id} className={`inventory-number-cell inventory-number-${b.code?.toLowerCase() || b._id}`}>
                        <span>{Number(getBranchStock(item, b)).toLocaleString('vi-VN')}</span>
                      </td>
                    ))}
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
