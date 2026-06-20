import { expect, test } from '@playwright/test';

const API = 'http://localhost:4000/api';

async function authHeaders(page: any) {
  const token = await page.evaluate(() => localStorage.getItem('token'));
  return { Authorization: `Bearer ${token}` };
}

test.describe('Retail invoice actions', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test('shows six row actions in the required order and prints clean A4 HTML', async ({ page }) => {
    await page.goto('/sales-channels/store/retail');
    await page.waitForResponse((response) => response.url().includes('/api/products/sales?') && response.status() === 200);

    const headers = await authHeaders(page);
    const response = await page.request.get(`${API}/products/sales?page=1&limit=20&channel=store`, { headers });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    const invoices = Array.isArray(data.items) ? data.items : [];
    test.skip(invoices.length === 0, 'No retail invoices available for action verification');

    const firstInvoice = invoices[0];
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
    await expect.poll(async () => page.evaluate(() => (window as any).__printHtml || '')).toContain('@page { size: A4 portrait; margin: 10mm; }');
    const printHtml = await page.evaluate(() => (window as any).__printHtml || '');
    expect(printHtml).toContain('@page { size: A4 portrait; margin: 10mm; }');
    expect(printHtml).toContain('<main class="print-page">');
    expect(printHtml).toContain('<table class="items">');
    expect(printHtml).toContain('Hóa đơn bán lẻ');
    expect(printHtml).toContain(firstInvoice.code);
    expect(printHtml).toContain('Cảm ơn quý khách đã mua hàng!');

    const giftButton = page.getByRole('button', { name: 'In hóa đơn quà tặng', exact: true });
    if (!(await giftButton.isVisible().catch(() => false))) {
      await page.locator('.retail-row-menu button').first().click();
    }
    if (firstInvoice.hasGiftItems === true) {
      await expect(giftButton).toBeEnabled();
    } else {
      await expect(giftButton).toBeDisabled();
    }
  });
});
