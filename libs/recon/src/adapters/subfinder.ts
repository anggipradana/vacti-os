export interface SubdomainResult {
  host: string;
  source?: string;
}

export function subfinderArgs(domain: string): string[] {
  return ['-d', domain, '-silent', '-json'];
}

export function parseSubfinderLine(line: string): SubdomainResult | null {
  try {
    const j = JSON.parse(line) as { host?: string; source?: string };
    return j.host ? { host: j.host, source: j.source } : null;
  } catch {
    return null;
  }
}
