import { test, expect } from '@playwright/test';

test.describe('Warehouse Vouchers Export hardcode audit', () => {
  test.beforeEach(async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
  });

  test('/warehouse/transactions/vouchers/export loads data from API, not hardcoded fallback', async ({ page }) => {
    const productsPromise = page.waitForResponse((response) =>
      response.url().includes('/api/products/inventories') &&
      response.request().method() === 'GET'
    );
    const branchesPromise = page.waitForResponse((response) =>
      response.url().includes('/api/system/branches') &&
      response.request().method() === 'GET'
    );

    await page.goto('/warehouse/transactions/vouchers/export');
    await page.waitForLoadState('networkidle');

    const productsResp = await productsPromise;
    expect(productsResp.ok()).toBeTruthy();

    const branchesResp = await branchesPromise;
    expect(branchesResp.ok()).toBeTruthy();
    const branchesPayload = await branchesResp.json();
    const branches = branchesPayload.items || [];

    // Check if branch options are loaded from API
    if (branches.length > 0) {
      const firstBranchName = branches[0].name;
      // Expect the first branch name to be in the select options for warehouse
      const warehouseSelect = page.locator('select').first();
      await expect(warehouseSelect).toContainText(firstBranchName);
    }
    
    // Check that default values are not fake data
    const customerInput = page.locator('select').nth(2);
    // Should not default to "Nhà cung cấp A"
    // Wait, initially exportType is "Xuất trả hàng" which shows Supplier. The value might be empty string.
    const textContent = await customerInput.textContent();
    expect(textContent).not.toContain('Nhà cung cấp A'); // assuming it's an option or value

    // Verify products are loaded into the first line
    const productSelect = page.locator('.data-table tbody tr select').first();
    const productsPayload = await productsResp.json();
    const products = productsPayload.items || [];
    if (products.length > 0) {
      const firstProdCode = products[0].code;
      await expect(productSelect).toContainText(firstProdCode);
    }
  });

  test('Save button sends correct payload without hardcoded strings', async ({ page }) => {
    await page.goto('/warehouse/transactions/vouchers/export');
    await page.waitForLoadState('networkidle');

    // Wait for the UI to be fully populated
    await page.waitForTimeout(2000);

    // Wait for a product row to be added
    const productSelect = page.locator('.data-table tbody tr select').first();
    await expect(productSelect).toBeVisible();

    const createPromise = page.waitForResponse((response) =>
      response.url().includes('/api/warehouse/vouchers/export') &&
      response.request().method() === 'POST'
    );

    // Enter note
    await page.getByPlaceholder('Nhập ghi chú cho toàn bộ phiếu xuất').fill('Test ghi chú xuất kho');

    // Click Save
    await page.getByRole('button', { name: 'Lưu phiếu xuất' }).click();

    // Check if there is an error message displayed on UI
    const errorMsg = await page.locator('.form-error').textContent({ timeout: 1000 }).catch(() => null);
    if (errorMsg) {
      console.log('UI ERROR MESSAGE:', errorMsg);
    }

    const createResp = await createPromise;
    const reqPostData = createResp.request().postDataJSON();
    
    // Ensure no hardcoded "Nhà cung cấp A" is sent unless explicitly selected
    expect(reqPostData.supplier).not.toBe('Nhà cung cấp A');
  });
});
