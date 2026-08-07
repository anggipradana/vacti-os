import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { decryptSecret } from '@vacti/auth';
import { Role, type RoleName } from '@vacti/core';
import { leakProviders, leakPackages, leakUserAccess, leakUsage } from '@vacti/db';
import { getDb } from './db';

/**
 * Server-only service for the Leaks tool: resolves per-provider config (enabled + key, white-labeled) and
 * enforces the admin-controlled per-user daily/monthly search quota. SysAdmin bypasses quota.
 */

export interface ResolvedProviders {
  leakcheck: { enabled: boolean; key: string | null };
}

/**
 * Resolve the provider's enabled-state + key. Key precedence: admin-set encrypted key in leak_providers,
 * else the env fallback (LEAKCHECK_API_KEY). A provider with no key resolves to key=null (the unified
 * search simply skips it).
 */
export async function resolveLeakProviders(): Promise<ResolvedProviders> {
  const db = getDb();
  const rows = await db.select().from(leakProviders);
  const encKey = process.env.ENCRYPTION_KEY;
  const envFallback: Record<string, string | undefined> = {
    leakcheck: process.env.LEAKCHECK_API_KEY,
  };
  const resolve = (name: 'leakcheck') => {
    const row = rows.find((r) => r.provider === name);
    const enabled = row ? row.enabled : true; // default enabled if unseeded
    let key: string | null = null;
    if (row?.keyCiphertext && encKey) {
      try {
        key = decryptSecret(row.keyCiphertext, encKey);
      } catch {
        key = null;
      }
    }
    if (!key) key = envFallback[name] ?? null;
    return { enabled, key: enabled ? key : null };
  };
  return { leakcheck: resolve('leakcheck') };
}

export interface QuotaState {
  dailyLimit: number | null; // null = unlimited
  monthlyLimit: number | null;
  usedToday: number;
  usedMonth: number;
  remainingToday: number | null; // null = unlimited
  unlimited: boolean;
}

/** Effective limits for a user: explicit override, else assigned package, else the default package. */
async function effectiveLimits(userId: string): Promise<{ daily: number | null; monthly: number | null }> {
  const db = getDb();
  const [access] = await db.select().from(leakUserAccess).where(eq(leakUserAccess.userId, userId));
  let pkg: typeof leakPackages.$inferSelect | undefined;
  if (access?.packageId) {
    [pkg] = await db.select().from(leakPackages).where(eq(leakPackages.id, access.packageId));
  }
  if (!pkg) {
    [pkg] = await db.select().from(leakPackages).where(eq(leakPackages.isDefault, true)).limit(1);
  }
  const daily = access?.dailyLimitOverride ?? pkg?.dailyLimit ?? null;
  const monthly = access?.monthlyLimitOverride ?? pkg?.monthlyLimit ?? null;
  return { daily, monthly };
}

/** Read the current quota state for display (does not consume). SysAdmin = unlimited. */
export async function getQuotaState(userId: string, role: RoleName): Promise<QuotaState> {
  if (role === Role.SysAdmin)
    return { dailyLimit: null, monthlyLimit: null, usedToday: 0, usedMonth: 0, remainingToday: null, unlimited: true };
  const db = getDb();
  const { daily, monthly } = await effectiveLimits(userId);
  const [today] = await db
    .select({ c: leakUsage.count })
    .from(leakUsage)
    .where(and(eq(leakUsage.userId, userId), eq(leakUsage.day, sql`current_date`)));
  const [month] = await db
    .select({ c: sql<number>`coalesce(sum(${leakUsage.count}),0)` })
    .from(leakUsage)
    .where(
      and(eq(leakUsage.userId, userId), sql`date_trunc('month', ${leakUsage.day}) = date_trunc('month', current_date)`),
    );
  const usedToday = Number(today?.c ?? 0);
  const usedMonth = Number(month?.c ?? 0);
  return {
    dailyLimit: daily,
    monthlyLimit: monthly,
    usedToday,
    usedMonth,
    remainingToday: daily == null ? null : Math.max(0, daily - usedToday),
    unlimited: false,
  };
}

export type QuotaConsumeResult = { allowed: true; state: QuotaState } | { allowed: false; reason: string };

/**
 * Atomically check + consume one search unit. SysAdmin bypasses. Increments today's counter only when
 * within both the daily and monthly limits. Returns allowed:false with a reason when a limit is hit.
 */
export async function consumeQuota(userId: string, role: RoleName): Promise<QuotaConsumeResult> {
  if (role === Role.SysAdmin) return { allowed: true, state: await getQuotaState(userId, role) };
  const state = await getQuotaState(userId, role);
  if (state.dailyLimit != null && state.usedToday >= state.dailyLimit)
    return { allowed: false, reason: 'Daily search limit reached. Contact your admin.' };
  if (state.monthlyLimit != null && state.usedMonth >= state.monthlyLimit)
    return { allowed: false, reason: 'Monthly search limit reached. Contact your admin.' };
  const db = getDb();
  await db
    .insert(leakUsage)
    .values({ userId, day: sql`current_date` as unknown as string, count: 1 })
    .onConflictDoUpdate({ target: [leakUsage.userId, leakUsage.day], set: { count: sql`${leakUsage.count} + 1` } });
  return {
    allowed: true,
    state: {
      ...state,
      usedToday: state.usedToday + 1,
      remainingToday: state.remainingToday == null ? null : state.remainingToday - 1,
    },
  };
}
