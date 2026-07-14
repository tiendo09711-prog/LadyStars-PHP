import type { DatePreset, Granularity, RevenueFilters, RevenueReportOptions } from '../revenueByTime.types';
import {
  GRANULARITY_LABELS,
  PRESET_LABELS,
  isGranularityAllowed,
  validateCustomDateInputs,
  validateDateRange,
} from '../revenueByTime.utils';

export type DateMode = 'preset' | 'custom';

type Props = {
  draft: RevenueFilters;
  preset: DatePreset;
  dateMode: DateMode;
  customFrom: string;
  customTo: string;
  options: RevenueReportOptions | null;
  validationError: string | null;
  loading: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onPresetChange: (preset: DatePreset) => void;
  onCustomDateChange: (field: 'from' | 'to', value: string) => void;
  onDraftChange: (patch: Partial<RevenueFilters>) => void;
  onApply: () => void;
  onReset: () => void;
};

const PRESETS: DatePreset[] = [
  'today',
  'yesterday',
  'last_7_days',
  'last_30_days',
  'this_week',
  'this_month',
  'last_month',
  'this_quarter',
  'this_year',
];

const GRANULARITIES: Granularity[] = ['hour', 'day', 'week', 'month', 'quarter', 'year'];

export function RevenueReportFilters({
  draft,
  preset,
  dateMode,
  customFrom,
  customTo,
  options,
  validationError,
  loading,
  collapsed,
  onToggleCollapse,
  onPresetChange,
  onCustomDateChange,
  onDraftChange,
  onApply,
  onReset,
}: Props) {
  const customError =
    dateMode === 'custom' ? validateCustomDateInputs(customFrom, customTo) : null;
  // Effective range used for granularity allow-list (preset uses draft.from/to).
  const rangeFrom = dateMode === 'custom' && customFrom && customTo ? customFrom : draft.from;
  const rangeTo = dateMode === 'custom' && customFrom && customTo ? customTo : draft.to;
  const rangeError = dateMode === 'preset' ? validateDateRange(draft.from, draft.to) : customError;
  const applyBlocked = loading || Boolean(rangeError);
  const caps = options?.capabilities;
  const displayFrom = dateMode === 'custom' ? customFrom : '';
  const displayTo = dateMode === 'custom' ? customTo : '';
  const presetDisabled = dateMode === 'custom';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!applyBlocked) onApply();
    }
  };

  return (
    <section className="rbt-filters" aria-label="Bộ lọc báo cáo" onKeyDown={handleKeyDown}>
      <div className="rbt-filters-head">
        <div>
          <h2>Bộ lọc</h2>
          <p>Chọn khoảng thời gian và điều kiện trước khi áp dụng.</p>
        </div>
        <button type="button" className="btn btn-light rbt-collapse-btn" onClick={onToggleCollapse}>
          {collapsed ? 'Mở bộ lọc' : 'Thu gọn'}
        </button>
      </div>

      {!collapsed && (
        <div className="rbt-filters-body">
          <div className="rbt-filter-grid">
            <label className="rbt-field">
              <span>Khoảng thời gian</span>
              <select
                value={preset}
                onChange={(e) => onPresetChange(e.target.value as DatePreset)}
                aria-label="Preset khoảng thời gian"
                disabled={presetDisabled}
                title={
                  presetDisabled
                    ? 'Đang dùng khoảng ngày tùy chỉnh. Nhấn Đặt lại để quay về preset.'
                    : undefined
                }
              >
                {PRESETS.map((p) => (
                  <option key={p} value={p}>
                    {PRESET_LABELS[p]}
                  </option>
                ))}
              </select>
              {presetDisabled && (
                <em className="rbt-field-hint">
                  Đang dùng ngày tùy chỉnh — preset bị khóa. Nhấn «Đặt lại» để mở lại.
                </em>
              )}
            </label>

            <label className="rbt-field">
              <span>Từ ngày</span>
              <input
                type="date"
                value={displayFrom}
                max={displayTo || undefined}
                onChange={(e) => onCustomDateChange('from', e.target.value)}
                aria-invalid={Boolean(customError)}
                aria-label="Từ ngày tùy chỉnh"
              />
            </label>

            <label className="rbt-field">
              <span>Đến ngày</span>
              <input
                type="date"
                value={displayTo}
                min={displayFrom || undefined}
                onChange={(e) => onCustomDateChange('to', e.target.value)}
                aria-invalid={Boolean(customError)}
                aria-label="Đến ngày tùy chỉnh"
              />
            </label>

            <label className="rbt-field">
              <span>Kiểu tổng hợp</span>
              <select
                value={draft.granularity}
                onChange={(e) => onDraftChange({ granularity: e.target.value as Granularity, page: 1 })}
              >
                {GRANULARITIES.map((g) => {
                  const allowed = isGranularityAllowed(g, rangeFrom, rangeTo);
                  return (
                    <option key={g} value={g} disabled={!allowed}>
                      {GRANULARITY_LABELS[g]}
                      {!allowed ? ' (khoảng quá rộng)' : ''}
                    </option>
                  );
                })}
              </select>
            </label>

            <label className="rbt-field">
              <span>Cửa hàng</span>
              <select
                value={draft.storeId}
                onChange={(e) => onDraftChange({ storeId: e.target.value, page: 1 })}
                disabled={caps?.store?.filterEnabled === false}
                title={caps?.store?.message || undefined}
              >
                <option value="">Tất cả cửa hàng</option>
                {(options?.stores ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.code ? ` (${s.code})` : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="rbt-field">
              <span>Nhân viên</span>
              <select
                value={draft.staffId}
                onChange={(e) => onDraftChange({ staffId: e.target.value, page: 1 })}
                disabled={caps?.staff?.filterEnabled === false}
                title={caps?.staff?.message || undefined}
                aria-disabled={caps?.staff?.filterEnabled === false}
              >
                <option value="">Tất cả nhân viên</option>
                {(options?.staff ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {caps?.staff && caps.staff.available === false && (
                <em className="rbt-field-hint">
                  {caps.staff.message ||
                    'Không có dữ liệu nhân viên gắn với hóa đơn nên chưa thể lọc.'}
                </em>
              )}
            </label>

            <label className="rbt-field">
              <span>Trạng thái</span>
              <select
                value={draft.status}
                onChange={(e) => onDraftChange({ status: e.target.value, page: 1 })}
              >
                {(options?.invoiceStatuses ?? [{ value: 'completed', label: 'Hoàn tất' }]).map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="rbt-field">
              <span>Thanh toán</span>
              <select
                value={draft.paymentMethod}
                onChange={(e) => onDraftChange({ paymentMethod: e.target.value, page: 1 })}
              >
                <option value="">Tất cả PTTT</option>
                {(options?.paymentMethods ?? []).map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="rbt-field">
              <span>So sánh kỳ trước</span>
              <select
                value={draft.compare}
                onChange={(e) =>
                  onDraftChange({ compare: e.target.value as RevenueFilters['compare'], page: 1 })
                }
              >
                <option value="previous_period">Có</option>
                <option value="none">Không</option>
              </select>
            </label>
          </div>

          {(rangeError || validationError) && (
            <div className="rbt-filter-error" role="alert">
              {rangeError || validationError}
            </div>
          )}

          <div className="rbt-filter-actions">
            <button type="button" className="btn btn-light" onClick={onReset} disabled={loading}>
              Đặt lại
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onApply}
              disabled={applyBlocked}
              aria-disabled={applyBlocked}
            >
              {loading ? 'Đang tải…' : 'Áp dụng'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
