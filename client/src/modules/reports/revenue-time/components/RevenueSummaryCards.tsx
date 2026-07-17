import { ArrowDownRight, ArrowUpRight, HelpCircle, Minus } from 'lucide-react';
import type { MetricComparison, RevenueSummary } from '../revenueByTime.types';
import { formatMoney, formatNumber, formatPercent } from '../revenueByTime.utils';

type KpiDef = {
  key: keyof RevenueSummary;
  label: string;
  kind: 'money' | 'number' | 'percent';
  tip?: string;
  hideIfNull?: boolean;
};

const KPI_DEFS: KpiDef[] = [
  {
    key: 'revenue',
    label: 'Tổng doanh thu',
    kind: 'money',
    tip: 'Tổng tiền hóa đơn sau giảm giá (value / value_payment), trạng thái hoàn tất.',
  },
  {
    key: 'netRevenue',
    label: 'Doanh thu thuần',
    kind: 'money',
    tip: 'Doanh thu − giá trị trả hàng trong cùng khoảng thời gian.',
  },
  {
    key: 'invoiceCount',
    label: 'Số hóa đơn',
    kind: 'number',
  },
  {
    key: 'averageOrderValue',
    label: 'TB / hóa đơn',
    kind: 'money',
    tip: 'Doanh thu sau giảm (trước trừ trả hàng) ÷ số hóa đơn. Không dùng doanh thu thuần.',
  },
  {
    key: 'discountAmount',
    label: 'Tổng giảm giá',
    kind: 'money',
  },
  {
    key: 'refundAmount',
    label: 'Trả hàng / hoàn tiền',
    kind: 'money',
  },
  {
    key: 'grossRevenue',
    label: 'Trước giảm giá',
    kind: 'money',
    tip: 'Doanh thu sau giảm + giảm giá (gross).',
  },
  {
    key: 'costAmount',
    label: 'Giá vốn',
    kind: 'money',
    hideIfNull: true,
    tip: 'Chỉ tính khi hóa đơn có total_cost.',
  },
  {
    key: 'grossProfit',
    label: 'Lợi nhuận gộp',
    kind: 'money',
    hideIfNull: true,
    tip: 'Doanh thu − giá vốn (khi có total_cost).',
  },
  {
    key: 'grossMarginPercent',
    label: 'Biên lợi nhuận',
    kind: 'percent',
    hideIfNull: true,
  },
];

type Props = {
  summary: RevenueSummary | null;
  comparison: Record<string, MetricComparison> | null | undefined;
  loading: boolean;
};

function ChangeBadge({ metric }: { metric: MetricComparison }) {
  if (!metric || metric.changePercent === null || metric.changePercent === undefined) {
    if (metric && metric.previousValue === 0 && (metric.currentValue ?? 0) > 0) {
      return (
        <span className="rbt-kpi-change rbt-kpi-up" title="Kỳ trước = 0">
          <ArrowUpRight size={14} aria-hidden />
          Mới
        </span>
      );
    }
    return (
      <span className="rbt-kpi-change rbt-kpi-flat">
        <Minus size={14} aria-hidden />
        —
      </span>
    );
  }
  const pct = metric.changePercent;
  if (pct > 0) {
    return (
      <span className="rbt-kpi-change rbt-kpi-up" title={`Kỳ trước: ${metric.previousValue}`}>
        <ArrowUpRight size={14} aria-hidden />
        {formatPercent(pct)}
      </span>
    );
  }
  if (pct < 0) {
    return (
      <span className="rbt-kpi-change rbt-kpi-down" title={`Kỳ trước: ${metric.previousValue}`}>
        <ArrowDownRight size={14} aria-hidden />
        {formatPercent(pct)}
      </span>
    );
  }
  return (
    <span className="rbt-kpi-change rbt-kpi-flat">
      <Minus size={14} aria-hidden />
      0%
    </span>
  );
}

export function RevenueSummaryCards({ summary, comparison, loading }: Props) {
  if (loading && !summary) {
    return (
      <div className="rbt-kpi-grid" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rbt-kpi rbt-skeleton" />
        ))}
      </div>
    );
  }

  if (!summary) return null;

  const cards = KPI_DEFS.filter((def) => {
    if (!def.hideIfNull) return true;
    return summary[def.key] !== null && summary[def.key] !== undefined;
  });

  return (
    <div className="rbt-kpi-grid" role="list" aria-label="Chỉ số tổng quan">
      {cards.map((def) => {
        const raw = summary[def.key];
        let display = '—';
        if (raw !== null && raw !== undefined) {
          if (def.kind === 'money') display = formatMoney(Number(raw));
          else if (def.kind === 'percent') display = `${formatNumber(Number(raw), 1)}%`;
          else display = formatNumber(Number(raw), 2);
        }
        const metric = comparison?.[def.key] ?? null;

        return (
          <article key={def.key} className="rbt-kpi" role="listitem">
            <div className="rbt-kpi-label">
              <span>{def.label}</span>
              {def.tip && (
                <span className="rbt-kpi-tip" title={def.tip} tabIndex={0} aria-label={def.tip}>
                  <HelpCircle size={14} aria-hidden />
                </span>
              )}
            </div>
            <div className="rbt-kpi-value">{display}</div>
            {metric && <ChangeBadge metric={metric} />}
          </article>
        );
      })}
    </div>
  );
}
