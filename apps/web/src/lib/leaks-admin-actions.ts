'use server';

import { eq, ne, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Permission } from '@vacti/core';
import { encryptSecret, decryptSecret } from '@vacti/auth';
import { leakProviders, leakPackages, leakUserAccess, leakUsage } from '@vacti/db';
import { searchLeaks } from '@vacti/threat-intel';
import { getDb, env } from './db';
import { requirePermission } from './authz';
import { recordAudit } from './audit';

/**
 * Admin server actions for the Leaks feature control panel (settings/leaks-access). Every action is
 * SysAdmin-gated (Permission.ModifySystemConfig), audited, and revalidates the panel. Provider keys are
 * AES-256-GCM encrypted at rest; a live "Test" resolves the key in-memory only (never stored or logged).
 *
 * This module is additive: it never touches the runtime leaks-service / leaks-actions (search + Cases).
 */

const PANEL = '/settings/leaks-access';
const PROVIDERS = ['leakcheck'] as const;
type ProviderName = (typeof PROVIDERS)[number];

/** Parse an optional integer form field: blank/invalid/<=0 -> null (unlimited). */
function optInt(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 1) Set (or clear) a provider's admin API key. A non-empty key is encrypted and upserted onto
 *    leak_providers.key_ciphertext; an empty key clears it (null), so the resolver falls back to the env
 *    key (LEAKCHECK_API_KEY). The plaintext key is never logged or audited.
 */
export async function setLeakProviderKeyAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const provider = String(formData.get('provider') ?? '') as ProviderName;
  if (!PROVIDERS.includes(provider)) redirect(`${PANEL}?error=bad_provider`);
  const key = String(formData.get('key') ?? '').trim();
  const keyCiphertext = key ? encryptSecret(key, env().ENCRYPTION_KEY) : null;
  await getDb()
    .insert(leakProviders)
    .values({ provider, keyCiphertext, updatedAt: new Date() })
    .onConflictDoUpdate({ target: leakProviders.provider, set: { keyCiphertext, updatedAt: new Date() } });
  await recordAudit({
    actorId: actor.id,
    action: 'leak.provider.key.set',
    resource: `leak:provider:${provider}`,
    metadata: { cleared: !key },
  });
  revalidatePath(PANEL);
  redirect(`${PANEL}?ok=${key ? 'key_set' : 'key_cleared'}`);
}

/** 2) Enable/disable a provider (upsert the boolean; gates whether the provider is queried at all). */
export async function toggleLeakProviderAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const provider = String(formData.get('provider') ?? '') as ProviderName;
  if (!PROVIDERS.includes(provider)) redirect(`${PANEL}?error=bad_provider`);
  const enabled = String(formData.get('enabled') ?? '') === 'true';
  await getDb()
    .insert(leakProviders)
    .values({ provider, enabled, updatedAt: new Date() })
    .onConflictDoUpdate({ target: leakProviders.provider, set: { enabled, updatedAt: new Date() } });
  await recordAudit({
    actorId: actor.id,
    action: 'leak.provider.toggle',
    resource: `leak:provider:${provider}`,
    metadata: { enabled },
  });
  revalidatePath(PANEL);
  redirect(`${PANEL}?ok=${enabled ? 'provider_enabled' : 'provider_disabled'}`);
}

/** Resolve a provider's effective key for a Test: admin-set encrypted key, else the env fallback. */
function envFallbackKey(_provider: ProviderName): string | null {
  const e = env() as unknown as Record<string, string | undefined>;
  const name = 'LEAKCHECK_API_KEY';
  return e[name] ?? process.env[name] ?? null;
}

async function resolveProviderKey(provider: ProviderName): Promise<string | null> {
  const [row] = await getDb().select().from(leakProviders).where(eq(leakProviders.provider, provider));
  if (row?.keyCiphertext) {
    try {
      return decryptSecret(row.keyCiphertext, env().ENCRYPTION_KEY);
    } catch {
      /* fall through to env */
    }
  }
  return envFallbackKey(provider);
}

/**
 * 3) Test a provider with a trivial live query to validate its key. The key is resolved in-memory only and
 *    is NEVER stored or logged. Surfaces the result via the panel's `?ok=`/`?error=` banner. Only the
 *    ok/fail outcome is audited.
 */
export async function testLeakProviderAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const provider = String(formData.get('provider') ?? '') as ProviderName;
  if (!PROVIDERS.includes(provider)) redirect(`${PANEL}?error=bad_provider`);
  const key = await resolveProviderKey(provider);
  if (!key) {
    await recordAudit({ actorId: actor.id, action: 'leak.provider.test', resource: `leak:provider:${provider}` });
    redirect(`${PANEL}?error=test_${provider}_nokey`);
  }

  let error: string | undefined;
  try {
    const r = await searchLeaks('example.com', { key: key!, type: 'domain' });
    error = r.error;
  } catch (e) {
    error = e instanceof Error ? e.message : 'request failed';
  }
  await recordAudit({
    actorId: actor.id,
    action: 'leak.provider.test',
    resource: `leak:provider:${provider}`,
    metadata: { ok: !error },
  });
  revalidatePath(PANEL);
  redirect(`${PANEL}?${error ? 'error' : 'ok'}=test_${provider}_${error ? 'fail' : 'ok'}`);
}

/** 4a) Create a quota package (blank daily/monthly = null = unlimited). */
export async function createLeakPackageAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const name = String(formData.get('name') ?? '').trim();
  if (!name) redirect(`${PANEL}?error=pkg_name`);
  const dailyLimit = optInt(formData.get('dailyLimit'));
  const monthlyLimit = optInt(formData.get('monthlyLimit'));
  try {
    await getDb().insert(leakPackages).values({ name, dailyLimit, monthlyLimit });
  } catch {
    // name is UNIQUE - a duplicate name is a friendly guard, not a crash.
    redirect(`${PANEL}?error=pkg_exists`);
  }
  await recordAudit({
    actorId: actor.id,
    action: 'leak.package.create',
    resource: `leak:package:${name}`,
    metadata: { dailyLimit, monthlyLimit },
  });
  revalidatePath(PANEL);
  redirect(`${PANEL}?ok=pkg_created`);
}

/** 4b) Update a package's name + limits (blank = null = unlimited). */
export async function updateLeakPackageAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  if (!id || !name) redirect(`${PANEL}?error=pkg_name`);
  const dailyLimit = optInt(formData.get('dailyLimit'));
  const monthlyLimit = optInt(formData.get('monthlyLimit'));
  try {
    await getDb()
      .update(leakPackages)
      .set({ name, dailyLimit, monthlyLimit, updatedAt: new Date() })
      .where(eq(leakPackages.id, id));
  } catch {
    redirect(`${PANEL}?error=pkg_exists`);
  }
  await recordAudit({
    actorId: actor.id,
    action: 'leak.package.update',
    resource: `leak:package:${id}`,
    metadata: { name, dailyLimit, monthlyLimit },
  });
  revalidatePath(PANEL);
  redirect(`${PANEL}?ok=pkg_updated`);
}

/**
 * 4c) Delete a package. Invariants: never delete the last remaining package, and refuse to delete the
 *     current default (the operator must promote another default first). User rows referencing it are
 *     nulled by the schema FK (onDelete: set null), so those users fall back to the default package.
 */
export async function deleteLeakPackageAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  const db = getDb();
  const all = await db.select().from(leakPackages);
  const target = all.find((p) => p.id === id);
  if (!target) redirect(`${PANEL}?error=pkg_notfound`);
  if (all.length <= 1) redirect(`${PANEL}?error=pkg_last`);
  if (target!.isDefault) redirect(`${PANEL}?error=pkg_default`);
  await db.delete(leakPackages).where(eq(leakPackages.id, id));
  await recordAudit({ actorId: actor.id, action: 'leak.package.delete', resource: `leak:package:${id}` });
  revalidatePath(PANEL);
  redirect(`${PANEL}?ok=pkg_deleted`);
}

/** 5) Set the single default package: true on this one, false on all others. */
export async function setDefaultLeakPackageAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  const db = getDb();
  await db.update(leakPackages).set({ isDefault: false, updatedAt: new Date() }).where(ne(leakPackages.id, id));
  await db.update(leakPackages).set({ isDefault: true, updatedAt: new Date() }).where(eq(leakPackages.id, id));
  await recordAudit({ actorId: actor.id, action: 'leak.package.set-default', resource: `leak:package:${id}` });
  revalidatePath(PANEL);
  redirect(`${PANEL}?ok=pkg_default`);
}

/**
 * 6) Assign a user's Leaks access: an optional package and/or explicit daily/monthly overrides. Blank
 *    package -> null (falls back to the default package); blank overrides -> null. Upserts on userId.
 */
export async function assignUserLeakAccessAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const userId = String(formData.get('userId') ?? '');
  if (!userId) return;
  const packageId = String(formData.get('packageId') ?? '').trim() || null;
  const dailyLimitOverride = optInt(formData.get('dailyLimitOverride'));
  const monthlyLimitOverride = optInt(formData.get('monthlyLimitOverride'));
  await getDb()
    .insert(leakUserAccess)
    .values({ userId, packageId, dailyLimitOverride, monthlyLimitOverride, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: leakUserAccess.userId,
      set: { packageId, dailyLimitOverride, monthlyLimitOverride, updatedAt: new Date() },
    });
  await recordAudit({
    actorId: actor.id,
    action: 'leak.access.assign',
    resource: `leak:user:${userId}`,
    metadata: { packageId, dailyLimitOverride, monthlyLimitOverride },
  });
  revalidatePath(PANEL);
  redirect(`${PANEL}?ok=access_assigned`);
}

/** 7) Reset a user's usage for TODAY (delete today's leak_usage row so their daily counter starts fresh). */
export async function resetUserLeakUsageAction(formData: FormData): Promise<void> {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const userId = String(formData.get('userId') ?? '');
  if (!userId) return;
  await getDb()
    .delete(leakUsage)
    .where(sql`${leakUsage.userId} = ${userId} and ${leakUsage.day} = current_date`);
  await recordAudit({ actorId: actor.id, action: 'leak.usage.reset', resource: `leak:user:${userId}` });
  revalidatePath(PANEL);
  redirect(`${PANEL}?ok=usage_reset`);
}
