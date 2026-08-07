import { type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { Role, type RoleName } from '@vacti/core';
import { memberProjectIds, projectIn, projectInOrGlobal, type Database } from '@vacti/db';

/**
 * Project-level tenancy for the Hono API. Global role decides the verb; membership decides the project set.
 * SysAdmin bypasses membership. Context-free (take role + userId) so route modules can use them without
 * coupling to their Hono `Vars` type.
 */

/** LIST predicate for the caller. undefined = unrestricted (SysAdmin). */
export async function tenantWhere(
  db: Database,
  role: RoleName,
  userId: string,
  col: PgColumn,
): Promise<SQL | undefined> {
  if (role === Role.SysAdmin) return undefined;
  return projectIn(col, await memberProjectIds(db, userId));
}

/** LIST predicate that keeps NULL-project (global/shared) rows visible. undefined = SysAdmin. */
export async function tenantWhereOrGlobal(
  db: Database,
  role: RoleName,
  userId: string,
  col: PgColumn,
): Promise<SQL | undefined> {
  if (role === Role.SysAdmin) return undefined;
  return projectInOrGlobal(col, await memberProjectIds(db, userId));
}

/** True if the caller may act within `projectId` (SysAdmin always; else must be a member). */
export async function isMember(
  db: Database,
  role: RoleName,
  userId: string,
  projectId: string | null | undefined,
): Promise<boolean> {
  if (role === Role.SysAdmin) return true;
  if (!projectId) return false;
  return (await memberProjectIds(db, userId)).includes(projectId);
}
