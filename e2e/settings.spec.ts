import { expect, test, type Page, type Route } from '@playwright/test';

type MockOptions = {
  failSystem?: boolean;
};

async function mockSettingsApi(page: Page, options: MockOptions = {}) {
  const writes: Array<{ method: string; path: string; body: unknown }> = [];

  await page.addInitScript(() => {
    localStorage.setItem('token', 'local-laravel-token-1-v0');
    localStorage.setItem('authUser', JSON.stringify({
      name: 'Root Owner',
      email: 'owner@example.test',
      role: 'ADMIN',
      isRootOwner: true,
    }));
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) {
      return route.continue();
    }
    const path = url.pathname.replace(/^\/api/, '');
    const method = request.method();

    if (!['GET', 'HEAD'].includes(method)) {
      const body = request.postDataJSON();
      writes.push({ method, path, body });
      if (path === '/settings/store') return json(route, 200, body);
      if (path === '/settings/security/change-owner-account') {
        return json(route, 200, {
          ok: true,
          token: 'local-laravel-token-1-v1',
          user: { _id: '1', name: 'Root Owner', email: body.newEmail || 'owner@example.test', role: 'ADMIN', isRootOwner: true },
        });
      }
      return json(route, 200, { ok: true });
    }

    if (path === '/auth/me') {
      return json(route, 200, { _id: '1', name: 'Root Owner', email: 'owner@example.test', role: 'ADMIN', isRootOwner: true, isActive: true });
    }
    if (path === '/settings/store') {
      return json(route, 200, { shopName: 'LadyStars Mock', logoUrl: '', address: '123 Đường Test', phone: '0900000000', taxCode: '0123456789' });
    }
    if (path === '/settings/security/staff') {
      return json(route, 200, { items: [{ _id: '2', name: 'Nhân viên A', email: 'staff@example.test', status: 'ACTIVE', isActive: true }], total: 1 });
    }
    if (path.startsWith('/system/') && options.failSystem) {
      return json(route, 500, { message: 'Không tải được dữ liệu hệ thống.' });
    }
    if (path === '/system/permissions') {
      return json(route, 200, { items: [{ _id: 'p1', key: 'products.read', label: 'Xem sản phẩm', module: 'products' }], total: 1 });
    }
    if (path === '/system/roles') {
      return json(route, 200, { items: [{ _id: 'r1', name: 'ADMIN', description: 'Quản trị viên', isSystem: true }], total: 1 });
    }
    if (path === '/system/menus') {
      return json(route, 200, { items: [{ _id: 'm1', label: 'Sản phẩm', path: '/products', permission: 'products.read' }], total: 1 });
    }
    if (path === '/audit-logs') {
      return json(route, 200, {
        items: [{
          _id: 'a1',
          action: 'UPDATE_STORE_SETTINGS',
          module: 'settings',
          userName: 'Root Owner',
          resource: 'store-settings',
          resourceId: '1',
          createdAt: '2026-07-20T02:00:00.000Z',
        }],
        total: 51,
        page: Number(url.searchParams.get('page') || 1),
        totalPages: 2,
      });
    }

    return json(route, 404, { message: `Unhandled mock: ${method} ${path}` });
  });

  return writes;
}

test('settings tabs load, navigate, filter and submit through guarded APIs', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  const writes = await mockSettingsApi(page);

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Thiết lập cài đặt' })).toBeVisible();
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(5);
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');

  await tabs.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Bảo mật' })).toBeFocused();
  await expect(page).toHaveURL(/settings\?tab=security/);
  await expect(page.getByRole('heading', { name: 'Đổi email & mật khẩu Root Owner' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bảo mật nhân viên' })).toBeVisible();

  await page.getByRole('tab', { name: 'Cửa hàng' }).click();
  const shopName = page.getByLabel('Tên shop *');
  await shopName.fill('LadyStars Đã nâng cấp');
  await expect(page.getByText('Chưa lưu')).toBeVisible();
  await page.getByRole('button', { name: 'Lưu cấu hình' }).click();
  await expect(page.getByRole('status')).toContainText('Đã lưu cấu hình cửa hàng');
  expect(writes.some((item) => item.method === 'PATCH' && item.path === '/settings/store')).toBeTruthy();

  await page.getByRole('tab', { name: 'Quyền & menu' }).click();
  await expect(page.getByRole('columnheader', { name: 'Mã quyền' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'products.read' }).first()).toBeVisible();
  await expect(page.getByText('/products')).toBeVisible();

  await page.getByRole('tab', { name: 'Audit log' }).click();
  await expect(page.getByText('UPDATE_STORE_SETTINGS')).toBeVisible();
  await page.getByLabel('Từ khóa').fill('Root Owner');
  const auditRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname.endsWith('/api/audit-logs') && url.searchParams.get('q') === 'Root Owner';
  });
  await page.getByRole('button', { name: 'Áp dụng' }).click();
  await auditRequest;
  await expect(page.getByText('Trang 1 / 2')).toBeVisible();

  await page.getByRole('tab', { name: 'Nguy hiểm' }).click();
  await expect(page.getByRole('heading', { name: 'Thao tác nhạy cảm' })).toBeVisible();
  await page.getByRole('button', { name: 'Thu hồi toàn bộ phiên' }).click();
  await expect(page.locator('.settings-notice[role="status"]')).toContainText('Đã thu hồi toàn bộ phiên');
  expect(writes.some((item) => item.path === '/settings/security/logout-user-sessions')).toBeTruthy();
  expect(browserErrors).toEqual([]);
});

test('settings reports API errors instead of showing false empty states', async ({ page }) => {
  await mockSettingsApi(page, { failSystem: true });
  await page.goto('/settings?tab=system');
  await expect(page.getByRole('tab', { name: 'Quyền & menu' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('alert')).toContainText('Không tải được dữ liệu hệ thống.');
});

test('settings remains usable without horizontal overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSettingsApi(page);
  await page.goto('/settings?tab=audit');
  await expect(page.getByRole('heading', { name: 'Audit log', exact: true })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
  await expect(page.getByRole('button', { name: 'Trang sau' })).toBeVisible();
});

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}
