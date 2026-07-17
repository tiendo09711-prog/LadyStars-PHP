import { expect, type Page, type Route, test } from '@playwright/test';

const ADMIN_USER = {
  name: 'Admin E2E',
  email: 'admin-e2e@ladystars.local',
  role: 'ADMIN',
  status: 'active',
};

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function defaultRange() {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  return { fromDate: ymd(start), toDate: ymd(end) };
}

function sampleReport(overrides: Record<string, unknown> = {}) {
  const { fromDate, toDate } = defaultRange();
  return {
    filters: {
      fromDate,
      toDate,
      warehouseId: '',
      type: '',
      q: '',
      page: 1,
      perPage: 20,
      sortBy: 'date',
      sortDir: 'desc',
    },
    summary: {
      totalIn: 100,
      totalOut: 40,
      netQty: 60,
      lineCount: 2,
      documentCount: 2,
      valueIn: 1000000,
      valueOut: 400000,
    },
    timeline: [
      { key: fromDate, label: '01/07', periodKey: fromDate, qtyIn: 100, qtyOut: 0, netQty: 100, lineCount: 1 },
      { key: toDate, label: '17/07', periodKey: toDate, qtyIn: 0, qtyOut: 40, netQty: -40, lineCount: 1 },
    ],
    breakdowns: {
      byType: [
        { type: 'IMPORT', label: 'Nhập', qtyIn: 100, qtyOut: 0, lineCount: 1 },
        { type: 'EXPORT', label: 'Xuất', qtyIn: 0, qtyOut: 40, lineCount: 1 },
      ],
    },
    table: {
      data: [
        {
          id: 'r1',
          date: `${fromDate} 09:00:00`,
          billCode: 'PN-001',
          type: 'IMPORT',
          typeLabel: 'Nhập',
          warehouseId: 'wh1',
          warehouseName: 'Kho A',
          productCode: 'SP01',
          productName: 'Áo thun',
          barcode: null,
          qtyIn: 100,
          qtyOut: 0,
          netQty: 100,
          valueIn: 1000000,
          valueOut: 0,
          unitPrice: 10000,
          createdByName: 'Admin',
          source: 'inventory-voucher',
          sourceId: 'iv1',
          detailPath: null,
        },
        {
          id: 'r2',
          date: `${toDate} 10:00:00`,
          billCode: 'PX-001',
          type: 'EXPORT',
          typeLabel: 'Xuất',
          warehouseId: 'wh1',
          warehouseName: 'Kho A',
          productCode: 'SP01',
          productName: 'Áo thun',
          barcode: null,
          qtyIn: 0,
          qtyOut: 40,
          netQty: -40,
          valueIn: 0,
          valueOut: 400000,
          unitPrice: 10000,
          createdByName: 'Admin',
          source: 'inventory-voucher',
          sourceId: 'iv2',
          detailPath: null,
        },
      ],
      totals: {
        qtyIn: 100,
        qtyOut: 40,
        netQty: 60,
        lineCount: 2,
        valueIn: 1000000,
        valueOut: 400000,
      },
      pagination: { page: 1, perPage: 20, total: 2, totalPages: 1 },
    },
    meta: {
      generatedAt: '2026-07-17T10:00:00+07:00',
      timezone: 'Asia/Ho_Chi_Minh',
      currency: 'VND',
      capabilities: { valueMetrics: true, transferLines: true, exportAll: true },
    },
    ...overrides,
  };
}

async function seedSession(page: Page) {
  await page.addInitScript((user) => {
    localStorage.setItem('token', 'local-laravel-token-1');
    localStorage.setItem('authUser', JSON.stringify(user));
  }, ADMIN_USER);

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_USER) });
  });
  await page.route('**/api/settings/store', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ shopName: 'LadyStars' }),
    });
  });
  await page.route('**/api/reports/inventory/in-out-stock/options**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        warehouses: [
          { value: 'wh1', label: 'Kho A', code: 'A' },
          { value: 'wh2', label: 'Kho B', code: 'B' },
        ],
        types: [
          { value: 'IMPORT', label: 'Nhập' },
          { value: 'EXPORT', label: 'Xuất' },
          { value: 'TRANSFER', label: 'Chuyển kho' },
        ],
        perPageOptions: [20, 50, 100],
        timezone: 'Asia/Ho_Chi_Minh',
        currency: 'VND',
        maxRangeDays: 366,
        capabilities: { valueMetrics: true, transferLines: true, exportAll: true },
      }),
    });
  });
}

function parseQuery(url: string): URLSearchParams {
  const u = new URL(url);
  return u.searchParams;
}

test.describe('Inventory in-out stock report (INOUT)', () => {
  test.beforeEach(async ({ page }) => {
    await seedSession(page);
  });

  test('INOUT-01 open direct URL with shell and single h1', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.route('**/api/reports/inventory/in-out-stock?**', async (route) => {
      if (route.request().url().includes('/options')) return route.fallback();
      if (route.request().url().includes('/export')) return route.fallback();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sampleReport()) });
    });

    await page.goto('/reports/inventory/in-out-stock');
    await expect(page.getByRole('heading', { level: 1, name: 'Báo cáo kho hàng' })).toHaveCount(1);
    await expect(page.getByRole('tab', { name: 'Xuất nhập tồn' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('inout-stock-page')).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('INOUT-02 default request params are sane', async ({ page }) => {
    const { fromDate, toDate } = defaultRange();
    let seen: URLSearchParams | null = null;

    await page.route('**/api/reports/inventory/in-out-stock?**', async (route) => {
      const url = route.request().url();
      if (url.includes('/options') || url.includes('/export')) return route.fallback();
      seen = parseQuery(url);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sampleReport()) });
    });

    await page.goto('/reports/inventory/in-out-stock');
    await expect.poll(() => seen !== null).toBeTruthy();
    expect(seen!.get('fromDate')).toBe(fromDate);
    expect(seen!.get('toDate')).toBe(toDate);
    expect(seen!.get('page')).toBe('1');
    expect(seen!.get('perPage')).toBe('20');
    expect(seen!.toString()).not.toContain('undefined');
    expect(seen!.toString()).not.toContain('null');
    expect(seen!.toString()).not.toContain('NaN');
  });

  test('INOUT-03 apply filters updates request and UI', async ({ page }) => {
    let last: URLSearchParams | null = null;
    await page.route('**/api/reports/inventory/in-out-stock?**', async (route) => {
      const url = route.request().url();
      if (url.includes('/options') || url.includes('/export')) return route.fallback();
      last = parseQuery(url);
      const type = last.get('type') || '';
      const body = sampleReport({
        summary: {
          totalIn: type === 'EXPORT' ? 0 : 12,
          totalOut: type === 'IMPORT' ? 0 : 5,
          netQty: type === 'EXPORT' ? -5 : 7,
          lineCount: 1,
          documentCount: 1,
          valueIn: 120000,
          valueOut: 50000,
        },
      });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });

    await page.goto('/reports/inventory/in-out-stock');
    await expect(page.getByTestId('kpi-total-in')).toBeVisible();

    await page.locator('#inout-warehouse').selectOption('wh1');
    await page.locator('#inout-type').selectOption('IMPORT');
    await page.locator('#inout-from').fill('2026-07-01');
    await page.locator('#inout-to').fill('2026-07-10');
    await page.getByRole('button', { name: 'Áp dụng' }).click();

    await expect.poll(() => last?.get('warehouseId') === 'wh1').toBeTruthy();
    expect(last!.get('type')).toBe('IMPORT');
    expect(last!.get('fromDate')).toBe('2026-07-01');
    expect(last!.get('toDate')).toBe('2026-07-10');
    await expect(page.getByTestId('kpi-total-in')).toHaveText('12');
  });

  test('INOUT-04 validation blocks request when from > to', async ({ page }) => {
    let reportHits = 0;
    await page.route('**/api/reports/inventory/in-out-stock?**', async (route) => {
      const url = route.request().url();
      if (url.includes('/options') || url.includes('/export')) return route.fallback();
      reportHits += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sampleReport()) });
    });

    await page.goto('/reports/inventory/in-out-stock');
    await expect.poll(() => reportHits >= 1).toBeTruthy();
    const baseline = reportHits;

    await page.locator('#inout-from').fill('2026-07-20');
    await page.locator('#inout-to').fill('2026-07-01');
    await page.getByRole('button', { name: 'Áp dụng' }).click();

    await expect(page.getByRole('alert')).toContainText('Từ ngày không được sau Đến ngày');
    expect(reportHits).toBe(baseline);
  });

  test('INOUT-05 reset restores defaults and reloads once', async ({ page }) => {
    const { fromDate, toDate } = defaultRange();
    const hits: string[] = [];
    await page.route('**/api/reports/inventory/in-out-stock?**', async (route) => {
      const url = route.request().url();
      if (url.includes('/options') || url.includes('/export')) return route.fallback();
      hits.push(url);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sampleReport()) });
    });

    await page.goto('/reports/inventory/in-out-stock');
    await expect.poll(() => hits.length >= 1).toBeTruthy();

    await page.locator('#inout-warehouse').selectOption('wh2');
    await page.locator('#inout-type').selectOption('EXPORT');
    await page.locator('#inout-q').fill('ABC');
    await page.getByRole('button', { name: 'Áp dụng' }).click();
    await expect.poll(() => hits.some((u) => u.includes('warehouseId=wh2'))).toBeTruthy();
    const beforeReset = hits.length;

    await page.getByRole('button', { name: 'Đặt lại' }).click();
    await expect.poll(() => hits.length).toBe(beforeReset + 1);
    const last = parseQuery(hits[hits.length - 1]);
    expect(last.get('fromDate')).toBe(fromDate);
    expect(last.get('toDate')).toBe(toDate);
    expect(last.get('page')).toBe('1');
    expect(last.get('warehouseId')).toBeNull();
    expect(last.get('type')).toBeNull();
    expect(last.get('q')).toBeNull();
    await expect(page.locator('#inout-warehouse')).toHaveValue('');
    await expect(page.locator('#inout-type')).toHaveValue('');
    await expect(page.locator('#inout-q')).toHaveValue('');
  });

  test('INOUT-06 stale response is ignored', async ({ page }) => {
    let releaseSlow: (() => void) | null = null;
    let slowReleased = false;
    let requestIndex = 0;

    await page.route('**/api/reports/inventory/in-out-stock**', async (route) => {
      const url = route.request().url();
      if (url.includes('/options') || url.includes('/export')) {
        return route.fallback();
      }

      requestIndex += 1;
      const idx = requestIndex;
      const params = parseQuery(url);

      // #1 bootstrap
      if (idx === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(sampleReport({
            summary: { totalIn: 1, totalOut: 0, netQty: 1, lineCount: 1, documentCount: 1, valueIn: 1, valueOut: 0 },
          })),
        });
        return;
      }

      // Slow request A (IMPORT) — held until after B settles
      if (params.get('type') === 'IMPORT') {
        await new Promise<void>((resolve) => {
          releaseSlow = () => {
            slowReleased = true;
            resolve();
          };
        });
        try {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(sampleReport({
              summary: { totalIn: 999, totalOut: 0, netQty: 999, lineCount: 1, documentCount: 1, valueIn: 1, valueOut: 0 },
            })),
          });
        } catch {
          // Request may already be aborted by the newer filter request.
        }
        return;
      }

      // Fast request B
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(sampleReport({
          summary: { totalIn: 7, totalOut: 0, netQty: 7, lineCount: 1, documentCount: 1, valueIn: 1, valueOut: 0 },
        })),
      });
    });

    await page.goto('/reports/inventory/in-out-stock');
    await expect(page.getByTestId('kpi-total-in')).toHaveText('1');

    await page.locator('#inout-type').selectOption('IMPORT');
    await page.getByRole('button', { name: 'Áp dụng' }).click();
    await expect.poll(() => releaseSlow !== null).toBeTruthy();

    await page.locator('#inout-type').selectOption('EXPORT');
    await page.getByRole('button', { name: 'Áp dụng' }).click();
    await expect(page.getByTestId('kpi-total-in')).toHaveText('7');

    releaseSlow?.();
    await expect.poll(() => slowReleased).toBeTruthy();
    await expect(page.getByTestId('kpi-total-in')).toHaveText('7');
  });

  test('INOUT-07 empty state', async ({ page }) => {
    await page.route('**/api/reports/inventory/in-out-stock?**', async (route) => {
      const url = route.request().url();
      if (url.includes('/options') || url.includes('/export')) return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(sampleReport({
          summary: { totalIn: 0, totalOut: 0, netQty: 0, lineCount: 0, documentCount: 0, valueIn: 0, valueOut: 0 },
          timeline: [
            { key: '2026-07-01', label: '01/07', periodKey: '2026-07-01', qtyIn: 0, qtyOut: 0, netQty: 0, lineCount: 0 },
          ],
          breakdowns: { byType: [] },
          table: {
            data: [],
            totals: { qtyIn: 0, qtyOut: 0, netQty: 0, lineCount: 0, valueIn: 0, valueOut: 0 },
            pagination: { page: 1, perPage: 20, total: 0, totalPages: 1 },
          },
        })),
      });
    });

    await page.goto('/reports/inventory/in-out-stock');
    await expect(page.getByTestId('inout-table-empty')).toBeVisible();
    await expect(page.getByTestId('inout-chart-empty')).toBeVisible();
    await expect(page.getByTestId('kpi-total-in')).toHaveText('0');
    await expect(page.locator('body')).not.toContainText('NaN');
  });

  test('INOUT-08 error and retry', async ({ page }) => {
    let attempt = 0;
    await page.route('**/api/reports/inventory/in-out-stock?**', async (route) => {
      const url = route.request().url();
      if (url.includes('/options') || url.includes('/export')) return route.fallback();
      attempt += 1;
      if (attempt === 1) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Server error' }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sampleReport()) });
    });

    await page.goto('/reports/inventory/in-out-stock');
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect(page.getByTestId('kpi-total-in')).toHaveText('100');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('INOUT-09 pagination and sorting keep filters', async ({ page }) => {
    const hits: URLSearchParams[] = [];
    await page.route('**/api/reports/inventory/in-out-stock?**', async (route) => {
      const url = route.request().url();
      if (url.includes('/options') || url.includes('/export')) return route.fallback();
      const params = parseQuery(url);
      hits.push(params);
      const pageNo = Number(params.get('page') || 1);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(sampleReport({
          table: {
            data: sampleReport().table.data,
            totals: sampleReport().table.totals,
            pagination: { page: pageNo, perPage: 20, total: 40, totalPages: 2 },
          },
        })),
      });
    });

    await page.goto('/reports/inventory/in-out-stock');
    await page.locator('#inout-warehouse').selectOption('wh1');
    await page.getByRole('button', { name: 'Áp dụng' }).click();
    await expect.poll(() => hits.some((h) => h.get('warehouseId') === 'wh1')).toBeTruthy();

    await page.getByRole('button', { name: 'Sau' }).click();
    await expect.poll(() => hits.some((h) => h.get('page') === '2' && h.get('warehouseId') === 'wh1')).toBeTruthy();

    await page.getByRole('button', { name: 'Thời gian' }).click();
    await expect.poll(() => hits.some((h) => h.get('sortBy') === 'date' && h.get('warehouseId') === 'wh1')).toBeTruthy();
  });

  test('INOUT-10 export uses applied filters and filename', async ({ page }) => {
    const downloads: string[] = [];
    await page.route('**/api/reports/inventory/in-out-stock?**', async (route) => {
      const url = route.request().url();
      if (url.includes('/options') || url.includes('/export')) return route.fallback();
      downloads.push(url);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sampleReport()) });
    });

    await page.goto('/reports/inventory/in-out-stock');
    await page.locator('#inout-warehouse').selectOption('wh1');
    // Draft only — do not apply yet
    await page.locator('#inout-q').fill('DRAFT-ONLY');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Xuất CSV' }).click();
    const download = await downloadPromise;
    const suggested = download.suggestedFilename();
    expect(suggested).toMatch(/^xuat-nhap-ton-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/);

    // Export fetch uses applied filters (no warehouse until apply)
    const exportUrls = downloads.filter((u) => u.includes('perPage=100') || u.includes('page='));
    expect(exportUrls.some((u) => u.includes('DRAFT-ONLY'))).toBeFalsy();
  });
});
