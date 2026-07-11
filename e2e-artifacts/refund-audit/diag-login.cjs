const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ headless: true });
  const c = await b.newContext();
  const p = await c.newPage();
  const mutationLog = [];

  await p.route('**/api/**', async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    const url = req.url();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return route.continue();
    if (/\/auth\/login/i.test(url) && method === 'POST') {
      mutationLog.push({ allowed: true, url });
      return route.continue();
    }
    mutationLog.push({ allowed: false, url, method });
    return route.abort('failed');
  });

  p.on('requestfailed', (req) => {
    console.log('FAILED', req.method(), req.url().slice(0, 120), req.failure()?.errorText);
  });

  await p.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.fill('#login-email', 'admin@gmail.com');
  await p.fill('#login-password', '123456');
  const res = await Promise.all([
    p
      .waitForResponse((r) => r.url().includes('/auth/login') && r.request().method() === 'POST', { timeout: 20000 })
      .catch((e) => ({ err: e.message })),
    p.locator('button[type=submit]').first().click(),
  ]);
  console.log('loginRes', res[0]?.status ? res[0].status() : res[0]);
  await p.waitForTimeout(1000);
  console.log('url', p.url());
  console.log('token', await p.evaluate(() => !!localStorage.getItem('token')));
  console.log('mutationLog', mutationLog);
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
