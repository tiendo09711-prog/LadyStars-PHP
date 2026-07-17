/**
 * Wholesale live E2E helpers — extends retail-live-helpers for WS matrix.
 * Fixture prefix is isolated per E2E_RUN_ID; cleanup only touches tracked IDs.
 */
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ADMIN,
  API,
  EMPLOYEE,
  REFUND_PATH,
  RETAIL_PATH,
  RUN_ID,
  WHOLESALE_PATH,
  apiLogin,
  cancelSaleApi,
  cleanupFixtures,
  completeSaleApi,
  createCustomerApi,
  createProductApi,
  createSaleDraftApi,
  createdCustomerIds,
  createdProductIds,
  createdSaleIds,
  deleteSaleApi,
  ensureBranchStock,
  getAdminToken,
  getEmployeeToken,
  getSaleApi,
  getStock,
  noBodyHorizontalOverflow,
  returnExchangeApi,
  setTokens,
  todayISO,
  uiLogin,
} from './retail-live-helpers';

export {
  ADMIN,
  API,
  EMPLOYEE,
  REFUND_PATH,
  RETAIL_PATH,
  RUN_ID,
  WHOLESALE_PATH,
  apiLogin,
  cancelSaleApi,
  cleanupFixtures,
  completeSaleApi,
  createCustomerApi,
  createProductApi,
  createSaleDraftApi,
  createdCustomerIds,
  createdProductIds,
  createdSaleIds,
  deleteSaleApi,
  ensureBranchStock,
  getAdminToken,
  getEmployeeToken,
  getSaleApi,
  getStock,
  noBodyHorizontalOverflow,
  returnExchangeApi,
  setTokens,
  todayISO,
  uiLogin,
};

export const FIXTURE_PREFIX = `QA-WS-${RUN_ID}`;
export const coveredWs = new Set<string>();
const COVERAGE_FILE = path.join(process.cwd(), 'e2e', `.ws-coverage-${RUN_ID}.txt`);

export function markWs(...ids: string[]) {
  for (const id of ids) coveredWs.add(id);
  try {
    fs.appendFileSync(COVERAGE_FILE, `${ids.join('\n')}\n`, 'utf8');
  } catch {
    // ignore
  }
}

export function loadMarkedWsFromDisk(): Set<string> {
  const set = new Set<string>(coveredWs);
  try {
    if (fs.existsSync(COVERAGE_FILE)) {
      fs.readFileSync(COVERAGE_FILE, 'utf8')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => /^WS-[A-Z0-9-]+$/.test(s))
        .forEach((s) => set.add(s));
    }
  } catch {
    // ignore
  }
  return set;
}

export function loadAllWsIds(): string[] {
  const file = path.join(process.cwd(), 'e2e', '_ws_index.txt');
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\uFEFF/, '').trim())
    .filter((id) => /^WS-[A-Z0-9-]+$/.test(id));
}

export async function waitWholesaleLoaded(page: Page) {
  await expect(page.locator('.ws-invoice-page').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  try {
    await expect(page.locator('.ws-skeleton')).toHaveCount(0, { timeout: 45_000 });
  } catch {
    const refresh = page.getByRole('button', { name: /Làm mới|Thử lại/i }).first();
    if (await refresh.count()) await refresh.click();
    await expect(page.locator('.ws-skeleton')).toHaveCount(0, { timeout: 45_000 });
  }
  // Settled when table rows exist or empty/error state is shown.
  await expect
    .poll(
      async () => {
        const rows = await page.locator('.ws-data-table tbody tr').count();
        const empty = await page.locator('.ws-empty-state').count();
        const alert = await page.locator('.ws-alert, [role="alert"]').count();
        return rows + empty + alert > 0;
      },
      { timeout: 20_000 },
    )
    .toBeTruthy()
    .catch(() => {});
}

export async function filterWsInvoice(page: Page, code: string) {
  const codeInput = page.locator('.ws-filter-bar input[aria-label="Mã hóa đơn"], .ws-search input').first();
  await expect(codeInput).toBeVisible({ timeout: 15_000 });
  await codeInput.fill(code);
  const filterBtn = page.locator('.ws-filter-bar button[type="submit"], button.ws-btn-primary').filter({ hasText: /Lọc/i }).first();
  await expect(filterBtn).toBeVisible({ timeout: 10_000 });
  await filterBtn.click();
  await expect(page.locator('.ws-skeleton')).toHaveCount(0, { timeout: 30_000 });
}

export async function openWsRowMenu(page: Page, code: string) {
  const btn = page.getByRole('button', { name: `Thao tác hóa đơn ${code}`, exact: true });
  await expect(btn).toBeVisible({ timeout: 15_000 });
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await expect(page.locator('.ws-row-action-menu, [role="menu"]').first()).toBeVisible({ timeout: 10_000 });
}

export function wsInvoiceRow(page: Page, code: string): Locator {
  return page.locator('.ws-data-table tbody tr').filter({ hasText: code }).first();
}

export async function gotoWholesaleCreate(page: Page, branchId: string) {
  const invWait = page
    .waitForResponse((r) => r.url().includes('/products/inventories') && r.ok(), { timeout: 45_000 })
    .catch(() => null);
  await page.goto(`${WHOLESALE_PATH}/create?branchId=${branchId}`);
  await expect(page.locator('.wholesale-create-page, #product-search-input').first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('#product-search-input')).toBeVisible({ timeout: 20_000 });
  await invWait;
  // small settle for client filter list
  await page.waitForTimeout(400);
}

export async function fillWsCustomer(page: Page, name: string, phone = '') {
  if (phone) {
    await page.locator('#customer-phone-input').fill(phone);
  }
  await page.getByPlaceholder(/Tên khách đại lý|Tên khách/i).fill(name);
}

export async function addWsProductByCode(page: Page, code: string, times = 1, matchText?: string) {
  const productSearch = page.locator('#product-search-input');
  await expect(productSearch).toBeVisible({ timeout: 20_000 });
  const needle = matchText || code;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (let i = 0; i < times; i += 1) {
    await productSearch.click();
    await productSearch.fill('');
    await productSearch.type(code, { delay: 20 });
    // Wholesale create autocomplete rows: "Mã: {code} | Tồn: n | Giá: ..."
    // Prefer the clickable row (has onMouseDown=addProduct), not a nested text div.
    const option = page
      .locator('.ws-create-product-search')
      .locator('div')
      .filter({ hasText: new RegExp(`Mã:\\s*${escaped}`) })
      .filter({ hasText: /Tồn:/i })
      .first();
    await expect(option, `product option for ${code}`).toBeVisible({ timeout: 30_000 });
    // React handler is onMouseDown; dispatch explicitly for reliability.
    await option.dispatchEvent('mousedown');
    await option.click({ force: true }).catch(() => {});
    await expect(
      page.locator('.ws-create-table-wrap table tbody tr, .wholesale-create-page table tbody tr').filter({ hasText: code }),
    ).toBeVisible({ timeout: 15_000 });
  }
}

function productLineRow(page: Page, code: string): Locator {
  return page
    .locator('.ws-create-table-wrap table tbody tr, .wholesale-create-page table tbody tr')
    .filter({ hasText: code })
    .first();
}

/** Set qty on the first product row that contains product code text. */
export async function setWsLineQty(page: Page, code: string, qty: number) {
  const row = productLineRow(page, code);
  await expect(row).toBeVisible({ timeout: 15_000 });
  const qtyInput = row.locator('input[type="number"]').first();
  await qtyInput.fill(String(qty));
  await qtyInput.blur();
}

export async function setWsLinePrice(page: Page, code: string, price: number) {
  const row = productLineRow(page, code);
  await expect(row).toBeVisible({ timeout: 15_000 });
  const priceInput = row.locator('input[type="number"]').nth(1);
  await priceInput.fill(String(price));
  await priceInput.blur();
}

export async function setWsLineDiscount(page: Page, code: string, value: number, asPercent = false) {
  const row = productLineRow(page, code);
  await expect(row).toBeVisible({ timeout: 15_000 });
  const discountInput = row.locator('input[type="number"]').nth(2);
  await discountInput.fill(String(value));
  if (asPercent) {
    const toggle = row.getByRole('button', { name: /^đ$|^%$/ }).first();
    if (await toggle.count()) {
      const label = (await toggle.innerText()).trim();
      if (label === 'đ') await toggle.click();
    }
  }
}

export async function saveWsInvoice(page: Page) {
  await page.locator('#save-invoice-btn').click();
}

export async function createWholesaleDraftApi(
  request: APIRequestContext,
  token: string,
  body: Record<string, unknown>,
): Promise<any> {
  return createSaleDraftApi(request, token, {
    channel: 'store',
    type: 'wholesale',
    status: 'draft',
    ...body,
  });
}

export async function createCompletedWholesaleApi(
  request: APIRequestContext,
  token: string,
  body: Record<string, unknown>,
): Promise<any> {
  const sale = await createWholesaleDraftApi(request, token, body);
  const completeRes = await completeSaleApi(request, token, String(sale._id));
  const completeText = await completeRes.text();
  expect(
    completeRes.ok(),
    `complete wholesale ${sale._id} -> ${completeRes.status()} ${completeText.slice(0, 240)}`,
  ).toBeTruthy();
  return JSON.parse(completeText);
}

export async function listWholesaleSales(
  request: APIRequestContext,
  token: string,
  params: Record<string, string | number> = {},
) {
  const res = await request.get(`${API}/products/sales`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { type: 'wholesale', channel: 'store', limit: 50, ...params },
  });
  expect(res.ok(), `list wholesale -> ${res.status()}`).toBeTruthy();
  return res.json();
}

export function payFull(amount: number, methodId: string) {
  return {
    valuePayment: amount,
    typePayment: [{ methodId, amount }],
    tenderedValue: amount,
  };
}

export function payPartial(total: number, paid: number, methodId: string) {
  return {
    valuePayment: paid,
    typePayment: paid > 0 ? [{ methodId, amount: paid }] : [],
    tenderedValue: paid,
  };
}
