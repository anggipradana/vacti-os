import { eq } from 'drizzle-orm';
import { userCan, Permission } from '@vacti/core';
import { generateThreatNarrative } from '@vacti/integrations';
import { computeProjectRisk } from '@vacti/threat-intel';
import { otxThreatData, leakcheckData, projects, threatIntelStatus } from '@vacti/db';
import { getDb } from '../../../../lib/db';
import { getCurrentUser } from '../../../../lib/session';
import { requireProjectMember } from '../../../../lib/tenancy';
import { providerFor } from '../../../../lib/ai-provider';
import { isUuid } from '../../../../lib/uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Session-authed JSON endpoint to (re)generate the AI risk-analysis narrative for a project, called
 * by the threat page via plain fetch so the result shows in place with a spinner (no full reload).
 * POST { projectId, lang? } -> { ok, narrative }.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!userCan(user, Permission.ModifyScanResults)) {
    return Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { projectId?: string; lang?: string };
  const projectId = body.projectId ?? '';
  const lang = body.lang === 'id' ? 'id' : 'en';
  if (!projectId) return Response.json({ ok: false, error: 'missing projectId' }, { status: 400 });
  if (!isUuid(projectId)) return Response.json({ ok: false, error: 'missing projectId' }, { status: 400 });
  // Tenancy: only a member of this project (or SysAdmin) may regenerate its risk narrative.
  await requireProjectMember(user, projectId);

  const db = getDb();
  const provider = await providerFor(projectId);
  if (!provider) return Response.json({ ok: false, error: 'no_ai_provider' }, { status: 200 });

  try {
    const [risk, otx, leaks, [project]] = await Promise.all([
      computeProjectRisk(db, projectId),
      db.select().from(otxThreatData).where(eq(otxThreatData.projectId, projectId)),
      db.select().from(leakcheckData).where(eq(leakcheckData.projectId, projectId)),
      db.select().from(projects).where(eq(projects.id, projectId)),
    ]);
    const score = Math.max(0, Math.min(100, risk.score));
    const narrative = await generateThreatNarrative(
      {
        project: project?.name ?? 'project',
        lang,
        riskScore: score,
        riskLevel: score >= 71 ? 'HIGH' : score >= 31 ? 'MEDIUM' : 'LOW',
        totals: {
          pulses: otx.reduce((a, o) => a + o.pulses, 0),
          malware: otx.reduce((a, o) => a + o.malwareCount, 0),
          leaks: leaks.length,
        },
        components: risk.components,
      },
      provider,
    );
    await db
      .insert(threatIntelStatus)
      .values({ projectId, aiNarrative: narrative })
      .onConflictDoUpdate({ target: threatIntelStatus.projectId, set: { aiNarrative: narrative } });
    return Response.json({ ok: true, narrative });
  } catch (e) {
    // Detail stays server-side: provider/SDK messages can include endpoint or config hints.
    console.error('[threat-narrative] AI call failed:', e);
    return Response.json({ ok: false, error: 'ai_failed' });
  }
}
