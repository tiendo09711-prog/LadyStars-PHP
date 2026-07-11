const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const out = [];
  const log = (...a) => {
    const s = a.map(String).join(' ');
    out.push(s);
    console.log(s);
  };
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();
  p.on('console', (m) => log('console', m.type(), m.text().slice(0, 300)));
  p.on('pageerror', (e) => log('pageerror', e.message));
  p.on('response', (r) => {
    if (r.url().includes('/api/') || r.status() >= 400) log('resp', r.status(), r.request().method(), r.url().slice(0, 160));
  });
  p.on('requestfailed', (r) => log('reqfail', r.url().slice(0, 160), r.failure()?.errorText));

  try {
    await p.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await p.waitForTimeout(1000);
    log('url1', p.url());
    log('email count', await p.locator('#login-email').count());
    log('body1', (await p.locator('body').innerText()).slice(0, 200));
    await p.fill('#login-email', 'admin@gmail.com');
    await p.fill('#login-password', '123456');
    const [resp] = await Promise.all([
      p.waitForResponse((r) => r.url().includes('/auth/login'), { timeout: 20000 }).catch((e) => {
        log('wait login err', e.message);
        return null;
      }),
      p.locator('form.login-card button[type="submit"]').click(),
    ]);
    if (resp) log('login status', resp.status(), (await resp.text()).slice(0, 200));
    await p.waitForTimeout(1500);
    const token = await p.evaluate(() => localStorage.getItem('token'));
    log('token', !!token, 'url2', p.url());
    log('body2', (await p.locator('body').innerText()).slice(0, 250));
    await p.screenshot({ path: path.join(__dirname, 'diag-login.png'), fullPage: true });
  } catch (e) {
    log('FATAL', e.message || e);
  }
  fs.writeFileSync(path.join(__dirname, 'diag-login.txt'), out.join('\n'));
  await b.close();
})();
