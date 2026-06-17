import { test, expect } from '@playwright/test';
import { seedProduct, cleanupTestData, seedRevenueData, cleanupRevenueData } from '../utils/db';

const TEST_CODE = 'RETAIL-TEST-123';

test.describe('Sales Channel Retail Audit', () => {
  test.beforeAll(async () => {
    // Clean up first to ensure clean state
    await cleanupTestData(TEST_CODE);
    await cleanupRevenueData(TEST_CODE);
    
    // Seed required test data
    await seedProduct(TEST_CODE);
    await seedRevenueData(TEST_CODE);
  });

  test.afterAll(async () => {
    await cleanupTestData(TEST_CODE);
    await cleanupRevenueData(TEST_CODE);
  });

  test('should load retail invoice list and verify API mapping', async ({ page }) => {
    // Capture network requests
    const apiRequests: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/products/sales')) {
        apiRequests.push(request.url());
      }
    });

    await page.goto('/sales-channels/store/retail');
    
    // Wait for the main API call
    await page.waitForResponse(response => 
      response.url().includes('/api/products/sales') && response.status() === 200
    );

    // Verify it calls the correct API with the channel query parameter
    const correctApiCalled = apiRequests.some(url => url.includes('/api/products/sales?channel=store'));
    expect(correctApiCalled).toBeTruthy();

    // Verify the UI displays the seed data
    await expect(page.locator('text=' + TEST_CODE).first()).toBeVisible();
    
    // Verify tools dropdown has NO "Nhập dữ liệu" button
    await page.click('button:has-text("Công cụ")');
    await expect(page.locator('.dropdown-menu.tools-menu')).toBeVisible();
    await expect(page.locator('text=Nhập dữ liệu')).not.toBeVisible();
    await expect(page.locator('text=Xuất CSV')).toBeVisible();
    
    // Close tools
    await page.click('button:has-text("Công cụ")');

    // Switch to confirm tab
    await page.locator('.workspace-tabs button:has-text("Xác nhận thanh toán")').click();
    await page.waitForResponse(response => 
      response.url().includes('status=completed') && response.status() === 200
    );
    const confirmApiCalled = apiRequests.some(url => url.includes('status=completed') && url.includes('channel=store'));
    expect(confirmApiCalled).toBeTruthy();
  });

  test('should navigate to create page and create an invoice', async ({ page }) => {
    // Go to the retail list
    await page.goto('/sales-channels/store/retail');

    // Click "Thêm hóa đơn lẻ"
    await page.click('button:has-text("Thêm hóa đơn lẻ")');
    
    // The branch modal should appear
    await expect(page.locator('text=Chọn Kho / Chi Nhánh')).toBeVisible();
    
    // Just click "Tiếp tục" because default branch is selected automatically
    await page.click('button:has-text("Tiếp tục")');
    
    // URL should change to the create page
    await expect(page).toHaveURL(/\/sales-channels\/store\/retail\/create\?branchId=.+/);

    // Fill customer info
    await page.fill('input[placeholder="Nhập họ tên khách hàng"]', 'E2E Test Customer');
    await page.fill('input[placeholder="Nhập số điện thoại"]', '0999999999');

    // Select product
    await page.fill('input[placeholder="Tìm theo mã hoặc tên sản phẩm..."]', TEST_CODE);
    // Click on the dropdown result
    await page.locator(`div[style*="position: absolute"] > div`, { hasText: TEST_CODE }).click();

    // Verify product price is auto-filled
    const priceInput = page.locator('input[type="number"]').first();
    const priceValue = await priceInput.inputValue();
    expect(Number(priceValue)).toBeGreaterThan(0);

    // Track network requests
    const apiRequests: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/products/sales')) {
        apiRequests.push(`${request.method()} ${request.url()}`);
      }
    });

    // Save the invoice
    await page.click('button:has-text("Lưu hóa đơn")');

    // Wait for the success message or navigation
    await expect(page.locator('text=được lưu & tồn kho đã được trừ tự động')).toBeVisible({ timeout: 10000 });
    
    // Verify API POST sequence: draft -> complete
    const postSales = apiRequests.filter(req => req.includes('POST') && req.endsWith('/api/products/sales'));
    const completeSales = apiRequests.filter(req => req.includes('POST') && req.includes('/complete'));
    
    expect(postSales.length).toBeGreaterThanOrEqual(1);
    expect(completeSales.length).toBeGreaterThanOrEqual(1);
    
    // Verify it navigates back to list
    await expect(page).toHaveURL(/\/sales-channels\/store\/retail/);
  });

  test('should navigate to edit and refund pages from row actions', async ({ page }) => {
    await page.goto('/sales-channels/store/retail');
    
    // Wait for the main API call to finish
    await page.waitForResponse(response => 
      response.url().includes('/api/products/sales') && response.status() === 200
    );

    // Look for the row with TEST_CODE
    const row = page.locator('tr').filter({ hasText: TEST_CODE }).first();
    await expect(row).toBeVisible();

    // Click on the action button (...) of this row
    await row.locator('button.icon-button').click();

    // Wait for dropdown to be visible
    const dropdown = page.locator('.dropdown-menu.row-action-menu');
    await expect(dropdown).toBeVisible();

    // Click "Sửa thông tin"
    await page.click('button.dropdown-item:has-text("Sửa thông tin")');

    // Check URL changes to edit page
    await expect(page).toHaveURL(/\/sales-channels\/store\/retail\/create\?editId=.+/);

    // Go back to retail list
    await page.goto('/sales-channels/store/retail');
    await page.waitForResponse(response => 
      response.url().includes('/api/products/sales') && response.status() === 200
    );

    // Find row again
    const row2 = page.locator('tr').filter({ hasText: TEST_CODE }).first();
    await expect(row2).toBeVisible();

    // Click on action button again
    await row2.locator('button.icon-button').click();

    // Click "Trả hàng - Đổi hàng"
    await page.click('button.dropdown-item:has-text("Trả hàng - Đổi hàng")');

    // Check URL changes to refund page
    await expect(page).toHaveURL(/\/sales-channels\/store\/refund\/create\?saleId=.+/);
  });
});
