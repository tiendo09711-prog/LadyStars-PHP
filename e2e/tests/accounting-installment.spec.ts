import { test, expect } from '@playwright/test';

test.describe('Accounting Installment & History', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/accounting/installment');
    // Wait for the main page layout to be stable
    await page.waitForSelector('.installment-page');
  });

  test('Cài đặt Lãi suất và Thêm hợp đồng', async ({ page }) => {
    // 1. Cài đặt lãi suất
    await page.click('button:has-text("Cài đặt Lãi suất")');
    await expect(page.locator('text=Cài đặt Lãi suất Trả góp')).toBeVisible();
    
    // Tìm input cho Lãi suất mặc định
    const interestInput = page.locator('input[type="number"]').first();
    await interestInput.fill('2.5');
    
    // Chờ thông báo alert
    page.once('dialog', dialog => dialog.accept());
    // Lưu cài đặt
    await page.click('button:has-text("Lưu cài đặt")');
    await expect(page.locator('text=Cài đặt Lãi suất Trả góp')).toBeHidden();

    // 2. Thêm hợp đồng mới
    await page.click('button:has-text("Thêm dịch vụ trả góp")');
    await expect(page.locator('text=Thêm Hợp Đồng Trả Góp')).toBeVisible();
    
    // Tìm các input bằng cấu trúc: label liền trước hoặc label nằm trong cùng 1 div
    await page.locator('label:has-text("Tên Khách Hàng") + input').fill('Nguyễn Văn Trả Góp');
    await page.locator('label:has-text("Mã Khách Hàng") + input').fill('KH_TRAGOP_123');
    await page.locator('label:has-text("Số điện thoại") + input').fill('0987654321');
    await page.locator('label:has-text("Tổng tiền hợp đồng") + input').fill('20000000');
    await page.locator('label:has-text("Đã trả trước") + input').fill('5000000');
    await page.locator('label:has-text("Số tháng trả góp") + input').fill('6');
    
    // Submit
    await page.click('button:has-text("Lưu hợp đồng")');
    
    // Chờ cập nhật
    await page.waitForResponse(response => response.url().includes('/accounting/installment-services') && response.request().method() === 'GET');
    
    // Xác minh
    await expect(page.locator('td', { hasText: 'Nguyễn Văn Trả Góp' }).first()).toBeVisible();
    await expect(page.locator('td', { hasText: '20.000.000' }).first()).toBeVisible();
  });

  test('Thêm phiếu thu trả góp', async ({ page }) => {
    await page.goto('/accounting/installment-collection');
    
    await page.click('button:has-text("Thêm mới")');
    await expect(page.locator('text=Thêm phiếu thu trả góp')).toBeVisible();
    
    await page.locator('label:has-text("Mã hợp đồng (*)") + input').fill('HD_TEST_123');
    await page.locator('label:has-text("Số tiền (*)") + input').fill('3000000');
    await page.locator('label:has-text("Ghi chú") + textarea').fill('Đóng tiền tháng 1');
    
    page.on('dialog', dialog => dialog.accept());
    await page.click('button:has-text("Lưu phiếu thu")');
    
    await page.waitForResponse(response => response.url().includes('/accounting/installment-collections') && response.request().method() === 'GET');
    
    await expect(page.locator('td', { hasText: 'HD_TEST_123' }).first()).toBeVisible();
    await expect(page.locator('td', { hasText: '3.000.000' }).first()).toBeVisible();
  });
});
