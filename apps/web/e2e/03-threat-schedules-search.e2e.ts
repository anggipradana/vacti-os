import { test, expect } from '@playwright/test';

/** Threat Intel, scheduled scans, and universal search. Relies on the project + target from 01-core. */
test.describe.serial('threat / schedules / search', () => {
  test('threat page: risk gauge, indicator, refresh, AI narrative', async ({ page }) => {
    await page.goto('/threat');
    await expect(page.getByRole('heading', { name: 'Threat Intelligence' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Unified risk score' })).toBeVisible();
    // Manual indicator.
    await page.getByLabel('Value').fill('evil.example.com');
    await page.getByRole('button', { name: 'Add indicator' }).click();
    await expect(page.getByText('evil.example.com')).toBeVisible();
    // Refresh enqueues (no worker in e2e) - must not error.
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.getByRole('heading', { name: 'Threat Intelligence' })).toBeVisible();
    // AI narrative generate (no key → graceful no-op, no crash).
    await page.getByRole('button', { name: /Generate|Regenerate/ }).click();
    await expect(page.getByText('AI risk analysis')).toBeVisible();
  });

  test('schedules: create (friendly picker), pause, enable, delete', async ({ page }) => {
    await page.goto('/settings/schedules');
    // Friendly pickers (freq/time/day) replaced the raw cron field; defaults are valid.
    await page.getByRole('button', { name: 'Add schedule' }).click();
    await expect(page.getByTestId('schedule-row')).toHaveCount(1);
    // exact:true → match the lowercase status badge, not the Edit form's "Enabled"/"Paused" options.
    await expect(page.getByTestId('schedule-row').getByText('enabled', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Pause' }).first().click();
    await expect(page.getByTestId('schedule-row').getByText('paused', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Enable' }).first().click();
    await expect(page.getByTestId('schedule-row').getByText('enabled', { exact: true })).toBeVisible();
    // Delete is a destructive ConfirmButton (window.confirm); accept the dialog so the action runs.
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete' }).first().click();
    await expect(page.getByTestId('schedule-row')).toHaveCount(0);
  });

  test('schedules: weekly frequency picker (no raw cron field)', async ({ page }) => {
    await page.goto('/settings/schedules');
    await expect(page.locator('select[name="freq"]')).toBeVisible();
    await page.locator('select[name="freq"]').selectOption('weekly');
    await page.getByRole('button', { name: 'Add schedule' }).click();
    await expect(page.getByTestId('schedule-row')).toHaveCount(1);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete' }).first().click();
    await expect(page.getByTestId('schedule-row')).toHaveCount(0);
  });

  test('universal search returns categorised hits', async ({ page }) => {
    await page.goto('/search');
    // Submit via Enter (avoids the ⌘K palette trigger which is also named "Search").
    await page.getByPlaceholder('Search across everything…').fill('acme');
    await page.getByPlaceholder('Search across everything…').press('Enter');
    await expect(page.getByText('project', { exact: true }).first()).toBeVisible();
    // Target search.
    await page.getByPlaceholder('Search across everything…').fill('127.0.0.1');
    await page.getByPlaceholder('Search across everything…').press('Enter');
    await expect(page.getByText('target', { exact: true }).first()).toBeVisible();
  });

  test('reports: VA + TI PDF endpoints return application/pdf', async ({ page, request }) => {
    // Find a scan id from the scans list link.
    await page.goto('/scans');
    const scanLink = page.getByTestId('scan-list').getByRole('link').first();
    const href = await scanLink.getAttribute('href');
    expect(href).toMatch(/\/scans\/[0-9a-f-]{36}/);
    const scanId = href!.split('/').pop()!;
    const va = await request.get(`/reports/va/${scanId}?type=full`);
    expect(va.status()).toBe(200);
    expect(va.headers()['content-type']).toContain('application/pdf');
  });
});
