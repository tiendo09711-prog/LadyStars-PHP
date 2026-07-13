import * as XLSX from 'xlsx';
import type {
  DatePreset,
  Granularity,
  RevenueFilters,
  RevenueReportResponse,
  TimelinePoint,
} from './revenueByTime.types';

/** CSV delimiter for Excel Vietnamese locale (list separator = semicolon). */
export const CSV_DELIMITER = ';';

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
  return `${Number(value).toLocaleString('vi-VN')} ₫`;
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('vi-VN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
}

/** Compact axis labels: 1,2tr / 1,5tỷ */
export function formatAxisMoney(value: number): string {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) {
    return `${(n / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}tỷ`;
  }
  if (abs >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}tr`;
  }
  if (abs >= 1_000) {
    return `${(n / 1_000).toLocaleString('vi-VN', { maximumFractionDigits: 0 })}k`;
  }
  return formatNumber(n);
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

export function defaultFilters(): RevenueFilters {
  const range = rangeFromPreset('last_30_days');
  return {
    from: range.from,
    to: range.to,
    granularity: 'day',
    storeId: '',
    staffId: '',
    channel: '',
    saleChannel: '',
    status: 'completed',
    paymentMethod: '',
    compare: 'previous_period',
    page: 1,
    perPage: 20,
    sortBy: 'periodKey',
    sortDirection: 'asc',
  };
}

export function validateDateRange(from: string, to: string): string | null {
  const a = parseYmd(from);
  const b = parseYmd(to);
  if (!a || !b) return 'Vui lòng chọn ngày bắt đầu và kết thúc hợp lệ.';
  if (a.getTime() > b.getTime()) return 'Ngày bắt đầu không được lớn hơn ngày kết thúc.';
  return null;
}

export function suggestedGranularity(from: string, to: string): Granularity {
  const a = parseYmd(from);
  const b = parseYmd(to);
  if (!a || !b) return 'day';
  const days = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  if (days <= 1) return 'hour';
  if (days <= 45) return 'day';
  if (days <= 120) return 'week';
  if (days <= 800) return 'month';
  return 'year';
}

export function isGranularityAllowed(granularity: Granularity, from: string, to: string): boolean {
  const a = parseYmd(from);
  const b = parseYmd(to);
  if (!a || !b) return false;
  const days = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  const max: Record<Granularity, number> = {
    hour: 7,
    day: 366,
    week: 732,
    month: 1826,
    quarter: 1826,
    year: 3650,
  };
  return days <= max[granularity];
}

export function filtersToQuery(filters: RevenueFilters): Record<string, string | number> {
  const q: Record<string, string | number> = {
    from: filters.from,
    to: filters.to,
    granularity: filters.granularity,
    compare: filters.compare,
    page: filters.page,
    perPage: filters.perPage,
    sortBy: filters.sortBy,
    sortDirection: filters.sortDirection,
  };
  if (filters.storeId) q.storeId = filters.storeId;
  if (filters.staffId) q.staffId = filters.staffId;
  if (filters.channel) q.channel = filters.channel;
  if (filters.saleChannel) q.saleChannel = filters.saleChannel;
  if (filters.status) q.status = filters.status;
  if (filters.paymentMethod) q.paymentMethod = filters.paymentMethod;
  return q;
}

/**
 * Escape one CSV cell for Excel (UTF-8, delimiter-aware).
 * Quotes when cell contains delimiter, quote, CR or LF.
 */
export function escapeCsvCell(cell: string | number, delimiter = CSV_DELIMITER): string {
  const s = String(cell ?? '');
  const needsQuote =
    s.includes('"') ||
    s.includes('\n') ||
    s.includes('\r') ||
    s.includes(delimiter) ||
    s.startsWith(' ') ||
    s.endsWith(' ');
  if (needsQuote) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Serialize CSV with UTF-8 BOM + semicolon delimiter (Excel vi-VN).
 * Pure function — unit-testable without DOM.
 */
export function serializeCsv(
  headers: string[],
  rows: (string | number)[][],
  delimiter = CSV_DELIMITER,
): string {
  const lines = [
    headers.map((h) => escapeCsvCell(h, delimiter)).join(delimiter),
    ...rows.map((r) => r.map((c) => escapeCsvCell(c, delimiter)).join(delimiter)),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
}

export function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** @deprecated Prefer exportTimelineExcel / serializeCsv */
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  downloadTextFile(filename, serializeCsv(headers, rows), 'text/csv;charset=utf-8;');
}

function autoWidthSheet(ws: XLSX.WorkSheet, aoa: (string | number)[][]): void {
  const colWidths = aoa[0]?.map((_, colIdx) => {
    let max = 10;
    for (const row of aoa) {
      const cell = row[colIdx];
      const len = String(cell ?? '').length;
      if (len > max) max = Math.min(len, 42);
    }
    return { wch: max + 2 };
  });
  if (colWidths) ws['!cols'] = colWidths;
  // SheetJS community: freeze header row (best-effort; not all writers honor it).
  (ws as XLSX.WorkSheet & { '!views'?: Array<Record<string, unknown>> })['!views'] = [
    { state: 'frozen', ySplit: 1 },
  ];
}

function timelineAoa(data: TimelinePoint[], includeCost: boolean): (string | number)[][] {
  const headers = [
    'Thời gian',
    'Số hóa đơn',
    'Số sản phẩm',
    'Doanh thu trước giảm',
    'Giảm giá',
    'Doanh thu',
    'Trả hàng',
    'Doanh thu thuần',
    'TB/hóa đơn',
  ];
  if (includeCost) {
    headers.push('Giá vốn', 'Lợi nhuận gộp');
  }
  const rows = data.map((row) => {
    const base: (string | number)[] = [
      row.label,
      row.invoiceCount,
      row.itemQuantity,
      row.grossRevenue,
      row.discountAmount,
      row.revenue,
      row.refundAmount,
      row.netRevenue,
      row.averageOrderValue,
    ];
    if (includeCost) {
      base.push(row.costAmount ?? '', row.grossProfit ?? '');
    }
    return base;
  });
  return [headers, ...rows];
}

export function exportTimelineExcel(
  data: TimelinePoint[],
  filters: RevenueFilters,
  includeCost: boolean,
): void {
  const aoa = timelineAoa(data, includeCost);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  autoWidthSheet(ws, aoa);
  // Numeric columns: leave as numbers for Excel; dates/labels stay text.
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Chi tiet');
  const name = `bao-cao-doanh-thu-theo-thoi-gian_${filters.from}_${filters.to}.xlsx`;
  XLSX.writeFile(wb, name);
}

export function exportTimelineCsv(
  data: TimelinePoint[],
  filters: RevenueFilters,
  includeCost: boolean,
): void {
  const aoa = timelineAoa(data, includeCost);
  const headers = aoa[0].map(String);
  const rows = aoa.slice(1);
  const name = `bao-cao-doanh-thu-theo-thoi-gian_${filters.from}_${filters.to}.csv`;
  downloadTextFile(name, serializeCsv(headers, rows), 'text/csv;charset=utf-8;');
}

function summaryAoa(report: RevenueReportResponse, filters: RevenueFilters): (string | number)[][] {
  const s = report.summary;
  const rows: (string | number)[][] = [
    ['Báo cáo doanh thu theo thời gian', ''],
    ['Từ ngày', filters.from],
    ['Đến ngày', filters.to],
    ['Kiểu tổng hợp', filters.granularity],
    ['Cửa hàng', filters.storeId || 'Tất cả'],
    ['Nhân viên', filters.staffId || 'Tất cả'],
    ['Loại hóa đơn', filters.channel || 'Tất cả'],
    ['Kênh bán', filters.saleChannel || 'Tất cả'],
    ['Trạng thái', filters.status || 'completed'],
    ['Thanh toán', filters.paymentMethod || 'Tất cả'],
    ['Múi giờ', report.meta?.timezone || 'Asia/Ho_Chi_Minh'],
    ['', ''],
    ['Chỉ số', 'Giá trị'],
    ['Doanh thu trước giảm (grossRevenue = revenue + discount)', s.grossRevenue],
    ['Giảm giá', s.discountAmount],
    ['Doanh thu (sau giảm, trước trừ trả hàng)', s.revenue],
    ['Trả hàng (theo ngày phát sinh refund)', s.refundAmount],
    ['Doanh thu thuần (revenue - refundAmount)', s.netRevenue],
    ['Số hóa đơn', s.invoiceCount],
    ['Số sản phẩm', s.itemQuantity],
    ['TB/hóa đơn (revenue / invoiceCount)', s.averageOrderValue],
  ];
  if (s.costAmount !== null) {
    rows.push(['Giá vốn', s.costAmount]);
    rows.push(['Lợi nhuận gộp', s.grossProfit ?? '']);
    rows.push(['Biên LN (%)', s.grossMarginPercent ?? '']);
  }
  rows.push(['', '']);
  rows.push(['Ghi chú công thức', '']);
  rows.push([
    'TB/hóa đơn',
    'Doanh thu sau giảm (trước trừ trả hàng) ÷ số hóa đơn. Không dùng netRevenue.',
  ]);
  rows.push(['Refund', 'Tính theo ngày phát sinh hoàn, không truy ngược ngày bán gốc.']);
  return rows;
}

export function exportSummaryExcel(report: RevenueReportResponse, filters: RevenueFilters): void {
  const aoa = summaryAoa(report, filters);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  autoWidthSheet(ws, aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tong hop');
  const name = `bao-cao-doanh-thu-tong-hop_${filters.from}_${filters.to}.xlsx`;
  XLSX.writeFile(wb, name);
}

export function exportSummaryCsv(report: RevenueReportResponse, filters: RevenueFilters): void {
  const aoa = summaryAoa(report, filters);
  const headers = aoa[0]?.map(String) ?? ['Chỉ số', 'Giá trị'];
  const rows = aoa.slice(1);
  const name = `bao-cao-doanh-thu-tong-hop_${filters.from}_${filters.to}.csv`;
  downloadTextFile(name, serializeCsv(headers, rows), 'text/csv;charset=utf-8;');
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
  custom: 'Tùy chỉnh',
};

export const GRANULARITY_LABELS: Record<Granularity, string> = {
  hour: 'Theo giờ',
  day: 'Theo ngày',
  week: 'Theo tuần',
  month: 'Theo tháng',
  quarter: 'Theo quý',
  year: 'Theo năm',
};

export const CHART_TYPE_LABELS: Record<string, string> = {
  line: 'Biểu đồ đường',
  bar: 'Biểu đồ cột',
  area: 'Biểu đồ vùng',
  combo: 'Biểu đồ kết hợp',
};
