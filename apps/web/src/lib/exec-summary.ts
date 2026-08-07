import 'server-only';
import { and, desc, eq, ne } from 'drizzle-orm';
import { generateExecutiveSummary } from '@vacti/integrations';
import { scans, targets, subdomains, endpoints, ports as portsTable, vulnerabilities, reportSettings } from '@vacti/db';
import { getDb } from './db';
import { providerFor } from './ai-provider';

export interface ExecSummaryResult {
  ok: boolean;
  error?: 'no_ai_provider' | 'no_completed_scan' | 'ai_failed';
  en?: string;
  id?: string;
}

/**
 * Generate + persist the VA executive summary (EN + ID) for a project's latest COMPLETED VA scan.
 * Passive scans are excluded: they have no vulnerability/subdomain rows, so picking "the latest
 * scan" blindly made the AI describe an empty assessment right after a passive recon run.
 */
export async function generateAndStoreExecSummary(projectId: string): Promise<ExecSummaryResult> {
  const db = getDb();
  const provider = await providerFor(projectId);
  if (!provider) return { ok: false, error: 'no_ai_provider' };
  const [scan] = await db
    .select()
    .from(scans)
    .where(and(eq(scans.projectId, projectId), eq(scans.status, 'completed'), ne(scans.mode, 'passive')))
    .orderBy(desc(scans.createdAt))
    .limit(1);
  if (!scan) return { ok: false, error: 'no_completed_scan' };
  const [target] = await db.select().from(targets).where(eq(targets.id, scan.targetId));
  const [subs, eps, prt, vulns] = await Promise.all([
    db.select().from(subdomains).where(eq(subdomains.scanId, scan.id)),
    db.select().from(endpoints).where(eq(endpoints.scanId, scan.id)),
    db.select().from(portsTable).where(eq(portsTable.scanId, scan.id)),
    db.select().from(vulnerabilities).where(eq(vulnerabilities.scanId, scan.id)),
  ]);
  const sev = (n: number) => vulns.filter((v) => v.severity === n).length;
  const active = vulns.filter((v) => ['open', 'in_progress', 'reopened'].includes(v.status)).length;
  const base = {
    target: target?.domain ?? 'target',
    counts: { subdomains: subs.length, endpoints: eps.length, ports: prt.length, vulns: vulns.length, active },
    severities: { critical: sev(4), high: sev(3), medium: sev(2), low: sev(1), info: sev(0) },
    topFindings: [...new Set(vulns.filter((v) => v.severity >= 3).map((v) => v.name))].slice(0, 5),
  };
  try {
    const [en, id] = await Promise.all([
      generateExecutiveSummary({ ...base, lang: 'en' }, provider),
      generateExecutiveSummary({ ...base, lang: 'id' }, provider),
    ]);
    await db
      .insert(reportSettings)
      .values({ projectId, kind: 'va', showExecutiveSummary: true, executiveSummary: en, executiveSummaryId: id })
      .onConflictDoUpdate({
        target: [reportSettings.projectId, reportSettings.kind],
        set: { showExecutiveSummary: true, executiveSummary: en, executiveSummaryId: id },
      });
    return { ok: true, en, id };
  } catch (e) {
    console.error('[exec-summary] AI call failed:', e);
    return { ok: false, error: 'ai_failed' };
  }
}
