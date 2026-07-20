import { http } from './http';
import type { FilterSuggestItem } from '../components/ui/FilterSuggestInput';

type LooseRecord = Record<string, unknown>;

function asItems(data: unknown): LooseRecord[] {
  if (Array.isArray(data)) return data as LooseRecord[];
  if (data && typeof data === 'object') {
    const obj = data as { items?: unknown; data?: unknown };
    if (Array.isArray(obj.items)) return obj.items as LooseRecord[];
    if (Array.isArray(obj.data)) return obj.data as LooseRecord[];
  }
  return [];
}

function str(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function idOf(row: LooseRecord, fallbackIndex: number): string {
  return str(row._id) || str(row.id) || str(row.code) || `row-${fallbackIndex}`;
}

function joinMeta(parts: Array<string | undefined | null>): string | undefined {
  const cleaned = parts.map((p) => str(p)).filter(Boolean);
  return cleaned.length ? cleaned.join(' · ') : undefined;
}

/** Product: name / code / barcode. */
export async function suggestProducts(
  query: string,
  signal: AbortSignal,
  extraParams?: Record<string, string | number | undefined>,
): Promise<FilterSuggestItem[]> {
  const response = await http.get('/products/products', {
    params: { q: query, page: 1, limit: 10, ...extraParams },
    signal,
  });
  return asItems(response.data).map((row, index) => {
    const code = str(row.code);
    const name = str(row.name);
    const barcode = str(row.barcode);
    return {
      id: idOf(row, index),
      value: code || barcode || name || query,
      label: name || code || barcode || 'Sản phẩm',
      meta: joinMeta([code ? `Mã: ${code}` : '', barcode ? `Barcode: ${barcode}` : '']),
    };
  });
}

/** Inventory rows (same product fields). */
export async function suggestInventories(
  query: string,
  signal: AbortSignal,
  extraParams?: Record<string, string | number | undefined>,
): Promise<FilterSuggestItem[]> {
  const response = await http.get('/products/inventories', {
    params: { q: query, page: 1, limit: 10, ...extraParams },
    signal,
  });
  return asItems(response.data).map((row, index) => {
    const code = str(row.code) || str((row.productId as LooseRecord | undefined)?.code);
    const name = str(row.name) || str((row.productId as LooseRecord | undefined)?.name);
    const barcode = str(row.barcode) || str((row.productId as LooseRecord | undefined)?.barcode);
    return {
      id: idOf(row, index),
      value: code || barcode || name || query,
      label: name || code || barcode || 'Sản phẩm',
      meta: joinMeta([code ? `Mã: ${code}` : '', barcode ? `Barcode: ${barcode}` : '']),
    };
  });
}

/** Customer: name / phone / code. */
export async function suggestCustomers(
  query: string,
  signal: AbortSignal,
): Promise<FilterSuggestItem[]> {
  const response = await http.get('/customers/customers', {
    params: { keyword: query, limit: 10, page: 1 },
    signal,
  });
  return asItems(response.data).map((row, index) => {
    const name = str(row.name);
    const phone = str(row.phone) || str(row.phone2);
    const code = str(row.code) || str(row.cardId);
    // Prefer phone for filter uniqueness when available.
    const value = phone || name || code || query;
    return {
      id: idOf(row, index),
      value,
      label: name || phone || code || 'Khách hàng',
      meta: joinMeta([phone, code ? `Mã: ${code}` : '']),
    };
  });
}

/** Category: name / code. */
export async function suggestCategories(
  query: string,
  signal: AbortSignal,
): Promise<FilterSuggestItem[]> {
  const response = await http.get('/products/categories', {
    params: { q: query, page: 1, limit: 10 },
    signal,
  });
  return asItems(response.data).map((row, index) => {
    const name = str(row.name);
    const code = str(row.code);
    return {
      id: idOf(row, index),
      value: name || code || query,
      label: name || code || 'Danh mục',
      meta: code ? `Mã: ${code}` : undefined,
    };
  });
}

/** Retail / wholesale sale invoices by code. */
export async function suggestSaleInvoices(
  query: string,
  signal: AbortSignal,
  options: { type: 'retail' | 'wholesale'; channel?: string },
): Promise<FilterSuggestItem[]> {
  const response = await http.get('/products/sales', {
    params: {
      invoiceCode: query,
      type: options.type,
      ...(options.channel ? { channel: options.channel } : {}),
      page: 1,
      limit: 10,
    },
    signal,
  });
  return asItems(response.data).map((row, index) => {
    const code = str(row.code) || str(row.invoiceCode);
    const customer =
      str((row.customerId as LooseRecord | undefined)?.name)
      || str(row.customerName)
      || '';
    const phone =
      str((row.customerId as LooseRecord | undefined)?.phone)
      || str(row.customerPhone)
      || '';
    return {
      id: idOf(row, index),
      value: code || query,
      label: code || 'Hóa đơn',
      meta: joinMeta([customer, phone]),
    };
  });
}

/** Refund / return documents. */
export async function suggestRefunds(
  query: string,
  signal: AbortSignal,
  options?: { channel?: string },
): Promise<FilterSuggestItem[]> {
  const response = await http.get('/products/refunds', {
    params: {
      q: query,
      ...(options?.channel ? { channel: options.channel } : {}),
      page: 1,
      limit: 10,
    },
    signal,
  });
  return asItems(response.data).map((row, index) => {
    const code = str(row.code);
    const payment = row.paymentId as LooseRecord | undefined;
    const original =
      payment && typeof payment === 'object'
        ? str(payment.code)
        : str(row.paymentCode);
    const customerObj = payment?.customerId as LooseRecord | undefined;
    const customer =
      (customerObj && typeof customerObj === 'object' ? str(customerObj.name) : '')
      || str(row.customerName);
    const phone =
      (customerObj && typeof customerObj === 'object' ? str(customerObj.phone) : '')
      || str(row.customerPhone);
    return {
      id: idOf(row, index),
      value: code || original || query,
      label: code || 'Phiếu trả',
      meta: joinMeta([
        original ? `HĐ gốc: ${original}` : '',
        customer,
        phone,
      ]),
    };
  });
}

/** Warehouse transaction bill ID / code. */
export async function suggestWarehouseBills(
  query: string,
  signal: AbortSignal,
): Promise<FilterSuggestItem[]> {
  const response = await http.get('/warehouse/transactions/bills', {
    params: { billId: query, page: 1, limit: 10 },
    signal,
  });
  return asItems(response.data).map((row, index) => {
    const code = str(row.code) || str(row.billCode) || str(row.sourceId) || str(row.id);
    const typeLabel = str(row.typeLabel) || str(row.type) || str(row.kindLabel) || str(row.kind);
    const warehouse = str(row.warehouseName) || str(row.warehouse);
    return {
      id: idOf(row, index),
      value: code || query,
      label: code || 'Phiếu',
      meta: joinMeta([typeLabel, warehouse]),
    };
  });
}

/** Warehouse transfer ID / code. */
export async function suggestWarehouseTransfers(
  query: string,
  signal: AbortSignal,
): Promise<FilterSuggestItem[]> {
  const response = await http.get('/warehouse/transfers', {
    params: { id: query, tab: 'all', page: 1, limit: 10 },
    signal,
  });
  return asItems(response.data).map((row, index) => {
    const code = str(row.code) || str(row.id) || str(row._id);
    const src = str(row.sourceWarehouseName);
    const dst = str(row.destinationWarehouseName);
    const status = str(row.statusLabel) || str(row.status);
    return {
      id: idOf(row, index),
      value: code || query,
      label: code || 'Phiếu chuyển',
      meta: joinMeta([
        src && dst ? `${src} → ${dst}` : src || dst,
        status,
      ]),
    };
  });
}

/** Inventory audit ticket code / id. */
export async function suggestInventoryAudits(
  query: string,
  signal: AbortSignal,
): Promise<FilterSuggestItem[]> {
  const response = await http.get('/inventory-audits', {
    params: { keyword: query, page: 1, limit: 10 },
    signal,
  });
  return asItems(response.data).map((row, index) => {
    const code = str(row.code) || str(row.name) || str(row.id) || str(row._id);
    const warehouse = str(row.warehouseName) || str(row.warehouse);
    const status = str(row.statusLabel) || str(row.status);
    return {
      id: idOf(row, index),
      value: code || query,
      label: code || 'Phiếu kiểm kho',
      meta: joinMeta([warehouse, status]),
    };
  });
}

/** Customer care tickets (id, customer name/phone). */
export async function suggestCustomerCare(
  query: string,
  signal: AbortSignal,
): Promise<FilterSuggestItem[]> {
  const response = await http.get('/customers/care', {
    params: { q: query, page: 1, limit: 10 },
    signal,
  });
  return asItems(response.data).map((row, index) => {
    const code = str(row.code) || str(row.id) || str(row._id);
    const name = str(row.customerName) || str((row.customerId as LooseRecord | undefined)?.name);
    const phone = str(row.customerPhone) || str((row.customerId as LooseRecord | undefined)?.phone);
    // Prefer the typed-relevant value: code if looks like ticket, else name/phone.
    const value = code || name || phone || query;
    return {
      id: idOf(row, index),
      value,
      label: code || name || 'Phiếu CSKH',
      meta: joinMeta([name && code ? name : '', phone]),
    };
  });
}
