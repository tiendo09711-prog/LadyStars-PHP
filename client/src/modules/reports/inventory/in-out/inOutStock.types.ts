export type InOutStockFilters = {
  fromDate: string;
  toDate: string;
  warehouseId: string;
  type: string;
  q: string;
  page: number;
  perPage: number;
  sortBy: 'date' | 'billCode' | 'type' | 'warehouseName' | 'productName' | 'qtyIn' | 'qtyOut';
  sortDir: 'asc' | 'desc';
};

export type WarehouseOption = {
  value: string;
  label: string;
  code?: string | null;
};

export type TypeOption = {
  value: string;
  label: string;
};

export type InOutStockOptions = {
  warehouses: WarehouseOption[];
  types: TypeOption[];
  perPageOptions: number[];
  timezone: string;
  currency: string;
  maxRangeDays: number;
  sortFields?: string[];
  capabilities?: {
    valueMetrics?: boolean;
    transferLines?: boolean;
    exportAll?: boolean;
  };
};

export type InOutStockSummary = {
  totalIn: number;
  totalOut: number;
  netQty: number;
  lineCount: number;
  documentCount: number;
  valueIn: number;
  valueOut: number;
};

export type InOutTimelinePoint = {
  key: string;
  label: string;
  periodKey: string;
  qtyIn: number;
  qtyOut: number;
  netQty: number;
  lineCount: number;
};

export type InOutTypeBreakdown = {
  type: string;
  label: string;
  qtyIn: number;
  qtyOut: number;
  lineCount: number;
};

export type InOutStockRow = {
  id: string;
  date: string;
  billCode: string;
  type: string;
  typeLabel: string;
  warehouseId: string | null;
  warehouseName: string | null;
  productCode: string | null;
  productName: string | null;
  barcode: string | null;
  qtyIn: number;
  qtyOut: number;
  netQty: number;
  valueIn: number;
  valueOut: number;
  unitPrice: number;
  createdByName: string | null;
  source: string;
  sourceId: string | null;
  detailPath: string | null;
};

export type InOutStockReportResponse = {
  filters: InOutStockFilters;
  summary: InOutStockSummary;
  timeline: InOutTimelinePoint[];
  breakdowns: {
    byType: InOutTypeBreakdown[];
  };
  table: {
    data: InOutStockRow[];
    totals: {
      qtyIn: number;
      qtyOut: number;
      netQty: number;
      lineCount: number;
      valueIn: number;
      valueOut: number;
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
    timezone: string;
    currency: string;
    capabilities?: {
      valueMetrics?: boolean;
      transferLines?: boolean;
      exportAll?: boolean;
    };
  };
};
