'use server';

import { execFile, spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { Permission } from '@vacti/core';
import { backupSettings } from '@vacti/db';
import { getDb } from './db';
import { requirePermission } from './authz';
import { recordAudit } from './audit';

/**
 * Server actions + status reads for Settings > Backup (SysAdmin, ModifySystemConfig).
 *
 * The backup system itself is host-side (restic + systemd + `/etc/vacti/backup.env`, all root-owned) and
 * lives in `ops/backup/`. The control-plane app normally runs in a Docker container that cannot reach the
 * host restic/systemd/root filesystem, so every host operation here is attempted for real and, when the
 * host bridge is not reachable, returns a structured `unavailable` result. The UI then surfaces the exact
 * command to run on the host instead of pretending the action succeeded. When the app IS given host access
 * (running on the host, or the scripts + a passwordless-sudo bridge are mounted in), the same buttons run
 * for real.
 *
 * SECRETS: the restic password and the B2/S3 keys are only ever written to `/etc/vacti/backup.env`
 * (mode 600) on the host by saveBackupConfigAction. They are NEVER stored in the DB, NEVER logged, and
 * NEVER returned to the client. Only booleans + the (non-secret) repository locator are persisted/returned.
 */

// --- host paths (overridable for a host-capable deployment) ------------------
const SCRIPT_DIR = process.env.VACTI_BACKUP_DIR || '/opt/vacti-backup';
const ENV_PATH = process.env.VACTI_BACKUP_ENV || '/etc/vacti/backup.env';
const LOG_PATH = process.env.VACTI_BACKUP_LOG || '/var/log/vacti-backup.log';
const FAIL_PATH = process.env.VACTI_BACKUP_FAIL || '/var/lib/vacti/backup-last-failure';
const OUTPUT_CAP = 20000; // keep captured script output bounded before it hits the DB / UI

type ExecResult = {
  ok: boolean;
  unavailable: boolean; // the host bridge (script / restic binary) is not reachable from here
  code: number | null;
  stdout: string;
  stderr: string;
};

function cap(s: string): string {
  return s.length > OUTPUT_CAP ? `${s.slice(0, OUTPUT_CAP)}\n... [truncated]` : s;
}

/** Run a host executable, capturing output. ENOENT => host bridge absent (unavailable), never a fake success. */
function run(file: string, args: string[], timeoutMs = 120_000): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      const out = cap(String(stdout ?? ''));
      const errOut = cap(String(stderr ?? ''));
      if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        resolve({ ok: false, unavailable: true, code: null, stdout: out, stderr: errOut });
        return;
      }
      const code = err ? ((err as { code?: number }).code ?? 1) : 0;
      resolve({ ok: !err, unavailable: false, code: typeof code === 'number' ? code : 1, stdout: out, stderr: errOut });
    });
  });
}

/** Is the host backup toolchain reachable from this process? (script laid down + restic on PATH). */
async function hostBridgeAvailable(): Promise<boolean> {
  try {
    await fs.access(`${SCRIPT_DIR}/backup.sh`);
  } catch {
    return false;
  }
  const r = await run('restic', ['version'], 10_000);
  return !r.unavailable;
}

/** Read a small host file if readable, else null (host-side files are root-owned; container can't read them). */
async function readMaybe(path: string, tailBytes?: number): Promise<string | null> {
  try {
    const buf = await fs.readFile(path, 'utf8');
    if (tailBytes && buf.length > tailBytes) return buf.slice(buf.length - tailBytes);
    return buf;
  } catch {
    return null;
  }
}

// --- shell-safe single-quote wrap (values may contain spaces / metacharacters) ---
function sq(v: string): string {
  return `'${v.replace(/'/g, `'\\''`)}'`;
}

export type Snapshot = { id: string; time: string; hostname?: string; tags?: string[]; paths?: string[] };

export type BackupStatus = {
  hostBridge: boolean; // scripts + restic reachable from the app process
  envPresent: boolean; // /etc/vacti/backup.env exists AND is filled (readable host-side only)
  configuredInApp: boolean; // operator has saved config metadata in the app
  scriptDir: string;
  envPath: string;
  logPath: string;
  snapshots: Snapshot[] | null;
  snapshotsError: string | null;
  logTail: string | null;
  lastFailure: string | null;
  meta: {
    repoType: string;
    repoRedacted: string | null;
    keepDaily: number;
    keepWeekly: number;
    keepMonthly: number;
    scheduleEnabled: boolean;
    lastRunAt: string | null;
    lastRunStatus: string | null;
    lastOpKind: string | null;
    lastOpAt: string | null;
    lastOpOk: boolean | null;
    lastOpOutput: string | null;
    updatedAt: string | null;
  };
};

async function loadMeta() {
  const [row] = await getDb().select().from(backupSettings).where(eq(backupSettings.id, 'default'));
  return row;
}

/** Whether /etc/vacti/backup.env exists and is filled (no placeholders). Host-readable only. */
async function envFilePresent(): Promise<boolean> {
  const body = await readMaybe(ENV_PATH);
  if (body == null) return false;
  const hasRepo = /RESTIC_REPOSITORY\s*=\s*\S/.test(body);
  const hasPass = /RESTIC_PASSWORD(_FILE)?\s*=\s*\S/.test(body);
  const placeholder = /CHANGEME|REPLACE_ME|<[a-z]/i.test(body);
  return hasRepo && hasPass && !placeholder;
}

/** Read backup status for the page. SysAdmin-gated. Never returns any secret value. */
export async function readBackupStatus(): Promise<BackupStatus> {
  await requirePermission(Permission.ModifySystemConfig);
  const [bridge, envPresent, row, logTail, lastFailure] = await Promise.all([
    hostBridgeAvailable(),
    envFilePresent(),
    loadMeta(),
    readMaybe(LOG_PATH, 8000),
    readMaybe(FAIL_PATH),
  ]);

  // Snapshots require sourcing the (root-only) env then calling restic; only works host-side with access.
  let snapshots: Snapshot[] | null = null;
  let snapshotsError: string | null = null;
  if (bridge && envPresent) {
    const r = await run(
      'bash',
      ['-c', `set -a; . ${sq(ENV_PATH)}; set +a; restic snapshots --tag nightly --json`],
      60_000,
    );
    if (r.ok) {
      try {
        const parsed = JSON.parse(r.stdout || '[]');
        snapshots = Array.isArray(parsed)
          ? parsed.map((s: Record<string, unknown>) => ({
              id: String(s.short_id ?? s.id ?? ''),
              time: String(s.time ?? ''),
              hostname: s.hostname ? String(s.hostname) : undefined,
              tags: Array.isArray(s.tags) ? (s.tags as string[]) : undefined,
              paths: Array.isArray(s.paths) ? (s.paths as string[]) : undefined,
            }))
          : [];
      } catch {
        snapshotsError = 'Could not parse restic snapshot output.';
      }
    } else {
      snapshotsError = r.unavailable ? 'restic not reachable from the app.' : r.stderr || 'restic snapshots failed.';
    }
  }

  return {
    hostBridge: bridge,
    envPresent,
    configuredInApp: Boolean(row?.repoRedacted),
    scriptDir: SCRIPT_DIR,
    envPath: ENV_PATH,
    logPath: LOG_PATH,
    snapshots,
    snapshotsError,
    logTail,
    lastFailure,
    meta: {
      repoType: row?.repoType ?? 'b2',
      repoRedacted: row?.repoRedacted ?? null,
      keepDaily: row?.keepDaily ?? 7,
      keepWeekly: row?.keepWeekly ?? 4,
      keepMonthly: row?.keepMonthly ?? 6,
      scheduleEnabled: row?.scheduleEnabled ?? false,
      lastRunAt: row?.lastRunAt ? new Date(row.lastRunAt).toISOString() : null,
      lastRunStatus: row?.lastRunStatus ?? null,
      lastOpKind: row?.lastOpKind ?? null,
      lastOpAt: row?.lastOpAt ? new Date(row.lastOpAt).toISOString() : null,
      lastOpOk: row?.lastOpOk ?? null,
      lastOpOutput: row?.lastOpOutput ?? null,
      updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    },
  };
}

async function upsertMeta(patch: Record<string, unknown>, actorId: string) {
  const now = new Date();
  await getDb()
    .insert(backupSettings)
    .values({ id: 'default', ...patch, updatedAt: now, updatedBy: actorId })
    .onConflictDoUpdate({ target: backupSettings.id, set: { ...patch, updatedAt: now, updatedBy: actorId } });
}

// -----------------------------------------------------------------------------
// Config (create / update): write the host env file + persist non-secret metadata
// -----------------------------------------------------------------------------

/**
 * Build the /etc/vacti/backup.env body from operator input. Values are single-quote wrapped so keys with
 * special characters survive. This string contains secrets and MUST NOT be logged or returned to a client.
 */
function buildEnvBody(input: {
  repoType: string;
  repository: string;
  password: string;
  b2KeyId: string;
  b2Key: string;
  awsKeyId: string;
  awsSecret: string;
  awsRegion: string;
  keepDaily: number;
  keepWeekly: number;
  keepMonthly: number;
  alertWebhook: string;
}): string {
  const lines = [
    '# vacti backup credentials + knobs. Managed by Settings > Backup. Mode 600. NEVER commit.',
    '# Losing RESTIC_PASSWORD makes the backup unrecoverable by design - keep a copy in the password manager.',
    `export RESTIC_REPOSITORY=${sq(input.repository)}`,
    `export RESTIC_PASSWORD=${sq(input.password)}`,
  ];
  if (input.repoType === 's3') {
    lines.push(
      `export AWS_ACCESS_KEY_ID=${sq(input.awsKeyId)}`,
      `export AWS_SECRET_ACCESS_KEY=${sq(input.awsSecret)}`,
      `export AWS_DEFAULT_REGION=${sq(input.awsRegion || 'auto')}`,
    );
  } else {
    lines.push(`export B2_ACCOUNT_ID=${sq(input.b2KeyId)}`, `export B2_ACCOUNT_KEY=${sq(input.b2Key)}`);
  }
  lines.push(
    `export KEEP_DAILY=${sq(String(input.keepDaily))}`,
    `export KEEP_WEEKLY=${sq(String(input.keepWeekly))}`,
    `export KEEP_MONTHLY=${sq(String(input.keepMonthly))}`,
    `export ALERT_WEBHOOK=${sq(input.alertWebhook)}`,
    '',
  );
  return lines.join('\n');
}

function clampInt(v: FormDataEntryValue | null, def: number, min: number, max: number): number {
  const n = Number.parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

/**
 * Save the backup destination + credentials + retention. Writes /etc/vacti/backup.env (mode 600) on the
 * host when reachable; always persists NON-SECRET metadata to the DB. Secrets are never stored in the DB,
 * never logged, never returned to the client. RBAC (ModifySystemConfig) + audited (redacted metadata only).
 */
export async function saveBackupConfigAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(Permission.ModifySystemConfig);

  const repoType = String(formData.get('repoType') ?? 'b2') === 's3' ? 's3' : 'b2';
  const repository = String(formData.get('repository') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const b2KeyId = String(formData.get('b2KeyId') ?? '').trim();
  const b2Key = String(formData.get('b2Key') ?? '').trim();
  const awsKeyId = String(formData.get('awsKeyId') ?? '').trim();
  const awsSecret = String(formData.get('awsSecret') ?? '').trim();
  const awsRegion = String(formData.get('awsRegion') ?? 'auto').trim();
  const alertWebhook = String(formData.get('alertWebhook') ?? '').trim();
  const keepDaily = clampInt(formData.get('keepDaily'), 7, 0, 3650);
  const keepWeekly = clampInt(formData.get('keepWeekly'), 4, 0, 520);
  const keepMonthly = clampInt(formData.get('keepMonthly'), 6, 0, 240);

  // Validate: repository + password required; backend keys required for the chosen backend.
  if (!repository || !password) redirect('/settings/backup?error=missing');
  if (repoType === 'b2' && (!b2KeyId || !b2Key)) redirect('/settings/backup?error=missing');
  if (repoType === 's3' && (!awsKeyId || !awsSecret)) redirect('/settings/backup?error=missing');

  // Persist non-secret metadata regardless of whether we can reach the host (records operator intent).
  await upsertMeta({ repoType, repoRedacted: repository, keepDaily, keepWeekly, keepMonthly }, actor.id);

  // Try to write the host env file. Only when the host bridge is present, so we never write a misleading
  // container-local copy that the host scripts would not read.
  let wrote = false;
  if (await hostBridgeAvailable()) {
    const body = buildEnvBody({
      repoType,
      repository,
      password,
      b2KeyId,
      b2Key,
      awsKeyId,
      awsSecret,
      awsRegion,
      keepDaily,
      keepWeekly,
      keepMonthly,
      alertWebhook,
    });
    try {
      await fs.mkdir(ENV_PATH.replace(/\/[^/]+$/, ''), { recursive: true });
      await fs.writeFile(ENV_PATH, body, { mode: 0o600 });
      await fs.chmod(ENV_PATH, 0o600);
      wrote = true;
    } catch {
      wrote = false; // fall through to the runbook path; never fake success
    }
  }

  await recordAudit({
    actorId: actor.id,
    action: wrote ? 'backup.config_write' : 'backup.config_saved_metadata',
    resource: 'backup:config',
    // Redacted: repository locator + backend + retention only. NEVER the password or access keys.
    metadata: { repoType, repository, keepDaily, keepWeekly, keepMonthly, hostWrite: wrote },
  });

  revalidatePath('/settings/backup');
  redirect(`/settings/backup?ok=${wrote ? 'config_written' : 'config_saved_no_host'}`);
}

// -----------------------------------------------------------------------------
// Repo init / run / schedule
// -----------------------------------------------------------------------------

/** Initialise the restic repository once (`restic init`). Host-side; unavailable => runbook shown in UI. */
export async function initRepoAction(): Promise<void> {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const r = await run('bash', ['-c', `set -a; . ${sq(ENV_PATH)}; set +a; restic init`], 60_000);
  await upsertMeta(
    { lastOpKind: 'init', lastOpAt: new Date(), lastOpOk: r.ok, lastOpOutput: r.stdout || r.stderr || null },
    actor.id,
  );
  await recordAudit({ actorId: actor.id, action: 'backup.init', resource: 'backup:repo', metadata: { ok: r.ok } });
  revalidatePath('/settings/backup');
  redirect(`/settings/backup?ok=${r.unavailable ? 'unavailable' : r.ok ? 'inited' : 'op_failed'}`);
}

/**
 * Run a backup now. backup.sh is long-running, so it is spawned detached (fire-and-forget) and the run is
 * marked 'running'; the operator refreshes to see the log tail + new snapshot. Unavailable => runbook.
 */
export async function runBackupNowAction(): Promise<void> {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const bridge = await hostBridgeAvailable();
  if (!bridge) {
    await upsertMeta({ lastRunStatus: 'unavailable' }, actor.id);
    await recordAudit({ actorId: actor.id, action: 'backup.run', resource: 'backup:run', metadata: { started: false } });
    redirect('/settings/backup?ok=unavailable');
  }
  try {
    const child = spawn(`${SCRIPT_DIR}/backup.sh`, [], { detached: true, stdio: 'ignore' });
    child.unref();
    await upsertMeta({ lastRunAt: new Date(), lastRunStatus: 'running' }, actor.id);
    await recordAudit({ actorId: actor.id, action: 'backup.run', resource: 'backup:run', metadata: { started: true } });
    revalidatePath('/settings/backup');
    redirect('/settings/backup?ok=run_started');
  } catch {
    await upsertMeta({ lastRunStatus: 'unavailable' }, actor.id);
    redirect('/settings/backup?ok=unavailable');
  }
}

/** Enable or disable the nightly systemd timers via the installer. Host + root; unavailable => runbook. */
export async function setScheduleAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const enable = String(formData.get('enable') ?? '') === '1';
  const timers = ['vacti-backup.timer', 'vacti-backup-verify.timer', 'vacti-backup-deadman.timer'];
  const r = enable
    ? await run('systemctl', ['enable', '--now', ...timers], 30_000)
    : await run('systemctl', ['disable', '--now', ...timers], 30_000);
  // Reflect intent in metadata even when the host call is unavailable, so the UI shows what was requested.
  await upsertMeta(
    {
      scheduleEnabled: enable,
      lastOpKind: 'schedule',
      lastOpAt: new Date(),
      lastOpOk: r.unavailable ? null : r.ok,
      lastOpOutput: r.unavailable ? null : r.stdout || r.stderr || null,
    },
    actor.id,
  );
  await recordAudit({
    actorId: actor.id,
    action: enable ? 'backup.schedule_enable' : 'backup.schedule_disable',
    resource: 'backup:schedule',
    metadata: { ok: r.unavailable ? false : r.ok },
  });
  revalidatePath('/settings/backup');
  redirect(`/settings/backup?ok=${r.unavailable ? 'unavailable' : r.ok ? 'schedule_set' : 'op_failed'}`);
}

// -----------------------------------------------------------------------------
// Restore (read-only / non-destructive: verify + dry-run). Full apply is a runbook, never a button.
// -----------------------------------------------------------------------------

/** `restic check --read-data` via restore.sh --verify. Non-destructive. Output captured to the UI. */
export async function verifyRepoAction(): Promise<void> {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const r = await run(`${SCRIPT_DIR}/restore.sh`, ['--verify'], 300_000);
  await upsertMeta(
    {
      lastOpKind: 'verify',
      lastOpAt: new Date(),
      lastOpOk: r.unavailable ? null : r.ok,
      lastOpOutput: r.unavailable ? null : `${r.stdout}\n${r.stderr}`.trim() || null,
    },
    actor.id,
  );
  await recordAudit({ actorId: actor.id, action: 'backup.verify', resource: 'backup:repo', metadata: { ok: r.ok } });
  revalidatePath('/settings/backup');
  redirect(`/settings/backup?ok=${r.unavailable ? 'unavailable' : r.ok ? 'verified' : 'op_failed'}`);
}

/** `restore.sh SNAPSHOT --dry-run`: show the restore plan, change nothing. Output captured to the UI. */
export async function dryRunRestoreAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const snapshot = String(formData.get('snapshot') ?? 'latest').trim() || 'latest';
  // Guard the snapshot token: restic ids are hex, plus the alias "latest".
  const safe = snapshot === 'latest' || /^[a-f0-9]{6,64}$/i.test(snapshot) ? snapshot : 'latest';
  const r = await run(`${SCRIPT_DIR}/restore.sh`, [safe, '--dry-run'], 120_000);
  await upsertMeta(
    {
      lastOpKind: 'dry_run',
      lastOpAt: new Date(),
      lastOpOk: r.unavailable ? null : r.ok,
      lastOpOutput: r.unavailable ? null : `${r.stdout}\n${r.stderr}`.trim() || null,
    },
    actor.id,
  );
  await recordAudit({
    actorId: actor.id,
    action: 'backup.dry_run',
    resource: 'backup:restore',
    metadata: { snapshot: safe, ok: r.ok },
  });
  revalidatePath('/settings/backup');
  redirect(`/settings/backup?ok=${r.unavailable ? 'unavailable' : r.ok ? 'dry_run_done' : 'op_failed'}`);
}

/**
 * Clear the stored config metadata (delete side of CRUD). Does NOT touch the host env file (that is a
 * root-owned host secret; the UI shows the exact command to remove it). Marks the schedule intent off.
 */
export async function clearBackupConfigAction(): Promise<void> {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  await upsertMeta(
    { repoRedacted: null, scheduleEnabled: false, lastOpKind: null, lastOpAt: null, lastOpOk: null, lastOpOutput: null },
    actor.id,
  );
  await recordAudit({ actorId: actor.id, action: 'backup.config_clear', resource: 'backup:config', metadata: {} });
  revalidatePath('/settings/backup');
  redirect('/settings/backup?ok=config_cleared');
}
