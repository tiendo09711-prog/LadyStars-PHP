# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: inventory-reports.manual.full.live.spec.ts >> Inventory reports manual full live >> AGE-TAB and AGE-KPI and AGE-CH
- Location: e2e\inventory-reports.manual.full.live.spec.ts:1441:7

# Error details

```
Error: expect(received).not.toMatch(expected)

Expected pattern: not /^0(\s|$)/
Received string:      "0 SP"

Call Log:
- Timeout 60000ms exceeded while waiting on the predicate
```

# Test source

```ts
  56  | }
  57  | 
  58  | let adminToken = '';
  59  | let employeeToken = '';
  60  | let adminRole = '';
  61  | let employeeRole = '';
  62  | let warehouses: Array<{ value: string; label: string; code?: string }> = [];
  63  | let types: Array<{ value: string; label: string }> = [];
  64  | let maxRangeDays = 366;
  65  | let sampleBillCode = '';
  66  | let sampleProductCode = '';
  67  | let sampleProductName = '';
  68  | let branchAId = '';
  69  | let branchBId = '';
  70  | let branchAName = '';
  71  | let branchBName = '';
  72  | /** Branch ids used by /products/inventory (system branches), may differ from report warehouse ids. */
  73  | let invBranchAId = '';
  74  | let invBranchBId = '';
  75  | let invBranchAName = '';
  76  | let invBranchBName = '';
  77  | let categoryId = '';
  78  | let categoryName = '';
  79  | let invSampleCode = '';
  80  | let ageSampleCode = '';
  81  | let defaultFrom = '';
  82  | let defaultTo = '';
  83  | 
  84  | function ymd(d: Date) {
  85  |   const p = (n: number) => String(n).padStart(2, '0');
  86  |   return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  87  | }
  88  | 
  89  | function defaultDateRange() {
  90  |   const end = new Date();
  91  |   const start = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  92  |   start.setDate(start.getDate() - 29);
  93  |   return { from: ymd(start), to: ymd(end) };
  94  | }
  95  | 
  96  | async function loginAndOpen(page: Page, creds: { email: string; password: string }, pathUrl: string) {
  97  |   const token = creds.email === EMPLOYEE.email ? employeeToken : adminToken;
  98  |   if (!token) throw new Error('missing auth token — beforeAll did not complete');
  99  |   await page.setViewportSize({ width: 1440, height: 900 });
  100 |   // Seed token before first document load to avoid missing /auth/me races.
  101 |   await page.addInitScript((t) => {
  102 |     try {
  103 |       localStorage.clear();
  104 |       sessionStorage.clear();
  105 |     } catch {
  106 |       // ignore
  107 |     }
  108 |     localStorage.setItem('token', t);
  109 |   }, token);
  110 |   await page.goto(pathUrl, { waitUntil: 'domcontentloaded' });
  111 |   await expect(page.locator('.app-sidebar')).toBeVisible({ timeout: 60_000 });
  112 |   // Soft settle: either report shell or any main content is enough.
  113 |   await expect(
  114 |     page.locator('.inventory-report-shell h1, main h1, .app-sidebar').first(),
  115 |   ).toBeVisible({ timeout: 30_000 });
  116 | }
  117 | 
  118 | async function waitInOutLoaded(page: Page) {
  119 |   await expect(page.getByTestId('inout-stock-page')).toBeVisible({ timeout: 30_000 });
  120 |   await expect(page.getByTestId('kpi-total-in')).toBeVisible({ timeout: 60_000 });
  121 |   // Prefer KPI stability over aria-busy (reconciliation no longer holds busy, but be tolerant).
  122 |   await expect
  123 |     .poll(async () => page.getByTestId('kpi-total-in').textContent(), { timeout: 60_000 })
  124 |     .not.toBe('');
  125 |   await page
  126 |     .waitForFunction(
  127 |       () => {
  128 |         const el = document.querySelector('[data-testid="inout-stock-page"]');
  129 |         return !el || el.getAttribute('aria-busy') !== 'true';
  130 |       },
  131 |       { timeout: 30_000 },
  132 |     )
  133 |     .catch(() => {});
  134 | }
  135 | 
  136 | async function waitStockLoaded(page: Page) {
  137 |   await expect(page.getByRole('heading', { level: 1, name: 'Báo cáo kho hàng' })).toBeVisible({ timeout: 30_000 });
  138 |   await expect(page.getByText(/Đang tải dữ liệu tồn kho|Đang tải danh sách kho/i)).toHaveCount(0, {
  139 |     timeout: 90_000,
  140 |   });
  141 |   await expect(page.getByTestId('inventory-kpi-total')).toBeVisible({ timeout: 45_000 });
  142 | }
  143 | 
  144 | async function waitAgeLoaded(page: Page) {
  145 |   await expect(page.getByRole('heading', { level: 1, name: 'Báo cáo kho hàng' })).toBeVisible({ timeout: 30_000 });
  146 |   await expect(page.getByTestId('storage-kpi-products')).toBeVisible({ timeout: 90_000 });
  147 |   // Initial KPI state is 0; wait until the first storage-duration response settles the counters.
  148 |   await page
  149 |     .waitForResponse(
  150 |       (r) => r.url().includes('/api/products/storage-duration') && r.request().method() === 'GET' && r.status() < 500,
  151 |       { timeout: 90_000 },
  152 |     )
  153 |     .catch(() => null);
  154 |   await expect
  155 |     .poll(async () => (await page.getByTestId('storage-kpi-products').textContent()) || '', { timeout: 60_000 })
> 156 |     .not.toMatch(/^0(\s|$)/);
      |          ^ Error: expect(received).not.toMatch(expected)
  157 | }
  158 | 
  159 | function parseViNumber(text: string | null | undefined): number {
  160 |   if (!text) return 0;
  161 |   const cleaned = text.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  162 |   const n = Number(cleaned);
  163 |   return Number.isFinite(n) ? n : 0;
  164 | }
  165 | 
  166 | async function openInOut(page: Page) {
  167 |   const reportWait = page.waitForResponse(
  168 |     (r) =>
  169 |       r.url().includes('/api/reports/inventory/in-out-stock?') &&
  170 |       r.request().method() === 'GET' &&
  171 |       r.status() === 200,
  172 |     { timeout: 90_000 },
  173 |   );
  174 |   await loginAndOpen(page, ADMIN, '/reports/inventory/in-out-stock');
  175 |   await reportWait.catch(() => null);
  176 |   await waitInOutLoaded(page);
  177 | }
  178 | 
  179 | async function openStock(page: Page) {
  180 |   await loginAndOpen(page, ADMIN, '/products/inventory');
  181 |   await waitStockLoaded(page);
  182 | }
  183 | 
  184 | async function openAge(page: Page) {
  185 |   await loginAndOpen(page, ADMIN, '/products/storage-duration');
  186 |   await waitAgeLoaded(page);
  187 | }
  188 | 
  189 | async function applyInOutFilters(page: Page) {
  190 |   const respPromise = page.waitForResponse(
  191 |     (r) =>
  192 |       r.url().includes('/api/reports/inventory/in-out-stock?') &&
  193 |       r.request().method() === 'GET' &&
  194 |       r.status() < 500,
  195 |     { timeout: 90_000 },
  196 |   );
  197 |   await page.getByRole('button', { name: /^Áp dụng$/i }).click();
  198 |   await respPromise.catch(() => null);
  199 |   await waitInOutLoaded(page);
  200 | }
  201 | 
  202 | async function selectInvWarehouse(page: Page, value: string) {
  203 |   const select = page.locator('select.inv-filter-select').first();
  204 |   await expect(select).toBeVisible({ timeout: 30_000 });
  205 |   await expect.poll(async () => select.locator('option').count(), { timeout: 30_000 }).toBeGreaterThan(1);
  206 |   if (!value) {
  207 |     await select.selectOption({ index: 0 });
  208 |   } else {
  209 |     await select.selectOption(value);
  210 |   }
  211 |   await waitStockLoaded(page);
  212 | }
  213 | 
  214 | async function selectInvStatus(page: Page, value: string) {
  215 |   const select = page.locator('select.inv-filter-select').nth(1);
  216 |   await expect(select).toBeVisible({ timeout: 30_000 });
  217 |   await select.selectOption(value);
  218 |   await waitStockLoaded(page);
  219 | }
  220 | 
  221 | async function readInOutKpis(page: Page) {
  222 |   return {
  223 |     totalIn: parseViNumber(await page.getByTestId('kpi-total-in').textContent()),
  224 |     totalOut: parseViNumber(await page.getByTestId('kpi-total-out').textContent()),
  225 |     net: parseViNumber(await page.getByTestId('kpi-net').textContent()),
  226 |     docs: parseViNumber(await page.getByTestId('kpi-docs').textContent()),
  227 |   };
  228 | }
  229 | 
  230 | async function bodyHasHorizontalOverflow(page: Page) {
  231 |   return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  232 | }
  233 | 
  234 | // workers=1 keeps order; avoid describe serial so one failure does not skip remaining cases.
  235 | test.describe('Inventory reports manual full live', () => {
  236 |   test.beforeAll(async ({ request }) => {
  237 |     ensureDir();
  238 |     fs.writeFileSync(path.join(ARTIFACT_DIR, 'run-meta.txt'), `RUN_ID=${RUN_ID}\n`, 'utf8');
  239 |     // eslint-disable-next-line no-console
  240 |     console.log(`E2E_RUN_ID=${RUN_ID}`);
  241 | 
  242 |     const admin = await apiLogin(request, ADMIN);
  243 |     const emp = await apiLogin(request, EMPLOYEE);
  244 |     adminToken = admin.token;
  245 |     employeeToken = emp.token;
  246 |     adminRole = String(admin.user?.role || admin.role || '').toUpperCase();
  247 |     employeeRole = String(emp.user?.role || emp.role || '').toUpperCase();
  248 |     expect(['ADMIN', 'OWNER', 'ROOT', 'SUPERADMIN', 'MANAGER']).toContain(adminRole);
  249 |     expect(employeeRole).toBeTruthy();
  250 | 
  251 |     const opts = await (
  252 |       await request.get(`${API}/reports/inventory/in-out-stock/options`, {
  253 |         headers: { Authorization: `Bearer ${adminToken}` },
  254 |       })
  255 |     ).json();
  256 |     warehouses = opts.warehouses || [];
```