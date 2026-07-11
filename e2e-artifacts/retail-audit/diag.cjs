const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://localhost:5173/login');
  await p.fill('#login-email', 'admin@gmail.com');
  await p.fill('#login-password', '123456');
  await p.click('form.login-card button[type="submit"]');
  await p.waitForTimeout(1500);

  const me = await p.evaluate(async () => {
    const t = localStorage.getItem('token');
    const r = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + t } });
    const j = await r.json();
    return {
      status: r.status,
      role: j.role || j.user?.role,
      email: j.email || j.user?.email,
      topKeys: Object.keys(j).slice(0, 20),
      hasUserNest: !!j.user,
    };
  });
  console.log('me', JSON.stringify(me));

  await p.goto('http://localhost:5173/sales-channels/store/retail', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);

  const text = await p.locator('.retail-invoice-page').innerText();
  const samples = ['Tổng hóa đơn', 'Bán lẻ', 'Hóa đơn', 'Đang hiển thị', 'Đã thu trang'];
  const found = Object.fromEntries(samples.map((s) => [s, text.includes(s)]));
  const moji = /BÃ¡n|HÃ³a|Ä‘|Æ¡/.test(text);
  const idx = text.search(/Ã[¡-¿]|Ä|Æ|Â/);
  console.log('found', found);
  console.log('mojiStrict', moji, 'idx', idx);
  if (idx >= 0) console.log('snippet', JSON.stringify(text.slice(Math.max(0, idx - 30), idx + 50)));
  console.log('has404text', text.includes('404'));
  console.log('textHead', JSON.stringify(text.slice(0, 400)));

  // wait for auth/me effect
  await p.waitForTimeout(1000);
  await p.locator('button.retail-row-menu-button').first().click();
  await p.waitForTimeout(400);
  let items = [];
  try {
    items = await p.locator('.retail-row-action-menu button').allTextContents();
  } catch {}
  console.log('menu', items);
  await p.screenshot({ path: 'e2e-artifacts/retail-audit/screenshots/diag-menu.png', fullPage: true });

  // payment methods
  const pay = await p.evaluate(async () => {
    const t = localStorage.getItem('token');
    const r = await fetch('/api/products/payment-methods/standard?limit=500', {
      headers: { Authorization: 'Bearer ' + t },
    });
    const body = await r.text();
    return { status: r.status, body: body.slice(0, 200) };
  });
  console.log('paymentMethods', pay);

  // print path
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  await p.locator('button.retail-row-menu-button').first().click();
  await p.waitForTimeout(300);
  const ctx = p.context();
  const popupP = ctx.waitForEvent('page', { timeout: 10000 }).catch(() => null);
  await p.locator('.retail-row-action-menu button').filter({ hasText: 'In hóa đơn' }).first().click();
  const popup = await popupP;
  if (popup) {
    await popup.waitForTimeout(2000);
    const html = await popup.content();
    console.log('printPopup', { url: popup.url(), len: html.length, head: html.slice(0, 300).replace(/\s+/g, ' ') });
    await popup.screenshot({ path: 'e2e-artifacts/retail-audit/screenshots/diag-print.png' }).catch(() => {});
    await popup.close().catch(() => {});
  } else {
    console.log('printPopup none');
  }

  // mobile overflow elements
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto('http://localhost:5173/sales-channels/store/retail');
  await p.waitForTimeout(2000);
  const overflow = await p.evaluate(() => {
    const doc = document.documentElement;
    const all = [...document.querySelectorAll('*')];
    const offenders = [];
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.right > doc.clientWidth + 2 && r.width > 0) {
        offenders.push({
          tag: el.tagName,
          cls: String(el.className).slice(0, 80),
          right: Math.round(r.right),
          width: Math.round(r.width),
        });
        if (offenders.length >= 8) break;
      }
    }
    return { sw: doc.scrollWidth, cw: doc.clientWidth, offenders };
  });
  console.log('mobileOverflow', JSON.stringify(overflow, null, 2));
  await p.screenshot({ path: 'e2e-artifacts/retail-audit/screenshots/diag-mobile.png', fullPage: true });

  // auth/me shape used by page
  const authShape = await p.evaluate(async () => {
    const t = localStorage.getItem('token');
    const r = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + t } });
    return r.json();
  });
  // redact
  const redacted = {
    keys: Object.keys(authShape || {}),
    role: authShape.role || authShape.user?.role,
    nestedUserRole: authShape.user?.role,
    hasEmail: !!(authShape.email || authShape.user?.email),
  };
  console.log('authShape', redacted);

  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
