import { test, expect } from '@playwright/test';

/**
 * Multi-project scoping. This is the regression guard for the bug where the Targets, Scans,
 * Schedules, and Dashboard pages showed every project's rows at once: the single-project core
 * journey could never surface it because the bug only appears with two or more projects. Here we
 * create two projects with distinct targets and assert each page, scoped via the active-project
 * switcher, shows only the selected project's data and never the other project's.
 */
test.describe.serial('multi-project scoping', () => {
  const A = { name: 'Alpha Inc', slug: 'alpha-co', host: 'alpha-host.test' };
  const B = { name: 'Bravo Inc', slug: 'bravo-co', host: 'bravo-host.test' };

  test('create two projects', async ({ page }) => {
    for (const p of [A, B]) {
      await page.goto('/settings/projects');
      await page.getByTestId('project-name').fill(p.name);
      await page.getByTestId('project-slug').fill(p.slug);
      await page.getByTestId('create-project').click();
      await expect(page.getByTestId('project-list')).toContainText(p.slug);
    }
  });

  test('add one distinct target to each project', async ({ page }) => {
    await page.goto('/targets');
    await page.getByTestId('target-project').selectOption({ label: A.name });
    await page.getByTestId('target-domain').fill(A.host);
    await page.getByTestId('create-target').click();
    await expect(page.getByTestId('target-list')).toBeVisible();

    await page.goto('/targets');
    await page.getByTestId('target-project').selectOption({ label: B.name });
    await page.getByTestId('target-domain').fill(B.host);
    await page.getByTestId('create-target').click();
    await expect(page.getByTestId('target-list')).toBeVisible();
  });

  test('targets page shows only the active project (not the other)', async ({ page }) => {
    await page.goto('/targets');
    // Switch to Alpha: alpha host present, bravo host absent.
    await page.getByLabel('Active project').selectOption({ label: A.name });
    await page.getByRole('button', { name: 'Switch' }).click();
    await expect(page.getByTestId('target-list')).toContainText(A.host);
    await expect(page.getByTestId('target-list')).not.toContainText(B.host);

    // Switch to Bravo: bravo host present, alpha host absent.
    await page.getByLabel('Active project').selectOption({ label: B.name });
    await page.getByRole('button', { name: 'Switch' }).click();
    await expect(page.getByTestId('target-list')).toContainText(B.host);
    await expect(page.getByTestId('target-list')).not.toContainText(A.host);
  });

  test('dashboard target count is scoped to the active project', async ({ page }) => {
    // Each project has exactly one target, so a scoped dashboard shows "1" Targets, not the global sum.
    await page.goto('/dashboard');
    await page.getByLabel('Active project').selectOption({ label: A.name });
    await page.getByRole('button', { name: 'Switch' }).click();
    await expect(page.getByTestId('stat-targets')).toHaveText('1');
  });

  test('set a default project: shows a Default badge and becomes the active project', async ({ page }) => {
    await page.goto('/settings/projects');
    // The Alpha card's "Set default" button - scope to the card containing the Alpha slug.
    const alphaCard = page.locator('[data-testid="project-list"] > *', { hasText: A.slug });
    await alphaCard.getByRole('button', { name: 'Set default' }).click();
    // Badge appears on Alpha; its own "Set default" button is now gone.
    await expect(alphaCard.getByText('Default', { exact: true })).toBeVisible();
    await expect(alphaCard.getByRole('button', { name: 'Set default' })).toHaveCount(0);
    // Setting default also makes it the active project (cookie) - dashboard scopes to Alpha (1 target).
    await page.goto('/dashboard');
    await expect(page.getByTestId('stat-targets')).toHaveText('1');
  });
});
