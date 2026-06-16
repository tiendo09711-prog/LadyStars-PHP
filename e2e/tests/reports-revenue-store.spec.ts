import { test, expect } from '@playwright/test';
import { seedRevenueData, cleanupRevenueData } from '../utils/db';

test.describe('Revenue By Store Report', () => {
  const testCode = 'TEST_REV_STORE_' + Date.now();

  test.beforeAll(async () => {
    // Inject test data
    await seedRevenueData(testCode);
  });

  test.afterAll(async () => {
    // Clean up test data
    await cleanupRevenueData(testCode);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/reports/revenue/store');
    // Wait for data to load
    const fetchResponse = page.waitForResponse(response => 
      response.url().includes('/reports/revenue-store') && response.status() === 200
    );
    await fetchResponse;
  });

  test('Kiểm tra hiển thị dữ liệu và các bộ lọc', async ({ page }) => {
    // Xác minh dữ liệu seed (Sử dụng điểm 50.000) đã hiển thị
    // Chú ý: Backend đang nhóm theo branchId, nên ta có thể check số liệu
    // 50.000 điểm
    await expect(page.locator('td', { hasText: /50[\.\,\s]000/ }).first()).toBeVisible();

    // Tương tác bộ lọc hiển thị
    await page.locator('.custom-select-trigger').first().click();
    await page.locator('.custom-select-option', { hasText: 'Theo tháng' }).click();
    
    // Tương tác bộ lọc Kho hàng (thứ 2)
    // Tạm bỏ qua hoặc click tương tự:
    // await page.locator('.custom-select-trigger').nth(1).click();
    // await page.locator('.custom-select-option').nth(1).click();
    
    // Tương tác bộ lọc Kiểu (thứ 3)
    // await page.locator('.custom-select-trigger').nth(2).click();
    // await page.locator('.custom-select-option', { hasText: 'Tất cả' }).click();

    // Nhấn Lọc
    await page.getByRole('button', { name: 'Lọc' }).click();
    await page.waitForTimeout(1000);

    // Chuyển Tabs
    await page.locator('.tab-item', { hasText: 'Doanh thu' }).click();
    await page.locator('.tab-item', { hasText: 'Lợi nhuận' }).click();
  });

  test('Kiểm tra nút Xuất dữ liệu', async ({ page }) => {
    // Bắt sự kiện download
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Xuất dữ liệu' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('bao_cao_doanh_thu_kho');
  });

  test('Kiểm tra nút In báo cáo', async ({ page }) => {
    // Mock hàm window.print
    await page.evaluate(() => {
      window.print = function() {
        window['printed'] = true;
      };
    });
    await page.getByRole('button', { name: 'In báo cáo' }).click();
    const isPrinted = await page.evaluate(() => window['printed']);
    expect(isPrinted).toBeTruthy();
  });

  test('Kiểm tra nút Nhập chỉ tiêu', async ({ page }) => {
    await page.getByRole('button', { name: 'Nhập chỉ tiêu' }).click();
    
    // Kiểm tra Modal xuất hiện
    await expect(page.locator('.modal-content')).toBeVisible();
    await expect(page.locator('h3', { hasText: 'Nhập chỉ tiêu theo Kho' })).toBeVisible();

    // Nhập giá trị chỉ tiêu thử cho Kho hàng đầu tiên
    const firstInput = page.locator('.modal-body input[type="number"]').first();
    await firstInput.fill('10000000');

    // Nhấn Lưu
    // Cần phải bắt sự kiện alert vì trong code hiện tại đang dùng alert('Đã lưu chỉ tiêu thành công!');
    page.once('dialog', async dialog => {
      expect(dialog.message()).toBe('Đã lưu chỉ tiêu thành công!');
      await dialog.accept();
    });

    await page.getByRole('button', { name: 'Lưu chỉ tiêu' }).click();
    
    // Modal tự đóng
    await expect(page.locator('.modal-content')).not.toBeVisible();
  });

  test('Kiểm tra Tùy chỉnh hiển thị cột và Các Tab Doanh thu / Lợi nhuận', async ({ page }) => {
    // 1. Mở Modal tùy chỉnh hiển thị
    await page.locator('.layout-grid-btn').click();
    
    // Kiểm tra Modal hiển thị
    await expect(page.locator('.modal-content')).toBeVisible();
    await expect(page.locator('h3', { hasText: 'Tùy chỉnh hiển thị' })).toBeVisible();

    // Thử uncheck cột "Kho hàng"
    const branchCheckbox = page.locator('.col-item', { hasText: 'Kho hàng' }).locator('input[type="checkbox"]');
    await branchCheckbox.uncheck();
    
    // Lưu
    await page.getByRole('button', { name: 'Lưu' }).click();
    await expect(page.locator('.modal-content')).not.toBeVisible();

    // Kiểm tra cột "Kho hàng" đã biến mất (bảng chỉ còn cột "#" là th đầu tiên nhưng Kho hàng biến mất)
    await expect(page.locator('th', { hasText: 'Kho hàng' })).not.toBeVisible();

    // 2. Chuyển sang Tab Doanh thu
    await page.locator('.tab-item', { hasText: 'Doanh thu' }).click();
    
    // Bảng Pivot sẽ xuất hiện với cột Thời gian
    await expect(page.locator('th', { hasText: 'Thời gian' })).toBeVisible();

    // Kiểm tra có các Bar bên trong ô dữ liệu
    await expect(page.locator('.table-container td div').first()).toBeVisible();

    // 3. Chuyển sang Tab Lợi nhuận
    await page.locator('.tab-item', { hasText: 'Lợi nhuận' }).click();
    await expect(page.locator('th', { hasText: 'Thời gian' })).toBeVisible();
  });
});
