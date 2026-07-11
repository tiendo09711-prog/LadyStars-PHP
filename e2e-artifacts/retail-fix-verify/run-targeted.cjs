/**
 * Targeted Playwright retest for retail fixes A–F.
 * READ-ONLY: no create/edit/delete/return/customer upsert.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const EMAIL = process.env.E2E_EMAIL || 'admin@gmail.com';
const PASSWORD = process.env.E2E_PASSWORD || '123456';
const OUT = __dirname;
const SHOT = path.join(OUT, 'screenshots');
fs.mkdirSync(SHOT, { recursive: true });

const results = [];
const network = { status4xx: [], status5xx: [], writes: [] };
const consoleErrors = [];
const pageErrors = [];

function rec(id, status, detail = {}) {
  results.push({ id, status, ...detail, t: new Date().toISOString() });
  console.log(`[${status}] ${id}${detail.notes ? ' — ' + detail.notes : ''}`);
}

async function shot(page, name) {
  const p = path.join(SHOT, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  return p;
}

async function login(page) {
  // Prefer API login to avoid flaky form/network race; still exercise UI with real token.
  const apiLogin = await page.request.post('http://127.0.0.1:8000/api/auth/login', {
    data: { email: EMAIL, password: PASSWORD },
  }).catch(() => null);
  if (apiLogin && apiLogin.ok()) {
    const body = await apiLogin.json();
    if (body.token) {
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.evaluate((token) => {
        localStorage.setItem('token', token);
      }, body.token);
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(400);
      return page.evaluate(() => !!localStorage.getItem('token'));
    }
  }

  // Fallback: UI form login
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#login-email', { timeout: 15000 });
  await page.fill('#login-email', EMAIL);
  await page.fill('#login-password', PASSWORD);
  await page.locator('form.login-card button[type="submit"]').click();
  await page.waitForFunction(() => !!localStorage.getItem('token'), { timeout: 15000 }).catch(() => {});
  if (page.url().includes('/login')) {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  }
  return page.evaluate(() => !!localStorage.getItem('token'));
}

async function waitRetail(page) {
  await page.waitForURL(/\/sales-channels\/store\/retail/, { timeout: 20000 }).catch(() => {});
  await page.waitForSelector('.retail-invoice-page, .retail-root', { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('.retail-skeleton').length === 0, { timeout: 30000 }).catch(() => {});
  // Wait list request settlement: either rows, empty state, or error alert
  await page.waitForFunction(() => {
    const rows = document.querySelectorAll('button.retail-invoice-link').length;
    const empty = document.querySelectorAll('.retail-empty-state').length;
    const alert = document.querySelectorAll('.retail-alert').length;
    const kpi = document.querySelector('.retail-kpi-card .retail-kpi-value');
    return rows > 0 || empty > 0 || alert > 0 || (kpi && kpi.textContent && kpi.textContent.trim() !== '');
  }, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(300);
}

async function bodyOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return { sw: doc.scrollWidth, cw: doc.clientWidth, ok: doc.scrollWidth <= doc.clientWidth + 1 };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
  // Prevent headless print() from hanging the process
  await context.addInitScript(() => {
    const nop = function printStub() {
      window.__printCalls = (window.__printCalls || 0) + 1;
    };
    try {
      window.print = nop;
    } catch {}
  });
  context.on('page', async (p) => {
    try {
      await p.addInitScript(() => {
        try {
          window.print = function printStub() {
            window.__printCalls = (window.__printCalls || 0) + 1;
          };
        } catch {}
      });
      await p.evaluate(() => {
        try {
          window.print = function printStub() {
            window.__printCalls = (window.__printCalls || 0) + 1;
          };
        } catch {}
      }).catch(() => {});
    } catch {}
  });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push({ text: msg.text().slice(0, 400), url: page.url() });
  });
  page.on('pageerror', (err) => pageErrors.push({ text: String(err.message || err).slice(0, 400) }));
  page.on('response', (res) => {
    const url = res.url();
    const status = res.status();
    if (status >= 500) network.status5xx.push({ status, url: url.slice(0, 250) });
    if (status >= 400 && status < 500) network.status4xx.push({ status, url: url.slice(0, 250) });
  });
  page.on('request', (req) => {
    const m = req.method();
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(m) && req.url().includes('/api/')) {
      // allow login only
      if (!req.url().includes('/auth/login')) {
        network.writes.push({ method: m, url: req.url().slice(0, 250) });
      }
    }
  });

  // ---------- Login + smoke ----------
  const hasToken = await login(page);
  rec('LOGIN', hasToken ? 'PASS' : 'FAIL');
  if (!hasToken) {
    await browser.close();
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results, network, consoleErrors, pageErrors }, null, 2));
    process.exit(2);
  }

  // ---------- A: payment methods ----------
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/products/sales') && r.request().method() === 'GET' && r.status() === 200, { timeout: 30000 }).catch(() => null),
    page.goto(`${BASE}/sales-channels/store/retail`, { waitUntil: 'domcontentloaded' }),
  ]);
  await waitRetail(page);
  // Ensure branches select populated
  await page.waitForFunction(() => {
    const sel = document.querySelector('select[aria-label="Cửa hàng"]');
    return sel && sel.options && sel.options.length > 1;
  }, { timeout: 15000 }).catch(() => {});

  // open create via branch modal (no save)
  await page.getByRole('button', { name: /Thêm hóa đơn/ }).click();
  await page.waitForSelector('.branch-modal, [aria-labelledby="branch-title"]', { timeout: 10000 });
  await page.waitForSelector('.retail-branch-list button', { timeout: 15000 }).catch(() => {});
  let branchBtn = page.locator('.retail-branch-list button').first();
  if (!(await branchBtn.count())) {
    // retry load
    await page.locator('.branch-modal button:has-text("Thử lại"), button:has-text("Thử lại")').click().catch(() => {});
    await page.waitForSelector('.retail-branch-list button', { timeout: 10000 }).catch(() => {});
    branchBtn = page.locator('.retail-branch-list button').first();
  }
  if (await branchBtn.count()) {
    await branchBtn.click();
    const [pmRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/products/payment-methods') && r.request().method() === 'GET', { timeout: 20000 }).catch(() => null),
      page.locator('button:has-text("Chọn")').last().click(),
    ]);
    await page.waitForURL(/\/retail\/create/, { timeout: 15000 });
    await page.waitForTimeout(1000);
    const body = await page.locator('body').innerText();
    const hasRouteError = /route api\/products\/payment-methods|could not be found/i.test(body);
    const pmStatus = pmRes ? pmRes.status() : null;
    const probe = await page.evaluate(async () => {
      const t = localStorage.getItem('token');
      const h = { Authorization: 'Bearer ' + t };
      const a = await fetch('/api/products/payment-methods?limit=500', { headers: h });
      const b = await fetch('/api/products/payment-methods/standard?limit=500', { headers: h });
      const aj = await a.json().catch(() => ({}));
      const bj = await b.json().catch(() => ({}));
      return {
        a: a.status,
        b: b.status,
        aItems: Array.isArray(aj.items),
        bItems: Array.isArray(bj.items),
      };
    });
    await shot(page, 'A-create-form-payment');
    const ok = !hasRouteError && probe.a === 200 && probe.b === 200 && probe.aItems && probe.bItems && (pmStatus === null || pmStatus === 200);
    rec('A_PAYMENT_METHODS', ok ? 'PASS' : 'FAIL', {
      notes: JSON.stringify({ pmStatus, probe, hasRouteError }),
      evidence: path.join(SHOT, 'A-create-form-payment.png'),
    });
  } else {
    // Still validate API even if UI branch list empty
    const probe = await page.evaluate(async () => {
      const t = localStorage.getItem('token');
      const h = { Authorization: 'Bearer ' + t };
      const a = await fetch('/api/products/payment-methods?limit=500', { headers: h });
      const b = await fetch('/api/products/payment-methods/standard?limit=500', { headers: h });
      return { a: a.status, b: b.status };
    });
    await shot(page, 'A-branch-modal-empty');
    rec('A_PAYMENT_METHODS', probe.a === 200 && probe.b === 200 ? 'PASS' : 'FAIL', {
      notes: JSON.stringify({ branchUi: 'empty', probe }),
      evidence: path.join(SHOT, 'A-branch-modal-empty.png'),
    });
    await page.keyboard.press('Escape');
  }

  // back to list without save — wait for sales list 200
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/products/sales') && r.request().method() === 'GET' && r.status() === 200, { timeout: 30000 }).catch(() => null),
    page.goto(`${BASE}/sales-channels/store/retail`, { waitUntil: 'domcontentloaded' }),
  ]);
  await waitRetail(page);
  await page.waitForSelector('button.retail-invoice-link', { timeout: 20000 }).catch(() => {});

  // ---------- E: KPI ----------
  const kpiAll = await page.locator('.retail-kpi-card').evaluateAll((nodes) =>
    nodes.map((n) => ({
      label: (n.querySelector('.retail-kpi-label')?.textContent || '').trim(),
      value: (n.querySelector('.retail-kpi-value')?.textContent || '').trim(),
    })),
  );
  const moneyCard = kpiAll.find((k) => /tổng tiền/i.test(k.label));
  const paidCard = kpiAll.find((k) => /đã thu/i.test(k.label));
  const moneyNum = Number(String(moneyCard?.value || '').replace(/[^\d]/g, '')) || 0;
  const paidNum = Number(String(paidCard?.value || '').replace(/[^\d]/g, '')) || 0;
  // Cross-check first page API totals
  const apiCheck = await page.evaluate(async () => {
    const t = localStorage.getItem('token');
    const r = await fetch('/api/products/sales?type=retail&channel=store&page=1&limit=15', {
      headers: { Authorization: 'Bearer ' + t },
    });
    const j = await r.json();
    const items = j.items || [];
    const totalValue = items.reduce((s, i) => s + (Number(i.value) || 0), 0);
    const paid = items.reduce((s, i) => {
      const rows = Array.isArray(i.typePayment) ? i.typePayment : [];
      const fromRows = rows.reduce((a, e) => a + (Number(e.amount) || 0), 0);
      return s + (fromRows || Number(i.valuePayment) || 0);
    }, 0);
    return { status: r.status, totalValue, paid, firstValue: items[0]?.value, n: items.length };
  });
  // Also read table first total cell
  const firstRowTotal = await page.locator('tbody tr:not(.retail-skeleton) td.col-total').first().innerText().catch(() => '');
  await shot(page, 'E-kpi');
  const kpiOk = moneyNum > 0 && apiCheck.firstValue > 0 && Math.abs(moneyNum - apiCheck.totalValue) < 2;
  rec('E_KPI_TOTAL', kpiOk ? 'PASS' : 'FAIL', {
    notes: JSON.stringify({ kpiAll, moneyNum, paidNum, apiCheck, firstRowTotal, rowCount: await page.locator('button.retail-invoice-link').count() }),
    evidence: path.join(SHOT, 'E-kpi.png'),
  });

  // ---------- D: admin menu after auth ready ----------
  await page.waitForFunction(async () => {
    // force a me probe already done; wait for row menu buttons
    return document.querySelectorAll('button.retail-row-menu-button').length > 0;
  }, { timeout: 15000 }).catch(() => {});
  // Give authReady a moment if still settling
  await page.waitForTimeout(500);
  await page.locator('button.retail-row-menu-button').first().click();
  await page.waitForSelector('.retail-row-action-menu', { timeout: 8000 });
  // Wait until admin items appear (auth ready) or 3s
  await page.waitForFunction(() => {
    const texts = [...document.querySelectorAll('.retail-row-action-menu button')].map((b) => b.textContent || '');
    return texts.some((t) => /Sửa đơn hàng/.test(t)) && texts.some((t) => /Xóa hóa đơn/.test(t));
  }, { timeout: 5000 }).catch(() => {});
  let menuItems = await page.locator('.retail-row-action-menu button').allTextContents();
  await shot(page, 'D-admin-menu');
  const hasAdmin = menuItems.some((t) => /Sửa/.test(t)) && menuItems.some((t) => /Xóa/.test(t));
  rec('D_ADMIN_MENU', hasAdmin ? 'PASS' : 'FAIL', {
    notes: JSON.stringify(menuItems),
    evidence: path.join(SHOT, 'D-admin-menu.png'),
  });
  await page.keyboard.press('Escape');

  // Mock EMPLOYEE via route intercept (no DB write)
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        _id: 'emp-mock',
        id: 999,
        name: 'Employee Mock',
        email: 'employee.mock@example.test',
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        isRootOwner: false,
        isActive: true,
      }),
    });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitRetail(page);
  await page.waitForTimeout(600);
  await page.locator('button.retail-row-menu-button').first().click();
  await page.waitForSelector('.retail-row-action-menu', { timeout: 8000 });
  await page.waitForTimeout(400);
  menuItems = await page.locator('.retail-row-action-menu button').allTextContents();
  await shot(page, 'D-employee-menu');
  const noAdmin = !menuItems.some((t) => /Sửa/.test(t)) && !menuItems.some((t) => /Xóa/.test(t));
  rec('D_EMPLOYEE_MENU', noAdmin ? 'PASS' : 'FAIL', {
    notes: JSON.stringify(menuItems),
    evidence: path.join(SHOT, 'D-employee-menu.png'),
  });
  await page.unroute('**/api/auth/me');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitRetail(page);
  await page.waitForTimeout(600);

  // ---------- B: print ----------
  // Ensure rows after employee mock reload restored admin session
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/products/sales') && r.request().method() === 'GET' && r.status() === 200, { timeout: 30000 }).catch(() => null),
    page.goto(`${BASE}/sales-channels/store/retail`, { waitUntil: 'domcontentloaded' }),
  ]);
  await waitRetail(page);
  await page.waitForSelector('button.retail-row-menu-button', { timeout: 20000 });

  page.once('dialog', async (d) => { await d.dismiss().catch(() => {}); });
  await page.evaluate(() => {
    window.__printCalls = 0;
  });

  const menuBtn = page.locator('button.retail-row-menu-button').first();
  await menuBtn.click();
  await page.waitForSelector('.retail-row-action-menu');
  const popupPromise = context.waitForEvent('page', { timeout: 15000 }).catch(() => null);
  const detailPromise = page.waitForResponse(
    (r) => /\/products\/sales\/[^/?]+$/.test(r.url()) && r.request().method() === 'GET',
    { timeout: 20000 },
  ).catch(() => null);
  const printBtn = page.locator('.retail-row-action-menu button', { hasText: 'In hóa đơn' }).first();
  await printBtn.dispatchEvent('pointerdown');
  await printBtn.click();
  const [popup, detailRes] = await Promise.all([popupPromise, detailPromise]);
  if (!popup) {
    rec('B_PRINT_POPUP', 'FAIL', { notes: `No popup opened; detailStatus=${detailRes && detailRes.status()}` });
  } else {
    // Override print on popup ASAP to avoid headless hang
    await popup.evaluate(() => {
      try {
        window.print = function printStub() {
          window.__printCalls = (window.__printCalls || 0) + 1;
        };
      } catch {}
    }).catch(() => {});
    let ready = false;
    let html = '';
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      try {
        if (popup.isClosed()) break;
        // re-stub print after document.write recreates window context
        await popup.evaluate(() => {
          try {
            window.print = function printStub() {
              window.__printCalls = (window.__printCalls || 0) + 1;
            };
          } catch {}
        }).catch(() => {});
        html = await popup.content();
        ready = (await popup.locator('[data-receipt-ready="true"]').count().catch(() => 0)) > 0
          || /data-receipt-ready="true"|id="retail-receipt-root"/i.test(html);
        if (ready) break;
      } catch {
        // document navigating
      }
      await page.waitForTimeout(150);
    }
    await popup.screenshot({ path: path.join(SHOT, 'B-print-popup.png') }).catch(() => {});
    const hasPlaceholderOnly = /Đang chuẩn bị hóa đơn/i.test(html) && !/data-receipt-ready="true"/i.test(html);
    const ok = ready && !hasPlaceholderOnly;
    rec('B_PRINT_POPUP', ok ? 'PASS' : 'FAIL', {
      notes: JSON.stringify({
        ready,
        hasPlaceholderOnly,
        len: html.length,
        detailStatus: detailRes && detailRes.status(),
        closed: popup.isClosed(),
        head: html.replace(/\s+/g, ' ').slice(0, 240),
      }),
      evidence: path.join(SHOT, 'B-print-popup.png'),
    });
    if (!popup.isClosed()) await popup.close().catch(() => {});
  }

  // Print error path: mock detail 500
  let errorAlert = false;
  page.once('dialog', async (d) => {
    errorAlert = /không thể in|Mock detail/i.test(d.message());
    rec('B_PRINT_ERROR_ALERT', errorAlert ? 'PASS' : 'FAIL', { notes: d.message() });
    await d.dismiss().catch(() => {});
  });
  await page.route('**/api/products/sales/*', async (route) => {
    const url = route.request().url();
    if (route.request().method() === 'GET' && /\/products\/sales\/[^/?]+$/.test(url) && !url.includes('?')) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Mock detail fail' }) });
      return;
    }
    await route.continue();
  });
  await page.locator('button.retail-row-menu-button').first().click();
  await page.waitForSelector('.retail-row-action-menu');
  const errPopupP = context.waitForEvent('page', { timeout: 10000 }).catch(() => null);
  await page.locator('.retail-row-action-menu button', { hasText: 'In hóa đơn' }).first().click();
  const errPopup = await errPopupP;
  await page.waitForTimeout(2000);
  if (errPopup && !errPopup.isClosed()) {
    rec('B_PRINT_ERROR_CLOSES', 'FAIL', { notes: 'Popup still open after detail error' });
    await errPopup.close().catch(() => {});
  } else {
    rec('B_PRINT_ERROR_CLOSES', 'PASS', { notes: `closed; alertSeen=${errorAlert}` });
  }
  if (!results.some((r) => r.id === 'B_PRINT_ERROR_ALERT')) {
    rec('B_PRINT_ERROR_ALERT', errorAlert ? 'PASS' : 'FAIL', { notes: 'dialog not observed' });
  }
  await page.unroute('**/api/products/sales/*');

  // ---------- C: responsive (same page, viewport only) ----------
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/products/sales') && r.request().method() === 'GET' && r.status() === 200, { timeout: 30000 }).catch(() => null),
    page.goto(`${BASE}/sales-channels/store/retail`, { waitUntil: 'domcontentloaded' }),
  ]);
  await waitRetail(page);
  for (const [name, w, h] of [
    ['C_360', 360, 800],
    ['C_390', 390, 844],
    ['C_412', 412, 915],
    ['C_1024', 1024, 768],
    ['C_1440', 1440, 900],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    const ov = await bodyOverflow(page);
    await shot(page, name);
    rec(name, ov.ok ? 'PASS' : 'FAIL', { notes: JSON.stringify(ov), evidence: path.join(SHOT, `${name}.png`) });
  }

  // ---------- Smoke regression (desktop) ----------
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(200);

  // filter not found
  await page.getByLabel('ID hóa đơn').fill('E2E_NOT_FOUND_RETEST');
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/products/sales') && r.request().method() === 'GET', { timeout: 15000 }).catch(() => null),
    page.getByRole('button', { name: /^Lọc$/ }).click(),
  ]);
  await waitRetail(page);
  const empty = await page.locator('.retail-empty-state').count();
  rec('SMOKE_FILTER_EMPTY', empty > 0 ? 'PASS' : 'FAIL');

  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/products/sales') && r.request().method() === 'GET', { timeout: 15000 }).catch(() => null),
    page.getByRole('button', { name: /Làm mới/ }).click(),
  ]);
  await waitRetail(page);

  // detail modal
  const link = page.locator('button.retail-invoice-link').first();
  if (await link.count()) {
    await Promise.all([
      page.waitForResponse((r) => /\/products\/sales\/[^/?]+$/.test(r.url()) && r.request().method() === 'GET', { timeout: 15000 }).catch(() => null),
      link.click(),
    ]);
    await page.waitForSelector('[aria-labelledby="detail-title"], .detail-modal', { timeout: 10000 });
    await shot(page, 'SMOKE-detail');
    rec('SMOKE_DETAIL', 'PASS');
    await page.locator('button[aria-label="Đóng"]').first().click().catch(() => {});
    await page.waitForTimeout(200);
  } else {
    rec('SMOKE_DETAIL', 'SKIPPED');
  }

  // export modal open/close
  await page.getByRole('button', { name: /Xuất dữ liệu/ }).click();
  await page.waitForTimeout(300);
  const exportOpen = /Xuất Excel|Excel/i.test(await page.locator('body').innerText());
  rec('SMOKE_EXPORT_MODAL', exportOpen ? 'PASS' : 'FAIL');
  await page.keyboard.press('Escape');

  // legacy redirect
  await page.goto(`${BASE}/sales-channels/store/retail/confirm`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  const legacyUrl = page.url();
  rec('SMOKE_LEGACY_REDIRECT', !legacyUrl.includes('/confirm') && legacyUrl.includes('/retail') ? 'PASS' : 'FAIL', {
    notes: legacyUrl,
  });

  const summary = {
    started: results[0]?.t,
    ended: new Date().toISOString(),
    counts: results.reduce((a, r) => {
      a[r.status] = (a[r.status] || 0) + 1;
      a.total = (a.total || 0) + 1;
      return a;
    }, {}),
    results,
    network,
    consoleErrors: consoleErrors.slice(0, 30),
    pageErrors: pageErrors.slice(0, 20),
  };
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(summary, null, 2));
  console.log('SUMMARY', summary.counts);
  console.log('writes', network.writes);
  await browser.close();
  const failed = (summary.counts.FAIL || 0) > 0;
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ error: String(e.stack || e), results, network }, null, 2));
  process.exit(1);
});
