import { eq } from 'drizzle-orm';
import { userCan, Permission } from '@vacti/core';
import { enrichVulnerability, enrichmentHash } from '@vacti/integrations';
import { vulnerabilities, scans, aiCache } from '@vacti/db';
import { getDb } from '../../../../lib/db';
import { getCurrentUser } from '../../../../lib/session';
import { requireProjectMember } from '../../../../lib/tenancy';
import { providerFor } from '../../../../lib/ai-provider';
import { isUuid } from '../../../../lib/uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Session-authed JSON endpoint for AI vulnerability enrichment, called by the vuln table via plain
 * fetch (the heavy scan-detail page drops Next server-action/RSC responses, so the UI uses a plain
 * fetch + in-place update instead of a full reload). Returns the enrichment so the client can render
 * it immediately. POST { id }.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!userCan(user, Permission.ModifyScanResults)) {
    return Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return Response.json({ ok: false, error: 'missing id' }, { status: 400 });
  if (!isUuid(id)) return Response.json({ ok: false, error: 'not found' }, { status: 404 });

  const db = getDb();
  const [vuln] = await db.select().from(vulnerabilities).where(eq(vulnerabilities.id, id));
  if (!vuln) return Response.json({ ok: false, error: 'not found' }, { status: 404 });
  const [scan] = await db.select().from(scans).where(eq(scans.id, vuln.scanId));
  // Tenancy: the caller must be a member of the project owning this vuln's scan (SysAdmin bypasses).
  await requireProjectMember(user, scan?.projectId);
  const provider = scan ? await providerFor(scan.projectId) : null;
  if (!provider) {
    return Response.json({ ok: false, error: 'no_ai_provider' }, { status: 200 });
  }

  const input = { name: vuln.name, type: vuln.type, matchedAt: vuln.matchedAt, severity: vuln.severity };
  const hash = enrichmentHash(input);
  try {
    const [cached] = await db.select().from(aiCache).where(eq(aiCache.hash, hash));
    let enrichment: { description: string; impact: string; remediation: string };
    if (cached) {
      enrichment = JSON.parse(cached.output) as typeof enrichment;
    } else {
      enrichment = await enrichVulnerability(input, provider);
      await db
        .insert(aiCache)
        .values({ hash, kind: 'vuln', output: JSON.stringify(enrichment) })
        .onConflictDoNothing();
    }
    await db
      .update(vulnerabilities)
      .set({
        aiDescription: enrichment.description,
        aiImpact: enrichment.impact,
        aiRemediation: enrichment.remediation,
        isAiEnriched: true,
      })
      .where(eq(vulnerabilities.id, id));
    return Response.json({ ok: true, enrichment });
  } catch (e) {
    // Detail stays server-side: provider/SDK messages can include endpoint or config hints.
    console.error('[enrich-vuln] AI call failed:', e);
    return Response.json({ ok: false, error: 'ai_failed' });
  }
}
