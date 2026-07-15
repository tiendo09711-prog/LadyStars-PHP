import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';

/**
 * Live automation for /sales-channels/store/retail (Bán lẻ).
 * Fixtures only under QA-RTL-{E2E_RUN_ID}-* ; cleaned in afterAll.
 * Requires dev servers: 5173 (Vite) + 8000 (Laravel).
 */
const RUN_ID =
  process.env.E2E_RUN_ID ||
  `E2E-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${randomBytes(2).toString('hex')}`;
const API = 'http://127.0.0.1:8000/api';
const ADMIN = { email: 'admin@gmail.com', password: '123456' };
const EMPLOYEE = { email: 'tiendo09711@gmail.com', password: '123456' };
const FIXTURE_PREFIX = `QA-RTL-${RUN_ID}`;
const RETAIL_PATH = '/sales-channels/store/retail';

const createdProductIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdSaleIds: string[] = [];
let adminToken = '';
let employeeToken = '';
let adminRole = '';
let employeeRole = '';

type LoginResult = { token: string; user: { role?: string; email?: string; name?: string } };

async function apiLogin(request: APIRequestContext, creds: { email: string; password: string }): Promise<LoginResult> {
  const res = await request.post(`${API}/auth/login`, { data: creds });
  expect(res.ok(), `login ${creds.email}`).toBeTruthy();
  return res.json();
}

async function uiLogin(page: Page, creds: { email: string; password: string }) {
  const token = creds.email === EMPLOYEE.email ? employeeToken : adminToken;
  await page.addInitScript((authToken) => localStorage.setItem('token', authToken), token);
}

async function waitRetailLoaded(page: Page) {
  await expect(page.getByText(/Hóa đơn bán lẻ/i).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.retail-skeleton')).toHaveCount(0, { timeout: 30_000 });
}

async function filterInvoice(page: Page, code: string) {
  await page.getByLabel(/ID hóa đơn/i).fill(code);
  await page.getByRole('button', { name: /^Lọc$/i }).click();
  await expect(page.locator('.retail-skeleton')).toHaveCount(0, { timeout: 30_000 });
}

async function createProductApi(
  request: APIRequestContext,
  token: string,
  body: Record<string, unknown>,
): Promise<any> {
  const res = await request.post(`${API}/products/products`, {
    headers: { Authorization: `Bearer ${token}` },
    data: body,
  });
  const text = await res.text();
  expect(res.ok() || res.status() === 201, `create product ${body.code} -> ${res.status()} ${text.slice(0, 200)}`).toBeTruthy();
  const product = JSON.parse(text);
  if (product?._id) createdProductIds.push(String(product._id));
  return product;
}

async function deleteProductApi(request: APIRequestContext, token: string, id: string) {
  return (
    await request.delete(`${API}/products/products/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).status();
}

async function getStock(request: APIRequestContext, token: string, productId: string, branchId: string): Promise<number> {
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

async function createCompletedSaleApi(
  request: APIRequestContext,
  token: string,
  body: Record<string, unknown>,
): Promise<any> {
  const createRes = await request.post(`${API}/products/sales`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { status: 'draft', channel: 'store', type: 'retail', ...body },
  });
  const createText = await createRes.text();
  expect(createRes.ok() || createRes.status() === 201, `create sale -> ${createRes.status()} ${createText.slice(0, 200)}`).toBeTruthy();
  const sale = JSON.parse(createText);
  const saleId = String(sale._id);
  createdSaleIds.push(saleId);
  const completeRes = await request.post(`${API}/products/sales/${saleId}/complete`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const completeText = await completeRes.text();
  expect(completeRes.ok(), `complete sale ${saleId} -> ${completeRes.status()} ${completeText.slice(0, 200)}`).toBeTruthy();
  return JSON.parse(completeText);
}

async function cancelSaleApi(request: APIRequestContext, token: string, saleId: string) {
  return request.post(`${API}/products/sales/${saleId}/cancel`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function deleteSaleApi(request: APIRequestContext, token: string, saleId: string) {
  return request.delete(`${API}/products/sales/${saleId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

test.describe('Retail live suite', () => {
  let branchId = '';
  let branchIdB = '';
  let categoryId = '';
  let cashMethodId = '';
  let bankMethodId = '';

  let codeP1 = '';
  let codeP2 = '';
  let codeP3 = '';
  let idP1 = '';
  let idP2 = '';
  let idP3 = '';
  let barcodeP1 = '';

  let customerOldPhone = '';
  let customerOldName = '';
  let customerOldId = '';

  let saleCodeForMenu = '';
  let saleIdForMenu = '';

  test.beforeAll(async ({ request }) => {
    // eslint-disable-next-line no-console
    console.log(`E2E_RUN_ID=${RUN_ID}`);
    const admin = await apiLogin(request, ADMIN);
    const emp = await apiLogin(request, EMPLOYEE);
    adminToken = admin.token;
    employeeToken = emp.token;
    adminRole = String(admin.user?.role || '').toUpperCase();
    employeeRole = String(emp.user?.role || '').toUpperCase();
    expect(adminRole).toBe('ADMIN');
    expect(employeeRole).not.toBe('ADMIN');

    const branches = await (
      await request.get(`${API}/branches?limit=50`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    const active = (branches.items || []).filter((b: any) => b.isActive !== false);
    expect(active.length).toBeGreaterThan(0);
    branchId = String(active[0]._id);
    branchIdB = String((active[1] || active[0])._id);

    const cats = await (
      await request.get(`${API}/products/categories?limit=50`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    const catItems = cats.items || cats.data || [];
    expect(catItems.length).toBeGreaterThan(0);
    categoryId = String(catItems[0]._id);

    const methods = await (
      await request.get(`${API}/products/payment-methods?limit=50`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    const methodItems = methods.items || [];
    expect(methodItems.length, 'payment methods must exist for retail create').toBeGreaterThan(0);
    const cash = methodItems.find((m: any) => m.code === 'cash') || methodItems[0];
    const bank = methodItems.find((m: any) => m.code === 'bank_transfer') || methodItems[1] || cash;
    cashMethodId = String(cash._id);
    bankMethodId = String(bank._id);

    const base = {
      type: 'product',
      unit: 'Cái',
      allowsSale: true,
      categoryId: Number(categoryId) || categoryId,
      status: 'Đang bán',
    };

    codeP1 = `${FIXTURE_PREFIX}-P1`;
    codeP2 = `${FIXTURE_PREFIX}-P2`;
    codeP3 = `${FIXTURE_PREFIX}-P3`;
    barcodeP1 = `89${String(Date.now()).slice(-11)}`.slice(0, 13);

    const p1 = await createProductApi(request, adminToken, {
      ...base,
      code: codeP1,
      name: `QA Retail P1 ${RUN_ID}`,
      price: 100000,
      cost: 50000,
      barcode: barcodeP1,
      initialStocks: [
        { warehouseId: Number(branchId) || branchId, quantity: 20 },
        ...(branchIdB !== branchId ? [{ warehouseId: Number(branchIdB) || branchIdB, quantity: 8 }] : []),
      ],
    });
    idP1 = String(p1._id);

    const p2 = await createProductApi(request, adminToken, {
      ...base,
      code: codeP2,
      name: `QA Retail P2 ${RUN_ID}`,
      price: 250000,
      cost: 120000,
      initialStocks: [{ warehouseId: Number(branchId) || branchId, quantity: 10 }],
    });
    idP2 = String(p2._id);

    const p3 = await createProductApi(request, adminToken, {
      ...base,
      code: codeP3,
      name: `QA Retail P3 Zero ${RUN_ID}`,
      price: 50000,
      cost: 20000,
      initialStocks: [{ warehouseId: Number(branchId) || branchId, quantity: 0 }],
    });
    idP3 = String(p3._id);

    customerOldPhone = `0909${String(Date.now()).slice(-6)}`;
    customerOldName = `QA RTL KH ${RUN_ID}`;
    const custRes = await request.post(`${API}/customers/customers`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        name: customerOldName,
        phone: customerOldPhone,
        email: `qa-rtl-${RUN_ID}@example.test`,
        address: `Địa chỉ test ${RUN_ID}`,
        branchId,
      },
    });
    const custText = await custRes.text();
    expect(custRes.ok() || custRes.status() === 201, `create customer -> ${custRes.status()} ${custText.slice(0, 200)}`).toBeTruthy();
    const customer = JSON.parse(custText);
    customerOldId = String(customer._id);
    createdCustomerIds.push(customerOldId);

    // Seed one completed sale for menu/role tests.
    const stockBefore = await getStock(request, adminToken, idP1, branchId);
    const sale = await createCompletedSaleApi(request, adminToken, {
      branchId,
      customerId: customerOldId,
      valuePayment: 100000,
      typePayment: [{ methodId: cashMethodId, amount: 100000 }],
      items: [{ productId: idP1, amount: 1, value: 100000 }],
      note: `${FIXTURE_PREFIX}-MENU`,
    });
    saleIdForMenu = String(sale._id);
    saleCodeForMenu = String(sale.code || '');
    const stockAfter = await getStock(request, adminToken, idP1, branchId);
    expect(stockAfter).toBe(stockBefore - 1);
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      if (!localStorage.getItem('token')) localStorage.setItem('token', token);
    }, adminToken);
  });

  test.afterAll(async ({ request }) => {
    // Cancel completed fixture sales then delete cancelled/draft.
    for (const id of [...createdSaleIds].reverse()) {
      const getRes = await request.get(`${API}/products/sales/${id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!getRes.ok()) continue;
      const sale = await getRes.json();
      const status = String(sale.status || '').toLowerCase();
      if (status === 'completed') {
        await cancelSaleApi(request, adminToken, id);
      }
      await deleteSaleApi(request, adminToken, id);
    }

    for (const id of [...createdCustomerIds].reverse()) {
      await request.delete(`${API}/customers/customers/${id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      }).catch(() => null);
    }

    for (const id of [...createdProductIds].reverse()) {
      await request.patch(`${API}/products/products/${id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { initialStocks: [{ warehouseId: Number(branchId) || branchId, quantity: 0 }] },
      }).catch(() => null);
      if (branchIdB && branchIdB !== branchId) {
        await request.patch(`${API}/products/products/${id}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
          data: { initialStocks: [{ warehouseId: Number(branchIdB) || branchIdB, quantity: 0 }] },
        }).catch(() => null);
      }
      await deleteProductApi(request, adminToken, id);
    }
  });

  // ─── Roles ─────────────────────────────────────────────────────────────

  test('RT-ROLE: admin is ADMIN, employee is not ADMIN', async () => {
    expect(adminRole).toBe('ADMIN');
    expect(employeeRole).toBe('EMPLOYEE');
  });

  // ─── NAV ───────────────────────────────────────────────────────────────

  test('RT-001: mở /sales-channels/store/retail trực tiếp', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto(RETAIL_PATH);
    await expect(page).toHaveURL(/\/sales-channels\/store\/retail$/);
    await waitRetailLoaded(page);
    await expect(page.getByRole('heading', { name: /Hóa đơn bán lẻ|Bảng dữ liệu Bán lẻ/i }).first()).toBeVisible();
    await expect(page.getByLabel(/ID hóa đơn/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Thêm hóa đơn/i })).toBeVisible();
  });

  test('RT-002: mở qua sidebar Kênh bán hàng → Bán lẻ', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto('/');
    await expect(page.locator('.app-sidebar, .sidebar-nav').first()).toBeVisible({ timeout: 20_000 });
    // Open sales-channel flyout (desktop hover + click title for mobile-open).
    const salesGroup = page.locator('.menu-group-sales-channel');
    await expect(salesGroup).toBeVisible({ timeout: 15_000 });
    await salesGroup.hover();
    await salesGroup.locator('button.menu-group-title').click({ force: true });
    const retailLink = salesGroup.locator('a[href="/sales-channels/store/retail"]');
    await expect(retailLink).toBeVisible({ timeout: 10_000 });
    await retailLink.click();
    await expect(page).toHaveURL(/\/sales-channels\/store\/retail/);
    await waitRetailLoaded(page);
  });

  test('RT-003: refresh + back/forward', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto(RETAIL_PATH);
    await waitRetailLoaded(page);
    await page.reload();
    await waitRetailLoaded(page);
    await page.goto('/dashboard');
    await page.goBack();
    await expect(page).toHaveURL(/\/sales-channels\/store\/retail/);
    await waitRetailLoaded(page);
    await page.goForward();
    await expect(page).toHaveURL(/\/dashboard|\/$/);
  });

  test('RT-004: ADMIN thấy Sửa đơn hàng và Xóa/Hủy trên menu', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto(RETAIL_PATH);
    await waitRetailLoaded(page);
    await filterInvoice(page, saleCodeForMenu);
    await expect(page.getByText(saleCodeForMenu).first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: `Thao tác hóa đơn ${saleCodeForMenu}`, exact: true }).click();
    await expect(page.getByRole('menuitem', { name: /Sửa đơn hàng/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Xóa hóa đơn/i })).toBeVisible();
  });

  test('RT-005: EMPLOYEE không thấy Sửa/Xóa; API cancel bị 403', async ({ page, request }) => {
    await uiLogin(page, EMPLOYEE);
    await page.goto(RETAIL_PATH);
    await waitRetailLoaded(page);
    await filterInvoice(page, saleCodeForMenu);
    await expect(page.getByText(saleCodeForMenu).first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: `Thao tác hóa đơn ${saleCodeForMenu}`, exact: true }).click();
    await expect(page.getByRole('menuitem', { name: /Xem chi tiết/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Sửa đơn hàng/i })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: /Xóa hóa đơn/i })).toHaveCount(0);

    const cancelRes = await cancelSaleApi(request, employeeToken, saleIdForMenu);
    expect(cancelRes.status()).toBe(403);

    // Direct edit URL as employee must not successfully save (backend 403 on patch).
    await page.goto(`${RETAIL_PATH}/create?editId=${saleIdForMenu}`);
    await expect(page.getByText(/Sửa hóa đơn bán lẻ|Đang tải/i).first()).toBeVisible({ timeout: 20_000 });
    // Employee may still open form in UI; backend must reject write.
    const patchRes = await request.patch(`${API}/products/sales/${saleIdForMenu}`, {
      headers: { Authorization: `Bearer ${employeeToken}` },
      data: { note: `${FIXTURE_PREFIX}-EMP-EDIT-SHOULD-FAIL` },
    });
    expect(patchRes.status()).toBe(403);
  });

  // ─── List / filters ────────────────────────────────────────────────────

  test('RT-011 + RT-031: empty state khi mã không tồn tại', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto(RETAIL_PATH);
    await waitRetailLoaded(page);
    await filterInvoice(page, `NOT-FOUND-MANUAL-${RUN_ID}`);
    await expect(page.getByText(/Không có hóa đơn phù hợp/i)).toBeVisible();
    await expect(page.locator('.retail-kpi-card').filter({ hasText: /Tổng hóa đơn/i })).toContainText('0');
  });

  test('RT-030: lọc mã hóa đơn chính xác', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto(RETAIL_PATH);
    await waitRetailLoaded(page);
    await filterInvoice(page, saleCodeForMenu);
    await expect(page.getByText(saleCodeForMenu).first()).toBeVisible();
    const rows = page.locator('.retail-data-table tbody tr').filter({ hasNot: page.locator('.retail-skeleton') });
    await expect(rows).toHaveCount(1);
  });

  test('RT-012: lỗi tải danh sách + Thử lại', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto(RETAIL_PATH);
    await waitRetailLoaded(page);
    await page.route('**/api/products/sales?**', (route) => route.abort());
    await page.getByRole('button', { name: /Làm mới/i }).click();
    await expect(page.getByRole('alert')).toContainText(/Không tải được dữ liệu/i, { timeout: 15_000 });
    await page.unroute('**/api/products/sales?**');
    await page.getByRole('button', { name: /Thử lại/i }).click();
    await waitRetailLoaded(page);
  });

  test('RT-043: reset bộ lọc', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto(RETAIL_PATH);
    await waitRetailLoaded(page);
    await page.getByLabel(/ID hóa đơn/i).fill(`TMP-${RUN_ID}`);
    await page.getByRole('button', { name: /^Lọc$/i }).click();
    await expect(page.locator('.retail-skeleton')).toHaveCount(0, { timeout: 20_000 });
    await page.getByRole('button', { name: /Làm mới/i }).click();
    await expect(page.getByLabel(/ID hóa đơn/i)).toHaveValue('');
    await waitRetailLoaded(page);
  });

  // ─── Create modal ──────────────────────────────────────────────────────

  test('RT-050/051/052: modal chọn cửa hàng', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto(RETAIL_PATH);
    await waitRetailLoaded(page);
    await page.getByRole('button', { name: /Thêm hóa đơn/i }).click();
    await expect(page.getByRole('dialog', { name: /Chọn kho hàng/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Chọn$/i })).toBeDisabled();
    await page.getByRole('button', { name: /^Hủy$/i }).click();
    await expect(page.getByRole('dialog', { name: /Chọn kho hàng/i })).toHaveCount(0);
    await expect(page).toHaveURL(/\/sales-channels\/store\/retail$/);
  });

  test('RT-054: chọn cửa hàng A → create?branchId=', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto(RETAIL_PATH);
    await waitRetailLoaded(page);
    await page.getByRole('button', { name: /Thêm hóa đơn/i }).click();
    const dialog = page.getByRole('dialog', { name: /Chọn kho hàng/i });
    await expect(dialog).toBeVisible();
    await dialog.locator('button').filter({ hasText: /.+/ }).first().click();
    await expect(page.getByRole('button', { name: /^Chọn$/i })).toBeEnabled();
    await page.getByRole('button', { name: /^Chọn$/i }).click();
    await expect(page).toHaveURL(new RegExp(`/sales-channels/store/retail/create\\?branchId=`));
    await expect(page.getByText(/Thêm hóa đơn bán lẻ|Đang tải dữ liệu bán lẻ/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test('RT-055: create thiếu branchId không lưu được', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto(`${RETAIL_PATH}/create`);
    await expect(page.getByText(/Thêm hóa đơn bán lẻ|Đang tải/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('button.create-save-top')).toBeDisabled();
  });

  test('RT-060: bỏ trống tên khách → không lưu', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto(`${RETAIL_PATH}/create?branchId=${branchId}`);
    await expect(page.getByText(/Thêm hóa đơn bán lẻ/i).first()).toBeVisible({ timeout: 30_000 });
    await page.getByPlaceholder(/Tìm theo mã, barcode hoặc tên sản phẩm/i).fill(codeP1);
    await page.locator('.product-results button').filter({ hasText: codeP1 }).first().click();
    await page.getByRole('button', { name: /Lưu hóa đơn/i }).first().click();
    await expect(page.getByText(/Vui lòng nhập tên khách hàng/i)).toBeVisible();
  });

  // ─── Create success + stock ────────────────────────────────────────────

  test('RT-120: tạo đơn chuẩn UI + trừ tồn', async ({ page, request }) => {
    await uiLogin(page, ADMIN);
    const stockP1Before = await getStock(request, adminToken, idP1, branchId);
    const stockP2Before = await getStock(request, adminToken, idP2, branchId);
    const stockP1BBefore = branchIdB !== branchId ? await getStock(request, adminToken, idP1, branchIdB) : null;

    await page.goto(`${RETAIL_PATH}/create?branchId=${branchId}`);
    await expect(page.getByText(/Thêm hóa đơn bán lẻ/i).first()).toBeVisible({ timeout: 30_000 });

    const customerName = `QA RTL NEW ${RUN_ID}`;
    const customerPhone = `0911${String(Date.now()).slice(-6)}`;
    await page.getByPlaceholder(/Nhập họ tên hoặc số điện thoại/i).fill(customerName);
    await page.locator('label').filter({ hasText: /^Số điện thoại$/i }).locator('input').fill(customerPhone);

    // Add P1 x2 then P2 x1 via product search dropdown
    const productSearch = page.getByPlaceholder(/Tìm theo mã, barcode hoặc tên sản phẩm/i);
    await productSearch.fill(codeP1);
    await page.locator('.product-results button').filter({ hasText: codeP1 }).first().click();
    await productSearch.fill(codeP1);
    await page.locator('.product-results button').filter({ hasText: codeP1 }).first().click();
    await productSearch.fill(codeP2);
    await page.locator('.product-results button').filter({ hasText: codeP2 }).first().click();

    await page.getByRole('button', { name: /Lưu hóa đơn/i }).first().click();
    await expect(page.getByText(/đã được lưu|trừ tồn kho thành công/i)).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/sales-channels\/store\/retail$/, { timeout: 20_000 });

    const stockP1After = await getStock(request, adminToken, idP1, branchId);
    const stockP2After = await getStock(request, adminToken, idP2, branchId);
    expect(stockP1After).toBe(stockP1Before - 2);
    expect(stockP2After).toBe(stockP2Before - 1);
    if (stockP1BBefore !== null) {
      const stockP1BAfter = await getStock(request, adminToken, idP1, branchIdB);
      expect(stockP1BAfter).toBe(stockP1BBefore);
    }

    // Track latest completed sale for cleanup via list filter by customer
    const salesRes = await request.get(`${API}/products/sales`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      params: { channel: 'store', type: 'retail', customerKeyword: customerPhone, limit: 5 },
    });
    const sales = await salesRes.json();
    const items = sales.items || [];
    const created = items.find((s: any) => String(s.customerId?.phone || s.customerPhone || '') === customerPhone)
      || items[0];
    if (created?._id) createdSaleIds.push(String(created._id));
    if (created?.customerId?._id) createdCustomerIds.push(String(created.customerId._id));
  });

  test('RT-074: sản phẩm hết hàng không thêm được', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto(`${RETAIL_PATH}/create?branchId=${branchId}`);
    await expect(page.getByText(/Thêm hóa đơn bán lẻ/i).first()).toBeVisible({ timeout: 30_000 });
    await page.getByPlaceholder(/Tìm theo mã, barcode hoặc tên sản phẩm/i).fill(codeP3);
    // Zero stock products are filtered from dropdown; typing code alone should not add a line.
    await page.waitForTimeout(400);
    await expect(page.locator('.product-results button').filter({ hasText: codeP3 })).toHaveCount(0);
    await expect(page.locator('table tbody tr').filter({ hasText: codeP3 })).toHaveCount(0);
  });

  // ─── API lifecycle: edit / cancel / delete + stock ─────────────────────

  test('RT-182/183/200: API edit delta stock + employee blocked + admin cancel/delete', async ({ request }) => {
    const stockBefore = await getStock(request, adminToken, idP1, branchId);
    const sale = await createCompletedSaleApi(request, adminToken, {
      branchId,
      customerId: customerOldId,
      valuePayment: 200000,
      typePayment: [{ methodId: cashMethodId, amount: 200000 }],
      items: [{ productId: idP1, amount: 2, value: 100000 }],
      note: `${FIXTURE_PREFIX}-EDIT`,
    });
    const saleId = String(sale._id);
    expect(await getStock(request, adminToken, idP1, branchId)).toBe(stockBefore - 2);

    // Employee cannot cancel
    expect((await cancelSaleApi(request, employeeToken, saleId)).status()).toBe(403);

    // Admin increase 2 → 3
    const patchUp = await request.patch(`${API}/products/sales/${saleId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        branchId,
        customerId: customerOldId,
        status: 'completed',
        valuePayment: 300000,
        typePayment: [{ methodId: cashMethodId, amount: 300000 }],
        items: [{ productId: idP1, amount: 3, value: 100000 }],
      },
    });
    expect(patchUp.ok(), await patchUp.text()).toBeTruthy();
    expect(await getStock(request, adminToken, idP1, branchId)).toBe(stockBefore - 3);

    // Admin decrease 3 → 1
    const patchDown = await request.patch(`${API}/products/sales/${saleId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        branchId,
        customerId: customerOldId,
        status: 'completed',
        valuePayment: 100000,
        typePayment: [{ methodId: cashMethodId, amount: 100000 }],
        items: [{ productId: idP1, amount: 1, value: 100000 }],
      },
    });
    expect(patchDown.ok(), await patchDown.text()).toBeTruthy();
    expect(await getStock(request, adminToken, idP1, branchId)).toBe(stockBefore - 1);

    // Cancel restores stock
    const cancelRes = await cancelSaleApi(request, adminToken, saleId);
    expect(cancelRes.ok()).toBeTruthy();
    expect(await getStock(request, adminToken, idP1, branchId)).toBe(stockBefore);

    // Delete cancelled
    const delRes = await deleteSaleApi(request, adminToken, saleId);
    expect(delRes.ok()).toBeTruthy();
    // remove from cleanup list if already deleted
    const idx = createdSaleIds.indexOf(saleId);
    if (idx >= 0) createdSaleIds.splice(idx, 1);
  });

  test('RT-089 API: oversell bị backend từ chối', async ({ request }) => {
    const stock = await getStock(request, adminToken, idP1, branchId);
    const createRes = await request.post(`${API}/products/sales`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        branchId,
        customerId: customerOldId,
        channel: 'store',
        type: 'retail',
        status: 'draft',
        valuePayment: (stock + 5) * 100000,
        items: [{ productId: idP1, amount: stock + 5, value: 100000 }],
      },
    });
    expect(createRes.ok() || createRes.status() === 201).toBeTruthy();
    const draft = await createRes.json();
    createdSaleIds.push(String(draft._id));
    const completeRes = await request.post(`${API}/products/sales/${draft._id}/complete`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(completeRes.status()).toBe(422);
    expect(await getStock(request, adminToken, idP1, branchId)).toBe(stock);
  });

  // ─── Detail / KPI smoke ────────────────────────────────────────────────

  test('RT-021/150/154: menu + chi tiết hóa đơn', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto(RETAIL_PATH);
    await waitRetailLoaded(page);
    await filterInvoice(page, saleCodeForMenu);
    await page.getByRole('button', { name: `Thao tác hóa đơn ${saleCodeForMenu}`, exact: true }).click();
    await page.getByRole('menuitem', { name: /Xem chi tiết/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText(saleCodeForMenu);
    await expect(page.getByRole('dialog')).toContainText(/Hoàn tất|Khách hàng|Sản phẩm/i);
    await page.getByRole('dialog').getByRole('button', { name: /^Đóng$/i }).last().click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('RT-020 smoke: KPI thẻ hiển thị số hợp lệ trên trang', async ({ page }) => {
    await uiLogin(page, ADMIN);
    await page.goto(RETAIL_PATH);
    await waitRetailLoaded(page);
    const totalKpi = page.locator('.retail-kpi-card').filter({ hasText: /Tổng hóa đơn/i }).locator('.retail-kpi-value');
    await expect(totalKpi).toBeVisible();
    const text = (await totalKpi.innerText()).replace(/\./g, '').replace(/,/g, '');
    expect(Number(text)).toBeGreaterThanOrEqual(0);
  });

  // ─── Responsive smoke ──────────────────────────────────────────────────

  test('RT-013/014 smoke: desktop + mobile không body overflow ngang', async ({ page }) => {
    await uiLogin(page, ADMIN);
    for (const size of [
      { w: 1366, h: 768 },
      { w: 390, h: 844 },
    ]) {
      await page.setViewportSize({ width: size.w, height: size.h });
      await page.goto(RETAIL_PATH);
      await waitRetailLoaded(page);
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth > doc.clientWidth + 2;
      });
      expect(overflow, `overflow at ${size.w}x${size.h}`).toBeFalsy();
    }
  });
});
