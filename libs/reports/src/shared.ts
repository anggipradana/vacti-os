import { escapeHtml, SEV_KEYS, SEV_HEX } from './styles';
import { labels, bi, biText, pri, sec, type Lang } from './i18n';
import type { ReportSettings, Signatory } from './types';

const SEV_VAR = ['--sev-info', '--sev-low', '--sev-medium', '--sev-high', '--sev-critical'];

/**
 * Whether an evidence item should be SHOWN for a finding. XSS screenshots used to be hidden unless their
 * evidence_key was `auto-*` (an old guard against fabricated "alert" posters), but that ALSO hid the
 * legitimate QA'd PoC captures (xss-*-poc-oracle-fired, baseline, persistence), so the operator saw NO XSS
 * screenshot at all. They now pass: the Screenshot-QA caption in the evidence popup flags any suspect
 * capture in red ("NEEDS REVIEW") instead of silently dropping the whole set.
 */
export function showEvidence(_findingClass: string | null | undefined, kind: string, evidenceKey: string): boolean {
  const k = (evidenceKey ?? '').toLowerCase();
  // The internal QA critique (auto-qa / scan_output) is never an operator/report exhibit.
  if (k.startsWith('auto-qa-') || (kind === 'scan_output' && k.includes('qa'))) return false;
  // The deterministic-capture placeholder context note ("this class has no deterministic PoC...") proves
  // nothing; the proof is the req/resp exploit images + the captured exhibits.
  if (k.startsWith('auto-context-')) return false;
  // The deterministic `auto-loc` page-load screenshot navigates UNauthenticated, so authenticated-endpoint
  // findings (IDOR, account pages) capture the LOGIN WALL instead of the exploit - it never matches the
  // finding. The req/resp exploit images + the captured authenticated screenshots are the real proof.
  if (k.startsWith('auto-loc')) return false;
  return true;
}

/**
 * Display priority so the EXPLOIT proof leads and generic page-loads trail (lower = earlier). Fixes the
 * "belum urut" problem where evidence sorted by capture time buried the re-rendered req/resp images last.
 * Order: combined req/resp image -> request image -> response image -> captured exploit exhibit -> other
 * captured screenshots -> generic affected-page screenshot -> raw req/resp text + command output.
 */
export function evidenceRank(kind: string, evidenceKey: string): number {
  const k = (evidenceKey ?? '').toLowerCase();
  if (kind === 'screenshot') {
    // The IDOR/BAC 2-account comparison exhibits ARE the proof - lead with them.
    if (/idor-compare|compare-shots|compare-reqres/.test(k)) return 0;
    // The captured authenticated exploit/PoC screenshots (named by the exploit/step, NOT a deterministic
    // auto-* capture or a req/resp pane) are the real visual proof the operator wants to SEE - rank them ABOVE
    // the styled req/resp panes (which read as "fabricated" boxes and are only supporting evidence).
    if (!k.startsWith('auto-') && !/^loc-|page-load|landing|reqres|-request\b|-response\b/.test(k)) return 1;
    if (/proxy-reqres|auto-reqres/.test(k)) return 2;
    if (/auto-req-|req-only|-request/.test(k)) return 3;
    if (/auto-res-|res-only|-response/.test(k)) return 4;
    if (/auto-loc|^loc-|page-load|landing/.test(k)) return 6; // generic affected-page screenshot trails the proof
    return 5;
  }
  return 7; // request_response / command_output / har text after the images
}

/** Sort evidence by exploit-proof priority (stable within a tier - keeps capture order). */
export function orderEvidence<T extends { kind: string; evidenceKey?: string | null }>(items: readonly T[]): T[] {
  return items
    .map((e, i) => ({ e, i }))
    .sort(
      (a, b) =>
        evidenceRank(a.e.kind, a.e.evidenceKey ?? '') - evidenceRank(b.e.kind, b.e.evidenceKey ?? '') || a.i - b.i,
    )
    .map((x) => x.e);
}

/** A good PoC needs the REAL web exploit screenshots PLUS the request/response - every finding MUST carry its
 *  req/resp, not just screenshots (and an API/POST finding may have NO web UI to screenshot, so the req/resp IS
 *  the proof). The CURATED set: drop internal/padding shots (showEvidence), then order exploit-proof first
 *  (orderEvidence). Per operator directive (2026-07-03) the evidence count is NO LONGER capped - every real
 *  captured artifact ships (tool-authentic screenshot, marked req/resp, tool output). `cap` is retained
 *  for API compatibility but defaults to unlimited; pass a finite value only if a caller explicitly wants a
 *  ceiling. showEvidence already drops internal/padding items, so "unlimited" means "all the real proof". */
export const EVIDENCE_CAP = Number.POSITIVE_INFINITY; // no cap: evidence count is not limited (operator rule)
export function curateEvidence<T extends { kind: string; evidenceKey?: string | null }>(
  items: readonly T[],
  cap: number = EVIDENCE_CAP,
): T[] {
  const ordered = orderEvidence(items.filter((e) => showEvidence(null, e.kind, e.evidenceKey ?? '')));
  if (!Number.isFinite(cap)) return ordered; // unlimited (default): ship every real, ordered artifact
  // Legacy bounded mode (only when a caller passes a finite cap): keep `cap` web shots, req/resp always kept.
  const out: T[] = [];
  let webShots = 0;
  for (const e of ordered) {
    const k = (e.evidenceKey ?? '').toLowerCase();
    if (e.kind === 'request_response') {
      out.push(e);
      continue;
    }
    if (e.kind === 'screenshot') {
      const isReqResShot = /proxy-reqres|auto-reqres|auto-req-|auto-res-|-request\b|-response\b/.test(k);
      if (isReqResShot) {
        out.push(e);
        continue;
      }
      if (webShots >= cap) continue;
      webShots++;
      out.push(e);
      continue;
    }
    out.push(e);
  }
  return out;
}

export function sevClass(sev: number): string {
  return SEV_KEYS[Math.max(0, Math.min(4, sev))] ?? 'info';
}
export function sevHex(sev: number): string {
  return SEV_HEX[Math.max(0, Math.min(4, sev))] ?? '#2563EB';
}
export function sevLabel(sev: number, lang: Lang): string {
  const l = labels(lang);
  return [l.info, l.low, l.medium, l.high, l.critical][Math.max(0, Math.min(4, sev))] ?? l.info;
}

export function doc(title: string, css: string, body: string): string {
  // House style: reports never use em/en dashes. Normalise the whole rendered body to a plain hyphen
  // as a final guarantee, regardless of source (templates, analyst text, AI narrative, stored data).
  const clean = body.replace(/[—–]/g, '-');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${css}</style></head><body><span class="doctitle">${escapeHtml(title)}</span>${clean}</body></html>`;
}

export function cover(opts: {
  kicker: string;
  title: string;
  target: string;
  settings: ReportSettings;
  meta: Record<string, string>;
  org?: string;
}): string {
  const { kicker, title, target, settings: s, meta } = opts;
  const initial = (s.companyName?.trim()?.[0] ?? 'V').toUpperCase();
  const words = title.split(' ');
  const last = words.length > 1 ? words.pop()! : '';
  const h1 = `${escapeHtml(words.join(' '))}${last ? ` <span class="l2">${escapeHtml(last)}</span>` : ''}`;
  const cells = Object.entries(meta)
    .map(([k, v]) => `<div><div class="mk">${escapeHtml(k)}</div><div class="mv">${escapeHtml(v)}</div></div>`)
    .join('');
  // Logo image when provided, else a monogram tile.
  const mark = s.companyLogo
    ? `<div class="mark"><img class="logo" src="${escapeHtml(s.companyLogo)}" alt=""><span class="nm">${escapeHtml(s.companyName ?? 'vacti')}</span></div>`
    : `<div class="mark"><span class="m">${escapeHtml(initial)}</span><span class="nm">${escapeHtml(s.companyName ?? 'vacti')}</span></div>`;
  const pill = (s.classification ?? '').trim() || 'Confidential';
  return `<section class="cover">
    <div class="grid-bg"></div><div class="glow"></div>
    <div class="cover-top">
      ${mark}
      <span class="conf-pill">${escapeHtml(pill.length > 28 ? 'Confidential' : pill)}</span>
    </div>
    <div class="cover-mid">
      <div class="kicker">${escapeHtml(kicker)}</div>
      <h1>${h1}</h1>
      <div class="target"><span class="tg">▸</span> ${escapeHtml(target)}</div>
    </div>
    <div class="cover-bot">
      <div class="cover-meta">${cells}</div>
      <div class="cover-foot"><div class="org">${escapeHtml(opts.org ?? s.companyName ?? 'vacti')}</div><div>${escapeHtml(s.classification ?? '')}</div></div>
    </div>
  </section>`;
}

/** Full-page back cover at the very end of the report (mirrors the front cover styling). */
export function backCover(opts: { settings: ReportSettings; title: string; endText: string; org?: string }): string {
  const { settings: s, title, endText } = opts;
  const initial = (s.companyName?.trim()?.[0] ?? 'V').toUpperCase();
  const mark = s.companyLogo
    ? `<div class="mark"><img class="logo" src="${escapeHtml(s.companyLogo)}" alt=""><span class="nm">${escapeHtml(s.companyName ?? 'vacti')}</span></div>`
    : `<div class="mark"><span class="m">${escapeHtml(initial)}</span><span class="nm">${escapeHtml(s.companyName ?? 'vacti')}</span></div>`;
  return `<section class="cover back-cover">
    <div class="grid-bg"></div><div class="glow"></div>
    <div class="cover-top">${mark}<span class="conf-pill">${escapeHtml((s.classification ?? '').trim() || 'Confidential')}</span></div>
    <div class="cover-mid back-mid">
      <div class="kicker">${escapeHtml(endText)}</div>
      <h1>${escapeHtml(title)}</h1>
      ${s.footerText ? `<div class="subtitle">${escapeHtml(s.footerText)}</div>` : ''}
    </div>
    <div class="cover-bot">
      <div class="cover-foot"><div class="org">${escapeHtml(opts.org ?? s.companyName ?? 'vacti')}</div><div>${escapeHtml(s.classification ?? '')}</div></div>
    </div>
  </section>`;
}

/** Section head: eyebrow (bilingual) + numbered title (primary language). */
export function section(
  num: string,
  title: string,
  eyebrow: string,
  opts?: { sub?: string; pageBreak?: boolean },
): string {
  return `<div class="sec-head${opts?.pageBreak ? ' page-break' : ''}">
    <div class="eyebrow">${escapeHtml(eyebrow)}</div>
    <div class="sec-title">${num ? `<span class="num">${escapeHtml(num)}</span>` : ''}<h2>${escapeHtml(title)}</h2></div>
    ${opts?.sub ? `<div class="sec-sub">${escapeHtml(opts.sub)}</div>` : ''}
  </div>`;
}

/** Numbered section (01..NN) with "Bagian NN / Section NN" eyebrow. */
export function numberedSection(lang: Lang, num: string, title: string, opts?: { pageBreak?: boolean }): string {
  return section(num, title, biText(lang, `Bagian ${num}`, `Section ${num}`), opts);
}

export function miniHead(primary: string, secondary: string): string {
  return `<div class="minihead"><span class="ic"></span><span class="mt">${escapeHtml(primary)} <span class="en">/ ${escapeHtml(secondary)}</span></span></div>`;
}

export function kv(pairs: [string, string][]): string {
  return `<div class="kv">${pairs
    .map(([k, v]) => `<div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div>`)
    .join('')}</div>`;
}

export function note(html: string): string {
  return `<div class="note">${html}</div>`;
}

/** Stat cards (label bold; an optional muted second line - omitted for single-language reports). */
export function statRow(items: { value: number | string; primary: string; secondary?: string }[]): string {
  return `<div class="stat-row">${items
    .map(
      (i) =>
        `<div class="stat"><div class="sv">${escapeHtml(i.value)}</div><div class="sl"><b>${escapeHtml(i.primary)}</b>${i.secondary ? `<br>${escapeHtml(i.secondary)}` : ''}</div></div>`,
    )
    .join('')}</div>`;
}

type Counts = { crit: number; high: number; med: number; low: number; info: number };

function sevOrder(counts: Counts, lang: Lang) {
  const l = labels(lang);
  return [
    { n: counts.crit, idx: 4, name: l.critical },
    { n: counts.high, idx: 3, name: l.high },
    { n: counts.med, idx: 2, name: l.medium },
    { n: counts.low, idx: 1, name: l.low },
    { n: counts.info, idx: 0, name: l.info },
  ];
}

export function sevBarLegend(counts: Counts, lang: Lang): string {
  const order = sevOrder(counts, lang);
  const total = order.reduce((a, b) => a + b.n, 0);
  const bar = total
    ? `<div class="sevbar">${order
        .filter((o) => o.n > 0)
        .map((o) => `<div class="seg" style="flex:${o.n};background:${SEV_HEX[o.idx]}">${o.n}</div>`)
        .join('')}</div>`
    : '';
  return bar + sevLegend(counts, lang);
}

export function sevLegend(counts: Counts, lang: Lang): string {
  const order = sevOrder(counts, lang);
  return `<div class="sev-legend">${order
    .map(
      (o) =>
        `<div class="sev-item"><span class="sw" style="background:${SEV_HEX[o.idx]}"></span><span class="nm">${escapeHtml(o.name)}</span><span class="ct">${o.n}</span></div>`,
    )
    .join('')}</div>`;
}

/** Severity donut (CSS conic-gradient) + centred total, beside the legend. */
export function donut(counts: Counts, lang: Lang): string {
  const order = sevOrder(counts, lang);
  const total = order.reduce((a, b) => a + b.n, 0);
  let acc = 0;
  const stops = total
    ? order
        .filter((o) => o.n > 0)
        .map((o) => {
          const start = (acc / total) * 360;
          acc += o.n;
          const end = (acc / total) * 360;
          return `var(${SEV_VAR[o.idx]}) ${start}deg ${end}deg`;
        })
        .join(',')
    : 'var(--line) 0deg 360deg';
  return `<div class="donut-wrap">
    <div class="donut" style="background:conic-gradient(${stops})"><div class="dc"><div class="dn">${total}</div><div class="dl">${escapeHtml(labels(lang).findingsWord)}</div></div></div>
    ${sevLegend(counts, lang)}
  </div>`;
}

/** Horizontal bar chart. rows: {label, value, color?}. */
export function barChart(rows: { label: string; value: number; color?: string }[]): string {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return `<div class="bars">${rows
    .map(
      (r) =>
        `<div class="barrow"><span class="bl">${escapeHtml(r.label)}</span><span class="bt"><span class="bf" style="width:${((r.value / max) * 100).toFixed(2)}%;background:${r.color ?? 'var(--teal)'}"></span></span><span class="bv">${r.value}</span></div>`,
    )
    .join('')}</div>`;
}

export function statusPill(code: number | null | undefined, lang: Lang): string {
  if (code == null) return `<span class="status-pill st-none">${escapeHtml(labels(lang).noResponse)}</span>`;
  const cls = code >= 500 ? 'st-5xx' : code >= 400 ? 'st-4xx' : code >= 300 ? 'st-3xx' : 'st-2xx';
  return `<span class="status-pill ${cls}">${code}</span>`;
}

/** Subdomain inventory table (# | subdomain | HTTP status), split into 2 columns when long. */
export function subdomainTable(rows: { host: string; status: number | null }[], lang: Lang): string {
  const l = labels(lang);
  if (!rows.length) return `<div class="empty">${escapeHtml(l.none)}</div>`;
  const head = `<thead><tr><th style="width:34px">#</th><th>${escapeHtml(l.subdomain)}</th><th>${escapeHtml(l.status)}</th></tr></thead>`;
  const row = (r: { host: string; status: number | null }, i: number) =>
    `<tr><td class="idx">${i + 1}</td><td class="mono">${escapeHtml(r.host)}</td><td>${statusPill(r.status, lang)}</td></tr>`;
  if (rows.length <= 18) {
    return `<table>${head}<tbody>${rows.map(row).join('')}</tbody></table>`;
  }
  const mid = Math.ceil(rows.length / 2);
  const col = (slice: { host: string; status: number | null }[], offset: number) =>
    `<table>${head}<tbody>${slice.map((r, i) => row(r, i + offset)).join('')}</tbody></table>`;
  return `<div class="subgrid">${col(rows.slice(0, mid), 0)}${col(rows.slice(mid), mid)}</div>`;
}

/** Vulnerability summary table aggregated by name (# | name | count | severity). */
export function vulnSummaryTable(rows: { name: string; count: number; severity: number }[], lang: Lang): string {
  const l = labels(lang);
  if (!rows.length) return `<div class="empty">No vulnerabilities identified.</div>`;
  return `<table class="vt"><thead><tr><th style="width:34px">#</th><th>${escapeHtml(l.vulnerabilityName)}</th><th style="width:80px">${escapeHtml(l.count)}</th><th style="width:130px">${escapeHtml(l.severity)}</th></tr></thead><tbody>
    ${rows
      .map(
        (r, i) =>
          `<tr><td class="idx">${i + 1}</td><td class="vname">${escapeHtml(r.name)}</td><td class="vcount">${r.count}</td><td><span class="badge" style="background:${sevHex(r.severity)}">${escapeHtml(sevLabel(r.severity, lang))}</span></td></tr>`,
      )
      .join('')}
    </tbody></table>`;
}

export function urlChips(urls: string[], max = 14): string {
  const shown = urls.slice(0, max);
  const extra = urls.length - shown.length;
  return `<div class="url-chips">${shown
    .map((u) => `<span class="url-chip"><span class="dotg"></span>${escapeHtml(u)}</span>`)
    .join('')}${extra > 0 ? `<span class="url-chip more">+${extra}</span>` : ''}</div>`;
}

export function tocList(items: { num: string; primary: string; secondary: string; page: string }[]): string {
  return `<div class="toc-list">${items
    .map(
      (i) =>
        `<div class="toc-item"><span class="tnum">${escapeHtml(i.num)}</span><span class="ttext"><span class="tt">${escapeHtml(i.primary)}</span><div class="te">${escapeHtml(i.secondary)}</div></span>${i.page ? `<span class="tpg">${escapeHtml(i.page)}</span>` : ''}</div>`,
    )
    .join('')}</div>`;
}

export function findingCard(opts: {
  index: number;
  severity: number;
  lang: Lang;
  title: string;
  tags: string[];
  blocks: { label: string; text: string }[];
  urls?: string[];
  cvss?: number | null;
  cves?: string[];
  references?: string[];
  request?: string | null;
  response?: string | null;
}): string {
  const cls = sevClass(opts.severity);
  const hex = sevHex(opts.severity);
  // CVSS + CVE badges sit alongside the severity badge; other tags follow.
  const cvssBadge =
    opts.cvss != null ? `<span class="badge" style="background:var(--ink)">CVSS ${escapeHtml(opts.cvss)}</span>` : '';
  const cveTags = (opts.cves ?? [])
    .slice(0, 4)
    .map((c) => `<span class="tag">${escapeHtml(c)}</span>`)
    .join('');
  const tags = opts.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  const blocks = opts.blocks
    .filter((b) => b.text)
    .map(
      (b) => `<div class="fblock"><div class="flabel">${escapeHtml(b.label)}</div><p>${escapeHtml(b.text)}</p></div>`,
    )
    .join('');
  const urlsBlock =
    opts.urls && opts.urls.length
      ? `<div class="fblock"><div class="flabel">${escapeHtml(bi(opts.lang, 'affectedUrls'))}</div>${urlChips(opts.urls)}</div>`
      : '';
  const refs = (opts.references ?? []).slice(0, 12);
  const refsBlock = refs.length
    ? `<div class="fblock"><div class="flabel">${escapeHtml(biText(opts.lang, 'Referensi', 'References'))}</div><ul class="refs">${refs
        .map((r) => `<li class="mono">${escapeHtml(r)}</li>`)
        .join('')}</ul></div>`
    : '';
  // Raw HTTP evidence (nuclei request/response): a tidy line-bounded excerpt so the PDF never chops
  // content mid-line — the full raw pair stays available in the app.
  const excerpt = (s: string): { text: string; cut: boolean } => {
    const lines = s
      .replace(/\r/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .split('\n');
    let cut = lines.length > 22;
    let text = lines.slice(0, 22).join('\n');
    if (text.length > 1600) {
      text = text.slice(0, 1600);
      cut = true;
    }
    return { text: text.trimEnd(), cut };
  };
  const evBlock = (label: string, raw: string): string => {
    const { text, cut } = excerpt(raw);
    const more = cut
      ? `<div class="evmore">${escapeHtml(biText(opts.lang, '... dipotong - selengkapnya di aplikasi', '... truncated - full pair in app'))}</div>`
      : '';
    return `<div class="evlabel">${escapeHtml(label)}</div><pre class="evidence">${escapeHtml(text)}</pre>${more}`;
  };
  const evParts = [
    opts.request ? evBlock('Request', opts.request) : '',
    opts.response ? evBlock('Response', opts.response) : '',
  ]
    .filter(Boolean)
    .join('');
  const evidenceBlock = evParts
    ? `<div class="fblock"><div class="flabel">${escapeHtml(biText(opts.lang, 'Bukti (Request / Response)', 'Evidence (Request / Response)'))}</div>${evParts}</div>`
    : '';
  const bodyBlocks = blocks || urlsBlock || refsBlock || evidenceBlock;
  return `<div class="finding f-${cls}">
    <div class="finding-head">
      <span class="fid" style="background:${hex}">${opts.index}</span>
      <div class="fttl"><div class="fn">${escapeHtml(opts.title)}</div>
        <div class="fmeta"><span class="badge" style="background:${hex}">${escapeHtml(sevLabel(opts.severity, opts.lang))}</span>${cvssBadge}${cveTags}${tags}</div>
      </div>
    </div>
    ${bodyBlocks ? `<div class="finding-body">${blocks}${urlsBlock}${refsBlock}${evidenceBlock}</div>` : ''}
  </div>`;
}

export function approvalCards(signatories: Signatory[], lang: Lang): string {
  if (!signatories.length) return '';
  const l = labels(lang);
  const roleLabel: Record<string, string> = { prepared: l.preparedBy, reviewed: l.reviewedBy, approved: l.approvedBy };
  const order = ['prepared', 'reviewed', 'approved'];
  const sorted = [...signatories].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
  const cards = sorted
    .map(
      (s) =>
        `<div class="approve-card"><div class="acrole">${escapeHtml(roleLabel[s.role] ?? s.role)}</div><div class="acsig">${s.signatureImage ? `<img class="acsigimg" src="${escapeHtml(s.signatureImage)}" alt="">` : ''}</div><div class="acname">${escapeHtml(s.name)}</div><div class="acpos">${escapeHtml(s.position)}</div></div>`,
    )
    .join('');
  return `<div class="approve-grid">${cards}</div>`;
}

/** Bilingual CONFIDENTIAL classification note. */
export function classificationNote(lang: Lang, company: string): string {
  const conf = (lang === 'id' ? 'RAHASIA' : 'CONFIDENTIAL').toString();
  const idText = `Laporan ini diklasifikasikan sebagai <b>${conf}</b>. Informasi di dalamnya ditujukan khusus untuk keperluan internal ${escapeHtml(company)} dan tidak boleh didistribusikan kepada pihak ketiga tanpa izin tertulis.`;
  const enText = `This report is classified as <b>CONFIDENTIAL</b> and intended for internal use of ${escapeHtml(company)} only; do not distribute to third parties without written permission.`;
  void pri;
  void sec;
  // Single-language report: only the selected language (no stacked translation).
  return note(lang === 'id' ? idText : enText);
}
