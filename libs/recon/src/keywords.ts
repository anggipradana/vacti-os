/** Default "interesting" keywords - endpoints whose host/url/title match are flagged for triage. */
export const INTERESTING_KEYWORDS = [
  'admin',
  'login',
  'ftp',
  'cpanel',
  'webmail',
  'phpmyadmin',
  'dashboard',
  'portal',
  'dev',
  'staging',
  'test',
  'uat',
  'backup',
  'git',
  'jenkins',
  'grafana',
  'kibana',
  'vpn',
  'internal',
  'api',
];

/**
 * Does an endpoint match any interesting keyword? Matches on token boundaries, NOT raw substring:
 * a plain `includes()` flagged `digital-marketing` (git), `mydevice-store` (dev), `contestants`
 * (test), `grapism` (api) as interesting, drowning the real signal. The url + title are split into
 * alphanumeric tokens and each keyword must equal a whole token (case-insensitive).
 */
export function isInterestingEndpoint(
  url: string,
  title: string | null | undefined,
  keywords: string[] = INTERESTING_KEYWORDS,
): boolean {
  const tokens = new Set(
    `${url} ${title ?? ''}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
  return keywords.some((k) => {
    const kw = k.toLowerCase().trim();
    // Multi-word keywords (rare/custom) keep substring semantics on the normalized string.
    return /[^a-z0-9]/.test(kw) ? `${url} ${title ?? ''}`.toLowerCase().includes(kw) : tokens.has(kw);
  });
}
