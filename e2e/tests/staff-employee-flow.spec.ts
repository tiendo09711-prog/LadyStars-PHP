import { test, expect, request, type APIRequestContext, type Browser } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';

const repoRoot = path.basename(process.cwd()) === 'e2e' ? path.resolve(process.cwd(), '..') : process.cwd();
dotenv.config({ path: path.resolve(repoRoot, '.env.e2e.local'), override: true });
dotenv.config({ path: path.resolve(repoRoot, '.env'), override: false });

const apiBaseURLRaw = process.env.E2E_API_BASE_URL || 'http://localhost:4100/api';
const apiBaseURL = apiBaseURLRaw.endsWith('/') ? apiBaseURLRaw : apiBaseURLRaw + '/';
const appBaseURL = process.env.E2E_BASE_URL || 'http://localhost:5174';
const mongoUri = process.env.E2E_MONGO_URI || '';
const dbName = process.env.E2E_MONGO_DB_NAME || 'ladystars_e2e';
const appMongoUri = process.env.MONGO_URI || '';
const runId = 'E2E_STAFF_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
const adminEmail = 'admin@myerp.local';
const adminPassword = '123456789';
const employeePassword = 'Pw_' + runId + '_12345';
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

function authHeaders(token: string) { return { Authorization: 'Bearer ' + token }; }
function storageState(token: string) { return { cookies: [], origins: [{ origin: appBaseURL, localStorage: [{ name: 'token', value: token }] }] }; }

test.describe.serial('Staff employee flow on isolated E2E DB', () => {
  let client: MongoClient;
  let db: any;
  let adminToken = '';
  let employeeToken = '';
  let employeeId = '';
  let employeeEmail = '';
  let branchId = '';
  const createdIds: ObjectId[] = [];
  async function login(email: string, password: string) {
    const api = await request.newContext({ baseURL: apiBaseURL });
    let token = '';
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await api.post('auth/login', { data: { email, password } });
      if (response.status() === 200) { token = (await response.json()).token; break; }
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
    await api.dispose();
    expect(token, 'login should succeed for ' + email).toBeTruthy();
    return token;
  }

  test.beforeAll(async () => {
    assertE2EIsolation();
    client = new MongoClient(mongoUri, { writeConcern: { w: 'majority' } });
    await client.connect();
    db = client.db(dbName);

    const bcrypt = require('bcryptjs');
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await db.collection('users').updateOne(
      { email: adminEmail },
      { $set: { name: 'E2E Staff Admin', email: adminEmail, passwordHash, role: 'ADMIN', status: 'ACTIVE', isRootOwner: true, isActive: true, tokenVersion: 0, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() }, $unset: { deletedAt: '' } },
      { upsert: true },
    );

    const now = new Date();
    const branch = { _id: new ObjectId(), name: 'E2E_STAFF_BRANCH_' + runId, code: ('STF_' + runId).slice(0, 40), isActive: true, createdAt: now, updatedAt: now };
    await db.collection('branches').insertOne(branch);
    branchId = String(branch._id);
    createdIds.push(branch._id);

    adminToken = await login(adminEmail, adminPassword);

    employeeEmail = 'staff_' + runId + '@example.test';
    const adminApi = await request.newContext({ baseURL: apiBaseURL, extraHTTPHeaders: authHeaders(adminToken) });
    const createRes = await adminApi.post('staff', { data: { name: 'E2E Nhan vien ' + runId, email: employeeEmail, password: employeePassword, status: 'ACTIVE', assignedWarehouseIds: [branchId], defaultWarehouseId: branchId } });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    employeeId = created._id || created.id;
    createdIds.push(new ObjectId(employeeId));
    await adminApi.dispose();
    employeeToken = await login(employeeEmail, employeePassword);
  });
  test.afterAll(async () => {
    if (!db) return;
    if (employeeId) await db.collection('users').deleteOne({ _id: new ObjectId(employeeId) });
    for (const id of createdIds) {
      await db.collection('branches').deleteOne({ _id: id });
    }
    if (client) await client.close();
  });

  test('admin staff pages show Vietnamese with diacritics', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageState(adminToken) as any });
    const page = await ctx.newPage();
    await page.goto('/staff/create');
    await expect(page).toHaveURL(/\/staff\/create/);
    await expect(page.getByText('Tạo tài khoản', { exact: false })).toBeVisible();
    await expect(page.getByText('Danh sách tài khoản', { exact: false })).toBeVisible();
    await expect(page.getByText('Thống kê nhân viên', { exact: false })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Quản lý nhân viên' })).toBeVisible();
    await expect(page.getByText('Tên nhân viên', { exact: false })).toBeVisible();
    await expect(page.getByText('Mật khẩu khởi tạo', { exact: false })).toBeVisible();
    await expect(page.getByText('Xác nhận mật khẩu', { exact: false })).toBeVisible();
    await expect(page.getByText('Số điện thoại', { exact: false })).toBeVisible();
    await expect(page.getByText('Kho được phân công', { exact: false })).toBeVisible();
    await expect(page.getByText('Tao tai khoan', { exact: false })).toHaveCount(0);
    await expect(page.getByText('Danh sach tai khoan', { exact: false })).toHaveCount(0);
    await page.goto('/staff/accounts');
    await expect(page).toHaveURL(/\/staff\/accounts/);
    await expect(page.getByText('Từ khóa', { exact: false })).toBeVisible();
    await expect(page.getByText('Tất cả kho', { exact: false })).toBeVisible();
    await page.goto('/staff/stats');
    await expect(page).toHaveURL(/\/staff\/stats/);
    await expect(page.getByText('Lọc thống kê', { exact: false })).toBeVisible();
    await ctx.close();
  });
  test('employee can log in and see only allowed menu', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageState(employeeToken) as any });
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    for (const text of ['Dashboard', 'Sản phẩm', 'Kho hàng', 'Kênh bán', 'Khách hàng', 'Cài đặt']) {
      await expect(page.getByText(text, { exact: false })).toBeVisible();
    }
    for (const text of ['Quản lý nhân viên', 'Báo Cáo']) {
      await expect(page.getByText(text, { exact: false })).toHaveCount(0);
    }
    for (const url of ['/staff/create', '/staff/accounts', '/staff/stats', '/warehouse/branches', '/reports/revenue/time']) {
      await page.goto(url);
      await expect(page).toHaveURL(/\/$/);
    }
    for (const url of ['/products', '/warehouse/transactions', '/sales-channels/store/retail', '/customers/list', '/settings']) {
      await page.goto(url);
      await expect(page.url()).toContain(url);
    }
    await ctx.close();
  });
  test('admin views employee in accounts and stats', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageState(adminToken) as any });
    const page = await ctx.newPage();
    await page.goto('/staff/accounts');
    await expect(page).toHaveURL(/\/staff\/accounts/);
    await expect(page.getByText('Danh sách tài khoản EMPLOYEE', { exact: false })).toBeVisible();
    await expect(page.getByText(employeeEmail)).toBeVisible();
    await page.goto('/staff/stats');
    await expect(page).toHaveURL(/\/staff\/stats/);
    await expect(page.getByText(employeeEmail)).toBeVisible();
    await page.getByText('Lọc thống kê', { exact: false }).click();
    await ctx.close();
  });
});