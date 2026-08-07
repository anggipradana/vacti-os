import { test, expect } from '@playwright/test';
import { Pool } from 'pg';

/**
 * Triage QA: every status control (single "Set" + bulk "Apply") must actually change the status AND
 * have the per-row dropdown reflect the new value in place - no reload. Regression guard for the
 * uncontrolled-<select> bug where the dropdown kept showing "new" after a successful update.
 * Covers all four triaged entities: sector news, leaked credentials, brand monitoring, vulnerabilities.
 */
const DB =
  process.env.DATABASE_URL ?? `postgres://vacti:${process.env.POSTGRES_PASSWORD ?? 'vacti'}@localhost:5432/vacti_e2e`;
const pool = new Pool({ connectionString: DB });
const ids: { project?: string; scan?: string } = {};

test.beforeAll(async () => {
  const c = await pool.connect();
  try {
    const proj = await c.query(
      `insert into projects (slug, name, sector) values ('triage-qa','Triage QA','banking') returning id`,
    );
    const projectId = proj.rows[0].id as string;
    ids.project = projectId;
    const tgt = await c.query(`insert into targets (project_id, domain) values ($1,'triage.test') returning id`, [
      projectId,
    ]);
    const scan = await c.query(
      `insert into scans (project_id, target_id, status) values ($1,$2,'completed') returning id`,
      [projectId, tgt.rows[0].id],
    );
    ids.scan = scan.rows[0].id as string;
    // One row per triaged entity, all in their initial untriaged state.
    await c.query(
      `insert into vulnerabilities (scan_id, template_id, name, severity, status, host, matched_at)
       values ($1,'tls-version','TLS Version Detect',0,'open','triage.test','https://triage.test')`,
      [ids.scan],
    );
    await c.query(
      `insert into leakcheck_data (project_id, domain, identifier, hash_md5, type, status)
       values ($1,'triage.test','user@triage.test','abc123','domain','new')`,
      [projectId],
    );
    await c.query(
      `insert into threat_news (sector, title, link, source, status)
       values ('banking','Triage QA headline','https://news.test/triage','QA Feed','new')`,
    );
    await c.query(
      `insert into brand_news (project_id, title, link, source, status)
       values ($1,'Triage QA brand mention','https://news.test/brand','QA Feed','new')`,
      [projectId],
    );
  } finally {
    c.release();
  }
});

test.afterAll(async () => {
  if (ids.project) await pool.query(`delete from projects where id=$1`, [ids.project]);
  await pool.query(`delete from threat_news where link='https://news.test/triage'`);
  await pool.end();
});

/** Pick a status different from the row's current one and assert the dropdown updates in place.
 *  The status select now auto-submits on change (no separate "Set" button). */
async function expectSetUpdatesInPlace(row: import('@playwright/test').Locator) {
  const sel = row.locator('select[name="status"]');
  const before = await sel.inputValue();
  const opts = await sel.locator('option').evaluateAll((os) => (os as HTMLOptionElement[]).map((o) => o.value));
  const target = opts.find((o) => o !== before)!;
  await sel.selectOption(target); // auto-submits the form on change
  // No reload - the dropdown must reflect the new status after in-place revalidation.
  await expect(row.locator('select[name="status"]')).toHaveValue(target);
}

test.describe.serial('triage status controls reflect changes in place', () => {
  test('sector news: Set updates dropdown in place', async ({ page }) => {
    await page.goto(`/threat?project=${ids.project}`);
    const row = page.locator('div.rounded-lg:has(h3:has-text("Security news")) li').first();
    await expect(row).toBeVisible();
    await expectSetUpdatesInPlace(row);
  });

  test('brand monitoring: Set updates dropdown in place', async ({ page }) => {
    await page.goto(`/threat?project=${ids.project}`);
    const row = page.locator('div.rounded-lg:has(h3:has-text("Brand monitoring")) li').first();
    await expect(row).toBeVisible();
    await expectSetUpdatesInPlace(row);
  });

  test('leaked credentials: Set updates dropdown in place', async ({ page }) => {
    await page.goto(`/threat?project=${ids.project}`);
    const row = page.locator('table tr:has(form select[name="status"])').first();
    await expect(row).toBeVisible();
    await expectSetUpdatesInPlace(row);
  });

  test('vulnerability: Set updates dropdown in place', async ({ page }) => {
    await page.goto(`/scans/${ids.scan}`);
    await page.getByRole('tab', { name: /Vulnerabilit/i }).click();
    const row = page.locator('table tr:has(form select[name="status"])').first();
    await expect(row).toBeVisible();
    await expectSetUpdatesInPlace(row);
  });

  test('bulk Apply marks all sector news and dropdowns reflect it', async ({ page }) => {
    await page.goto(`/threat?project=${ids.project}`);
    const bulk = page.locator('form:has(input[type="hidden"][name="sector"]):has(button:text-is("Apply"))').first();
    await bulk.locator('select[name="status"]').selectOption('reviewed');
    await bulk.getByRole('button', { name: 'Apply', exact: true }).click();
    const row = page.locator('div.rounded-lg:has(h3:has-text("Security news")) li').first();
    await expect(row.locator('select[name="status"]')).toHaveValue('reviewed');
  });
});
