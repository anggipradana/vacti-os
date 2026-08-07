import { reportCss, escapeHtml, SEV_HEX } from './styles';
import { labels, bi, biText, pri, sec } from './i18n';
import {
  cover,
  backCover,
  approvalCards,
  doc,
  section,
  numberedSection,
  miniHead,
  kv,
  note,
  statRow,
  sevBarLegend,
  donut,
  barChart,
  subdomainTable,
  vulnSummaryTable,
  findingCard,
  classificationNote,
  tocList,
} from './shared';
import { VULN_STATUS_LABEL, VULN_ACTIVE_STATUSES, type VulnStatusValue } from '@vacti/core';
import type { VaReportData } from './types';

const activeSet = new Set<string>(VULN_ACTIVE_STATUSES);

function hostOf(u: string): string {
  try {
    return new URL(u).host || u;
  } catch {
    return u.replace(/^[a-z]+:\/\//i, '').split('/')[0] ?? u;
  }
}

type Lang = 'en' | 'id';
type Counts = { crit: number; high: number; med: number; low: number; info: number };

/**
 * Finding-driven general recommendations (the fallback when no AI-generated set is supplied).
 * Reads severity counts + finding name/type patterns and emits prioritised, actionable guidance.
 */
function generalRecommendations(vulns: VaReportData['vulns'], counts: Counts, active: number, lang: Lang): string[] {
  const id = lang === 'id';
  const hay = vulns.map((v) => `${v.name} ${v.type ?? ''}`.toLowerCase()).join(' | ');
  const has = (re: RegExp) => re.test(hay);
  const recs: string[] = [];
  const ch = counts.crit + counts.high;
  if (ch > 0)
    recs.push(
      id
        ? `Prioritaskan remediasi ${ch} temuan tingkat Kritis/Tinggi terlebih dahulu dengan SLA terikat.`
        : `Prioritise remediation of the ${ch} Critical/High findings first, under a bound SLA.`,
    );
  if (has(/tls|ssl|cipher|deprecated/))
    recs.push(
      id
        ? 'Perketat konfigurasi TLS: nonaktifkan protokol & cipher usang (TLS 1.0/1.1, cipher lemah), aktifkan TLS 1.2/1.3.'
        : 'Harden TLS: disable deprecated protocols & weak ciphers (TLS 1.0/1.1), enable TLS 1.2/1.3 only.',
    );
  if (has(/header|hsts|csp|x-frame|content-security|x-content-type/))
    recs.push(
      id
        ? 'Terapkan header keamanan: HSTS, Content-Security-Policy, X-Frame-Options, X-Content-Type-Options.'
        : 'Apply security headers: HSTS, Content-Security-Policy, X-Frame-Options, X-Content-Type-Options.',
    );
  if (has(/cookie|samesite/))
    recs.push(
      id
        ? 'Set atribut cookie: SameSite=Strict/Lax, Secure, dan HttpOnly pada cookie sesi.'
        : 'Set cookie attributes: SameSite=Strict/Lax, Secure, and HttpOnly on session cookies.',
    );
  if (has(/swagger|api|exposed|exposure|directory|listing/))
    recs.push(
      id
        ? 'Batasi akses ke dokumentasi/endpoint API & path internal yang terekspos publik.'
        : 'Restrict public access to exposed API docs/endpoints and internal paths.',
    );
  if (has(/spf|dmarc|dkim|dns|mail/))
    recs.push(
      id
        ? 'Perkuat email/DNS: terapkan SPF, DKIM, dan DMARC (kebijakan reject/quarantine).'
        : 'Strengthen email/DNS posture: enforce SPF, DKIM, and DMARC (reject/quarantine policy).',
    );
  if (has(/wordpress|cms|plugin/))
    recs.push(
      id
        ? 'Perbarui core CMS & seluruh plugin ke versi stabil terbaru; aktifkan pembaruan otomatis.'
        : 'Update the CMS core & all plugins to the latest stable release; enable auto-updates.',
    );
  // Always-on closers.
  recs.push(
    id
      ? `Verifikasi setiap remediasi dan pantau ${active} temuan aktif hingga tertutup.`
      : `Verify each remediation and track the ${active} active findings to closure.`,
  );
  recs.push(
    id
      ? 'Jadwalkan pemindaian berkala (scheduled scan) & pemantauan threat-intelligence berkelanjutan.'
      : 'Schedule recurring scans and maintain continuous threat-intelligence monitoring.',
  );
  return recs.slice(0, 7);
}

export function renderVaReport(d: VaReportData): string {
  const l = labels(d.lang);
  const s = d.settings;
  const lang = d.lang;
  const company = s.companyName ?? 'the organisation';
  const css = reportCss(s.primaryColor, s.secondaryColor, s.footerText ?? '', s.classification ?? '');
  const showRecon = d.type !== 'vuln';
  const showVuln = d.type !== 'recon';

  // Severity counts.
  const sevCount = (sv: number) => d.vulns.filter((v) => v.severity === sv).length;
  const counts = { crit: sevCount(4), high: sevCount(3), med: sevCount(2), low: sevCount(1), info: sevCount(0) };
  const total = d.vulns.length;
  const active = d.vulns.filter((v) => activeSet.has(v.status)).length;

  // Subdomain inventory: join discovered subdomains with live endpoint HTTP status.
  const hostStatus = new Map<string, number | null>();
  for (const e of d.endpoints) {
    const h = hostOf(e.url);
    const cur = hostStatus.get(h);
    if (cur == null || (e.statusCode != null && cur == null)) hostStatus.set(h, e.statusCode ?? cur ?? null);
  }
  const subHosts = d.subdomains.length ? d.subdomains : [...hostStatus.keys()];
  const subRows = subHosts
    .map((h) => ({ host: h, status: hostStatus.has(h) ? (hostStatus.get(h) ?? null) : null }))
    .sort((a, b) => a.host.localeCompare(b.host));

  // Aggregate vulnerabilities by name.
  type Vuln = VaReportData['vulns'][number];
  const byName = new Map<
    string,
    {
      name: string;
      count: number;
      severity: number;
      type?: string | null;
      urls: Set<string>;
      statuses: Set<string>;
      cves: Set<string>;
      refs: Set<string>;
      cvss?: number | null;
      ai?: Vuln;
      tpl?: Vuln;
      evidence?: Vuln;
    }
  >();
  for (const v of d.vulns) {
    const g = byName.get(v.name) ?? {
      name: v.name,
      count: 0,
      severity: v.severity,
      type: v.type,
      urls: new Set<string>(),
      statuses: new Set<string>(),
      cves: new Set<string>(),
      refs: new Set<string>(),
    };
    g.count += 1;
    g.severity = Math.max(g.severity, v.severity);
    if (v.url ?? v.matchedAt) g.urls.add(hostOf(v.url ?? v.matchedAt!));
    g.statuses.add(v.status);
    for (const c of v.cveIds ?? []) g.cves.add(c);
    for (const r of v.references ?? []) g.refs.add(r);
    if (v.cvss != null) g.cvss = Math.max(g.cvss ?? 0, v.cvss);
    if (!g.ai && (v.aiDescription || v.aiImpact || v.aiRemediation)) g.ai = v;
    if (!g.tpl && (v.description || v.remediation)) g.tpl = v;
    if (!g.evidence && (v.request || v.response)) g.evidence = v;
    byName.set(v.name, g);
  }
  const grouped = [...byName.values()].sort((a, b) => b.severity - a.severity || b.count - a.count);

  // ---- Cover ----
  const body: string[] = [];
  body.push(
    cover({
      kicker: biText(lang, pri(lang, 'securityAssessment'), sec(lang, 'securityAssessment')),
      title: l.vaTitle,
      target: d.target.domain,
      settings: s,
      meta: {
        [l.reportDate]: new Date().toISOString().slice(0, 10),
        [l.status]: d.scan.status,
        [l.findingsWord]: String(total),
      },
    }),
  );

  // ---- Approval + document classification ----
  body.push(
    section('', pri(lang, 'approvalSheet'), bi(lang, 'approvalSheet')),
    approvalCards(d.signatories, lang),
    miniHead(pri(lang, 'documentClassification'), sec(lang, 'documentClassification')),
    classificationNote(lang, company),
    kv([
      [l.project, d.target.domain],
      [l.status, d.scan.status],
      ['Started', d.scan.startedAt ? new Date(d.scan.startedAt).toISOString().slice(0, 19).replace('T', ' ') : '-'],
      ['Finished', d.scan.finishedAt ? new Date(d.scan.finishedAt).toISOString().slice(0, 19).replace('T', ' ') : '-'],
    ]),
  );

  // ---- Table of contents (page numbers omitted: flowing layout) ----
  const toc: { num: string; primary: string; secondary: string; page: string }[] = [];
  const tnum = (n: number) => String(n).padStart(2, '0');
  let n = 0;
  toc.push({
    num: tnum(++n),
    primary: pri(lang, 'executiveSummary'),
    secondary: sec(lang, 'executiveSummary'),
    page: '',
  });
  if (showVuln)
    toc.push({
      num: tnum(++n),
      primary: pri(lang, 'generalRecommendations'),
      secondary: sec(lang, 'generalRecommendations'),
      page: '',
    });
  if (showVuln)
    toc.push({
      num: tnum(++n),
      primary: pri(lang, 'findingsOverview'),
      secondary: sec(lang, 'findingsOverview'),
      page: '',
    });
  if (showRecon)
    toc.push({
      num: tnum(++n),
      primary: pri(lang, 'subdomainInventory'),
      secondary: sec(lang, 'subdomainInventory'),
      page: '',
    });
  if (showVuln) {
    toc.push({
      num: tnum(++n),
      primary: pri(lang, 'vulnerabilitySummary'),
      secondary: sec(lang, 'vulnerabilitySummary'),
      page: '',
    });
    toc.push({
      num: tnum(++n),
      primary: pri(lang, 'identifiedVulnerabilities'),
      secondary: sec(lang, 'identifiedVulnerabilities'),
      page: '',
    });
  }
  body.push(section('', pri(lang, 'tableOfContents'), bi(lang, 'tableOfContents'), { pageBreak: true }), tocList(toc));

  // Section counter for body headings, mirroring the TOC.
  let sn = 0;
  const next = () => tnum(++sn);

  // ---- 01 Executive summary ----
  // Analyst-authored summary (with {placeholders}) overrides the auto-generated one when enabled.
  const customText = lang === 'id' ? (s.executiveSummaryId ?? s.executiveSummary) : s.executiveSummary;
  const placeholders: Record<string, string | number> = {
    scan_date: new Date().toISOString().slice(0, 10),
    company_name: company,
    target_name: d.target.domain,
    subdomain_count: subRows.length,
    endpoint_count: d.counts.endpoints,
    port_count: d.counts.ports,
    vulnerability_count: total,
    critical_count: counts.crit,
    high_count: counts.high,
    medium_count: counts.med,
    low_count: counts.low,
    info_count: counts.info,
    active_count: active,
  };
  const fill = (tpl: string) =>
    escapeHtml(tpl.replace(/\{(\w+)\}/g, (m, k) => String(placeholders[k] ?? m))).replace(/\n/g, '<br>');
  const autoSummary =
    lang === 'id'
      ? `Penilaian keamanan terhadap ${d.target.domain} (scan ${d.scan.status}) menemukan ${subRows.length} subdomain, ${d.counts.endpoints} endpoint aktif, ${d.counts.ports} port terbuka, dan ${total} kerentanan (${active} masih aktif).`
      : `Security assessment of ${d.target.domain} (scan ${d.scan.status}) discovered ${subRows.length} subdomains, ${d.counts.endpoints} live endpoints, ${d.counts.ports} open ports and ${total} vulnerabilities (${active} still active).`;
  const summaryHtml = s.showExecutiveSummary && customText?.trim() ? fill(customText) : escapeHtml(autoSummary);
  body.push(
    numberedSection(lang, next(), pri(lang, 'executiveSummary'), { pageBreak: true }),
    miniHead(pri(lang, 'aboutAssessment'), sec(lang, 'aboutAssessment')),
    note(summaryHtml),
    statRow([
      {
        value: subRows.length,
        primary: pri(lang, 'subdomainsDiscovered'),
        secondary: sec(lang, 'subdomainsDiscovered'),
      },
      { value: total, primary: pri(lang, 'totalVulnerabilities'), secondary: sec(lang, 'totalVulnerabilities') },
      { value: byName.size, primary: pri(lang, 'vulnerabilityTypes'), secondary: sec(lang, 'vulnerabilityTypes') },
      { value: active, primary: pri(lang, 'activeFindings'), secondary: sec(lang, 'activeFindings') },
    ]),
  );

  // ---- General recommendations (AI override, else a finding-driven fallback) ----
  if (showVuln) {
    const aiRec = lang === 'id' ? (s.aiRecommendationsId ?? s.aiRecommendations) : s.aiRecommendations;
    const recItems = aiRec?.trim()
      ? aiRec
          .split('\n')
          .map((x) => x.replace(/^[-*•\d.\s]+/, '').trim())
          .filter(Boolean)
      : generalRecommendations(d.vulns, counts, active, lang);
    body.push(
      numberedSection(lang, next(), pri(lang, 'generalRecommendations')),
      `<ul>${recItems.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>`,
    );
  }

  // ---- Findings overview (donut + bars) ----
  if (showVuln) {
    const sevRows = [
      { label: l.critical, value: counts.crit, color: SEV_HEX[4] },
      { label: l.high, value: counts.high, color: SEV_HEX[3] },
      { label: l.medium, value: counts.med, color: SEV_HEX[2] },
      { label: l.low, value: counts.low, color: SEV_HEX[1] },
      { label: l.info, value: counts.info, color: SEV_HEX[0] },
    ].filter((r) => r.value > 0);
    const typeMap = new Map<string, { count: number; severity: number }>();
    for (const v of d.vulns) {
      const t = v.type ?? 'other';
      const cur = typeMap.get(t) ?? { count: 0, severity: 0 };
      typeMap.set(t, { count: cur.count + 1, severity: Math.max(cur.severity, v.severity) });
    }
    const typeRows = [...typeMap.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([t, info]) => ({ label: t, value: info.count, color: SEV_HEX[Math.max(0, Math.min(4, info.severity))] }));

    body.push(
      numberedSection(lang, next(), pri(lang, 'findingsOverview'), { pageBreak: true }),
      miniHead(pri(lang, 'severityDistribution'), sec(lang, 'severityDistribution')),
      donut(counts, lang),
      sevBarLegend(counts, lang),
      miniHead(`${pri(lang, 'vulnerabilities')} ${pri(lang, 'bySeverity')}`, sec(lang, 'bySeverity')),
      sevRows.length ? barChart(sevRows) : `<div class="empty">${escapeHtml(l.none)}</div>`,
      miniHead(`${pri(lang, 'vulnerabilities')} ${pri(lang, 'byType')}`, sec(lang, 'byType')),
      typeRows.length ? barChart(typeRows) : `<div class="empty">${escapeHtml(l.none)}</div>`,
    );
  }

  // ---- 03 Subdomain inventory ----
  if (showRecon) {
    const buckets = [
      { key: '2xx', label: '2xx OK', color: '#1a7f43' },
      { key: '3xx', label: '3xx', color: '#1a56c4' },
      { key: '4xx', label: '4xx', color: SEV_HEX[3] },
      { key: '5xx', label: '5xx', color: SEV_HEX[4] },
      { key: 'none', label: l.noResponse, color: '#7a8e96' },
    ];
    const bucketOf = (st: number | null) =>
      st == null ? 'none' : st >= 500 ? '5xx' : st >= 400 ? '4xx' : st >= 300 ? '3xx' : '2xx';
    const statusCounts = subRows.reduce<Record<string, number>>(
      (a, r) => ((a[bucketOf(r.status)] = (a[bucketOf(r.status)] ?? 0) + 1), a),
      {},
    );
    const statusRows = buckets
      .map((b) => ({ label: b.label, value: statusCounts[b.key] ?? 0, color: b.color }))
      .filter((r) => r.value > 0);
    body.push(
      numberedSection(lang, next(), pri(lang, 'subdomainInventory'), { pageBreak: true }),
      miniHead(`${pri(lang, 'subdomain')} ${pri(lang, 'byHttpStatus')}`, sec(lang, 'byHttpStatus')),
      statusRows.length ? barChart(statusRows) : `<div class="empty">${escapeHtml(l.none)}</div>`,
      miniHead(pri(lang, 'subdomainInventory'), sec(lang, 'subdomainInventory')),
      subdomainTable(subRows, lang),
    );
  }

  // ---- 04 Vulnerability summary (by name) ----
  if (showVuln) {
    body.push(
      numberedSection(lang, next(), pri(lang, 'vulnerabilitySummary'), { pageBreak: true }),
      vulnSummaryTable(
        grouped.map((g) => ({ name: g.name, count: g.count, severity: g.severity })),
        lang,
      ),
    );
  }

  // ---- 05 Identified vulnerabilities (finding cards) ----
  if (showVuln) {
    body.push(numberedSection(lang, next(), pri(lang, 'identifiedVulnerabilities'), { pageBreak: true }));
    if (!grouped.length) {
      body.push(`<div class="empty">No vulnerabilities identified.</div>`);
    } else {
      const kevSet = new Set((d.kevCves ?? []).map((c) => c.toUpperCase()));
      const ransomSet = new Set((d.kevRansomwareCves ?? []).map((c) => c.toUpperCase()));
      const epssMap = d.epss ?? {};
      grouped.forEach((g, i) => {
        const statuses = [...g.statuses].map((st) => VULN_STATUS_LABEL[st as VulnStatusValue] ?? st);
        // Prefer AI-enriched prose, fall back to the nuclei template's own text.
        const description = g.ai?.aiDescription ?? g.tpl?.description ?? '';
        const impact = g.ai?.aiImpact ?? '';
        const remediation = g.ai?.aiRemediation ?? g.tpl?.remediation ?? '';
        // Threat-intel context: flag CVEs that are actively exploited (CISA KEV), ransomware-linked,
        // and their EPSS exploit probability, so the reader can prioritise beyond raw severity.
        const gCves = [...g.cves].map((c) => c.toUpperCase());
        const isKev = gCves.some((c) => kevSet.has(c));
        const isRansom = gCves.some((c) => ransomSet.has(c));
        const maxEpss = gCves.reduce((m, c) => Math.max(m, epssMap[c] ?? 0), 0);
        const intelTags = [
          ...(isKev ? ['KEV: Actively Exploited'] : []),
          ...(isRansom ? ['Ransomware'] : []),
          ...(maxEpss > 0 ? [`EPSS ${(maxEpss * 100).toFixed(0)}%`] : []),
        ];
        body.push(
          findingCard({
            index: i + 1,
            severity: g.severity,
            lang,
            title: g.name,
            tags: [`${g.count}×`, ...intelTags, ...(g.type ? [g.type] : []), ...statuses.slice(0, 2)],
            cvss: g.cvss,
            cves: [...g.cves],
            references: [...g.refs],
            blocks: [
              { label: bi(lang, 'description'), text: description },
              { label: bi(lang, 'impact'), text: impact },
              { label: bi(lang, 'remediation'), text: remediation },
            ],
            urls: [...g.urls],
            request: g.evidence?.request ?? null,
            response: g.evidence?.response ?? null,
          }),
        );
      });
    }
  }

  body.push(`<div class="end">${escapeHtml(l.endOfReport)}</div>`);
  body.push(backCover({ settings: s, title: l.vaTitle, endText: l.endOfReport }));
  return doc(l.vaTitle, css, body.join('\n'));
}
