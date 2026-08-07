import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Non-secret backup config metadata (singleton row id='default'), for Settings > Backup (SysAdmin).
 *
 * SECRETS NEVER LIVE HERE. The restic repository password and the B2/S3/R2 access keys live ONLY in
 * `/etc/vacti/backup.env` (mode 600) on the host, written by the ops scripts. This table records the
 * operator's intent + last-known status so the UI has state to render even when the containerized
 * control-plane app cannot reach the host restic/systemd directly. `repo_redacted` holds only the
 * repository locator (bucket + path), which is not a credential; the password and keys are never stored.
 */
export const backupSettings = pgTable('backup_settings', {
  id: text('id').primaryKey().default('default'),
  // 'b2' | 's3' - which restic backend the repo uses (drives which key fields the form shows). No secret.
  repoType: text('repo_type').notNull().default('b2'),
  // Repository locator for display only, e.g. b2:vacti-backup-xxxx:vacti. Never a password or key.
  repoRedacted: text('repo_redacted'),
  keepDaily: integer('keep_daily').notNull().default(7),
  keepWeekly: integer('keep_weekly').notNull().default(4),
  keepMonthly: integer('keep_monthly').notNull().default(6),
  // Operator's intent that the nightly timer be armed. Reflects intent, not the live host timer state.
  scheduleEnabled: boolean('schedule_enabled').notNull().default(false),
  // Last UI-triggered backup run bookkeeping (host-side systemd runs are not recorded here).
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  lastRunStatus: text('last_run_status'), // ok | failed | running | unavailable
  // Last verify / dry-run output captured from the host scripts, shown back in the UI (truncated). Not a secret.
  lastOpKind: text('last_op_kind'), // verify | dry_run | init | run | schedule
  lastOpAt: timestamp('last_op_at', { withTimezone: true }),
  lastOpOk: boolean('last_op_ok'),
  lastOpOutput: text('last_op_output'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by'),
});

export const backupSchema = { backupSettings };
