import { test, expect } from '@playwright/test';

test.describe('Sales Channel Find Invoice Audit', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test('should load find invoice page and check data', async ({ page }) => {
    const salesResponsePromise = page.waitForResponse(response => 
      response.url().includes('/api/products/sales') && response.request().method() === 'GET'
    );

    await page.goto('/sales-channels/store/find');

    const response = await salesResponsePromise;
    expect(response.status()).toBe(200);

    const data = await response.json();
    
    // Check UI matches data
    if (data.items && data.items.length > 0) {
      // Find the first item code in the table
      const firstCode = data.items[0].code;
      await expect(page.locator('table tbody tr').first()).toContainText(firstCode);
    } else {
      // Wait for empty state
      await expect(page.locator('table tbody tr.empty-cell')).toContainText('Không tìm thấy hóa đơn nào khớp với bộ lọc.');
    }
  });
  
  test('should filter by invoice code', async ({ page }) => {
    await page.goto('/sales-channels/store/find');
    // We assume there's a file with input
    await page.fill('input[placeholder="Mã hóa đơn (ví dụ: BH...)"]', 'TESTCODE123');
    
    const filterPromise = page.waitForResponse(response => 
      response.url().includes('/api/products/sales?code=TESTCODE123') && response.request().method() === 'GET'
    );
    await page.click('button:has-text("Tìm kiếm")');
    const res = await filterPromise;
    expect(res.status()).toBe(200);
  });
});
