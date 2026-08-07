/**
 * URLScan.io client - third passive source. The search API returns scanned pages for a domain
 * (URLs + resolved IPs). Works key-less (rate-limited); an API key raises limits. Best-effort:
 * degrades to empty on error/rate-limit.
 */
import type { FetchLike } from './wayback';

interface UrlscanResult {
  page?: { url?: string; domain?: string; ip?: string };
  task?: { url?: string };
}
interface UrlscanSearch {
  results?: UrlscanResult[];
}

export interface UrlscanHarvest {
  urls: string[];
  resolutions: { ip: string; host: string }[];
}

/** Fetch URLs + IP resolutions for a domain from URLScan.io search. */
export async function fetchUrlscan(
  domain: string,
  opts: { fetchImpl?: FetchLike; apiKey?: string | null; size?: number; timeoutMs?: number } = {},
): Promise<UrlscanHarvest> {
  const { fetchImpl = fetch, apiKey, size = 100, timeoutMs = 30_000 } = opts;
  const api = `https://urlscan.io/api/v1/search/?q=${encodeURIComponent(`domain:${domain}`)}&size=${size}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(api, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'vacti-passive-recon/1.0', ...(apiKey ? { 'API-Key': apiKey } : {}) },
    });
    if (!res.ok) return { urls: [], resolutions: [] };
    const data = (await res.json()) as UrlscanSearch;
    const urls = new Set<string>();
    const resolutions: { ip: string; host: string }[] = [];
    for (const r of data.results ?? []) {
      for (const u of [r.page?.url, r.task?.url]) if (typeof u === 'string') urls.add(u);
      if (r.page?.ip && r.page?.domain) resolutions.push({ ip: r.page.ip, host: r.page.domain.toLowerCase() });
    }
    return { urls: [...urls], resolutions };
  } catch {
    return { urls: [], resolutions: [] };
  } finally {
    clearTimeout(timer);
  }
}
