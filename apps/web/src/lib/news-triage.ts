import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { triageNewsRelevance } from '@vacti/integrations';
import { threatNews, brandNews, projects, users } from '@vacti/db';
import { getDb } from './db';
import { providerFor } from './ai-provider';
import { requireProjectMember } from './tenancy';
import { recordAudit } from './audit';

export interface TriageResult {
  ok: boolean;
  error?: 'no_ai_provider' | 'no_candidates' | 'ai_failed';
  dismissed?: number;
  candidates?: number;
}

/**
 * AI relevance triage for untriaged ("new") news headlines: auto-marks off-topic ones as dismissed,
 * learning from the analyst's prior relevant/dismissed decisions. The AI call takes 10-30s, so this
 * runs from a plain-fetch route (not a server action that the heavy /threat page would reload mid
 * call). `actorId` is the caller, for the audit record.
 */
export async function triageNewsForProject(
  projectId: string,
  kind: 'sector' | 'brand',
  actorId: string,
): Promise<TriageResult> {
  if (!projectId) return { ok: false, error: 'no_candidates' };
  const db = getDb();
  // Tenancy (defense in depth; the calling route also guards): only a member of this project (or
  // SysAdmin) may triage its news. Resolve the acting user from actorId, then assert membership.
  const [actor] = await db.select().from(users).where(eq(users.id, actorId));
  if (!actor) return { ok: false, error: 'no_candidates' };
  await requireProjectMember(actor, projectId);
  const provider = await providerFor(projectId);
  if (!provider) return { ok: false, error: 'no_ai_provider' };
  const [proj] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!proj) return { ok: false, error: 'no_candidates' };

  const CAND_LIMIT = 40;
  let candidates: { id: string; title: string }[];
  let irrelevantExamples: string[];
  let relevantExamples: string[];
  let context: string;
  if (kind === 'sector') {
    const sector = proj.sector;
    const [cand, irr, rel] = await Promise.all([
      db
        .select({ id: threatNews.id, title: threatNews.title })
        .from(threatNews)
        .where(and(eq(threatNews.sector, sector), eq(threatNews.status, 'new')))
        .orderBy(desc(threatNews.publishedAt))
        .limit(CAND_LIMIT),
      db
        .select({ title: threatNews.title })
        .from(threatNews)
        .where(and(eq(threatNews.sector, sector), eq(threatNews.status, 'dismissed')))
        .limit(15),
      db
        .select({ title: threatNews.title })
        .from(threatNews)
        .where(and(eq(threatNews.sector, sector), inArray(threatNews.status, ['relevant', 'actioned'])))
        .limit(15),
    ]);
    candidates = cand;
    irrelevantExamples = irr.map((r) => r.title);
    relevantExamples = rel.map((r) => r.title);
    context = `${sector} sector security news`;
  } else {
    const [cand, irr, rel] = await Promise.all([
      db
        .select({ id: brandNews.id, title: brandNews.title })
        .from(brandNews)
        .where(and(eq(brandNews.projectId, projectId), eq(brandNews.status, 'new')))
        .orderBy(desc(brandNews.publishedAt))
        .limit(CAND_LIMIT),
      db
        .select({ title: brandNews.title })
        .from(brandNews)
        .where(and(eq(brandNews.projectId, projectId), eq(brandNews.status, 'dismissed')))
        .limit(15),
      db
        .select({ title: brandNews.title })
        .from(brandNews)
        .where(and(eq(brandNews.projectId, projectId), inArray(brandNews.status, ['relevant', 'actioned'])))
        .limit(15),
    ]);
    candidates = cand;
    irrelevantExamples = irr.map((r) => r.title);
    relevantExamples = rel.map((r) => r.title);
    context = `brand monitoring for "${proj.brandQuery || proj.name}"`;
  }

  if (!candidates.length) return { ok: false, error: 'no_candidates' };
  let indices: number[];
  try {
    indices = await triageNewsRelevance(
      { context, irrelevantExamples, relevantExamples, candidates: candidates.map((c) => c.title) },
      provider,
    );
  } catch (e) {
    console.error('[news-triage] AI call failed:', e);
    return { ok: false, error: 'ai_failed' };
  }
  const ids = indices.map((i) => candidates[i - 1]?.id).filter((x): x is string => Boolean(x));
  if (ids.length) {
    if (kind === 'sector') {
      await db.update(threatNews).set({ status: 'dismissed' }).where(inArray(threatNews.id, ids));
    } else {
      await db.update(brandNews).set({ status: 'dismissed' }).where(inArray(brandNews.id, ids));
    }
    await recordAudit({
      actorId,
      action: 'news.ai_triage',
      resource: `${kind}:${projectId}`,
      projectId,
      metadata: { dismissed: ids.length, candidates: candidates.length },
    });
  }
  return { ok: true, dismissed: ids.length, candidates: candidates.length };
}
