/**
 * VirusTotal v2 domain-report client - passive DNS source. Harvests subdomains, domain siblings,
 * undetected URLs (with archive dates), and passive-DNS IP resolutions (hostname↔IP history, used
 * to surface origin infrastructure behind a WAF). HTTP-API only; key supplied by the caller.
 */

import type { FetchLike } from './wayback';

export const VT_DOMAIN_REPORT_V2 = 'https://www.virustotal.com/vtapi/v2/domain/report';

export interface VtDomainReport {
  response_code?: number;
  verbose_msg?: string;
  subdomains?: string[];
  domain_siblings?: string[];
  undetected_urls?: unknown[];
  resolutions?: Array<{ ip_address?: string; last_resolved?: string }>;
}

export interface VtUrlWithDate {
  url: string;
  date: Date | null;
}
export interface VtResolution {
  ipAddress: string;
  lastResolved: Date;
}

const norm = (s: string): string => s.toLowerCase().replace(/\.$/, '').trim();

/** Lower-cased hostname of a URL if it is the target domain or a subdomain of it, else null. */
export function hostUnderTarget(urlOrHost: string, targetNormalized: string): string | null {
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(urlOrHost) ? urlOrHost : `https://${urlOrHost}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  const t = norm(targetNormalized);
  if (host === t || host.endsWith(`.${t}`)) return host;
  return null;
}

function parseVtDate(raw: unknown): Date | null {
  if (typeof raw !== 'string') return null;
  const d = new Date(raw.trim().replace(' ', 'T') + 'Z'); // VT dates are UTC "YYYY-MM-DD HH:MM:SS"
  return isNaN(d.getTime()) ? null : d;
}

export function harvestUndetectedUrls(report: VtDomainReport): VtUrlWithDate[] {
  const raw = report.undetected_urls;
  if (!Array.isArray(raw)) return [];
  const out: VtUrlWithDate[] = [];
  for (const row of raw) {
    if (Array.isArray(row) && typeof row[0] === 'string') {
      out.push({ url: row[0], date: parseVtDate(row[4]) });
    } else if (typeof row === 'string') {
      out.push({ url: row, date: null });
    }
  }
  return out;
}

export function harvestResolutions(report: VtDomainReport): VtResolution[] {
  const raw = report.resolutions;
  if (!Array.isArray(raw)) return [];
  const out: VtResolution[] = [];
  for (const e of raw) {
    const d = parseVtDate(e?.last_resolved);
    if (typeof e?.ip_address === 'string' && d) out.push({ ipAddress: e.ip_address, lastResolved: d });
  }
  return out;
}

/** All subdomains discoverable from the report: explicit list + siblings + hosts seen in URLs. */
export function discoverSubdomains(report: VtDomainReport, targetNormalized: string): string[] {
  const set = new Set<string>();
  for (const s of report.subdomains ?? []) set.add(norm(s));
  for (const s of report.domain_siblings ?? []) set.add(norm(s));
  for (const { url } of harvestUndetectedUrls(report)) {
    const h = hostUnderTarget(url, targetNormalized);
    if (h) set.add(h);
  }
  return [...set].filter(Boolean);
}

export interface VtFetchResult {
  status: number;
  data: VtDomainReport;
}

/** Fetch a VT v2 domain report. Returns status + data; 598/599 for timeout/network so the
 *  rotator can back off. Never throws on HTTP errors. */
export async function fetchVtDomainReport(params: {
  apiKey: string;
  domain: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<VtFetchResult> {
  const { apiKey, domain, fetchImpl = fetch, timeoutMs = 45_000 } = params;
  const url = `${VT_DOMAIN_REPORT_V2}?apikey=${encodeURIComponent(apiKey)}&domain=${encodeURIComponent(domain)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal });
    let data: VtDomainReport = {};
    try {
      data = (await res.json()) as VtDomainReport;
    } catch {
      data = {};
    }
    return { status: res.status, data: data ?? {} };
  } catch (e) {
    const name = (e as Error)?.name;
    return { status: name === 'AbortError' ? 598 : 599, data: {} };
  } finally {
    clearTimeout(timer);
  }
}
