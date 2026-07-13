import { http } from '../../../core/api/http';
import type { RevenueByStoreOptions, StoreReportFilters, StoreReportResponse } from './revenueByStore.types';
import { filtersToQuery } from './revenueByStore.utils';

export async function fetchRevenueByStoreOptions(signal?: AbortSignal): Promise<RevenueByStoreOptions> {
  const res = await http.get<RevenueByStoreOptions>('/reports/revenue/store/options', { signal });
  return res.data;
}

export async function fetchRevenueByStoreReport(
  filters: StoreReportFilters,
  signal?: AbortSignal,
): Promise<StoreReportResponse> {
  const res = await http.get<StoreReportResponse>('/reports/revenue/store', {
    params: filtersToQuery(filters),
    signal,
    paramsSerializer: {
      indexes: null,
    },
  });
  return res.data;
}
