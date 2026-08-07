'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { isVulnStatus, isLeakStatus, Permission, REVIEW_TOGGLE } from '@vacti/core';
import { vulnerabilities, leakcheckData } from '@vacti/db';
import { getDb } from './db';
import { requirePermission } from './authz';
import { requireProjectMember, requireScanMember } from './tenancy';
import { recordAudit } from './audit';

// Finding-status changes require `modify_scan_results` (Auditor is read-only).
export async function setVulnStatusAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifyScanResults);
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  const scanId = String(formData.get('scanId') ?? '');
  if (!id || !isVulnStatus(status)) return;
  await requireScanMember(user, scanId);
  await getDb().update(vulnerabilities).set({ status, statusChangedAt: new Date() }).where(eq(vulnerabilities.id, id));
  if (scanId) revalidatePath(`/scans/${scanId}`);
}

/** Bulk one-click: mark every still-open vuln of a scan as reviewed (on progress). */
/** Bulk-set every vulnerability of a scan to a CHOSEN triage status (defaults to the review status). */
export async function bulkReviewVulnsAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifyScanResults);
  const scanId = String(formData.get('scanId') ?? '');
  const status = String(formData.get('status') || REVIEW_TOGGLE.vuln.reviewed);
  const filter = String(formData.get('filter') ?? 'all');
  if (!scanId || !isVulnStatus(status)) return;
  await requireScanMember(user, scanId);
  await getDb()
    .update(vulnerabilities)
    .set({ status, statusChangedAt: new Date() })
    .where(
      and(
        eq(vulnerabilities.scanId, scanId),
        filter !== 'all' && isVulnStatus(filter) ? eq(vulnerabilities.status, filter) : undefined,
      ),
    );
  revalidatePath(`/scans/${scanId}`);
}

/** Set/clear an analyst note on a vulnerability finding. ModifyScanResults + audit. */
export async function setVulnNoteAction(formData: FormData) {
  const actor = await requirePermission(Permission.ModifyScanResults);
  const id = String(formData.get('id') ?? '');
  const scanId = String(formData.get('scanId') ?? '');
  const note = String(formData.get('note') ?? '').trim() || null;
  if (!id) return;
  await requireScanMember(actor, scanId);
  await getDb().update(vulnerabilities).set({ analystNote: note }).where(eq(vulnerabilities.id, id));
  await recordAudit({ actorId: actor.id, action: 'vuln.note', resource: `vuln:${id}` });
  if (scanId) revalidatePath(`/scans/${scanId}`);
}

/** Set the status of a SELECTED set of vulnerabilities (checkbox multi-select). */
export async function bulkSetVulnStatusByIdsAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifyScanResults);
  const scanId = String(formData.get('scanId') ?? '');
  const status = String(formData.get('status') ?? '');
  const ids = formData.getAll('ids').map(String).filter(Boolean);
  if (!ids.length || !isVulnStatus(status)) return;
  await requireScanMember(user, scanId);
  await getDb()
    .update(vulnerabilities)
    .set({ status, statusChangedAt: new Date() })
    .where(inArray(vulnerabilities.id, ids));
  if (scanId) revalidatePath(`/scans/${scanId}`);
}

/** Set the status of a SELECTED set of leaked-credential rows (checkbox multi-select). */
export async function bulkSetLeakStatusByIdsAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifyScanResults);
  const status = String(formData.get('status') ?? '');
  const ids = formData.getAll('ids').map(String).filter(Boolean);
  if (!ids.length || !isLeakStatus(status)) return;
  // Assert membership of every project the selected leak rows belong to.
  const rows = await getDb()
    .select({ projectId: leakcheckData.projectId })
    .from(leakcheckData)
    .where(inArray(leakcheckData.id, ids));
  for (const pid of new Set(rows.map((r) => r.projectId))) await requireProjectMember(user, pid);
  await getDb()
    .update(leakcheckData)
    .set({ status, checked: status !== 'new' })
    .where(inArray(leakcheckData.id, ids));
  revalidatePath('/threat');
}

export async function setLeakStatusAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifyScanResults);
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!id || !isLeakStatus(status)) return;
  const [leak] = await getDb()
    .select({ projectId: leakcheckData.projectId })
    .from(leakcheckData)
    .where(eq(leakcheckData.id, id));
  await requireProjectMember(user, leak?.projectId);
  await getDb()
    .update(leakcheckData)
    .set({ status, checked: status !== 'new' })
    .where(eq(leakcheckData.id, id));
  revalidatePath('/threat');
}

/** Delete a single vulnerability finding. ModifyScanResults + audit. */
export async function deleteVulnAction(formData: FormData) {
  const actor = await requirePermission(Permission.ModifyScanResults);
  const id = String(formData.get('id') ?? '');
  const scanId = String(formData.get('scanId') ?? '');
  if (!id) return;
  await requireScanMember(actor, scanId);
  await getDb().delete(vulnerabilities).where(eq(vulnerabilities.id, id));
  await recordAudit({ actorId: actor.id, action: 'vuln.delete', resource: `vuln:${id}` });
  if (scanId) revalidatePath(`/scans/${scanId}`);
}

/** Delete a single leaked-credential row. ModifyScanResults + audit. */
export async function deleteLeakAction(formData: FormData) {
  const actor = await requirePermission(Permission.ModifyScanResults);
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  const [leak] = await getDb()
    .select({ projectId: leakcheckData.projectId })
    .from(leakcheckData)
    .where(eq(leakcheckData.id, id));
  await requireProjectMember(actor, leak?.projectId);
  await getDb().delete(leakcheckData).where(eq(leakcheckData.id, id));
  await recordAudit({ actorId: actor.id, action: 'leak.delete', resource: `leak:${id}` });
  revalidatePath('/threat');
}
