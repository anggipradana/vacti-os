import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { userCan, Permission } from '@vacti/core';
import { scans } from '@vacti/db';
import { getDb } from '../../../../lib/db';
import { getCurrentUser } from '../../../../lib/session';
import { requireProjectMember } from '../../../../lib/tenancy';
import { getQueue } from '../../../../lib/queue';
import { recordAudit } from '../../../../lib/audit';
import { isUuid } from '../../../../lib/uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const scanJob = z.object({ scanId: z.string().uuid() });
const ALL_TOOLS = ['subfinder', 'httpx', 'naabu', 'nuclei', 'wordfence'] as const;

/**
 * Session-authed JSON endpoint to re-run a scan, called by the scan-detail Rescan form via plain
 * fetch: the old server action redirected to the new scan, and that redirect response is dropped on
 * this heavy page (button spun, never navigated). Carries mode + deepScan from the source scan so a
 * passive rescan stays passive. POST { id, tools? } -> { ok, scanId }; the client navigates to it.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!userCan(user, Permission.InitiateScans)) {
    return Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { id?: string; tools?: string[] };
  const id = body.id ?? '';
  // Validate the id is a UUID first: a malformed value would make pg throw (500) not return not_found.
  if (!isUuid(id)) return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
  const db = getDb();
  const [scan] = await db.select().from(scans).where(eq(scans.id, id));
  if (!scan) return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
  // Tenancy: only a member of the scan's owning project (or SysAdmin) may re-run it.
  await requireProjectMember(user, scan.projectId);
  const picked = new Set((Array.isArray(body.tools) ? body.tools : []).map(String));
  const isSubset = picked.size > 0 && picked.size < ALL_TOOLS.length;
  const toolsOverride = isSubset ? Object.fromEntries(ALL_TOOLS.map((t) => [t, picked.has(t)])) : null;
  const [created] = await db
    .insert(scans)
    .values({
      projectId: scan.projectId,
      targetId: scan.targetId,
      profileId: scan.profileId,
      mode: scan.mode,
      deepScan: scan.deepScan,
      toolsOverride: scan.mode === 'passive' ? null : toolsOverride,
    })
    .returning();
  await recordAudit({
    actorId: user.id,
    action: 'scan.rescan',
    resource: `scan:${created!.id}`,
    projectId: scan.projectId,
    metadata: { from: id },
  });
  const q = await getQueue();
  await q.enqueue('scan', scanJob, { scanId: created!.id });
  return Response.json({ ok: true, scanId: created!.id });
}
