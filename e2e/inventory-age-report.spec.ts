import { expect, type Page, test } from '@playwright/test';

const ADMIN_USER = {
  name: 'Admin E2E',
  email: 'admin-e2e@ladystars.local',
  role: 'ADMIN',
  status: 'active',
};

function storagePayload(overrides: Record<string, unknown> = {}) {
  return {
    items: [
      {
        _id: 's1',
        code: 'SP01',
        name: 'Áo thun',
        qty: 5,
        cost: 10000,
        daysFromStart: 45,
        daysFromLast: 45,
        daysFromLastSold: null,
        status: 'unsold_long',
        statusLabel: 'Chưa bán lâu',
        lastSoldDate: null,
      },
    ],
    total: 1,
    page: 1,
    limit: 15,
    kpis: {
      totalProducts: 12,
      unsoldLong: 4,
      slowSelling: 3,
      totalValue: 9_000_000,
      thresholdDays: 30,
      ageBuckets: [
        { key: '0_30', label: '0–30 ngày', min: 0, max: 30, count: 5, value: 1_000_000 },
        { key: '31_60', label: '31–60 ngày', min: 31, max: 60, count: 4, value: 3_000_000 },
        { key: '61_90', label: '61–90 ngày', min: 61, max: 90, count: 2, value: 2_000_000 },
        { key: 'over_90', label: 'Trên 90 ngày', min: 91, max: null, count: 1, value: 3_000_000 },
      ],
    },
    breakdowns: {
      ageBuckets: [
        { key: '0_30', label: '0–30 ngày', min: 0, max: 30, count: 5, value: 1_000_000 },
        { key: '31_60', label: '31–60 ngày', min: 31, max: 60, count: 4, value: 3_000_000 },
      ],
    },
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
  await page.route('**/api/products/categories**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], total: 0 }) });
  });
  await page.route('**/api/system/branches**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ _id: '1', name: 'Kho A', code: 'A' }], total: 1 }),
    });
  });
  await page.route('**/api/branches**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ _id: '1', name: 'Kho A', code: 'A' }], total: 1 }),
    });
  });
}

test.describe('Inventory age report tab (AGE)', () => {
  test.beforeEach(async ({ page }) => {
    await seed(page);
  });

  test('AGE-01 deep-link segments', async ({ page }) => {
    await page.route('**/api/products/storage-duration**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(storagePayload()) });
    });
    await page.goto('/products/storage-duration?tab=unsold_long');
    await expect(page.getByRole('tab', { name: 'Tuổi tồn' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('tab', { name: /Tồn lâu/ })).toHaveAttribute('aria-selected', 'true');

    await page.goto('/products/storage-duration?tab=slow_selling');
    await expect(page.getByRole('tab', { name: /Bán chậm/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('AGE-02 query hydration without infinite loop', async ({ page }) => {
    const urls: string[] = [];
    await page.route('**/api/products/storage-duration**', async (route) => {
      urls.push(route.request().url());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(storagePayload()) });
    });
    await page.goto('/products/storage-duration?q=SP01&branchId=1&categoryId=c1&minStartDays=30&minSoldDays=20&minStock=1');
    await expect.poll(() => urls.length >= 1).toBeTruthy();
    await page.waitForTimeout(400);
    const after = urls.length;
    await page.waitForTimeout(400);
    expect(urls.length).toBe(after);
    expect(urls.some((u) => u.includes('q=SP01'))).toBeTruthy();
    expect(urls.some((u) => u.includes('branchId=1'))).toBeTruthy();
  });

  test('AGE-04 KPI from server not page rows', async ({ page }) => {
    await page.route('**/api/products/storage-duration**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(storagePayload()) });
    });
    await page.goto('/products/storage-duration');
    await expect(page.getByTestId('storage-kpi-products')).toContainText('12');
    await expect(page.getByTestId('storage-kpi-unsold')).toContainText('4');
    await expect(page.getByTestId('storage-kpi-slow')).toContainText('3');
  });

  test('AGE-05 age buckets chart from server', async ({ page }) => {
    await page.route('**/api/products/storage-duration**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(storagePayload()) });
    });
    await page.goto('/products/storage-duration');
    await expect(page.getByTestId('storage-age-chart')).toBeVisible();
    await expect(page.getByTestId('storage-age-chart-card')).toContainText('0–30 ngày');
  });

  test('AGE-07 never sold label', async ({ page }) => {
    await page.route('**/api/products/storage-duration**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(storagePayload()) });
    });
    await page.goto('/products/storage-duration');
    await expect(page.locator('body')).not.toContainText('Invalid Date');
    await expect(page.locator('body')).not.toContainText('NaN');
  });

  test('AGE-08 empty error retry', async ({ page }) => {
    let n = 0;
    await page.route('**/api/products/storage-duration**', async (route) => {
      n += 1;
      if (n === 1) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'fail' }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(storagePayload({
          items: [],
          total: 0,
          kpis: {
            totalProducts: 0,
            unsoldLong: 0,
            slowSelling: 0,
            totalValue: 0,
            thresholdDays: 30,
            ageBuckets: [],
          },
        })),
      });
    });
    await page.goto('/products/storage-duration');
    // toast error then refresh via button if available
    const refresh = page.getByRole('button', { name: /Làm mới|Thử lại/ }).first();
    if (await refresh.count()) await refresh.click();
    await expect(page.getByTestId('storage-age-chart-empty')).toBeVisible();
  });
});
