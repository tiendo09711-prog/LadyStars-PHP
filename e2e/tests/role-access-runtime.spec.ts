import { test, expect, request, type APIRequestContext } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';

const repoRoot = path.basename(process.cwd()) === 'e2e' ? path.resolve(process.cwd(), '..') : process.cwd();
dotenv.config({ path: path.resolve(repoRoot, '.env.e2e.local'), override: true });
dotenv.config({ path: path.resolve(repoRoot, '.env'), override: false });

const apiBaseURLRaw = process.env.E2E_API_BASE_URL || 'http://localhost:4100/api';
const apiBaseURL = apiBaseURLRaw.endsWith('/') ? apiBaseURLRaw : `${apiBaseURLRaw}/`;
const appBaseURL = process.env.E2E_BASE_URL || 'http://localhost:5174';
const mongoUri = process.env.E2E_MONGO_URI || '';
const dbName = process.env.E2E_MONGO_DB_NAME || 'ladystars_e2e';
const appMongoUri = process.env.MONGO_URI || '';
const runId = `E2E_ACCESS_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const adminEmail = 'admin@myerp.local';
const adminPassword = '123456789';
const employeePassword = `Pw_${runId}_12345`;

function assertE2EIsolation() {
  function dbOf(u: string) { const m = u.match(/\/([^/?]+)/); return m ? m[1].split('?')[0] : ''; }
  expect(mongoUri, 'E2E_MONGO_URI must exist').toBeTruthy();
  expect(dbName, 'E2E DB name must exist').toBeTruthy();
  expect(/e2e|test/i.test(dbName), 'E2E DB name must contain marker').toBeTruthy();
  expect(mongoUri, 'E2E_MONGO_URI must differ from MONGO_URI').not.toBe(appMongoUri);
  if (appMongoUri) expect(dbName, 'E2E DB must differ from app DB').not.toBe(dbOf(appMongoUri));
  expect(apiBaseURL).toContain(':4100');
  expect(appBaseURL).toContain(':5174');
}

function authHeaders(token: string) { return { Authorization: `Bearer ${token}` }; }
function storageState(token: string) { return { cookies: [], origins: [{ origin: appBaseURL, localStorage: [{ name: 'token', value: token }] }] }; }

test.describe.serial('runtime role access matrix on isolated E2E DB', () => {
  let client: MongoClient;
  let db: any;
  let adminApi: APIRequestContext;
  let sourceApi: APIRequestContext;
  let destinationApi: APIRequestContext;
  let outsideApi: APIRequestContext;
  let adminToken = '';
  let sourceToken = '';
  let destinationToken = '';
  let outsideToken = '';
  let sourceUserId = '';
  let destinationUserId = '';
  let outsideUserId = '';
  const ids: Record<string, ObjectId[]> = {
    users: [], branches: [], products: [], customers: [], orders: [], productbranchstocks: [], warehousetransfers: [], inventoryvouchers: [], inventoryproducts: [], transferauditlogs: [],
  };

  async function login(email: string, password: string) {
    const api = await request.newContext({ baseURL: apiBaseURL });
    let token = '';
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await api.post('auth/login', { data: { email, password } });
      if (response.status() === 200) { token = (await response.json()).token; break; }
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
    await api.dispose();
    expect(token, `login should succeed for ${email}`).toBeTruthy();
    return token;
  }

  async function createEmployee(api: APIRequestContext, name: string, warehouseIds: string[]) {
    const response = await api.post('staff', { data: { name, email: `${name.toLowerCase()}@example.test`, password: employeePassword, status: 'ACTIVE', assignedWarehouseIds: warehouseIds, defaultWarehouseId: warehouseIds[0] } });
    expect(response.status()).toBe(201);
    const body = await response.json();
    const userId = body._id || body.id;
    ids.users.push(new ObjectId(userId));
    return { id: userId, email: body.email };
  }

  test.beforeAll(async () => {
    assertE2EIsolation();
    client = new MongoClient(mongoUri, { writeConcern: { w: 'majority' } });
    await client.connect();
    db = client.db(dbName);

    const now = new Date();
    const sourceBranch = { _id: new ObjectId(), name: `E2E_BRANCH_SOURCE_${runId}`, code: `SRC_${runId}`.slice(0, 40), isActive: true, createdAt: now, updatedAt: now };
    const destinationBranch = { _id: new ObjectId(), name: `E2E_BRANCH_DESTINATION_${runId}`, code: `DST_${runId}`.slice(0, 40), isActive: true, createdAt: now, updatedAt: now };
    const outsideBranch = { _id: new ObjectId(), name: `E2E_BRANCH_OUTSIDE_${runId}`, code: `OUT_${runId}`.slice(0, 40), isActive: true, createdAt: now, updatedAt: now };
    await db.collection('branches').insertMany([sourceBranch, destinationBranch, outsideBranch]);
    ids.branches.push(sourceBranch._id, destinationBranch._id, outsideBranch._id);

    const productId = new ObjectId();
    const customerId = new ObjectId();
    const orderId = new ObjectId();
    await db.collection('products').insertOne({ _id: productId, name: `E2E_PRODUCT_${runId}`, code: `PRD_${runId}`.slice(0, 40), qty: 200, cost: 10, price: 20, unit: 'pcs', type: 'product', allowsSale: true, createdAt: now, updatedAt: now });
    await db.collection('customers').insertOne({ _id: customerId, name: `E2E_CUSTOMER_${runId}`, code: `CUS_${runId}`.slice(0, 40), phone: `09${String(Date.now()).slice(-8)}`, status: 'active', branchId: sourceBranch._id, createdAt: now, updatedAt: now });
    await db.collection('orders').insertOne({ _id: orderId, orderCode: `ORD_${runId}`.slice(0, 40), customerName: `E2E_CUSTOMER_${runId}`, customerPhone: `09${String(Date.now()).slice(-8)}`, warehouse: sourceBranch.name, totalAmount: 20, status: 'Cần xử lí', products: [{ productId, sku: `PRD_${runId}`.slice(0, 40), productName: `E2E_PRODUCT_${runId}`, quantity: 1 }], createdAt: now, updatedAt: now });
    await db.collection('productbranchstocks').insertMany([
      { _id: new ObjectId(), productId, branchId: sourceBranch._id, qty: 200, createdAt: now, updatedAt: now },
      { _id: new ObjectId(), productId, branchId: destinationBranch._id, qty: 0, createdAt: now, updatedAt: now },
      { _id: new ObjectId(), productId, branchId: outsideBranch._id, qty: 0, createdAt: now, updatedAt: now },
    ]);
    ids.products.push(productId);
    ids.customers.push(customerId);
    ids.orders.push(orderId);

    adminToken = await login(adminEmail, adminPassword);
    adminApi = await request.newContext({ baseURL: apiBaseURL, extraHTTPHeaders: authHeaders(adminToken) });

    const source = await createEmployee(adminApi, `E2E_EMPLOYEE_SOURCE_${runId}`, [String(sourceBranch._id)]);
    const destination = await createEmployee(adminApi, `E2E_EMPLOYEE_DESTINATION_${runId}`, [String(destinationBranch._id)]);
    const outside = await createEmployee(adminApi, `E2E_EMPLOYEE_OUTSIDE_${runId}`, [String(outsideBranch._id)]);
    sourceUserId = source.id;
    destinationUserId = destination.id;
    outsideUserId = outside.id;
    sourceToken = await login(source.email, employeePassword);
    destinationToken = await login(destination.email, employeePassword);
    outsideToken = await login(outside.email, employeePassword);
    sourceApi = await request.newContext({ baseURL: apiBaseURL, extraHTTPHeaders: authHeaders(sourceToken) });
    destinationApi = await request.newContext({ baseURL: apiBaseURL, extraHTTPHeaders: authHeaders(destinationToken) });
    outsideApi = await request.newContext({ baseURL: apiBaseURL, extraHTTPHeaders: authHeaders(outsideToken) });
  });

  test.afterAll(async () => {
    for (const api of [adminApi, sourceApi, destinationApi, outsideApi]) await api?.dispose();
    if (db) {
      const transferIds = ids.warehousetransfers;
      if (transferIds.length) {
        const audits = await db.collection('transferauditlogs').find({ transferRequestId: { $in: transferIds } }).project({ _id: 1 }).toArray();
        ids.transferauditlogs.push(...audits.map((item: any) => item._id));
      }
      const transfers = transferIds.length ? await db.collection('warehousetransfers').find({ _id: { $in: transferIds } }).toArray() : [];
      for (const transfer of transfers) for (const key of ['sourceExportBillId', 'destinationImportBillId', 'returnBillId']) if (transfer[key]) ids.inventoryvouchers.push(transfer[key]);
      if (ids.inventoryvouchers.length) {
        const vouchers = await db.collection('inventoryvouchers').find({ _id: { $in: ids.inventoryvouchers } }).toArray();
        const voucherCodes = vouchers.map((v: any) => v.voucherId).filter(Boolean);
        if (voucherCodes.length) {
          const products = await db.collection('inventoryproducts').find({ voucherId: { $in: voucherCodes } }).project({ _id: 1 }).toArray();
          ids.inventoryproducts.push(...products.map((item: any) => item._id));
        }
      }
      const cleanupOrder: Array<[string, ObjectId[]]> = [
        ['inventoryproducts', ids.inventoryproducts], ['transferauditlogs', ids.transferauditlogs], ['inventoryvouchers', ids.inventoryvouchers],
        ['warehousetransfers', ids.warehousetransfers], ['productbranchstocks', ids.productbranchstocks], ['orders', ids.orders],
        ['customers', ids.customers], ['products', ids.products], ['users', ids.users], ['branches', ids.branches],
      ];
      for (const [collection, values] of cleanupOrder) {
        const unique = [...new Set(values.map(String))].map((v) => new ObjectId(v));
        if (unique.length) await db.collection(collection).deleteMany({ _id: { $in: unique } });
      }
      for (const [collection, values] of cleanupOrder) {
        const unique = [...new Set(values.map(String))].map((v) => new ObjectId(v));
        if (unique.length) expect(await db.collection(collection).countDocuments({ _id: { $in: unique } })).toBe(0);
      }
    }
    await client?.close();
  });

  test('API permission matrix and token invalidation', async () => {
    expect((await sourceApi.get('dashboard')).status()).toBe(200);
    expect((await sourceApi.get('products/products')).status()).toBe(200);
    expect((await sourceApi.get('customers')).status()).toBe(200);
    expect((await sourceApi.get('orders')).status()).toBe(200);
    expect((await sourceApi.get('warehouse/transactions/meta')).status()).toBe(200);
    expect((await sourceApi.get('settings/store')).status()).toBe(200);
    expect((await sourceApi.patch('settings/store', { data: { role: 'ADMIN' } })).status()).toBe(400);

    for (const response of [
      await sourceApi.get('staff'),
      await sourceApi.post('staff', { data: {} }),
      await sourceApi.get('accounting/accounts-list'),
      await sourceApi.get('tasks/tasks'),
      await sourceApi.get('print-forms'),
      await sourceApi.get('reports/revenue-time'),
      await sourceApi.post('system/branches', { data: { name: 'x', code: 'x', adminPassword: 'x' } }),
      await sourceApi.get(`system/branches/${ids.branches[0]}/usage`),
      await sourceApi.post('settings/security/change-owner-account', { data: { currentPassword: employeePassword, newEmail: `x_${runId}@example.test` } }),
    ]) expect(response.status()).toBe(403);

    expect((await adminApi.patch(`staff/${sourceUserId}/lock`)).status()).toBe(200);
    for (const response of [
      await sourceApi.get('auth/me'),
      await sourceApi.get('dashboard'),
      await sourceApi.get('products/products'),
      await sourceApi.get('warehouse/transactions/meta'),
    ]) expect(response.status()).toBe(401);
    expect((await adminApi.patch(`staff/${sourceUserId}/open`)).status()).toBe(200);
    expect((await sourceApi.get('dashboard')).status()).toBe(401);
    const relogin = await adminApi.post('auth/login', { data: { email: `e2e_employee_source_${runId}@example.test`, password: employeePassword } });
    expect(relogin.status()).toBe(200);
    const tokenB = (await relogin.json()).token;
    const tokenBApi = await request.newContext({ baseURL: apiBaseURL, extraHTTPHeaders: authHeaders(tokenB) });
    expect((await tokenBApi.get('dashboard')).status()).toBe(200);
    expect((await adminApi.post(`staff/${sourceUserId}/reset-password`, { data: { password: `${employeePassword}_new` } })).status()).toBe(200);
    expect((await tokenBApi.get('dashboard')).status()).toBe(401);
    const newLogin = await adminApi.post('auth/login', { data: { email: `e2e_employee_source_${runId}@example.test`, password: `${employeePassword}_new` } });
    expect(newLogin.status()).toBe(200);
    await tokenBApi.dispose();
    sourceToken = (await newLogin.json()).token;
    await sourceApi.dispose();
    sourceApi = await request.newContext({ baseURL: apiBaseURL, extraHTTPHeaders: authHeaders(sourceToken) });
  });

  test('transfer source destination scope and voucher idempotency', async () => {
    const productId = ids.products[0].toString();
    const makeTransfer = async (note: string) => {
      const response = await sourceApi.post('warehouse/transfers', { data: {
        sourceWarehouseId: ids.branches[0].toString(), destinationWarehouseId: ids.branches[1].toString(), note,
        lines: [{ productId, requestedQuantity: 2, unitCostSnapshot: 10, unit: 'pcs' }],
      } });
      expect(response.status()).toBe(201);
      const body = await response.json();
      ids.warehousetransfers.push(new ObjectId(body._id));
      return body;
    };

    const first = await makeTransfer(`E2E_TRANSFER_COMPLETED_${runId}`);
    expect(first.status).toBe('DRAFT');
    expect((await destinationApi.patch(`warehouse/transfers/${first._id}`, { data: { note: 'blocked' } })).status()).toBe(403);
    expect((await destinationApi.delete(`warehouse/transfers/${first._id}`)).status()).toBe(403);
    expect((await destinationApi.post(`warehouse/transfers/${first._id}/confirm-source`)).status()).toBe(403);
    expect((await outsideApi.get(`warehouse/transfers/${first._id}`)).status()).toBe(403);

    const sourceConfirm = await sourceApi.post(`warehouse/transfers/${first._id}/confirm-source`);
    expect(sourceConfirm.status()).toBe(200);
    expect((await sourceConfirm.json()).status).toBe('IN_TRANSIT');
    const doubleSource = await sourceApi.post(`warehouse/transfers/${first._id}/confirm-source`);
    expect([409, 400]).toContain(doubleSource.status());
    const afterSource = await db.collection('warehousetransfers').findOne({ _id: new ObjectId(first._id) });
    expect(afterSource.sourceExportBillId).toBeTruthy();
    expect(await db.collection('inventoryvouchers').countDocuments({ _id: afterSource.sourceExportBillId })).toBe(1);
    expect((await sourceApi.post(`warehouse/transfers/${first._id}/confirm-destination`)).status()).toBe(403);

    const destConfirm = await destinationApi.post(`warehouse/transfers/${first._id}/confirm-destination`);
    expect(destConfirm.status()).toBe(200);
    expect((await destConfirm.json()).status).toBe('COMPLETED');
    const doubleDest = await destinationApi.post(`warehouse/transfers/${first._id}/confirm-destination`);
    expect([409, 400]).toContain(doubleDest.status());
    const completed = await db.collection('warehousetransfers').findOne({ _id: new ObjectId(first._id) });
    expect(completed.destinationImportBillId).toBeTruthy();
    expect(await db.collection('inventoryvouchers').countDocuments({ _id: completed.destinationImportBillId })).toBe(1);

    const second = await makeTransfer(`E2E_TRANSFER_RETURNED_${runId}`);
    expect((await sourceApi.post(`warehouse/transfers/${second._id}/confirm-source`)).status()).toBe(200);
    const returned = await destinationApi.post(`warehouse/transfers/${second._id}/return`, { data: { reason: `E2E return ${runId}` } });
    expect(returned.status()).toBe(200);
    expect((await returned.json()).status).toBe('RETURNED');
    const doubleReturn = await destinationApi.post(`warehouse/transfers/${second._id}/return`, { data: { reason: `E2E return retry ${runId}` } });
    expect([409, 400]).toContain(doubleReturn.status());
    const returnedDoc = await db.collection('warehousetransfers').findOne({ _id: new ObjectId(second._id) });
    expect(returnedDoc.returnBillId).toBeTruthy();
    expect(returnedDoc.destinationImportBillId || null).toBeNull();
    expect(await db.collection('inventoryvouchers').countDocuments({ _id: returnedDoc.returnBillId })).toBe(1);
  });

  test('UI menu, direct URL and settings visibility', async ({ browser }) => {
    const adminContext = await browser.newContext({ storageState: storageState(adminToken) as any });
    const adminPage = await adminContext.newPage();
    await adminPage.goto('/');
    for (const text of ['Vận hành', 'Báo cáo', 'Quản lý nhân viên', 'Cài đặt']) await expect(adminPage.getByText(text, { exact: false })).toBeVisible();
    for (const url of ['/staff/create', '/staff/accounts', '/staff/stats', '/warehouse/branches', '/tasks', '/print-forms', '/reports/revenue/time', '/settings']) {
      await adminPage.goto(url);
      await expect(adminPage).toHaveURL(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    await adminContext.close();

    const employeeContext = await browser.newContext({ storageState: storageState(sourceToken) as any });
    const page = await employeeContext.newPage();
    await page.goto('/');
    for (const text of ['Dashboard', 'Sản phẩm', 'Kho hàng', 'Kênh bán', 'Khách hàng', 'Cài đặt']) await expect(page.getByText(text, { exact: false })).toBeVisible();
    for (const text of ['Vận hành', 'Báo cáo', 'Quản lý nhân viên', 'Cấu hình kho hàng']) await expect(page.getByText(text, { exact: false })).toHaveCount(0);
    for (const url of ['/staff/accounts', '/tasks', '/print-forms', '/reports/revenue/time', '/warehouse/branches']) {
      await page.goto(url);
      await expect(page).toHaveURL(/\/$/);
    }
    for (const url of ['/', '/products', '/warehouse/transactions', '/warehouse/audit', '/sales-channels/store/retail', '/customers/list', '/settings']) {
      await page.goto(url);
      await expect(page).toHaveURL(new RegExp(url === '/' ? '/$' : url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    await page.goto('/settings');
    await expect(page.getByText('Cửa hàng')).toBeVisible();
    for (const text of ['Bảo mật', 'Owner', 'Audit log', 'Nguy hiểm', 'Reset mật khẩu']) await expect(page.getByText(text, { exact: false })).toHaveCount(0);
    await employeeContext.close();
  });
});
