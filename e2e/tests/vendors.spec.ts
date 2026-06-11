import { test, expect } from '@playwright/test';
import { connectDB, closeDB } from '../utils/db';

const TEST_VENDOR_CODE = 'E2E_VENDOR_01';

test.describe('Vendors Page - Automation', () => {
  test.beforeAll(async () => {
    const db = await connectDB();
    await db.collection('vendors').deleteMany({ code: TEST_VENDOR_CODE });
  });

  test.afterAll(async () => {
    const db = await connectDB();
    await db.collection('vendors').deleteMany({ code: TEST_VENDOR_CODE });
    await closeDB();
  });

  test('Kiểm thử CRUD trang Nhà cung cấp', async ({ page }) => {
    // 1. Vào trang nhà cung cấp
    await page.goto('/vendors');
    await page.waitForLoadState('networkidle');

    // 2. Tạo mới nhà cung cấp
    await page.getByRole('button', { name: 'Thêm nhà cung cấp' }).click();
    const modal = page.locator('.modal-card');
    await expect(modal).toBeVisible();

    await modal.getByText('Mã NCC *').locator('..').locator('input').fill(TEST_VENDOR_CODE);
    await modal.getByText('Tên nhà cung cấp *').locator('..').locator('input').fill('Nhà cung cấp E2E Test');
    await modal.getByText('Số điện thoại').locator('..').locator('input').fill('0987654321');
    await modal.getByRole('button', { name: 'Lưu' }).click();

    // Đợi modal đóng
    await expect(modal).not.toBeVisible();

    // 3. Tìm kiếm nhà cung cấp vừa tạo
    const searchInput = page.getByPlaceholder('Mã, tên, số điện thoại...');
    await searchInput.fill(TEST_VENDOR_CODE);
    await searchInput.press('Enter');
    await page.waitForTimeout(1000);

    const row = page.locator('table.data-table tbody tr').filter({ hasText: TEST_VENDOR_CODE }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('Nhà cung cấp E2E Test');
    await expect(row).toContainText('0987654321');

    // 4. Sửa nhà cung cấp
    await row.getByRole('button', { name: 'Sửa' }).click();
    await expect(modal).toBeVisible();
    
    const nameInput = modal.getByText('Tên nhà cung cấp *').locator('..').locator('input');
    await nameInput.fill('Nhà cung cấp E2E Updated');
    await modal.getByRole('button', { name: 'Lưu' }).click();
    await expect(modal).not.toBeVisible();

    // Kiểm tra đã cập nhật
    await expect(row).toContainText('Nhà cung cấp E2E Updated');

    // 5. Xóa nhà cung cấp
    page.on('dialog', dialog => dialog.accept());
    await row.getByRole('button', { name: 'Xóa' }).click();
    
    // Kiểm tra không còn trong bảng
    await page.waitForTimeout(1000);
    await expect(row).not.toBeVisible();
  });
});
