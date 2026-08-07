import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { Crosshair, ShieldCheck, Radar as RadarIcon, Gauge, KeyRound } from 'lucide-react';
import { PageHeader } from '../../../components/ui/page-header';
import { StatCard } from '../../../components/ui/stat-card';
import { ModuleCard } from '../../../components/ui/module-card';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { StatusPill } from '../../../components/ui/status-pill';
import { Table, THead, TBody, TR, TH, TD } from '../../../components/ui/table';
import { SeverityDonut } from '../../../components/ui/severity-donut';
import { TrendArea } from '../../../components/ui/trend-area';
import { Severity, VULN_ACTIVE_STATUSES, VULN_STATUS_LABEL, LEAK_STATUS_LABEL } from '@vacti/core';
import type { SeverityValue, VulnStatusValue, LeakStatusValue } from '@vacti/core';
import { SeverityBadge } from '../../../components/ui/severity-badge';
import { CountBar } from '../../../components/ui/count-bar';
import { Badge } from '../../../components/ui/badge';
import { RiskGauge } from '../../../components/ui/risk-gauge';
import {
  targets,
  scans,
  vulnerabilities,
  projects,
  leakcheckData,
  subdomains,
  exposureFindings,
  discoveredUrls,
} from '@vacti/db';
import { computeProjectRisk } from '@vacti/threat-intel';
import { getDb } from '../../../lib/db';
import { getCurrentUser } from '../../../lib/session';
import { ProjectSwitcher } from '../../../components/project-switcher';
import { getActiveProjectId } from '../../../lib/active-project';
import { tenantScope, scopeWhere } from '../../../lib/tenancy';
import { getLocale } from '../../../lib/locale';
import { tx } from '../../../lib/i18n';
import { RansomwareHighlight, RansomwareHighlightFallback } from './cti-overview';
import { SectionHeader } from './section';

export const dynamic = 'force-dynamic';

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const locale = await getLocale();
  const db = getDb();
  const t = await tenantScope(user);
  const projectRows = await db
    .select()
    .from(projects)
    .where(scopeWhere(t, projects.id))
    .orderBy(desc(projects.createdAt));
  const projectId = await getActiveProjectId((await searchParams).project, projectRows);
  // Scope the whole overview to the active project so client data never bleeds across projects.
  const [targetRows, scanRows] = projectId
    ? await Promise.all([
        db.select().from(targets).where(eq(targets.projectId, projectId)),
        db.select().from(scans).where(eq(scans.projectId, projectId)).orderBy(desc(scans.createdAt)),
      ])
    : [[], []];
  // Current posture, not historical sum: a target can accumulate several scans (re-runs, plus a
  // separate active + passive scan), and tallying vulns/endpoints across all of them double-counts.
  // scanRows is ordered createdAt DESC, so the first match per target is the latest one.
  //  - activeScanIds: latest vuln/endpoint-producing scan per target (mode active|full). Prefer a
  //    completed one; fall back to the latest such scan (a running re-run is fine as a partial) so a
  //    target mid-rescan still shows data instead of zeroing out.
  //  - passiveScanIds: every passive scan, for the distinct-host subdomain count (a subdomain found in
  //    an older passive scan is still part of the surface; distinct already dedups re-runs).
  const activeByTarget = new Map<string, string>();
  const activeFallbackByTarget = new Map<string, string>();
  const passiveScanIds: string[] = [];
  for (const s of scanRows) {
    if (s.mode === 'passive') {
      passiveScanIds.push(s.id);
      continue;
    }
    // active | full produce vulns + endpoints
    if (!activeFallbackByTarget.has(s.targetId)) activeFallbackByTarget.set(s.targetId, s.id);
    if (s.status === 'completed' && !activeByTarget.has(s.targetId)) activeByTarget.set(s.targetId, s.id);
  }
  const activeScanIds = [...activeFallbackByTarget].map(([tid, fallback]) => activeByTarget.get(tid) ?? fallback);
  // Endpoints are only ever counted on this page; tally server-side instead of hauling every row.
  // Vulnerabilities feed several top-N reductions, so we still pull rows - but only the columns those
  // reductions touch (name/severity/status/scanId/host/url/matchedAt), never the request/response/
  // description blobs that bloat the payload.
  const vulnRows = activeScanIds.length
    ? await db
        .select({
          name: vulnerabilities.name,
          severity: vulnerabilities.severity,
          status: vulnerabilities.status,
          scanId: vulnerabilities.scanId,
          host: vulnerabilities.host,
          url: vulnerabilities.url,
          matchedAt: vulnerabilities.matchedAt,
        })
        .from(vulnerabilities)
        .where(inArray(vulnerabilities.scanId, activeScanIds))
    : [];
  const targetById = new Map(targetRows.map((t) => [t.id, t]));

  // These overview queries are all independent of one another, so fan them out together:
  //  - exposure-finding count + distinct passive-subdomain count (passive recon surfacing)
  //  - URL discovery bucketed per day for the last 14 days + a cheap "any discovered URL ever?" gate
  //  - unified risk score + leaked-credential rows (CTI overview)
  //  - sector/brand news rows for the "needs review" tallies
  const [expCount, passiveSubCount, discoveryByDay, discoveryEverCount, risk, leakRows] = projectId
    ? await Promise.all([
        db.select({ n: count() }).from(exposureFindings).where(eq(exposureFindings.projectId, projectId)),
        passiveScanIds.length
          ? db
              .select({ n: sql<number>`count(distinct ${subdomains.host})` })
              .from(subdomains)
              .where(and(inArray(subdomains.scanId, passiveScanIds), eq(subdomains.source, 'passive')))
          : Promise.resolve([{ n: 0 }]),
        db
          .select({ day: sql<string>`date_trunc('day', ${discoveredUrls.createdAt})`, n: count() })
          .from(discoveredUrls)
          .where(
            and(
              eq(discoveredUrls.projectId, projectId),
              gte(discoveredUrls.createdAt, sql`now() - interval '14 days'`),
            ),
          )
          .groupBy(sql`date_trunc('day', ${discoveredUrls.createdAt})`)
          .orderBy(sql`date_trunc('day', ${discoveredUrls.createdAt})`),
        db.select({ n: count() }).from(discoveredUrls).where(eq(discoveredUrls.projectId, projectId)),
        computeProjectRisk(db, projectId),
        db.select().from(leakcheckData).where(eq(leakcheckData.projectId, projectId)),
      ])
    : ([
        [{ n: 0 }],
        [{ n: 0 }],
        [],
        [{ n: 0 }],
        { score: 0 } as Awaited<ReturnType<typeof computeProjectRisk>>,
        [],
      ] as const);
  const exposureFindingsCount = Number(expCount[0]?.n ?? 0);
  const passiveSubdomains = Number(passiveSubCount[0]?.n ?? 0);

  // Index the per-day counts by local calendar day so we can fill the 14-day window (0 for gaps).
  const discoveryCountByDay = new Map<number, number>();
  for (const row of discoveryByDay) {
    const d = new Date(row.day);
    d.setHours(0, 0, 0, 0);
    discoveryCountByDay.set(d.getTime(), Number(row.n));
  }
  const discoveryDays: { label: string; value: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    discoveryDays.push({
      label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      value: discoveryCountByDay.get(d.getTime()) ?? 0,
    });
  }
  // Gate the discovery card on "project has ever discovered a URL" (matches prior behavior), so a
  // project with only stale (>14d) discoveries still shows its - necessarily flat - chart.
  const discoveryEver = Number(discoveryEverCount[0]?.n ?? 0);

  const leakUnchecked = leakRows.filter((l) => !l.checked).length;

  const leakStatusCounts = leakRows.reduce<Map<string, number>>((m, l) => {
    m.set(l.status, (m.get(l.status) ?? 0) + 1);
    return m;
  }, new Map());
  const leakStatusBreakdown = (Object.keys(LEAK_STATUS_LABEL) as LeakStatusValue[])
    .map((s) => ({ status: s, label: LEAK_STATUS_LABEL[s], count: leakStatusCounts.get(s) ?? 0 }))
    .filter((s) => s.count > 0);

  // VA review-status breakdown: project vulnerabilities grouped by triage status.
  const vulnStatusCounts = vulnRows.reduce<Map<string, number>>((m, v) => {
    m.set(v.status, (m.get(v.status) ?? 0) + 1);
    return m;
  }, new Map());
  const vulnStatusBreakdown = (Object.keys(VULN_STATUS_LABEL) as VulnStatusValue[])
    .map((s) => ({ status: s, label: VULN_STATUS_LABEL[s], count: vulnStatusCounts.get(s) ?? 0 }))
    .filter((s) => s.count > 0);

  const sev = (v: number) => vulnRows.filter((x) => x.severity === v).length;
  const severityCounts: [number, number, number, number, number] = [
    sev(Severity.Critical),
    sev(Severity.High),
    sev(Severity.Medium),
    sev(Severity.Low),
    sev(Severity.Info),
  ];

  // Most common vulnerabilities (by name), top 5.
  const byName = vulnRows.reduce<Map<string, { count: number; severity: number }>>((m, v) => {
    const cur = m.get(v.name) ?? { count: 0, severity: v.severity };
    m.set(v.name, { count: cur.count + 1, severity: Math.max(cur.severity, v.severity) });
    return m;
  }, new Map());
  const mostCommon = [...byName.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 5);

  // Top targets by active findings, top 5.
  const activeSet = new Set<string>(VULN_ACTIVE_STATUSES);
  const scanToTarget = new Map(scanRows.map((s) => [s.id, s.targetId]));
  const byTarget = vulnRows.reduce<Map<string, number>>((m, v) => {
    if (!activeSet.has(v.status)) return m;
    const tid = scanToTarget.get(v.scanId);
    if (!tid) return m;
    m.set(tid, (m.get(tid) ?? 0) + 1);
    return m;
  }, new Map());
  const topTargets = [...byTarget.entries()]
    .map(([tid, count]) => ({ domain: targetById.get(tid)?.domain ?? tid.slice(0, 8), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Top vulnerable subdomains/hosts by active findings, top 8 (VA drill-down below target level).
  const hostOf = (v: (typeof vulnRows)[number]): string => {
    if (v.host?.trim()) return v.host.trim();
    const src = v.url ?? v.matchedAt ?? '';
    try {
      return new URL(src).hostname;
    } catch {
      return src.replace(/^\w+:\/\//, '').split('/')[0] ?? '';
    }
  };
  const byHost = vulnRows.reduce<Map<string, { count: number; severity: number }>>((m, v) => {
    if (!activeSet.has(v.status)) return m;
    const host = hostOf(v);
    if (!host) return m;
    const cur = m.get(host) ?? { count: 0, severity: v.severity };
    m.set(host, { count: cur.count + 1, severity: Math.max(cur.severity, v.severity) });
    return m;
  }, new Map());
  const topHosts = [...byHost.entries()]
    .map(([host, x]) => ({ host, ...x }))
    .sort((a, b) => b.count - a.count || b.severity - a.severity)
    .slice(0, 8);

  const days: { label: string; value: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const next = new Date(d);
    next.setDate(d.getDate() + 1);
    days.push({
      label: d.toLocaleDateString(undefined, { weekday: 'short' }),
      value: scanRows.filter((s) => s.createdAt >= d && s.createdAt < next).length,
    });
  }

  return (
    <>
      <PageHeader
        title={tx(locale, 'Overview', 'Ikhtisar')}
        description={`${tx(locale, 'Signed in as', 'Masuk sebagai')} ${user.email}${user.isSysAdmin ? ' · SysAdmin' : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <ProjectSwitcher projects={projectRows} current={projectId} basePath="/dashboard" />
            <Button asChild>
              <Link href="/scans">{tx(locale, 'New scan', 'Scan baru')}</Link>
            </Button>
          </div>
        }
      />

      {/* Modules */}
      <h2 className="mb-3 mt-8 font-display text-sm font-semibold uppercase tracking-wider text-fg-subtle">
        {tx(locale, 'Modules', 'Modul')}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ModuleCard
          hue="204 90% 50%"
          icon={<RadarIcon />}
          title="Vulnerability Assessment"
          description={tx(
            locale,
            'subfinder · httpx · naabu · nuclei recon pipeline.',
            'Pipeline recon subfinder · httpx · naabu · nuclei.',
          )}
          href="/scans"
          status="live"
        />
        <ModuleCard
          hue="262 70% 62%"
          icon={<ShieldCheck />}
          title="Cyber Threat Intel"
          description={tx(
            locale,
            'OTX, indicators, ransomware feed & unified risk score.',
            'OTX, indikator, feed ransomware & skor risiko terpadu.',
          )}
          href="/threat"
          status="live"
        />
        <ModuleCard
          hue="160 70% 42%"
          icon={<RadarIcon />}
          title="Attack Surface"
          description={tx(
            locale,
            'Passive subdomains, exposure findings & URL discovery.',
            'Subdomain pasif, temuan exposure & penemuan URL.',
          )}
          href="/surface"
          status="live"
        />
        <ModuleCard
          hue="0 84% 60%"
          icon={<KeyRound />}
          title="Leaks"
          description={tx(
            locale,
            'Leaked credentials & breach exposure monitoring.',
            'Pemantauan kredensial bocor & paparan kebocoran.',
          )}
          href="/leaks"
          status="live"
        />
      </div>

      {/* First-run onboarding: guide the next step until the user has data. */}
      {targetRows.length === 0 || scanRows.length === 0 ? (
        <Card className="mb-6 border-accent/40 bg-accent/5">
          <CardHeader>
            <CardTitle>{tx(locale, 'Get started', 'Mulai')}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ol className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold">
                  1
                </span>
                <span className={targetRows.length ? 'text-fg-subtle line-through' : ''}>
                  {tx(locale, 'Create a project', 'Buat proyek')}
                </span>
                {targetRows.length === 0 ? (
                  <Link href="/settings/projects" className="text-accent hover:underline">
                    → {tx(locale, 'Projects', 'Proyek')}
                  </Link>
                ) : null}
              </li>
              <li className="flex items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold">
                  2
                </span>
                <span className={targetRows.length ? 'text-fg-subtle line-through' : ''}>
                  {tx(locale, 'Add a target', 'Tambah target')}
                </span>
                {targetRows.length === 0 ? (
                  <Link href="/targets" className="text-accent hover:underline">
                    → {tx(locale, 'Targets', 'Target')}
                  </Link>
                ) : null}
              </li>
              <li className="flex items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold">
                  3
                </span>
                <span className={scanRows.length ? 'text-fg-subtle line-through' : ''}>
                  {tx(locale, 'Run your first scan', 'Jalankan scan pertama Anda')}
                </span>
                {targetRows.length > 0 && scanRows.length === 0 ? (
                  <Link href="/scans" className="text-accent hover:underline">
                    → {tx(locale, 'Scans', 'Scan')}
                  </Link>
                ) : null}
              </li>
              <li className="flex items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold">
                  4
                </span>
                <span className="text-fg-muted">
                  {tx(locale, 'Generate a report from the scan detail', 'Buat laporan dari detail scan')}
                </span>
              </li>
            </ol>
          </CardContent>
        </Card>
      ) : null}

      {/* ===================== Vulnerability Assessment ===================== */}
      <SectionHeader
        title="Vulnerability Assessment"
        subtitle={tx(
          locale,
          'Findings, scan trend & triage for this project.',
          'Temuan, tren scan & triase untuk proyek ini.',
        )}
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href={projectId ? `/scans?project=${projectId}` : '/scans'}>
              {tx(locale, 'Open VA →', 'Buka VA →')}
            </Link>
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>{tx(locale, 'Severity breakdown', 'Rincian severity')}</CardTitle>
          </CardHeader>
          <CardContent>
            <SeverityDonut counts={severityCounts} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{tx(locale, 'Scans · last 7 days', 'Scan · 7 hari terakhir')}</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendArea data={days} />
          </CardContent>
        </Card>
      </div>

      {/* Recent scans - VA data, so it lives inside the VA section right after the charts. */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{tx(locale, 'Recent scans', 'Scan terbaru')}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {scanRows.length === 0 ? (
            <p className="py-2 text-sm text-fg-muted">
              {tx(locale, 'No scans yet.', 'Belum ada scan.')}{' '}
              <Link href="/targets" className="text-accent hover:underline">
                {tx(locale, 'Add a target', 'Tambah target')}
              </Link>{' '}
              {tx(locale, 'to begin.', 'untuk memulai.')}
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{tx(locale, 'Target', 'Target')}</TH>
                  <TH>{tx(locale, 'Status', 'Status')}</TH>
                  <TH>{tx(locale, 'Findings', 'Temuan')}</TH>
                </TR>
              </THead>
              <TBody>
                {scanRows.slice(0, 6).map((s) => {
                  const c = (s.counts ?? {}) as Record<string, number>;
                  return (
                    <TR key={s.id}>
                      <TD>
                        <Link href={`/scans/${s.id}`} className="font-mono text-sm text-accent hover:underline">
                          {targetById.get(s.targetId)?.domain ?? s.targetId.slice(0, 8)}
                        </Link>
                      </TD>
                      <TD>
                        <StatusPill status={s.status} />
                      </TD>
                      <TD className="tabular text-sm text-fg-muted">
                        {c.endpoints ?? 0} {tx(locale, 'endpoints', 'endpoint')} · {c.ports ?? 0}{' '}
                        {tx(locale, 'ports', 'port')} · {c.vulnerabilities ?? 0} {tx(locale, 'vulns', 'vuln')}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* VA review status - triage breakdown of this project's findings. */}
      {vulnRows.length > 0 ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>{tx(locale, 'VA review status', 'Status review VA')}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {vulnStatusBreakdown.map((s) => (
                <Badge
                  key={s.status}
                  variant={
                    s.status === 'open' || s.status === 'reopened'
                      ? 'danger'
                      : s.status === 'in_progress'
                        ? 'accent'
                        : s.status === 'resolved'
                          ? 'success'
                          : 'neutral'
                  }
                >
                  {s.label} · {s.count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Top vulnerable hosts + most common findings (VA drill-downs). */}
      {vulnRows.length > 0 ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{tx(locale, 'Top vulnerable subdomains', 'Subdomain paling rentan')}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {topHosts.length ? (
                <Table>
                  <THead>
                    <TR>
                      <TH>{tx(locale, 'Subdomain / host', 'Subdomain / host')}</TH>
                      <TH>{tx(locale, 'Top severity', 'Severity tertinggi')}</TH>
                      <TH className="text-right">{tx(locale, 'Active findings', 'Temuan aktif')}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {topHosts.map((h) => (
                      <TR key={h.host}>
                        <TD className="font-mono text-sm">{h.host}</TD>
                        <TD>
                          <SeverityBadge severity={h.severity as SeverityValue} />
                        </TD>
                        <TD>
                          <CountBar value={h.count} max={topHosts[0]?.count ?? 1} />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <p className="py-4 text-sm text-fg-muted">
                  {tx(locale, 'No active findings.', 'Tidak ada temuan aktif.')}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{tx(locale, 'Most common vulnerabilities', 'Vulnerability paling umum')}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Table>
                <THead>
                  <TR>
                    <TH>{tx(locale, 'Finding', 'Temuan')}</TH>
                    <TH>Severity</TH>
                    <TH className="text-right">{tx(locale, 'Count', 'Jumlah')}</TH>
                  </TR>
                </THead>
                <TBody>
                  {mostCommon.map(([name, info]) => (
                    <TR key={name}>
                      <TD className="font-medium">{name}</TD>
                      <TD>
                        <SeverityBadge severity={info.severity as SeverityValue} />
                      </TD>
                      <TD>
                        <CountBar value={info.count} max={mostCommon[0]?.[1].count ?? 1} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                {tx(locale, 'Top targets by active findings', 'Target teratas berdasarkan temuan aktif')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {topTargets.length ? (
                <Table>
                  <THead>
                    <TR>
                      <TH>{tx(locale, 'Target', 'Target')}</TH>
                      <TH className="text-right">{tx(locale, 'Active findings', 'Temuan aktif')}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {topTargets.map((t) => (
                      <TR key={t.domain}>
                        <TD className="font-mono text-sm">{t.domain}</TD>
                        <TD>
                          <CountBar value={t.count} max={topTargets[0]?.count ?? 1} />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <p className="py-4 text-sm text-fg-muted">
                  {tx(locale, 'No active findings.', 'Tidak ada temuan aktif.')}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* ===================== Cyber Threat Intel ===================== */}
      <SectionHeader
        title="Cyber Threat Intel"
        subtitle={tx(locale, 'Unified risk score & ransomware highlight.', 'Skor risiko terpadu & sorotan ransomware.')}
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href={projectId ? `/threat?project=${projectId}` : '/threat'}>
              {tx(locale, 'Open CTI →', 'Buka CTI →')}
            </Link>
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{tx(locale, 'Unified risk score', 'Skor risiko terpadu')}</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center py-4">
            <RiskGauge score={risk.score} />
          </CardContent>
        </Card>
        <div className="grid content-start gap-4">
          <div className="grid grid-cols-2 gap-4">
            <StatCard label={tx(locale, 'Risk score', 'Skor risiko')} value={risk.score} icon={<Gauge />} />
            <StatCard label={tx(locale, 'Targets', 'Target')} value={targetRows.length} icon={<Crosshair />} />
          </div>
        </div>
      </div>
      {/* Ransomware highlight does a (cached) network fetch - stream it so it never blocks the dashboard. */}
      <div className="mt-4">
        <Suspense fallback={<RansomwareHighlightFallback locale={locale} />}>
          <RansomwareHighlight locale={locale} />
        </Suspense>
      </div>

      {/* ===================== Attack Surface ===================== */}
      <SectionHeader
        title="Attack Surface"
        subtitle={tx(
          locale,
          'Passive subdomains, exposure findings & URL discovery.',
          'Subdomain pasif, temuan exposure & penemuan URL.',
        )}
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/surface">{tx(locale, 'Open Surface →', 'Buka Surface →')}</Link>
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-2">
        <Link href="/surface">
          <StatCard label="Passive subdomains" value={passiveSubdomains} icon={<RadarIcon />} />
        </Link>
        <Link href="/surface">
          <StatCard
            label={tx(locale, 'Exposure findings', 'Temuan exposure')}
            value={exposureFindingsCount}
            icon={<KeyRound />}
          />
        </Link>
      </div>
      {discoveryEver > 0 ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>
              {tx(locale, 'URL discovery · last 14 days (passive)', 'Penemuan URL · 14 hari terakhir (pasif)')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TrendArea data={discoveryDays} />
          </CardContent>
        </Card>
      ) : null}

      {/* ===================== Leaks ===================== */}
      <SectionHeader
        title="Leaks"
        subtitle={tx(
          locale,
          'Leaked credentials & breach exposure - triage and monitor.',
          'Kredensial bocor & paparan kebocoran - triase dan pantau.',
        )}
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/leaks">{tx(locale, 'Open Leaks →', 'Buka Leaks →')}</Link>
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Link href="/leaks">
          <StatCard
            label={tx(locale, 'Leaked creds', 'Kredensial bocor')}
            value={leakRows.length}
            icon={<KeyRound />}
            hint={`${leakUnchecked} ${tx(locale, 'unchecked', 'belum diperiksa')}`}
          />
        </Link>
        <div className="grid content-start gap-4">
          {leakStatusBreakdown.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{tx(locale, 'Leak triage status', 'Status triase kebocoran')}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-2">
                  {leakStatusBreakdown.map((s) => (
                    <Badge
                      key={s.status}
                      variant={
                        s.status === 'new'
                          ? 'danger'
                          : s.status === 'investigating' || s.status === 'confirmed'
                            ? 'accent'
                            : s.status === 'remediated'
                              ? 'success'
                              : 'neutral'
                      }
                    >
                      {s.label} · {s.count}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <p className="py-2 text-sm text-fg-muted">
              {tx(locale, 'No leaks to triage yet.', 'Belum ada kebocoran untuk ditriase.')}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
