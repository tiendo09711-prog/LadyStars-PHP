import { expect, test } from '@playwright/test';
import {
  cleanupAuditRun,
  getBranches,
  loginAdminApi,
  seedAuditProduct,
  shutdownAuditHelpers,
  storageStateForToken,
} from '../utils/warehouse-audit';

test.describe.serial('Warehouse audit UI data flow', () => {
  const runKey = `E2E-AUDIT-UI-${Date.now()}`;
  let adminApi: any;
  let adminToken = '';
  let hn: any;
  let seededAudit: any;
  let seededProduct: any;

  test.beforeAll(async () => {
    const admin = await loginAdminApi();
    adminApi = admin.api;
    adminToken = admin.token;
    const { defaultBranch } = await getBranches(adminApi);
    hn = defaultBranch;

    seededProduct = await seedAuditProduct(adminApi, {
      code: `${runKey}-PROD`,
      name: `${runKey} UI Product`,
      cost: 100000,
      price: 150000,
      branchStocks: { [hn._id]: 5 },
    });

    const response = await adminApi.post('inventory-audits', {
      data: {
        code: `${runKey}-AUDIT`,
        warehouseId: hn._id,
        auditType: 'BY_PRODUCT',
        status: 'COUNTING',
        note: `${runKey} seeded list row`,
        items: [{ productId: seededProduct.productId, physicalQuantity: 4, note: 'seeded for UI' }],
      },
    });
    expect(response.status()).toBe(201);
    seededAudit = await response.json();
  });

  test.afterAll(async () => {
    await cleanupAuditRun(adminApi, runKey);
    await adminApi?.dispose();
    await shutdownAuditHelpers();
  });

  test('audit list uses new APIs and filters both tabs with real data', async ({ browser }) => {
    const context = await browser.newContext({ storageState: storageStateForToken(adminToken) });
    const page = await context.newPage();
    const requestedUrls: string[] = [];

    page.on('request', (request) => {
      requestedUrls.push(request.url());
    });

    try {
      await page.goto('/warehouse/audit');
      await page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname.endsWith('/api/inventory-audits/meta') && response.status() === 200;
      });
      await page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname.endsWith('/api/inventory-audits') && response.status() === 200;
      });

      const tabs = page.locator('[role="tab"]');
      await expect(tabs).toHaveCount(2);

      await page.locator('input[placeholder="ID phiếu kiểm kho"]').first().fill(seededAudit.code);
      await page.locator('.wr-filter-button').click();
      await expect(page.getByRole('button', { name: seededAudit.code })).toBeVisible();

      await tabs.nth(1).click();
      await page.locator('input[placeholder="ID phiếu kiểm kho"]').first().fill(seededAudit.code);
      await page.locator('.wr-filter-button').click();
      await expect(page.getByText(seededProduct.name)).toBeVisible();
      await expect(page.getByText(seededProduct.code)).toBeVisible();

      expect(requestedUrls.some((url) => url.includes('/api/warehouse/checks'))).toBeFalsy();
      expect(requestedUrls.some((url) => url.includes('/api/warehouse/check-products'))).toBeFalsy();
      expect(requestedUrls.some((url) => url.includes('/api/inventory-audits'))).toBeTruthy();
      expect(requestedUrls.some((url) => url.includes('/api/inventory-audit-items'))).toBeTruthy();
    } finally {
      await context.close();
    }
  });

  test('create page loads warehouses and inventories from real APIs', async ({ browser }) => {
    const context = await browser.newContext({ storageState: storageStateForToken(adminToken) });
    const page = await context.newPage();
    try {
      await page.goto('/warehouse/audit/create');
      await page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname.endsWith('/api/inventory-audits/meta') && response.status() === 200;
      });

      await page.locator('.audit-editor-form select').first().selectOption(hn._id);
      await page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname.endsWith('/api/products/inventories')
          && url.searchParams.get('branchId') === hn._id
          && response.status() === 200;
      });

      await page.locator('input[placeholder="Tìm theo mã sản phẩm hoặc mã vạch"]').fill(seededProduct.code);
      await expect(page.getByText(seededProduct.code)).toBeVisible();
      await expect(page.getByText(seededProduct.name)).toBeVisible();
      await expect(page.getByText(/Không tìm thấy sản phẩm/i)).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
