import { test, expect } from '@playwright/test';
import { connectDB, closeDB } from '../utils/db';

const TEST_CHECK_ID = 'E2E_AUDIT_001';

test.describe('Warehouse Audit hardcode audit', () => {
  let db: any;

  test.beforeAll(async () => {
    db = await connectDB();
    await db.collection('inventorychecks').deleteMany({ id: TEST_CHECK_ID });
    await db.collection('inventorychecks').insertOne({
      id: TEST_CHECK_ID,
      date: new Date().toISOString(),
      type: 'Theo sản phẩm',
      warehouse: 'Kho E2E',
      creator: 'E2E Tester',
      spCount: 5,
      qty: 100,
      note: 'Dữ liệu audit hardcode kiểm kho',
      missingSp: '0',
      balance: 'Không',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  test.afterAll(async () => {
    await db.collection('inventorychecks').deleteMany({ id: TEST_CHECK_ID });
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

  test('Kiểm kho tab loads data from API', async ({ page }) => {
    const apiResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/warehouse/checks') &&
      response.request().method() === 'GET'
    );

    await page.goto('/warehouse/audit');
    await page.waitForLoadState('networkidle');

    const apiResponse = await apiResponsePromise;
    expect(apiResponse.ok()).toBeTruthy();

    await expect(page.getByText('Dữ liệu audit hardcode kiểm kho')).toBeVisible();
    await expect(page.getByText(TEST_CHECK_ID)).toBeVisible();
  });

  test('Sản phẩm kiểm kho tab loads data from API', async ({ page }) => {
    await page.goto('/warehouse/audit');
    await page.waitForLoadState('networkidle');

    const apiResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/warehouse/check-products') &&
      response.request().method() === 'GET'
    );

    // Chuyển sang tab Sản phẩm kiểm kho
    await page.getByRole('button', { name: 'Sản phẩm kiểm kho' }).click();

    const apiResponse = await apiResponsePromise;
    expect(apiResponse.ok()).toBeTruthy();

    const payload = await apiResponse.json();
    const items = payload.items || payload.data || payload;
    
    if (items.length === 0) {
      await expect(page.getByText('Chưa có dữ liệu phù hợp')).toBeVisible();
    }
  });

  test('Create audit page loads products and branches from API', async ({ page }) => {
    const branchesPromise = page.waitForResponse((response) =>
      response.url().includes('/api/system/branches') &&
      response.request().method() === 'GET'
    );
    const productsPromise = page.waitForResponse((response) =>
      response.url().includes('/api/products/inventories') &&
      response.request().method() === 'GET'
    );

    await page.goto('/warehouse/audit/create');
    await page.waitForLoadState('networkidle');

    const branchesResponse = await branchesPromise;
    const productsResponse = await productsPromise;
    expect(branchesResponse.ok()).toBeTruthy();
    expect(productsResponse.ok()).toBeTruthy();
    
    // check if no fake products are rendered in dropdown by typing
    await page.getByPlaceholder('Nhập tên sản phẩm').fill('sản phẩm không tồn tại 123');
    await expect(page.getByText('Không tìm thấy sản phẩm')).toBeVisible();
  });
});
