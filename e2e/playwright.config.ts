import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

const repoRoot = path.basename(process.cwd()) === 'e2e' ? path.resolve(process.cwd(), '..') : process.cwd();
dotenv.config({ path: path.resolve(repoRoot, '.env') });
dotenv.config({ path: path.resolve(repoRoot, '.env.e2e.local'), override: false });

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5173';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Keep it 1 for sequential e2e tests
  reporter: 'html',
  timeout: 30000,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },

  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
});
