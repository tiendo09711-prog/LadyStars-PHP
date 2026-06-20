import { expect, test } from '@playwright/test';
import {
  API_BASE,
  cleanupRetailFixtures,
  closeDB,
  createCompletedSale,
  createRetailFixture,
  createReturnExchange,
} from '../utils/db';

const PREFIX = 'E2E_RETAIL_INTEGRITY_REPORT_';
let scenarioPrefix = '';

function todayIsoDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

async function authHeaders(page: any) {
  await page.goto('/');
  const token = await page.evaluate(() => localStorage.getItem('token'));
  return { Authorization: `Bearer ${token}` };
}

test.describe('Revenue by time report', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test.afterAll(async () => {
    if (scenarioPrefix) await cleanupRetailFixtures(scenarioPrefix);
    await closeDB();
  });

  test('keeps net revenue after a completed refund and keeps report actions available', async ({ page }) => {
    scenarioPrefix = `${PREFIX}${Date.now()}_`;
    const fixture = await createRetailFixture(scenarioPrefix, 1);
    const headers = await authHeaders(page);
    const sale = await createCompletedSale(page.request, headers, {
      code: `${scenarioPrefix}SALE_MAIN`,
      branchId: String(fixture.branch._id),
      customerId: String(fixture.customer._id),
      paymentMethodId: String(fixture.paymentMethods.cash._id),
      items: [{ productId: String(fixture.products[0]._id), amount: 10, value: fixture.products[0].price }],
    });

    const refundResponse = await createReturnExchange(page.request, headers, sale._id, {
      code: `${scenarioPrefix}REFUND_MAIN`,
      returnedItems: [{ productId: String(fixture.products[0]._id), amount: 3, value: fixture.products[0].price }],
      refundPayments: [{ methodId: String(fixture.paymentMethods.cash._id), amount: fixture.products[0].price * 3 }],
    });
    expect(refundResponse.status()).toBe(201);

    const reportResponse = await page.request.get(`${API_BASE}/reports/revenue-time?displayType=Theo%20ngay&fromDate=${todayIsoDate()}&toDate=${todayIsoDate()}&branchId=${fixture.branch._id}`, { headers });
    expect(reportResponse.ok()).toBeTruthy();
    const reportRows = await reportResponse.json();
    const revenue = reportRows.reduce((sum: number, row: any) => sum + Number(row.revenue || 0), 0);
    expect(revenue).toBe(700000);

    await page.addInitScript(() => {
      window.print = () => console.log('Mocked window.print()');
    });
    await page.goto('/reports/revenue/time');
    await page.waitForSelector('.revenue-time-container');

    await expect(page.getByRole('button', { name: /Lọc/i })).toBeEnabled();
    await expect(page.getByRole('button', { name: /Xuất dữ liệu/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /In báo cáo/i })).toBeVisible();

    const consolePromise = page.waitForEvent('console', (message) => message.text() === 'Mocked window.print()');
    await page.getByRole('button', { name: /In báo cáo/i }).click();
    await consolePromise;
  });
});
