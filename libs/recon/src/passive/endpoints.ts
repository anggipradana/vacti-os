/**
 * Endpoint / parameter discovery - derive query parameters and security-relevant (auth) endpoints
 * from discovered URLs. Pure function over URL strings; helps target parameter analysis and spot
 * auth/admin surfaces in the passive attack surface.
 */

const AUTH_RE =
  /(login|signin|sign-in|signup|sign-up|register|auth|oauth|sso|saml|token|session|password|passwd|pwd|reset|forgot|account|logout|verify|confirm|mfa|otp|2fa|admin|dashboard|api[_-]?key|secret|webhook|callback)/i;

export interface EndpointAnalysis {
  /** Distinct query-parameter names, most frequent first. */
  params: { name: string; count: number }[];
  /** Distinct origin+path of URLs whose path looks auth/admin-related. */
  authEndpoints: string[];
  paramCount: number;
  authCount: number;
}

export function analyzeEndpoints(urls: string[], opts: { maxAuth?: number } = {}): EndpointAnalysis {
  const { maxAuth = 300 } = opts;
  const paramCount = new Map<string, number>();
  const auth = new Set<string>();
  for (const u of urls) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`);
    } catch {
      continue;
    }
    for (const k of url.searchParams.keys()) paramCount.set(k, (paramCount.get(k) ?? 0) + 1);
    if (AUTH_RE.test(url.pathname)) auth.add(`${url.origin}${url.pathname}`);
  }
  const params = [...paramCount.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const authEndpoints = [...auth].sort();
  return {
    params,
    authEndpoints: authEndpoints.slice(0, maxAuth),
    paramCount: params.length,
    authCount: authEndpoints.length,
  };
}
