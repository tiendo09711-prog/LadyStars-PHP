import { http } from '../../../../core/api/http';
import type {
  InOutStockFilters,
  InOutStockOptions,
  InOutStockReportResponse,
  InOutStockRow,
} from './inOutStock.types';
import { filtersToQuery } from './inOutStock.utils';

export type InventoryReconciliationResponse = {
  summary: { totalRows: number; reconciledRows: number; incompleteRows: number; varianceRows: number };
  meta: { fromDate: string; toDate: string; readOnly: boolean };
};

export async function fetchInventoryReconciliation(
  filters: InOutStockFilters,
  signal?: AbortSignal,
): Promise<InventoryReconciliationResponse> {
  const res = await http.get<InventoryReconciliationResponse>('/reports/inventory/reconciliation', {
    params: { fromDate: filters.fromDate, toDate: filters.toDate, ...(filters.warehouseId ? { branchId: filters.warehouseId } : {}) },
    signal,
  });
  return res.data;
}

export async function fetchInOutStockOptions(signal?: AbortSignal): Promise<InOutStockOptions> {
  const res = await http.get<InOutStockOptions>('/reports/inventory/in-out-stock/options', { signal });
  return res.data;
}

export async function fetchInOutStockReport(
  filters: InOutStockFilters,
  signal?: AbortSignal,
): Promise<InOutStockReportResponse> {
  const res = await http.get<InOutStockReportResponse>('/reports/inventory/in-out-stock', {
    params: filtersToQuery(filters),
    signal,
  });
  return res.data;
}

/** Client-side full export via paginated fetch of all pages with applied filters. */
export async function fetchAllInOutStockRows(
  filters: InOutStockFilters,
  signal?: AbortSignal,
): Promise<InOutStockRow[]> {
  const perPage = 100;
  const first = await fetchInOutStockReport({ ...filters, page: 1, perPage }, signal);
  const total = first.table?.pagination?.total ?? 0;
  const totalPages = Math.max(first.table?.pagination?.totalPages ?? 1, 1);
  let rows = [...(first.table?.data ?? [])];

  if (total <= perPage || totalPages <= 1) {
    return rows;
  }

  for (let page = 2; page <= totalPages; page += 1) {
    const next = await fetchInOutStockReport({ ...filters, page, perPage }, signal);
    rows = rows.concat(next.table?.data ?? []);
  }
  return rows;
}
