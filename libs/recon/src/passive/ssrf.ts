import net from 'node:net';
import dns from 'node:dns/promises';

/**
 * SSRF guard for deep-fetch: only http(s), and never internal/cloud-metadata/private targets.
 * Ported from the SCOPTIX guard (Apache-2.0). Deep-fetch MUST pass this before any outbound request:
 * the synchronous check for the URL literal, plus assertHostResolvesPublic for DNS names (a target
 * subdomain's A record can point at an internal address).
 */
const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata', 'metadata.google.internal', '169.254.169.254']);

export function assertUrlSafeForServerFetch(rawUrl: string): void {
  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    throw new Error('Invalid URL for deep fetch');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Only http(s) URLs allowed for deep fetch');
  // URL.hostname keeps the brackets on IPv6 literals ('[::1]'), which net.isIPv6 does not accept -
  // strip them or every IPv6 check below silently never fires.
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (BLOCKED_HOSTNAMES.has(host)) throw new Error('Blocked host');
  if (host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal'))
    throw new Error('Blocked host suffix');
  assertIpAllowed(host);
  // WHATWG URL canonicalises decimal/hex IPv4 forms (http://2130706433 -> 127.0.0.1), but reject
  // any leftover all-numeric host defensively: it is never a legitimate public DNS name.
  if (/^[0-9]+$/.test(host) && !net.isIPv4(host)) throw new Error('Blocked numeric host');
}

/** Throws when the (bracket-stripped, lowercased) host is an IP literal in a private/reserved range. */
function assertIpAllowed(host: string): void {
  if (net.isIPv4(host) && isPrivateOrReservedIpv4(host)) throw new Error('Blocked IPv4');
  if (net.isIPv6(host) && isPrivateOrReservedIpv6(host)) throw new Error('Blocked IPv6');
}

/**
 * Resolve a DNS hostname and require EVERY resolved address to be public. Without this, an in-scope
 * subdomain pointed at 169.254.169.254 / 10.x (dangling or attacker-controlled DNS) passes the
 * literal check above and the fetch reaches the internal network. IP-literal hosts are checked
 * synchronously and skip the lookup. Resolution failures are treated as blocked (fail closed).
 */
export async function assertHostResolvesPublic(rawHost: string): Promise<void> {
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, '');
  if (net.isIPv4(host) || net.isIPv6(host)) {
    assertIpAllowed(host);
    return;
  }
  let addrs: { address: string }[];
  try {
    addrs = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error('Blocked: host did not resolve');
  }
  if (!addrs.length) throw new Error('Blocked: host did not resolve');
  for (const a of addrs) assertIpAllowed(a.address.toLowerCase());
}

/**
 * True if a hostname is a loopback/private/reserved address (literal check, no DNS). Used to keep
 * such hosts OUT of the passive attack surface: archived indexes (Wayback/VT) return junk URLs like
 * http://127.0.0.1/... that are noise at best and misleading at worst, even when the scan target is
 * itself an internal host. Names that aren't IP literals are treated as public here (host-filtering
 * by domain suffix is done separately).
 */
export function isPrivateOrLoopbackHost(rawHost: string): boolean {
  const host = (rawHost ?? '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal'))
    return true;
  if (net.isIPv4(host)) return isPrivateOrReservedIpv4(host);
  if (net.isIPv6(host)) return isPrivateOrReservedIpv6(host);
  if (/^[0-9]+$/.test(host)) return true; // bare numeric host (decimal IP encoding)
  return false;
}

/** Convenience boolean wrapper. */
export function isUrlSafeForServerFetch(rawUrl: string): boolean {
  try {
    assertUrlSafeForServerFetch(rawUrl);
    return true;
  } catch {
    return false;
  }
}

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((x) => parseInt(x, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b, c] = parts as [number, number, number, number];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // IETF reserved + TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return true; // deprecated 6to4 anycast
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2 (documentation)
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3 (documentation)
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

function isPrivateOrReservedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80:')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local
  // IPv4-mapped/translated (::ffff:a.b.c.d, ::ffff:7f00:1, 64:ff9b::/96): re-check as IPv4 so
  // http://[::ffff:169.254.169.254]/ cannot sidestep the IPv4 ranges.
  const v4 = mappedIpv4(lower);
  if (v4) return isPrivateOrReservedIpv4(v4);
  return false;
}

/** Extract the embedded IPv4 from a v4-mapped/translated IPv6 literal, in dotted or hex-group form. */
function mappedIpv4(lower: string): string | null {
  const m = /^(?:::ffff:|64:ff9b::)(.+)$/.exec(lower);
  if (!m) return null;
  const rest = m[1]!;
  if (net.isIPv4(rest)) return rest;
  const groups = rest.split(':');
  if (groups.length === 2 && groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) {
    const hi = parseInt(groups[0]!, 16);
    const lo = parseInt(groups[1]!, 16);
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  }
  return null;
}
