import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useProductScanTarget } from '../../../core/hooks/productScanner';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Boxes, CircleDollarSign, FileDown, RefreshCw, Search, Warehouse } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import * as XLSX from 'xlsx';
import { Pagination } from '../../../core/components/Pagination';
import { FilterSuggestInput } from '../../../core/components/ui/FilterSuggestInput';
import { http } from '../../../core/api/http';
import { suggestInventories } from '../../../core/api/filterSuggestions';
import { productApi } from '../../../core/api/product.api';
import { listBranches } from '../../../core/api/branch.api';
import type { BranchRecord } from '../../../core/api/branch.api';
import type { IInventory } from '../../../types/product.type';
import { ColumnOption, ExportExcelModal } from './ExportExcelModal';
import { getInventoryBranchStock } from './inventoryStock';

type WarehouseBreakdown = {
  branchId: string;
  localBranchId?: number;
  name: string;
  qty: number;
  value: number;
};

type PendingTransferSummary = {
  totalPending: number;
  totalQty: number;
  maxWaitingDays: number;
};

type InventoryChartTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload?: WarehouseBreakdown }>;
};

function InventoryChartTooltip({ active, payload }: InventoryChartTooltipProps) {
  const warehouse = payload?.[0]?.payload;
  if (!active || !warehouse) return null;

  return (
    <div className="inventory-chart-tooltip" role="status">
      <div className="inventory-chart-tooltip__head">
        <span className="inventory-chart-tooltip__icon"><Warehouse size={16} aria-hidden="true" /></span>
        <div>
          <small>Chi tiết kho</small>
          <strong>{warehouse.name}</strong>
        </div>
      </div>
      <div className="inventory-chart-tooltip__row inventory-chart-tooltip__row--value">
        <span>Giá trị tồn</span>
        <strong>{warehouse.value.toLocaleString('vi-VN')} đ</strong>
      </div>
      <div className="inventory-chart-tooltip__row inventory-chart-tooltip__row--quantity">
        <span>Số lượng tồn</span>
        <strong>{warehouse.qty.toLocaleString('vi-VN')}</strong>
      </div>
    </div>
  );
}

function formatWarehouseChartTick(value: string | number) {
  const label = String(value ?? '');
  return label.length > 18 ? `${label.slice(0, 17)}…` : label;
}

export function InventoryList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<IInventory[]>([]);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [branchesError, setBranchesError] = useState<string | null>(null);
  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const [filterWarehouse, setFilterWarehouse] = useState(() => searchParams.get('branchId') || '');
  const [filterStockStatus, setFilterStockStatus] = useState(() => searchParams.get('stockStatus') || '');
  const [sortField, setSortField] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalStockQuantity, setTotalStockQuantity] = useState(0);
  const [totalInventoryValue, setTotalInventoryValue] = useState(0);
  const [warehouseBreakdown, setWarehouseBreakdown] = useState<WarehouseBreakdown[]>([]);
  const [pendingTransfers, setPendingTransfers] = useState<PendingTransferSummary | null>(null);
  const [pendingTransfersError, setPendingTransfersError] = useState(false);
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
      // EMPLOYEE: backend scopes to assigned warehouses only (admin still gets full list).
      const [data, meRes] = await Promise.all([
        listBranches({ page: 1, limit: 200 }),
        http.get('/auth/me').catch(() => ({ data: null })),
      ]);
      if (!mountedRef.current || requestId !== branchRequestIdRef.current) return;
      const items = (data.items || []).filter((b) => b.isActive !== false);
      setBranches(items);
      const role = String((meRes as any)?.data?.role || (meRes as any)?.data?.user?.role || '').toUpperCase();
      const isAdmin = role === 'ADMIN' || Boolean((meRes as any)?.data?.isRootOwner || (meRes as any)?.data?.user?.isRootOwner);
      const pickDefault = () => String((items.find((b) => (b as any).isDefault) || items[0])?._id || '');
      setFilterWarehouse((current) => {
        const ok = current && items.some((b) => String(b._id) === String(current));
        if (ok) return current;
        // EMPLOYEE: default to first assigned warehouse so table is not full catalog.
        if (!isAdmin && items.length > 0) return pickDefault();
        return current || '';
      });
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

  // After branch list arrives (EMPLOYEE scoped), drop any chart rows outside allowed warehouses.
  useEffect(() => {
    if (branches.length === 0) return;
    const allowed = new Set(branches.map((b) => String(b._id)));
    setWarehouseBreakdown((current) => {
      const next = current.filter((row) => {
        const local = row.localBranchId != null ? String(row.localBranchId) : '';
        return allowed.has(local) || allowed.has(row.branchId);
      });
      return next.length === current.length ? current : next;
    });
  }, [branches]);

  const loadPendingTransfers = useCallback(async () => {
    setPendingTransfersError(false);
    try {
      const response = await http.get('/reports/inventory/pending-transfers', {
        params: { page: 1, perPage: 1 },
      });
      if (!mountedRef.current) return;
      const summary = response.data?.summary;
      setPendingTransfers({
        totalPending: Number(summary?.totalPending || 0),
        totalQty: Number(summary?.totalQty || 0),
        maxWaitingDays: Number(summary?.maxWaitingDays || 0),
      });
    } catch (loadError) {
      console.error('Pending transfer summary load error', loadError);
      if (!mountedRef.current) return;
      setPendingTransfers(null);
      setPendingTransfersError(true);
    }
  }, []);

  useEffect(() => {
    void loadPendingTransfers();
  }, [loadPendingTransfers, refreshKey]);

  // Keep deep-link query in sync (q / branchId / stockStatus) without clobbering unrelated params.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (search.trim()) next.set('q', search.trim());
    else next.delete('q');
    if (filterWarehouse) next.set('branchId', filterWarehouse);
    else next.delete('branchId');
    if (filterStockStatus) next.set('stockStatus', filterStockStatus);
    else next.delete('stockStatus');
    const current = searchParams.toString();
    const upcoming = next.toString();
    if (current !== upcoming) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filterWarehouse, filterStockStatus]);

  // Hydrate from URL when user navigates Back/Forward.
  useEffect(() => {
    const q = searchParams.get('q') || '';
    const branchId = searchParams.get('branchId') || '';
    const stockStatus = searchParams.get('stockStatus') || '';
    setSearch((prev) => (prev === q ? prev : q));
    setFilterWarehouse((prev) => (prev === branchId ? prev : branchId));
    setFilterStockStatus((prev) => (prev === stockStatus ? prev : stockStatus));
  }, [searchParams]);

  const load = async (overrides?: { search?: string; page?: number; mode?: 'load' | 'refresh' }) => {
    const requestId = ++invRequestIdRef.current;
    const nextSearch = overrides?.search ?? search;
    const nextPage = overrides?.page ?? page;
    const mode = overrides?.mode ?? (items.length > 0 ? 'refresh' : 'load');
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      // Session gate: many read APIs still answer without auth, so re-check /auth/me
      // before inventory reload (INV-ERR-07 expired/invalid token mid-session).
      await http.get('/auth/me');
      if (!mountedRef.current || requestId !== invRequestIdRef.current) return;

      const res = await productApi.getInventories({
        page: nextPage,
        limit,
        q: nextSearch || undefined,
        branchId: filterWarehouse || undefined,
        stockStatus: filterStockStatus || undefined,
        sort: sortField,
        order: sortOrder,
      }) as {
        items?: IInventory[];
        total?: number;
        totalStockQuantity?: number;
        totalInventoryValue?: number;
        breakdowns?: { byWarehouse?: WarehouseBreakdown[] };
      };
      if (!mountedRef.current || requestId !== invRequestIdRef.current) return;
      // Defensive contract handling (INV-ERR-04/05): missing items/total must not crash UI.
      setItems(Array.isArray(res?.items) ? res.items : []);
      setTotal(typeof res?.total === 'number' && Number.isFinite(res.total) ? res.total : 0);
      setTotalStockQuantity(typeof res.totalStockQuantity === 'number' ? res.totalStockQuantity : 0);
      setTotalInventoryValue(typeof res.totalInventoryValue === 'number' ? res.totalInventoryValue : 0);
      const breakdown = Array.isArray(res?.breakdowns?.byWarehouse) ? res.breakdowns!.byWarehouse! : [];
      // FE defense: if branch list is already loaded (scoped for EMPLOYEE), hide other warehouses in chart.
      const allowedLocal = new Set(
        branches.map((b) => String(b._id)).filter(Boolean),
      );
      const mapped = breakdown.map((row) => ({
        branchId: String(row.branchId ?? ''),
        localBranchId: row.localBranchId,
        name: String(row.name ?? '—'),
        qty: Number(row.qty) || 0,
        value: Number(row.value) || 0,
      }));
      setWarehouseBreakdown(
        allowedLocal.size > 0
          ? mapped.filter((row) => {
              const local = row.localBranchId != null ? String(row.localBranchId) : '';
              return allowedLocal.has(local) || allowedLocal.has(row.branchId);
            })
          : mapped,
      );
    } catch (err) {
      console.error('Inventory load error', err);
      if (!mountedRef.current || requestId !== invRequestIdRef.current) return;
      setError('Không tải được dữ liệu tồn kho. Vui lòng thử Làm mới hoặc kiểm tra kết nối.');
      // Keep previous rows on refresh failure; only clear on hard initial load.
      if (mode === 'load') {
        setItems([]);
        setTotal(0);
        setTotalStockQuantity(0);
        setTotalInventoryValue(0);
        setWarehouseBreakdown([]);
      }
    } finally {
      if (!mountedRef.current || requestId !== invRequestIdRef.current) return;
      setLoading(false);
      setRefreshing(false);
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
    if (loading || refreshing) return;
    setError(null);
    // Soft refresh keeps applied filters (report pattern).
    void loadBranches();
    void load({ mode: 'refresh' });
  };

  const handleSoftRetry = () => {
    setError(null);
    void load({ mode: items.length ? 'refresh' : 'load' });
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
  const chartTotalValue = warehouseBreakdown.reduce((sum, warehouse) => sum + warehouse.value, 0);
  const chartTotalQuantity = warehouseBreakdown.reduce((sum, warehouse) => sum + warehouse.qty, 0);
  const chartMinWidth = Math.max(520, warehouseBreakdown.length * 132);
  const leadingWarehouse = warehouseBreakdown.reduce<WarehouseBreakdown | null>(
    (leading, warehouse) => (!leading || warehouse.value > leading.value ? warehouse : leading),
    null,
  );
  const formatChartAxis = (value: number) => {
    if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ`;
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`;
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}k`;
    return value.toLocaleString('vi-VN');
  };

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
            <p className="inventory-compact-heading-sr">Tồn kho theo kho hàng</p>
            <div className="inventory-tabs-row inventory-tabs-row--title-slot">
              <span className="inventory-toolbar-eyebrow">INVENTORY</span>
              <span className="inventory-title-chip">Tồn kho chi tiết</span>
            </div>
          </div>
        </div>

        <div className="inventory-summary-strip" aria-label="Tóm tắt tồn kho">
          <div className="inventory-summary-cluster">
            <span className="inventory-summary-main">
              <strong data-testid="inventory-kpi-total">{total.toLocaleString('vi-VN')}</strong>
              <span>bản ghi</span>
            </span>
            <span className="inventory-summary-divider" aria-hidden="true" />
            <span className="inventory-summary-main">
              <strong data-testid="inventory-kpi-stock">{totalStockQuantity.toLocaleString('vi-VN')}</strong>
              <span>tổng tồn</span>
            </span>
            <span className="inventory-summary-divider" aria-hidden="true" />
            <span className="inventory-summary-value" data-testid="inventory-kpi-value">{formatMoney(totalInventoryValue)}</span>
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
            <FilterSuggestInput
              bare
              ref={searchRef}
              data-product-search-scan="true"
              data-product-search-primary="true"
              value={search}
              onChange={setSearch}
              fetchSuggestions={suggestInventories}
              placeholder="Tên SP, mã SP..."
              aria-label="Tìm theo tên hoặc mã sản phẩm"
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
            <option value="">{branches.length <= 3 ? 'Tất cả kho được gán' : 'Tất cả kho'}</option>
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
            <button type="button" className="inv-btn inv-btn-secondary" onClick={handleSoftRetry}>Thử lại</button>
          </div>
        )}
        {pendingTransfers && pendingTransfers.totalPending > 0 ? (
          <div className="inventory-transfer-alert" role="status" data-testid="inventory-transfer-alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <div>
              <strong>{pendingTransfers.totalPending.toLocaleString('vi-VN')} phiếu chuyển kho chưa hoàn tất</strong>
              <span>
                {pendingTransfers.totalQty.toLocaleString('vi-VN')} sản phẩm đang treo
                {pendingTransfers.maxWaitingDays > 0 ? ` · lâu nhất ${pendingTransfers.maxWaitingDays.toLocaleString('vi-VN')} ngày` : ''}
              </span>
            </div>
            <button type="button" className="inv-btn inv-btn-secondary" onClick={() => navigate('/warehouse/transfers')}>
              Mở chuyển kho
            </button>
          </div>
        ) : null}
        {pendingTransfersError ? (
          <div className="inventory-transfer-note" data-testid="inventory-transfer-error">
            Chưa tải được cảnh báo chuyển kho. Dữ liệu tồn kho bên dưới vẫn được giữ nguyên.
            <button type="button" onClick={() => void loadPendingTransfers()}>Thử lại</button>
          </div>
        ) : null}
        {refreshing ? (
          <div className="inventory-refreshing-badge" data-testid="inventory-refreshing">Đang làm mới...</div>
        ) : null}

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

      <section className="data-card inventory-chart-card" aria-labelledby="inventory-chart-title" data-testid="inventory-chart-card">
        <div className="data-card-header inventory-chart-header">
          <div>
            <h2 id="inventory-chart-title" className="inventory-table-title">
              {filterWarehouse ? 'Phân bổ giá trị tồn (kho đã chọn)' : 'Phân bổ giá trị tồn theo kho'}
            </h2>
            <p className="inventory-table-subtitle">Tổng hợp toàn bộ kết quả đã lọc — không lấy từ trang hiện tại.</p>
          </div>
          {warehouseBreakdown.length > 0 ? (
            <div className="inventory-chart-summary" aria-label="Tổng quan biểu đồ tồn kho">
              <div className="inventory-chart-summary__item inventory-chart-summary__item--value">
                <CircleDollarSign size={17} aria-hidden="true" />
                <span><small>Tổng giá trị</small><strong>{formatMoney(chartTotalValue)}</strong></span>
              </div>
              <div className="inventory-chart-summary__item inventory-chart-summary__item--quantity">
                <Boxes size={17} aria-hidden="true" />
                <span><small>Tổng số lượng</small><strong>{chartTotalQuantity.toLocaleString('vi-VN')}</strong></span>
              </div>
              {leadingWarehouse ? (
                <div className="inventory-chart-summary__item inventory-chart-summary__item--leader">
                  <Warehouse size={17} aria-hidden="true" />
                  <span><small>Giá trị cao nhất</small><strong title={leadingWarehouse.name}>{leadingWarehouse.name}</strong></span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {warehouseBreakdown.length === 0 ? (
          <div className="inventory-chart-empty" data-testid="inventory-chart-empty">
            {loading ? 'Đang tải biểu đồ...' : 'Không có dữ liệu phân bổ kho cho bộ lọc hiện tại.'}
          </div>
        ) : (
          <div className="inventory-chart" data-testid="inventory-chart">
            <div className="inventory-chart__canvas" style={{ minWidth: chartMinWidth }}>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={warehouseBreakdown} margin={{ top: 18, right: 16, left: 4, bottom: 8 }} barGap={6} barCategoryGap="28%">
                  <defs>
                    <linearGradient id="inventoryValueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="100%" stopColor="#047857" />
                    </linearGradient>
                    <linearGradient id="inventoryQuantityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" />
                      <stop offset="100%" stopColor="#0284c7" />
                    </linearGradient>
                    <filter id="inventoryBarShadow" x="-30%" y="-20%" width="160%" height="160%">
                      <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#0f172a" floodOpacity="0.16" />
                    </filter>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="4 6" stroke="#dbe5ef" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#475569', fontWeight: 650 }} tickFormatter={formatWarehouseChartTick} interval={0} height={42} />
                  <YAxis yAxisId="value" axisLine={false} tickLine={false} width={58} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={formatChartAxis} />
                  <YAxis yAxisId="quantity" orientation="right" axisLine={false} tickLine={false} width={46} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={formatChartAxis} />
                  <Tooltip content={<InventoryChartTooltip />} cursor={{ fill: 'rgba(16, 185, 129, 0.06)', radius: 10 }} />
                  <Legend verticalAlign="top" align="right" iconType="circle" iconSize={8} wrapperStyle={{ paddingBottom: 16, fontSize: 12, color: '#475569' }} />
                  <Bar yAxisId="value" dataKey="value" name="Giá trị tồn" fill="url(#inventoryValueGradient)" radius={[8, 8, 3, 3]} maxBarSize={46} animationDuration={900} animationEasing="ease-out" style={{ filter: 'url(#inventoryBarShadow)' }} />
                  <Bar yAxisId="quantity" dataKey="qty" name="Số lượng tồn" fill="url(#inventoryQuantityGradient)" radius={[8, 8, 3, 3]} maxBarSize={32} animationBegin={180} animationDuration={900} animationEasing="ease-out" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
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
            Xem hàng tồn lâu
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
