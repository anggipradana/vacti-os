import { execSync } from 'node:child_process';
import { Pool } from 'pg';

/** Apply migrations, reset the e2e database, and seed default scan profiles for a deterministic run. */
export default async function globalSetup(): Promise<void> {
  const url =
    process.env.DATABASE_URL ?? `postgres://vacti:${process.env.POSTGRES_PASSWORD ?? 'vacti'}@localhost:5432/vacti_e2e`;
  // Hard guard: this function TRUNCATES the database it points at. Refuse anything that is not the
  // dedicated e2e database (e.g. a stray DATABASE_URL from a sourced .env pointing at prod).
  if (!new URL(url).pathname.endsWith('/vacti_e2e')) {
    throw new Error(`e2e global-setup refuses to run against non-e2e database: ${new URL(url).pathname}`);
  }
  const env = { ...process.env, DATABASE_URL: url };
  execSync('npx drizzle-kit migrate', { stdio: 'inherit', env });
  const pool = new Pool({ connectionString: url });
  // Truncating users + projects CASCADE clears all user- and project-scoped data (sessions, tokens,
  // members, audit, targets, scans, activity, results, schedules, notes, webhooks, ai/report settings,
  // TI data, vault keys). Global scan_profiles (projectId null) are reset separately, then re-seeded.
  await pool.query('TRUNCATE users, projects RESTART IDENTITY CASCADE');
  await pool.query('TRUNCATE scan_profiles RESTART IDENTITY CASCADE');
  await pool.end();
  execSync('tsx libs/db/src/seed.ts', { stdio: 'inherit', env });
}
