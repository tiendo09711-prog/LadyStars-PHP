import {
  type ChangeEvent,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileDown,
  Inbox,
  MoreHorizontal,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { http } from '../../core/api/http';
import { suggestRefunds } from '../../core/api/filterSuggestions';
import { isAdminRole } from '../../core/auth/access';
import { FilterSuggestInput } from '../../core/components/ui/FilterSuggestInput';
import { ExportExcelModal, type ColumnOption } from '../product/components/ExportExcelModal';
import { buildRefundReceiptHtml, writeAndPrintPopup } from './invoicePrint';
import './refund-invoice-page.css';
import './refund-invoice-soft-type.css';

type BranchOption = { _id: string; name?: string; code?: string; isDefault?: boolean };

type RefundInvoicePageProps = {
  channel: string;
};

type RefundItem = Record<string, any>;

const PAGE_SIZE = 15;
const PRINT_WINDOW_FEATURES = 'popup=yes,width=420,height=720';

const STATUS_FILTERS = [
  { label: 'Tất cả', value: '' },
  { label: 'Hoàn tất', value: 'completed' },
  { label: 'Nháp', value: 'draft' },
  { label: 'Đã hủy', value: 'cancelled' },
] as const;

function safeDate(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('vi-VN');
}

function safeTime(value: unknown) {
  if (!value) return '';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      });
}

function safeDateTime(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

function formatMoney(value: unknown) {
  if (value === undefined || value === null || value === '') return '—';
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amount.toLocaleString('vi-VN')} đ` : '—';
}

function formatNumber(value: unknown) {
  if (value === undefined || value === null || value === '') return '—';
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString('vi-VN') : '—';
}

function statusMeta(status: unknown) {
  const value = String(status || '').toLowerCase();
  if (value === 'completed') return { label: 'Hoàn tất', tone: 'success' };
  if (value === 'cancelled') return { label: 'Đã hủy', tone: 'danger' };
  if (value === 'draft') return { label: 'Nháp', tone: 'warning' };
  return { label: status ? String(status) : '—', tone: 'neutral' };
}

function originalInvoiceCode(refund: RefundItem) {
  const payment = refund?.paymentId;
  if (payment && typeof payment === 'object') return payment.code || '—';
  if (typeof payment === 'string' && payment) return payment;
  return '—';
}

function customerName(refund: RefundItem) {
  const customer = refund?.paymentId?.customerId;
  if (customer && typeof customer === 'object') {
    return customer.name || customer.phone || '—';
  }
  return '—';
}

function customerSub(refund: RefundItem) {
  const customer = refund?.paymentId?.customerId;
  if (customer && typeof customer === 'object' && customer.phone && customer.name) {
    return String(customer.phone);
  }
  return '';
}

export function RefundInvoicePage({ channel }: RefundInvoicePageProps) {
  const navigate = useNavigate();

  const [items, setItems] = useState<RefundItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [storeId, setStoreId] = useState('');
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [currentUser, setCurrentUser] = useState<{ role?: string } | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [branchLoading, setBranchLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rowActionOpen, setRowActionOpen] = useState<string | null>(null);
  const [rowMenuPos, setRowMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);
  const hasActiveFilters = Boolean(appliedSearch || statusFilter || storeId);
  const selectedAll = items.length > 0 && items.every((item) => selectedIds.has(item._id));

  const openRowItem = rowActionOpen
    ? items.find((item) => item._id === rowActionOpen) ?? null
    : null;

  // Debounce search like DataModulePage (preserve prior behavior).
  // Cap keyword length to avoid pathological LIKE queries (RF-027).
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPage(1);
      setAppliedSearch(search.trim().slice(0, 120));
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [channel, statusFilter, storeId]);

  useEffect(() => {
    let mounted = true;
    setAuthReady(false);
    setBranchLoading(true);
    Promise.all([
      http.get('/auth/me').catch(() => ({ data: null })),
      http.get('/system/branches', { params: { limit: 5000 } }).catch(() => ({ data: { items: [] } })),
    ])
      .then(([meRes, branchRes]) => {
        if (!mounted) return;
        setCurrentUser(meRes.data?.user || meRes.data || null);
        const items: BranchOption[] = Array.isArray(branchRes.data)
          ? branchRes.data
          : branchRes.data?.items ?? [];
        setBranches(items.filter((b) => b && b._id));
      })
      .finally(() => {
        if (!mounted) return;
        setAuthReady(true);
        setBranchLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // EMPLOYEE: default store filter to first assigned warehouse.
  useEffect(() => {
    if (!authReady || branchLoading || branches.length === 0) return;
    if (isAdminRole(currentUser?.role)) return;
    const allowed = new Set(branches.map((b) => String(b._id)));
    setStoreId((current) => {
      if (current && allowed.has(String(current))) return current;
      const def = branches.find((b) => b.isDefault) || branches[0];
      return String(def._id);
    });
  }, [authReady, branchLoading, branches, currentUser?.role]);

  useEffect(() => {
    // Wait for employee default store before first list fetch.
    if (!authReady) return;
    if (!isAdminRole(currentUser?.role) && branchLoading) return;

    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError('');

    const params = new URLSearchParams();
    params.set('channel', channel);
    params.set('page', String(page));
    params.set('limit', String(PAGE_SIZE));
    if (appliedSearch) params.set('q', appliedSearch);
    if (statusFilter) params.set('status', statusFilter);
    if (storeId) params.set('storeId', storeId);

    http
      .get(`/products/refunds?${params.toString()}`, { signal: controller.signal })
      .then((response) => {
        if (!active) return;
        const responseItems = Array.isArray(response.data) ? response.data : response.data.items ?? [];
        setItems(responseItems);
        setTotal(
          Array.isArray(response.data)
            ? responseItems.length
            : Number(response.data.total ?? responseItems.length),
        );
        setSelectedIds(new Set());
      })
      .catch((err: any) => {
        if (!active || err.code === 'ERR_CANCELED' || err.name === 'CanceledError') return;
        setItems([]);
        setTotal(0);
        setError(err.response?.data?.message ?? 'Không tải được dữ liệu trả hàng.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [channel, page, appliedSearch, statusFilter, storeId, refreshKey, authReady, branchLoading, currentUser?.role]);

  useEffect(() => {
    if (!rowActionOpen) return;
    const closeMenus = () => {
      setRowActionOpen(null);
      setRowMenuPos(null);
    };
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.refund-row-action-menu')) return;
      if (target.closest('.refund-row-menu-button')) return;
      closeMenus();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenus();
    };
    const handleViewportChange = () => closeMenus();
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', handleViewportChange);
    document.addEventListener('scroll', handleViewportChange, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', handleViewportChange);
      document.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [rowActionOpen]);

  const closeRowMenu = () => {
    setRowActionOpen(null);
    setRowMenuPos(null);
  };

  const openRowActionMenu = (itemId: string, event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (rowActionOpen === itemId) {
      closeRowMenu();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 180;
    const menuHeight = 120;
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
    setRowActionOpen(itemId);
  };

  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setAppliedSearch(search.trim().slice(0, 120));
  };

  const resetFilters = () => {
    setSearch('');
    setAppliedSearch('');
    setStatusFilter('');
    if (isAdminRole(currentUser?.role)) {
      setStoreId('');
    } else if (branches.length > 0) {
      const def = branches.find((b) => b.isDefault) || branches[0];
      setStoreId(String(def._id));
    } else {
      setStoreId('');
    }
    setPage(1);
    setRefreshKey((value) => value + 1);
  };

  const handlePrint = (refund: RefundItem) => {
    closeRowMenu();
    const popup = window.open('about:blank', 'refund-invoice-print', PRINT_WINDOW_FEATURES);
    if (!popup) {
      window.alert('Trình duyệt đang chặn cửa sổ in hóa đơn. Hãy cho phép pop-up và thử lại.');
      return;
    }
    writeAndPrintPopup(popup, buildRefundReceiptHtml(refund));
  };

  const openDetail = (refund: RefundItem) => {
    closeRowMenu();
    navigate(`/sales-channels/${channel}/refund/${refund._id}`);
  };

  const toggleAll = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      setSelectedIds(new Set(items.map((item) => item._id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const exportColumns: ColumnOption[] = useMemo(
    () => [
      { label: 'Ngày', key: 'createdAt', getValue: (item: RefundItem) => safeDate(item.createdAt) },
      { label: 'Mã trả hàng', key: 'code', getValue: (item: RefundItem) => item.code || item._id || '—' },
      { label: 'Hóa đơn gốc', key: 'paymentId.code', getValue: (item: RefundItem) => originalInvoiceCode(item) },
      { label: 'Khách hàng', key: 'paymentId.customerId.name', getValue: (item: RefundItem) => customerName(item) },
      { label: 'Số lượng', key: 'amount', getValue: (item: RefundItem) => formatNumber(item.amount) },
      {
        label: 'Tiền trả khách',
        key: 'totalPayableAmount',
        getValue: (item: RefundItem) => formatMoney(item.totalPayableAmount),
      },
      { label: 'Trạng thái', key: 'status', getValue: (item: RefundItem) => statusMeta(item.status).label },
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
    try {
      let dataToExport: RefundItem[] = [];
      if (exportType === 'current') {
        dataToExport = items;
      } else {
        const buildParams = (nextPage: number, nextLimit: number) => {
          const params = new URLSearchParams();
          params.set('channel', channel);
          params.set('page', String(nextPage));
          params.set('limit', String(nextLimit));
          if (appliedSearch) params.set('q', appliedSearch);
          if (statusFilter) params.set('status', statusFilter);
          if (storeId) params.set('storeId', storeId);
          return params;
        };
        const pageSize = 100;
        const firstResponse = await http.get(`/products/refunds?${buildParams(1, pageSize).toString()}`);
        const firstItems = Array.isArray(firstResponse.data)
          ? firstResponse.data
          : firstResponse.data.items ?? [];
        let allItems: RefundItem[] = [...firstItems];
        const totalItems = Array.isArray(firstResponse.data)
          ? firstItems.length
          : Number(firstResponse.data.total ?? firstItems.length);
        if (totalItems > pageSize) {
          const pagesToFetch = Math.ceil(totalItems / pageSize);
          const responses = await Promise.all(
            Array.from({ length: pagesToFetch - 1 }, (_, index) =>
              http.get(`/products/refunds?${buildParams(index + 2, pageSize).toString()}`),
            ),
          );
          responses.forEach((response) => {
            const responseItems = Array.isArray(response.data)
              ? response.data
              : response.data.items ?? [];
            allItems = allItems.concat(responseItems);
          });
        }
        dataToExport = allItems;
      }

      if (!dataToExport.length) {
        setError('Không có dữ liệu để xuất.');
        return;
      }

      const mappedRows = dataToExport.map((item) => {
        const row: Record<string, unknown> = {};
        selectedColumns.forEach((col) => {
          const exportColumn = exportColumns.find((c) => c.key === col.key);
          row[col.customLabel] = exportColumn ? exportColumn.getValue(item) : '';
        });
        return row;
      });
      const worksheet = XLSX.utils.json_to_sheet(mappedRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      XLSX.writeFile(workbook, `${filename}.xlsx`);
      setShowExportModal(false);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Xuất Excel thất bại.');
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="refund-root refund-invoice-page">
      <section className="data-card refund-toolbar-card refund-sticky-toolbar">
        <div className="refund-toolbar-header-slot">
          <div className="refund-compact-head">
            <h1 className="refund-compact-heading-sr">Hóa đơn trả hàng</h1>
            <div className="refund-tabs-row refund-tabs-row--title-slot">
              <span className="refund-toolbar-eyebrow">Trả hàng</span>
              <span className="refund-toolbar-title-chip">
                <RotateCcw size={14} aria-hidden="true" />
                Hóa đơn trả hàng
              </span>
            </div>
          </div>
        </div>

        <div className="refund-summary-strip" aria-label="Tóm tắt Trả hàng">
          <div className="refund-summary-cluster">
            <span className="refund-summary-main">
              <strong>{total.toLocaleString('vi-VN')}</strong>
              <span>phiếu trả</span>
            </span>
            {selectedIds.size > 0 ? (
              <>
                <span className="refund-summary-divider" aria-hidden="true" />
                <span>{selectedIds.size.toLocaleString('vi-VN')} đã chọn</span>
              </>
            ) : null}
            {hasActiveFilters ? (
              <>
                <span className="refund-summary-divider" aria-hidden="true" />
                <span className="refund-summary-filter">Đang lọc</span>
              </>
            ) : null}
          </div>
        </div>

        <form className="refund-filter-bar" onSubmit={handleSearchSubmit}>
          <div className="refund-search">
            <Search size={15} aria-hidden="true" />
            <FilterSuggestInput
              bare
              value={search}
              onChange={setSearch}
              fetchSuggestions={(query, signal) => suggestRefunds(query, signal, { channel })}
              placeholder="Mã trả hàng, hóa đơn gốc, tên/SĐT khách..."
              aria-label="Tìm kiếm trả hàng"
            />
          </div>

          <select
            className="refund-filter-select"
            value={storeId}
            onChange={(event) => {
              setStoreId(event.target.value);
              setPage(1);
            }}
            aria-label="Cửa hàng / kho"
            disabled={branchLoading}
          >
            <option value="">
              {isAdminRole(currentUser?.role) ? 'Tất cả cửa hàng' : 'Tất cả kho được gán'}
            </option>
            {branches.map((branch) => (
              <option key={branch._id} value={branch._id}>
                {branch.name || branch.code || branch._id}
              </option>
            ))}
          </select>

          <select
            className="refund-filter-select"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Lọc trạng thái"
          >
            {STATUS_FILTERS.map((filter) => (
              <option key={filter.label} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>

          <div className="refund-filter-actions">
            <button className="refund-btn refund-btn-primary" type="submit">
              <Search size={14} aria-hidden="true" />
              Tìm
            </button>
            <button className="refund-btn refund-btn-secondary" type="button" onClick={resetFilters}>
              <RefreshCw size={14} aria-hidden="true" />
              Làm mới
            </button>
            <button
              className="refund-btn refund-btn-secondary"
              type="button"
              onClick={() => setShowExportModal(true)}
            >
              <FileDown size={14} aria-hidden="true" />
              Xuất Excel
            </button>
          </div>
        </form>
      </section>

      {error ? (
        <div className="refund-alert" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>Không tải được dữ liệu</strong>
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)}>
            Thử lại
          </button>
        </div>
      ) : null}

      <section className="data-card refund-table-card" aria-label="Bảng dữ liệu trả hàng">
        <div className="data-card-header refund-table-header">
          <div>
            <h2 className="refund-table-title">Bảng dữ liệu trả hàng</h2>
            <p className="refund-table-subtitle">
              {total.toLocaleString('vi-VN')} bản ghi
              {total > 0
                ? ` · Hiển thị ${rangeStart.toLocaleString('vi-VN')}–${rangeEnd.toLocaleString('vi-VN')}`
                : ''}
              {hasActiveFilters ? ' · Đang lọc' : ''}
              {' · Lịch sử hoàn trả từ bán lẻ và bán sỉ'}
            </p>
          </div>
          <span className={`refund-selected-count${selectedIds.size > 0 ? ' is-active' : ''}`}>
            {selectedIds.size > 0
              ? `${selectedIds.size.toLocaleString('vi-VN')} đã chọn`
              : 'Chưa chọn dòng'}
          </span>
        </div>

        <div className="table-scroll refund-table-scroll">
          <table className="data-table refund-data-table">
            <thead>
              <tr>
                <th className="check-cell">
                  <input
                    type="checkbox"
                    aria-label="Chọn tất cả"
                    checked={selectedAll}
                    onChange={toggleAll}
                    disabled={loading || items.length === 0}
                  />
                </th>
                <th>Ngày</th>
                <th>Mã trả hàng</th>
                <th>Hóa đơn gốc</th>
                <th>Khách hàng</th>
                <th className="number">Số lượng</th>
                <th className="number">Tiền trả khách</th>
                <th>Trạng thái</th>
                <th className="action-cell">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 6 }).map((_, rowIndex) => (
                  <tr className="refund-skeleton" key={`loading-${rowIndex}`}>
                    {Array.from({ length: 9 }).map((__, cellIndex) => (
                      <td key={cellIndex}>
                        <span />
                      </td>
                    ))}
                  </tr>
                ))}

              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={9} className="refund-empty-cell">
                    <div className="refund-empty-state">
                      <Inbox size={28} aria-hidden="true" />
                      <strong>Chưa có dữ liệu</strong>
                      <span>Thử đổi bộ lọc, từ khóa tìm kiếm hoặc tạo phiếu trả từ hóa đơn bán.</span>
                    </div>
                  </td>
                </tr>
              )}

              {!loading &&
                items.map((item) => {
                  const status = statusMeta(item.status);
                  const code = item.code || item._id || '—';
                  const customer = customerName(item);
                  const phone = customerSub(item);
                  return (
                    <tr key={item._id}>
                      <td className="check-cell">
                        <input
                          type="checkbox"
                          aria-label={`Chọn phiếu ${code}`}
                          checked={selectedIds.has(item._id)}
                          onChange={(event) => toggleOne(item._id, event.target.checked)}
                        />
                      </td>
                      <td>
                        <div className="refund-stack">
                          <strong title={safeDateTime(item.createdAt)}>{safeDate(item.createdAt)}</strong>
                          {safeTime(item.createdAt) ? <span>{safeTime(item.createdAt)}</span> : null}
                        </div>
                      </td>
                      <td className="refund-name-cell">
                        <button
                          className="refund-link-button"
                          type="button"
                          title={code}
                          onClick={() => openDetail(item)}
                        >
                          {code}
                        </button>
                      </td>
                      <td>
                        <span className="refund-code" title={originalInvoiceCode(item)}>
                          {originalInvoiceCode(item)}
                        </span>
                      </td>
                      <td className="refund-name-cell">
                        <div className="refund-name-main" title={customer}>
                          {customer}
                        </div>
                        {phone ? <div className="refund-name-sub">{phone}</div> : null}
                      </td>
                      <td className="number refund-number">{formatNumber(item.amount)}</td>
                      <td className="number refund-price">{formatMoney(item.totalPayableAmount)}</td>
                      <td>
                        <span className={`refund-status-badge ${status.tone}`}>{status.label}</span>
                      </td>
                      <td className="action-cell">
                        <div className="refund-actions">
                          <button
                            className="refund-row-menu-button"
                            type="button"
                            aria-label={`Thao tác phiếu ${code}`}
                            aria-expanded={rowActionOpen === item._id}
                            aria-haspopup="menu"
                            onClick={(event) => openRowActionMenu(item._id, event)}
                          >
                            <MoreHorizontal size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {!loading && total > 0 ? (
          <div className="refund-pagination">
            <span>
              Hiển thị {rangeStart.toLocaleString('vi-VN')}–{rangeEnd.toLocaleString('vi-VN')} /{' '}
              {total.toLocaleString('vi-VN')}
            </span>
            <div>
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                aria-label="Trang trước"
              >
                <ChevronLeft size={16} />
              </button>
              <strong>
                Trang {page} / {totalPages}
              </strong>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                aria-label="Trang sau"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {rowActionOpen && openRowItem && rowMenuPos
        ? createPortal(
            <div
              className="refund-row-action-menu refund-row-action-menu--portal"
              role="menu"
              style={{ top: rowMenuPos.top, left: rowMenuPos.left }}
              onClick={(event) => event.stopPropagation()}
            >
              <button type="button" role="menuitem" onClick={() => openDetail(openRowItem)}>
                <Eye size={15} aria-hidden="true" />
                Xem chi tiết
              </button>
              <button type="button" role="menuitem" onClick={() => handlePrint(openRowItem)}>
                <Printer size={15} aria-hidden="true" />
                In
              </button>
            </div>,
            document.body,
          )
        : null}

      {showExportModal ? (
        <ExportExcelModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          title="Xuất Excel - Trả hàng"
          defaultFilename={`tra-hang-${new Date().toISOString().slice(0, 10)}`}
          columns={exportColumns}
          onExport={handleExcelExport}
          loading={exportLoading}
        />
      ) : null}
    </div>
  );
}
