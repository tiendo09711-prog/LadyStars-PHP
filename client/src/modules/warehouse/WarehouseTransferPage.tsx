import { type FormEvent, type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Eye,
  FileClock,
  Filter,
  Layers,
  MoreHorizontal,
  Plus,
  Printer,
  RefreshCw,
  Search,
  X,
  FileDown,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { http } from '../../core/api/http';
import { Pagination } from '../../core/components/Pagination';
import { printWarehouseTransfer } from './transferPrint';
import './warehouseRecords.css';
import './warehouse-transfer-list-ui.css';
import * as XLSX from 'xlsx';
import { ExportExcelModal, type ColumnOption } from '../product/components/ExportExcelModal';

type TabKey = 'all' | 'draft' | 'outgoing' | 'incoming';
type Option = { value: string; label: string; code?: string };
type UserCell = { name?: string; email?: string } | string;
type TransferRow = {
  _id: string;
  id?: string;
  code?: string;
  date?: string;
  createdAt?: string;
  sourceWarehouseId?: string;
  destinationWarehouseId?: string;
  sourceWarehouseName?: string;
  destinationWarehouseName?: string;
  spCount?: number;
  qty?: number;
  creator?: string;
  createdById?: UserCell;
  sourceConfirmedBy?: UserCell;
  sourceConfirmedAt?: string;
  dispatchConfirmedById?: UserCell;
  dispatchConfirmedAt?: string;
  status?: string;
  statusLabel?: string;
  statusTone?: string;
  note?: string;
  kind?: string;
  originTransferId?: string;
  returnTransferId?: string;
  lockedQuantity?: number;
  canEdit?: boolean;
  canCancel?: boolean;
  canConfirmSource?: boolean;
  canConfirmDestination?: boolean;
  canReturn?: boolean;
  canPrint?: boolean;
  sourceExportBillId?: string;
};

const LIMIT = 20;

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function defaultDateRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 14);
  return { fromDate: formatDateInput(start), toDate: formatDateInput(end) };
}

const defaultTransferFilters = () => ({
  id: '',
  sourceWarehouseId: '',
  destinationWarehouseId: '',
  status: '',
  ...defaultDateRange(),
});

const tabs: Array<{ key: TabKey; label: string; icon: typeof Layers }> = [
  { key: 'all', label: 'Tất cả', icon: Layers },
  { key: 'draft', label: 'Đơn cần duyệt', icon: FileClock },
  { key: 'outgoing', label: 'Đang chuyển đi', icon: ArrowUpRight },
  { key: 'incoming', label: 'Sắp chuyển đến', icon: ArrowDownLeft },
];

const emptyFilters = defaultTransferFilters();

function displayDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('vi-VN');
}

function displayDateTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN');
}

function displayUser(value?: UserCell, fallback = '-') {
  if (!value) return fallback;
  if (typeof value === 'string') return value || fallback;
  return value.name || value.email || fallback;
}

function rowCode(row: TransferRow) {
  return row.id || row.code || row._id;
}

function direction(row: TransferRow) {
  return `${row.sourceWarehouseName || '-'} → ${row.destinationWarehouseName || '-'}`;
}

function quantity(value?: number) {
  return Number(value || 0).toLocaleString('vi-VN');
}

function statusBadgeClass(tone?: string) {
  const normalized = (tone || '').toLowerCase();
  if (['success', 'completed', 'received', 'import', 'done'].includes(normalized)) return 'success';
  if (['danger', 'cancelled', 'canceled', 'export', 'return', 'failed'].includes(normalized)) return 'danger';
  if (['warning', 'pending', 'draft', 'adjustment', 'adjustment-in', 'adjustment-out', 'transfer', 'outgoing'].includes(normalized)) {
    return 'warning';
  }
  return 'neutral';
}

function tabTitle(tab: TabKey) {
  return tabs.find((item) => item.key === tab)?.label || 'Chuyển kho';
}

export function WarehouseTransferPage() {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [meta, setMeta] = useState<{
    role: string;
    warehouses: Option[];
    statuses: Option[];
    userWarehouseIds?: string[];
    isRootOwner?: boolean;
  }>({ role: 'EMPLOYEE', warehouses: [], statuses: [], userWarehouseIds: [], isRootOwner: false });
  const [rows, setRows] = useState<TransferRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [rowMenuPos, setRowMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [confirm, setConfirm] = useState<{
    row: TransferRow;
    action: 'confirm-source' | 'confirm-destination' | 'return' | 'delete';
    title: string;
    message: string;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const totals = useMemo(
    () => rows.reduce((acc, row) => ({ sp: acc.sp + Number(row.spCount || 0), qty: acc.qty + Number(row.qty || 0) }), { sp: 0, qty: 0 }),
    [rows],
  );

  const hasActiveFilters = Boolean(
    appliedFilters.id.trim()
    || appliedFilters.sourceWarehouseId
    || appliedFilters.destinationWarehouseId
    || appliedFilters.status,
  );

  const columnCount = activeTab === 'all' ? 7 : 8;
  const openRow = openMenu ? rows.find((row) => row._id === openMenu) ?? null : null;

  const loadMeta = async () => {
    const response = await http.get('/warehouse/transfers/meta');
    setMeta(response.data);
  };

  const load = async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const response = await http.get('/warehouse/transfers', {
        params: { tab: activeTab, page, limit: LIMIT, ...appliedFilters },
        signal,
      });
      setRows(response.data.items || []);
      setTotal(Number(response.data.total || 0));
    } catch (err: any) {
      if (err.code !== 'ERR_CANCELED') setError(err.response?.data?.message || 'Không tải được danh sách chuyển kho.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    void loadMeta().catch(() => setError('Không tải được thông tin kho/quyền.'));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [activeTab, page, appliedFilters]);

  useEffect(() => {
    const closeMenus = () => {
      setOpenMenu(null);
      setRowMenuPos(null);
    };
    const handlePointerDown = (event: globalThis.MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const rowMenu = target instanceof Element ? target.closest('.wt-row-action-menu') != null : false;
      const rowMenuButton = target instanceof Element ? target.closest('.wt-row-menu-button') != null : false;
      if (!rowMenu && !rowMenuButton) closeMenus();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenus();
    };
    const handleViewportChange = () => closeMenus();
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleViewportChange);
    document.addEventListener('scroll', handleViewportChange, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleViewportChange);
      document.removeEventListener('scroll', handleViewportChange, true);
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setAppliedFilters(filters);
  };

  const resetFilters = () => {
    const nextFilters = defaultTransferFilters();
    setPage(1);
    setFilters(nextFilters);
    setAppliedFilters(nextFilters);
  };

  const changeTab = (tab: TabKey) => {
    setActiveTab(tab);
    setPage(1);
    setOpenMenu(null);
    setRowMenuPos(null);
  };

  const ask = (row: TransferRow, action: 'confirm-source' | 'confirm-destination' | 'return' | 'delete') => {
    setOpenMenu(null);
    setRowMenuPos(null);
    if (action === 'confirm-source') {
      setConfirm({
        row,
        action,
        title: 'Xác nhận xuất hàng cho đơn này?',
        message: 'Hệ thống sẽ KHÓA số lượng tại kho nguồn cho đến khi bên nhận xác nhận hoặc trả hàng. Tồn kho chưa bị trừ ở bước này.',
      });
    }
    if (action === 'confirm-destination') {
      setConfirm({
        row,
        action,
        title: 'Xác nhận đã nhận đủ hàng?',
        message:
          row.kind === 'RETURN_OF_TRANSFER'
            ? 'Số lượng khóa ở đơn gốc sẽ được giải phóng. Tồn kho không bị cộng/trừ thêm.'
            : 'Tồn kho nguồn sẽ bị trừ, tồn kho đích được cộng và số lượng khóa được giải phóng.',
      });
    }
    if (action === 'return') {
      setConfirm({
        row,
        action,
        title: 'Báo trả hàng / Không nhận?',
        message: 'Hệ thống sẽ tự tạo đơn trả hàng về kho nguồn. Số lượng khóa tại kho nguồn vẫn được giữ cho đến khi đơn trả hoàn tất.',
      });
    }
    if (action === 'delete') {
      setConfirm({
        row,
        action,
        title: 'Xóa đơn chuyển này?',
        message: 'Đơn sẽ được chuyển sang trạng thái Đã hủy và không thể xác nhận xuất.',
      });
    }
  };

  const runAction = async () => {
    if (!confirm) return;
    setActionLoading(true);
    setError('');
    try {
      if (confirm.action === 'delete') {
        await http.delete(`/warehouse/transfers/${confirm.row._id}`);
      } else if (confirm.action === 'return') {
        const reason = window.prompt('Nhập lý do trả hàng / không nhận:')?.trim();
        if (!reason) {
          setActionLoading(false);
          return;
        }
        const response = await http.post(`/warehouse/transfers/${confirm.row._id}/return`, { reason });
        if (response.data?.returnTransfer?._id) navigate(`/warehouse/transfers/${response.data.returnTransfer._id}`);
      } else {
        await http.post(`/warehouse/transfers/${confirm.row._id}/${confirm.action}`);
      }
      const next = confirm;
      setNotice(
        next.action === 'confirm-source'
          ? 'Đã xác nhận xuất, số lượng đã được khóa tại kho nguồn. Có thể in phiếu chuyển kho ngay.'
          : next.action === 'confirm-destination'
            ? 'Đã xác nhận nhận, tồn kho và khóa đã được cập nhật.'
            : next.action === 'return'
              ? 'Đã tạo đơn trả hàng tự động.'
              : 'Đã xóa mềm đơn chuyển kho.',
      );
      setConfirm(null);
      await load();
      if (next.action === 'confirm-destination') navigate(`/warehouse/transfers/${next.row._id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không thực hiện được thao tác.');
    } finally {
      setActionLoading(false);
    }
  };

  const printRow = async (row: TransferRow) => {
    setOpenMenu(null);
    setRowMenuPos(null);
    setError('');
    try {
      await printWarehouseTransfer(row as any);
    } catch (err: any) {
      setError(err.message || 'Không in được đơn chuyển kho.');
    }
  };

  const openRowActionMenu = (rowId: string, event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (openMenu === rowId) {
      setOpenMenu(null);
      setRowMenuPos(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 220;
    const menuHeight = 180;
    const gap = 6;
    let left = rect.right - menuWidth;
    let top = rect.bottom + gap;
    if (left < 8) left = 8;
    if (left + menuWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - menuWidth - 8);
    }
    if (top + menuHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - menuHeight - gap);
    }
    setRowMenuPos({ top, left });
    setOpenMenu(rowId);
  };

  const exportColumns: ColumnOption[] = useMemo(
    () => [
      { label: 'Mã phiếu', key: 'code', getValue: (row: TransferRow) => rowCode(row) },
      { label: 'Ngày', key: 'date', getValue: (row: TransferRow) => displayDate(row.date || row.createdAt) },
      { label: 'Kho nguồn → Kho đích', key: 'direction', getValue: (row: TransferRow) => direction(row) },
      { label: 'Số SP', key: 'spCount', getValue: (row: TransferRow) => row.spCount || 0 },
      { label: 'Tổng SL', key: 'qty', getValue: (row: TransferRow) => row.qty || 0 },
      { label: 'Người tạo', key: 'creator', getValue: (row: TransferRow) => row.creator || displayUser(row.createdById) },
      { label: 'Trạng thái', key: 'status', getValue: (row: TransferRow) => row.statusLabel || row.status || '' },
      { label: 'Ghi chú', key: 'note', getValue: (row: TransferRow) => row.note || '' },
    ],
    [],
  );

  const handleExcelExport = async (
    exportType: 'current' | 'all',
    filename: string,
    sheetName: string,
    selectedColumns: { key: string; customLabel: string }[],
  ) => {
    setExportLoading(true);
    setError('');
    try {
      let dataToExport: TransferRow[] = [];
      if (exportType === 'current') {
        dataToExport = rows;
      } else {
        const fetchPage = (nextPage: number, nextLimit: number) =>
          http.get('/warehouse/transfers', { params: { tab: activeTab, page: nextPage, limit: nextLimit, ...appliedFilters } });
        const pageSize = 200;
        const firstResponse = await fetchPage(1, pageSize);
        let allItems: TransferRow[] = [...(firstResponse.data.items || [])];
        const totalItems = Number(firstResponse.data.total || 0);
        if (totalItems > pageSize) {
          const pagesToFetch = Math.ceil(totalItems / pageSize);
          const responses = await Promise.all(
            Array.from({ length: pagesToFetch - 1 }, (_, index) => fetchPage(index + 2, pageSize)),
          );
          responses.forEach((response) => {
            allItems = allItems.concat(response.data.items || []);
          });
        }
        dataToExport = allItems;
      }
      if (!dataToExport.length) {
        setNotice('Không có dữ liệu để xuất.');
        return;
      }
      const mappedRows = dataToExport.map((row) => {
        const record: Record<string, unknown> = {};
        selectedColumns.forEach((column) => {
          const exportColumn = exportColumns.find((item) => item.key === column.key);
          record[column.customLabel] = exportColumn ? exportColumn.getValue(row) : '';
        });
        return record;
      });
      const worksheet = XLSX.utils.json_to_sheet(mappedRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      XLSX.writeFile(workbook, `${filename}.xlsx`);
      setShowExportModal(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Xuất Excel thất bại.');
    } finally {
      setExportLoading(false);
    }
  };

  const rangeLabel = total
    ? `${(page - 1) * LIMIT + 1} - ${Math.min(page * LIMIT, total)} / ${total.toLocaleString('vi-VN')}`
    : '0 bản ghi';

  return (
    <div className="page-stack warehouse-transfer-root warehouse-records compact-page" ref={rootRef}>
      <section className="data-card wt-toolbar-card wt-sticky-toolbar">
        <div className="wt-toolbar-header-slot">
          <div className="wt-compact-head">
            <h1 className="wt-compact-heading-sr">{tabTitle(activeTab)}</h1>
            <div className="wt-tabs-row wt-tabs-row--title-slot">
              <div className="wt-tabbar is-compact" role="tablist" aria-label="Chuyển kho tabs">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-controls={`wt-panel-${tab.key}`}
                      className={`wt-tab is-compact ${isActive ? 'is-active' : ''}`}
                      onClick={() => changeTab(tab.key)}
                    >
                      <Icon size={15} aria-hidden="true" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="wt-summary-strip" aria-label="Tóm tắt chuyển kho">
          <div className="wt-summary-cluster">
            <span className="wt-summary-main">
              <strong>{total.toLocaleString('vi-VN')}</strong>
              <span>đơn chuyển</span>
            </span>
            <span className="wt-summary-divider" aria-hidden="true" />
            <span>SP {totals.sp.toLocaleString('vi-VN')}</span>
            <span className="wt-summary-divider" aria-hidden="true" />
            <span>SL {totals.qty.toLocaleString('vi-VN')}</span>
            {hasActiveFilters ? (
              <>
                <span className="wt-summary-divider" aria-hidden="true" />
                <span className="wt-summary-filter">Đang lọc</span>
              </>
            ) : null}
          </div>
        </div>

        <form
          className={`wt-filter-bar${activeTab === 'all' ? ' wt-filter-bar--all' : ''}`}
          onSubmit={applyFilters}
        >
          <div className={`wt-search${activeTab === 'all' ? ' wt-search--compact' : ''}`}>
            <Search size={15} aria-hidden="true" />
            <input
              value={filters.id}
              onChange={(e) => setFilters({ ...filters, id: e.target.value })}
              placeholder="ID / mã phiếu"
              aria-label="Tìm theo ID hoặc mã phiếu"
            />
          </div>

          <select
            className="wt-filter-select"
            value={filters.sourceWarehouseId}
            onChange={(e) => setFilters({ ...filters, sourceWarehouseId: e.target.value })}
            title="Kho nguồn"
            aria-label="Kho nguồn"
          >
            <option value="">Kho nguồn</option>
            {meta.warehouses.map((w) => (
              <option key={w.value} value={w.value}>{w.label}</option>
            ))}
          </select>

          <select
            className="wt-filter-select"
            value={filters.destinationWarehouseId}
            onChange={(e) => setFilters({ ...filters, destinationWarehouseId: e.target.value })}
            title="Kho đích"
            aria-label="Kho đích"
          >
            <option value="">Kho đích</option>
            {meta.warehouses.map((w) => (
              <option key={w.value} value={w.value}>{w.label}</option>
            ))}
          </select>

          {activeTab === 'all' ? (
            <select
              className="wt-filter-select wt-filter-select--wide"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              title="Trạng thái"
              aria-label="Trạng thái"
            >
              <option value="">Trạng thái</option>
              {meta.statuses.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          ) : null}

          <input
            className="wt-filter-select"
            type="date"
            value={filters.fromDate}
            onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })}
            title="Từ ngày"
            aria-label="Từ ngày"
          />
          <input
            className="wt-filter-select"
            type="date"
            value={filters.toDate}
            onChange={(e) => setFilters({ ...filters, toDate: e.target.value })}
            title="Đến ngày"
            aria-label="Đến ngày"
          />

          {/* "Tất cả" only: place Lọc next to the date range for visual balance */}
          {activeTab === 'all' ? (
            <button className="wt-btn wt-btn-primary wt-filter-apply" type="submit">
              <Filter size={14} aria-hidden="true" />
              Lọc
            </button>
          ) : null}

          <div className="wt-filter-actions">
            {activeTab !== 'all' ? (
              <button className="wt-btn wt-btn-primary" type="submit">
                <Filter size={14} aria-hidden="true" />
                Lọc
              </button>
            ) : null}
            <button className="wt-btn wt-btn-secondary" type="button" onClick={resetFilters} title="Đặt lại bộ lọc">
              <RefreshCw size={14} aria-hidden="true" />
              Đặt lại
            </button>
            <button
              className="wt-btn wt-btn-primary"
              type="button"
              onClick={() => navigate('/warehouse/transfers/create')}
            >
              <Plus size={14} aria-hidden="true" />
              Tạo đơn
            </button>
            <button
              className="wt-btn wt-btn-secondary"
              type="button"
              onClick={() => navigate(`/products/storage-duration${filters.sourceWarehouseId ? `?branchId=${filters.sourceWarehouseId}` : ''}`)}
              title="Hàng bán chậm tại chi nhánh này"
            >
              Hàng bán chậm
            </button>
            <button className="wt-btn wt-btn-secondary" type="button" onClick={() => setShowExportModal(true)}>
              <FileDown size={14} aria-hidden="true" />
              Xuất Excel
            </button>
          </div>
        </form>
      </section>

      {notice ? (
        <div className="wt-notice" role="status">
          <Check size={16} aria-hidden="true" />
          <span>{notice}</span>
        </div>
      ) : null}

      {error ? (
        <div className="wt-error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{error}</span>
          <button type="button" onClick={() => setError('')}>Đóng</button>
        </div>
      ) : null}

      <section className="data-card wt-table-card" id={`wt-panel-${activeTab}`} role="tabpanel">
        <div className="data-card-header wt-table-header">
          <div>
            <h2 className="wt-table-title">Bảng dữ liệu chuyển kho</h2>
            <p className="wt-table-subtitle">
              {rangeLabel}
              {' · '}
              Tab {tabTitle(activeTab)}
              {hasActiveFilters ? ' · Đang lọc' : ''}
            </p>
          </div>
          <span className="wt-selected-count">
            SP {totals.sp.toLocaleString('vi-VN')} · SL {totals.qty.toLocaleString('vi-VN')}
          </span>
        </div>

        <div className="table-scroll wt-table-scroll warehouse-transfer-table">
          <table className="data-table wt-data-table warehouse-transfer-table__table">
            <colgroup>
              <col className="wt-col-id" />
              <col className="wt-col-direction" />
              <col className="wt-col-sp" />
              <col className="wt-col-sl" />
              <col className="wt-col-creator" />
              {activeTab !== 'all' ? <col className="wt-col-extra" /> : null}
              <col className="wt-col-status" />
              <col className="wt-col-action" />
            </colgroup>
            <thead>
              <tr>
                <th className="wt-col-id">ID / Ngày</th>
                <th className="wt-col-direction">Kho nguồn → Kho đích</th>
                <th className="wt-number wt-col-sp">Số SP</th>
                <th className="wt-number wt-col-sl">Tổng SL</th>
                <th className="wt-col-creator">Người tạo</th>
                {activeTab === 'draft' ? <th className="wt-col-extra">Xác nhận</th> : null}
                {activeTab === 'outgoing' ? <th className="wt-col-extra">Đã xác nhận xuất</th> : null}
                {activeTab === 'incoming' ? <th className="wt-col-extra">Xác nhận</th> : null}
                <th className="wt-col-status">Trạng thái</th>
                <th className="action-cell wt-col-action" scope="col">
                  Thao Tác
                </th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, index) => (
                    <tr className="wt-skeleton" key={`skeleton-${index}`}>
                      <td colSpan={columnCount}><span /></td>
                    </tr>
                  ))
                : null}

              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="wt-empty-cell">
                    <div className="wt-empty-state">
                      <Layers size={28} aria-hidden="true" />
                      <strong>Chưa có dữ liệu</strong>
                      <span>Thử đổi bộ lọc hoặc tạo đơn chuyển kho mới.</span>
                    </div>
                  </td>
                </tr>
              ) : null}

              {!loading
                ? rows.map((row) => (
                    <tr key={row._id}>
                      <td className="wt-name-cell wt-col-id">
                        <button
                          type="button"
                          className="wt-link-button"
                          onClick={() => navigate(`/warehouse/transfers/${row._id}`)}
                        >
                          {rowCode(row)}
                        </button>
                        <div className="wt-name-sub">{displayDate(row.date || row.createdAt)}</div>
                      </td>
                      <td className="wt-direction-cell wt-col-direction">{direction(row)}</td>
                      <td className="wt-number wt-col-sp">{quantity(row.spCount)}</td>
                      <td className="wt-number wt-col-sl">{quantity(row.qty)}</td>
                      <td className="wt-col-creator">{row.creator || displayUser(row.createdById)}</td>
                      {activeTab === 'draft' ? (
                        <td className="wt-col-extra">
                          {row.canConfirmSource ? (
                            <button className="wt-btn wt-btn-primary wt-btn-inline" type="button" onClick={() => ask(row, 'confirm-source')}>
                              Xác nhận xuất
                            </button>
                          ) : '—'}
                        </td>
                      ) : null}
                      {activeTab === 'outgoing' ? (
                        <td className="wt-col-extra">
                          <div className="wt-name-main is-compact">{displayUser(row.sourceConfirmedBy || row.dispatchConfirmedById)}</div>
                          <div className="wt-name-sub">{displayDateTime(row.sourceConfirmedAt || row.dispatchConfirmedAt)}</div>
                        </td>
                      ) : null}
                      {activeTab === 'incoming' ? (
                        <td className="wt-col-extra">
                          {row.canConfirmDestination ? (
                            <button className="wt-btn wt-btn-primary wt-btn-inline" type="button" onClick={() => ask(row, 'confirm-destination')}>
                              Xác nhận nhận hàng
                            </button>
                          ) : '—'}
                        </td>
                      ) : null}
                      <td className="wt-col-status">
                        <span className={`wt-status-badge ${statusBadgeClass(row.statusTone)}`}>
                          {row.statusLabel || row.status || '—'}
                        </span>
                      </td>
                      <td className="action-cell wt-col-action">
                        <div className="wt-actions">
                          <button
                            className="wt-row-menu-button"
                            type="button"
                            title="Thao tác"
                            aria-label={`Thao tác đơn ${rowCode(row)}`}
                            aria-expanded={openMenu === row._id}
                            aria-haspopup="menu"
                            onClick={(event) => openRowActionMenu(row._id, event)}
                          >
                            <MoreHorizontal size={16} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>

        <Pagination page={page} total={total} limit={LIMIT} onPageChange={setPage} />
      </section>

      {openRow && rowMenuPos
        ? createPortal(
            <div
              className="wt-row-action-menu wt-row-action-menu--portal"
              role="menu"
              style={{ top: rowMenuPos.top, left: rowMenuPos.left }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpenMenu(null);
                  setRowMenuPos(null);
                  navigate(`/warehouse/transfers/${openRow._id}`);
                }}
              >
                <Eye size={15} aria-hidden="true" />
                Xem chi tiết
              </button>
              {openRow.canEdit ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpenMenu(null);
                    setRowMenuPos(null);
                    navigate(`/warehouse/transfers/${openRow._id}/edit`);
                  }}
                >
                  Sửa đơn chuyển
                </button>
              ) : null}
              {openRow.canReturn && openRow.kind === 'NORMAL_TRANSFER' ? (
                <button className="danger" type="button" role="menuitem" onClick={() => ask(openRow, 'return')}>
                  Báo trả hàng / Hoàn chuyển
                </button>
              ) : null}
              {openRow.status === 'DRAFT' && openRow.canCancel ? (
                <button className="danger" type="button" role="menuitem" onClick={() => ask(openRow, 'delete')}>
                  Xóa đơn chuyển
                </button>
              ) : null}
              {openRow.canPrint ? (
                <button type="button" role="menuitem" onClick={() => void printRow(openRow)}>
                  <Printer size={15} aria-hidden="true" />
                  In đơn chuyển kho
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}

      {confirm ? (
        <div className="modal-backdrop wr-modal-backdrop" role="presentation" onClick={() => setConfirm(null)}>
          <section
            className="wr-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wt-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <h2 id="wt-confirm-title">{confirm.title}</h2>
              <button className="wr-icon-button" type="button" onClick={() => setConfirm(null)} aria-label="Đóng">
                <X size={16} />
              </button>
            </header>
            <p>
              Bạn đang thao tác đơn <strong>{rowCode(confirm.row)}</strong>. {confirm.message}
            </p>
            <footer>
              <button className="btn btn-light" type="button" onClick={() => setConfirm(null)}>Hủy</button>
              <button className="btn btn-primary" type="button" disabled={actionLoading} onClick={() => void runAction()}>
                {actionLoading ? 'Đang xử lý...' : 'Xác nhận'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {showExportModal ? (
        <ExportExcelModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          title="Xuất Excel - Đơn chuyển kho"
          defaultFilename={`don-chuyen-kho-${new Date().toISOString().slice(0, 10)}`}
          columns={exportColumns}
          onExport={handleExcelExport}
          loading={exportLoading}
        />
      ) : null}
    </div>
  );
}
