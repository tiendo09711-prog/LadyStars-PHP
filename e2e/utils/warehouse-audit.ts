import { expect, request as playwrightRequest } from '@playwright/test';

export const API_BASE = 'http://localhost:4000/api/';
export const APP_ORIGIN = 'http://localhost:5173';
export const ADMIN_EMAIL = 'admin@gmail.com';
export const ADMIN_PASSWORD = '123456';
export const EMPLOYEE_PASSWORD = '12345678';

type BranchRef = {
  _id: string;
  code: string;
  name: string;
  isDefault?: boolean;
};

type SeedProductInput = {
  code: string;
  name: string;
  cost?: number;
  price?: number;
  unit?: string;
  barcode?: string;
  branchStocks: Record<string, number>;
};

export function storageStateForToken(token: string) {
  return {
    cookies: [],
    origins: [
      {
        origin: APP_ORIGIN,
        localStorage: [{ name: 'token', value: token }],
      },
    ],
  };
}

export async function loginToken(email: string, password: string) {
  const api = await playwrightRequest.newContext({ baseURL: API_BASE });
  const response = await api.post('auth/login', { data: { email, password } });
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  await api.dispose();
  expect(data.token).toBeTruthy();
  return data.token as string;
}

export async function createApiContext(token: string) {
  return playwrightRequest.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
}

export async function loginAdminApi() {
  const token = await loginToken(ADMIN_EMAIL, ADMIN_PASSWORD);
  const api = await createApiContext(token);
  return { token, api };
}

export async function getBranches(api: any) {
  const response = await api.get('system/branches');
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  const branches = (payload.items || []) as BranchRef[];
  expect(branches.length).toBeGreaterThan(0);
  const defaultBranch = branches.find((branch) => branch.isDefault) || branches[0];
  const secondaryBranch = branches.find((branch) => branch._id !== defaultBranch._id) || branches[0];
  return { branches, defaultBranch, secondaryBranch };
}

export async function createEmployee(adminApi: any, input: {
  email: string;
  name: string;
  warehouseIds: string[];
  defaultWarehouseId: string;
}) {
  const response = await adminApi.post('staff', {
    data: {
      name: input.name,
      email: input.email,
      password: EMPLOYEE_PASSWORD,
      phone: '',
      status: 'ACTIVE',
      assignedWarehouseIds: input.warehouseIds,
      defaultWarehouseId: input.defaultWarehouseId,
    },
  });
  expect(response.status()).toBe(201);
  const payload = await response.json();
  return String(payload._id || payload.id || '');
}

export async function cleanupEmployee(adminApi: any, employeeId?: string) {
  if (!employeeId) return;
  const lockResponse = await adminApi.patch(`staff/${employeeId}/lock`);
  expect([200, 404]).toContain(lockResponse.status());
  const deleteResponse = await adminApi.delete(`staff/${employeeId}`);
  expect([204, 404]).toContain(deleteResponse.status());
}

export async function seedAuditProduct(api: any, input: SeedProductInput) {
  const response = await api.post('products/products', {
    data: {
      code: input.code,
      name: input.name,
      cost: Number(input.cost ?? 0),
      price: Number(input.price ?? 0),
      unit: input.unit || 'Cái',
      barcode: input.barcode || '',
      type: 'product',
      initialStocks: Object.entries(input.branchStocks).map(([warehouseId, quantity]) => ({
        warehouseId,
        quantity: Number(quantity || 0),
      })),
    },
  });
  expect(response.status()).toBe(201);
  const payload = await response.json();
  return {
    productId: String(payload._id || payload.id),
    code: payload.code as string,
    name: payload.name as string,
  };
}

export async function readBranchStock(api: any, productId: string, branchId: string) {
  const response = await api.get(`products/products/${productId}/stocks`);
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  const item = (payload.items || []).find((row: any) => row.warehouseId === branchId);
  return Number(item?.quantity || 0);
}

export async function readGlobalStock(api: any, productId: string) {
  const response = await api.get(`products/products/${productId}`);
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  return Number(payload.qty || 0);
}

export async function createStockDrift(api: any, input: {
  productId: string;
  warehouseId: string;
  warehouseName: string;
  amount: number;
  note: string;
  price?: number;
}) {
  const endpoint = input.amount >= 0 ? 'warehouse/vouchers/import' : 'warehouse/vouchers/export';
  const quantity = Math.abs(Number(input.amount));
  const response = await api.post(endpoint, {
    data: {
      branchId: input.warehouseId,
      warehouse: input.warehouseName,
      type: input.amount >= 0 ? 'Nhập khác' : 'Xuất khác',
      note: input.note,
      items: [{
        productId: input.productId,
        quantity,
        price: Number(input.price ?? 0),
        unit: 'Cái',
      }],
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

export async function cleanupAuditRun(api: any, runKey: string) {
  const productsResponse = await api.get(`products/products?q=${encodeURIComponent(runKey)}&limit=5000`);
  if (productsResponse.ok()) {
    const productsPayload = await productsResponse.json();
    for (const product of productsPayload.items || []) {
      const stocksResponse = await api.get(`products/products/${product._id}/stocks`);
      if (stocksResponse.ok()) {
        const stocksPayload = await stocksResponse.json();
        for (const stock of stocksPayload.items || []) {
          await api.delete(`products/branch-stocks/${stock._id}`);
        }
      }
      await api.delete(`products/products/${product._id}`);
    }
  }

  const auditResponse = await api.get(`inventory-audits?keyword=${encodeURIComponent(runKey)}&limit=200`);
  if (auditResponse.ok()) {
    const auditPayload = await auditResponse.json();
    for (const audit of auditPayload.items || []) {
      if (audit.status === 'DRAFT') {
        await api.delete(`inventory-audits/${audit._id}`);
      } else if (['COUNTING', 'SUBMITTED'].includes(String(audit.status || ''))) {
        await api.post(`inventory-audits/${audit._id}/cancel`, { data: { reason: `${runKey} cleanup` } });
      }
    }
  }
}

export async function shutdownAuditHelpers() {
  return undefined;
}
