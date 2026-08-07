/**
 * Lightweight, read-only validity checks for the per-project API keys stored in the vault.
 * Each check makes the cheapest authenticated GET the provider offers and maps the HTTP
 * status to valid / invalid / error. Never logs the key; never mutates remote state.
 */

export type KeyCheckStatus = 'valid' | 'invalid' | 'error';

export interface KeyCheckResult {
  status: KeyCheckStatus;
  /** Short, human-readable explanation (safe to show in the UI). Never contains the key. */
  message: string;
  httpStatus?: number;
}

type FetchLike = typeof fetch;

interface ProviderCheck {
  url: string;
  headers: (key: string) => Record<string, string>;
  /** HTTP statuses that mean "key recognised" beyond the default 2xx (e.g. VT rate-limit). */
  extraValid?: number[];
}

/** Per-provider cheapest authenticated probe. Keys go in headers/query, never logged. */
const CHECKS: Record<string, ProviderCheck> = {
  otx: {
    url: 'https://otx.alienvault.com/api/v1/user/me',
    headers: (k) => ({ 'X-OTX-API-KEY': k, Accept: 'application/json' }),
  },
  leakcheck: {
    url: 'https://leakcheck.io/api/v2/query/example.com?type=domain&limit=1',
    headers: (k) => ({ 'X-API-Key': k, Accept: 'application/json' }),
  },
  virustotal: {
    // v2 domain report: 200 = ok, 204 = rate-limited (key still valid), 403 = bad key.
    url: 'https://www.virustotal.com/vtapi/v2/domain/report?domain=google.com&apikey=',
    headers: () => ({ Accept: 'application/json' }),
    extraValid: [204],
  },
  urlscan: {
    // Probe the same search endpoint the recon pipeline uses with the API-Key header: a valid key
    // returns 200, a rejected key returns 401. (The /user/quota/ dashboard route can 401 valid keys.)
    url: 'https://urlscan.io/api/v1/search/?q=domain:example.com&size=1',
    headers: (k) => ({ 'API-Key': k, Accept: 'application/json' }),
  },
  openai: {
    url: 'https://api.openai.com/v1/models',
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
  },
};

const INVALID_STATUSES = new Set([401, 403]);

/**
 * Probe a provider with the given key. Returns valid / invalid / error without throwing.
 * VirusTotal carries the key in the query string (v2 API), every other provider in a header.
 */
export async function validateProviderKey(
  name: string,
  key: string,
  opts: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<KeyCheckResult> {
  const { fetchImpl = fetch, timeoutMs = 12_000 } = opts;
  const check = CHECKS[name];
  if (!check) return { status: 'error', message: `No validity check for ${name}.` };
  if (!key.trim()) return { status: 'invalid', message: 'No key stored.' };

  const url = name === 'virustotal' ? `${check.url}${encodeURIComponent(key)}` : check.url;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { headers: check.headers(key), signal: ctrl.signal });
    if (res.ok || check.extraValid?.includes(res.status)) {
      return { status: 'valid', message: 'Key is valid.', httpStatus: res.status };
    }
    if (INVALID_STATUSES.has(res.status)) {
      return { status: 'invalid', message: 'Key was rejected by the provider.', httpStatus: res.status };
    }
    if (res.status === 429) {
      return { status: 'valid', message: 'Rate-limited, but the key was accepted.', httpStatus: res.status };
    }
    return { status: 'error', message: `Unexpected response (HTTP ${res.status}).`, httpStatus: res.status };
  } catch (err) {
    const msg =
      err instanceof Error && err.name === 'AbortError' ? 'Check timed out.' : 'Could not reach the provider.';
    return { status: 'error', message: msg };
  } finally {
    clearTimeout(timer);
  }
}
