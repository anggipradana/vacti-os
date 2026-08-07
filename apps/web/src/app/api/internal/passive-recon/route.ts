import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { userCan, Permission } from '@vacti/core';
import { targets, scans } from '@vacti/db';
import { getDb } from '../../../../lib/db';
import { getQueue } from '../../../../lib/queue';
import { getCurrentUser } from '../../../../lib/session';
import { requireProjectMember } from '../../../../lib/tenancy';
import { isUuid } from '../../../../lib/uuid';
import { recordAudit } from '../../../../lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const scanJob = z.object({ scanId: z.string().uuid() });

/**
 * Session-authed JSON endpoint to start passive recon (VirusTotal + Wayback + URLScan) for a project,
 * driven from the Attack Surface page via plain fetch (so it stays on that page with a progress bar
 * instead of navigating to the VA Scans dashboard). Idempotent: skips a target that already has a
 * queued/running passive (or full) scan. POST { projectId } -> { ok, scanIds }.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!userCan(user, Permission.InitiateScans)) {
    return Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  const { projectId } = (await req.json().catch(() => ({}))) as { projectId?: string };
  if (!projectId) return Response.json({ ok: false, error: 'missing projectId' }, { status: 400 });
  if (!isUuid(projectId)) return Response.json({ ok: false, error: 'missing projectId' }, { status: 400 });
  // Tenancy: only a member of this project (or SysAdmin) may start passive recon on it.
  await requireProjectMember(user, projectId);

  const db = getDb();
  const projTargets = await db.select().from(targets).where(eq(targets.projectId, projectId));
  if (projTargets.length === 0) return Response.json({ ok: false, error: 'no_targets' }, { status: 200 });

  const active = await db
    .select({ id: scans.id, targetId: scans.targetId })
    .from(scans)
    .where(
      and(
        eq(scans.projectId, projectId),
        inArray(scans.mode, ['passive', 'full']),
        inArray(scans.status, ['queued', 'running']),
      ),
    );
  const busy = new Set(active.map((s) => s.targetId));
  const scanIds: string[] = active.map((s) => s.id); // include already-running ones so the UI can track them

  const q = await getQueue();
  let started = 0;
  for (const t of projTargets) {
    if (busy.has(t.id)) continue;
    const [scan] = await db.insert(scans).values({ projectId, targetId: t.id, mode: 'passive' }).returning();
    await q.enqueue('scan', scanJob, { scanId: scan!.id });
    scanIds.push(scan!.id);
    started++;
  }
  await recordAudit({
    actorId: user.id,
    action: 'scan.start',
    resource: `project:${projectId}`,
    projectId,
    metadata: { mode: 'passive', started, targets: projTargets.length, via: 'attack-surface' },
  });
  return Response.json({ ok: true, scanIds, started });
}
