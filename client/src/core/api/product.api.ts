import { http } from './http';
import type { ICategory, IProduct, IInventory, IProductHistory, IBatch, ITrademark, IStorageDuration } from '../../types/product.type';

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
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
    const { qty: _qty, availableStock: _availableStock, trademarkName: _trademarkName, supplierName: _supplierName, initialStocks: _initialStocks, ...payload } = data;
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

  // Note: Backend might not have exact endpoints for inventories and logs matching these formats perfectly,
  // but we build the interface as requested and target logical endpoint names. 
  // In reality, getInventories might need to query branch-stocks or similar.
  getInventories: async (params?: { page?: number; limit?: number; q?: string; branchId?: string; sort?: string; order?: 'asc' | 'desc';[key: string]: any }) => {
    const response = await http.get<PaginatedResponse<IInventory>>('/products/inventories', { params });
    return response.data;
  },
  updateInventory: async (id: string, payload: Partial<IInventory>) => {
    const response = await http.put<IInventory>(`/products/inventories/${id}`, payload);
    return response.data;
  },

  getProductLogs: async (params?: { page?: number; limit?: number; q?: string;[key: string]: any }) => {
    const response = await http.get<PaginatedResponse<IProductHistory>>('/products/edit-logs', { params });
    return response.data;
  },

  getBatches: async (params?: { page?: number; limit?: number; q?: string;[key: string]: any }) => {
    const response = await http.get<PaginatedResponse<IBatch>>('/products/batches', { params });
    return response.data;
  },

  getBatch: async (id: string) => {
    const response = await http.get<IBatch>(`/products/batches/${id}`);
    return response.data;
  },

  createBatch: async (data: Partial<IBatch>) => {
    const response = await http.post<IBatch>('/products/batches', data);
    return response.data;
  },

  updateBatch: async (id: string, data: Partial<IBatch>) => {
    const response = await http.patch<IBatch>(`/products/batches/${id}`, data);
    return response.data;
  },

  deleteBatch: async (id: string) => {
    const response = await http.delete<{ message: string }>(`/products/batches/${id}`);
    return response.data;
  },

  importBatches: async (file: File, mode: 'create' | 'upsert' = 'upsert') => {
    const form = new FormData();
    form.append('file', file);
    form.append('mode', mode);
    const response = await http.post<{
      success: boolean;
      summary: { created: number; updated: number; skipped: number; errors: string[] };
    }>('/products/batches/import', form);
    return response.data;
  },

  getStorageDuration: async (params?: { page?: number; limit?: number; q?: string;[key: string]: any }) => {
    const response = await http.get<PaginatedResponse<IStorageDuration> & { kpis?: { totalProducts: number; unsoldLong: number; slowSelling: number; totalValue: number } }>('/products/storage-duration', { params });
    return response.data;
  },

  getTrademarks: async (params?: { page?: number; limit?: number; q?: string;[key: string]: any }) => {
    const response = await http.get<PaginatedResponse<ITrademark>>('/products/trademarks', { params });
    return response.data;
  }
};
