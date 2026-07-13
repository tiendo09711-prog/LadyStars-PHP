import type { DatePreset, Granularity, RevenueFilters, RevenueReportOptions } from '../revenueByTime.types';
import {
  GRANULARITY_LABELS,
  PRESET_LABELS,
  isGranularityAllowed,
  rangeFromPreset,
  validateDateRange,
} from '../revenueByTime.utils';

type Props = {
  draft: RevenueFilters;
  preset: DatePreset;
  options: RevenueReportOptions | null;
  validationError: string | null;
  loading: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onPresetChange: (preset: DatePreset) => void;
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
  'custom',
];

const GRANULARITIES: Granularity[] = ['hour', 'day', 'week', 'month', 'quarter', 'year'];

export function RevenueReportFilters({
  draft,
  preset,
  options,
  validationError,
  loading,
  collapsed,
  onToggleCollapse,
  onPresetChange,
  onDraftChange,
  onApply,
  onReset,
}: Props) {
  const dateError = validateDateRange(draft.from, draft.to);
  const caps = options?.capabilities;

  const handlePreset = (value: DatePreset) => {
    onPresetChange(value);
    if (value !== 'custom') {
      const range = rangeFromPreset(value);
      onDraftChange({ from: range.from, to: range.to, page: 1 });
    }
  };

  const handleDateChange = (field: 'from' | 'to', value: string) => {
    if (preset !== 'custom') onPresetChange('custom');
    onDraftChange({ [field]: value, page: 1 });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onApply();
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
                onChange={(e) => handlePreset(e.target.value as DatePreset)}
                aria-label="Preset khoảng thời gian"
              >
                {PRESETS.map((p) => (
                  <option key={p} value={p}>
                    {PRESET_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>

            <label className="rbt-field">
              <span>Từ ngày</span>
              <input
                type="date"
                value={draft.from}
                max={draft.to || undefined}
                onChange={(e) => handleDateChange('from', e.target.value)}
                aria-invalid={Boolean(dateError)}
              />
            </label>

            <label className="rbt-field">
              <span>Đến ngày</span>
              <input
                type="date"
                value={draft.to}
                min={draft.from || undefined}
                onChange={(e) => handleDateChange('to', e.target.value)}
                aria-invalid={Boolean(dateError)}
              />
            </label>

            <label className="rbt-field">
              <span>Kiểu tổng hợp</span>
              <select
                value={draft.granularity}
                onChange={(e) => onDraftChange({ granularity: e.target.value as Granularity, page: 1 })}
              >
                {GRANULARITIES.map((g) => {
                  const allowed = isGranularityAllowed(g, draft.from, draft.to);
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
              >
                <option value="">Tất cả nhân viên</option>
                {(options?.staff ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {caps?.staff && caps.staff.available === false && (
                <em className="rbt-field-hint">Không có dữ liệu nhân viên gắn với hóa đơn nên chưa thể lọc.</em>
              )}
            </label>

            <label className="rbt-field">
              <span>Loại hóa đơn</span>
              <select
                value={draft.channel}
                onChange={(e) => onDraftChange({ channel: e.target.value, page: 1 })}
                disabled={caps?.invoiceType?.filterEnabled === false}
                title={caps?.invoiceType?.message || undefined}
              >
                <option value="">Tất cả</option>
                {(options?.channels ?? []).map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              {caps?.invoiceType && caps.invoiceType.available === false && (
                <em className="rbt-field-hint">Không có dữ liệu loại hóa đơn nên chưa thể lọc.</em>
              )}
            </label>

            <label className="rbt-field">
              <span>Kênh bán</span>
              <select
                value={draft.saleChannel}
                onChange={(e) => onDraftChange({ saleChannel: e.target.value, page: 1 })}
                disabled={caps?.saleChannel?.filterEnabled === false}
                title={caps?.saleChannel?.message || undefined}
              >
                <option value="">Tất cả kênh</option>
                {(options?.saleChannels ?? []).map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              {caps?.saleChannel && caps.saleChannel.available === false && (
                <em className="rbt-field-hint">Không có dữ liệu kênh bán nên chưa thể lọc.</em>
              )}
            </label>

            <label className="rbt-field">
              <span>Trạng thái</span>
              <select
                value={draft.status}
                onChange={(e) => onDraftChange({ status: e.target.value, page: 1 })}
              >
                {(options?.invoiceStatuses ?? []).map((s) => (
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

          {(dateError || validationError) && (
            <div className="rbt-filter-error" role="alert">
              {dateError || validationError}
            </div>
          )}

          <div className="rbt-filter-actions">
            <button type="button" className="btn btn-light" onClick={onReset} disabled={loading}>
              Đặt lại
            </button>
            <button type="button" className="btn btn-primary" onClick={onApply} disabled={loading || Boolean(dateError)}>
              {loading ? 'Đang tải…' : 'Áp dụng'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
