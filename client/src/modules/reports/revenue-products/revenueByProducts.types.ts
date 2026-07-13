export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'this_year'
  | 'custom';

export type TrendGranularity = 'day' | 'week' | 'month';

export type CompareMode = 'none' | 'previous_period';

export type ReportMetric =
  | 'netRevenue'
  | 'revenue'
  | 'grossRevenue'
  | 'invoiceCount'
  | 'itemQuantity'
  | 'averageSellingPrice';

export type SortField =
  | 'netRevenue'
  | 'revenue'
  | 'grossRevenue'
  | 'invoiceCount'
  | 'itemQuantity'
  | 'averageSellingPrice'
  | 'productName'
  | 'productCode'
  | 'refundAmount'
  | 'discountAmount'
  | 'qtyReturned'
  | 'revenueSharePercent'
  | 'rank'
  | 'lastSoldAt';

export type SortDirection = 'asc' | 'desc';

export type ChartView = 'bar' | 'line' | 'area' | 'combo';

export type OptionItem = {
  value: string;
  label: string;
};

export type StoreOption = {
  id: string;
  name: string;
  code: string | null;
  isActive?: boolean;
};

export type CategoryOption = {
  id: string;
  name: string;
  code: string | null;
  isActive?: boolean;
};

export type StaffOption = {
  id: string;
  name: string;
  email?: string | null;
  role?: string | null;
};

export type RevenueByProductsOptions = {
  stores: StoreOption[];
  categories: CategoryOption[];
  staff: StaffOption[];
  channels: OptionItem[];
  saleChannels?: OptionItem[];
  invoiceStatuses: OptionItem[];
  paymentMethods: OptionItem[];
  presets: string[];
  compareModes: OptionItem[];
  metrics: OptionItem[];
  trendGranularities: OptionItem[];
  topOptions: number[];
  sortOptions: OptionItem[];
  perPageOptions: number[];
  timezone: string;
  currency: string;
  formulas?: Record<string, string>;
};

export type ProductReportFilters = {
  from: string;
  to: string;
  storeIds: string[];
  categoryIds: string[];
  staffId: string;
  channel: string;
  saleChannel: string;
  status: string;
  paymentMethod: string;
  compare: CompareMode;
  metric: ReportMetric;
  trendGranularity: TrendGranularity;
  top: number;
  page: number;
  perPage: number;
  sortBy: SortField;
  sortDirection: SortDirection;
  search: string;
  minRevenue: string;
  maxRevenue: string;
  minQuantity: string;
  maxQuantity: string;
};

export type MetricComparison = {
  currentValue: number | null;
  previousValue: number | null;
  changeValue: number | null;
  changePercent: number | null;
} | null;

export type ProductReportSummary = {
  productCount: number;
  grossRevenue: number;
  discountAmount: number;
  revenue: number;
  refundAmount: number;
  netRevenue: number;
  invoiceCount: number;
  itemQuantity: number;
  qtyReturned: number;
  returnRatePercent: number | null;
  averageOrderValue: number;
  averageSellingPrice: number;
  topProduct: {
    id: string;
    name: string;
    code: string | null;
    netRevenue: number;
  } | null;
};

export type ProductRankingRow = {
  productId: string;
  productName: string;
  productCode: string | null;
  categoryId: string | null;
  categoryName: string | null;
  trademarkName: string | null;
  sku: string | null;
  imageUrl: string | null;
  grossRevenue: number;
  discountAmount: number;
  revenue: number;
  refundAmount: number;
  netRevenue: number;
  invoiceCount: number;
  itemQuantity: number;
  qtyReturned: number;
  averageSellingPrice: number;
  revenueSharePercent: number;
  lastSoldAt: string | null;
  rank: number;
};

export type TimelinePoint = {
  key: string;
  label: string;
  revenue: number;
  refundAmount: number;
  netRevenue: number;
  itemQuantity: number;
  invoiceCount: number;
};

export type TrendPoint = {
  key: string;
  label: string;
  revenue: number;
  refundAmount: number;
  netRevenue: number;
  itemQuantity: number;
  invoiceCount: number;
};

export type TrendSeries = {
  productId: string;
  productName: string;
  points: TrendPoint[];
};

export type BreakdownItem = {
  key: string;
  label: string;
  revenue: number;
  invoiceCount: number;
  percent: number;
  itemQuantity?: number;
};

export type ParetoPoint = {
  productId: string;
  productName: string;
  netRevenue: number;
  cumulativeRevenue: number;
  cumulativePercent: number;
  rank: number;
};

export type ProductReportResponse = {
  filters: {
    from: string;
    to: string;
    storeIds: string[];
    categoryIds: string[];
    staffId: string | null;
    channel: string | null;
    saleChannel: string | null;
    status: string[];
    paymentMethod: string | null;
    compare: CompareMode;
    metric: ReportMetric;
    trendGranularity: TrendGranularity;
    top: number;
    search: string | null;
    minRevenue: number | null;
    maxRevenue: number | null;
    minQuantity: number | null;
    maxQuantity: number | null;
    timezone: string;
  };
  summary: ProductReportSummary;
  comparison: {
    period: { from: string; to: string };
    metrics: Record<string, MetricComparison>;
  } | null;
  ranking: ProductRankingRow[];
  timeline: TimelinePoint[];
  trend: {
    granularity: TrendGranularity;
    series: TrendSeries[];
    buckets?: { key: string; label: string }[];
    note?: string | null;
  };
  pareto: {
    totalNetRevenue: number;
    points: ParetoPoint[];
  };
  breakdowns: {
    categories: BreakdownItem[];
    trademarks: BreakdownItem[];
    channels: BreakdownItem[];
  };
  table: {
    data: ProductRankingRow[];
    totals: {
      grossRevenue: number;
      discountAmount: number;
      revenue: number;
      refundAmount: number;
      netRevenue: number;
      invoiceCount: number;
      itemQuantity: number;
      qtyReturned: number;
      averageSellingPrice: number;
    };
    pagination: {
      page: number;
      perPage: number;
      total: number;
      totalPages: number;
    };
  };
  meta: {
    generatedAt: string;
    currency: string;
    timezone: string;
    saleCountLoaded?: number;
    refundCountLoaded?: number;
    productCountMatched?: number;
    notes?: string[];
  };
};
