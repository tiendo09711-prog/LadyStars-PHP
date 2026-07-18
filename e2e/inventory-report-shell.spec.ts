import { expect, type Page, test } from '@playwright/test';

const ADMIN_USER = {
  name: 'Admin E2E',
  email: 'admin-e2e@ladystars.local',
  role: 'ADMIN',
  status: 'active',
};

async function seedAdminSession(page: Page) {
  await page.addInitScript((user) => {
    localStorage.setItem('token', 'local-laravel-token-1');
    localStorage.setItem('authUser', JSON.stringify(user));
  }, ADMIN_USER);

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ADMIN_USER),
    });
  });

  await page.route('**/api/settings/store', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ shopName: 'LadyStars' }),
    });
  });

  // Keep product tabs from hitting live APIs during shell navigation tests.
  await page.route('**/api/products/inventories**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [],
        data: [],
        total: 0,
        page: 1,
        limit: 15,
        totalStockQuantity: 0,
        totalInventoryValue: 0,
      }),
    });
  });

  await page.route('**/api/products/storage-duration**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [],
        data: [],
        total: 0,
        page: 1,
        limit: 15,
        kpis: {
          totalProducts: 0,
          unsoldLong: 0,
          slowSelling: 0,
          totalValue: 0,
          thresholdDays: 30,
        },
      }),
    });
  });

  await page.route('**/api/products/categories**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], data: [], total: 0 }),
    });
  });

  await page.route('**/api/branches**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], data: [], total: 0 }),
    });
  });
}

async function openInventoryReport(page: Page, path: string) {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: 'Báo cáo kho hàng' })).toBeVisible();
  return pageErrors;
}

function inventoryTab(page: Page, name: string) {
  return page.getByRole('tab', { name });
}

test.describe('Inventory report shell (NAV)', () => {
  test.beforeEach(async ({ page }) => {
    await seedAdminSession(page);
  });

  test('NAV-01 parent route redirects to in-out-stock default tab', async ({ page }) => {
    const pageErrors = await openInventoryReport(page, '/reports/inventory');
    await expect(page).toHaveURL(/\/reports\/inventory\/in-out-stock$/);
    await expect(inventoryTab(page, 'Xuất nhập tồn')).toHaveAttribute('aria-current', 'page');
    expect(pageErrors).toEqual([]);
  });

  test('NAV-02 three report tab URLs direct-load the correct active tab', async ({ page }) => {
    const cases: Array<{ path: string; tab: string }> = [
      { path: '/reports/inventory/in-out-stock', tab: 'Xuất nhập tồn' },
      { path: '/products/inventory', tab: 'Tồn kho' },
      { path: '/products/storage-duration', tab: 'Tuổi tồn' },
    ];

    for (const item of cases) {
      const pageErrors = await openInventoryReport(page, item.path);
      await expect(page).toHaveURL(new RegExp(item.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      await expect(inventoryTab(page, item.tab)).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('heading', { level: 1, name: 'Báo cáo kho hàng' })).toHaveCount(1);
      expect(pageErrors).toEqual([]);
    }
  });

  test('NAV-05 legacy pending report URL redirects to transfer operations', async ({ page }) => {
    await page.goto('/reports/inventory/pending-transfers');
    await expect(page).toHaveURL(/\/warehouse\/transfers$/);
  });

  test('NAV-07 legacy product performance URL redirects and report menu omits duplicate page', async ({ page }) => {
    await page.goto('/reports/products/performance');
    await expect(page).toHaveURL(/\/reports\/revenue\/products$/);

    const reportGroup = page.locator('.menu-group-report');
    await reportGroup.getByRole('button', { name: /Báo Cáo/i }).click();
    await expect(reportGroup.getByRole('link', { name: 'Doanh thu' })).toBeVisible();
    await expect(reportGroup.getByRole('link', { name: 'Kho hàng' })).toBeVisible();
    await expect(reportGroup.getByRole('link', { name: 'Sản phẩm' })).toHaveCount(0);
  });

  test('NAV-03 browser Back/Forward switches tabs by URL', async ({ page }) => {
    await openInventoryReport(page, '/reports/inventory/in-out-stock');
    await inventoryTab(page, 'Tồn kho').click();
    await expect(page).toHaveURL(/\/products\/inventory$/);
    await expect(inventoryTab(page, 'Tồn kho')).toHaveAttribute('aria-current', 'page');

    await inventoryTab(page, 'Tuổi tồn').click();
    await expect(page).toHaveURL(/\/products\/storage-duration$/);
    await expect(inventoryTab(page, 'Tuổi tồn')).toHaveAttribute('aria-current', 'page');

    await page.goBack();
    await expect(page).toHaveURL(/\/products\/inventory$/);
    await expect(inventoryTab(page, 'Tồn kho')).toHaveAttribute('aria-current', 'page');

    await page.goForward();
    await expect(page).toHaveURL(/\/products\/storage-duration$/);
    await expect(inventoryTab(page, 'Tuổi tồn')).toHaveAttribute('aria-current', 'page');
  });

  test('NAV-04 only one tab has aria-current=page', async ({ page }) => {
    await openInventoryReport(page, '/products/inventory');
    const currentTabs = page.locator('.inventory-report-nav__tab[aria-current="page"]');
    await expect(currentTabs).toHaveCount(1);
    await expect(currentTabs).toHaveText('Tồn kho');
  });

  test('NAV-05 tabs are keyboard focusable with focus-visible styles', async ({ page }) => {
    await openInventoryReport(page, '/reports/inventory/in-out-stock');
    const firstTab = inventoryTab(page, 'Xuất nhập tồn');
    await firstTab.focus();
    await expect(firstTab).toBeFocused();

    await page.keyboard.press('Tab');
    const secondTab = inventoryTab(page, 'Tồn kho');
    await expect(secondTab).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/products\/inventory$/);
    await expect(secondTab).toHaveAttribute('aria-current', 'page');
  });

  test('NAV-06 left menu Kho hàng is active on all three report routes', async ({ page }) => {
    const routes = [
      '/reports/inventory/in-out-stock',
      '/products/inventory',
      '/products/storage-duration',
    ];

    for (const route of routes) {
      await openInventoryReport(page, route);
      const reportGroup = page.locator('.menu-group-report');
      await expect(reportGroup).toBeVisible();
      // Desktop report panel opens on hover; also expand for mobile/collapsed states.
      await reportGroup.hover();
      const title = reportGroup.locator('.menu-group-title');
      if ((await title.getAttribute('aria-expanded')) !== 'true') {
        await title.click();
      }
      const khoHangLink = page.locator('.menu-group-report a[href="/reports/inventory"]');
      await expect(khoHangLink).toBeAttached();
      await expect(khoHangLink).toHaveClass(/active/, { timeout: 10_000 });
      // Group itself should also reflect active state.
      await expect(reportGroup).toHaveClass(/active/);
    }
  });

  test('NAV-07 left menu no longer repeats four inventory report submenus', async ({ page }) => {
    await openInventoryReport(page, '/reports/inventory/in-out-stock');
    const reportGroup = page.locator('.menu-group-report');
    const title = reportGroup.locator('.menu-group-title');
    if ((await title.getAttribute('aria-expanded')) !== 'true') {
      await title.click();
    }

    await expect(page.locator('.menu-group-report a[href="/reports/inventory"]')).toBeVisible();
    await expect(page.locator('.menu-group-report a[href="/reports/inventory/in-out-stock"]')).toHaveCount(0);
    await expect(page.locator('.menu-group-report a[href="/reports/inventory/pending-transfers"]')).toHaveCount(0);
    await expect(page.locator('.menu-group-report a[href="/products/inventory"]')).toHaveCount(0);
    await expect(page.locator('.menu-group-report a[href="/products/storage-duration"]')).toHaveCount(0);
    await expect(page.locator('.menu-group-report .submenu-group')).toHaveCount(0);
  });

  test('deep-link query strings are preserved on stock and age tabs', async ({ page }) => {
    await openInventoryReport(page, '/products/storage-duration?q=ABC&tab=unsold_long&branchId=12');
    await expect(page).toHaveURL(/\/products\/storage-duration\?/);
    await expect(page).toHaveURL(/q=ABC/);
    await expect(page).toHaveURL(/tab=unsold_long/);
    await expect(page).toHaveURL(/branchId=12/);
    await expect(inventoryTab(page, 'Tuổi tồn')).toHaveAttribute('aria-current', 'page');

    await openInventoryReport(page, '/products/inventory?q=SP01&branchId=5');
    await expect(page).toHaveURL(/\/products\/inventory\?/);
    await expect(page).toHaveURL(/q=SP01/);
    await expect(page).toHaveURL(/branchId=5/);
    await expect(inventoryTab(page, 'Tồn kho')).toHaveAttribute('aria-current', 'page');
  });

  test('responsive: no body horizontal overflow at desktop/tablet/mobile', async ({ page }) => {
    const viewports = [
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
      { width: 390, height: 844 },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await openInventoryReport(page, '/reports/inventory/in-out-stock');
      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        return {
          bodyScrollWidth: document.body.scrollWidth,
          clientWidth: root.clientWidth,
        };
      });
      expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
      await expect(page.locator('.inventory-report-nav')).toBeVisible();
    }
  });
});
