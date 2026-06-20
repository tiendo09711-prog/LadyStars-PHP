import { expect, test } from '@playwright/test';
import { cleanupRetailFixtures, closeDB, createCompletedSale, createDraftRefund, createRetailFixture } from '../utils/db';

const PREFIX = 'E2E_RETAIL_INTEGRITY_REFUND_AUDIT_';
let scenarioPrefix = '';

async function authHeaders(page: any) {
  await page.goto('/');
  const token = await page.evaluate(() => localStorage.getItem('token'));
  return { Authorization: `Bearer ${token}` };
}

test.describe('Sales Channel Refund Hardcode Audit', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test.afterAll(async () => {
    if (scenarioPrefix) await cleanupRetailFixtures(scenarioPrefix);
    await closeDB();
  });

  test('loads refund list from the API and allows editing a real draft refund', async ({ page }) => {
    scenarioPrefix = `${PREFIX}${Date.now()}_`;
    const fixture = await createRetailFixture(scenarioPrefix, 1);
    const headers = await authHeaders(page);
    const sale = await createCompletedSale(page.request, headers, {
      code: `${scenarioPrefix}SALE_MAIN`,
      branchId: String(fixture.branch._id),
      customerId: String(fixture.customer._id),
      paymentMethodId: String(fixture.paymentMethods.cash._id),
      items: [{ productId: String(fixture.products[0]._id), amount: 2, value: fixture.products[0].price }],
    });

    const refundResponse = await createDraftRefund(page.request, headers, {
      code: `${scenarioPrefix}REFUND_DRAFT`,
      paymentId: sale._id,
      methodId: String(fixture.paymentMethods.cash._id),
      items: [{ productId: String(fixture.products[0]._id), amount: 1, value: fixture.products[0].price }],
    });
    expect(refundResponse.status()).toBe(201);

    let apiResponseData: any = null;
    page.on('response', async (response) => {
      if (response.url().includes('/api/products/refunds') && response.request().method() === 'GET') {
        try {
          const json = await response.json();
          apiResponseData = json.items || json;
        } catch {
          apiResponseData = null;
        }
      }
    });

    await page.goto('/sales-channels/store/refund');
    await page.waitForResponse((response) => response.url().includes('/api/products/refunds') && response.request().method() === 'GET');
    await expect(page.locator('.data-table tbody tr:not(.skeleton-row)').first()).toBeVisible();
    expect(Array.isArray(apiResponseData)).toBeTruthy();
    expect(apiResponseData[0].code).toContain(`${scenarioPrefix}REFUND_DRAFT`);

    let patchRequestStatus = 0;
    page.on('response', (response) => {
      if (response.request().method() === 'PATCH' && response.url().includes('/api/products/refunds/')) {
        patchRequestStatus = response.status();
      }
    });

    const firstRow = page.locator('.data-table tbody tr:not(.skeleton-row)').first();
    await firstRow.locator('button.icon-button').click();
    await page.click('button.dropdown-item:has-text("Sửa")');
    await expect(page.locator('.modal-card')).toBeVisible();
    await page.click('button.btn-primary:has-text("Lưu")');
    await page.waitForResponse((response) => response.request().method() === 'PATCH' && response.url().includes('/api/products/refunds/'));
    expect(patchRequestStatus).not.toBe(404);
  });
});
