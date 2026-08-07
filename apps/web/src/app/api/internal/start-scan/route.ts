import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { userCan, Permission } from '@vacti/core';
import { scans, targets } from '@vacti/db';
import { getDb } from '../../../../lib/db';
import { getCurrentUser } from '../../../../lib/session';
import { requireProjectMember } from '../../../../lib/tenancy';
import { getQueue } from '../../../../lib/queue';
import { recordAudit } from '../../../../lib/audit';
import { isUuid } from '../../../../lib/uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const scanJob = z.object({ scanId: z.string().uuid() });

/**
 * Session-authed JSON endpoint to start a scan, called by the New-scan dialog via plain fetch: the
 * server action's redirect response gets dropped on the scans page in production, which left the
 * button spinning while the scan silently started. POST {targetId, mode?, profileId?, deepScan?}
 * -> { ok, scanId }; the client navigates with window.location (a full load, never dropped).
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!userCan(user, Permission.InitiateScans)) {
    return Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    targetId?: string;
    profileId?: string;
    mode?: string;
    deepScan?: boolean;
    timeoutMin?: unknown;
  };
  const targetId = body.targetId ?? '';
  // Validate the id is a UUID before querying: an empty/malformed value would otherwise make the
  // pg driver throw (invalid uuid syntax) and surface as a 500 instead of a clean 400.
  if (!isUuid(targetId)) return Response.json({ ok: false, error: 'no_target' }, { status: 400 });
  const rawProfile = (body.profileId ?? '').trim();
  const profileId = isUuid(rawProfile) ? rawProfile : null; // ignore '' / malformed
  const mode = body.mode === 'passive' || body.mode === 'full' ? body.mode : 'active';
  const deepScan = body.deepScan === true;
  // Per-scan per-tool timeout in minutes (1..600 = up to 10h), stored as seconds. Optional: an
  // absent/invalid value leaves timeoutSec NULL so the profile/default applies.
  const parsedTimeout = z.coerce.number().int().min(1).max(600).safeParse(body.timeoutMin);
  if (body.timeoutMin != null && body.timeoutMin !== '' && !parsedTimeout.success) {
    return Response.json({ ok: false, error: 'bad_timeout' }, { status: 400 });
  }
  const timeoutSec = parsedTimeout.success ? parsedTimeout.data * 60 : null;
  const db = getDb();
  const [target] = await db.select().from(targets).where(eq(targets.id, targetId));
  if (!target) return Response.json({ ok: false, error: 'no_target' }, { status: 400 });
  // Tenancy: only a member of the target's owning project (or SysAdmin) may start a scan on it.
  await requireProjectMember(user, target.projectId);
  const [scan] = await db
    .insert(scans)
    .values({ projectId: target.projectId, targetId: target.id, profileId, mode, deepScan, timeoutSec })
    .returning();
  await recordAudit({
    actorId: user.id,
    action: 'scan.start',
    resource: `scan:${scan!.id}`,
    projectId: target.projectId,
    metadata: { targetId },
  });
  const q = await getQueue();
  await q.enqueue('scan', scanJob, { scanId: scan!.id });
  return Response.json({ ok: true, scanId: scan!.id });
}
