import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { BreakdownDimensionMeta, BreakdownItem } from '../revenueByTime.types';
import { formatAxisMoney, formatMoney, formatNumber } from '../revenueByTime.utils';

const COLORS = [
  '#10b981',
  '#059669',
  '#34d399',
  '#6366f1',
  '#f59e0b',
  '#ef4444',
  '#0ea5e9',
  '#8b5cf6',
  '#14b8a6',
  '#64748b',
];

type Props = {
  channels: BreakdownItem[];
  paymentMethods: BreakdownItem[];
  staff: BreakdownItem[];
  meta?: {
    channels?: BreakdownDimensionMeta;
    paymentMethods?: BreakdownDimensionMeta;
    staff?: BreakdownDimensionMeta;
  } | null;
  loading: boolean;
};

function MoneyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: BreakdownItem }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="rbt-tooltip">
      <div className="rbt-tooltip-title">{row.label}</div>
      <div className="rbt-tooltip-row">
        <span>Doanh thu</span>
        <strong>{formatMoney(row.revenue)}</strong>
      </div>
      <div className="rbt-tooltip-row">
        <span>Tỷ trọng</span>
        <strong>{formatNumber(row.percent, 1)}%</strong>
      </div>
      <div className="rbt-tooltip-row">
        <span>Hóa đơn</span>
        <strong>{formatNumber(row.invoiceCount)}</strong>
      </div>
    </div>
  );
}

function EmptyNotice({ message }: { message: string }) {
  return (
    <div className="rbt-empty rbt-empty-sm" role="status">
      <p>{message}</p>
    </div>
  );
}

function isOnlyUnknown(data: BreakdownItem[]): boolean {
  if (data.length === 0) return true;
  if (data.length !== 1) return false;
  const k = String(data[0].key || '').toLowerCase();
  const l = String(data[0].label || '').toLowerCase();
  return (
    k === 'unknown' ||
    k === 'không xác định' ||
    l === 'unknown' ||
    l === 'không xác định' ||
    l.includes('không xác định')
  );
}

function PieBlock({
  title,
  data,
  dimMeta,
  emptyFallback,
}: {
  title: string;
  data: BreakdownItem[];
  dimMeta?: BreakdownDimensionMeta;
  emptyFallback: string;
}) {
  const meaningful =
    dimMeta?.hasMeaningfulAttribution !== false && !isOnlyUnknown(data) && data.some((d) => d.revenue > 0);
  const message = dimMeta?.message || emptyFallback;

  return (
    <div className="rbt-breakdown-card">
      <h3>{title}</h3>
      {!meaningful ? (
        <EmptyNotice message={message} />
      ) : (
        <div className="rbt-breakdown-body">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={data}
                dataKey="revenue"
                nameKey="label"
                innerRadius={48}
                outerRadius={78}
                paddingAngle={2}
                isAnimationActive={false}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<MoneyTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <ul className="rbt-legend-list">
            {data.map((d, i) => (
              <li key={d.key}>
                <span className="rbt-tooltip-dot" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="rbt-legend-label" title={d.label}>
                  {d.label}
                </span>
                <span className="rbt-legend-money">{formatMoney(d.revenue)}</span>
                <strong>{formatNumber(d.percent, 1)}%</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function HBarBlock({
  title,
  data,
  dimMeta,
  emptyFallback,
}: {
  title: string;
  data: BreakdownItem[];
  dimMeta?: BreakdownDimensionMeta;
  emptyFallback: string;
}) {
  const meaningful =
    dimMeta?.hasMeaningfulAttribution !== false && !isOnlyUnknown(data) && data.some((d) => d.revenue > 0);
  const message = dimMeta?.message || emptyFallback;

  return (
    <div className="rbt-breakdown-card">
      <h3>{title}</h3>
      {!meaningful ? (
        <EmptyNotice message={message} />
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(180, data.length * 36)}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
            <XAxis
              type="number"
              tickFormatter={(v) => formatAxisMoney(Number(v))}
              tick={{ fontSize: 11 }}
            />
            <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11 }} />
            <Tooltip content={<MoneyTooltip />} />
            <Bar
              dataKey="revenue"
              name="Doanh thu"
              fill="#10b981"
              radius={[0, 4, 4, 0]}
              maxBarSize={18}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function RevenueBreakdownCharts({
  channels,
  paymentMethods,
  staff,
  meta,
  loading,
}: Props) {
  if (loading && channels.length === 0) {
    return (
      <section className="rbt-surface">
        <div className="rbt-surface-head">
          <h2>Cơ cấu doanh thu</h2>
        </div>
        <div className="rbt-breakdown-grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rbt-breakdown-card rbt-skeleton" style={{ minHeight: 220 }} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="rbt-surface" aria-label="Cơ cấu doanh thu">
      <div className="rbt-surface-head">
        <div>
          <h2>Cơ cấu doanh thu</h2>
          <p>
            Phân bổ theo loại hóa đơn, thanh toán và nhân viên. Chỉ hiển thị khi có dữ liệu
            phân loại thực.
          </p>
        </div>
      </div>
      <div className="rbt-breakdown-grid">
        <PieBlock
          title="Theo loại hóa đơn"
          data={channels}
          dimMeta={meta?.channels}
          emptyFallback="Dữ liệu bán hàng hiện chưa có thông tin loại hóa đơn để phân tích."
        />
        <PieBlock
          title="Theo thanh toán"
          data={paymentMethods}
          dimMeta={meta?.paymentMethods}
          emptyFallback="Không đủ dữ liệu phân loại thanh toán."
        />
        <HBarBlock
          title="Theo nhân viên"
          data={staff}
          dimMeta={meta?.staff}
          emptyFallback="Dữ liệu bán hàng hiện chưa có thông tin nhân viên để phân tích."
        />
      </div>
    </section>
  );
}
