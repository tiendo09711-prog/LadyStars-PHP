import { http } from './http';
import type { ICategory, IProduct, IInventory, IProductHistory, IProductHistoryMeta, ITrademark, IStorageDuration, IStorageDurationKpis } from '../../types/product.type';

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalStockQuantity?: number; // aggregate sum for inventory "Tổng tồn" (full filtered set)
  totalInventoryValue?: number; // aggregate sum (scoped qty * cost) for "TỔNG GIÁ TRỊ" over full filtered result
}

export interface ProductWarehouseStock {
  _id: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode?: string;
  quantity: number;
}

export interface ProductSavePayload extends Partial<IProduct> {
  initialStocks?: Array<{ warehouseId: string; quantity: number }>;
  stockAdjustment?: { warehouseId: string; quantity: number };
}

export const productApi = {
  getProducts: async (params?: { page?: number; limit?: number; q?: string;[key: string]: any }) => {
    const response = await http.get<PaginatedResponse<IProduct>>('/products/products', { params });
    return response.data;
  },

  getProduct: async (id: string) => {
    const response = await http.get<IProduct>(`/products/products/${id}`);
    return response.data;
  },

  createProduct: async (data: ProductSavePayload) => {
    const { qty: _qty, availableStock: _availableStock, trademarkName: _trademarkName, supplierName: _supplierName, ...payload } = data;
    const response = await http.post<IProduct>('/products/products', payload);
    return response.data;
  },

  updateProduct: async (id: string, data: ProductSavePayload) => {
    const { qty: _qty, availableStock: _availableStock, trademarkName: _trademarkName, supplierName: _supplierName, ...payload } = data;
    const response = await http.patch<IProduct>(`/products/products/${id}`, payload);
    return response.data;
  },

  getProductStocks: async (id: string) => {
    const response = await http.get<{ items: ProductWarehouseStock[]; totalQuantity: number }>(`/products/products/${id}/stocks`);
    return response.data;
  },

  deleteProduct: async (id: string) => {
    const response = await http.delete<{ message: string }>(`/products/products/${id}`);
    return response.data;
  },

  exportProducts: async (params?: { [key: string]: any }) => {
    const response = await http.get('/products/products/export', { params, responseType: 'blob' });
    return response.data;
  },

  getCategories: async (params?: { page?: number; limit?: number; q?: string;[key: string]: any }) => {
    const response = await http.get<PaginatedResponse<ICategory>>('/products/categories', { params });
    return response.data;
  },
  createCategory: async (data: Partial<ICategory> & { [key: string]: any }) => {
    const response = await http.post<ICategory>('/products/categories', data);
    return response.data;
  },
  updateCategory: async (id: string, data: Partial<ICategory> & { [key: string]: any }) => {
    const response = await http.patch<ICategory>(`/products/categories/${id}`, data);
    return response.data;
  },
  deleteCategory: async (id: string) => {
    const response = await http.delete(`/products/categories/${id}`);
    return response.data;
  },

  // Contract đồng bộ với BE ProductController::inventories + NodeShape::inventory
  // - branchId: lọc row theo kho (có stock record)
  // - stockStatus in_stock/sellable: aggregate đúng (kèm branchId thì tính theo kho)
  // - sort stock_<id> hoặc totalStock: aggregate server
  // - response: stockByBranchId (id string), stockByBranchCode, totalStock (full)
  getInventories: async (params?: { page?: number; limit?: number; q?: string; branchId?: string; stockStatus?: string; sort?: string; order?: 'asc' | 'desc';[key: string]: any }) => {
    const response = await http.get<PaginatedResponse<IInventory>>('/products/inventories', { params });
    return response.data;
  },
  updateInventory: async (id: string, payload: Partial<IInventory>) => {
    const response = await http.put<IInventory>(`/products/inventories/${id}`, payload);
    return response.data;
  },

  getProductLogs: async (params?: { page?: number; limit?: number; q?: string;[key: string]: any }) => {
    const response = await http.get<PaginatedResponse<IProductHistory> & { meta?: IProductHistoryMeta }>('/products/edit-logs', { params });
    return response.data;
  },

  getStorageDuration: async (params?: { page?: number; limit?: number; q?: string;[key: string]: any }) => {
    const response = await http.get<PaginatedResponse<IStorageDuration> & { kpis?: IStorageDurationKpis }>('/products/storage-duration', { params });
    return response.data;
  },



  getTrademarks: async (params?: { page?: number; limit?: number; q?: string;[key: string]: any }) => {
    const response = await http.get<PaginatedResponse<ITrademark>>('/products/trademarks', { params });
    return response.data;
  }
};
