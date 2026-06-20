import { expect, test } from '@playwright/test';
import { API_BASE, cleanupRetailFixtures, closeDB, createCompletedSale, createRetailFixture } from '../utils/db';

const PREFIX = 'E2E_RETAIL_INTEGRITY_REVENUE_';
let scenarioPrefix = '';

async function authHeaders(page: any) {
  await page.goto('/');
  const token = await page.evaluate(() => localStorage.getItem('token'));
  return { Authorization: `Bearer ${token}` };
}

test.describe('Retail revenue report', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test.afterAll(async () => {
    if (scenarioPrefix) await cleanupRetailFixtures(scenarioPrefix);
    await closeDB();
  });

  test('shows completed retail revenue for the seeded branch and sale', async ({ page }) => {
    scenarioPrefix = `${PREFIX}${Date.now()}_`;
    const fixture = await createRetailFixture(scenarioPrefix, 1);
    const headers = await authHeaders(page);
    await createCompletedSale(page.request, headers, {
      code: `${scenarioPrefix}SALE_MAIN`,
      branchId: String(fixture.branch._id),
      customerId: String(fixture.customer._id),
      paymentMethodId: String(fixture.paymentMethods.cash._id),
      items: [{ productId: String(fixture.products[0]._id), amount: 5, value: fixture.products[0].price }],
    });

    const response = await page.request.get(`${API_BASE}/reports/revenue-time?displayType=Theo%20ngay&branchId=${fixture.branch._id}`, { headers });
    expect(response.ok()).toBeTruthy();
    const rows = await response.json();
    const revenue = rows.reduce((sum: number, row: any) => sum + Number(row.revenue || 0), 0);
    expect(revenue).toBe(fixture.products[0].price * 5);

    await page.goto('/reports/revenue/time');
    await expect(page.locator('.revenue-time-container')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Lọc")')).toBeEnabled();
  });
});
