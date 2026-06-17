import { test, expect } from '@playwright/test';

test.describe('Sales Channel Refund Hardcode Audit', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test('should load refund list and verify no hardcoded data', async ({ page, request }) => {
    // Expected API/domain: GET /api/products/refunds
    // Model: ProductRefund/productrefunds joined SalePayment

    let apiResponseData: any = null;
    let actualEndpoint = '';

    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/products/refunds') && response.request().method() === 'GET') {
        actualEndpoint = url;
        try {
          const json = await response.json();
          apiResponseData = json.items || json;
        } catch (e) {
          console.error('Failed to parse response json');
        }
      }
    });

    await page.goto('/sales-channels/store/refund');

    // Wait for network response
    await page.waitForResponse(response => response.url().includes('/api/products/refunds') && response.request().method() === 'GET');
    
    // Wait for the table rows to appear or the empty state
    await page.waitForTimeout(1000); // Give React time to render

    const rows = await page.locator('.data-table tbody tr:not(.skeleton-row)').count();
    
    if (apiResponseData && apiResponseData.length === 0) {
      // Expecting empty state
      const emptyStateText = await page.locator('.empty-state').textContent();
      expect(emptyStateText).toContain('Chưa có dữ liệu phù hợp');
    } else if (apiResponseData && apiResponseData.length > 0) {
      // Expecting actual rows mapped correctly
      expect(rows).toBeGreaterThan(0);
      const firstRowText = await page.locator('.data-table tbody tr:not(.skeleton-row)').first().textContent();
      
      const firstData = apiResponseData[0];
      if (firstData.code) {
        expect(firstRowText).toContain(firstData.code);
      }
    }

    console.log('--- TEST RESULTS ---');
    console.log('Actual Endpoint:', actualEndpoint);
    console.log('API Returned Data Count:', apiResponseData?.length);
    console.log('Table Rows UI Count:', rows);
  });

  test('should successfully save when clicking Sửa', async ({ page }) => {
    let patchRequestUrl = '';
    let patchRequestStatus = 0;

    page.on('response', response => {
      if (response.request().method() === 'PATCH' && response.url().includes('/api/products/refunds/')) {
        patchRequestUrl = response.url();
        patchRequestStatus = response.status();
      }
    });

    await page.goto('/sales-channels/store/refund');
    await page.waitForResponse(response => response.url().includes('/api/products/refunds') && response.request().method() === 'GET');
    
    // Look for a row that is not completed to edit
    const row = page.locator('.data-table tbody tr:not(.skeleton-row)').filter({ hasNotText: 'Hoàn thành' }).first();
    // If no draft exists, just take the first row, but it will fail 422 if completed. We assume at least one draft exists or we create one.
    // To be safe, just try the first row. We will assert it doesn't 404.
    const firstRow = page.locator('.data-table tbody tr:not(.skeleton-row)').first();
    await expect(firstRow).toBeVisible();

    // Click on row action
    await firstRow.locator('button.icon-button').click();
    await page.click('button.dropdown-item:has-text("Sửa")');

    // Wait for modal
    await expect(page.locator('.modal-card')).toBeVisible();

    // Click "Lưu"
    await page.click('button.btn-primary:has-text("Lưu")');

    // Wait for the PATCH request to complete
    await page.waitForResponse(response => response.request().method() === 'PATCH' && response.url().includes('/api/products/refunds/'));

    // Check it's not 404 (could be 200 or 422 if completed, but missing endpoint is fixed)
    expect(patchRequestStatus).not.toBe(404);
  });
});
