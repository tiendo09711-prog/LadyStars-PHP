const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('response', (response) => {
    if (response.url().includes('/auth/login')) {
      console.log('loginStatus', response.status(), response.url());
    }
  });

  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle', timeout: 20000 });
  await page.fill('#login-email', 'admin@gmail.com');
  await page.fill('#login-password', '123456');
  await page.locator('form.login-card button[type="submit"]').click();
  await page.waitForTimeout(3000);

  const errors = await page.locator('[class*="error"], .login-alert, .login-field-error').allTextContents().catch(() => []);
  console.log('errors', errors);
  console.log('url', page.url());
  console.log('token', await page.evaluate(() => localStorage.getItem('token')));

  if (!page.url().endsWith('/') || page.url().includes('login')) {
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }

  const hasDash = await page.locator('[data-testid="dashboard-page"]').count();
  console.log('dashboardNodes', hasDash, 'url', page.url());

  if (hasDash > 0) {
    await page.screenshot({ path: 'client/dist/dashboard-desktop-check.png', fullPage: true });
    const desktop = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    console.log('desktop', desktop);

    const menuCount = await page.locator('.menu-group-title').count();
    console.log('menuButtons', menuCount);
    if (menuCount > 0) {
      await page.locator('.menu-group-title').nth(1).hover();
      await page.waitForTimeout(400);
      await page.screenshot({ path: 'client/dist/dashboard-nav-hover.png' });
    }

    const filterBtn = page.locator('[data-testid="store-filter-button"]');
    if (await filterBtn.count()) {
      await filterBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'client/dist/dashboard-filter-open.png' });
      await page.keyboard.press('Escape');
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'client/dist/dashboard-mobile-check.png', fullPage: true });
    const mobile = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    console.log('mobile', mobile);
  }

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
