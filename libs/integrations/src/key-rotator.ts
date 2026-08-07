import { and, eq, or, like, asc, sql } from 'drizzle-orm';
import { apiKeys, type Database } from '@vacti/db';
import { decryptSecret } from '@vacti/auth';

/**
 * Postgres-backed API-key rotation/quota/backoff for rate-limited OSINT providers (e.g. VirusTotal).
 * Multiple keys per provider are stored under names `provider`, `provider-2`, `provider-3`, … The
 * rotator picks the least-recently-used eligible key (not in backoff, under the daily cap), bumps
 * its usage, and returns the decrypted secret. No Redis - all state lives on api_keys columns.
 */
export interface RotatingKey {
  id: string;
  secret: string;
}

const sameDay = (a: Date | null, b: Date): boolean =>
  !!a &&
  a.getUTCFullYear() === b.getUTCFullYear() &&
  a.getUTCMonth() === b.getUTCMonth() &&
  a.getUTCDate() === b.getUTCDate();

/** Acquire the next eligible key for a provider, or null if none is available. Bumps usage. */
export async function acquireRotatingKey(
  db: Database,
  projectId: string,
  provider: string,
  encKey: string,
  dailyCap = 480,
): Promise<RotatingKey | null> {
  const now = new Date();
  const rows = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.projectId, projectId), or(eq(apiKeys.name, provider), like(apiKeys.name, `${provider}-%`))))
    .orderBy(asc(sql`coalesce(${apiKeys.lastUsedAt}, '1970-01-01')`));

  for (const row of rows) {
    if (row.disabledUntil && row.disabledUntil > now) continue; // in backoff
    const usedToday = sameDay(row.usageDate, now) ? row.usageCount : 0;
    if (usedToday >= dailyCap) continue;
    let secret: string;
    try {
      secret = decryptSecret(row.ciphertext, encKey);
    } catch {
      continue;
    }
    // Atomic claim: increment in SQL, re-checking the cap in the WHERE so two concurrent acquirers
    // can neither lose an update nor push the same key past dailyCap. 0 rows = lost the race; try
    // the next key. The day-rollover resets usage_count to 1 when usage_date is a previous UTC day.
    const claimed = await db
      .update(apiKeys)
      .set({
        usageCount: sql`case when ${apiKeys.usageDate} >= date_trunc('day', now()) then ${apiKeys.usageCount} + 1 else 1 end`,
        usageDate: now,
        lastUsedAt: now,
      })
      .where(
        and(
          eq(apiKeys.id, row.id),
          sql`(${apiKeys.usageDate} is null or ${apiKeys.usageDate} < date_trunc('day', now()) or ${apiKeys.usageCount} < ${dailyCap})`,
        ),
      )
      .returning({ id: apiKeys.id });
    if (claimed.length) return { id: row.id, secret };
  }
  return null;
}

/** Put a key into backoff for `seconds` (e.g. after a 429/403). */
export async function backoffKey(db: Database, id: string, seconds: number): Promise<void> {
  await db
    .update(apiKeys)
    .set({ disabledUntil: new Date(Date.now() + seconds * 1000) })
    .where(eq(apiKeys.id, id));
}

/** How many keys exist for a provider (for status display). */
export async function countProviderKeys(db: Database, projectId: string, provider: string): Promise<number> {
  const rows = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.projectId, projectId), or(eq(apiKeys.name, provider), like(apiKeys.name, `${provider}-%`))));
  return rows.length;
}
