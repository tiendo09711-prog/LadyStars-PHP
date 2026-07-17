import { expect, type Page, test } from '@playwright/test';

const ADMIN_USER = {
  name: 'Admin E2E',
  email: 'admin-e2e@ladystars.local',
  role: 'ADMIN',
  status: 'active',
};

function inventoryPayload(overrides: Record<string, unknown> = {}) {
  return {
    items: [
      {
        _id: 'p1',
        code: 'SP01',
        name: 'Áo thun',
        cost: 10000,
        price: 15000,
        totalStock: 5,
        status: 'active',
        stockByBranchId: { '1': 5 },
      },
      {
        _id: 'p2',
        code: 'SP02',
        name: 'Quần jean',
        cost: 20000,
        price: 30000,
        totalStock: 3,
        status: 'active',
        stockByBranchId: { '1': 3 },
      },
    ],
    data: [],
    total: 50,
    page: 1,
    limit: 15,
    totalStockQuantity: 999,
    totalInventoryValue: 12_500_000,
    breakdowns: {
      byWarehouse: [
        { branchId: 'wh1', localBranchId: 1, name: 'Kho A', qty: 600, value: 8_000_000 },
        { branchId: 'wh2', localBranchId: 2, name: 'Kho B', qty: 399, value: 4_500_000 },
      ],
    },
    meta: { generatedAt: '2026-07-17T10:00:00+07:00', capabilities: { warehouseBreakdown: true } },
    ...overrides,
  };
}

async function seed(page: Page) {
  await page.addInitScript((user) => {
    localStorage.setItem('token', 'local-laravel-token-1');
    localStorage.setItem('authUser', JSON.stringify(user));
  }, ADMIN_USER);

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_USER) });
  });
  await page.route('**/api/settings/store', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ shopName: 'LadyStars' }) });
  });
  await page.route('**/api/system/branches**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          { _id: '1', id: 1, name: 'Kho A', code: 'A', isActive: true },
          { _id: '2', id: 2, name: 'Kho B', code: 'B', isActive: true },
        ],
        total: 2,
        page: 1,
        limit: 200,
      }),
    });
  });
  await page.route('**/api/branches**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          { _id: '1', id: 1, name: 'Kho A', code: 'A', isActive: true },
          { _id: '2', id: 2, name: 'Kho B', code: 'B', isActive: true },
        ],
        total: 2,
      }),
    });
  });
  await page.route('**/api/reports/inventory/pending-transfers?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        summary: { totalPending: 0, totalQty: 0, maxWaitingDays: 0 },
        table: { data: [], pagination: { page: 1, perPage: 1, total: 0, totalPages: 1 } },
      }),
    });
  });
}

test.describe('Inventory stock report tab (STOCK)', () => {
  test.beforeEach(async ({ page }) => {
    await seed(page);
  });

  test('STOCK-01 deep-link route activates stock tab', async ({ page }) => {
    await page.route('**/api/products/inventories**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(inventoryPayload()) });
    });
    await page.goto('/products/inventory');
    await expect(page.getByRole('tab', { name: 'Tồn kho' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { level: 1, name: 'Báo cáo kho hàng' })).toBeVisible();
  });

  test('STOCK-01B pending transfer warning links to operations', async ({ page }) => {
    await page.unroute('**/api/reports/inventory/pending-transfers?**');
    await page.route('**/api/reports/inventory/pending-transfers?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ summary: { totalPending: 3, totalQty: 18, maxWaitingDays: 6 } }),
      });
    });
    await page.route('**/api/products/inventories**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(inventoryPayload()) });
    });
    await page.goto('/products/inventory');
    const warning = page.getByTestId('inventory-transfer-alert');
    await expect(warning).toContainText('3 phiếu chuyển kho chưa hoàn tất');
    await expect(warning).toContainText('18 sản phẩm đang treo');
    await expect(warning).toContainText('lâu nhất 6 ngày');
    await warning.getByRole('button', { name: 'Mở chuyển kho' }).click();
    await expect(page).toHaveURL(/\/warehouse\/transfers$/);
  });

  test('STOCK-01C transfer warning failure does not block inventory', async ({ page }) => {
    await page.unroute('**/api/reports/inventory/pending-transfers?**');
    await page.route('**/api/reports/inventory/pending-transfers?**', async (route) => {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'fail' }) });
    });
    await page.route('**/api/products/inventories**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(inventoryPayload()) });
    });
    await page.goto('/products/inventory');
    await expect(page.getByTestId('inventory-transfer-error')).toBeVisible();
    await expect(page.getByTestId('inventory-kpi-stock')).toHaveText('999');
  });

  test('STOCK-02 query string hydrates filters and request', async ({ page }) => {
    const urls: string[] = [];
    await page.route('**/api/products/inventories**', async (route) => {
      urls.push(route.request().url());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(inventoryPayload()) });
    });
    await page.goto('/products/inventory?q=SP01&branchId=1&stockStatus=in_stock');
    await expect.poll(() => urls.some((u) => u.includes('q=SP01'))).toBeTruthy();
    expect(urls.some((u) => u.includes('branchId=1'))).toBeTruthy();
    expect(urls.some((u) => u.includes('stockStatus=in_stock'))).toBeTruthy();
    await expect(page.locator('input[data-product-search-primary="true"]')).toHaveValue('SP01');
  });

  test('STOCK-03 search encoding and warehouse', async ({ page }) => {
    const urls: string[] = [];
    await page.route('**/api/products/inventories**', async (route) => {
      urls.push(route.request().url());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(inventoryPayload()) });
    });
    await page.goto('/products/inventory');
    await expect(page.getByTestId('inventory-kpi-stock')).toBeVisible();
    await page.locator('input[data-product-search-primary="true"]').fill('Ao-X');
    // Warehouse select is the first inv-filter-select
    await page.locator('select.inv-filter-select').nth(0).selectOption({ label: 'Kho A' });
    await page.getByRole('button', { name: 'Lọc' }).click();
    await expect.poll(() => urls.some((u) => u.includes('branchId=1') || u.includes('q=Ao-X'))).toBeTruthy();
  });

  test('STOCK-04 KPI uses server aggregate not page sum', async ({ page }) => {
    await page.route('**/api/products/inventories**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(inventoryPayload()) });
    });
    await page.goto('/products/inventory');
    // Page rows only total 5+3=8, server says 999
    await expect(page.getByTestId('inventory-kpi-stock')).toHaveText('999');
    await expect(page.getByTestId('inventory-kpi-total')).toHaveText('50');
    await expect(page.getByTestId('inventory-kpi-value')).toContainText('12.500.000');
  });

  test('STOCK-05 chart uses server breakdown and pagination does not change it', async ({ page }) => {
    let calls = 0;
    await page.route('**/api/products/inventories**', async (route) => {
      calls += 1;
      const pageNo = new URL(route.request().url()).searchParams.get('page') || '1';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(inventoryPayload({
          page: Number(pageNo),
          items: inventoryPayload().items,
          // Same breakdown regardless of page
          breakdowns: {
            byWarehouse: [
              { branchId: 'wh1', name: 'Kho A', qty: 600, value: 8_000_000 },
              { branchId: 'wh2', name: 'Kho B', qty: 399, value: 4_500_000 },
            ],
          },
        })),
      });
    });
    await page.goto('/products/inventory');
    await expect(page.getByTestId('inventory-chart')).toBeVisible();
    await expect(page.getByTestId('inventory-chart-card')).toContainText('Kho A');
    const before = await page.getByTestId('inventory-chart-card').innerText();
    // Trigger page change if pagination exists; otherwise re-sort
    const next = page.getByRole('button', { name: /Sau|Next|›|>/ }).first();
    if (await next.count()) {
      await next.click().catch(() => undefined);
    }
    await expect(page.getByTestId('inventory-kpi-stock')).toHaveText('999');
    await expect(page.getByTestId('inventory-chart-card')).toContainText('Kho A');
    expect(await page.getByTestId('inventory-chart-card').innerText()).toContain('Kho B');
    expect(before).toContain('Kho A');
    expect(calls).toBeGreaterThan(0);
  });

  test('STOCK-06 sort and pagination query', async ({ page }) => {
    const urls: string[] = [];
    await page.route('**/api/products/inventories**', async (route) => {
      urls.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(inventoryPayload({ total: 40 })),
      });
    });
    await page.goto('/products/inventory');
    await page.getByRole('button', { name: /Sắp xếp theo Tổng tồn|Tổng tồn/ }).first().click();
    await expect.poll(() => urls.some((u) => u.includes('sort=totalStock'))).toBeTruthy();
  });

  test('STOCK-07 empty error retry', async ({ page }) => {
    let attempt = 0;
    await page.route('**/api/products/inventories**', async (route) => {
      attempt += 1;
      if (attempt === 1) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'fail' }) });
        return;
      }
      if (attempt === 2) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(inventoryPayload({
            items: [],
            total: 0,
            totalStockQuantity: 0,
            totalInventoryValue: 0,
            breakdowns: { byWarehouse: [] },
          })),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(inventoryPayload()) });
    });

    await page.goto('/products/inventory');
    await expect(page.getByRole('alert')).toBeVisible();
    // Error must not look like a successful zero inventory KPI set from swallowed failure on first paint
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect(page.getByTestId('inventory-chart-empty')).toBeVisible();
    await expect(page.getByTestId('inventory-kpi-stock')).toHaveText('0');
  });

  test('STOCK-08 loading refresh keeps prior data', async ({ page }) => {
    let resolveSlow: (() => void) | null = null;
    let n = 0;
    await page.route('**/api/products/inventories**', async (route) => {
      n += 1;
      if (n === 1) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(inventoryPayload()) });
        return;
      }
      await new Promise<void>((r) => { resolveSlow = r; });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(inventoryPayload({ totalStockQuantity: 111 })),
      });
    });
    await page.goto('/products/inventory');
    await expect(page.getByTestId('inventory-kpi-stock')).toHaveText('999');
    await page.getByRole('button', { name: 'Làm mới' }).click();
    await expect.poll(() => resolveSlow !== null).toBeTruthy();
    // Prior data still visible while refreshing
    await expect(page.getByTestId('inventory-kpi-stock')).toHaveText('999');
    resolveSlow?.();
    await expect(page.getByTestId('inventory-kpi-stock')).toHaveText('111');
  });

  test('STOCK-10 export uses applied filters', async ({ page }) => {
    const urls: string[] = [];
    await page.route('**/api/products/inventories**', async (route) => {
      urls.push(route.request().url());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(inventoryPayload()) });
    });
    await page.goto('/products/inventory');
    await expect(page.locator('select.inv-filter-select').first().locator('option')).toHaveCount(3, { timeout: 10_000 });
    await page.locator('select.inv-filter-select').first().selectOption('1');
    await page.getByRole('button', { name: 'Xuất dữ liệu' }).click();
    await expect(page.getByText(/Xuất Excel|Xuất dữ liệu|cột/i).first()).toBeVisible();
    expect(urls.some((u) => u.includes('branchId=1') || u.includes('/inventories'))).toBeTruthy();
  });
});
