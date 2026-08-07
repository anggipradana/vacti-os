type FetchLike = typeof fetch;

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  summary: string;
  publishedAt: Date | null;
}

/** Sector → relevance keywords (lowercased substring match on title+summary). 'general' = no filter. */
export const SECTORS: Record<string, string[]> = {
  banking: [
    'bank',
    'banking',
    'financial',
    'finance',
    'fintech',
    'swift',
    'payment',
    'atm',
    'card',
    'fraud',
    'credential',
    'phishing',
    'wire transfer',
    // Indonesian-language keywords
    'perbankan',
    'keuangan',
    'penipuan',
    'peretasan',
    'bocor',
    'siber',
  ],
  healthcare: [
    'hospital',
    'health',
    'healthcare',
    'medical',
    'patient',
    'ehr',
    'pharma',
    'clinic',
    // Indonesian-language keywords
    'rumah sakit',
    'kesehatan',
  ],
  government: [
    'government',
    'govt',
    'public sector',
    'election',
    'municipal',
    'federal',
    'espionage',
    'state-sponsored',
    // Indonesian-language keywords
    'pemerintah',
    'pemilu',
  ],
  energy: [
    'energy',
    'power grid',
    'grid',
    'scada',
    'ics',
    'ot security',
    'utility',
    'oil',
    'gas',
    'nuclear',
    // Indonesian-language keywords
    'pln',
    'pertamina',
    'energi',
  ],
  technology: [
    'saas',
    'cloud',
    'software supply chain',
    'zero-day',
    'zero day',
    'npm',
    'github',
    'api key',
    'devops',
    // Indonesian-language keywords
    'siber',
    'keamanan siber',
  ],
  retail: [
    'retail',
    'e-commerce',
    'ecommerce',
    'point of sale',
    'pos malware',
    'magecart',
    'skimmer',
    'checkout',
    // Indonesian-language keywords
    'ritel',
    'belanja',
  ],
  general: [],
};

export type SectorName = keyof typeof SECTORS;

export function isSector(s: unknown): s is SectorName {
  return typeof s === 'string' && s in SECTORS;
}

export interface Feed {
  url: string;
  source: string;
  /** Curated = a security-only source (no extra security-term filter). General sources are filtered. */
  curated?: boolean;
}

/** Key-less news feeds. The first group is security-only; the rest are general and get filtered. */
export const FEEDS: Feed[] = [
  { url: 'https://feeds.feedburner.com/TheHackersNews', source: 'The Hacker News', curated: true },
  { url: 'https://www.bleepingcomputer.com/feed/', source: 'BleepingComputer', curated: true },
  { url: 'https://krebsonsecurity.com/feed/', source: 'KrebsOnSecurity', curated: true },
  { url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml', source: 'CISA', curated: true },
  { url: 'https://www.securityweek.com/feed/', source: 'SecurityWeek', curated: true },
  // General Indonesian coverage - sector keyword AND a security term must both match (cuts noise).
  {
    url: 'https://news.google.com/rss/search?q=keamanan+siber+OR+peretasan+OR+bocor+data&hl=id&gl=ID&ceid=ID:id',
    source: 'Google News (ID)',
  },
  { url: 'https://www.cnnindonesia.com/teknologi/rss', source: 'CNN Indonesia Teknologi' },
  { url: 'https://inet.detik.com/rss', source: 'detikInet' },
];

/**
 * Security/cyber terms (EN + ID). Used to keep only genuinely security-related items from general
 * (non-curated) feeds - without this, "bank opens new branch" leaks in via the sector keyword alone.
 */
const SECURITY_TERMS = [
  'breach',
  'hack',
  'hacked',
  'ransomware',
  'phishing',
  'malware',
  'spyware',
  'exploit',
  'vulnerabilit',
  'cve-',
  'zero-day',
  'zero day',
  'ddos',
  'data leak',
  'leaked',
  'stolen data',
  'cyber',
  'botnet',
  'backdoor',
  'trojan',
  'infostealer',
  'credential',
  'unauthorized',
  'security advisory',
  'data breach',
  // Indonesian
  'keamanan siber',
  'siber',
  'bocor data',
  'kebocoran data',
  'peretasan',
  'diretas',
  'dibobol',
  'serangan siber',
  'celah keamanan',
  'kerentanan',
  'pencurian data',
  'penipuan',
];

/**
 * Match a keyword against text on WORD boundaries, not raw substring. A plain `includes()`
 * mis-bucketed news: "turmoil" matched `oil`, "vegas" matched `gas`, "politics" matched `ics`.
 * Single alphanumeric keywords must equal a whole token; multi-word/hyphenated keywords (e.g.
 * "wire transfer", "cve-") are specific enough to keep substring semantics.
 */
function keywordMatches(haystackLower: string, tokens: Set<string>, keyword: string): boolean {
  const kw = keyword.toLowerCase().trim();
  if (!kw) return false;
  return /^[a-z0-9]+$/.test(kw) ? tokens.has(kw) : haystackLower.includes(kw);
}

const tokenize = (s: string): Set<string> => new Set(s.split(/[^a-z0-9]+/).filter(Boolean));

/** Is this item actually about cyber security (vs generic sector/lifestyle news)? */
export function isSecurityRelated(item: NewsItem): boolean {
  const hay = `${item.title} ${item.summary}`.toLowerCase();
  const tokens = tokenize(hay);
  return SECURITY_TERMS.some((t) => keywordMatches(hay, tokens, t));
}

/**
 * Build a Google News RSS search URL targeted at a sector: the sector's keywords AND a
 * security/breach qualifier (Indonesian + English). For `general` (no keywords) it falls back to a
 * generic security query. This populates sparse sectors (e.g. energy/technology/retail) that the
 * curated feeds rarely cover, so switching sector returns fresh, sector-specific headlines.
 */
export function sectorSearchUrl(sector: string): string {
  const kws = SECTORS[sector] ?? [];
  const sec =
    '("keamanan siber" OR "bocor data" OR peretasan OR ransomware OR phishing OR breach OR hacked OR "data breach")';
  const q = kws.length
    ? `(${kws
        .slice(0, 6)
        .map((k) => `"${k}"`)
        .join(' OR ')}) ${sec}`
    : sec;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=id&gl=ID&ceid=ID:id`;
}

/** Curated feeds plus a sector-targeted Google News search, used as the default feed set. */
export function sectorFeeds(sector: string): Feed[] {
  // The sector search is a general source → it still gets the security-term filter (curated omitted).
  return [...FEEDS, { url: sectorSearchUrl(sector), source: 'Google News (sector)' }];
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]!) : '';
}

/** Parse an RSS 2.0 (`<item>`) or Atom (`<entry>`) feed into items (pure - no network). */
export function parseFeed(xml: string, source: string): NewsItem[] {
  const isAtom = /<feed[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml);
  const blocks = xml.match(isAtom ? /<entry[\s\S]*?<\/entry>/gi : /<item[\s\S]*?<\/item>/gi) ?? [];
  const items: NewsItem[] = [];
  for (const b of blocks) {
    const title = tag(b, 'title');
    // Atom: <link href="…"/>; RSS: <link>…</link>.
    let link = tag(b, 'link');
    if (!link) link = b.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? '';
    const dateStr = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated');
    const summary = tag(b, 'description') || tag(b, 'summary') || tag(b, 'content');
    if (!title || !link) continue;
    const d = dateStr ? new Date(dateStr) : null;
    items.push({
      title,
      link,
      source,
      summary: summary.slice(0, 400),
      publishedAt: d && !isNaN(d.getTime()) ? d : null,
    });
  }
  return items;
}

/** Does an item match the sector's keywords? `general` matches everything. Word-boundary aware. */
export function matchesSector(item: NewsItem, sector: string): boolean {
  const kws = SECTORS[sector] ?? [];
  if (!kws.length) return true;
  const hay = `${item.title} ${item.summary}`.toLowerCase();
  const tokens = tokenize(hay);
  return kws.some((k) => keywordMatches(hay, tokens, k));
}

export interface FetchNewsOptions {
  feeds?: Feed[];
  fetchImpl?: FetchLike;
  limit?: number;
  timeoutMs?: number;
}

/**
 * Aggregate the feeds (in PARALLEL - sequential fetching made the sector switch hang for seconds),
 * filter by sector + security relevance, dedupe by link, newest first. Degrades per-feed on error.
 */
export async function fetchSectorNews(sector: string, opts: FetchNewsOptions = {}): Promise<NewsItem[]> {
  // Default to the curated feeds + a sector-targeted Google News search (callers can override).
  const { feeds = sectorFeeds(sector), fetchImpl = fetch, limit = 30, timeoutMs = 8000 } = opts;
  const perFeed = await Promise.all(
    feeds.map(async (feed) => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        const res = await fetchImpl(feed.url, {
          signal: ctrl.signal,
          headers: { 'user-agent': 'vacti-threatnews/1.0' },
        });
        clearTimeout(t);
        if (!res.ok) return [];
        // Curated feeds are security-only; general feeds must ALSO contain a security term (cuts noise).
        return parseFeed(await res.text(), feed.source).filter(
          (i) => matchesSector(i, sector) && (feed.curated || isSecurityRelated(i)),
        );
      } catch {
        return []; // Skip an unreachable/slow feed - never throw.
      }
    }),
  );
  const seen = new Set<string>();
  return perFeed
    .flat()
    .filter((i) => (seen.has(i.link) ? false : (seen.add(i.link), true)))
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .slice(0, limit);
}

/**
 * Public news mentioning a brand/keyword, via Google News RSS search (key-less). Used in CTI to
 * monitor what is being said about the project's brand/domain. Degrades to [] on error.
 */
export async function fetchBrandNews(
  name: string,
  opts: { fetchImpl?: FetchLike; limit?: number; timeoutMs?: number; security?: boolean } = {},
): Promise<NewsItem[]> {
  const { fetchImpl = fetch, limit = 12, timeoutMs = 8000, security = false } = opts;
  const term = name.trim();
  if (!term) return [];
  // Tighten the match: the brand word alone (e.g. "acme") is far too broad, so require either the
  // exact domain/name OR the brand word together with a security/breach qualifier.
  const brandWord = term.split(/[.\s]/)[0] || term;
  const sec =
    '(breach OR hacked OR leaked OR "data breach" OR cyber OR ransomware OR phishing OR peretasan OR "bocor data" OR "keamanan siber")';
  const q = security ? `"${term}" OR ("${brandWord}" ${sec})` : `"${term}" OR "${brandWord}"`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=id&gl=ID&ceid=ID:id`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetchImpl(url, { signal: ctrl.signal, headers: { 'user-agent': 'vacti-threatnews/1.0' } });
    clearTimeout(t);
    if (!res.ok) return [];
    const items = parseFeed(await res.text(), 'Google News');
    const seen = new Set<string>();
    return items
      .filter((i) => (seen.has(i.link) ? false : (seen.add(i.link), true)))
      .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
      .slice(0, limit);
  } catch {
    return [];
  }
}
