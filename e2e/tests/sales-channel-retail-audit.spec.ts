import { expect, test } from '@playwright/test';
import {
  API_BASE,
  cleanupRetailFixtures,
  closeDB,
  createCompletedSale,
  createRetailFixture,
  createReturnExchange,
} from '../utils/db';

const PREFIX = 'E2E_RETAIL_INTEGRITY_AUDIT_';
const scenarioPrefixes = new Set<string>();

async function authHeaders(page: any) {
  await page.goto('/');
  const token = await page.evaluate(() => localStorage.getItem('token'));
  return { Authorization: `Bearer ${token}` };
}

test.describe('Retail invoice ACT audit', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test.afterAll(async () => {
    for (const scenarioPrefix of scenarioPrefixes) {
      await cleanupRetailFixtures(scenarioPrefix);
    }
    await closeDB();
  });

  test('loads real invoices, filters on the server and opens complete invoice detail', async ({ page }) => {
    const scenarioPrefix = `${PREFIX}${Date.now()}_`;
    scenarioPrefixes.add(scenarioPrefix);
    const fixture = await createRetailFixture(scenarioPrefix, 1);
    const headers = await authHeaders(page);
    const sale = await createCompletedSale(page.request, headers, {
      code: `${scenarioPrefix}SALE_DETAIL`,
      branchId: String(fixture.branch._id),
      customerId: String(fixture.customer._id),
      paymentMethodId: String(fixture.paymentMethods.cash._id),
      items: [{ productId: String(fixture.products[0]._id), amount: 1, value: fixture.products[0].price }],
    });

    const listResponse = page.waitForResponse((response) => response.url().includes('/api/products/sales?') && response.status() === 200);
    await page.goto('/sales-channels/store/retail');
    await listResponse;

    await page.getByPlaceholder('Nhập mã hóa đơn').fill(sale.code);
    await page.getByRole('button', { name: /^Lọc$/ }).click();
    await page.waitForResponse((response) => response.url().includes(`invoiceCode=${sale.code}`) && response.status() === 200);
    await expect(page.locator('.retail-invoice-link').first()).toHaveText(sale.code);

    const detailResponse = page.waitForResponse((response) => /\/api\/products\/sales\/[a-f0-9]{24}$/i.test(new URL(response.url()).pathname) && response.status() === 200);
    await page.locator('.retail-invoice-link').first().click();
    await detailResponse;
    await expect(page.getByRole('dialog', { name: sale.code })).toBeVisible();
    await expect(page.locator('.retail-detail-table tbody tr').first()).toBeVisible();
    await page.getByRole('button', { name: 'Đóng' }).last().click();
  });

  test('keeps edit and refund actions aligned with the new capability rules', async ({ page }) => {
    const scenarioPrefix = `${PREFIX}${Date.now()}_RULES_`;
    scenarioPrefixes.add(scenarioPrefix);
    const fixture = await createRetailFixture(scenarioPrefix, 1);
    const headers = await authHeaders(page);
    const editableSale = await createCompletedSale(page.request, headers, {
      code: `${scenarioPrefix}SALE_EDITABLE`,
      branchId: String(fixture.branch._id),
      customerId: String(fixture.customer._id),
      paymentMethodId: String(fixture.paymentMethods.cash._id),
      items: [{ productId: String(fixture.products[0]._id), amount: 2, value: fixture.products[0].price }],
    });
    const refundableSale = await createCompletedSale(page.request, headers, {
      code: `${scenarioPrefix}SALE_REFUNDABLE`,
      branchId: String(fixture.branch._id),
      customerId: String(fixture.customer._id),
      paymentMethodId: String(fixture.paymentMethods.cash._id),
      items: [{ productId: String(fixture.products[0]._id), amount: 3, value: fixture.products[0].price }],
    });
    const partialRefund = await createReturnExchange(page.request, headers, refundableSale._id, {
      code: `${scenarioPrefix}REFUND_PARTIAL`,
      returnedItems: [{ productId: String(fixture.products[0]._id), amount: 1, value: fixture.products[0].price }],
      refundPayments: [{ methodId: String(fixture.paymentMethods.cash._id), amount: fixture.products[0].price }],
    });
    expect(partialRefund.status()).toBe(201);

    await page.goto('/sales-channels/store/retail');
    await page.waitForResponse((response) => response.url().includes('/api/products/sales?') && response.status() === 200);

    await page.getByPlaceholder('Nhập mã hóa đơn').fill(editableSale.code);
    await page.getByRole('button', { name: /^Lọc$/ }).click();
    await page.waitForResponse((response) => response.url().includes(`invoiceCode=${editableSale.code}`) && response.status() === 200);
    await page.locator('.retail-row-menu button').first().click();
    await expect(page.getByRole('button', { name: 'Sửa đơn hàng' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Đổi trả hàng' })).toBeEnabled();

    await page.getByPlaceholder('Nhập mã hóa đơn').fill(refundableSale.code);
    await page.getByRole('button', { name: /^Lọc$/ }).click();
    await page.waitForResponse((response) => response.url().includes(`invoiceCode=${refundableSale.code}`) && response.status() === 200);
    await page.locator('.retail-row-menu button').first().click();
    await expect(page.getByRole('button', { name: 'Sửa đơn hàng' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Đổi trả hàng' })).toBeEnabled();

    const detailApi = await page.request.get(`${API_BASE}/products/sales/${refundableSale._id}`, { headers });
    expect(detailApi.ok()).toBeTruthy();
    const detailPayload = await detailApi.json();
    expect(detailPayload.refundStatus).toBe('partial');
  });
});
