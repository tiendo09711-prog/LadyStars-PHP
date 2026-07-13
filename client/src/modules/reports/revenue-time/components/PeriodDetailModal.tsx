import { useEffect, useId, useRef } from 'react';
import type { RevenueFilters, TimelinePoint } from '../revenueByTime.types';
import { formatMoney, formatNumber, GRANULARITY_LABELS } from '../revenueByTime.utils';

type Props = {
  point: TimelinePoint | null;
  filters: RevenueFilters;
  onClose: () => void;
  onViewInTable: (point: TimelinePoint) => void;
};

export function PeriodDetailModal({ point, filters, onClose, onViewInTable }: Props) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!point) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [point, onClose]);

  if (!point) return null;

  const rows: { label: string; value: string }[] = [
    { label: 'Thời gian', value: point.label },
    { label: 'Số hóa đơn', value: formatNumber(point.invoiceCount) },
    { label: 'Số sản phẩm', value: formatNumber(point.itemQuantity, 2) },
    { label: 'Doanh thu trước giảm', value: formatMoney(point.grossRevenue) },
    { label: 'Giảm giá', value: formatMoney(point.discountAmount) },
    { label: 'Doanh thu', value: formatMoney(point.revenue) },
    { label: 'Trả hàng', value: formatMoney(point.refundAmount) },
    { label: 'Doanh thu thuần', value: formatMoney(point.netRevenue) },
    { label: 'TB/hóa đơn', value: formatMoney(point.averageOrderValue) },
  ];
  if (point.costAmount !== null && point.costAmount !== undefined) {
    rows.push({ label: 'Giá vốn', value: formatMoney(point.costAmount) });
    rows.push({ label: 'Lợi nhuận gộp', value: formatMoney(point.grossProfit) });
  }

  return (
    <div
      className="rbt-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="rbt-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rbt-modal-header">
          <h3 id={titleId}>Chi tiết kỳ: {point.label}</h3>
          <button
            ref={closeRef}
            type="button"
            className="btn btn-light"
            onClick={onClose}
            aria-label="Đóng"
          >
            Đóng
          </button>
        </div>
        <div className="rbt-modal-body">
          <p className="rbt-modal-meta">
            Bộ lọc: {filters.from} → {filters.to}
            {' · '}
            {GRANULARITY_LABELS[filters.granularity] || filters.granularity}
            {filters.storeId ? ` · CH #${filters.storeId}` : ''}
            {filters.paymentMethod ? ` · ${filters.paymentMethod}` : ''}
          </p>
          <dl className="rbt-detail-grid">
            {rows.map((r) => (
              <div key={r.label} className="rbt-detail-row">
                <dt>{r.label}</dt>
                <dd>{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="rbt-modal-footer">
          <button type="button" className="btn btn-light" onClick={onClose}>
            Đóng
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onViewInTable(point)}
          >
            Xem chi tiết theo thời gian
          </button>
        </div>
      </div>
    </div>
  );
}
