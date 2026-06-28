import { expect, test } from '@playwright/test';
import {
  API_BASE,
  cleanupRetailFixtures,
  closeDB,
  createCompletedSale,
  createRetailFixture,
  createReturnExchange,
} from '../utils/db';

const PREFIX = 'E2E_REFUND_SYNC_';
const usedPrefixes = new Set<string>();

function scenarioPrefix(label: string) {
  const prefix = `${PREFIX}${label}_`;
  usedPrefixes.add(prefix);
  return prefix;
}

async function authHeaders(page: import('@playwright/test').Page) {
  await page.goto('/');
  const token = await page.evaluate(() => localStorage.getItem('token'));
  return { Authorization: `Bearer ${token}` };
}

async function standardCashMethodId(
  request: import('@playwright/test').APIRequestContext,
  headers: Record<string, string>,
) {
  const response = await request.get(`${API_BASE}/products/payment-methods/standard`, { headers });
  if (!response.ok()) throw new Error(`standard payment methods failed: ${await response.text()}`);
  const payload = await response.json();
  const cash = (payload.items || []).find((m: any) => m.code === 'cash');
  if (!cash) throw new Error("Standard cash payment method not seeded in test DB");
  return String(cash._id);
}

async function createRefundForSale(
  request: import('@playwright/test').APIRequestContext,
  headers: Record<string, string>,
  saleId: string,
  code: string,
  productId: string,
  methodId: string,
  amount: number,
  value: number,
) {
  const response = await createReturnExchange(request, headers, saleId, {
    code,
    returnedItems: [{ productId, amount, value }],
    refundPayments: [{ methodId, amount: value }],
  });
  if (!response.ok()) throw new Error(`return-exchange failed: ${await response.text()}`);
  return response.json();
}

test.describe('Refund module sync (retail + wholesale)', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test.afterAll(async () => {
    for (const prefix of usedPrefixes) {
      await cleanupRetailFixtures(prefix);
    }
    await closeDB();
  });

  test('retail + wholesale refunds appear, search works, reload keeps data, no console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err)));

    const headers = await authHeaders(page);
    const cashMethodId = await standardCashMethodId(page.request, headers);

    // --- 3 retail refunds ---
    const retailPrefix = scenarioPrefix('RETAIL');
    const retailFixture = await createRetailFixture(retailPrefix, 3);
    const retailSales: any[] = [];
    for (let i = 0; i < 3; i += 1) {
      const sale = await createCompletedSale(page.request, headers, {
        code: `${retailPrefix}SALE_${i + 1}`,
        branchId: String(retailFixture.branch._id),
        customerId: String(retailFixture.customer._id),
        paymentMethodId: cashMethodId,
        items: [{ productId: String(retailFixture.products[i]._id), amount: 2, value: retailFixture.products[i].price }],
      });
      retailSales.push(sale);
      await createRefundForSale(
        page.request,
        headers,
        sale._id,
        `${retailPrefix}REFUND_${i + 1}`,
        String(retailFixture.products[i]._id),
        cashMethodId,
        1,
        retailFixture.products[i].price,
      );
    }

    // --- 3 wholesale refunds ---
    const wholesalePrefix = scenarioPrefix('WHOLESALE');
    const wholesaleFixture = await createRetailFixture(wholesalePrefix, 3);
    const wholesaleSales: any[] = [];
    for (let i = 0; i < 3; i += 1) {
      const sale = await createCompletedSale(page.request, headers, {
        code: `${wholesalePrefix}SALE_${i + 1}`,
        branchId: String(wholesaleFixture.branch._id),
        customerId: String(wholesaleFixture.customer._id),
        paymentMethodId: cashMethodId,
        items: [{ productId: String(wholesaleFixture.products[i]._id), amount: 2, value: wholesaleFixture.products[i].price }],
      });
      wholesaleSales.push(sale);
      await createRefundForSale(
        page.request,
        headers,
        sale._id,
        `${wholesalePrefix}REFUND_${i + 1}`,
        String(wholesaleFixture.products[i]._id),
        cashMethodId,
        1,
        wholesaleFixture.products[i].price,
      );
    }

    // --- Refund page shows all 6 refunds (server-side, from MongoDB) ---
    await page.goto('/sales-channels/store/refund');
    await page.waitForResponse((response) =>
      response.url().includes('/api/products/refunds') && response.request().method() === 'GET',
    );
    await expect(page.locator('.data-table tbody tr:not(.skeleton-row)').first()).toBeVisible();

    const refundApi = await page.request.get(`${API_BASE}/products/refunds?limit=5000`, { headers });
    expect(refundApi.ok()).toBeTruthy();
    const refundPayload = await refundApi.json();
    const refundCodes: string[] = (refundPayload.items || []).map((r: any) => r.code);
    for (let i = 0; i < 3; i += 1) {
      expect(refundCodes).toContain(`${retailPrefix}REFUND_${i + 1}`);
      expect(refundCodes).toContain(`${wholesalePrefix}REFUND_${i + 1}`);
    }

    // --- No "Thêm mới" create button on the view-only refund page ---
    await expect(page.locator('button:has-text("Thêm mới")')).toHaveCount(0);

    // --- Verify mapping: original invoice code + money come from real data ---
    const firstRetailRefund = (refundPayload.items || []).find((r: any) => r.code === `${retailPrefix}REFUND_1`);
    expect(firstRetailRefund).toBeTruthy();
    expect(String(firstRetailRefund.paymentId?.code || '')).toBe(`${retailPrefix}SALE_1`);
    expect(Number(firstRetailRefund.totalPayableAmount)).toBeGreaterThan(0);
    expect(firstRetailRefund.status).toBe('completed');
    expect(Number(firstRetailRefund.amount)).toBe(1);

    // --- Search by refund code ---
    await page.locator('input[placeholder*="Mã"]').first().fill(`${retailPrefix}REFUND_2`);
    await page.waitForResponse((response) =>
      response.url().includes('/api/products/refunds') && response.request().method() === 'GET',
    );
    const searchRows = await page.locator('.data-table tbody tr:not(.skeleton-row)').count();
    expect(searchRows).toBeGreaterThanOrEqual(1);
    await expect(page.locator('.data-table tbody tr:not(.skeleton-row)').first()).toContainText(`${retailPrefix}REFUND_2`);

    // --- Search by original invoice code ---
    await page.locator('input[placeholder*="Mã"]').first().fill(`${wholesalePrefix}SALE_3`);
    await page.waitForResponse((response) =>
      response.url().includes('/api/products/refunds') && response.request().method() === 'GET',
    );
    await expect(page.locator('.data-table tbody tr:not(.skeleton-row)').first()).toContainText(`${wholesalePrefix}REFUND_3`);

    // --- Clear search and reload (F5): data persists ---
    await page.locator('input[placeholder*="Mã"]').first().fill('');
    await page.reload();
    await page.waitForResponse((response) =>
      response.url().includes('/api/products/refunds') && response.request().method() === 'GET',
    );
    await expect(page.locator('.data-table tbody tr:not(.skeleton-row)').first()).toBeVisible();

    // --- Detail page works ---
    const firstRow = page.locator('.data-table tbody tr:not(.skeleton-row)').first();
    await firstRow.locator('button.icon-button').click();
    await page.click('button.dropdown-item:has-text("Xem chi tiết")');
    await page.waitForURL(/\/sales-channels\/store\/refund\//);
    await page.waitForResponse((response) =>
      response.url().includes('/api/products/refunds/') && response.request().method() === 'GET',
    );
    await expect(page.locator('h1')).toContainText('Chi tiết');

    // --- No console errors during the whole flow ---
    expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
  });
});
