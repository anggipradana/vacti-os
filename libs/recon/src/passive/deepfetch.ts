import { assertUrlSafeForServerFetch, assertHostResolvesPublic } from './ssrf';
import type { FetchLike } from './wayback';

export interface DeepFetchResult {
  /** HTTP status, 0 when blocked by the SSRF guard, 598 on timeout/network error. */
  status: number;
  body: string;
  length: number;
  blocked: boolean;
}

const UA = 'vacti-deep-fetch/1.0';
const MAX_REDIRECTS = 3;

/**
 * Fetch a discovered URL's body for exposure analysis. Every hop (the URL itself AND each redirect
 * Location) must pass the SSRF guard, including DNS resolution: following redirects blindly or
 * trusting only the literal hostname would let an in-scope page bounce the fetch to cloud metadata
 * or the internal network. The body is read as a capped stream (a missing Content-Length must not
 * allow unbounded buffering). Never throws - returns a structured result the caller records.
 */
export async function deepFetch(
  url: string,
  opts: { fetchImpl?: FetchLike; timeoutMs?: number; maxBytes?: number; signal?: AbortSignal } = {},
): Promise<DeepFetchResult> {
  const { fetchImpl = fetch, timeoutMs = 15_000, maxBytes = 512 * 1024 } = opts;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onOuterAbort = (): void => ctrl.abort();
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort();
    else opts.signal.addEventListener('abort', onOuterAbort, { once: true });
  }
  try {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      try {
        assertUrlSafeForServerFetch(current);
        await assertHostResolvesPublic(new URL(current.trim()).hostname);
      } catch {
        return { status: 0, body: '', length: 0, blocked: true };
      }
      let res: Response;
      try {
        res = await fetchImpl(current, { signal: ctrl.signal, redirect: 'manual', headers: { 'user-agent': UA } });
      } catch {
        return { status: 598, body: '', length: 0, blocked: false };
      }
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        // Drain/cancel the redirect body so the connection is released.
        void res.body?.cancel().catch(() => {});
        if (!loc || hop === MAX_REDIRECTS) return { status: res.status, body: '', length: 0, blocked: false };
        current = new URL(loc, current).toString();
        continue;
      }
      const declared = Number(res.headers.get('content-length') ?? '0');
      if (declared && declared > maxBytes * 4) {
        void res.body?.cancel().catch(() => {});
        return { status: res.status, body: '', length: declared, blocked: false };
      }
      const { text, length } = await readCapped(res, maxBytes);
      return { status: res.status, body: text, length, blocked: false };
    }
    return { status: 598, body: '', length: 0, blocked: false };
  } catch {
    return { status: 598, body: '', length: 0, blocked: false };
  } finally {
    clearTimeout(timer);
    if (opts.signal) opts.signal.removeEventListener('abort', onOuterAbort);
  }
}

/** Stream the body up to maxBytes, then cancel: chunked responses must not buffer unbounded. */
async function readCapped(res: Response, maxBytes: number): Promise<{ text: string; length: number }> {
  if (!res.body) {
    const full = await res.text();
    return { text: full.slice(0, maxBytes), length: full.length };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let text = '';
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    text += decoder.decode(value, { stream: true });
    if (bytes > maxBytes) {
      void reader.cancel().catch(() => {});
      break;
    }
  }
  text += decoder.decode();
  return { text: text.slice(0, maxBytes), length: bytes };
}
