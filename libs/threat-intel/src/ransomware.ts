type FetchLike = typeof fetch;

export interface RansomwareVictim {
  title: string;
  group: string;
  country: string;
  /** Victim sector/industry (e.g. "Manufacturing"); empty when unknown. */
  activity: string;
  website: string;
  discovered: string;
  published: string;
  postUrl: string;
}

export interface RansomwareLandscape {
  stats: { victims: number; groups: number; press: number; lastUpdate: string };
  /** Most recently discovered victims, newest first. */
  recent: RansomwareVictim[];
  /** Recently discovered victims in Indonesia (country = ID), for local relevance. */
  indonesia: RansomwareVictim[];
  /** Most active groups by victim count in the fetched window. */
  topGroups: { group: string; count: number }[];
  /** Larger recent slice (newest first) for client-side filtering by country/sector. */
  victims: RansomwareVictim[];
  /** Victim counts per country code, sorted descending. */
  countries: { code: string; count: number }[];
  /** Victim counts per known sector (excludes empty / "Not Found"), sorted descending. */
  sectors: { name: string; count: number }[];
}

const BASE = 'https://raw.githubusercontent.com/anggipradana/ransomware-dashboard/main/data';

interface VictimRaw {
  post_title?: string;
  group_name?: string;
  country?: string;
  activity?: string;
  website?: string;
  discovered?: string;
  published?: string;
  post_url?: string;
}

function mapVictim(v: VictimRaw): RansomwareVictim {
  return {
    title: v.post_title ?? '',
    group: v.group_name ?? '',
    country: (v.country ?? '').toUpperCase(),
    activity: v.activity ?? '',
    website: v.website ?? '',
    discovered: v.discovered ?? '',
    published: v.published ?? '',
    postUrl: v.post_url ?? '',
  };
}

// The victims feed is ~25MB (too big for Next's fetch cache), so memoise the computed landscape in
// the long-running process for an hour rather than refetching/reparsing it on every render.
let cache: { at: number; data: RansomwareLandscape } | null = null;
const CACHE_MS = 60 * 60 * 1000;

/**
 * Fetch the ransomware landscape (stats + recent victims + top groups) from the ransomware-dashboard
 * data mirror. Degrades to empty results on error. `recentLimit` caps the recent/Indonesia lists.
 * Result is process-cached for an hour (the victims feed is large); pass a `fetchImpl` in tests to bypass.
 */
export async function fetchRansomwareLandscape(
  opts: { fetchImpl?: FetchLike; timeoutMs?: number; recentLimit?: number; now?: number } = {},
): Promise<RansomwareLandscape> {
  const { fetchImpl = fetch, timeoutMs = 20000, recentLimit = 15, now = Date.now() } = opts;
  if (cache && now - cache.at < CACHE_MS) return cache.data;
  const empty: RansomwareLandscape = {
    stats: { victims: 0, groups: 0, press: 0, lastUpdate: '' },
    recent: [],
    indonesia: [],
    topGroups: [],
    victims: [],
    countries: [],
    sectors: [],
  };
  const get = async (path: string): Promise<unknown> => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${BASE}/${path}`, { signal: ctrl.signal });
      clearTimeout(t);
      return res.ok ? await res.json() : null;
    } catch {
      clearTimeout(t);
      return null;
    }
  };

  try {
    const [statsJson, victimsJson] = await Promise.all([get('stats.json'), get('victims.json')]);
    const s =
      (statsJson as { stats?: { victims?: number; groups?: number; press?: number }; last_update?: string }) ?? {};
    const victims = (Array.isArray(victimsJson) ? (victimsJson as VictimRaw[]) : []).map(mapVictim);
    victims.sort((a, b) => (b.discovered > a.discovered ? 1 : b.discovered < a.discovered ? -1 : 0));

    const counts = new Map<string, number>();
    for (const v of victims) if (v.group) counts.set(v.group, (counts.get(v.group) ?? 0) + 1);
    const topGroups = [...counts.entries()]
      .map(([group, count]) => ({ group, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Larger recent slice for client-side country/sector filtering in the UI.
    const slice = victims.slice(0, Math.max(recentLimit, 200));
    const countryCounts = new Map<string, number>();
    const sectorCounts = new Map<string, number>();
    for (const v of slice) {
      if (v.country) countryCounts.set(v.country, (countryCounts.get(v.country) ?? 0) + 1);
      if (v.activity && v.activity !== 'Not Found')
        sectorCounts.set(v.activity, (sectorCounts.get(v.activity) ?? 0) + 1);
    }
    const countries = [...countryCounts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);
    const sectors = [...sectorCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const data: RansomwareLandscape = {
      stats: {
        victims: s.stats?.victims ?? victims.length,
        groups: s.stats?.groups ?? counts.size,
        press: s.stats?.press ?? 0,
        lastUpdate: s.last_update ?? '',
      },
      recent: victims.slice(0, recentLimit),
      indonesia: victims.filter((v) => v.country === 'ID').slice(0, recentLimit),
      topGroups,
      victims: slice,
      countries,
      sectors,
    };
    cache = { at: now, data };
    return data;
  } catch {
    return cache?.data ?? empty;
  }
}
