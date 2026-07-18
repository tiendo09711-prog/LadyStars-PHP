import { expect, type APIRequestContext, type Page, type Locator } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ADMIN,
  API,
  EMPLOYEE,
  REFUND_PATH,
  RETAIL_PATH,
  WHOLESALE_PATH,
  apiLogin,
  cancelSaleApi,
  createCompletedSaleApi,
  createCustomerApi,
  createProductApi,
  createSaleDraftApi,
  createdCustomerIds,
  createdProductIds,
  createdRefundIds,
  createdSaleIds,
  deleteProductApi,
  deleteSaleApi,
  ensureBranchStock,
  getAdminToken,
  getSaleApi,
  getStock,
  returnExchangeApi,
  setTokens,
  uiLogin,
} from './retail-live-helpers';

export {
  ADMIN,
  API,
  EMPLOYEE,
  REFUND_PATH,
  RETAIL_PATH,
  WHOLESALE_PATH,
  apiLogin,
  cancelSaleApi,
  createCompletedSaleApi,
  createCustomerApi,
  createProductApi,
  createSaleDraftApi,
  createdCustomerIds,
  createdProductIds,
  createdRefundIds,
  createdSaleIds,
  deleteProductApi,
  deleteSaleApi,
  ensureBranchStock,
  getAdminToken,
  getSaleApi,
  getStock,
  returnExchangeApi,
  setTokens,
  uiLogin,
};

export const RUN_ID =
  process.env.E2E_RUN_ID ||
  `RF-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${randomBytes(2).toString('hex')}`;

export const FIXTURE_PREFIX = `QA-RF-${RUN_ID}`;

const COVERAGE_FILE = path.join(process.cwd(), 'e2e', `.rf-coverage-${RUN_ID}.txt`);
export const coveredRfs = new Set<string>();

export function markCases(...ids: string[]) {
  for (const id of ids) coveredRfs.add(id);
  try {
    fs.appendFileSync(COVERAGE_FILE, `${ids.join('\n')}\n`, 'utf8');
  } catch {
    // ignore
  }
}

export async function waitRefundListLoaded(page: Page) {
  await expect(page.locator('.refund-invoice-page, .refund-root').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  try {
    await expect(page.locator('.refund-skeleton')).toHaveCount(0, { timeout: 60_000 });
  } catch {
    const retry = page.getByRole('button', { name: /Thử lại|Làm mới/i }).first();
    if (await retry.count()) await retry.click();
    await expect(page.locator('.refund-skeleton')).toHaveCount(0, { timeout: 60_000 });
  }
  await expect(
    page.locator('.refund-data-table tbody tr, .refund-alert, .refund-empty-state').first(),
  ).toBeVisible({ timeout: 30_000 });
}

export async function waitRefundCreateLoaded(page: Page) {
  await expect(page.locator('#save-invoice-btn')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Application error|Something went wrong/i)).toHaveCount(0);
}

/** Uncheck auto-print so Playwright popup blocking does not abort save (SAVE-005 vs SAVE-006). */
export async function disableRefundAutoPrint(page: Page) {
  const cb = page.locator('label').filter({ hasText: /Tự động in sau khi lưu/i }).locator('input[type="checkbox"]');
  if (await cb.count()) {
    if (await cb.isChecked()) {
      await cb.uncheck({ force: true });
    }
    await expect(cb).not.toBeChecked();
  }
}

export function refundRow(page: Page, code: string): Locator {
  return page.locator('.refund-data-table tbody tr').filter({ hasText: code }).first();
}

export async function searchRefunds(page: Page, keyword: string) {
  const input = page.getByLabel(/Tìm kiếm trả hàng/i);
  await expect(input).toBeVisible({ timeout: 15_000 });
  await input.fill(keyword.slice(0, 120));
  await page.getByRole('button', { name: /^Tìm$/i }).click();
  await expect(page.locator('.refund-skeleton')).toHaveCount(0, { timeout: 60_000 });
  await expect(
    page.locator('.refund-data-table tbody tr, .refund-alert, .refund-empty-state').first(),
  ).toBeVisible({ timeout: 30_000 });
}

export async function openRefundRowMenu(page: Page, code: string) {
  const btn = page.getByRole('button', { name: `Thao tác phiếu ${code}`, exact: true });
  await expect(btn).toBeVisible({ timeout: 15_000 });
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await expect(page.locator('.refund-row-action-menu, [role="menu"]').first()).toBeVisible({ timeout: 10_000 });
}

export async function listRefundsApi(
  request: APIRequestContext,
  token: string,
  params: Record<string, string | number> = {},
) {
  const res = await request.get(`${API}/products/refunds`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { channel: 'store', page: 1, limit: 50, ...params },
  });
  expect(res.ok(), `list refunds ${res.status()}`).toBeTruthy();
  return res.json();
}

export async function getRefundApi(request: APIRequestContext, token: string, id: string) {
  const res = await request.get(`${API}/products/refunds/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status(), data: res.ok() ? await res.json() : null, text: res.ok() ? '' : await res.text() };
}

export async function createWholesaleCompletedSaleApi(
  request: APIRequestContext,
  token: string,
  body: Record<string, unknown>,
) {
  return createCompletedSaleApi(request, token, { ...body, type: 'wholesale', channel: 'store' });
}

export async function trackRefundFromResponse(json: any) {
  const id = json?.refund?._id || json?.refund?.id || json?._id || json?.id;
  if (id) createdRefundIds.push(String(id));
  return json;
}

export async function doReturnExchange(
  request: APIRequestContext,
  token: string,
  saleId: string,
  body: Record<string, unknown>,
) {
  const res = await returnExchangeApi(request, token, saleId, body);
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (res.ok() && json) await trackRefundFromResponse(json);
  return { res, text, json };
}

export async function cleanupRefundFixtures(request: APIRequestContext) {
  const token = getAdminToken();
  // Refund docs are completed historical records; sales with refunds may refuse cancel/delete.
  // Best-effort: cancel/delete only sales without active refunds, then customers/products.
  for (const id of [...createdSaleIds].reverse()) {
    try {
      const got = await getSaleApi(request, token, id);
      if (!got.data) continue;
      const status = String(got.data.status || '').toLowerCase();
      const refundStatus = String(got.data.refundStatus || 'none').toLowerCase();
      const activeRefundCount = Number(got.data.activeRefundCount || 0);
      if (refundStatus === 'none' && activeRefundCount === 0) {
        if (status === 'completed') await cancelSaleApi(request, token, id);
        await deleteSaleApi(request, token, id);
      }
    } catch {
      // ignore
    }
  }
  createdSaleIds.length = 0;

  for (const id of [...createdCustomerIds].reverse()) {
    await request
      .delete(`${API}/customers/customers/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .catch(() => null);
  }
  createdCustomerIds.length = 0;

  for (const id of [...createdProductIds].reverse()) {
    await request
      .patch(`${API}/products/products/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { initialStocks: [{ warehouseId: 1, quantity: 0 }] },
      })
      .catch(() => null);
    await deleteProductApi(request, token, id);
  }
  createdProductIds.length = 0;
  createdRefundIds.length = 0;
}

export async function noBodyHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth <= doc.clientWidth + 2;
  });
}

export async function waitRetailLoaded(page: Page) {
  await expect(page.getByText(/Hóa đơn bán lẻ/i).first()).toBeVisible({ timeout: 30_000 });
  try {
    await expect(page.locator('.retail-skeleton')).toHaveCount(0, { timeout: 45_000 });
  } catch {
    const refresh = page.getByRole('button', { name: /Làm mới|Thử lại/i }).first();
    if (await refresh.count()) await refresh.click();
    await expect(page.locator('.retail-skeleton')).toHaveCount(0, { timeout: 45_000 });
  }
}

export async function waitWholesaleLoaded(page: Page) {
  await expect(page).toHaveURL(/\/wholesale/, { timeout: 30_000 });
  await expect(
    page.locator('.ws-invoice-page, .wholesale-invoice-page, .retail-invoice-page, main').first(),
  ).toBeVisible({ timeout: 30_000 });
  try {
    await expect(page.locator('.ws-skeleton, .retail-skeleton')).toHaveCount(0, { timeout: 45_000 });
  } catch {
    const refresh = page.getByRole('button', { name: /Làm mới|Thử lại/i }).first();
    if (await refresh.count()) await refresh.click();
    await expect(page.locator('.ws-skeleton, .retail-skeleton')).toHaveCount(0, { timeout: 45_000 });
  }
}

export async function filterRetailInvoice(page: Page, code: string) {
  const idInput = page.getByLabel(/ID hóa đơn/i);
  if (await idInput.count()) {
    await idInput.fill(code);
  } else {
    const search = page.getByPlaceholder(/tìm|mã|hóa đơn/i).first();
    if (await search.count()) await search.fill(code);
  }
  const filterBtn = page.getByRole('button', { name: /^Lọc$/i });
  if (await filterBtn.count()) await filterBtn.click();
  else await page.keyboard.press('Enter');
  await expect(page.locator('.retail-skeleton')).toHaveCount(0, { timeout: 30_000 });
}

export async function openRetailRowMenu(page: Page, code: string) {
  const btn = page.getByRole('button', { name: `Thao tác hóa đơn ${code}`, exact: true });
  await expect(btn).toBeVisible({ timeout: 15_000 });
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await expect(page.locator('.retail-row-action-menu, [role="menu"]').first()).toBeVisible({ timeout: 10_000 });
}

export async function openWholesaleRowMenu(page: Page, code: string) {
  const btn = page
    .getByRole('button', { name: `Thao tác hóa đơn ${code}`, exact: true })
    .or(page.getByRole('button', { name: new RegExp(`Thao tác.*${code}`, 'i') }));
  await expect(btn.first()).toBeVisible({ timeout: 15_000 });
  await btn.first().scrollIntoViewIfNeeded();
  await btn.first().click();
  await expect(page.locator('.ws-row-action-menu, .retail-row-action-menu, [role="menu"]').first()).toBeVisible({
    timeout: 10_000,
  });
}
