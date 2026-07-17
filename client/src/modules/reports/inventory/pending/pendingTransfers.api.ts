import { http } from '../../../../core/api/http';
import type {
  PendingTransferFilters,
  PendingTransferOptions,
  PendingTransfersReportResponse,
} from './pendingTransfers.types';

export function pendingFiltersToQuery(filters: PendingTransferFilters): Record<string, string | number> {
  const params: Record<string, string | number> = {
    page: filters.page,
    perPage: filters.perPage,
    sortBy: filters.sortBy,
    sortDir: filters.sortDir,
  };
  if (filters.q.trim()) params.q = filters.q.trim();
  if (filters.sourceWarehouseId) params.sourceWarehouseId = filters.sourceWarehouseId;
  if (filters.destinationWarehouseId) params.destinationWarehouseId = filters.destinationWarehouseId;
  if (filters.status) params.status = filters.status;
  if (filters.fromDate) params.fromDate = filters.fromDate;
  if (filters.toDate) params.toDate = filters.toDate;
  if (filters.minWaitingDays.trim() !== '') params.minWaitingDays = Number(filters.minWaitingDays);
  return params;
}

export async function fetchPendingTransferOptions(signal?: AbortSignal): Promise<PendingTransferOptions> {
  const res = await http.get<PendingTransferOptions>('/reports/inventory/pending-transfers/options', { signal });
  return res.data;
}

export async function fetchPendingTransfersReport(
  filters: PendingTransferFilters,
  signal?: AbortSignal,
): Promise<PendingTransfersReportResponse> {
  const res = await http.get<PendingTransfersReportResponse>('/reports/inventory/pending-transfers', {
    params: pendingFiltersToQuery(filters),
    signal,
  });
  return res.data;
}
