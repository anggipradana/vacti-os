import tls from 'node:tls';
import type { Socket } from 'node:net';
import { Agent, ProxyAgent, type Dispatcher } from 'undici';
import { SocksClient } from 'socks';

/**
 * The proxy URL schemes makeProxyDispatcher accepts: http(s) (CONNECT tunnel) and the SOCKS family.
 * Single source of truth so the UI validator (isValidProxyUrl) and the dispatcher agree on what is valid.
 */
export const PROXY_SCHEMES = ['http:', 'https:', 'socks:', 'socks4:', 'socks4a:', 'socks5:', 'socks5h:'] as const;

/** True when proxyUrl parses AND uses a scheme makeProxyDispatcher supports. Used to validate UI input. */
export function isValidProxyUrl(proxyUrl: string | null | undefined): boolean {
  if (!proxyUrl) return false;
  try {
    return (PROXY_SCHEMES as readonly string[]).includes(new URL(proxyUrl).protocol);
  } catch {
    return false;
  }
}

/** Redact a proxy URL for logs/audit: protocol + host only, never any user:pass credentials it carries. */
export function redactProxyUrl(proxyUrl: string): string {
  try {
    const u = new URL(proxyUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '(invalid)';
  }
}

/**
 * Build an undici Dispatcher for an outbound proxy so OSINT/deep-fetch traffic can be routed through
 * it. Supports `http(s)://` (CONNECT tunnel via ProxyAgent) and `socks4/5://` (custom connector that
 * dials through SOCKS, with a TLS upgrade for https targets). Returns undefined for empty/invalid URLs.
 * Accepts exactly the schemes in PROXY_SCHEMES. Set globally in the worker via undici.setGlobalDispatcher.
 */
export function makeProxyDispatcher(proxyUrl: string | null | undefined): Dispatcher | undefined {
  if (!proxyUrl) return undefined;
  let u: URL;
  try {
    u = new URL(proxyUrl);
  } catch {
    return undefined;
  }
  const p = u.protocol;
  if (p === 'http:' || p === 'https:') return new ProxyAgent(proxyUrl);
  if (p === 'socks:' || p === 'socks5:' || p === 'socks5h:' || p === 'socks4:' || p === 'socks4a:') {
    const type: 4 | 5 = p.startsWith('socks4') ? 4 : 5;
    // undici's connect option is loosely typed; the connector form is (opts, callback) => void.
    const connect = (
      opts: { hostname: string; port?: number | string; protocol?: string; servername?: string },
      cb: (err: Error | null, socket: Socket | null) => void,
    ): void => {
      const port = Number(opts.port) || (opts.protocol === 'https:' ? 443 : 80);
      SocksClient.createConnection({
        proxy: {
          host: u.hostname,
          port: Number(u.port) || 1080,
          type,
          userId: u.username ? decodeURIComponent(u.username) : undefined,
          password: u.password ? decodeURIComponent(u.password) : undefined,
        },
        command: 'connect',
        destination: { host: opts.hostname, port },
      })
        .then(({ socket }) => {
          if (opts.protocol === 'https:') {
            const tlsSocket = tls.connect({ socket, servername: opts.servername ?? opts.hostname });
            tlsSocket.once('secureConnect', () => cb(null, tlsSocket as unknown as Socket));
            tlsSocket.once('error', (e) => cb(e, null));
          } else {
            cb(null, socket as unknown as Socket);
          }
        })
        .catch((e) => cb(e instanceof Error ? e : new Error(String(e)), null));
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Agent({ connect: connect as any });
  }
  return undefined;
}
