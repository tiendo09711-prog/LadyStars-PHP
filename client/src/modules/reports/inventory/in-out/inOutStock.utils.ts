import type { InOutStockFilters, InOutStockReportResponse, InOutStockRow } from './inOutStock.types';

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
  const d = parseYmd(ymd.slice(0, 10));
  if (!d) return ymd || '—';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatDisplayDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) {
    return formatDisplayDate(value);
  }
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString('vi-VN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toLocaleString('vi-VN')} ₫`;
}

export function defaultFilters(today = new Date()): InOutStockFilters {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(end);
  // Last 15 calendar days inclusive (today and 14 days back).
  start.setDate(start.getDate() - 14);
  return {
    fromDate: formatDateYmd(start),
    toDate: formatDateYmd(end),
    warehouseId: '',
    type: '',
    q: '',
    page: 1,
    perPage: 20,
    sortBy: 'date',
    sortDir: 'desc',
  };
}

export function validateDateRange(fromDate: string, toDate: string, maxRangeDays = 366): string | null {
  const from = parseYmd(fromDate);
  const to = parseYmd(toDate);
  if (!from || !to) return 'Định dạng ngày không hợp lệ.';
  if (from.getTime() > to.getTime()) return 'Từ ngày không được sau Đến ngày.';
  const days = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
  if (days > maxRangeDays) return `Khoảng ngày tối đa là ${maxRangeDays} ngày.`;
  return null;
}

export function filtersToQuery(filters: InOutStockFilters): Record<string, string | number> {
  const params: Record<string, string | number> = {
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    page: filters.page,
    perPage: filters.perPage,
    sortBy: filters.sortBy,
    sortDir: filters.sortDir,
  };
  if (filters.warehouseId) params.warehouseId = filters.warehouseId;
  if (filters.type) params.type = filters.type;
  if (filters.q.trim()) params.q = filters.q.trim();
  return params;
}

export function extractApiError(err: unknown): string {
  const anyErr = err as {
    response?: { data?: { message?: string; errors?: Record<string, string[]> } };
    message?: string;
  };
  const data = anyErr?.response?.data;
  if (data?.message) return String(data.message);
  if (data?.errors) {
    const first = Object.values(data.errors).flat()[0];
    if (first) return String(first);
  }
  if (anyErr?.message) return String(anyErr.message);
  return 'Không tải được báo cáo. Vui lòng thử lại.';
}

function csvEscape(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r;]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function buildInOutCsv(rows: InOutStockRow[]): string {
  const headers = [
    'Thời gian',
    'Mã chứng từ',
    'Loại',
    'Kho',
    'Mã SP',
    'Tên SP',
    'Nhập',
    'Xuất',
    'Giá trị nhập',
    'Giá trị xuất',
    'Người tạo',
  ];
  const lines = [headers.join(CSV_DELIMITER)];
  for (const row of rows) {
    lines.push(
      [
        row.date,
        row.billCode,
        row.typeLabel || row.type,
        row.warehouseName,
        row.productCode,
        row.productName,
        row.qtyIn,
        row.qtyOut,
        row.valueIn,
        row.valueOut,
        row.createdByName,
      ]
        .map(csvEscape)
        .join(CSV_DELIMITER),
    );
  }
  return `\uFEFF${lines.join('\r\n')}`;
}

export function downloadTextFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportFilename(fromDate: string, toDate: string): string {
  return `xuat-nhap-ton-${fromDate}_${toDate}.csv`;
}

export function isEmptyReport(report: InOutStockReportResponse | null): boolean {
  if (!report) return false;
  return (report.table?.pagination?.total ?? 0) === 0 && (report.summary?.lineCount ?? 0) === 0;
}

/** Resolve API keys used by GET /warehouse/transactions/bills/{source}/{sourceId}. */
export function resolveBillDetailKey(
  row: Pick<InOutStockRow, 'source' | 'sourceId' | 'billCode' | 'type' | 'detailPath'>,
): { source: string; sourceId: string } | null {
  const sourceId = String(row.sourceId || '').trim();
  const source = String(row.source || '').trim();
  if (source && sourceId) {
    return { source, sourceId };
  }

  if (row.detailPath) {
    const transferMatch = row.detailPath.match(/^\/warehouse\/transfers\/([^/?#]+)/);
    if (transferMatch?.[1]) {
      return { source: 'warehouse-transfer', sourceId: decodeURIComponent(transferMatch[1]) };
    }
    try {
      const url = new URL(row.detailPath, 'http://local');
      const qSource = url.searchParams.get('source')?.trim() || '';
      const qSourceId = url.searchParams.get('sourceId')?.trim() || '';
      if (qSource && qSourceId) {
        return { source: qSource, sourceId: qSourceId };
      }
    } catch {
      // ignore invalid relative path
    }
  }

  const billCode = String(row.billCode || '').trim();
  if (!billCode) return null;

  const type = String(row.type || '').toUpperCase();
  if (type === 'TRANSFER') {
    return { source: 'warehouse-transfer', sourceId: billCode };
  }
  if (type === 'IMPORT' || type === 'EXPORT' || type === 'UNKNOWN' || type === '') {
    return { source: 'inventory-voucher', sourceId: billCode };
  }

  return null;
}
