import { test, expect } from '@playwright/test';

test.describe('Wholesale Sales Channel Hardcode Data Audit', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test('wholesale-list-001: Load wholesale invoice list', async ({ page }) => {
    // Expected API/domain: GET /api/products/sales?code=BHS
    // Actual API/domain: GET /api/products/sales?code=BHS
    
    // Setup network interception
    const salesPromise = page.waitForResponse(response => 
      response.url().includes('/api/products/sales?code=BHS') && response.request().method() === 'GET'
    );

    await page.goto('/sales-channels/store/wholesale');

    // Wait for API response
    const salesResponse = await salesPromise;
    expect(salesResponse.status()).toBe(200);

    const body = await salesResponse.json();
    const items = body.items || [];

    // Verify UI vs API
    if (items.length > 0) {
      // If there's data, check if the first item's code is visible
      const firstCode = items[0].code;
      await expect(page.getByText(firstCode).first()).toBeVisible();
    } else {
      // If no data, ensure empty state is visible
      await expect(page.getByText('Chưa có dữ liệu phù hợp')).toBeVisible();
    }
    
    // Check tabs
    await page.getByRole('button', { name: 'Có chiết khấu' }).click();
    await page.waitForResponse(response => response.url().includes('/api/products/sales') && response.request().method() === 'GET');
    
    await page.getByRole('button', { name: 'Có công nợ' }).click();
    await page.waitForResponse(response => response.url().includes('/api/products/sales') && response.request().method() === 'GET');

    // Verify 'Nhập dữ liệu' button under tools is NOT visible
    await page.getByRole('button', { name: 'Công cụ' }).click();
    await expect(page.getByRole('button', { name: 'Nhập dữ liệu' })).not.toBeVisible();
  });

  test('wholesale-create-001: Open create wholesale invoice page', async ({ page }) => {
    // Mock branches API for modal
    await page.route('**/api/system/branches', async route => {
      await route.fulfill({
        status: 200,
        json: { items: [{ _id: 'branch_123', name: 'Kho Chính', code: 'MAIN', isDefault: true }] }
      });
    });

    await page.goto('/sales-channels/store/wholesale');
    
    await page.getByRole('button', { name: 'Tạo hóa đơn sỉ' }).first().click();
    
    // Wait for modal to appear
    await expect(page.getByText('Chọn Kho / Chi Nhánh Bán Sỉ')).toBeVisible();
    
    // Click tiếp tục
    await page.getByRole('button', { name: 'Tiếp tục' }).click();
    
    // Should navigate to create page
    await page.waitForURL('**/wholesale/create?branchId=branch_123');
    
    // Check initial API calls for create page
    const [meRes, staffRes, custRes, prodRes] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/auth/me')),
      page.waitForResponse(res => res.url().includes('/api/staff')),
      page.waitForResponse(res => res.url().includes('/api/customers/customers')),
      page.waitForResponse(res => res.url().includes('/api/products/inventories')),
    ]);

    expect(meRes.status()).toBe(200);
    expect(staffRes.status()).toBe(200);
    expect(custRes.status()).toBe(200);
    expect(prodRes.status()).toBe(200);
    
    // Verify Create Page Title
    await expect(page.getByRole('heading', { name: 'Tạo Mới Hóa Đơn Bán Sỉ' })).toBeVisible();
  });
});
