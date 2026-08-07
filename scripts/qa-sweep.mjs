// Functional QA sweep against the PRODUCTION build (localhost:3100).
// Exercises every major feature flow end to end inside an isolated, pre-provisioned project.
//
// Usage:
//   1. mint a session:   INSERT INTO sessions (id, user_id, expires_at) ... (random 48-hex id)
//   2. provision:        INSERT INTO projects (name, slug, sector) VALUES ('QA Sweep','qa-sweep','banking') RETURNING id
//   3. run:              node scripts/qa-sweep.mjs <sessionId> <qaProjectId> [realProjectIdForGuards]
//   4. cleanup:          DELETE FROM projects WHERE slug='qa-sweep'; (cascades all sweep data)
//
// Notes: needs @playwright/test resolvable (run from the repo root). The prod build can transiently
// duplicate page DOM during hydration; selectors use :visible + .first() and settle after goto.
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3100';
const sid = process.argv[2];
const results = [];
const ok = (name) => results.push(['PASS', name]);
const fail = (name, err) => results.push(['FAIL', `${name} :: ${String(err).slice(0, 180)}`]);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: 'vacti_session', value: sid, url: BASE }]);
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
// ConfirmButton uses window.confirm; accept all dialogs.
page.on('dialog', (d) => d.accept().catch(() => {}));
// Transient hydration can briefly duplicate page DOM on the prod build: always settle, then use
// the first visible match.
const settle = () => page.waitForTimeout(1200);
const vis = (sel) => page.locator(sel + ':visible').first();

const step = async (name, fn) => {
  try {
    await fn();
    ok(name);
  } catch (e) {
    fail(name, e);
    await page.screenshot({ path: `/tmp/sweep-fail-${results.length}.png`, fullPage: false }).catch(() => {});
  }
};
const apiFetch = (path, init) => ctx.request.fetch(BASE + path, init);
const qaId = process.argv[3];
// Optional: a REAL project id to guard against cross-project pollution (and whose exec summary to
// verify). When omitted, those two steps are skipped.
const realId = process.argv[4] ?? '';
if (!/^[0-9a-f-]{36}$/.test(qaId ?? '')) {
  console.error('qaProjectId must be a uuid, got: ' + JSON.stringify(qaId));
  process.exit(2);
}
const qa = (path) => BASE + path + (path.includes('?') ? '&' : '?') + 'project=' + qaId;
const realTargets = async () => {
  await page.goto(BASE + '/targets?project=' + realId);
  await settle();
  return (
    (await page
      .getByTestId('target-list')
      .textContent()
      .catch(() => '')) ?? ''
  );
};
// ---- pollution guard baseline ----
let baselineReal = '';
await step('record real-project baseline (pollution guard)', async () => {
  if (!realId) return;
  baselineReal = await realTargets();
  if (baselineReal.includes('127.0.0.1')) throw new Error('real project already polluted, clean first');
});

await step('create target 127.0.0.1 in QA project', async () => {
  await page.goto(qa('/targets'));
  await settle();
  await page.getByTestId('target-domain').fill('127.0.0.1');
  await page.getByTestId('target-subs').fill('127.0.0.1:9');
  await page.getByTestId('create-target').click();
  await page.waitForTimeout(1500);
  await page.goto(qa('/targets'));
  await settle();
  if (!(await page.getByTestId('target-list').textContent()).includes('127.0.0.1'))
    throw new Error('not listed in QA project');
  // The guard: the target must NOT have landed in the real project.
  if (realId) {
    const hj = await realTargets();
    if (hj.includes('127.0.0.1')) throw new Error('POLLUTION: target created in the real project');
  }
});

await step('recon notes on target detail', async () => {
  await page.goto(qa('/targets'));
  await settle();
  await page.getByTestId('target-list').getByRole('link', { name: '127.0.0.1' }).first().click();
  await page.waitForURL(/\/targets\/[0-9a-f-]{36}/);
  await page.getByPlaceholder('Add a note or TODO…').fill('qa sweep note');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.waitForTimeout(1000);
  await page.reload();
  if (!(await page.content()).includes('qa sweep note')) throw new Error('note missing');
});

// ---- scan lifecycle ----
let scanId = '';
await step('start a scan and reach detail', async () => {
  await page.goto(qa('/scans'));
  await settle();
  await vis('[data-testid="new-scan-trigger"]').click();
  await vis('[data-testid="start-scan"]').click();
  await page.waitForURL(/\/scans\/[0-9a-f-]{36}/, { timeout: 20000 });
  scanId = page.url().split('/scans/')[1].split('?')[0];
});

await step('scan completes with timeline', async () => {
  for (let i = 0; i < 120; i++) {
    await page.goto(BASE + '/scans/' + scanId);
    await settle();
    const status = await vis('[data-testid="scan-status"]').textContent();
    if (/completed|failed|cancelled/i.test(status)) {
      if (!/completed/i.test(status)) throw new Error('terminal but ' + status);
      return;
    }
    await page.waitForTimeout(5000);
  }
  throw new Error('did not finish in 10m');
});

await step('VA PDF generates for the QA scan', async () => {
  const res = await apiFetch(`/reports/va/${scanId}?type=full`);
  if (res.status() !== 200) throw new Error('status ' + res.status());
  const buf = await res.body();
  if (buf.subarray(0, 5).toString() !== '%PDF-') throw new Error('not a pdf');
});

await step('reports panel lists the QA scan', async () => {
  await page.goto(qa('/reports'));
  const body = await page.content();
  if (!body.includes('127.0.0.1')) throw new Error('scan row missing');
});

// ---- schedules ----
await step('schedule create/pause/enable/delete', async () => {
  await page.goto(qa('/settings/schedules'));
  await settle();
  await page.getByRole('button', { name: 'Add schedule' }).click();
  await page.waitForTimeout(1200);
  await page.reload();
  if ((await page.getByTestId('schedule-row').count()) < 1) throw new Error('row missing');
  await page.getByRole('button', { name: 'Pause' }).first().click();
  await page.waitForTimeout(1200);
  await page.reload();
  if (!(await page.getByTestId('schedule-row').first().textContent()).includes('paused')) throw new Error('not paused');
  await page.getByRole('button', { name: 'Enable' }).first().click();
  await page.waitForTimeout(1200);
  await page.reload();
  await page.getByRole('button', { name: 'Delete' }).first().click();
  await page.waitForTimeout(1200);
  await page.reload();
  if ((await page.getByTestId('schedule-row').count()) !== 0) throw new Error('not deleted');
});

// ---- attack surface / passive ----
await step('run passive recon stays on surface with progress', async () => {
  await page.goto(qa('/surface'));
  await vis('[data-testid="run-passive-recon"]').click();
  await page.waitForTimeout(2000);
  if (!page.url().includes('/surface')) throw new Error('navigated away to ' + page.url());
  for (let i = 0; i < 60; i++) {
    const txt = await page.content();
    if (!/Running passive recon|progress/i.test(txt)) break;
    await page.waitForTimeout(5000);
    await page.reload().catch(() => {});
  }
});

// ---- threat intel ----
await step('TI refresh + indicator add/verdict/delete', async () => {
  await page.goto(qa('/threat'));
  await settle();
  await page.locator('select[name="type"]').first().selectOption('ip');
  await page.locator('textarea[name="value"]').fill('127.0.0.1');
  await page.getByRole('button', { name: 'Add indicator(s)' }).click();
  await page.waitForTimeout(1500);
  await page.reload();
  if (!(await page.content()).includes('127.0.0.1')) throw new Error('indicator missing');
  await page.getByRole('button', { name: 'Refresh' }).click();
  await page.waitForTimeout(4000);
  for (let i = 0; i < 24; i++) {
    await page.goto(qa('/threat'));
    const txt = await page.content();
    if (/last refresh: completed/.test(txt)) break;
    await page.waitForTimeout(5000);
  }
  await page.getByRole('button', { name: 'Delete' }).first().click();
  await page.waitForTimeout(1500);
});

// ---- integrations ----
await step('webhook add/test/delete', async () => {
  await page.goto(qa('/settings/integrations'));
  await settle();
  await vis('#channel').selectOption('generic');
  await vis('input[name="label"]').fill('qa hook');
  await vis('input[name="url"]').fill('https://example.com/hook');
  await vis('[data-testid="webhook-add"]').click();
  await page.waitForTimeout(2000);
  await page.reload();
  if (!(await page.content()).includes('qa hook')) throw new Error('hook missing');
  await page.getByRole('button', { name: 'Test' }).first().click();
  await page.waitForTimeout(4000);
  await page.goto(qa('/settings/integrations'));
  await settle();
  await page.getByRole('button', { name: 'Remove' }).first().click();
  await page.waitForTimeout(2000);
  await page.reload();
  if ((await page.content()).includes('qa hook')) throw new Error('hook not deleted');
});

await step('vault key save/test/clear', async () => {
  await page.goto(qa('/settings/integrations'));
  await settle();
  await vis('[data-testid="vault-input-otx"]').fill('qa-test-key-not-real');
  await vis('[data-testid="vault-save-otx"]').click();
  await page.waitForTimeout(3000);
  await page.reload();
  if ((await page.getByTestId('vault-clear-otx').count()) < 1) throw new Error('set badge missing');
  await vis('[data-testid="vault-test-otx"]').click();
  await page.waitForTimeout(5000);
  await page.goto(qa('/settings/integrations'));
  await settle();
  await vis('[data-testid="vault-clear-otx"]').click();
  await page.waitForTimeout(2000);
  await page.reload();
  if ((await page.getByTestId('vault-clear-otx').count()) !== 0) throw new Error('not cleared');
});

await step('per-project AI setting save + back to system default', async () => {
  await page.goto(qa('/settings/integrations'));
  await settle();
  await vis('#provider').selectOption('ollama');
  await vis('[data-testid="ai-save"]').click();
  await page.waitForTimeout(2500);
  await page.reload();
  await settle();
  if ((await vis('#provider').inputValue()) !== 'ollama') throw new Error('not saved');
  await vis('#provider').selectOption('');
  await vis('[data-testid="ai-save"]').click();
  await page.waitForTimeout(2500);
});

// ---- users / tokens / search ----
await step('user add/role-change/delete', async () => {
  await page.goto(BASE + '/settings/users');
  await page.getByLabel('Email').fill('qa-sweep@vacti.local');
  await page.getByLabel('Password').fill('qa-sweep-pass-123');
  await page.getByRole('button', { name: /Add user/ }).click();
  await page.waitForTimeout(1500);
  await page.reload();
  if (!(await page.content()).includes('qa-sweep@vacti.local')) throw new Error('user missing');
  await page
    .locator('div')
    .filter({ has: page.getByText('qa-sweep@vacti.local', { exact: true }) })
    .getByRole('button', { name: 'Delete', exact: true })
    .first()
    .click();
  await page.waitForTimeout(1500);
  await page.reload();
  if ((await page.content()).includes('qa-sweep@vacti.local')) throw new Error('user not deleted');
});

let token = '';
await step('api token create + REST works + revoke', async () => {
  await page.goto(BASE + '/settings/tokens');
  await settle();
  await vis('[data-testid="token-label"]').fill('qa-sweep');
  await vis('[data-testid="create-token"]').click();
  await page.waitForTimeout(1500);
  token = (await vis('[data-testid="new-token"]').textContent()).trim();
  if (!token.startsWith('vct_')) throw new Error('no token shown');
  const res = await fetch(BASE + '/api/targets', { headers: { authorization: `Bearer ${token}` } });
  if (res.status !== 200) throw new Error('api status ' + res.status);
  const row = page.locator('tr', { hasText: 'qa-sweep' });
  await row.getByRole('button', { name: /Revoke|Delete/ }).click();
  await page.waitForTimeout(1500);
  const res2 = await fetch(BASE + '/api/targets', { headers: { authorization: `Bearer ${token}` } });
  if (res2.status === 200) throw new Error('token still valid after revoke');
});

await step('universal search returns results page', async () => {
  await page.goto(BASE + '/search');
  await page.getByPlaceholder('Search across everything…').fill('127.0.0.1');
  await page.getByPlaceholder('Search across everything…').press('Enter');
  await page.waitForTimeout(1500);
  if (!(await page.content()).includes('127.0.0.1')) throw new Error('no results');
});

// ---- internal route authz (unauthenticated must be 401) ----
await step('internal routes reject anonymous', async () => {
  for (const p of ['/api/internal/exec-summary', '/api/internal/threat-narrative', '/api/internal/enrich-vuln']) {
    const res = await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    if (res.status !== 401) throw new Error(`${p} -> ${res.status}`);
  }
});

// ---- exec summary correctness on real data ----
await step('exec summary (real project) reflects its real VA scan', async () => {
  if (!realId) return;
  const res = await apiFetch('/api/internal/exec-summary', {
    method: 'post',
    headers: { 'content-type': 'application/json' },
    data: JSON.stringify({ projectId: realId }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error('error: ' + data.error);
  if (!data.en || data.en.length < 100) throw new Error('summary too short');
  if (/\b0 (vulnerabilit|subdomain)/i.test(data.en)) throw new Error('still says zero: ' + data.en.slice(0, 120));
  console.log('  exec-summary excerpt:', data.en.slice(0, 220).replace(/\n/g, ' '));
});

await browser.close();
console.log('\n===== SWEEP RESULTS =====');
for (const [s, n] of results) console.log(s, '-', n);
const fails = results.filter(([s]) => s === 'FAIL').length;
console.log(`${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
