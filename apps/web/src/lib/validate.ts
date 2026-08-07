import net from 'node:net';

// A DNS hostname: 1+ dot-separated labels, letters/digits/hyphens, TLD >=2 letters, <=253 chars.
const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,63}$/i;

/** True for a syntactically valid DNS hostname (e.g. `api.example.com`). */
export function isHostname(value: string): boolean {
  return HOSTNAME_RE.test(value.trim());
}

/** True for a literal IPv4 or IPv6 address. */
export function isIpAddress(value: string): boolean {
  const v = value.trim();
  return net.isIPv4(v) || net.isIPv6(v);
}

/**
 * Normalize a user-entered scan target into a bare host: strips a pasted scheme/path/port and
 * lowercases. Accepts a hostname OR an IP (some targets are IPs). Returns null if it isn't a valid
 * host - callers reject the input instead of feeding garbage to subfinder/httpx/naabu.
 */
export function normalizeDomain(input: string): string | null {
  let v = input.trim().toLowerCase();
  if (!v) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(v)) {
    // A full URL was pasted - take its hostname.
    try {
      v = new URL(v).hostname;
    } catch {
      return null;
    }
  } else {
    v = v.split('/')[0] ?? v; // drop any path
    // Strip a :port suffix, but not the colons of an IPv6 literal.
    if (!v.includes('::') && (v.match(/:/g)?.length ?? 0) === 1) v = v.split(':')[0] ?? v;
  }
  v = v.replace(/^\[|\]$/g, ''); // unwrap a bracketed IPv6
  return isHostname(v) || isIpAddress(v) ? v : null;
}
