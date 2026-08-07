import { eq } from 'drizzle-orm';
import {
  renderVaReport,
  renderPdf,
  DEFAULT_VA_SETTINGS,
  type Lang,
  type ReportSettings,
  type Signatory,
} from '@vacti/reports';
import {
  scans,
  targets,
  endpoints,
  vulnerabilities,
  subdomains,
  ports as portsTable,
  reportSettings,
  reportSignatories,
} from '@vacti/db';
import { fetchKev, fetchEpss } from '@vacti/threat-intel';
import { getDb } from '../../../../lib/db';
import { getCurrentUser } from '../../../../lib/session';
import { requireScanMember } from '../../../../lib/tenancy';

// Cache KEV/EPSS in Next's data cache (hourly) so the ~1MB KEV catalog isn't refetched per report.
const cachedFetch = ((u: string) => fetch(u, { next: { revalidate: 3600 } })) as typeof fetch;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ scanId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { scanId } = await ctx.params;
  // Tenancy: only a member of the scan's owning project (or SysAdmin) may render this VA report.
  await requireScanMember(user, scanId);
  const url = new URL(req.url);
  const langParam = url.searchParams.get('lang');
  const t = url.searchParams.get('type');
  const type = t === 'recon' || t === 'vuln' ? t : 'full';
  const db = getDb();

  const [scan] = await db.select().from(scans).where(eq(scans.id, scanId));
  if (!scan) return new Response('Not found', { status: 404 });
  const [target] = await db.select().from(targets).where(eq(targets.id, scan.targetId));
  const [eps, vulns, subs, prt, settingRows, signRows] = await Promise.all([
    db.select().from(endpoints).where(eq(endpoints.scanId, scanId)),
    db.select().from(vulnerabilities).where(eq(vulnerabilities.scanId, scanId)),
    db.select().from(subdomains).where(eq(subdomains.scanId, scanId)),
    db.select().from(portsTable).where(eq(portsTable.scanId, scanId)),
    db.select().from(reportSettings).where(eq(reportSettings.projectId, scan.projectId)),
    db.select().from(reportSignatories).where(eq(reportSignatories.projectId, scan.projectId)),
  ]);

  const settingRow = settingRows.find((s) => s.kind === 'va');
  const settings: ReportSettings = settingRow
    ? { ...DEFAULT_VA_SETTINGS, ...stripNulls(settingRow) }
    : DEFAULT_VA_SETTINGS;
  // Explicit ?lang wins; otherwise fall back to the saved report language.
  const lang = (langParam === 'id' || langParam === 'en' ? langParam : (settingRow?.language ?? 'en')) as Lang;
  const signatories: Signatory[] = signRows
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => ({
      role: s.role as Signatory['role'],
      name: s.name,
      position: s.position,
      signatureImage: s.signatureImage,
    }));

  // Threat-intel enrichment: flag finding CVEs that are actively exploited (CISA KEV) + EPSS scores.
  const cves = [...new Set(vulns.flatMap((v) => v.cveIds ?? []).map((c) => c.toUpperCase()))];
  const [kev, epss] = await Promise.all([
    cves.length ? fetchKev({ fetchImpl: cachedFetch }) : Promise.resolve(new Map()),
    cves.length ? fetchEpss(cves, { fetchImpl: cachedFetch }) : Promise.resolve(new Map()),
  ]);
  const kevCves = cves.filter((c) => kev.has(c));
  const kevRansomwareCves = kevCves.filter((c) => kev.get(c)?.ransomware);
  const epssObj: Record<string, number> = {};
  for (const c of cves) {
    const s = epss.get(c);
    if (s) epssObj[c] = s.epss;
  }

  const html = renderVaReport({
    kevCves,
    kevRansomwareCves,
    epss: epssObj,
    lang,
    type,
    settings,
    signatories,
    target: { domain: target?.domain ?? scan.targetId },
    scan: { status: scan.status, startedAt: scan.startedAt, finishedAt: scan.finishedAt },
    counts: { subdomains: subs.length, endpoints: eps.length, ports: prt.length },
    endpoints: eps.map((e) => ({
      url: e.url,
      statusCode: e.statusCode,
      title: e.title,
      tech: e.tech,
      isWordpress: e.isWordpress === 1,
    })),
    ports: prt.map((p) => ({ ip: p.ip, port: p.port })),
    subdomains: subs.map((sd) => sd.host),
    vulns: vulns.map((v) => ({
      name: v.name,
      severity: v.severity,
      status: v.status,
      matchedAt: v.matchedAt,
      url: v.url,
      type: v.type,
      isAiEnriched: v.isAiEnriched,
      aiDescription: v.aiDescription,
      aiImpact: v.aiImpact,
      aiRemediation: v.aiRemediation,
      cvss: v.cvss,
      cveIds: v.cveIds,
      references: v.references,
      description: v.description,
      remediation: v.remediation,
      request: v.request,
      response: v.response,
    })),
  });
  const pdf = await renderPdf(html, { footer: settings.classification ?? settings.footerText ?? '' });
  const name = `va_report_${(target?.domain ?? 'scan').replace(/\./g, '_')}_${type}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${name}"` },
  });
}

function stripNulls<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>;
}
