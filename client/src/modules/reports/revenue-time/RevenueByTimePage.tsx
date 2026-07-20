import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, Download, RefreshCw } from 'lucide-react';
import { fetchRevenueByTimeReport, fetchRevenueReportOptions } from './revenueByTime.api';
import type {
  DatePreset,
  RevenueFilters,
  RevenueReportOptions,
  RevenueReportResponse,
  SortField,
  TimelinePoint,
} from './revenueByTime.types';
import {
  defaultFilters,
  ensureAllowedGranularity,
  extractApiError,
  exportSummaryCsv,
  exportSummaryExcel,
  exportTimelineCsv,
  exportTimelineExcel,
  formatDateTime,
  rangeFromPreset,
  suggestedGranularity,
  validateCustomDateInputs,
  validateDateRange,
} from './revenueByTime.utils';
import { PeriodDetailModal } from './components/PeriodDetailModal';
import { RevenueBreakdownCharts } from './components/RevenueBreakdownCharts';
import { RevenueInsights } from './components/RevenueInsights';
import { RevenueReportFilters, type DateMode } from './components/RevenueReportFilters';
import { RevenueSummaryCards } from './components/RevenueSummaryCards';
import { RevenueTimelineTable } from './components/RevenueTimelineTable';
import { RevenueTrendChart } from './components/RevenueTrendChart';
import { RevenueReportNav } from '../components/RevenueReportNav';
import './revenue-by-time-page.css';
import './revenue-time-soft-type.css';

export function RevenueByTimePage() {
  const [options, setOptions] = useState<RevenueReportOptions | null>(null);
  const [draft, setDraft] = useState<RevenueFilters>(() => defaultFilters());
  const [applied, setApplied] = useState<RevenueFilters>(() => defaultFilters());
  const [preset, setPreset] = useState<DatePreset>('last_30_days');
  const [dateMode, setDateMode] = useState<DateMode>('preset');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [report, setReport] = useState<RevenueReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [filtersCollapsed, setFiltersCollapsed] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [detailPoint, setDetailPoint] = useState<TimelinePoint | null>(null);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const requestSeq = useRef(0);
  const exportRef = useRef<HTMLDivElement | null>(null);

  const loadReport = useCallback(
    async (filters: RevenueFilters, mode: 'load' | 'refresh' = 'load') => {
      const rangeErr = validateDateRange(filters.from, filters.to);
      if (rangeErr) {
        setValidationError(rangeErr);
        setError(rangeErr);
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
        const data = await fetchRevenueByTimeReport(filters, controller.signal);
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
    },
    [],
  );

  // Bootstrap options + first load. Keep request alive across StrictMode remounts.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const opts = await fetchRevenueReportOptions();
        if (active) setOptions(opts);
      } catch (err: unknown) {
        if (!active) return;
        setError(extractApiError(err));
      }

      if (!active) return;
      const filters = defaultFilters();
      setDraft(filters);
      setApplied(filters);
      setPreset('last_30_days');
      setDateMode('preset');
      setCustomFrom('');
      setCustomTo('');
      await loadReport(filters, 'load');
      if (active) setBootstrapped(true);
    })();

    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, [loadReport]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!exportRef.current) return;
      if (!exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const patchDraft = (patch: Partial<RevenueFilters>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const handleApply = () => {
    if (dateMode === 'custom') {
      const customErr = validateCustomDateInputs(customFrom, customTo);
      if (customErr) {
        setValidationError(customErr);
        setError('');
        return;
      }
      const next: RevenueFilters = {
        ...draft,
        from: customFrom,
        to: customTo,
        page: 1,
      };
      setValidationError(null);
      setDraft(next);
      void loadReport(next, 'load');
      return;
    }

    const next = { ...draft, page: 1 };
    const rangeErr = validateDateRange(next.from, next.to);
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
    setPreset('last_30_days');
    setDateMode('preset');
    setCustomFrom('');
    setCustomTo('');
    setValidationError(null);
    setError('');
    setDraft(next);
    void loadReport(next, 'load');
  };

  const handleRefresh = () => {
    if (loading || refreshing) return;
    void loadReport(applied, 'refresh');
  };

  const handleSort = (field: SortField) => {
    const next: RevenueFilters = {
      ...applied,
      sortBy: field,
      sortDirection:
        applied.sortBy === field && applied.sortDirection === 'asc' ? 'desc' : 'asc',
      page: 1,
    };
    setDraft((d) => ({ ...d, sortBy: next.sortBy, sortDirection: next.sortDirection, page: 1 }));
    void loadReport(next, 'load');
  };

  const handlePageChange = (page: number) => {
    const next = { ...applied, page };
    setDraft((d) => ({ ...d, page }));
    void loadReport(next, 'load');
  };

  const handlePerPageChange = (perPage: number) => {
    const next = { ...applied, perPage, page: 1 };
    setDraft((d) => ({ ...d, perPage, page: 1 }));
    void loadReport(next, 'load');
  };

  const handlePresetChange = (p: DatePreset) => {
    setPreset(p);
    setDateMode('preset');
    setCustomFrom('');
    setCustomTo('');
    setValidationError(null);
    const range = rangeFromPreset(p);
    const g = suggestedGranularity(range.from, range.to);
    patchDraft({ from: range.from, to: range.to, granularity: g, page: 1 });
  };

  const handleCustomDateChange = (field: 'from' | 'to', value: string) => {
    const cf = field === 'from' ? value : customFrom;
    const ct = field === 'to' ? value : customTo;
    setCustomFrom(cf);
    setCustomTo(ct);
    setDateMode('custom');
    setValidationError(null);
    const customErr = validateCustomDateInputs(cf, ct);
    if (customErr) {
      // Keep last-known effective range so granularity allow-list still works; block Apply via ValidationError.
      setValidationError(customErr);
      return;
    }
    setValidationError(null);
    // Keep last preset value for disabled select display; dateMode=custom locks it.
    // Apply custom range to effective draft so granularity chart options reflect it.
    setDraft((prev) => ({
      ...prev,
      from: cf,
      to: ct,
      granularity: ensureAllowedGranularity(prev.granularity, cf, ct),
      page: 1,
    }));
  };

  const handleViewInTable = (point: TimelinePoint) => {
    setDetailPoint(null);
    setHighlightKey(point.key);
    const el = document.getElementById('rbt-timeline-table');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => {
      const row = document.getElementById(`rbt-row-${point.key}`);
      row?.focus?.();
      row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 280);
    window.setTimeout(() => setHighlightKey(null), 4000);
  };

  const busy = loading || refreshing;
  const showCost = Boolean(report?.meta?.hasCostData);
  const timelineAll = report?.timeline ?? [];
  const tableRows = report?.table?.data ?? [];
  const attributionNotes = [
    report?.meta?.attribution?.invoiceType?.hasMeaningfulAttribution === false
      ? report.meta.attribution.invoiceType.message
      : null,
    report?.meta?.attribution?.staff?.hasMeaningfulAttribution === false
      ? report.meta.attribution.staff.message
      : null,
    report?.meta?.attribution?.saleChannel?.hasMeaningfulAttribution === false
      ? report.meta.attribution.saleChannel.message
      : null,
  ].filter(Boolean) as string[];

  return (
    <main className="rbt-page">
      {busy && <div className="rbt-progress" aria-hidden />}

      <RevenueReportNav />

      <header className="rbt-hero">
        <div>
          <h1>Doanh thu theo thời gian</h1>
          <p>Phân tích doanh thu, số lượng hóa đơn và xu hướng bán hàng theo từng khoảng thời gian.</p>
          <div className="rbt-hero-meta">
            Dữ liệu tải lúc: {formatDateTime(report?.meta?.generatedAt)}
            {report?.meta?.timezone ? ` · ${report.meta.timezone}` : ''}
          </div>
        </div>
        <div className="rbt-hero-actions">
          <button
            type="button"
            className="btn btn-light"
            onClick={handleRefresh}
            disabled={busy}
            aria-busy={refreshing}
          >
            <RefreshCw size={16} className={refreshing ? 'rbt-spin' : undefined} aria-hidden />
            Làm mới
          </button>
          <div className="rbt-export" ref={exportRef}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setExportOpen((v) => !v)}
              disabled={!report}
              aria-expanded={exportOpen}
              aria-haspopup="menu"
            >
              <Download size={16} aria-hidden />
              Xuất báo cáo
              <ChevronDown size={14} aria-hidden />
            </button>
            {exportOpen && report && (
              <div className="rbt-export-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    exportTimelineExcel(timelineAll, applied, showCost);
                    setExportOpen(false);
                  }}
                >
                  Xuất Excel bảng chi tiết
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    exportSummaryExcel(report, applied);
                    setExportOpen(false);
                  }}
                >
                  Xuất Excel dữ liệu tổng hợp
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    exportTimelineCsv(timelineAll, applied, showCost);
                    setExportOpen(false);
                  }}
                >
                  Xuất CSV bảng chi tiết (Excel VN)
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    exportSummaryCsv(report, applied);
                    setExportOpen(false);
                  }}
                >
                  Xuất CSV dữ liệu tổng hợp (Excel VN)
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <RevenueReportFilters
        draft={draft}
        preset={preset}
        dateMode={dateMode}
        customFrom={customFrom}
        customTo={customTo}
        options={options}
        validationError={validationError}
        loading={busy}
        collapsed={filtersCollapsed}
        onToggleCollapse={() => setFiltersCollapsed((v) => !v)}
        onPresetChange={handlePresetChange}
        onCustomDateChange={handleCustomDateChange}
        onDraftChange={patchDraft}
        onApply={handleApply}
        onReset={handleReset}
      />

      {error && (
        <div className="rbt-alert" role="alert">
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <AlertTriangle size={18} aria-hidden />
            <span>{error}</span>
          </div>
          <div className="rbt-alert-actions">
            <button type="button" className="btn btn-light" onClick={() => void loadReport(applied, 'load')}>
              Thử lại
            </button>
          </div>
        </div>
      )}

      {attributionNotes.length > 0 && report && (
        <div className="rbt-notice" role="status">
          <strong>Lưu ý phân loại dữ liệu</strong>
          <ul>
            {attributionNotes.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      <RevenueSummaryCards
        summary={report?.summary ?? null}
        comparison={report?.comparison?.metrics}
        loading={loading && !report}
      />

      <RevenueInsights
        report={report}
        loading={loading && !report}
        onSelectPoint={setDetailPoint}
      />

      <RevenueTrendChart
        timeline={timelineAll}
        loading={loading && !report}
        onResetFilters={handleReset}
        onSelectPoint={setDetailPoint}
      />

      <RevenueBreakdownCharts
        channels={report?.breakdowns?.channels ?? []}
        paymentMethods={report?.breakdowns?.paymentMethods ?? []}
        staff={report?.breakdowns?.staff ?? []}
        meta={report?.breakdowns?.meta}
        loading={loading && !report}
      />

      <RevenueTimelineTable
        rows={tableRows}
        totals={report?.table?.totals ?? null}
        pagination={report?.table?.pagination ?? null}
        sortBy={applied.sortBy}
        sortDirection={applied.sortDirection}
        perPage={applied.perPage}
        showCost={showCost}
        loading={loading && !report}
        highlightKey={highlightKey}
        onSort={handleSort}
        onPageChange={handlePageChange}
        onPerPageChange={handlePerPageChange}
        onRowOpen={setDetailPoint}
      />

      <PeriodDetailModal
        point={detailPoint}
        filters={applied}
        onClose={() => setDetailPoint(null)}
        onViewInTable={handleViewInTable}
      />

      {!bootstrapped && !report && !error && (
        <div className="rbt-empty" aria-busy="true">
          <p>Đang khởi tạo báo cáo…</p>
        </div>
      )}
    </main>
  );
}

export default RevenueByTimePage;
