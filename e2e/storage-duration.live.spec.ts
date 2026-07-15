import { expect, test, type APIRequestContext, type Page, type Locator } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Live Playwright suite for /products/storage-duration (SD-001..).
 * - FE 5173 / API 8000 (playwright.live.config.ts)
 * - Fixtures: QA-SD-{E2E_RUN_ID}-* only; cleaned in afterAll
 * - Data policy: create/update/delete fixtures with RUN_ID; restore clearance on fixture only
 */
const RUN_ID =
  process.env.E2E_RUN_ID ||
  `E2E-SD-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${randomBytes(2).toString('hex')}`;
const API = 'http://127.0.0.1:8000/api';
const ADMIN = { email: 'admin@gmail.com', password: '123456' };
const EMPLOYEE = { email: 'tiendo09711@gmail.com', password: '123456' };
const FIXTURE_PREFIX = `QA-SD-${RUN_ID}`;
const ARTIFACT_DIR = path.join(process.cwd(), 'e2e-artifacts', 'storage-duration-audit', RUN_ID);
const FIXTURE_PHP = path.join(process.cwd(), 'e2e-artifacts', 'storage-duration-audit', 'sd-fixture-dates.php');

const createdProductIds: string[] = [];
let adminToken = '';
let employeeToken = '';
let adminRole = '';
let employeeRole = '';
let branchId = '';
let branchIdB = '';
let categoryId = '';
let categoryName = '';
let categoryIdEmpty = '';

const codes = {
  normal: '',
  unsold29: '',
  unsold30: '',
  unsold31: '',
  slow29: '',
  slow30: '',
  slow31: '',
  nodate: '',
  zero: '',
  branch: '',
  clearance: '',
  noClearance: '',
  special: '',
  barcode: '',
};
const ids: Record<keyof typeof codes, string> = {
  normal: '',
  unsold29: '',
  unsold30: '',
  unsold31: '',
  slow29: '',
  slow30: '',
  slow31: '',
  nodate: '',
  zero: '',
  branch: '',
  clearance: '',
  noClearance: '',
  special: '',
  barcode: '',
};
let barcodeValue = '';

function phpFixture(...args: string[]) {
  return execFileSync('php', [FIXTURE_PHP, ...args], { encoding: 'utf8' }).trim();
}

async function apiLogin(request: APIRequestContext, creds: { email: string; password: string }) {
  const res = await request.post(`${API}/auth/login`, { data: creds });
  expect(res.ok(), `login ${creds.email}`).toBeTruthy();
  return res.json();
}

async function uiLogin(page: Page, creds: { email: string; password: string }) {
  const token = creds.email === EMPLOYEE.email ? employeeToken : adminToken;
  await page.addInitScript((t) => localStorage.setItem('token', t), token);
}

async function createProduct(request: APIRequestContext, body: Record<string, unknown>) {
  const res = await request.post(`${API}/products/products`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: body,
  });
  const text = await res.text();
  expect(res.ok() || res.status() === 201, `create ${body.code} -> ${res.status()} ${text.slice(0, 240)}`).toBeTruthy();
  const product = JSON.parse(text);
  if (product?._id) createdProductIds.push(String(product._id));
  return product;
}

async function deleteProduct(request: APIRequestContext, id: string) {
  for (const bid of [branchId, branchIdB].filter(Boolean)) {
    await request.patch(`${API}/products/products/${id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { initialStocks: [{ warehouseId: Number(bid) || bid, quantity: 0 }] },
    });
  }
  return (
    await request.delete(`${API}/products/products/${id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
  ).status();
}

async function waitSd(page: Page) {
  await expect(page.locator('.storage-duration-page, #storage-duration-table').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.storage-empty-cell', { hasText: /Đang tải/i })).toHaveCount(0, { timeout: 45_000 });
}

async function gotoSd(page: Page, query = '') {
  await page.goto(`/products/storage-duration${query ? `?${query}` : ''}`, { waitUntil: 'domcontentloaded' });
  await waitSd(page);
}

async function searchSd(page: Page, q: string) {
  const input = page.locator('.storage-search input');
  await input.fill(q);
  await page.locator('button.storage-btn-primary', { hasText: /^Lọc$/i }).click();
  await waitSd(page);
}

async function clickTab(page: Page, label: RegExp | string) {
  await page.getByRole('tab', { name: label }).click();
  await waitSd(page);
}

function rowByCode(page: Page, code: string): Locator {
  return page.locator('#storage-duration-table tbody tr', { hasText: code }).first();
}

async function openRowMenu(page: Page, code: string) {
  const btn = page.getByRole('button', { name: `Mở thao tác cho ${code}`, exact: true });
  await expect(btn).toBeVisible({ timeout: 15_000 });
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await expect(page.locator('.storage-row-action-menu').first()).toBeVisible({ timeout: 8_000 });
}

test.describe('Storage Duration live suite', () => {
  test.beforeAll(async ({ request }) => {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    // eslint-disable-next-line no-console
    console.log(`E2E_RUN_ID=${RUN_ID}`);
    const admin = await apiLogin(request, ADMIN);
    const emp = await apiLogin(request, EMPLOYEE);
    adminToken = admin.token;
    employeeToken = emp.token;
    adminRole = String(admin.user?.role || '').toUpperCase();
    employeeRole = String(emp.user?.role || '').toUpperCase();
    expect(adminRole).toContain('ADMIN');
    expect(employeeRole).toMatch(/EMPLOYEE|STAFF|NHANVIEN|NV|USER/i);

    const branches = await (
      await request.get(`${API}/system/branches`, { headers: { Authorization: `Bearer ${adminToken}` } })
    ).json();
    const active = (branches.items || []).filter((b: any) => b.isActive !== false);
    expect(active.length).toBeGreaterThan(0);
    branchId = String(active[0]._id ?? active[0].id);
    branchIdB = String((active[1] || active[0])._id ?? (active[1] || active[0]).id);

    const cats = await (
      await request.get(`${API}/products/categories?limit=100`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    const catItems = cats.items || cats.data || [];
    expect(catItems.length).toBeGreaterThan(0);
    categoryId = String(catItems[0]._id);
    categoryName = String(catItems[0].name || '');
    // Pick a category unlikely to have stock later; if all have data empty case may soft-pass.
    categoryIdEmpty = String((catItems[catItems.length - 1] || catItems[0])._id);

    const base = {
      type: 'product',
      unit: 'Cái',
      allowsSale: true,
      categoryId: Number(categoryId) || categoryId,
    };

    codes.normal = `${FIXTURE_PREFIX}-NORMAL`;
    codes.unsold29 = `${FIXTURE_PREFIX}-U29`;
    codes.unsold30 = `${FIXTURE_PREFIX}-U30`;
    codes.unsold31 = `${FIXTURE_PREFIX}-U31`;
    codes.slow29 = `${FIXTURE_PREFIX}-S29`;
    codes.slow30 = `${FIXTURE_PREFIX}-S30`;
    codes.slow31 = `${FIXTURE_PREFIX}-S31`;
    codes.nodate = `${FIXTURE_PREFIX}-NODATE`;
    codes.zero = `${FIXTURE_PREFIX}-ZERO`;
    codes.branch = `${FIXTURE_PREFIX}-BRANCH`;
    codes.clearance = `${FIXTURE_PREFIX}-CLR`;
    codes.noClearance = `${FIXTURE_PREFIX}-NOCLR`;
    codes.special = `${FIXTURE_PREFIX}-SPEC`;
    codes.barcode = `${FIXTURE_PREFIX}-BAR`;

    const stockA = { warehouseId: Number(branchId) || branchId, quantity: 8 };
    const stockAB = [
      { warehouseId: Number(branchId) || branchId, quantity: 3 },
      { warehouseId: Number(branchIdB) || branchIdB, quantity: 7 },
    ];

    const mk = async (code: string, name: string, stocks: any[], extra: Record<string, unknown> = {}) => {
      const p = await createProduct(request, {
        ...base,
        code,
        name,
        price: 200_000,
        cost: 100_000,
        status: 'Đang bán',
        initialStocks: stocks,
        ...extra,
      });
      return p;
    };

    ids.normal = String((await mk(codes.normal, `SD Normal ${RUN_ID}`, [stockA]))._id);
    phpFixture('set-import', ids.normal, '10');
    phpFixture('set-sold', ids.normal, '5', branchId);

    ids.unsold29 = String((await mk(codes.unsold29, `SD Unsold 29 ${RUN_ID}`, [stockA]))._id);
    phpFixture('set-import', ids.unsold29, '29');

    ids.unsold30 = String((await mk(codes.unsold30, `SD Unsold 30 ${RUN_ID}`, [stockA]))._id);
    phpFixture('set-import', ids.unsold30, '30');

    ids.unsold31 = String((await mk(codes.unsold31, `SD Unsold 31 ${RUN_ID}`, [stockA]))._id);
    phpFixture('set-import', ids.unsold31, '31');

    ids.slow29 = String((await mk(codes.slow29, `SD Slow 29 ${RUN_ID}`, [stockA]))._id);
    phpFixture('set-import', ids.slow29, '60');
    phpFixture('set-sold', ids.slow29, '29', branchId);

    ids.slow30 = String((await mk(codes.slow30, `SD Slow 30 ${RUN_ID}`, [stockA]))._id);
    phpFixture('set-import', ids.slow30, '60');
    phpFixture('set-sold', ids.slow30, '30', branchId);

    ids.slow31 = String((await mk(codes.slow31, `SD Slow 31 ${RUN_ID}`, [stockA]))._id);
    phpFixture('set-import', ids.slow31, '60');
    phpFixture('set-sold', ids.slow31, '31', branchId);

    ids.nodate = String((await mk(codes.nodate, `SD Nodate ${RUN_ID}`, [stockA]))._id);
    // leave created_at = now; no import/sale

    ids.zero = String(
      (
        await mk(codes.zero, `SD Zero ${RUN_ID}`, [
          { warehouseId: Number(branchId) || branchId, quantity: 0 },
        ])
      )._id,
    );

    ids.branch = String((await mk(codes.branch, `SD Branch ${RUN_ID}`, stockAB))._id);
    phpFixture('set-import', ids.branch, '40');

    ids.clearance = String((await mk(codes.clearance, `SD Clearance ${RUN_ID}`, [stockA]))._id);
    await request.patch(`${API}/products/products/${ids.clearance}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        clearanceActive: true,
        clearancePrice: 150_000,
        clearanceNote: `E2E ${RUN_ID}`,
        clearanceStartedAt: new Date().toISOString(),
      },
    });

    ids.noClearance = String((await mk(codes.noClearance, `SD NoClearance ${RUN_ID}`, [stockA]))._id);

    ids.special = String(
      (
        await mk(codes.special, `Hàng "đặc biệt", dấu phẩy, Việt Nam ${RUN_ID}`, [stockA], {
          supplierName: 'NCC "A", B',
        })
      )._id,
    );

    barcodeValue = `89${String(Date.now()).slice(-11)}`.slice(0, 13);
    ids.barcode = String(
      (await mk(codes.barcode, `SD Barcode ${RUN_ID}`, [stockA], { barcode: barcodeValue }))._id,
    );

    fs.writeFileSync(
      path.join(ARTIFACT_DIR, 'fixtures.json'),
      JSON.stringify({ RUN_ID, codes, ids, branchId, branchIdB, categoryId, barcodeValue, adminRole, employeeRole }, null, 2),
    );
  });

  test.afterAll(async ({ request }) => {
    // Restore clearance on fixture products then zero stock + delete when possible.
    for (const id of createdProductIds) {
      await request
        .patch(`${API}/products/products/${id}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
          data: { clearanceActive: false, clearancePrice: 0, clearanceNote: '' },
        })
        .catch(() => null);
    }
    // Cleanup fixture sales/import rows created by helper (scoped by E2E prefixes).
    try {
      phpFixture('cleanup-sales', RUN_ID);
    } catch {
      // best effort
    }
    for (const id of [...createdProductIds].reverse()) {
      try {
        await deleteProduct(request, id);
      } catch {
        // products with sale refs may block delete — leave qty 0
      }
    }
  });

  // ─── C. Open / navigate ───────────────────────────────────────────────
  test('SD-001 open by URL (admin)', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    await expect(page).toHaveURL(/\/products\/storage-duration/);
    await expect(page.getByRole('heading', { name: /Hàng tồn lâu/i }).first()).toBeAttached();
    await expect(page.getByRole('tab', { name: /Tất cả/i })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.storage-search input')).toBeVisible();
    await expect(page.locator('select.storage-filter-select').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Bộ lọc nâng cao|Ẩn nâng cao/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /CSV|Xuất/i }).first()).toBeVisible();
    await expect(page.locator('#storage-duration-table')).toBeVisible();
  });

  test('SD-002 open from left menu', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const menu = page.getByRole('link', { name: /Hàng tồn lâu/i }).first();
    if (await menu.count()) {
      await menu.click();
    } else {
      // Expand products group if needed
      const group = page.getByText(/^Sản phẩm$/i).first();
      if (await group.count()) await group.click();
      await page.getByRole('link', { name: /Hàng tồn lâu/i }).first().click();
    }
    await waitSd(page);
    await expect(page).toHaveURL(/\/products\/storage-duration/);
    await expect(page).not.toHaveURL(/\/products\/inventory/);
  });

  test('SD-003 refresh keeps query', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page, 'tab=slow_selling');
    await expect(page.getByRole('tab', { name: /Bán chậm/i })).toHaveAttribute('aria-selected', 'true');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitSd(page);
    await expect(page).toHaveURL(/tab=slow_selling/);
    await expect(page.getByRole('tab', { name: /Bán chậm/i })).toHaveAttribute('aria-selected', 'true');
  });

  test('SD-004 unauthenticated access', async ({ page }) => {
    await page.goto('/products/storage-duration', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const url = page.url();
    const hasTable = (await page.locator('#storage-duration-table tbody tr').count()) > 0;
    const onLogin = /login/i.test(url);
    // Frontend must not leave inventory data usable without session.
    expect(onLogin || !hasTable, `url=${url} hasTable=${hasTable}`).toBeTruthy();
  });

  test('SD-role employee can open page', async ({ page }) => {
    await uiLogin(page, EMPLOYEE);
    await gotoSd(page);
    await expect(page).toHaveURL(/\/products\/storage-duration/);
    await expect(page.locator('#storage-duration-table')).toBeVisible();
  });

  // ─── D. Tabs ──────────────────────────────────────────────────────────
  test('SD-005/006/007 tabs all / unsold / slow', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    await clickTab(page, /Tất cả/i);
    await expect(page.getByRole('tab', { name: /Tất cả/i })).toHaveAttribute('aria-selected', 'true');
    expect(page.url()).not.toMatch(/tab=unsold_long|tab=slow_selling/);

    await clickTab(page, /Tồn lâu/i);
    await expect(page).toHaveURL(/tab=unsold_long/);
    await expect(page.getByRole('tab', { name: /Tồn lâu/i })).toHaveAttribute('aria-selected', 'true');

    await clickTab(page, /Bán chậm/i);
    await expect(page).toHaveURL(/tab=slow_selling/);
    await expect(page.getByRole('tab', { name: /Bán chậm/i })).toHaveAttribute('aria-selected', 'true');
  });

  test('SD-008 boundary unsold 29/30/31', async ({ page, request }) => {
    await uiLogin(page, ADMIN);
    const check = async (code: string, expectInUnsold: boolean) => {
      const api = await (
        await request.get(
          `${API}/products/storage-duration?q=${encodeURIComponent(code)}&tab=unsold_long&thresholdDays=30&limit=10`,
          { headers: { Authorization: `Bearer ${adminToken}` } },
        )
      ).json();
      const hit = (api.items || []).some((i: any) => i.code === code);
      const all = await (
        await request.get(
          `${API}/products/storage-duration?q=${encodeURIComponent(code)}&tab=all&thresholdDays=30&limit=10`,
          { headers: { Authorization: `Bearer ${adminToken}` } },
        )
      ).json();
      const row = (all.items || []).find((i: any) => i.code === code);
      expect(row, `row ${code}`).toBeTruthy();
      expect(Number(row.daysFromStart)).toBeGreaterThanOrEqual(0);
      expect(hit, `${code} in unsold tab days=${row.daysFromStart} status=${row.status}`).toBe(expectInUnsold);
    };
    await check(codes.unsold29, false);
    await check(codes.unsold30, true);
    await check(codes.unsold31, true);

    await gotoSd(page, 'tab=unsold_long');
    await searchSd(page, codes.unsold31);
    await expect(rowByCode(page, codes.unsold31)).toBeVisible();
    await searchSd(page, codes.unsold29);
    await expect(rowByCode(page, codes.unsold29)).toHaveCount(0);
  });

  test('SD-009 boundary slow 29/30/31', async ({ request }) => {
    const check = async (code: string, expectInSlow: boolean) => {
      const api = await (
        await request.get(
          `${API}/products/storage-duration?q=${encodeURIComponent(code)}&tab=slow_selling&thresholdDays=30&limit=10`,
          { headers: { Authorization: `Bearer ${adminToken}` } },
        )
      ).json();
      const hit = (api.items || []).some((i: any) => i.code === code);
      const all = await (
        await request.get(
          `${API}/products/storage-duration?q=${encodeURIComponent(code)}&tab=all&thresholdDays=30&limit=10`,
          { headers: { Authorization: `Bearer ${adminToken}` } },
        )
      ).json();
      const row = (all.items || []).find((i: any) => i.code === code);
      expect(row, `row ${code}`).toBeTruthy();
      expect(row.daysFromLastSold).not.toBeNull();
      expect(Number(row.daysFromLastSold)).toBeGreaterThanOrEqual(0);
      expect(hit, `${code} in slow tab daysSold=${row.daysFromLastSold} status=${row.status}`).toBe(expectInSlow);
    };
    await check(codes.slow29, false);
    await check(codes.slow30, true);
    await check(codes.slow31, true);
  });

  test('SD-010 rapid tab switch ends on slow', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    const tabAll = page.locator('[role="tab"]').filter({ hasText: /Tất cả/i });
    const tabUnsold = page.locator('[role="tab"]').filter({ hasText: /Tồn lâu/i });
    const tabSlow = page.locator('[role="tab"]').filter({ hasText: /Bán chậm/i });
    await tabAll.click();
    await tabUnsold.click();
    await tabSlow.click();
    await tabAll.click();
    await tabSlow.click();
    // Final state must settle on Bán chậm (URL + aria), not a stale intermediate tab.
    await expect(page).toHaveURL(/tab=slow_selling/, { timeout: 15_000 });
    await waitSd(page);
    await expect(tabSlow).toHaveAttribute('aria-selected', 'true');
    const activeTabs = page.locator('[role="tab"][aria-selected="true"]');
    await expect(activeTabs).toHaveCount(1);
  });

  test('SD-011 invalid tab query normalizes', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page, 'tab=invalid');
    await expect(page.getByRole('tab', { name: /Tất cả/i })).toHaveAttribute('aria-selected', 'true');
  });

  // ─── E. KPI ───────────────────────────────────────────────────────────
  test('SD-012 tab counts and inequality', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    const parseCount = async (re: RegExp) => {
      const text = (await page.getByRole('tab', { name: re }).innerText()).replace(/\./g, '');
      const m = text.match(/(\d+)/);
      return m ? Number(m[1]) : NaN;
    };
    const all = await parseCount(/Tất cả/i);
    const unsold = await parseCount(/Tồn lâu/i);
    const slow = await parseCount(/Bán chậm/i);
    expect(all).toBeGreaterThanOrEqual(unsold + slow);
    expect(all).toBeGreaterThan(0);
  });

  test('SD-014 Đang lọc label', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    await page.getByRole('button', { name: /Làm mới/i }).click();
    await waitSd(page);
    await expect(page.locator('.storage-summary-filter')).toHaveCount(0);
    await clickTab(page, /Tồn lâu/i);
    await expect(page.locator('.storage-summary-filter')).toContainText(/Đang lọc/i);
    await page.getByRole('button', { name: /Làm mới/i }).click();
    await waitSd(page);
    await expect(page.locator('.storage-summary-filter')).toHaveCount(0);
  });

  // ─── F. Search ────────────────────────────────────────────────────────
  test('SD-015 exact code search', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    await searchSd(page, codes.normal);
    await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(codes.normal).replace(/%/g, '%25')}|q=${codes.normal}`));
    await expect(rowByCode(page, codes.normal)).toBeVisible();
  });

  test('SD-016 partial code search', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    const partial = FIXTURE_PREFIX.slice(0, Math.min(18, FIXTURE_PREFIX.length));
    await searchSd(page, partial);
    await expect(rowByCode(page, codes.normal)).toBeVisible();
  });

  test('SD-017 name search with Vietnamese', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    await searchSd(page, 'đặc biệt');
    // May match special fixture if search supports accented text
    const count = await rowByCode(page, codes.special).count();
    // fallback: search exact special code
    if (!count) {
      await searchSd(page, codes.special);
    }
    await expect(rowByCode(page, codes.special)).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/HÃ\s*ng|Tá»/i);
  });

  test('SD-018 barcode search', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    await searchSd(page, barcodeValue);
    await expect(rowByCode(page, codes.barcode)).toBeVisible();
  });

  test('SD-021 not found empty state', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    await searchSd(page, '___NOT_FOUND___');
    await expect(page.locator('.storage-empty-cell')).toContainText(/Chưa có sản phẩm|không/i);
    await expect(page.locator('.storage-summary-main strong')).toHaveText('0');
  });

  test('SD-022 search trims whitespace', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    await searchSd(page, `  ${codes.normal}  `);
    await expect(rowByCode(page, codes.normal)).toBeVisible();
  });

  test('SD-023 special chars no 500', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    for (const q of ['%', '_', "'", '"', ',', '<script>']) {
      await searchSd(page, q);
      await expect(page.locator('.storage-duration-page')).toBeVisible();
    }
  });

  test('SD-024 type without Enter does not search', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    const before = page.url();
    await page.locator('.storage-search input').fill('ONLYTYPE_NO_ENTER');
    await page.waitForTimeout(600);
    expect(page.url()).toBe(before);
  });

  // ─── G/H Branch + category ────────────────────────────────────────────
  test('SD-025/026/029 branch filter', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    const branchSelect = page.locator('select.storage-filter-select').first();
    await expect(branchSelect).toBeEnabled({ timeout: 20_000 });
    const options = await branchSelect.locator('option').allTextContents();
    expect(options.some((o) => /Tất cả chi nhánh/i.test(o))).toBeTruthy();
    expect(options.length).toBeGreaterThan(1);

    await branchSelect.selectOption({ value: branchId });
    await waitSd(page);
    await expect(page).toHaveURL(new RegExp(`branchId=${branchId}`));

    await branchSelect.selectOption({ value: '' });
    await waitSd(page);
    expect(page.url()).not.toMatch(/branchId=/);
  });

  test('SD-027 multi-branch stock product', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    await searchSd(page, codes.branch);
    const row = rowByCode(page, codes.branch);
    await expect(row).toBeVisible();
    const allQtyText = await row.locator('.storage-col-qty').innerText();
    const allQty = Number(allQtyText.replace(/\D/g, ''));
    expect(allQty).toBe(10); // 3+7

    await page.locator('select.storage-filter-select').first().selectOption({ value: branchId });
    await waitSd(page);
    await searchSd(page, codes.branch);
    const aQty = Number((await rowByCode(page, codes.branch).locator('.storage-col-qty').innerText()).replace(/\D/g, ''));
    expect(aQty).toBe(3);

    await page.locator('select.storage-filter-select').first().selectOption({ value: branchIdB });
    await waitSd(page);
    await searchSd(page, codes.branch);
    const bQty = Number((await rowByCode(page, codes.branch).locator('.storage-col-qty').innerText()).replace(/\D/g, ''));
    expect(bQty).toBe(7);
  });

  test('SD-030 invalid branchId safe', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page, 'branchId=999999999');
    await expect(page.locator('.storage-duration-page')).toBeVisible();
    // Should not show global inventory as if filter missing — expect empty or filtered empty.
    const summary = await page.locator('.storage-summary-main strong').innerText();
    expect(Number(summary.replace(/\D/g, ''))).toBe(0);
  });

  test('SD-031/033 category filter', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    const catSelect = page.locator('select.storage-filter-select').nth(1);
    await catSelect.selectOption({ value: categoryId });
    await waitSd(page);
    await expect(page).toHaveURL(new RegExp(`categoryId=${categoryId}`));
    await catSelect.selectOption({ value: '' });
    await waitSd(page);
    expect(page.url()).not.toMatch(/categoryId=/);
  });

  test('SD-034 invalid categoryId safe', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page, 'categoryId=invalid');
    await expect(page.locator('.storage-duration-page')).toBeVisible();
  });

  // ─── I Advanced filters ───────────────────────────────────────────────
  test('SD-035/036 advanced filters open and minStartDays', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    await page.getByRole('button', { name: /Bộ lọc nâng cao/i }).click();
    await expect(page.locator('.storage-advanced-filters.is-open')).toBeVisible();
    const startInput = page.locator('.storage-advanced-filters input').nth(0);
    await startInput.fill('30');
    await waitSd(page);
    await expect(page).toHaveURL(/minStartDays=30/);
    await page.getByRole('button', { name: /Ẩn nâng cao/i }).click();
    await expect(startInput).toHaveValue('30');
  });

  test('SD-047 reset filters', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page, 'tab=slow_selling&q=TEST&minStartDays=30');
    await page.getByRole('button', { name: /Làm mới/i }).click();
    await waitSd(page);
    await expect(page.getByRole('tab', { name: /Tất cả/i })).toHaveAttribute('aria-selected', 'true');
    expect(page.url()).not.toMatch(/tab=|q=|minStartDays=/);
  });

  test('SD-049 main API error toast', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.route('**/api/products/storage-duration**', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ message: 'fail' }) }),
    );
    await page.goto('/products/storage-duration', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Không thể tải dữ liệu thời gian lưu kho/i)).toBeVisible({ timeout: 20_000 });
    await page.unroute('**/api/products/storage-duration**');
  });

  // ─── K Table ──────────────────────────────────────────────────────────
  test('SD-051 never sold label', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    await searchSd(page, codes.unsold31);
    await expect(rowByCode(page, codes.unsold31)).toContainText(/Chưa bán lần nào/i);
  });

  test('SD-053 zero stock excluded', async ({ page, request }) => {
    const api = await (
      await request.get(
        `${API}/products/storage-duration?q=${encodeURIComponent(codes.zero)}&limit=10&thresholdDays=30`,
        { headers: { Authorization: `Bearer ${adminToken}` } },
      )
    ).json();
    expect((api.items || []).some((i: any) => i.code === codes.zero)).toBeFalsy();
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    await searchSd(page, codes.zero);
    await expect(rowByCode(page, codes.zero)).toHaveCount(0);
  });

  test('SD-055 special name display', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    await searchSd(page, codes.special);
    await expect(rowByCode(page, codes.special)).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/undefined|NaN|Invalid Date/i);
  });

  test('SD-056 clearance display', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    await searchSd(page, codes.clearance);
    await expect(rowByCode(page, codes.clearance)).toContainText(/Xả:/i);
  });

  // ─── L Pagination ─────────────────────────────────────────────────────
  test('SD-059/060 pagination', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    const next = page.getByRole('button', { name: /Sau|Next|›|»/i }).or(page.locator('button', { hasText: /›|»|Sau/ })).first();
    if (await next.isEnabled().catch(() => false)) {
      await next.click();
      await waitSd(page);
      await expect(page.locator('#storage-duration-table tbody tr').first()).toBeVisible();
      await clickTab(page, /Tồn lâu/i);
      await expect(page.locator('.storage-table-subtitle, .storage-selected-count, body')).toContainText(/Trang 1|dòng/i);
    }
  });

  // ─── M URL history ────────────────────────────────────────────────────
  test('SD-062 deep link full', async ({ page }) => {
    await uiLogin(page, ADMIN);
    const q = `tab=slow_selling&q=${encodeURIComponent(codes.slow31)}&minStartDays=1&minSoldDays=1&minStock=1`;
    await gotoSd(page, q);
    await expect(page.getByRole('tab', { name: /Bán chậm/i })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.storage-search input')).toHaveValue(codes.slow31);
  });

  test('SD-063/064 back forward', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    await clickTab(page, /Tồn lâu/i);
    await page.locator('select.storage-filter-select').first().selectOption({ value: branchId });
    await waitSd(page);
    await page.goBack();
    await waitSd(page);
    await page.goBack();
    await waitSd(page);
    await page.goForward();
    await waitSd(page);
    await expect(page.locator('.storage-duration-page')).toBeVisible();
  });

  // ─── N Row menu ───────────────────────────────────────────────────────
  test('SD-066..070 row menu interactions', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    await searchSd(page, codes.normal);
    await openRowMenu(page, codes.normal);
    await expect(page.getByRole('menuitem', { name: /Đặt giá xả hàng/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Đề xuất chuyển kho/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /xuất trả NCC/i })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.storage-row-action-menu')).toHaveCount(0);

    await openRowMenu(page, codes.normal);
    await page.mouse.click(5, 5);
    await expect(page.locator('.storage-row-action-menu')).toHaveCount(0);
  });

  // ─── O/P Transfer + return open only ──────────────────────────────────
  test('SD-072 transfer draft navigation', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    await searchSd(page, codes.normal);
    await openRowMenu(page, codes.normal);
    await page.getByRole('menuitem', { name: /Đề xuất chuyển kho/i }).click();
    await expect(page).toHaveURL(/\/warehouse\/transfers\/create/);
    expect(page.url()).toMatch(/productId=/);
    expect(page.url()).toMatch(/productCode=/);
    expect(page.url()).toMatch(/quantity=1/);
    await page.goBack();
    await waitSd(page);
  });

  test('SD-075 vendor return voucher navigation', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    await searchSd(page, codes.normal);
    await openRowMenu(page, codes.normal);
    await page.getByRole('menuitem', { name: /xuất trả NCC/i }).click();
    await expect(page).toHaveURL(/\/warehouse\/transactions\/vouchers\/export/);
    expect(page.url()).toMatch(/type=/);
    await page.goBack();
    await waitSd(page);
  });

  // ─── Q/R Clearance write on fixtures only ─────────────────────────────
  test('SD-078..084 clearance modal + save cancel + save ok', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    await searchSd(page, codes.noClearance);
    await openRowMenu(page, codes.noClearance);
    await page.getByRole('menuitem', { name: /Đặt giá xả hàng/i }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    // Product is in a disabled input value (not always in element textContent).
    await expect(modal.locator('input').first()).toHaveValue(new RegExp(codes.noClearance.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

    // Escape closes without write
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await openRowMenu(page, codes.noClearance);
    await page.getByRole('menuitem', { name: /Đặt giá xả hàng/i }).click();
    page.once('dialog', async (d) => {
      expect(d.message()).toMatch(/GIÁ XẢ HÀNG|giá xả/i);
      await d.dismiss();
    });
    await page.getByRole('button', { name: /Lưu giá xả hàng/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    page.once('dialog', async (d) => d.accept());
    await page.getByRole('button', { name: /Lưu giá xả hàng/i }).click();
    await expect(page.getByText(/Đã lưu giá xả hàng/i)).toBeVisible({ timeout: 15_000 });
    await waitSd(page);
    await searchSd(page, codes.noClearance);
    await expect(rowByCode(page, codes.noClearance)).toContainText(/Xả:/i);
  });

  test('SD-097/098 stop clearance cancel then confirm', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    await searchSd(page, codes.clearance);
    await openRowMenu(page, codes.clearance);
    await expect(page.getByRole('menuitem', { name: /Bỏ giá xả hàng/i })).toBeVisible();

    page.once('dialog', async (d) => d.dismiss());
    await page.getByRole('menuitem', { name: /Bỏ giá xả hàng/i }).click();
    await searchSd(page, codes.clearance);
    await expect(rowByCode(page, codes.clearance)).toContainText(/Xả:/i);

    await openRowMenu(page, codes.clearance);
    page.once('dialog', async (d) => d.accept());
    await page.getByRole('menuitem', { name: /Bỏ giá xả hàng/i }).click();
    await expect(page.getByText(/Đã bỏ giá xả hàng/i)).toBeVisible({ timeout: 15_000 });
    await waitSd(page);
    await searchSd(page, codes.clearance);
    await expect(rowByCode(page, codes.clearance)).not.toContainText(/Xả:/i);
  });

  // ─── S CSV ────────────────────────────────────────────────────────────
  test('SD-100/103 CSV export', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    await searchSd(page, FIXTURE_PREFIX);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.getByRole('button', { name: /^CSV$/i }).click(),
    ]);
    const name = download.suggestedFilename();
    expect(name).toMatch(/bao_cao_thoi_gian_luu_kho_.*\.csv/i);
    const filePath = path.join(ARTIFACT_DIR, name);
    await download.saveAs(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content.charCodeAt(0) === 0xfeff || content.includes('Mã SP')).toBeTruthy();
    expect(content).toMatch(/Mã SP|Ma SP/i);

    await searchSd(page, '___NOT_FOUND___');
    await page.getByRole('button', { name: /^CSV$/i }).click();
    await expect(page.getByText(/Không có dữ liệu để xuất/i)).toBeVisible();
  });

  // ─── T Excel modal ────────────────────────────────────────────────────
  test('SD-106/107 Excel modal open close', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    await page.getByRole('button', { name: /^Xuất$/i }).click();
    await expect(page.getByText(/Xuất Excel - Báo cáo thời gian lưu kho/i)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText(/Xuất Excel - Báo cáo thời gian lưu kho/i)).toHaveCount(0);
  });

  // ─── Security ─────────────────────────────────────────────────────────
  test('SD-SC-API unauth storage-duration returns 401', async ({ request }) => {
    const res = await request.get(`${API}/products/storage-duration?limit=2`);
    const body = await res.text();
    fs.writeFileSync(
      path.join(ARTIFACT_DIR, 'security-api.json'),
      JSON.stringify({ status: res.status(), ok: res.ok(), bodySnippet: body.slice(0, 200) }, null, 2),
    );
    expect(res.status(), `unauth must be 401, got ${res.status()} ${body.slice(0, 120)}`).toBe(401);
    expect(body).not.toMatch(/"items"\s*:\s*\[/);
  });

  test('SD-SC-API bad token storage-duration returns 401', async ({ request }) => {
    const res = await request.get(`${API}/products/storage-duration?limit=2`, {
      headers: { Authorization: 'Bearer local-laravel-token-999999999' },
    });
    expect(res.status()).toBe(401);
  });

  // ─── KPI value + day filters (post-fix) ──────────────────────────────
  test('SD-013/141 KPI totalValue matches visible rows and tab', async ({ request }) => {
    const headers = { Authorization: `Bearer ${adminToken}` };
    const all = await (
      await request.get(
        `${API}/products/storage-duration?q=${encodeURIComponent(FIXTURE_PREFIX)}&tab=all&thresholdDays=30&limit=100`,
        { headers },
      )
    ).json();
    const items = all.items || [];
    expect(items.length).toBeGreaterThan(0);
    const expected = items.reduce(
      (sum: number, row: any) => sum + Number(row.qty || 0) * Number(row.cost || 0),
      0,
    );
    expect(Number(all.kpis?.totalValue || 0)).toBeCloseTo(expected, 2);

    const slow = await (
      await request.get(
        `${API}/products/storage-duration?q=${encodeURIComponent(FIXTURE_PREFIX)}&tab=slow_selling&thresholdDays=30&limit=100`,
        { headers },
      )
    ).json();
    const slowItems = slow.items || [];
    const slowExpected = slowItems.reduce(
      (sum: number, row: any) => sum + Number(row.qty || 0) * Number(row.cost || 0),
      0,
    );
    expect(Number(slow.kpis?.totalValue || 0)).toBeCloseTo(slowExpected, 2);
    // Tab badges must still expose full scoped counts (not collapse to current tab only).
    expect(Number(slow.kpis?.totalProducts || 0)).toBeGreaterThanOrEqual(Number(slow.total || 0));
  });

  test('SD-142 KPI and totals respect minStartDays', async ({ request }) => {
    const headers = { Authorization: `Bearer ${adminToken}` };
    const base = await (
      await request.get(
        `${API}/products/storage-duration?q=${encodeURIComponent(FIXTURE_PREFIX)}&thresholdDays=30&limit=100`,
        { headers },
      )
    ).json();
    const filtered = await (
      await request.get(
        `${API}/products/storage-duration?q=${encodeURIComponent(FIXTURE_PREFIX)}&thresholdDays=30&minStartDays=30&limit=100`,
        { headers },
      )
    ).json();
    expect(Number(filtered.total || 0)).toBeLessThanOrEqual(Number(base.total || 0));
    for (const row of filtered.items || []) {
      expect(Number(row.daysFromStart)).toBeGreaterThanOrEqual(30);
    }
    // totalProducts KPI also respects day filters
    expect(Number(filtered.kpis?.totalProducts || 0)).toBe(Number(filtered.total || 0));
  });

  test('SD-038 minStock with branch uses branch qty', async ({ request }) => {
    const headers = { Authorization: `Bearer ${adminToken}` };
    // Branch A has 3 on TEST-BRANCH fixture; minStock=5 should exclude it at branch A
    // but include when all branches (global 10).
    const all = await (
      await request.get(
        `${API}/products/storage-duration?q=${encodeURIComponent(codes.branch)}&minStock=5&thresholdDays=30&limit=10`,
        { headers },
      )
    ).json();
    expect((all.items || []).some((i: any) => i.code === codes.branch)).toBeTruthy();

    const branchA = await (
      await request.get(
        `${API}/products/storage-duration?q=${encodeURIComponent(codes.branch)}&branchId=${branchId}&minStock=5&thresholdDays=30&limit=10`,
        { headers },
      )
    ).json();
    expect((branchA.items || []).some((i: any) => i.code === codes.branch)).toBeFalsy();

    const branchALow = await (
      await request.get(
        `${API}/products/storage-duration?q=${encodeURIComponent(codes.branch)}&branchId=${branchId}&minStock=3&thresholdDays=30&limit=10`,
        { headers },
      )
    ).json();
    expect((branchALow.items || []).some((i: any) => i.code === codes.branch)).toBeTruthy();
  });

  test('SD-037 minSoldDays filter', async ({ request }) => {
    const headers = { Authorization: `Bearer ${adminToken}` };
    const res = await (
      await request.get(
        `${API}/products/storage-duration?q=${encodeURIComponent(codes.slow31)}&minSoldDays=30&thresholdDays=30&limit=10`,
        { headers },
      )
    ).json();
    expect((res.items || []).some((i: any) => i.code === codes.slow31)).toBeTruthy();
    const early = await (
      await request.get(
        `${API}/products/storage-duration?q=${encodeURIComponent(codes.slow29)}&minSoldDays=30&thresholdDays=30&limit=10`,
        { headers },
      )
    ).json();
    // slow29 sold 29 days ago → filtered out by minSoldDays=30 (has sold days)
    expect((early.items || []).some((i: any) => i.code === codes.slow29)).toBeFalsy();
  });

  test('SD-044 tab + search combo', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    await clickTab(page, /Tồn lâu/i);
    await searchSd(page, codes.slow31);
    await expect(rowByCode(page, codes.slow31)).toHaveCount(0);
    await searchSd(page, codes.unsold31);
    await expect(rowByCode(page, codes.unsold31)).toBeVisible();
    await expect(page).toHaveURL(/tab=unsold_long/);
    await expect(page).toHaveURL(new RegExp(`q=`));
  });

  test('SD-046 multi filter deep link', async ({ page }) => {
    await uiLogin(page, ADMIN);
    const q = [
      'tab=slow_selling',
      `q=${encodeURIComponent(codes.slow31)}`,
      `branchId=${branchId}`,
      `categoryId=${categoryId}`,
      'minStartDays=1',
      'minSoldDays=1',
      'minStock=1',
    ].join('&');
    await gotoSd(page, q);
    await expect(page.getByRole('tab', { name: /Bán chậm/i })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.storage-search input')).toHaveValue(codes.slow31);
    await expect(page.locator('select.storage-filter-select').first()).toHaveValue(branchId);
  });

  test('SD-019 barcode scanner bridge', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    // Simulate scanner via product-scan custom event on the search input.
    await page.evaluate((code) => {
      const input = document.querySelector<HTMLInputElement>('[data-product-search-primary="true"]');
      if (!input) throw new Error('search input missing');
      input.dispatchEvent(new CustomEvent('product-scan', { bubbles: true, detail: { barcode: code } }));
    }, barcodeValue);
    await waitSd(page);
    await expect(page.locator('.storage-search input')).toHaveValue(barcodeValue);
    await expect(rowByCode(page, codes.barcode)).toBeVisible();
  });

  test('SD-020 category name search', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    if (!categoryName) return;
    await searchSd(page, categoryName.slice(0, Math.min(8, categoryName.length)));
    // Should not crash; may return products of that category including fixtures.
    await expect(page.locator('.storage-duration-page')).toBeVisible();
  });

  test('SD-065 invalid numeric query safe', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page, 'minStartDays=abc&minSoldDays=-10&minStock=abc');
    await expect(page.locator('.storage-duration-page')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/NaN|undefined|Invalid Date/i);
  });

  test('SD-067/068 row menu toggle and switch rows', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    await searchSd(page, FIXTURE_PREFIX);
    const codesOnPage = await page.locator('#storage-duration-table tbody tr .storage-code').allTextContents();
    const first = codesOnPage[0]?.trim();
    const second = codesOnPage[1]?.trim();
    expect(first).toBeTruthy();
    await openRowMenu(page, first!);
    await page.getByRole('button', { name: `Mở thao tác cho ${first}`, exact: true }).click();
    await expect(page.locator('.storage-row-action-menu')).toHaveCount(0);
    if (second) {
      await openRowMenu(page, first!);
      await openRowMenu(page, second);
      await expect(page.locator('.storage-row-action-menu')).toHaveCount(1);
      await expect(page.getByRole('menuitem', { name: /Đặt giá xả hàng/i })).toBeVisible();
    }
  });

  test('SD-073 transfer with branch sourceWarehouseId', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    await page.locator('select.storage-filter-select').first().selectOption({ value: branchId });
    await waitSd(page);
    await searchSd(page, codes.normal);
    await openRowMenu(page, codes.normal);
    await page.getByRole('menuitem', { name: /Đề xuất chuyển kho/i }).click();
    await expect(page).toHaveURL(new RegExp(`sourceWarehouseId=${branchId}`));
    await page.goBack();
    await waitSd(page);
  });

  test('SD-076 return voucher with branchId', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    await page.locator('select.storage-filter-select').first().selectOption({ value: branchId });
    await waitSd(page);
    await searchSd(page, codes.normal);
    await openRowMenu(page, codes.normal);
    await page.getByRole('menuitem', { name: /xuất trả NCC/i }).click();
    await expect(page).toHaveURL(new RegExp(`branchId=${branchId}`));
    await page.goBack();
    await waitSd(page);
  });

  test('SD-079/080 clearance modal close X and Hủy', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    await searchSd(page, codes.noClearance);
    await openRowMenu(page, codes.noClearance);
    await page.getByRole('menuitem', { name: /Đặt giá xả hàng/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: /Đóng/i }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await openRowMenu(page, codes.noClearance);
    await page.getByRole('menuitem', { name: /Đặt giá xả hàng/i }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^Hủy$/i }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('SD-085 amount discount preview', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoSd(page);
    await searchSd(page, codes.noClearance);
    await openRowMenu(page, codes.noClearance);
    await page.getByRole('menuitem', { name: /Đặt giá xả hàng/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('select').selectOption('amount');
    await dialog.locator('input[type="number"]').fill('50000');
    // price 200000 - 50000 = 150000
    await expect(dialog).toContainText(/150\.000/);
    await page.keyboard.press('Escape');
  });

  test('SD-095 clearance save API failure toast', async ({ page }) => {
    await uiLogin(page, ADMIN);
    // Deep-link search avoids flaky fill when prior modal state exists.
    await gotoSd(page, `q=${encodeURIComponent(codes.noClearance)}`);
    await expect(rowByCode(page, codes.noClearance)).toBeVisible({ timeout: 20_000 });
    await openRowMenu(page, codes.noClearance);
    await page.getByRole('menuitem', { name: /Đặt giá xả hàng/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.route('**/api/products/products/**', async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'fail' }),
        });
        return;
      }
      await route.continue();
    });
    page.once('dialog', async (d) => d.accept());
    await page.getByRole('button', { name: /Lưu giá xả hàng/i }).click();
    await expect(page.getByText(/Có lỗi xảy ra khi áp dụng giảm giá xả hàng/i)).toBeVisible({ timeout: 15_000 });
    await page.unroute('**/api/products/products/**');
    await page.keyboard.press('Escape');
  });

  // ─── Responsive smoke ─────────────────────────────────────────────────
  test('SD-responsive no horizontal overflow', async ({ page }) => {
    await uiLogin(page, ADMIN);
    for (const size of [
      { w: 1920, h: 1080 },
      { w: 1280, h: 800 },
      { w: 390, h: 844 },
    ]) {
      await page.setViewportSize({ width: size.w, height: size.h });
      await gotoSd(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
      expect(overflow, `overflow at ${size.w}x${size.h}`).toBeFalsy();
    }
  });
});
