import { test as setup, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const authFile = path.join(__dirname, '../playwright/.auth/user.json');

setup('authenticate', async ({ page }) => {
  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  await page.goto('/login');
  await page.fill('input[type="email"]', 'admin@myerp.local');
  await page.fill('input[type="password"]', '123456789');
  await page.getByRole('button', { name: /đăng nhập/i }).click();

  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });
  await page.waitForLoadState('networkidle');
  await page.context().storageState({ path: authFile });
});
