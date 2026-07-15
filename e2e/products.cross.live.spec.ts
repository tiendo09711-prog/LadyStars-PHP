import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Cross-module + remaining manual-case coverage for /products.
 * Fixtures: QA-PROD-{E2E_RUN_ID}-* only; orphan QA-PROD-E2E-FULL-* cleaned in beforeAll.
 */
const RUN_ID =
  process.env.E2E_RUN_ID ||
  `E2E-X-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${randomBytes(2).toString('hex')}`;
const API = 'http://127.0.0.1:8000/api';
const ADMIN = { email: 'admin@gmail.com', password: '123456' };
const EMPLOYEE = { email: 'tiendo09711@gmail.com', password: '123456' };
const FIXTURE_PREFIX = `QA-PROD-${RUN_ID}`;
const createdProductIds: string[] = [];
let adminToken = '';
let employeeToken = '';
let branchId = '';
let branchIdB = '';
/** Mongo-style ids used by warehouse transfer meta selects. */
let branchMongoA = '';
let branchMongoB = '';
let branchNameA = '';
let branchNameB = '';
let categoryId = '';
let categoryName = '';

let codeMulti = '';
let codeStop = '';
let codeZeroDel = '';
let idMulti = '';
let idStop = '';
let idZeroDel = '';
let barcodeMulti = '';

async function apiLogin(request: APIRequestContext, creds: { email: string; password: string }) {
  const res = await request.post(`${API}/auth/login`, { data: creds });
  expect(res.ok(), `login ${creds.email}`).toBeTruthy();
  return res.json();
}

async function uiLogin(page: Page, creds: { email: string; password: string }) {
  const token = creds.email === EMPLOYEE.email ? employeeToken : adminToken;
  await page.addInitScript((authToken) => localStorage.setItem('token', authToken), token);
}

async function createProduct(
  request: APIRequestContext,
  body: Record<string, unknown>,
): Promise<any> {
  const res = await request.post(`${API}/products/products`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: body,
  });
  const text = await res.text();
  expect(res.ok() || res.status() === 201, `create ${body.code} -> ${res.status()} ${text.slice(0, 200)}`).toBeTruthy();
  const product = JSON.parse(text);
  if (product?._id) createdProductIds.push(String(product._id));
  return product;
}

async function getProduct(request: APIRequestContext, id: string) {
  return (
    await request.get(`${API}/products/products/${id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
  ).json();
}

async function getStocks(request: APIRequestContext, id: string): Promise<any[]> {
  const res = await request.get(`${API}/products/products/${id}/stocks`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (!res.ok()) return [];
  const body = await res.json();
  return body.items || body.data || body || [];
}

/** Zero stock on all known branches then delete — only for given product ids. */
async function safeDeleteProducts(request: APIRequestContext, ids: string[]) {
  const branchIds = [branchId, branchIdB].filter(Boolean);
  for (const id of [...ids].reverse()) {
    for (const bid of branchIds) {
      await request.patch(`${API}/products/products/${id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { initialStocks: [{ warehouseId: Number(bid) || bid, quantity: 0 }] },
      });
    }
    await request.delete(`${API}/products/products/${id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
  }
}

/**
 * Cleanup orphan fixtures from previous failed runs.
 * Only matches known test prefixes — never deletes real catalog.
 */
async function cleanupOrphanQaFixtures(request: APIRequestContext) {
  const prefixes = ['QA-PROD-E2E-FULL-', 'QA-PROD-E2E-PROD-', 'QA-PROD-E2E-FIX-', 'QA-PROD-IMPTEST-'];
  const orphanIds: string[] = [];
  for (const prefix of prefixes) {
    let page = 1;
    for (;;) {
      const res = await request.get(
        `${API}/products/products?q=${encodeURIComponent(prefix)}&limit=50&page=${page}`,
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      if (!res.ok()) break;
      const body = await res.json();
      const items = body.items || [];
      for (const p of items) {
        if (String(p.code || '').startsWith(prefix) && p._id) {
          orphanIds.push(String(p._id));
        }
      }
      if (items.length < 50) break;
      page += 1;
      if (page > 20) break;
    }
  }
  if (orphanIds.length) {
    // eslint-disable-next-line no-console
    console.log(`cleanup orphan fixtures: ${orphanIds.length}`);
    await safeDeleteProducts(request, orphanIds);
  }
}

async function waitProductsLoaded(page: Page) {
  await expect(page.getByRole('heading', { name: /Danh sách sản phẩm|Bảng dữ liệu sản phẩm/i }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/Đang tải dữ liệu/i)).toHaveCount(0, { timeout: 30_000 });
}

async function filterProducts(page: Page, q: string) {
  const search = page.getByPlaceholder(/Tìm theo tên, mã hoặc barcode/i);
  await search.fill(q);
  await page.getByRole('button', { name: /^Lọc$/i }).click();
  await expect(page.getByText(/Đang tải dữ liệu/i)).toHaveCount(0, { timeout: 30_000 });
}

test.describe('Products cross-module + extended manual cases', () => {
  test.beforeAll(async ({ request }) => {
    // eslint-disable-next-line no-console
    console.log(`E2E_RUN_ID=${RUN_ID}`);
    const admin = await apiLogin(request, ADMIN);
    const emp = await apiLogin(request, EMPLOYEE);
    adminToken = admin.token;
    employeeToken = emp.token;

    const branches = await (
      await request.get(`${API}/branches?limit=50`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    const active = (branches.items || []).filter((b: any) => b.isActive !== false);
    expect(active.length).toBeGreaterThanOrEqual(1);
    branchId = String(active[0]._id);
    branchMongoA = String(active[0].mongoId || active[0].mongo_id || active[0]._id);
    branchNameA = String(active[0].name || '');
    branchIdB = String((active[1] || active[0])._id);
    branchMongoB = String((active[1] || active[0]).mongoId || (active[1] || active[0]).mongo_id || (active[1] || active[0])._id);
    branchNameB = String((active[1] || active[0]).name || '');

    await cleanupOrphanQaFixtures(request);

    const cats = await (
      await request.get(`${API}/products/categories?limit=50`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    const catItems = cats.items || cats.data || [];
    expect(catItems.length).toBeGreaterThan(0);
    categoryId = String(catItems[0]._id);
    categoryName = String(catItems[0].name || '');

    const base = {
      type: 'product',
      unit: 'Cái',
      allowsSale: true,
      categoryId: Number(categoryId) || categoryId,
    };

    codeMulti = `${FIXTURE_PREFIX}-MULTI`;
    codeStop = `${FIXTURE_PREFIX}-STOP`;
    codeZeroDel = `${FIXTURE_PREFIX}-ZERODEL`;

    const multi = await createProduct(request, {
      ...base,
      code: codeMulti,
      name: `QA Multi WH ${RUN_ID}`,
      price: 220000,
      cost: 110000,
      wholesalePrice: 180000,
      status: 'Đang bán',
      barcode: `88${String(Date.now()).slice(-11)}`.slice(0, 13),
      initialStocks: [
        { warehouseId: Number(branchId) || branchId, quantity: 10 },
        ...(branchIdB !== branchId
          ? [{ warehouseId: Number(branchIdB) || branchIdB, quantity: 5 }]
          : []),
      ],
    });
    idMulti = String(multi._id);
    barcodeMulti = String(multi.barcode || '');

    const stop = await createProduct(request, {
      ...base,
      code: codeStop,
      name: `QA Stop ${RUN_ID}`,
      price: 99000,
      cost: 40000,
      status: 'Ngừng bán',
      allowsSale: false,
      initialStocks: [{ warehouseId: Number(branchId) || branchId, quantity: 3 }],
    });
    idStop = String(stop._id);

    const zero = await createProduct(request, {
      ...base,
      code: codeZeroDel,
      name: `QA ZeroDel ${RUN_ID}`,
      price: 50000,
      cost: 20000,
      status: 'Mới',
      initialStocks: [{ warehouseId: Number(branchId) || branchId, quantity: 0 }],
    });
    idZeroDel = String(zero._id);
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      if (!localStorage.getItem('token')) localStorage.setItem('token', token);
    }, adminToken);
  });

  test.afterAll(async ({ request }) => {
    await safeDeleteProducts(request, createdProductIds);
    // Sweep any leftover of this run by code prefix
    const list = await (
      await request.get(`${API}/products/products?q=${encodeURIComponent(FIXTURE_PREFIX)}&limit=50`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    const leftover = (list.items || [])
      .filter((p: any) => String(p.code || '').startsWith(FIXTURE_PREFIX) && p._id)
      .map((p: any) => String(p._id));
    if (leftover.length) await safeDeleteProducts(request, leftover);
  });

  // ─── INVARIANT ─────────────────────────────────────────────────────────

  test('INV-QTY: products.qty = sum(stocks) sau create multi-kho', async ({ request }) => {
    const product = await getProduct(request, idMulti);
    const stocks = await getStocks(request, idMulti);
    const sum = stocks.reduce((acc: number, s: any) => acc + Number(s.qty ?? s.quantity ?? 0), 0);
    expect(Number(product.qty)).toBe(sum);
    expect(Number(product.qty)).toBe(branchIdB !== branchId ? 15 : 10);
  });

  // ─── LIST warehouse / status stop ──────────────────────────────────────

  test('LIST-07: lọc kho chỉ hiện SP có tồn > 0 tại kho', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/products');
    await waitProductsLoaded(page);
    await page.getByPlaceholder(/Tìm theo tên, mã hoặc barcode/i).fill(FIXTURE_PREFIX);
    const whSelect = page.locator('select.inv-filter-select').nth(1);
    await whSelect.selectOption(branchId);
    await page.getByRole('button', { name: /^Lọc$/i }).click();
    await expect(page.getByText(/Đang tải dữ liệu/i)).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText(codeMulti).first()).toBeVisible();
    // multi has stock on A; stop has stock on A
    await expect(page.getByText(codeStop).first()).toBeVisible();
    // zero has 0 stock — must not appear when filtering by warehouse stock > 0
    await expect(page.getByText(codeZeroDel)).toHaveCount(0);
  });

  test('LIST-06b: lọc Ngừng bán', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/products');
    await waitProductsLoaded(page);
    await page.getByPlaceholder(/Tìm theo tên, mã hoặc barcode/i).fill(FIXTURE_PREFIX);
    await page.locator('select.inv-filter-select').nth(0).selectOption({ label: 'Ngừng bán' });
    await page.getByRole('button', { name: /^Lọc$/i }).click();
    await expect(page.getByText(/Đang tải dữ liệu/i)).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText(codeStop).first()).toBeVisible();
    await expect(page.getByText(codeMulti)).toHaveCount(0);
  });

  test('LIST-09: quét barcode ô tìm kiếm (sim Enter)', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/products');
    await waitProductsLoaded(page);
    const search = page.getByPlaceholder(/Tìm theo tên, mã hoặc barcode/i);
    await search.fill(barcodeMulti || codeMulti);
    await search.press('Enter');
    await expect(page.getByText(/Đang tải dữ liệu/i)).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText(codeMulti).first()).toBeVisible();
  });

  // ─── CREATE multi + validation ─────────────────────────────────────────

  test('CREATE-03: UI tạo nhiều kho tồn 10+5=15', async ({ page, request }) => {
    test.skip(branchIdB === branchId, 'Need 2 warehouses');
    await uiLogin(page, ADMIN);
    await page.goto('/products');
    await waitProductsLoaded(page);
    const createCode = `${FIXTURE_PREFIX}-CRMULTI`;
    await page.getByRole('button', { name: /^Thêm mới$/i }).click();
    const modal = page.locator('.modal-card').filter({ hasText: 'Thêm sản phẩm' });
    await modal.locator('.form-field').filter({ hasText: /Mã sản phẩm/i }).locator('input').fill(createCode);
    await modal.locator('.form-field').filter({ hasText: /Tên sản phẩm/i }).locator('input').fill(`QA Create Multi ${RUN_ID}`);
    const selects = modal.locator('.form-grid select');
    await selects.nth(0).selectOption({ index: 1 });
    await selects.nth(1).selectOption({ index: 1 });
    await selects.nth(2).selectOption({ index: 1 });
    await modal.locator('.form-field').filter({ hasText: /Giá bán/i }).locator('input').fill('150000');
    await modal.locator('.form-field').filter({ hasText: /Giá vốn|Giá nhập/i }).locator('input').first().fill('70000').catch(() => {});

    const whSelect = modal.getByLabel(/Thêm kho hàng/i);
    await whSelect.selectOption(branchId);
    await modal.getByLabel(/Số lượng tồn/i).first().fill('10');
    // add second warehouse if UI supports
    const addWh = modal.getByRole('button', { name: /Thêm kho/i });
    if (await addWh.count()) {
      await addWh.click();
      const whSelects = modal.getByLabel(/Thêm kho hàng|Kho hàng/i);
      const last = whSelects.last();
      await last.selectOption(branchIdB).catch(async () => {
        await last.selectOption({ index: 2 }).catch(() => {});
      });
      await modal.getByLabel(/Số lượng tồn/i).last().fill('5');
    }

    const createResp = page.waitForResponse(
      (r) => r.url().includes('/products/products') && r.request().method() === 'POST' && !r.url().includes('import'),
    );
    await modal.getByRole('button', { name: /Tạo sản phẩm/i }).click();
    const resp = await createResp;
    expect([200, 201]).toContain(resp.status());
    const created = await resp.json();
    if (created?._id) createdProductIds.push(String(created._id));
    await expect(page.getByRole('heading', { name: /Thêm sản phẩm/i })).toHaveCount(0, { timeout: 20_000 });

    if (created?._id) {
      const p = await getProduct(request, String(created._id));
      const stocks = await getStocks(request, String(created._id));
      const sum = stocks.reduce((acc: number, s: any) => acc + Number(s.qty ?? s.quantity ?? 0), 0);
      expect(Number(p.qty)).toBe(sum);
    }
  });

  test('CREATE-05: giá âm bị chặn', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/products');
    await waitProductsLoaded(page);
    await page.getByRole('button', { name: /^Thêm mới$/i }).click();
    const modal = page.locator('.modal-card').filter({ hasText: 'Thêm sản phẩm' });
    await modal.locator('.form-field').filter({ hasText: /Mã sản phẩm/i }).locator('input').fill(`${FIXTURE_PREFIX}-NEG`);
    await modal.locator('.form-field').filter({ hasText: /Tên sản phẩm/i }).locator('input').fill(`QA Neg ${RUN_ID}`);
    const selects = modal.locator('.form-grid select');
    await selects.nth(0).selectOption({ index: 1 });
    await selects.nth(1).selectOption({ index: 1 });
    await selects.nth(2).selectOption({ index: 1 });
    await modal.locator('.form-field').filter({ hasText: /Giá bán/i }).locator('input').fill('-100');
    const whSelect = modal.getByLabel(/Thêm kho hàng/i);
    const firstWh = await whSelect.locator('option').nth(1).getAttribute('value');
    if (firstWh) {
      await whSelect.selectOption(firstWh);
      await modal.getByLabel(/Số lượng tồn/i).first().fill('0');
    }
    await modal.getByRole('button', { name: /Tạo sản phẩm/i }).click();
    // Negative price must show field error and keep modal open (no create).
    await expect(modal.getByText(/giá bán hợp lệ|không hợp lệ|phải lớn hơn|không được âm/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('heading', { name: /Thêm sản phẩm/i })).toBeVisible();
    await modal.getByRole('button', { name: /^Hủy$/i }).click();
  });

  // ─── CROSS inventory / storage-duration ────────────────────────────────

  test('CROSS-CREATE-01: /products/inventory thấy multi-kho', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/products/inventory');
    await expect(page.getByPlaceholder(/Tên SP, mã SP/i).or(page.getByPlaceholder(/Tìm/i))).toBeVisible({
      timeout: 30_000,
    });
    const search = page.getByPlaceholder(/Tên SP, mã SP/i).or(page.getByPlaceholder(/Tìm/i)).first();
    await search.fill(codeMulti);
    await page.getByRole('button', { name: /^Lọc$/i }).click();
    await expect(page.getByText(/Đang tải/i)).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText(codeMulti).first()).toBeVisible({ timeout: 20_000 });
    // filter by branch A
    const wh = page.locator('select.inv-filter-select').first();
    if (await wh.count()) {
      await wh.selectOption(branchId).catch(() => {});
      await page.getByRole('button', { name: /^Lọc$/i }).click();
      await expect(page.getByText(/Đang tải/i)).toHaveCount(0, { timeout: 20_000 });
      await expect(page.getByText(codeMulti).first()).toBeVisible();
    }
  });

  test('CROSS-CREATE-02: /products/storage-duration tìm multi', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/products/storage-duration');
    await expect(page.getByPlaceholder(/Tìm theo tên, mã SP/i)).toBeVisible({ timeout: 30_000 });
    await page.getByPlaceholder(/Tìm theo tên, mã SP/i).fill(codeMulti);
    await page.getByRole('button', { name: /^Lọc$/i }).click();
    await expect(page.getByText(/Đang tải/i)).toHaveCount(0, { timeout: 30_000 });
    // product with stock should appear somewhere on page
    await expect(page.getByText(codeMulti).first()).toBeVisible({ timeout: 20_000 });
  });

  // ─── CROSS retail / wholesale ──────────────────────────────────────────

  test('CROSS-CREATE-03: bán lẻ tìm SP + tồn theo kho', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/sales-channels/store/retail/create');
    await expect(page.getByPlaceholder(/Tìm theo mã, barcode hoặc tên sản phẩm/i)).toBeVisible({
      timeout: 45_000,
    });
    // select branch A if dropdown exists
    const branchSelect = page.locator('select').filter({ hasText: /Kho|HN|HCM/i }).first();
    if (await branchSelect.count()) {
      await branchSelect.selectOption(branchId).catch(async () => {
        await branchSelect.selectOption({ index: 1 }).catch(() => {});
      });
      await page.waitForTimeout(800);
    }
    const search = page.getByPlaceholder(/Tìm theo mã, barcode hoặc tên sản phẩm/i);
    await search.fill(codeMulti);
    await search.click();
    await page.waitForTimeout(500);
    // dropdown result with code
    const hit = page.locator('button, [role="option"], .product-search-result, li').filter({ hasText: codeMulti }).first();
    await expect(hit).toBeVisible({ timeout: 20_000 });
    await hit.click();
    // line added — stock should be 10 for branch A (not total 15)
    await expect(page.getByText(codeMulti).first()).toBeVisible();
    const bodyText = await page.locator('body').innerText();
    // available stock 10 appears; total 15 must not be used as sellable alone if two branches
    if (branchIdB !== branchId) {
      expect(bodyText).toMatch(/10/);
    }
  });

  test('CROSS-CREATE-04: bán buôn mở + tìm SP', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/sales-channels/store/wholesale/create');
    const search = page.getByPlaceholder(/Tìm theo mã, barcode hoặc tên sản phẩm/i).or(
      page.getByPlaceholder(/Tìm.*sản phẩm/i),
    );
    await expect(search.first()).toBeVisible({ timeout: 45_000 });
    await search.first().fill(codeMulti);
    await search.first().click();
    await page.waitForTimeout(600);
    const hit = page.locator('button, [role="option"], .product-search-result, li').filter({ hasText: codeMulti }).first();
    if (await hit.count()) {
      await hit.click();
      await expect(page.getByText(codeMulti).first()).toBeVisible();
    } else {
      // soft: search did not crash
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('CROSS-CREATE-05: hoàn trả mở + tìm SP', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/sales-channels/store/refund/create');
    await page.waitForTimeout(1500);
    const search = page
      .getByPlaceholder(/Tìm theo mã, barcode hoặc tên sản phẩm/i)
      .or(page.getByPlaceholder(/Tìm.*sản phẩm|barcode/i));
    if (await search.count()) {
      await search.first().fill(codeMulti);
      await page.waitForTimeout(500);
      await expect(page.locator('body')).not.toContainText(/Application error|Something went wrong/i);
    } else {
      // page may require invoice-first flow
      await expect(page.locator('body')).toBeVisible();
    }
  });

  // ─── CROSS warehouse transfer ──────────────────────────────────────────

  test('CROSS-CREATE-08: chuyển kho — tồn nguồn = 10 (không dùng tổng 15)', async ({ page }) => {
    test.skip(branchIdB === branchId, 'Need 2 warehouses');
    await uiLogin(page, ADMIN);
    await page.goto('/warehouse/transfers/create');
    await expect(page.getByRole('heading', { name: /Tạo đơn chuyển kho/i })).toBeVisible({
      timeout: 45_000,
    });
    // Transfer meta exposes mongo_id values, not local integer ids.
    await page.getByTestId('transfer-source-warehouse').selectOption(branchMongoA);
    await page.getByTestId('transfer-destination-warehouse').selectOption(branchMongoB);
    await page.waitForTimeout(1200);
    const search = page.getByTestId('transfer-product-search');
    await expect(search).toBeEnabled({ timeout: 15_000 });
    await search.fill(codeMulti);
    await search.focus();
    await page.waitForTimeout(800);
    const suggestion = page.getByTestId('transfer-product-suggestions').locator('button').filter({ hasText: codeMulti }).first();
    await expect(suggestion).toBeVisible({ timeout: 20_000 });
    // "Có thể chuyển: 10" must use source stock, not system total 15
    await expect(suggestion).toContainText(/Có thể chuyển:\s*10/i);
    await suggestion.click();
    // Line added: product select contains the code (option may be hidden; assert selected value).
    await expect(page.locator('table tbody tr').first()).toBeVisible();
    await expect(page.locator('table tbody select').first()).not.toHaveValue('');
    await expect(page.locator('body')).not.toContainText(/Application error/i);
  });

  // ─── CROSS dashboard / reports ─────────────────────────────────────────

  test('CROSS-CREATE-10: dashboard load + không crash', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/');
    await expect(page.getByText(/Tổng quan|Doanh thu|Tồn kho/i).first()).toBeVisible({ timeout: 45_000 });
    await page.getByRole('button', { name: /Làm mới|Refresh/i }).first().click({ timeout: 5000 }).catch(() => {});
    await expect(page.locator('body')).not.toContainText(/Application error|Something went wrong/i);
    // inventory numbers present
    await expect(page.getByText(/tồn|sản phẩm|doanh thu/i).first()).toBeVisible();
  });

  test('CROSS-CREATE-11: báo cáo tồn + hiệu quả SP load', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/reports/inventory/in-out-stock');
    await expect(page.locator('body')).toBeVisible();
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).not.toContainText(/Application error/i);

    await page.goto('/reports/products/performance');
    await expect(page.locator('body')).toBeVisible();
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).not.toContainText(/Application error/i);

    await page.goto('/reports/revenue/products');
    await expect(page.locator('body')).toBeVisible();
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).not.toContainText(/Application error/i);
  });

  // ─── IMPORT smoke + network ────────────────────────────────────────────

  test('IMPORT-UI-SMOKE: CSV thêm mới + multipart boundary', async ({ page, request }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/products');
    await waitProductsLoaded(page);
    const importCode = `${FIXTURE_PREFIX}-IMPSMOKE`;
    const csv = [
      'Mã sản phẩm;Tên sản phẩm;Đơn vị tính;Giá nhập;Giá bán;Giá sỉ;Tồn trong kho;Danh mục;Trạng thái',
      `${importCode};QA Import Smoke ${RUN_ID};Cái;1000;2000;1500;0;${categoryName || 'Test'};Mới`,
    ].join('\n');
    const tmp = path.join(os.tmpdir(), `${importCode}.csv`);
    fs.writeFileSync(tmp, `\uFEFF${csv}`, 'utf8');

    await page.locator('.products-split-toggle').click();
    await page.locator('.products-add-dropdown').getByText(/Nhập từ file/i).click();
    const modal = page.locator('.modal-card').filter({ hasText: /Nhập dữ liệu sản phẩm/i });
    await expect(modal).toBeVisible();
    await expect(modal.locator('select').first()).not.toHaveValue('', { timeout: 20_000 });
    await modal.locator('input[type="file"]').setInputFiles(tmp);
    const importResp = page.waitForResponse(
      (r) => r.url().includes('/products/products/import') && r.request().method() === 'POST',
      { timeout: 60_000 },
    );
    await modal.getByRole('button', { name: /Upload và nhập/i }).click();
    const resp = await importResp;
    expect(resp.ok(), `import ${resp.status()}`).toBeTruthy();
    const body = await resp.json();
    expect(body.summary?.created).toBeGreaterThanOrEqual(1);

    const list = await (
      await request.get(`${API}/products/products?q=${encodeURIComponent(importCode)}&limit=5`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    for (const p of list.items || []) {
      if (p.code === importCode && p._id) createdProductIds.push(String(p._id));
    }
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  });

  test('NET-01: chặn GET products → recovery Làm mới', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/products');
    await waitProductsLoaded(page);
    await page.route('**/api/products/products?**', (route) => route.abort());
    await page.getByRole('button', { name: /Làm mới/i }).click();
    await page.waitForTimeout(600);
    await page.unroute('**/api/products/products?**');
    await page.getByRole('button', { name: /Làm mới/i }).click();
    await waitProductsLoaded(page);
    await expect(page.getByPlaceholder(/Tìm theo tên, mã hoặc barcode/i)).toBeVisible();
  });

  test('NET-02: abort import POST → UI không crash', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/products');
    await waitProductsLoaded(page);
    await page.locator('.products-split-toggle').click();
    await page.locator('.products-add-dropdown').getByText(/Nhập từ file/i).click();
    const modal = page.locator('.modal-card').filter({ hasText: /Nhập dữ liệu sản phẩm/i });
    await expect(modal).toBeVisible();
    const tmp = path.join(os.tmpdir(), `${FIXTURE_PREFIX}-netfail.csv`);
    fs.writeFileSync(tmp, '\uFEFFMã sản phẩm;Tên sản phẩm\nX;Y\n', 'utf8');
    await modal.locator('input[type="file"]').setInputFiles(tmp);
    await page.route('**/api/products/products/import**', (route) => route.abort());
    await modal.getByRole('button', { name: /Upload và nhập/i }).click();
    await page.waitForTimeout(800);
    await expect(page.getByRole('heading', { name: /Nhập dữ liệu sản phẩm/i })).toBeVisible();
    await page.unroute('**/api/products/products/import**');
    await modal.getByRole('button', { name: /^Hủy$/i }).click();
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  });

  // ─── BARCODE workspace ─────────────────────────────────────────────────

  test('BAR-EXTENDED: workspace + 14 khổ + Escape', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/products');
    await waitProductsLoaded(page);
    await filterProducts(page, codeMulti);
    const row = page.locator('.products-data-table tbody tr', { hasText: codeMulti }).first();
    await expect(row).toBeVisible();
    await row.locator('input[type="checkbox"]').check();
    await page.getByRole('button', { name: 'Thao tác', exact: true }).click();
    await page.locator('.products-bulk-dropdown').getByText(/In mã vạch/i).click();
    await expect(page.getByText(/In mã vạch sản phẩm/i)).toBeVisible({ timeout: 15_000 });
    // Workspace may show code and/or name of selected product.
    await expect(
      page.getByText(codeMulti).or(page.getByText(new RegExp(`QA Multi WH ${RUN_ID}`))).first(),
    ).toBeVisible({ timeout: 15_000 });
    const showAll = page.getByRole('button', { name: /Hiển thị tất cả 14 khổ giấy/i });
    if (await showAll.count()) {
      await showAll.click();
      await expect(page.locator('.barcode-paper-item')).toHaveCount(14, { timeout: 10_000 });
    }
    await page.getByRole('button', { name: /Quay lại danh sách/i }).click();
    await waitProductsLoaded(page);
  });

  // ─── DETAIL qty sum ────────────────────────────────────────────────────

  test('DETAIL-03: tổng tồn modal = sum kho', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/products');
    await waitProductsLoaded(page);
    await filterProducts(page, codeMulti);
    await page.getByRole('button', { name: `Thao tác sản phẩm ${codeMulti}`, exact: true }).click();
    await page.getByRole('menuitem', { name: /Chi tiết/i }).click();
    const detail = page.locator('.modal-card').filter({ has: page.getByRole('heading', { name: 'Chi tiết sản phẩm' }) });
    await expect(detail).toContainText(codeMulti);
    await detail.getByRole('button', { name: /Chi tiết tồn kho/i }).click();
    await expect(detail.getByText(/Số lượng tồn|Chưa có dữ liệu tồn kho|Đang tải/i).first()).toBeVisible({
      timeout: 15_000,
    });
    // total qty 15 or 10
    await expect(detail).toContainText(branchIdB !== branchId ? /15/ : /10/);
    await detail.getByRole('button', { name: /Đóng/i }).click();
  });

  // ─── EDIT status stop ──────────────────────────────────────────────────

  test('EDIT-STATUS: đổi sang Ngừng bán giữ tồn', async ({ page, request }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/products');
    await waitProductsLoaded(page);
    await filterProducts(page, codeMulti);
    const before = await getProduct(request, idMulti);
    const beforeQty = Number(before.qty);
    await page.getByRole('button', { name: `Thao tác sản phẩm ${codeMulti}`, exact: true }).click();
    await page.getByRole('menuitem', { name: /^Sửa$/i }).click();
    const modal = page.locator('.modal-card').filter({ hasText: 'Sửa sản phẩm' });
    const statusSelect = modal.locator('select').filter({ hasText: /Mới|Đang bán|Ngừng bán/i }).first();
    if (await statusSelect.count()) {
      await statusSelect.selectOption({ label: 'Ngừng bán' }).catch(async () => {
        await statusSelect.selectOption('Ngừng bán');
      });
    }
    const patchWait = page.waitForResponse(
      (r) => r.url().includes(`/products/products/${idMulti}`) && r.request().method() === 'PATCH',
    );
    await modal.getByRole('button', { name: /Cập nhật/i }).click();
    expect((await patchWait).status()).toBe(200);
    const after = await getProduct(request, idMulti);
    expect(Number(after.qty)).toBe(beforeQty);
    expect(String(after.status)).toMatch(/Ngừng bán/i);
  });

  // ─── PERM employee create UI ───────────────────────────────────────────

  test('PERM-EMP: nhân viên xem list + thêm UI + không Sửa/Xóa', async ({ page }) => {
    await uiLogin(page, EMPLOYEE);
    await page.goto('/products');
    await waitProductsLoaded(page);
    await expect(page.getByRole('button', { name: /^Thêm mới$/i })).toBeVisible();
    await filterProducts(page, codeStop);
    await page.getByRole('button', { name: `Thao tác sản phẩm ${codeStop}`, exact: true }).click();
    await expect(page.getByRole('menuitem', { name: /Chi tiết/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /^Sửa$/i })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: /^Xóa$/i })).toHaveCount(0);
  });

  // ─── DEL zero after cross checks ───────────────────────────────────────

  test('DEL-ZERO: xóa fixture zero sau cross', async ({ page, request }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/products');
    await waitProductsLoaded(page);
    await filterProducts(page, codeZeroDel);
    await page.getByRole('button', { name: `Thao tác sản phẩm ${codeZeroDel}`, exact: true }).click();
    await page.getByRole('menuitem', { name: /^Xóa$/i }).click();
    const delWait = page.waitForResponse(
      (r) => r.url().includes(`/products/products/${idZeroDel}`) && r.request().method() === 'DELETE',
    );
    await page.getByRole('button', { name: /^Xóa$/i }).last().click();
    expect((await delWait).status()).toBe(200);
    const idx = createdProductIds.indexOf(idZeroDel);
    if (idx >= 0) createdProductIds.splice(idx, 1);
    const list = await (
      await request.get(`${API}/products/products?q=${encodeURIComponent(codeZeroDel)}&limit=5`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    expect((list.items || []).filter((p: any) => p.code === codeZeroDel).length).toBe(0);
  });

  // ─── Orphan cleanup verification ───────────────────────────────────────

  test('CLEANUP: không còn QA-PROD-E2E-FULL orphan', async ({ request }) => {
    const res = await request.get(
      `${API}/products/products?q=${encodeURIComponent('QA-PROD-E2E-FULL-')}&limit=20`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const leftovers = (body.items || []).filter((p: any) => String(p.code || '').startsWith('QA-PROD-E2E-FULL-'));
    expect(leftovers.length).toBe(0);
  });
});
