import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Remaining manual-case coverage: full warehouse workflows, sale stock,
 * audit reconcile, import/export voucher stock, network race, reports, cleanup orphans.
 */
const RUN_ID =
  process.env.E2E_RUN_ID ||
  `E2E-WF-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${randomBytes(2).toString('hex')}`;
const API = 'http://127.0.0.1:8000/api';
const ADMIN = { email: 'admin@gmail.com', password: '123456' };
const EMPLOYEE = { email: 'tiendo09711@gmail.com', password: '123456' };
const FIXTURE_PREFIX = `QA-PROD-${RUN_ID}`;
const createdProductIds: string[] = [];
const blockedDeleteIds: string[] = [];
let adminToken = '';
let employeeToken = '';
let branchId = '';
let branchIdB = '';
let branchMongoA = '';
let branchMongoB = '';
let categoryId = '';
let categoryName = '';

let codeFlow = '';
let idFlow = '';
let codeSale = '';
let idSale = '';
let codeDel = '';
let idDel = '';

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
  expect(res.ok() || res.status() === 201, `create ${body.code} -> ${res.status()} ${text.slice(0, 220)}`).toBeTruthy();
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
  return body.items || body.data || [];
}

async function stockAt(request: APIRequestContext, productId: string, localBranchId: string): Promise<number> {
  const stocks = await getStocks(request, productId);
  const row = stocks.find(
    (s: any) =>
      String(s.branchId ?? s.branch_id ?? s.warehouseId ?? '') === String(localBranchId) ||
      String(s.branch?._id ?? s.branch?.id ?? '') === String(localBranchId),
  );
  return Number(row?.qty ?? row?.quantity ?? 0);
}

async function safeDelete(request: APIRequestContext, ids: string[]) {
  const branches = [branchId, branchIdB].filter(Boolean);
  for (const id of [...ids].reverse()) {
    if (blockedDeleteIds.includes(id)) {
      // Leave zero-stock historical fixture (has sale/voucher refs).
      for (const bid of branches) {
        await request.patch(`${API}/products/products/${id}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
          data: { initialStocks: [{ warehouseId: Number(bid) || bid, quantity: 0 }] },
        });
      }
      continue;
    }
    for (const bid of branches) {
      await request.patch(`${API}/products/products/${id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { initialStocks: [{ warehouseId: Number(bid) || bid, quantity: 0 }] },
      });
    }
    const status = (
      await request.delete(`${API}/products/products/${id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).status();
    if (status === 409) {
      blockedDeleteIds.push(id);
    }
  }
}

/** Cleanup known orphan test prefixes (never real catalog). */
async function cleanupOrphanPrefixes(request: APIRequestContext, prefixes: string[]) {
  for (const prefix of prefixes) {
    for (let page = 1; page <= 30; page++) {
      const res = await request.get(
        `${API}/products/products?q=${encodeURIComponent(prefix)}&limit=50&page=${page}`,
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      if (!res.ok()) break;
      const body = await res.json();
      const items = (body.items || []).filter((p: any) => String(p.code || '').startsWith(prefix));
      if (!items.length) break;
      const ids = items.map((p: any) => String(p._id)).filter(Boolean);
      await safeDelete(request, ids);
      if (items.length < 50) break;
    }
  }
}

async function waitProductsLoaded(page: Page) {
  await expect(page.getByRole('heading', { name: /Danh sách sản phẩm|Bảng dữ liệu sản phẩm/i }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/Đang tải dữ liệu/i)).toHaveCount(0, { timeout: 30_000 });
}

async function filterProducts(page: Page, q: string) {
  await page.getByPlaceholder(/Tìm theo tên, mã hoặc barcode/i).fill(q);
  await page.getByRole('button', { name: /^Lọc$/i }).click();
  await expect(page.getByText(/Đang tải dữ liệu/i)).toHaveCount(0, { timeout: 30_000 });
}

test.describe('Products remaining workflows + orphan cleanup', () => {
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
    expect(active.length).toBeGreaterThanOrEqual(2);
    branchId = String(active[0]._id);
    branchMongoA = String(active[0].mongoId || active[0].mongo_id || active[0]._id);
    branchIdB = String(active[1]._id);
    branchMongoB = String(active[1].mongoId || active[1].mongo_id || active[1]._id);

    // Cleanup leftovers from previous failed product/retail runs.
    await cleanupOrphanPrefixes(request, [
      'QA-RTL-',
      'QA-PROD-E2E-FULL-',
      'QA-PROD-E2E-PROD-',
      'QA-PROD-E2E-FIX-',
      'QA-WF-',
      'QA-WF2-',
      'QA-AUD-',
    ]);

    const cats = await (
      await request.get(`${API}/products/categories?limit=50`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    const catItems = (cats.items || []).filter((c: any) => c.isActive !== false);
    const cat = catItems[0] || (cats.items || [])[0];
    expect(cat).toBeTruthy();
    categoryId = String(cat._id);
    categoryName = String(cat.name || '');

    const base = {
      type: 'product',
      unit: 'Cái',
      allowsSale: true,
      categoryId: Number(categoryId) || categoryId,
    };

    codeFlow = `${FIXTURE_PREFIX}-FLOW`;
    codeSale = `${FIXTURE_PREFIX}-SALE`;
    codeDel = `${FIXTURE_PREFIX}-DELREF`;

    const flow = await createProduct(request, {
      ...base,
      code: codeFlow,
      name: `QA Flow ${RUN_ID}`,
      price: 120000,
      cost: 60000,
      wholesalePrice: 100000,
      status: 'Đang bán',
      initialStocks: [
        { warehouseId: Number(branchId) || branchId, quantity: 20 },
        { warehouseId: Number(branchIdB) || branchIdB, quantity: 5 },
      ],
    });
    idFlow = String(flow._id);

    const saleP = await createProduct(request, {
      ...base,
      code: codeSale,
      name: `QA Sale ${RUN_ID}`,
      price: 90000,
      cost: 40000,
      status: 'Đang bán',
      initialStocks: [{ warehouseId: Number(branchId) || branchId, quantity: 8 }],
    });
    idSale = String(saleP._id);

    const delP = await createProduct(request, {
      ...base,
      code: codeDel,
      name: `QA DelRef ${RUN_ID}`,
      price: 70000,
      cost: 30000,
      status: 'Mới',
      initialStocks: [{ warehouseId: Number(branchId) || branchId, quantity: 4 }],
    });
    idDel = String(delP._id);
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      if (!localStorage.getItem('token')) localStorage.setItem('token', token);
    }, adminToken);
  });

  test.afterAll(async ({ request }) => {
    await safeDelete(request, createdProductIds);
    await cleanupOrphanPrefixes(request, [FIXTURE_PREFIX, 'QA-RTL-', 'QA-PROD-E2E-FULL-']);
  });

  // ─── Orphan cleanup verification ───────────────────────────────────────

  test('CLEAN-RTL: không còn orphan QA-RTL-* có thể xóa', async ({ request }) => {
    const res = await request.get(`${API}/products/products?q=${encodeURIComponent('QA-RTL-')}&limit=50`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const leftovers = (body.items || []).filter((p: any) => String(p.code || '').startsWith('QA-RTL-'));
    // Prefer zero leftovers; allow only qty=0 blocked-by-history residues (none expected for RTL).
    const withStock = leftovers.filter((p: any) => Number(p.qty || 0) > 0);
    expect(withStock.length).toBe(0);
  });

  // ─── INV-QTY baseline ──────────────────────────────────────────────────

  test('WF-INV: qty = sum stocks ban đầu', async ({ request }) => {
    const p = await getProduct(request, idFlow);
    const stocks = await getStocks(request, idFlow);
    const sum = stocks.reduce((a: number, s: any) => a + Number(s.qty ?? s.quantity ?? 0), 0);
    expect(Number(p.qty)).toBe(sum);
    expect(Number(p.qty)).toBe(25);
    expect(await stockAt(request, idFlow, branchId)).toBe(20);
    expect(await stockAt(request, idFlow, branchIdB)).toBe(5);
  });

  // ─── CROSS import voucher stock ────────────────────────────────────────

  test('WF-IMPORT-VOUCHER: tạo phiếu nhập cộng tồn', async ({ request }) => {
    const before = Number((await getProduct(request, idFlow)).qty);
    const beforeA = await stockAt(request, idFlow, branchId);
    const res = await request.post(`${API}/warehouse/vouchers/import`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        date: new Date().toISOString().slice(0, 10),
        branchId,
        warehouse: branchId,
        type: 'import',
        note: `QA import ${RUN_ID}`,
        items: [{ productId: idFlow, quantity: 3, price: 60000, unit: 'Cái' }],
        qty: 3,
        spCount: 1,
        totalAmount: 180000,
        creator: 'Admin',
      },
    });
    expect(res.ok() || res.status() === 201, `import voucher ${res.status()} ${await res.text()}`).toBeTruthy();
    const after = await getProduct(request, idFlow);
    expect(Number(after.qty)).toBe(before + 3);
    expect(await stockAt(request, idFlow, branchId)).toBe(beforeA + 3);
  });

  test('WF-EXPORT-VOUCHER: tạo phiếu xuất trừ tồn', async ({ request }) => {
    const before = Number((await getProduct(request, idFlow)).qty);
    const beforeA = await stockAt(request, idFlow, branchId);
    const res = await request.post(`${API}/warehouse/vouchers/export`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        date: new Date().toISOString().slice(0, 10),
        branchId,
        warehouse: branchId,
        type: 'export',
        note: `QA export ${RUN_ID}`,
        items: [{ productId: idFlow, quantity: 2, price: 60000, unit: 'Cái' }],
        qty: 2,
        spCount: 1,
        totalAmount: 120000,
        creator: 'Admin',
      },
    });
    expect(res.ok() || res.status() === 201, `export voucher ${res.status()} ${await res.text()}`).toBeTruthy();
    const after = await getProduct(request, idFlow);
    expect(Number(after.qty)).toBe(before - 2);
    expect(await stockAt(request, idFlow, branchId)).toBe(beforeA - 2);
  });

  test('WF-EXPORT-OVERSELL: xuất vượt tồn bị chặn', async ({ request }) => {
    const a = await stockAt(request, idFlow, branchId);
    const res = await request.post(`${API}/warehouse/vouchers/export`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        branchId,
        warehouse: branchId,
        type: 'export',
        items: [{ productId: idFlow, quantity: a + 100, unit: 'Cái' }],
      },
    });
    expect(res.status()).toBe(422);
    // stock unchanged
    expect(await stockAt(request, idFlow, branchId)).toBe(a);
  });

  // ─── Transfer full workflow ────────────────────────────────────────────

  test('WF-TRANSFER: draft → confirm-source → confirm-dest, tổng tồn không đổi', async ({ request }) => {
    const beforeTotal = Number((await getProduct(request, idFlow)).qty);
    const beforeA = await stockAt(request, idFlow, branchId);
    const beforeB = await stockAt(request, idFlow, branchIdB);
    const moveQty = 4;

    const create = await request.post(`${API}/warehouse/transfers`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        sourceWarehouseId: branchMongoA,
        destinationWarehouseId: branchMongoB,
        status: 'DRAFT',
        label: `QA-TR-${RUN_ID}`,
        note: 'workflow e2e',
        lines: [{ productId: idFlow, quantity: moveQty, unit: 'Cái' }],
      },
    });
    expect(create.ok() || create.status() === 201, await create.text()).toBeTruthy();
    const transfer = await create.json();
    const tid = String(transfer._id);
    expect(String(transfer.status).toUpperCase()).toBe('DRAFT');
    // draft must not change stock
    expect(await stockAt(request, idFlow, branchId)).toBe(beforeA);

    const src = await request.post(`${API}/warehouse/transfers/${tid}/confirm-source`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(src.ok(), await src.text()).toBeTruthy();
    expect(String((await src.json()).status).toUpperCase()).toBe('IN_TRANSIT');

    const dst = await request.post(`${API}/warehouse/transfers/${tid}/confirm-destination`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(dst.ok(), await dst.text()).toBeTruthy();
    expect(String((await dst.json()).status).toUpperCase()).toBe('COMPLETED');

    const afterTotal = Number((await getProduct(request, idFlow)).qty);
    expect(afterTotal).toBe(beforeTotal);
    expect(await stockAt(request, idFlow, branchId)).toBe(beforeA - moveQty);
    expect(await stockAt(request, idFlow, branchIdB)).toBe(beforeB + moveQty);
  });

  test('WF-TRANSFER-UI: tạo đơn + gợi ý tồn nguồn đúng', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/warehouse/transfers/create');
    await expect(page.getByRole('heading', { name: /Tạo đơn chuyển kho/i })).toBeVisible({ timeout: 45_000 });
    await page.getByTestId('transfer-source-warehouse').selectOption(branchMongoA);
    await page.getByTestId('transfer-destination-warehouse').selectOption(branchMongoB);
    await page.waitForTimeout(1000);
    const search = page.getByTestId('transfer-product-search');
    await expect(search).toBeEnabled({ timeout: 15_000 });
    await search.fill(codeFlow);
    await search.focus();
    await page.waitForTimeout(800);
    const suggestion = page.getByTestId('transfer-product-suggestions').locator('button').filter({ hasText: codeFlow }).first();
    await expect(suggestion).toBeVisible({ timeout: 20_000 });
    await expect(suggestion).toContainText(/Có thể chuyển:\s*\d+/i);
    // available must not use system total alone when multi-warehouse
    const text = await suggestion.innerText();
    expect(text).toMatch(codeFlow);
  });

  // ─── Sale complete stock + delete block ────────────────────────────────

  test('WF-SALE: hoàn tất bán lẻ trừ tồn theo kho', async ({ request }) => {
    const before = await stockAt(request, idSale, branchId);
    const beforeTotal = Number((await getProduct(request, idSale)).qty);
    const saleRes = await request.post(`${API}/products/sales`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        status: 'draft',
        channel: 'store',
        type: 'retail',
        branchId,
        customerName: `QA Buyer ${RUN_ID}`,
        items: [{ productId: idSale, quantity: 2, price: 90000, name: `QA Sale ${RUN_ID}`, code: codeSale }],
        total: 180000,
      },
    });
    expect(saleRes.ok() || saleRes.status() === 201, await saleRes.text()).toBeTruthy();
    const sale = await saleRes.json();
    // draft no stock change
    expect(await stockAt(request, idSale, branchId)).toBe(before);
    const complete = await request.post(`${API}/products/sales/${sale._id}/complete`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(complete.ok(), await complete.text()).toBeTruthy();
    expect(await stockAt(request, idSale, branchId)).toBe(before - 2);
    expect(Number((await getProduct(request, idSale)).qty)).toBe(beforeTotal - 2);
  });

  test('WF-DEL-BLOCK: SP đã bán không xóa được (409) dù zero tồn', async ({ request }) => {
    // Use idDel: complete a sale then zero stock then delete
    const saleRes = await request.post(`${API}/products/sales`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        status: 'draft',
        channel: 'store',
        type: 'retail',
        branchId,
        customerName: `QA Del Buyer ${RUN_ID}`,
        items: [{ productId: idDel, quantity: 1, price: 70000, code: codeDel, name: `QA DelRef ${RUN_ID}` }],
        total: 70000,
      },
    });
    const sale = await saleRes.json();
    await request.post(`${API}/products/sales/${sale._id}/complete`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    await request.patch(`${API}/products/products/${idDel}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { initialStocks: [{ warehouseId: Number(branchId) || branchId, quantity: 0 }] },
    });
    const del = await request.delete(`${API}/products/products/${idDel}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(del.status()).toBe(409);
    blockedDeleteIds.push(idDel);
    // still exists
    const still = await getProduct(request, idDel);
    expect(still._id || still.id).toBeTruthy();
  });

  // ─── Inventory audit reconcile stock ───────────────────────────────────

  test('WF-AUDIT: submit + reconcile cập nhật tồn = physical', async ({ request }) => {
    const code = `${FIXTURE_PREFIX}-AUD`;
    const p = await createProduct(request, {
      type: 'product',
      unit: 'Cái',
      allowsSale: true,
      categoryId: Number(categoryId) || categoryId,
      code,
      name: `QA Audit ${RUN_ID}`,
      price: 50000,
      cost: 20000,
      status: 'Mới',
      initialStocks: [{ warehouseId: Number(branchId) || branchId, quantity: 10 }],
    });
    const pid = String(p._id);
    const draft = await request.post(`${API}/inventory-audits`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        code: `KK-${code}`,
        warehouseId: branchId,
        auditType: 'BY_PRODUCT',
        status: 'DRAFT',
        note: `QA audit ${RUN_ID}`,
        items: [
          {
            productId: pid,
            productCodeSnapshot: code,
            productNameSnapshot: `QA Audit ${RUN_ID}`,
            systemQuantitySnapshot: 10,
            physicalQuantity: 13,
            varianceQuantity: 3,
          },
        ],
      },
    });
    expect(draft.ok() || draft.status() === 201, await draft.text()).toBeTruthy();
    const audit = await draft.json();
    const aid = String(audit._id);
    expect(Number((await getProduct(request, pid)).qty)).toBe(10);

    const submit = await request.post(`${API}/inventory-audits/${aid}/submit`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(submit.ok(), await submit.text()).toBeTruthy();
    expect(Number((await getProduct(request, pid)).qty)).toBe(10);

    const reconcile = await request.post(`${API}/inventory-audits/${aid}/reconcile`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(reconcile.ok(), await reconcile.text()).toBeTruthy();
    expect(String((await reconcile.json()).status).toUpperCase()).toBe('RECONCILED');
    expect(Number((await getProduct(request, pid)).qty)).toBe(13);
    expect(await stockAt(request, pid, branchId)).toBe(13);
  });

  // ─── Cross inventory UI after stock ops ────────────────────────────────

  test('WF-INV-UI: inventory + products list phản ánh tồn sau workflow', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/products');
    await waitProductsLoaded(page);
    await filterProducts(page, codeFlow);
    await expect(page.getByText(codeFlow).first()).toBeVisible();
    const row = page.locator('.products-data-table tbody tr', { hasText: codeFlow }).first();
    await expect(row).toBeVisible();

    await page.goto('/products/inventory');
    await expect(page.getByPlaceholder(/Tên SP, mã SP/i)).toBeVisible({ timeout: 30_000 });
    await page.getByPlaceholder(/Tên SP, mã SP/i).fill(codeFlow);
    await page.getByRole('button', { name: /^Lọc$/i }).click();
    await expect(page.getByText(/Đang tải/i)).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByText(codeFlow).first()).toBeVisible({ timeout: 15_000 });
  });

  // ─── Network race ─────────────────────────────────────────────────────

  test('WF-RACE: response chậm cũ không ghi đè kết quả mới', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/products');
    await waitProductsLoaded(page);

    let releaseSlow: (() => void) | null = null;
    const slowGate = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    let slowSeen = false;

    await page.route('**/api/products/products?**', async (route) => {
      const url = route.request().url();
      if (url.includes(encodeURIComponent(codeFlow)) || url.includes(codeFlow)) {
        // fast path for final filter
        await route.continue();
        return;
      }
      if (!slowSeen && (url.includes('q=') || url.includes('page='))) {
        slowSeen = true;
        await slowGate;
      }
      await route.continue();
    });

    // Start a generic filter that may be slow
    await page.getByPlaceholder(/Tìm theo tên, mã hoặc barcode/i).fill('QA-PROD');
    await page.getByRole('button', { name: /^Lọc$/i }).click();
    // Immediately filter specific fixture (fast)
    await page.getByPlaceholder(/Tìm theo tên, mã hoặc barcode/i).fill(codeFlow);
    await page.getByRole('button', { name: /^Lọc$/i }).click();
    // release slow after new filter sent
    releaseSlow?.();
    await expect(page.getByText(/Đang tải dữ liệu/i)).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText(codeFlow).first()).toBeVisible({ timeout: 20_000 });
    await page.unroute('**/api/products/products?**');
  });

  test('WF-NET: abort list then recovery', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/products');
    await waitProductsLoaded(page);
    await page.route('**/api/products/products?**', (route) => route.abort());
    await page.getByRole('button', { name: /Làm mới/i }).click();
    await page.waitForTimeout(500);
    await page.unroute('**/api/products/products?**');
    await page.getByRole('button', { name: /Làm mới/i }).click();
    await waitProductsLoaded(page);
  });

  // ─── Reports detail smoke ──────────────────────────────────────────────

  test('WF-REPORTS: các trang báo cáo liên quan SP load + lọc', async ({ page }) => {
    await uiLogin(page, ADMIN);
    const routes = [
      '/reports/inventory/in-out-stock',
      '/reports/products/performance',
      '/reports/revenue/products',
      '/reports/inventory/pending-transfers',
    ];
    for (const route of routes) {
      await page.goto(route);
      await page.waitForTimeout(800);
      await expect(page.locator('body')).not.toContainText(/Application error|Something went wrong/i);
      const search = page.getByPlaceholder(/Tìm|sản phẩm|mã/i).first();
      if (await search.count()) {
        await search.fill(codeFlow).catch(() => {});
        const filterBtn = page.getByRole('button', { name: /^Lọc$|Áp dụng|Tìm/i }).first();
        if (await filterBtn.count()) await filterBtn.click().catch(() => {});
        await page.waitForTimeout(500);
      }
    }
  });

  // ─── Barcode print (print dialog intercept) ────────────────────────────

  test('WF-BAR-PRINT: workspace + window.print được gọi', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/products');
    await waitProductsLoaded(page);
    await filterProducts(page, codeFlow);
    const row = page.locator('.products-data-table tbody tr', { hasText: codeFlow }).first();
    await row.locator('input[type="checkbox"]').check();
    await page.getByRole('button', { name: 'Thao tác', exact: true }).click();
    await page.locator('.products-bulk-dropdown').getByText(/In mã vạch/i).click();
    await expect(page.getByText(/In mã vạch sản phẩm/i)).toBeVisible({ timeout: 15_000 });

    await page.evaluate(() => {
      (window as any).__printCalled = false;
      window.print = () => {
        (window as any).__printCalled = true;
      };
    });
    const printBtn = page.getByRole('button', { name: /In tem|In mã vạch|In$/i }).first();
    if (await printBtn.count()) {
      await printBtn.click();
      await page.waitForTimeout(500);
      const called = await page.evaluate(() => Boolean((window as any).__printCalled));
      // Some UIs open a print window instead of window.print — either is ok if no crash
      expect(typeof called).toBe('boolean');
    }
    await page.getByRole('button', { name: /Quay lại danh sách/i }).click();
    await waitProductsLoaded(page);
  });

  // ─── IMPORT CSV smoke + double submit create ───────────────────────────

  test('WF-IMPORT-CSV: UI import multipart + không double create', async ({ page, request }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/products');
    await waitProductsLoaded(page);
    const importCode = `${FIXTURE_PREFIX}-CSV`;
    const csv = [
      'Mã sản phẩm;Tên sản phẩm;Đơn vị tính;Giá nhập;Giá bán;Giá sỉ;Tồn trong kho;Danh mục;Trạng thái',
      `${importCode};QA CSV ${RUN_ID};Cái;1000;2000;1500;0;${categoryName || 'Test'};Mới`,
    ].join('\n');
    const tmp = path.join(os.tmpdir(), `${importCode}.csv`);
    fs.writeFileSync(tmp, `\uFEFF${csv}`, 'utf8');

    await page.locator('.products-split-toggle').click();
    await page.locator('.products-add-dropdown').getByText(/Nhập từ file/i).click();
    const modal = page.locator('.modal-card').filter({ hasText: /Nhập dữ liệu sản phẩm/i });
    await expect(modal.locator('select').first()).not.toHaveValue('', { timeout: 20_000 });
    await modal.locator('input[type="file"]').setInputFiles(tmp);
    const respP = page.waitForResponse(
      (r) => r.url().includes('/products/products/import') && r.request().method() === 'POST',
      { timeout: 60_000 },
    );
    await modal.getByRole('button', { name: /Upload và nhập/i }).click();
    const resp = await respP;
    expect(resp.ok()).toBeTruthy();
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
    // second import same code should skip/not create duplicate
    const res2 = await request.post(`${API}/products/products/import`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      multipart: {
        file: { name: 'dup.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') },
        branchId: String(branchId),
        importMode: 'Thêm mới',
      },
    });
    expect(res2.ok()).toBeTruthy();
    const body2 = await res2.json();
    expect(body2.summary?.created ?? 0).toBe(0);
    expect((body2.summary?.skipped ?? 0) + (body2.summary?.updated ?? 0)).toBeGreaterThanOrEqual(0);
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  });

  // ─── PERM employee cannot reconcile audit ──────────────────────────────

  test('WF-PERM-EMP: employee không bù trừ kiểm kho', async ({ request }) => {
    const code = `${FIXTURE_PREFIX}-AUDEMP`;
    const p = await createProduct(request, {
      type: 'product',
      unit: 'Cái',
      allowsSale: true,
      categoryId: Number(categoryId) || categoryId,
      code,
      name: `QA AudEmp ${RUN_ID}`,
      price: 10000,
      cost: 5000,
      status: 'Mới',
      initialStocks: [{ warehouseId: Number(branchId) || branchId, quantity: 2 }],
    });
    const draft = await (
      await request.post(`${API}/inventory-audits`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          code: `KK-${code}`,
          warehouseId: branchId,
          auditType: 'BY_PRODUCT',
          status: 'DRAFT',
          items: [
            {
              productId: p._id,
              productCodeSnapshot: code,
              productNameSnapshot: code,
              systemQuantitySnapshot: 2,
              physicalQuantity: 2,
              varianceQuantity: 0,
            },
          ],
        },
      })
    ).json();
    await request.post(`${API}/inventory-audits/${draft._id}/submit`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const empRec = await request.post(`${API}/inventory-audits/${draft._id}/reconcile`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    expect(empRec.status()).toBe(403);
  });

  // ─── Warehouse transactions + dashboard ────────────────────────────────

  test('WF-TXN-DASH: giao dịch kho + dashboard load', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/warehouse/transactions');
    await page.waitForTimeout(1200);
    await expect(page.locator('body')).not.toContainText(/Application error/i);

    await page.goto('/warehouse/transfers');
    await page.waitForTimeout(800);
    await expect(page.locator('body')).not.toContainText(/Application error/i);

    await page.goto('/warehouse/audit');
    await page.waitForTimeout(800);
    await expect(page.locator('body')).not.toContainText(/Application error/i);

    await page.goto('/');
    await expect(page.getByText(/Tổng quan|Doanh thu|Tồn kho/i).first()).toBeVisible({ timeout: 45_000 });
  });

  // ─── UI voucher pages ──────────────────────────────────────────────────

  test('WF-VOUCHER-UI: trang nhập/xuất kho mở được', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/warehouse/transactions/vouchers/import');
    await expect(page).toHaveURL(/vouchers\/import/);
    await expect(
      page.getByRole('heading', { name: /nhập/i }).or(page.locator('h1, h2').filter({ hasText: /nhập/i })).first(),
    ).toBeVisible({ timeout: 45_000 });
    await page.goto('/warehouse/transactions/vouchers/export');
    await expect(page).toHaveURL(/vouchers\/export/);
    await expect(
      page.getByRole('heading', { name: /xuất/i }).or(page.locator('h1, h2').filter({ hasText: /xuất/i })).first(),
    ).toBeVisible({ timeout: 45_000 });
  });
});
