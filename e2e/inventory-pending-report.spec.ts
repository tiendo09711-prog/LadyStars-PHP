import { expect, type Page, test } from '@playwright/test';

const ADMIN_USER = {
  name: 'Admin E2E',
  email: 'admin-e2e@ladystars.local',
  role: 'ADMIN',
  status: 'active',
};

function pendingPayload(overrides: Record<string, unknown> = {}) {
  return {
    filters: {},
    summary: {
      totalPending: 5,
      waitingSource: 2,
      inTransit: 2,
      waitingDestination: 2,
      returnInProgress: 1,
      totalQty: 40,
      maxWaitingDays: 9,
    },
    breakdowns: {
      byStatus: [
        { status: 'DRAFT', label: 'Chờ xác nhận xuất', count: 2, totalQty: 10 },
        { status: 'IN_TRANSIT', label: 'Đang chuyển', count: 2, totalQty: 20 },
        { status: 'RETURN_IN_PROGRESS', label: 'Chờ nhận lại hàng trả', count: 1, totalQty: 10 },
      ],
      aging: [
        { key: '0_1', label: '0–1 ngày', min: 0, max: 1, count: 1 },
        { key: 'over_7', label: 'Trên 7 ngày', min: 8, max: null, count: 2 },
      ],
    },
    table: {
      data: [
        {
          id: 'tf1',
          code: 'CK-001',
          createdAt: '2026-07-01T10:00:00+07:00',
          sourceWarehouseId: 'wh1',
          sourceWarehouseName: 'Kho A',
          destinationWarehouseId: 'wh2',
          destinationWarehouseName: 'Kho B',
          itemCount: 2,
          totalQty: 10,
          status: 'DRAFT',
          statusLabel: 'Chờ xác nhận xuất',
          waitingDays: 9,
          createdByName: 'Admin',
          detailPath: '/warehouse/transfers/tf1',
        },
        {
          id: 'tf2',
          code: 'CK-002',
          createdAt: '2026-07-10T10:00:00+07:00',
          sourceWarehouseId: 'wh1',
          sourceWarehouseName: 'Kho A',
          destinationWarehouseId: 'wh2',
          destinationWarehouseName: 'Kho B',
          itemCount: 1,
          totalQty: 5,
          status: 'IN_TRANSIT',
          statusLabel: 'Đang chuyển',
          waitingDays: 2,
          createdByName: 'Admin',
          detailPath: '/warehouse/transfers/tf2',
        },
      ],
      totals: { totalQty: 40, lineCount: 5 },
      pagination: { page: 1, perPage: 20, total: 5, totalPages: 1 },
    },
    meta: {
      generatedAt: '2026-07-17T10:00:00+07:00',
      timezone: 'Asia/Ho_Chi_Minh',
      pendingStatuses: ['DRAFT', 'IN_TRANSIT', 'RETURN_IN_PROGRESS'],
      capabilities: { openTransferLink: true, readOnly: true },
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
  await page.route('**/api/reports/inventory/pending-transfers/options**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        warehouses: [
          { value: 'wh1', label: 'Kho A' },
          { value: 'wh2', label: 'Kho B' },
        ],
        statuses: [
          { value: 'DRAFT', label: 'Chờ xác nhận xuất' },
          { value: 'IN_TRANSIT', label: 'Đang chuyển' },
          { value: 'RETURN_IN_PROGRESS', label: 'Chờ nhận lại hàng trả' },
        ],
        pendingStatuses: ['DRAFT', 'IN_TRANSIT', 'RETURN_IN_PROGRESS'],
        perPageOptions: [20, 50, 100],
        timezone: 'Asia/Ho_Chi_Minh',
        capabilities: { openTransferLink: true, readOnly: true },
      }),
    });
  });
}

test.describe('Inventory pending transfers report (PENDING)', () => {
  test.beforeEach(async ({ page }) => {
    await seed(page);
  });

  test('PENDING-01 open route without placeholder', async ({ page }) => {
    await page.route('**/api/reports/inventory/pending-transfers?**', async (route) => {
      if (route.request().url().includes('/options')) return route.fallback();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pendingPayload()) });
    });
    await page.goto('/reports/inventory/pending-transfers');
    await expect(page.getByRole('tab', { name: 'Chờ xác nhận' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('pending-transfers-page')).toBeVisible();
    await expect(page.getByText('Nội dung báo cáo sẽ được xây dựng sau')).toHaveCount(0);
  });

  test('PENDING-02 only pending canonical statuses in contract', async ({ page }) => {
    let body: ReturnType<typeof pendingPayload> | null = null;
    await page.route('**/api/reports/inventory/pending-transfers?**', async (route) => {
      if (route.request().url().includes('/options')) return route.fallback();
      body = pendingPayload();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('/reports/inventory/pending-transfers');
    await expect(page.getByTestId('pending-kpi-total')).toHaveText('5');
    expect(body!.meta.pendingStatuses).toEqual(['DRAFT', 'IN_TRANSIT', 'RETURN_IN_PROGRESS']);
    expect(body!.meta.pendingStatuses).not.toContain('COMPLETED');
    expect(body!.meta.pendingStatuses).not.toContain('CANCELLED');
  });

  test('PENDING-03 source/destination filters not swapped', async ({ page }) => {
    let last = '';
    await page.route('**/api/reports/inventory/pending-transfers?**', async (route) => {
      if (route.request().url().includes('/options')) return route.fallback();
      last = route.request().url();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pendingPayload()) });
    });
    await page.goto('/reports/inventory/pending-transfers');
    await page.locator('#pending-source').selectOption('wh1');
    await page.locator('#pending-dest').selectOption('wh2');
    await page.getByRole('button', { name: 'Áp dụng' }).click();
    await expect.poll(() => last.includes('sourceWarehouseId=wh1') && last.includes('destinationWarehouseId=wh2')).toBeTruthy();
  });

  test('PENDING-05 KPI independent of page row count', async ({ page }) => {
    await page.route('**/api/reports/inventory/pending-transfers?**', async (route) => {
      if (route.request().url().includes('/options')) return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(pendingPayload({
          table: {
            ...pendingPayload().table,
            data: [pendingPayload().table.data[0]],
            pagination: { page: 1, perPage: 1, total: 5, totalPages: 5 },
          },
        })),
      });
    });
    await page.goto('/reports/inventory/pending-transfers');
    await expect(page.getByTestId('pending-kpi-total')).toHaveText('5');
    await expect(page.getByTestId('pending-table').locator('tbody tr')).toHaveCount(1);
  });

  test('PENDING-07 open transfer is a real link', async ({ page }) => {
    await page.route('**/api/reports/inventory/pending-transfers?**', async (route) => {
      if (route.request().url().includes('/options')) return route.fallback();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pendingPayload()) });
    });
    await page.goto('/reports/inventory/pending-transfers');
    const link = page.getByRole('link', { name: 'Mở chuyển kho' }).first();
    await expect(link).toHaveAttribute('href', '/warehouse/transfers/tf1');
  });

  test('PENDING-09 empty error retry', async ({ page }) => {
    let n = 0;
    await page.route('**/api/reports/inventory/pending-transfers?**', async (route) => {
      if (route.request().url().includes('/options')) return route.fallback();
      n += 1;
      if (n === 1) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'boom' }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(pendingPayload({
          summary: { totalPending: 0, waitingSource: 0, inTransit: 0, waitingDestination: 0, totalQty: 0, maxWaitingDays: 0 },
          breakdowns: { byStatus: [], aging: [] },
          table: { data: [], totals: { totalQty: 0, lineCount: 0 }, pagination: { page: 1, perPage: 20, total: 0, totalPages: 1 } },
        })),
      });
    });
    await page.goto('/reports/inventory/pending-transfers');
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect(page.getByTestId('pending-table-empty')).toBeVisible();
  });

  test('PENDING-10 refresh keeps draft filters and uses applied', async ({ page }) => {
    const urls: string[] = [];
    await page.route('**/api/reports/inventory/pending-transfers?**', async (route) => {
      if (route.request().url().includes('/options')) return route.fallback();
      urls.push(route.request().url());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pendingPayload()) });
    });
    await page.goto('/reports/inventory/pending-transfers');
    await page.locator('#pending-source').selectOption('wh1');
    await page.getByRole('button', { name: 'Áp dụng' }).click();
    await expect.poll(() => urls.some((u) => u.includes('sourceWarehouseId=wh1'))).toBeTruthy();
    await page.locator('#pending-q').fill('DRAFT-ONLY');
    await page.getByRole('button', { name: 'Làm mới' }).click();
    await expect.poll(() => urls.filter((u) => u.includes('sourceWarehouseId=wh1')).length >= 2).toBeTruthy();
    expect(urls[urls.length - 1].includes('DRAFT-ONLY')).toBeFalsy();
    await expect(page.locator('#pending-q')).toHaveValue('DRAFT-ONLY');
  });
});
