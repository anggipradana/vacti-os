import { describe, it, expect } from 'vitest';
import { scanExposure, EXPOSURE_RULES } from './exposure';
import { pathnameExtension, categorizeUrl, buildSuffixIndex, DEFAULT_CATEGORIES } from './categorize';
import { assertUrlSafeForServerFetch, isUrlSafeForServerFetch, isPrivateOrLoopbackHost } from './ssrf';
import { deepFetch } from './deepfetch';
import { analyzeEndpoints } from './endpoints';
import { fetchUrlscan } from './urlscan';
import { makeProxyDispatcher } from './proxy';
import { fetchWaybackUrls } from './wayback';
import {
  discoverSubdomains,
  harvestResolutions,
  harvestUndetectedUrls,
  hostUnderTarget,
  fetchVtDomainReport,
  type VtDomainReport,
} from './virustotal';

describe('exposure regex', () => {
  it('detects an AWS key and a github token', () => {
    const hits = scanExposure('start AKIAIOSFODNN7EXAMPLE then ghp_' + 'a'.repeat(36) + ' end');
    const types = hits.map((h) => h.type);
    expect(types).toContain('aws-key');
    expect(types).toContain('github-token');
  });

  it('extracts the value (capture group) for credential-like, not the prefix', () => {
    const hits = scanExposure('config: password=Sup3rSecretValue&x=1');
    const cred = hits.find((h) => h.type === 'credential-like');
    expect(cred?.snippet).toBe('Sup3rSecretValue');
  });

  it('claims overlaps by priority (specific wins over generic email)', () => {
    // basic-auth-url (priority 20) overlaps an email-looking host; both rules touch the span.
    const hits = scanExposure('https://user:secretpw@host.example.com/path');
    expect(hits.some((h) => h.type === 'basic-auth-url')).toBe(true);
  });

  it('detects stealer/combo-list credentials', () => {
    const hits = scanExposure('https://site.com/login:victim@mail.com:hunter2pass');
    expect(hits.some((h) => h.type === 'combo-list-cred')).toBe(true);
  });

  it('returns nothing for clean text and is prefilter-fast', () => {
    expect(scanExposure('just an ordinary sentence with no secrets')).toEqual([]);
    expect(scanExposure('')).toEqual([]);
  });

  it('honours a filtered rule set (analyst toggles)', () => {
    const onlyAws = EXPOSURE_RULES.filter((r) => r.type === 'aws-key');
    const hits = scanExposure('AKIAIOSFODNN7EXAMPLE ghp_' + 'b'.repeat(36), onlyAws);
    expect(hits.map((h) => h.type)).toEqual(['aws-key']);
  });

  it('does not flag asset filenames (retina images, bundles) as emails', () => {
    for (const f of [
      'https://x.com/img/satinweave_@2X.png',
      'https://x.com/logo@2x.png',
      'https://x.com/sprite@3x.webp',
      'https://cdn.x.com/bundle@v2.js',
      'icon@2x.svg',
    ]) {
      expect(scanExposure(f).some((h) => h.type === 'email')).toBe(false);
    }
  });

  it('still flags real emails', () => {
    expect(scanExposure('contact analyst@bank.co.id today').some((h) => h.type === 'email')).toBe(true);
    expect(scanExposure('user@example.com').some((h) => h.type === 'email')).toBe(true);
  });

  it('credit-card requires a valid Luhn checksum (no false positives on random ids)', () => {
    expect(scanExposure('card 4111111111111111 ok').some((h) => h.type === 'credit-card')).toBe(true);
    // Same prefix/length but Luhn-invalid (a tracking id / random number) - must not be flagged.
    expect(scanExposure('id=4111111111111112').some((h) => h.type === 'credit-card')).toBe(false);
    expect(scanExposure('seq 4408172906405551').some((h) => h.type === 'credit-card')).toBe(false);
  });
});

describe('url categorization', () => {
  it('extracts pathname extension ignoring query', () => {
    expect(pathnameExtension('https://x.com/a/b/backup.sql?v=1')).toBe('.sql');
    expect(pathnameExtension('https://x.com/no-ext')).toBeNull();
  });

  it('categorises sensitive files', () => {
    const idx = buildSuffixIndex();
    expect(categorizeUrl('https://x.com/db/backup.sql', idx).categorySlug).toBe('db-dumps');
    expect(categorizeUrl('https://x.com/.env', idx).categorySlug).toBe('configs');
    expect(categorizeUrl('https://x.com/id_rsa.pem', idx).categorySlug).toBe('keys');
  });

  it('prefers the longest multi-part suffix (.tar.gz over .gz)', () => {
    const res = categorizeUrl('https://x.com/site-backup.tar.gz');
    expect(res.extension).toBe('.tar.gz');
    expect(res.categorySlug).toBe('backups');
  });

  it('default categories include backups/configs/keys', () => {
    const slugs = DEFAULT_CATEGORIES.map((c) => c.slug);
    expect(slugs).toEqual(expect.arrayContaining(['backups', 'configs', 'keys', 'db-dumps']));
  });
});

describe('ssrf guard', () => {
  it('allows a normal public https URL', () => {
    expect(isUrlSafeForServerFetch('https://example.com/app.js')).toBe(true);
  });
  it('blocks localhost, metadata, private + reserved IPs and non-http', () => {
    expect(isUrlSafeForServerFetch('http://localhost/x')).toBe(false);
    expect(isUrlSafeForServerFetch('http://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isUrlSafeForServerFetch('http://10.0.0.5/')).toBe(false);
    expect(isUrlSafeForServerFetch('http://192.168.1.1/')).toBe(false);
    expect(isUrlSafeForServerFetch('http://127.0.0.1/')).toBe(false);
    expect(isUrlSafeForServerFetch('ftp://example.com/')).toBe(false);
    expect(isUrlSafeForServerFetch('http://api.internal/')).toBe(false);
    expect(() => assertUrlSafeForServerFetch('not a url')).toThrow();
  });
  it('isPrivateOrLoopbackHost flags loopback/private/reserved hosts, allows public', () => {
    for (const h of [
      '127.0.0.1',
      '10.0.0.5',
      '192.168.1.1',
      '169.254.169.254',
      'localhost',
      'foo.local',
      '::1',
      '2130706433',
    ])
      expect(isPrivateOrLoopbackHost(h)).toBe(true);
    for (const h of ['example.com', 'api.example.com', '8.8.8.8', '1.1.1.1']) expect(isPrivateOrLoopbackHost(h)).toBe(false);
  });
  it('blocks IPv4-mapped IPv6, numeric-host encodings, and extra reserved ranges', () => {
    expect(isUrlSafeForServerFetch('http://[::ffff:169.254.169.254]/')).toBe(false); // mapped metadata IP
    expect(isUrlSafeForServerFetch('http://[::ffff:127.0.0.1]/')).toBe(false);
    expect(isUrlSafeForServerFetch('http://[::ffff:7f00:1]/')).toBe(false); // hex-group mapped 127.0.0.1
    expect(isUrlSafeForServerFetch('http://[::1]/')).toBe(false);
    expect(isUrlSafeForServerFetch('http://2130706433/')).toBe(false); // decimal 127.0.0.1
    expect(isUrlSafeForServerFetch('http://0x7f000001/')).toBe(false); // hex 127.0.0.1
    expect(isUrlSafeForServerFetch('http://100.64.1.1/')).toBe(false); // CGNAT
    expect(isUrlSafeForServerFetch('http://198.18.0.1/')).toBe(false); // benchmarking
    expect(isUrlSafeForServerFetch('http://224.0.0.1/')).toBe(false); // multicast
    expect(isUrlSafeForServerFetch('http://192.0.2.10/')).toBe(false); // TEST-NET-1
  });
});

describe('virustotal harvesters', () => {
  const report: VtDomainReport = {
    subdomains: ['www.example.com', 'API.example.com.'],
    domain_siblings: ['sibling.example.com'],
    undetected_urls: [
      ['https://hidden.example.com/app.js', 0, 0, 0, '2026-04-17 02:50:25'],
      'https://other.notexample.com/x',
    ],
    resolutions: [
      { ip_address: '203.0.113.7', last_resolved: '2026-01-02 03:04:05' },
      { ip_address: 'bad', last_resolved: 'nope' },
    ],
  };

  it('discovers subdomains from list + siblings + urls (under target only)', () => {
    const subs = discoverSubdomains(report, 'example.com');
    expect(subs).toEqual(
      expect.arrayContaining(['www.example.com', 'api.example.com', 'sibling.example.com', 'hidden.example.com']),
    );
    expect(subs).not.toContain('other.notexample.com');
  });

  it('parses undetected urls with VT dates', () => {
    const urls = harvestUndetectedUrls(report);
    expect(urls[0]!.url).toBe('https://hidden.example.com/app.js');
    expect(urls[0]!.date?.toISOString()).toBe('2026-04-17T02:50:25.000Z');
  });

  it('parses resolutions and drops malformed rows', () => {
    const res = harvestResolutions(report);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ ipAddress: '203.0.113.7' });
  });

  it('hostUnderTarget matches apex + subdomains only', () => {
    expect(hostUnderTarget('https://a.example.com/x', 'example.com')).toBe('a.example.com');
    expect(hostUnderTarget('https://evil.com/x', 'example.com')).toBeNull();
  });

  it('fetchVtDomainReport returns parsed data via injected fetch', async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ subdomains: ['a.example.com'] }), { status: 200 })) as typeof fetch;
    const r = await fetchVtDomainReport({ apiKey: 'k', domain: 'example.com', fetchImpl: fakeFetch });
    expect(r.status).toBe(200);
    expect(r.data.subdomains).toEqual(['a.example.com']);
  });

  it('fetchVtDomainReport maps network error to 599', async () => {
    const boom = (async () => {
      throw new Error('net down');
    }) as typeof fetch;
    const r = await fetchVtDomainReport({ apiKey: 'k', domain: 'x.com', fetchImpl: boom });
    expect(r.status).toBe(599);
  });
});

describe('endpoint/param discovery', () => {
  it('extracts param frequencies and auth endpoints', () => {
    const r = analyzeEndpoints([
      'https://x.com/search?q=a&page=1',
      'https://x.com/list?page=2',
      'https://x.com/admin/login',
      'https://x.com/blog/post',
    ]);
    expect(r.params[0]).toEqual({ name: 'page', count: 2 }); // most frequent first
    expect(r.params.map((p) => p.name)).toContain('q');
    expect(r.authEndpoints).toContain('https://x.com/admin/login');
    expect(r.authEndpoints).not.toContain('https://x.com/blog/post');
  });

  it('handles junk input safely', () => {
    const r = analyzeEndpoints(['not a url', '']);
    expect(r.paramCount).toBe(0);
    expect(r.authCount).toBe(0);
  });
});

describe('proxy dispatcher factory', () => {
  it('returns a dispatcher for http and socks URLs, undefined otherwise', () => {
    expect(makeProxyDispatcher('http://127.0.0.1:8080')).toBeDefined();
    expect(makeProxyDispatcher('socks5://127.0.0.1:1080')).toBeDefined();
    expect(makeProxyDispatcher('')).toBeUndefined();
    expect(makeProxyDispatcher('not a url')).toBeUndefined();
    expect(makeProxyDispatcher('ftp://x')).toBeUndefined();
  });
});

describe('urlscan client', () => {
  it('harvests page/task URLs + IP resolutions via injected fetch', async () => {
    const payload = {
      results: [
        {
          page: { url: 'https://a.example.com/x', domain: 'a.example.com', ip: '203.0.113.9' },
          task: { url: 'https://a.example.com/y' },
        },
      ],
    };
    const fakeFetch = (async () => new Response(JSON.stringify(payload), { status: 200 })) as typeof fetch;
    const r = await fetchUrlscan('example.com', { fetchImpl: fakeFetch });
    expect(r.urls).toEqual(expect.arrayContaining(['https://a.example.com/x', 'https://a.example.com/y']));
    expect(r.resolutions[0]).toMatchObject({ ip: '203.0.113.9', host: 'a.example.com' });
  });
  it('degrades to empty on non-ok', async () => {
    const bad = (async () => new Response('rate limited', { status: 429 })) as typeof fetch;
    expect(await fetchUrlscan('x.com', { fetchImpl: bad })).toEqual({ urls: [], resolutions: [] });
  });
});

describe('deep-fetch', () => {
  it('blocks SSRF targets before any fetch', async () => {
    let called = false;
    const spy = (async () => {
      called = true;
      return new Response('x', { status: 200 });
    }) as typeof fetch;
    const r = await deepFetch('http://169.254.169.254/latest/meta-data', { fetchImpl: spy });
    expect(r.blocked).toBe(true);
    expect(called).toBe(false);
  });

  it('fetches a public URL body (size-capped) via injected fetch', async () => {
    const fakeFetch = (async () => new Response('AKIAIOSFODNN7EXAMPLE secret body', { status: 200 })) as typeof fetch;
    const r = await deepFetch('https://example.com/app.js', { fetchImpl: fakeFetch, maxBytes: 10 });
    expect(r.blocked).toBe(false);
    expect(r.status).toBe(200);
    expect(r.body.length).toBeLessThanOrEqual(10);
  });
});

describe('wayback client', () => {
  it('parses CDX lines + queries the whole domain (subdomains via matchType=domain)', async () => {
    let calledUrl = '';
    const fakeFetch = (async (u: string) => {
      calledUrl = u;
      return new Response('https://example.com/a\nhttps://api.example.com/b\n', { status: 200 });
    }) as typeof fetch;
    const urls = await fetchWaybackUrls('example.com', { fetchImpl: fakeFetch });
    expect(urls).toEqual(['https://example.com/a', 'https://api.example.com/b']);
    // Must request the domain + all subdomains, not just the apex host's paths.
    expect(calledUrl).toContain('matchType=domain');
    expect(calledUrl).not.toContain('example.com/*');
  });

  it('returns [] on non-ok and respects limit', async () => {
    const ok = (async () => new Response('a\nb\nc\n', { status: 200 })) as typeof fetch;
    expect(await fetchWaybackUrls('x', { fetchImpl: ok, limit: 2 })).toEqual(['a', 'b']);
    const bad = (async () => new Response('', { status: 404 })) as typeof fetch;
    expect(await fetchWaybackUrls('x', { fetchImpl: bad })).toEqual([]);
  });
});
