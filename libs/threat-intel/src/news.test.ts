import { describe, it, expect } from 'vitest';
import { parseFeed, matchesSector, fetchSectorNews, sectorSearchUrl, sectorFeeds, isSecurityRelated } from './news';

const RSS = `<?xml version="1.0"?><rss><channel>
  <item><title>Major bank hit by phishing fraud</title><link>https://x/1</link>
    <pubDate>Wed, 04 Jun 2026 10:00:00 GMT</pubDate><description><![CDATA[A <b>bank</b> lost funds to wire transfer fraud.]]></description></item>
  <item><title>New gardening tips for spring</title><link>https://x/2</link>
    <pubDate>Wed, 04 Jun 2026 09:00:00 GMT</pubDate><description>Unrelated lifestyle content.</description></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
  <entry><title>CISA advisory on ICS SCADA</title><link href="https://c/1"/>
    <updated>2026-06-04T08:00:00Z</updated><summary>Energy grid SCADA vulnerability.</summary></entry>
</feed>`;

describe('news parseFeed', () => {
  it('parses RSS items (title/link/date/summary, strips html/cdata)', () => {
    const items = parseFeed(RSS, 'Test');
    expect(items).toHaveLength(2);
    expect(items[0]!.title).toContain('bank');
    expect(items[0]!.link).toBe('https://x/1');
    expect(items[0]!.summary).not.toContain('<b>');
    expect(items[0]!.publishedAt).toBeInstanceOf(Date);
  });
  it('parses Atom entries with href links', () => {
    const items = parseFeed(ATOM, 'CISA');
    expect(items).toHaveLength(1);
    expect(items[0]!.link).toBe('https://c/1');
  });
});

describe('matchesSector', () => {
  const items = parseFeed(RSS, 'Test');
  it('keeps sector-relevant items, drops the rest', () => {
    expect(matchesSector(items[0]!, 'banking')).toBe(true);
    expect(matchesSector(items[1]!, 'banking')).toBe(false);
  });
  it('general matches everything', () => {
    expect(matchesSector(items[1]!, 'general')).toBe(true);
  });
  it('matches Indonesian-language headlines for the banking sector', () => {
    const ID_RSS = `<?xml version="1.0"?><rss><channel>
      <item><title>Waspada penipuan perbankan lewat tautan palsu</title><link>https://id/1</link>
        <pubDate>Wed, 04 Jun 2026 10:00:00 GMT</pubDate><description><![CDATA[Modus peretasan dan kebocoran data nasabah.]]></description></item>
    </channel></rss>`;
    const idItems = parseFeed(ID_RSS, 'ID Source');
    expect(idItems).toHaveLength(1);
    expect(matchesSector(idItems[0]!, 'banking')).toBe(true);
  });
  it('does not mis-bucket on substring keywords (word boundary)', () => {
    const mk = (title: string) => ({ title, link: 'https://x/1', source: 's', summary: '', publishedAt: null });
    // "oil" must not match "turmoil", "gas" must not match "Vegas", "ics" must not match "politics".
    expect(matchesSector(mk('Market turmoil hits stocks'), 'energy')).toBe(false);
    expect(matchesSector(mk('Las Vegas casino reopens'), 'energy')).toBe(false);
    expect(matchesSector(mk('Politics and economics roundup'), 'energy')).toBe(false);
    // a real whole-word keyword still matches
    expect(matchesSector(mk('Oil prices climb today'), 'energy')).toBe(true);
  });
});

describe('fetchSectorNews', () => {
  it('aggregates + filters + dedupes + degrades on a bad feed', async () => {
    const feeds = [
      { url: 'ok', source: 'A' },
      { url: 'bad', source: 'B' },
      { url: 'dup', source: 'C' },
    ];
    const fetchImpl = (async (url: string) => {
      if (url === 'bad') throw new Error('network');
      return { ok: true, text: async () => RSS } as Response;
    }) as typeof fetch;
    const news = await fetchSectorNews('banking', { feeds, fetchImpl });
    // Both 'ok' and 'dup' return the same banking item (link https://x/1) → deduped to 1.
    expect(news).toHaveLength(1);
    expect(news[0]!.link).toBe('https://x/1');
  });
});

describe('isSecurityRelated', () => {
  const [sec] = parseFeed(RSS, 'T'); // "Major bank hit by phishing fraud"
  it('keeps cyber-security items, drops generic sector/lifestyle news', () => {
    expect(isSecurityRelated(sec!)).toBe(true);
    const generic = parseFeed(
      `<rss><channel><item><title>Bank opens a new branch in Bali</title><link>https://b/1</link><description>Grand opening event.</description></item></channel></rss>`,
      'T',
    )[0]!;
    expect(isSecurityRelated(generic)).toBe(false);
  });
});

describe('fetchSectorNews relevance filter', () => {
  it('drops sector-matching but non-security items from general (non-curated) feeds', async () => {
    const NOISY = `<rss><channel>
      <item><title>Bank opens a new branch in Bali</title><link>https://n/1</link><description>Grand opening.</description></item>
      <item><title>Bank customers hit by phishing breach</title><link>https://n/2</link><description>Credentials stolen.</description></item>
    </channel></rss>`;
    const feeds = [{ url: 'gen', source: 'General' }]; // no curated flag → security filter applies
    const fetchImpl = (async () => ({ ok: true, text: async () => NOISY }) as Response) as typeof fetch;
    const news = await fetchSectorNews('banking', { feeds, fetchImpl });
    expect(news.map((n) => n.link)).toEqual(['https://n/2']); // only the security one survives
  });

  it('keeps all sector items from curated security feeds (no extra security-term filter)', async () => {
    const CURATED = `<rss><channel>
      <item><title>Banking sector regulatory roundup</title><link>https://c/1</link><description>bank policy news</description></item>
    </channel></rss>`;
    const feeds = [{ url: 'sec', source: 'SecFeed', curated: true }];
    const fetchImpl = (async () => ({ ok: true, text: async () => CURATED }) as Response) as typeof fetch;
    const news = await fetchSectorNews('banking', { feeds, fetchImpl });
    expect(news).toHaveLength(1); // curated → kept despite no explicit security term
  });
});

describe('sector search augmentation', () => {
  it('builds a sector-targeted Google News query with keywords + security qualifier', () => {
    const url = sectorSearchUrl('energy');
    expect(url).toContain('news.google.com/rss/search');
    expect(decodeURIComponent(url)).toContain('keamanan siber');
    // An energy keyword should appear in the query (SECTORS.energy includes energy terms).
    expect(decodeURIComponent(url).toLowerCase()).toMatch(/energ|listrik|pln|grid|scada/);
  });
  it('general (no keywords) falls back to a generic security query', () => {
    expect(decodeURIComponent(sectorSearchUrl('general'))).toContain('ransomware');
  });
  it('sectorFeeds appends the sector search to the curated feeds', () => {
    const feeds = sectorFeeds('banking');
    expect(feeds.length).toBeGreaterThan(1);
    expect(feeds.some((f) => f.source === 'Google News (sector)')).toBe(true);
  });
});
