import { userCan, Permission } from '@vacti/core';
import { getCurrentUser } from '../../../../lib/session';
import { requireProjectMember } from '../../../../lib/tenancy';
import { generateAndStoreExecSummary } from '../../../../lib/exec-summary';
import { isUuid } from '../../../../lib/uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Session-authed JSON endpoint: generate + persist the VA executive summary for a project, called
 * by the report-settings page via plain fetch so the result fills the textareas in place (the AI
 * call takes 10-30s; a server action's response gets dropped, which looked like "nothing happened
 * until I reloaded"). POST { projectId } -> { ok, en, id } or { ok: false, error }.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!userCan(user, Permission.ModifyReport)) {
    return Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { projectId?: string };
  const projectId = body.projectId ?? '';
  if (!projectId) return Response.json({ ok: false, error: 'missing projectId' }, { status: 400 });
  if (!isUuid(projectId)) return Response.json({ ok: false, error: 'no_completed_scan' }, { status: 400 });
  // Tenancy: only a member of this project (or SysAdmin) may generate its executive summary.
  await requireProjectMember(user, projectId);
  return Response.json(await generateAndStoreExecSummary(projectId));
}
