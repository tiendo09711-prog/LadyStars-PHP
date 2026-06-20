import { expect, test } from '@playwright/test';
import { API_BASE, cleanupRetailFixtures, closeDB, createCompletedSale, createRetailFixture } from '../utils/db';

const PREFIX = 'E2E_RETAIL_INTEGRITY_FLOW_';
let scenarioPrefix = '';

async function authHeaders(page: any) {
  await page.goto('/');
  const token = await page.evaluate(() => localStorage.getItem('token'));
  return { Authorization: `Bearer ${token}` };
}

test.describe('Retail sale flow', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test.afterAll(async () => {
    if (scenarioPrefix) await cleanupRetailFixtures(scenarioPrefix);
    await closeDB();
  });

  test('loads the retail pages and returns SalePayment-backed APIs', async ({ page }) => {
    scenarioPrefix = `${PREFIX}${Date.now()}_`;
    const fixture = await createRetailFixture(scenarioPrefix, 1);
    const headers = await authHeaders(page);
    const sale = await createCompletedSale(page.request, headers, {
      code: `${scenarioPrefix}SALE_MAIN`,
      branchId: String(fixture.branch._id),
      customerId: String(fixture.customer._id),
      paymentMethodId: String(fixture.paymentMethods.cash._id),
      items: [{ productId: String(fixture.products[0]._id), amount: 1, value: fixture.products[0].price }],
    });

    await page.goto('/sales-channels/admin/retail');
    await expect(page.locator('.retail-table-card')).toBeVisible({ timeout: 10000 });

    await page.goto(`/sales-channels/admin/retail/create?branchId=${fixture.branch._id}`);
    await expect(page.locator('input[placeholder="Nhập họ tên hoặc số điện thoại"]')).toBeVisible({ timeout: 8000 });

    const salesResponse = await page.request.get(`${API_BASE}/products/sales?limit=10&invoiceCode=${sale.code}`, { headers });
    expect(salesResponse.ok()).toBeTruthy();
    const salesPayload = await salesResponse.json();
    expect(Array.isArray(salesPayload.items)).toBeTruthy();
    expect(salesPayload.items[0]._id).toBe(sale._id);
    expect(salesPayload.items[0].code).toBe(sale.code);
    expect(salesPayload.items[0].status).toBe('completed');

    const reportResponse = await page.request.get(`${API_BASE}/reports/revenue-time?displayType=Theo%20ngay&branchId=${fixture.branch._id}`, { headers });
    expect(reportResponse.ok()).toBeTruthy();
    const reportPayload = await reportResponse.json();
    expect(Array.isArray(reportPayload)).toBeTruthy();
    if (reportPayload.length > 0) {
      expect(reportPayload[0]).toHaveProperty('time');
      expect(reportPayload[0]).toHaveProperty('revenue');
      expect(reportPayload[0]).toHaveProperty('profit');
    }
  });
});
