import { describe, it, expect, vi } from 'vitest';
import { fetchVtVerdict, computeIndicatorVerdict } from './vt-verdict';

const vtResponse = (stats: Record<string, number>) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({ data: { attributes: { last_analysis_stats: stats } } }),
  }) as Response;

describe('fetchVtVerdict', () => {
  it('parses last_analysis_stats for an ip', async () => {
    const f = vi.fn(async () => vtResponse({ malicious: 3, suspicious: 1, harmless: 60, undetected: 30 }));
    const r = await fetchVtVerdict('203.0.113.10', 'ip', { apiKey: 'k', fetchImpl: f as unknown as typeof fetch });
    expect(r).toEqual({ malicious: 3, suspicious: 1, harmless: 60, undetected: 30, total: 94 });
    expect(f).toHaveBeenCalledWith(
      'https://www.virustotal.com/api/v3/ip_addresses/203.0.113.10',
      expect.objectContaining({ headers: { 'x-apikey': 'k' } }),
    );
  });
  it('uses the domains endpoint for domains', async () => {
    const f = vi.fn(async () => vtResponse({ malicious: 0, suspicious: 0, harmless: 70, undetected: 20 }));
    await fetchVtVerdict('example.com', 'domain', { apiKey: 'k', fetchImpl: f as unknown as typeof fetch });
    expect(f).toHaveBeenCalledWith('https://www.virustotal.com/api/v3/domains/example.com', expect.anything());
  });
  it('returns null without a key, on http errors, and on malformed bodies', async () => {
    expect(await fetchVtVerdict('example.com', 'domain', {})).toBeNull();
    const err = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }) as Response);
    expect(await fetchVtVerdict('example.com', 'domain', { apiKey: 'k', fetchImpl: err as never })).toBeNull();
    const bad = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response);
    expect(await fetchVtVerdict('example.com', 'domain', { apiKey: 'k', fetchImpl: bad as never })).toBeNull();
  });
});

describe('computeIndicatorVerdict', () => {
  const vt = (malicious: number, suspicious = 0) => ({
    malicious,
    suspicious,
    harmless: 50,
    undetected: 30,
    total: 80 + malicious + suspicious,
  });
  it('flags malicious on 2+ engines, or 1 engine corroborated by OTX', () => {
    expect(computeIndicatorVerdict(vt(2), 0)).toBe('malicious');
    expect(computeIndicatorVerdict(vt(1), 3)).toBe('malicious');
  });
  it('flags suspicious on a single engine, suspicious votes, or pulses alone', () => {
    expect(computeIndicatorVerdict(vt(1), 0)).toBe('suspicious');
    expect(computeIndicatorVerdict(vt(0, 2), 0)).toBe('suspicious');
    expect(computeIndicatorVerdict(null, 2)).toBe('suspicious');
  });
  it('is clean when checked and nothing flagged, unknown when never checked', () => {
    expect(computeIndicatorVerdict(vt(0), 0)).toBe('clean');
    expect(computeIndicatorVerdict(null, 0)).toBe('clean');
    expect(computeIndicatorVerdict(null, null)).toBe('unknown');
  });
});
