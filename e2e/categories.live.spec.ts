import { expect, test, type APIRequestContext, type Page, type Locator, type Dialog } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';

/**
 * Live Playwright suite for /products/categories (manual CAT cases).
 * FE 127.0.0.1:5173 / API 127.0.0.1:8000
 * Fixtures only under QA-CAT-{E2E_RUN_ID}-* ; cleaned in afterAll.
 * Data policy: create/update/delete fixtures with RUN_ID only.
 */
const RUN_ID =
  process.env.E2E_RUN_ID ||
  `E2E-CAT-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${randomBytes(2).toString('hex')}`;
const API = 'http://127.0.0.1:8000/api';
const ADMIN = { email: 'admin@gmail.com', password: '123456' };
const EMPLOYEE = { email: 'tiendo09711@gmail.com', password: '123456' };
const FIXTURE_PREFIX = `QA-CAT-${RUN_ID}`;
const ARTIFACT_DIR = path.join(process.cwd(), 'e2e-artifacts', 'categories-live', RUN_ID);

const createdCategoryIds: string[] = [];
const createdProductIds: string[] = [];
let adminToken = '';
let employeeToken = '';
let adminRole = '';
let employeeRole = '';
let branchId = '';
let branchIdB = '';

/** Fixture ids/codes */
const fx = {
  root: { id: '', code: `${FIXTURE_PREFIX}-ROOT`, name: `${FIXTURE_PREFIX} Danh mục cha` },
  l2: { id: '', code: `${FIXTURE_PREFIX}-L2`, name: `${FIXTURE_PREFIX} Danh mục cấp 2` },
  l3: { id: '', code: `${FIXTURE_PREFIX}-L3`, name: `${FIXTURE_PREFIX} Danh mục cấp 3` },
  l4: { id: '', code: `${FIXTURE_PREFIX}-L4`, name: `${FIXTURE_PREFIX} Danh mục cấp 4` },
  prod: { id: '', code: `${FIXTURE_PREFIX}-PROD`, name: `${FIXTURE_PREFIX} Danh mục có SP` },
  off: { id: '', code: `${FIXTURE_PREFIX}-OFF`, name: `${FIXTURE_PREFIX} Danh mục ngừng` },
  empty: { id: '', code: `${FIXTURE_PREFIX}-EMPTY`, name: `${FIXTURE_PREFIX} Danh mục rỗng` },
  delEmpty: { id: '', code: `${FIXTURE_PREFIX}-DELE`, name: `${FIXTURE_PREFIX} Xóa rỗng` },
  bulk1: { id: '', code: `${FIXTURE_PREFIX}-BK1`, name: `${FIXTURE_PREFIX} Bulk 1` },
  bulk2: { id: '', code: `${FIXTURE_PREFIX}-BK2`, name: `${FIXTURE_PREFIX} Bulk 2` },
  bulk3: { id: '', code: `${FIXTURE_PREFIX}-BK3`, name: `${FIXTURE_PREFIX} Bulk 3` },
  edit: { id: '', code: `${FIXTURE_PREFIX}-EDIT`, name: `${FIXTURE_PREFIX} Sửa rỗng` },
  loopA: { id: '', code: `${FIXTURE_PREFIX}-LA`, name: `${FIXTURE_PREFIX} Loop A` },
  loopB: { id: '', code: `${FIXTURE_PREFIX}-LB`, name: `${FIXTURE_PREFIX} Loop B` },
  loopC: { id: '', code: `${FIXTURE_PREFIX}-LC`, name: `${FIXTURE_PREFIX} Loop C` },
};

const products = {
  sp001: { id: '', code: `${FIXTURE_PREFIX}-SP001`, name: `${FIXTURE_PREFIX} SP 001`, barcode: '' },
  sp002: { id: '', code: `${FIXTURE_PREFIX}-SP002`, name: `${FIXTURE_PREFIX} SP 002`, barcode: '' },
};

let baselineTotal = 0;
const caseNotes: string[] = [];

function note(msg: string) {
  caseNotes.push(msg);
  // eslint-disable-next-line no-console
  console.log(`[NOTE] ${msg}`);
}

async function apiLogin(request: APIRequestContext, creds: { email: string; password: string }) {
  const res = await request.post(`${API}/auth/login`, { data: creds });
  expect(res.ok(), `login ${creds.email} -> ${res.status()}`).toBeTruthy();
  return res.json();
}

async function uiLogin(page: Page, creds: { email: string; password: string }) {
  const token = creds.email === EMPLOYEE.email ? employeeToken : adminToken;
  await page.addInitScript((t) => localStorage.setItem('token', t), token);
}

async function createCategoryApi(
  request: APIRequestContext,
  body: Record<string, unknown>,
): Promise<any> {
  const res = await request.post(`${API}/products/categories`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: body,
  });
  const text = await res.text();
  expect(res.ok() || res.status() === 201, `create cat ${body.code} -> ${res.status()} ${text.slice(0, 240)}`).toBeTruthy();
  const cat = JSON.parse(text);
  if (cat?._id) createdCategoryIds.push(String(cat._id));
  return cat;
}

async function updateCategoryApi(request: APIRequestContext, id: string, body: Record<string, unknown>) {
  const res = await request.patch(`${API}/products/categories/${id}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: body,
  });
  const text = await res.text();
  return { status: res.status(), body: text, json: () => JSON.parse(text) };
}

async function deleteCategoryApi(request: APIRequestContext, id: string) {
  const res = await request.delete(`${API}/products/categories/${id}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  return res.status();
}

async function createProductApi(request: APIRequestContext, body: Record<string, unknown>) {
  const res = await request.post(`${API}/products/products`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: body,
  });
  const text = await res.text();
  expect(res.ok() || res.status() === 201, `create product ${body.code} -> ${res.status()} ${text.slice(0, 240)}`).toBeTruthy();
  const product = JSON.parse(text);
  if (product?._id) createdProductIds.push(String(product._id));
  return product;
}

async function deleteProductApi(request: APIRequestContext, id: string) {
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

async function waitCategoriesLoaded(page: Page) {
  await expect(page.getByRole('heading', { name: /Bảng dữ liệu danh mục|Danh mục sản phẩm/i }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/Đang tải dữ liệu/i)).toHaveCount(0, { timeout: 45_000 });
}

async function gotoCategories(page: Page) {
  await page.goto('/products/categories');
  await waitCategoriesLoaded(page);
}

async function filterCategories(page: Page, q: string) {
  const search = page.getByLabel(/Tìm danh mục/i);
  await search.fill(q);
  await page.getByRole('button', { name: /^Lọc$/i }).click();
  await expect(page.getByText(/Đang tải dữ liệu/i)).toHaveCount(0, { timeout: 30_000 });
}

async function refreshCategories(page: Page) {
  await page.getByRole('button', { name: /Làm mới/i }).click();
  await expect(page.getByText(/Đang tải dữ liệu/i)).toHaveCount(0, { timeout: 30_000 });
}

function categoryRow(page: Page, codeOrName: string): Locator {
  return page.locator('.categories-data-table tbody tr', { hasText: codeOrName }).first();
}

async function openRowMenu(page: Page, name: string) {
  const btn = page.getByRole('button', { name: `Thao tác danh mục ${name}`, exact: true });
  await expect(btn).toBeVisible({ timeout: 15_000 });
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await expect(page.locator('.categories-row-action-menu').first()).toBeVisible({ timeout: 10_000 });
}

async function readSummaryTotal(page: Page): Promise<number> {
  const main = page.locator('.categories-summary-main strong').first();
  await expect(main).toBeVisible();
  const text = (await main.textContent()) || '0';
  return Number(text.replace(/[^\d]/g, '')) || 0;
}

async function collectConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err.message || err)));
  return errors;
}

/** Pagination UI: prev | "Trang X / Y" | next — no numbered page buttons. */
function paginationRoot(page: Page): Locator {
  return page.locator('.categories-pagination-wrap .pagination, .pagination').first();
}

function paginationNext(page: Page): Locator {
  return paginationRoot(page).locator('button').last();
}

function paginationPrev(page: Page): Locator {
  return paginationRoot(page).locator('button').first();
}

async function currentListPage(page: Page): Promise<number> {
  const label = (await paginationRoot(page).textContent()) || '';
  const m = label.match(/Trang\s+(\d+)\s*\/\s*(\d+)/i);
  return m ? Number(m[1]) : 1;
}

async function goToPageN(page: Page, targetPage: number) {
  for (let i = 0; i < 40; i += 1) {
    const current = await currentListPage(page);
    if (current === targetPage) {
      const from = (targetPage - 1) * 15 + 1;
      // summary strip: "1–15" / "16–30" ...
      await expect(page.locator('.categories-summary-cluster')).toContainText(
        new RegExp(`${from}\\s*[–-]`),
      );
      return;
    }
    const goingForward = current < targetPage;
    const btn = goingForward ? paginationNext(page) : paginationPrev(page);
    await expect(btn).toBeEnabled();
    const expectedPage = goingForward ? current + 1 : current - 1;
    const responsePromise = page.waitForResponse(
      (res) =>
        res.url().includes('/api/products/categories') &&
        res.ok() &&
        (res.url().includes(`page=${expectedPage}`) || res.request().url().includes(`page=${expectedPage}`)),
      { timeout: 30_000 },
    );
    await btn.click();
    await responsePromise.catch(() => null);
    await expect(page.getByText(/Đang tải dữ liệu/i)).toHaveCount(0, { timeout: 30_000 });
    await expect
      .poll(async () => currentListPage(page), { timeout: 15_000 })
      .toBe(expectedPage);
  }
  throw new Error(`Could not reach page ${targetPage}, stuck at ${await currentListPage(page)}`);
}

async function openSidebarProductGroup(page: Page) {
  // Desktop nav shows submenu on hover (CSS .menu-group:hover > .menu-panel)
  const group = page.locator('.menu-group-product').first();
  await group.hover();
  const link = page.locator('.menu-group-product a[href="/products/categories"]');
  await expect(link).toBeVisible({ timeout: 10_000 });
}

async function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

test.describe('Categories live manual suite', () => {
  test.beforeAll(async ({ request }) => {
    await ensureDir(ARTIFACT_DIR);
    // eslint-disable-next-line no-console
    console.log(`E2E_RUN_ID=${RUN_ID}`);
    // eslint-disable-next-line no-console
    console.log(`FIXTURE_PREFIX=${FIXTURE_PREFIX}`);

    const admin = await apiLogin(request, ADMIN);
    const emp = await apiLogin(request, EMPLOYEE);
    adminToken = admin.token;
    employeeToken = emp.token;
    adminRole = String(admin.user?.role || '').toUpperCase();
    employeeRole = String(emp.user?.role || '').toUpperCase();
    expect(adminRole).toBe('ADMIN');
    expect(employeeRole).toBe('EMPLOYEE');

    const branches = await (
      await request.get(`${API}/branches?limit=50`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    const active = (branches.items || []).filter((b: any) => b.isActive !== false);
    expect(active.length).toBeGreaterThan(0);
    branchId = String(active[0]._id);
    branchIdB = String((active[1] || active[0])._id);

    // Sweep orphan fixtures from previous CAT runs (prefix QA-CAT- only): products first, then categories.
    const orphanProducts = await (
      await request.get(`${API}/products/products?q=${encodeURIComponent('QA-CAT-')}&limit=100`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    for (const p of orphanProducts.items || []) {
      if (!String(p.code || '').startsWith('QA-CAT-') || !p._id) continue;
      await deleteProductApi(request, String(p._id)).catch(() => 0);
    }
    for (let pass = 0; pass < 6; pass += 1) {
      const orphanCats = await (
        await request.get(`${API}/products/categories?q=${encodeURIComponent('QA-CAT-')}&limit=200`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        })
      ).json();
      let deleted = 0;
      for (const c of orphanCats.items || []) {
        const code = String(c.code || '');
        const name = String(c.name || '');
        if (!code.startsWith('QA-CAT-') && !name.startsWith('QA-CAT-')) continue;
        if (!c._id) continue;
        const status = await deleteCategoryApi(request, String(c._id));
        if (status === 200 || status === 204) deleted += 1;
      }
      if (deleted === 0) break;
    }

    // Tree: root → l2 → l3 → l4
    const root = await createCategoryApi(request, {
      name: fx.root.name,
      code: fx.root.code,
      isActive: true,
    });
    fx.root.id = String(root._id);

    const l2 = await createCategoryApi(request, {
      name: fx.l2.name,
      code: fx.l2.code,
      parentId: Number(fx.root.id) || fx.root.id,
      isActive: true,
    });
    fx.l2.id = String(l2._id);

    const l3 = await createCategoryApi(request, {
      name: fx.l3.name,
      code: fx.l3.code,
      parentId: Number(fx.l2.id) || fx.l2.id,
      isActive: true,
    });
    fx.l3.id = String(l3._id);

    const l4 = await createCategoryApi(request, {
      name: fx.l4.name,
      code: fx.l4.code,
      parentId: Number(fx.l3.id) || fx.l3.id,
      isActive: true,
    });
    fx.l4.id = String(l4._id);

    const prod = await createCategoryApi(request, {
      name: fx.prod.name,
      code: fx.prod.code,
      isActive: true,
    });
    fx.prod.id = String(prod._id);

    const off = await createCategoryApi(request, {
      name: fx.off.name,
      code: fx.off.code,
      isActive: false,
    });
    fx.off.id = String(off._id);

    const empty = await createCategoryApi(request, {
      name: fx.empty.name,
      code: fx.empty.code,
      isActive: true,
    });
    fx.empty.id = String(empty._id);

    const delEmpty = await createCategoryApi(request, {
      name: fx.delEmpty.name,
      code: fx.delEmpty.code,
      isActive: true,
    });
    fx.delEmpty.id = String(delEmpty._id);

    for (const key of ['bulk1', 'bulk2', 'bulk3', 'edit', 'loopA'] as const) {
      const created = await createCategoryApi(request, {
        name: fx[key].name,
        code: fx[key].code,
        isActive: true,
      });
      fx[key].id = String(created._id);
    }

    const loopB = await createCategoryApi(request, {
      name: fx.loopB.name,
      code: fx.loopB.code,
      parentId: Number(fx.loopA.id) || fx.loopA.id,
      isActive: true,
    });
    fx.loopB.id = String(loopB._id);

    const loopC = await createCategoryApi(request, {
      name: fx.loopC.name,
      code: fx.loopC.code,
      parentId: Number(fx.loopB.id) || fx.loopB.id,
      isActive: true,
    });
    fx.loopC.id = String(loopC._id);

    // Products under PROD category
    const baseProduct = {
      type: 'product',
      unit: 'Cái',
      allowsSale: true,
      categoryId: Number(fx.prod.id) || fx.prod.id,
      categoryName: fx.prod.name,
      status: 'Đang bán',
    };

    const sp1 = await createProductApi(request, {
      ...baseProduct,
      code: products.sp001.code,
      name: products.sp001.name,
      price: 150000,
      cost: 80000,
      barcode: `89${String(Date.now()).slice(-11)}`.slice(0, 13),
      initialStocks: [
        { warehouseId: Number(branchId) || branchId, quantity: 12 },
        ...(branchIdB !== branchId
          ? [{ warehouseId: Number(branchIdB) || branchIdB, quantity: 3 }]
          : []),
      ],
    });
    products.sp001.id = String(sp1._id);
    products.sp001.barcode = String(sp1.barcode || '');

    const sp2 = await createProductApi(request, {
      ...baseProduct,
      code: products.sp002.code,
      name: products.sp002.name,
      price: 99000,
      cost: 50000,
      barcode: `88${String(Date.now() + 1).slice(-11)}`.slice(0, 13),
      initialStocks: [
        { warehouseId: Number(branchId) || branchId, quantity: 0 },
        ...(branchIdB !== branchId
          ? [{ warehouseId: Number(branchIdB) || branchIdB, quantity: 0 }]
          : []),
      ],
    });
    products.sp002.id = String(sp2._id);
    products.sp002.barcode = String(sp2.barcode || '');

    const list = await (
      await request.get(`${API}/products/categories?limit=1`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    baselineTotal = Number(list.total || 0);
    note(`Baseline total categories after fixture setup: ${baselineTotal}`);
    note(`Admin role=${adminRole}, Employee role=${employeeRole}`);
    note(`Branches: ${branchId}${branchIdB !== branchId ? `, ${branchIdB}` : ''}`);
    note(
      `Fixtures: root=${fx.root.id}, prod=${fx.prod.id}, products=${products.sp001.id},${products.sp002.id}`,
    );

    fs.writeFileSync(
      path.join(ARTIFACT_DIR, 'fixture-snapshot.json'),
      JSON.stringify({ RUN_ID, FIXTURE_PREFIX, baselineTotal, fx, products, branchId, branchIdB }, null, 2),
      'utf8',
    );
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      if (!localStorage.getItem('token')) localStorage.setItem('token', token);
    }, adminToken);
  });

  test.afterAll(async ({ request }) => {
    // Delete products first
    for (const id of [...createdProductIds].reverse()) {
      await deleteProductApi(request, id).catch(() => 0);
    }
    // Sweep leftover products by prefix
    const sweepP = await (
      await request.get(`${API}/products/products?q=${encodeURIComponent(FIXTURE_PREFIX)}&limit=100`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    for (const p of sweepP.items || []) {
      if (!String(p.code || '').startsWith(FIXTURE_PREFIX) || !p._id) continue;
      await deleteProductApi(request, String(p._id)).catch(() => 0);
    }

    // Delete categories deepest-first (leaves before parents)
    const ordered = [
      fx.l4.id,
      fx.l3.id,
      fx.l2.id,
      fx.loopC.id,
      fx.loopB.id,
      fx.loopA.id,
      fx.delEmpty.id,
      fx.bulk1.id,
      fx.bulk2.id,
      fx.bulk3.id,
      fx.edit.id,
      fx.empty.id,
      fx.off.id,
      fx.prod.id,
      fx.root.id,
      ...createdCategoryIds,
    ].filter(Boolean);
    const unique = [...new Set(ordered.map(String))];
    // Multiple passes: children may block parents
    for (let pass = 0; pass < 6; pass += 1) {
      for (const id of unique) {
        await deleteCategoryApi(request, id).catch(() => 0);
      }
    }
    // Sweep leftover categories by code prefix
    const sweepC = await (
      await request.get(`${API}/products/categories?q=${encodeURIComponent(FIXTURE_PREFIX)}&limit=200`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    for (let pass = 0; pass < 4; pass += 1) {
      for (const c of sweepC.items || []) {
        if (!String(c.code || '').startsWith(FIXTURE_PREFIX) && !String(c.name || '').startsWith(FIXTURE_PREFIX)) {
          continue;
        }
        if (!c._id) continue;
        await deleteCategoryApi(request, String(c._id)).catch(() => 0);
      }
    }

    fs.writeFileSync(path.join(ARTIFACT_DIR, 'case-notes.txt'), caseNotes.join('\n'), 'utf8');
    // eslint-disable-next-line no-console
    console.log(`Cleanup done for ${RUN_ID}`);
  });

  // ─── ROLE ─────────────────────────────────────────────────────────────
  test('ROLE-01: Admin và Employee đăng nhập đúng role, mở được /products/categories', async ({
    page,
    request,
  }) => {
    expect(adminRole).toBe('ADMIN');
    expect(employeeRole).toBe('EMPLOYEE');

    await uiLogin(page, ADMIN);
    await gotoCategories(page);
    await expect(page).toHaveURL(/\/products\/categories/);
    await expect(page.getByRole('button', { name: /Thêm mới/i })).toBeVisible();

    // Employee
    const empPage = await page.context().newPage();
    await uiLogin(empPage, EMPLOYEE);
    await empPage.goto('/products/categories');
    await waitCategoriesLoaded(empPage);
    await expect(empPage).toHaveURL(/\/products\/categories/);
    // Employee can view list (EMPLOYEE role allowed)
    await expect(empPage.locator('.categories-data-table')).toBeVisible();
    await empPage.close();

    // API employee can read categories
    const res = await request.get(`${API}/products/categories?limit=5`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    expect(res.ok(), `employee categories ${res.status()}`).toBeTruthy();
  });

  // ─── II NAV ───────────────────────────────────────────────────────────
  test('CAT-001: mở trang trực tiếp', async ({ page }) => {
    const errors = await collectConsoleErrors(page);
    const badApi: string[] = [];
    page.on('response', (res) => {
      const url = res.url();
      if (url.includes('/api/products/categories') && res.status() >= 400) {
        badApi.push(`${res.status()} ${url}`);
      }
    });

    await uiLogin(page, ADMIN);
    await page.goto('/products/categories');
    await waitCategoriesLoaded(page);
    await expect(page).toHaveURL(/\/products\/categories/);
    await expect(page.locator('.categories-data-table')).toBeVisible();
    // sidebar: link may be in collapsed group (hidden) but still marked current/active
    const catNav = page.locator('a[href="/products/categories"]').first();
    await expect(catNav).toBeAttached();
    await expect(catNav).toHaveClass(/active/);
    await expect(catNav).toHaveAttribute('aria-current', 'page');
    const rows = page.locator('.categories-data-table tbody tr');
    const count = await rows.count();
    expect(count).toBeLessThanOrEqual(15);
    expect(badApi, `API errors: ${badApi.join('; ')}`).toEqual([]);
    const hardErrors = errors.filter((e) => !/favicon|Download the React DevTools|ResizeObserver|Failed to load resource/i.test(e));
    expect(hardErrors, hardErrors.join('\n')).toEqual([]);
  });

  test('CAT-002: mở từ menu sidebar', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/');
    await openSidebarProductGroup(page);
    await page.locator('.menu-group-product a[href="/products/categories"]').click();
    await expect(page).toHaveURL(/\/products\/categories/);
    await waitCategoriesLoaded(page);
  });

  test('CAT-003: F5 reload', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoCategories(page);
    const totalBefore = await readSummaryTotal(page);
    await page.reload();
    await waitCategoriesLoaded(page);
    await expect(page).toHaveURL(/\/products\/categories/);
    const totalAfter = await readSummaryTotal(page);
    expect(totalAfter).toBe(totalBefore);
  });

  test('CAT-004: back/forward browser', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoCategories(page);
    await page.goto('/products');
    await expect(page).toHaveURL(/\/products$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/products\/categories/);
    await waitCategoriesLoaded(page);
    await page.goForward();
    await expect(page).toHaveURL(/\/products$/);
  });

  test('CAT-005: trạng thái đang tải (slow network)', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.route('**/api/products/categories**', async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.goto('/products/categories');
    // loading text should appear
    await expect(page.getByText(/Đang tải dữ liệu/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Chưa có dữ liệu/i)).toHaveCount(0);
    await waitCategoriesLoaded(page);
    await expect(page.locator('.categories-data-table tbody tr').first()).toBeVisible();
    await page.unroute('**/api/products/categories**');
  });

  test('CAT-006: API lỗi + Làm mới phục hồi', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoCategories(page);
    await page.route('**/api/products/categories**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'fail' }) }),
    );
    await page.reload();
    await expect(page.getByText(/Không thể tải danh sách danh mục|fail|500/i).first()).toBeVisible({
      timeout: 20_000,
    });
    // no crash
    await expect(page.locator('body')).toBeVisible();
    await page.unroute('**/api/products/categories**');
    await refreshCategories(page);
    await waitCategoriesLoaded(page);
    const total = await readSummaryTotal(page);
    expect(total).toBeGreaterThan(0);
  });

  // ─── III LIST UI ──────────────────────────────────────────────────────
  test('CAT-010: các thành phần chính', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoCategories(page);
    await expect(page.getByRole('tab', { name: /^Tất cả$/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Hoạt động$/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Ngừng$/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Danh mục cha$/i })).toBeVisible();
    await expect(page.getByLabel(/Tìm danh mục/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Lọc$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Làm mới/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Thêm mới/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Mở menu thêm/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Thao tác$/i })).toBeVisible();
    await expect(page.getByLabel(/Chọn tất cả danh mục trên trang/i)).toBeVisible();
    await expect(page.locator('.categories-data-table')).toBeVisible();
    await expect(page.locator('.categories-summary-main')).toBeVisible();
    await expect(page.locator('.categories-summary-cluster')).toContainText(/–|-/);
  });

  test('CAT-011: dữ liệu dòng fixture PROD', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoCategories(page);
    await filterCategories(page, fx.prod.code);
    const row = categoryRow(page, fx.prod.code);
    await expect(row).toBeVisible();
    await expect(row).toContainText(fx.prod.name);
    await expect(row).toContainText(fx.prod.code);
    await expect(row).toContainText(/Đang hoạt động/i);
    await expect(row).toContainText(/2/); // product count ≥2
    // date vi-VN like dd/mm/yyyy
    await expect(row.locator('td').nth(5)).toHaveText(/\d{1,2}\/\d{1,2}\/\d{4}|-/);
    await expect(page.getByRole('button', { name: `Thao tác danh mục ${fx.prod.name}`, exact: true })).toBeVisible();
  });

  test('CAT-012: danh sách rỗng', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoCategories(page);
    await filterCategories(page, 'MANUAL-NOT-FOUND-999999');
    await expect(page.getByText(/Chưa có dữ liệu/i)).toBeVisible();
    const total = await readSummaryTotal(page);
    expect(total).toBe(0);
    await expect(page.getByText(/đã chọn/i).first()).not.toContainText(/[1-9]/);
  });

  test('CAT-013: >15 dòng, trang đầu 1–15', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoCategories(page);
    await refreshCategories(page);
    const total = await readSummaryTotal(page);
    expect(total).toBeGreaterThan(15);
    const dataRows = page.locator('.categories-data-table tbody tr').filter({ hasNotText: /Chưa có dữ liệu|Đang tải/i });
    expect(await dataRows.count()).toBeLessThanOrEqual(15);
    await expect(page.locator('.categories-summary-cluster')).toContainText(/1\s*[–-]\s*15/);
  });

  // ─── IV SEARCH ────────────────────────────────────────────────────────
  test('CAT-020..033: tìm kiếm và làm mới', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoCategories(page);

    // CAT-020 exact name
    await filterCategories(page, fx.prod.name);
    await expect(categoryRow(page, fx.prod.code)).toBeVisible();
    const rows20 = page.locator('.categories-data-table tbody tr');
    for (let i = 0; i < (await rows20.count()); i += 1) {
      const t = (await rows20.nth(i).textContent()) || '';
      if (/Chưa có|Đang tải/.test(t)) continue;
      expect(t.toLowerCase()).toContain(fx.prod.name.toLowerCase().slice(0, 10));
    }

    // CAT-021 partial name
    await filterCategories(page, 'Danh mục có SP');
    await expect(categoryRow(page, fx.prod.code)).toBeVisible();

    // CAT-022 code exact
    await filterCategories(page, fx.prod.code);
    await expect(categoryRow(page, fx.prod.code)).toBeVisible();

    // CAT-023 partial code
    await filterCategories(page, 'PROD');
    await expect(categoryRow(page, fx.prod.code)).toBeVisible();

    // CAT-024 case insensitive
    await filterCategories(page, fx.prod.name.toLowerCase());
    const totalLower = await readSummaryTotal(page);
    await filterCategories(page, fx.prod.name.toUpperCase());
    const totalUpper = await readSummaryTotal(page);
    expect(totalLower).toBe(totalUpper);

    // CAT-025 Vietnamese with diacritics
    await filterCategories(page, 'Danh mục');
    expect(await readSummaryTotal(page)).toBeGreaterThan(0);

    // CAT-026 without diacritics — record behavior
    await filterCategories(page, 'Danh muc');
    const noAccentTotal = await readSummaryTotal(page);
    note(`CAT-026 search without diacritics total=${noAccentTotal} (0 means no accent-insensitive search)`);

    // CAT-027 trim whitespace (backend trims q)
    await filterCategories(page, `   ${fx.prod.code}   `);
    await expect(categoryRow(page, fx.prod.code)).toBeVisible();

    // CAT-028 special chars — no 500 / XSS
    const specials = ['%', '_', "'", '"', '\\', '<script>alert(1)</script>'];
    for (const s of specials) {
      const bad: number[] = [];
      const handler = (res: any) => {
        if (String(res.url()).includes('/api/products/categories') && res.status() >= 500) bad.push(res.status());
      };
      page.on('response', handler);
      await filterCategories(page, s);
      page.off('response', handler);
      expect(bad, `special ${s}`).toEqual([]);
      await expect(page.locator('body')).toBeVisible();
    }

    // CAT-029 Enter
    await page.getByLabel(/Tìm danh mục/i).fill(fx.prod.code);
    await page.getByLabel(/Tìm danh mục/i).press('Enter');
    await expect(page.getByText(/Đang tải dữ liệu/i)).toHaveCount(0, { timeout: 30_000 });
    await expect(categoryRow(page, fx.prod.code)).toBeVisible();
    await expect(page).toHaveURL(/\/products\/categories/);

    // CAT-030 search from page 2 resets to page 1
    await refreshCategories(page);
    const totalAll = await readSummaryTotal(page);
    if (totalAll > 15) {
      await goToPageN(page, 2);
      await filterCategories(page, fx.prod.code);
      await expect(page.locator('.categories-summary-cluster')).toContainText(/1\s*[–-]/);
      await expect(categoryRow(page, fx.prod.code)).toBeVisible();
    } else {
      note('CAT-030 skipped: total <= 15');
    }

    // CAT-031 clear search
    await filterCategories(page, fx.prod.code);
    await filterCategories(page, '');
    const totalFull = await readSummaryTotal(page);
    expect(totalFull).toBeGreaterThan(15);

    // CAT-032 Làm mới resets filters/selection
    await filterCategories(page, fx.prod.code);
    await page.getByRole('tab', { name: /^Hoạt động$/i }).click();
    const firstCheck = page.locator('.categories-data-table tbody tr input[type="checkbox"]').first();
    if (await firstCheck.count()) {
      await firstCheck.check();
    }
    await refreshCategories(page);
    await expect(page.getByLabel(/Tìm danh mục/i)).toHaveValue('');
    // status tab should return to Tất cả (if implemented)
    const allTab = page.getByRole('tab', { name: /^Tất cả$/i });
    const allSelected = await allTab.getAttribute('aria-selected');
    if (allSelected !== 'true') {
      note('CAT-032 ISSUE: Làm mới does not reset status tab to Tất cả');
    }
    expect(allSelected).toBe('true');
    const selectedText = await page.locator('.categories-selected-count').textContent();
    expect(selectedText || '').toMatch(/Đã chọn 0|Đã chọn\s*0/);

    // CAT-033 multi refresh
    for (let i = 0; i < 4; i += 1) {
      await refreshCategories(page);
    }
    const t1 = await readSummaryTotal(page);
    const rowCount = await page.locator('.categories-data-table tbody tr').count();
    expect(rowCount).toBeLessThanOrEqual(15);
    expect(t1).toBeGreaterThan(0);
  });

  // ─── V TABS ───────────────────────────────────────────────────────────
  test('CAT-040..046: tab trạng thái', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoCategories(page);

    // CAT-040
    await page.getByRole('tab', { name: /^Tất cả$/i }).click();
    await expect(page.getByRole('tab', { name: /^Tất cả$/i })).toHaveAttribute('aria-selected', 'true');

    // CAT-041 active only on visible page
    await page.getByRole('tab', { name: /^Hoạt động$/i }).click();
    const activeRows = page.locator('.categories-data-table tbody tr');
    const ac = await activeRows.count();
    for (let i = 0; i < ac; i += 1) {
      const t = (await activeRows.nth(i).textContent()) || '';
      if (/Chưa có|Đang tải/.test(t)) continue;
      expect(t).toMatch(/Đang hoạt động/i);
      expect(t).not.toMatch(/Ngừng hoạt động/i);
    }

    // CAT-042 inactive
    await page.getByRole('tab', { name: /^Ngừng$/i }).click();
    const inactiveRows = page.locator('.categories-data-table tbody tr');
    const ic = await inactiveRows.count();
    for (let i = 0; i < ic; i += 1) {
      const t = (await inactiveRows.nth(i).textContent()) || '';
      if (/Chưa có|Đang tải/.test(t)) continue;
      expect(t).toMatch(/Ngừng hoạt động/i);
    }

    // CAT-043 parent — search fixture tree then filter parent
    await page.getByRole('tab', { name: /^Tất cả$/i }).click();
    await filterCategories(page, FIXTURE_PREFIX);
    await page.getByRole('tab', { name: /^Danh mục cha$/i }).click();
    // L2/L3/L4 should not show when filtering parents among search results on current page
    const parentText = (await page.locator('.categories-data-table tbody').textContent()) || '';
    if (parentText.includes(fx.l2.name) || parentText.includes(fx.l3.name) || parentText.includes(fx.l4.name)) {
      note('CAT-043 ISSUE: child categories appeared under parent tab');
    }
    expect(parentText).not.toContain(fx.l2.name);
    expect(parentText).not.toContain(fx.l4.name);

    // CAT-044 client-side only filter observation
    await refreshCategories(page);
    await page.getByRole('tab', { name: /^Tất cả$/i }).click();
    // go to a page likely all active — page 1
    await page.getByRole('tab', { name: /^Ngừng$/i }).click();
    const totalHeader = await readSummaryTotal(page);
    const visible = page.locator('.categories-data-table tbody tr');
    const emptyOrInactive = await page.getByText(/Chưa có dữ liệu/i).count();
    note(
      `CAT-044: after Ngừng on page1, total header=${totalHeader}, empty=${emptyOrInactive}, rows=${await visible.count()} (client-side page filter)`,
    );

    // CAT-045 tab + search
    await filterCategories(page, FIXTURE_PREFIX);
    await expect(page.getByText(/Đang lọc/i)).toBeVisible();
    await page.getByRole('tab', { name: /^Hoạt động$/i }).click();
    await expect(page.getByLabel(/Tìm danh mục/i)).toHaveValue(FIXTURE_PREFIX);
    await page.getByRole('tab', { name: /^Ngừng$/i }).click();
    await expect(categoryRow(page, fx.off.code)).toBeVisible();
    await page.getByRole('tab', { name: /^Danh mục cha$/i }).click();
    await expect(page.getByLabel(/Tìm danh mục/i)).toHaveValue(FIXTURE_PREFIX);

    // CAT-046 totals
    await page.getByRole('tab', { name: /^Tất cả$/i }).click();
    const tAll = await readSummaryTotal(page);
    await page.getByRole('tab', { name: /^Hoạt động$/i }).click();
    const tAct = await readSummaryTotal(page);
    note(`CAT-046: total Tất cả=${tAll}, Hoạt động tab still shows server total=${tAct}`);
    // Current UI keeps server total in header
    expect(tAct).toBe(tAll);
  });

  // ─── VI PAGINATION ────────────────────────────────────────────────────
  test('CAT-050..055: phân trang', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoCategories(page);
    await refreshCategories(page);
    const total = await readSummaryTotal(page);
    expect(total).toBeGreaterThan(15);

    // CAT-050 next page
    const page1Codes = (await page.locator('.categories-code-badge').allTextContents()).map((s) => s.trim());
    await goToPageN(page, 2);
    await expect(page.locator('.categories-summary-cluster')).toContainText(/16\s*[–-]/);
    await expect(paginationRoot(page)).toContainText(/Trang 2\s*\//i);
    const page2Codes = (await page.locator('.categories-code-badge').allTextContents()).map((s) => s.trim());
    const overlap = page2Codes.filter((c) => c && c !== '-' && page1Codes.includes(c));
    expect(overlap, `page1/page2 overlap: ${overlap.join(',')}`).toEqual([]);

    // CAT-051 prev
    await goToPageN(page, 1);
    await expect(page.locator('.categories-summary-cluster')).toContainText(/1\s*[–-]\s*15/);
    await expect(page.locator('.pagination')).toContainText(/Trang 1\s*\//i);

    // CAT-052 last page
    const lastPage = Math.ceil(total / 15);
    await goToPageN(page, lastPage);
    await expect(page.locator('.pagination')).toContainText(new RegExp(`Trang ${lastPage}\\s*/\\s*${lastPage}`, 'i'));
    const rem = total % 15 || 15;
    const rows = await page.locator('.categories-code-badge').count();
    expect(rows).toBeLessThanOrEqual(rem);
    const summary = (await page.locator('.categories-summary-cluster').textContent()) || '';
    const m = summary.match(/(\d+)\s*[–-]\s*(\d+)/);
    if (m) {
      expect(Number(m[2])).toBeLessThanOrEqual(total);
    }
    // next disabled on last page
    await expect(paginationNext(page)).toBeDisabled();

    // CAT-053 no empty extra page when divisible
    if (total % 15 === 0) {
      note('CAT-053: total divisible by 15 — next disabled prevents empty page');
      await expect(paginationNext(page)).toBeDisabled();
    } else {
      note(`CAT-053: total ${total} not divisible by 15 — N/A for empty-page edge`);
    }

    // CAT-055 checkbox not apply to other page rows
    await goToPageN(page, 1);
    await page.locator('.categories-data-table tbody tr input[type="checkbox"]').first().check();
    await goToPageN(page, 2);
    const page2Checks = page.locator('.categories-data-table tbody tr input[type="checkbox"]');
    const n = await page2Checks.count();
    for (let i = 0; i < n; i += 1) {
      await expect(page2Checks.nth(i)).not.toBeChecked();
    }
  });

  // ─── VII CREATE ───────────────────────────────────────────────────────
  test('CAT-060..064: thêm mới cơ bản + validation', async ({ page, request }) => {
    await uiLogin(page, ADMIN);
    await gotoCategories(page);
    const totalBefore = await readSummaryTotal(page);

    // CAT-060 open create
    await page.getByRole('button', { name: /Thêm mới/i }).click();
    await expect(page.getByText(/Thêm mới danh mục|Tạo danh mục sản phẩm mới/i).first()).toBeVisible();
    await expect(page.getByText(/^Tên \*$/i)).toBeVisible();
    await expect(page.locator('input.form-control').first()).toBeVisible();
    const codeInput = page.locator('label:has-text("Mã") input, .categories-form-field:has-text("Mã") input').first();
    await expect(codeInput).toBeVisible();
    const codeVal = await codeInput.inputValue();
    expect(codeVal).toMatch(/^DM-\d{4}$/);
    await expect(page.getByRole('button', { name: /^Lưu$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Hủy$/i })).toBeVisible();

    // CAT-061 cancel
    await page.locator('.categories-form-field:has-text("Tên") input').fill(`${FIXTURE_PREFIX} Cancel me`);
    await page.getByRole('button', { name: /^Hủy$/i }).click();
    await waitCategoriesLoaded(page);
    expect(await readSummaryTotal(page)).toBe(totalBefore);
    await filterCategories(page, `${FIXTURE_PREFIX} Cancel me`);
    await expect(page.getByText(/Chưa có dữ liệu/i)).toBeVisible();

    // CAT-064 empty name
    await refreshCategories(page);
    await page.getByRole('button', { name: /Thêm mới/i }).click();
    page.once('dialog', async (d) => {
      expect(d.message()).toMatch(/Tên danh mục là bắt buộc/i);
      await d.accept();
    });
    await page.getByRole('button', { name: /^Lưu$/i }).click();
    await expect(page.getByText(/Thêm mới danh mục|Tạo danh mục/i).first()).toBeVisible();

    // CAT-062 minimal create
    await page.locator('.categories-form-field:has-text("Tên") input').fill(`${FIXTURE_PREFIX} Tối thiểu`);
    await page.getByRole('button', { name: /^Lưu$/i }).click();
    await waitCategoriesLoaded(page);
    await filterCategories(page, `${FIXTURE_PREFIX} Tối thiểu`);
    await expect(categoryRow(page, `${FIXTURE_PREFIX} Tối thiểu`)).toBeVisible();
    await expect(categoryRow(page, `${FIXTURE_PREFIX} Tối thiểu`)).toContainText(/Đang hoạt động/i);

    // track for cleanup via code search
    const created = await (
      await request.get(
        `${API}/products/categories?q=${encodeURIComponent(`${FIXTURE_PREFIX} Tối thiểu`)}&limit=5`,
        { headers: { Authorization: `Bearer ${adminToken}` } },
      )
    ).json();
    for (const c of created.items || []) {
      if (String(c.name).includes(`${FIXTURE_PREFIX} Tối thiểu`) && c._id) {
        createdCategoryIds.push(String(c._id));
      }
    }
  });

  test('CAT-065..067: whitespace, trim, trùng mã', async ({ page, request }) => {
    await uiLogin(page, ADMIN);
    await gotoCategories(page);

    // CAT-065 whitespace-only name
    await page.getByRole('button', { name: /Thêm mới/i }).click();
    await page.locator('.categories-form-field:has-text("Tên") input').fill('   ');
    page.once('dialog', async (d) => {
      expect(d.message()).toMatch(/Tên danh mục là bắt buộc/i);
      await d.accept();
    });
    await page.getByRole('button', { name: /^Lưu$/i }).click();
    await page.getByRole('button', { name: /^Hủy$/i }).click();
    await waitCategoriesLoaded(page);

    // CAT-066 trim — create then edit verify (create code readonly)
    await page.getByRole('button', { name: /Thêm mới/i }).click();
    await page.locator('.categories-form-field:has-text("Tên") input').fill(`  ${FIXTURE_PREFIX} Trim  `);
    await page.locator('.categories-form-field:has-text("URL") input, .categories-form-field:has-text("Đường dẫn") input').fill('  /manual-trim  ');
    await page.getByRole('button', { name: /^Lưu$/i }).click();
    await waitCategoriesLoaded(page);
    await filterCategories(page, `${FIXTURE_PREFIX} Trim`);
    const row = categoryRow(page, `${FIXTURE_PREFIX} Trim`);
    await expect(row).toBeVisible();
    await openRowMenu(page, `${FIXTURE_PREFIX} Trim`);
    await page.getByRole('menuitem', { name: /^Sửa$/i }).click();
    await expect(page.locator('.categories-form-field:has-text("Tên") input')).toHaveValue(`${FIXTURE_PREFIX} Trim`);
    await expect(page.locator('.categories-form-field:has-text("Đường dẫn") input')).toHaveValue('/manual-trim');
    await page.getByRole('button', { name: /^Hủy$/i }).click();
    await waitCategoriesLoaded(page);

    const trimList = await (
      await request.get(`${API}/products/categories?q=${encodeURIComponent(`${FIXTURE_PREFIX} Trim`)}&limit=5`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    for (const c of trimList.items || []) {
      if (String(c.name).includes(`${FIXTURE_PREFIX} Trim`) && c._id) createdCategoryIds.push(String(c._id));
    }

    // CAT-067 duplicate code via API (UI create code is readonly DM-xxxx)
    const dupCode = `${FIXTURE_PREFIX}-DUP`;
    const first = await createCategoryApi(request, { name: `${FIXTURE_PREFIX} Dup1`, code: dupCode, isActive: true });
    const res2 = await request.post(`${API}/products/categories`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name: `${FIXTURE_PREFIX} Dup2`, code: dupCode, isActive: true },
    });
    const res2Status = res2.status();
    const res2Body = await res2.text();
    // Laravel unique validation → 422; unique constraint race → 409
    expect([409, 422].includes(res2Status), res2Body).toBeTruthy();
    note(`CAT-067: second create with same code -> ${res2Status}`);
    createdCategoryIds.push(String(first._id));
  });

  test('CAT-076..081: XSS, parent, depth, double-save', async ({ page, request }) => {
    // Guard unexpected dialogs (e.g. if XSS ever executes alert)
    const unexpectedDialogs: string[] = [];
    page.on('dialog', async (d) => {
      unexpectedDialogs.push(`${d.type()}:${d.message()}`);
      await d.dismiss().catch(() => d.accept().catch(() => {}));
    });

    await uiLogin(page, ADMIN);
    await gotoCategories(page);

    // CAT-076 XSS as text (avoid onerror=alert which can crash headed session if ever executed)
    const xssName = `${FIXTURE_PREFIX} <img src=x data-xss=1>`;
    await page.getByRole('button', { name: /Thêm mới/i }).click();
    await page.locator('.categories-form-field:has-text("Tên") input').fill(xssName);
    await page.getByRole('button', { name: /^Lưu$/i }).click();
    await waitCategoriesLoaded(page);
    await filterCategories(page, `${FIXTURE_PREFIX} <img`);
    // Must render as text, not as HTML image node inside the name cell
    const xssRow = categoryRow(page, 'data-xss');
    await expect(xssRow).toBeVisible({ timeout: 15_000 });
    await expect(xssRow.locator('img[data-xss]')).toHaveCount(0);
    await expect(xssRow).toContainText('<img');
    expect(unexpectedDialogs.filter((m) => m.startsWith('alert:'))).toEqual([]);
    const xssList = await (
      await request.get(`${API}/products/categories?q=${encodeURIComponent(FIXTURE_PREFIX)}&limit=50`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    for (const c of xssList.items || []) {
      if (String(c.name || '').includes('data-xss') && c._id) createdCategoryIds.push(String(c._id));
    }

    // CAT-077 parent select
    await refreshCategories(page);
    await page.getByRole('button', { name: /Thêm mới/i }).click();
    await page.locator('.categories-form-field:has-text("Tên") input').fill(`${FIXTURE_PREFIX} Child UI`);
    await page.locator('select.form-control').first().selectOption({ label: fx.root.name });
    await page.getByRole('button', { name: /^Lưu$/i }).click();
    await waitCategoriesLoaded(page);
    await filterCategories(page, `${FIXTURE_PREFIX} Child UI`);
    await expect(categoryRow(page, `${FIXTURE_PREFIX} Child UI`)).toBeVisible();
    await page.getByRole('tab', { name: /^Danh mục cha$/i }).click();
    await expect(page.getByText(`${FIXTURE_PREFIX} Child UI`)).toHaveCount(0);
    await page.getByRole('tab', { name: /^Tất cả$/i }).click();
    const childList = await (
      await request.get(`${API}/products/categories?q=${encodeURIComponent(`${FIXTURE_PREFIX} Child UI`)}&limit=5`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    for (const c of childList.items || []) {
      if (String(c.name).includes('Child UI') && c._id) createdCategoryIds.push(String(c._id));
    }

    // CAT-078 tree 4 levels already created in fixtures
    expect(fx.l4.id).toBeTruthy();
    const l4get = await (
      await request.get(`${API}/products/categories?q=${encodeURIComponent(fx.l4.code)}&limit=5`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    const l4item = (l4get.items || []).find((c: any) => c.code === fx.l4.code);
    expect(String(l4item?.parentId || '')).toBe(String(fx.l3.id));

    // CAT-079 level 5 — must be rejected (max 4 levels)
    const l5res = await request.post(`${API}/products/categories`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        name: `${FIXTURE_PREFIX} Level5`,
        code: `${FIXTURE_PREFIX}-L5`,
        parentId: Number(fx.l4.id) || fx.l4.id,
        isActive: true,
      },
    });
    const l5Body = await l5res.text();
    note(`CAT-079 create level5 status=${l5res.status()} body=${l5Body.slice(0, 180)}`);
    expect(l5res.status(), l5Body).toBeGreaterThanOrEqual(400);
    if (l5res.ok() || l5res.status() === 201) {
      const l5 = JSON.parse(l5Body);
      if (l5._id) createdCategoryIds.push(String(l5._id));
    }

    // CAT-081 double-click save — only one record
    await refreshCategories(page);
    await page.getByRole('button', { name: /Thêm mới/i }).click();
    await page.locator('.categories-form-field:has-text("Tên") input').fill(`${FIXTURE_PREFIX} DoubleSave`);
    const saveBtn = page.getByRole('button', { name: /^Lưu$/i });
    await Promise.all([saveBtn.click(), saveBtn.click().catch(() => {})]);
    await waitCategoriesLoaded(page);
    await filterCategories(page, `${FIXTURE_PREFIX} DoubleSave`);
    const dbl = await (
      await request.get(`${API}/products/categories?q=${encodeURIComponent(`${FIXTURE_PREFIX} DoubleSave`)}&limit=10`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    const matches = (dbl.items || []).filter((c: any) => String(c.name) === `${FIXTURE_PREFIX} DoubleSave`);
    expect(matches.length).toBeLessThanOrEqual(1);
    for (const c of matches) if (c._id) createdCategoryIds.push(String(c._id));
  });

  // ─── VIII EDIT ────────────────────────────────────────────────────────
  test('CAT-090..100: sửa danh mục', async ({ page, request }) => {
    await uiLogin(page, ADMIN);
    await gotoCategories(page);
    await filterCategories(page, fx.edit.code);

    // CAT-090 open edit
    await openRowMenu(page, fx.edit.name);
    await page.getByRole('menuitem', { name: /^Sửa$/i }).click();
    await expect(page.getByText(/Chỉnh sửa danh mục/i).first()).toBeVisible();
    await expect(page.locator('.categories-form-field:has-text("Tên") input')).toHaveValue(fx.edit.name);

    // CAT-091 cancel
    await page.locator('.categories-form-field:has-text("Tên") input').fill(`${fx.edit.name} changed`);
    await page.getByRole('button', { name: /^Hủy$/i }).click();
    await waitCategoriesLoaded(page);
    await filterCategories(page, fx.edit.code);
    await expect(categoryRow(page, fx.edit.name)).toBeVisible();

    // CAT-092 rename empty fixture
    await openRowMenu(page, fx.edit.name);
    await page.getByRole('menuitem', { name: /^Sửa$/i }).click();
    const newName = `${fx.edit.name} mới`;
    await page.locator('.categories-form-field:has-text("Tên") input').fill(newName);
    await page.getByRole('button', { name: /^Lưu$/i }).click();
    await waitCategoriesLoaded(page);
    await filterCategories(page, fx.edit.code);
    await expect(categoryRow(page, newName)).toBeVisible();
    fx.edit.name = newName;

    // CAT-093 change code (new code must not contain old code as LIKE substring)
    await openRowMenu(page, fx.edit.name);
    await page.getByRole('menuitem', { name: /^Sửa$/i }).click();
    const oldCode = fx.edit.code;
    const newCode = `${FIXTURE_PREFIX}-EDTX`;
    await page.locator('.categories-form-field:has-text("Mã") input').fill(newCode);
    await page.getByRole('button', { name: /^Lưu$/i }).click();
    await waitCategoriesLoaded(page);
    await filterCategories(page, oldCode);
    // LIKE %oldCode% must not match newCode
    const oldSearchText = (await page.locator('.categories-data-table tbody').textContent()) || '';
    expect(oldSearchText).not.toContain(newCode);
    if (!/Chưa có dữ liệu/i.test(oldSearchText)) {
      // only pass if no row still has the old exact code
      await expect(page.locator('.categories-code-badge', { hasText: oldCode })).toHaveCount(0);
    }
    await filterCategories(page, newCode);
    await expect(categoryRow(page, newCode)).toBeVisible();
    fx.edit.code = newCode;

    // CAT-094 duplicate code
    await openRowMenu(page, fx.edit.name);
    await page.getByRole('menuitem', { name: /^Sửa$/i }).click();
    await page.locator('.categories-form-field:has-text("Mã") input').fill(fx.empty.code);
    page.once('dialog', async (d) => {
      expect(d.message()).toMatch(/thất bại|tồn tại|fail/i);
      await d.accept();
    });
    await page.getByRole('button', { name: /^Lưu$/i }).click();
    // still on editor or back with unchanged
    await page.waitForTimeout(800);
    if (await page.getByRole('button', { name: /^Hủy$/i }).count()) {
      await page.getByRole('button', { name: /^Hủy$/i }).click();
    }
    await waitCategoriesLoaded(page);

    // CAT-096/097 status toggle
    await filterCategories(page, fx.edit.code);
    await openRowMenu(page, fx.edit.name);
    await page.getByRole('menuitem', { name: /^Sửa$/i }).click();
    await page.locator('.categories-form-field:has-text("Trạng thái") select').selectOption('inactive');
    await page.getByRole('button', { name: /^Lưu$/i }).click();
    await waitCategoriesLoaded(page);
    await filterCategories(page, fx.edit.code);
    await expect(categoryRow(page, fx.edit.code)).toContainText(/Ngừng hoạt động/i);

    await openRowMenu(page, fx.edit.name);
    await page.getByRole('menuitem', { name: /^Sửa$/i }).click();
    await page.locator('.categories-form-field:has-text("Trạng thái") select').selectOption('active');
    await page.getByRole('button', { name: /^Lưu$/i }).click();
    await waitCategoriesLoaded(page);
    await filterCategories(page, fx.edit.code);
    await expect(categoryRow(page, fx.edit.code)).toContainText(/Đang hoạt động/i);

    // CAT-100 self not in parent options
    await openRowMenu(page, fx.edit.name);
    await page.getByRole('menuitem', { name: /^Sửa$/i }).click();
    const options = await page.locator('select.form-control').first().locator('option').allTextContents();
    expect(options.join('\n')).not.toContain(fx.edit.name);
    await page.getByRole('button', { name: /^Hủy$/i }).click();
  });

  test('CAT-101..102: vòng lặp parent (high risk)', async ({ request }) => {
    // A is parent of B. Try set A.parent = B
    const res = await updateCategoryApi(request, fx.loopA.id, {
      parentId: Number(fx.loopB.id) || fx.loopB.id,
    });
    note(`CAT-101 set A.parent=B status=${res.status} body=${res.body.slice(0, 200)}`);
    if (res.status >= 200 && res.status < 300) {
      note('CAT-101 CRITICAL ISSUE: cycle A↔B allowed by backend');
      // restore
      await updateCategoryApi(request, fx.loopA.id, { parentId: null });
    }
    // Expect rejection for correct business rule
    expect(res.status, `cycle A→B should be rejected: ${res.body}`).toBeGreaterThanOrEqual(400);

    // multi-level: A→B→C, set A.parent=C
    // ensure structure A<-B<-C
    await updateCategoryApi(request, fx.loopA.id, { parentId: null });
    await updateCategoryApi(request, fx.loopB.id, { parentId: Number(fx.loopA.id) || fx.loopA.id });
    await updateCategoryApi(request, fx.loopC.id, { parentId: Number(fx.loopB.id) || fx.loopB.id });
    const res2 = await updateCategoryApi(request, fx.loopA.id, {
      parentId: Number(fx.loopC.id) || fx.loopC.id,
    });
    note(`CAT-102 set A.parent=C status=${res2.status} body=${res2.body.slice(0, 200)}`);
    if (res2.status >= 200 && res2.status < 300) {
      note('CAT-102 CRITICAL ISSUE: multi-level cycle allowed');
      await updateCategoryApi(request, fx.loopA.id, { parentId: null });
    }
    expect(res2.status, `cycle A→C should be rejected: ${res2.body}`).toBeGreaterThanOrEqual(400);
  });

  test('CAT-104: đổi tên danh mục có SP — đồng bộ categoryName', async ({ page, request }) => {
    await uiLogin(page, ADMIN);
    await gotoCategories(page);
    await filterCategories(page, fx.prod.code);
    const renamed = `${fx.prod.name} - Đã đổi tên`;
    await openRowMenu(page, fx.prod.name);
    await page.getByRole('menuitem', { name: /^Sửa$/i }).click();
    await page.locator('.categories-form-field:has-text("Tên") input').fill(renamed);
    await page.getByRole('button', { name: /^Lưu$/i }).click();
    await waitCategoriesLoaded(page);
    fx.prod.name = renamed;

    // product API should still have same categoryId
    const pRes = await request.get(`${API}/products/products?q=${encodeURIComponent(products.sp001.code)}&limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(pRes.ok()).toBeTruthy();
    const pdata = await pRes.json();
    const p = (pdata.items || []).find((x: any) => x.code === products.sp001.code);
    expect(p).toBeTruthy();
    expect(String(p.categoryId || p.category_id)).toBe(String(fx.prod.id));
    const catName = String(p.categoryName || p.category_name || '');
    note(`CAT-104 product.categoryName after rename="${catName}" expected="${renamed}"`);
    // Critical: name must sync
    expect(catName).toBe(renamed);

    // UI products page
    await page.goto('/products');
    await expect(page.getByText(/Đang tải dữ liệu/i)).toHaveCount(0, { timeout: 45_000 });
    await page.getByPlaceholder(/Tìm theo tên, mã hoặc barcode/i).fill(products.sp001.code);
    await page.getByRole('button', { name: /^Lọc$/i }).click();
    await expect(page.getByText(/Đang tải dữ liệu/i)).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator('body')).toContainText(renamed);
  });

  // ─── IX VIEW PRODUCTS ─────────────────────────────────────────────────
  test('CAT-110..120: xem sản phẩm thuộc danh mục', async ({ page }) => {
    const dismissViteOverlay = async () => {
      await page.locator('vite-error-overlay').evaluate((el) => el.remove()).catch(() => {});
    };

    await uiLogin(page, ADMIN);
    await gotoCategories(page);
    await filterCategories(page, fx.prod.code);

    await openRowMenu(page, fx.prod.name);
    await page.getByRole('menuitem', { name: /Xem sản phẩm/i }).click();
    await expect(page.locator('.categories-modal-card, .modal-card-wide').first()).toBeVisible();
    await expect(page.getByText(fx.prod.name).first()).toBeVisible();
    await expect(page.getByText(/Tổng số:/i)).toContainText(/2/);
    await expect(page.getByText(products.sp001.code)).toBeVisible();
    await expect(page.getByText(products.sp002.code)).toBeVisible();
    // columns
    await expect(page.locator('.categories-modal-table thead')).toContainText(/Mã SP/);
    await expect(page.locator('.categories-modal-table thead')).toContainText(/Tên sản phẩm/);
    await expect(page.locator('.categories-modal-table thead')).toContainText(/Tổng tồn/);

    // CAT-113 search product code
    await page.locator('.categories-modal-card input[placeholder*="Tìm sản phẩm"]').fill(products.sp001.code);
    await expect(page.getByText(products.sp001.code)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(products.sp002.code)).toHaveCount(0);

    // CAT-116 other product not in category
    await page.locator('.categories-modal-card input[placeholder*="Tìm sản phẩm"]').fill('NOT-IN-CAT-XYZ');
    await expect(page.getByText(/Không có sản phẩm nào thuộc danh mục này/i)).toBeVisible({ timeout: 15_000 });

    // CAT-119 close X
    await dismissViteOverlay();
    await page.locator('.categories-modal-close').click({ force: true });
    await expect(page.locator('.categories-modal-card')).toHaveCount(0);

    // CAT-111 empty category
    await filterCategories(page, fx.empty.code);
    await openRowMenu(page, fx.empty.name);
    await page.getByRole('menuitem', { name: /Xem sản phẩm/i }).click();
    await expect(page.getByText(/Không có sản phẩm nào thuộc danh mục này/i)).toBeVisible();
    // CAT-120 close button
    await dismissViteOverlay();
    await page.locator('.categories-modal-footer .btn, .modal-footer .btn').filter({ hasText: /^Đóng$/i }).click({ force: true });
    await expect(page.locator('.categories-modal-card')).toHaveCount(0);
  });

  // ─── X DELETE ─────────────────────────────────────────────────────────
  test('CAT-130..136: xóa danh mục', async ({ page, request }) => {
    await uiLogin(page, ADMIN);
    await gotoCategories(page);

    // CAT-130 cancel delete
    await filterCategories(page, fx.delEmpty.code);
    page.once('dialog', async (d) => {
      expect(d.type()).toBe('confirm');
      await d.dismiss();
    });
    await openRowMenu(page, fx.delEmpty.name);
    await page.getByRole('menuitem', { name: /^Xóa$/i }).click();
    await expect(categoryRow(page, fx.delEmpty.code)).toBeVisible();

    // CAT-132 delete category with products blocked (confirm + alert)
    await filterCategories(page, fx.prod.code);
    const dialogs132: string[] = [];
    const onDialog132 = async (d: Dialog) => {
      dialogs132.push(`${d.type()}:${d.message()}`);
      await d.accept();
    };
    page.on('dialog', onDialog132);
    await openRowMenu(page, fx.prod.name);
    await page.getByRole('menuitem', { name: /^Xóa$/i }).click();
    await expect.poll(() => dialogs132.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
    page.off('dialog', onDialog132);
    note(`CAT-132 dialogs: ${dialogs132.join(' | ')}`);
    // still exists via API
    const still = await request.get(`${API}/products/categories?q=${encodeURIComponent(fx.prod.code)}&limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const stillData = await still.json();
    expect((stillData.items || []).some((c: any) => c.code === fx.prod.code)).toBeTruthy();
    // products intact
    const pStill = await (
      await request.get(`${API}/products/products?q=${encodeURIComponent(products.sp001.code)}&limit=5`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    expect((pStill.items || []).some((p: any) => p.code === products.sp001.code)).toBeTruthy();

    // CAT-133 delete parent with children blocked
    const delRoot = await deleteCategoryApi(request, fx.root.id);
    expect(delRoot).toBe(409);

    // CAT-134 delete leaf empty OK — use delEmpty
    await page.goto('/products/categories');
    await waitCategoriesLoaded(page);
    await filterCategories(page, fx.delEmpty.code);
    page.once('dialog', async (d) => {
      await d.accept();
    });
    await openRowMenu(page, fx.delEmpty.name);
    await page.getByRole('menuitem', { name: /^Xóa$/i }).click();
    await expect(page.getByText(/Đang tải dữ liệu/i)).toHaveCount(0, { timeout: 30_000 });
    await filterCategories(page, fx.delEmpty.code);
    await expect(page.getByText(/Chưa có dữ liệu/i)).toBeVisible();
    fx.delEmpty.id = '';

    // CAT-135 delete tree bottom-up via API
    let s = await deleteCategoryApi(request, fx.l4.id);
    expect(s === 200 || s === 204).toBeTruthy();
    s = await deleteCategoryApi(request, fx.l3.id);
    expect(s === 200 || s === 204).toBeTruthy();
    s = await deleteCategoryApi(request, fx.l2.id);
    expect(s === 200 || s === 204).toBeTruthy();
    s = await deleteCategoryApi(request, fx.root.id);
    if (s === 409) {
      note('CAT-135 root still has children from earlier create tests — cleanup later');
    } else {
      expect(s === 200 || s === 204).toBeTruthy();
      fx.root.id = '';
      fx.l2.id = '';
      fx.l3.id = '';
      fx.l4.id = '';
    }
  });

  // ─── XI BULK ──────────────────────────────────────────────────────────
  test('CAT-150..161: chọn dòng và bulk', async ({ page, request }) => {
    await uiLogin(page, ADMIN);
    await gotoCategories(page);
    await filterCategories(page, `${FIXTURE_PREFIX}-BK`);

    // ensure bulk fixtures exist
    for (const key of ['bulk1', 'bulk2', 'bulk3'] as const) {
      await expect(categoryRow(page, fx[key].code)).toBeVisible();
    }

    // CAT-150 select one
    const row1 = categoryRow(page, fx.bulk1.code);
    await row1.locator('input[type="checkbox"]').check();
    await expect(page.locator('.categories-summary-cluster')).toContainText(/1 đã chọn/);

    // CAT-151 unselect
    await row1.locator('input[type="checkbox"]').uncheck();
    await expect(page.locator('.categories-selected-count')).toContainText(/Đã chọn 0/);

    // CAT-155 bulk with none selected
    page.once('dialog', async (d) => {
      expect(d.message()).toMatch(/Vui lòng chọn ít nhất một danh mục/i);
      await d.accept();
    });
    await page.getByRole('button', { name: /^Thao tác$/i }).click();
    await page.getByRole('menuitem', { name: /Xóa các dòng đã chọn/i }).click();

    // CAT-156 bulk inactive
    await filterCategories(page, `${FIXTURE_PREFIX}-BK`);
    await categoryRow(page, fx.bulk1.code).locator('input[type="checkbox"]').check();
    await categoryRow(page, fx.bulk2.code).locator('input[type="checkbox"]').check();
    page.once('dialog', async (d) => {
      expect(d.message()).toMatch(/cập nhật/i);
      await d.accept();
    });
    await page.getByRole('button', { name: /^Thao tác$/i }).click();
    await page.getByRole('menuitem', { name: /Đổi trạng thái/i }).click();
    await page.getByRole('menuitem', { name: /Ngừng hoạt động/i }).click();
    await expect(page.getByText(/Đang tải dữ liệu/i)).toHaveCount(0, { timeout: 30_000 });
    await filterCategories(page, fx.bulk1.code);
    await expect(categoryRow(page, fx.bulk1.code)).toContainText(/Ngừng hoạt động/i);

    // CAT-157 bulk active
    await filterCategories(page, `${FIXTURE_PREFIX}-BK`);
    await categoryRow(page, fx.bulk1.code).locator('input[type="checkbox"]').check();
    await categoryRow(page, fx.bulk2.code).locator('input[type="checkbox"]').check();
    page.once('dialog', async (d) => {
      await d.accept();
    });
    await page.getByRole('button', { name: /^Thao tác$/i }).click();
    await page.getByRole('menuitem', { name: /Đổi trạng thái/i }).click();
    await page.getByRole('menuitem', { name: /^Hoạt động$/i }).click();
    await expect(page.getByText(/Đang tải dữ liệu/i)).toHaveCount(0, { timeout: 30_000 });

    // CAT-154 select all uses items not visibleItems — document when tab filter
    await refreshCategories(page);
    await filterCategories(page, FIXTURE_PREFIX);
    await page.getByRole('tab', { name: /^Hoạt động$/i }).click();
    await page.getByLabel(/Chọn tất cả danh mục trên trang/i).check();
    const selectedCountText = (await page.locator('.categories-selected-count').textContent()) || '';
    const visibleCount = await page.locator('.categories-data-table tbody tr input[type="checkbox"]').count();
    const m = selectedCountText.match(/(\d+)/);
    const selectedN = m ? Number(m[1]) : 0;
    note(`CAT-154: selected=${selectedN} visibleCheckboxes=${visibleCount}`);
    // Correct behavior: selected should equal visible rows under tab filter
    expect(selectedN).toBe(visibleCount);

    // CAT-161 bulk delete mix empty + with products
    const disposable = await createCategoryApi(request, {
      name: `${FIXTURE_PREFIX} Disposable`,
      code: `${FIXTURE_PREFIX}-DISP`,
      isActive: true,
    });
    await refreshCategories(page);
    await filterCategories(page, FIXTURE_PREFIX);
    await categoryRow(page, `${FIXTURE_PREFIX}-DISP`).locator('input[type="checkbox"]').check();
    await categoryRow(page, fx.prod.code).locator('input[type="checkbox"]').check();
    const dialogs161: string[] = [];
    const onDialog161 = async (d: Dialog) => {
      dialogs161.push(d.message());
      await d.accept();
    };
    page.on('dialog', onDialog161);
    await page.getByRole('button', { name: /^Thao tác$/i }).click();
    await page.getByRole('menuitem', { name: /Xóa các dòng đã chọn/i }).click();
    await expect.poll(() => dialogs161.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
    page.off('dialog', onDialog161);
    note(`CAT-161 dialogs: ${dialogs161.join(' || ')}`);
    const resultMsg = dialogs161.find((m) => /Đã xóa|Thất bại/i.test(m)) || dialogs161[dialogs161.length - 1] || '';
    expect(resultMsg).toMatch(/Đã xóa 1\/2|Thất bại/i);
    await expect(page.getByText(/Đang tải dữ liệu/i)).toHaveCount(0, { timeout: 45_000 });
    // prod remains
    await filterCategories(page, fx.prod.code);
    await expect(categoryRow(page, fx.prod.code)).toBeVisible();
    // disposable gone
    await filterCategories(page, `${FIXTURE_PREFIX}-DISP`);
    await expect(page.getByText(/Chưa có dữ liệu/i)).toBeVisible();
    void disposable;
  });

  // ─── XII MENUS ────────────────────────────────────────────────────────
  test('CAT-170..176: menu tương tác', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await gotoCategories(page);

    // CAT-170 add menu
    await page.getByRole('button', { name: /Mở menu thêm/i }).click();
    await expect(page.getByRole('menuitem', { name: /Nhập từ Excel/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Mở menu thêm/i })).toHaveAttribute('aria-expanded', 'true');

    // CAT-171 bulk menu
    await page.getByRole('button', { name: /^Thao tác$/i }).click();
    await expect(page.getByRole('menuitem', { name: /Xuất dữ liệu/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Đổi trạng thái/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Xóa các dòng đã chọn/i })).toBeVisible();

    // CAT-173 click outside closes
    await page.locator('.categories-compact-heading-sr, h2.categories-table-title').first().click({ force: true });
    await expect(page.getByRole('menuitem', { name: /Xuất dữ liệu/i })).toHaveCount(0);

    // CAT-172 row menu
    await filterCategories(page, fx.empty.code);
    await openRowMenu(page, fx.empty.name);
    await expect(page.getByRole('menuitem', { name: /Xem sản phẩm/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /^Sửa$/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /^Xóa$/i })).toBeVisible();

    // CAT-174 Escape
    await page.keyboard.press('Escape');
    await expect(page.locator('.categories-row-action-menu')).toHaveCount(0);
  });

  // ─── XIII IMPORT ──────────────────────────────────────────────────────
  test('CAT-180..186: import excel cơ bản', async ({ page, request }) => {
    await uiLogin(page, ADMIN);
    await gotoCategories(page);

    await page.getByRole('button', { name: /Mở menu thêm/i }).click();
    await page.getByRole('menuitem', { name: /Nhập từ Excel/i }).click();
    await expect(page.getByText(/Nhập danh mục sản phẩm từ Excel/i)).toBeVisible();
    await expect(page.getByText(/Thêm mới danh mục/i)).toBeVisible();
    await expect(page.getByText(/Cập nhật danh mục/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Upload và nhập/i })).toBeDisabled();

    // CAT-182 cancel
    await page.getByRole('button', { name: /^Hủy$/i }).click();
    await expect(page.getByText(/Nhập danh mục sản phẩm từ Excel/i)).toHaveCount(0);

    // CAT-184 create simple import file
    const importName = `${FIXTURE_PREFIX}-IMPORT-A`;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['note']]), 'Ghi chú');
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Danh mục cấp 1', 'Danh mục cấp 2', 'Danh mục cấp 3', 'Danh mục cấp 4', 'Hoạt động'],
        [importName, '', '', '', 'Có'],
      ]),
      'Danh mục sản phẩm',
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['suggest']]), 'suggestView');
    const tmp = path.join(ARTIFACT_DIR, 'import-simple.xlsx');
    XLSX.writeFile(wb, tmp);

    await page.getByRole('button', { name: /Mở menu thêm/i }).click();
    await page.getByRole('menuitem', { name: /Nhập từ Excel/i }).click();
    await page.locator('.categories-import-modal input[type="file"]').setInputFiles(tmp);
    page.once('dialog', async (d) => {
      note(`CAT-184 import alert: ${d.message()}`);
      expect(d.message()).toMatch(/Tạo mới:\s*1|Import hoàn tất/i);
      await d.accept();
    });
    await page.getByRole('button', { name: /Upload và nhập/i }).click();
    await expect(page.getByText(/Đang tải dữ liệu/i)).toHaveCount(0, { timeout: 45_000 });
    await filterCategories(page, importName);
    await expect(page.getByText(importName).first()).toBeVisible({ timeout: 15_000 });

    const imp = await (
      await request.get(`${API}/products/categories?q=${encodeURIComponent(importName)}&limit=5`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    for (const c of imp.items || []) {
      if (String(c.name) === importName && c._id) createdCategoryIds.push(String(c._id));
    }

    // CAT-186 sequential tree import
    const treePrefix = `${FIXTURE_PREFIX}-IT`;
    const l1 = `${treePrefix}-L1`;
    const l2 = `${treePrefix}-L2`;
    const l3 = `${treePrefix}-L3`;
    const l4 = `${treePrefix}-L4`;
    const wb2 = XLSX.utils.book_new();
    // Importer uses SheetNames[1] OR sheet named "Danh mục sản phẩm"
    XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet([['note']]), 'Ghi chú');
    XLSX.utils.book_append_sheet(
      wb2,
      XLSX.utils.aoa_to_sheet([
        ['Danh mục cấp 1', 'Danh mục cấp 2', 'Danh mục cấp 3', 'Danh mục cấp 4', 'Hoạt động'],
        [l1, '', '', '', 'Có'],
        [l1, l2, '', '', 'Có'],
        [l1, l2, l3, '', 'Có'],
        [l1, l2, l3, l4, 'Có'],
      ]),
      'Danh mục sản phẩm',
    );
    XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet([['s']]), 'suggestView');
    const tmp2 = path.join(ARTIFACT_DIR, 'import-tree.xlsx');
    XLSX.writeFile(wb2, tmp2);

    await page.getByRole('button', { name: /Mở menu thêm/i }).click();
    await page.getByRole('menuitem', { name: /Nhập từ Excel/i }).click();
    await page.locator('.categories-import-modal input[type="file"]').setInputFiles(tmp2);
    const dialogs186: string[] = [];
    const onDialog186 = async (d: Dialog) => {
      dialogs186.push(d.message());
      await d.accept();
    };
    page.on('dialog', onDialog186);
    await page.getByRole('button', { name: /Upload và nhập/i }).click();
    await expect.poll(() => dialogs186.length, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
    page.off('dialog', onDialog186);
    note(`CAT-186 import tree alert: ${dialogs186.join(' || ')}`);
    expect(dialogs186.join(' ')).toMatch(/Tạo mới:\s*[1-9]|Import hoàn tất/i);
    await expect(page.getByText(/Đang tải dữ liệu/i)).toHaveCount(0, { timeout: 60_000 });

    // Search each level name to avoid partial-match issues with long prefixes
    const found: string[] = [];
    for (const name of [l1, l2, l3, l4]) {
      const res = await (
        await request.get(`${API}/products/categories?q=${encodeURIComponent(name)}&limit=20`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        })
      ).json();
      for (const c of res.items || []) {
        if (String(c.name) === name && c._id) {
          found.push(name);
          createdCategoryIds.push(String(c._id));
        }
      }
    }
    note(`CAT-186 tree import found levels: ${found.join(', ')}`);
    expect(found.length).toBeGreaterThanOrEqual(4);
  });

  // ─── EMPLOYEE SCOPE ───────────────────────────────────────────────────
  test('ROLE-02: Employee có thể xem danh mục; thao tác ghi phụ thuộc quyền API', async ({
    page,
    request,
  }) => {
    await uiLogin(page, EMPLOYEE);
    await gotoCategories(page);
    await expect(page.locator('.categories-data-table')).toBeVisible();
    await filterCategories(page, fx.empty.code);
    // try create via API with employee token
    const res = await request.post(`${API}/products/categories`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
      data: { name: `${FIXTURE_PREFIX} EmpCreate`, code: `${FIXTURE_PREFIX}-EMPC`, isActive: true },
    });
    note(`ROLE-02 employee create category status=${res.status()}`);
    if (res.ok() || res.status() === 201) {
      const c = await res.json();
      if (c._id) {
        createdCategoryIds.push(String(c._id));
        // cleanup with admin
        await deleteCategoryApi(request, String(c._id));
      }
      note('ROLE-02: EMPLOYEE được phép tạo category qua API');
    } else {
      note(`ROLE-02: EMPLOYEE bị chặn tạo category (${res.status()}) — đúng nếu chỉ admin ghi`);
    }
  });
});
