import { test, expect } from '@playwright/test';

test.describe('Products Main Page - Automation', () => {
  test('Kiểm thử toàn diện trang sản phẩm và tab lịch sử', async ({ page }) => {
    test.setTimeout(90000);

    const testProductCode = `E2E_MAIN_${Date.now()}`;

    await page.goto('/products');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1', { hasText: 'Sản phẩm' })).toBeVisible();

    await page.getByRole('button', { name: 'Thêm mới', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Thêm sản phẩm' })).toBeVisible();

    await page.locator('.form-field').filter({ hasText: 'Mã sản phẩm *' }).locator('input').fill(testProductCode);
    await page.locator('.form-field').filter({ hasText: 'Tên sản phẩm *' }).locator('input').fill('Sản phẩm Test E2E Main');
    await page.locator('.form-field').filter({ hasText: 'Loại sản phẩm' }).locator('select').selectOption('product');
    await page.locator('.form-field').filter({ hasText: 'Giá vốn' }).locator('input').fill('150000');
    await page.locator('.form-field').filter({ hasText: 'Giá bán' }).locator('input').fill('350000');

    await page.getByRole('button', { name: 'Tạo sản phẩm' }).click();
    await expect(page.getByRole('heading', { name: 'Thêm sản phẩm' })).not.toBeVisible();

    const listSearch = page.getByPlaceholder('Tìm theo tên, mã hoặc barcode...');
    await listSearch.fill(testProductCode);
    await page.getByRole('button', { name: 'Lọc', exact: true }).first().click();

    const row = page.locator('table.data-table tbody tr').filter({ hasText: testProductCode }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('Sản phẩm Test E2E Main');
    await expect(row).toContainText('350.000');

    await row.getByRole('button', { name: 'Chi tiết' }).click();
    const detailModal = page.locator('.modal-card').first();
    await expect(page.getByRole('heading', { name: 'Chi tiết sản phẩm' })).toBeVisible();
    await expect(detailModal.getByText('Sản phẩm Test E2E Main', { exact: true }).first()).toBeVisible();
    await expect(detailModal.getByText('150.000 đ', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Đóng' }).click();
    await expect(page.getByRole('heading', { name: 'Chi tiết sản phẩm' })).not.toBeVisible();

    await row.getByRole('button', { name: 'Sửa' }).click();
    await expect(page.getByRole('heading', { name: 'Sửa sản phẩm' })).toBeVisible();
    await page.locator('.form-field').filter({ hasText: 'Tên sản phẩm *' }).locator('input').fill('Sản phẩm Test E2E Update');
    await page.getByRole('button', { name: 'Cập nhật' }).click();
    await expect(page.getByRole('heading', { name: 'Sửa sản phẩm' })).not.toBeVisible();
    await expect(row).toContainText('Sản phẩm Test E2E Update');

    await page.getByRole('button', { name: 'Mở menu thêm mới' }).click();
    await page.getByRole('button', { name: 'Nhập từ file' }).click();
    await expect(page.getByRole('heading', { name: 'Nhập dữ liệu sản phẩm' })).toBeVisible();
    await page.getByRole('button', { name: 'Hủy' }).click();
    await expect(page.getByRole('heading', { name: 'Nhập dữ liệu sản phẩm' })).not.toBeVisible();

    await page.getByRole('button', { name: 'Thao tác' }).click();
    await page.getByRole('button', { name: 'Xuất dữ liệu' }).click();
    await expect(page.getByRole('heading', { name: 'Xuất Excel - Danh sách sản phẩm' })).toBeVisible();
    await page.getByRole('button', { name: 'Đóng' }).click();
    await expect(page.getByRole('heading', { name: 'Xuất Excel - Danh sách sản phẩm' })).not.toBeVisible();

    await page.getByRole('button', { name: 'Lịch sử' }).click();
    await expect(page.locator('h1', { hasText: 'Lịch sử sửa/xóa' })).toBeVisible();

    const historySearch = page.getByPlaceholder('Mã hoặc tên sản phẩm...');
    await historySearch.fill(testProductCode);
    await page.getByRole('button', { name: 'Lọc', exact: true }).first().click();

    const historyRow = page.locator('table.data-table tbody tr').filter({ hasText: testProductCode }).first();
    await expect(historyRow).toBeVisible({ timeout: 15000 });
    await expect(historyRow).toContainText('Sửa sản phẩm');

    await page.getByRole('button', { name: 'Xuất Excel' }).click();
    await expect(page.getByRole('heading', { name: 'Xuất Excel - Lịch sử sửa xóa' })).toBeVisible();
    await page.getByRole('button', { name: 'Đóng' }).click();

    await page.locator('button[role="tab"][aria-controls="products-panel-products"]').click();
    await expect(page.getByRole('heading', { name: 'Danh sách sản phẩm' })).toBeVisible();

    await listSearch.fill(testProductCode);
    await page.getByRole('button', { name: 'Lọc', exact: true }).first().click();
    const rowAfterReturn = page.locator('table.data-table tbody tr').filter({ hasText: testProductCode }).first();
    await expect(rowAfterReturn).toBeVisible();

    await rowAfterReturn.getByRole('button', { name: 'Xóa' }).click();
    const deleteModal = page.locator('.modal-card').filter({ hasText: 'Xác nhận xóa' });
    await expect(deleteModal.getByRole('heading', { name: 'Xác nhận xóa' })).toBeVisible();
    await deleteModal.getByRole('button', { name: 'Xóa', exact: true }).click();
    await expect(deleteModal).not.toBeVisible();

    await listSearch.fill(testProductCode);
    await page.getByRole('button', { name: 'Lọc', exact: true }).first().click();
    await expect(page.locator('table.data-table tbody tr').filter({ hasText: testProductCode })).toHaveCount(0);
  });
});
