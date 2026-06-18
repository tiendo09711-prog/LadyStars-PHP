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
    await page.getByRole('button', { name: 'Mở lựa chọn thêm mới' }).click();
    await page.getByRole('button', { name: 'Thêm nhà cung cấp' }).click();
    const modal = page.locator('.supplier-modal');
    await expect(modal).toBeVisible();

    await modal.getByText('Mã NCC *').locator('..').locator('input').fill(TEST_VENDOR_CODE);
    await modal.getByText('Tên nhà cung cấp *').locator('..').locator('input').fill('Nhà cung cấp E2E Test');
    await modal.getByText('Số điện thoại').locator('..').locator('input').fill('0987654321');
    await modal.getByRole('button', { name: 'Lưu' }).click();

    // Đợi modal đóng
    await expect(modal).not.toBeVisible();

    // 3. Tìm kiếm nhà cung cấp vừa tạo
    const searchInput = page.getByPlaceholder('ID hoặc từ khóa');
    await searchInput.fill(TEST_VENDOR_CODE);
    await page.getByRole('button', { name: 'Lọc' }).click();
    await page.waitForTimeout(1000);

    const row = page.locator('table.supplier-table tbody tr').filter({ hasText: TEST_VENDOR_CODE }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('Nhà cung cấp E2E Test');
    await expect(row).toContainText('0987654321');

    // 4. Sửa nhà cung cấp
    await row.getByRole('button', { name: 'Mở thao tác' }).click();
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
    await row.getByRole('button', { name: 'Mở thao tác' }).click();
    await row.getByRole('button', { name: 'Xóa' }).click();
    
    // Kiểm tra không còn trong bảng
    await page.waitForTimeout(1000);
    await expect(row).not.toBeVisible();
  });

  test('Kiểm tra tab sản phẩm, dropdown, checkbox, modal và console', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.goto('/vendors');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: 'Nhà cung cấp', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sản phẩm nhà cung cấp', exact: true }).click();
    await expect(page.getByRole('columnheader', { name: 'Mã SP' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Tên SP' })).toBeVisible();

    await page.getByRole('button', { name: /Thao tác/ }).click();
    await expect(page.getByRole('button', { name: 'Xuất dữ liệu' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Xóa các dòng đã chọn' })).toBeVisible();
    await page.getByRole('button', { name: 'Xuất dữ liệu' }).click();
    await expect(page.getByRole('dialog', { name: 'Xuất dữ liệu' })).toBeVisible();
    await expect(page.getByText('Xuất tất cả trang theo bộ lọc hiện tại')).toBeVisible();
    await page.getByLabel('Đóng').click();

    await page.getByRole('button', { name: 'Mở lựa chọn thêm mới' }).click();
    await page.getByRole('button', { name: 'Thêm Excel' }).click();
    await expect(page.getByRole('dialog', { name: 'Import sản phẩm nhà cung cấp' })).toBeVisible();
    await page.getByLabel('Đóng').click();

    await page.getByRole('button', { name: 'Thêm mới', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Thêm mới 1 sản phẩm' })).toBeVisible();
    await page.getByLabel('Đóng').click();

    const firstDataRow = page.locator('table.supplier-table tbody tr').first();
    await expect(firstDataRow).toBeVisible();
    await firstDataRow.locator('input[type="checkbox"]').check();
    await expect(firstDataRow.locator('input[type="checkbox"]')).toBeChecked();
    await firstDataRow.getByRole('button', { name: 'Mở thao tác' }).click();
    await expect(firstDataRow.getByRole('button', { name: 'Sửa' })).toBeVisible();
    await expect(firstDataRow.getByRole('button', { name: 'Xóa' })).toBeVisible();

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
