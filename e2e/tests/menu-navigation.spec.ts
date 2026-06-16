import { test, expect } from '@playwright/test';

test.describe('Phase 2 navigation/sidebar/header', () => {
  test('desktop navigation groups, active state, reports route, user menu, reload, logout', async ({ page }) => {
    const seriousErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') seriousErrors.push(message.text());
    });

    await page.goto('/');
    await expect(page.locator('.app-sidebar')).toBeVisible();
    await expect(page.locator('.app-header')).toBeHidden();
    await expect(page.locator('.brand.user-dropdown-container')).toBeVisible();
    await expect(page.locator('.app-sidebar')).toHaveCSS('position', 'fixed');
    await expect(page.locator('.app-sidebar')).toHaveCSS('width', /1[0-9]{3}px/);
    await expect(page.locator('.app-main')).toHaveCSS('margin-left', '0px');

    for (const group of ['Kho hàng', 'Khách hàng', 'Báo Cáo']) {
      await expect(page.locator('.menu-group-title', { hasText: group })).toBeVisible();
    }

    const productGroup = page.locator('.menu-group', { has: page.locator('.menu-group-title', { hasText: 'Sản phẩm' }) });
    await productGroup.locator('.menu-group-title').click();
    await expect(productGroup.locator('.menu-panel')).toBeVisible();
    await productGroup.locator('a[href="/products/inventory"]').click();
    await expect(page).toHaveURL(/\/products\/inventory/);
    await expect(productGroup.locator('.menu-group-title')).toHaveClass(/active/);
    await expect(productGroup.locator('a[href="/products/inventory"]')).toHaveClass(/active/);

    const reportGroup = page.locator('.menu-group', { has: page.locator('a[href="/reports/revenue/time"]') });
    await reportGroup.locator('.menu-group-title').click();
    await expect(reportGroup.locator('.reports-panel')).toBeVisible();
    await expect(reportGroup.locator('.reports-panel .submenu-trigger', { hasText: 'Doanh thu' })).toBeVisible();
    await reportGroup.locator('a[href="/reports/revenue/time"]').click();
    await expect(page).toHaveURL(/\/reports\/revenue\/time/);
    await expect(reportGroup.locator('.menu-group-title')).toHaveClass(/active/);

    await page.reload();
    await expect(page.locator('.app-sidebar')).toBeVisible();
    await expect(page.locator('.app-header')).toBeHidden();
    await expect(page).toHaveURL(/\/reports\/revenue\/time/);

    const ownerMenu = page.locator('a[href="/staff/accounts"]');
    if (await ownerMenu.count()) {
      const staffGroup = page.locator('.menu-group', { has: ownerMenu });
      await staffGroup.locator('.menu-group-title').click();
      await expect(ownerMenu).toBeVisible();
    }

    const brand = page.locator('.brand.user-dropdown-container');
    await brand.click();
    await expect(page.locator('.user-dropdown-action.danger')).toBeVisible();
    await page.locator('.user-dropdown-action.danger').click();
    await expect(page).toHaveURL(/\/login/);

    expect(seriousErrors.filter((text) => !text.includes('favicon'))).toEqual([]);
  });

  test('mobile drawer opens, closes, navigates, and closes after route click', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/customers/list');
    await expect(page.locator('.app-header')).toBeVisible();
    await expect(page.locator('.menu-toggle')).toBeVisible();
    await expect(page.locator('.app-shell')).not.toHaveClass(/sidebar-open/);

    await page.locator('.menu-toggle').click();
    await expect(page.locator('.app-shell')).toHaveClass(/sidebar-open/);
    await expect(page.locator('.app-sidebar')).toBeVisible();

    await page.locator('.sidebar-close').click();
    await expect(page.locator('.app-shell')).not.toHaveClass(/sidebar-open/);

    await page.locator('.menu-toggle').click();
    const customerGroup = page.locator('.menu-group', { has: page.locator('a[href="/customers/care"]') });
    await expect(customerGroup.locator('a[href="/customers/care"]')).toBeVisible();
    await customerGroup.locator('a[href="/customers/care"]').evaluate((node: HTMLAnchorElement) => node.click());
    await expect(page).toHaveURL(/\/customers\/care/);
    await expect(page.locator('.app-shell')).not.toHaveClass(/sidebar-open/);
  });
});
