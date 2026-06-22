import { expect, test } from '@playwright/test';
import {
  cleanupBranchConfigFixtures,
  closeDB,
  countDefaultBranches,
  createCompletedSale,
  createEmployeeFixture,
  createEmptyBranch,
  createRetailFixture,
  findBranchByCode,
  runIsolatedBranchMigrationCheck,
  updateBranchConfig,
  updateStoreSetting,
} from '../utils/db';

const API = 'http://localhost:4000/api';
const PREFIX = 'E2E_BRANCH_CONFIG_';
const cleanupPrefixes = new Set<string>();

async function resolveAdminCredentials(request: any) {
  const candidates = [
    { email: 'admin@gmail.com', password: '123456' },
    { email: 'admin@myerp.local', password: '123456789' },
  ];

  for (const candidate of candidates) {
    const response = await request.post(`${API}/auth/login`, { data: candidate });
    if (!response.ok()) continue;
    const payload = await response.json();
    if (payload?.token) return { ...candidate, token: payload.token };
  }

  throw new Error('Unable to resolve admin credentials for E2E branch tests');
}

async function loginWithToken(page: any, token: string) {
  await page.goto('/login');
  await page.evaluate((value) => {
    window.localStorage.setItem('token', value);
  }, token);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
}

test.describe('Warehouse branches config', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test.afterAll(async () => {
    for (const prefix of cleanupPrefixes) {
      await cleanupBranchConfigFixtures(prefix);
    }
    await closeDB();
  });

  test('admin manages branch config safely and employee is blocked', async ({ page, request }) => {
    const scenarioPrefix = `${PREFIX}${Date.now()}_ADMIN_`;
    cleanupPrefixes.add(scenarioPrefix);

    const admin = await resolveAdminCredentials(request);
    const protectedFixture = await createRetailFixture(scenarioPrefix, 1);
    await createEmployeeFixture(scenarioPrefix, protectedFixture.branch._id, '12345678');

    await page.goto('/warehouse/branches');
    await expect(page.getByRole('heading', { name: 'Cấu hình kho hàng' })).toBeVisible();
    await expect(page.getByText('Cấu hình kho hàng').first()).toBeVisible();

    const invalidCode = `${scenarioPrefix}WRONG`.slice(0, 28);
    await page.getByRole('button', { name: 'Thêm kho hàng' }).click();
    await page.getByLabel('Tên kho').fill(`${scenarioPrefix} Wrong Password`);
    await page.getByLabel('Mã kho').fill(invalidCode);
    await page.getByLabel('Địa chỉ').fill('12 Test Street');
    await page.getByLabel('Hotline').fill('0901000001');
    await page.getByRole('button', { name: /Cấu hình in hóa đơn/ }).click();
    await page.getByLabel('Tên thương hiệu').fill(`${scenarioPrefix} Brand Wrong`);
    await page.getByRole('button', { name: 'Tạo kho hàng' }).click();
    await page.getByRole('dialog').getByLabel('Nhập lại mật khẩu Admin').fill('wrong-password');
    await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận' }).click();
    await expect(page.getByText('Mật khẩu Admin không đúng.')).toBeVisible();
    expect(await findBranchByCode(invalidCode)).toBeNull();

    const branchCode = `${scenarioPrefix}MAIN`.slice(0, 28);
    await page.getByLabel('Tên kho').fill(`${scenarioPrefix} Main Branch`);
    await page.getByLabel('Mã kho').fill(branchCode);
    await page.getByLabel('Địa chỉ').fill('101 Branch Road');
    await page.getByLabel('Hotline').fill('0902000002');
    await page.getByLabel('Tên thương hiệu').fill(`${scenarioPrefix} Brand`);
    await page.getByRole('button', { name: 'Tạo kho hàng' }).click();
    await page.getByRole('dialog').getByLabel('Nhập lại mật khẩu Admin').fill(admin.password);
    await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận' }).click();
    await expect(page.getByText('Đã tạo kho hàng mới.')).toBeVisible();

    const createdBranch = await findBranchByCode(branchCode);
    expect(createdBranch).not.toBeNull();
    expect(createdBranch?.invoiceProfile?.templateId).toBe('retail-a4-classic');
    expect(createdBranch?.invoiceProfile?.displayName).toBe(`${scenarioPrefix} Brand`);

    await page.getByRole('button', { name: `${scenarioPrefix} Main Branch` }).click();
    await expect(page.getByLabel('Mã kho')).toHaveValue(branchCode);

    await page.getByLabel('Tên kho').fill(`${scenarioPrefix} Main Branch Updated`);
    await page.getByLabel('Địa chỉ').fill('102 Branch Road');
    await page.getByLabel('Hotline').fill('0903000003');
    await page.getByLabel('Tên thương hiệu').fill(`${scenarioPrefix} Brand Updated`);
    await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
    await page.getByRole('dialog').getByLabel('Nhập lại mật khẩu Admin').fill(admin.password);
    await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận' }).click();
    await expect(page.getByText('Đã lưu thay đổi kho hàng.')).toBeVisible();

    const updatedBranch = await findBranchByCode(branchCode);
    expect(updatedBranch?.name).toBe(`${scenarioPrefix} Main Branch Updated`);
    expect(updatedBranch?.address).toBe('102 Branch Road');
    expect(updatedBranch?.phone).toBe('0903000003');
    expect(updatedBranch?.code).toBe(branchCode);
    expect(updatedBranch?.invoiceProfile?.displayName).toBe(`${scenarioPrefix} Brand Updated`);
    await expect(page.locator('input[type="password"]')).toHaveCount(0);

    const actionPanel = page.locator('.warehouse-actions-row');

    await actionPanel.getByRole('button', { name: 'Đặt làm kho mặc định' }).click();
    await page.getByRole('dialog').getByLabel('Nhập lại mật khẩu Admin').fill(admin.password);
    await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận' }).click();
    await expect(page.getByText('Đã cập nhật kho mặc định.')).toBeVisible();
    expect(await countDefaultBranches()).toBe(1);

    await actionPanel.getByRole('button', { name: 'Ngừng hoạt động' }).click();
    await page.getByRole('dialog').getByLabel('Nhập lại mật khẩu Admin').fill(admin.password);
    await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận' }).click();
    await expect(page.getByText('Không thể ngừng hoạt động kho mặc định khi chưa có kho mặc định hoạt động khác.')).toBeVisible();

    await page.getByRole('button', { name: protectedFixture.branch.name }).click();
    await actionPanel.getByRole('button', { name: 'Đặt làm kho mặc định' }).click();
    await page.getByRole('dialog').getByLabel('Nhập lại mật khẩu Admin').fill(admin.password);
    await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận' }).click();
    expect(await countDefaultBranches()).toBe(1);

    await page.getByRole('button', { name: `${scenarioPrefix} Main Branch Updated` }).click();
    await actionPanel.getByRole('button', { name: 'Ngừng hoạt động' }).click();
    await page.getByRole('dialog').getByLabel('Nhập lại mật khẩu Admin').fill(admin.password);
    await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận' }).click();
    await expect(page.getByText('Kho hàng đã được chuyển sang ngừng hoạt động.')).toBeVisible();

    const deleteBlocked = await request.delete(`${API}/system/branches/${protectedFixture.branch._id}`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      data: { adminPassword: admin.password },
    });
    expect(deleteBlocked.status()).toBe(409);
    const blockedPayload = await deleteBlocked.json();
    expect(String(blockedPayload.message || '')).toMatch(/Không thể xóa kho/);
    expect(blockedPayload.usage.totalLinked).toBeGreaterThan(0);
    expect(await findBranchByCode(protectedFixture.branch.code)).not.toBeNull();

    await actionPanel.getByRole('button', { name: 'Xóa vĩnh viễn' }).click();
    await page.getByRole('dialog').getByLabel('Nhập lại mật khẩu Admin').fill(admin.password);
    await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận' }).click();
    await expect(page.getByText('Đã xóa kho hàng trống.')).toBeVisible();
    expect(await findBranchByCode(branchCode)).toBeNull();
  });

  test('employee cannot see the menu, cannot open route, and cannot call branch mutation API', async ({ browser, request }) => {
    const scenarioPrefix = `${PREFIX}${Date.now()}_EMP_`;
    cleanupPrefixes.add(scenarioPrefix);

    const fixture = await createRetailFixture(scenarioPrefix, 1);
    const employee = await createEmployeeFixture(scenarioPrefix, fixture.branch._id, '12345678');

    const loginResponse = await request.post(`${API}/auth/login`, {
      data: { email: employee.email, password: employee.password },
    });
    expect(loginResponse.ok()).toBeTruthy();
    const loginPayload = await loginResponse.json();
    const token = loginPayload.token;

    const context = await browser.newContext();
    const page = await context.newPage();
    await loginWithToken(page, token);

    await expect(page.getByText('Cấu hình kho hàng')).toHaveCount(0);
    await page.goto('/warehouse/branches');
    await expect(page).toHaveURL(/\/$/);

    const mutationResponse = await request.post(`${API}/system/branches`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: `${scenarioPrefix} Employee Forbidden`,
        code: `${scenarioPrefix}EMP`.slice(0, 28),
        address: 'Forbidden Street',
        phone: '0909999999',
        adminPassword: employee.password,
      },
    });
    expect(mutationResponse.status()).toBe(403);
    await context.close();
  });

  test('print invoice uses brand profile, branch address and footer without promoting branch name to heading', async ({ page, request }) => {
    const scenarioPrefix = `${PREFIX}${Date.now()}_PRINT_`;
    cleanupPrefixes.add(scenarioPrefix);

    const fixture = await createRetailFixture(scenarioPrefix, 1);
    const admin = await resolveAdminCredentials(request);
    await updateStoreSetting({ shopName: 'LadyStars Test Brand', logoUrl: 'https://example.com/logo.png' });
    await updateBranchConfig(fixture.branch._id, {
      address: '55 Branch Address Test',
      phone: '0905555555',
      invoiceProfile: {
        displayName: 'LadyStars Signature',
        templateId: 'retail-a4-classic',
        footerText: 'Footer từ profile branch',
        showBranchName: true,
        showCashier: true,
        showProductCode: true,
        showLogo: false,
      },
    });

    const sale = await createCompletedSale(page.request, { Authorization: `Bearer ${admin.token}` }, {
      code: `${scenarioPrefix}SALE`,
      branchId: String(fixture.branch._id),
      customerId: String(fixture.customer._id),
      paymentMethodId: String(fixture.paymentMethods.cash._id),
      items: [{ productId: String(fixture.products[0]._id), amount: 1, value: fixture.products[0].price }],
    });

    await page.goto('/sales-channels/store/retail');
    await page.waitForResponse((response) => response.url().includes('/api/products/sales?') && response.status() === 200);
    await page.getByPlaceholder('Nhập mã hóa đơn').fill(sale.code);
    await page.getByRole('button', { name: /^Lọc$/ }).click();
    await page.waitForResponse((response) => response.url().includes(`invoiceCode=${sale.code}`) && response.status() === 200);

    await page.evaluate(() => {
      (window as any).__printHtml = '';
      window.open = () => {
        let html = '';
        return {
          document: {
            open() { html = ''; },
            write(chunk: string) { html += String(chunk || ''); },
            close() { (window as any).__printHtml = html; },
          },
          focus() {},
          print() {},
          close() {},
        } as any;
      };
    });

    await page.locator('.retail-row-menu button').first().click();
    await page.getByRole('button', { name: 'In hóa đơn', exact: true }).click();
    await expect.poll(async () => page.evaluate(() => (window as any).__printHtml || '')).toContain('@page { size: 80mm auto; margin: 0; }');

    const printHtml = await page.evaluate(() => (window as any).__printHtml || '');
    expect(printHtml).toContain('@page { size: 80mm auto; margin: 0; }');
    expect(printHtml).toContain('LadyStars Signature');
    expect(printHtml).not.toContain(`<div class="brand">${fixture.branch.name}</div>`);
    expect(printHtml).toContain('55 Branch Address Test');
    expect(printHtml).toContain('0905555555');
    expect(printHtml).toContain('Kho:');
    expect(printHtml).toContain('Footer từ profile branch');
  });

  test('branch migration helper is idempotent in isolated database', async () => {
    const scenarioPrefix = `${PREFIX}${Date.now()}_MIG_`;
    const result = await runIsolatedBranchMigrationCheck(scenarioPrefix);
    expect(result.branchCount).toBe(2);
    expect(result.stockCount).toBe(2);
    expect(result.first.productBranchStocksBackfilled).toBe(2);
    expect(result.second.productBranchStocksBackfilled).toBe(0);
    expect(result.second.documentsBackfilled).toBe(0);
  });
});
