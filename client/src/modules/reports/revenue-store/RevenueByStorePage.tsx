import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Check,
  ChevronDown,
  Download,
  HelpCircle,
  Minus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Store,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchRevenueByStoreOptions, fetchRevenueByStoreReport } from './revenueByStore.api';
import type {
  ChartView,
  DatePreset,
  MetricComparison,
  ReportMetric,
  RevenueByStoreOptions,
  SortField,
  StoreRankingRow,
  StoreReportFilters,
  StoreReportResponse,
  StoreReportSummary,
} from './revenueByStore.types';
import {
  CHART_VIEW_LABELS,
  defaultFilters,
  exportRankingCsv,
  exportRankingExcel,
  exportSummaryCsv,
  extractApiError,
  filtersFromSearchParams,
  filtersToSearchParams,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  METRIC_LABELS,
  metricValue,
  PRESET_LABELS,
  rangeFromPreset,
  suggestedTrendGranularity,
  validateDateRange,
} from './revenueByStore.utils';
import './revenue-by-store.css';

const CHART_COLORS = [
  '#10b981',
  '#059669',
  '#6366f1',
  '#f59e0b',
  '#ef4444',
  '#0ea5e9',
  '#8b5cf6',
  '#14b8a6',
  '#f97316',
  '#64748b',
];

function StoreMultiSelect({
  stores,
  selectedIds,
  disabled,
  onChange,
}: {
  stores: RevenueByStoreOptions['stores'];
  selectedIds: string[];
  disabled: boolean;
  onChange: (storeIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const visibleStores = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('vi-VN');
    if (!keyword) return stores;
    return stores.filter((store) => `${store.name} ${store.code ?? ''}`.toLocaleLowerCase('vi-VN').includes(keyword));
  }, [search, stores]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const toggleStore = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((selectedId) => selectedId !== id) : [...selectedIds, id]);
  };

  return (
    <div className="rbs-store-select" ref={rootRef}>
      <div className="rbs-store-select-label">
        <Building2 size={14} aria-hidden />
        <span>Cửa hàng</span>
      </div>
      <button
        type="button"
        className="rbs-store-select-trigger"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled || stores.length === 0}
        aria-expanded={open}
        aria-controls={listId}
      >
        <span>{selectedIds.length ? `Đã chọn ${selectedIds.length} cửa hàng` : 'Tất cả cửa hàng'}</span>
        <ChevronDown size={16} aria-hidden />
      </button>
      {open && (
        <div className="rbs-store-select-menu" id={listId} role="dialog" aria-label="Chọn cửa hàng">
          <div className="rbs-store-select-search">
            <Search size={15} aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm tên hoặc mã cửa hàng…"
              autoFocus
            />
          </div>
          <div className="rbs-store-select-actions">
            <button type="button" onClick={() => onChange([])} disabled={selectedIds.length === 0}>
              Tất cả cửa hàng
            </button>
            <span>{selectedIds.length} đã chọn</span>
          </div>
          <div className="rbs-store-select-list" role="listbox" aria-multiselectable="true">
            {visibleStores.map((store) => {
              const selected = selectedIds.includes(store.id);
              return (
                <button
                  key={store.id}
                  type="button"
                  className={`rbs-store-option${selected ? ' is-selected' : ''}`}
                  onClick={() => toggleStore(store.id)}
                  role="option"
                  aria-selected={selected}
                >
                  <span className="rbs-store-option-check" aria-hidden>{selected && <Check size={14} />}</span>
                  <span>
                    <strong>{store.name}</strong>
                    <small>{store.code ? store.code : 'Chưa có mã'}{store.isActive === false ? ' · Ngừng hoạt động' : ''}</small>
                  </span>
                </button>
              );
            })}
            {visibleStores.length === 0 && <p className="rbs-store-select-empty">Không tìm thấy cửa hàng phù hợp.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── KPI cards ─── */

function ChangeBadge({ metric }: { metric: MetricComparison }) {
  if (!metric) {
    return (
      <span className="rbs-kpi-change rbs-kpi-flat">
        <Minus size={14} aria-hidden />
        —
      </span>
    );
  }
  if (metric.changePercent === null || metric.changePercent === undefined) {
    if (metric.previousValue === 0 && (metric.currentValue ?? 0) > 0) {
      return (
        <span className="rbs-kpi-change rbs-kpi-up" title="Kỳ trước = 0 — không có cơ sở so sánh %">
          <ArrowUpRight size={14} aria-hidden />
          Mới
        </span>
      );
    }
    if (metric.previousValue === 0 && (metric.currentValue ?? 0) === 0) {
      return (
        <span className="rbs-kpi-change rbs-kpi-flat">
          <Minus size={14} aria-hidden />
          Không đổi
        </span>
      );
    }
    return (
      <span className="rbs-kpi-change rbs-kpi-flat" title="Không có cơ sở so sánh">
        <HelpCircle size={14} aria-hidden />
        Không so sánh
      </span>
    );
  }
  const pct = metric.changePercent;
  if (pct > 0) {
    return (
      <span className="rbs-kpi-change rbs-kpi-up" title={`Kỳ trước: ${metric.previousValue}`}>
        <ArrowUpRight size={14} aria-hidden />
        {formatPercent(pct)}
      </span>
    );
  }
  if (pct < 0) {
    return (
      <span className="rbs-kpi-change rbs-kpi-down" title={`Kỳ trước: ${metric.previousValue}`}>
        <ArrowDownRight size={14} aria-hidden />
        {formatPercent(pct)}
      </span>
    );
  }
  return (
    <span className="rbs-kpi-change rbs-kpi-flat">
      <Minus size={14} aria-hidden />
      0%
    </span>
  );
}

function SummaryCards({
  summary,
  comparison,
  loading,
}: {
  summary: StoreReportSummary | null;
  comparison: Record<string, MetricComparison> | null | undefined;
  loading: boolean;
}) {
  type Card = {
    key: string;
    label: string;
    value: string;
    metricKey?: string;
    tip?: string;
  };

  const cards: Card[] = useMemo(() => {
    if (!summary) return [];
    const list: Card[] = [
      {
        key: 'netRevenue',
        label: 'Doanh thu thuần',
        value: formatMoney(summary.netRevenue),
        metricKey: 'netRevenue',
        tip: 'Doanh thu − hoàn tiền (product_refunds)',
      },
      {
        key: 'revenue',
        label: 'Doanh thu',
        value: formatMoney(summary.revenue),
        metricKey: 'revenue',
        tip: 'Tổng value/value_payment sau giảm giá',
      },
      {
        key: 'refundAmount',
        label: 'Hoàn tiền',
        value: formatMoney(summary.refundAmount),
        metricKey: 'refundAmount',
      },
      {
        key: 'invoiceCount',
        label: 'Số hóa đơn',
        value: formatNumber(summary.invoiceCount),
        metricKey: 'invoiceCount',
      },
      {
        key: 'itemQuantity',
        label: 'Số sản phẩm',
        value: formatNumber(summary.itemQuantity),
        metricKey: 'itemQuantity',
      },
      {
        key: 'averageOrderValue',
        label: 'Giá trị đơn TB',
        value: formatMoney(summary.averageOrderValue),
        metricKey: 'averageOrderValue',
      },
      {
        key: 'storeCount',
        label: 'Cửa hàng có DT',
        value: formatNumber(summary.storeCount),
        metricKey: 'storeCount',
      },
      {
        key: 'topStore',
        label: 'Cửa hàng dẫn đầu',
        value: summary.topStore
          ? `${summary.topStore.name} · ${formatMoney(summary.topStore.netRevenue)}`
          : '—',
      },
    ];
    if (summary.costAmount !== null) {
      list.push({
        key: 'grossProfit',
        label: 'Lợi nhuận gộp',
        value: formatMoney(summary.grossProfit),
        metricKey: 'grossProfit',
        tip: 'Chỉ khi có total_cost',
      });
      list.push({
        key: 'grossMarginPercent',
        label: 'Biên LN',
        value: summary.grossMarginPercent !== null ? formatPercent(summary.grossMarginPercent, false) : '—',
      });
    }
    return list;
  }, [summary]);

  if (loading && !summary) {
    return (
      <div className="rbs-kpi-grid" aria-busy="true" aria-label="Đang tải KPI">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rbs-kpi rbs-skeleton" style={{ height: 96 }} />
        ))}
      </div>
    );
  }

  return (
    <div className="rbs-kpi-grid">
      {cards.map((c) => (
        <article key={c.key} className="rbs-kpi">
          <div className="rbs-kpi-label">
            {c.label}
            {c.tip && (
              <span className="rbs-kpi-tip" title={c.tip}>
                <HelpCircle size={13} aria-hidden />
                <span className="sr-only">{c.tip}</span>
              </span>
            )}
          </div>
          <div className="rbs-kpi-value">{c.value}</div>
          {c.metricKey && comparison?.[c.metricKey] !== undefined && (
            <ChangeBadge metric={comparison[c.metricKey]} />
          )}
        </article>
      ))}
    </div>
  );
}

/* ─── Charts ─── */

function RankingBarChart({
  ranking,
  metric,
  topN,
  loading,
}: {
  ranking: StoreRankingRow[];
  metric: ReportMetric;
  topN: number;
  loading: boolean;
}) {
  const data = useMemo(() => {
    const slice = topN > 0 ? ranking.slice(0, topN) : ranking;
    return slice.map((r) => ({
      name: r.storeName.length > 18 ? `${r.storeName.slice(0, 16)}…` : r.storeName,
      fullName: r.storeName,
      value: metricValue(r, metric),
      storeId: r.storeId,
    }));
  }, [ranking, metric, topN]);

  const isMoney = !['invoiceCount', 'itemQuantity'].includes(metric);
  const hasData = data.some((d) => d.value > 0);

  if (loading && ranking.length === 0) {
    return <div className="rbs-chart-wrap rbs-skeleton" style={{ height: 320 }} aria-busy="true" />;
  }

  if (!hasData) {
    return (
      <div className="rbs-empty rbs-empty-sm">
        <p>Chưa có dữ liệu xếp hạng cửa hàng trong khoảng đã chọn.</p>
      </div>
    );
  }

  return (
    <div className="rbs-chart-wrap" role="img" aria-label={`Biểu đồ xếp hạng ${METRIC_LABELS[metric]} theo cửa hàng`}>
      <ResponsiveContainer width="100%" height={Math.max(280, data.length * 36)}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.06)" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: '#64748b' }}
            tickFormatter={(v) => (isMoney ? formatNumber(v) : formatNumber(v))}
          />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: '#64748b' }} />
          <Tooltip
            formatter={(value: number) => [isMoney ? formatMoney(value) : formatNumber(value), METRIC_LABELS[metric]]}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ''}
            contentStyle={{ borderRadius: 10, border: '1px solid rgba(15,23,42,0.08)' }}
          />
          <Bar dataKey="value" fill="#10b981" radius={[0, 6, 6, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrendMultiChart({
  report,
  metric,
  chartView,
  loading,
  onSelectPeriod,
}: {
  report: StoreReportResponse | null;
  metric: ReportMetric;
  chartView: ChartView;
  loading: boolean;
  onSelectPeriod: (key: string) => void;
}) {
  const series = report?.trend?.series ?? [];
  const chartData = useMemo(() => {
    if (!series.length) return [];
    const keys = series[0].points.map((p) => p.key);
    return keys.map((key, idx) => {
      const row: Record<string, string | number> = {
        key,
        label: series[0].points[idx]?.label ?? key,
      };
      series.forEach((s) => {
        const pt = s.points.find((p) => p.key === key);
        row[s.storeId] = pt ? Number(pt[metric as keyof typeof pt] ?? 0) : 0;
      });
      return row;
    });
  }, [series, metric]);

  const isMoney = !['invoiceCount', 'itemQuantity'].includes(metric);
  const hasData = chartData.some((row) => series.some((s) => Number(row[s.storeId] ?? 0) > 0));

  if (loading && !report) {
    return <div className="rbs-chart-wrap rbs-skeleton" style={{ height: 320 }} aria-busy="true" />;
  }

  if (!hasData) {
    return (
      <div className="rbs-empty rbs-empty-sm">
        <p>Chưa có dữ liệu xu hướng theo cửa hàng.</p>
      </div>
    );
  }

  const TrendTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ value?: number; name?: string; color?: string; payload?: Record<string, string | number> }> }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload;
    if (!row) return null;
    const total = payload.reduce((sum, item) => sum + Number(item.value ?? 0), 0);
    return (
      <div className="rbs-tooltip rbs-tooltip-lg">
        <div className="rbs-tooltip-title">{String(row.label ?? '')}</div>
        {payload.map((item) => {
          const store = series.find((candidate) => candidate.storeId === item.name);
          return (
            <div className="rbs-tooltip-row" key={item.name}>
              <span className="rbs-tooltip-dot" style={{ background: item.color }} />
              <span>{store?.storeName ?? item.name}</span>
              <strong>{isMoney ? formatMoney(Number(item.value ?? 0)) : formatNumber(Number(item.value ?? 0))}</strong>
            </div>
          );
        })}
        <div className="rbs-tooltip-divider" />
        <div className="rbs-tooltip-row rbs-tooltip-total">
          <span>Tổng</span>
          <strong>{isMoney ? formatMoney(total) : formatNumber(total)}</strong>
        </div>
        <p className="rbs-tooltip-hint">Nhấp vào kỳ để xem chi tiết</p>
      </div>
    );
  };

  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.16)" />
      <XAxis
        dataKey="label"
        tick={{ fontSize: 11, fill: '#334155' }}
        axisLine={{ stroke: '#94a3b8' }}
        tickLine={{ stroke: '#94a3b8' }}
        minTickGap={16}
        height={38}
        label={{ value: 'Thời gian', position: 'insideBottom', offset: -2, style: { fill: '#475569', fontSize: 11 } }}
      />
      <YAxis
        tick={{ fontSize: 11, fill: '#334155' }}
        axisLine={{ stroke: '#94a3b8' }}
        tickLine={{ stroke: '#94a3b8' }}
        tickFormatter={(v) => formatNumber(v)}
        width={72}
        label={{ value: isMoney ? 'Giá trị (VND)' : 'Số lượng', angle: -90, position: 'insideLeft', style: { fill: '#475569', fontSize: 11 } }}
      />
      <Tooltip content={<TrendTooltip />} cursor={{ fill: 'rgba(16,185,129,0.08)' }} />
      <Legend
        formatter={(value) => series.find((s) => s.storeId === value)?.storeName ?? value}
        wrapperStyle={{ fontSize: 12 }}
      />
    </>
  );

  return (
    <div className="rbs-chart-wrap" role="img" aria-label="Biểu đồ xu hướng doanh thu theo cửa hàng">
      {report?.trend?.note && (
        <p style={{ margin: '0 8px 8px', fontSize: 12, color: '#64748b' }}>{report.trend.note}</p>
      )}
      <ResponsiveContainer width="100%" height={320}>
        {chartView === 'area' ? (
          <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} onClick={(state) => state?.activeLabel && onSelectPeriod(String(state.activeLabel))}>
            {common}
            {series.map((s, i) => (
              <Area
                key={s.storeId}
                type="monotone"
                dataKey={s.storeId}
                name={s.storeId}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                fillOpacity={0.12}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </AreaChart>
        ) : chartView === 'line' ? (
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} onClick={(state) => state?.activeLabel && onSelectPeriod(String(state.activeLabel))}>
            {common}
            {series.map((s, i) => (
              <Line
                key={s.storeId}
                type="monotone"
                dataKey={s.storeId}
                name={s.storeId}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        ) : chartView === 'combo' ? (
          <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} onClick={(state) => state?.activeLabel && onSelectPeriod(String(state.activeLabel))}>
            {common}
            {series.slice(0, 1).map((s, i) => (
              <Bar
                key={s.storeId}
                dataKey={s.storeId}
                name={s.storeId}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
            ))}
            {series.slice(1).map((s, i) => (
              <Line
                key={s.storeId}
                type="monotone"
                dataKey={s.storeId}
                name={s.storeId}
                stroke={CHART_COLORS[(i + 1) % CHART_COLORS.length]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </ComposedChart>
        ) : (
          <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} onClick={(state) => state?.activeLabel && onSelectPeriod(String(state.activeLabel))}>
            {common}
            {series.map((s, i) => (
              <Bar
                key={s.storeId}
                dataKey={s.storeId}
                name={s.storeId}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                radius={[4, 4, 0, 0]}
                maxBarSize={18}
              />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function SharePieChart({
  items,
  loading,
}: {
  items: { key: string; label: string; revenue: number; percent: number }[];
  loading: boolean;
}) {
  const total = items.reduce((s, i) => s + i.revenue, 0);

  if (loading && items.length === 0) {
    return <div className="rbs-skeleton" style={{ height: 220, borderRadius: 12 }} aria-busy="true" />;
  }

  if (total <= 0) {
    return (
      <div className="rbs-empty rbs-empty-sm">
        <p>Tổng doanh thu thuần = 0 — không hiển thị tỷ trọng.</p>
      </div>
    );
  }

  return (
    <div className="rbs-breakdown-body">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={items}
            dataKey="revenue"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={48}
            outerRadius={78}
            paddingAngle={2}
          >
            {items.map((entry, i) => (
              <Cell key={entry.key} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string) => [formatMoney(value), name]}
            contentStyle={{ borderRadius: 10, border: '1px solid rgba(15,23,42,0.08)' }}
          />
        </PieChart>
      </ResponsiveContainer>
      <ul className="rbs-legend-list">
        {items.map((item, i) => (
          <li key={item.key}>
            <span
              className="rbs-tooltip-dot"
              style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
              aria-hidden
            />
            <span className="rbs-legend-label" title={item.label}>
              {item.label}
            </span>
            <strong>{formatPercent(item.percent, false)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TrendPeriodModal({
  report,
  metric,
  periodLabel,
  onClose,
}: {
  report: StoreReportResponse | null;
  metric: ReportMetric;
  periodLabel: string | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const periodRows = useMemo(() => {
    if (!report || !periodLabel) return [];
    return report.trend.series.map((series) => {
      const point = series.points.find((candidate) => candidate.label === periodLabel);
      return { storeId: series.storeId, storeName: series.storeName, value: Number(point?.[metric] ?? 0) };
    }).sort((left, right) => right.value - left.value);
  }, [metric, periodLabel, report]);

  useEffect(() => {
    if (!periodLabel) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = oldOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose, periodLabel]);

  if (!periodLabel) return null;
  const total = periodRows.reduce((sum, row) => sum + row.value, 0);
  const isMoney = !['invoiceCount', 'itemQuantity'].includes(metric);
  const formatValue = (value: number) => isMoney ? formatMoney(value) : formatNumber(value);

  return (
    <div className="rbs-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="rbs-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
        <header className="rbs-modal-header">
          <div>
            <p>Chi tiết kỳ</p>
            <h3 id={titleId}>{periodLabel}</h3>
          </div>
          <button ref={closeRef} type="button" className="btn btn-light" onClick={onClose} aria-label="Đóng chi tiết kỳ">
            <X size={16} aria-hidden />
          </button>
        </header>
        <div className="rbs-modal-body">
          <div className="rbs-modal-total">
            <span>Tổng {METRIC_LABELS[metric] ?? metric}</span>
            <strong>{formatValue(total)}</strong>
          </div>
          <table className="rbs-period-table">
            <thead><tr><th>Cửa hàng</th><th>Giá trị</th></tr></thead>
            <tbody>
              {periodRows.map((row) => <tr key={row.storeId}><td>{row.storeName}</td><td>{formatValue(row.value)}</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ─── Table ─── */

function StoreTable({
  rows,
  totals,
  pagination,
  sortBy,
  sortDirection,
  perPage,
  showCost,
  loading,
  onSort,
  onPageChange,
  onPerPageChange,
}: {
  rows: StoreRankingRow[];
  totals: StoreReportResponse['table']['totals'] | null;
  pagination: StoreReportResponse['table']['pagination'] | null;
  sortBy: SortField;
  sortDirection: 'asc' | 'desc';
  perPage: number;
  showCost: boolean;
  loading: boolean;
  onSort: (f: SortField) => void;
  onPageChange: (p: number) => void;
  onPerPageChange: (n: number) => void;
}) {
  const sortBtn = (field: SortField, label: string, className = '') => {
    const active = sortBy === field;
    const arrow = active ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : '';
    return (
      <th className={className} scope="col">
        <button
          type="button"
          className={`rbs-th-btn${active ? ' is-active' : ''}`}
          onClick={() => onSort(field)}
          aria-sort={active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
        >
          {label}
          {arrow}
        </button>
      </th>
    );
  };

  return (
    <section className="rbs-surface">
      <div className="rbs-surface-head">
        <div>
          <h2>Chi tiết theo cửa hàng</h2>
          <p>Sắp xếp và phân trang phía máy chủ. Tổng cộng phản ánh toàn bộ kết quả đã lọc.</p>
        </div>
      </div>
      <div className="rbs-table-scroll">
        <table className="rbs-table">
          <thead>
            <tr>
              {sortBtn('rank', 'Hạng')}
              <th scope="col">
                <span className="rbs-th-btn" style={{ cursor: 'default' }}>
                  Mã
                </span>
              </th>
              {sortBtn('storeName', 'Cửa hàng')}
              <th scope="col">
                <span className="rbs-th-btn" style={{ cursor: 'default' }}>
                  TT
                </span>
              </th>
              {sortBtn('grossRevenue', 'Trước giảm', 'num')}
              {sortBtn('discountAmount', 'Giảm giá', 'num')}
              {sortBtn('revenue', 'Doanh thu', 'num')}
              {sortBtn('refundAmount', 'Hoàn tiền', 'num')}
              {sortBtn('netRevenue', 'DT thuần', 'num')}
              {sortBtn('invoiceCount', 'Số HĐ', 'num')}
              {sortBtn('itemQuantity', 'SL SP', 'num')}
              {sortBtn('averageOrderValue', 'TB/HĐ', 'num')}
              <th className="num" scope="col">
                <span className="rbs-th-btn" style={{ cursor: 'default' }}>
                  Tỷ trọng
                </span>
              </th>
              {showCost && (
                <th className="num" scope="col">
                  <span className="rbs-th-btn" style={{ cursor: 'default' }}>
                    LN gộp
                  </span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={showCost ? 14 : 13} className="rbs-table-empty">
                  Đang tải bảng…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={showCost ? 14 : 13} className="rbs-table-empty">
                  Không có cửa hàng nào trong bộ lọc hiện tại.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.storeId}>
                  <td>{r.rank}</td>
                  <td>{r.storeCode || '—'}</td>
                  <td>{r.storeName}</td>
                  <td>
                    {r.isActive === null ? '—' : r.isActive ? 'Hoạt động' : 'Ngừng'}
                  </td>
                  <td className="num">{formatMoney(r.grossRevenue)}</td>
                  <td className="num">{formatMoney(r.discountAmount)}</td>
                  <td className="num">{formatMoney(r.revenue)}</td>
                  <td className="num">{formatMoney(r.refundAmount)}</td>
                  <td className="num">
                    <strong>{formatMoney(r.netRevenue)}</strong>
                  </td>
                  <td className="num">{formatNumber(r.invoiceCount)}</td>
                  <td className="num">{formatNumber(r.itemQuantity)}</td>
                  <td className="num">{formatMoney(r.averageOrderValue)}</td>
                  <td className="num">{formatPercent(r.revenueSharePercent, false)}</td>
                  {showCost && (
                    <td className="num">
                      {r.grossProfit === null ? 'Chưa đủ dữ liệu' : formatMoney(r.grossProfit)}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
          {totals && rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={4}>Tổng cộng (toàn bộ đã lọc)</td>
                <td className="num">{formatMoney(totals.grossRevenue)}</td>
                <td className="num">{formatMoney(totals.discountAmount)}</td>
                <td className="num">{formatMoney(totals.revenue)}</td>
                <td className="num">{formatMoney(totals.refundAmount)}</td>
                <td className="num">{formatMoney(totals.netRevenue)}</td>
                <td className="num">{formatNumber(totals.invoiceCount)}</td>
                <td className="num">{formatNumber(totals.itemQuantity)}</td>
                <td className="num">{formatMoney(totals.averageOrderValue)}</td>
                <td className="num">100%</td>
                {showCost && (
                  <td className="num">
                    {totals.grossProfit === null ? 'Chưa đủ dữ liệu' : formatMoney(totals.grossProfit)}
                  </td>
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {pagination && (
        <div className="rbs-pagination">
          <div className="rbs-inline-field">
            <label htmlFor="rbs-per-page">Hiển thị</label>
            <select
              id="rbs-per-page"
              value={perPage}
              onChange={(e) => onPerPageChange(Number(e.target.value))}
            >
              {[20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span>
              · {pagination.total} cửa hàng · trang {pagination.page}/{Math.max(1, pagination.totalPages)}
            </span>
          </div>
          <div className="rbs-pagination-btns">
            <button
              type="button"
              className="btn btn-light"
              disabled={pagination.page <= 1 || loading}
              onClick={() => onPageChange(pagination.page - 1)}
            >
              Trước
            </button>
            <button
              type="button"
              className="btn btn-light"
              disabled={pagination.page >= pagination.totalPages || loading || pagination.totalPages === 0}
              onClick={() => onPageChange(pagination.page + 1)}
            >
              Sau
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ─── Page ─── */

export function RevenueByStorePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [options, setOptions] = useState<RevenueByStoreOptions | null>(null);
  const [optionsError, setOptionsError] = useState('');
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [draft, setDraft] = useState<StoreReportFilters>(() => defaultFilters());
  const [applied, setApplied] = useState<StoreReportFilters>(() => defaultFilters());
  const [preset, setPreset] = useState<DatePreset>('last_30_days');
  const [report, setReport] = useState<StoreReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [chartView, setChartView] = useState<ChartView>('line');
  const [topN, setTopN] = useState(10);
  const [syncingUrl, setSyncingUrl] = useState(false);
  const [selectedTrendKey, setSelectedTrendKey] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const requestSeq = useRef(0);
  const exportRef = useRef<HTMLDivElement | null>(null);
  const initialLoadDone = useRef(false);
  const skipUrlWrite = useRef(false);

  const loadOptions = useCallback(async (signal?: AbortSignal) => {
    setOptionsLoading(true);
    setOptionsError('');
    try {
      const loadedOptions = await fetchRevenueByStoreOptions(signal);
      setOptions(loadedOptions);
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'ERR_CANCELED') return;
      setOptionsError(`Không tải được danh sách bộ lọc: ${extractApiError(err)}`);
    } finally {
      if (!signal?.aborted) setOptionsLoading(false);
    }
  }, []);

  const loadReport = useCallback(async (filters: StoreReportFilters, mode: 'load' | 'refresh' = 'load') => {
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
      const data = await fetchRevenueByStoreReport(filters, controller.signal);
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

  // Bootstrap from URL + options
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    const controller = new AbortController();
    (async () => {
      await loadOptions(controller.signal);

      const fromUrl = filtersFromSearchParams(new URLSearchParams(window.location.search));
      const filters = fromUrl.filters;
      setDraft(filters);
      setApplied(filters);
      setPreset(fromUrl.preset);
      skipUrlWrite.current = true;
      await loadReport(filters, 'load');
      setBootstrapped(true);
    })();

    return () => {
      controller.abort();
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadOptions]);

  // Write URL when applied filters change
  useEffect(() => {
    if (!bootstrapped) return;
    if (skipUrlWrite.current) {
      skipUrlWrite.current = false;
      return;
    }
    setSyncingUrl(true);
    const qs = filtersToSearchParams(applied, preset);
    setSearchParams(qs, { replace: true });
    setSyncingUrl(false);
  }, [applied, preset, bootstrapped, setSearchParams]);

  // Browser back/forward
  useEffect(() => {
    if (!bootstrapped || syncingUrl) return;
    const fromUrl = filtersFromSearchParams(searchParams);
    const qsApplied = filtersToSearchParams(applied, preset);
    const qsUrl = filtersToSearchParams(fromUrl.filters, fromUrl.preset);
    if (qsApplied === qsUrl) return;
    skipUrlWrite.current = true;
    setDraft(fromUrl.filters);
    setPreset(fromUrl.preset);
    void loadReport(fromUrl.filters, 'load');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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

  const handleSearchChange = (value: string) => {
    setDraft((d) => ({ ...d, search: value, page: 1 }));
  };

  const patchDraft = (patch: Partial<StoreReportFilters>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const handleApply = () => {
    const next = { ...draft, page: 1 };
    const rangeErr = validateDateRange(next.from, next.to);
    if (rangeErr) {
      setValidationError(rangeErr);
      return;
    }
    setDraft(next);
    void loadReport(next, 'load');
  };

  const handleReset = () => {
    const next = defaultFilters();
    setPreset('last_30_days');
    setDraft(next);
    void loadReport(next, 'load');
  };

  const handleRefresh = () => {
    if (loading || refreshing) return;
    void loadReport(applied, 'refresh');
  };

  const handleSort = (field: SortField) => {
    const next: StoreReportFilters = {
      ...applied,
      sortBy: field,
      sortDirection: applied.sortBy === field && applied.sortDirection === 'desc' ? 'asc' : 'desc',
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
    if (p !== 'custom') {
      const range = rangeFromPreset(p);
      const g = suggestedTrendGranularity(range.from, range.to);
      patchDraft({ from: range.from, to: range.to, trendGranularity: g, page: 1 });
    }
  };

  const handlePrint = () => {
    window.print();
    setExportOpen(false);
  };

  const handleExport = (exporter: () => void) => {
    try {
      exporter();
      setExportOpen(false);
    } catch (err: unknown) {
      setError(`Không thể xuất báo cáo: ${extractApiError(err)}`);
    }
  };

  const busy = loading || refreshing;
  const showCost = Boolean(report?.meta?.hasCostData);
  const ranking = report?.ranking ?? [];
  const tableRows = report?.table?.data ?? [];
  const metric = applied.metric;
  const hasUnappliedChanges = filtersToSearchParams(draft, preset) !== filtersToSearchParams(applied, preset);

  const statusNote =
    applied.status && applied.status !== 'completed'
      ? ` · Đang lọc trạng thái: ${applied.status}`
      : ' · Mặc định chỉ hóa đơn hoàn tất';

  return (
    <main className="rbs-page revenue-store-report-page">
      {busy && <div className="rbs-progress" aria-hidden />}

      <header className="rbs-hero">
        <div>
          <div className="rbs-hero-meta" style={{ marginTop: 0, marginBottom: 4 }}>
            Báo cáo / Doanh thu
          </div>
          <h1>
            <Store size={22} style={{ display: 'inline', verticalAlign: -4, marginRight: 8 }} aria-hidden />
            Doanh thu theo cửa hàng
          </h1>
          <p>
            Tổng hợp doanh thu, hoàn tiền và xếp hạng theo từng cửa hàng từ dữ liệu bán hàng thực tế.
            {statusNote}
          </p>
          <div className="rbs-hero-meta">
            Cập nhật lúc: {formatDateTime(report?.meta?.generatedAt)}
            {report?.meta?.timezone ? ` · ${report.meta.timezone}` : ''}
            {report?.meta?.saleCountLoaded != null
              ? ` · ${report.meta.saleCountLoaded} HĐ · ${report.meta.refundCountLoaded ?? 0} hoàn`
              : ''}
          </div>
        </div>
        <div className="rbs-hero-actions">
          <button type="button" className="btn btn-light" onClick={handleReset} disabled={busy}>
            <RotateCcw size={16} aria-hidden />
            Đặt lại bộ lọc
          </button>
          <button
            type="button"
            className="btn btn-light"
            onClick={handleRefresh}
            disabled={busy}
            aria-busy={refreshing}
          >
            <RefreshCw size={16} className={refreshing ? 'rbs-spin' : undefined} aria-hidden />
            Làm mới
          </button>
          <div className="rbs-export" ref={exportRef}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setExportOpen((v) => !v)}
              disabled={!report || ranking.length === 0}
              aria-expanded={exportOpen}
              aria-haspopup="menu"
            >
              <Download size={16} aria-hidden />
              Xuất báo cáo
              <ChevronDown size={14} aria-hidden />
            </button>
            {exportOpen && report && (
              <div className="rbs-export-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    handleExport(() => exportRankingExcel(ranking, applied, showCost));
                  }}
                >
                  Xuất Excel (toàn bộ đã lọc)
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    handleExport(() => exportRankingCsv(ranking, applied, showCost));
                  }}
                >
                  Xuất CSV bảng xếp hạng
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    handleExport(() => exportSummaryCsv(report, applied));
                  }}
                >
                  Xuất CSV tổng hợp
                </button>
                <button type="button" role="menuitem" onClick={handlePrint}>
                  <Printer size={14} aria-hidden style={{ marginRight: 6 }} />
                  In báo cáo
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Filters */}
      <section className="rbs-filters">
        <div className="rbs-filters-head">
          <div>
            <h2>Bộ lọc</h2>
            <p>Mọi điều kiện, bao gồm tìm cửa hàng, chỉ áp dụng sau khi bấm Áp dụng.</p>
          </div>
          <button
            type="button"
            className="btn btn-light"
            onClick={() => setFiltersCollapsed((v) => !v)}
            aria-expanded={!filtersCollapsed}
          >
            {filtersCollapsed ? 'Mở rộng' : 'Thu gọn'}
          </button>
        </div>
        {!filtersCollapsed && (
          <div className="rbs-filters-body">
            <div className="rbs-filter-grid">
              <label className="rbs-field">
                Khoảng thời gian
                <select
                  value={preset}
                  onChange={(e) => handlePresetChange(e.target.value as DatePreset)}
                >
                  {(options?.presets ?? Object.keys(PRESET_LABELS)).map((p) => (
                    <option key={p} value={p}>
                      {PRESET_LABELS[p as DatePreset] ?? p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="rbs-field">
                Từ ngày
                <input
                  type="date"
                  value={draft.from}
                  onChange={(e) => {
                    setPreset('custom');
                    patchDraft({ from: e.target.value, page: 1 });
                  }}
                  aria-invalid={Boolean(validationError)}
                />
              </label>
              <label className="rbs-field">
                Đến ngày
                <input
                  type="date"
                  value={draft.to}
                  onChange={(e) => {
                    setPreset('custom');
                    patchDraft({ to: e.target.value, page: 1 });
                  }}
                  aria-invalid={Boolean(validationError)}
                />
              </label>
              <label className="rbs-field">
                Loại bán
                <select
                  value={draft.channel}
                  onChange={(e) => patchDraft({ channel: e.target.value, page: 1 })}
                >
                  <option value="">Tất cả</option>
                  {(options?.channels ?? []).map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="rbs-field">
                Kênh bán
                <select
                  value={draft.saleChannel}
                  onChange={(e) => patchDraft({ saleChannel: e.target.value, page: 1 })}
                >
                  <option value="">Tất cả</option>
                  {(options?.saleChannels ?? []).map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="rbs-field">
                Nhân viên
                <select
                  value={draft.staffId}
                  onChange={(e) => patchDraft({ staffId: e.target.value, page: 1 })}
                >
                  <option value="">Tất cả</option>
                  {(options?.staff ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="rbs-field">
                Phương thức TT
                <select
                  value={draft.paymentMethod}
                  onChange={(e) => patchDraft({ paymentMethod: e.target.value, page: 1 })}
                >
                  <option value="">Tất cả</option>
                  {(options?.paymentMethods ?? []).map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="rbs-field">
                Trạng thái HĐ
                <select
                  value={draft.status}
                  onChange={(e) => patchDraft({ status: e.target.value, page: 1 })}
                >
                  {(options?.invoiceStatuses ?? [
                    { value: 'completed', label: 'Hoàn tất' },
                    { value: 'draft', label: 'Nháp' },
                    { value: 'cancelled', label: 'Đã hủy' },
                  ]).map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="rbs-field">
                So sánh
                <select
                  value={draft.compare}
                  onChange={(e) =>
                    patchDraft({ compare: e.target.value as StoreReportFilters['compare'], page: 1 })
                  }
                >
                  {(options?.compareModes ?? [
                    { value: 'previous_period', label: 'So với kỳ trước' },
                    { value: 'none', label: 'Không so sánh' },
                  ]).map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="rbs-field">
                Chỉ số xếp hạng
                <select
                  value={draft.metric}
                  onChange={(e) =>
                    patchDraft({ metric: e.target.value as ReportMetric, page: 1 })
                  }
                >
                  {(options?.metrics ?? Object.entries(METRIC_LABELS).map(([value, label]) => ({ value, label }))).map(
                    (m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="rbs-field">
                Xu hướng theo
                <select
                  value={draft.trendGranularity}
                  onChange={(e) =>
                    patchDraft({
                      trendGranularity: e.target.value as StoreReportFilters['trendGranularity'],
                      page: 1,
                    })
                  }
                >
                  {(options?.trendGranularities ?? [
                    { value: 'day', label: 'Theo ngày' },
                    { value: 'week', label: 'Theo tuần' },
                    { value: 'month', label: 'Theo tháng' },
                  ]).map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="rbs-field">
                Tìm cửa hàng
                <input
                  type="search"
                  placeholder="Tên hoặc mã…"
                  value={draft.search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  maxLength={100}
                />
              </label>
            </div>

            <div className="rbs-store-select-wrap">
              <StoreMultiSelect
                stores={options?.stores ?? []}
                selectedIds={draft.storeIds}
                disabled={optionsLoading || Boolean(optionsError)}
                onChange={(storeIds) => patchDraft({ storeIds, page: 1 })}
              />
              {optionsLoading && <span className="rbs-field-hint">Đang tải danh sách cửa hàng…</span>}
              {!optionsLoading && !optionsError && (options?.stores.length ?? 0) === 0 && (
                <span className="rbs-field-hint">API chưa trả về cửa hàng để chọn.</span>
              )}
              {optionsError && (
                <div className="rbs-options-error" role="alert">
                  <span>{optionsError}</span>
                  <button type="button" className="btn btn-light" onClick={() => void loadOptions()} disabled={optionsLoading}>
                    Thử lại
                  </button>
                </div>
              )}
            </div>

            {validationError && (
              <div className="rbs-filter-error" role="alert">
                {validationError}
              </div>
            )}

            <div className="rbs-filter-actions">
              {hasUnappliedChanges && <span className="rbs-pending-filter">Có thay đổi chưa áp dụng</span>}
              <button type="button" className="btn btn-light" onClick={handleReset} disabled={busy}>
                Đặt lại
              </button>
              <button type="button" className="btn btn-primary" onClick={handleApply} disabled={busy}>
                Áp dụng
              </button>
            </div>
          </div>
        )}
      </section>

      {error && (
        <div className="rbs-alert" role="alert">
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <AlertTriangle size={18} aria-hidden />
            <span>{error}</span>
          </div>
          <div className="rbs-alert-actions">
            <button type="button" className="btn btn-light" onClick={() => void loadReport(applied, 'load')}>
              Thử lại
            </button>
          </div>
        </div>
      )}

      <SummaryCards
        summary={report?.summary ?? null}
        comparison={report?.comparison?.metrics}
        loading={loading && !report}
      />

      {/* Ranking chart */}
      <section className="rbs-surface">
        <div className="rbs-surface-head">
          <div>
            <h2>
              <TrendingUp size={16} style={{ verticalAlign: -2, marginRight: 6 }} aria-hidden />
              Xếp hạng cửa hàng
            </h2>
            <p>Theo chỉ số: {METRIC_LABELS[metric] ?? metric}</p>
          </div>
          <div className="rbs-surface-tools">
            <label className="rbs-inline-field">
              Top
              <select value={topN} onChange={(e) => setTopN(Number(e.target.value))}>
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={0}>Tất cả</option>
              </select>
            </label>
          </div>
        </div>
        <RankingBarChart ranking={ranking} metric={metric} topN={topN} loading={loading && !report} />
      </section>

      {/* Trend */}
      <section className="rbs-surface">
        <div className="rbs-surface-head">
          <div>
            <h2>Xu hướng theo thời gian</h2>
            <p>So sánh top cửa hàng theo {METRIC_LABELS[metric] ?? metric}</p>
          </div>
          <div className="rbs-surface-tools">
            <label className="rbs-inline-field">
              Loại biểu đồ
              <select value={chartView} onChange={(e) => setChartView(e.target.value as ChartView)}>
                {Object.entries(CHART_VIEW_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <TrendMultiChart
          report={report}
          metric={metric}
          chartView={chartView}
          loading={loading && !report}
          onSelectPeriod={setSelectedTrendKey}
        />
      </section>

      {/* Share + secondary breakdowns */}
      <section className="rbs-surface">
        <div className="rbs-surface-head">
          <div>
            <h2>Tỷ trọng &amp; phân tích phụ</h2>
            <p>Tỷ trọng doanh thu thuần theo cửa hàng, kênh và phương thức thanh toán.</p>
          </div>
        </div>
        <div className="rbs-breakdown-grid">
          <div className="rbs-breakdown-card">
            <h3>Tỷ trọng theo cửa hàng</h3>
            <SharePieChart
              items={report?.breakdowns?.revenueShareByStore ?? []}
              loading={loading && !report}
            />
          </div>
          <div className="rbs-breakdown-card">
            <h3>Theo loại bán</h3>
            <SharePieChart items={report?.breakdowns?.channels ?? []} loading={loading && !report} />
          </div>
          <div className="rbs-breakdown-card">
            <h3>Theo phương thức TT</h3>
            <SharePieChart
              items={report?.breakdowns?.paymentMethods ?? []}
              loading={loading && !report}
            />
          </div>
          <div className="rbs-breakdown-card">
            <h3>Theo nhân viên</h3>
            <SharePieChart items={report?.breakdowns?.staff ?? []} loading={loading && !report} />
          </div>
        </div>
      </section>

      <StoreTable
        rows={tableRows}
        totals={report?.table?.totals ?? null}
        pagination={report?.table?.pagination ?? null}
        sortBy={applied.sortBy}
        sortDirection={applied.sortDirection}
        perPage={applied.perPage}
        showCost={showCost}
        loading={loading && !report}
        onSort={handleSort}
        onPageChange={handlePageChange}
        onPerPageChange={handlePerPageChange}
      />

      <section className="rbs-print-summary" aria-hidden="true">
        <h2>Doanh thu theo cửa hàng · {applied.from} → {applied.to} · {draft.storeIds.length ? `${draft.storeIds.length} cửa hàng` : 'Tất cả cửa hàng'}</h2>
        <p>Chỉ số: {METRIC_LABELS[metric] ?? metric} · Trạng thái: {applied.status || 'Tất cả'}</p>
        <dl>
          <div><dt>Doanh thu thuần</dt><dd>{formatMoney(report?.summary.netRevenue)}</dd></div>
          <div><dt>Doanh thu</dt><dd>{formatMoney(report?.summary.revenue)}</dd></div>
          <div><dt>Hoàn tiền</dt><dd>{formatMoney(report?.summary.refundAmount)}</dd></div>
          <div><dt>Số hóa đơn</dt><dd>{formatNumber(report?.summary.invoiceCount)}</dd></div>
        </dl>
      </section>

      <TrendPeriodModal
        report={report}
        metric={metric}
        periodLabel={selectedTrendKey}
        onClose={() => setSelectedTrendKey(null)}
      />

      {!bootstrapped && !report && !error && (
        <div className="rbs-empty" aria-busy="true">
          <p>Đang khởi tạo báo cáo…</p>
        </div>
      )}
    </main>
  );
}

export default RevenueByStorePage;
