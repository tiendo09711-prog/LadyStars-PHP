import { AlertTriangle, ArrowRight, BadgeDollarSign, CalendarCheck2, Store, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { BreakdownItem, RevenueReportResponse, TimelinePoint } from '../revenueByTime.types';
import { formatMoney, formatNumber, formatPercent } from '../revenueByTime.utils';

type Props = {
  report: RevenueReportResponse | null;
  loading: boolean;
  onSelectPoint: (point: TimelinePoint) => void;
};

function topByRevenue(items: BreakdownItem[]): BreakdownItem | null {
  return items.reduce<BreakdownItem | null>(
    (best, item) => (!best || item.revenue > best.revenue ? item : best),
    null,
  );
}

export function RevenueInsights({ report, loading, onSelectPoint }: Props) {
  if (loading && !report) {
    return (
      <section className="rbt-surface rbt-insights" aria-busy="true" aria-label="Đang phân tích điểm nổi bật">
        <div className="rbt-surface-head"><h2>Điểm nổi bật & cảnh báo</h2></div>
        <div className="rbt-insight-grid">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="rbt-insight-card rbt-skeleton" />)}
        </div>
      </section>
    );
  }

  if (!report || report.summary.invoiceCount === 0) return null;

  const bestPeriod = report.timeline.reduce<TimelinePoint | null>(
    (best, point) => (!best || point.netRevenue > best.netRevenue ? point : best),
    null,
  );
  const topStore = topByRevenue(report.breakdowns.stores);
  const topStaff = topByRevenue(report.breakdowns.staff);
  const refundValueRate = report.summary.revenue > 0
    ? (report.summary.refundAmount / report.summary.revenue) * 100
    : 0;
  const revenueChange = report.comparison?.metrics.revenue?.changePercent ?? null;
  const hasWarning = refundValueRate >= 10 || (revenueChange !== null && revenueChange <= -10);

  return (
    <section className="rbt-surface rbt-insights" aria-labelledby="rbt-insights-title">
      <div className="rbt-surface-head">
        <div>
          <h2 id="rbt-insights-title">Điểm nổi bật & cảnh báo</h2>
          <p>Tóm tắt các tín hiệu quan trọng từ dữ liệu đang lọc, không dùng dữ liệu ước tính.</p>
        </div>
        <div className="rbt-insight-links" aria-label="Mở báo cáo chuyên sâu">
          <Link to="/reports/revenue/store">Cửa hàng <ArrowRight size={14} aria-hidden /></Link>
          <Link to="/reports/revenue/products">Sản phẩm <ArrowRight size={14} aria-hidden /></Link>
        </div>
      </div>

      <div className="rbt-insight-grid">
        <button
          type="button"
          className="rbt-insight-card is-clickable"
          onClick={() => bestPeriod && onSelectPoint(bestPeriod)}
          disabled={!bestPeriod}
        >
          <span className="rbt-insight-icon"><CalendarCheck2 size={18} aria-hidden /></span>
          <span className="rbt-insight-label">Kỳ bán tốt nhất</span>
          <strong>{bestPeriod?.label ?? '—'}</strong>
          <small>{bestPeriod ? `${formatMoney(bestPeriod.netRevenue)} · ${formatNumber(bestPeriod.invoiceCount)} hóa đơn` : 'Chưa có dữ liệu'}</small>
        </button>

        <article className="rbt-insight-card">
          <span className="rbt-insight-icon"><Store size={18} aria-hidden /></span>
          <span className="rbt-insight-label">Cửa hàng đóng góp cao nhất</span>
          <strong>{topStore?.label ?? 'Chưa đủ phân loại'}</strong>
          <small>{topStore ? `${formatMoney(topStore.revenue)} · ${formatNumber(topStore.percent, 1)}% doanh thu` : 'Mở báo cáo cửa hàng để xem chi tiết'}</small>
        </article>

        <article className="rbt-insight-card">
          <span className="rbt-insight-icon"><Trophy size={18} aria-hidden /></span>
          <span className="rbt-insight-label">Nhân viên đóng góp cao nhất</span>
          <strong>{topStaff?.label ?? 'Chưa đủ phân loại'}</strong>
          <small>{topStaff ? `${formatMoney(topStaff.revenue)} · ${formatNumber(topStaff.percent, 1)}% doanh thu` : 'Dữ liệu nhân viên chưa đủ để xếp hạng'}</small>
        </article>

        <article className={`rbt-insight-card ${hasWarning ? 'is-warning' : 'is-positive'}`}>
          <span className="rbt-insight-icon">
            {hasWarning ? <AlertTriangle size={18} aria-hidden /> : <BadgeDollarSign size={18} aria-hidden />}
          </span>
          <span className="rbt-insight-label">Sức khỏe doanh thu</span>
          <strong>Tỷ lệ giá trị hoàn {formatPercent(refundValueRate)}</strong>
          <small>
            {revenueChange === null
              ? 'Bật “So với kỳ trước” để nhận diện biến động doanh thu.'
              : `Doanh thu ${revenueChange >= 0 ? 'tăng' : 'giảm'} ${formatPercent(Math.abs(revenueChange))} so với kỳ trước.`}
          </small>
        </article>
      </div>
    </section>
  );
}
