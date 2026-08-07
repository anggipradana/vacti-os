'use server';

import { desc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { encryptSecret, decryptSecret } from '@vacti/auth';
import { Permission, roleFromUser } from '@vacti/core';
import { searchUnifiedLeaks, isPasswordField, type UnifiedLeakRecord, type LeakSearchType } from '@vacti/threat-intel';
import { leakSearches, leakSearchResults } from '@vacti/db';
import { getDb } from './db';
import { requirePermission } from './authz';
import { recordAudit } from './audit';
import { resolveLeakProviders, consumeQuota, getQuotaState, type QuotaState } from './leaks-service';
import type { PublicLeakRecord } from './leak-types';

/**
 * Client-facing search state. `records` are PublicLeakRecord (the internal `provider` field is STRIPPED) so
 * the upstream source never reaches the browser - not rendered, and not in the network JSON. Passwords are
 * sent to the operator's own session (masked in the UI, reveal audited).
 */
export interface LeakSearchState {
  ok: boolean;
  error?: string;
  query?: string;
  records?: PublicLeakRecord[];
  sources?: number;
  quota?: QuotaState;
}

/** Strip internal-only fields (provider, raw extra) so the client payload is fully white-labeled. */
function toPublic(records: UnifiedLeakRecord[]): PublicLeakRecord[] {
  return records.map(({ source, infoLeak, identifier, password, origin, fields }) => ({
    source,
    infoLeak,
    identifier,
    password,
    origin,
    fields,
  }));
}

const LIMITS: Record<string, number> = { '100': 100, '300': 300, '500': 500, '1000': 1000 };

/**
 * Run a leak search (RBAC InitiateScans = Penetration Tester/SysAdmin; Auditor cannot). Consumes ONE quota unit, then
 * fans out to the enabled providers. Results are EPHEMERAL - returned to the client for display, never stored
 * unless the user saves a Case. White-labeled: the client never sees which provider a row came from.
 */
export async function runLeakSearchAction(_prev: LeakSearchState, formData: FormData): Promise<LeakSearchState> {
  const user = await requirePermission(Permission.InitiateScans);
  const query = String(formData.get('query') ?? '').trim();
  const type = (String(formData.get('type') ?? 'auto') || 'auto') as LeakSearchType;
  const limit = LIMITS[String(formData.get('limit') ?? '100')] ?? 100;
  if (!query) return { ok: false, error: 'Enter a search term.' };

  const role = roleFromUser(user);
  const gate = await consumeQuota(user.id, role);
  if (!gate.allowed) return { ok: false, error: gate.reason, quota: await getQuotaState(user.id, role) };

  const providers = await resolveLeakProviders();
  if (!providers.leakcheck.key)
    return { ok: false, error: 'No leak source is configured. Ask an admin.', quota: gate.state };

  const result = await searchUnifiedLeaks(query, {
    type,
    limit,
    leakcheckKey: providers.leakcheck.key,
  });
  await recordAudit({ actorId: user.id, action: 'leak.search', resource: `query:${query}` });
  // Fold provider errors into a soft note but still return whatever was found.
  const error = result.records.length === 0 && result.errors.length ? result.errors.join('; ') : undefined;
  // toPublic() strips `provider`/`extra` so the source is never exposed in the client JSON (white-label).
  return { ok: true, query, records: toPublic(result.records), sources: result.sources, quota: gate.state, error };
}

/**
 * Prepare a record for at-rest storage: the password goes to passwordCiphertext (encrypted); the FULL set of
 * remaining columns is kept in `extra` (so the provider's rich per-database fields are preserved) with any
 * password-like column stripped out, so no plaintext password ever lands in the jsonb.
 */
function encryptRecords(records: Array<PublicLeakRecord & { provider?: string }>) {
  const key = process.env.ENCRYPTION_KEY;
  return records.map((r) => {
    const redacted: Record<string, string> = {};
    for (const [k, v] of Object.entries(r.fields ?? {})) if (!isPasswordField(k)) redacted[k] = v;
    return {
      source: r.source,
      // Internal-only tag; when a client-saved record omits it (white-label strip), store a neutral marker.
      provider: r.provider ?? 'saved',
      identifier: r.identifier ?? null,
      passwordCiphertext: r.password && key ? encryptSecret(r.password, key) : null,
      origin: r.origin ?? null,
      extra: redacted,
    };
  });
}

/** OPT-IN save: persist a search + its result snapshot as a named Case owned by the user. */
export async function saveCaseAction(input: {
  name: string;
  query: string;
  searchType?: string | null;
  projectId?: string | null;
  records: PublicLeakRecord[];
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const user = await requirePermission(Permission.InitiateScans);
  const name = input.name.trim() || input.query.trim() || 'Untitled case';
  const db = getDb();
  const sources = new Set(input.records.map((r) => r.source.toLowerCase())).size;
  const [row] = await db
    .insert(leakSearches)
    .values({
      userId: user.id,
      name,
      query: input.query,
      searchType: input.searchType ?? null,
      projectId: input.projectId ?? null,
      resultCount: input.records.length,
      sourceCount: sources,
    })
    .returning({ id: leakSearches.id });
  if (input.records.length && row) {
    await db.insert(leakSearchResults).values(encryptRecords(input.records).map((r) => ({ ...r, searchId: row.id })));
  }
  await recordAudit({ actorId: user.id, action: 'leak.case.saved', resource: `case:${row?.id}` });
  revalidatePath('/leaks');
  return { ok: true, id: row?.id };
}

/** Owner-guard helper: the acting user must own the case (SysAdmin may also manage any). */
async function ownCase(caseId: string, userId: string, role: string) {
  const db = getDb();
  const [row] = await db.select().from(leakSearches).where(eq(leakSearches.id, caseId));
  if (!row) return null;
  if (row.userId !== userId && role !== 'SysAdmin') return null;
  return row;
}

/** Re-run a saved Case's query and OVERWRITE its snapshot (consumes one quota unit). */
export async function rerunCaseAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await requirePermission(Permission.InitiateScans);
  const id = String(formData.get('id') ?? '');
  const c = await ownCase(id, user.id, roleFromUser(user));
  if (!c) return { ok: false, error: 'Not found' };
  const role = roleFromUser(user);
  const gate = await consumeQuota(user.id, role);
  if (!gate.allowed) return { ok: false, error: gate.reason };
  const providers = await resolveLeakProviders();
  const result = await searchUnifiedLeaks(c.query, {
    type: (c.searchType as LeakSearchType) ?? 'auto',
    leakcheckKey: providers.leakcheck.key,
  });
  const db = getDb();
  await db.delete(leakSearchResults).where(eq(leakSearchResults.searchId, id));
  if (result.records.length)
    await db.insert(leakSearchResults).values(encryptRecords(result.records).map((r) => ({ ...r, searchId: id })));
  await db
    .update(leakSearches)
    .set({ resultCount: result.records.length, sourceCount: result.sources, updatedAt: new Date() })
    .where(eq(leakSearches.id, id));
  await recordAudit({ actorId: user.id, action: 'leak.case.rerun', resource: `case:${id}` });
  revalidatePath(`/leaks/${id}`);
  revalidatePath('/leaks');
  return { ok: true };
}

/** Rename / note / tags / attach-to-project on a Case. */
export async function updateCaseAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await requirePermission(Permission.InitiateScans);
  const id = String(formData.get('id') ?? '');
  const c = await ownCase(id, user.id, roleFromUser(user));
  if (!c) return { ok: false, error: 'Not found' };
  const name = String(formData.get('name') ?? c.name).trim() || c.name;
  const note = formData.has('note') ? String(formData.get('note') ?? '') : c.note;
  const projectId = formData.has('projectId') ? String(formData.get('projectId') ?? '') || null : c.projectId;
  const tags = formData.has('tags')
    ? String(formData.get('tags') ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : c.tags;
  await getDb()
    .update(leakSearches)
    .set({ name, note, projectId, tags, updatedAt: new Date() })
    .where(eq(leakSearches.id, id));
  revalidatePath(`/leaks/${id}`);
  revalidatePath('/leaks');
  return { ok: true };
}

/** Delete a Case (cascades its result rows). */
export async function deleteCaseAction(formData: FormData): Promise<void> {
  const user = await requirePermission(Permission.InitiateScans);
  const id = String(formData.get('id') ?? '');
  const c = await ownCase(id, user.id, roleFromUser(user));
  if (!c) return;
  await getDb().delete(leakSearches).where(eq(leakSearches.id, id));
  await recordAudit({ actorId: user.id, action: 'leak.case.deleted', resource: `case:${id}` });
  revalidatePath('/leaks');
}

/** Triage one result row inside a Case (new/reviewed/confirmed/false_positive). */
export async function setLeakResultStatusAction(formData: FormData): Promise<{ ok: boolean }> {
  const user = await requirePermission(Permission.InitiateScans);
  const resultId = String(formData.get('resultId') ?? '');
  const status = String(formData.get('status') ?? 'new');
  if (!['new', 'reviewed', 'confirmed', 'false_positive'].includes(status)) return { ok: false };
  const db = getDb();
  const [res] = await db.select().from(leakSearchResults).where(eq(leakSearchResults.id, resultId));
  if (!res) return { ok: false };
  const c = await ownCase(res.searchId, user.id, roleFromUser(user));
  if (!c) return { ok: false };
  await db.update(leakSearchResults).set({ status }).where(eq(leakSearchResults.id, resultId));
  revalidatePath(`/leaks/${res.searchId}`);
  return { ok: true };
}

/** List the caller's saved Cases (own; SysAdmin sees all), newest first. Read helper for the Cases tab. */
export async function listCasesForUser(userId: string, role: string) {
  const db = getDb();
  const where = role === 'SysAdmin' ? undefined : eq(leakSearches.userId, userId);
  return db.select().from(leakSearches).where(where).orderBy(desc(leakSearches.updatedAt));
}

/**
 * Reveal (decrypt) ONE saved-Case result's password for the owner, and AUDIT the reveal. Saved snapshots keep
 * passwords encrypted at rest; the UI shows them masked and calls this only on an explicit click. Returns the
 * plaintext, or null if absent/undecryptable/not-owned.
 */
export async function revealCasePasswordAction(resultId: string): Promise<{ password: string | null }> {
  const user = await requirePermission(Permission.InitiateScans);
  const db = getDb();
  const [res] = await db.select().from(leakSearchResults).where(eq(leakSearchResults.id, resultId));
  if (!res) return { password: null };
  const c = await ownCase(res.searchId, user.id, roleFromUser(user));
  if (!c) return { password: null };
  const key = process.env.ENCRYPTION_KEY;
  if (!res.passwordCiphertext || !key) return { password: null };
  await recordAudit({ actorId: user.id, action: 'leak.password.reveal', resource: `result:${resultId}` });
  try {
    return { password: decryptSecret(res.passwordCiphertext, key) };
  } catch {
    return { password: null };
  }
}

/**
 * One-click "reveal all": decrypt EVERY password in a saved Case at once (owner-only, audited once). Returns a
 * map of resultId -> plaintext for the rows that have a password.
 */
export async function revealAllCasePasswordsAction(searchId: string): Promise<{ passwords: Record<string, string> }> {
  const user = await requirePermission(Permission.InitiateScans);
  const c = await ownCase(searchId, user.id, roleFromUser(user));
  if (!c) return { passwords: {} };
  const key = process.env.ENCRYPTION_KEY;
  if (!key) return { passwords: {} };
  const rows = await getDb().select().from(leakSearchResults).where(eq(leakSearchResults.searchId, searchId));
  const passwords: Record<string, string> = {};
  for (const r of rows) {
    if (!r.passwordCiphertext) continue;
    try {
      passwords[r.id] = decryptSecret(r.passwordCiphertext, key);
    } catch {
      /* skip undecryptable */
    }
  }
  await recordAudit({ actorId: user.id, action: 'leak.password.reveal_all', resource: `case:${searchId}` });
  return { passwords };
}
