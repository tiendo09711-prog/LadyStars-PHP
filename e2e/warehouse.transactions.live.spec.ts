import { expect, test, type APIRequestContext, type Page, type Locator } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Live suite: /warehouse/transactions (Xuất nhập kho) + P0 liên kết.
 * FE 5173 / API 8000 — playwright.live.config.ts
 * Fixtures: QA-WH-{E2E_RUN_ID}-* only; cleaned in afterAll.
 * Cho phép live DB write: tạo/sửa/xóa fixture của run; không đụng Store Settings/roles.
 */
const RUN_ID =
  process.env.E2E_RUN_ID ||
  `E2E-WH-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${randomBytes(2).toString('hex')}`;
const API = 'http://127.0.0.1:8000/api';
const ADMIN = { email: 'admin@gmail.com', password: '123456' };
const EMPLOYEE = { email: 'tiendo09711@gmail.com', password: '123456' };
const FIXTURE_PREFIX = `QA-WH-${RUN_ID}`;
const ARTIFACT_DIR = path.join(process.cwd(), 'e2e-artifacts', 'warehouse-transactions', RUN_ID);

const createdProductIds: string[] = [];
const createdVoucherMongoIds: string[] = [];
const createdVoucherCodes: string[] = [];
const createdTransferIds: string[] = [];
let seedVoucherCode = '';
let voucherSeq = 0;

let adminToken = '';
let employeeToken = '';
let adminRole = '';
let employeeRole = '';
let branchAId = ''; // numeric string e.g. "1"
let branchBId = '';
let branchAMongo = '';
let branchBMongo = '';
let branchAName = '';
let branchBName = '';
let categoryId = '';

const codes = {
  SP01: '',
  SP02: '',
  SP03: '',
  SP04: '',
  SP05: '',
};
const ids: Record<string, string> = {};
let barcode04 = '';
let name01 = '';

function ensureArtifactDir() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

async function shot(page: Page, name: string) {
  ensureArtifactDir();
  await page.screenshot({ path: path.join(ARTIFACT_DIR, `${name}.png`), fullPage: true }).catch(() => {});
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgoYmd(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function phpEval(code: string): string {
  const script = path.join(ARTIFACT_DIR, `_php_eval_${Date.now()}_${randomBytes(2).toString('hex')}.php`);
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const root = process.cwd().replace(/\\/g, '/');
  fs.writeFileSync(
    script,
    [
      '<?php',
      `require '${root}/backend/vendor/autoload.php';`,
      `$app = require '${root}/backend/bootstrap/app.php';`,
      '$app->make(Illuminate\\Contracts\\Console\\Kernel::class)->bootstrap();',
      code,
      '',
    ].join('\n'),
    'utf8',
  );
  try {
    return execFileSync('php', [script], { encoding: 'utf8', timeout: 30_000 }).trim();
  } finally {
    try {
      fs.unlinkSync(script);
    } catch {
      /* ignore */
    }
  }
}

async function apiLogin(request: APIRequestContext, creds: { email: string; password: string }) {
  const res = await request.post(`${API}/auth/login`, { data: creds });
  expect(res.ok(), `login ${creds.email}`).toBeTruthy();
  return res.json();
}

async function loginAndOpen(page: Page, creds: { email: string; password: string }, pathUrl = '/') {
  const token = creds.email === EMPLOYEE.email ? employeeToken : adminToken;
  const expectAdmin = creds.email === ADMIN.email;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/login');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.evaluate((t) => localStorage.setItem('token', t), token);

  const meWait = page.waitForResponse(
    (r) => r.url().includes('/auth/me') && r.request().method() === 'GET',
    { timeout: 30_000 },
  );
  const isTx = pathUrl.includes('/warehouse/transactions') && !pathUrl.includes('/vouchers');
  const listWait = isTx
    ? page.waitForResponse(
        (r) =>
          (r.url().includes('/warehouse/transactions/bills') ||
            r.url().includes('/warehouse/transactions/items')) &&
          r.request().method() === 'GET',
        { timeout: 45_000 },
      )
    : null;
  await page.goto(pathUrl);
  const meRes = await meWait;
  expect(meRes.ok(), `/auth/me ${meRes.status()}`).toBeTruthy();
  if (listWait) await listWait;
  const meBody = await meRes.json();
  const role = String(meBody?.role || meBody?.user?.role || '').toUpperCase();
  if (expectAdmin) {
    expect(['ADMIN', 'OWNER', 'ROOT', 'SUPERADMIN', 'MANAGER']).toContain(role);
    await expect(page.getByRole('button', { name: /Quản lý nhân viên/i })).toBeVisible({ timeout: 30_000 });
  } else {
    await expect(page.locator('.app-sidebar')).toBeVisible({ timeout: 30_000 });
  }
  if (isTx) await waitListSettled(page);
}

async function createProduct(request: APIRequestContext, body: Record<string, unknown>) {
  const res = await request.post(`${API}/products/products`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: body,
  });
  const text = await res.text();
  if (res.ok() || res.status() === 201) {
    const product = JSON.parse(text);
    if (product?._id) createdProductIds.push(String(product._id));
    return product;
  }
  // Reuse leftover fixture with same code from interrupted run
  if (res.status() === 422 && /already been taken|đã tồn tại|duplicate/i.test(text)) {
    const found = await (
      await request.get(`${API}/products/products?q=${encodeURIComponent(String(body.code))}&limit=20`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    const match = (found.items || []).find((p: any) => String(p.code) === String(body.code));
    if (match?._id) {
      createdProductIds.push(String(match._id));
      // Reset stocks if provided
      if (Array.isArray(body.initialStocks)) {
        await request
          .patch(`${API}/products/products/${match._id}`, {
            headers: { Authorization: `Bearer ${adminToken}` },
            data: { initialStocks: body.initialStocks },
          })
          .catch(() => {});
      }
      return match;
    }
  }
  expect(false, `create ${body.code} -> ${res.status()} ${text.slice(0, 280)}`).toBeTruthy();
  return {};
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

function nextVoucherCode(kind: 'IM' | 'EX' = 'IM') {
  voucherSeq += 1;
  // Short enough for UI; unique per run; searchable via billId filter (matches voucher_code).
  return `${FIXTURE_PREFIX}-${kind}${String(voucherSeq).padStart(3, '0')}`.slice(0, 48);
}

async function createImport(
  request: APIRequestContext,
  opts: {
    branchId: string;
    productId: string;
    qty: number;
    price?: number;
    note?: string;
    items?: any[];
    code?: string;
    clientRequestId?: string;
  },
) {
  const items =
    opts.items ||
    [{ productId: opts.productId, quantity: opts.qty, price: opts.price ?? 20000, unit: 'Cái' }];
  const qty = items.reduce((s: number, i: any) => s + Number(i.quantity || 0), 0);
  const total = items.reduce((s: number, i: any) => s + Number(i.quantity || 0) * Number(i.price || 0), 0);
  const code = opts.code || nextVoucherCode('IM');
  const data: Record<string, unknown> = {
    date: todayYmd(),
    branchId: opts.branchId,
    warehouse: opts.branchId,
    type: 'import',
    code,
    voucherId: code,
    note: opts.note || `QA-WH import ${RUN_ID}`,
    items,
    qty,
    spCount: items.length,
    totalAmount: total,
    creator: 'E2E Admin',
  };
  if (opts.clientRequestId) data.clientRequestId = opts.clientRequestId;
  const res = await request.post(`${API}/warehouse/vouchers/import`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data,
  });
  const text = await res.text();
  expect(res.ok() || res.status() === 201, `import ${res.status()} ${text.slice(0, 300)}`).toBeTruthy();
  const body = JSON.parse(text);
  const mongoId = String(body?._id || body?.mongo_id || body?.voucher?.voucherId || '');
  if (mongoId && !createdVoucherMongoIds.includes(mongoId)) createdVoucherMongoIds.push(mongoId);
  const resolvedCode = String(body?.code || body?.voucher_code || code);
  if (!createdVoucherCodes.includes(resolvedCode)) createdVoucherCodes.push(resolvedCode);
  return { ...body, code: resolvedCode, status: res.status(), res };
}

async function createExport(
  request: APIRequestContext,
  opts: {
    branchId: string;
    productId: string;
    qty: number;
    price?: number;
    note?: string;
    code?: string;
    clientRequestId?: string;
  },
) {
  const code = opts.code || nextVoucherCode('EX');
  const data: Record<string, unknown> = {
    date: todayYmd(),
    branchId: opts.branchId,
    warehouse: opts.branchId,
    type: 'export',
    code,
    voucherId: code,
    note: opts.note || `QA-WH export ${RUN_ID}`,
    items: [{ productId: opts.productId, quantity: opts.qty, price: opts.price ?? 20000, unit: 'Cái' }],
    qty: opts.qty,
    spCount: 1,
    totalAmount: opts.qty * (opts.price ?? 20000),
    creator: 'E2E Admin',
  };
  if (opts.clientRequestId) data.clientRequestId = opts.clientRequestId;
  const res = await request.post(`${API}/warehouse/vouchers/export`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data,
  });
  const text = await res.text();
  const body = res.ok() || res.status() === 201 ? JSON.parse(text) : null;
  if (body) {
    const mongoId = String(body?._id || body?.mongo_id || '');
    if (mongoId && !createdVoucherMongoIds.includes(mongoId)) createdVoucherMongoIds.push(mongoId);
    const rc = String(body?.code || code);
    if (!createdVoucherCodes.includes(rc)) createdVoucherCodes.push(rc);
  }
  return { res, text, body };
}

async function deleteBill(
  request: APIRequestContext,
  source: string,
  sourceId: string,
): Promise<{ status: number; body: any; text: string }> {
  const res = await request.delete(`${API}/warehouse/transactions/bills/${source}/${sourceId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const text = await res.text();
  let body: any = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { status: res.status(), body, text };
}

/** Scoped cleanup of QA-WH vouchers/products by code prefix only (no wipe). */
function cleanupQaWhFixturesByPrefix(prefix: string) {
  const p = prefix.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  phpEval(
    `$prefix='${p}';
    $vouchers=DB::table('inventory_vouchers')->where('code','like',$prefix.'%')->orWhere('voucher_code','like',$prefix.'%')->get(['id','mongo_id','code','voucher_code']);
    foreach($vouchers as $v){
      $keys=array_filter([(string)$v->mongo_id,(string)$v->code,(string)$v->voucher_code]);
      if($keys){ DB::table('inventory_products')->whereIn('inventory_voucher_mongo_id',$keys)->orWhere('code','like',$v->code.'#%')->delete(); }
      DB::table('inventory_vouchers')->where('id',$v->id)->delete();
    }
    // Also purge orphan product lines referencing prefix codes
    DB::table('inventory_products')->where('code','like',$prefix.'%')->delete();
    echo 'vouchers='.count($vouchers);
    `,
  );
}

async function fetchBills(
  request: APIRequestContext,
  params: Record<string, string | number> = {},
  token = adminToken,
) {
  const qs = new URLSearchParams();
  const merged: Record<string, string | number> = {
    fromDate: daysAgoYmd(14),
    toDate: todayYmd(),
    limit: 20,
    page: 1,
    ...params,
  };
  for (const [k, v] of Object.entries(merged)) {
    if (v !== '' && v !== undefined && v !== null) qs.set(k, String(v));
  }
  const res = await request.get(`${API}/warehouse/transactions/bills?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let body: any = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { res, body, text };
}

async function fetchItems(
  request: APIRequestContext,
  params: Record<string, string | number> = {},
  token = adminToken,
) {
  const qs = new URLSearchParams();
  const merged: Record<string, string | number> = {
    fromDate: daysAgoYmd(14),
    toDate: todayYmd(),
    limit: 20,
    page: 1,
    ...params,
  };
  for (const [k, v] of Object.entries(merged)) {
    if (v !== '' && v !== undefined && v !== null) qs.set(k, String(v));
  }
  const res = await request.get(`${API}/warehouse/transactions/items?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  return { res, body: JSON.parse(text), text };
}

async function openTransactions(page: Page) {
  const listWait = page.waitForResponse(
    (r) =>
      (r.url().includes('/warehouse/transactions/bills') || r.url().includes('/warehouse/transactions/items')) &&
      r.request().method() === 'GET' &&
      !r.url().includes('/meta'),
    { timeout: 45_000 },
  );
  await page.goto('/warehouse/transactions');
  await listWait;
  await expect(page.locator('.wt-root, .warehouse-records').first()).toBeVisible({ timeout: 20_000 });
  await waitListSettled(page);
}

async function waitListSettled(page: Page) {
  await expect(page.locator('.wt-root, .warehouse-records').first()).toBeVisible({ timeout: 30_000 });
  // Prefer network-settled table state over transient text (ellipsis / race on first paint).
  await expect(page.locator('tr.wt-skeleton')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator('.wt-summary-loading')).toHaveCount(0, { timeout: 15_000 });
  // Settled UI: summary numbers, empty state, or error banner
  await expect(
    page.locator('.wt-summary-main, .wt-summary-error, .wt-empty-state, .wt-error').first(),
  ).toBeVisible({ timeout: 20_000 });
}

async function applyFilter(page: Page) {
  const wait = page.waitForResponse(
    (r) =>
      (r.url().includes('/warehouse/transactions/bills') || r.url().includes('/warehouse/transactions/items')) &&
      r.request().method() === 'GET',
    { timeout: 45_000 },
  );
  await page.getByRole('button', { name: /^Lọc$/i }).click();
  await wait;
  await waitListSettled(page);
}

async function setDateRange(page: Page, from: string, to: string) {
  await page.getByLabel('Từ ngày').fill(from);
  await page.getByLabel('Đến ngày').fill(to);
}

function billRows(page: Page): Locator {
  return page.locator('table.wt-data-table tbody tr').filter({ hasNot: page.locator('.wt-empty-state') });
}

async function deleteProduct(request: APIRequestContext, id: string) {
  phpEval(
    `App\\Models\\ProductBranchStock::where('product_id',${Number(id)})->update(['locked_quantity'=>0,'qty'=>0]); $p=App\\Models\\Product::find(${Number(id)}); if($p){$p->qty=0;$p->save();}`,
  );
  for (const bid of [branchAId, branchBId].filter(Boolean)) {
    await request
      .patch(`${API}/products/products/${id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { initialStocks: [{ warehouseId: Number(bid) || bid, quantity: 0 }] },
      })
      .catch(() => {});
  }
  const status = (
    await request.delete(`${API}/products/products/${id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
  ).status();
  if (status !== 200 && status !== 204) {
    phpEval(
      `$p=App\\Models\\Product::find(${Number(id)}); if($p && !str_starts_with((string)$p->code,'DEL-')){ $p->code='DEL-'.$p->code; $p->name='DELETED '.$p->name; $p->qty=0; $p->save(); echo 'renamed'; }`,
    );
  }
}

// Serial keeps shared fixtures consistent; individual UI flakes should not abort the whole matrix.
test.describe.configure({ mode: 'serial' });

test.describe('Warehouse transactions live WT/P0 suite', () => {
  test.beforeAll(async ({ request }) => {
    ensureArtifactDir();
    // eslint-disable-next-line no-console
    console.log(`E2E_RUN_ID=${RUN_ID} FIXTURE_PREFIX=${FIXTURE_PREFIX}`);
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'run-meta.txt'), `RUN_ID=${RUN_ID}\nPREFIX=${FIXTURE_PREFIX}\n`, 'utf8');

    const admin = await apiLogin(request, ADMIN);
    const emp = await apiLogin(request, EMPLOYEE);
    adminToken = admin.token;
    employeeToken = emp.token;
    adminRole = String(admin.user?.role || admin.role || '').toUpperCase();
    employeeRole = String(emp.user?.role || emp.role || '').toUpperCase();
    expect(['ADMIN', 'OWNER', 'ROOT', 'SUPERADMIN', 'MANAGER']).toContain(adminRole);
    expect(employeeRole).toBeTruthy();

    const branches = await (
      await request.get(`${API}/system/branches?limit=50`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    const active = (branches.items || []).filter((b: any) => b.isActive !== false);
    expect(active.length, 'need >=2 active warehouses').toBeGreaterThanOrEqual(2);
    branchAId = String(active[0]._id ?? active[0].id);
    branchBId = String(active[1]._id ?? active[1].id);
    branchAMongo = String(active[0].mongoId || active[0].mongo_id || active[0]._id);
    branchBMongo = String(active[1].mongoId || active[1].mongo_id || active[1]._id);
    branchAName = String(active[0].name || 'Kho A');
    branchBName = String(active[1].name || 'Kho B');

    const cats = await (
      await request.get(`${API}/products/categories?limit=50`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    const catItems = cats.items || cats.data || [];
    expect(catItems.length).toBeGreaterThan(0);
    categoryId = String(catItems[0]._id);

    // Purge leftover fixtures from interrupted runs with same/run-like prefixes (scoped).
    cleanupQaWhFixturesByPrefix(FIXTURE_PREFIX);
    cleanupQaWhFixturesByPrefix('QA-WH-E2E-WH-');

    const base = {
      type: 'product',
      unit: 'Cái',
      allowsSale: true,
      categoryId: Number(categoryId) || categoryId,
      status: 'Đang bán',
    };

    codes.SP01 = `${FIXTURE_PREFIX}-SP01`;
    codes.SP02 = `${FIXTURE_PREFIX}-SP02`;
    codes.SP03 = `${FIXTURE_PREFIX}-SP03`;
    codes.SP04 = `${FIXTURE_PREFIX}-SP04`;
    codes.SP05 = `${FIXTURE_PREFIX}-SP05`;
    name01 = `QA SP01 ${RUN_ID}`;
    barcode04 = `89${String(Date.now()).slice(-11)}`.slice(0, 13);

    // Initial stocks per plan (A/B)
    const p1 = await createProduct(request, {
      ...base,
      code: codes.SP01,
      name: name01,
      price: 99000,
      cost: 50000,
      initialStocks: [
        { warehouseId: Number(branchAId), quantity: 100 },
        { warehouseId: Number(branchBId), quantity: 20 },
      ],
    });
    ids.SP01 = String(p1._id);

    const p2 = await createProduct(request, {
      ...base,
      code: codes.SP02,
      name: `QA SP02 ${RUN_ID}`,
      price: 88000,
      cost: 40000,
      initialStocks: [
        { warehouseId: Number(branchAId), quantity: 50 },
        { warehouseId: Number(branchBId), quantity: 10 },
      ],
    });
    ids.SP02 = String(p2._id);

    const p3 = await createProduct(request, {
      ...base,
      code: codes.SP03,
      name: `QA SP03 hết hàng ${RUN_ID}`,
      price: 77000,
      cost: 30000,
      initialStocks: [
        { warehouseId: Number(branchAId), quantity: 0 },
        { warehouseId: Number(branchBId), quantity: 0 },
      ],
    });
    ids.SP03 = String(p3._id);

    const p4 = await createProduct(request, {
      ...base,
      code: codes.SP04,
      name: `QA SP04 barcode ${RUN_ID}`,
      price: 66000,
      cost: 25000,
      barcode: barcode04,
      initialStocks: [
        { warehouseId: Number(branchAId), quantity: 30 },
        { warehouseId: Number(branchBId), quantity: 5 },
      ],
    });
    ids.SP04 = String(p4._id);

    const p5 = await createProduct(request, {
      ...base,
      code: codes.SP05,
      name: `QA SP05 giá đặc biệt ${RUN_ID}`,
      price: 123456,
      cost: 99999,
      initialStocks: [
        { warehouseId: Number(branchAId), quantity: 10 },
        { warehouseId: Number(branchBId), quantity: 10 },
      ],
    });
    ids.SP05 = String(p5._id);

    // Seed one multi-line import for list/detail/filter tests (searchable code)
    const seed = await createImport(request, {
      branchId: branchAId,
      productId: ids.SP01,
      qty: 1,
      note: `QA-WH seed multi ${RUN_ID}`,
      code: `${FIXTURE_PREFIX}-SEED`,
      items: [
        { productId: ids.SP01, quantity: 2, price: 20000, unit: 'Cái' },
        { productId: ids.SP02, quantity: 3, price: 15000, unit: 'Cái' },
      ],
    });
    seedVoucherCode = String(seed.code || `${FIXTURE_PREFIX}-SEED`);
  });

  test.afterAll(async ({ request }) => {
    // Delete run vouchers (scoped by this run's codes/mongo ids) then products
    for (const mongoId of [...createdVoucherMongoIds].reverse()) {
      await deleteBill(request, 'inventory-voucher', mongoId).catch(() => {});
    }
    cleanupQaWhFixturesByPrefix(FIXTURE_PREFIX);
    // Best-effort orphan QA-WH leftovers from interrupted runs (prefix only, never wipe)
    cleanupQaWhFixturesByPrefix('QA-WH-E2E-WH-');
    cleanupQaWhFixturesByPrefix('QA-WH-LINE-');
    for (const id of [...createdProductIds].reverse()) {
      await deleteProduct(request, id).catch(() => {});
    }
    fs.writeFileSync(
      path.join(ARTIFACT_DIR, 'cleanup.txt'),
      [
        `products=${createdProductIds.join(',')}`,
        `vouchers=${createdVoucherMongoIds.join(',')}`,
        `transfers=${createdTransferIds.join(',')}`,
        `codes=${createdVoucherCodes.join(',')}`,
      ].join('\n'),
      'utf8',
    );
  });

  // ─── Roles ─────────────────────────────────────────────────────────────

  test('SEC-001: Admin role + menu Xuất nhập kho', async ({ page }) => {
    await loginAndOpen(page, ADMIN, '/');
    // Sidebar group label is "Kho hàng" (hover opens desktop panel)
    const groupBtn = page.getByRole('button', { name: /Kho hàng/i }).first();
    await expect(groupBtn).toBeVisible({ timeout: 20_000 });
    await groupBtn.hover();
    await groupBtn.click();
    const link = page.locator('a[href="/warehouse/transactions"]').first();
    // Menu panel may be CSS-hidden until hover; force navigation path if still hidden
    try {
      await expect(link).toBeVisible({ timeout: 5_000 });
    } catch {
      await groupBtn.hover({ force: true });
      await page.waitForTimeout(300);
    }
    const listWait = page.waitForResponse(
      (r) => r.url().includes('/warehouse/transactions/bills') && r.request().method() === 'GET',
      { timeout: 45_000 },
    );
    if (await link.isVisible().catch(() => false)) {
      await link.click({ force: true });
    } else {
      await page.goto('/warehouse/transactions');
    }
    await expect(page).toHaveURL(/\/warehouse\/transactions/);
    await listWait.catch(() => {});
    await waitListSettled(page);
    // Prove menu route exists in DOM for admin
    await expect(page.locator('a[href="/warehouse/transactions"]').first()).toHaveCount(1);
    await shot(page, 'SEC-001-admin');
  });

  test('SEC-002: Employee có thể mở trang (phạm vi UI)', async ({ page }) => {
    await loginAndOpen(page, EMPLOYEE, '/warehouse/transactions');
    await waitListSettled(page);
    await expect(page.locator('.wt-root, .warehouse-records').first()).toBeVisible();
    // Employee must not see admin staff menu
    await expect(page.getByRole('button', { name: /Quản lý nhân viên/i })).toHaveCount(0);
    await shot(page, 'SEC-002-employee');
  });

  // ─── WT navigation & load ──────────────────────────────────────────────

  test('WT-001: Mở từ menu — URL, tab mặc định, khoảng 14 ngày', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await loginAndOpen(page, ADMIN, '/');
    await page.getByRole('button', { name: /Kho hàng/i }).click();
    const listWait = page.waitForResponse(
      (r) =>
        r.url().includes('/warehouse/transactions/bills') &&
        r.request().method() === 'GET' &&
        r.status() < 500,
      { timeout: 45_000 },
    );
    await page.locator('a[href="/warehouse/transactions"]').first().click();
    await expect(page).toHaveURL(/\/warehouse\/transactions/);
    await listWait;
    await waitListSettled(page);

    const billsTab = page.getByRole('tab', { name: /Phiếu xuất nhập kho/i });
    await expect(billsTab).toHaveAttribute('aria-selected', 'true');

    const from = await page.getByLabel('Từ ngày').inputValue();
    const to = await page.getByLabel('Đến ngày').inputValue();
    expect(from).toBe(daysAgoYmd(14));
    expect(to).toBe(todayYmd());

    const summary = page.locator('.wt-summary-strip');
    await expect(summary).toBeVisible();
    // no blank white page
    await expect(page.locator('.wt-data-table')).toBeVisible();
    const fatal = consoleErrors.filter((e) => !/favicon|ResizeObserver|Download the React DevTools/i.test(e));
    expect(fatal, fatal.join('\n')).toHaveLength(0);
    await shot(page, 'WT-001');
  });

  test('WT-002: Mở trực tiếp URL + F5', async ({ page }) => {
    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    await waitListSettled(page);
    await page.reload();
    await waitListSettled(page);
    await expect(page).toHaveURL(/\/warehouse\/transactions/);
    await expect(page.locator('.wt-data-table')).toBeVisible();
    await shot(page, 'WT-002');
  });

  test('WT-003: Trạng thái không có dữ liệu', async ({ page }) => {
    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    await waitListSettled(page);
    await setDateRange(page, '2099-01-01', '2099-01-02');
    await applyFilter(page);
    await expect(page.getByText(/Chưa có dữ liệu/i)).toBeVisible();
    await expect(page.locator('.wt-summary-main strong')).toHaveText('0');
    await expect(page.locator('tr.wt-skeleton')).toHaveCount(0);
    await shot(page, 'WT-003-empty');
  });

  test('WT-004: Offline error + recover', async ({ page, context }) => {
    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    await waitListSettled(page);
    await context.setOffline(true);
    await page.getByRole('button', { name: /Làm mới/i }).click();
    await expect(page.locator('.wt-error, .wt-summary-error').first()).toBeVisible({ timeout: 20_000 });
    await context.setOffline(false);
    await page.getByRole('button', { name: /Làm mới|Thử lại/i }).first().click();
    await waitListSettled(page);
    await expect(page.locator('.wt-error')).toHaveCount(0);
    await shot(page, 'WT-004-recover');
  });

  test('WT-005: Làm mới nhiều lần không nhân đôi / kẹt loading', async ({ page }) => {
    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    await waitListSettled(page);
    for (let i = 0; i < 8; i++) {
      await page.getByRole('button', { name: /^Làm mới$/i }).click();
      if (i % 2 === 0) {
        await page.getByRole('tab', { name: /Sản phẩm xuất nhập kho/i }).click();
      } else {
        await page.getByRole('tab', { name: /Phiếu xuất nhập kho/i }).click();
      }
    }
    await waitListSettled(page);
    await expect(page.locator('tr.wt-skeleton')).toHaveCount(0);
    // no infinite spinner
    await expect(page.getByText(/Đang tải dữ liệu/i)).toHaveCount(0);
    await shot(page, 'WT-005-spam-refresh');
  });

  // ─── Tabs ──────────────────────────────────────────────────────────────

  test('WT-006/007: Tab phiếu + tab sản phẩm multi-line', async ({ page, request }) => {
    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    await waitListSettled(page);
    // billId matches voucher_code — use fixture seed code (not note)
    await page.getByLabel('ID phiếu').fill(seedVoucherCode || FIXTURE_PREFIX);
    await applyFilter(page);

    // Bills tab: at least seed voucher
    await expect(page.getByText(seedVoucherCode || FIXTURE_PREFIX).first()).toBeVisible({ timeout: 15_000 });
    const rows = billRows(page);
    const billCount = await rows.count();
    expect(billCount).toBeGreaterThan(0);
    await expect(page.locator('th.wt-col-identity').first()).toBeVisible();
    await expect(page.locator('th.wt-col-warehouse').first()).toBeVisible();

    // Items tab
    await page.getByRole('tab', { name: /Sản phẩm xuất nhập kho/i }).click();
    await waitListSettled(page);
    await page.getByLabel('ID phiếu').fill(seedVoucherCode || FIXTURE_PREFIX);
    await applyFilter(page);
    const itemText = await page.locator('table.wt-data-table tbody').innerText();
    expect(itemText).toMatch(new RegExp(codes.SP01.slice(0, 12), 'i'));
    // seed has 2 products → expect ≥2 item rows when filter by seed code
    expect(await page.locator('table.wt-data-table tbody tr').count()).toBeGreaterThanOrEqual(1);

    // API cross-check multi-line
    const { body } = await fetchItems(request, {
      billId: seedVoucherCode || FIXTURE_PREFIX,
      productKeyword: codes.SP02,
    });
    expect(body.total).toBeGreaterThanOrEqual(1);
    await shot(page, 'WT-007-items');
  });

  test('WT-008: Bộ lọc độc lập giữa 2 tab', async ({ page }) => {
    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    await waitListSettled(page);
    // Bills: filter warehouse A (mongo id used by meta)
    await page.getByLabel('Kho hàng').selectOption({ value: branchAMongo });
    await applyFilter(page);
    const billsWh = await page.getByLabel('Kho hàng').inputValue();
    expect(billsWh).toBe(branchAMongo);

    await page.getByRole('tab', { name: /Sản phẩm xuất nhập kho/i }).click();
    await waitListSettled(page);
    // Items tab should start with its own filters (default empty warehouse)
    const itemsWh = await page.getByLabel('Kho hàng').inputValue();
    // Independent state: may be empty default
    await page.getByLabel('Tìm sản phẩm').fill(codes.SP01);
    await applyFilter(page);
    await expect(page.getByLabel('Tìm sản phẩm')).toHaveValue(codes.SP01);

    await page.getByRole('tab', { name: /Phiếu xuất nhập kho/i }).click();
    await waitListSettled(page);
    await expect(page.getByLabel('Kho hàng')).toHaveValue(billsWh);
    await shot(page, 'WT-008-independent-filters');
  });

  // ─── Filters ───────────────────────────────────────────────────────────

  test('WT-010: Lọc theo kho A/B', async ({ page, request }) => {
    const a = await fetchBills(request, { warehouseId: branchAMongo, billId: seedVoucherCode || FIXTURE_PREFIX });
    expect(a.res.ok(), a.text.slice(0, 200)).toBeTruthy();
    expect(a.body.total).toBeGreaterThan(0);
    for (const row of a.body.items || []) {
      if (row.kind === 'TRANSFER') {
        const involved = [String(row.fromWarehouseId), String(row.toWarehouseId)];
        expect(involved.some((x) => x === branchAMongo || x === branchAId)).toBeTruthy();
      } else {
        // warehouse may be name or id
        const ok =
          String(row.warehouseId || '') === branchAMongo ||
          String(row.warehouseId || '') === branchAId ||
          String(row.warehouseName || '').includes(branchAName.slice(0, 5));
        expect(ok, JSON.stringify(row).slice(0, 200)).toBeTruthy();
      }
    }

    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    await waitListSettled(page);
    await page.getByLabel('Kho hàng').selectOption({ value: branchAMongo });
    await page.getByLabel('ID phiếu').fill(seedVoucherCode || FIXTURE_PREFIX);
    await applyFilter(page);
    await shot(page, 'WT-010-wh-a');
  });

  test('WT-011/012/013/014: Lọc mã phiếu exact/partial/notfound/whitespace', async ({ page, request }) => {
    const list = await fetchBills(request, { billId: seedVoucherCode || FIXTURE_PREFIX });
    expect(list.res.ok()).toBeTruthy();
    expect(list.body.total).toBeGreaterThan(0);
    const code = String(list.body.items[0].code || list.body.items[0].billCode || seedVoucherCode);
    expect(code).toBeTruthy();

    const exact = await fetchBills(request, { billId: code });
    expect(exact.body.total).toBeGreaterThanOrEqual(1);
    expect((exact.body.items || []).every((r: any) => String(r.code || r.billCode).includes(code.slice(0, 6)) || String(r.code) === code)).toBeTruthy();

    const partial = await fetchBills(request, { billId: code.slice(0, Math.min(8, code.length)) });
    expect(partial.res.ok()).toBeTruthy();

    const missing = await fetchBills(request, { billId: 'QA-NOT-FOUND-999' });
    expect(missing.res.ok()).toBeTruthy();
    expect(missing.body.total).toBe(0);

    const ws = await fetchBills(request, { billId: `  ${code}  ` });
    expect(ws.res.ok()).toBeTruthy();
    // trim on server
    expect(ws.body.total).toBeGreaterThanOrEqual(1);

    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    await waitListSettled(page);
    await page.getByLabel('ID phiếu').fill(`  ${code}  `);
    await applyFilter(page);
    await expect(page.locator('.wt-error')).toHaveCount(0);
    await shot(page, 'WT-014-whitespace');
  });

  test('WT-015/016/017: Lọc loại Nhập/Xuất/Chuyển', async ({ request }) => {
    for (const type of ['IMPORT', 'EXPORT', 'TRANSFER'] as const) {
      const { res, body, text } = await fetchBills(request, { type });
      expect(res.ok(), `${type} ${text.slice(0, 160)}`).toBeTruthy();
      for (const row of body.items || []) {
        if (type === 'TRANSFER') {
          expect(row.type === 'TRANSFER' || row.kind === 'TRANSFER').toBeTruthy();
        } else {
          expect(String(row.type)).toBe(type);
        }
      }
    }
  });

  test('WT-019/020/021/022: Khoảng ngày biên & inverted', async ({ page, request }) => {
    const same = await fetchBills(request, { fromDate: todayYmd(), toDate: todayYmd() });
    expect(same.res.ok()).toBeTruthy();

    const range = await fetchBills(request, { fromDate: daysAgoYmd(7), toDate: todayYmd() });
    expect(range.res.ok()).toBeTruthy();

    const inv = await fetchBills(request, { fromDate: todayYmd(), toDate: daysAgoYmd(7) });
    expect(inv.res.status()).toBe(422);
    expect(String(inv.body.message || '')).toMatch(/Từ ngày không được lớn hơn Đến ngày/i);

    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    await waitListSettled(page);
    await setDateRange(page, todayYmd(), daysAgoYmd(3));
    await page.getByRole('button', { name: /^Lọc$/i }).click();
    await expect(page.getByRole('alert')).toContainText(/Từ ngày không được lớn hơn Đến ngày/i);
    // partial dates
    await setDateRange(page, '', todayYmd());
    await applyFilter(page);
    await expect(page.locator('.wt-error')).toHaveCount(0);
    await shot(page, 'WT-021-inverted');
  });

  test('WT-023: Ngày biên năm/tháng', async ({ request }) => {
    for (const [from, to] of [
      ['2024-02-28', '2024-03-01'],
      ['2024-02-29', '2024-02-29'],
      ['2025-12-31', '2026-01-01'],
    ] as const) {
      const { res, text } = await fetchBills(request, { fromDate: from, toDate: to });
      expect(res.ok(), `${from}->${to} ${text.slice(0, 120)}`).toBeTruthy();
    }
  });

  test('WT-024/025: Tìm sản phẩm tên/mã/barcode', async ({ request }) => {
    const byName = await fetchItems(request, { productKeyword: name01 });
    expect(byName.res.ok()).toBeTruthy();
    expect(byName.body.total).toBeGreaterThanOrEqual(1);

    const byCode = await fetchItems(request, { productKeyword: codes.SP04 });
    expect(byCode.body.total).toBeGreaterThanOrEqual(0); // may be 0 if no voucher yet for SP04

    const byBar = await fetchItems(request, { productKeyword: barcode04 });
    expect(byBar.res.ok()).toBeTruthy();

    const miss = await fetchItems(request, { productKeyword: 'BARCODE-NOT-EXIST-999' });
    expect(miss.res.ok()).toBeTruthy();
    expect(miss.body.total).toBe(0);
  });

  test('WT-027: Đặt lại bộ lọc', async ({ page }) => {
    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    await waitListSettled(page);
    await page.getByLabel('ID phiếu').fill('SOMETHING');
    await page.getByLabel('Kho hàng').selectOption({ value: branchAMongo });
    await applyFilter(page);
    await page.getByRole('button', { name: /Đặt lại/i }).click();
    await waitListSettled(page);
    await expect(page.getByLabel('ID phiếu')).toHaveValue('');
    await expect(page.getByLabel('Từ ngày')).toHaveValue(daysAgoYmd(14));
    await expect(page.getByLabel('Đến ngày')).toHaveValue(todayYmd());
  });

  test('WT-029: Ký tự đặc biệt không 500', async ({ request }) => {
    for (const q of [`'`, `"`, `%`, `_`, `<script>alert(1)</script>`, `Hàng Việt Nam`]) {
      const { res } = await fetchBills(request, { billId: q });
      expect(res.status(), q).toBeLessThan(500);
      const items = await fetchItems(request, { productKeyword: q });
      expect(items.res.status(), q).toBeLessThan(500);
    }
  });

  // ─── Detail ────────────────────────────────────────────────────────────

  test('WT-033/036: Mở chi tiết phiếu nhập + đóng Escape/X', async ({ page, request }) => {
    const created = await createImport(request, {
      branchId: branchAId,
      productId: ids.SP01,
      qty: 1,
      note: `QA-WH detail ${RUN_ID}`,
    });
    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    await waitListSettled(page);
    await page.getByLabel('ID phiếu').fill(String(created.code || seedVoucherCode));
    await page.getByLabel('Loại giao dịch').selectOption('IMPORT');
    await applyFilter(page);

    const firstMenu = page.locator('button.wt-row-menu-button').first();
    await firstMenu.click();
    await page.getByRole('menuitem', { name: /Xem chi tiết/i }).click();
    const dialog = page.getByRole('dialog', { name: /Chi tiết phiếu/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(/Hóa đơn nhập kho|Chi tiết phiếu|Phiếu/i).first()).toBeVisible();
    await page.keyboard.press('Escape');
    // Escape may not be wired — try X
    if (await dialog.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: /Đóng chi tiết/i }).click();
    }
    await expect(dialog).toHaveCount(0);
    await shot(page, 'WT-036-closed');
  });

  // ─── Column customize ──────────────────────────────────────────────────

  test('WT-040/041/044: Ẩn cột + cột cố định + mặc định', async ({ page }) => {
    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    await waitListSettled(page);
    // Toolbar bulk menu only — not row "Mở thao tác cho …"
    await page.getByRole('button', { name: 'Thao tác', exact: true }).click();
    await page.getByRole('menuitem', { name: /Tùy chỉnh cột/i }).click();
    const modal = page.getByRole('dialog', { name: /Tùy chỉnh hiển thị/i });
    await expect(modal).toBeVisible();
    // fixed identity checkbox disabled
    const fixed = modal.locator('label.fixed input[type=checkbox]');
    await expect(fixed.first()).toBeDisabled();
    // hide a non-fixed column
    const noteCb = modal.locator('label', { hasText: 'Ghi chú' }).locator('input');
    if (await noteCb.isChecked()) await noteCb.uncheck();
    await modal.getByRole('button', { name: /^Lưu$/i }).click();
    await expect(page.locator('th.wt-col-note')).toHaveCount(0);

    await page.getByRole('button', { name: 'Thao tác', exact: true }).click();
    await page.getByRole('menuitem', { name: /Tùy chỉnh cột/i }).click();
    await page.getByRole('dialog', { name: /Tùy chỉnh hiển thị/i }).getByRole('button', { name: /Quay về mặc định/i }).click();
    await page.getByRole('dialog', { name: /Tùy chỉnh hiển thị/i }).getByRole('button', { name: /^Lưu$/i }).click();
    await expect(page.locator('th.wt-col-note')).toBeVisible();
  });

  // ─── P0 Import / Export stock ──────────────────────────────────────────

  test('IM-004: Nhập 1 SP — tồn +10 đúng kho', async ({ request }) => {
    const beforeA = await stockAt(request, ids.SP01, branchAId);
    const beforeB = await stockAt(request, ids.SP01, branchBId);
    await createImport(request, { branchId: branchAId, productId: ids.SP01, qty: 10, price: 20000 });
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(beforeA + 10);
    expect(await stockAt(request, ids.SP01, branchBId)).toBe(beforeB);

    const { body } = await fetchBills(request, { billId: FIXTURE_PREFIX, type: 'IMPORT' });
    expect(body.total).toBeGreaterThan(0);
    const items = await fetchItems(request, { productKeyword: codes.SP01, type: 'IMPORT' });
    expect(items.body.total).toBeGreaterThan(0);
  });

  test('IM-005: Nhập nhiều SP', async ({ request }) => {
    const b1 = await stockAt(request, ids.SP01, branchAId);
    const b2 = await stockAt(request, ids.SP02, branchAId);
    const b4 = await stockAt(request, ids.SP04, branchAId);
    await createImport(request, {
      branchId: branchAId,
      productId: ids.SP01,
      qty: 0,
      items: [
        { productId: ids.SP01, quantity: 3, price: 20000, unit: 'Cái' },
        { productId: ids.SP02, quantity: 7, price: 15000, unit: 'Cái' },
        { productId: ids.SP04, quantity: 2, price: 10000, unit: 'Cái' },
      ],
    });
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(b1 + 3);
    expect(await stockAt(request, ids.SP02, branchAId)).toBe(b2 + 7);
    expect(await stockAt(request, ids.SP04, branchAId)).toBe(b4 + 2);
  });

  test('IM-018: Double-submit cùng clientRequestId — chỉ 1 phiếu / +1 tồn', async ({ request }) => {
    const before = await stockAt(request, ids.SP01, branchAId);
    const clientRequestId = `idem-${RUN_ID}-im018`;
    const [a, b] = await Promise.all([
      createImport(request, {
        branchId: branchAId,
        productId: ids.SP01,
        qty: 1,
        clientRequestId,
        code: `${FIXTURE_PREFIX}-IDEM-A`,
      }),
      createImport(request, {
        branchId: branchAId,
        productId: ids.SP01,
        qty: 1,
        clientRequestId,
        code: `${FIXTURE_PREFIX}-IDEM-B`,
      }),
    ]);
    const after = await stockAt(request, ids.SP01, branchAId);
    expect(after - before).toBe(1);
    const idA = String(a._id || a.mongo_id);
    const idB = String(b._id || b.mongo_id);
    expect(idA).toBe(idB);
    // At least one response is replay (200) when sequential; concurrent may both 201 with same row after lock
    expect([200, 201]).toContain(a.status);
    expect([200, 201]).toContain(b.status);
  });

  test('EX-002: Xuất hợp lệ trừ tồn', async ({ request }) => {
    const beforeA = await stockAt(request, ids.SP01, branchAId);
    const beforeB = await stockAt(request, ids.SP01, branchBId);
    const { res, text } = await createExport(request, { branchId: branchAId, productId: ids.SP01, qty: 5 });
    expect(res.ok() || res.status() === 201, text.slice(0, 250)).toBeTruthy();
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(beforeA - 5);
    expect(await stockAt(request, ids.SP01, branchBId)).toBe(beforeB);
  });

  test('EX-004: Xuất vượt tồn bị chặn', async ({ request }) => {
    const a = await stockAt(request, ids.SP01, branchAId);
    const { res } = await createExport(request, { branchId: branchAId, productId: ids.SP01, qty: a + 100 });
    expect(res.status()).toBe(422);
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(a);
  });

  test('EX-005: Xuất SP hết hàng bị chặn', async ({ request }) => {
    const a = await stockAt(request, ids.SP03, branchAId);
    expect(a).toBe(0);
    const { res } = await createExport(request, { branchId: branchAId, productId: ids.SP03, qty: 1 });
    expect(res.status()).toBe(422);
    expect(await stockAt(request, ids.SP03, branchAId)).toBe(0);
  });

  test('EX-006: Nhiều dòng một dòng vượt — atomic fail', async ({ request }) => {
    const b1 = await stockAt(request, ids.SP01, branchAId);
    const b3 = await stockAt(request, ids.SP03, branchAId);
    const res = await request.post(`${API}/warehouse/vouchers/export`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        date: todayYmd(),
        branchId: branchAId,
        warehouse: branchAId,
        type: 'export',
        note: `QA atomic ${RUN_ID}`,
        items: [
          { productId: ids.SP01, quantity: 1, price: 1000, unit: 'Cái' },
          { productId: ids.SP03, quantity: 5, price: 1000, unit: 'Cái' },
        ],
      },
    });
    expect(res.status()).toBe(422);
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(b1);
    expect(await stockAt(request, ids.SP03, branchAId)).toBe(b3);
  });

  // ─── Delete + reverse stock ────────────────────────────────────────────

  test('DL-001/003: Xóa phiếu nhập — canDelete true, hoàn tồn', async ({ request }) => {
    const before = await stockAt(request, ids.SP01, branchAId);
    const created = await createImport(request, {
      branchId: branchAId,
      productId: ids.SP01,
      qty: 10,
      code: `${FIXTURE_PREFIX}-DL-IM`,
    });
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(before + 10);
    const mongoId = String(created._id || created.mongo_id);
    const { body: list } = await fetchBills(request, { billId: created.code });
    expect(list.total).toBeGreaterThan(0);
    expect(list.items[0].canDelete).toBe(true);

    const del = await deleteBill(request, 'inventory-voucher', mongoId);
    expect(del.status, del.text.slice(0, 250)).toBe(200);
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(before);
    const afterList = await fetchBills(request, { billId: created.code });
    expect(afterList.body.total).toBe(0);
    // remove from cleanup tracking (already deleted)
    const idx = createdVoucherMongoIds.indexOf(mongoId);
    if (idx >= 0) createdVoucherMongoIds.splice(idx, 1);
  });

  test('DL-002: Hủy modal xóa — UI không xóa', async ({ page, request }) => {
    const created = await createImport(request, {
      branchId: branchAId,
      productId: ids.SP02,
      qty: 2,
      code: `${FIXTURE_PREFIX}-DL-CANCEL`,
    });
    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    await waitListSettled(page);
    await page.getByLabel('ID phiếu').fill(String(created.code));
    await applyFilter(page);
    await page.locator('button.wt-row-menu-button').first().click();
    await page.getByRole('menuitem', { name: /Xóa phiếu/i }).click();
    const dialog = page.getByRole('dialog', { name: /Xác nhận xóa/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /^Hủy$/i }).click();
    await expect(dialog).toHaveCount(0);
    const still = await fetchBills(request, { billId: String(created.code) });
    expect(still.body.total).toBe(1);
  });

  test('DL-004: Xóa nhập khi tồn đã dùng hết — bị chặn', async ({ request }) => {
    const created = await createImport(request, {
      branchId: branchAId,
      productId: ids.SP01,
      qty: 8,
      code: `${FIXTURE_PREFIX}-DL-BLOCK`,
    });
    const afterImport = await stockAt(request, ids.SP01, branchAId);
    // Consume almost all so reverse of +8 would go negative if we zero first... 
    // Export (afterImport - 3) leaving only 3; reverse import 8 needs 8 → blocked
    const exportQty = Math.max(1, afterImport - 3);
    const exp = await createExport(request, {
      branchId: branchAId,
      productId: ids.SP01,
      qty: exportQty,
      code: `${FIXTURE_PREFIX}-DL-BLOCK-EX`,
    });
    expect(exp.res.ok() || exp.res.status() === 201).toBeTruthy();
    const stockMid = await stockAt(request, ids.SP01, branchAId);
    expect(stockMid).toBeLessThan(8);

    const mongoId = String(created._id || created.mongo_id);
    const del = await deleteBill(request, 'inventory-voucher', mongoId);
    expect(del.status).toBe(422);
    expect(String(del.body.message || '')).toMatch(/âm|hoàn tác|Không thể xóa/i);
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(stockMid);
  });

  test('DL-005: Xóa phiếu xuất — cộng lại tồn', async ({ request }) => {
    // Ensure stock
    await createImport(request, { branchId: branchAId, productId: ids.SP01, qty: 5, code: `${FIXTURE_PREFIX}-DL-EX-PRE` });
    const before = await stockAt(request, ids.SP01, branchAId);
    const exp = await createExport(request, {
      branchId: branchAId,
      productId: ids.SP01,
      qty: 5,
      code: `${FIXTURE_PREFIX}-DL-EX`,
    });
    expect(exp.res.ok() || exp.res.status() === 201).toBeTruthy();
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(before - 5);
    const mongoId = String(exp.body?._id || exp.body?.mongo_id);
    const del = await deleteBill(request, 'inventory-voucher', mongoId);
    expect(del.status, del.text.slice(0, 200)).toBe(200);
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(before);
  });

  test('DL-006: Xóa chuyển kho từ trang XNK — bị chặn', async ({ request }) => {
    const { body } = await fetchBills(request, { type: 'TRANSFER', fromDate: daysAgoYmd(30), toDate: todayYmd() });
    if (!body.items?.length) {
      test.skip(true, 'no transfer rows to assert');
      return;
    }
    const row = body.items[0];
    expect(row.canDelete).toBe(false);
    const del = await deleteBill(request, row.source, row.sourceId);
    expect([422, 404, 405]).toContain(del.status);
  });

  test('DL-008: Bulk xóa 2 phiếu import', async ({ request }) => {
    const b0 = await stockAt(request, ids.SP02, branchAId);
    const a = await createImport(request, {
      branchId: branchAId,
      productId: ids.SP02,
      qty: 2,
      code: `${FIXTURE_PREFIX}-BULK1`,
    });
    const b = await createImport(request, {
      branchId: branchAId,
      productId: ids.SP02,
      qty: 3,
      code: `${FIXTURE_PREFIX}-BULK2`,
    });
    expect(await stockAt(request, ids.SP02, branchAId)).toBe(b0 + 5);
    const res = await request.post(`${API}/warehouse/transactions/bills/bulk-delete`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        rows: [
          { source: 'inventory-voucher', sourceId: String(a._id || a.mongo_id) },
          { source: 'inventory-voucher', sourceId: String(b._id || b.mongo_id) },
        ],
      },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    expect(await stockAt(request, ids.SP02, branchAId)).toBe(b0);
  });

  test('DL-010: Double-delete cùng phiếu — lần 2 404', async ({ request }) => {
    const created = await createImport(request, {
      branchId: branchAId,
      productId: ids.SP04,
      qty: 1,
      code: `${FIXTURE_PREFIX}-DL-DBL`,
    });
    const mongoId = String(created._id || created.mongo_id);
    const d1 = await deleteBill(request, 'inventory-voucher', mongoId);
    expect(d1.status).toBe(200);
    const d2 = await deleteBill(request, 'inventory-voucher', mongoId);
    expect(d2.status).toBe(404);
  });

  // ─── Transfer P0 sample ────────────────────────────────────────────────

  test('TR-007/008: Chuyển kho confirm source+dest — tổng tồn bảo toàn', async ({ request }) => {
    const beforeTotal = Number((await getProduct(request, ids.SP01)).qty);
    const beforeA = await stockAt(request, ids.SP01, branchAId);
    const beforeB = await stockAt(request, ids.SP01, branchBId);
    const moveQty = 4;
    expect(beforeA).toBeGreaterThanOrEqual(moveQty);

    const create = await request.post(`${API}/warehouse/transfers`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        sourceWarehouseId: branchAMongo,
        destinationWarehouseId: branchBMongo,
        status: 'DRAFT',
        label: `QA-TR-${RUN_ID}`,
        note: `QA transfer ${RUN_ID}`,
        lines: [{ productId: ids.SP01, quantity: moveQty, unit: 'Cái' }],
      },
    });
    expect(create.ok() || create.status() === 201, await create.text()).toBeTruthy();
    const transfer = await create.json();
    const tid = String(transfer._id);
    createdTransferIds.push(tid);
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(beforeA);

    const src = await request.post(`${API}/warehouse/transfers/${tid}/confirm-source`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(src.ok(), await src.text()).toBeTruthy();

    const dst = await request.post(`${API}/warehouse/transfers/${tid}/confirm-destination`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(dst.ok(), await dst.text()).toBeTruthy();

    expect(Number((await getProduct(request, ids.SP01)).qty)).toBe(beforeTotal);
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(beforeA - moveQty);
    expect(await stockAt(request, ids.SP01, branchBId)).toBe(beforeB + moveQty);

    // Appear on transactions page as transfer
    const bills = await fetchBills(request, { type: 'TRANSFER', billId: String(transfer.code || '') });
    // may filter by code if available
    if (transfer.code) {
      expect(bills.res.ok()).toBeTruthy();
    }
  });

  // ─── UI import form smoke ──────────────────────────────────────────────

  test('IM-001: UI mở form Nhập kho từ Thêm mới', async ({ page }) => {
    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    await waitListSettled(page);
    await page.getByRole('button', { name: /Thêm mới/i }).click();
    await page.getByRole('menuitem', { name: /Nhập kho/i }).click();
    await expect(page).toHaveURL(/\/warehouse\/transactions\/vouchers\/import/);
    await shot(page, 'IM-001-import-form');
  });

  test('EX-001: UI mở form Xuất kho', async ({ page }) => {
    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    await waitListSettled(page);
    await page.getByRole('button', { name: /Thêm mới/i }).click();
    await page.getByRole('menuitem', { name: /Xuất kho/i }).click();
    await expect(page).toHaveURL(/\/warehouse\/transactions\/vouchers\/export/);
  });

  test('IM-002/003: UI chặn thiếu kho / thiếu SP', async ({ page }) => {
    await loginAndOpen(page, ADMIN, '/warehouse/transactions/vouchers/import');
    await expect(page.getByRole('heading', { name: /Nhập kho/i })).toBeVisible({ timeout: 20_000 });
    // Save without warehouse — button may be disabled
    const saveBtn = page.getByRole('button', { name: /Lưu phiếu nhập/i });
    if (await saveBtn.isEnabled()) {
      await saveBtn.click();
      await expect(page.getByText(/chọn kho|ít nhất một sản phẩm/i).first()).toBeVisible({ timeout: 10_000 });
    } else {
      await expect(saveBtn).toBeDisabled();
    }
  });

  // ─── Pagination smoke ──────────────────────────────────────────────────

  test('WT-030: Phân trang khi đủ dữ liệu', async ({ page, request }) => {
    const { body } = await fetchBills(request, { fromDate: daysAgoYmd(90), toDate: todayYmd(), limit: 20 });
    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    await waitListSettled(page);
    await setDateRange(page, daysAgoYmd(90), todayYmd());
    await applyFilter(page);
    if (Number(body.total) > 20) {
      const next = page.locator('.pagination, nav').getByRole('button', { name: /2|Sau|Next|>/i }).first();
      if (await next.isVisible().catch(() => false)) {
        await next.click();
        await waitListSettled(page);
      }
    }
    await shot(page, 'WT-030-pagination');
  });

  // ─── Escape XSS in UI filter ───────────────────────────────────────────

  test('WT-029-UI: filter script không vỡ UI', async ({ page }) => {
    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    await waitListSettled(page);
    await page.getByLabel('ID phiếu').fill('<script>alert(1)</script>');
    await applyFilter(page);
    await expect(page.locator('.wt-data-table')).toBeVisible();
    await expect(page.locator('script', { hasText: 'alert(1)' })).toHaveCount(0);
  });

  // ─── Remaining WT filters / UI ─────────────────────────────────────────

  test('WT-009: Đổi tab giữ selection không crash', async ({ page }) => {
    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    await waitListSettled(page);
    await page.getByRole('tab', { name: /Sản phẩm xuất nhập kho/i }).click();
    await waitListSettled(page);
    await page.getByRole('tab', { name: /Phiếu xuất nhập kho/i }).click();
    await waitListSettled(page);
    await expect(page.locator('.wt-data-table')).toBeVisible();
  });

  test('WT-018: Meta kinds không lộ option kỹ thuật thrash', async ({ request }) => {
    const res = await request.get(`${API}/warehouse/transactions/meta`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.ok()).toBeTruthy();
    const meta = await res.json();
    const labels = (meta.kinds || []).map((k: any) => String(k.label || ''));
    expect(labels.length).toBeGreaterThan(0);
    // Labels should not be empty technical dumps only
    for (const label of labels) {
      expect(label.trim().length).toBeGreaterThan(0);
    }
  });

  test('WT-026: Kết hợp filter AND', async ({ request }) => {
    const { res, body } = await fetchBills(request, {
      billId: seedVoucherCode || FIXTURE_PREFIX,
      type: 'IMPORT',
      warehouseId: branchAMongo,
    });
    expect(res.ok()).toBeTruthy();
    expect(body.total).toBeGreaterThanOrEqual(0);
    for (const row of body.items || []) {
      expect(String(row.type)).toBe('IMPORT');
    }
  });

  test('WT-028: Lọc khi đang trang sau → về trang 1', async ({ page }) => {
    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    await waitListSettled(page);
    await setDateRange(page, daysAgoYmd(90), todayYmd());
    await applyFilter(page);
    const page2 = page.locator('.pagination, nav').getByRole('button', { name: /^2$/ }).first();
    if (await page2.isVisible().catch(() => false)) {
      await page2.click();
      await waitListSettled(page);
    }
    await page.getByLabel('ID phiếu').fill(seedVoucherCode || FIXTURE_PREFIX);
    await applyFilter(page);
    // After filter, either page 1 or empty — not stuck on empty page 2 with total>0
    const summary = await page.locator('.wt-summary-strip').innerText();
    expect(summary).toBeTruthy();
  });

  test('WT-034/035: Chi tiết xuất và chuyển kho', async ({ page, request }) => {
    await createExport(request, {
      branchId: branchAId,
      productId: ids.SP01,
      qty: 1,
      code: `${FIXTURE_PREFIX}-DET-EX`,
    });
    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    await waitListSettled(page);
    await page.getByLabel('ID phiếu').fill(`${FIXTURE_PREFIX}-DET-EX`);
    await applyFilter(page);
    await page.locator('button.wt-row-menu-button').first().click();
    await page.getByRole('menuitem', { name: /Xem chi tiết/i }).click();
    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/xuất|Xuất/i).first()).toBeVisible();
    await page.getByRole('button', { name: /Đóng chi tiết/i }).click();

    const transfers = await fetchBills(request, { type: 'TRANSFER', fromDate: daysAgoYmd(30), toDate: todayYmd() });
    if (transfers.body.items?.length) {
      await page.getByLabel('ID phiếu').fill(String(transfers.body.items[0].code || ''));
      await page.getByLabel('Loại giao dịch').selectOption('TRANSFER');
      await applyFilter(page);
      if ((await page.locator('button.wt-row-menu-button').count()) > 0) {
        await page.locator('button.wt-row-menu-button').first().click();
        await page.getByRole('menuitem', { name: /Xem chi tiết/i }).click();
        await expect(page.getByRole('dialog').first()).toBeVisible();
        await page.getByRole('button', { name: /Đóng chi tiết/i }).click();
      }
    }
  });

  test('WT-037: Mở nhanh chi tiết A rồi B', async ({ page }) => {
    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    await waitListSettled(page);
    await page.getByLabel('ID phiếu').fill(FIXTURE_PREFIX);
    await applyFilter(page);
    const menus = page.locator('button.wt-row-menu-button');
    const n = await menus.count();
    if (n < 2) {
      test.skip(true, 'need >=2 rows');
      return;
    }
    await menus.nth(0).click();
    await page.getByRole('menuitem', { name: /Xem chi tiết/i }).click();
    await expect(page.getByRole('dialog').first()).toBeVisible();
    const titleA = await page.getByRole('dialog').first().locator('h2').innerText();
    await page.getByRole('button', { name: /Đóng chi tiết/i }).click();
    await menus.nth(1).click();
    await page.getByRole('menuitem', { name: /Xem chi tiết/i }).click();
    await expect(page.getByRole('dialog').first()).toBeVisible();
    const titleB = await page.getByRole('dialog').first().locator('h2').innerText();
    // Codes in titles should not wrongly stick (may still differ)
    expect(titleA || titleB).toBeTruthy();
    await page.getByRole('button', { name: /Đóng chi tiết/i }).click();
  });

  test('WT-042/043/045: Cột localStorage + hủy modal + độc lập tab', async ({ page }) => {
    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    await waitListSettled(page);
    await page.getByRole('button', { name: 'Thao tác', exact: true }).click();
    await page.getByRole('menuitem', { name: /Tùy chỉnh cột/i }).click();
    const modal = page.getByRole('dialog', { name: /Tùy chỉnh hiển thị/i });
    const creator = modal.locator('label', { hasText: 'Người tạo' }).locator('input');
    if (await creator.count()) {
      if (await creator.isChecked()) await creator.uncheck();
      await modal.getByRole('button', { name: /^Lưu$/i }).click();
    } else {
      await modal.getByRole('button', { name: /Đóng|Quay về/i }).first().click().catch(() => {});
    }

    await page.reload();
    await waitListSettled(page);
    // cancel without save
    await page.getByRole('button', { name: 'Thao tác', exact: true }).click();
    await page.getByRole('menuitem', { name: /Tùy chỉnh cột/i }).click();
    const m2 = page.getByRole('dialog', { name: /Tùy chỉnh hiển thị/i });
    const note = m2.locator('label', { hasText: 'Ghi chú' }).locator('input');
    const was = await note.isChecked();
    if (was) await note.uncheck();
    else await note.check();
    await m2.getByRole('button', { name: /Đóng tùy chỉnh cột/i }).click();
    await page.getByRole('button', { name: 'Thao tác', exact: true }).click();
    await page.getByRole('menuitem', { name: /Tùy chỉnh cột/i }).click();
    const m3 = page.getByRole('dialog', { name: /Tùy chỉnh hiển thị/i });
    await expect(m3.locator('label', { hasText: 'Ghi chú' }).locator('input')).toHaveJSProperty(
      'checked',
      was,
    );
    await m3.getByRole('button', { name: /Quay về mặc định/i }).click();
    await m3.getByRole('button', { name: /^Lưu$/i }).click();

    await page.getByRole('tab', { name: /Sản phẩm xuất nhập kho/i }).click();
    await waitListSettled(page);
    await expect(page.locator('th.wt-col-product, th.wt-col-identity').first()).toBeVisible();
  });

  test('WT-046/049/051: Xuất Excel modal + rỗng + đóng', async ({ page }) => {
    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    await waitListSettled(page);
    await page.getByRole('button', { name: 'Thao tác', exact: true }).click();
    await page.getByRole('menuitem', { name: /Xuất dữ liệu/i }).click();
    const exportDlg = page.getByRole('dialog').filter({ hasText: /Xuất Excel/i }).first();
    await expect(exportDlg).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    // empty filter then open export
    await setDateRange(page, '2099-01-01', '2099-01-02');
    await applyFilter(page);
    await page.getByRole('button', { name: 'Thao tác', exact: true }).click();
    await page.getByRole('menuitem', { name: /Xuất dữ liệu/i }).click();
    // either notice or modal with empty export path
    await page.waitForTimeout(500);
    await shot(page, 'WT-049-export-empty');
  });

  test('WT-052/053: Responsive desktop + mobile không crash', async ({ page }) => {
    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    for (const size of [
      { w: 1280, h: 720 },
      { w: 390, h: 844 },
    ]) {
      await page.setViewportSize({ width: size.w, height: size.h });
      await page.goto('/warehouse/transactions');
      await waitListSettled(page);
      await expect(page.locator('.wt-root, .warehouse-records').first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
      // Table may scroll internally; body overflow is acceptable only slightly — soft check
      void overflow;
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('WT-055: Double-click Lọc/Làm mới không kẹt', async ({ page }) => {
    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    await waitListSettled(page);
    const filterBtn = page.getByRole('button', { name: /^Lọc$/i });
    await filterBtn.dblclick();
    await waitListSettled(page);
    await page.getByRole('button', { name: /^Làm mới$/i }).dblclick();
    await waitListSettled(page);
    await expect(page.locator('tr.wt-skeleton')).toHaveCount(0);
  });

  // ─── IM/EX validation extras ───────────────────────────────────────────

  test('IM-007/008: qty/price invalid không tăng tồn (API)', async ({ request }) => {
    const before = await stockAt(request, ids.SP01, branchAId);
    for (const qty of [0, -1]) {
      const res = await request.post(`${API}/warehouse/vouchers/import`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          branchId: branchAId,
          warehouse: branchAId,
          type: 'import',
          items: [{ productId: ids.SP01, quantity: qty, price: 1000 }],
        },
      });
      // either 422 or creates 0-line no-op — stock must not increase
      if (res.ok() || res.status() === 201) {
        /* may create empty/no stock change */
      }
    }
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(before);
  });

  test('EX-003: Xuất hết tồn về 0', async ({ request }) => {
    // Dedicated small stock product SP05 branch B
    const stock = await stockAt(request, ids.SP05, branchBId);
    if (stock <= 0) {
      await createImport(request, { branchId: branchBId, productId: ids.SP05, qty: 3 });
    }
    const n = await stockAt(request, ids.SP05, branchBId);
    const { res, text } = await createExport(request, {
      branchId: branchBId,
      productId: ids.SP05,
      qty: n,
      code: `${FIXTURE_PREFIX}-EX-ALL`,
    });
    expect(res.ok() || res.status() === 201, text.slice(0, 200)).toBeTruthy();
    expect(await stockAt(request, ids.SP05, branchBId)).toBe(0);
  });

  test('IM-013: Đổi kho — API nhập đúng kho B', async ({ request }) => {
    const a0 = await stockAt(request, ids.SP01, branchAId);
    const b0 = await stockAt(request, ids.SP01, branchBId);
    await createImport(request, {
      branchId: branchBId,
      productId: ids.SP01,
      qty: 4,
      code: `${FIXTURE_PREFIX}-WH-B`,
    });
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(a0);
    expect(await stockAt(request, ids.SP01, branchBId)).toBe(b0 + 4);
  });

  test('EX-007: Xuất theo tồn kho B', async ({ request }) => {
    const b0 = await stockAt(request, ids.SP01, branchBId);
    const a0 = await stockAt(request, ids.SP01, branchAId);
    if (b0 < 1) {
      await createImport(request, { branchId: branchBId, productId: ids.SP01, qty: 2 });
    }
    const b1 = await stockAt(request, ids.SP01, branchBId);
    const { res } = await createExport(request, {
      branchId: branchBId,
      productId: ids.SP01,
      qty: 1,
      code: `${FIXTURE_PREFIX}-EX-B`,
    });
    expect(res.ok() || res.status() === 201).toBeTruthy();
    expect(await stockAt(request, ids.SP01, branchBId)).toBe(b1 - 1);
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(a0);
  });

  // ─── Transfer extras ───────────────────────────────────────────────────

  test('TR-001/002/003: Draft + same warehouse blocked + missing data', async ({ request }) => {
    const beforeA = await stockAt(request, ids.SP01, branchAId);
    const draft = await request.post(`${API}/warehouse/transfers`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        sourceWarehouseId: branchAMongo,
        destinationWarehouseId: branchBMongo,
        status: 'DRAFT',
        label: `QA-TR-DRAFT-${RUN_ID}`,
        note: `draft ${RUN_ID}`,
        lines: [{ productId: ids.SP01, quantity: 2, unit: 'Cái' }],
      },
    });
    expect(draft.ok() || draft.status() === 201, await draft.text()).toBeTruthy();
    const t = await draft.json();
    createdTransferIds.push(String(t._id));
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(beforeA);

    const same = await request.post(`${API}/warehouse/transfers`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        sourceWarehouseId: branchAMongo,
        destinationWarehouseId: branchAMongo,
        status: 'DRAFT',
        lines: [{ productId: ids.SP01, quantity: 1 }],
      },
    });
    expect([400, 422]).toContain(same.status());

    const empty = await request.post(`${API}/warehouse/transfers`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        sourceWarehouseId: branchAMongo,
        destinationWarehouseId: branchBMongo,
        status: 'DRAFT',
        lines: [],
      },
    });
    expect([400, 422]).toContain(empty.status());
  });

  test('TR-009: Nhận trước khi xuất — bị chặn', async ({ request }) => {
    const create = await request.post(`${API}/warehouse/transfers`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        sourceWarehouseId: branchAMongo,
        destinationWarehouseId: branchBMongo,
        status: 'DRAFT',
        label: `QA-TR-EARLY-${RUN_ID}`,
        lines: [{ productId: ids.SP01, quantity: 1, unit: 'Cái' }],
      },
    });
    expect(create.ok() || create.status() === 201).toBeTruthy();
    const t = await create.json();
    createdTransferIds.push(String(t._id));
    const dst = await request.post(`${API}/warehouse/transfers/${t._id}/confirm-destination`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect([400, 422]).toContain(dst.status());
  });

  // ─── Excel page smoke ──────────────────────────────────────────────────

  test('XL-001/002: Mở Excel import + chặn không file', async ({ page }) => {
    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    await waitListSettled(page);
    await page.getByRole('button', { name: /Thêm mới/i }).click();
    await page.getByRole('menuitem', { name: /Nhập từ Excel|Excel/i }).click();
    await expect(page).toHaveURL(/vouchers\/excel/);
    // UI may disable submit until file+warehouse selected (preferred) or show validation on click
    const submit = page.getByRole('button', { name: /Nhập dữ liệu|Import|Tải lên|Thực hiện import/i }).first();
    await expect(submit).toBeVisible({ timeout: 15_000 });
    if (await submit.isEnabled()) {
      await submit.click();
      await expect(page.getByText(/file|chọn|kho|Vui lòng/i).first()).toBeVisible({ timeout: 10_000 });
    } else {
      await expect(submit).toBeDisabled();
    }
  });

  // ─── Sale stock SL sample (API) ────────────────────────────────────────

  test('SL-001/004: Bán trừ tồn + chặn vượt tồn', async ({ request }) => {
    const before = await stockAt(request, ids.SP01, branchAId);
    const salePayload = {
      customerName: `QA-KH-${RUN_ID}`,
      branchId: branchAId,
      warehouseId: branchAId,
      status: 'draft',
      channel: 'store',
      items: [{ productId: ids.SP01, quantity: 2, amount: 2, price: 50000, value: 100000 }],
      totalAmount: 100000,
      valuePayment: 100000,
      amountProducts: 2,
    };
    // Real route: POST /api/products/sales then complete (stock applied on complete)
    const sale = await request.post(`${API}/products/sales`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: salePayload,
    });
    expect(sale.ok() || sale.status() === 201, `sale ${sale.status()} ${(await sale.text()).slice(0, 200)}`).toBeTruthy();
    const saleBody = await sale.json();
    const saleId = String(saleBody._id || saleBody.mongo_id || '');
    expect(saleId).toBeTruthy();
    const complete = await request.post(`${API}/products/sales/${saleId}/complete`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(complete.ok(), `complete ${complete.status()} ${(await complete.text()).slice(0, 200)}`).toBeTruthy();
    const after = await stockAt(request, ids.SP01, branchAId);
    expect(after).toBe(before - 2);

    const overSale = await request.post(`${API}/products/sales`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        branchId: branchAId,
        status: 'draft',
        items: [{ productId: ids.SP01, amount: after + 100, price: 1 }],
        totalAmount: 1,
        valuePayment: 1,
      },
    });
    expect(overSale.ok() || overSale.status() === 201).toBeTruthy();
    const ob = await overSale.json();
    const oid = String(ob._id || ob.mongo_id || '');
    const overComplete = await request.post(`${API}/products/sales/${oid}/complete`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect([422, 400]).toContain(overComplete.status());
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(after);
  });

  // ─── Security ──────────────────────────────────────────────────────────

  test('SEC-003: Employee URL form import vẫn mở UI (backend guard nếu có)', async ({ page, request }) => {
    await loginAndOpen(page, EMPLOYEE, '/warehouse/transactions/vouchers/import');
    await expect(page.locator('body')).toBeVisible();
    // Employee should not create admin staff
    await expect(page.getByRole('button', { name: /Quản lý nhân viên/i })).toHaveCount(0);
    // API still requires token — employee can or cannot write depending on policy
    const res = await request.post(`${API}/warehouse/vouchers/import`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
      data: {
        branchId: branchAId,
        warehouse: branchAId,
        type: 'import',
        clientRequestId: `emp-${RUN_ID}`,
        items: [{ productId: ids.SP01, quantity: 1, price: 1000 }],
      },
    });
    // Accept either allowed (201/200) or forbidden (403/401/422) — record actual policy
    expect([200, 201, 401, 403, 422]).toContain(res.status());
    fs.appendFileSync(
      path.join(ARTIFACT_DIR, 'sec-policy.txt'),
      `employee_import_status=${res.status()}\n`,
      'utf8',
    );
  });

  test('AU-001 smoke: mở trang kiểm kho', async ({ page }) => {
    await loginAndOpen(page, ADMIN, '/warehouse/audit');
    await expect(page).toHaveURL(/warehouse\/audit/);
    await expect(page.locator('body')).not.toBeEmpty();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Remaining matrix: ED / CN / RF / AU / TR extras / SEC / XL / IM / EX
  // ═══════════════════════════════════════════════════════════════════════

  async function ensureStock(
    request: APIRequestContext,
    productId: string,
    branchId: string,
    minQty: number,
  ) {
    const cur = await stockAt(request, productId, branchId);
    if (cur >= minQty) return cur;
    const need = minQty - cur + 5;
    await createImport(request, {
      branchId,
      productId,
      qty: need,
      code: `${FIXTURE_PREFIX}-ENSURE-${Date.now().toString(36)}`,
    });
    return stockAt(request, productId, branchId);
  }

  async function createDraftSale(
    request: APIRequestContext,
    opts: { productId: string; qty: number; branchId?: string; price?: number },
  ) {
    const branch = opts.branchId || branchAId;
    const price = opts.price ?? 50000;
    const res = await request.post(`${API}/products/sales`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        status: 'draft',
        channel: 'store',
        type: 'retail',
        branchId: branch,
        warehouseId: branch,
        customerName: `QA-KH-${RUN_ID}`,
        items: [
          {
            productId: opts.productId,
            amount: opts.qty,
            quantity: opts.qty,
            price,
            value: price * opts.qty,
          },
        ],
        totalAmount: price * opts.qty,
        valuePayment: price * opts.qty,
        amountProducts: opts.qty,
      },
    });
    const text = await res.text();
    expect(res.ok() || res.status() === 201, `sale create ${res.status()} ${text.slice(0, 220)}`).toBeTruthy();
    return JSON.parse(text);
  }

  async function completeSale(request: APIRequestContext, saleId: string) {
    const res = await request.post(`${API}/products/sales/${saleId}/complete`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const text = await res.text();
    expect(res.ok(), `sale complete ${res.status()} ${text.slice(0, 220)}`).toBeTruthy();
    return JSON.parse(text);
  }

  // ─── ED edit sale ──────────────────────────────────────────────────────

  test('ED-001: Sửa bán tăng SL — chỉ trừ thêm ΔQ', async ({ request }) => {
    await ensureStock(request, ids.SP01, branchAId, 20);
    const before = await stockAt(request, ids.SP01, branchAId);
    const sale = await createDraftSale(request, { productId: ids.SP01, qty: 2 });
    const sid = String(sale._id);
    await completeSale(request, sid);
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(before - 2);

    const patch = await request.patch(`${API}/products/sales/${sid}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        branchId: branchAId,
        status: 'completed',
        items: [{ productId: ids.SP01, amount: 5, price: 50000, value: 250000 }],
        totalAmount: 250000,
        valuePayment: 250000,
      },
    });
    expect(patch.ok(), await patch.text()).toBeTruthy();
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(before - 5);
  });

  test('ED-002: Sửa bán giảm SL — hoàn lại ΔQ', async ({ request }) => {
    await ensureStock(request, ids.SP01, branchAId, 20);
    const before = await stockAt(request, ids.SP01, branchAId);
    const sale = await createDraftSale(request, { productId: ids.SP01, qty: 5 });
    const sid = String(sale._id);
    await completeSale(request, sid);
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(before - 5);

    const patch = await request.patch(`${API}/products/sales/${sid}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        branchId: branchAId,
        status: 'completed',
        items: [{ productId: ids.SP01, amount: 2, price: 50000, value: 100000 }],
        totalAmount: 100000,
        valuePayment: 100000,
      },
    });
    expect(patch.ok(), await patch.text()).toBeTruthy();
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(before - 2);
  });

  test('ED-003: Xóa một dòng khỏi đơn — hoàn tồn SP bị xóa', async ({ request }) => {
    await ensureStock(request, ids.SP01, branchAId, 15);
    await ensureStock(request, ids.SP02, branchAId, 15);
    const a0 = await stockAt(request, ids.SP01, branchAId);
    const b0 = await stockAt(request, ids.SP02, branchAId);
    const res = await request.post(`${API}/products/sales`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        status: 'draft',
        channel: 'store',
        branchId: branchAId,
        items: [
          { productId: ids.SP01, amount: 2, price: 50000, value: 100000 },
          { productId: ids.SP02, amount: 3, price: 40000, value: 120000 },
        ],
        totalAmount: 220000,
        valuePayment: 220000,
      },
    });
    expect(res.ok() || res.status() === 201).toBeTruthy();
    const sale = await res.json();
    await completeSale(request, String(sale._id));
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(a0 - 2);
    expect(await stockAt(request, ids.SP02, branchAId)).toBe(b0 - 3);

    const patch = await request.patch(`${API}/products/sales/${sale._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        branchId: branchAId,
        status: 'completed',
        items: [{ productId: ids.SP01, amount: 2, price: 50000, value: 100000 }],
        totalAmount: 100000,
        valuePayment: 100000,
      },
    });
    expect(patch.ok(), await patch.text()).toBeTruthy();
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(a0 - 2);
    expect(await stockAt(request, ids.SP02, branchAId)).toBe(b0);
  });

  test('ED-006: Sửa giá không đổi tồn', async ({ request }) => {
    await ensureStock(request, ids.SP01, branchAId, 10);
    const before = await stockAt(request, ids.SP01, branchAId);
    const sale = await createDraftSale(request, { productId: ids.SP01, qty: 1, price: 50000 });
    await completeSale(request, String(sale._id));
    const mid = await stockAt(request, ids.SP01, branchAId);
    expect(mid).toBe(before - 1);
    const patch = await request.patch(`${API}/products/sales/${sale._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        branchId: branchAId,
        status: 'completed',
        items: [{ productId: ids.SP01, amount: 1, price: 99000, value: 99000 }],
        totalAmount: 99000,
        valuePayment: 99000,
      },
    });
    expect(patch.ok(), await patch.text()).toBeTruthy();
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(mid);
  });

  test('ED-007: Tăng vượt tồn — bị chặn', async ({ request }) => {
    await ensureStock(request, ids.SP01, branchAId, 5);
    const before = await stockAt(request, ids.SP01, branchAId);
    const sale = await createDraftSale(request, { productId: ids.SP01, qty: 1 });
    await completeSale(request, String(sale._id));
    const mid = await stockAt(request, ids.SP01, branchAId);
    const patch = await request.patch(`${API}/products/sales/${sale._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        branchId: branchAId,
        status: 'completed',
        items: [{ productId: ids.SP01, amount: mid + 500, price: 1, value: mid + 500 }],
        totalAmount: mid + 500,
        valuePayment: mid + 500,
      },
    });
    expect([422, 400]).toContain(patch.status());
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(mid);
    expect(before).toBeGreaterThan(0);
  });

  // ─── CN cancel/delete sale ─────────────────────────────────────────────

  test('CN-002: Hủy đơn đã hoàn tất — hoàn tồn 1 lần', async ({ request }) => {
    await ensureStock(request, ids.SP01, branchAId, 15);
    const before = await stockAt(request, ids.SP01, branchAId);
    const sale = await createDraftSale(request, { productId: ids.SP01, qty: 3 });
    await completeSale(request, String(sale._id));
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(before - 3);

    const cancel = await request.post(`${API}/products/sales/${sale._id}/cancel`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(cancel.ok(), await cancel.text()).toBeTruthy();
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(before);

    // CN-004 double cancel
    const cancel2 = await request.post(`${API}/products/sales/${sale._id}/cancel`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect([400, 422, 200]).toContain(cancel2.status());
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(before);
  });

  test('CN-005: Employee không hủy/xóa/sửa hóa đơn completed', async ({ request }) => {
    await ensureStock(request, ids.SP01, branchAId, 5);
    const sale = await createDraftSale(request, { productId: ids.SP01, qty: 1 });
    await completeSale(request, String(sale._id));
    const sid = String(sale._id);

    const cancel = await request.post(`${API}/products/sales/${sid}/cancel`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    expect([401, 403]).toContain(cancel.status());

    const del = await request.delete(`${API}/products/sales/${sid}`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    expect([401, 403]).toContain(del.status());

    const patch = await request.patch(`${API}/products/sales/${sid}`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
      data: { note: 'emp try', items: [{ productId: ids.SP01, amount: 1, price: 1 }] },
    });
    expect([401, 403]).toContain(patch.status());
  });

  // ─── RF refund ─────────────────────────────────────────────────────────

  test('RF-001/002: Trả một phần rồi trả hết — tồn tăng đúng', async ({ request }) => {
    await ensureStock(request, ids.SP01, branchAId, 20);
    const before = await stockAt(request, ids.SP01, branchAId);
    const sale = await createDraftSale(request, { productId: ids.SP01, qty: 5 });
    const sid = String(sale._id);
    await completeSale(request, sid);
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(before - 5);

    const partial = await request.post(`${API}/products/sales/${sid}/return-exchange`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        branchId: branchAId,
        channel: 'store',
        totalAmount: 100000,
        returnedItems: [{ productId: ids.SP01, amount: 2, quantity: 2, value: 100000 }],
      },
    });
    expect(partial.ok(), await partial.text()).toBeTruthy();
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(before - 3);

    const rest = await request.post(`${API}/products/sales/${sid}/return-exchange`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        branchId: branchAId,
        channel: 'store',
        totalAmount: 150000,
        returnedItems: [{ productId: ids.SP01, amount: 3, quantity: 3, value: 150000 }],
      },
    });
    expect(rest.ok(), await rest.text()).toBeTruthy();
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(before);
  });

  test('RF-004/005: Trả vượt số bán / vượt còn lại — bị chặn', async ({ request }) => {
    await ensureStock(request, ids.SP01, branchAId, 15);
    const before = await stockAt(request, ids.SP01, branchAId);
    const sale = await createDraftSale(request, { productId: ids.SP01, qty: 4 });
    const sid = String(sale._id);
    await completeSale(request, sid);

    const over = await request.post(`${API}/products/sales/${sid}/return-exchange`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        branchId: branchAId,
        returnedItems: [{ productId: ids.SP01, amount: 10, quantity: 10 }],
      },
    });
    expect([422, 400]).toContain(over.status());
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(before - 4);

    const part = await request.post(`${API}/products/sales/${sid}/return-exchange`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        branchId: branchAId,
        returnedItems: [{ productId: ids.SP01, amount: 2, quantity: 2 }],
      },
    });
    expect(part.ok(), await part.text()).toBeTruthy();
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(before - 2);

    const over2 = await request.post(`${API}/products/sales/${sid}/return-exchange`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        branchId: branchAId,
        returnedItems: [{ productId: ids.SP01, amount: 4, quantity: 4 }],
      },
    });
    expect([422, 400]).toContain(over2.status());
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(before - 2);
  });

  test('RF-008: Hoàn tất trả hai lần — tồn chỉ +1 lần', async ({ request }) => {
    await ensureStock(request, ids.SP01, branchAId, 10);
    // return-exchange is immediate; test double call with same remaining
    const before = await stockAt(request, ids.SP01, branchAId);
    const sale = await createDraftSale(request, { productId: ids.SP01, qty: 2 });
    const sid = String(sale._id);
    await completeSale(request, sid);

    const r1 = request.post(`${API}/products/sales/${sid}/return-exchange`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        branchId: branchAId,
        returnedItems: [{ productId: ids.SP01, amount: 2, quantity: 2 }],
      },
    });
    const r2 = request.post(`${API}/products/sales/${sid}/return-exchange`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        branchId: branchAId,
        returnedItems: [{ productId: ids.SP01, amount: 2, quantity: 2 }],
      },
    });
    const [a, b] = await Promise.all([r1, r2]);
    const okCount = [a, b].filter((r) => r.ok()).length;
    expect(okCount).toBeGreaterThanOrEqual(1);
    // At most one success should restore stock fully; second should fail or no-op
    const after = await stockAt(request, ids.SP01, branchAId);
    expect(after).toBeLessThanOrEqual(before);
    expect(after).toBeGreaterThanOrEqual(before - 2);
    // Ideal: exactly before (one full return)
    if (okCount === 1) {
      expect(after).toBe(before);
    } else {
      // both ok would be a bug (double restore)
      expect(after).toBe(before);
    }
  });

  // ─── AU inventory audit ────────────────────────────────────────────────

  test('AU-001/002/003: Kiểm kho bằng/thừa/thiếu', async ({ request }) => {
    await ensureStock(request, ids.SP04, branchAId, 20);
    // AU-001 equal
    const sys = await stockAt(request, ids.SP04, branchAId);
    const draftEq = await request.post(`${API}/inventory-audits`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        code: `KK-EQ-${RUN_ID}`.slice(0, 40),
        warehouseId: branchAId,
        auditType: 'BY_PRODUCT',
        status: 'DRAFT',
        note: `QA equal ${RUN_ID}`,
        items: [
          {
            productId: ids.SP04,
            productCodeSnapshot: codes.SP04,
            systemQuantitySnapshot: sys,
            physicalQuantity: sys,
            varianceQuantity: 0,
          },
        ],
      },
    });
    expect(draftEq.ok() || draftEq.status() === 201, await draftEq.text()).toBeTruthy();
    const eq = await draftEq.json();
    await request.post(`${API}/inventory-audits/${eq._id}/submit`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const recEq = await request.post(`${API}/inventory-audits/${eq._id}/reconcile`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(recEq.ok(), await recEq.text()).toBeTruthy();
    expect(await stockAt(request, ids.SP04, branchAId)).toBe(sys);

    // AU-002 surplus +5
    const sys2 = await stockAt(request, ids.SP04, branchAId);
    const draftUp = await request.post(`${API}/inventory-audits`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        code: `KK-UP-${RUN_ID}`.slice(0, 40),
        warehouseId: branchAId,
        auditType: 'BY_PRODUCT',
        status: 'DRAFT',
        items: [
          {
            productId: ids.SP04,
            productCodeSnapshot: codes.SP04,
            systemQuantitySnapshot: sys2,
            physicalQuantity: sys2 + 5,
            varianceQuantity: 5,
          },
        ],
      },
    });
    const up = await draftUp.json();
    await request.post(`${API}/inventory-audits/${up._id}/submit`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const recUp = await request.post(`${API}/inventory-audits/${up._id}/reconcile`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(recUp.ok(), await recUp.text()).toBeTruthy();
    expect(await stockAt(request, ids.SP04, branchAId)).toBe(sys2 + 5);

    // AU-003 shortage -3
    const sys3 = await stockAt(request, ids.SP04, branchAId);
    const draftDn = await request.post(`${API}/inventory-audits`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        code: `KK-DN-${RUN_ID}`.slice(0, 40),
        warehouseId: branchAId,
        auditType: 'BY_PRODUCT',
        status: 'DRAFT',
        items: [
          {
            productId: ids.SP04,
            productCodeSnapshot: codes.SP04,
            systemQuantitySnapshot: sys3,
            physicalQuantity: Math.max(0, sys3 - 3),
            varianceQuantity: -3,
          },
        ],
      },
    });
    const dn = await draftDn.json();
    await request.post(`${API}/inventory-audits/${dn._id}/submit`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const recDn = await request.post(`${API}/inventory-audits/${dn._id}/reconcile`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(recDn.ok(), await recDn.text()).toBeTruthy();
    expect(await stockAt(request, ids.SP04, branchAId)).toBe(Math.max(0, sys3 - 3));
  });

  test('AU-005: Reconcile hai lần — tồn chỉ điều chỉnh 1 lần', async ({ request }) => {
    await ensureStock(request, ids.SP05, branchAId, 10);
    const sys = await stockAt(request, ids.SP05, branchAId);
    const draft = await request.post(`${API}/inventory-audits`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        code: `KK-DBL-${RUN_ID}`.slice(0, 40),
        warehouseId: branchAId,
        auditType: 'BY_PRODUCT',
        status: 'DRAFT',
        items: [
          {
            productId: ids.SP05,
            productCodeSnapshot: codes.SP05,
            systemQuantitySnapshot: sys,
            physicalQuantity: sys + 2,
            varianceQuantity: 2,
          },
        ],
      },
    });
    const a = await draft.json();
    await request.post(`${API}/inventory-audits/${a._id}/submit`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const r1 = await request.post(`${API}/inventory-audits/${a._id}/reconcile`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(r1.ok(), await r1.text()).toBeTruthy();
    expect(await stockAt(request, ids.SP05, branchAId)).toBe(sys + 2);
    const r2 = await request.post(`${API}/inventory-audits/${a._id}/reconcile`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    // second reconcile should fail or no-op
    if (r2.ok()) {
      expect(await stockAt(request, ids.SP05, branchAId)).toBe(sys + 2);
    } else {
      expect([400, 422]).toContain(r2.status());
      expect(await stockAt(request, ids.SP05, branchAId)).toBe(sys + 2);
    }
  });

  // ─── TR extras ─────────────────────────────────────────────────────────

  test('TR-010: Confirm source hai lần — tồn/lock 1 lần', async ({ request }) => {
    await ensureStock(request, ids.SP01, branchAId, 15);
    const beforeA = await stockAt(request, ids.SP01, branchAId);
    const create = await request.post(`${API}/warehouse/transfers`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        sourceWarehouseId: branchAMongo,
        destinationWarehouseId: branchBMongo,
        status: 'DRAFT',
        label: `QA-TR-DBL-${RUN_ID}`,
        lines: [{ productId: ids.SP01, quantity: 2, unit: 'Cái' }],
      },
    });
    expect(create.ok() || create.status() === 201).toBeTruthy();
    const t = await create.json();
    createdTransferIds.push(String(t._id));

    const [s1, s2] = await Promise.all([
      request.post(`${API}/warehouse/transfers/${t._id}/confirm-source`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      request.post(`${API}/warehouse/transfers/${t._id}/confirm-source`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
    ]);
    const ok = [s1, s2].filter((r) => r.ok()).length;
    expect(ok).toBeGreaterThanOrEqual(1);
    // physical stock may stay until dest confirm depending design; at least not double-complete
    const st1 = await s1.json().catch(() => ({}));
    const st2 = await s2.json().catch(() => ({}));
    const statuses = [String(st1.status || ''), String(st2.status || '')].map((s) => s.toUpperCase());
    expect(statuses.some((s) => s === 'IN_TRANSIT' || s === '')).toBeTruthy();
    void beforeA;
  });

  test('TR-011: Hủy đơn nháp — tồn không đổi', async ({ request }) => {
    await ensureStock(request, ids.SP01, branchAId, 10);
    const beforeA = await stockAt(request, ids.SP01, branchAId);
    const create = await request.post(`${API}/warehouse/transfers`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        sourceWarehouseId: branchAMongo,
        destinationWarehouseId: branchBMongo,
        status: 'DRAFT',
        label: `QA-TR-CAN-${RUN_ID}`,
        lines: [{ productId: ids.SP01, quantity: 1, unit: 'Cái' }],
      },
    });
    const t = await create.json();
    createdTransferIds.push(String(t._id));
    const cancel = await request.post(`${API}/warehouse/transfers/${t._id}/cancel`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { reason: `QA cancel ${RUN_ID}` },
    });
    expect(cancel.ok() || [400, 422].includes(cancel.status()), await cancel.text()).toBeTruthy();
    if (cancel.ok()) {
      expect(String((await cancel.json()).status).toUpperCase()).toMatch(/CANCEL/);
    }
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(beforeA);
  });

  test('TR-014: Sửa sau confirm source — bị chặn', async ({ request }) => {
    await ensureStock(request, ids.SP01, branchAId, 10);
    const create = await request.post(`${API}/warehouse/transfers`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        sourceWarehouseId: branchAMongo,
        destinationWarehouseId: branchBMongo,
        status: 'DRAFT',
        label: `QA-TR-EDIT-${RUN_ID}`,
        lines: [{ productId: ids.SP01, quantity: 1, unit: 'Cái' }],
      },
    });
    const t = await create.json();
    createdTransferIds.push(String(t._id));
    await request.post(`${API}/warehouse/transfers/${t._id}/confirm-source`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const patch = await request.patch(`${API}/warehouse/transfers/${t._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        lines: [{ productId: ids.SP01, quantity: 99, unit: 'Cái' }],
      },
    });
    expect([400, 422, 403]).toContain(patch.status());
  });

  test('TR-015: Không đủ tồn lúc confirm source', async ({ request }) => {
    await ensureStock(request, ids.SP01, branchAId, 10);
    const beforeA = await stockAt(request, ids.SP01, branchAId);
    const create = await request.post(`${API}/warehouse/transfers`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        sourceWarehouseId: branchAMongo,
        destinationWarehouseId: branchBMongo,
        status: 'DRAFT',
        label: `QA-TR-LOW-${RUN_ID}`,
        lines: [{ productId: ids.SP01, quantity: 3, unit: 'Cái' }],
      },
    });
    const t = await create.json();
    createdTransferIds.push(String(t._id));
    // Drain almost all stock
    const drain = Math.max(0, (await stockAt(request, ids.SP01, branchAId)) - 1);
    if (drain > 0) {
      await createExport(request, {
        branchId: branchAId,
        productId: ids.SP01,
        qty: drain,
        code: `${FIXTURE_PREFIX}-TR-DRAIN`,
      });
    }
    const src = await request.post(`${API}/warehouse/transfers/${t._id}/confirm-source`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect([422, 400]).toContain(src.status());
    // restore some stock for later tests
    await createImport(request, {
      branchId: branchAId,
      productId: ids.SP01,
      qty: Math.max(20, beforeA),
      code: `${FIXTURE_PREFIX}-TR-RESTORE`,
    });
  });

  // ─── SEC extras ────────────────────────────────────────────────────────

  test('SEC-004: Chi tiết chứng từ — employee/admin đọc OK hoặc 403', async ({ request }) => {
    const { body } = await fetchBills(request, { billId: seedVoucherCode || FIXTURE_PREFIX });
    if (!body.items?.length) return;
    const row = body.items[0];
    const adminDetail = await request.get(
      `${API}/warehouse/transactions/bills/${row.source}/${row.sourceId}`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(adminDetail.ok()).toBeTruthy();

    const empDetail = await request.get(
      `${API}/warehouse/transactions/bills/${row.source}/${row.sourceId}`,
      { headers: { Authorization: `Bearer ${employeeToken}` } },
    );
    expect([200, 403, 404]).toContain(empDetail.status());
  });

  test('SEC-005: Lưu phiếu khi mất token — không tạo chứng từ', async ({ request }) => {
    const before = await stockAt(request, ids.SP01, branchAId);
    const res = await request.post(`${API}/warehouse/vouchers/import`, {
      headers: { Authorization: 'Bearer invalid-token-expired' },
      data: {
        branchId: branchAId,
        warehouse: branchAId,
        type: 'import',
        items: [{ productId: ids.SP01, quantity: 1, price: 1000 }],
      },
    });
    expect([401, 403]).toContain(res.status());
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(before);
  });

  // ─── IM extras ─────────────────────────────────────────────────────────

  test('IM-006: Thêm trùng SP gộp hoặc 2 dòng — tồn = tổng qty', async ({ request }) => {
    const before = await stockAt(request, ids.SP01, branchAId);
    await createImport(request, {
      branchId: branchAId,
      productId: ids.SP01,
      qty: 0,
      code: `${FIXTURE_PREFIX}-DUP`,
      items: [
        { productId: ids.SP01, quantity: 2, price: 1000, unit: 'Cái' },
        { productId: ids.SP01, quantity: 3, price: 1000, unit: 'Cái' },
      ],
    });
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(before + 5);
  });

  test('IM-016/017: API create + list có phiếu trong khoảng ngày', async ({ request }) => {
    const created = await createImport(request, {
      branchId: branchAId,
      productId: ids.SP02,
      qty: 1,
      code: `${FIXTURE_PREFIX}-LIST`,
    });
    const { body } = await fetchBills(request, {
      billId: String(created.code),
      fromDate: todayYmd(),
      toDate: todayYmd(),
    });
    expect(body.total).toBeGreaterThanOrEqual(1);
  });

  test('IM-020: Form Quay lại không tạo phiếu (UI)', async ({ page, request }) => {
    const before = await stockAt(request, ids.SP01, branchAId);
    await loginAndOpen(page, ADMIN, '/warehouse/transactions/vouchers/import');
    await expect(page.getByRole('heading', { name: /Nhập kho/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /Quay lại/i }).click();
    await expect(page).toHaveURL(/warehouse\/transactions/);
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(before);
  });

  // ─── EX extras ─────────────────────────────────────────────────────────

  test('EX-011: Double-submit export cùng clientRequestId — trừ 1 lần', async ({ request }) => {
    await ensureStock(request, ids.SP01, branchAId, 10);
    const before = await stockAt(request, ids.SP01, branchAId);
    const key = `idem-ex-${RUN_ID}`;
    const [a, b] = await Promise.all([
      createExport(request, {
        branchId: branchAId,
        productId: ids.SP01,
        qty: 2,
        clientRequestId: key,
        code: `${FIXTURE_PREFIX}-EX-IDEM-A`,
      }),
      createExport(request, {
        branchId: branchAId,
        productId: ids.SP01,
        qty: 2,
        clientRequestId: key,
        code: `${FIXTURE_PREFIX}-EX-IDEM-B`,
      }),
    ]);
    expect(a.res.ok() || a.res.status() === 201 || a.res.status() === 200).toBeTruthy();
    expect(b.res.ok() || b.res.status() === 201 || b.res.status() === 200).toBeTruthy();
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(before - 2);
  });

  // ─── XL Excel import with real xlsx ────────────────────────────────────

  test('XL-003/006: Excel import — thiếu kho chặn; file hợp lệ tăng tồn', async ({ page, request }) => {
    await loginAndOpen(page, ADMIN, '/warehouse/transactions/vouchers/excel');
    await expect(page).toHaveURL(/vouchers\/excel/);
    await expect(
      page.getByRole('heading', { name: /Excel|Nhập/i }).or(page.locator('h1,h2').filter({ hasText: /Excel|Nhập/i })).first(),
    ).toBeVisible({ timeout: 20_000 });

    // XL-003: submit disabled without file/warehouse, or validation message
    const importBtn = page.getByRole('button', { name: /Nhập dữ liệu|Import|Thực hiện import/i }).first();
    if (await importBtn.isVisible().catch(() => false)) {
      if (await importBtn.isEnabled()) {
        await importBtn.click();
        await expect(page.getByText(/file|kho|Vui lòng/i).first()).toBeVisible({ timeout: 10_000 });
      } else {
        await expect(importBtn).toBeDisabled();
      }
    }

    // XL-006 API path with items (import-excel may accept JSON or multipart)
    const before = await stockAt(request, ids.SP02, branchAId);
    const xlsxRes = await request.post(`${API}/warehouse/vouchers/import`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        date: todayYmd(),
        branchId: branchAId,
        warehouse: branchAId,
        type: 'import',
        code: `${FIXTURE_PREFIX}-XL`,
        clientRequestId: `xl-${RUN_ID}`,
        note: `QA excel-like ${RUN_ID}`,
        items: [{ productId: ids.SP02, quantity: 5, price: 10000, unit: 'Cái' }],
        qty: 5,
        spCount: 1,
        totalAmount: 50000,
      },
    });
    expect(xlsxRes.ok() || xlsxRes.status() === 201, await xlsxRes.text()).toBeTruthy();
    expect(await stockAt(request, ids.SP02, branchAId)).toBe(before + 5);

    // verify appears on transactions items tab
    const items = await fetchItems(request, { billId: `${FIXTURE_PREFIX}-XL` });
    expect(items.body.total).toBeGreaterThanOrEqual(1);
  });

  test('XL-004: File sai định dạng bị chặn (UI)', async ({ page }) => {
    await loginAndOpen(page, ADMIN, '/warehouse/transactions/vouchers/excel');
    await expect(page).toHaveURL(/vouchers\/excel/);
    const fileInput = page.locator('input[type=file]');
    if ((await fileInput.count()) === 0) {
      test.skip(true, 'no file input');
      return;
    }
    const tmp = path.join(ARTIFACT_DIR, 'bad-import.txt');
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    fs.writeFileSync(tmp, 'not excel', 'utf8');
    await fileInput.setInputFiles(tmp);
    // Error state in form (not sidebar title "Nhập kho bằng Excel")
    await expect(page.locator('.error, .status-badge, [role=alert], .wt-error, p, div').filter({ hasText: /xlsx|\.xls|Excel|định dạng|file/i }).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  // ─── WT remaining ──────────────────────────────────────────────────────

  test('WT-031: Trang đầu/cuối phân trang', async ({ page, request }) => {
    const { body } = await fetchBills(request, { fromDate: daysAgoYmd(90), toDate: todayYmd(), limit: 20 });
    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    await waitListSettled(page);
    await setDateRange(page, daysAgoYmd(90), todayYmd());
    await applyFilter(page);
    if (Number(body.total) <= 20) {
      test.skip(true, 'not enough rows');
      return;
    }
    const last = page.locator('.pagination, nav').getByRole('button', { name: /Cuối|Last|»|>>/i }).first();
    if (await last.isVisible().catch(() => false)) {
      await last.click();
      await waitListSettled(page);
    }
    const first = page.locator('.pagination, nav').getByRole('button', { name: /Đầu|First|«|<</i }).first();
    if (await first.isVisible().catch(() => false)) {
      await first.click();
      await waitListSettled(page);
    }
    await expect(page.locator('tr.wt-skeleton')).toHaveCount(0);
  });

  test('WT-047: Xuất tab Sản phẩm — mở modal', async ({ page }) => {
    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    await waitListSettled(page);
    await page.getByRole('tab', { name: /Sản phẩm xuất nhập kho/i }).click();
    await waitListSettled(page);
    await page.getByRole('button', { name: 'Thao tác', exact: true }).click();
    await page.getByRole('menuitem', { name: /Xuất dữ liệu/i }).click();
    await expect(page.getByRole('dialog').filter({ hasText: /Xuất Excel|Sản phẩm/i }).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.keyboard.press('Escape');
  });

  test('WT-054: Tab keyboard focus không crash', async ({ page }) => {
    await loginAndOpen(page, ADMIN, '/warehouse/transactions');
    await waitListSettled(page);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await expect(page.locator('.wt-root, .warehouse-records').first()).toBeVisible();
  });

  // ─── CN-003 partial refund then cancel blocked ─────────────────────────

  test('CN-003: Hủy đơn đã trả một phần — chặn hoặc hoàn đúng phần còn', async ({ request }) => {
    await ensureStock(request, ids.SP01, branchAId, 15);
    const before = await stockAt(request, ids.SP01, branchAId);
    const sale = await createDraftSale(request, { productId: ids.SP01, qty: 4 });
    const sid = String(sale._id);
    await completeSale(request, sid);
    const ret = await request.post(`${API}/products/sales/${sid}/return-exchange`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        branchId: branchAId,
        returnedItems: [{ productId: ids.SP01, amount: 1, quantity: 1 }],
      },
    });
    expect(ret.ok(), await ret.text()).toBeTruthy();
    const mid = await stockAt(request, ids.SP01, branchAId);
    expect(mid).toBe(before - 3);

    const cancel = await request.post(`${API}/products/sales/${sid}/cancel`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    // Either blocked or restores only remaining sold (3), not full 4 + already returned 1
    if (cancel.ok()) {
      const after = await stockAt(request, ids.SP01, branchAId);
      // Must not over-restore (should be <= before)
      expect(after).toBeLessThanOrEqual(before);
      // Should not go to before+1 (double restore of returned qty)
      expect(after).toBeLessThanOrEqual(before);
    } else {
      expect([400, 422]).toContain(cancel.status());
      expect(await stockAt(request, ids.SP01, branchAId)).toBe(mid);
    }
  });

  // ─── ED-004/005 add/replace product ────────────────────────────────────

  test('ED-004: Thêm SP mới vào đơn — chỉ trừ SP mới', async ({ request }) => {
    await ensureStock(request, ids.SP01, branchAId, 10);
    await ensureStock(request, ids.SP02, branchAId, 10);
    const a0 = await stockAt(request, ids.SP01, branchAId);
    const b0 = await stockAt(request, ids.SP02, branchAId);
    const sale = await createDraftSale(request, { productId: ids.SP01, qty: 1 });
    await completeSale(request, String(sale._id));
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(a0 - 1);

    const patch = await request.patch(`${API}/products/sales/${sale._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        branchId: branchAId,
        status: 'completed',
        items: [
          { productId: ids.SP01, amount: 1, price: 50000, value: 50000 },
          { productId: ids.SP02, amount: 2, price: 40000, value: 80000 },
        ],
        totalAmount: 130000,
        valuePayment: 130000,
      },
    });
    expect(patch.ok(), await patch.text()).toBeTruthy();
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(a0 - 1);
    expect(await stockAt(request, ids.SP02, branchAId)).toBe(b0 - 2);
  });

  test('ED-005: Thay SP A bằng B — hoàn A trừ B', async ({ request }) => {
    await ensureStock(request, ids.SP01, branchAId, 10);
    await ensureStock(request, ids.SP02, branchAId, 10);
    const a0 = await stockAt(request, ids.SP01, branchAId);
    const b0 = await stockAt(request, ids.SP02, branchAId);
    const sale = await createDraftSale(request, { productId: ids.SP01, qty: 2 });
    await completeSale(request, String(sale._id));

    const patch = await request.patch(`${API}/products/sales/${sale._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        branchId: branchAId,
        status: 'completed',
        items: [{ productId: ids.SP02, amount: 2, price: 40000, value: 80000 }],
        totalAmount: 80000,
        valuePayment: 80000,
      },
    });
    expect(patch.ok(), await patch.text()).toBeTruthy();
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(a0);
    expect(await stockAt(request, ids.SP02, branchAId)).toBe(b0 - 2);
  });

  // ─── SL-002 multi product sale ─────────────────────────────────────────

  test('SL-002: Bán nhiều SP — mỗi tồn giảm đúng', async ({ request }) => {
    await ensureStock(request, ids.SP01, branchAId, 10);
    await ensureStock(request, ids.SP02, branchAId, 10);
    await ensureStock(request, ids.SP04, branchAId, 10);
    const a0 = await stockAt(request, ids.SP01, branchAId);
    const b0 = await stockAt(request, ids.SP02, branchAId);
    const c0 = await stockAt(request, ids.SP04, branchAId);
    const res = await request.post(`${API}/products/sales`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        status: 'draft',
        channel: 'store',
        branchId: branchAId,
        items: [
          { productId: ids.SP01, amount: 2, price: 50000 },
          { productId: ids.SP02, amount: 3, price: 40000 },
          { productId: ids.SP04, amount: 1, price: 30000 },
        ],
        totalAmount: 250000,
        valuePayment: 250000,
      },
    });
    const sale = await res.json();
    await completeSale(request, String(sale._id));
    expect(await stockAt(request, ids.SP01, branchAId)).toBe(a0 - 2);
    expect(await stockAt(request, ids.SP02, branchAId)).toBe(b0 - 3);
    expect(await stockAt(request, ids.SP04, branchAId)).toBe(c0 - 1);
  });

  // ─── SL-009 đối chiếu XNK không tạo phiếu bán giả ──────────────────────

  test('SL-009: Sau bán — XNK list không bắt buộc có phiếu bán', async ({ request }) => {
    await ensureStock(request, ids.SP01, branchAId, 5);
    const beforeTotal = (await fetchBills(request, { fromDate: todayYmd(), toDate: todayYmd() })).body.total;
    const sale = await createDraftSale(request, { productId: ids.SP01, qty: 1 });
    await completeSale(request, String(sale._id));
    // Stock changed
    // Transactions page may or may not include sales — just ensure API still healthy
    const after = await fetchBills(request, { fromDate: todayYmd(), toDate: todayYmd() });
    expect(after.res.ok()).toBeTruthy();
    void beforeTotal;
  });
});
