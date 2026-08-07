export type FetchLike = typeof fetch;

export interface OtxResult {
  indicator: string;
  pulses: number;
  malwareCount: number;
  reputation: number; // 0..100, higher = worse
  passiveDns: unknown[];
  urls: unknown[];
}

const BASE = 'https://otx.alienvault.com/api/v1/indicators';

/**
 * Fetch OTX AlienVault data for a domain/IP indicator. Returns null when no API key is configured
 * (feature degrades gracefully). Network/parse errors per-section default to empty, never throw.
 */
export async function fetchOtxIndicator(
  indicator: string,
  opts: { apiKey?: string; type?: 'domain' | 'IPv4'; fetchImpl?: FetchLike } = {},
): Promise<OtxResult | null> {
  const { apiKey, type = 'domain', fetchImpl = fetch } = opts;
  if (!apiKey) return null;

  const get = async (section: string): Promise<Record<string, unknown>> => {
    try {
      const res = await fetchImpl(`${BASE}/${type}/${encodeURIComponent(indicator)}/${section}`, {
        headers: { 'X-OTX-API-KEY': apiKey },
      });
      if (!res.ok) return {};
      return (await res.json()) as Record<string, unknown>;
    } catch {
      return {};
    }
  };

  const [general, malware, passive, urlList] = await Promise.all([
    get('general'),
    get('malware'),
    get('passive_dns'),
    get('url_list'),
  ]);

  const pulseInfo = (general.pulse_info ?? {}) as { count?: number };
  const reputationRaw = (general.reputation ?? 0) as number | { threat_score?: number } | null;
  const reputation =
    typeof reputationRaw === 'number'
      ? Math.max(0, Math.min(100, reputationRaw))
      : Math.min(100, ((reputationRaw?.threat_score ?? 0) as number) || (pulseInfo.count ?? 0) * 8);

  return {
    indicator,
    pulses: pulseInfo.count ?? 0,
    malwareCount: ((malware.count ?? 0) as number) || (((malware.data ?? []) as unknown[]).length ?? 0),
    reputation: Math.min(100, reputation),
    passiveDns: ((passive.passive_dns ?? []) as unknown[]).slice(0, 50),
    urls: ((urlList.url_list ?? []) as unknown[]).slice(0, 50),
  };
}
