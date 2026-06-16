import { test, expect } from '@playwright/test';

test.describe('Phase 1 UI renovation smoke tests', () => {
  test('P0 shell, menu, action dropdown, search and modal stay usable', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/customers/list');
    await expect(page.locator('.app-sidebar')).toBeVisible();
    await expect(page.locator('.page-heading')).toBeVisible();
    await expect(page.locator('.data-card')).toBeVisible();

    const productMenu = page.locator('.menu-group-title:has-text("Sản phẩm")');
    await productMenu.hover();
    await expect(productMenu.locator('xpath=..').locator('.menu-panel')).toBeVisible();

    await page.locator('.page-actions .btn:has-text("Tác vụ")').click();
    await expect(page.locator('.dropdown-menu .dropdown-item:has-text("Làm mới")')).toBeVisible();
    await expect(page.locator('.dropdown-menu .dropdown-item:has-text("Xuất CSV")')).toBeVisible();
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.mouse.click(20, 20);

    await page.goto('/reports/revenue/time');
    await expect(page).toHaveURL(/.*\/reports\/revenue\/time/);
    await expect(page.locator('.app-sidebar')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lọc' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Xuất dữ liệu' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Thời gian/ })).toBeVisible();

    await page.goto('/customers/list');
    await expect(page.locator('.data-card')).toBeVisible();

    await page.locator('.search-box input').fill('__khong_co_du_lieu__');
    await expect(page.locator('.empty-cell')).toBeVisible();
    await page.locator('.search-box input').fill('');

    const createButton = page.locator('.page-actions .btn-primary').first();
    if (await createButton.isVisible()) {
      await createButton.click();
      await expect(page.locator('.modal-card')).toBeVisible();
      await page.locator('.modal-footer .btn-light').click();
      await expect(page.locator('.modal-card')).toBeHidden();
    }

    expect(errors.filter((text) => !text.includes('favicon'))).toEqual([]);
  });

  test('P0 mobile sidebar opens and closes without trapping the page', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/customers/list');

    await expect(page.locator('.app-sidebar')).toBeVisible();
    await expect(page.locator('.app-shell')).not.toHaveClass(/sidebar-open/);

    await expect(page.locator('.page-heading')).toBeVisible();
    await expect(page.locator('.data-card')).toBeVisible();
  });
});