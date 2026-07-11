/**
 * Headless browser self-check for Retail page (read-only).
 * Does NOT save/edit/delete invoices, customers, stock, or returns.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const API = process.env.E2E_API_URL || 'http://127.0.0.1:8000';
const EMAIL = process.env.E2E_EMAIL || 'admin@gmail.com';
const PASSWORD = process.env.E2E_PASSWORD || '123456';
const OUT = __dirname;
const SHOT = path.join(OUT, 'screenshots');
fs.mkdirSync(SHOT, { recursive: true });

const checks = [];
const consoleErrors = [];
const pageErrors = [];
const network4xx = [];
const network5xx = [];
const writeReqs = [];

function rec(id, status, detail = {}) {
  checks.push({ id, status, ...detail, at: new Date().toISOString() });
  const mark = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '•';
  console.log(`${mark} [${status}] ${id}${detail.note ? ' — ' + detail.note : ''}`);
}

async function shot(page, name) {
  const file = path.join(SHOT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  return file;
}

async function login(page) {
  const res = await page.request.post(`${API}/api/auth/login`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  if (!res.ok()) return false;
  const body = await res.json();
  if (!body.token) return false;
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((token) => localStorage.setItem('token', token), body.token);
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  return page.evaluate(() => !!localStorage.getItem('token'));
}

async function goRetail(page) {
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/products/sales') && r.request().method() === 'GET',
      { timeout: 30000 },
    ).catch(() => null),
    page.goto(`${BASE}/sales-channels/store/retail`, { waitUntil: 'domcontentloaded' }),
  ]);
  await page.waitForSelector('.retail-invoice-page, .retail-root', { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('.retail-skeleton').length === 0, {
    timeout: 30000,
  }).catch(() => {});
  await page.waitForSelector('button.retail-invoice-link, .retail-empty-state, .retail-alert', {
    timeout: 20000,
  }).catch(() => {});
  await page.waitForTimeout(400);
}

async function bodyOverflow(page) {
  return page.evaluate(() => {
    const d = document.documentElement;
    return { sw: d.scrollWidth, cw: d.clientWidth, ok: d.scrollWidth <= d.clientWidth + 1 };
  });
}

async function main() {
  const started = new Date().toISOString();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'vi-VN',
  });

  // Avoid headless print hang
  await context.addInitScript(() => {
    try {
      window.print = function () {
        window.__printCalls = (window.__printCalls || 0) + 1;
      };
    } catch {}
  });
  context.on('page', async (p) => {
    try {
      await p.addInitScript(() => {
        try {
          window.print = function () {
            window.__printCalls = (window.__printCalls || 0) + 1;
          };
        } catch {}
      });
      await p.evaluate(() => {
        try {
          window.print = function () {
            window.__printCalls = (window.__printCalls || 0) + 1;
          };
        } catch {}
      }).catch(() => {});
    } catch {}
  });

  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push({ text: m.text().slice(0, 300), url: page.url() });
  });
  page.on('pageerror', (e) => pageErrors.push(String(e.message || e).slice(0, 300)));
  page.on('response', (res) => {
    const url = res.url();
    if (!url.includes('/api/')) return;
    if (res.status() >= 500) network5xx.push({ status: res.status(), url: url.slice(0, 220) });
    if (res.status() >= 400 && res.status() < 500) {
      network4xx.push({ status: res.status(), url: url.slice(0, 220) });
    }
  });
  page.on('request', (req) => {
    const m = req.method();
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(m) && req.url().includes('/api/')) {
      if (!req.url().includes('/auth/login')) {
        writeReqs.push({ method: m, url: req.url().slice(0, 220) });
      }
    }
  });

  // 1) Login
  const okLogin = await login(page);
  rec('M01_LOGIN', okLogin ? 'PASS' : 'FAIL', { note: okLogin ? 'token set' : 'login failed' });
  if (!okLogin) {
    await browser.close();
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ checks, started }, null, 2));
    process.exit(2);
  }

  // 2) Open retail list
  await goRetail(page);
  const url = page.url();
  const hasPage = (await page.locator('.retail-invoice-page, .retail-root').count()) > 0;
  const rowCount = await page.locator('button.retail-invoice-link').count();
  await shot(page, '01-list-desktop');
  rec('M02_LIST_LOAD', hasPage && url.includes('/retail') && rowCount > 0 ? 'PASS' : 'FAIL', {
    note: `url=${url}; rows=${rowCount}`,
    shot: '01-list-desktop.png',
  });

  // 3) KPI
  const kpi = await page.locator('.retail-kpi-card').evaluateAll((nodes) =>
    nodes.map((n) => ({
      label: (n.querySelector('.retail-kpi-label')?.textContent || '').trim(),
      value: (n.querySelector('.retail-kpi-value')?.textContent || '').trim(),
    })),
  );
  const totalCard = kpi.find((k) => /tổng hóa đơn/i.test(k.label));
  const moneyCard = kpi.find((k) => /tổng tiền trang/i.test(k.label));
  const paidCard = kpi.find((k) => /đã thu trang/i.test(k.label));
  const totalN = Number(String(totalCard?.value || '').replace(/[^\d]/g, '')) || 0;
  const moneyN = Number(String(moneyCard?.value || '').replace(/[^\d]/g, '')) || 0;
  const paidN = Number(String(paidCard?.value || '').replace(/[^\d]/g, '')) || 0;
  const firstRowTotal = await page.locator('tbody tr:not(.retail-skeleton) td.col-total').first().innerText().catch(() => '');
  await shot(page, '02-kpi');
  rec('M03_KPI', totalN > 0 && moneyN > 0 && paidN > 0 ? 'PASS' : 'FAIL', {
    note: JSON.stringify({ kpi, firstRowTotal }),
    shot: '02-kpi.png',
  });

  // 4) Vietnamese encoding spot-check
  const listText = await page.locator('.retail-invoice-page').innerText();
  const mojibake = /BÃ¡n|HÃ³a|Ä‘Æ¡|Ã¡|Ã©/.test(listText);
  const hasVi = /Bán lẻ|Hóa đơn|Tổng|Khách/.test(listText);
  rec('M04_ENCODING', !mojibake && hasVi ? 'PASS' : 'FAIL', {
    note: `mojibake=${mojibake}; hasVi=${hasVi}`,
  });

  // 5) Filter not found + reset
  await page.getByLabel('ID hóa đơn').fill('E2E_BROWSER_CHECK_NOT_FOUND');
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/products/sales') && r.request().method() === 'GET', {
      timeout: 15000,
    }).catch(() => null),
    page.getByRole('button', { name: /^Lọc$/ }).click(),
  ]);
  await page.waitForTimeout(500);
  const empty = await page.locator('.retail-empty-state').count();
  await shot(page, '03-filter-empty');
  rec('M05_FILTER_EMPTY', empty > 0 ? 'PASS' : 'FAIL', { shot: '03-filter-empty.png' });

  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/products/sales') && r.request().method() === 'GET', {
      timeout: 15000,
    }).catch(() => null),
    page.getByRole('button', { name: /Làm mới/ }).click(),
  ]);
  await page.waitForTimeout(500);
  const rowsAfter = await page.locator('button.retail-invoice-link').count();
  rec('M06_FILTER_RESET', rowsAfter > 0 ? 'PASS' : 'FAIL', { note: `rows=${rowsAfter}` });

  // 6) Admin menu
  await page.waitForTimeout(500);
  await page.locator('button.retail-row-menu-button').first().click();
  await page.waitForSelector('.retail-row-action-menu', { timeout: 8000 });
  await page.waitForFunction(() => {
    const t = [...document.querySelectorAll('.retail-row-action-menu button')].map((b) => b.textContent || '');
    return t.some((x) => /Sửa/.test(x));
  }, { timeout: 5000 }).catch(() => {});
  const menuItems = await page.locator('.retail-row-action-menu button').allTextContents();
  await shot(page, '04-admin-menu');
  const hasEdit = menuItems.some((t) => /Sửa/.test(t));
  const hasDelete = menuItems.some((t) => /Xóa/.test(t));
  const hasPrint = menuItems.some((t) => /In hóa đơn/.test(t) && !/quà tặng/.test(t));
  const hasGift = menuItems.some((t) => /quà tặng/.test(t));
  const hasRefund = menuItems.some((t) => /Đổi trả/.test(t));
  rec('M07_ADMIN_MENU', hasEdit && hasDelete && hasPrint && hasGift && hasRefund ? 'PASS' : 'FAIL', {
    note: JSON.stringify(menuItems),
    shot: '04-admin-menu.png',
  });

  // Gift button state (no force print) — re-open menu if closed
  if ((await page.locator('.retail-row-action-menu').count()) === 0) {
    await page.locator('button.retail-row-menu-button').first().click();
    await page.waitForSelector('.retail-row-action-menu', { timeout: 8000 });
  }
  const giftBtn = page.locator('.retail-row-action-menu button').filter({ hasText: /quà tặng/i }).first();
  let giftDisabled = null;
  if (await giftBtn.count()) {
    giftDisabled = await giftBtn.isDisabled();
    rec('M08_GIFT_PRINT_STATE', 'PASS', {
      note: `giftDisabled=${giftDisabled} (state-only, no gift print submit)`,
    });
  } else {
    rec('M08_GIFT_PRINT_STATE', 'FAIL', { note: 'Không thấy nút in quà tặng trong menu' });
  }

  // 7) Print from menu
  if ((await page.locator('.retail-row-action-menu').count()) === 0) {
    await page.locator('button.retail-row-menu-button').first().click();
    await page.waitForSelector('.retail-row-action-menu', { timeout: 8000 });
  }
  const popupP = context.waitForEvent('page', { timeout: 15000 }).catch(() => null);
  const detailP = page.waitForResponse(
    (r) => /\/products\/sales\/[^/?]+$/.test(r.url()) && r.request().method() === 'GET',
    { timeout: 20000 },
  ).catch(() => null);
  // Prefer role menuitem "In hóa đơn" that is not gift
  const printOnly = page
    .locator('.retail-row-action-menu button[role="menuitem"], .retail-row-action-menu button')
    .filter({ hasText: /In hóa đơn/i })
    .filter({ hasNotText: /quà tặng/i })
    .first();
  await printOnly.dispatchEvent('pointerdown');
  await printOnly.click();
  const [popup, detailRes] = await Promise.all([popupP, detailP]);
  let printOk = false;
  let printNote = {};
  if (!popup) {
    printNote = { error: 'no popup', detailStatus: detailRes && detailRes.status() };
  } else {
    await popup.evaluate(() => {
      try {
        window.print = function () {
          window.__printCalls = (window.__printCalls || 0) + 1;
        };
      } catch {}
    }).catch(() => {});
    let html = '';
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      try {
        if (popup.isClosed()) break;
        await popup.evaluate(() => {
          try {
            window.print = function () {
              window.__printCalls = (window.__printCalls || 0) + 1;
            };
          } catch {}
        }).catch(() => {});
        html = await popup.content();
        if (/data-receipt-ready="true"|id="retail-receipt-root"/i.test(html)) break;
      } catch {}
      await page.waitForTimeout(150);
    }
    await popup.screenshot({ path: path.join(SHOT, '05-print-popup.png') }).catch(() => {});
    const ready = /data-receipt-ready="true"/i.test(html);
    const stuck = /Đang chuẩn bị hóa đơn/i.test(html) && !ready;
    const hasMoney = /Thành tiền|Đã thanh toán|Tổng cộng/i.test(html);
    const hasCode = /iv-code|data-invoice-code=/i.test(html);
    printOk = ready && !stuck && hasMoney && html.length > 500;
    printNote = {
      ready,
      stuck,
      hasMoney,
      hasCode,
      len: html.length,
      detailStatus: detailRes && detailRes.status(),
      head: html.replace(/\s+/g, ' ').slice(0, 180),
    };
    if (!popup.isClosed()) await popup.close().catch(() => {});
  }
  rec('M09_PRINT_MENU', printOk ? 'PASS' : 'FAIL', { note: JSON.stringify(printNote), shot: '05-print-popup.png' });

  // 8) Detail modal + print from detail
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);
  const link = page.locator('button.retail-invoice-link').first();
  const code = (await link.innerText()).trim();
  await Promise.all([
    page.waitForResponse(
      (r) => /\/products\/sales\/[^/?]+$/.test(r.url()) && r.request().method() === 'GET',
      { timeout: 15000 },
    ).catch(() => null),
    link.click(),
  ]);
  await page.waitForSelector('[aria-labelledby="detail-title"], .detail-modal', { timeout: 10000 });
  const detailBody = await page.locator('.detail-modal .retail-modal-body, [aria-labelledby="detail-title"] .retail-modal-body').innerText().catch(() => '');
  await shot(page, '06-detail-modal');
  const detailOk = /Khách|Sản phẩm|Tổng/i.test(detailBody);
  rec('M10_DETAIL_MODAL', detailOk ? 'PASS' : 'FAIL', {
    note: `code=${code}; snippet=${detailBody.slice(0, 120)}`,
    shot: '06-detail-modal.png',
  });

  // print from detail footer
  const detailPrintP = context.waitForEvent('page', { timeout: 12000 }).catch(() => null);
  const detailPrintBtn = page.locator('.detail-modal button, [aria-labelledby="detail-title"] ~ footer button, .retail-modal.detail-modal footer button').filter({ hasText: 'In hóa đơn' }).filter({ hasNotText: 'quà tặng' }).first();
  // fallback
  const footerPrint = page.locator('button').filter({ hasText: 'In hóa đơn' }).filter({ hasNotText: 'quà tặng' }).last();
  const btn = (await detailPrintBtn.count()) ? detailPrintBtn : footerPrint;
  await btn.dispatchEvent('pointerdown').catch(() => {});
  await btn.click();
  const detailPopup = await detailPrintP;
  let detailPrintOk = false;
  if (detailPopup) {
    await detailPopup.evaluate(() => {
      try {
        window.print = function () {
          window.__printCalls = (window.__printCalls || 0) + 1;
        };
      } catch {}
    }).catch(() => {});
    let html = '';
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      try {
        await detailPopup.evaluate(() => {
          try {
            window.print = function () {
              window.__printCalls = (window.__printCalls || 0) + 1;
            };
          } catch {}
        }).catch(() => {});
        html = await detailPopup.content();
        if (/data-receipt-ready="true"/i.test(html)) break;
      } catch {}
      await page.waitForTimeout(150);
    }
    await detailPopup.screenshot({ path: path.join(SHOT, '07-print-from-detail.png') }).catch(() => {});
    detailPrintOk = /data-receipt-ready="true"/i.test(html) && html.length > 500;
    if (!detailPopup.isClosed()) await detailPopup.close().catch(() => {});
  }
  rec('M11_PRINT_DETAIL', detailPrintOk ? 'PASS' : 'FAIL', {
    note: detailPopup ? 'popup handled' : 'no popup',
    shot: '07-print-from-detail.png',
  });

  // close detail
  await page.locator('button[aria-label="Đóng"]').first().click().catch(() => {});
  await page.waitForTimeout(300);

  // 9) Export modal
  await page.getByRole('button', { name: /Xuất dữ liệu/ }).click();
  await page.waitForTimeout(400);
  const exportText = await page.locator('body').innerText();
  const exportOpen = /Xuất Excel|Excel/i.test(exportText);
  await shot(page, '08-export-modal');
  rec('M12_EXPORT_MODAL', exportOpen ? 'PASS' : 'FAIL', { shot: '08-export-modal.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // 10) Create form — no save
  await page.getByRole('button', { name: /Thêm hóa đơn/ }).click();
  await page.waitForSelector('.branch-modal, [aria-labelledby="branch-title"]', { timeout: 10000 });
  await page.waitForSelector('.retail-branch-list button', { timeout: 15000 }).catch(() => {});
  const branchCount = await page.locator('.retail-branch-list button').count();
  await shot(page, '09-branch-modal');
  rec('M13_BRANCH_MODAL', branchCount > 0 ? 'PASS' : 'FAIL', {
    note: `branches=${branchCount}`,
    shot: '09-branch-modal.png',
  });

  if (branchCount > 0) {
    await page.locator('.retail-branch-list button').first().click();
    const [pmRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/products/payment-methods') && r.request().method() === 'GET',
        { timeout: 20000 },
      ).catch(() => null),
      page.locator('button:has-text("Chọn")').last().click(),
    ]);
    await page.waitForURL(/\/retail\/create/, { timeout: 15000 });
    await page.waitForTimeout(1200);
    // Wait for create form chrome (save may be disabled but must exist)
    await page.waitForSelector('form#retail-create-form, button.create-save-top, button.submit-sale, h1', {
      timeout: 15000,
    }).catch(() => {});
    await page.waitForTimeout(500);
    const createText = await page.locator('body').innerText();
    const routeError =
      /could not be found/i.test(createText) && /payment-methods|route api/i.test(createText);
    const hasSave =
      (await page.locator('button.create-save-top, button.submit-sale').count()) > 0
      || (await page.getByRole('button', { name: /Lưu hóa đơn|Xác nhận.*Lưu|Lưu/i }).count()) > 0
      || /Lưu hóa đơn|Xác nhận & Lưu/i.test(createText);
    const hasFormTitle = /Thêm hóa đơn|Tạo hóa đơn|hóa đơn bán lẻ/i.test(createText);
    const probe = await page.evaluate(async () => {
      const t = localStorage.getItem('token');
      const h = { Authorization: 'Bearer ' + t };
      const a = await fetch('/api/products/payment-methods?limit=500', { headers: h });
      const b = await fetch('/api/products/payment-methods/standard?limit=500', { headers: h });
      const aj = await a.json().catch(() => ({}));
      return {
        a: a.status,
        b: b.status,
        items: Array.isArray(aj.items) ? aj.items.length : -1,
      };
    });
    await shot(page, '10-create-form');
    rec('M14_CREATE_FORM_NO_404', !routeError && probe.a === 200 && probe.b === 200 && (hasSave || hasFormTitle) ? 'PASS' : 'FAIL', {
      note: JSON.stringify({
        routeError,
        pmStatus: pmRes && pmRes.status(),
        probe,
        hasSave,
        hasFormTitle,
        paymentMethodsInDb: probe.items,
        url: page.url(),
        snippet: createText.slice(0, 280).replace(/\s+/g, ' '),
      }),
      shot: '10-create-form.png',
    });
    rec('M15_PAYMENT_METHODS_DATA', probe.items > 0 ? 'PASS' : 'INFO', {
      note:
        probe.items > 0
          ? `Có ${probe.items} PTTT trong DB`
          : 'Bảng payment_methods rỗng — form không 404 nhưng không có method để chọn. Cần import data nếu muốn bán thật.',
    });

    // Back without save
    const back = page.getByLabel('Quay lại');
    if (await back.count()) await back.click();
    else await page.goto(`${BASE}/sales-channels/store/retail`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    rec('M16_BACK_WITHOUT_SAVE', page.url().includes('/retail') && !page.url().includes('/create') ? 'PASS' : 'FAIL', {
      note: page.url(),
    });
  } else {
    rec('M14_CREATE_FORM_NO_404', 'FAIL', { note: 'no branch' });
    rec('M15_PAYMENT_METHODS_DATA', 'SKIPPED');
    rec('M16_BACK_WITHOUT_SAVE', 'SKIPPED');
    await page.keyboard.press('Escape');
  }

  // 11) Refund navigation (no confirm)
  await goRetail(page);
  await page.locator('button.retail-row-menu-button').first().click();
  await page.waitForSelector('.retail-row-action-menu');
  const refundBtn = page.locator('.retail-row-action-menu button', { hasText: 'Đổi trả hàng' });
  const refundDisabled = await refundBtn.isDisabled();
  if (!refundDisabled) {
    await refundBtn.click();
    await page.waitForURL(/refund\/create/, { timeout: 15000 });
    await shot(page, '11-refund-form');
    rec('M17_REFUND_NAV', page.url().includes('refund/create') ? 'PASS' : 'FAIL', {
      note: page.url() + ' (KHÔNG bấm xác nhận)',
      shot: '11-refund-form.png',
    });
    await page.goto(`${BASE}/sales-channels/store/retail`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
  } else {
    const title = await refundBtn.getAttribute('title');
    rec('M17_REFUND_NAV', 'PASS', {
      note: `Nút disabled trên dòng đầu: ${title} (không force confirm)`,
    });
  }

  // 12) Legacy redirect
  await page.goto(`${BASE}/sales-channels/store/retail/confirm`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  rec('M18_LEGACY_REDIRECT', !page.url().includes('/confirm') && page.url().includes('/retail') ? 'PASS' : 'FAIL', {
    note: page.url(),
  });

  // 13) Responsive
  await goRetail(page);
  for (const [name, w, h] of [
    ['12-mobile-360', 360, 800],
    ['13-mobile-390', 390, 844],
    ['14-mobile-412', 412, 915],
    ['15-desktop-1024', 1024, 768],
    ['16-desktop-1440', 1440, 900],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    const ov = await bodyOverflow(page);
    await shot(page, name);
    rec(`M19_${name.toUpperCase().replace(/-/g, '_')}`, ov.ok ? 'PASS' : 'FAIL', {
      note: JSON.stringify(ov),
      shot: `${name}.png`,
    });
  }

  // 14) Keyboard focus
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByLabel('ID hóa đơn').focus();
  const active = await page.evaluate(
    () => document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName,
  );
  rec('M20_KEYBOARD_FOCUS', /hóa đơn|ID|INPUT/i.test(String(active)) ? 'PASS' : 'FAIL', {
    note: `active=${active}`,
  });

  // 15) Network hygiene for payment methods
  const pm404 = network4xx.filter((x) => /payment-methods/.test(x.url));
  rec('M21_NO_PAYMENT_404', pm404.length === 0 ? 'PASS' : 'FAIL', {
    note: JSON.stringify(pm404.slice(0, 5)),
  });

  rec('M22_NO_WRITE_REQUESTS', writeReqs.length === 0 ? 'PASS' : 'FAIL', {
    note: JSON.stringify(writeReqs),
  });

  const ended = new Date().toISOString();
  const summary = checks.reduce((a, c) => {
    a[c.status] = (a[c.status] || 0) + 1;
    a.total = (a.total || 0) + 1;
    return a;
  }, {});

  const report = {
    started,
    ended,
    summary,
    checks,
    consoleErrors: consoleErrors.slice(0, 30),
    pageErrors: pageErrors.slice(0, 20),
    network4xx: network4xx.slice(0, 30),
    network5xx: network5xx.slice(0, 20),
    writeReqs,
    notes: [
      'Read-only browser check only.',
      'Did not save/edit/delete invoices or confirm refunds.',
      'payment_methods table may be empty — M15 reports INFO if so.',
    ],
  };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));

  // Human-readable markdown
  const md = [
    '# Browser self-check — Bán lẻ',
    '',
    `- Bắt đầu: ${started}`,
    `- Kết thúc: ${ended}`,
    `- Tổng: ${summary.total} | PASS: ${summary.PASS || 0} | FAIL: ${summary.FAIL || 0} | INFO: ${summary.INFO || 0} | SKIPPED: ${summary.SKIPPED || 0}`,
    '',
    '## Kết quả từng check',
    '',
    ...checks.map(
      (c) =>
        `- **${c.id}**: ${c.status}${c.note ? ` — ${c.note}` : ''}${c.shot ? ` *(${c.shot})*` : ''}`,
    ),
    '',
    '## An toàn',
    `- Write API (trừ login): ${writeReqs.length}`,
    `- Payment methods 404: ${pm404.length}`,
    `- Console errors: ${consoleErrors.length}`,
    `- Page errors: ${pageErrors.length}`,
    '',
    '## Screenshots',
    `Thư mục: \`${SHOT}\``,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'REPORT.md'), md);

  console.log('\n=== SUMMARY ===');
  console.log(summary);
  console.log('writes', writeReqs.length);
  console.log('report', path.join(OUT, 'REPORT.md'));

  await browser.close();
  process.exit((summary.FAIL || 0) > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  fs.writeFileSync(
    path.join(OUT, 'report.json'),
    JSON.stringify({ error: String(e.stack || e), checks }, null, 2),
  );
  process.exit(1);
});
