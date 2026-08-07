import { test as setup, expect } from '@playwright/test';

const STORAGE = 'apps/web/e2e/.auth/admin.json';

/** First run: create the admin, then persist the authenticated session for all specs. */
setup('authenticate as admin', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('email').fill('admin@vacti.local');
  await page.getByTestId('password').fill('supersecret');
  await page.getByTestId('submit').click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByTestId('user-menu')).toContainText('admin@vacti.local');
  await page.context().storageState({ path: STORAGE });
});
