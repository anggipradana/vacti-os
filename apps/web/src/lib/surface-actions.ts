'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { Permission, isLeakStatus } from '@vacti/core';
import { exposureFindings } from '@vacti/db';
import { getDb } from './db';
import { requirePermission } from './authz';
import { requireProjectMember } from './tenancy';
import { recordAudit } from './audit';

/** Resolve an exposure finding's owning project and assert the caller is a member (SysAdmin bypasses). */
async function requireExposureMember(user: Parameters<typeof requireProjectMember>[0], id: string) {
  const [row] = await getDb()
    .select({ projectId: exposureFindings.projectId })
    .from(exposureFindings)
    .where(eq(exposureFindings.id, id));
  await requireProjectMember(user, row?.projectId);
}

/** Triage a single exposure finding (reuses the leak status set: new/investigating/confirmed/…). */
export async function setExposureStatusAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifyScanResults);
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!id || !isLeakStatus(status)) return;
  await requireExposureMember(user, id);
  await getDb().update(exposureFindings).set({ status }).where(eq(exposureFindings.id, id));
  revalidatePath('/surface');
}

/** Set/clear an analyst note on an exposure finding. ModifyScanResults + audit. */
export async function setExposureNoteAction(formData: FormData) {
  const actor = await requirePermission(Permission.ModifyScanResults);
  const id = String(formData.get('id') ?? '');
  const note = String(formData.get('note') ?? '').trim() || null;
  if (!id) return;
  await requireExposureMember(actor, id);
  await getDb().update(exposureFindings).set({ analystNote: note }).where(eq(exposureFindings.id, id));
  await recordAudit({ actorId: actor.id, action: 'exposure.note', resource: `exposure:${id}` });
  revalidatePath('/surface');
}

/** Delete a single exposure finding. ModifyScanResults + audit. */
export async function deleteExposureAction(formData: FormData) {
  const actor = await requirePermission(Permission.ModifyScanResults);
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await requireExposureMember(actor, id);
  await getDb().delete(exposureFindings).where(eq(exposureFindings.id, id));
  await recordAudit({ actorId: actor.id, action: 'exposure.delete', resource: `exposure:${id}` });
  revalidatePath('/surface');
}

/** Set the status of a SELECTED set of exposure findings (checkbox multi-select). */
export async function bulkSetExposureStatusByIdsAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifyScanResults);
  const status = String(formData.get('status') ?? '');
  const ids = formData.getAll('ids').map(String).filter(Boolean);
  if (!ids.length || !isLeakStatus(status)) return;
  // Assert membership of every project the selected exposure rows belong to.
  const rows = await getDb()
    .select({ projectId: exposureFindings.projectId })
    .from(exposureFindings)
    .where(inArray(exposureFindings.id, ids));
  for (const pid of new Set(rows.map((r) => r.projectId))) await requireProjectMember(user, pid);
  await getDb().update(exposureFindings).set({ status }).where(inArray(exposureFindings.id, ids));
  revalidatePath('/surface');
}

/** Bulk-set a project's exposure findings to a status; honours the active type/status filter. */
export async function bulkReviewExposureAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifyScanResults);
  const projectId = String(formData.get('projectId') ?? '');
  const status = String(formData.get('status') ?? 'investigating');
  const typeFilter = String(formData.get('type') ?? 'all');
  const statusFilter = String(formData.get('filter') ?? 'all');
  if (!projectId || !isLeakStatus(status)) return;
  await requireProjectMember(user, projectId);
  await getDb()
    .update(exposureFindings)
    .set({ status })
    .where(
      and(
        eq(exposureFindings.projectId, projectId),
        typeFilter !== 'all' ? eq(exposureFindings.findingType, typeFilter) : undefined,
        statusFilter !== 'all' && isLeakStatus(statusFilter) ? eq(exposureFindings.status, statusFilter) : undefined,
      ),
    );
  revalidatePath('/surface');
}
