import { test, expect } from '@playwright/test';
import { connectDB, closeDB } from '../utils/db';

const TEST_CODE = 'TRF_E2E_' + Date.now();

test.describe('Warehouse Transfers hardcode audit', () => {
  let db: any;

  test.beforeAll(async () => {
    db = await connectDB();
    // Setup a dummy transfer to ensure there is data in /warehouse/transfers
    await db.collection('warehousetransfers').deleteMany({ label: 'E2E_TRANSFER_LABEL' });
    await db.collection('warehousetransfers').insertOne({
      id: TEST_CODE,
      date: new Date().toISOString(),
      tabs: ['all', 'draft'],
      type: 'Chuyển kho',
      fromWarehouse: 'Kho A',
      toWarehouse: 'Kho B',
      label: 'E2E_TRANSFER_LABEL',
      note: 'Audit test data',
      qty: 10,
      spCount: 1,
      creator: 'E2E Admin',
      lines: []
    });
  });

  test.afterAll(async () => {
    await db.collection('warehousetransfers').deleteMany({ label: 'E2E_TRANSFER_LABEL' });
    await closeDB();
  });

  test.beforeEach(async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.addInitScript(() => {
      window.print = () => console.log('Mocked window.print()');
    });
  });

  test('list page loads data from API, not hardcoded fallback', async ({ page }) => {
    const apiResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/warehouse/transfers') &&
      response.request().method() === 'GET'
    );

    await page.goto('/warehouse/transfers');
    await page.waitForLoadState('networkidle');

    const apiResponse = await apiResponsePromise;
    expect(apiResponse.ok()).toBeTruthy();
    const payload = await apiResponse.json();

    const items = Array.isArray(payload) ? payload : payload.data ?? payload.items ?? [];

    if (items.length === 0) {
      await expect(page.locator('table tbody tr')).toHaveCount(0);
      await expect(page.getByText(/không có|chưa có|no data|Không tìm thấy/i)).toBeVisible();
      return;
    }

    // verify the seeded item is visible
    await expect(page.getByText(TEST_CODE).first()).toBeVisible();
  });

  test('tabs change request params', async ({ page }) => {
    await page.goto('/warehouse/transfers');
    await page.waitForLoadState('networkidle');

    const apiResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/warehouse/transfers?tabs=draft') &&
      response.request().method() === 'GET'
    );

    await page.getByRole('button', { name: /Phiếu nháp/i }).click();

    const response = await apiResponsePromise;
    expect(response.ok()).toBeTruthy();
    const url = new URL(response.url());
    expect(url.searchParams.get('tabs')).toBe('draft');
  });

  test('create page loads branches and inventories from API', async ({ page }) => {
    const branchResPromise = page.waitForResponse((response) =>
      response.url().includes('/api/system/branches') && response.request().method() === 'GET'
    );

    // There might be no product inventory if fromWarehouse stock is empty
    // We just verify it tries to fetch products once branch is selected
    const productResPromise = page.waitForResponse((response) =>
      response.url().includes('/api/products/inventories') && response.request().method() === 'GET'
    );

    await page.goto('/warehouse/transfers/create');
    await page.waitForLoadState('networkidle');

    const branchRes = await branchResPromise;
    expect(branchRes.ok()).toBeTruthy();

    const productRes = await productResPromise;
    expect(productRes.ok()).toBeTruthy();
  });

  test('create page mutation calls POST /api/warehouse/transfers', async ({ page }) => {
    await page.goto('/warehouse/transfers/create');
    await page.waitForLoadState('networkidle');

    // add line
    await page.getByRole('button', { name: /Thêm dòng|Thêm sản phẩm/i }).first().click();

    // select a product in the dropdown if available
    const selectProduct = page.locator('table tbody tr td select').first();
    const count = await selectProduct.locator('option').count();
    
    // If we have products, we can try to create a transfer
    if (count > 1) {
      await selectProduct.selectOption({ index: 1 });
      
      // input quantity
      await page.locator('table tbody tr td input[type="number"]').first().fill('1');

      // fill label
      await page.getByPlaceholder(/Ví dụ: Chuyển hàng nội bộ/i).fill('E2E_TRANSFER_LABEL');

      const postPromise = page.waitForResponse((response) =>
        response.url().includes('/api/warehouse/transfers') &&
        response.request().method() === 'POST'
      );

      await page.getByRole('button', { name: /Lưu phiếu chuyển kho/i }).first().click();
      const res = await postPromise;
      expect(res.ok()).toBeTruthy();
    }
  });
});
