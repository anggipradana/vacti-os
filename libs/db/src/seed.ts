import { eq } from 'drizzle-orm';
import { createDb } from './client';
import { runMigrations } from './migrate';
import { scanProfiles } from './recon-schema';

/**
 * Default "interesting endpoint" keywords seeded into each profile's config so the recon pipeline
 * flags sensitive paths. Inlined here (not imported from @vacti/recon) to keep the db lib leaf-level;
 * the pipeline falls back to its own built-in list when a profile leaves this unset.
 */
const INTERESTING_KEYWORDS = [
  'admin',
  'login',
  'ftp',
  'cpanel',
  'phpmyadmin',
  '.git',
  '.env',
  'backup',
  'swagger',
  'actuator',
  'jenkins',
  'gitlab',
  'wp-admin',
  'dashboard',
  'api',
  'graphql',
];

/** Default global scan profiles (projectId = null) - selectable presets in the UI/API. */
const DEFAULT_PROFILES = [
  {
    name: 'Quick',
    tools: { subfinder: true, httpx: true, naabu: false, nuclei: true, wordfence: false },
    ports: 'top-100',
    severities: ['critical', 'high'],
    timeoutSec: 300,
    config: { interestingKeywords: INTERESTING_KEYWORDS },
  },
  {
    name: 'Standard',
    tools: { subfinder: true, httpx: true, naabu: true, nuclei: true, wordfence: true },
    ports: 'top-100',
    // Include 'info' so a Standard scan matches a manual `nuclei -u` (all severities) instead of
    // silently dropping the info-level templates that make up most real findings.
    severities: ['critical', 'high', 'medium', 'low', 'info'],
    timeoutSec: 3600,
    config: { interestingKeywords: INTERESTING_KEYWORDS },
  },
  {
    name: 'Deep',
    tools: { subfinder: true, httpx: true, naabu: true, nuclei: true, wordfence: true },
    ports: 'top-1000',
    severities: ['critical', 'high', 'medium', 'low', 'info'],
    timeoutSec: 1800,
    config: { interestingKeywords: INTERESTING_KEYWORDS },
  },
];

/** Idempotent seed: inserts the default global profiles if not already present (by name). */
export async function seed(connectionString: string): Promise<void> {
  await runMigrations(connectionString);
  const { db, close } = createDb(connectionString);
  try {
    const existing = await db.select().from(scanProfiles);
    const globals = existing.filter((p) => p.projectId === null);
    const byName = new Map(globals.map((p) => [p.name, p]));
    const toInsert = DEFAULT_PROFILES.filter((p) => !byName.has(p.name)).map((p) => ({ ...p, projectId: null }));
    if (toInsert.length) {
      await db.insert(scanProfiles).values(toInsert);
      console.log(
        `[seed] inserted ${toInsert.length} default scan profile(s): ${toInsert.map((p) => p.name).join(', ')}`,
      );
    }
    // Backfill the interesting-keywords config onto presets that predate it - only when a preset
    // has no config yet, so an operator's customisations are never clobbered.
    let backfilled = 0;
    for (const def of DEFAULT_PROFILES) {
      const row = byName.get(def.name);
      if (row && (!row.config || Object.keys(row.config as object).length === 0)) {
        await db.update(scanProfiles).set({ config: def.config }).where(eq(scanProfiles.id, row.id));
        backfilled += 1;
      }
    }
    if (backfilled) console.log(`[seed] backfilled config on ${backfilled} existing preset(s)`);
    if (!toInsert.length && !backfilled) console.log('[seed] default scan profiles already present - nothing to do');
  } finally {
    await close();
  }
}

// Allow running directly: `DATABASE_URL=… tsx libs/db/src/seed.ts`.
if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[seed] DATABASE_URL is required');
    process.exit(1);
  }
  seed(url)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed] failed:', err);
      process.exit(1);
    });
}
