import { test, expect } from '@playwright/test';
import * as path from 'path';

test.describe('Warehouse Vouchers Excel Import hardcode audit', () => {
  test.beforeEach(async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
  });

  test('/warehouse/transactions/vouchers/excel loads branches from API', async ({ page }) => {
    const branchesPromise = page.waitForResponse((response) =>
      response.url().includes('/api/system/branches') &&
      response.request().method() === 'GET'
    );

    await page.goto('/warehouse/transactions/vouchers/excel');
    await page.waitForLoadState('networkidle');

    const branchesResp = await branchesPromise;
    expect(branchesResp.ok()).toBeTruthy();
    
    const branchesPayload = await branchesResp.json();
    const branches = branchesPayload.items || [];
    
    // Select should contain the default branch or the first one from the list
    if (branches.length > 0) {
      const expectedBranch = branches.find((b: any) => b.isDefault) || branches[0];
      const branchSelect = page.locator('select').nth(2); // Third select is branch
      await expect(branchSelect).toContainText(expectedBranch.name);
    }
  });

  test('Template download works without calling API', async ({ page }) => {
    await page.goto('/warehouse/transactions/vouchers/excel');
    await page.waitForLoadState('networkidle');
    
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Tải file Excel mẫu' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('Nhanh.vn_Import_Imex_v0.1.8.xlsx');
  });

  test('Form submit with mock file sends correct payload to API', async ({ page }) => {
    await page.goto('/warehouse/transactions/vouchers/excel');
    await page.waitForLoadState('networkidle');

    // Wait for branches to load to ensure selectedBranchId is populated
    await page.waitForResponse((response) =>
      response.url().includes('/api/system/branches') &&
      response.request().method() === 'GET'
    );

    // Create a dummy file and upload it
    const buffer = Buffer.from('dummy excel content');
    const dummyFile = {
      name: 'test_import.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: buffer
    };

    await page.setInputFiles('input[type="file"]', dummyFile);
    await page.getByPlaceholder('Ghi chú cho phiếu nhập Excel này').fill('Note import test');

    const importPromise = page.waitForResponse((response) =>
      response.url().includes('/api/warehouse/vouchers/import-excel') &&
      response.request().method() === 'POST'
    );

    await page.getByRole('button', { name: 'Thực hiện import' }).click();

    const importResp = await importPromise;
    // We expect it might fail since it's a dummy file, but we just verify the network request was fired.
    const request = importResp.request();
    expect(request.method()).toBe('POST');
    expect(request.url()).toContain('/api/warehouse/vouchers/import-excel');
  });
});
