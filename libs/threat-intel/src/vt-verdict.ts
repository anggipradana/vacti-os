import type { FetchLike } from './otx';

/**
 * VirusTotal v3 reputation lookup for monitored assets (manual indicators): are the company's
 * public IPs / domains flagged by AV engines? Returns last_analysis_stats, or null when the key is
 * missing, the lookup fails, or the API rate-limits (callers keep the previous verdict).
 * HTTP-API client only (approved passive source) - no binary, no scanning.
 */
export interface VtVerdictStats {
  malicious: number;
  suspicious: number;
  harmless: number;
  undetected: number;
  total: number;
}

export async function fetchVtVerdict(
  value: string,
  kind: 'ip' | 'domain',
  opts: { apiKey?: string; fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<VtVerdictStats | null> {
  const { apiKey, fetchImpl = fetch, timeoutMs = 12_000 } = opts;
  if (!apiKey) return null;
  const path = kind === 'ip' ? 'ip_addresses' : 'domains';
  const url = `https://www.virustotal.com/api/v3/${path}/${encodeURIComponent(value)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { headers: { 'x-apikey': apiKey }, signal: ctrl.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { attributes?: { last_analysis_stats?: Record<string, number> } };
    };
    const stats = json.data?.attributes?.last_analysis_stats;
    if (!stats) return null;
    const malicious = Number(stats.malicious ?? 0);
    const suspicious = Number(stats.suspicious ?? 0);
    const harmless = Number(stats.harmless ?? 0);
    const undetected = Number(stats.undetected ?? 0);
    return { malicious, suspicious, harmless, undetected, total: malicious + suspicious + harmless + undetected };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Combine VT engine stats + OTX pulse count into one explainable verdict.
 * - malicious: 2+ VT engines flag it, or 1 engine AND OTX pulses corroborate.
 * - suspicious: a single VT detection, VT "suspicious" votes, or OTX pulses alone.
 * - clean: checked and nothing flagged. (unknown = never checked / no data.)
 */
export function computeIndicatorVerdict(
  vt: VtVerdictStats | null,
  otxPulses: number | null,
): 'malicious' | 'suspicious' | 'clean' | 'unknown' {
  if (!vt && otxPulses === null) return 'unknown';
  const mal = vt?.malicious ?? 0;
  const sus = vt?.suspicious ?? 0;
  const pulses = otxPulses ?? 0;
  if (mal >= 2 || (mal >= 1 && pulses > 0)) return 'malicious';
  if (mal === 1 || sus > 0 || pulses > 0) return 'suspicious';
  return 'clean';
}
