# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.setup.ts >> authenticate
- Location: tests\auth.setup.ts:7:6

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/login
Call log:
  - navigating to "http://localhost:5173/login", waiting until "load"

```

# Test source

```ts
  1  | import { test as setup, expect } from '@playwright/test';
  2  | import path from 'path';
  3  | import fs from 'fs';
  4  | 
  5  | const authFile = path.join(__dirname, '../playwright/.auth/user.json');
  6  | 
  7  | setup('authenticate', async ({ page }) => {
  8  |   // Ensure the directory exists
  9  |   fs.mkdirSync(path.dirname(authFile), { recursive: true });
  10 | 
> 11 |   await page.goto('/login');
     |              ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/login
  12 |   
  13 |   // Fill credentials
  14 |   await page.fill('input[type="email"]', 'admin@gmail.com');
  15 |   await page.fill('input[type="password"]', '123456');
  16 |   
  17 |   // Click login
  18 |   await page.click('button:has-text("Đăng nhập")');
  19 |   
  20 |   // Wait until the dashboard/navigation appears (indicating successful login)
  21 |   // We can look for the sidebar menu toggle or a generic dashboard element
  22 |   await page.waitForURL('**/sales-channels/**', { timeout: 5000 }).catch(() => {
  23 |     // If it doesn't redirect as expected, just wait network idle
  24 |   });
  25 |   await page.waitForLoadState('networkidle');
  26 | 
  27 |   // Save authentication state
  28 |   await page.context().storageState({ path: authFile });
  29 | });
  30 | 
```