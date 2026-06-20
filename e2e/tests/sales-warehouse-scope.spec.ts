import { expect, request as playwrightRequest, test } from '@playwright/test';

const API_BASE = 'http://localhost:4000/api/';
const APP_ORIGIN = 'http://localhost:5173';
const ADMIN_EMAIL = 'admin@gmail.com';
const ADMIN_PASSWORD = '123456';
const EMPLOYEE_PASSWORD = '12345678';

function storageStateForToken(token: string) {
  return {
    cookies: [],
    origins: [
      {
        origin: APP_ORIGIN,
        localStorage: [
          { name: 'token', value: token },
        ],
      },
    ],
  };
}

async function loginToken(email: string, password: string) {
  const api = await playwrightRequest.newContext({ baseURL: API_BASE });
  const response = await api.post('auth/login', { data: { email, password } });
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  await api.dispose();
  return data.token as string;
}

async function authedApi(token: string) {
  return playwrightRequest.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
}

async function cleanupEmployee(adminApi: any, employeeId?: string) {
  if (!employeeId) return;
  const lockResponse = await adminApi.patch(`staff/${employeeId}/lock`);
  expect([200, 404]).toContain(lockResponse.status());
  const deleteResponse = await adminApi.delete(`staff/${employeeId}`);
  expect([204, 404]).toContain(deleteResponse.status());
}

test.describe('Sales warehouse scope E2E', () => {
  test('limits EMPLOYEE retail/wholesale/refund access to assigned warehouse only', async ({ browser }) => {
    const runId = Date.now();
    const adminToken = await loginToken(ADMIN_EMAIL, ADMIN_PASSWORD);
    const adminApi = await authedApi(adminToken);

    let employeeAId = '';
    let employeeBId = '';
    let ownSaleId = '';
    let foreignSaleId = '';
    let ownRefundId = '';

    let employeeAApi: any;
    let employeeBApi: any;
    let employeeARetailContext: any;
    let employeeAWholesaleContext: any;
    let employeeARefundContext: any;

    try {
      const branchesResponse = await adminApi.get('system/branches');
      expect(branchesResponse.ok()).toBeTruthy();
      const branchesData = await branchesResponse.json();
      const branches = branchesData.items || [];
      const branchA = branches.find((branch: any) => branch.code === 'HN');
      const branchB = branches.find((branch: any) => branch.code === 'HCM');
      expect(branchA?._id).toBeTruthy();
      expect(branchB?._id).toBeTruthy();

      const branchAInventoryResponse = await adminApi.get(`products/inventories?branchId=${branchA._id}&limit=200`);
      const branchBInventoryResponse = await adminApi.get(`products/inventories?branchId=${branchB._id}&limit=200`);
      expect(branchAInventoryResponse.ok()).toBeTruthy();
      expect(branchBInventoryResponse.ok()).toBeTruthy();
      const branchAProducts = (await branchAInventoryResponse.json()).items || [];
      const branchBProducts = (await branchBInventoryResponse.json()).items || [];
      const branchAProduct = branchAProducts.find((item: any) => Number(item.selectedStock || item.totalStock || 0) > 0 && Number(item.price || 0) > 0);
      const branchBProduct = branchBProducts.find((item: any) => Number(item.selectedStock || item.totalStock || 0) > 0 && Number(item.price || 0) > 0);
      expect(branchAProduct?._id).toBeTruthy();
      expect(branchBProduct?._id).toBeTruthy();

      const employeeAEmail = `e2e.warehouse.hn.${runId}@example.com`;
      const employeeBEmail = `e2e.warehouse.hcm.${runId}@example.com`;

      const employeeAResponse = await adminApi.post('staff', {
        data: {
          name: `E2E HN ${runId}`,
          email: employeeAEmail,
          password: EMPLOYEE_PASSWORD,
          phone: '',
          status: 'ACTIVE',
          assignedWarehouseIds: [branchA._id],
          defaultWarehouseId: branchA._id,
        },
      });
      expect(employeeAResponse.status()).toBe(201);
      const employeeA = await employeeAResponse.json();
      employeeAId = String(employeeA._id || employeeA.id || '');

      const employeeBResponse = await adminApi.post('staff', {
        data: {
          name: `E2E HCM ${runId}`,
          email: employeeBEmail,
          password: EMPLOYEE_PASSWORD,
          phone: '',
          status: 'ACTIVE',
          assignedWarehouseIds: [branchB._id],
          defaultWarehouseId: branchB._id,
        },
      });
      expect(employeeBResponse.status()).toBe(201);
      const employeeB = await employeeBResponse.json();
      employeeBId = String(employeeB._id || employeeB.id || '');

      const employeeAToken = await loginToken(employeeAEmail, EMPLOYEE_PASSWORD);
      const employeeBToken = await loginToken(employeeBEmail, EMPLOYEE_PASSWORD);
      employeeAApi = await authedApi(employeeAToken);
      employeeBApi = await authedApi(employeeBToken);

      const forbiddenInventory = await employeeAApi.get(`products/inventories?branchId=${branchB._id}&limit=20`);
      expect(forbiddenInventory.status()).toBe(403);

      const forbiddenSale = await employeeAApi.post('products/sales', {
        data: {
          code: `E2E-FORBIDDEN-${runId}`,
          branchId: branchB._id,
          status: 'draft',
          items: [
            {
              productId: branchBProduct._id,
              amount: 1,
              value: Number(branchBProduct.price),
              discountValue: 0,
              discountType: 'number',
              total: Number(branchBProduct.price),
            },
          ],
        },
      });
      expect(forbiddenSale.status()).toBe(403);

      const foreignSaleResponse = await adminApi.post('products/sales', {
        data: {
          code: `E2E-HCM-${runId}`,
          branchId: branchB._id,
          status: 'draft',
          items: [
            {
              productId: branchBProduct._id,
              amount: 1,
              value: Number(branchBProduct.price),
              discountValue: 0,
              discountType: 'number',
              total: Number(branchBProduct.price),
            },
          ],
        },
      });
      expect(foreignSaleResponse.status()).toBe(201);
      foreignSaleId = (await foreignSaleResponse.json())._id;
      const foreignCompleteResponse = await adminApi.post(`products/sales/${foreignSaleId}/complete`);
      expect(foreignCompleteResponse.ok()).toBeTruthy();

      const ownSaleResponse = await employeeAApi.post('products/sales', {
        data: {
          code: `E2E-HN-${runId}`,
          branchId: branchA._id,
          status: 'draft',
          items: [
            {
              productId: branchAProduct._id,
              amount: 1,
              value: Number(branchAProduct.price),
              discountValue: 0,
              discountType: 'number',
              total: Number(branchAProduct.price),
            },
          ],
        },
      });
      expect(ownSaleResponse.status()).toBe(201);
      ownSaleId = (await ownSaleResponse.json())._id;
      const ownCompleteResponse = await employeeAApi.post(`products/sales/${ownSaleId}/complete`);
      expect(ownCompleteResponse.ok()).toBeTruthy();

      const employeeBSeesSaleA = await employeeBApi.get(`products/sales/${ownSaleId}`);
      expect(employeeBSeesSaleA.status()).toBe(404);

      const crossRefundResponse = await employeeAApi.post('products/refunds', {
        data: {
          code: `E2E-REFUND-FORBIDDEN-${runId}`,
          paymentId: foreignSaleId,
          status: 'draft',
          items: [
            {
              productId: branchBProduct._id,
              amount: 1,
              price: Number(branchBProduct.price),
              discountValue: 0,
              discountType: 'number',
            },
          ],
        },
      });
      expect(crossRefundResponse.status()).toBe(404);

      const ownRefundResponse = await employeeAApi.post('products/refunds', {
        data: {
          code: `E2E-REFUND-HN-${runId}`,
          paymentId: ownSaleId,
          status: 'draft',
          items: [
            {
              productId: branchAProduct._id,
              amount: 1,
              price: Number(branchAProduct.price),
              discountValue: 0,
              discountType: 'number',
            },
          ],
        },
      });
      expect(ownRefundResponse.status()).toBe(201);
      ownRefundId = (await ownRefundResponse.json())._id;

      const employeeBSeesRefundA = await employeeBApi.get(`products/refunds/${ownRefundId}`);
      expect(employeeBSeesRefundA.status()).toBe(404);

      employeeARetailContext = await browser.newContext({ storageState: storageStateForToken(employeeAToken) });
      const retailPage = await employeeARetailContext.newPage();
      const retailInventoryResponse = retailPage.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname.endsWith('/api/products/inventories')
          && url.searchParams.get('branchId') === branchA._id
          && response.status() === 200;
      });
      await retailPage.goto(`/sales-channels/store/retail/create?branchId=${branchA._id}`);
      await retailInventoryResponse;
      await expect(retailPage.getByPlaceholder('Tìm theo mã, barcode hoặc tên sản phẩm...')).toBeVisible();
      await expect(retailPage.getByText(/Không tải được dữ liệu/i)).toHaveCount(0);

      employeeAWholesaleContext = await browser.newContext({ storageState: storageStateForToken(employeeAToken) });
      const wholesalePage = await employeeAWholesaleContext.newPage();
      const wholesaleInventoryResponse = wholesalePage.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname.endsWith('/api/products/inventories')
          && url.searchParams.get('branchId') === branchA._id
          && response.status() === 200;
      });
      await wholesalePage.goto(`/sales-channels/store/wholesale/create?branchId=${branchA._id}`);
      await wholesaleInventoryResponse;
      await expect(wholesalePage.getByPlaceholder('(F3) Tìm sản phẩm...')).toBeVisible();
      await expect(wholesalePage.getByText(/Không tải được dữ liệu|Error fetching dependencies/i)).toHaveCount(0);

      employeeARefundContext = await browser.newContext({ storageState: storageStateForToken(employeeAToken) });
      const refundPage = await employeeARefundContext.newPage();
      const refundSaleResponse = refundPage.waitForResponse((response) => {
        const pathname = new URL(response.url()).pathname;
        return pathname.endsWith(`/api/products/sales/${ownSaleId}`) && response.status() === 200;
      });
      const refundInventoryResponse = refundPage.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname.endsWith('/api/products/inventories')
          && url.searchParams.get('branchId') === branchA._id
          && response.status() === 200;
      });
      await refundPage.goto(`/sales-channels/store/refund/create?saleId=${ownSaleId}&branchId=${branchA._id}`);
      await refundSaleResponse;
      await refundInventoryResponse;
      await expect(refundPage.getByPlaceholder('(F3) Tìm sản phẩm trả...')).toBeVisible();
      await expect(refundPage.getByText(/Lỗi lấy thông tin hóa đơn|Lỗi lấy danh sách sản phẩm/i)).toHaveCount(0);
    } finally {
      if (employeeARefundContext) await employeeARefundContext.close();
      if (employeeAWholesaleContext) await employeeAWholesaleContext.close();
      if (employeeARetailContext) await employeeARetailContext.close();
      if (ownRefundId && employeeAApi) {
        await employeeAApi.delete(`products/refunds/${ownRefundId}`);
      }
      if (ownSaleId && employeeAApi) {
        await employeeAApi.post(`products/sales/${ownSaleId}/cancel`);
      }
      if (foreignSaleId) {
        await adminApi.post(`products/sales/${foreignSaleId}/cancel`);
      }
      if (employeeAApi) await employeeAApi.dispose();
      if (employeeBApi) await employeeBApi.dispose();
      await cleanupEmployee(adminApi, employeeAId);
      await cleanupEmployee(adminApi, employeeBId);
      await adminApi.dispose();
    }
  });
});
