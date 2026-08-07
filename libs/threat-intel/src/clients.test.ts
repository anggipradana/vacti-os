import { describe, it, expect, vi } from 'vitest';
import { fetchOtxIndicator } from './otx';
import { fetchLeaks, md5 } from './leakcheck';

const jsonRes = (data: unknown, ok = true): Response => ({ ok, json: async () => data }) as unknown as Response;

describe('OTX client', () => {
  it('returns null without an API key (graceful degrade)', async () => {
    expect(await fetchOtxIndicator('example.com', {})).toBeNull();
  });

  it('aggregates general/malware/passive/url sections', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/general')) return jsonRes({ pulse_info: { count: 3 }, reputation: 40 });
      if (url.includes('/malware')) return jsonRes({ count: 2 });
      if (url.includes('/passive_dns')) return jsonRes({ passive_dns: [{ address: '1.1.1.1' }] });
      if (url.includes('/url_list')) return jsonRes({ url_list: [{ url: 'http://x' }] });
      return jsonRes({});
    });
    const r = await fetchOtxIndicator('example.com', { apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).not.toBeNull();
    expect(r!.pulses).toBe(3);
    expect(r!.malwareCount).toBe(2);
    expect(r!.reputation).toBe(40);
    expect(r!.passiveDns).toHaveLength(1);
    expect(r!.urls).toHaveLength(1);
  });

  it('never throws on network error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network');
    });
    const r = await fetchOtxIndicator('example.com', { apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toEqual({
      indicator: 'example.com',
      pulses: 0,
      malwareCount: 0,
      reputation: 0,
      passiveDns: [],
      urls: [],
    });
  });
});

describe('LeakCheck client', () => {
  it('returns an empty result without an API key', async () => {
    expect(await fetchLeaks('example.com', {})).toEqual({ records: [], found: 0, truncated: false });
  });

  it('maps results with stable md5 ids (over source:identifier:password:origin) and dedupes', async () => {
    // fetchLeaks queries both the domain and origin indexes; identical rows dedupe by hash.
    const fetchImpl = vi.fn(async () => jsonRes({ result: [{ source: { name: 'BreachX' }, email: 'a@example.com' }] }));
    const r = await fetchLeaks('example.com', { apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.records).toHaveLength(1);
    expect(r.records[0]!.source).toBe('BreachX');
    expect(r.records[0]!.identifier).toBe('a@example.com');
    expect(r.records[0]!.hashMd5).toBe(md5('BreachX:a@example.com::'));
  });

  it('keeps distinct credentials (same email, different password) and captures origin', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonRes({
        result: [
          { source: { name: 'Stealer' }, email: 'a@example.com', password: 'p1', origin: ['x.test'] },
          { source: { name: 'Stealer' }, email: 'a@example.com', password: 'p2', origin: ['x.test'] },
        ],
      }),
    );
    const r = await fetchLeaks('example.com', { apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });
    // Both passwords kept (not collapsed); origin captured.
    expect(r.records).toHaveLength(2);
    expect(new Set(r.records.map((x) => x.password))).toEqual(new Set(['p1', 'p2']));
    expect(r.records[0]!.origin).toBe('x.test');
  });

  it('reports the found total and flags truncation when a query hits the 1000-row cap', async () => {
    const big = Array.from({ length: 1000 }, (_, i) => ({ source: { name: 'B' }, email: `u${i}@example.com` }));
    const fetchImpl = vi.fn(async () => jsonRes({ found: 4200, result: big }));
    const r = await fetchLeaks('example.com', { apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.found).toBe(4200);
    expect(r.truncated).toBe(true);
    const small = vi.fn(async () => jsonRes({ found: 3, result: [{ source: { name: 'B' }, email: 'a@example.com' }] }));
    const r2 = await fetchLeaks('example.com', { apiKey: 'k', fetchImpl: small as unknown as typeof fetch });
    expect(r2.found).toBe(3);
    expect(r2.truncated).toBe(false);
  });
});

describe('searchLeaks unsupported-query skip (avoids LeakCheck 400/422)', () => {
  it('SKIPS any query LeakCheck cannot serve (spaces, commas, non-ASCII) without calling the API', async () => {
    const { searchLeaks } = await import('./leakcheck');
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ success: true, found: 0, result: [] }) }));
    for (const bad of ['Muhammad Sirajuth Thayyib', 'Budi,Santoso', 'Étienne', ') 08123456789', 'a b']) {
      const r = await searchLeaks(bad, { key: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });
      expect(r).toEqual({ records: [], found: 0, truncated: false });
    }
    expect(fetchImpl).not.toHaveBeenCalled(); // none of these ever hit LeakCheck -> no "Invalid characters" 4xx
    // Structured ids (email / username / domain / phone-digits / hash) DO query.
    for (const ok of ['someuser', 'a@b.com', 'example.com', '08123456789', 'user.name-1']) {
      await searchLeaks(ok, { key: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });
    }
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it('degrades a LeakCheck 400/422 to a silent empty (no error surfaced), keeps 401 as a real error', async () => {
    const { searchLeaks } = await import('./leakcheck');
    const mk = (status: number) =>
      vi.fn(async () => ({ ok: false, status, json: async () => ({ error: 'Invalid characters in query' }) }));
    expect(await searchLeaks('gooduser', { key: 'k', fetchImpl: mk(400) as unknown as typeof fetch })).toEqual({
      records: [],
      found: 0,
      truncated: false,
    });
    expect(await searchLeaks('gooduser', { key: 'k', fetchImpl: mk(422) as unknown as typeof fetch })).toEqual({
      records: [],
      found: 0,
      truncated: false,
    });
    const r401 = await searchLeaks('gooduser', { key: 'k', fetchImpl: mk(401) as unknown as typeof fetch });
    expect(r401.error).toBeTruthy(); // a bad key IS a real error
  });
});
