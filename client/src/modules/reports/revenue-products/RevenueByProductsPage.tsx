import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RevenueReportNav } from '../components/RevenueReportNav';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  Download,
  HelpCircle,
  Minus,
  Package,
  Printer,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import {
  Area,
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
import { suggestProducts } from '../../../core/api/filterSuggestions';
import { FilterSuggestInput } from '../../../core/components/ui/FilterSuggestInput';
import { useProductScanTarget } from '../../../core/hooks/productScanner';
import { fetchRevenueByProductsOptions, fetchRevenueByProductsReport } from './revenueByProducts.api';
import type {
  ChartView,
  DatePreset,
  MetricComparison,
  ProductRankingRow,
  ProductReportFilters,
  ProductReportResponse,
  ProductReportSummary,
  ReportMetric,
  RevenueByProductsOptions,
  SortField,
} from './revenueByProducts.types';
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
  formatDisplayDate,
  formatMoney,
  formatNumber,
  formatPercent,
  METRIC_LABELS,
  metricValue,
  PRESET_LABELS,
  rangeFromPreset,
  suggestedTrendGranularity,
  validateDateRange,
  validateProductFilterDraft,
} from './revenueByProducts.utils';
import './revenue-by-products.css';
import './revenue-by-products-soft-type.css';

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

function TimelineTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{ color?: string; dataKey?: string; name?: string; value?: number }>;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rbp-tooltip rbp-tooltip-lg">
      <div className="rbp-tooltip-title">{label}</div>
      {payload.map((entry) => {
        const key = String(entry.dataKey ?? entry.name ?? '');
        const isQuantity = key === 'itemQuantity';
        const labelText = isQuantity
          ? 'SL bán'
          : key === 'netRevenue'
            ? 'DT thuần'
            : key === 'refundAmount'
              ? 'Hoàn'
              : 'Doanh thu';

        return (
          <div className="rbp-tooltip-row" key={key}>
            <span className="rbp-tooltip-dot" style={{ background: entry.color }} />
            <span>{labelText}</span>
            <strong>{isQuantity ? formatNumber(Number(entry.value ?? 0)) : formatMoney(Number(entry.value ?? 0))}</strong>
          </div>
        );
      })}
    </div>
  );
}

function ChangeBadge({ metric }: { metric: MetricComparison }) {
  if (!metric) {
    return (
      <span className="rbp-kpi-change rbp-kpi-flat">
        <Minus size={14} aria-hidden />
        —
      </span>
    );
  }
  if (metric.changePercent === null || metric.changePercent === undefined) {
    if (metric.previousValue === 0 && (metric.currentValue ?? 0) > 0) {
      return (
        <span className="rbp-kpi-change rbp-kpi-up" title="Kỳ trước = 0">
          <ArrowUpRight size={14} aria-hidden />
          Mới
        </span>
      );
    }
    return (
      <span className="rbp-kpi-change rbp-kpi-flat" title="Không có cơ sở so sánh %">
        <HelpCircle size={14} aria-hidden />
        Không so sánh
      </span>
    );
  }
  const pct = metric.changePercent;
  if (pct > 0) {
    return (
      <span className="rbp-kpi-change rbp-kpi-up" title={`Kỳ trước: ${metric.previousValue}`}>
        <ArrowUpRight size={14} aria-hidden />
        {formatPercent(pct)}
      </span>
    );
  }
  if (pct < 0) {
    return (
      <span className="rbp-kpi-change rbp-kpi-down" title={`Kỳ trước: ${metric.previousValue}`}>
        <ArrowDownRight size={14} aria-hidden />
        {formatPercent(pct)}
      </span>
    );
  }
  return (
    <span className="rbp-kpi-change rbp-kpi-flat">
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
  summary: ProductReportSummary | null;
  comparison: Record<string, MetricComparison> | null | undefined;
  loading: boolean;
}) {
  const cards = useMemo(() => {
    if (!summary) return [];
    return [
      {
        key: 'itemQuantity',
        label: 'Số lượng bán',
        value: formatNumber(summary.itemQuantity),
        metricKey: 'itemQuantity',
      },
      {
        key: 'productCount',
        label: 'SP có doanh thu',
        value: formatNumber(summary.productCount),
        metricKey: 'productCount',
      },
      {
        key: 'averageSellingPrice',
        label: 'Giá bán TB',
        value: formatMoney(summary.averageSellingPrice),
        metricKey: 'averageSellingPrice',
        tip: 'Doanh thu ÷ số lượng bán',
      },
      {
        key: 'returnRate',
        label: 'Tỷ lệ trả SL',
        value:
          summary.returnRatePercent === null || summary.returnRatePercent === undefined
            ? '—'
            : formatPercent(summary.returnRatePercent, false),
        metricKey: 'returnRatePercent',
        tip: 'qtyReturned ÷ itemQuantity',
      },
      {
        key: 'topProduct',
        label: 'SP dẫn đầu',
        value: summary.topProduct
          ? `${summary.topProduct.name} · ${formatMoney(summary.topProduct.netRevenue)}`
          : '—',
      },
    ];
  }, [summary]);

  if (loading && !summary) {
    return (
      <div className="rbp-kpi-grid" aria-busy="true" aria-label="Đang tải KPI">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rbp-kpi rbp-skeleton" style={{ height: 96 }} />
        ))}
      </div>
    );
  }

  return (
    <div className="rbp-kpi-grid">
      {cards.map((c) => (
        <article key={c.key} className="rbp-kpi">
          <div className="rbp-kpi-label">
            {c.label}
            {c.tip && (
              <span className="rbp-kpi-tip" title={c.tip}>
                <HelpCircle size={13} aria-hidden />
                <span className="sr-only">{c.tip}</span>
              </span>
            )}
          </div>
          <div className="rbp-kpi-value" title={c.value}>
            {c.value}
          </div>
          {c.metricKey && comparison?.[c.metricKey] !== undefined && (
            <ChangeBadge metric={comparison[c.metricKey]} />
          )}
        </article>
      ))}
    </div>
  );
}

function RankingBarChart({
  ranking,
  metric,
  loading,
}: {
  ranking: ProductRankingRow[];
  metric: ReportMetric;
  loading: boolean;
}) {
  const data = useMemo(
    () =>
      ranking.map((r) => ({
        name: r.productName.length > 28 ? `${r.productName.slice(0, 26)}…` : r.productName,
        fullName: r.productName,
        value: Number(metricValue(r, metric)) || 0,
        productId: r.productId,
      })),
    [ranking, metric],
  );
  const isMoney = !['invoiceCount', 'itemQuantity'].includes(metric);
  const hasData = data.some((d) => d.value > 0);
  // Wider Y labels on full-width chart; keep enough right margin for value ticks.
  const yAxisWidth = 168;

  if (loading && ranking.length === 0) {
    return <div className="rbp-chart-wrap rbp-skeleton" style={{ height: 320 }} aria-busy="true" />;
  }
  if (!hasData) {
    return (
      <div className="rbp-empty rbp-empty-sm">
        <p>Chưa có dữ liệu xếp hạng sản phẩm trong khoảng đã chọn.</p>
      </div>
    );
  }

  return (
    <div className="rbp-chart-wrap rbp-chart-wrap-full" role="img" aria-label={`Top sản phẩm theo ${METRIC_LABELS[metric]}`}>
      <ResponsiveContainer width="100%" height={Math.max(300, data.length * 38)}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 28, left: 4, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.06)" horizontal={false} />
          <XAxis type="number" domain={[0, 'auto']} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => formatNumber(v)} />
          <YAxis type="category" dataKey="name" width={yAxisWidth} tick={{ fontSize: 11, fill: '#64748b' }} />
          <Tooltip
            formatter={(value: number) => [isMoney ? formatMoney(value) : formatNumber(value), METRIC_LABELS[metric]]}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ''}
            contentStyle={{ borderRadius: 10, border: '1px solid rgba(15,23,42,0.08)' }}
          />
          <Bar dataKey="value" fill="#10b981" radius={[0, 6, 6, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TimelineChart({
  report,
  chartView,
  loading,
}: {
  report: ProductReportResponse | null;
  chartView: ChartView;
  loading: boolean;
}) {
  // Coerce numeric fields — Recharts silently fails to plot non-number values.
  const data = useMemo(
    () =>
      (report?.timeline ?? []).map((d) => ({
        key: d.key,
        label: d.label,
        revenue: Number(d.revenue) || 0,
        refundAmount: Number(d.refundAmount) || 0,
        netRevenue: Number(d.netRevenue) || 0,
        itemQuantity: Number(d.itemQuantity) || 0,
        invoiceCount: Number(d.invoiceCount) || 0,
      })),
    [report?.timeline],
  );
  const hasData = data.some((d) => d.revenue > 0 || d.refundAmount > 0 || d.netRevenue > 0 || d.itemQuantity > 0);

  if (loading && !report) {
    return <div className="rbp-chart-wrap rbp-skeleton" style={{ height: 320 }} aria-busy="true" />;
  }
  if (!hasData) {
    return (
      <div className="rbp-empty rbp-empty-sm">
        <p>Chưa có dữ liệu doanh thu theo thời gian.</p>
      </div>
    );
  }

  // Shared axes/tooltip as a flat array (Recharts does not always flatten Fragments).
  // Prefer ComposedChart when mixing Area/Bar + Line so dual-axis series always render.
  const commonAxes: ReactNode[] = [
    <CartesianGrid key="grid" stroke="#dbe5ef" strokeDasharray="3 3" vertical horizontal />,
    <XAxis
      key="x"
      dataKey="label"
      axisLine={{ stroke: '#cbd5e1' }}
      tickLine={{ stroke: '#cbd5e1' }}
      tick={{ fontSize: 11, fill: '#64748b' }}
      minTickGap={16}
      interval="preserveStartEnd"
    />,
    <YAxis
      key="money"
      yAxisId="money"
      domain={[0, 'auto']}
      axisLine={{ stroke: '#cbd5e1' }}
      tickLine={{ stroke: '#cbd5e1' }}
      tick={{ fontSize: 11, fill: '#64748b' }}
      tickFormatter={(value) => formatNumber(Number(value))}
      width={72}
    />,
    <YAxis
      key="qty"
      yAxisId="qty"
      orientation="right"
      domain={[0, 'auto']}
      axisLine={{ stroke: '#cbd5e1' }}
      tickLine={{ stroke: '#cbd5e1' }}
      tick={{ fontSize: 11, fill: '#6366f1' }}
      tickFormatter={(value) => formatNumber(Number(value))}
      width={48}
      allowDecimals={false}
    />,
    <Tooltip key="tip" content={<TimelineTooltip />} cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }} />,
    <Legend key="legend" wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />,
  ];

  const margin = { top: 12, right: 16, left: 4, bottom: 8 };

  let series: ReactNode[] = [];
  if (chartView === 'area') {
    series = [
      <Area key="revenue" yAxisId="money" type="monotone" dataKey="revenue" name="Doanh thu" stroke="#10b981" fill="#10b981" fillOpacity={0.18} strokeWidth={2} isAnimationActive={false} activeDot={{ r: 4 }} />,
      <Area key="net" yAxisId="money" type="monotone" dataKey="netRevenue" name="DT thuần" stroke="#059669" fill="#059669" fillOpacity={0.1} strokeWidth={2} isAnimationActive={false} activeDot={{ r: 4 }} />,
      <Line key="qty-line" yAxisId="qty" type="monotone" dataKey="itemQuantity" name="SL bán" stroke="#6366f1" strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 4 }} />,
    ];
  } else if (chartView === 'line') {
    series = [
      <Line key="revenue" yAxisId="money" type="monotone" dataKey="revenue" name="Doanh thu" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 4 }} />,
      <Line key="net" yAxisId="money" type="monotone" dataKey="netRevenue" name="DT thuần" stroke="#059669" strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 4 }} />,
      <Line key="qty-line" yAxisId="qty" type="monotone" dataKey="itemQuantity" name="SL bán" stroke="#6366f1" strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 4 }} />,
    ];
  } else if (chartView === 'combo') {
    series = [
      <Bar key="revenue" yAxisId="money" dataKey="revenue" name="Doanh thu" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />,
      <Line key="net" yAxisId="money" type="monotone" dataKey="netRevenue" name="DT thuần" stroke="#059669" strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 4 }} />,
      <Line key="qty-line" yAxisId="qty" type="monotone" dataKey="itemQuantity" name="SL bán" stroke="#6366f1" strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 4 }} />,
    ];
  } else {
    series = [
      <Bar key="revenue" yAxisId="money" dataKey="revenue" name="Doanh thu" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />,
      <Bar key="refund" yAxisId="money" dataKey="refundAmount" name="Hoàn" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />,
      <Line key="qty-line" yAxisId="qty" type="monotone" dataKey="itemQuantity" name="SL bán" stroke="#6366f1" strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 4 }} />,
    ];
  }

  return (
    <div className="rbp-chart-wrap" role="img" aria-label="Doanh thu theo thời gian">
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={data} margin={margin}>
          {commonAxes}
          {series}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrendMultiChart({
  report,
  metric,
  loading,
}: {
  report: ProductReportResponse | null;
  metric: ReportMetric;
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
        row[s.productId] = pt ? Number(pt[metric as keyof typeof pt] ?? pt.netRevenue ?? 0) : 0;
      });
      return row;
    });
  }, [series, metric]);

  const isMoney = !['invoiceCount', 'itemQuantity'].includes(metric);
  const hasData = chartData.some((row) => series.some((s) => Number(row[s.productId] ?? 0) > 0));

  if (loading && !report) {
    return <div className="rbp-chart-wrap rbp-skeleton" style={{ height: 280 }} aria-busy="true" />;
  }
  if (!hasData) {
    return (
      <div className="rbp-empty rbp-empty-sm">
        <p>Chưa có dữ liệu xu hướng top sản phẩm.</p>
      </div>
    );
  }

  return (
    <div className="rbp-chart-wrap" role="img" aria-label="Xu hướng top sản phẩm">
      {report?.trend?.note && (
        <p style={{ margin: '0 8px 8px', fontSize: 12, color: '#64748b' }}>{report.trend.note}</p>
      )}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.06)" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} minTickGap={16} />
          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => formatNumber(v)} width={72} />
          <Tooltip
            formatter={(value: number, name: string) => {
              const p = series.find((s) => s.productId === name);
              return [isMoney ? formatMoney(value) : formatNumber(value), p?.productName ?? name];
            }}
            contentStyle={{ borderRadius: 10, border: '1px solid rgba(15,23,42,0.08)' }}
          />
          <Legend
            formatter={(value) => series.find((s) => s.productId === value)?.productName ?? value}
            wrapperStyle={{ fontSize: 12 }}
          />
          {series.map((s, i) => (
            <Line
              key={s.productId}
              type="monotone"
              dataKey={s.productId}
              name={s.productId}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SharePieChart({
  items,
  loading,
  emptyLabel,
}: {
  items: { key: string; label: string; revenue: number; percent: number }[];
  loading: boolean;
  emptyLabel: string;
}) {
  const pieData = useMemo(
    () =>
      items
        .map((i) => ({
          ...i,
          revenue: Number(i.revenue) || 0,
          percent: Number(i.percent) || 0,
        }))
        .filter((i) => i.revenue > 0),
    [items],
  );
  const total = pieData.reduce((s, i) => s + i.revenue, 0);
  // Single-slice pie + paddingAngle creates a visible "gap corner" (góc thừa).
  const paddingAngle = pieData.length > 1 ? 2 : 0;

  if (loading && items.length === 0) {
    return <div className="rbp-skeleton" style={{ height: 220, borderRadius: 12 }} aria-busy="true" />;
  }
  if (total <= 0) {
    return (
      <div className="rbp-empty rbp-empty-sm">
        <p>{emptyLabel}</p>
      </div>
    );
  }
  return (
    <div className={`rbp-breakdown-body${pieData.length === 1 ? ' is-single' : ''}`}>
      <div className="rbp-pie-chart">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <Pie
              data={pieData}
              dataKey="revenue"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={80}
              paddingAngle={paddingAngle}
              stroke="#fff"
              strokeWidth={pieData.length > 1 ? 1 : 0}
              isAnimationActive={false}
              startAngle={90}
              endAngle={-270}
            >
              {pieData.map((entry, i) => (
                <Cell key={entry.key} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, name: string) => [formatMoney(value), name]}
              contentStyle={{ borderRadius: 10, border: '1px solid rgba(15,23,42,0.08)' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="rbp-legend-list">
        {pieData.map((item, i) => (
          <li key={item.key}>
            <span className="rbp-tooltip-dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} aria-hidden />
            <span className="rbp-legend-label" title={item.label}>
              {item.label}
            </span>
            <strong>{formatPercent(item.percent, false)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ParetoChart({
  report,
  loading,
}: {
  report: ProductReportResponse | null;
  loading: boolean;
}) {
  const points = report?.pareto?.points ?? [];
  if (loading && !report) {
    return <div className="rbp-chart-wrap rbp-skeleton" style={{ height: 280 }} aria-busy="true" />;
  }
  if (points.length === 0 || (report?.pareto?.totalNetRevenue ?? 0) <= 0) {
    return (
      <div className="rbp-empty rbp-empty-sm">
        <p>Chưa đủ dữ liệu cho biểu đồ Pareto.</p>
      </div>
    );
  }
  const data = points.map((p) => ({
    name: p.productName.length > 14 ? `${p.productName.slice(0, 12)}…` : p.productName,
    fullName: p.productName,
    netRevenue: p.netRevenue,
    cumulativePercent: p.cumulativePercent,
  }));

  return (
    <div className="rbp-chart-wrap" role="img" aria-label="Pareto doanh thu tích lũy">
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.06)" />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-30} textAnchor="end" height={60} />
          <YAxis yAxisId="money" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => formatNumber(v)} width={72} />
          <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} width={40} unit="%" />
          <Tooltip
            formatter={(value: number, name) =>
              String(name) === 'Tích lũy' || String(name) === 'cumulativePercent'
                ? [`${value}%`, 'Tích lũy']
                : [formatMoney(value), 'DT thuần']
            }
            labelFormatter={((_: unknown, payload?: Array<{ payload?: { fullName?: string } }>) =>
              payload?.[0]?.payload?.fullName ?? '') as (label: unknown) => string}
            contentStyle={{ borderRadius: 10, border: '1px solid rgba(15,23,42,0.08)' }}
          />
          <Bar yAxisId="money" dataKey="netRevenue" name="DT thuần" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={20} />
          <Line yAxisId="pct" type="monotone" dataKey="cumulativePercent" name="Tích lũy" stroke="#6366f1" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function ProductTable({
  rows,
  totals,
  pagination,
  sortBy,
  sortDirection,
  perPage,
  loading,
  onSort,
  onPageChange,
  onPerPageChange,
}: {
  rows: ProductRankingRow[];
  totals: ProductReportResponse['table']['totals'] | null;
  pagination: ProductReportResponse['table']['pagination'] | null;
  sortBy: SortField;
  sortDirection: 'asc' | 'desc';
  perPage: number;
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
          className={`rbp-th-btn${active ? ' is-active' : ''}`}
          onClick={() => onSort(field)}
          aria-sort={active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
        >
          {label}
          {arrow}
        </button>
      </th>
    );
  };

  const startIndex = pagination ? (pagination.page - 1) * pagination.perPage : 0;

  return (
    <section className="rbp-surface">
      <div className="rbp-surface-head">
        <div>
          <h2>Chi tiết theo sản phẩm</h2>
          <p>Sắp xếp và phân trang phía máy chủ. Tổng cộng phản ánh toàn bộ kết quả đã lọc (không chỉ trang hiện tại). Cuộn ngang khi bảng rộng hơn màn hình.</p>
        </div>
      </div>
      <div className="rbp-table-scroll">
        <table className="rbp-table rbp-table-detail">
          <colgroup>
            <col className="rbp-col-stt" />
            <col className="rbp-col-rank" />
            <col className="rbp-col-code" />
            <col className="rbp-col-name" />
            <col className="rbp-col-category" />
            <col className="rbp-col-qty" />
            <col className="rbp-col-qty" />
            <col className="rbp-col-invoice" />
            <col className="rbp-col-money" />
            <col className="rbp-col-money" />
            <col className="rbp-col-money" />
            <col className="rbp-col-money" />
            <col className="rbp-col-money" />
            <col className="rbp-col-share" />
            <col className="rbp-col-date" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">
                <span className="rbp-th-btn" style={{ cursor: 'default' }}>
                  STT
                </span>
              </th>
              {sortBtn('rank', 'Hạng')}
              {sortBtn('productCode', 'Mã SP')}
              {sortBtn('productName', 'Sản phẩm')}
              <th scope="col">
                <span className="rbp-th-btn" style={{ cursor: 'default' }}>
                  Danh mục
                </span>
              </th>
              {sortBtn('itemQuantity', 'SL bán')}
              {sortBtn('qtyReturned', 'SL trả')}
              {sortBtn('invoiceCount', 'Số HĐ')}
              {sortBtn('revenue', 'Doanh thu')}
              {sortBtn('discountAmount', 'Giảm dòng')}
              {sortBtn('refundAmount', 'Hoàn')}
              {sortBtn('netRevenue', 'DT thuần')}
              {sortBtn('averageSellingPrice', 'Giá TB')}
              {sortBtn('revenueSharePercent', 'Tỷ trọng')}
              {sortBtn('lastSoldAt', 'Bán gần nhất')}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={15} className="rbp-table-empty">
                  Đang tải bảng…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={15} className="rbp-table-empty">
                  Không có sản phẩm nào trong bộ lọc hiện tại.
                </td>
              </tr>
            ) : (
              rows.map((r, idx) => (
                <tr key={r.productId}>
                  <td>{startIndex + idx + 1}</td>
                  <td>{r.rank}</td>
                  <td className="rbp-cell-wrap" title={r.productCode ?? undefined}>
                    {r.productCode || '—'}
                  </td>
                  <td className="rbp-cell-wrap" title={r.productName}>
                    {r.productName}
                  </td>
                  <td className="rbp-cell-wrap" title={r.categoryName ?? undefined}>
                    {r.categoryName || '—'}
                  </td>
                  <td>{formatNumber(r.itemQuantity)}</td>
                  <td>{formatNumber(r.qtyReturned)}</td>
                  <td>{formatNumber(r.invoiceCount)}</td>
                  <td>{formatMoney(r.revenue)}</td>
                  <td>{formatMoney(r.discountAmount)}</td>
                  <td>{formatMoney(r.refundAmount)}</td>
                  <td>
                    <strong>{formatMoney(r.netRevenue)}</strong>
                  </td>
                  <td>{formatMoney(r.averageSellingPrice)}</td>
                  <td>{formatPercent(r.revenueSharePercent, false)}</td>
                  <td className="rbp-cell-wrap">{formatDateTime(r.lastSoldAt)}</td>
                </tr>
              ))
            )}
          </tbody>
          {totals && rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={5}>Tổng cộng (toàn bộ đã lọc)</td>
                <td>{formatNumber(totals.itemQuantity)}</td>
                <td>{formatNumber(totals.qtyReturned)}</td>
                <td>{formatNumber(totals.invoiceCount)}</td>
                <td>{formatMoney(totals.revenue)}</td>
                <td>{formatMoney(totals.discountAmount)}</td>
                <td>{formatMoney(totals.refundAmount)}</td>
                <td>{formatMoney(totals.netRevenue)}</td>
                <td>{formatMoney(totals.averageSellingPrice)}</td>
                <td>100%</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {pagination && (
        <div className="rbp-pagination">
          <div className="rbp-inline-field">
            <label htmlFor="rbp-per-page">Hiển thị</label>
            <select id="rbp-per-page" value={perPage} onChange={(e) => onPerPageChange(Number(e.target.value))}>
              {[20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span>
              · {pagination.total} sản phẩm · trang {pagination.page}/{Math.max(1, pagination.totalPages)}
            </span>
          </div>
          <div className="rbp-pagination-btns">
            <button type="button" className="btn btn-light" disabled={pagination.page <= 1 || loading} onClick={() => onPageChange(pagination.page - 1)}>
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

export function RevenueByProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [options, setOptions] = useState<RevenueByProductsOptions | null>(null);
  const [draft, setDraft] = useState<ProductReportFilters>(() => defaultFilters());
  const [applied, setApplied] = useState<ProductReportFilters>(() => defaultFilters());
  const [preset, setPreset] = useState<DatePreset>('last_15_days');
  const [report, setReport] = useState<ProductReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [filtersAdvanced, setFiltersAdvanced] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [chartView, setChartView] = useState<ChartView>('area');
  const [syncingUrl, setSyncingUrl] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const requestSeq = useRef(0);
  const exportRef = useRef<HTMLDivElement | null>(null);
  const initialLoadDone = useRef(false);
  const skipUrlWrite = useRef(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productSearchRef = useRef<HTMLInputElement>(null);

  const loadReport = useCallback(async (filters: ProductReportFilters, mode: 'load' | 'refresh' = 'load') => {
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
      const data = await fetchRevenueByProductsReport(filters, controller.signal);
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
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    const controller = new AbortController();
    (async () => {
      try {
        const opts = await fetchRevenueByProductsOptions(controller.signal);
        setOptions(opts);
      } catch {
        // non-fatal
      }
      const fromUrl = filtersFromSearchParams(new URLSearchParams(window.location.search));
      setDraft(fromUrl.filters);
      setApplied(fromUrl.filters);
      setPreset(fromUrl.preset);
      skipUrlWrite.current = true;
      await loadReport(fromUrl.filters, 'load');
      setBootstrapped(true);
    })();

    return () => {
      controller.abort();
      abortRef.current?.abort();
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!bootstrapped) return;
    if (skipUrlWrite.current) {
      skipUrlWrite.current = false;
      return;
    }
    setSyncingUrl(true);
    setSearchParams(filtersToSearchParams(applied, preset), { replace: true });
    setSyncingUrl(false);
  }, [applied, preset, bootstrapped, setSearchParams]);

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

  const patchDraft = (patch: Partial<ProductReportFilters>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const handleSearchChange = (value: string) => {
    setDraft((d) => ({ ...d, search: value, page: 1 }));
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void loadReport({ ...applied, search: value, page: 1 }, 'load');
    }, 400);
  };

  useProductScanTarget(productSearchRef, (rawBarcode) => {
    const query = rawBarcode.trim();
    if (!query) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setDraft((d) => ({ ...d, search: query, page: 1 }));
    void loadReport({ ...applied, search: query, page: 1 }, 'load');
    window.setTimeout(() => productSearchRef.current?.focus(), 0);
  });

  const handleApply = () => {
    const next = { ...draft, page: 1 };
    const draftErr = validateProductFilterDraft(next);
    if (draftErr) {
      setValidationError(draftErr);
      return;
    }
    setValidationError(null);
    setDraft(next);
    void loadReport(next, 'load');
  };

  const handleReset = () => {
    const next = defaultFilters();
    setPreset('last_15_days');
    setDraft(next);
    void loadReport(next, 'load');
  };

  const handleRefresh = () => {
    if (loading || refreshing) return;
    void loadReport(applied, 'refresh');
  };

  const handleSort = (field: SortField) => {
    const next: ProductReportFilters = {
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

  const toggleId = (field: 'storeIds' | 'categoryIds', id: string) => {
    setDraft((prev) => {
      const list = prev[field];
      const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      return { ...prev, [field]: next, page: 1 };
    });
  };

  const removeChip = (key: string) => {
    const next = { ...applied };
    if (key === 'storeIds') next.storeIds = [];
    if (key === 'categoryIds') next.categoryIds = [];
    if (key === 'channel') next.channel = '';
    if (key === 'saleChannel') next.saleChannel = '';
    if (key === 'staffId') next.staffId = '';
    if (key === 'paymentMethod') next.paymentMethod = '';
    if (key === 'search') next.search = '';
    if (key === 'status') next.status = 'completed';
    if (key === 'minRevenue') next.minRevenue = '';
    if (key === 'maxRevenue') next.maxRevenue = '';
    if (key === 'minQuantity') next.minQuantity = '';
    if (key === 'maxQuantity') next.maxQuantity = '';
    next.page = 1;
    setDraft(next);
    void loadReport(next, 'load');
  };

  const busy = loading || refreshing;
  const draftValidationError = validateProductFilterDraft(draft);
  const applyBlocked = busy || Boolean(draftValidationError);
  const ranking = report?.ranking ?? [];
  const rankingTop = ranking.slice(0, applied.top);

  const chips: { key: string; label: string }[] = [];
  if (applied.storeIds.length) chips.push({ key: 'storeIds', label: `Cửa hàng: ${applied.storeIds.length}` });
  if (applied.categoryIds.length) chips.push({ key: 'categoryIds', label: `Danh mục: ${applied.categoryIds.length}` });
  if (applied.channel) chips.push({ key: 'channel', label: `Loại: ${applied.channel}` });
  if (applied.saleChannel) chips.push({ key: 'saleChannel', label: `Kênh: ${applied.saleChannel}` });
  if (applied.staffId) chips.push({ key: 'staffId', label: `NV: ${options?.staff.find((s) => s.id === applied.staffId)?.name ?? applied.staffId}` });
  if (applied.paymentMethod) chips.push({ key: 'paymentMethod', label: `TT: ${applied.paymentMethod}` });
  if (applied.search) chips.push({ key: 'search', label: `Tìm: ${applied.search}` });
  if (applied.status && applied.status !== 'completed') chips.push({ key: 'status', label: `TT HĐ: ${applied.status}` });
  if (applied.minRevenue) chips.push({ key: 'minRevenue', label: `DT min: ${applied.minRevenue}` });
  if (applied.maxRevenue) chips.push({ key: 'maxRevenue', label: `DT max: ${applied.maxRevenue}` });
  if (applied.minQuantity) chips.push({ key: 'minQuantity', label: `SL min: ${applied.minQuantity}` });
  if (applied.maxQuantity) chips.push({ key: 'maxQuantity', label: `SL max: ${applied.maxQuantity}` });

  return (
    <main className="rbp-page revenue-products-report-page">
      {busy && <div className="rbp-progress" aria-hidden />}

      <RevenueReportNav />

      <header className="rbp-hero">
        <div>
          <div className="rbp-hero-meta" style={{ marginTop: 0, marginBottom: 4 }}>
            Báo cáo / Doanh thu
          </div>
          <h1>
            <Package size={22} style={{ display: 'inline', verticalAlign: -4, marginRight: 8 }} aria-hidden />
            Doanh thu theo sản phẩm
          </h1>
          <p>
            Tổng hợp doanh thu, số lượng bán, hoàn trả và tỷ trọng theo từng sản phẩm từ line items hóa đơn hoàn tất.
            Giảm giá cấp hóa đơn không phân bổ vào sản phẩm.
          </p>
          <div className="rbp-hero-meta">
            Kỳ: {formatDisplayDate(applied.from)} – {formatDisplayDate(applied.to)}
            {' · '}
            Cập nhật: {formatDateTime(report?.meta?.generatedAt)}
            {report?.meta?.timezone ? ` · ${report.meta.timezone}` : ''}
            {report?.meta?.saleCountLoaded != null
              ? ` · ${report.meta.saleCountLoaded} HĐ · ${report.meta.refundCountLoaded ?? 0} hoàn`
              : ''}
          </div>
        </div>
        <div className="rbp-hero-actions">
          <button type="button" className="btn btn-light" onClick={handleReset} disabled={busy}>
            <RotateCcw size={16} aria-hidden />
            Đặt lại
          </button>
          <button type="button" className="btn btn-light" onClick={handleRefresh} disabled={busy} aria-busy={refreshing}>
            <RefreshCw size={16} className={refreshing ? 'rbp-spin' : undefined} aria-hidden />
            Làm mới
          </button>
          <div className="rbp-export" ref={exportRef}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setExportOpen((v) => !v)}
              disabled={!report || (report.table.pagination.total === 0 && ranking.length === 0)}
              aria-expanded={exportOpen}
              aria-haspopup="menu"
            >
              <Download size={16} aria-hidden />
              Xuất báo cáo
              <ChevronDown size={14} aria-hidden />
            </button>
            {exportOpen && report && (
              <div className="rbp-export-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    exportRankingExcel(report.ranking.length ? report.ranking : report.table.data, applied);
                    setExportOpen(false);
                  }}
                >
                  Xuất Excel (toàn bộ SP đã lọc)
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    exportRankingCsv(report.ranking.length ? report.ranking : report.table.data, applied);
                    setExportOpen(false);
                  }}
                >
                  Xuất CSV (toàn bộ SP đã lọc)
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    exportSummaryCsv(report, applied);
                    setExportOpen(false);
                  }}
                >
                  Xuất CSV tổng hợp KPI
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    window.print();
                    setExportOpen(false);
                  }}
                >
                  <Printer size={14} aria-hidden /> In trang
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <section
        className={filtersAdvanced ? 'rbp-filters rbp-filters-sticky is-advanced' : 'rbp-filters rbp-filters-sticky'}
        aria-label="Bộ lọc báo cáo"
      >
          <div className="rbp-filter-grid">
            <div className="rbp-field">
              <label htmlFor="rbp-preset">Khoảng thời gian</label>
              <select
                id="rbp-preset"
                value={preset}
                onChange={(e) => handlePresetChange(e.target.value as DatePreset)}
              >
                {(Object.keys(PRESET_LABELS) as DatePreset[]).map((k) => (
                  <option key={k} value={k}>
                    {PRESET_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="rbp-field">
              <label htmlFor="rbp-from">Từ ngày</label>
              <input
                id="rbp-from"
                type="date"
                value={draft.from}
                onChange={(e) => {
                  setPreset('custom');
                  patchDraft({ from: e.target.value, page: 1 });
                }}
              />
            </div>
            <div className="rbp-field">
              <label htmlFor="rbp-to">Đến ngày</label>
              <input
                id="rbp-to"
                type="date"
                value={draft.to}
                onChange={(e) => {
                  setPreset('custom');
                  patchDraft({ to: e.target.value, page: 1 });
                }}
              />
            </div>
            <div className="rbp-field">
              <label htmlFor="rbp-compare">So sánh</label>
              <select
                id="rbp-compare"
                value={draft.compare}
                onChange={(e) => patchDraft({ compare: e.target.value as ProductReportFilters['compare'] })}
              >
                <option value="previous_period">So với kỳ trước</option>
                <option value="none">Không so sánh</option>
              </select>
            </div>
            <div className="rbp-field">
              <label htmlFor="rbp-granularity">Nhóm thời gian</label>
              <select
                id="rbp-granularity"
                value={draft.trendGranularity}
                onChange={(e) =>
                  patchDraft({
                    trendGranularity: e.target.value as ProductReportFilters['trendGranularity'],
                  })
                }
              >
                <option value="day">Theo ngày</option>
                <option value="week">Theo tuần</option>
                <option value="month">Theo tháng</option>
              </select>
            </div>
            <div className="rbp-field">
              <label htmlFor="rbp-metric">Chỉ số xếp hạng</label>
              <select
                id="rbp-metric"
                value={draft.metric}
                onChange={(e) => patchDraft({ metric: e.target.value as ReportMetric })}
              >
                {(Object.keys(METRIC_LABELS) as ReportMetric[]).map((m) => (
                  <option key={m} value={m}>
                    {METRIC_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            {filtersAdvanced && <>
            <div className="rbp-field">
              <label htmlFor="rbp-top">Top SP biểu đồ</label>
              <select
                id="rbp-top"
                value={draft.top}
                onChange={(e) => patchDraft({ top: Number(e.target.value) })}
              >
                {(options?.topOptions ?? [5, 10, 20, 50]).map((n) => (
                  <option key={n} value={n}>
                    Top {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="rbp-field">
              <label htmlFor="rbp-channel">Loại bán</label>
              <select id="rbp-channel" value={draft.channel} onChange={(e) => patchDraft({ channel: e.target.value })}>
                <option value="">Tất cả</option>
                {(options?.channels ?? []).map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="rbp-field">
              <label htmlFor="rbp-sale-channel">Kênh bán</label>
              <select
                id="rbp-sale-channel"
                value={draft.saleChannel}
                onChange={(e) => patchDraft({ saleChannel: e.target.value })}
              >
                <option value="">Tất cả</option>
                {(options?.saleChannels ?? []).map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="rbp-field">
              <label htmlFor="rbp-status">Trạng thái HĐ</label>
              <select id="rbp-status" value={draft.status} onChange={(e) => patchDraft({ status: e.target.value })}>
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
            </div>
            <div className="rbp-field">
              <label htmlFor="rbp-staff">Nhân viên</label>
              <select id="rbp-staff" value={draft.staffId} onChange={(e) => patchDraft({ staffId: e.target.value })}>
                <option value="">Tất cả</option>
                {(options?.staff ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="rbp-field">
              <label htmlFor="rbp-payment">PTTT</label>
              <select
                id="rbp-payment"
                value={draft.paymentMethod}
                onChange={(e) => patchDraft({ paymentMethod: e.target.value })}
              >
                <option value="">Tất cả</option>
                {(options?.paymentMethods ?? []).map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="rbp-field">
              <label htmlFor="rbp-search">Tìm SP / mã / SKU</label>
              <FilterSuggestInput
                id="rbp-search"
                ref={productSearchRef}
                value={draft.search}
                data-product-search-scan="true"
                data-product-search-primary="true"
                placeholder="Tên, mã, SKU hoặc quét barcode…"
                onChange={handleSearchChange}
                fetchSuggestions={suggestProducts}
                aria-label="Tìm SP / mã / SKU"
              />
            </div>
            <div className="rbp-field">
              <label htmlFor="rbp-min-rev">DT thuần tối thiểu</label>
              <input
                id="rbp-min-rev"
                type="number"
                min={0}
                value={draft.minRevenue}
                onChange={(e) => patchDraft({ minRevenue: e.target.value })}
              />
            </div>
            <div className="rbp-field">
              <label htmlFor="rbp-max-rev">DT thuần tối đa</label>
              <input
                id="rbp-max-rev"
                type="number"
                min={0}
                value={draft.maxRevenue}
                onChange={(e) => patchDraft({ maxRevenue: e.target.value })}
              />
            </div>
            <div className="rbp-field">
              <label htmlFor="rbp-min-qty">SL bán tối thiểu</label>
              <input
                id="rbp-min-qty"
                type="number"
                min={0}
                value={draft.minQuantity}
                onChange={(e) => patchDraft({ minQuantity: e.target.value })}
              />
            </div>
            <div className="rbp-field">
              <label htmlFor="rbp-max-qty">SL bán tối đa</label>
              <input
                id="rbp-max-qty"
                type="number"
                min={0}
                value={draft.maxQuantity}
                onChange={(e) => patchDraft({ maxQuantity: e.target.value })}
              />
            </div>
            </>}
          </div>

          <div className="rbp-advanced-toggle-row">
            <button
              type="button"
              className="btn btn-light rbp-advanced-toggle"
              onClick={() => setFiltersAdvanced((value) => !value)}
              aria-expanded={filtersAdvanced}
            >
              {filtersAdvanced ? 'Thu gọn' : 'Nâng cao'}
              <ChevronDown size={15} className={filtersAdvanced ? 'is-rotated' : undefined} aria-hidden />
            </button>
          </div>

          {filtersAdvanced && (options?.stores?.length || options?.categories?.length) && (
            <div className="rbp-multi-row">
              {options?.stores && options.stores.length > 0 && (
                <div className="rbp-field" style={{ gridColumn: '1 / -1' }}>
                  <label>
                    Cửa hàng {draft.storeIds.length > 0 ? `(${draft.storeIds.length})` : ''}
                  </label>
                  <div className="rbp-check-grid">
                    {options.stores.map((s) => (
                      <label key={s.id} className="rbp-check">
                        <input
                          type="checkbox"
                          checked={draft.storeIds.includes(s.id)}
                          onChange={() => toggleId('storeIds', s.id)}
                        />
                        <span>
                          {s.name}
                          {s.code ? ` (${s.code})` : ''}
                          {s.isActive === false ? ' · ngừng' : ''}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {options?.categories && options.categories.length > 0 && (
                <div className="rbp-field" style={{ gridColumn: '1 / -1' }}>
                  <label>
                    Danh mục {draft.categoryIds.length > 0 ? `(${draft.categoryIds.length})` : ''}
                  </label>
                  <div className="rbp-check-grid">
                    {options.categories.map((c) => (
                      <label key={c.id} className="rbp-check">
                        <input
                          type="checkbox"
                          checked={draft.categoryIds.includes(c.id)}
                          onChange={() => toggleId('categoryIds', c.id)}
                        />
                        <span>{c.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {(draftValidationError || validationError) && (
            <p className="rbp-field-error" role="alert">
              {draftValidationError || validationError}
            </p>
          )}

          <div className="rbp-filter-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleApply}
              disabled={applyBlocked}
              aria-disabled={applyBlocked}
            >
              Áp dụng
            </button>
            <button type="button" className="btn btn-light" onClick={handleReset} disabled={busy}>
              Đặt lại
            </button>
          </div>
      </section>

      {chips.length > 0 && (
        <div className="rbp-chips" aria-label="Bộ lọc đang áp dụng">
          {chips.map((c) => (
            <button key={c.key} type="button" className="rbp-chip" onClick={() => removeChip(c.key)} title="Xóa bộ lọc này">
              {c.label} ×
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="rbp-alert" role="alert">
          <AlertTriangle size={18} aria-hidden />
          <div>
            <strong>Không tải được báo cáo</strong>
            <p>{error}</p>
          </div>
          <button type="button" className="btn btn-light" onClick={handleRefresh} disabled={busy}>
            Thử lại
          </button>
        </div>
      )}

      <SummaryCards
        summary={report?.summary ?? null}
        comparison={report?.comparison?.metrics}
        loading={loading && !report}
      />

      <div className="rbp-charts-grid rbp-charts-grid-single">
        <section className="rbp-surface">
          <div className="rbp-surface-head">
            <div>
              <h2>Top sản phẩm · {METRIC_LABELS[applied.metric]}</h2>
              <p>Top {applied.top} theo chỉ số đã chọn.</p>
            </div>
          </div>
          <RankingBarChart ranking={rankingTop} metric={applied.metric} loading={loading} />
        </section>
      </div>

      <div className="rbp-charts-grid rbp-charts-grid-single">
        <section className="rbp-surface">
          <div className="rbp-surface-head">
            <div>
              <h2>Doanh thu theo thời gian</h2>
              <p>Tổng doanh thu line-item theo kỳ đã nhóm.</p>
            </div>
            <div className="rbp-inline-field">
              <label htmlFor="rbp-chart-view">Kiểu biểu đồ</label>
              <select
                id="rbp-chart-view"
                aria-label="Kiểu biểu đồ"
                value={chartView}
                onChange={(e) => setChartView(e.target.value as ChartView)}
              >
                {(Object.entries(CHART_VIEW_LABELS) as [ChartView, string][]).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <TimelineChart report={report} chartView={chartView} loading={loading} />
        </section>
      </div>

      <div className="rbp-charts-grid">
        <section className="rbp-surface">
          <div className="rbp-surface-head">
            <div>
              <h2>Xu hướng top sản phẩm</h2>
              <p>Theo dõi top sản phẩm qua thời gian.</p>
            </div>
          </div>
          <TrendMultiChart report={report} metric={applied.metric} loading={loading} />
        </section>

        <section className="rbp-surface">
          <div className="rbp-surface-head">
            <div>
              <h2>Pareto DT thuần</h2>
              <p>Tích lũy đóng góp doanh thu thuần.</p>
            </div>
          </div>
          <ParetoChart report={report} loading={loading} />
        </section>
      </div>

      <div className="rbp-breakdown-grid">
        <section className="rbp-surface">
          <div className="rbp-surface-head">
            <div>
              <h2>Theo danh mục</h2>
            </div>
          </div>
          <SharePieChart
            items={report?.breakdowns?.categories ?? []}
            loading={loading && !report}
            emptyLabel="Không có dữ liệu danh mục."
          />
        </section>
        <section className="rbp-surface">
          <div className="rbp-surface-head">
            <div>
              <h2>Theo thương hiệu</h2>
            </div>
          </div>
          <SharePieChart
            items={report?.breakdowns?.trademarks ?? []}
            loading={loading && !report}
            emptyLabel="Không có dữ liệu thương hiệu."
          />
        </section>
      </div>

      {!error && !loading && report && report.summary.productCount === 0 && (
        <div className="rbp-empty">
          <Package size={28} aria-hidden />
          <p>Không có sản phẩm phát sinh doanh thu trong khoảng đã chọn.</p>
          <button type="button" className="btn btn-light" onClick={handleReset}>
            Đặt lại bộ lọc
          </button>
        </div>
      )}

      <ProductTable
        rows={report?.table?.data ?? []}
        totals={report?.table?.totals ?? null}
        pagination={report?.table?.pagination ?? null}
        sortBy={applied.sortBy}
        sortDirection={applied.sortDirection}
        perPage={applied.perPage}
        loading={loading}
        onSort={handleSort}
        onPageChange={handlePageChange}
        onPerPageChange={handlePerPageChange}
      />
    </main>
  );
}
