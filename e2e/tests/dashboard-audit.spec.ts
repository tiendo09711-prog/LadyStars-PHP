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
    await page.evaluate(() => {
      localStorage.removeItem('dashboard.dateRange');
      localStorage.removeItem('dashboard.chartRange');
      localStorage.removeItem('dashboard.chartType');
    });
    await page.reload();
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    await expect(page.getByTestId('summary-revenue-value')).toBeVisible();
  });

  test('loads dashboard data from API', async ({ page }) => {
    const data = await apiDashboard(page);
    await expect(page.getByTestId('summary-revenue-value')).toHaveText(fmt(data.totals.revenue));
    await expect(page.getByTestId('recent-sales-list')).toBeVisible();
    await expect(page.getByTestId('sales-channels-table')).toHaveCount(0);
    await expect(page.getByTestId('dashboard-status')).toHaveCount(0);
    await expect(page.getByTestId('display-settings-button')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Số dư ví' })).toHaveCount(0);
    await expect(page.getByTestId('recent-range-filter').getByRole('button')).toHaveText(/Hôm nay/);
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

  test('chart mode responds', async ({ page }) => {
    await page.getByTestId('chart-type-filter').getByRole('button').click();
    await page.getByRole('button', { name: 'Đường doanh thu' }).click();
    await expect(page.getByTestId('chart-shell')).toHaveAttribute('data-chart-type', 'line');
  });

  test('time filters persist after reload', async ({ page }) => {
    await page.getByTestId('date-filter').getByRole('button').click();
    await page.getByRole('button', { name: '30 ngày' }).click();

    await page.getByTestId('chart-range-filter').getByRole('button').click();
    await page.getByRole('button', { name: '14 ngày' }).click();

    await page.getByTestId('chart-type-filter').getByRole('button').click();
    await page.getByRole('button', { name: 'Đường doanh thu' }).click();

    await page.reload();
    await expect(page.getByTestId('date-filter').getByRole('button')).toHaveText(/30 ngày/);
    await expect(page.getByTestId('chart-range-filter').getByRole('button')).toHaveText(/14 ngày/);
    await expect(page.getByTestId('chart-shell')).toHaveAttribute('data-chart-type', 'line');
  });

  test('recent sales range filter responds', async ({ page }) => {
    await page.getByTestId('recent-range-filter').getByRole('button').click();
    await page.getByRole('button', { name: '3 ngày' }).click();
    await expect(page.getByTestId('recent-range-filter').getByRole('button')).toHaveText(/3 ngày/);
  });
});
