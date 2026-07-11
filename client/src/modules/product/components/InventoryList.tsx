import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [refreshKey, setRefreshKey] = useState(0);

  const limit = 15;
  const mountedRef = useRef(true);
  const invRequestIdRef = useRef(0);
  const branchRequestIdRef = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const exportTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadBranches = useCallback(async () => {
    const requestId = ++branchRequestIdRef.current;
    setBranchesLoading(true);
    setBranchesError(null);
    try {
      const data = await listBranches({ page: 1, limit: 200 });
      if (!mountedRef.current || requestId !== branchRequestIdRef.current) return;
      setBranches((data.items || []).filter((b) => b.isActive !== false));
    } catch (e) {
      console.error('Branch load error', e);
      if (!mountedRef.current || requestId !== branchRequestIdRef.current) return;
      setBranchesError('Không tải được danh sách kho. Một số cột kho có thể không hiển thị.');
      setBranches([]);
    } finally {
      if (!mountedRef.current || requestId !== branchRequestIdRef.current) return;
      setBranchesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBranches();
  }, [loadBranches]);

  const load = async (overrides?: { search?: string; page?: number }) => {
    const requestId = ++invRequestIdRef.current;
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
      if (!mountedRef.current || requestId !== invRequestIdRef.current) return;
      setItems(res.items);
      setTotal(res.total);
      setTotalStockQuantity(typeof res.totalStockQuantity === 'number' ? res.totalStockQuantity : 0);
      setTotalInventoryValue(typeof res.totalInventoryValue === 'number' ? res.totalInventoryValue : 0);
    } catch (err) {
      console.error('Inventory load error', err);
      if (!mountedRef.current || requestId !== invRequestIdRef.current) return;
      setError('Không tải được dữ liệu tồn kho. Vui lòng thử Làm mới hoặc kiểm tra kết nối.');
      setItems([]);
      setTotal(0);
      setTotalStockQuantity(0);
      setTotalInventoryValue(0);
    } finally {
      if (!mountedRef.current || requestId !== invRequestIdRef.current) return;
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // load intentionally depends on filter/sort/page/refresh; call with latest closure values
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setTotalStockQuantity(0);
    setTotalInventoryValue(0);
    // Reload both inventories and branches (do not only clear branchesError)
    void loadBranches();
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
  const hasActiveFilters = Boolean(search.trim() || filterWarehouse || filterStockStatus);
  const sortLabelMap: Record<string, string> = {
    code: 'Mã SP',
    name: 'Sản phẩm',
    cost: 'Giá nhập',
    price: 'Giá bán',
    totalStock: 'Tổng tồn',
    createdAt: 'Ngày tạo',
  };
  const sortLabel = sortField.startsWith('stock_')
    ? `Tồn ${branches.find(branch => sortField === `stock_${branch._id}`)?.name || 'theo kho'}`
    : sortLabelMap[sortField] || sortField;
  const sortDirectionLabel = sortOrder === 'asc' ? 'tăng dần' : 'giảm dần';
  const columnCount = 5 + (branches.length || 0);

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown size={13} style={{ opacity: 0.32 }} />;
    return sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />;
  };

  const getAriaSort = (field: string): 'ascending' | 'descending' | 'none' => {
    if (sortField !== field) return 'none';
    return sortOrder === 'asc' ? 'ascending' : 'descending';
  };

  const renderSortButton = (field: string, label: string) => (
    <button
      type="button"
      className="inventory-sort-button"
      onClick={() => handleSort(field)}
      aria-label={`Sắp xếp theo ${label}`}
    >
      <SortIcon field={field} />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="page-stack inventory-page-shell">
      <section className="data-card inventory-toolbar-card inventory-sticky-toolbar">
        <div className="inventory-toolbar-header-slot">
          <div className="inventory-compact-head">
            <h1 className="inventory-compact-heading-sr">Tồn kho theo kho hàng</h1>
            <div className="inventory-tabs-row inventory-tabs-row--title-slot">
              <span className="inventory-toolbar-eyebrow">INVENTORY</span>
              <span className="inventory-title-chip">Tồn kho chi tiết</span>
            </div>
          </div>
        </div>

        <div className="inventory-summary-strip" aria-label="Tóm tắt tồn kho">
          <div className="inventory-summary-cluster">
            <span className="inventory-summary-main">
              <strong>{total.toLocaleString('vi-VN')}</strong>
              <span>bản ghi</span>
            </span>
            <span className="inventory-summary-divider" aria-hidden="true" />
            <span className="inventory-summary-main">
              <strong>{totalStockQuantity.toLocaleString('vi-VN')}</strong>
              <span>tổng tồn</span>
            </span>
            <span className="inventory-summary-divider" aria-hidden="true" />
            <span className="inventory-summary-value">{formatMoney(totalInventoryValue)}</span>
            {hasActiveFilters ? (
              <>
                <span className="inventory-summary-divider" aria-hidden="true" />
                <span className="inventory-summary-filter">Đang lọc</span>
              </>
            ) : null}
          </div>
        </div>

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
            <button type="submit" className="inv-btn inv-btn-primary">
              <Search size={14} /> Lọc
            </button>
            <button type="button" className="inv-btn inv-btn-secondary" onClick={handleRefresh} title="Làm mới">
              <RefreshCw size={14} /> Làm mới
            </button>
            <button
              ref={exportTriggerRef}
              type="button"
              className="inv-btn inv-btn-accent"
              onClick={() => setShowExportModal(true)}
            >
              <FileDown size={14} /> Xuất dữ liệu
            </button>
          </div>
        </form>

        {(branchesError || error) && (
          <div className="inventory-error-bar" role="alert">
            {branchesError && <div>⚠ {branchesError}</div>}
            {error && <div>⚠ {error}</div>}
            <button type="button" className="inv-btn inv-btn-secondary" onClick={handleRefresh}>Thử lại</button>
          </div>
        )}

        <div className="inv-quick-pills">
          <button
            type="button"
            className={!filterWarehouse ? 'active' : ''}
            aria-pressed={!filterWarehouse}
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
              aria-pressed={filterWarehouse === b._id}
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
        <div className="data-card-header inventory-table-header">
          <div>
            <h2 className="inventory-table-title">Bảng dữ liệu tồn kho</h2>
            <p className="inventory-table-subtitle">
              {total.toLocaleString('vi-VN')} bản ghi · Kho: {warehouseFilterLabel} · Trạng thái: {stockStatusLabel} · Sắp xếp {sortLabel} {sortDirectionLabel}
            </p>
          </div>
          <button type="button" className="inv-btn inv-btn-secondary inventory-table-link-button" onClick={() => navigate(`/products/storage-duration${filterWarehouse ? `?branchId=${filterWarehouse}` : ''}`)}>
            Xem tuổi tồn kho
          </button>
        </div>

        <div className="table-scroll inventory-table-scroll">
          <table className="data-table inventory-data-table">
            <thead>
              <tr>
                <th aria-sort={getAriaSort('code')}>
                  {renderSortButton('code', 'Mã SP')}
                </th>
                <th aria-sort={getAriaSort('name')}>
                  {renderSortButton('name', 'Sản phẩm')}
                </th>
                <th className="inventory-numeric-col" aria-sort={getAriaSort('cost')}>
                  {renderSortButton('cost', 'Giá nhập')}
                </th>
                <th className="inventory-numeric-col" aria-sort={getAriaSort('price')}>
                  {renderSortButton('price', 'Giá bán')}
                </th>
                {branches.map(b => (
                  <th key={b._id} className="inventory-numeric-col" aria-sort={getAriaSort(`stock_${b._id}`)}>
                    {renderSortButton(`stock_${b._id}`, b.name)}
                  </th>
                ))}
                <th className="inventory-numeric-col" aria-sort={getAriaSort('totalStock')}>
                  {renderSortButton('totalStock', 'Tổng tồn')}
                </th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan={columnCount} className="inventory-empty-cell">
                    <div className="inventory-empty-state">
                      <strong>Đang tải dữ liệu tồn kho...</strong>
                      <span>Vui lòng chờ trong giây lát.</span>
                    </div>
                  </td>
                </tr>
              )}

              {!loading && branchesLoading && (
                <tr>
                  <td colSpan={columnCount} className="inventory-empty-cell">
                    <div className="inventory-empty-state">
                      <strong>Đang tải danh sách kho...</strong>
                      <span>Các cột kho sẽ hiển thị sau khi tải xong.</span>
                    </div>
                  </td>
                </tr>
              )}

              {!loading && !branchesLoading && items.length === 0 && !error && (
                <tr>
                  <td colSpan={columnCount} className="inventory-empty-cell">
                    <div className="inventory-empty-state">
                      <strong>Chưa có dữ liệu</strong>
                      <span>Thử đổi bộ lọc hoặc làm mới danh sách tồn kho.</span>
                    </div>
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
          returnFocusRef={exportTriggerRef}
        />
      )}
    </div>
  );
}
