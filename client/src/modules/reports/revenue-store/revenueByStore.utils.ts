import * as XLSX from 'xlsx';
import type {
  DatePreset,
  ReportMetric,
  SaleChannel,
  StoreRankingRow,
  StoreReportFilters,
  StoreReportResponse,
  TrendGranularity,
  TrendPoint,
} from './revenueByStore.types';

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatDateYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseYmd(s: string): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

export function formatDisplayDate(ymd: string): string {
  const d = parseYmd(ymd);
  if (!d) return ymd || '—';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number(value));
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('vi-VN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

export function formatPercent(value: number | null | undefined, signed = true): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const sign = signed && value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function startOfWeekMonday(base: Date): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function rangeFromPreset(preset: DatePreset, today = new Date()): { from: string; to: string } {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(end);

  switch (preset) {
    case 'today':
      break;
    case 'yesterday':
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      break;
    case 'last_7_days':
      start.setDate(start.getDate() - 6);
      break;
    case 'last_30_days':
      start.setDate(start.getDate() - 29);
      break;
    case 'this_week': {
      const mon = startOfWeekMonday(end);
      return { from: formatDateYmd(mon), to: formatDateYmd(end) };
    }
    case 'this_month':
      start.setDate(1);
      break;
    case 'last_month': {
      const firstThis = new Date(end.getFullYear(), end.getMonth(), 1);
      const lastPrev = new Date(firstThis.getTime() - 86400000);
      const firstPrev = new Date(lastPrev.getFullYear(), lastPrev.getMonth(), 1);
      return { from: formatDateYmd(firstPrev), to: formatDateYmd(lastPrev) };
    }
    case 'this_quarter': {
      const q = Math.floor(end.getMonth() / 3);
      start.setMonth(q * 3, 1);
      break;
    }
    case 'this_year':
      start.setMonth(0, 1);
      break;
    case 'custom':
    default:
      start.setDate(start.getDate() - 29);
      break;
  }

  return { from: formatDateYmd(start), to: formatDateYmd(end) };
}

export function suggestedTrendGranularity(from: string, to: string): TrendGranularity {
  const a = parseYmd(from);
  const b = parseYmd(to);
  if (!a || !b) return 'day';
  const days = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  if (days <= 45) return 'day';
  if (days <= 180) return 'week';
  return 'month';
}

export function defaultFilters(): StoreReportFilters {
  const range = rangeFromPreset('last_30_days');
  return {
    from: range.from,
    to: range.to,
    storeIds: [],
    staffId: '',
    channel: '',
    saleChannel: '',
    status: 'completed',
    paymentMethod: '',
    compare: 'previous_period',
    metric: 'netRevenue',
    trendGranularity: suggestedTrendGranularity(range.from, range.to),
    page: 1,
    perPage: 20,
    sortBy: 'netRevenue',
    sortDirection: 'desc',
    search: '',
  };
}

export function validateDateRange(from: string, to: string): string | null {
  const a = parseYmd(from);
  const b = parseYmd(to);
  if (!a || !b) return 'Vui lòng chọn ngày bắt đầu và kết thúc hợp lệ.';
  if (a.getTime() > b.getTime()) return 'Ngày bắt đầu không được lớn hơn ngày kết thúc.';
  return null;
}

/** Validate custom date inputs shown in the UI. Partial fill or invalid order must block Apply. */
export function validateCustomDateInputs(customFrom: string, customTo: string): string | null {
  const from = (customFrom || '').trim();
  const to = (customTo || '').trim();
  if (!from && !to) {
    return 'Vui lòng nhập đủ Từ ngày và Đến ngày, hoặc dùng Đặt lại để quay về khoảng thời gian có sẵn.';
  }
  if (!from || !to) {
    return 'Vui lòng nhập đủ cả Từ ngày và Đến ngày trước khi áp dụng.';
  }
  return validateDateRange(from, to);
}

export function filtersToQuery(filters: StoreReportFilters): Record<string, string | number | string[]> {
  const q: Record<string, string | number | string[]> = {
    from: filters.from,
    to: filters.to,
    compare: filters.compare,
    metric: filters.metric,
    trendGranularity: filters.trendGranularity,
    page: filters.page,
    perPage: filters.perPage,
    sortBy: filters.sortBy,
    sortDirection: filters.sortDirection,
  };
  // API accepts a comma-separated value (and explicitly parses it with parseStoreIds).
  if (filters.storeIds.length > 0) q.storeIds = filters.storeIds.join(',');
  if (filters.staffId) q.staffId = filters.staffId;
  if (filters.channel) q.channel = filters.channel;
  // saleChannel (legacy hardcode) and search (tim cua hang doc lap) da bo — khong gui len API.
  if (filters.status) q.status = filters.status;
  if (filters.paymentMethod) q.paymentMethod = filters.paymentMethod;
  return q;
}

/** Sync filters ↔ URL query string */
export function filtersToSearchParams(filters: StoreReportFilters, preset: DatePreset): string {
  const p = new URLSearchParams();
  p.set('from', filters.from);
  p.set('to', filters.to);
  p.set('preset', preset);
  p.set('compare', filters.compare);
  p.set('metric', filters.metric);
  // trendGranularity is auto-computed from the effective date range, kept in URL for back/forward determinism.
  p.set('trendGranularity', filters.trendGranularity);
  p.set('page', String(filters.page));
  p.set('perPage', String(filters.perPage));
  p.set('sortBy', filters.sortBy);
  p.set('sortDirection', filters.sortDirection);
  if (filters.storeIds.length) p.set('storeIds', filters.storeIds.join(','));
  if (filters.staffId) p.set('staffId', filters.staffId);
  if (filters.channel) p.set('channel', filters.channel);
  if (filters.status && filters.status !== 'completed') p.set('status', filters.status);
  if (filters.paymentMethod) p.set('paymentMethod', filters.paymentMethod);
  return p.toString();
}

export function filtersFromSearchParams(sp: URLSearchParams): {
  filters: StoreReportFilters;
  preset: DatePreset;
} {
  const base = defaultFilters();
  const fromUrl = sp.get('from');
  const toUrl = sp.get('to');
  // Khi URL khong chua ngay (route sach), mac dinh preset last_30_days + effective range 30 ngay,
  // khong roi ve 'custom/Tuy chon'.
  const hasUrlDates = Boolean(fromUrl || toUrl);
  const from = fromUrl || base.from;
  const to = toUrl || base.to;
  const presetRaw = (sp.get('preset') as DatePreset | null) ?? (hasUrlDates ? 'custom' : 'last_30_days');
  const preset = (['today', 'yesterday', 'last_7_days', 'last_30_days', 'this_week', 'this_month', 'last_month', 'this_quarter', 'this_year', 'custom'] as DatePreset[]).includes(presetRaw)
    ? presetRaw
    : 'last_30_days';
  const storeIdsRaw = sp.get('storeIds') || '';
  const storeIds = storeIdsRaw
    ? storeIdsRaw.split(',').map((id) => id.trim()).filter(Boolean)
    : [];

  const perPage = Number(sp.get('perPage') || base.perPage);
  const page = Math.max(1, Number(sp.get('page') || 1));

  // channel hop nhat: chi chap nhận kenh ban moi (retail/wholesale/refund).
  const channelRaw = (sp.get('channel') as SaleChannel | null) ?? '';
  const channel: SaleChannel = (['', 'retail', 'wholesale', 'refund'] as SaleChannel[]).includes(channelRaw)
    ? channelRaw
    : '';

  return {
    preset,
    filters: {
      from,
      to,
      storeIds,
      staffId: sp.get('staffId') || '',
      channel,
      // saleChannel legacy va search doc lap da bo — khong parse nua de URL cu khong ap filter an.
      saleChannel: '',
      status: sp.get('status') || 'completed',
      paymentMethod: sp.get('paymentMethod') || '',
      compare: sp.get('compare') === 'none' ? 'none' : 'previous_period',
      metric: (sp.get('metric') as ReportMetric) || 'netRevenue',
      trendGranularity: (sp.get('trendGranularity') as TrendGranularity) || suggestedTrendGranularity(from, to),
      page: Number.isFinite(page) ? page : 1,
      perPage: [20, 50, 100].includes(perPage) ? perPage : 20,
      sortBy: (sp.get('sortBy') as StoreReportFilters['sortBy']) || 'netRevenue',
      sortDirection: sp.get('sortDirection') === 'asc' ? 'asc' : 'desc',
      search: '',
    },
  };
}

const CSV_DELIMITER = ';';

export function escapeCsvCell(cell: string | number, delimiter = CSV_DELIMITER): string {
  let s = String(cell ?? '');
  // Formula injection guard for spreadsheet consumers
  if (/^[=+\-@]/.test(s)) {
    s = `'${s}`;
  }
  if (s.includes('"') || s.includes('\n') || s.includes('\r') || s.includes(delimiter) || s.startsWith(' ') || s.endsWith(' ')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function serializeCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [
    `sep=${CSV_DELIMITER}`,
    headers.map((header) => escapeCsvCell(header)).join(CSV_DELIMITER),
    ...rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(CSV_DELIMITER)),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const blob = new Blob([serializeCsv(headers, rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportRankingExcel(
  ranking: StoreRankingRow[],
  filters: StoreReportFilters,
  includeCost: boolean,
): void {
  const headers = [
    'Hạng',
    'Mã CH',
    'Tên cửa hàng',
    'Trạng thái',
    'DT trước giảm',
    'Giảm giá',
    'Doanh thu',
    'Hoàn tiền',
    'DT thuần',
    'Số HĐ',
    'SL SP',
    'TB/HĐ',
    'Tỷ trọng %',
  ];
  if (includeCost) {
    headers.push('Giá vốn', 'LN gộp', 'Biên LN %');
  }

  const rows = ranking.map((r) => {
    const base: (string | number)[] = [
      r.rank,
      r.storeCode ?? '',
      r.storeName,
      r.isActive === null ? '—' : r.isActive ? 'Hoạt động' : 'Ngừng',
      r.grossRevenue,
      r.discountAmount,
      r.revenue,
      r.refundAmount,
      r.netRevenue,
      r.invoiceCount,
      r.itemQuantity,
      r.averageOrderValue,
      r.revenueSharePercent,
    ];
    if (includeCost) {
      base.push(r.costAmount ?? '', r.grossProfit ?? '', r.grossMarginPercent ?? '');
    }
    return base;
  });

  const aoa = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Theo cua hang');
  XLSX.writeFile(wb, `bao-cao-doanh-thu-theo-cua-hang_${filters.from}_${filters.to}.xlsx`);
}

export function exportRankingCsv(
  ranking: StoreRankingRow[],
  filters: StoreReportFilters,
  includeCost: boolean,
): void {
  const headers = [
    'Hạng',
    'Mã CH',
    'Tên cửa hàng',
    'Trạng thái',
    'DT trước giảm',
    'Giảm giá',
    'Doanh thu',
    'Hoàn tiền',
    'DT thuần',
    'Số HĐ',
    'SL SP',
    'TB/HĐ',
    'Tỷ trọng %',
  ];
  if (includeCost) {
    headers.push('Giá vốn', 'LN gộp', 'Biên LN %');
  }
  const rows = ranking.map((r) => {
    const base: (string | number)[] = [
      r.rank,
      r.storeCode ?? '',
      r.storeName,
      r.isActive === null ? '—' : r.isActive ? 'Hoạt động' : 'Ngừng',
      r.grossRevenue,
      r.discountAmount,
      r.revenue,
      r.refundAmount,
      r.netRevenue,
      r.invoiceCount,
      r.itemQuantity,
      r.averageOrderValue,
      r.revenueSharePercent,
    ];
    if (includeCost) {
      base.push(r.costAmount ?? '', r.grossProfit ?? '', r.grossMarginPercent ?? '');
    }
    return base;
  });
  downloadCsv(`bao-cao-doanh-thu-theo-cua-hang_${filters.from}_${filters.to}.csv`, headers, rows);
}

export function exportSummaryCsv(report: StoreReportResponse, filters: StoreReportFilters): void {
  const s = report.summary;
  const rows: (string | number)[][] = [
    ['Từ ngày', filters.from],
    ['Đến ngày', filters.to],
    ['Số cửa hàng', s.storeCount],
    ['Doanh thu trước giảm', s.grossRevenue],
    ['Giảm giá', s.discountAmount],
    ['Doanh thu', s.revenue],
    ['Hoàn tiền', s.refundAmount],
    ['Doanh thu thuần', s.netRevenue],
    ['Số hóa đơn', s.invoiceCount],
    ['Số sản phẩm', s.itemQuantity],
    ['TB/hóa đơn', s.averageOrderValue],
  ];
  if (s.topStore) {
    rows.push(['Cửa hàng dẫn đầu', s.topStore.name]);
    rows.push(['DT thuần cửa hàng dẫn đầu', s.topStore.netRevenue]);
  }
  if (s.costAmount !== null) {
    rows.push(['Giá vốn', s.costAmount]);
    rows.push(['Lợi nhuận gộp', s.grossProfit ?? '']);
    rows.push(['Biên LN (%)', s.grossMarginPercent ?? '']);
  }
  downloadCsv(`bao-cao-doanh-thu-cua-hang-tong-hop_${filters.from}_${filters.to}.csv`, ['Chỉ số', 'Giá trị'], rows);
}

export function extractApiError(err: unknown): string {
  const anyErr = err as {
    response?: { data?: { message?: string; errors?: Record<string, string[]> } };
    message?: string;
  };
  const data = anyErr?.response?.data;
  if (data?.errors) {
    const first = Object.values(data.errors).flat()[0];
    if (first) return first;
  }
  if (data?.message) return data.message;
  if (anyErr?.message) return anyErr.message;
  return 'Không tải được báo cáo. Vui lòng thử lại.';
}

export const PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Hôm nay',
  yesterday: 'Hôm qua',
  last_7_days: '7 ngày gần nhất',
  last_30_days: '30 ngày gần nhất',
  this_week: 'Tuần này',
  this_month: 'Tháng này',
  last_month: 'Tháng trước',
  this_quarter: 'Quý này',
  this_year: 'Năm nay',
  custom: 'Tùy chọn',
};

/** Nhan va option cho Kênh bán hop nhat (Tất cả/Bán lẽ/Bán sỉ/Trả hàng). */
export const CHANNEL_LABELS: Record<SaleChannel, string> = {
  '': 'Tất cả',
  retail: 'Bán lẻ',
  wholesale: 'Bán sỉ',
  refund: 'Trả hàng',
};

export const CHANNEL_OPTIONS: { value: SaleChannel; label: string }[] = [
  { value: '', label: 'Tất cả' },
  { value: 'retail', label: 'Bán lẻ' },
  { value: 'wholesale', label: 'Bán sỉ' },
  { value: 'refund', label: 'Trả hàng' },
];

export const METRIC_LABELS: Record<ReportMetric, string> = {
  netRevenue: 'Doanh thu thuần',
  revenue: 'Doanh thu',
  grossRevenue: 'Trước giảm giá',
  invoiceCount: 'Số hóa đơn',
  itemQuantity: 'Số sản phẩm',
  averageOrderValue: 'Giá trị đơn TB',
};

export const CHART_VIEW_LABELS: Record<string, string> = {
  bar: 'Cột xếp hạng',
  line: 'Đường xu hướng',
  area: 'Vùng xu hướng',
  combo: 'Kết hợp',
};

export function metricValue(row: StoreRankingRow, metric: ReportMetric): number {
  return Number(row[metric] ?? 0);
}

export function trendMetricValue(point: TrendPoint | undefined, metric: ReportMetric): number {
  if (!point) return 0;
  if (metric === 'averageOrderValue') {
    const invoices = Number(point.invoiceCount ?? 0);
    if (invoices <= 0) return 0;
    return Number(point.revenue ?? 0) / invoices;
  }
  const key = metric as keyof TrendPoint;
  return Number(point[key] ?? 0);
}
