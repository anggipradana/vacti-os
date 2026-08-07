/**
 * Wayback Machine (Internet Archive) CDX client - passive archived-URL discovery for a domain.
 * One HTTP call lists every archived URL under the domain (collapsed by urlkey). Passive only:
 * this lists the archive index, it does not crawl the live target.
 */

export type FetchLike = typeof fetch;

const UA = 'vacti-passive-recon/1.0';

export interface WaybackOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  retries?: number;
  /** Cap returned rows (archives can be huge); 0 = unlimited. */
  limit?: number;
  /** Outer cancellation (scan cancel/abort) - this call can take up to 120s otherwise. */
  signal?: AbortSignal;
}

/**
 * Fetch archived URLs for `domain` AND all of its subdomains from the Wayback CDX API.
 * `matchType=domain` makes the index return `domain` + `*.domain` (e.g. api.domain, www.domain),
 * not just the apex host's paths - so passive discovery covers the whole subdomain surface.
 */
export async function fetchWaybackUrls(domain: string, opts: WaybackOptions = {}): Promise<string[]> {
  const { fetchImpl = fetch, timeoutMs = 120_000, retries = 3, limit = 0 } = opts;
  const cdx = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(domain)}&matchType=domain&collapse=urlkey&output=text&fl=original`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    if (opts.signal?.aborted) return [];
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const onOuterAbort = (): void => ctrl.abort();
    opts.signal?.addEventListener('abort', onOuterAbort, { once: true });
    try {
      const res = await fetchImpl(cdx, { signal: ctrl.signal, headers: { 'user-agent': UA } });
      if (res.status === 503 && attempt < retries) {
        await sleep(5000);
        continue;
      }
      if (!res.ok) return [];
      const body = await res.text();
      if (!body) return [];
      const urls = body
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      return limit > 0 ? urls.slice(0, limit) : urls;
    } catch {
      if (opts.signal?.aborted) return [];
      if (attempt < retries) {
        await sleep(5000);
        continue;
      }
      return [];
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onOuterAbort);
    }
  }
  return [];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
