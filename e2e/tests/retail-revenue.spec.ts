import { test, expect } from '@playwright/test';
import { seedProduct, cleanupTestData, closeDB } from '../utils/db';

const TEST_PRODUCT_CODE = 'E2E_PROD_123';
const TEST_BRANCH_ID = '6a05946e67c30b7a39107bcb'; // Kho HCM

test.describe('Retail Invoice -> Revenue Report E2E Flow', () => {
  
  test.beforeAll(async () => {
    // 1. Seed the test product before running the UI tests
    await seedProduct(TEST_PRODUCT_CODE);
  });

  test.afterAll(async () => {
    // Clean up to keep DB pristine
    await cleanupTestData(TEST_PRODUCT_CODE);
    await closeDB();
  });

  test('Should create a retail invoice and reflect in revenue', async ({ page }) => {
    // 2. Navigate directly to create invoice page (using Kho HCM branchId)
    await page.goto(`/sales-channels/admin/retail/create?branchId=${TEST_BRANCH_ID}`);

    // Wait for the form to render
    await expect(page.locator('input[placeholder="Nhập họ tên khách hàng"]')).toBeVisible();

    // 3. Fill Customer Name
    await page.fill('input[placeholder="Nhập họ tên khách hàng"]', 'Khach hang Test E2E');
    // Hide dropdown if it appears
    await page.keyboard.press('Escape');

    // 4. Fill Product Code to search
    // We assume the placeholder is "Mã hoặc tên sản phẩm" or similar
    const searchInput = page.locator('input[placeholder="Tìm theo mã hoặc tên sản phẩm..."]');
    await searchInput.fill(TEST_PRODUCT_CODE);

    // Wait for dropdown list to appear containing our test product
    await expect(page.locator(`text=${TEST_PRODUCT_CODE}`).nth(1)).toBeVisible({ timeout: 5000 });
    
    // Select the product
    await page.locator(`text=${TEST_PRODUCT_CODE}`).nth(1).click();

    // Fill Price
    // Product price input might be there, we'll just click Save
    const submitBtn = page.locator('button:has-text("Lưu hóa đơn")');
    await submitBtn.click();

    // Wait for success toast
    await expect(page.locator('text=Lưu thành công').or(page.locator('text=thành công'))).toBeVisible({ timeout: 5000 });

    // 5. Navigate to Revenue Report
    await page.goto('/reports/revenue/time');

    // Select the branch "Kho HCM" in report filter
    // Wait for the branch dropdown
    await page.click('button:has-text("Kho hàng")');
    await page.click('text=Kho HCM');

    // Filter by "Hôm nay"
    await page.click('button:has-text("Khoảng ngày")');
    await page.click('text=Hôm nay');

    // Wait for report table/chart to load
    // Verify our revenue increased by checking the summary/chart
    // Just looking for the number 500.000 in the table/cards
    await expect(page.locator('text=500.000').first()).toBeVisible({ timeout: 5000 });
  });

});
