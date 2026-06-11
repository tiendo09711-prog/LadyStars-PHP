import { test, expect } from '@playwright/test';
import { connectDB, closeDB } from '../utils/db';

const TEST_PRODUCT_CODE = 'E2E_MAIN_PROD_01';

test.describe('Products Main Page - Automation', () => {
  test.beforeAll(async () => {
    const db = await connectDB();
    await db.collection('products').deleteOne({ code: TEST_PRODUCT_CODE });
  });

  test.afterAll(async () => {
    const db = await connectDB();
    await db.collection('products').deleteOne({ code: TEST_PRODUCT_CODE });
    await closeDB();
  });

  test('Kiểm thử toàn diện trang danh sách Sản Phẩm', async ({ page }) => {
    test.setTimeout(60000); // 60s timeout

    // 1. Vào trang sản phẩm

    await page.goto('/products');
    await page.waitForLoadState('networkidle');

    // 3. Test Tạo mới sản phẩm
    await page.getByRole('button', { name: 'Thêm sản phẩm' }).click();
    await expect(page.getByRole('heading', { name: 'Thêm sản phẩm' })).toBeVisible();

    // Điền form
    await page.locator('.form-field').filter({ hasText: 'Mã sản phẩm *' }).locator('input').fill(TEST_PRODUCT_CODE);
    await page.locator('.form-field').filter({ hasText: 'Tên sản phẩm *' }).locator('input').fill('Sản phẩm Test E2E Main');
    
    // Chọn Loại sản phẩm
    await page.locator('.form-field').filter({ hasText: 'Loại sản phẩm' }).locator('select').selectOption('product');
    
    // Nhập giá
    await page.locator('.form-field').filter({ hasText: 'Giá vốn' }).locator('input').fill('150000');
    await page.locator('.form-field').filter({ hasText: 'Giá bán' }).locator('input').fill('350000');

    // Click Tạo sản phẩm
    await page.getByRole('button', { name: 'Tạo sản phẩm' }).click();
    
    // Chờ form đóng và tải lại
    await expect(page.getByRole('heading', { name: 'Thêm sản phẩm' })).not.toBeVisible();
    await page.waitForTimeout(1000);

    // 4. Tìm kiếm sản phẩm vừa tạo
    const searchInput = page.getByPlaceholder('Tên SP, mã, barcode...');
    await searchInput.fill(TEST_PRODUCT_CODE);
    await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
    await page.waitForTimeout(1000);

    // Xác minh sản phẩm hiển thị trong bảng
    const row = page.locator('table.data-table tbody tr').filter({ hasText: TEST_PRODUCT_CODE }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('Sản phẩm Test E2E Main');
    await expect(row).toContainText('350.000');

    // 5. Mở Xem Chi tiết
    await row.locator('button[title="Chi tiết"]').click();
    const modal = page.locator('.modal-card').first();
    await expect(page.getByRole('heading', { name: 'Chi tiết sản phẩm' })).toBeVisible();
    await expect(modal.getByText('Sản phẩm Test E2E Main', { exact: true }).first()).toBeVisible();
    await expect(modal.getByText('150.000 đ', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Đóng' }).click();
    await expect(page.getByRole('heading', { name: 'Chi tiết sản phẩm' })).not.toBeVisible();

    // 6. Test Cập nhật sản phẩm
    await row.locator('button[title="Sửa"]').click();
    await expect(page.getByRole('heading', { name: 'Sửa sản phẩm' })).toBeVisible();
    await page.locator('.form-field').filter({ hasText: 'Tên sản phẩm *' }).locator('input').fill('Sản phẩm Test E2E Update');
    await page.getByRole('button', { name: 'Cập nhật' }).click();
    await expect(page.getByRole('heading', { name: 'Sửa sản phẩm' })).not.toBeVisible();
    await page.waitForTimeout(1000);
    
    // Kiểm tra tên mới
    await expect(row).toContainText('Sản phẩm Test E2E Update');

    // 7. Test các chức năng nút trên thanh công cụ
    // Mở Import
    await page.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByRole('heading', { name: 'Nhập File (Import)' })).toBeVisible();
    await page.getByRole('button', { name: 'Đóng' }).click();
    
    // Mở Xuất Excel
    await page.getByRole('button', { name: 'Xuất Excel' }).click();
    await expect(page.getByRole('heading', { name: 'Xuất Excel - Danh sách sản phẩm' })).toBeVisible();
    await page.getByRole('button', { name: 'Đóng' }).click();

    // Test Bộ lọc trạng thái
    await page.getByRole('button', { name: 'Mới' }).first().click(); // Click Quick filter "Mới"
    await page.waitForTimeout(1000);
    await expect(row).toBeVisible(); // SP vừa tạo có status 'Mới' mặc định

    // 8. Xóa sản phẩm
    await row.locator('button[title="Xóa"]').click();
    const deleteModal = page.locator('.modal-card');
    await expect(deleteModal.getByRole('heading', { name: 'Xác nhận xóa' })).toBeVisible();
    await deleteModal.getByRole('button', { name: 'Xóa', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Xác nhận xóa' })).not.toBeVisible();
    await page.waitForTimeout(1000);

    // Kiểm tra đã biến mất khỏi bảng
    await expect(row).not.toBeVisible();
  });
});
