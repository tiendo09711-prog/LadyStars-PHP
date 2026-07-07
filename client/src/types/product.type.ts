export interface ICategory {
  _id: string;
  code?: string;
  name: string;
  parentId?: string;
  isActive?: boolean;
  sortOrder?: number;
  isVisible?: boolean;
  productCount?: number;
  createdAt: string;
  url?: string;
}

export interface IProduct {
  _id: string;
  barcode?: string;
  type: string;
  code: string;
  name: string;
  unit?: string;
  status?: string;
  categoryId?: string;
  categoryName?: string;
  trademarkName?: string;
  supplierName?: string;
  parentCode?: string;
  parentName?: string;
  cost?: number;
  price?: number;
  branchPrice?: number;
  oldPrice?: number;
  vat?: number;
  profitPercent?: number;
  basePrice?: number;
  wholesalePrice?: number;
  clearancePrice?: number;
  clearanceActive?: boolean;
  clearanceNote?: string;
  clearanceStartedAt?: string;
  qty?: number;          // Tổng tồn
  pendingImportQty?: number; // Đang chuyển kho
  warehouseQty?: number; // Tồn thực tế
  delivering?: number;
  errorStock?: number;   // Lỗi
  holdQty?: number;      // Tạm giữ
  availableStock?: number; // Có thể bán
  preorderQty?: number;  // Đặt trước
  warrantyMonths?: number;
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
  createdAt: string;
  color?: string;
  size?: string;
  origin?: string;
  storageRisk?: {
    status: 'normal' | 'unsold_long' | 'slow_selling';
    statusLabel: string;
    thresholdDays: number;
    daysFromStart: number;
    daysFromLastSold: number | null;
  };
}

export interface IInventory {
  _id: string;
  parentCode?: string;
  parentName?: string;
  barcode?: string;
  code: string;
  name: string;
  weight?: number;
  price?: number;
  cost?: number;
  importPrice?: number;
  wholesalePrice?: number;
  stockHanoi?: number;
  stockHCM?: number;
  stockCN?: number;
  selectedStock?: number;
  stockByBranchId?: Record<string, number>;
  stockByBranchCode?: Record<string, number>;
  totalStock?: number;
  status?: string;
}

export interface IProductHistory {
  _id: string;
  productCode: string;
  productName: string;
  logType: string;
  logAction: string;
  createdBy: string;
  createdAt: string;
}

export interface IProductHistoryMeta {
  logTypes: string[];
  logActions: string[];
  editors: string[];
  toneByLogType: Record<string, string>;
}

export interface ITrademark {
  _id: string;
  name: string;
  createdAt: string;
}

export interface IStorageDuration {
  _id: string;
  code: string;
  name: string;
  supplierName?: string;
  categoryName?: string;
  cost?: number;
  price?: number;
  clearancePrice?: number;
  clearanceActive?: boolean;
  clearanceNote?: string;
  qty?: number;
  globalQty?: number;
  branchQty?: number;
  firstTransactionDate?: string;
  lastTransactionDate?: string;
  lastSoldDate?: string;
  daysFromStart: number;
  daysFromLast: number;
  daysFromLastSold: number | null;
  status?: 'normal' | 'unsold_long' | 'slow_selling';
  statusLabel?: string;
  branchName?: string;
}

export interface IStorageDurationKpis {
  totalProducts: number;
  unsoldLong: number;
  slowSelling: number;
  totalValue: number;
  oldStockValue?: number;
  unsoldLongValue?: number;
  slowSellingValue?: number;
  thresholdDays?: number;
  lastRefreshedAt?: string;
  topUnsoldLong?: IStorageDuration[];
  topSlowSelling?: IStorageDuration[];
}
