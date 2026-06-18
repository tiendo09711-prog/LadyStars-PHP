import { expect, test } from '@playwright/test';

test.describe('Products bulk toolbar and barcode print', () => {
  test('opens bulk actions only after selecting a product row', async ({ page }) => {
    await page.goto('/products');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Danh sách sản phẩm' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Thêm mới', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Thao tác' })).toBeVisible();

    await page.getByRole('button', { name: 'Thao tác' }).click();
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('tích chọn');
      await dialog.accept();
    });
    await page.getByRole('button', { name: 'In mã vạch' }).click();

    const firstRow = page.locator('table.products-data-table tbody tr').filter({ has: page.locator('input[type="checkbox"]') }).first();
    const rowCount = await firstRow.count();
    test.skip(rowCount === 0, 'No product row is available for barcode smoke test.');

    await firstRow.locator('input[type="checkbox"]').check();
    await expect(page.getByText(/Đã chọn 1/)).toBeVisible();

    await page.getByRole('button', { name: 'In mã vạch' }).click();
    await expect(page.getByRole('heading', { name: 'In mã vạch sản phẩm' })).toBeVisible();
    await expect(page.getByText('Cấu hình in tem')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Xem và in khổ đang chọn' })).toBeVisible();
  });
});
