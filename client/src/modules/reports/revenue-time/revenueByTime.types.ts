export type Granularity = 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';

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

export type ChartType = 'line' | 'bar' | 'area' | 'combo';

export type CompareMode = 'none' | 'previous_period';

export type SortField =
  | 'periodKey'
  | 'invoiceCount'
  | 'itemQuantity'
  | 'grossRevenue'
  | 'discountAmount'
  | 'revenue'
  | 'refundAmount'
  | 'netRevenue'
  | 'averageOrderValue';

export type SortDirection = 'asc' | 'desc';

export type OptionItem = {
  value: string;
  label: string;
};

export type StoreOption = {
  id: string;
  name: string;
  code: string | null;
};

export type StaffOption = {
  id: string;
  name: string;
  email?: string | null;
  role?: string | null;
};

export type CapabilityFlag = {
  available: boolean;
  filterEnabled?: boolean;
  message?: string | null;
};

export type RevenueReportOptions = {
  stores: StoreOption[];
  staff: StaffOption[];
  channels: OptionItem[];
  saleChannels?: OptionItem[];
  invoiceStatuses: OptionItem[];
  paymentMethods: OptionItem[];
  granularities: OptionItem[];
  presets: string[];
  perPageOptions: number[];
  timezone: string;
  currency: string;
  formulas?: Record<string, string>;
  capabilities?: {
    invoiceType?: CapabilityFlag;
    saleChannel?: CapabilityFlag;
    staff?: CapabilityFlag;
    store?: CapabilityFlag;
    paymentMethod?: CapabilityFlag;
    refundBranchColumn?: boolean;
  };
};

export type RevenueFilters = {
  from: string;
  to: string;
  granularity: Granularity;
  storeId: string;
  staffId: string;
  channel: string;
  saleChannel: string;
  status: string;
  paymentMethod: string;
  compare: CompareMode;
  page: number;
  perPage: number;
  sortBy: SortField;
  sortDirection: SortDirection;
};

export type MetricComparison = {
  currentValue: number | null;
  previousValue: number | null;
  changeValue: number | null;
  changePercent: number | null;
} | null;

export type RevenueSummary = {
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
};

export type TimelinePoint = {
  key: string;
  label: string;
  periodKey: string;
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

export type BreakdownItem = {
  key: string;
  label: string;
  revenue: number;
  invoiceCount: number;
  percent: number;
};

export type BreakdownDimensionMeta = {
  hasMeaningfulAttribution: boolean;
  coverage?: number;
  message?: string | null;
  allocationMode?: string;
  salesWithActualAmounts?: number;
  salesWithEqualSplit?: number;
  salesWithAmountMismatch?: number;
};

export type RevenueReportResponse = {
  filters: {
    from: string;
    to: string;
    granularity: Granularity;
    storeId: string | null;
    staffId: string | null;
    channel: string | null;
    saleChannel: string | null;
    status: string[];
    paymentMethod: string | null;
    compare: CompareMode;
    timezone: string;
  };
  summary: RevenueSummary;
  comparison: {
    period: { from: string; to: string };
    metrics: Record<string, MetricComparison>;
  } | null;
  timeline: TimelinePoint[];
  breakdowns: {
    stores: BreakdownItem[];
    channels: BreakdownItem[];
    paymentMethods: BreakdownItem[];
    staff: BreakdownItem[];
    meta?: {
      stores?: BreakdownDimensionMeta;
      channels?: BreakdownDimensionMeta;
      paymentMethods?: BreakdownDimensionMeta;
      staff?: BreakdownDimensionMeta;
      saleChannel?: BreakdownDimensionMeta;
      refundAllocation?: { note?: string };
    };
  };
  table: {
    data: TimelinePoint[];
    totals: {
      grossRevenue: number;
      discountAmount: number;
      revenue: number;
      refundAmount: number;
      netRevenue: number;
      invoiceCount: number;
      itemQuantity: number;
      averageOrderValue: number;
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
    attribution?: {
      invoiceType?: BreakdownDimensionMeta;
      staff?: BreakdownDimensionMeta;
      saleChannel?: BreakdownDimensionMeta;
      store?: BreakdownDimensionMeta;
      paymentMethod?: BreakdownDimensionMeta;
    };
    refunds?: {
      hasBranchColumn?: boolean;
      excludedMissingStore?: number;
      excludedMissingStaff?: number;
      excludedMissingChannel?: number;
      note?: string;
    };
    formulas?: Record<string, string>;
  };
};

export type ApiErrorShape = {
  message?: string;
  errors?: Record<string, string[]>;
};
