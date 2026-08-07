import { test, expect } from '@playwright/test';

/** Settings surfaces: API tokens, integrations (webhook + AI + vault), report branding, users, audit. */
test.describe.serial('settings', () => {
  test('create an API token (shown once) and copy', async ({ page }) => {
    await page.goto('/settings/tokens');
    await page.getByTestId('token-label').fill('ci-automation');
    await page.getByTestId('create-token').click();
    await expect(page.getByTestId('new-token')).toContainText('vct_');
    await expect(page.getByTestId('token-list')).toContainText('ci-automation');
    await expect(page.getByRole('button', { name: 'Copy token' })).toBeVisible();
  });

  test('add, test and remove a webhook', async ({ page }) => {
    // Integrations forms submit via ActionForm (reloads after persisting). A goto racing that
    // in-flight reload aborts (net::ERR_ABORTED) and leaves a blank document, so every navigation
    // here retries until the page content is actually there.
    const gotoIntegrations = async () => {
      await expect(async () => {
        await page.goto('/settings/integrations');
        // #channel = the CREATE form's select (each webhook row also has an edit-form Channel).
        await expect(page.locator('#channel')).toBeVisible({ timeout: 3000 });
      }).toPass({ timeout: 30_000 });
    };
    await gotoIntegrations();
    await page.locator('#channel').selectOption('generic');
    await page.getByLabel('Label').fill('QA hook');
    await page.getByLabel('Webhook URL').fill('https://example.com/hook');
    await page.getByTestId('webhook-add').click();
    await expect(page.getByText('QA hook')).toBeVisible({ timeout: 15_000 });
    // Test just needs to not error (the probe needs outbound network, blocked in CI).
    await page.getByRole('button', { name: 'Test' }).first().click();
    await gotoIntegrations();
    // Remove is a destructive ConfirmButton (window.confirm); accept the dialog so the action runs.
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Remove' }).first().click();
    await expect(page.getByText('QA hook')).toHaveCount(0, { timeout: 15_000 });
  });

  test('save system default + per-project AI provider settings', async ({ page }) => {
    // The integrations forms submit via ActionForm, which reloads after persisting. Re-load between
    // steps so an in-flight reload never races the next interaction, and assert the persisted values.
    await page.goto('/settings/integrations');
    await page.getByTestId('ai-default-provider').selectOption('ollama');
    await page.locator('#default-model').fill('llama3');
    // System API key: stored encrypted, works for every project without its own vault key.
    await page.getByTestId('ai-default-key').fill('sk-e2e-system-key');
    await page.getByTestId('ai-default-save').click();
    await expect(page.getByTestId('ai-default-provider')).toHaveValue('ollama', { timeout: 20_000 });
    await expect(page.locator('#default-model')).toHaveValue('llama3');
    // The key persisted: remove-checkbox shows immediately; the validity verdict badge lands after
    // the network probe (up to ~12s when egress is blocked), so reload-poll for it. Its VALUE needs
    // outbound network, so only presence is asserted.
    await expect(page.getByText('Remove the stored system key')).toBeVisible();
    await expect(async () => {
      await page.goto('/settings/integrations');
      await expect(page.getByTestId('ai-default-key-status')).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });

    // :visible - right after an ActionForm reload the dev server can transiently leave a hidden
    // duplicate of the page in the DOM, which trips strict mode (steady-state DOM is single).
    await page.goto('/settings/integrations');
    await page.locator('#provider:visible').selectOption('openai');
    await page.locator('#model:visible').fill('gpt-4o-mini');
    await page.getByTestId('ai-save').click();
    await expect(page.locator('#model:visible')).toHaveValue('gpt-4o-mini', { timeout: 15_000 });
  });

  test('set, test and clear a vault API key (masked)', async ({ page }) => {
    await page.goto('/settings/integrations');
    await page.getByTestId('vault-input-otx').fill('secret-otx-key');
    await page.getByTestId('vault-save-otx').click();
    // ActionForm reloads after persisting; the "set" badge + Clear button appear afterwards.
    await expect(page.getByTestId('vault-clear-otx')).toBeVisible({ timeout: 15_000 });
    // Validity check: clicking Test must not error. The verdict badge depends on outbound network to
    // the provider (blocked in CI), so we don't assert it here; prod verifies the verdict end to end.
    await page.getByTestId('vault-test-otx').click();
    await page.goto('/settings/integrations');
    await page.getByTestId('vault-clear-otx').click();
    await expect(page.getByTestId('vault-clear-otx')).toHaveCount(0, { timeout: 15_000 });
  });

  test('report branding + signatory', async ({ page }) => {
    await page.goto('/settings/reports');
    await page.getByLabel('Company name').first().fill('Acme Security');
    await page.getByRole('button', { name: 'Save' }).first().click();
    await page.getByLabel('Name', { exact: true }).fill('Jane Analyst');
    await page.getByLabel('Position', { exact: true }).fill('Lead Analyst');
    await page.getByRole('button', { name: 'Add signatory' }).click();
    await expect(page.getByText('Jane Analyst')).toBeVisible();
  });

  test('create a scan profile with advanced config', async ({ page }) => {
    await page.goto('/settings/profiles');
    // Per-row Edit forms now also expose Name/Exclude fields, so scope to the create form.
    const create = page.locator('form', { has: page.getByRole('button', { name: 'Create profile' }) });
    await create.getByLabel('Name').fill('QA Deep UA');
    // Per-tool fieldsets now expose separate httpx/nuclei User-Agent fields.
    await create.locator('#httpxUserAgent').fill('vacti-qa/1.0');
    await create.getByLabel('Exclude subdomains').fill('dev.example.com');
    await create.getByRole('button', { name: 'Create profile' }).click();
    await expect(page.getByText('QA Deep UA')).toBeVisible();
    await expect(page.getByText('UA set')).toBeVisible();
  });

  test('users page lists the admin with a role selector', async ({ page }) => {
    await page.goto('/settings/users');
    // The email also appears in the topbar user-menu, so scope to the users card.
    await expect(page.getByText('admin@vacti.local').first()).toBeVisible();
    // The admin's row role select (last select[name=role]; the first is the Add-user form).
    await expect(page.locator('select[name="role"]').last()).toHaveValue('SysAdmin');
    // Add-user form is present.
    await expect(page.locator('#email')).toBeVisible();
  });

  test('audit log shows recorded actions', async ({ page }) => {
    await page.goto('/settings/audit');
    // Earlier specs created projects/scans → at least one audit entry exists.
    await expect(page.getByText(/project\.create|scan\.start|vault\.key_set/).first()).toBeVisible();
  });

  test('account page shows profile and rejects a wrong current password', async ({ page }) => {
    await page.goto('/settings/account');
    await expect(page.getByText('admin@vacti.local').first()).toBeVisible();
    // Wrong current password → error, and (crucially) the real password is left unchanged.
    await page.getByLabel('Current password').fill('definitely-wrong');
    await page.getByLabel('New password', { exact: true }).fill('newpassword123');
    await page.getByLabel('Confirm new password').fill('newpassword123');
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page.getByText('Current password is incorrect.')).toBeVisible();
  });
});
