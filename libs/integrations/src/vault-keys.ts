import { and, eq } from 'drizzle-orm';
import { apiKeys, type Database } from '@vacti/db';
import { encryptSecret, decryptSecret } from '@vacti/auth';

/** Logical names for per-project secrets stored (encrypted) in the api_keys vault. */
export const SECRET_NAMES = ['otx', 'leakcheck', 'virustotal', 'urlscan', 'openai'] as const;
export type SecretName = (typeof SECRET_NAMES)[number];

/** Upsert an encrypted per-project secret. */
export async function setProjectSecret(
  db: Database,
  projectId: string,
  name: string,
  plaintext: string,
  encKey: string,
): Promise<void> {
  const ciphertext = encryptSecret(plaintext, encKey);
  const [existing] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.projectId, projectId), eq(apiKeys.name, name)));
  if (existing) {
    // The stored validity verdict is stale once the key value changes, so reset it on update.
    await db
      .update(apiKeys)
      .set({ ciphertext, lastCheckStatus: null, lastCheckedAt: null, updatedAt: new Date() })
      .where(eq(apiKeys.id, existing.id));
  } else {
    await db.insert(apiKeys).values({ projectId, name, ciphertext });
  }
}

export async function clearProjectSecret(db: Database, projectId: string, name: string): Promise<void> {
  await db.delete(apiKeys).where(and(eq(apiKeys.projectId, projectId), eq(apiKeys.name, name)));
}

/** Decrypt a per-project secret, or null if absent/undecryptable. */
export async function getProjectSecret(
  db: Database,
  projectId: string,
  name: string,
  encKey: string,
): Promise<string | null> {
  const [row] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.projectId, projectId), eq(apiKeys.name, name)));
  if (!row) return null;
  try {
    return decryptSecret(row.ciphertext, encKey);
  } catch {
    return null;
  }
}

/** Which secret names are set for a project (for masked status display). */
export async function listProjectSecretNames(db: Database, projectId: string): Promise<string[]> {
  const rows = await db.select().from(apiKeys).where(eq(apiKeys.projectId, projectId));
  return rows.map((r) => r.name);
}

export interface SecretCheck {
  name: string;
  status: string | null;
  checkedAt: Date | null;
}

/** Last persisted validity-check verdict per stored key, so the UI can show a sticky status badge. */
export async function listProjectSecretChecks(db: Database, projectId: string): Promise<SecretCheck[]> {
  const rows = await db.select().from(apiKeys).where(eq(apiKeys.projectId, projectId));
  return rows.map((r) => ({ name: r.name, status: r.lastCheckStatus, checkedAt: r.lastCheckedAt }));
}

/** Persist the verdict from a validity check so it survives reloads. */
export async function setProjectSecretCheck(
  db: Database,
  projectId: string,
  name: string,
  status: string,
): Promise<void> {
  await db
    .update(apiKeys)
    .set({ lastCheckStatus: status, lastCheckedAt: new Date() })
    .where(and(eq(apiKeys.projectId, projectId), eq(apiKeys.name, name)));
}
