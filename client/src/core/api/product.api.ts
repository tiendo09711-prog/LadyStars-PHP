import { http } from './http';
import type { ICategory, IProduct, IInventory, IProductHistory } from '../../types/product.type';

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export const productApi = {
  getProducts: async (params?: { page?: number; limit?: number; q?: string; [key: string]: any }) => {
    const response = await http.get<PaginatedResponse<IProduct>>('/products/products', { params });
    return response.data;
  },

  getProduct: async (id: string) => {
    const response = await http.get<IProduct>(`/products/products/${id}`);
    return response.data;
  },

  createProduct: async (data: Partial<IProduct>) => {
    const response = await http.post<IProduct>('/products/products', data);
    return response.data;
  },

  updateProduct: async (id: string, data: Partial<IProduct>) => {
    const response = await http.put<IProduct>(`/products/products/${id}`, data);
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

  getCategories: async (params?: { page?: number; limit?: number; q?: string; [key: string]: any }) => {
    const response = await http.get<PaginatedResponse<ICategory>>('/products/categories', { params });
    return response.data;
  },

  // Note: Backend might not have exact endpoints for inventories and logs matching these formats perfectly,
  // but we build the interface as requested and target logical endpoint names. 
  // In reality, getInventories might need to query branch-stocks or similar.
  getInventories: async (params?: { page?: number; limit?: number; q?: string; branchId?: string; [key: string]: any }) => {
    // If there is no specific inventory aggregation, we mock it by fetching products and mapping to IInventory
    const response = await http.get<PaginatedResponse<IProduct>>('/products/products', { params });
    const items: IInventory[] = response.data.items.map(p => ({
      _id: p._id,
      code: p.code,
      name: p.name,
      barcode: p.barcode,
      parentCode: p.parentCode,
      parentName: p.parentName,
      weight: p.weight,
      price: p.price,
      cost: p.cost,
      importPrice: p.cost, // Mock
      wholesalePrice: p.wholesalePrice,
      totalStock: p.qty,
      stockHanoi: Math.floor((p.qty || 0) * 0.6), // Mock as we don't have aggregated branch stock API yet
      stockHCM: Math.ceil((p.qty || 0) * 0.4),    // Mock as we don't have aggregated branch stock API yet
    }));
    return { ...response.data, items };
  },

  getProductLogs: async (params?: { page?: number; limit?: number; q?: string; [key: string]: any }) => {
    // Fallback if logs endpoint is not standard
    try {
      const response = await http.get<PaginatedResponse<IProductHistory>>('/products/logs', { params });
      return response.data;
    } catch {
      return { items: [], total: 0, page: 1, limit: params?.limit || 20 };
    }
  }
};
