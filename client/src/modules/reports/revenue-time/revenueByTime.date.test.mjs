/**
 * Lightweight unit checks for date-mode / granularity / query serialization (no test framework).
 * Run: node client/src/modules/reports/revenue-time/revenueByTime.date.test.mjs
 */

import assert from 'node:assert/strict';

function pad2(n) { return String(n).padStart(2, '0'); }
function formatDateYmd(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function parseYmd(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}
function startOfWeekMonday(base) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}
function rangeFromPreset(preset, today = new Date()) {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(end);
  switch (preset) {
    case 'today': break;
    case 'yesterday': start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1); break;
    case 'last_7_days': start.setDate(start.getDate() - 6); break;
    case 'last_30_days': start.setDate(start.getDate() - 29); break;
    case 'this_week': { const mon = startOfWeekMonday(end); return { from: formatDateYmd(mon), to: formatDateYmd(end) }; }
    case 'this_month': start.setDate(1); break;
    case 'last_month': {
      const firstThis = new Date(end.getFullYear(), end.getMonth(), 1);
      const lastPrev = new Date(firstThis.getTime() - 86400000);
      const firstPrev = new Date(lastPrev.getFullYear(), lastPrev.getMonth(), 1);
      return { from: formatDateYmd(firstPrev), to: formatDateYmd(lastPrev) };
    }
    case 'this_quarter': { const q = Math.floor(end.getMonth() / 3); start.setMonth(q * 3, 1); break; }
    case 'this_year': start.setMonth(0, 1); break;
    case 'custom':
    default: start.setDate(start.getDate() - 29); break;
  }
  return { from: formatDateYmd(start), to: formatDateYmd(end) };
}
function validateDateRange(from, to) {
  const a = parseYmd(from); const b = parseYmd(to);
  if (!a || !b) return 'Vui lòng chọn ngày bắt đầu và kết thúc hợp lệ.';
  if (a.getTime() > b.getTime()) return 'Ngày bắt đầu không được lớn hơn ngày kết thúc.';
  return null;
}
function validateCustomDateInputs(customFrom, customTo) {
  const from = (customFrom || '').trim();
  const to = (customTo || '').trim();
  if (!from && !to) return 'Vui lòng nhập đủ Từ ngày và Đến ngày, hoặc dùng Đặt lại để quay về preset.';
  if (!from || !to) return 'Vui lòng nhập đủ cả Từ ngày và Đến ngày trước khi áp dụng.';
  return validateDateRange(from, to);
}
function inclusiveDayCount(from, to) {
  const a = parseYmd(from); const b = parseYmd(to);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}
function suggestedGranularity(from, to) {
  const a = parseYmd(from); const b = parseYmd(to);
  if (!a || !b) return 'day';
  const days = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  if (days <= 1) return 'hour';
  if (days <= 45) return 'day';
  if (days <= 120) return 'week';
  if (days <= 800) return 'month';
  return 'year';
}
const MAX_RANGE_DAYS = { hour: 7, day: 366, week: 732, month: 1826, quarter: 1826, year: 3650 };
function isGranularityAllowed(g, from, to) {
  const a = parseYmd(from); const b = parseYmd(to);
  if (!a || !b) return false;
  const days = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  return days <= MAX_RANGE_DAYS[g];
}
function ensureAllowedGranularity(g, from, to) {
  if (isGranularityAllowed(g, from, to)) return g;
  return suggestedGranularity(from, to);
}
function filtersToQuery(filters) {
  const q = {
    from: filters.from, to: filters.to, granularity: filters.granularity,
    compare: filters.compare, page: filters.page, perPage: filters.perPage,
    sortBy: filters.sortBy, sortDirection: filters.sortDirection,
  };
  if (filters.storeId) q.storeId = filters.storeId;
  if (filters.staffId) q.staffId = filters.staffId;
  if (filters.status) q.status = filters.status;
  if (filters.paymentMethod) q.paymentMethod = filters.paymentMethod;
  return q;
}
function defaultFilters() {
  const range = rangeFromPreset('last_30_days');
  return {
    from: range.from, to: range.to, granularity: 'day',
    storeId: '', staffId: '', channel: '', saleChannel: '',
    status: 'completed', paymentMethod: '', compare: 'previous_period',
    page: 1, perPage: 20, sortBy: 'periodKey', sortDirection: 'asc',
  };
}

// --- Tests ---
const today = new Date(2026, 6, 14); // 2026-07-14 local

// 1) last_30_days is exactly 30 calendar days inclusive of today
const r30 = rangeFromPreset('last_30_days', today);
assert.equal(r30.to, '2026-07-14');
assert.equal(r30.from, '2026-06-15');
assert.equal(inclusiveDayCount(r30.from, r30.to), 30);

// 2) default effective range = 30 days; default compare = previous_period
const df = defaultFilters();
assert.equal(df.compare, 'previous_period');
assert.equal(inclusiveDayCount(df.from, df.to), 30);

// 3) custom date inputs: empty both -> hint; one -> block; both -> ok; reversed -> block
assert.ok(validateCustomDateInputs('', '').includes('Đặt lại'));
assert.ok(validateCustomDateInputs('2026-07-01', '').includes('đủ cả'));
assert.equal(validateCustomDateInputs('2026-07-01', '2026-07-03'), null);
assert.ok(validateCustomDateInputs('2026-07-10', '2026-07-01') !== null);

// 4) granularity downgrade when custom range too wide for 'hour'
assert.equal(ensureAllowedGranularity('hour', '2026-07-01', '2026-07-10'), 'day');
assert.equal(ensureAllowedGranularity('day', '2026-07-01', '2026-07-03'), 'day');

// 5) filtersToQuery does NOT include channel/saleChannel even if set on filters
const q = filtersToQuery({ ...defaultFilters(), channel: 'retail', saleChannel: 'store' });
assert.ok(!('channel' in q), 'channel must not be sent');
assert.ok(!('saleChannel' in q), 'saleChannel must not be sent');

// 6) compare serialize none vs previous_period
const qPrev = filtersToQuery({ ...defaultFilters(), compare: 'previous_period' });
const qNone = filtersToQuery({ ...defaultFilters(), compare: 'none' });
assert.equal(qPrev.compare, 'previous_period');
assert.equal(qNone.compare, 'none');

// 7) previous-period inclusive count matches formula N = to-from+1
assert.equal(inclusiveDayCount('2026-07-01', '2026-07-03'), 3);
assert.equal(inclusiveDayCount('2026-07-01', '2026-07-01'), 1);

// 8) across month boundary granularity suggestion
assert.equal(suggestedGranularity('2026-06-30', '2026-07-01'), 'day');

// 9) last_7_days is 7 inclusive
const r7 = rangeFromPreset('last_7_days', today);
assert.equal(inclusiveDayCount(r7.from, r7.to), 7);

// 10) this_week Monday-based
const rw = rangeFromPreset('this_week', new Date(2026, 6, 15)); // Wednesday 2026-07-15
assert.equal(rw.from, '2026-07-13'); // Monday

console.log('revenueByTime.date.test.mjs: all assertions passed');
