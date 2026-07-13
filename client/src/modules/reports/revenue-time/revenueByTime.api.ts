import { http } from '../../../core/api/http';
import type { RevenueFilters, RevenueReportOptions, RevenueReportResponse } from './revenueByTime.types';
import { filtersToQuery } from './revenueByTime.utils';

export async function fetchRevenueReportOptions(signal?: AbortSignal): Promise<RevenueReportOptions> {
  const res = await http.get<RevenueReportOptions>('/reports/revenue/time/options', { signal });
  return res.data;
}

export async function fetchRevenueByTimeReport(
  filters: RevenueFilters,
  signal?: AbortSignal,
): Promise<RevenueReportResponse> {
  const res = await http.get<RevenueReportResponse>('/reports/revenue/time', {
    params: filtersToQuery(filters),
    signal,
  });
  return res.data;
}
