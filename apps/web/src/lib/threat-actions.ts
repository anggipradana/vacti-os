'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Permission, isNewsStatus, isLeakStatus, REVIEW_TOGGLE } from '@vacti/core';
import { isSector, fetchSectorNews, fetchBrandNews, capNews, NEWS_CAP } from '@vacti/threat-intel';
import { manualIndicators, leakcheckData, projects, threatNews, brandNews } from '@vacti/db';
import { getDb } from './db';
import { getQueue } from './queue';
import { isHostname, isIpAddress } from './validate';
import { requirePermission } from './authz';
import { requireProjectMember } from './tenancy';
import { recordAudit } from './audit';

const tiJob = z.object({ projectId: z.string().uuid() });

export async function refreshTiAction(formData: FormData) {
  const user = await requirePermission(Permission.InitiateScans);
  const projectId = String(formData.get('projectId') ?? '');
  if (!projectId) return;
  await requireProjectMember(user, projectId);
  const q = await getQueue();
  await q.enqueue('ti-refresh', tiJob, { projectId });
  revalidatePath('/threat');
}

/** Set the project's news sector and populate that sector's news immediately (so it shows on switch). */
export async function setSectorAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifyScanResults);
  const projectId = String(formData.get('projectId') ?? '');
  const sector = String(formData.get('sector') ?? '');
  if (!projectId || !isSector(sector)) return;
  await requireProjectMember(user, projectId);
  const db = getDb();
  await db.update(projects).set({ sector, updatedAt: new Date() }).where(eq(projects.id, projectId));
  // Fetch the new sector's news synchronously (RSS, a few seconds) and upsert it, so switching
  // sector shows data right away instead of waiting on the slower full TI refresh job.
  try {
    const news = await fetchSectorNews(sector);
    if (news.length) {
      await db
        .insert(threatNews)
        .values(
          news.map((n) => ({
            sector,
            title: n.title.slice(0, 500),
            link: n.link,
            source: n.source,
            summary: n.summary,
            publishedAt: n.publishedAt,
          })),
        )
        .onConflictDoUpdate({
          target: [threatNews.sector, threatNews.link],
          set: { title: sql`excluded.title`, source: sql`excluded.source`, fetchedAt: sql`now()` },
        });
    }
  } catch {
    // Best-effort; the enqueued refresh will retry.
  }
  // Keep only the newest NEWS_CAP headlines for this sector.
  await capNews(db, NEWS_CAP, { sector });
  const q = await getQueue();
  await q.enqueue('ti-refresh', tiJob, { projectId });
  revalidatePath('/threat');
}

/**
 * On-demand brand-monitoring search: optionally save a custom query term, then fetch Google News
 * (security + general) synchronously and upsert, preserving any triage status. Best-effort.
 */
export async function refreshBrandNewsAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifyScanResults);
  const projectId = String(formData.get('projectId') ?? '');
  if (!projectId) return;
  await requireProjectMember(user, projectId);
  const db = getDb();
  const [proj] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!proj) return;
  const rawQuery = String(formData.get('query') ?? '').trim();
  // A typed query becomes the persisted brand search term; otherwise reuse the stored one / name.
  if (rawQuery && rawQuery !== (proj.brandQuery ?? '')) {
    await db.update(projects).set({ brandQuery: rawQuery, updatedAt: new Date() }).where(eq(projects.id, projectId));
  }
  const term = rawQuery || proj.brandQuery || proj.name;
  if (!term) return;
  try {
    const [sec, gen] = await Promise.all([
      fetchBrandNews(term, { security: true, limit: 10 }),
      fetchBrandNews(term, { security: false, limit: 10 }),
    ]);
    const seen = new Set<string>();
    const items = [
      ...sec.map((n) => ({ ...n, security: true })),
      ...gen.map((n) => ({ ...n, security: false })),
    ].filter((n) => (seen.has(n.link) ? false : (seen.add(n.link), true)));
    if (items.length) {
      await db
        .insert(brandNews)
        .values(
          items.map((n) => ({
            projectId,
            title: n.title.slice(0, 500),
            link: n.link,
            source: n.source,
            summary: n.summary,
            publishedAt: n.publishedAt,
            security: n.security,
          })),
        )
        .onConflictDoUpdate({
          target: [brandNews.projectId, brandNews.link],
          set: {
            title: sql`excluded.title`,
            source: sql`excluded.source`,
            summary: sql`excluded.summary`,
            publishedAt: sql`excluded.published_at`,
            security: sql`excluded.security`,
            fetchedAt: sql`now()`,
          },
        });
    }
  } catch {
    // Feed outage must not fail the action.
  }
  // Keep only the newest NEWS_CAP brand headlines for this project.
  await capNews(db, NEWS_CAP, { projectId });
  revalidatePath('/threat');
}

/** Set the status of a SELECTED set of sector news headlines (checkbox multi-select). */
export async function bulkSetNewsStatusByIdsAction(formData: FormData) {
  await requirePermission(Permission.ModifyScanResults);
  const status = String(formData.get('status') ?? '');
  const ids = formData.getAll('ids').map(String).filter(Boolean);
  if (!ids.length || !isNewsStatus(status)) return;
  await getDb().update(threatNews).set({ status }).where(inArray(threatNews.id, ids));
  revalidatePath('/threat');
}

/** Set the status of a SELECTED set of brand news headlines (checkbox multi-select). */
export async function bulkSetBrandNewsStatusByIdsAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifyScanResults);
  const status = String(formData.get('status') ?? '');
  const ids = formData.getAll('ids').map(String).filter(Boolean);
  if (!ids.length || !isNewsStatus(status)) return;
  // Assert membership of every project the selected brand-news rows belong to.
  const rows = await getDb()
    .select({ projectId: brandNews.projectId })
    .from(brandNews)
    .where(inArray(brandNews.id, ids));
  for (const pid of new Set(rows.map((r) => r.projectId))) await requireProjectMember(user, pid);
  await getDb().update(brandNews).set({ status }).where(inArray(brandNews.id, ids));
  revalidatePath('/threat');
}

/** Triage a sector security-news headline (status preserved across feed refreshes). */
export async function setNewsStatusAction(formData: FormData) {
  await requirePermission(Permission.ModifyScanResults);
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!id || !isNewsStatus(status)) return;
  await getDb().update(threatNews).set({ status }).where(eq(threatNews.id, id));
  revalidatePath('/threat');
}

/** Bulk-set news headlines of a sector to a CHOSEN status; honours the current status filter. */
export async function bulkReviewNewsAction(formData: FormData) {
  await requirePermission(Permission.ModifyScanResults);
  const sector = String(formData.get('sector') ?? '');
  const status = String(formData.get('status') || REVIEW_TOGGLE.news.reviewed);
  const filter = String(formData.get('filter') ?? 'all');
  if (!isSector(sector) || !isNewsStatus(status)) return;
  await getDb()
    .update(threatNews)
    .set({ status })
    .where(
      and(
        eq(threatNews.sector, sector),
        filter !== 'all' && isNewsStatus(filter) ? eq(threatNews.status, filter) : undefined,
      ),
    );
  revalidatePath('/threat');
}

/** Bulk-set leaked credentials of a project to a CHOSEN status; honours the current status filter. */
export async function bulkReviewLeaksAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifyScanResults);
  const projectId = String(formData.get('projectId') ?? '');
  const status = String(formData.get('status') || REVIEW_TOGGLE.leak.reviewed);
  const filter = String(formData.get('filter') ?? 'all');
  if (!projectId || !isLeakStatus(status)) return;
  await requireProjectMember(user, projectId);
  await getDb()
    .update(leakcheckData)
    .set({ status, checked: status !== 'new' })
    .where(
      and(
        eq(leakcheckData.projectId, projectId),
        filter !== 'all' && isLeakStatus(filter) ? eq(leakcheckData.status, filter) : undefined,
      ),
    );
  revalidatePath('/threat');
}

/** Triage a brand-monitoring headline (status preserved across feed refreshes). */
export async function setBrandNewsStatusAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifyScanResults);
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!id || !isNewsStatus(status)) return;
  const [bn] = await getDb().select({ projectId: brandNews.projectId }).from(brandNews).where(eq(brandNews.id, id));
  await requireProjectMember(user, bn?.projectId);
  await getDb().update(brandNews).set({ status }).where(eq(brandNews.id, id));
  revalidatePath('/threat');
}

/** Bulk-set a project's brand-monitoring headlines to a CHOSEN status; honours the status filter. */
export async function bulkReviewBrandNewsAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifyScanResults);
  const projectId = String(formData.get('projectId') ?? '');
  const status = String(formData.get('status') || REVIEW_TOGGLE.news.reviewed);
  const filter = String(formData.get('filter') ?? 'all');
  if (!projectId || !isNewsStatus(status)) return;
  await requireProjectMember(user, projectId);
  await getDb()
    .update(brandNews)
    .set({ status })
    .where(
      and(
        eq(brandNews.projectId, projectId),
        filter !== 'all' && isNewsStatus(filter) ? eq(brandNews.status, filter) : undefined,
      ),
    );
  revalidatePath('/threat');
}

export async function addIndicatorAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifyScanResults);
  const projectId = String(formData.get('projectId') ?? '');
  const type = String(formData.get('type') ?? 'domain');
  const note = String(formData.get('note') ?? '').trim() || null;
  if (!projectId || !['domain', 'subdomain', 'ip'].includes(type)) return;
  await requireProjectMember(user, projectId);
  // Bulk: accept many values, one per line or comma/space separated. Dedupe within the batch, then
  // keep only values valid for the chosen type - an "ip" indicator that isn't an IP (or a "domain"
  // that isn't a hostname) would drive meaningless OSINT lookups (LeakCheck on "127.0.0.1" returns
  // ~1000 unrelated stealer logs). Invalid values are dropped rather than stored as garbage.
  const values = [
    ...new Set(
      String(formData.get('value') ?? '')
        .split(/[\n,\s]+/)
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ].filter((v) => isValidIndicator(type, v));
  if (!values.length) {
    redirect('/threat?error=invalid-indicator');
  }
  await getDb()
    .insert(manualIndicators)
    .values(values.map((value) => ({ projectId, type, value, note })));
  revalidatePath('/threat');
}

/** A value is valid for its indicator type: `ip` must be an IP literal; domain/subdomain a hostname. */
function isValidIndicator(type: string, value: string): boolean {
  return type === 'ip' ? isIpAddress(value) : isHostname(value);
}

/** Edit a manual indicator. ModifyScanResults + audit. */
export async function editIndicatorAction(formData: FormData) {
  const actor = await requirePermission(Permission.ModifyScanResults);
  const id = String(formData.get('id') ?? '');
  const type = String(formData.get('type') ?? 'domain');
  const value = String(formData.get('value') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim() || null;
  if (!id || !value || !['domain', 'subdomain', 'ip'].includes(type)) return;
  const [ind] = await getDb()
    .select({ projectId: manualIndicators.projectId })
    .from(manualIndicators)
    .where(eq(manualIndicators.id, id));
  await requireProjectMember(actor, ind?.projectId);
  if (!isValidIndicator(type, value)) redirect('/threat?error=invalid-indicator');
  await getDb().update(manualIndicators).set({ type, value, note }).where(eq(manualIndicators.id, id));
  await recordAudit({ actorId: actor.id, action: 'indicator.update', resource: `indicator:${id}` });
  revalidatePath('/threat');
}

/** Delete a manual indicator. ModifyScanResults + audit. */
export async function deleteIndicatorAction(formData: FormData) {
  const actor = await requirePermission(Permission.ModifyScanResults);
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  const [ind] = await getDb()
    .select({ projectId: manualIndicators.projectId })
    .from(manualIndicators)
    .where(eq(manualIndicators.id, id));
  await requireProjectMember(actor, ind?.projectId);
  await getDb().delete(manualIndicators).where(eq(manualIndicators.id, id));
  await recordAudit({ actorId: actor.id, action: 'indicator.delete', resource: `indicator:${id}` });
  revalidatePath('/threat');
}
