import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ChevronDown, Download, Eye, RefreshCw, X } from 'lucide-react';
import { suggestProducts } from '../../../core/api/filterSuggestions';
import { FilterSuggestInput } from '../../../core/components/ui/FilterSuggestInput';
import { useProductScanTarget } from '../../../core/hooks/productScanner';
import { InventoryReportShell } from './components/InventoryReportShell';
import {
  fetchAllInOutStockRows,
  fetchInOutBillDetail,
  fetchInOutStockOptions,
  fetchInOutStockReport,
  fetchInventoryReconciliation,
} from './in-out/inOutStock.api';
import type { InventoryReconciliationResponse } from './in-out/inOutStock.api';
import type {
  InOutBillDetail,
  InOutStockFilters,
  InOutStockOptions,
  InOutStockReportResponse,
  InOutStockRow,
  InOutTimelinePoint,
} from './in-out/inOutStock.types';
import {
  buildInOutCsv,
  defaultFilters,
  downloadTextFile,
  exportFilename,
  extractApiError,
  formatDisplayDateTime,
  formatMoney,
  formatNumber,
  isEmptyReport,
  resolveBillDetailKey,
  validateDateRange,
} from './in-out/inOutStock.utils';
import './in-out/in-out-stock-page.css';
import './in-out/in-out-stock-soft-type.css';

function billDetailTitle(detail: InOutBillDetail): string {
  const code = detail.code || detail.billCode || detail.sourceId || '—';
  if (detail.kind === 'TRANSFER' || detail.source === 'warehouse-transfer') {
    return `Phiếu chuyển kho: ${code}`;
  }
  if (detail.type === 'IMPORT') return `Hóa đơn nhập kho: ${code}`;
  if (detail.type === 'EXPORT') return `Hóa đơn xuất kho: ${code}`;
  return `Chi tiết phiếu: ${code}`;
}

function billWarehouseLabel(detail: InOutBillDetail): string {
  if (detail.kind === 'TRANSFER' || detail.source === 'warehouse-transfer') {
    return `${detail.fromWarehouseName || '—'} → ${detail.toWarehouseName || '—'}`;
  }
  return detail.warehouseName || '—';
}

export function InventoryInOutStockPage() {
  const [options, setOptions] = useState<InOutStockOptions | null>(null);
  const [draft, setDraft] = useState<InOutStockFilters>(() => defaultFilters());
  const [applied, setApplied] = useState<InOutStockFilters>(() => defaultFilters());
  const [report, setReport] = useState<InOutStockReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [filtersCollapsed, setFiltersCollapsed] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [reconciliation, setReconciliation] = useState<InventoryReconciliationResponse | null>(null);
  const [reconciliationError, setReconciliationError] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<InOutTimelinePoint | null>(null);
  const [periodRows, setPeriodRows] = useState<InOutStockRow[]>([]);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [periodError, setPeriodError] = useState('');
  const [billDetail, setBillDetail] = useState<InOutBillDetail | null>(null);
  const [billDetailLoading, setBillDetailLoading] = useState(false);
  const [billDetailError, setBillDetailError] = useState('');
  const [billDetailOpen, setBillDetailOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const requestSeq = useRef(0);
  const periodRequestSeq = useRef(0);
  const billDetailRequestSeq = useRef(0);
  const periodCloseRef = useRef<HTMLButtonElement | null>(null);
  const billDetailCloseRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const productSearchRef = useRef<HTMLInputElement>(null);

  const loadReport = useCallback(async (filters: InOutStockFilters, mode: 'load' | 'refresh' = 'load') => {
    const maxDays = options?.maxRangeDays ?? 366;
    const rangeErr = validateDateRange(filters.fromDate, filters.toDate, maxDays);
    if (rangeErr) {
      setValidationError(rangeErr);
      setError('');
      return;
    }
    setValidationError(null);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++requestSeq.current;

    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const data = await fetchInOutStockReport(filters, controller.signal);
      if (seq !== requestSeq.current) return;
      setReport(data);
      setApplied(filters);
    } catch (err: unknown) {
      if (
        (err as { code?: string; name?: string })?.code === 'ERR_CANCELED' ||
        (err as { name?: string })?.name === 'CanceledError'
      ) {
        return;
      }
      if (seq !== requestSeq.current) return;
      setError(extractApiError(err));
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }

    // Reconciliation is secondary: do not keep the whole page aria-busy while it loads.
    if (seq !== requestSeq.current) return;
    try {
      setReconciliation(await fetchInventoryReconciliation(filters, controller.signal));
      if (seq === requestSeq.current) setReconciliationError(false);
    } catch (reconcileErr: unknown) {
      if ((reconcileErr as { code?: string })?.code === 'ERR_CANCELED') return;
      if (seq !== requestSeq.current) return;
      setReconciliation(null);
      setReconciliationError(true);
    }
  }, [options?.maxRangeDays]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const opts = await fetchInOutStockOptions();
        if (active) setOptions(opts);
      } catch (err: unknown) {
        if (!active) return;
        setError(extractApiError(err));
      }
      if (!active) return;
      const filters = defaultFilters();
      setDraft(filters);
      setApplied(filters);
      await loadReport(filters, 'load');
    })();
    return () => {
      active = false;
      abortRef.current?.abort();
    };
    // Bootstrap once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patchDraft = (patch: Partial<InOutStockFilters>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const handleApply = () => {
    const next = { ...draft, page: 1 };
    const rangeErr = validateDateRange(next.fromDate, next.toDate, options?.maxRangeDays ?? 366);
    if (rangeErr) {
      setValidationError(rangeErr);
      return;
    }
    setValidationError(null);
    setDraft(next);
    void loadReport(next, 'load');
  };

  const handleReset = () => {
    const next = defaultFilters();
    setValidationError(null);
    setError('');
    setDraft(next);
    void loadReport(next, 'load');
  };

  useProductScanTarget(productSearchRef, (rawBarcode) => {
    const query = rawBarcode.trim();
    if (!query) return;
    setDraft((prev) => {
      const next = { ...prev, q: query, page: 1 };
      window.setTimeout(() => {
        void loadReport(next, 'load');
        productSearchRef.current?.focus();
      }, 0);
      return next;
    });
  });

  const handleRefresh = () => {
    if (loading || refreshing) return;
    void loadReport(applied, 'refresh');
  };

  const handleSort = (field: InOutStockFilters['sortBy']) => {
    const next: InOutStockFilters = {
      ...applied,
      sortBy: field,
      sortDir: applied.sortBy === field && applied.sortDir === 'asc' ? 'desc' : 'asc',
      page: 1,
    };
    setDraft((d) => ({ ...d, sortBy: next.sortBy, sortDir: next.sortDir, page: 1 }));
    void loadReport(next, 'load');
  };

  const handlePageChange = (page: number) => {
    const next = { ...applied, page };
    setDraft((d) => ({ ...d, page }));
    void loadReport(next, 'load');
  };

  const handleExport = async () => {
    if (exporting || loading) return;
    if (isEmptyReport(report)) {
      setError('Không có dữ liệu để xuất.');
      return;
    }
    setExporting(true);
    setError('');
    try {
      const rows = await fetchAllInOutStockRows(applied);
      if (!rows.length) {
        setError('Không có dữ liệu để xuất.');
        return;
      }
      const csv = buildInOutCsv(rows);
      downloadTextFile(csv, exportFilename(applied.fromDate, applied.toDate), 'text/csv;charset=utf-8');
    } catch (err: unknown) {
      setError(extractApiError(err));
    } finally {
      setExporting(false);
    }
  };

  const closePeriodDetail = useCallback(() => {
    periodRequestSeq.current += 1;
    setSelectedPeriod(null);
    setPeriodRows([]);
    setPeriodError('');
  }, []);

  const closeBillDetail = useCallback(() => {
    billDetailRequestSeq.current += 1;
    setBillDetailOpen(false);
    setBillDetail(null);
    setBillDetailError('');
    setBillDetailLoading(false);
  }, []);

  const openBillDetail = useCallback(async (row: InOutStockRow) => {
    const key = resolveBillDetailKey(row);
    if (!key) return;

    setBillDetailOpen(true);
    setBillDetail(null);
    setBillDetailError('');
    setBillDetailLoading(true);
    const seq = ++billDetailRequestSeq.current;

    try {
      const detail = await fetchInOutBillDetail(key.source, key.sourceId);
      if (seq !== billDetailRequestSeq.current) return;
      setBillDetail(detail);
    } catch (err: unknown) {
      if (seq !== billDetailRequestSeq.current) return;
      setBillDetailError(extractApiError(err) || 'Không tải được chi tiết phiếu.');
    } finally {
      if (seq === billDetailRequestSeq.current) setBillDetailLoading(false);
    }
  }, []);

  const handlePeriodClick = async (state: { activePayload?: Array<{ payload?: InOutTimelinePoint }> }) => {
    const point = state?.activePayload?.[0]?.payload;
    if (!point) return;
    setSelectedPeriod(point);
    setPeriodRows([]);
    setPeriodError('');
    setPeriodLoading(true);
    const seq = ++periodRequestSeq.current;
    try {
      const rows = await fetchAllInOutStockRows({
        ...applied,
        fromDate: point.periodKey,
        toDate: point.periodKey,
        page: 1,
      });
      if (seq !== periodRequestSeq.current) return;
      setPeriodRows(rows);
    } catch (err: unknown) {
      if (seq !== periodRequestSeq.current) return;
      setPeriodError(extractApiError(err));
    } finally {
      if (seq === periodRequestSeq.current) setPeriodLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedPeriod && !billDetailOpen) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    if (billDetailOpen) {
      billDetailCloseRef.current?.focus();
    } else {
      periodCloseRef.current?.focus();
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (billDetailOpen) {
        closeBillDetail();
        return;
      }
      if (selectedPeriod) closePeriodDetail();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [billDetailOpen, closeBillDetail, closePeriodDetail, selectedPeriod]);

  const renderViewAction = (row: InOutStockRow) => {
    const key = resolveBillDetailKey(row);
    if (!key) return '—';
    return (
      <button
        type="button"
        className="inout-view-link"
        onClick={() => void openBillDetail(row)}
        aria-label={`Xem chi tiết ${row.billCode || 'giao dịch'}`}
        title="Xem chi tiết"
      >
        <Eye size={16} aria-hidden="true" />
      </button>
    );
  };

  const busy = loading || refreshing;
  const summary = report?.summary;
  const timeline = report?.timeline ?? [];
  const tableRows = report?.table?.data ?? [];
  const pagination = report?.table?.pagination;
  const showValue = Boolean(options?.capabilities?.valueMetrics ?? report?.meta?.capabilities?.valueMetrics);
  const empty = !loading && !error && isEmptyReport(report);
  const chartHasData = timeline.some((p) => (p.qtyIn || 0) !== 0 || (p.qtyOut || 0) !== 0);

  const lastUpdatedLabel = useMemo(() => {
    if (!report?.meta?.generatedAt) return null;
    return formatDisplayDateTime(report.meta.generatedAt);
  }, [report?.meta?.generatedAt]);

  const sortAria = (field: InOutStockFilters['sortBy']): 'ascending' | 'descending' | 'none' => {
    if (applied.sortBy !== field) return 'none';
    return applied.sortDir === 'asc' ? 'ascending' : 'descending';
  };

  return (
    <InventoryReportShell className="inout-stock-root" lastUpdatedLabel={lastUpdatedLabel}>
      <div className="inout-page" data-testid="inout-stock-page" aria-busy={busy || undefined}>
        {busy ? <div className="inout-progress" aria-hidden /> : null}

        <section className="inout-filters inout-filters--sticky" aria-labelledby="inout-filters-title">
          <div className="inout-filters__head">
            <h2 id="inout-filters-title">Bộ lọc</h2>
            <button
              type="button"
              className="inout-filters__toggle"
              aria-expanded={!filtersCollapsed}
              onClick={() => setFiltersCollapsed((v) => !v)}
            >
              <ChevronDown size={14} style={{ transform: filtersCollapsed ? 'rotate(-90deg)' : undefined }} />
              {filtersCollapsed ? 'Mở bộ lọc' : 'Thu gọn'}
            </button>
          </div>

          {!filtersCollapsed ? (
            <>
              <div className="inout-filters__grid">
                <div className="inout-field">
                  <label htmlFor="inout-from">Từ ngày</label>
                  <input
                    id="inout-from"
                    type="date"
                    value={draft.fromDate}
                    onChange={(e) => patchDraft({ fromDate: e.target.value })}
                  />
                </div>
                <div className="inout-field">
                  <label htmlFor="inout-to">Đến ngày</label>
                  <input
                    id="inout-to"
                    type="date"
                    value={draft.toDate}
                    onChange={(e) => patchDraft({ toDate: e.target.value })}
                  />
                </div>
                <div className="inout-field">
                  <label htmlFor="inout-warehouse">Kho / chi nhánh</label>
                  <select
                    id="inout-warehouse"
                    value={draft.warehouseId}
                    onChange={(e) => patchDraft({ warehouseId: e.target.value })}
                  >
                    <option value="">Tất cả kho</option>
                    {(options?.warehouses ?? []).map((w) => (
                      <option key={w.value} value={w.value}>{w.label}</option>
                    ))}
                  </select>
                </div>
                <div className="inout-field">
                  <label htmlFor="inout-type">Loại giao dịch</label>
                  <select
                    id="inout-type"
                    value={draft.type}
                    onChange={(e) => patchDraft({ type: e.target.value })}
                  >
                    <option value="">Tất cả loại</option>
                    {(options?.types ?? []).map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="inout-field">
                  <label htmlFor="inout-q">Từ khóa</label>
                  <FilterSuggestInput
                    id="inout-q"
                    ref={productSearchRef}
                    data-product-search-scan="true"
                    data-product-search-primary="true"
                    placeholder="Mã phiếu, mã SP, quét barcode..."
                    value={draft.q}
                    onChange={(next) => patchDraft({ q: next })}
                    fetchSuggestions={suggestProducts}
                    aria-label="Từ khóa xuất nhập tồn"
                  />
                </div>
                <div className="inout-field">
                  <label htmlFor="inout-per-page">Số dòng / trang</label>
                  <select
                    id="inout-per-page"
                    value={draft.perPage}
                    onChange={(e) => patchDraft({ perPage: Number(e.target.value) || 20 })}
                  >
                    {(options?.perPageOptions ?? [20, 50, 100]).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </div>

              {validationError ? (
                <p className="inout-validation" role="alert">{validationError}</p>
              ) : null}

              <div className="inout-actions inout-filter-actions">
                {/* Apply/Reset stay enabled so users can supersede in-flight requests (stale abort). */}
                <button type="button" className="inout-btn inout-btn--primary" onClick={handleApply}>
                  Áp dụng
                </button>
                <button type="button" className="inout-btn inout-btn--secondary" onClick={handleReset}>
                  Đặt lại
                </button>
                <button type="button" className="inout-btn inout-btn--ghost" onClick={handleRefresh} disabled={busy}>
                  <RefreshCw size={14} /> Làm mới
                </button>
                <button
                  type="button"
                  className="inout-btn inout-btn--ghost"
                  onClick={() => void handleExport()}
                  disabled={exporting || loading}
                  title={empty ? 'Không có dữ liệu để xuất' : undefined}
                >
                  <Download size={14} /> {exporting ? 'Đang xuất...' : 'Xuất CSV'}
                </button>
                {refreshing ? <span className="inout-refreshing-badge">Đang làm mới...</span> : null}
              </div>
            </>
          ) : null}
        </section>

        {error ? (
          <div className="inout-error" role="alert">
            <span>{error}</span>
            <button type="button" className="inout-btn inout-btn--secondary" onClick={handleRefresh}>
              Thử lại
            </button>
          </div>
        ) : null}

        <section className="inout-reconciliation" aria-label="Đối soát tồn kho" data-testid="inventory-reconciliation">
          <div>
            <strong>Đối soát tồn đầu + nhập - xuất = tồn cuối</strong>
            {reconciliation ? (
              <span>
                {reconciliation.summary.reconciledRows.toLocaleString('vi-VN')} dòng đã xác minh
                {' · '}{reconciliation.summary.incompleteRows.toLocaleString('vi-VN')} dòng chưa đủ lịch sử
                {' · '}{reconciliation.summary.varianceRows.toLocaleString('vi-VN')} dòng chênh lệch
              </span>
            ) : (
              <span>{reconciliationError ? 'Chưa tải được dữ liệu đối soát; báo cáo biến động vẫn hoạt động bình thường.' : 'Đang tải dữ liệu đối soát...'}</span>
            )}
          </div>
          {reconciliation ? (
            <span className={reconciliation.summary.varianceRows > 0 ? 'is-warning' : reconciliation.summary.incompleteRows > 0 ? 'is-neutral' : 'is-verified'}>
              {reconciliation.summary.varianceRows > 0 ? 'Có chênh lệch' : reconciliation.summary.incompleteRows > 0 ? 'Chưa đủ lịch sử' : 'Đã xác minh'}
            </span>
          ) : null}
        </section>

        <section className="inout-kpi-grid" aria-label="Chỉ số xuất nhập tồn">
          {loading && !report ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div className="inout-kpi" key={i}><span className="inout-skeleton" style={{ width: '60%' }} /><strong className="inout-skeleton" style={{ width: '40%', height: 22 }} /></div>
            ))
          ) : (
            <>
              <div className="inout-kpi">
                <span>Tổng nhập</span>
                <strong className="is-pos" data-testid="kpi-total-in">{formatNumber(summary?.totalIn ?? 0)}</strong>
              </div>
              <div className="inout-kpi">
                <span>Tổng xuất</span>
                <strong className="is-neg" data-testid="kpi-total-out">{formatNumber(summary?.totalOut ?? 0)}</strong>
              </div>
              <div className="inout-kpi">
                <span>Biến động ròng</span>
                <strong
                  className={(summary?.netQty ?? 0) >= 0 ? 'is-pos' : 'is-neg'}
                  data-testid="kpi-net"
                >
                  {formatNumber(summary?.netQty ?? 0)}
                </strong>
              </div>
              <div className="inout-kpi">
                <span>Số chứng từ</span>
                <strong data-testid="kpi-docs">{formatNumber(summary?.documentCount ?? 0)}</strong>
              </div>
              {showValue ? (
                <div className="inout-kpi">
                  <span>Giá trị nhập / xuất</span>
                  <strong data-testid="kpi-value">
                    {formatMoney(summary?.valueIn ?? 0)} / {formatMoney(summary?.valueOut ?? 0)}
                  </strong>
                </div>
              ) : null}
            </>
          )}
        </section>

        <section className="inout-card" aria-labelledby="inout-chart-title">
          <h2 id="inout-chart-title">Biến động theo thời gian</h2>
          <div className="inout-card__meta">Hai series chính: Nhập và Xuất trên toàn bộ dữ liệu đã lọc.</div>
          {loading && !report ? (
            <div className="inout-empty"><span className="inout-skeleton" style={{ width: '70%', height: 180 }} /></div>
          ) : !chartHasData ? (
            <div className="inout-empty" data-testid="inout-chart-empty">Không có dữ liệu biểu đồ trong khoảng đã chọn.</div>
          ) : (
            <div className="inout-chart" data-testid="inout-chart">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={timeline} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} onClick={handlePeriodClick}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.08)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatNumber(value), name]}
                    labelFormatter={(label) => `Kỳ: ${label}`}
                  />
                  <Legend />
                  <Bar dataKey="qtyIn" name="Nhập" fill="#059669" radius={[3, 3, 0, 0]} cursor="pointer" />
                  <Bar dataKey="qtyOut" name="Xuất" fill="#dc2626" radius={[3, 3, 0, 0]} cursor="pointer" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {(report?.breakdowns?.byType?.length ?? 0) > 0 ? (
          <section className="inout-card" aria-labelledby="inout-breakdown-title">
            <h2 id="inout-breakdown-title">Theo loại giao dịch</h2>
            <div className="inout-table-wrap">
              <table className="inout-table">
                <thead>
                  <tr>
                    <th>Loại</th>
                    <th className="num">Nhập</th>
                    <th className="num">Xuất</th>
                    <th className="num">Số dòng</th>
                  </tr>
                </thead>
                <tbody>
                  {report!.breakdowns.byType.map((row) => (
                    <tr key={row.type}>
                      <td>{row.label}</td>
                      <td className="num">{formatNumber(row.qtyIn)}</td>
                      <td className="num">{formatNumber(row.qtyOut)}</td>
                      <td className="num">{formatNumber(row.lineCount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="inout-card" aria-labelledby="inout-table-title">
          <h2 id="inout-table-title">Chi tiết giao dịch</h2>
          <div className="inout-card__meta">
            {pagination
              ? `${formatNumber(pagination.total)} dòng · trang ${pagination.page}/${pagination.totalPages}`
              : '—'}
          </div>

          {empty ? (
            <div className="inout-empty" data-testid="inout-table-empty">
              Không có giao dịch kho trong bộ lọc hiện tại.
            </div>
          ) : (
            <div className="inout-table-wrap">
              <table className="inout-table" data-testid="inout-table">
                <thead>
                  <tr>
                    <th aria-sort={sortAria('date')}>
                      <button type="button" onClick={() => handleSort('date')}>Thời gian</button>
                    </th>
                    <th aria-sort={sortAria('billCode')}>
                      <button type="button" onClick={() => handleSort('billCode')}>Mã chứng từ</button>
                    </th>
                    <th aria-sort={sortAria('type')}>
                      <button type="button" onClick={() => handleSort('type')}>Loại</button>
                    </th>
                    <th aria-sort={sortAria('warehouseName')}>
                      <button type="button" onClick={() => handleSort('warehouseName')}>Kho</button>
                    </th>
                    <th aria-sort={sortAria('productName')}>
                      <button type="button" onClick={() => handleSort('productName')}>Sản phẩm</button>
                    </th>
                    <th className="num" aria-sort={sortAria('qtyIn')}>
                      <button type="button" onClick={() => handleSort('qtyIn')}>Nhập</button>
                    </th>
                    <th className="num" aria-sort={sortAria('qtyOut')}>
                      <button type="button" onClick={() => handleSort('qtyOut')}>Xuất</button>
                    </th>
                    <th>Người tạo</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && !report ? (
                    <tr>
                      <td colSpan={9}><div className="inout-skeleton" style={{ height: 40 }} /></td>
                    </tr>
                  ) : (
                    tableRows.map((row) => (
                      <tr key={row.id}>
                        <td>{formatDisplayDateTime(row.date)}</td>
                        <td>{row.billCode || '—'}</td>
                        <td>{row.typeLabel || row.type || '—'}</td>
                        <td>{row.warehouseName || '—'}</td>
                        <td>
                          {[row.productCode, row.productName].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td className="num">{formatNumber(row.qtyIn)}</td>
                        <td className="num">{formatNumber(row.qtyOut)}</td>
                        <td>{row.createdByName || '—'}</td>
                        <td className="inout-actions-cell">{renderViewAction(row)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {pagination && pagination.totalPages > 1 ? (
            <div className="inout-pagination">
              <div className="inout-pagination__info">
                Trang {pagination.page} / {pagination.totalPages}
              </div>
              <div className="inout-actions">
                <button
                  type="button"
                  className="inout-btn inout-btn--secondary"
                  disabled={busy || pagination.page <= 1}
                  onClick={() => handlePageChange(pagination.page - 1)}
                >
                  Trước
                </button>
                <button
                  type="button"
                  className="inout-btn inout-btn--secondary"
                  disabled={busy || pagination.page >= pagination.totalPages}
                  onClick={() => handlePageChange(pagination.page + 1)}
                >
                  Sau
                </button>
              </div>
            </div>
          ) : null}
        </section>

        {selectedPeriod ? (
          <div className="inout-modal-backdrop" role="presentation" onMouseDown={closePeriodDetail}>
            <section className="inout-modal" role="dialog" aria-modal="true" aria-labelledby="inout-period-title" onMouseDown={(event) => event.stopPropagation()}>
              <header className="inout-modal__head">
                <div>
                  <h2 id="inout-period-title">Chi tiết xuất nhập ngày {selectedPeriod.label}</h2>
                  <p>{formatNumber(selectedPeriod.lineCount)} dòng · Nhập {formatNumber(selectedPeriod.qtyIn)} · Xuất {formatNumber(selectedPeriod.qtyOut)}</p>
                </div>
                <button ref={periodCloseRef} type="button" className="inout-modal__close" onClick={closePeriodDetail} aria-label="Đóng chi tiết"><X size={18} aria-hidden="true" /></button>
              </header>
              <div className="inout-modal__body">
                {periodLoading ? <div className="inout-empty" aria-busy="true">Đang tải chi tiết giao dịch...</div> : periodError ? (
                  <div className="inout-error" role="alert">{periodError}</div>
                ) : periodRows.length === 0 ? <div className="inout-empty">Không có giao dịch trong kỳ đã chọn.</div> : (
                  <div className="inout-table-wrap">
                    <table className="inout-table inout-period-table">
                      <thead><tr><th>Thời gian</th><th>Mã chứng từ</th><th>Loại</th><th>Kho</th><th>Sản phẩm</th><th>Nhập</th><th>Xuất</th><th>Thao tác</th></tr></thead>
                      <tbody>{periodRows.map((row) => (
                        <tr key={row.id}>
                          <td>{formatDisplayDateTime(row.date)}</td><td>{row.billCode || '—'}</td><td>{row.typeLabel || row.type || '—'}</td>
                          <td>{row.warehouseName || '—'}</td><td>{[row.productCode, row.productName].filter(Boolean).join(' · ') || '—'}</td>
                          <td className="num">{formatNumber(row.qtyIn)}</td><td className="num">{formatNumber(row.qtyOut)}</td>
                          <td className="inout-actions-cell">{renderViewAction(row)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : null}

        {billDetailOpen ? (
          <div className="inout-modal-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.currentTarget === event.target && !billDetailLoading) closeBillDetail();
          }}>
            <section
              className="inout-modal inout-bill-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="inout-bill-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <header className="inout-modal__head">
                <div>
                  <p className="inout-bill-eyebrow">{billDetail?.kindLabel || billDetail?.type || 'Chi tiết phiếu'}</p>
                  <h2 id="inout-bill-title">
                    {billDetailLoading
                      ? 'Đang tải chi tiết phiếu...'
                      : billDetail
                        ? billDetailTitle(billDetail)
                        : 'Chi tiết phiếu'}
                  </h2>
                </div>
                <button
                  ref={billDetailCloseRef}
                  type="button"
                  className="inout-modal__close"
                  onClick={closeBillDetail}
                  aria-label="Đóng chi tiết phiếu"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </header>
              <div className="inout-modal__body">
                {billDetailLoading ? (
                  <div className="inout-empty" aria-busy="true">Đang tải chi tiết phiếu...</div>
                ) : billDetailError ? (
                  <div className="inout-error" role="alert">{billDetailError}</div>
                ) : billDetail ? (
                  <>
                    <div className="inout-bill-summary">
                      <div><span>Kho hàng</span><strong>{billWarehouseLabel(billDetail)}</strong></div>
                      <div><span>Thời gian</span><strong>{formatDisplayDateTime(billDetail.date)}</strong></div>
                      <div><span>Người tạo</span><strong>{billDetail.createdByName || '—'}</strong></div>
                      <div><span>Tổng tiền</span><strong>{formatMoney(billDetail.totalAmount)}</strong></div>
                      {billDetail.customerName ? (
                        <div><span>Khách hàng</span><strong>{billDetail.customerName}</strong></div>
                      ) : null}
                      {billDetail.relatedCode ? (
                        <div><span>Phiếu liên quan</span><strong>{billDetail.relatedCode}</strong></div>
                      ) : null}
                      <div className="wide"><span>Ghi chú</span><strong>{billDetail.note || '—'}</strong></div>
                    </div>
                    <div className="inout-table-wrap">
                      <table className="inout-table inout-bill-items-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Sản phẩm</th>
                            <th>Mã</th>
                            <th className="num">SL</th>
                            <th className="num">Giá</th>
                            <th className="num">Tổng</th>
                            <th>Ghi chú</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(billDetail.items || []).map((item, index) => (
                            <tr key={item.rowKey || `${item.productCode || 'item'}-${index}`}>
                              <td>{index + 1}</td>
                              <td>
                                <strong>{item.productName || '—'}</strong>
                                {item.barcode ? <div className="inout-muted">{item.barcode}</div> : null}
                              </td>
                              <td>{item.productCode || '—'}</td>
                              <td className="num">{formatNumber(item.quantity)}</td>
                              <td className="num">{formatMoney(item.unitPrice)}</td>
                              <td className="num">{formatMoney(item.totalAmount)}</td>
                              <td>{item.note || '—'}</td>
                            </tr>
                          ))}
                          {!(billDetail.items || []).length ? (
                            <tr>
                              <td className="inout-empty" colSpan={7}>Phiếu chưa có dòng sản phẩm.</td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="inout-empty">Không có dữ liệu chi tiết.</div>
                )}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </InventoryReportShell>
  );
}
