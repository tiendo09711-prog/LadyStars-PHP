import { defineConfig, devices } from '@playwright/test';

const clientPort = 15173;
const backendPort = 18000;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: 'e2e/test-results',
  use: {
    baseURL: `http://127.0.0.1:${clientPort}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: `node scripts/start-e2e-backend.cjs ${backendPort}`,
      url: `http://127.0.0.1:${backendPort}/up`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `node scripts/start-e2e-client.cjs ${clientPort} ${backendPort}`,
      url: `http://127.0.0.1:${clientPort}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
