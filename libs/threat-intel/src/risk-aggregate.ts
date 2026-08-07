import { and, desc, eq, inArray, ne, count } from 'drizzle-orm';
import { Severity, VULN_ACTIVE_STATUSES, LEAK_UNRESOLVED_STATUSES } from '@vacti/core';
import {
  scans,
  vulnerabilities,
  targets,
  leakcheckData,
  otxThreatData,
  exposureFindings,
  type Database,
} from '@vacti/db';
import { calculateRiskScore, type RiskResult } from './risk-score';

const activeVuln = new Set<string>(VULN_ACTIVE_STATUSES);
const unresolvedLeak = new Set<string>(LEAK_UNRESOLVED_STATUSES);

/** Aggregate a project's VA + Threat-Intel data into the unified risk score (status-aware). */
export async function computeProjectRisk(db: Database, projectId: string): Promise<RiskResult> {
  // Current posture, not historical sum: count vulns from the latest vuln-producing scan per target
  // (mode active|full), preferring a completed one, else the latest such scan (a running re-run is a
  // fine partial). Tallying across every scan double-counts re-runs and inflates the risk score.
  // Ordered createdAt DESC so the first match per target is the latest. Passive scans produce no vulns.
  const scanRows = await db
    .select({ id: scans.id, targetId: scans.targetId, status: scans.status, mode: scans.mode })
    .from(scans)
    .where(eq(scans.projectId, projectId))
    .orderBy(desc(scans.createdAt));
  const activeByTarget = new Map<string, string>();
  const activeFallbackByTarget = new Map<string, string>();
  for (const s of scanRows) {
    if (s.mode === 'passive') continue;
    if (!activeFallbackByTarget.has(s.targetId)) activeFallbackByTarget.set(s.targetId, s.id);
    if (s.status === 'completed' && !activeByTarget.has(s.targetId)) activeByTarget.set(s.targetId, s.id);
  }
  const scanIds = [...activeFallbackByTarget].map(([tid, fallback]) => activeByTarget.get(tid) ?? fallback);
  // hasVa flips the score onto the "with VA" weighting, so it must mean a real assessment exists:
  // a queued/failed/passive scan row must NOT zero out the VA component (a fresh passive recon was
  // silently dropping the unified risk score by up to ~40%).
  const [vaScan] = await db
    .select({ id: scans.id })
    .from(scans)
    .where(and(eq(scans.projectId, projectId), eq(scans.status, 'completed'), ne(scans.mode, 'passive')))
    .limit(1);

  // SQL-side aggregates: counting in the database keeps memory flat on large projects and (for
  // leaks) keeps plaintext credentials out of process memory entirely. The predicates are the exact
  // status filters the old in-memory loops applied, so the score is unchanged (must stay +-0).
  const vuln = { critical: 0, high: 0, medium: 0, low: 0 };
  if (scanIds.length) {
    const vrows = await db
      .select({ severity: vulnerabilities.severity, n: count() })
      .from(vulnerabilities)
      .where(and(inArray(vulnerabilities.scanId, scanIds), inArray(vulnerabilities.status, [...activeVuln])))
      .groupBy(vulnerabilities.severity);
    for (const v of vrows) {
      if (v.severity === Severity.Critical) vuln.critical = Number(v.n);
      else if (v.severity === Severity.High) vuln.high = Number(v.n);
      else if (v.severity === Severity.Medium) vuln.medium = Number(v.n);
      else if (v.severity === Severity.Low) vuln.low = Number(v.n);
    }
  }

  const targetRows = await db.select({ id: targets.id }).from(targets).where(eq(targets.projectId, projectId));
  const [leakAgg] = await db
    .select({ n: count() })
    .from(leakcheckData)
    .where(and(eq(leakcheckData.projectId, projectId), inArray(leakcheckData.status, [...unresolvedLeak])));
  const otx = await db
    .select({
      pulses: otxThreatData.pulses,
      reputation: otxThreatData.reputation,
      malwareCount: otxThreatData.malwareCount,
    })
    .from(otxThreatData)
    .where(eq(otxThreatData.projectId, projectId));
  // Only UNRESOLVED exposure findings feed the score, mirroring the vuln + leak components: triaging
  // a finding (false_positive/remediated/ignored) must lower the score like everywhere else.
  // Exposure reuses the leak status set, so the unresolved set is the same.
  const [exp] = await db
    .select({ n: count() })
    .from(exposureFindings)
    .where(and(eq(exposureFindings.projectId, projectId), inArray(exposureFindings.status, [...unresolvedLeak])));

  return calculateRiskScore({
    hasVa: !!vaScan,
    vuln,
    domainCount: Math.max(1, targetRows.length),
    uncheckedLeaks: Number(leakAgg?.n ?? 0),
    threatIndicators: otx.reduce((a, o) => a + o.pulses, 0),
    reputation: otx.length ? Math.max(...otx.map((o) => o.reputation)) / 100 : 0,
    malwareCount: otx.reduce((a, o) => a + o.malwareCount, 0),
    exposureFindings: Number(exp?.n ?? 0),
  });
}
