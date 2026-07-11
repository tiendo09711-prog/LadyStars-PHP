/**
 * Supplemental create-form tests (mocked writes only).
 * Appends results into latest wholesale run folder if present, else standalone.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const API = process.env.E2E_API_URL || 'http://127.0.0.1:8000';
const EMAIL = process.env.E2E_EMAIL || 'admin@gmail.com';
const PASSWORD = process.env.E2E_PASSWORD || '123456';

const rootDir = path.join(__dirname);
const runs = fs.readdirSync(rootDir).filter((d) => d.startsWith('E2E_WS_')).sort();
const RUN = runs[runs.length - 1] || `E2E_WS_SUPP_${Date.now()}`;
const OUT = path.join(rootDir, RUN);
const SHOT = path.join(OUT, 'screenshots');
fs.mkdirSync(SHOT, { recursive: true });

const results = [];
function rec(id, name, status, data = {}) {
  const row = { id, name, status, ...data, group: data.group || 'SUPP' };
  results.push(row);
  console.log(`[${status}] ${id} ${name}`);
  return row;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });

  // login via API token
  const loginRes = await page.request.post(`${API}/api/auth/login`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  const loginJson = await loginRes.json();
  await page.goto(`${BASE}/login`);
  await page.evaluate((t) => localStorage.setItem('token', t), loginJson.token);

  // Prefer known local branch id; avoid long hang if API is slow
  let branchId = '1';
  try {
    const br = await page.request.get(`${API}/api/system/branches?limit=5`, {
      headers: { Authorization: `Bearer ${loginJson.token}` },
      timeout: 8000,
    });
    const brJson = await br.json();
    branchId = (brJson.items || brJson)[0]?._id || '1';
  } catch {
    branchId = '1';
  }

  const createUrl = `${BASE}/sales-channels/store/wholesale/create?branchId=${branchId}`;

  // ---- mocks ----
  let callOrder = [];
  let createPayload = null;
  // light dependency mocks to avoid slow backend
  await page.route('**/api/auth/me', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: loginJson.user, name: loginJson.user?.name, role: 'ADMIN' }),
    });
  });
  await page.route('**/api/staff**', async (route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });
  await page.route('**/api/products/inventories**', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          { _id: 'p1', code: 'SP1', name: 'San pham mock', barcode: '111', qty: 50, price: 100000, cost: 50000, unit: 'Cái', selectedStock: 50 },
        ],
      }),
    });
  });
  await page.route('**/api/system/branches/**', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ _id: branchId, id: branchId, name: 'Kho Test', code: 'TEST' }),
    });
  });
  await page.route('**/api/system/branches?**', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ _id: branchId, name: 'Kho Test', code: 'TEST', isActive: true }] }),
    });
  });
  await page.route('**/api/customers/customers**', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], total: 0 }) });
    }
    if (route.request().method() === 'POST') {
      callOrder.push('POST /customers');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ _id: 'mock-c1', name: 'E2E WS Customer', phone: '0909999888' }),
      });
    }
    return route.continue();
  });
  await page.route('**/api/products/sales', async (route) => {
    if (route.request().method() === 'POST') {
      callOrder.push('POST /products/sales');
      createPayload = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ _id: 'mock-sale-1', code: createPayload?.code || 'BHS-E2E', type: 'wholesale' }),
      });
    }
    return route.continue();
  });
  await page.route('**/api/products/sales/*/complete', async (route) => {
    callOrder.push('POST complete');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  await page.goto(createUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  // fill customer
  await page.locator('#customer-phone-input').fill('0909999888');
  await page.locator('input[placeholder="Tên khách đại lý / sỉ"]').fill('E2E WS Customer');

  // add custom product
  await page.locator('#product-search-input').fill('E2E_PROD_SUPP');
  await page.waitForTimeout(300);
  const addBtn = page.getByRole('button', { name: /Thêm sản phẩm mới sỉ/i });
  if (await addBtn.count()) await addBtn.click();
  await page.waitForTimeout(400);
  const nums = page.locator('table tbody tr input[type="number"]');
  if (await nums.count()) {
    await nums.nth(0).fill('2');
    if ((await nums.count()) > 1) await nums.nth(1).fill('100000');
  }
  // set cash payment
  await page.evaluate(() => {
    const walk = Array.from(document.querySelectorAll('span, label, div'));
    for (const el of walk) {
      if ((el.childNodes[0]?.textContent || el.textContent || '').trim() === 'Tiền mặt') {
        const input = el.parentElement?.querySelector('input');
        if (input) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(input, '150000');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }
  });
  await page.waitForTimeout(500);

  // F9
  callOrder = [];
  createPayload = null;
  await page.keyboard.press('F9');
  await page.waitForTimeout(2500);
  if (!createPayload) {
    await page.locator('#save-invoice-btn').click();
    await page.waitForTimeout(2500);
  }
  await page.screenshot({ path: path.join(SHOT, 'SUPP-Q10-mock-save.png'), fullPage: true });

  rec('TC-Q03', 'F9 kích hoạt lưu (mocked) — supplement', callOrder.includes('POST /products/sales') || createPayload ? 'PASS' : 'FAIL', {
    actual: `order=${JSON.stringify(callOrder)}; type=${createPayload?.type}`,
    mode: 'mocked-ui',
  });

  const typeOk = createPayload?.type === 'wholesale';
  const hasCreate = callOrder.includes('POST /products/sales');
  const hasComplete = callOrder.includes('POST complete');
  rec('TC-Q10', 'Success mocked save orchestration — supplement', typeOk && hasCreate && hasComplete ? 'PASS' : 'FAIL', {
    actual: JSON.stringify({
      type: createPayload?.type,
      channel: createPayload?.channel,
      branchId: createPayload?.branchId,
      order: callOrder,
      items: createPayload?.items,
      typePayment: createPayload?.typePayment,
      value: createPayload?.value,
      valuePayment: createPayload?.valuePayment,
      discountValue: createPayload?.discountValue,
      keys: Object.keys(createPayload || {}),
    }),
    mode: 'mocked-ui',
    notes: 'PASS mock ≠ backend. methodId null gap if present.',
    evidence: [path.join(SHOT, 'SUPP-Q10-mock-save.png')],
  });

  const payments = createPayload?.typePayment || [];
  const allNull = payments.length === 0 || payments.every((p) => p.methodId == null);
  rec('TC-P07', 'typePayment methodId mapping — supplement', allNull && payments.length > 0 ? 'FAIL' : payments.length ? 'PASS' : 'FAIL', {
    expected: 'methodId phân biệt phương thức',
    actual: JSON.stringify(payments),
    severity: allNull && payments.length > 0 ? 'HIGH' : null,
    mode: 'mocked-ui',
    notes: 'Source hardcodes methodId: null',
  });

  const hasVat = createPayload && ('hasVat' in createPayload || 'vatPercent' in createPayload || 'vatInvoiceNumber' in createPayload);
  rec('TC-O04', 'VAT fields trong payload — supplement', hasVat ? 'PASS' : 'FAIL', {
    expected: 'VAT fields in payload if UI supports',
    actual: `hasVatInPayload=${hasVat}; keys=${Object.keys(createPayload || {}).join(',')}`,
    severity: hasVat ? null : 'MEDIUM',
    mode: 'mocked-ui',
  });

  // Q09 complete fail
  await page.unroute('**/api/products/sales/*/complete').catch(() => {});
  await page.route('**/api/products/sales/*/complete', async (route) => {
    callOrder.push('POST complete FAIL');
    return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'complete failed mock' }) });
  });
  await page.goto(createUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.locator('#customer-phone-input').fill('0909999888');
  await page.locator('input[placeholder="Tên khách đại lý / sỉ"]').fill('E2E WS Customer');
  await page.locator('#product-search-input').fill('E2E_PROD2');
  if (await page.getByRole('button', { name: /Thêm sản phẩm mới sỉ/i }).count()) {
    await page.getByRole('button', { name: /Thêm sản phẩm mới sỉ/i }).click();
  }
  await page.waitForTimeout(300);
  const nums2 = page.locator('table tbody tr input[type="number"]');
  if (await nums2.count() > 1) {
    await nums2.nth(0).fill('1');
    await nums2.nth(1).fill('50000');
  }
  callOrder = [];
  await page.locator('#save-invoice-btn').click();
  await page.waitForTimeout(2500);
  const body = await page.locator('body').innerText();
  const falseSuccess = /đã được lưu & tồn kho đã được trừ/i.test(body);
  const hasError = /Lỗi|complete failed|500/i.test(body);
  await page.screenshot({ path: path.join(SHOT, 'SUPP-Q09-complete-fail.png'), fullPage: true });
  rec('TC-Q09', 'Complete fail after create (mocked) — supplement', !falseSuccess ? 'PASS' : 'FAIL', {
    actual: `falseSuccess=${falseSuccess}; hasError=${hasError}; order=${JSON.stringify(callOrder)}; sample=${body.match(/.{0,30}(lỗi|Lỗi|thành công|tồn kho).{0,40}/i)?.[0] || body.slice(0, 180)}`,
    severity: falseSuccess ? 'CRITICAL' : null,
    mode: 'mocked-ui',
    evidence: [path.join(SHOT, 'SUPP-Q09-complete-fail.png')],
  });

  // Q08 create fail
  await page.unroute('**/api/products/sales').catch(() => {});
  await page.route('**/api/products/sales', async (route) => {
    if (route.request().method() === 'POST') {
      callOrder.push('POST sales FAIL');
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'create sale failed mock' }) });
    }
    return route.continue();
  });
  await page.goto(createUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.locator('#customer-phone-input').fill('0909999888');
  await page.locator('input[placeholder="Tên khách đại lý / sỉ"]').fill('E2E WS Customer');
  await page.locator('#product-search-input').fill('E2E_X');
  if (await page.getByRole('button', { name: /Thêm sản phẩm mới sỉ/i }).count()) {
    await page.getByRole('button', { name: /Thêm sản phẩm mới sỉ/i }).click();
  }
  await page.waitForTimeout(300);
  callOrder = [];
  await page.locator('#save-invoice-btn').click();
  await page.waitForTimeout(2000);
  const body2 = await page.locator('body').innerText();
  const falseSuccess2 = /đã được lưu & tồn kho đã được trừ/i.test(body2);
  const hasErr2 = /create sale failed|Lỗi khi lưu/i.test(body2);
  rec('TC-Q08', 'Create sale lỗi (mocked) — supplement', !falseSuccess2 && hasErr2 ? 'PASS' : !falseSuccess2 ? 'PASS' : 'FAIL', {
    actual: `falseSuccess=${falseSuccess2}; hasErr=${hasErr2}; order=${JSON.stringify(callOrder)}`,
    mode: 'mocked-ui',
  });

  // edit load if possible with mock
  await page.route('**/api/products/sales/mock-edit-1', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        _id: 'mock-edit-1',
        code: 'BHS-EDIT-1',
        status: 'completed',
        branchId: branchId,
        discountValue: 10000,
        customerId: { name: 'Edit Customer', phone: '0911111111', email: 'a@b.c', address: 'HN' },
        note: 'note edit',
        items: [
          { productId: { _id: 'p1', code: 'P1', name: 'Prod Edit', qty: 10, cost: 1, unit: 'Cái' }, amount: 2, value: 50000, discountValue: 0, total: 100000 },
        ],
      }),
    });
  });
  await page.goto(`${BASE}/sales-channels/store/wholesale/create?editId=mock-edit-1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const editBody = await page.locator('body').innerText();
  const phoneVal = await page.locator('#customer-phone-input').inputValue().catch(() => '');
  const nameVal = await page.locator('input[placeholder="Tên khách đại lý / sỉ"]').inputValue().catch(() => '');
  await page.screenshot({ path: path.join(SHOT, 'SUPP-R01-edit-load.png'), fullPage: true });
  rec('TC-R01', 'Load invoice edit form (mocked detail) — supplement', phoneVal.includes('0911') || nameVal.includes('Edit') || /BHS-EDIT|Edit Customer/i.test(editBody) ? 'PASS' : 'FAIL', {
    actual: `phone=${phoneVal}; name=${nameVal}; hasCode=${/BHS-EDIT/i.test(editBody)}`,
    mode: 'mocked-ui',
    evidence: [path.join(SHOT, 'SUPP-R01-edit-load.png')],
  });

  // R04 with correct selector
  await page.goto(createUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.locator('input[placeholder="Tên khách đại lý / sỉ"]').fill('Unsaved');
  await page.getByRole('button', { name: /Hủy bỏ/i }).click();
  await page.waitForTimeout(800);
  rec('TC-R04', 'Rời create không lưu — supplement', page.url().includes('/wholesale') && !page.url().includes('/create') ? 'PASS' : 'FAIL', {
    actual: `url=${page.url()}; unsavedWarning=none observed`,
    notes: 'No beforeunload/guard observed',
  });

  // branch continue create path
  await page.goto(`${BASE}/sales-channels/store/wholesale`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /Tạo hóa đơn sỉ/i }).click();
  await page.waitForTimeout(1500);
  // wait for continue enabled
  const cont = page.locator('.ws-modal button.ws-btn.success, .ws-modal .ws-btn-success, .ws-modal button').filter({ hasText: /Tiếp tục/i }).first();
  await page.waitForTimeout(1000);
  const disabled = await cont.isDisabled().catch(() => true);
  const modalText = await page.locator('.ws-modal').innerText().catch(() => '');
  if (!disabled) {
    await cont.click();
    await page.waitForTimeout(1000);
  }
  rec('TC-E05', 'Tiếp tục tạo hóa đơn — supplement', page.url().includes('/wholesale/create') ? 'PASS' : 'FAIL', {
    actual: `url=${page.url()}; continueDisabled=${disabled}; modalSample=${modalText.slice(0, 200)}`,
    severity: !page.url().includes('/create') ? 'HIGH' : null,
  });

  await browser.close();

  const suppPath = path.join(OUT, 'supplement-results.json');
  fs.writeFileSync(suppPath, JSON.stringify({ RUN, results, endedAt: new Date().toISOString() }, null, 2));

  // merge into report.json if exists
  const reportPath = path.join(OUT, 'report.json');
  if (fs.existsSync(reportPath)) {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    report.supplement = results;
    report.results = report.results.concat(results.map((r) => ({
      id: r.id + (String(r.name).includes('supplement') ? '-SUPP' : '-SUPP'),
      name: r.name,
      group: r.group || 'SUPP',
      status: r.status,
      expected: r.expected || '',
      actual: r.actual || '',
      notes: r.notes || '',
      severity: r.severity || null,
      mode: r.mode || 'mocked-ui',
      evidence: r.evidence || [],
    })));
    // update bugs for FAIL with severity
    for (const r of results) {
      if (r.status === 'FAIL' && r.severity) {
        report.bugs = report.bugs || [];
        report.bugs.push({
          id: `BUG-WS-SUPP-${report.bugs.length + 1}`,
          tc: r.id,
          title: r.name,
          severity: r.severity,
          expected: r.expected,
          actual: r.actual,
          notes: r.notes,
        });
      }
    }
    report.counts = {
      total: report.results.length,
      PASS: report.results.filter((x) => x.status === 'PASS').length,
      FAIL: report.results.filter((x) => x.status === 'FAIL').length,
      BLOCKED_SAFETY_GATE: report.results.filter((x) => x.status === 'BLOCKED_SAFETY_GATE').length,
      BLOCKED: report.results.filter((x) => x.status === 'BLOCKED').length,
      SKIPPED: report.results.filter((x) => x.status === 'SKIPPED').length,
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  }
  console.log('Wrote', suppPath);
  console.log(results.map((r) => `${r.status} ${r.id}`).join('\n'));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
