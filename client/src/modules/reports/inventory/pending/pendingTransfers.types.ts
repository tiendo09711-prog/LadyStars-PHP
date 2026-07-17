export type PendingTransferFilters = {
  q: string;
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  status: string;
  fromDate: string;
  toDate: string;
  minWaitingDays: string;
  page: number;
  perPage: number;
  sortBy: string;
  sortDir: 'asc' | 'desc';
};

export type PendingTransferOptions = {
  warehouses: Array<{ value: string; label: string; code?: string | null }>;
  statuses: Array<{ value: string; label: string }>;
  pendingStatuses: string[];
  perPageOptions: number[];
  timezone: string;
  capabilities?: { openTransferLink?: boolean; readOnly?: boolean };
};

export type PendingTransferRow = {
  id: string;
  code: string;
  createdAt: string | null;
  sourceWarehouseId: string | null;
  sourceWarehouseName: string | null;
  destinationWarehouseId: string | null;
  destinationWarehouseName: string | null;
  itemCount: number;
  totalQty: number;
  status: string;
  statusLabel: string;
  waitingDays: number;
  createdByName: string | null;
  detailPath: string;
};

export type PendingTransfersReportResponse = {
  filters: PendingTransferFilters;
  summary: {
    totalPending: number;
    waitingSource: number;
    inTransit: number;
    waitingDestination: number;
    returnInProgress?: number;
    totalQty: number;
    maxWaitingDays: number;
  };
  breakdowns: {
    byStatus: Array<{ status: string; label: string; count: number; totalQty: number }>;
    aging: Array<{ key: string; label: string; min: number; max: number | null; count: number }>;
  };
  table: {
    data: PendingTransferRow[];
    totals: { totalQty: number; lineCount: number };
    pagination: { page: number; perPage: number; total: number; totalPages: number };
  };
  meta: {
    generatedAt: string;
    timezone: string;
    pendingStatuses: string[];
    capabilities?: { openTransferLink?: boolean; readOnly?: boolean };
  };
};
