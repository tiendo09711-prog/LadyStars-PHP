import { expect, test } from '@playwright/test';
import { cleanupRetailFixtures, closeDB, createCompletedSale, createRetailFixture } from '../utils/db';

const API = 'http://localhost:4000/api';
const PREFIX = 'E2E_RETAIL_INTEGRITY_ACTIONS_';
let scenarioPrefix = '';

async function authHeaders(page: any) {
  await page.goto('/');
  const token = await page.evaluate(() => localStorage.getItem('token'));
  return { Authorization: `Bearer ${token}` };
}

test.describe('Retail invoice actions', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test.afterAll(async () => {
    if (scenarioPrefix) await cleanupRetailFixtures(scenarioPrefix);
    await closeDB();
  });

  test('shows six row actions in the required order and prints clean 80mm receipt HTML', async ({ page }) => {
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

    await page.goto('/sales-channels/store/retail');
    await page.waitForResponse((response) => response.url().includes('/api/products/sales?') && response.status() === 200);

    const response = await page.request.get(`${API}/products/sales?page=1&limit=20&channel=store&invoiceCode=${sale.code}`, { headers });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.items?.length).toBeGreaterThan(0);

    await page.getByPlaceholder('Nhập mã hóa đơn').fill(sale.code);
    await page.getByRole('button', { name: /^Lọc$/ }).click();
    await page.waitForResponse((networkResponse) => networkResponse.url().includes(`invoiceCode=${sale.code}`) && networkResponse.status() === 200);

    await page.locator('.retail-row-menu button').first().click();
    const actionLabels = (await page.locator('.retail-menu button').allTextContents()).map((label) => label.replace(/\s+/g, ' ').trim());
    expect(actionLabels).toEqual([
      'Xem chi tiết',
      'In hóa đơn',
      'In hóa đơn quà tặng',
      'Đổi trả hàng',
      'Sửa đơn hàng',
      'Xóa hóa đơn',
    ]);

    await page.evaluate(() => {
      (window as any).__printHtml = '';
      window.open = () => {
        let html = '';
        return {
          document: {
            open() {
              html = '';
            },
            write(chunk: string) {
              html += String(chunk || '');
            },
            close() {
              (window as any).__printHtml = html;
            },
          },
          focus() {},
          print() {},
          close() {},
        } as any;
      };
    });

    await page.getByRole('button', { name: 'In hóa đơn', exact: true }).click();
    await expect.poll(async () => page.evaluate(() => (window as any).__printHtml || '')).toContain('@page { size: 80mm auto; margin: 0; }');
    const printHtml = await page.evaluate(() => (window as any).__printHtml || '');
    expect(printHtml).toContain('@page { size: 80mm auto; margin: 0; }');
    expect(printHtml).toContain('<main class="print-page">');
    expect(printHtml).toContain('<table class="items">');
    expect(printHtml).toContain('Hóa đơn bán lẻ');
    expect(printHtml).toContain(sale.code);
    expect(printHtml).toContain('Cảm ơn quý khách đã mua hàng!');

    await page.locator('.retail-row-menu button').first().click();
    await expect(page.getByRole('button', { name: 'In hóa đơn quà tặng', exact: true })).toBeDisabled();
  });
});
