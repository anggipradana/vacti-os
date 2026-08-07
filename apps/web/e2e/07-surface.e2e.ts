import { test, expect } from '@playwright/test';
import { Pool } from 'pg';

/**
 * Attack Surface (passive recon) page: seeds discovered URLs + an exposure finding, then drives the
 * real GUI to assert findings render with a masked snippet, category filtering works, and exposure
 * triage updates the dropdown in place. Guards the passive-recon UI end to end.
 */
const DB =
  process.env.DATABASE_URL ?? `postgres://vacti:${process.env.POSTGRES_PASSWORD ?? 'vacti'}@localhost:5432/vacti_e2e`;
const pool = new Pool({ connectionString: DB });
const ids: { project?: string } = {};

test.beforeAll(async () => {
  const c = await pool.connect();
  try {
    const proj = await c.query(
      `insert into projects (slug, name, sector) values ('surface-qa','Surface QA','banking') returning id`,
    );
    const projectId = proj.rows[0].id as string;
    ids.project = projectId;
    const tgt = await c.query(`insert into targets (project_id, domain) values ($1,'surface.test') returning id`, [
      projectId,
    ]);
    await c
      .query(`insert into targets (project_id, domain) values ($1,'surface.test') on conflict do nothing`, [projectId])
      .catch(() => {});
    // Two discovered URLs: one categorised backup, one source file.
    await c.query(
      `insert into discovered_urls (project_id, target_id, host, url_text, url_sha256, sources, pathname_extension, category_slug)
       values ($1,$2,'surface.test','https://surface.test/db/backup.sql','sha-backup', ARRAY['wayback'], '.sql','db-dumps'),
              ($1,$2,'surface.test','https://surface.test/app.js','sha-src', ARRAY['virustotal'], '.js','source')`,
      [projectId, tgt.rows[0].id],
    );
    // One exposure finding with a maskable snippet.
    await c.query(
      `insert into exposure_findings (project_id, source, finding_type, snippet, url_text, status)
       values ($1,'url','aws-key','AKIAIOSFODNN7EXAMPLE','https://surface.test/leak.js','new')`,
      [projectId],
    );
  } finally {
    c.release();
  }
});

test.afterAll(async () => {
  if (ids.project) await pool.query(`delete from projects where id=$1`, [ids.project]);
  await pool.end();
});

test.describe.serial('attack surface page', () => {
  test('renders findings (masked) + discovered URLs', async ({ page }) => {
    await page.goto(`/surface?project=${ids.project}`);
    await expect(page.getByRole('heading', { name: 'Attack Surface' })).toBeVisible();
    // exact:true → match the badge text, not the "aws-key (1)" filter <option>.
    await expect(page.getByText('aws-key', { exact: true }).first()).toBeVisible();
    // Snippet is masked until revealed.
    await expect(page.getByText('•••••• show').first()).toBeVisible();
    await expect(page.locator('text=AKIAIOSFODNN7EXAMPLE')).toHaveCount(0);
    await page.getByText('•••••• show').first().click();
    await expect(page.getByText('AKIAIOSFODNN7EXAMPLE')).toBeVisible();
    // Discovered URLs present.
    await expect(page.getByText('backup.sql')).toBeVisible();
  });

  test('category filter narrows discovered URLs', async ({ page }) => {
    await page.goto(`/surface?project=${ids.project}&cat=db-dumps`);
    await expect(page.getByText('backup.sql')).toBeVisible();
    await expect(page.getByText('app.js')).toHaveCount(0);
  });

  test('exposure triage updates the dropdown in place', async ({ page }) => {
    await page.goto(`/surface?project=${ids.project}`);
    const row = page.locator('tr', { has: page.getByText('aws-key', { exact: true }) }).first();
    const sel = row.locator('select[name="status"]');
    await sel.selectOption('confirmed'); // auto-submits on change (no Set button)
    await expect(row.locator('select[name="status"]')).toHaveValue('confirmed');
  });
});
