const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  p.on('response', async (r) => {
    if (r.url().includes('/api/')) {
      logs.push({ status: r.status(), url: r.url().slice(0, 180), method: r.request().method() });
    }
  });
  p.on('console', (m) => {
    if (m.type() === 'error') logs.push({ console: m.text().slice(0, 200) });
  });

  await p.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#login-email');
  await p.fill('#login-email', 'admin@gmail.com');
  await p.fill('#login-password', '123456');
  const [loginRes] = await Promise.all([
    p.waitForResponse((r) => r.url().includes('/auth/login') && r.request().method() === 'POST'),
    p.click('form.login-card button[type="submit"]'),
  ]);
  console.log('loginStatus', loginRes.status());
  await p.waitForFunction(() => !!localStorage.getItem('token'), { timeout: 10000 }).catch(() => null);
  console.log('token', await p.evaluate(() => !!localStorage.getItem('token')), 'url', p.url());

  await p.goto('http://localhost:5173/sales-channels/store/retail', { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(3000);
  const text = await p.locator('.retail-invoice-page').innerText().catch(() => 'NO_PAGE');
  console.log('textHead', JSON.stringify(text.slice(0, 500)));
  console.log('rows', await p.locator('button.retail-invoice-link').count());
  console.log('branches options', await p.getByLabel('Cửa hàng').locator('option').count().catch(() => -1));
  console.log('alert', await p.locator('.retail-alert').innerText().catch(() => ''));
  console.log('apiLogs', JSON.stringify(logs.filter((x) => x.url || x.console).slice(-20), null, 2));

  const evalApi = await p.evaluate(async () => {
    const t = localStorage.getItem('token');
    const h = { Authorization: 'Bearer ' + t };
    const sales = await fetch('/api/products/sales?type=retail&channel=store&page=1&limit=15', { headers: h });
    const branches = await fetch('/api/system/branches?limit=5000', { headers: h });
    const sj = await sales.json();
    const bj = await branches.json();
    return {
      salesStatus: sales.status,
      salesTotal: sj.total,
      salesItems: (sj.items || []).length,
      firstValue: sj.items?.[0]?.value,
      branchStatus: branches.status,
      branchCount: Array.isArray(bj) ? bj.length : (bj.items || []).length,
    };
  });
  console.log('evalApi', evalApi);
  await p.screenshot({ path: 'e2e-artifacts/retail-fix-verify/screenshots/diag2.png', fullPage: true });
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
