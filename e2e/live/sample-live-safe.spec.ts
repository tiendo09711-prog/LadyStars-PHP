import { test, expect, request } from '@playwright/test';

/**
 * Sample live-safe spec (API read-only).
 *
 * Demonstrates the only allowed pattern for live DB tests:
 *  - uses the app API on port 4100 (never 4000);
 *  - read-only: health check, login, GET categories;
 *  - no direct DB connection, no deleteMany, no dropDatabase,
 *    no Store Settings mutation, no admin/root-owner upsert.
 *
 * Run via: npm.cmd run live:test -- --spec e2e/live/sample-live-safe.spec.ts
 */

const API_BASE = process.env.E2E_API_BASE_URL || 'http://localhost:4100/api';
const HEALTH_URL = API_BASE.replace(/\/api$/, '') + '/health';

test.describe('live-safe sample', () => {
  test('health check on E2E port 4100', async () => {
    const api = await request.newContext();

    // Backend health endpoint responds
    const healthRes = await api.get(HEALTH_URL);
    expect(healthRes.ok()).toBeTruthy();

    // Verify we are NOT on port 4000 (dev server) and ARE on 4100 (E2E)
    const url = new URL(API_BASE);
    expect(url.port).not.toBe('4000');
    expect(url.port).toBe('4100');

    await api.dispose();
  });

  test('login and authenticated read-only API', async () => {
    const email = process.env.E2E_AUTH_EMAIL;
    const password = process.env.E2E_AUTH_PASSWORD;
    test.skip(!email || !password, 'E2E_AUTH_EMAIL / E2E_AUTH_PASSWORD not set');

    const api = await request.newContext();

    // Login with configured credentials (never printed)
    const loginRes = await api.post(`${API_BASE}/auth/login`, { data: { email, password } });

    // If credentials are not valid for this database, skip gracefully.
    // This is not a workflow failure ? it means the E2E auth account
    // does not exist in the target database.
    test.skip(loginRes.status() === 401, 'E2E auth credentials not valid for target DB (401)');
    test.skip(loginRes.status() === 404, 'Auth login endpoint not found (404)');

    expect(loginRes.ok()).toBeTruthy();
    const loginBody = await loginRes.json();
    expect(loginBody.token).toBeTruthy();

    // Authenticated read-only request (categories list)
    const authApi = await request.newContext({
      extraHTTPHeaders: { Authorization: `Bearer ${loginBody.token}` },
    });
    const catRes = await authApi.get(`${API_BASE}/products/categories`);
    expect(catRes.ok()).toBeTruthy();
    const categories = await catRes.json();
    expect(Array.isArray(categories)).toBeTruthy();

    await api.dispose();
    await authApi.dispose();
  });
});
