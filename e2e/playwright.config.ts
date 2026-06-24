import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

const repoRoot = path.basename(process.cwd()) === 'e2e' ? path.resolve(process.cwd(), '..') : process.cwd();
const isLive = process.env.E2E_LIVE === '1';
// Non-live E2E must not read live DB config. Live env is loaded only in explicit live mode.
if (isLive) dotenv.config({ path: path.resolve(repoRoot, '.env.live-test.local'), override: true });
dotenv.config({ path: path.resolve(repoRoot, '.env.e2e.local'), override: true });
dotenv.config({ path: path.resolve(repoRoot, '.env'), override: false });

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5174';

// Live mode: only the isolated e2e/live specs, and NO legacy setup project
// (the legacy auth.setup upserts a root admin, which is forbidden in live mode).
const liveProjects = [
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'] },
  },
];

const legacyProjects = [
  { name: 'setup', testMatch: /.*\.setup\.ts/ },
  {
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      storageState: 'playwright/.auth/user.json',
    },
    dependencies: ['setup'],
  },
];

export default defineConfig({
  testDir: isLive ? './live' : './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Keep it 1 for sequential e2e tests
  reporter: isLive ? 'list' : 'html',
  timeout: 30000,
  // No webServer block on purpose: never auto-start the real dev server (port 4000/5173).
  // The live-guarded runner spawns isolated servers on 4100/5174.
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: isLive ? liveProjects : legacyProjects,
});
