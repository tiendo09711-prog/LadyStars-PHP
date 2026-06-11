import { test as setup, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const authFile = path.join(__dirname, '../playwright/.auth/user.json');

setup('authenticate', async ({ page }) => {
  // Ensure the directory exists
  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  await page.goto('/login');
  
  // Fill credentials
  await page.fill('input[type="email"]', 'admin@gmail.com');
  await page.fill('input[type="password"]', '123456');
  
  // Click login
  await page.click('button:has-text("Đăng nhập")');
  
  // Wait until the dashboard/navigation appears (indicating successful login)
  // We can look for the sidebar menu toggle or a generic dashboard element
  await page.waitForURL('**/sales-channels/**', { timeout: 5000 }).catch(() => {
    // If it doesn't redirect as expected, just wait network idle
  });
  await page.waitForLoadState('networkidle');

  // Save authentication state
  await page.context().storageState({ path: authFile });
});
