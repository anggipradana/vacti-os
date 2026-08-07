import { eq } from 'drizzle-orm';
import { userCan, Permission } from '@vacti/core';
import { generateBrandSentiment } from '@vacti/integrations';
import { and } from 'drizzle-orm';
import { brandNews, projects, reportSettings } from '@vacti/db';
import { getDb } from '../../../../lib/db';
import { getCurrentUser } from '../../../../lib/session';
import { requireProjectMember } from '../../../../lib/tenancy';
import { providerFor } from '../../../../lib/ai-provider';
import { isUuid } from '../../../../lib/uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Brand-monitoring sentiment. Two modes (called by the brand-news list via plain fetch, no reload):
 *  - POST { id }                       -> generate + store an AI sentiment verdict, return it.
 *  - POST { id, feedback: correct|incorrect } -> record the analyst's mark on the AI verdict.
 * The AI call takes a few seconds; a server action would be reloaded through by the heavy page.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!userCan(user, Permission.ModifyScanResults)) {
    return Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { id?: string; feedback?: string };
  const id = body.id ?? '';
  if (!isUuid(id)) return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
  const db = getDb();

  const [row] = await db.select().from(brandNews).where(eq(brandNews.id, id));
  if (!row) return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
  // Tenancy: only a member of the brand-news item's owning project (or SysAdmin) may act on it.
  await requireProjectMember(user, row.projectId);

  // Feedback mode: just record correct/incorrect on the existing verdict.
  if (body.feedback !== undefined) {
    const feedback = body.feedback === 'correct' ? 'correct' : body.feedback === 'incorrect' ? 'incorrect' : null;
    await db.update(brandNews).set({ sentimentFeedback: feedback }).where(eq(brandNews.id, id));
    return Response.json({ ok: true, feedback });
  }

  // Generate mode.
  const provider = await providerFor(row.projectId);
  if (!provider) return Response.json({ ok: false, error: 'no_ai_provider' }, { status: 200 });
  const [project] = await db.select().from(projects).where(eq(projects.id, row.projectId));
  // Sentiment reason language follows the project's TI report language setting (default en).
  const [rs] = await db
    .select({ language: reportSettings.language })
    .from(reportSettings)
    .where(and(eq(reportSettings.projectId, row.projectId), eq(reportSettings.kind, 'ti')));
  const lang = rs?.language === 'id' ? 'id' : 'en';
  try {
    const result = await generateBrandSentiment(
      { brand: project?.brandQuery || project?.name || 'brand', title: row.title, summary: row.summary, lang },
      provider,
    );
    await db
      .update(brandNews)
      .set({
        aiSentiment: result.sentiment,
        aiRelevance: result.relevance,
        aiSentimentReason: result.reason,
        sentimentCheckedAt: new Date(),
        sentimentFeedback: null, // a fresh verdict resets prior feedback
      })
      .where(eq(brandNews.id, id));
    return Response.json({ ok: true, sentiment: result.sentiment, relevance: result.relevance, reason: result.reason });
  } catch (e) {
    console.error('[brand-sentiment] AI call failed:', e);
    return Response.json({ ok: false, error: 'ai_failed' });
  }
}
