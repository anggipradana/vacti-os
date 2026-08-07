import { test, expect } from '@playwright/test';

/**
 * Auth flows that must NOT reuse the shared admin session (logout deletes its session row).
 * Each test starts unauthenticated and manages its own login.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test('unauthenticated access redirects to login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
});

test('login then logout', async ({ page }) => {
  // The admin already exists (created in auth.setup) → this is a normal sign-in.
  await page.goto('/login');
  await page.getByTestId('email').fill('admin@vacti.local');
  await page.getByTestId('password').fill('supersecret');
  await page.getByTestId('submit').click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByTestId('user-menu').click();
  await page.getByTestId('logout').click();
  await expect(page).toHaveURL(/\/login/);
});

test('wrong password is rejected', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('email').fill('admin@vacti.local');
  await page.getByTestId('password').fill('wrongpassword');
  await page.getByTestId('submit').click();
  await expect(page).toHaveURL(/\/login\?error=invalid/);
});

test('docs endpoints require a session', async ({ page, request }) => {
  // OpenAPI spec: 401 without a session.
  expect((await request.get('/api/openapi.json')).status()).toBe(401);
  // /docs page: redirected to login.
  await page.goto('/docs');
  await expect(page).toHaveURL(/\/login/);
});
