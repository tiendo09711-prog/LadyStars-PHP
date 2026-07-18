import { expect, type APIRequestContext, type Page, type Locator } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const RUN_ID =
  process.env.E2E_RUN_ID ||
  `CUS-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${randomBytes(2).toString('hex')}`;

export const API = 'http://127.0.0.1:8000/api';
export const ADMIN = { email: 'admin@gmail.com', password: '123456' };
export const EMPLOYEE = { email: 'tiendo09711@gmail.com', password: '123456' };
export const FIXTURE_PREFIX = `QA-CUS-${RUN_ID}`;
export const LIST_PATH = '/customers/list';
export const RETAIL_PATH = '/sales-channels/store/retail';
export const WHOLESALE_PATH = '/sales-channels/store/wholesale';
export const REFUND_PATH = '/sales-channels/store/refund';

export const createdProductIds: string[] = [];
export const createdCustomerIds: string[] = [];
export const createdSaleIds: string[] = [];
export const createdGroupIds: string[] = [];
export const coveredCus = new Set<string>();

const COVERAGE_FILE = path.join(process.cwd(), 'e2e', `.cus-coverage-${RUN_ID}.txt`);
const ARTIFACTS_DIR = path.join(process.cwd(), 'e2e-artifacts', 'customers-list-live', RUN_ID);

let adminTokenValue = '';
let employeeTokenValue = '';
export let adminRole = '';
export let employeeRole = '';

export function getAdminToken() {
  return adminTokenValue;
}
export function getEmployeeToken() {
  return employeeTokenValue;
}

export function ensureArtifactsDir() {
  fs.mkdirSync(path.join(ARTIFACTS_DIR, 'screenshots'), { recursive: true });
  fs.mkdirSync(path.join(ARTIFACTS_DIR, 'downloads'), { recursive: true });
  return ARTIFACTS_DIR;
}

export function artifactsDir() {
  return ARTIFACTS_DIR;
}

export function markCus(...ids: string[]) {
  for (const id of ids) coveredCus.add(id);
  try {
    fs.appendFileSync(COVERAGE_FILE, `${ids.join('\n')}\n`, 'utf8');
  } catch {
    // ignore
  }
}

export function loadMarkedCusFromDisk(): Set<string> {
  const set = new Set<string>(coveredCus);
  try {
    if (fs.existsSync(COVERAGE_FILE)) {
      fs.readFileSync(COVERAGE_FILE, 'utf8')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((s) => set.add(s));
    }
  } catch {
    // ignore
  }
  return set;
}

export function loadAllCusIds(): string[] {
  const file = path.join(process.cwd(), 'e2e', '_cus_index.txt');
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\uFEFF/, '').trim())
    .filter(Boolean);
}

export async function apiLogin(
  request: APIRequestContext,
  creds: { email: string; password: string },
): Promise<{ token: string; user: any }> {
  const res = await request.post(`${API}/auth/login`, { data: creds });
  expect(res.ok(), `login ${creds.email}`).toBeTruthy();
  return res.json();
}

export async function setTokens(admin: { token: string; user: any }, emp: { token: string; user: any }) {
  adminTokenValue = admin.token;
  employeeTokenValue = emp.token;
  adminRole = String(admin.user?.role || '').toUpperCase();
  employeeRole = String(emp.user?.role || '').toUpperCase();
}

export async function uiLogin(page: Page, creds: { email: string; password: string }) {
  const token = creds.email === EMPLOYEE.email ? employeeTokenValue : adminTokenValue;
  if (page.isClosed()) {
    throw new Error('uiLogin: page is already closed');
  }
  try {
    await page.addInitScript((authToken) => localStorage.setItem('token', authToken), token);
  } catch {
    // page/context may already have init scripts; fall back to evaluate only
  }
  await page.evaluate((authToken) => localStorage.setItem('token', authToken), token).catch(() => {});
}

export async function uiLogout(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('authUser');
  }).catch(() => {});
}

export async function waitCustomersLoaded(page: Page) {
  const root = page.getByTestId('customers-list-page');
  await expect(root).toBeVisible({ timeout: 30_000 });
  // Compact heading is sr-only; use summary strip / table title which are visible.
  await expect(root.locator('.customer-list-summary-strip, .customer-list-table-title').first()).toBeVisible({
    timeout: 30_000,
  });
  // Wait skeleton gone — if stuck, click Thử lại once (handles flaky/mock routes).
  try {
    await expect(page.locator('.customer-skeleton-row')).toHaveCount(0, { timeout: 45_000 });
  } catch {
    const retry = page.getByRole('button', { name: /Thử lại|Làm mới/i }).first();
    if (await retry.count()) await retry.click().catch(() => {});
    await expect(page.locator('.customer-skeleton-row')).toHaveCount(0, { timeout: 45_000 });
  }
  await page.waitForLoadState('domcontentloaded').catch(() => {});
}

export async function gotoCustomersList(page: Page, query = '') {
  const url = query ? `${LIST_PATH}${query.startsWith('?') ? query : `?${query}`}` : LIST_PATH;
  await page.goto(url);
  await waitCustomersLoaded(page);
}

export async function getListTotal(page: Page): Promise<number> {
  // Prefer summary strip strong number (e.g. "1.667 khách hàng")
  const main = page.locator('.customer-list-summary-main strong').first();
  if (await main.count()) {
    const raw = (await main.innerText()).replace(/[.\s,]/g, '');
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  const text = await page.locator('.customer-list-table-subtitle, .customer-list-summary-strip').first().innerText().catch(() => '');
  const normalized = text.replace(/\./g, '').replace(/,/g, '');
  const m = normalized.match(/(\d+)\s*(bản ghi|khách)/i);
  if (m) return Number(m[1]);
  return 0;
}

export async function applyKeyword(page: Page, keyword: string, submit: 'filter' | 'enter' | 'none' = 'filter') {
  const input = page.getByTestId('customers-keyword-filter');
  await input.fill(keyword);
  if (submit === 'filter') {
    await page.getByRole('button', { name: /^Lọc$/i }).click();
  } else if (submit === 'enter') {
    await input.press('Enter');
  }
  if (submit !== 'none') {
    await expect(page.locator('.customer-skeleton-row')).toHaveCount(0, { timeout: 30_000 });
  }
}

export async function clearFilters(page: Page) {
  const clearAll = page.getByRole('button', { name: /Xóa tất cả|Xóa lọc/i }).first();
  if (await clearAll.count()) {
    await clearAll.click();
    await expect(page.locator('.customer-skeleton-row')).toHaveCount(0, { timeout: 30_000 });
    return;
  }
  await applyKeyword(page, '', 'filter');
}

export async function openAdvanced(page: Page) {
  await page.getByTestId('customers-advanced-toggle').click();
  await expect(page.getByTestId('customers-advanced-panel')).toBeVisible({ timeout: 10_000 });
}

export async function applyAdvanced(page: Page) {
  await page.getByRole('button', { name: /Áp dụng/i }).click();
  await expect(page.getByTestId('customers-advanced-panel')).toHaveCount(0, { timeout: 10_000 }).catch(() => {});
  await expect(page.locator('.customer-skeleton-row')).toHaveCount(0, { timeout: 30_000 });
}

export function customerRows(page: Page): Locator {
  return page.locator('table.customer-list-data-table tbody tr').filter({ hasNot: page.locator('.customer-skeleton-row') });
}

export function customerRowByText(page: Page, text: string): Locator {
  return customerRows(page).filter({ hasText: text }).first();
}

export async function openRowMenu(page: Page, nameOrCode: string) {
  const row = customerRowByText(page, nameOrCode);
  await expect(row).toBeVisible({ timeout: 15_000 });
  const btn = row.getByRole('button', { name: /Thao tác khách hàng/i });
  await btn.scrollIntoViewIfNeeded();
  await btn.click({ force: true });
  const menu = page.locator('.customer-list-row-action-menu--portal').first();
  try {
    await expect(menu).toBeVisible({ timeout: 5_000 });
  } catch {
    // retry once — first click may toggle closed if already open
    await btn.click({ force: true });
    await expect(menu).toBeVisible({ timeout: 10_000 });
  }
}

export async function closeCustomerModal(page: Page) {
  if (!(await page.getByRole('dialog').count())) return;
  const closeBtn = page.getByRole('dialog').locator('button[aria-label="Đóng"]').first();
  if (await closeBtn.count()) {
    await closeBtn.click({ force: true }).catch(() => {});
  }
  if (await page.getByRole('dialog').count()) {
    await page.locator('.modal-backdrop').click({ position: { x: 2, y: 2 }, force: true }).catch(() => {});
  }
  // Last resort: hard reload list (keeps auth via initScript)
  if (await page.getByRole('dialog').count()) {
    await page.goto(LIST_PATH);
    await waitCustomersLoaded(page);
  }
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 });
}

export async function openCreateModal(page: Page) {
  if (await page.getByRole('dialog').count()) {
    await closeCustomerModal(page);
  }
  await page.getByTestId('add-customer-button').click();
  await expect(page.getByRole('dialog').getByText(/Thêm khách hàng|Cập nhật khách hàng/i)).toBeVisible({
    timeout: 10_000,
  });
}

export async function fillCustomerForm(
  page: Page,
  data: {
    name?: string;
    code?: string;
    type?: 'person' | 'company';
    phone?: string;
    phone2?: string;
    email?: string;
    cardId?: string;
    customerLevel?: string;
    birthday?: string;
    address?: string;
    addressLocation?: string;
    note?: string;
    branchId?: string;
  },
) {
  const dialog = page.getByRole('dialog');
  if (data.name !== undefined) {
    await dialog.locator('label').filter({ hasText: /^Tên/i }).locator('input').fill(data.name);
  }
  if (data.code !== undefined) {
    await dialog.locator('input[placeholder*="Tự sinh"]').fill(data.code);
  }
  if (data.type) {
    const typeSelect = dialog.locator('label').filter({ hasText: /Loại/i }).locator('select');
    if (await typeSelect.count()) {
      await typeSelect.selectOption(data.type === 'company' ? 'company' : 'person');
    }
  }
  if (data.phone !== undefined) {
    const phone = dialog.locator('label').filter({ hasText: /^Số điện thoại$/i }).locator('input').first();
    if (await phone.count()) await phone.fill(data.phone);
    else await dialog.locator('input').nth(2).fill(data.phone);
  }
  if (data.phone2 !== undefined) {
    const phone2 = dialog.locator('label').filter({ hasText: /Số điện thoại 2|SĐT 2/i }).locator('input');
    if (await phone2.count()) await phone2.fill(data.phone2);
  }
  if (data.email !== undefined) {
    const email = dialog.locator('label').filter({ hasText: /Email/i }).locator('input');
    if (await email.count()) await email.fill(data.email);
  }
  if (data.cardId !== undefined) {
    const card = dialog.locator('label').filter({ hasText: /Mã thẻ/i }).locator('input');
    if (await card.count()) await card.fill(data.cardId);
  }
  if (data.customerLevel !== undefined) {
    const level = dialog.locator('label').filter({ hasText: /Cấp độ/i }).locator('input, select').first();
    if (await level.count()) await level.fill(data.customerLevel);
  }
  if (data.birthday !== undefined) {
    const bday = dialog.locator('label').filter({ hasText: /Sinh nhật|Ngày sinh/i }).locator('input');
    if (await bday.count()) await bday.fill(data.birthday);
  }
  if (data.address !== undefined) {
    const addr = dialog.locator('label').filter({ hasText: /^Địa chỉ$/i }).locator('input, textarea').first();
    if (await addr.count()) await addr.fill(data.address);
  }
  if (data.addressLocation !== undefined) {
    const loc = dialog.locator('label').filter({ hasText: /Khu vực/i }).locator('input, textarea').first();
    if (await loc.count()) await loc.fill(data.addressLocation);
  }
  if (data.note !== undefined) {
    const note = dialog.locator('label').filter({ hasText: /Ghi chú/i }).locator('input, textarea').first();
    if (await note.count()) await note.fill(data.note);
  }
  if (data.branchId !== undefined) {
    const branch = dialog.locator('label').filter({ hasText: /Chi nhánh/i }).locator('select');
    if (await branch.count()) await branch.selectOption(String(data.branchId));
  }
}

export async function saveCustomerForm(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: /Lưu khách hàng/i }).click();
}

export async function screenshot(page: Page, name: string) {
  ensureArtifactsDir();
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshots', `${name}.png`), fullPage: true }).catch(() => {});
}

export async function createCustomerApi(
  request: APIRequestContext,
  token: string,
  body: Record<string, unknown>,
): Promise<any> {
  let payload = { ...body };
  let res = await request.post(`${API}/customers/customers`, {
    headers: { Authorization: `Bearer ${token}` },
    data: payload,
  });
  // Retry once with a fresh code on unique conflict (leftover fixtures / races)
  if (res.status() === 409 || res.status() === 422) {
    payload = { ...payload, code: uniqueCode('RT') };
    res = await request.post(`${API}/customers/customers`, {
      headers: { Authorization: `Bearer ${token}` },
      data: payload,
    });
  }
  const text = await res.text();
  expect(res.ok() || res.status() === 201, `create customer -> ${res.status()} ${text.slice(0, 200)}`).toBeTruthy();
  const customer = JSON.parse(text);
  if (customer?._id) createdCustomerIds.push(String(customer._id));
  return customer;
}

export async function patchCustomerApi(
  request: APIRequestContext,
  token: string,
  id: string,
  body: Record<string, unknown>,
) {
  return request.patch(`${API}/customers/customers/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: body,
  });
}

export async function deleteCustomerApi(request: APIRequestContext, token: string, id: string) {
  return request.delete(`${API}/customers/customers/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getCustomerApi(request: APIRequestContext, token: string, id: string) {
  const res = await request.get(`${API}/customers/customers/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status(), data: res.ok() ? await res.json() : null };
}

export async function listCustomersApi(
  request: APIRequestContext,
  token: string,
  params: Record<string, string | number> = {},
) {
  const res = await request.get(`${API}/customers/customers`, {
    headers: { Authorization: `Bearer ${token}` },
    params,
  });
  expect(res.ok(), `list customers -> ${res.status()}`).toBeTruthy();
  return res.json();
}

export async function createGroupApi(
  request: APIRequestContext,
  token: string,
  body: Record<string, unknown>,
): Promise<any> {
  const res = await request.post(`${API}/customers/groups`, {
    headers: { Authorization: `Bearer ${token}` },
    data: body,
  });
  const text = await res.text();
  expect(res.ok() || res.status() === 201, `create group -> ${res.status()} ${text.slice(0, 200)}`).toBeTruthy();
  const group = JSON.parse(text);
  const id = String(group?._id || group?.id || '');
  if (id) createdGroupIds.push(id);
  return group;
}

export async function deleteGroupApi(request: APIRequestContext, token: string, id: string) {
  return request.delete(`${API}/customers/groups/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function createProductApi(
  request: APIRequestContext,
  token: string,
  body: Record<string, unknown>,
): Promise<any> {
  const res = await request.post(`${API}/products/products`, {
    headers: { Authorization: `Bearer ${token}` },
    data: body,
  });
  const text = await res.text();
  expect(res.ok() || res.status() === 201, `create product ${body.code} -> ${res.status()} ${text.slice(0, 240)}`).toBeTruthy();
  const product = JSON.parse(text);
  if (product?._id) createdProductIds.push(String(product._id));
  return product;
}

export async function ensureBranchStock(
  request: APIRequestContext,
  token: string,
  productId: string,
  branchId: string,
  quantity: number,
  extraBranches: Array<{ branchId: string; quantity: number }> = [],
) {
  const stocks = [
    { warehouseId: Number(branchId) || branchId, quantity },
    ...extraBranches.map((b) => ({
      warehouseId: Number(b.branchId) || b.branchId,
      quantity: b.quantity,
    })),
  ];
  const res = await request.patch(`${API}/products/products/${productId}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { initialStocks: stocks },
  });
  expect(res.ok(), `ensure stock ${productId} -> ${res.status()} ${await res.text()}`).toBeTruthy();
}

export async function getStock(
  request: APIRequestContext,
  token: string,
  productId: string,
  branchId: string,
): Promise<number> {
  const res = await request.get(`${API}/products/inventories`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { branchId, limit: 5000 },
  });
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  const items = data.items || data.data || [];
  const row = items.find((p: any) => String(p._id) === String(productId) || String(p.id) === String(productId));
  if (!row) return 0;
  const byBranch = row.stockByBranchId?.[String(branchId)] ?? row.stockByBranchId?.[Number(branchId)];
  if (byBranch !== undefined && byBranch !== null) return Number(byBranch) || 0;
  return Number(row.selectedStock ?? row.qty ?? 0);
}

export async function createSaleDraftApi(
  request: APIRequestContext,
  token: string,
  body: Record<string, unknown>,
): Promise<any> {
  const res = await request.post(`${API}/products/sales`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { status: 'draft', channel: 'store', type: 'retail', ...body },
  });
  const text = await res.text();
  expect(res.ok() || res.status() === 201, `create sale draft -> ${res.status()} ${text.slice(0, 240)}`).toBeTruthy();
  const sale = JSON.parse(text);
  if (sale?._id) createdSaleIds.push(String(sale._id));
  return sale;
}

export async function completeSaleApi(request: APIRequestContext, token: string, saleId: string) {
  return request.post(`${API}/products/sales/${saleId}/complete`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function createCompletedSaleApi(
  request: APIRequestContext,
  token: string,
  body: Record<string, unknown>,
): Promise<any> {
  const sale = await createSaleDraftApi(request, token, body);
  const completeRes = await completeSaleApi(request, token, String(sale._id));
  const completeText = await completeRes.text();
  expect(completeRes.ok(), `complete ${sale._id} -> ${completeRes.status()} ${completeText.slice(0, 240)}`).toBeTruthy();
  return JSON.parse(completeText);
}

export async function cancelSaleApi(request: APIRequestContext, token: string, saleId: string) {
  return request.post(`${API}/products/sales/${saleId}/cancel`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function deleteSaleApi(request: APIRequestContext, token: string, saleId: string) {
  return request.delete(`${API}/products/sales/${saleId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getSaleApi(request: APIRequestContext, token: string, saleId: string) {
  const res = await request.get(`${API}/products/sales/${saleId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status(), data: res.ok() ? await res.json() : null, text: res.ok() ? '' : await res.text() };
}

export async function cleanupFixtures(request: APIRequestContext) {
  for (const id of [...createdSaleIds].reverse()) {
    const got = await getSaleApi(request, adminTokenValue, id);
    if (!got.data) continue;
    const status = String(got.data.status || '').toLowerCase();
    if (status === 'completed') {
      await cancelSaleApi(request, adminTokenValue, id);
    }
    await deleteSaleApi(request, adminTokenValue, id);
  }
  createdSaleIds.length = 0;

  for (const id of [...createdCustomerIds].reverse()) {
    await request
      .delete(`${API}/customers/customers/${id}`, {
        headers: { Authorization: `Bearer ${adminTokenValue}` },
      })
      .catch(() => null);
  }
  createdCustomerIds.length = 0;

  for (const id of [...createdGroupIds].reverse()) {
    await deleteGroupApi(request, adminTokenValue, id).catch(() => null);
  }
  createdGroupIds.length = 0;

  for (const id of [...createdProductIds].reverse()) {
    await request
      .patch(`${API}/products/products/${id}`, {
        headers: { Authorization: `Bearer ${adminTokenValue}` },
        data: { initialStocks: [{ warehouseId: 1, quantity: 0 }] },
      })
      .catch(() => null);
    await request
      .delete(`${API}/products/products/${id}`, {
        headers: { Authorization: `Bearer ${adminTokenValue}` },
      })
      .catch(() => null);
  }
  createdProductIds.length = 0;
}

export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function monthDay(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${m}-${day}`;
}

export async function noBodyHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth <= doc.clientWidth + 2;
  });
}

export function uniquePhone(suffix = '') {
  const n = `${Date.now()}`.slice(-8);
  return `09${n.slice(0, 8)}${suffix}`.slice(0, 11);
}

export function uniqueCode(prefix = 'KH') {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`.slice(0, 40);
}
