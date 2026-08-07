import { test, expect } from '@playwright/test';

/**
 * Core journey: project → target (predefined sub) → scan → live detail → cancel → report link →
 * dashboard onboarding clears. Auth comes from the shared admin storage state (auth.setup.ts).
 */
test.describe.serial('core journey', () => {
  test('dashboard shows onboarding when empty', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Get started' })).toBeVisible();
  });

  test('create a project', async ({ page }) => {
    await page.goto('/settings/projects');
    await page.getByTestId('project-name').fill('Acme Corp');
    await page.getByTestId('project-slug').fill('acme');
    await page.getByTestId('create-project').click();
    await expect(page.getByTestId('project-list')).toContainText('acme');
  });

  test('create a target with predefined sub + custom header, then notes', async ({ page }) => {
    await page.goto('/targets');
    await page.getByTestId('target-domain').fill('127.0.0.1');
    await page.getByTestId('target-subs').fill('127.0.0.1:8099');
    await page.getByLabel('Custom request headers').fill('X-QA: vacti');
    await page.getByTestId('create-target').click();
    await expect(page.getByTestId('target-list')).toContainText('127.0.0.1');
    // List shows the custom-headers badge.
    await expect(page.getByTestId('target-list').getByText('custom headers')).toBeVisible();
    // Target detail shows the masked custom header key + recon notes.
    await page.getByTestId('target-list').getByRole('link', { name: '127.0.0.1' }).first().click();
    await expect(page).toHaveURL(/\/targets\/[0-9a-f-]{36}/);
    await expect(page.getByText('X-QA', { exact: false })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Recon notes/ })).toBeVisible();
    await page.getByPlaceholder('Add a note or TODO…').fill('check the VPN host');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('check the VPN host')).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByText('done', { exact: true })).toBeVisible();
  });

  test('start a scan and reach the detail page', async ({ page }) => {
    await page.goto('/scans');
    await page.getByTestId('new-scan-trigger').click();
    // Wait for the dialog's start button before clicking (the dialog mounts on open), then the
    // plain-fetch dialog navigates via window.location once the scan is queued.
    await page.getByTestId('start-scan').click();
    await expect(page).toHaveURL(/\/scans\/[0-9a-f-]{36}/, { timeout: 20000 });
    await expect(page.getByTestId('scan-status')).toBeVisible();
    // A running/queued scan shows a Cancel button; cancel for determinism.
    const cancel = page.getByRole('button', { name: 'Cancel scan' });
    if (await cancel.isVisible().catch(() => false)) await cancel.click();
  });

  test('scans list renders', async ({ page }) => {
    await page.goto('/scans');
    await expect(page.getByTestId('scan-list')).toBeVisible();
  });

  test('reports panel lists the cancelled scan with download actions', async ({ page }) => {
    await page.goto('/reports');
    await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Threat Intelligence report' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download PDF' })).toBeVisible();
    // The scan cancelled in the earlier step is terminal, so it appears with per-type download links.
    // Cancellation lands asynchronously (worker side), so reload until the row shows up.
    await expect(async () => {
      await page.reload();
      await expect(page.getByRole('link', { name: 'Full' }).first()).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30000 });
    await expect(page.getByRole('link', { name: 'Findings' }).first()).toBeVisible();
  });

  test('docs page renders the markdown docs module', async ({ page }) => {
    await page.goto('/docs');
    await expect(page.getByRole('heading', { name: 'Documentation' })).toBeVisible();
    await expect(page.getByRole('link', { name: /API reference/ }).first()).toBeVisible();
    // The docs module actually loaded the markdown: sidebar of guides + rendered content.
    await expect(page.getByText('Guides', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Getting started' })).toBeVisible();
    // Switch to another guide and see its content render.
    await page.getByRole('button', { name: 'Architecture' }).click();
    await expect(page.getByRole('article')).toBeVisible();
    // Relative .md links resolve to the file on GitHub (not a 404 / dead link).
    await page.getByRole('button', { name: 'QA (Playwright UI)' }).click();
    await expect(page.locator('article a[href*="github.com"][href$="07-QA-AND-POLISH-PLAN.md"]').first()).toHaveCount(
      1,
    );
  });
});
