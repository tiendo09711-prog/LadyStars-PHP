import { http } from '../../../core/api/http';
import type {
  ProductReportFilters,
  ProductReportResponse,
  RevenueByProductsOptions,
} from './revenueByProducts.types';
import { filtersToQuery } from './revenueByProducts.utils';

export async function fetchRevenueByProductsOptions(
  signal?: AbortSignal,
): Promise<RevenueByProductsOptions> {
  const res = await http.get<RevenueByProductsOptions>('/reports/revenue/products/options', {
    signal,
  });
  return res.data;
}

export async function fetchRevenueByProductsReport(
  filters: ProductReportFilters,
  signal?: AbortSignal,
): Promise<ProductReportResponse> {
  const res = await http.get<ProductReportResponse>('/reports/revenue/products', {
    params: filtersToQuery(filters),
    signal,
    paramsSerializer: {
      indexes: null,
    },
  });
  return res.data;
}
