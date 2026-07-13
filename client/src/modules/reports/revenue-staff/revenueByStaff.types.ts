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
  | 'averageOrderValue';

export type SortField =
  | 'netRevenue'
  | 'revenue'
  | 'grossRevenue'
  | 'invoiceCount'
  | 'itemQuantity'
  | 'averageOrderValue'
  | 'staffName'
  | 'refundAmount'
  | 'discountAmount'
  | 'rank';

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

export type StaffOption = {
  id: string;
  name: string;
  email?: string | null;
  role?: string | null;
  isActive?: boolean;
  status?: string | null;
};

export type RevenueByStaffOptions = {
  stores: StoreOption[];
  staff: StaffOption[];
  channels: OptionItem[];
  saleChannels?: OptionItem[];
  invoiceStatuses: OptionItem[];
  paymentMethods: OptionItem[];
  presets: string[];
  compareModes: OptionItem[];
  metrics: OptionItem[];
  trendGranularities: OptionItem[];
  sortOptions: OptionItem[];
  perPageOptions: number[];
  timezone: string;
  currency: string;
  formulas?: Record<string, string>;
};

export type StaffReportFilters = {
  from: string;
  to: string;
  staffIds: string[];
  storeId: string;
  channel: string;
  saleChannel: string;
  status: string;
  paymentMethod: string;
  compare: CompareMode;
  metric: ReportMetric;
  trendGranularity: TrendGranularity;
  page: number;
  perPage: number;
  sortBy: SortField;
  sortDirection: SortDirection;
  search: string;
};

export type MetricComparison = {
  currentValue: number | null;
  previousValue: number | null;
  changeValue: number | null;
  changePercent: number | null;
} | null;

export type StaffReportSummary = {
  staffCount: number;
  activeStaffCount: number;
  grossRevenue: number;
  discountAmount: number;
  revenue: number;
  refundAmount: number;
  netRevenue: number;
  invoiceCount: number;
  itemQuantity: number;
  averageOrderValue: number;
  costAmount: number | null;
  grossProfit: number | null;
  grossMarginPercent: number | null;
  topStaff: {
    id: string;
    name: string;
    email: string | null;
    netRevenue: number;
  } | null;
};

export type StaffRankingRow = {
  staffId: string;
  staffName: string;
  staffEmail: string | null;
  role: string | null;
  isActive: boolean | null;
  grossRevenue: number;
  discountAmount: number;
  revenue: number;
  refundAmount: number;
  netRevenue: number;
  invoiceCount: number;
  itemQuantity: number;
  averageOrderValue: number;
  costAmount: number | null;
  grossProfit: number | null;
  grossMarginPercent: number | null;
  revenueSharePercent: number;
  rank: number;
};

export type TrendPoint = {
  key: string;
  label: string;
  grossRevenue: number;
  revenue: number;
  refundAmount: number;
  netRevenue: number;
  invoiceCount: number;
  itemQuantity: number;
};

export type TrendSeries = {
  staffId: string;
  staffName: string;
  points: TrendPoint[];
};

export type BreakdownItem = {
  key: string;
  label: string;
  revenue: number;
  invoiceCount: number;
  percent: number;
};

export type StaffReportResponse = {
  filters: {
    from: string;
    to: string;
    staffIds: string[];
    storeId: string | null;
    channel: string | null;
    saleChannel: string | null;
    status: string[];
    paymentMethod: string | null;
    compare: CompareMode;
    metric: ReportMetric;
    trendGranularity: TrendGranularity;
    search: string | null;
    timezone: string;
  };
  summary: StaffReportSummary;
  comparison: {
    period: { from: string; to: string };
    metrics: Record<string, MetricComparison>;
  } | null;
  ranking: StaffRankingRow[];
  trend: {
    granularity: TrendGranularity;
    series: TrendSeries[];
    buckets?: { key: string; label: string }[];
    note?: string | null;
  };
  breakdowns: {
    revenueShareByStaff: BreakdownItem[];
    channels: BreakdownItem[];
    paymentMethods: BreakdownItem[];
    stores: BreakdownItem[];
  };
  table: {
    data: StaffRankingRow[];
    totals: {
      grossRevenue: number;
      discountAmount: number;
      revenue: number;
      refundAmount: number;
      netRevenue: number;
      invoiceCount: number;
      itemQuantity: number;
      averageOrderValue: number;
      costAmount: number | null;
      grossProfit: number | null;
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
    hasCostData: boolean;
    saleCountLoaded?: number;
    refundCountLoaded?: number;
  };
};
