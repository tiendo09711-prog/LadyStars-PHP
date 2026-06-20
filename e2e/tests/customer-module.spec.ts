import { expect, test } from '@playwright/test';

const API = 'http://localhost:4000/api';
const stamp = Date.now();
const TEST_CUSTOMER = {
  code: `ACT-KH-${stamp}`,
  name: `Khách ACT ${stamp}`,
  phone: `0988${String(stamp).slice(-6)}`,
};

async function authHeaders(page: any) {
  const token = await page.evaluate(() => localStorage.getItem('token'));
  return { Authorization: `Bearer ${token}` };
}

async function firstBranchId(page: any) {
  if (page.url() === 'about:blank') {
    await page.goto('http://localhost:5173/customers/list');
  }
  const headers = await authHeaders(page);
  const response = await page.request.get(`${API}/system/branches?limit=5`, { headers });
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  const branch = data.items?.[0];
  expect(branch?._id).toBeTruthy();
  return branch._id as string;
}

async function cleanupCustomer(page: any, customerId: string | null) {
  if (!customerId) return;
  const headers = await authHeaders(page);
  await page.request.delete(`${API}/customers/customers/${customerId}`, { headers }).catch(() => null);
}

test.describe.serial('Customer module ACT flow', () => {
  let createdCustomerId: string | null = null;

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'playwright/.auth/user.json' });
    const page = await context.newPage();
    await page.goto('http://localhost:5173/customers/list');
    await cleanupCustomer(page, createdCustomerId);
    await context.close();
  });

  test('renders single-page filters and replaces old tabs with presets', async ({ page }) => {
    await page.goto('/customers/list');
    await expect(page.getByTestId('customers-list-page')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tất cả' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Mua nhiều' })).toHaveCount(0);

    const initialResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.endsWith('/api/customers/customers') && response.status() === 200;
    });
    await initialResponse;

    const presetResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.endsWith('/api/customers/customers')
        && url.searchParams.get('preset') === 'buyalot'
        && url.searchParams.get('purchaseCountMin') === '4'
        && response.status() === 200;
    });
    await page.getByTestId('customers-preset-filter').selectOption('buyalot');
    await presetResponse;

    await expect(page.getByTestId('customers-filter-chips')).toContainText('Lần mua từ: 4');
    await expect(page).toHaveURL(/preset=buyalot/);

    await expect(page.getByTestId('customers-advanced-panel')).toBeVisible();
  });

  test('creates a customer from /customers/list and shows it in the table', async ({ page }) => {
    await page.goto('/customers/list');
    await page.getByTestId('add-customer-button').click();
    await expect(page.locator('.customer-modal')).toBeVisible();

    await page.getByLabel('Mã khách').fill(TEST_CUSTOMER.code);
    await page.getByLabel('Tên khách hàng *').fill(TEST_CUSTOMER.name);
    await page.getByLabel('Số điện thoại').first().fill(TEST_CUSTOMER.phone);
    await page.getByRole('button', { name: 'Lưu khách hàng' }).click();

    await expect(page.locator('.customer-modal')).toHaveCount(0);

    const searchResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.endsWith('/api/customers/customers')
        && url.searchParams.get('keyword') === TEST_CUSTOMER.code
        && response.status() === 200;
    });
    await page.getByTestId('customers-keyword-filter').fill(TEST_CUSTOMER.code);
    await page.getByRole('button', { name: /^Lọc$/ }).click();
    await searchResponse;

    const row = page.locator('tr', { hasText: TEST_CUSTOMER.code }).first();
    await expect(row).toContainText(TEST_CUSTOMER.name);

    const headers = await authHeaders(page);
    const lookup = await page.request.get(`${API}/customers/customers?code=${TEST_CUSTOMER.code}&limit=5`, { headers });
    const payload = await lookup.json();
    createdCustomerId = payload.items?.[0]?._id || null;
    expect(createdCustomerId).toBeTruthy();
  });

  test('reuses the same customer source in retail and wholesale pickers', async ({ page }) => {
    test.skip(!createdCustomerId, 'Customer from previous test was not created');

    const branchId = await firstBranchId(page);

    await page.goto(`/sales-channels/store/retail/create?branchId=${branchId}`);
    await expect(page.getByPlaceholder('Nhập họ tên hoặc số điện thoại')).toBeVisible();
    const retailSuggestionResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.endsWith('/api/customers/customers')
        && url.searchParams.get('keyword') === TEST_CUSTOMER.name
        && response.status() === 200;
    });
    await page.getByPlaceholder('Nhập họ tên hoặc số điện thoại').fill(TEST_CUSTOMER.name);
    await retailSuggestionResponse;
    await expect(page.locator('.customer-search .create-dropdown button').filter({ hasText: TEST_CUSTOMER.name }).first()).toBeVisible();

    await page.goto(`/sales-channels/store/wholesale/create?branchId=${branchId}`);
    const wholesaleSuggestionResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.endsWith('/api/customers/customers')
        && url.searchParams.get('keyword') === TEST_CUSTOMER.name
        && response.status() === 200;
    });
    await page.getByPlaceholder('Tên khách đại lý / sỉ').fill(TEST_CUSTOMER.name);
    await wholesaleSuggestionResponse;
    await expect(page.locator('div').filter({ hasText: `${TEST_CUSTOMER.name} - ${TEST_CUSTOMER.phone}` }).first()).toBeVisible();
  });
});
