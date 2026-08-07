import 'server-only';
import { notFound } from 'next/navigation';
import { eq, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { Role, roleFromUser } from '@vacti/core';
import { memberProjectIds, projectIn, projectInOrGlobal, scans } from '@vacti/db';
import { getDb } from './db';

/**
 * Project-level tenancy for the web app. Global RBAC decides the VERB (what a role may do); membership decides
 * the PROJECT SET (which projects those actions touch). SysAdmin bypasses membership and sees everything.
 *
 * These helpers are the single funnel: list pages add `scopeWhere(t, table.projectId)` to their query; `:id`
 * pages / mutations call `requireProjectMember` (or a `requireXMember` that resolves the owning project first).
 */

type SessionUser = { id: string; role?: string | null; isSysAdmin?: boolean | null };
export type Tenant = { all: true } | { all: false; projectIds: string[] };

/** Resolve the caller's tenant scope once. SysAdmin => {all:true} (bypass). */
export async function tenantScope(user: SessionUser): Promise<Tenant> {
  if (roleFromUser(user) === Role.SysAdmin) return { all: true };
  return { all: false, projectIds: await memberProjectIds(getDb(), user.id) };
}

/** WHERE predicate for a LIST query on a project-scoped table. undefined = no restriction (SysAdmin). */
export function scopeWhere(t: Tenant, col: PgColumn): SQL | undefined {
  return t.all ? undefined : projectIn(col, t.projectIds);
}

/** Like scopeWhere but keeps NULL-project (global/shared) rows visible. undefined = SysAdmin (no restriction). */
export function scopeWhereOrGlobal(t: Tenant, col: PgColumn): SQL | undefined {
  return t.all ? undefined : projectInOrGlobal(col, t.projectIds);
}

/** Assert the user may act within a specific project, else 404 (do not leak existence to a non-member). */
export async function requireProjectMember(user: SessionUser, projectId: string | null | undefined): Promise<void> {
  const t = await tenantScope(user);
  if (t.all) return;
  if (!projectId || !t.projectIds.includes(projectId)) notFound();
}

/** Resolve a scan -> its project, assert membership, return the row. 404 if missing or not a member. */
export async function requireScanMember(user: SessionUser, scanId: string) {
  const [row] = await getDb().select().from(scans).where(eq(scans.id, scanId));
  if (!row) notFound();
  await requireProjectMember(user, row.projectId);
  return row;
}
