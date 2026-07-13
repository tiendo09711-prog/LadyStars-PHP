import { http } from '../../../core/api/http';
import type { RevenueByStaffOptions, StaffReportFilters, StaffReportResponse } from './revenueByStaff.types';
import { filtersToQuery } from './revenueByStaff.utils';

export async function fetchRevenueByStaffOptions(signal?: AbortSignal): Promise<RevenueByStaffOptions> {
  const res = await http.get<RevenueByStaffOptions>('/reports/revenue/staff/options', { signal });
  return res.data;
}

export async function fetchRevenueByStaffReport(
  filters: StaffReportFilters,
  signal?: AbortSignal,
): Promise<StaffReportResponse> {
  const res = await http.get<StaffReportResponse>('/reports/revenue/staff', {
    params: filtersToQuery(filters),
    signal,
    paramsSerializer: {
      indexes: null,
    },
  });
  return res.data;
}
