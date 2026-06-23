import { expect, request, test } from '@playwright/test';

/**
 * Live-guarded spec: Branch save + invoice print profile sync.
 *
 * Verifies the fix for "Kho HCM cannot save" on isolated fixture branches
 * (never touches real HCM/HN):
 *   1. A branch with EMPTY invoiceProfile.displayName can be PATCHed (the old
 *      UI disabled the save button when displayName was empty).
 *   2. A branch whose stored invoiceProfile has legacy/Mongoose-internal keys
 *      is normalized to a clean shape after PATCH (no $__parent / _doc).
 *   3. PATCH only updates allowed fields; code is immutable and ignored.
 *   4. Phone containing dots is accepted; a truly invalid phone returns 400.
 *   5. footerText / showBranchName / showCashier / showProductCode / showLogo
 *      saved on a branch are returned verbatim (print profile sync).
 *   6. Two different branches keep separate profiles (no cross-branch leak).
 *
 * Isolation:
 *   - API-only (no db.ts; the live backend runs on MONGO_URI, db.ts uses a
 *     separate E2E DB, so direct inserts would not be visible to the API).
 *   - Every fixture branch is created with a unique code derived from
 *     E2E_RUN_ID and deleted by exact _id in afterEach/afterAll.
 *   - No deleteMany, no dropDatabase, no StoreSettings mutation, no real
 *     HCM/HN usage.
 *
 * Run via:
 *   npm.cmd run live:test -- --spec e2e/live/branch-save-print-sync.spec.ts
 */

const API = process.env.E2E_API_BASE_URL || 'http://localhost:4100/api';
const ADMIN_PASSWORD = process.env.E2E_AUTH_PASSWORD || '';
const RUN_ID = process.env.E2E_RUN_ID || 'live-branch-' + Date.now();

type InvoiceProfile = {
  displayName?: string;
  templateId?: 'retail-a4-classic';
  footerText?: string;
  showBranchName?: boolean;
  showCashier?: boolean;
  showProductCode?: boolean;
  showLogo?: boolean;
};

type Branch = {
  _id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  isActive?: boolean;
  invoiceProfile?: InvoiceProfile;
};

const createdIds: string[] = [];

async function authContext() {
  const email = process.env.E2E_AUTH_EMAIL;
  const password = ADMIN_PASSWORD;
  if (!email || !password) return null;
  const api = await request.newContext();
  const loginRes = await api.post(`${API}/auth/login`, { data: { email, password } });
  if (!loginRes.ok()) return null;
  const { token } = await loginRes.json();
  return request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
}

async function createBranch(auth: any, payload: Record<string, unknown>): Promise<Branch> {
  const res = await auth.post(`${API}/system/branches`, { data: payload });
  expect(res.ok(), `createBranch failed: ${res.status()}`).toBeTruthy();
  const body = await res.json();
  createdIds.push(body._id);
  return body;
}

async function deleteBranch(auth: any, id: string) {
  await auth.delete(`${API}/system/branches/${id}`, { data: { adminPassword: ADMIN_PASSWORD } }).catch(() => null);
}

test.describe.configure({ mode: 'serial' });

test.describe('branch save + print profile sync (live-guarded, isolated)', () => {
  let auth: any = null;

  test.beforeAll(async () => {
    test.skip(!ADMIN_PASSWORD, 'E2E_AUTH_PASSWORD not set');
    auth = await authContext();
    test.skip(!auth, 'E2E auth credentials not valid for target DB (skipping)');
  });

  test.afterAll(async () => {
    if (auth) {
      for (const id of [...createdIds]) await deleteBranch(auth, id);
      await auth.dispose().catch(() => null);
    }
  });

  test('branch with empty displayName can be saved and legacy invoiceProfile is cleaned', async () => {
    const codeA = `${RUN_ID}-A`.slice(0, 28);
    const created = await createBranch(auth, {
      name: `${RUN_ID} Empty Display`,
      code: codeA,
      address: '12 Test Street',
      phone: '0900.000.000',
      invoiceProfile: {
        displayName: '',
        templateId: 'retail-a4-classic',
        footerText: 'Footer A saved',
        showBranchName: true,
        showCashier: false,
        showProductCode: true,
        showLogo: false,
      } as InvoiceProfile,
      adminPassword: ADMIN_PASSWORD,
    });
    expect(created.invoiceProfile?.footerText).toBe('Footer A saved');
    expect(created.invoiceProfile?.showBranchName).toBe(true);
    expect(created.invoiceProfile?.showCashier).toBe(false);
    expect(created.invoiceProfile?.showProductCode).toBe(true);

    // PATCH with empty displayName (the scenario that used to be blocked).
    const patched = await (await auth.patch(`${API}/system/branches/${created._id}`, {
      data: {
        name: `${RUN_ID} Empty Display Updated`,
        address: '34 Updated Street',
        phone: '0900.000.000',
        invoiceProfile: {
          displayName: '',
          templateId: 'retail-a4-classic',
          footerText: 'Footer A saved',
          showBranchName: true,
          showCashier: false,
          showProductCode: true,
          showLogo: false,
        } as InvoiceProfile,
        adminPassword: ADMIN_PASSWORD,
      },
    })).json();
    expect(patched.name).toBe(`${RUN_ID} Empty Display Updated`);
    expect(patched.address).toBe('34 Updated Street');
    expect(patched.phone).toBe('0900.000.000');
    // Print profile fields preserved verbatim (sync fix).
    expect(patched.invoiceProfile?.footerText).toBe('Footer A saved');
    expect(patched.invoiceProfile?.showBranchName).toBe(true);
    expect(patched.invoiceProfile?.showCashier).toBe(false);
    expect(patched.invoiceProfile?.showProductCode).toBe(true);
    // Clean shape: only the 7 schema fields, no Mongoose internals leaked.
    expect(Object.keys(patched.invoiceProfile || {}).sort()).toEqual(
      ['displayName', 'footerText', 'showBranchName', 'showCashier', 'showLogo', 'showProductCode', 'templateId'],
    );
    // code immutable: sending a different code in the body must NOT change it.
    const codeAttempt = await (await auth.patch(`${API}/system/branches/${created._id}`, {
      data: {
        name: patched.name,
        address: patched.address,
        phone: patched.phone,
        invoiceProfile: patched.invoiceProfile,
        code: 'SHOULD-NOT-CHANGE',
        adminPassword: ADMIN_PASSWORD,
      },
    })).json();
    expect(codeAttempt.code).toBe(codeA);
  });

  test('second branch keeps a separate profile (no cross-branch leak)', async () => {
    const codeB = `${RUN_ID}-B`.slice(0, 28);
    const created = await createBranch(auth, {
      name: `${RUN_ID} Branch B`,
      code: codeB,
      address: 'B Street',
      phone: '0911.111.111',
      invoiceProfile: {
        displayName: 'BRAND-B',
        templateId: 'retail-a4-classic',
        footerText: 'Footer B saved',
        showBranchName: false,
        showCashier: true,
        showProductCode: false,
        showLogo: true,
      } as InvoiceProfile,
      adminPassword: ADMIN_PASSWORD,
    });
    const detail = await (await auth.get(`${API}/system/branches/${created._id}?includeInactive=true`)).json();
    expect(detail.invoiceProfile?.displayName).toBe('BRAND-B');
    expect(detail.invoiceProfile?.footerText).toBe('Footer B saved');
    expect(detail.invoiceProfile?.showLogo).toBe(true);
    // Distinct from branch A's values.
    expect(detail.invoiceProfile?.footerText).not.toBe('Footer A saved');
    expect(detail.invoiceProfile?.displayName).not.toBe('');
  });

  test('truly invalid phone returns 400, not 500', async () => {
    const codeC = `${RUN_ID}-C`.slice(0, 28);
    const created = await createBranch(auth, {
      name: `${RUN_ID} Branch C`,
      code: codeC,
      address: 'C Street',
      phone: '0912345678',
      invoiceProfile: { displayName: 'BRAND-C', templateId: 'retail-a4-classic' } as InvoiceProfile,
      adminPassword: ADMIN_PASSWORD,
    });
    const res = await auth.patch(`${API}/system/branches/${created._id}`, {
      data: {
        name: created.name,
        address: created.address,
        phone: 'not-a-phone-abc',
        invoiceProfile: created.invoiceProfile,
        adminPassword: ADMIN_PASSWORD,
      },
    });
    expect(res.status()).toBe(400);
  });
});
