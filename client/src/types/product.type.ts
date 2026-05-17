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
  qty?: number;          // Tổng tồn
  pendingImportQty?: number; // Đang chuyển kho
  warehouseQty?: number; // Tồn thực tế
  delivering?: number;
  errorStock?: number;   // Lỗi
  holdQty?: number;      // Tạm giữ
  availableStock?: number; // Có thể bán
  preorderQty?: number;  // Đặt trước
  image?: string;
  warrantyMonths?: number;
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
  createdAt: string;
  color?: string;
  size?: string;
  origin?: string;
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
  totalStock?: number;
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
