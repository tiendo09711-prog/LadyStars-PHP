import { test, expect } from '@playwright/test';

test.describe('Removed Vendor and Store Find features', () => {
  test('old routes redirect safely and dead menu links are gone', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/vendors');
    await expect(page).toHaveURL(/\/products$/);
    await expect(page.getByRole('heading', { name: 'Danh sách sản phẩm' })).toBeVisible();

    await page.goto('/sales-channels/store/find');
    await expect(page).toHaveURL(/\/sales-channels\/store$/);
    await expect(page.locator('a[href="/vendors"]')).toHaveCount(0);
    await expect(page.locator('a[href="/sales-channels/store/find"]')).toHaveCount(0);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('old Vendor CRUD API returns 404 while shared sales API remains available', async ({ page }) => {
    await page.goto('/products');
    const token = await page.evaluate(() => localStorage.getItem('token'));
    const headers = { Authorization: `Bearer ${token}` };

    const retiredResponses = await Promise.all([
      page.request.get('http://localhost:4000/api/vendors/vendors', { headers }),
      page.request.post('http://localhost:4000/api/vendors/vendors', {
        headers,
        data: { code: 'REMOVED_VENDOR_API', name: 'Removed Vendor API' },
      }),
      page.request.patch('http://localhost:4000/api/vendors/vendors/000000000000000000000000', {
        headers,
        data: { name: 'Removed Vendor API' },
      }),
      page.request.delete('http://localhost:4000/api/vendors/vendors/000000000000000000000000', { headers }),
      page.request.get('http://localhost:4000/api/vendors/groups', { headers }),
      page.request.get('http://localhost:4000/api/vendors/purchases', { headers }),
      page.request.get('http://localhost:4000/api/vendors/refunds', { headers }),
      page.request.get('http://localhost:4000/api/vendors/transfers', { headers }),
    ]);
    const salesResponse = await page.request.get('http://localhost:4000/api/products/sales?limit=1', { headers });

    for (const response of retiredResponses) expect(response.status()).toBe(404);
    expect(salesResponse.status()).toBe(200);
  });

  test('remaining product, inventory, warehouse and sales-channel routes still render', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    for (const route of [
      '/products',
      '/products/inventory',
      '/warehouse/transactions',
      '/warehouse/transactions/vouchers/import',
      '/warehouse/transactions/vouchers/export',
      '/sales-channels/store/retail',
    ]) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('main.content')).not.toBeEmpty();
    }

    expect(pageErrors).toEqual([]);
  });
});
