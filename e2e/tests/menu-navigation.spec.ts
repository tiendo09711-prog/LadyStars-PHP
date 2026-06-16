import { test, expect } from '@playwright/test';
import { connectDB, closeDB } from '../utils/db';

test.describe('Menu Navigation Test', () => {
  test.beforeAll(async () => {
    const db = await connectDB();
    // Tạo user giả nếu cần, ở đây default login `admin@gmail.com`
    const users = db.collection('users');
    await users.updateOne(
      { email: 'admin@gmail.com' },
      { $set: { email: 'admin@gmail.com', password: 'password123', name: 'Admin E2E', role: 'owner' } },
      { upsert: true }
    );
  });

  test.afterAll(async () => {
    await closeDB();
  });

  test('should display topbar menu correctly and dropdowns should work on hover', async ({ page }) => {
    // 1. Đi tới trang chủ (đã được lưu state login từ auth.setup.ts)
    await page.goto('/');
    
    // Đợi layout chính render
    await page.waitForSelector('.app-sidebar', { timeout: 15000 });

    // 2. Kiểm tra layout topbar 
    // Logo user container
    const brandContainer = page.locator('.brand.user-dropdown-container');
    await expect(brandContainer).toBeVisible();

    // 3. Click thử user menu
    await brandContainer.click();
    const logoutBtn = page.locator('button:has-text("Đăng xuất")');
    await expect(logoutBtn).toBeVisible();
    await page.mouse.click(0, 0); // click outside to close

    // 4. Kiểm tra hover menu dropdown (Sản phẩm)
    const productMenuTitle = page.locator('.menu-group-title:has-text("Sản phẩm")');
    await productMenuTitle.hover();
    
    const productPanel = productMenuTitle.locator('xpath=..').locator('.menu-panel');
    // .menu-panel theo css hiện tại dùng :hover của .menu-group
    await expect(productPanel).toBeVisible();

    // Kiểm tra link con
    const inventoryLink = productPanel.locator('a:has-text("Tồn kho")');
    await expect(inventoryLink).toBeVisible();

    // 5. Kiểm tra Submenu (Báo Cáo -> Doanh thu)
    const reportMenuTitle = page.locator('.menu-group-title:has-text("Báo Cáo")');
    await reportMenuTitle.hover();
    
    const reportPanel = reportMenuTitle.locator('xpath=..').locator('.menu-panel');
    await expect(reportPanel).toBeVisible();

    const revenueSubMenu = reportPanel.locator('.submenu-trigger:has-text("Doanh thu")');
    await revenueSubMenu.hover();
    
    const revenuePanel = revenueSubMenu.locator('xpath=..').locator('.submenu-panel');
    await expect(revenuePanel).toBeVisible();

    const timeReportLink = revenuePanel.locator('a:has-text("Theo thời gian")');
    await expect(timeReportLink).toBeVisible();
    
    // 6. Click chuyển trang để test route logic không đổi
    // Dùng evaluate để click tránh lỗi Playwright scroll element out of viewport
    await timeReportLink.evaluate((node: HTMLElement) => node.click());
    await expect(page).toHaveURL(/.*\/reports\/revenue\/time/);
  });
});
