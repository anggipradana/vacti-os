import { and, inArray } from 'drizzle-orm';
import { scans } from '@vacti/db';
import { getDb } from '../../../../lib/db';
import { getCurrentUser } from '../../../../lib/session';
import { tenantScope, scopeWhere } from '../../../../lib/tenancy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

/**
 * Session-authed progress poll for one or more scans (used by the Attack Surface passive-recon
 * progress bar). GET ?ids=id1,id2 -> { scans: [{id,status,stage}], done }.
 */
export async function GET(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const ids = (new URL(req.url).searchParams.get('ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return Response.json({ ok: true, scans: [], done: true });

  // Tenancy: a member only sees progress for scans in their projects (SysAdmin sees all). Non-member ids
  // are silently filtered out rather than 404ing, since this is a multi-id poll.
  const t = await tenantScope(user);
  const rows = await getDb()
    .select({ id: scans.id, status: scans.status, stage: scans.stage })
    .from(scans)
    .where(and(inArray(scans.id, ids), scopeWhere(t, scans.projectId)));
  const done = rows.length > 0 && rows.every((r) => TERMINAL.has(r.status));
  return Response.json({ ok: true, scans: rows, done });
}
