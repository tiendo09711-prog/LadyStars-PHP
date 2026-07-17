import { defineConfig, devices } from '@playwright/test';

/**
 * Live/dev config: reuse servers already running on 5173 (Vite) + 8000 (Laravel).
 * Does not spawn webServer. Use with:
 *   npx playwright test --config=playwright.live.config.ts --headed --workers=1 e2e/products.live.spec.ts
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: 'e2e/test-results-live',
  timeout: 180_000,
  expect: { timeout: 25_000 },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: false,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 30_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
