import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { SortDirection, SortField, TimelinePoint } from '../revenueByTime.types';
import { formatMoney, formatNumber } from '../revenueByTime.utils';

type Props = {
  rows: TimelinePoint[];
  totals: {
    grossRevenue: number;
    discountAmount: number;
    revenue: number;
    refundAmount: number;
    netRevenue: number;
    invoiceCount: number;
    itemQuantity: number;
    averageOrderValue: number;
  } | null;
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  } | null;
  sortBy: SortField;
  sortDirection: SortDirection;
  perPage: number;
  showCost: boolean;
  loading: boolean;
  highlightKey?: string | null;
  onSort: (field: SortField) => void;
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number) => void;
  onRowOpen?: (row: TimelinePoint) => void;
};

function SortHeader({
  field,
  label,
  sortBy,
  sortDirection,
  onSort,
}: {
  field: SortField;
  label: string;
  sortBy: SortField;
  sortDirection: SortDirection;
  onSort: (f: SortField) => void;
}) {
  const active = sortBy === field;
  const ariaSort = active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th aria-sort={ariaSort as 'ascending' | 'descending' | 'none'}>
      <button type="button" className={`rbt-th-btn ${active ? 'is-active' : ''}`} onClick={() => onSort(field)}>
        {label}
        {active ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );
}

export function RevenueTimelineTable({
  rows,
  totals,
  pagination,
  sortBy,
  sortDirection,
  perPage,
  showCost,
  loading,
  highlightKey,
  onSort,
  onPageChange,
  onPerPageChange,
  onRowOpen,
}: Props) {
  return (
    <section className="rbt-surface" aria-label="Bảng chi tiết" id="rbt-timeline-table">
      <div className="rbt-surface-head">
        <div>
          <h2>Chi tiết theo thời gian</h2>
          <p>Tổng dòng là toàn bộ kỳ đã lọc (không chỉ trang hiện tại). Nhấp dòng để xem chi tiết.</p>
        </div>
        <label className="rbt-inline-field">
          <span>Dòng/trang</span>
          <select
            value={perPage}
            onChange={(e) => onPerPageChange(Number(e.target.value))}
            aria-label="Số dòng mỗi trang"
          >
            {[20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rbt-table-scroll">
        <table className="rbt-table">
          <thead>
            <tr>
              <SortHeader field="periodKey" label="Thời gian" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} />
              <SortHeader field="invoiceCount" label="Hóa đơn" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} />
              <SortHeader field="itemQuantity" label="SP bán" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} />
              <SortHeader field="grossRevenue" label="Trước giảm" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} />
              <SortHeader field="discountAmount" label="Giảm giá" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} />
              <SortHeader field="revenue" label="Doanh thu" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} />
              <SortHeader field="refundAmount" label="Trả hàng" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} />
              <SortHeader field="netRevenue" label="Thuần" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} />
              <SortHeader field="averageOrderValue" label="TB/HĐ" sortBy={sortBy} sortDirection={sortDirection} onSort={onSort} />
              {showCost && <th>Giá vốn</th>}
              {showCost && <th>LN gộp</th>}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={showCost ? 11 : 9} className="rbt-table-empty">
                  Đang tải dữ liệu…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={showCost ? 11 : 9} className="rbt-table-empty">
                  Không có dữ liệu trong khoảng đã chọn.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.key}
                  id={`rbt-row-${row.key}`}
                  className={highlightKey === row.key ? 'is-highlight' : undefined}
                  tabIndex={onRowOpen ? 0 : undefined}
                  onClick={() => onRowOpen?.(row)}
                  onKeyDown={(e) => {
                    if (!onRowOpen) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onRowOpen(row);
                    }
                  }}
                  style={onRowOpen ? { cursor: 'pointer' } : undefined}
                >
                  <td>{row.label}</td>
                  <td className="num">{formatNumber(row.invoiceCount)}</td>
                  <td className="num">{formatNumber(row.itemQuantity, 2)}</td>
                  <td className="num">{formatMoney(row.grossRevenue)}</td>
                  <td className="num">{formatMoney(row.discountAmount)}</td>
                  <td className="num">{formatMoney(row.revenue)}</td>
                  <td className="num">{formatMoney(row.refundAmount)}</td>
                  <td className="num">{formatMoney(row.netRevenue)}</td>
                  <td className="num">{formatMoney(row.averageOrderValue)}</td>
                  {showCost && <td className="num">{formatMoney(row.costAmount)}</td>}
                  {showCost && <td className="num">{formatMoney(row.grossProfit)}</td>}
                </tr>
              ))
            )}
          </tbody>
          {totals && rows.length > 0 && (
            <tfoot>
              <tr>
                <td>Tổng cộng (toàn bộ kỳ)</td>
                <td className="num">{formatNumber(totals.invoiceCount)}</td>
                <td className="num">{formatNumber(totals.itemQuantity, 2)}</td>
                <td className="num">{formatMoney(totals.grossRevenue)}</td>
                <td className="num">{formatMoney(totals.discountAmount)}</td>
                <td className="num">{formatMoney(totals.revenue)}</td>
                <td className="num">{formatMoney(totals.refundAmount)}</td>
                <td className="num">{formatMoney(totals.netRevenue)}</td>
                <td className="num">{formatMoney(totals.averageOrderValue)}</td>
                {showCost && <td className="num">—</td>}
                {showCost && <td className="num">—</td>}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="rbt-pagination">
          <span>
            Trang {pagination.page} / {pagination.totalPages} · {pagination.total} dòng
          </span>
          <div className="rbt-pagination-btns">
            <button
              type="button"
              className="btn btn-light"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
              aria-label="Trang trước"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="btn btn-light"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => onPageChange(pagination.page + 1)}
              aria-label="Trang sau"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
