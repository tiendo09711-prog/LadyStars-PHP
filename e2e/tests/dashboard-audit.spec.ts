import { expect, test } from '@playwright/test';

const apiBase = 'http://localhost:4000';

function fmt(value: number) {
  return Number(value || 0).toLocaleString('vi-VN');
}

async function getToken(page: any) {
  return page.evaluate(() => localStorage.getItem('token'));
}

async function apiDashboard(page: any, query = '') {
  const token = await getToken(page);
  const response = await page.request.get(`${apiBase}/api/dashboard${query ? `?${query}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test.describe('Dashboard audit', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    await expect(page.getByTestId('summary-revenue-value')).toBeVisible();
  });

  test('loads dashboard data from API', async ({ page }) => {
    const data = await apiDashboard(page);
    await expect(page.getByTestId('summary-revenue-value')).toHaveText(fmt(data.totals.revenue));
    await expect(page.getByTestId('sales-channels-table')).toBeVisible();
    await expect(page.getByTestId('recent-sales-list')).toBeVisible();
  });

  test('date filter updates revenue to match API', async ({ page }) => {
    const target = await apiDashboard(page, 'date=30%20ng%C3%A0y');
    await page.getByTestId('date-filter').getByRole('button').click();
    await page.getByRole('button', { name: '30 ngày' }).click();
    await expect(page.getByTestId('summary-revenue-value')).toHaveText(fmt(target.totals.revenue));
  });

  test('store filter updates inventory to match API', async ({ page }) => {
    const base = await apiDashboard(page);
    const stores: string[] = base.availableStores ?? [];
    test.skip(!stores.length, 'No stores available to test.');

    let chosenStore = stores[0];
    let chosenData = await apiDashboard(page, `stores=${encodeURIComponent(chosenStore)}`);
    for (const store of stores.slice(0, 5)) {
      const candidate = await apiDashboard(page, `stores=${encodeURIComponent(store)}`);
      if (candidate.inventory.totalQty !== base.inventory.totalQty || candidate.totals.revenue !== base.totals.revenue) {
        chosenStore = store;
        chosenData = candidate;
        break;
      }
    }

    await page.getByTestId('store-filter-button').click();
    await page.getByTestId('store-filter-panel').getByText(chosenStore).click();
    await expect(page.getByTestId('inventory-totalQty-value')).toHaveText(fmt(chosenData.inventory.totalQty));
  });

  test('chart mode and column settings respond', async ({ page }) => {
    await page.getByTestId('chart-type-filter').getByRole('button').click();
    await page.getByRole('button', { name: 'Đường doanh thu' }).click();
    await expect(page.getByTestId('chart-shell')).toHaveAttribute('data-chart-type', 'line');

    await page.getByTestId('display-settings-button').click();
    await expect(page.getByTestId('column-settings-modal')).toBeVisible();
    await page.getByTestId('column-toggle-ads').locator('input').uncheck();
    await page.getByTestId('column-settings-modal').getByRole('button', { name: /lưu/i }).click();
    await expect(page.getByRole('columnheader', { name: 'Ads' })).toHaveCount(0);
  });
});
