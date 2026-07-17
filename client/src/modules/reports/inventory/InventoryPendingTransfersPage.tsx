import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RefreshCw } from 'lucide-react';
import { InventoryReportShell } from './components/InventoryReportShell';
import { fetchPendingTransferOptions, fetchPendingTransfersReport } from './pending/pendingTransfers.api';
import type {
  PendingTransferFilters,
  PendingTransferOptions,
  PendingTransfersReportResponse,
} from './pending/pendingTransfers.types';
import { extractApiError, formatDisplayDateTime, formatNumber } from './in-out/inOutStock.utils';
import './in-out/in-out-stock-page.css';

function defaultPendingFilters(): PendingTransferFilters {
  return {
    q: '',
    sourceWarehouseId: '',
    destinationWarehouseId: '',
    status: '',
    fromDate: '',
    toDate: '',
    minWaitingDays: '',
    page: 1,
    perPage: 20,
    sortBy: 'waitingDays',
    sortDir: 'desc',
  };
}

export function InventoryPendingTransfersPage() {
  const [options, setOptions] = useState<PendingTransferOptions | null>(null);
  const [draft, setDraft] = useState<PendingTransferFilters>(() => defaultPendingFilters());
  const [applied, setApplied] = useState<PendingTransferFilters>(() => defaultPendingFilters());
  const [report, setReport] = useState<PendingTransfersReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const requestSeq = useRef(0);

  const loadReport = useCallback(async (filters: PendingTransferFilters, mode: 'load' | 'refresh' = 'load') => {
    if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
      setValidationError('Từ ngày không được sau Đến ngày.');
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
      const data = await fetchPendingTransfersReport(filters, controller.signal);
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
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const opts = await fetchPendingTransferOptions();
        if (active) setOptions(opts);
      } catch (err: unknown) {
        if (active) setError(extractApiError(err));
      }
      if (!active) return;
      const filters = defaultPendingFilters();
      setDraft(filters);
      await loadReport(filters, 'load');
    })();
    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, [loadReport]);

  const patchDraft = (patch: Partial<PendingTransferFilters>) => setDraft((p) => ({ ...p, ...patch }));
  const handleApply = () => {
    const next = { ...draft, page: 1 };
    setDraft(next);
    void loadReport(next, 'load');
  };
  const handleReset = () => {
    const next = defaultPendingFilters();
    setDraft(next);
    setValidationError(null);
    void loadReport(next, 'load');
  };
  const handleRefresh = () => {
    if (loading || refreshing) return;
    void loadReport(applied, 'refresh');
  };

  const summary = report?.summary;
  const rows = report?.table?.data ?? [];
  const empty = !loading && !error && (report?.table?.pagination?.total ?? 0) === 0;
  const busy = loading || refreshing;

  return (
    <InventoryReportShell lastUpdatedLabel={report?.meta?.generatedAt ? formatDisplayDateTime(report.meta.generatedAt) : null}>
      <div className="inout-page" data-testid="pending-transfers-page" aria-busy={busy || undefined}>
        {busy ? <div className="inout-progress" aria-hidden /> : null}

        <section className="inout-filters" aria-labelledby="pending-filters-title">
          <div className="inout-filters__head">
            <h2 id="pending-filters-title">Bộ lọc</h2>
          </div>
          <div className="inout-filters__grid">
            <div className="inout-field">
              <label htmlFor="pending-q">Mã chuyển kho</label>
              <input id="pending-q" value={draft.q} onChange={(e) => patchDraft({ q: e.target.value })} />
            </div>
            <div className="inout-field">
              <label htmlFor="pending-source">Kho nguồn</label>
              <select id="pending-source" value={draft.sourceWarehouseId} onChange={(e) => patchDraft({ sourceWarehouseId: e.target.value })}>
                <option value="">Tất cả</option>
                {(options?.warehouses ?? []).map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
              </select>
            </div>
            <div className="inout-field">
              <label htmlFor="pending-dest">Kho đích</label>
              <select id="pending-dest" value={draft.destinationWarehouseId} onChange={(e) => patchDraft({ destinationWarehouseId: e.target.value })}>
                <option value="">Tất cả</option>
                {(options?.warehouses ?? []).map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
              </select>
            </div>
            <div className="inout-field">
              <label htmlFor="pending-status">Trạng thái chờ</label>
              <select id="pending-status" value={draft.status} onChange={(e) => patchDraft({ status: e.target.value })}>
                <option value="">Tất cả trạng thái chờ</option>
                {(options?.statuses ?? []).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="inout-field">
              <label htmlFor="pending-from">Từ ngày tạo</label>
              <input id="pending-from" type="date" value={draft.fromDate} onChange={(e) => patchDraft({ fromDate: e.target.value })} />
            </div>
            <div className="inout-field">
              <label htmlFor="pending-to">Đến ngày tạo</label>
              <input id="pending-to" type="date" value={draft.toDate} onChange={(e) => patchDraft({ toDate: e.target.value })} />
            </div>
            <div className="inout-field">
              <label htmlFor="pending-min-wait">Số ngày chờ tối thiểu</label>
              <input id="pending-min-wait" type="number" min={0} value={draft.minWaitingDays} onChange={(e) => patchDraft({ minWaitingDays: e.target.value })} />
            </div>
          </div>
          {validationError ? <p className="inout-validation" role="alert">{validationError}</p> : null}
          <div className="inout-actions">
            <button type="button" className="inout-btn inout-btn--primary" onClick={handleApply}>Áp dụng</button>
            <button type="button" className="inout-btn inout-btn--secondary" onClick={handleReset}>Đặt lại</button>
            <button type="button" className="inout-btn inout-btn--ghost" onClick={handleRefresh} disabled={busy}>
              <RefreshCw size={14} /> Làm mới
            </button>
            {refreshing ? <span className="inout-refreshing-badge">Đang làm mới...</span> : null}
          </div>
        </section>

        {error ? (
          <div className="inout-error" role="alert">
            <span>{error}</span>
            <button type="button" className="inout-btn inout-btn--secondary" onClick={handleRefresh}>Thử lại</button>
          </div>
        ) : null}

        <section className="inout-kpi-grid" aria-label="KPI chờ xác nhận">
          <div className="inout-kpi"><span>Tổng chưa hoàn tất</span><strong data-testid="pending-kpi-total">{formatNumber(summary?.totalPending ?? 0)}</strong></div>
          <div className="inout-kpi"><span>Chờ kho nguồn</span><strong data-testid="pending-kpi-source">{formatNumber(summary?.waitingSource ?? 0)}</strong></div>
          <div className="inout-kpi"><span>Đang chuyển</span><strong data-testid="pending-kpi-transit">{formatNumber(summary?.inTransit ?? 0)}</strong></div>
          <div className="inout-kpi"><span>Chờ kho đích</span><strong data-testid="pending-kpi-dest">{formatNumber(summary?.waitingDestination ?? 0)}</strong></div>
          <div className="inout-kpi"><span>Tổng SL đang treo</span><strong data-testid="pending-kpi-qty">{formatNumber(summary?.totalQty ?? 0)}</strong></div>
          <div className="inout-kpi"><span>Chờ lâu nhất (ngày)</span><strong data-testid="pending-kpi-max-wait">{formatNumber(summary?.maxWaitingDays ?? 0)}</strong></div>
        </section>

        <section className="inout-card" aria-labelledby="pending-status-chart-title">
          <h2 id="pending-status-chart-title">Phân bổ theo trạng thái chờ</h2>
          {(report?.breakdowns?.byStatus?.length ?? 0) === 0 ? (
            <div className="inout-empty" data-testid="pending-chart-empty">Không có dữ liệu trạng thái chờ.</div>
          ) : (
            <div className="inout-chart" data-testid="pending-status-chart">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={report!.breakdowns.byStatus}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Số phiếu" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="inout-card" aria-labelledby="pending-table-title">
          <h2 id="pending-table-title">Danh sách chờ xác nhận</h2>
          {empty ? (
            <div className="inout-empty" data-testid="pending-table-empty">Không có phiếu chuyển kho đang chờ.</div>
          ) : (
            <div className="inout-table-wrap">
              <table className="inout-table" data-testid="pending-table">
                <thead>
                  <tr>
                    <th>Mã</th>
                    <th>Ngày tạo</th>
                    <th>Kho nguồn</th>
                    <th>Kho đích</th>
                    <th className="num">Mặt hàng</th>
                    <th className="num">SL</th>
                    <th>Trạng thái</th>
                    <th className="num">Ngày chờ</th>
                    <th>Người tạo</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.code}</td>
                      <td>{formatDisplayDateTime(row.createdAt)}</td>
                      <td>{row.sourceWarehouseName || '—'}</td>
                      <td>{row.destinationWarehouseName || '—'}</td>
                      <td className="num">{formatNumber(row.itemCount)}</td>
                      <td className="num">{formatNumber(row.totalQty)}</td>
                      <td>{row.statusLabel || row.status}</td>
                      <td className="num">{formatNumber(Math.max(0, row.waitingDays))}</td>
                      <td>{row.createdByName || '—'}</td>
                      <td>
                        <Link to={row.detailPath || `/warehouse/transfers/${row.id}`}>Mở chuyển kho</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(report?.table?.pagination?.totalPages ?? 0) > 1 ? (
            <div className="inout-pagination">
              <div className="inout-pagination__info">
                Trang {report!.table.pagination.page}/{report!.table.pagination.totalPages}
              </div>
              <div className="inout-actions">
                <button
                  type="button"
                  className="inout-btn inout-btn--secondary"
                  disabled={busy || report!.table.pagination.page <= 1}
                  onClick={() => {
                    const next = { ...applied, page: applied.page - 1 };
                    setDraft((d) => ({ ...d, page: next.page }));
                    void loadReport(next, 'load');
                  }}
                >
                  Trước
                </button>
                <button
                  type="button"
                  className="inout-btn inout-btn--secondary"
                  disabled={busy || report!.table.pagination.page >= report!.table.pagination.totalPages}
                  onClick={() => {
                    const next = { ...applied, page: applied.page + 1 };
                    setDraft((d) => ({ ...d, page: next.page }));
                    void loadReport(next, 'load');
                  }}
                >
                  Sau
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </InventoryReportShell>
  );
}
