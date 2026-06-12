import { test, expect } from '@playwright/test';
import { seedRevenueData, cleanupRevenueData } from '../utils/db';

test.describe('Revenue By Time Report', () => {
  const TEST_CODE = 'REV_TEST_123';

  test.beforeAll(async () => {
    // Clean up just in case
    await cleanupRevenueData(TEST_CODE);
    // Seed real data to ensure the table has data
    await seedRevenueData(TEST_CODE);
  });

  test.afterAll(async () => {
    // Clean up
    await cleanupRevenueData(TEST_CODE);
  });

  test.beforeEach(async ({ page }) => {
    // Override window.print so it doesn't block the test
    await page.addInitScript(() => {
      window.print = () => console.log('Mocked window.print()');
    });

    await page.goto('/reports/revenue/time');
    await page.waitForSelector('.revenue-time-container');
  });

  test('Kiểm tra hiển thị dữ liệu và các bộ lọc', async ({ page }) => {
    // Debug table text
    const tableText = await page.locator('.revenue-table').innerText();
    console.log('Table content:', tableText);

    // Xác minh dữ liệu seed (Giá vốn 600.000, Chiết khấu 50.000) đã hiển thị (do cộng gộp theo ngày)
    await expect(page.locator('td', { hasText: /600[\.\,\s]000/ }).first()).toBeVisible();
    await expect(page.locator('td', { hasText: /50[\.\,\s]000/ }).first()).toBeVisible();

    // Tương tác bộ lọc hiển thị
    await page.selectOption('select', { hasText: 'Theo ngày' }, 'Theo tháng');
    
    // Tương tác DateRangePicker (vì là component tùy chỉnh, ta có thể nhập text trực tiếp nếu cấu trúc cho phép, hoặc chỉ click nút Lọc)
    // Click nút Lọc
    const fetchResponse = page.waitForResponse(response => response.url().includes('/reports/revenue-time') && response.request().method() === 'GET');
    await page.click('button:has-text("Lọc")');
    await fetchResponse;

    // Dữ liệu vẫn phải tồn tại (vì "Theo tháng" sẽ gom nhóm lại nhưng tổng vẫn thế)
    await expect(page.locator('td', { hasText: /600[\.\,\s]000/ }).first()).toBeVisible();
  });

  test('Kiểm tra nút Xuất dữ liệu', async ({ page }) => {
    // Bắt event download
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Xuất dữ liệu")');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('bao_cao_doanh_thu');
  });

  test('Kiểm tra nút In báo cáo', async ({ page }) => {
    // Lắng nghe console log từ mock window.print
    const consolePromise = page.waitForEvent('console', msg => msg.text() === 'Mocked window.print()');
    await page.click('button:has-text("In báo cáo")');
    await consolePromise;
    // Nếu bắt được console.log nghĩa là nút in đã gọi đúng hàm
  });

  test('Kiểm tra nút Đổi giao diện bảng', async ({ page }) => {
    // Bắt alert
    page.on('dialog', dialog => {
      expect(dialog.message()).toContain('đang được phát triển');
      dialog.accept();
    });
    // Click button LayoutGrid (icon button, we can find by class or svg)
    // It's the 3rd button in actions-bar
    await page.locator('.actions-bar button').nth(2).click();
  });
});
