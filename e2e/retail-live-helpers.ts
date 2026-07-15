import { expect, type APIRequestContext, type Page, type Locator } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const RUN_ID =
  process.env.E2E_RUN_ID ||
  `E2E-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${randomBytes(2).toString('hex')}`;

export const API = 'http://127.0.0.1:8000/api';
export const ADMIN = { email: 'admin@gmail.com', password: '123456' };
export const EMPLOYEE = { email: 'tiendo09711@gmail.com', password: '123456' };
export const FIXTURE_PREFIX = `QA-RTL-${RUN_ID}`;
export const RETAIL_PATH = '/sales-channels/store/retail';
export const REFUND_PATH = '/sales-channels/store/refund';
export const WHOLESALE_PATH = '/sales-channels/store/wholesale';

export const createdProductIds: string[] = [];
export const createdCustomerIds: string[] = [];
export const createdSaleIds: string[] = [];
export const createdRefundIds: string[] = [];
export const coveredRts = new Set<string>();
/** Persist marks across Playwright worker restarts after failures. */
const COVERAGE_FILE = path.join(process.cwd(), 'e2e', `.rt-coverage-${RUN_ID}.txt`);

let adminTokenValue = '';
let employeeTokenValue = '';
export let adminRole = '';
export let employeeRole = '';
export let adminName = '';

export function getAdminToken() {
  return adminTokenValue;
}
export function getEmployeeToken() {
  return employeeTokenValue;
}

export function markRts(...ids: string[]) {
  for (const id of ids) coveredRts.add(id);
  try {
    fs.appendFileSync(COVERAGE_FILE, `${ids.join('\n')}\n`, 'utf8');
  } catch {
    // ignore disk errors in CI-less local runs
  }
}

export function loadMarkedRtsFromDisk(): Set<string> {
  const set = new Set<string>(coveredRts);
  try {
    if (fs.existsSync(COVERAGE_FILE)) {
      fs.readFileSync(COVERAGE_FILE, 'utf8')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => /^RT-\d+$/.test(s))
        .forEach((s) => set.add(s));
    }
  } catch {
    // ignore
  }
  return set;
}

export function loadAllRtIds(): string[] {
  const file = path.join(process.cwd(), 'e2e', '_rt_index.txt');
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\uFEFF/, '').trim())
    .filter(Boolean)
    .map((line) => line.split('|')[0].trim())
    .filter((id) => /^RT-\d+$/.test(id));
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
  adminName = String(admin.user?.name || 'Admin');
}

export async function uiLogin(page: Page, creds: { email: string; password: string }) {
  const token = creds.email === EMPLOYEE.email ? employeeTokenValue : adminTokenValue;
  await page.addInitScript((authToken) => localStorage.setItem('token', authToken), token);
  // Also set on current document if already navigated.
  await page.evaluate((authToken) => localStorage.setItem('token', authToken), token).catch(() => {});
}

export async function waitRetailLoaded(page: Page) {
  await expect(page.getByText(/Hóa đơn bán lẻ/i).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  try {
    await expect(page.locator('.retail-skeleton')).toHaveCount(0, { timeout: 45_000 });
  } catch {
    const refresh = page.getByRole('button', { name: /Làm mới|Thử lại/i }).first();
    if (await refresh.count()) await refresh.click();
    await expect(page.locator('.retail-skeleton')).toHaveCount(0, { timeout: 45_000 });
  }
  // Prefer settled table (empty state or rows), not endless skeleton.
  await expect(
    page.locator('.retail-data-table tbody tr').or(page.getByText(/Không có hóa đơn phù hợp/i)),
  ).not.toHaveCount(0, { timeout: 15_000 }).catch(() => {});
}

export async function filterInvoice(page: Page, code: string) {
  await page.getByLabel(/ID hóa đơn/i).fill(code);
  await page.getByRole('button', { name: /^Lọc$/i }).click();
  await expect(page.locator('.retail-skeleton')).toHaveCount(0, { timeout: 30_000 });
}

export async function openRowMenu(page: Page, code: string) {
  const btn = page.getByRole('button', { name: `Thao tác hóa đơn ${code}`, exact: true });
  await expect(btn).toBeVisible({ timeout: 15_000 });
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await expect(page.locator('.retail-row-action-menu, [role="menu"]').first()).toBeVisible({ timeout: 10_000 });
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

export async function deleteProductApi(request: APIRequestContext, token: string, id: string) {
  return (
    await request.delete(`${API}/products/products/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).status();
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

export async function createCustomerApi(
  request: APIRequestContext,
  token: string,
  body: Record<string, unknown>,
): Promise<any> {
  const res = await request.post(`${API}/customers/customers`, {
    headers: { Authorization: `Bearer ${token}` },
    data: body,
  });
  const text = await res.text();
  expect(res.ok() || res.status() === 201, `create customer -> ${res.status()} ${text.slice(0, 200)}`).toBeTruthy();
  const customer = JSON.parse(text);
  if (customer?._id) createdCustomerIds.push(String(customer._id));
  return customer;
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

export async function patchSaleApi(
  request: APIRequestContext,
  token: string,
  saleId: string,
  body: Record<string, unknown>,
) {
  return request.patch(`${API}/products/sales/${saleId}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: body,
  });
}

export async function getSaleApi(request: APIRequestContext, token: string, saleId: string) {
  const res = await request.get(`${API}/products/sales/${saleId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status(), data: res.ok() ? await res.json() : null, text: res.ok() ? '' : await res.text() };
}

export async function returnExchangeApi(
  request: APIRequestContext,
  token: string,
  saleId: string,
  body: Record<string, unknown>,
) {
  return request.post(`${API}/products/sales/${saleId}/return-exchange`, {
    headers: { Authorization: `Bearer ${token}` },
    data: body,
  });
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

  for (const id of [...createdProductIds].reverse()) {
    await request
      .patch(`${API}/products/products/${id}`, {
        headers: { Authorization: `Bearer ${adminTokenValue}` },
        data: { initialStocks: [{ warehouseId: 1, quantity: 0 }] },
      })
      .catch(() => null);
    await deleteProductApi(request, adminTokenValue, id);
  }
  createdProductIds.length = 0;
}

export async function gotoCreate(page: Page, branchId: string) {
  await page.goto(`${RETAIL_PATH}/create?branchId=${branchId}`);
  await expect(page.getByText(/Thêm hóa đơn bán lẻ|Sửa hóa đơn bán lẻ/i).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Đang tải dữ liệu bán lẻ/i)).toHaveCount(0, { timeout: 30_000 });
}

export async function fillCustomer(page: Page, name: string, phone = '') {
  await page.getByPlaceholder(/Nhập họ tên hoặc số điện thoại/i).fill(name);
  if (phone) {
    const phoneInput = page.locator('label').filter({ hasText: /^Số điện thoại$/i }).locator('input');
    if (await phoneInput.count()) await phoneInput.fill(phone);
  }
}

export async function addProductByCode(page: Page, code: string, times = 1, matchText?: string) {
  const productSearch = page.getByPlaceholder(/Tìm theo mã, barcode hoặc tên sản phẩm/i);
  await expect(productSearch).toBeVisible({ timeout: 20_000 });
  const needle = matchText || code;
  for (let i = 0; i < times; i += 1) {
    await productSearch.click();
    await productSearch.fill('');
    await productSearch.type(code, { delay: 15 });
    // Wait for remote inventory search (200ms debounce + network).
    const option = page.locator('.product-results button, .create-dropdown.product-results button, .create-dropdown button').filter({ hasText: needle }).first();
    await expect(option, `product dropdown for ${code} (match ${needle})`).toBeVisible({ timeout: 30_000 });
    await option.click();
  }
}

export async function setLineQty(page: Page, code: string, qty: number) {
  await page.getByLabel(`Số lượng ${code}`).fill(String(qty));
}

export async function setLinePrice(page: Page, code: string, price: number) {
  await page.getByLabel(`Đơn giá ${code}`).fill(String(price));
}

export async function saveInvoice(page: Page) {
  await page.getByRole('button', { name: /Lưu hóa đơn/i }).first().click();
}

export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function noBodyHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth <= doc.clientWidth + 2;
  });
}

export function invoiceRow(page: Page, code: string): Locator {
  return page.locator('.retail-data-table tbody tr').filter({ hasText: code }).first();
}
