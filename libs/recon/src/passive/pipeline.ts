import { createHash } from 'node:crypto';
import { sql, eq, desc } from 'drizzle-orm';
import {
  scans,
  scanActivity,
  subdomains,
  discoveredUrls,
  exposureFindings,
  ipResolutions,
  ipResolutionSightings,
  type Database,
} from '@vacti/db';
import { fetchVtDomainReport, discoverSubdomains, harvestUndetectedUrls, harvestResolutions } from './virustotal';
import { fetchWaybackUrls } from './wayback';
import { fetchUrlscan } from './urlscan';
import { categorizeUrl, buildSuffixIndex } from './categorize';
import { scanExposure } from './exposure';
import { deepFetch } from './deepfetch';
import { isPrivateOrLoopbackHost } from './ssrf';

export interface PassiveScanInput {
  scanId: string;
  projectId: string;
  targetId: string;
  domain: string;
  /** VirusTotal API key (optional single key - Wayback works without it). */
  vtApiKey?: string | null;
  /** Rotating VT key provider (multi-key quota/backoff via Postgres). Takes precedence over vtApiKey. */
  vtKeyProvider?: {
    next: () => Promise<{ id: string; secret: string } | null>;
    report: (id: string, status: number) => Promise<void>;
  };
  /** Max discovered subdomains to additionally query in VirusTotal (per-sub enrichment). */
  maxVtSubdomains?: number;
  /** URLScan.io API key (optional - search works key-less but rate-limited). */
  urlscanApiKey?: string | null;
  /** Cap archived URLs pulled from Wayback (0 = unlimited). */
  waybackLimit?: number;
  /** Cap URLs scanned for exposure (bounds work on huge archives). */
  exposureLimit?: number;
  /** Opt-in deep-fetch: fetch discovered URL bodies (SSRF-guarded) and scan them for exposures. */
  deepScan?: boolean;
  /** Cap deep-fetched URLs (politeness + bound work). */
  deepFetchLimit?: number;
  signal?: AbortSignal;
}

export interface PassiveScanResult {
  hosts: string[];
  counts: { passiveSubdomains: number; discoveredUrls: number; exposureFindings: number; ipResolutions: number };
}

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const norm = (d: string) => d.toLowerCase().replace(/\.$/, '').trim();
const hostOf = (u: string): string | null => {
  try {
    return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname.toLowerCase();
  } catch {
    return null;
  }
};

/**
 * A discovered URL belongs to the attack surface only if its host is the target or a subdomain of
 * it AND is not a private/loopback address. The loopback guard matters because archive indexes
 * (Wayback/VT `matchType=domain`) return junk like http://127.0.0.1/... that would otherwise be
 * accepted when the scan target is itself an internal host - noise at best, misleading at worst.
 */
const acceptUrl = (url: string, target: string): string | null => {
  const h = hostOf(url);
  if (!h) return null;
  if (h !== target && !h.endsWith(`.${target}`)) return null;
  if (isPrivateOrLoopbackHost(h)) return null;
  return h;
};

/**
 * Passive recon: pull VirusTotal (passive DNS) + Wayback (archived URLs), consolidate & store
 * discovered URLs (categorised), passive-DNS IP resolutions, and exposure findings (regex over URL
 * strings). Writes scan_activity, merges scans.counts, and returns the discovered host list (so
 * `full` mode can feed it into the active pipeline). Does NOT set terminal scan status - the caller
 * (worker) owns that. Cancellable via signal.
 */
export async function runPassiveScan(
  input: PassiveScanInput,
  deps: { db: Database; onProgress?: (stage: string, message: string) => void },
): Promise<PassiveScanResult> {
  const { db } = deps;
  const target = norm(input.domain);
  const waybackLimit = input.waybackLimit ?? 20_000;
  const exposureLimit = input.exposureLimit ?? 50_000;
  const suffixIdx = buildSuffixIndex();

  const checkAbort = () => {
    if (input.signal?.aborted) throw new Error('cancelled');
  };
  const activity = async (stage: string, status: string, message?: string) => {
    await db.insert(scanActivity).values({ scanId: input.scanId, stage, status, message });
    deps.onProgress?.(stage, message ?? status);
  };

  const hostSet = new Set<string>([target]);
  const urlMap = new Map<string, { url: string; date: Date | null; sources: Set<string> }>();
  const resolutions: { ip: string; host: string; at: Date }[] = [];

  // ── VirusTotal (optional, rotating keys + per-subdomain enrichment) ──
  checkAbort();
  // Key provider: rotating (multi-key, Postgres quota/backoff) or a single-key fallback.
  const vtProvider =
    input.vtKeyProvider ??
    (input.vtApiKey ? { next: async () => ({ id: 'single', secret: input.vtApiKey! }), report: async () => {} } : null);

  // Fetch a domain's VT report, rotating keys + backing off on rate-limit. Null when no key/report.
  const vtFetch = async (domain: string): Promise<Awaited<ReturnType<typeof fetchVtDomainReport>>['data'] | null> => {
    if (!vtProvider) return null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const k = await vtProvider.next();
      if (!k) return null;
      const r = await fetchVtDomainReport({ apiKey: k.secret, domain });
      if (r.status === 200) return r.data;
      if (r.status === 403 || r.status === 429 || r.status >= 500) {
        await vtProvider.report(k.id, r.status);
        continue; // try another key
      }
      return r.data; // other status (e.g. 204) - nothing to retry
    }
    return null;
  };

  const harvestVt = (data: NonNullable<Awaited<ReturnType<typeof vtFetch>>>, viaHost: string) => {
    for (const h of discoverSubdomains(data, target)) hostSet.add(h);
    for (const { url, date } of harvestUndetectedUrls(data)) {
      if (!acceptUrl(url, target)) continue;
      const ex = urlMap.get(url) ?? { url, date, sources: new Set<string>() };
      if (!ex.date && date) ex.date = date;
      ex.sources.add('virustotal');
      urlMap.set(url, ex);
    }
    for (const res of harvestResolutions(data))
      if (!isPrivateOrLoopbackHost(res.ipAddress))
        resolutions.push({ ip: res.ipAddress, host: viaHost, at: res.lastResolved });
  };

  let vtCalls = 0;
  if (vtProvider) {
    await activity('virustotal', 'running');
    const apex = await vtFetch(target);
    if (apex) {
      vtCalls += 1;
      harvestVt(apex, target);
    }
    // Per-subdomain enrichment (capped) - each sub's VT report adds URLs/IPs (origin-behind-WAF).
    const maxVtSubs = input.maxVtSubdomains ?? 25;
    const vtSubs = [...hostSet].filter((h) => h !== target).slice(0, maxVtSubs);
    for (const sub of vtSubs) {
      checkAbort();
      const rep = await vtFetch(sub);
      if (rep) {
        vtCalls += 1;
        harvestVt(rep, sub);
      }
    }
    await activity('virustotal', 'completed', `${vtCalls} VT lookup(s), ${resolutions.length} IP resolution(s)`);
  } else {
    await activity('virustotal', 'skipped', 'no VirusTotal API key');
  }

  // ── Wayback ──
  checkAbort();
  await activity('wayback', 'running');
  const wb = await fetchWaybackUrls(target, { limit: waybackLimit, signal: input.signal });
  for (const url of wb) {
    const h = acceptUrl(url, target);
    if (!h) continue;
    hostSet.add(h);
    const ex = urlMap.get(url) ?? { url, date: null, sources: new Set<string>() };
    ex.sources.add('wayback');
    urlMap.set(url, ex);
  }
  await activity('wayback', 'completed', `${wb.length} archived URLs`);

  // ── URLScan.io (best-effort, key-less or with key) ──
  checkAbort();
  await activity('urlscan', 'running');
  const us = await fetchUrlscan(target, { apiKey: input.urlscanApiKey });
  let usUrls = 0;
  for (const url of us.urls) {
    const h = acceptUrl(url, target);
    if (!h) continue;
    hostSet.add(h);
    const ex = urlMap.get(url) ?? { url, date: null, sources: new Set<string>() };
    ex.sources.add('urlscan');
    urlMap.set(url, ex);
    usUrls += 1;
  }
  for (const r of us.resolutions) {
    // Resolutions point at infrastructure IPs; drop private/loopback ones (noise, never public surface).
    if ((r.host === target || r.host.endsWith(`.${target}`)) && !isPrivateOrLoopbackHost(r.ip))
      resolutions.push({ ip: r.ip, host: r.host, at: new Date() });
  }
  await activity('urlscan', 'completed', `${usUrls} URLs, ${us.resolutions.length} IP(s)`);

  // ── Consolidate: subdomains ──
  checkAbort();
  const hosts = [...hostSet].filter(Boolean);
  const passiveSubs = hosts.filter((h) => h !== target);
  if (passiveSubs.length) {
    await db
      .insert(subdomains)
      .values(passiveSubs.map((host) => ({ scanId: input.scanId, host, source: 'passive' })))
      .onConflictDoNothing();
  }

  // ── Discovered URLs (categorised) ──
  checkAbort();
  const urls = [...urlMap.values()];
  if (urls.length) {
    const rows = urls.map((u) => {
      const cat = categorizeUrl(u.url, suffixIdx);
      return {
        projectId: input.projectId,
        targetId: input.targetId,
        scanId: input.scanId,
        host: hostOf(u.url),
        urlText: u.url,
        urlSha256: sha256(`${input.projectId}:${u.url}`),
        firstScanId: input.scanId,
        sources: [...u.sources],
        pathnameExtension: cat.extension,
        categorySlug: cat.categorySlug,
        externalSeenAt: u.date,
      };
    });
    // Chunk inserts (archives can be large).
    for (let i = 0; i < rows.length; i += 1000) {
      await db
        .insert(discoveredUrls)
        .values(rows.slice(i, i + 1000))
        .onConflictDoUpdate({
          target: [discoveredUrls.projectId, discoveredUrls.urlSha256],
          set: {
            scanId: sql`excluded.scan_id`,
            sources: sql`excluded.sources`,
            categorySlug: sql`excluded.category_slug`,
          },
        });
    }
  }
  await activity('consolidate', 'completed', `${urls.length} URLs, ${passiveSubs.length} subdomains`);

  // ── IP resolutions (passive DNS) ──
  checkAbort();
  for (const res of resolutions) {
    const [row] = await db
      .insert(ipResolutions)
      .values({ projectId: input.projectId, ipAddress: res.ip, latestResolvedAt: res.at })
      .onConflictDoUpdate({
        target: [ipResolutions.projectId, ipResolutions.ipAddress],
        set: {
          latestResolvedAt: sql`greatest(${ipResolutions.latestResolvedAt}, excluded.latest_resolved_at)`,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: ipResolutions.id });
    if (row) {
      await db
        .insert(ipResolutionSightings)
        .values({ ipResolutionId: row.id, scanId: input.scanId, hostname: res.host, lastResolvedAt: res.at })
        .onConflictDoUpdate({
          target: [ipResolutionSightings.ipResolutionId, ipResolutionSightings.hostname],
          set: { lastResolvedAt: sql`greatest(${ipResolutionSightings.lastResolvedAt}, excluded.last_resolved_at)` },
        });
    }
  }

  // ── Exposure findings (regex over URL strings) ──
  checkAbort();
  await activity('exposure', 'running');
  let findingCount = 0;
  const findingRows: (typeof exposureFindings.$inferInsert)[] = [];
  for (const u of urls.slice(0, exposureLimit)) {
    for (const hit of scanExposure(u.url)) {
      findingRows.push({
        projectId: input.projectId,
        scanId: input.scanId,
        source: 'url',
        findingType: hit.type,
        snippet: hit.snippet,
        urlText: u.url,
      });
    }
  }
  if (findingRows.length) {
    for (let i = 0; i < findingRows.length; i += 1000) {
      const res = await db
        .insert(exposureFindings)
        .values(findingRows.slice(i, i + 1000))
        .onConflictDoNothing()
        .returning({ id: exposureFindings.id });
      findingCount += res.length;
    }
  }
  await activity('exposure', 'completed', `${findingCount} exposure finding(s)`);

  // ── Deep-fetch (opt-in): fetch URL bodies (SSRF-guarded) and scan them for exposures ──
  let deepFetched = 0;
  let bodyFindingCount = 0;
  if (input.deepScan) {
    checkAbort();
    await activity('deep-fetch', 'running');
    const deepLimit = input.deepFetchLimit ?? 150;
    // Prioritise categorised (sensitive) URLs first, then the rest.
    const candidates = await db
      .select({ id: discoveredUrls.id, urlText: discoveredUrls.urlText })
      .from(discoveredUrls)
      .where(eq(discoveredUrls.projectId, input.projectId))
      .orderBy(sql`${discoveredUrls.categorySlug} nulls last`, desc(discoveredUrls.createdAt))
      .limit(deepLimit);
    for (const cand of candidates) {
      checkAbort();
      const r = await deepFetch(cand.urlText, { signal: input.signal });
      const state = r.blocked ? 'blocked' : r.status >= 200 && r.status < 400 ? 'done' : 'failed';
      await db
        .update(discoveredUrls)
        .set({
          deepScanState: state,
          fetchedAt: new Date(),
          httpStatus: r.status || null,
          contentLength: r.length || null,
        })
        .where(eq(discoveredUrls.id, cand.id));
      if (r.body) {
        const bodyRows = scanExposure(r.body).map((hit) => ({
          projectId: input.projectId,
          discoveredUrlId: cand.id,
          scanId: input.scanId,
          source: 'body',
          findingType: hit.type,
          snippet: hit.snippet,
          urlText: cand.urlText,
        }));
        if (bodyRows.length) {
          const res = await db
            .insert(exposureFindings)
            .values(bodyRows)
            .onConflictDoNothing()
            .returning({ id: exposureFindings.id });
          bodyFindingCount += res.length;
        }
      }
      if (state === 'done') deepFetched += 1;
    }
    findingCount += bodyFindingCount;
    await activity('deep-fetch', 'completed', `${deepFetched} fetched · ${bodyFindingCount} body finding(s)`);
  }

  const counts = {
    passiveSubdomains: passiveSubs.length,
    discoveredUrls: urls.length,
    exposureFindings: findingCount,
    // Distinct ip/host pairs: VT + URLScan can sight the same resolution, and the rows are upserted.
    ipResolutions: new Set(resolutions.map((r) => `${r.ip}|${r.host}`)).size,
    deepFetched,
  };
  // Merge into scans.counts (preserve any active-pipeline counts).
  await db
    .update(scans)
    .set({ counts: sql`coalesce(${scans.counts}, '{}'::jsonb) || ${JSON.stringify(counts)}::jsonb` })
    .where(eq(scans.id, input.scanId));

  return { hosts, counts };
}
