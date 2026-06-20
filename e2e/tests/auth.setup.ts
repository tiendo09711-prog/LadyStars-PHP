import { test as setup, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const authFile = path.join(__dirname, '../playwright/.auth/user.json');

setup('authenticate', async ({ page }) => {
  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  const candidates = [
    { email: 'admin@gmail.com', password: '123456' },
    { email: 'admin@myerp.local', password: '123456789' },
  ];

  let token = '';
  for (const candidate of candidates) {
    const response = await page.request.post('http://localhost:4000/api/auth/login', {
      data: candidate,
    });
    if (!response.ok()) continue;
    token = (await response.json()).token || '';
    if (token) break;
  }

  expect(token).toBeTruthy();
  await page.addInitScript((value) => {
    window.localStorage.setItem('token', value);
  }, token);
  await page.goto('/');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });
  await page.waitForLoadState('networkidle');
  await page.context().storageState({ path: authFile });
});
