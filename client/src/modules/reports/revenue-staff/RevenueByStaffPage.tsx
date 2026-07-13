import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  Download,
  HelpCircle,
  Minus,
  Printer,
  RefreshCw,
  RotateCcw,
  TrendingUp,
  Users,
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
import { fetchRevenueByStaffOptions, fetchRevenueByStaffReport } from './revenueByStaff.api';
import type {
  ChartView,
  DatePreset,
  MetricComparison,
  ReportMetric,
  RevenueByStaffOptions,
  SortField,
  StaffRankingRow,
  StaffReportFilters,
  StaffReportResponse,
  StaffReportSummary,
} from './revenueByStaff.types';
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
} from './revenueByStaff.utils';
import './revenue-by-staff.css';

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

/* ─── KPI cards ─── */

function ChangeBadge({ metric }: { metric: MetricComparison }) {
  if (!metric) {
    return (
      <span className="rbst-kpi-change rbst-kpi-flat">
        <Minus size={14} aria-hidden />
        —
      </span>
    );
  }
  if (metric.changePercent === null || metric.changePercent === undefined) {
    if (metric.previousValue === 0 && (metric.currentValue ?? 0) > 0) {
      return (
        <span className="rbst-kpi-change rbst-kpi-up" title="Kỳ trước = 0 — không có cơ sở so sánh %">
          <ArrowUpRight size={14} aria-hidden />
          Mới
        </span>
      );
    }
    if (metric.previousValue === 0 && (metric.currentValue ?? 0) === 0) {
      return (
        <span className="rbst-kpi-change rbst-kpi-flat">
          <Minus size={14} aria-hidden />
          Không đổi
        </span>
      );
    }
    return (
      <span className="rbst-kpi-change rbst-kpi-flat" title="Không có cơ sở so sánh">
        <HelpCircle size={14} aria-hidden />
        Không so sánh
      </span>
    );
  }
  const pct = metric.changePercent;
  if (pct > 0) {
    return (
      <span className="rbst-kpi-change rbst-kpi-up" title={`Kỳ trước: ${metric.previousValue}`}>
        <ArrowUpRight size={14} aria-hidden />
        {formatPercent(pct)}
      </span>
    );
  }
  if (pct < 0) {
    return (
      <span className="rbst-kpi-change rbst-kpi-down" title={`Kỳ trước: ${metric.previousValue}`}>
        <ArrowDownRight size={14} aria-hidden />
        {formatPercent(pct)}
      </span>
    );
  }
  return (
    <span className="rbst-kpi-change rbst-kpi-flat">
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
  summary: StaffReportSummary | null;
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
        key: 'staffCount',
        label: 'NV có DT',
        value: formatNumber(summary.staffCount),
        metricKey: 'staffCount',
      },
      {
        key: 'topStaff',
        label: 'Nhân viên dẫn đầu',
        value: summary.topStaff
          ? `${summary.topStaff.name} · ${formatMoney(summary.topStaff.netRevenue)}`
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
      <div className="rbst-kpi-grid" aria-busy="true" aria-label="Đang tải KPI">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rbst-kpi rbst-skeleton" style={{ height: 96 }} />
        ))}
      </div>
    );
  }

  return (
    <div className="rbst-kpi-grid">
      {cards.map((c) => (
        <article key={c.key} className="rbst-kpi">
          <div className="rbst-kpi-label">
            {c.label}
            {c.tip && (
              <span className="rbst-kpi-tip" title={c.tip}>
                <HelpCircle size={13} aria-hidden />
                <span className="sr-only">{c.tip}</span>
              </span>
            )}
          </div>
          <div className="rbst-kpi-value">{c.value}</div>
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
  ranking: StaffRankingRow[];
  metric: ReportMetric;
  topN: number;
  loading: boolean;
}) {
  const data = useMemo(() => {
    const slice = topN > 0 ? ranking.slice(0, topN) : ranking;
    return slice.map((r) => ({
      name: r.staffName.length > 18 ? `${r.staffName.slice(0, 16)}…` : r.staffName,
      fullName: r.staffName,
      value: metricValue(r, metric),
      staffId: r.staffId,
    }));
  }, [ranking, metric, topN]);

  const isMoney = !['invoiceCount', 'itemQuantity'].includes(metric);
  const hasData = data.some((d) => d.value > 0);

  if (loading && ranking.length === 0) {
    return <div className="rbst-chart-wrap rbst-skeleton" style={{ height: 320 }} aria-busy="true" />;
  }

  if (!hasData) {
    return (
      <div className="rbst-empty rbst-empty-sm">
        <p>Chưa có dữ liệu xếp hạng nhân viên trong khoảng đã chọn.</p>
      </div>
    );
  }

  return (
    <div className="rbst-chart-wrap" role="img" aria-label={`Biểu đồ xếp hạng ${METRIC_LABELS[metric]} theo nhân viên`}>
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
}: {
  report: StaffReportResponse | null;
  metric: ReportMetric;
  chartView: ChartView;
  loading: boolean;
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
        row[s.staffId] = pt ? Number(pt[metric as keyof typeof pt] ?? 0) : 0;
      });
      return row;
    });
  }, [series, metric]);

  const isMoney = !['invoiceCount', 'itemQuantity'].includes(metric);
  const hasData = chartData.some((row) => series.some((s) => Number(row[s.staffId] ?? 0) > 0));

  if (loading && !report) {
    return <div className="rbst-chart-wrap rbst-skeleton" style={{ height: 320 }} aria-busy="true" />;
  }

  if (!hasData) {
    return (
      <div className="rbst-empty rbst-empty-sm">
        <p>Chưa có dữ liệu xu hướng theo nhân viên.</p>
      </div>
    );
  }

  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.06)" />
      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} minTickGap={16} />
      <YAxis
        tick={{ fontSize: 11, fill: '#64748b' }}
        tickFormatter={(v) => formatNumber(v)}
        width={72}
      />
      <Tooltip
        formatter={(value: number, name: string) => {
          const store = series.find((s) => s.staffId === name);
          return [isMoney ? formatMoney(value) : formatNumber(value), store?.staffName ?? name];
        }}
        contentStyle={{ borderRadius: 10, border: '1px solid rgba(15,23,42,0.08)' }}
      />
      <Legend
        formatter={(value) => series.find((s) => s.staffId === value)?.staffName ?? value}
        wrapperStyle={{ fontSize: 12 }}
      />
    </>
  );

  return (
    <div className="rbst-chart-wrap" role="img" aria-label="Biểu đồ xu hướng doanh thu theo nhân viên">
      {report?.trend?.note && (
        <p style={{ margin: '0 8px 8px', fontSize: 12, color: '#64748b' }}>{report.trend.note}</p>
      )}
      <ResponsiveContainer width="100%" height={320}>
        {chartView === 'area' ? (
          <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            {common}
            {series.map((s, i) => (
              <Area
                key={s.staffId}
                type="monotone"
                dataKey={s.staffId}
                name={s.staffId}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                fillOpacity={0.12}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </AreaChart>
        ) : chartView === 'line' ? (
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            {common}
            {series.map((s, i) => (
              <Line
                key={s.staffId}
                type="monotone"
                dataKey={s.staffId}
                name={s.staffId}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        ) : chartView === 'combo' ? (
          <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            {common}
            {series.slice(0, 1).map((s, i) => (
              <Bar
                key={s.staffId}
                dataKey={s.staffId}
                name={s.staffId}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
            ))}
            {series.slice(1).map((s, i) => (
              <Line
                key={s.staffId}
                type="monotone"
                dataKey={s.staffId}
                name={s.staffId}
                stroke={CHART_COLORS[(i + 1) % CHART_COLORS.length]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </ComposedChart>
        ) : (
          <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            {common}
            {series.map((s, i) => (
              <Bar
                key={s.staffId}
                dataKey={s.staffId}
                name={s.staffId}
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
    return <div className="rbst-skeleton" style={{ height: 220, borderRadius: 12 }} aria-busy="true" />;
  }

  if (total <= 0) {
    return (
      <div className="rbst-empty rbst-empty-sm">
        <p>Tổng doanh thu thuần = 0 — không hiển thị tỷ trọng.</p>
      </div>
    );
  }

  return (
    <div className="rbst-breakdown-body">
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
      <ul className="rbst-legend-list">
        {items.map((item, i) => (
          <li key={item.key}>
            <span
              className="rbst-tooltip-dot"
              style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
              aria-hidden
            />
            <span className="rbst-legend-label" title={item.label}>
              {item.label}
            </span>
            <strong>{formatPercent(item.percent, false)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── Table ─── */

function StaffTable({
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
  rows: StaffRankingRow[];
  totals: StaffReportResponse['table']['totals'] | null;
  pagination: StaffReportResponse['table']['pagination'] | null;
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
          className={`rbst-th-btn${active ? ' is-active' : ''}`}
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
    <section className="rbst-surface">
      <div className="rbst-surface-head">
        <div>
          <h2>Chi tiết theo nhân viên</h2>
          <p>Sắp xếp và phân trang phía máy chủ. Tổng cộng phản ánh toàn bộ kết quả đã lọc.</p>
        </div>
      </div>
      <div className="rbst-table-scroll">
        <table className="rbst-table">
          <thead>
            <tr>
              {sortBtn('rank', 'Hạng')}
              <th scope="col">
                <span className="rbst-th-btn" style={{ cursor: 'default' }}>
                  Email
                </span>
              </th>
              {sortBtn('staffName', 'Nhân viên')}
              <th scope="col">
                <span className="rbst-th-btn" style={{ cursor: 'default' }}>
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
                <span className="rbst-th-btn" style={{ cursor: 'default' }}>
                  Tỷ trọng
                </span>
              </th>
              {showCost && (
                <th className="num" scope="col">
                  <span className="rbst-th-btn" style={{ cursor: 'default' }}>
                    LN gộp
                  </span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={showCost ? 14 : 13} className="rbst-table-empty">
                  Đang tải bảng…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={showCost ? 14 : 13} className="rbst-table-empty">
                  Không có nhân viên nào trong bộ lọc hiện tại.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.staffId}>
                  <td>{r.rank}</td>
                  <td>{r.staffEmail || '—'}</td>
                  <td>{r.staffName}</td>
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
        <div className="rbst-pagination">
          <div className="rbst-inline-field">
            <label htmlFor="rbst-per-page">Hiển thị</label>
            <select
              id="rbst-per-page"
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
              · {pagination.total} nhân viên · trang {pagination.page}/{Math.max(1, pagination.totalPages)}
            </span>
          </div>
          <div className="rbst-pagination-btns">
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

export function RevenueByStaffPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [options, setOptions] = useState<RevenueByStaffOptions | null>(null);
  const [draft, setDraft] = useState<StaffReportFilters>(() => defaultFilters());
  const [applied, setApplied] = useState<StaffReportFilters>(() => defaultFilters());
  const [preset, setPreset] = useState<DatePreset>('last_30_days');
  const [report, setReport] = useState<StaffReportResponse | null>(null);
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

  const abortRef = useRef<AbortController | null>(null);
  const requestSeq = useRef(0);
  const exportRef = useRef<HTMLDivElement | null>(null);
  const initialLoadDone = useRef(false);
  const skipUrlWrite = useRef(false);

  const loadReport = useCallback(async (filters: StaffReportFilters, mode: 'load' | 'refresh' = 'load') => {
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
      const data = await fetchRevenueByStaffReport(filters, controller.signal);
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
      try {
        const opts = await fetchRevenueByStaffOptions(controller.signal);
        setOptions(opts);
      } catch {
        // non-fatal
      }

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
  }, []);

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

  // Debounced search when applied already has other filters
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (value: string) => {
    setDraft((d) => ({ ...d, search: value, page: 1 }));
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      const next = { ...applied, search: value, page: 1 };
      void loadReport(next, 'load');
    }, 400);
  };

  const patchDraft = (patch: Partial<StaffReportFilters>) => {
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
    const next: StaffReportFilters = {
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

  const toggleStaffId = (id: string) => {
    setDraft((prev) => {
      const has = prev.staffIds.includes(id);
      const staffIds = has ? prev.staffIds.filter((x) => x !== id) : [...prev.staffIds, id];
      return { ...prev, staffIds, page: 1 };
    });
  };

  const handlePrint = () => {
    window.print();
    setExportOpen(false);
  };

  const busy = loading || refreshing;
  const showCost = Boolean(report?.meta?.hasCostData);
  const ranking = report?.ranking ?? [];
  const tableRows = report?.table?.data ?? [];
  const metric = applied.metric;

  const statusNote =
    applied.status && applied.status !== 'completed'
      ? ` · Đang lọc trạng thái: ${applied.status}`
      : ' · Mặc định chỉ hóa đơn hoàn tất';

  return (
    <main className="rbst-page revenue-staff-report-page">
      {busy && <div className="rbst-progress" aria-hidden />}

      <header className="rbst-hero">
        <div>
          <div className="rbst-hero-meta" style={{ marginTop: 0, marginBottom: 4 }}>
            Báo cáo / Doanh thu
          </div>
          <h1>
            <Users size={22} style={{ display: 'inline', verticalAlign: -4, marginRight: 8 }} aria-hidden />
            Doanh thu theo nhân viên
          </h1>
          <p>
            Tổng hợp doanh thu, hoàn tiền và xếp hạng theo từng nhân viên từ dữ liệu bán hàng thực tế.
            {statusNote}
          </p>
          <div className="rbst-hero-meta">
            Cập nhật lúc: {formatDateTime(report?.meta?.generatedAt)}
            {report?.meta?.timezone ? ` · ${report.meta.timezone}` : ''}
            {report?.meta?.saleCountLoaded != null
              ? ` · ${report.meta.saleCountLoaded} HĐ · ${report.meta.refundCountLoaded ?? 0} hoàn`
              : ''}
          </div>
        </div>
        <div className="rbst-hero-actions">
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
            <RefreshCw size={16} className={refreshing ? 'rbst-spin' : undefined} aria-hidden />
            Làm mới
          </button>
          <div className="rbst-export" ref={exportRef}>
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
              <div className="rbst-export-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    exportRankingExcel(ranking, applied, showCost);
                    setExportOpen(false);
                  }}
                >
                  Xuất Excel (toàn bộ đã lọc)
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    exportRankingCsv(ranking, applied, showCost);
                    setExportOpen(false);
                  }}
                >
                  Xuất CSV bảng xếp hạng
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    exportSummaryCsv(report, applied);
                    setExportOpen(false);
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
      <section className="rbst-filters">
        <div className="rbst-filters-head">
          <div>
            <h2>Bộ lọc</h2>
            <p>Áp dụng để tải báo cáo. Không gửi request khi đang gõ nửa chừng khoảng ngày.</p>
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
          <div className="rbst-filters-body">
            <div className="rbst-filter-grid">
              <label className="rbst-field">
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
              <label className="rbst-field">
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
              <label className="rbst-field">
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
              <label className="rbst-field">
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
              <label className="rbst-field">
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
              <label className="rbst-field">
                Cửa hàng
                <select
                  value={draft.storeId}
                  onChange={(e) => patchDraft({ storeId: e.target.value, page: 1 })}
                >
                  <option value="">Tất cả</option>
                  {(options?.stores ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.code ? ` (${s.code})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="rbst-field">
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
              <label className="rbst-field">
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
              <label className="rbst-field">
                So sánh
                <select
                  value={draft.compare}
                  onChange={(e) =>
                    patchDraft({ compare: e.target.value as StaffReportFilters['compare'], page: 1 })
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
              <label className="rbst-field">
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
              <label className="rbst-field">
                Xu hướng theo
                <select
                  value={draft.trendGranularity}
                  onChange={(e) =>
                    patchDraft({
                      trendGranularity: e.target.value as StaffReportFilters['trendGranularity'],
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
              <label className="rbst-field">
                Tìm nhân viên
                <input
                  type="search"
                  placeholder="Tên, email hoặc vai trò…"
                  value={draft.search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  maxLength={100}
                />
              </label>
            </div>

            {/* Multi-staff select */}
            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#64748b',
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Users size={14} aria-hidden />
                Nhân viên (để trống = tất cả)
                {draft.staffIds.length > 0 && (
                  <button
                    type="button"
                    className="rbst-chip"
                    onClick={() => patchDraft({ staffIds: [], page: 1 })}
                  >
                    Bỏ chọn ({draft.staffIds.length})
                  </button>
                )}
              </div>
              <div className="rbst-series-toggles" style={{ padding: 0 }}>
                {(options?.staff ?? []).map((s) => {
                  const on = draft.staffIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`rbst-chip${on ? ' is-on' : ''}`}
                      onClick={() => toggleStaffId(s.id)}
                      aria-pressed={on}
                      title={s.isActive === false ? 'Ngừng hoạt động' : s.email || undefined}
                    >
                      {s.name}
                      {s.email ? ` (${s.email})` : ''}
                      {s.isActive === false ? ' · ngừng' : ''}
                    </button>
                  );
                })}
                {(options?.staff ?? []).length === 0 && (
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>Chưa có danh sách nhân viên từ API.</span>
                )}
              </div>
            </div>

            {validationError && (
              <div className="rbst-filter-error" role="alert">
                {validationError}
              </div>
            )}

            <div className="rbst-filter-actions">
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
        <div className="rbst-alert" role="alert">
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <AlertTriangle size={18} aria-hidden />
            <span>{error}</span>
          </div>
          <div className="rbst-alert-actions">
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
      <section className="rbst-surface">
        <div className="rbst-surface-head">
          <div>
            <h2>
              <TrendingUp size={16} style={{ verticalAlign: -2, marginRight: 6 }} aria-hidden />
              Xếp hạng nhân viên
            </h2>
            <p>Theo chỉ số: {METRIC_LABELS[metric] ?? metric}</p>
          </div>
          <div className="rbst-surface-tools">
            <label className="rbst-inline-field">
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
      <section className="rbst-surface">
        <div className="rbst-surface-head">
          <div>
            <h2>Xu hướng theo thời gian</h2>
            <p>So sánh top nhân viên theo {METRIC_LABELS[metric] ?? metric}</p>
          </div>
          <div className="rbst-surface-tools">
            <label className="rbst-inline-field">
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
        />
      </section>

      {/* Share + secondary breakdowns */}
      <section className="rbst-surface">
        <div className="rbst-surface-head">
          <div>
            <h2>Tỷ trọng &amp; phân tích phụ</h2>
            <p>Tỷ trọng doanh thu thuần theo nhân viên, kênh và phương thức thanh toán.</p>
          </div>
        </div>
        <div className="rbst-breakdown-grid">
          <div className="rbst-breakdown-card">
            <h3>Tỷ trọng theo nhân viên</h3>
            <SharePieChart
              items={report?.breakdowns?.revenueShareByStaff ?? []}
              loading={loading && !report}
            />
          </div>
          <div className="rbst-breakdown-card">
            <h3>Theo loại bán</h3>
            <SharePieChart items={report?.breakdowns?.channels ?? []} loading={loading && !report} />
          </div>
          <div className="rbst-breakdown-card">
            <h3>Theo phương thức TT</h3>
            <SharePieChart
              items={report?.breakdowns?.paymentMethods ?? []}
              loading={loading && !report}
            />
          </div>
          <div className="rbst-breakdown-card">
            <h3>Theo cửa hàng</h3>
            <SharePieChart items={report?.breakdowns?.stores ?? []} loading={loading && !report} />
          </div>
        </div>
      </section>

      <StaffTable
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

      {!bootstrapped && !report && !error && (
        <div className="rbst-empty" aria-busy="true">
          <p>Đang khởi tạo báo cáo…</p>
        </div>
      )}
    </main>
  );
}

export default RevenueByStaffPage;
