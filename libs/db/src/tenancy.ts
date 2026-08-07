import { eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { projectMembers } from './schema';
import type { Database } from './client';

/**
 * Project-level tenancy primitives (framework-agnostic). A user only sees/acts on data belonging to projects
 * they are a member of (project_members). SysAdmin bypasses membership entirely (handled by the callers in
 * apps/web + libs/api, which have the role in context). These helpers just answer "which projects" and turn
 * that into a SQL predicate.
 */

/** The project ids a user belongs to (empty array = member of nothing). */
export async function memberProjectIds(db: Database, userId: string): Promise<string[]> {
  const rows = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, userId));
  return rows.map((r) => r.projectId);
}

/**
 * A WHERE predicate confining `col` (a project_id column) to `ids`. A zero-length set matches NOTHING
 * (`false`) so a user with no memberships sees no rows - fail closed, never "all rows".
 */
export function projectIn(col: PgColumn, ids: string[]): SQL {
  return ids.length ? inArray(col, ids) : sql`false`;
}

/**
 * Like projectIn but ALSO admits rows whose project_id is NULL - for columns where NULL means "global/shared"
 * (e.g. scan_profiles presets, api_keys shared keys), so those stay visible to every member while
 * project-owned rows are still scoped.
 */
export function projectInOrGlobal(col: PgColumn, ids: string[]): SQL {
  return ids.length ? sql`(${col} is null or ${col} in ${ids})` : sql`${col} is null`;
}
