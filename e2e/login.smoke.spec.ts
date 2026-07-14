import { expect, test } from '@playwright/test';

test('renders the login page without writes or browser errors', async ({ page }) => {
  const browserErrors: string[] = [];
  const disallowedRequests: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method())) {
      disallowedRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  await page.goto('/login');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'LadyStars ERP' })).toBeVisible();
  await expect(page.locator('#login-email')).toBeVisible();
  await expect(page.locator('#login-password')).toBeVisible();
  await expect(page.locator('button.login-submit')).toBeEnabled();
  await expect(page.getByRole('img', { name: 'LadyStars' })).toBeVisible();

  expect(disallowedRequests).toEqual([]);
  expect(browserErrors).toEqual([]);
});
