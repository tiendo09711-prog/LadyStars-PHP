import { Children, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartType, TimelinePoint } from '../revenueByTime.types';
import {
  CHART_TYPE_LABELS,
  formatAxisMoney,
  formatMoney,
  formatNumber,
} from '../revenueByTime.utils';

type SeriesKey = 'revenue' | 'netRevenue' | 'refundAmount' | 'invoiceCount';

const SERIES: { key: SeriesKey; label: string; color: string; yAxisId: 'money' | 'count' }[] = [
  { key: 'revenue', label: 'Doanh thu', color: '#10b981', yAxisId: 'money' },
  { key: 'netRevenue', label: 'Doanh thu thuần', color: '#059669', yAxisId: 'money' },
  { key: 'refundAmount', label: 'Trả hàng', color: '#ef4444', yAxisId: 'money' },
  { key: 'invoiceCount', label: 'Số hóa đơn', color: '#6366f1', yAxisId: 'count' },
];

type ChartRow = TimelinePoint & {
  chartLabel: string;
};

type Props = {
  timeline: TimelinePoint[];
  loading: boolean;
  onResetFilters?: () => void;
  onSelectPoint?: (point: TimelinePoint) => void;
};

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartRow; dataKey: string; name: string; color: string; value: number }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="rbt-tooltip rbt-tooltip-lg">
      <div className="rbt-tooltip-title">{row.label}</div>
      {payload.map((item) => {
        const isCount = item.dataKey === 'invoiceCount';
        return (
          <div className="rbt-tooltip-row" key={item.dataKey}>
            <span className="rbt-tooltip-dot" style={{ background: item.color }} />
            <span>{item.name}</span>
            <strong>{isCount ? formatNumber(item.value) : formatMoney(item.value)}</strong>
          </div>
        );
      })}
      <div className="rbt-tooltip-divider" />
      <div className="rbt-tooltip-row">
        <span>Trước giảm</span>
        <strong>{formatMoney(row.grossRevenue)}</strong>
      </div>
      <div className="rbt-tooltip-row">
        <span>Giảm giá</span>
        <strong>{formatMoney(row.discountAmount)}</strong>
      </div>
      <div className="rbt-tooltip-row">
        <span>Doanh thu</span>
        <strong>{formatMoney(row.revenue)}</strong>
      </div>
      <div className="rbt-tooltip-row">
        <span>Trả hàng</span>
        <strong>{formatMoney(row.refundAmount)}</strong>
      </div>
      <div className="rbt-tooltip-row">
        <span>Thuần</span>
        <strong>{formatMoney(row.netRevenue)}</strong>
      </div>
      <div className="rbt-tooltip-row">
        <span>Hóa đơn</span>
        <strong>{formatNumber(row.invoiceCount)}</strong>
      </div>
      <div className="rbt-tooltip-row">
        <span>SP bán</span>
        <strong>{formatNumber(row.itemQuantity, 2)}</strong>
      </div>
      <div className="rbt-tooltip-row">
        <span>TB/HĐ</span>
        <strong>{formatMoney(row.averageOrderValue)}</strong>
      </div>
      <div className="rbt-tooltip-hint">Nhấp vào cột/điểm để xem chi tiết</div>
    </div>
  );
}

export function RevenueTrendChart({ timeline, loading, onResetFilters, onSelectPoint }: Props) {
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [enabled, setEnabled] = useState<Record<SeriesKey, boolean>>({
    revenue: true,
    netRevenue: false,
    refundAmount: false,
    invoiceCount: false,
  });

  const data = useMemo<ChartRow[]>(
    () =>
      timeline.map((p) => ({
        ...p,
        chartLabel: p.label,
      })),
    [timeline],
  );

  const hasData = data.some((d) => d.revenue > 0 || d.invoiceCount > 0 || d.refundAmount > 0);

  const toggleSeries = (key: SeriesKey) => {
    setEnabled((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (!Object.values(next).some(Boolean)) return prev;
      return next;
    });
  };

  const activeSeries = SERIES.filter((s) => enabled[s.key]);

  const handleClick = (state: { activePayload?: Array<{ payload: ChartRow }> }) => {
    const point = state?.activePayload?.[0]?.payload;
    if (point && onSelectPoint) {
      const { chartLabel: _c, ...rest } = point;
      onSelectPoint(rest);
    }
  };

  const renderChartContent = (series: React.ReactNode) => [
      <CartesianGrid key="grid" strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />,
      <XAxis
        key="x-axis"
        dataKey="label"
        tick={{ fontSize: 11, fill: '#64748b' }}
        minTickGap={20}
        interval="preserveStartEnd"
        axisLine={{ stroke: '#cbd5e1' }}
        tickLine={{ stroke: '#cbd5e1' }}
        height={46}
        label={{ value: 'Thời gian', position: 'insideBottom', offset: -2, style: { fill: '#94a3b8', fontSize: 11 } }}
      />,
      <YAxis
        key="money-axis"
        yAxisId="money"
        width={72}
        axisLine={{ stroke: '#cbd5e1' }}
        tickLine={{ stroke: '#cbd5e1' }}
        domain={[0, 'auto']}
        tick={{ fontSize: 11, fill: '#64748b' }}
        tickFormatter={(v) => formatAxisMoney(Number(v))}
        label={{
          value: 'Số tiền (VND)',
          angle: -90,
          position: 'insideLeft',
          style: { fill: '#94a3b8', fontSize: 11 },
          offset: 8,
        }}
      />,
      ...(enabled.invoiceCount ? [
        <YAxis
          key="count-axis"
          yAxisId="count"
          orientation="right"
          width={48}
          axisLine={{ stroke: '#cbd5e1' }}
          tickLine={{ stroke: '#cbd5e1' }}
          tick={{ fontSize: 11, fill: '#6366f1' }}
          allowDecimals={false}
          label={{
            value: 'Số hóa đơn',
            angle: 90,
            position: 'insideRight',
            style: { fill: '#6366f1', fontSize: 11 },
          }}
        />,
      ] : []),
      <Tooltip
        key="tooltip"
        content={<ChartTooltip />}
        cursor={{ fill: 'rgba(16, 185, 129, 0.08)' }}
      />,
      <Legend
        key="legend"
        wrapperStyle={{ paddingTop: 8 }}
        onClick={(e) => {
          const key = String(e?.dataKey ?? '') as SeriesKey;
          if (SERIES.some((s) => s.key === key)) toggleSeries(key);
        }}
      />,
      ...Children.toArray(series),
    ];

  const renderSeries = (mode: 'line' | 'bar' | 'area') =>
    activeSeries.map((s) => {
      if (mode === 'bar') {
        return (
          <Bar
            key={s.key}
            yAxisId={s.yAxisId}
            dataKey={s.key}
            name={s.label}
            fill={s.color}
            radius={[4, 4, 0, 0]}
            maxBarSize={36}
            isAnimationActive={false}
            cursor="pointer"
          />
        );
      }
      if (mode === 'area') {
        return (
          <Area
            key={s.key}
            yAxisId={s.yAxisId}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            fill={s.color}
            fillOpacity={0.15}
            strokeWidth={2}
            isAnimationActive={false}
          />
        );
      }
      return (
        <Line
          key={s.key}
          yAxisId={s.yAxisId}
          type="monotone"
          dataKey={s.key}
          name={s.label}
          stroke={s.color}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      );
    });

  let chart: React.ReactNode = null;
  if (hasData) {
    if (chartType === 'bar') {
      chart = (
        <BarChart data={data} margin={{ top: 12, right: 18, left: 8, bottom: 8 }} onClick={handleClick}>
          {renderChartContent(renderSeries('bar'))}
        </BarChart>
      );
    } else if (chartType === 'area') {
      chart = (
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 8 }} onClick={handleClick}>
          {renderChartContent(renderSeries('area'))}
        </AreaChart>
      );
    } else if (chartType === 'line') {
      chart = (
        <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 8 }} onClick={handleClick}>
          {renderChartContent(renderSeries('line'))}
        </LineChart>
      );
    } else {
      chart = (
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 8 }} onClick={handleClick}>
          {renderChartContent(
            <>
          {enabled.revenue && (
            <Bar
              yAxisId="money"
              dataKey="revenue"
              name="Doanh thu"
              fill="#10b981"
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
              isAnimationActive={false}
              cursor="pointer"
            />
          )}
          {enabled.netRevenue && (
            <Line
              yAxisId="money"
              type="monotone"
              dataKey="netRevenue"
              name="Doanh thu thuần"
              stroke="#059669"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          )}
          {enabled.refundAmount && (
            <Line
              yAxisId="money"
              type="monotone"
              dataKey="refundAmount"
              name="Trả hàng"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          )}
          {enabled.invoiceCount && (
            <Line
              yAxisId="count"
              type="monotone"
              dataKey="invoiceCount"
              name="Số hóa đơn"
              stroke="#6366f1"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          )}
            </>,
          )}
        </ComposedChart>
      );
    }
  }

  return (
    <section className="rbt-surface" aria-label="Biểu đồ xu hướng">
      <div className="rbt-surface-head">
        <div>
          <h2>Xu hướng theo thời gian</h2>
          <p>Mặc định biểu đồ cột · Doanh thu. Bật thêm chuỗi khi cần so sánh.</p>
        </div>
        <div className="rbt-surface-tools">
          <label className="rbt-inline-field">
            <span className="sr-only">Loại biểu đồ</span>
            <select
              value={chartType}
              onChange={(e) => setChartType(e.target.value as ChartType)}
              aria-label="Loại biểu đồ"
            >
              {(Object.keys(CHART_TYPE_LABELS) as ChartType[]).map((k) => (
                <option key={k} value={k}>
                  {CHART_TYPE_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="rbt-series-toggles" role="group" aria-label="Bật/tắt chuỗi">
        {SERIES.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`rbt-chip ${enabled[s.key] ? 'is-on' : ''}`}
            style={{ ['--chip-color' as string]: s.color }}
            onClick={() => toggleSeries(s.key)}
            aria-pressed={enabled[s.key]}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="rbt-chart-wrap">
        {loading && !hasData ? (
          <div className="rbt-empty rbt-skeleton" style={{ height: 280 }} aria-busy="true" />
        ) : !hasData ? (
          <div className="rbt-empty">
            <p>Không có dữ liệu doanh thu trong khoảng thời gian đã chọn.</p>
            {onResetFilters && (
              <button type="button" className="btn btn-light" onClick={onResetFilters}>
                Đặt lại bộ lọc
              </button>
            )}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={380}>
            {chart as React.ReactElement}
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
