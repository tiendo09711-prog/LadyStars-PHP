import { expect, Page, Request, Route, test } from '@playwright/test';
import { ObjectId } from 'mongodb';
import {
  cleanupBranchConfigFixtures,
  closeDB,
  connectDB,
  createEmptyBranch,
  findBranchByCode,
  API_BASE,
} from '../utils/db';

const PREFIX = 'E2E_PHASE1_';

type BranchFixture = Awaited<ReturnType<typeof createEmptyBranch>>;

type BranchPair = {
  prefix: string;
  branchA: BranchFixture;
  branchB: BranchFixture;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function resolveAdminPassword() {
  const password = process.env.E2E_AUTH_PASSWORD;
  if (!password) throw new Error('E2E_AUTH_PASSWORD is required for branch Phase 1 E2E');
  return password;
}

async function createBranchPair(label: string): Promise<BranchPair> {
  const runId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}_${label}`.toUpperCase();
  const prefix = `${PREFIX}${runId}_`;
  await cleanupBranchConfigFixtures(prefix);
  const branchA = await createEmptyBranch(prefix, {
    name: `${prefix}A`,
    code: `${prefix}A`,
    address: `${prefix}Address A`,
    phone: '0901000001',
    displayName: `${prefix}Brand A`,
  });
  const branchB = await createEmptyBranch(prefix, {
    name: `${prefix}B`,
    code: `${prefix}B`,
    address: `${prefix}Address B`,
    phone: '0902000002',
    displayName: `${prefix}Brand B`,
  });
  return { prefix, branchA, branchB };
}

async function cleanupBranchPair(pair: BranchPair) {
  await cleanupBranchConfigFixtures(pair.prefix);
  const db = await connectDB();
  const remaining = await db.collection('branches').countDocuments({
    code: { $in: [pair.branchA.code, pair.branchB.code] },
  });
  expect(remaining).toBe(0);
}

async function openBranchesPage(page: Page, pair: BranchPair) {
  await page.goto('/warehouse/branches');
  await expect(page.locator('.warehouse-branches-page')).toBeVisible();
  await page.locator('.warehouse-branch-search input').fill(pair.prefix);
  await expect(page.locator('.warehouse-branch-card').filter({ hasText: pair.branchA.name })).toBeVisible();
  await expect(page.locator('.warehouse-branch-card').filter({ hasText: pair.branchB.name })).toBeVisible();
}

async function selectBranch(page: Page, branch: BranchFixture) {
  await page.locator('.warehouse-branch-card').filter({ hasText: branch.name }).click();
}

function formLocators(page: Page) {
  return {
    name: page.locator('input[aria-label="Tên kho"]'),
    address: page.locator('textarea[aria-label="Địa chỉ"]'),
    phone: page.locator('input[aria-label="Hotline"]'),
    displayName: page.locator('input[aria-label="Tên thương hiệu"]'),
  };
}

async function ensureInvoiceSettingsOpen(page: Page) {
  const displayName = formLocators(page).displayName;
  if (await displayName.isVisible()) return;
  await page.locator('button').filter({ hasText: 'Cấu hình in hóa đơn' }).click();
  await expect(displayName).toBeVisible();
}

async function expectBranchForm(page: Page, branch: BranchFixture) {
  await ensureInvoiceSettingsOpen(page);
  const form = formLocators(page);
  await expect(form.name).toHaveValue(branch.name);
  await expect(form.address).toHaveValue(branch.address);
  await expect(form.phone).toHaveValue(branch.phone);
  await expect(form.displayName).toHaveValue(branch.invoiceProfile.displayName);
}

async function fillBranchForm(page: Page, values: { name?: string; address?: string; phone?: string; displayName?: string }) {
  await ensureInvoiceSettingsOpen(page);
  const form = formLocators(page);
  if (values.name !== undefined) await form.name.fill(values.name);
  if (values.address !== undefined) await form.address.fill(values.address);
  if (values.phone !== undefined) await form.phone.fill(values.phone);
  if (values.displayName !== undefined) await form.displayName.fill(values.displayName);
}

async function clickSave(page: Page, password: string) {
  await page.locator('.warehouse-actions-row button.btn-primary').click();
  await page.locator('[role="dialog"] input[type="password"]').fill(password);
  await page.locator('[role="dialog"] button.btn-primary').click();
}

async function branchByCode(code: string) {
  const branch = await findBranchByCode(code);
  expect(branch).toBeTruthy();
  return branch as any;
}

async function delayDetail(page: Page, branchId: ObjectId, ms: number) {
  const branchIdText = branchId.toString();
  await page.route('**/api/system/branches/**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET' && request.url().includes(`/system/branches/${branchIdText}`) && !request.url().includes('/usage')) {
      await delay(ms);
    }
    try {
      await route.continue();
    } catch {
      // AbortController cancellation is expected for superseded detail requests.
    }
  });
}

async function capturePatch(page: Page, branchId: ObjectId, options?: { delayMs?: number }) {
  const branchIdText = branchId.toString();
  let captured: { url: string; data: any } | null = null;
  let resolveCaptured!: () => void;
  const capturedPromise = new Promise<void>((resolve) => { resolveCaptured = resolve; });
  await page.route('**/api/system/branches/**', async (route: Route, request: Request) => {
    if (request.method() === 'PATCH' && request.url().includes(`/system/branches/${branchIdText}`)) {
      captured = { url: request.url(), data: request.postDataJSON() };
      resolveCaptured();
      if (options?.delayMs) await delay(options.delayMs);
    }
    await route.continue();
  });
  return { get captured() { return captured; }, capturedPromise };
}

function captureUnexpectedErrors(page: Page) {
  const errors: string[] = [];
  const ignored = /ERR_CANCELED|AbortError|aborted|cancel/i;
  page.on('console', (message) => {
    if (message.type() === 'error' && !ignored.test(message.text())) errors.push(message.text());
  });
  page.on('pageerror', (error) => {
    if (!ignored.test(error.message)) errors.push(error.message);
  });
  return errors;
}

test.describe('Warehouse branches Phase 1 regression', () => {
  test.use({ storageState: 'playwright/.auth/user.json' });

  test.afterAll(async () => {
    await closeDB();
  });

  test('Case 1 - stale detail A delayed, B remains selected', async ({ page }) => {
    const pair = await createBranchPair('C1');
    const errors = captureUnexpectedErrors(page);
    try {
      await delayDetail(page, pair.branchA._id, 700);
      await openBranchesPage(page, pair);
      await selectBranch(page, pair.branchA);
      await selectBranch(page, pair.branchB);
      await expectBranchForm(page, pair.branchB);
      await delay(850);
      await expectBranchForm(page, pair.branchB);
      expect(errors).toEqual([]);
    } finally {
      await cleanupBranchPair(pair);
    }
  });

  test('Case 2 - dirty form is not overwritten by pending detail', async ({ page }) => {
    const pair = await createBranchPair('C2');
    try {
      await delayDetail(page, pair.branchB._id, 700);
      await openBranchesPage(page, pair);
      await selectBranch(page, pair.branchB);
      await fillBranchForm(page, { name: `${pair.prefix}USER_EDIT_B`, address: `${pair.prefix}User Address B` });
      await delay(850);
      const form = formLocators(page);
      await expect(form.name).toHaveValue(`${pair.prefix}USER_EDIT_B`);
      await expect(form.address).toHaveValue(`${pair.prefix}User Address B`);
    } finally {
      await cleanupBranchPair(pair);
    }
  });

  test('Case 3 - save captures target B while user switches to A', async ({ page }) => {
    const pair = await createBranchPair('C3');
    const password = await resolveAdminPassword();
    try {
      await openBranchesPage(page, pair);
      await selectBranch(page, pair.branchB);
      const nextName = `${pair.prefix}B_SAVED`;
      const nextAddress = `${pair.prefix}B Saved Address`;
      await fillBranchForm(page, { name: nextName, address: nextAddress, displayName: `${pair.prefix}Brand B Saved` });
      const patch = await capturePatch(page, pair.branchB._id, { delayMs: 700 });
      await clickSave(page, password);
      await patch.capturedPromise;
      await selectBranch(page, pair.branchA);
      await delay(850);
      expect(patch.captured?.url).toContain(`/system/branches/${pair.branchB._id.toString()}`);
      expect(patch.captured?.data?.name).toBe(nextName);
      const savedB = await branchByCode(pair.branchB.code);
      const untouchedA = await branchByCode(pair.branchA.code);
      expect(savedB.name).toBe(nextName);
      expect(savedB.address).toBe(nextAddress);
      expect(untouchedA.name).toBe(pair.branchA.name);
      await expectBranchForm(page, pair.branchA);
    } finally {
      await cleanupBranchPair(pair);
    }
  });

  test('Case 4 - rapid A to B to A to B ends with B form', async ({ page }) => {
    const pair = await createBranchPair('C4');
    const errors = captureUnexpectedErrors(page);
    try {
      await delayDetail(page, pair.branchA._id, 600);
      await delayDetail(page, pair.branchB._id, 150);
      await openBranchesPage(page, pair);
      await selectBranch(page, pair.branchA);
      await selectBranch(page, pair.branchB);
      await selectBranch(page, pair.branchA);
      await selectBranch(page, pair.branchB);
      await delay(850);
      await expectBranchForm(page, pair.branchB);
      expect(errors).toEqual([]);
    } finally {
      await cleanupBranchPair(pair);
    }
  });

  test('Case 5 - invalid phone does not send update and keeps DB value', async ({ page }) => {
    const pair = await createBranchPair('C5');
    const password = await resolveAdminPassword();
    let patchCount = 0;
    try {
      await openBranchesPage(page, pair);
      await selectBranch(page, pair.branchB);
      await fillBranchForm(page, { phone: 'abc123' });
      await page.route('**/api/system/branches/**', async (route, routeRequest) => {
        if (routeRequest.method() === 'PATCH') patchCount += 1;
        await route.continue();
      });
      await clickSave(page, password);
      await expect(page.locator('[role="alert"]')).toContainText('Hotline không hợp lệ');
      await delay(250);
      expect(patchCount).toBe(0);
      const branchB = await branchByCode(pair.branchB.code);
      expect(branchB.phone).toBe(pair.branchB.phone);
    } finally {
      await cleanupBranchPair(pair);
    }
  });

  test('Case 6 - valid formatted phone is saved as current convention', async ({ page }) => {
    const pair = await createBranchPair('C6');
    const password = await resolveAdminPassword();
    try {
      await openBranchesPage(page, pair);
      await selectBranch(page, pair.branchB);
      const formattedPhone = '0901 234-567';
      const patch = await capturePatch(page, pair.branchB._id);
      await fillBranchForm(page, { phone: formattedPhone });
      await clickSave(page, password);
      await patch.capturedPromise;
      expect(patch.captured?.data?.phone).toBe(formattedPhone);
      await expect(page.locator('.warehouse-branches-notice')).toBeVisible();
      const branchB = await branchByCode(pair.branchB.code);
      expect(branchB.phone).toBe(formattedPhone);
      await page.reload();
      await openBranchesPage(page, pair);
      await selectBranch(page, pair.branchB);
      await expect(formLocators(page).phone).toHaveValue(formattedPhone);
    } finally {
      await cleanupBranchPair(pair);
    }
  });
});

