import { test as setup, expect } from '@playwright/test';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { connectDB } from '../utils/db';

const authFile = path.join(__dirname, '../playwright/.auth/user.json');

setup('authenticate', async ({ page }) => {
  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  const email = process.env.E2E_AUTH_EMAIL;
  const password = process.env.E2E_AUTH_PASSWORD;
  const apiBaseUrl = process.env.E2E_API_BASE_URL || 'http://localhost:4000/api';
  if (!email || !password) throw new Error('E2E_AUTH_EMAIL and E2E_AUTH_PASSWORD are required.');
  if (!/\.test$|[+._-]e2e|e2e[+._-]|test/i.test(email)) {
    throw new Error('E2E_AUTH_EMAIL must be an isolated .test or E2E-marked account.');
  }

  const db = await connectDB();
  const passwordHash = await bcrypt.hash(password, 10);
  await db.collection('users').updateOne(
    { email },
    {
      $set: {
        name: 'Phase 1 E2E Admin',
        email,
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        isRootOwner: true,
        isActive: true,
        tokenVersion: 0,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
      $unset: { deletedAt: '' },
    },
    { upsert: true },
  );

  const response = await page.request.post(`${apiBaseUrl}/auth/login`, {
    data: { email, password },
  });
  const token = response.ok() ? (await response.json()).token || '' : '';

  expect(token).toBeTruthy();
  await page.addInitScript((value) => {
    window.localStorage.setItem('token', value);
  }, token);
  await page.goto('/');
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 });
  await page.waitForLoadState('networkidle');
  await page.context().storageState({ path: authFile });
});
