import { mapNucleiSeverity } from '../severity';
import type { SeverityValue } from '@vacti/core';

export interface VulnResult {
  templateId: string;
  name: string;
  severity: SeverityValue;
  type?: string;
  host?: string;
  port?: string;
  scheme?: string;
  url?: string;
  matchedAt?: string;
  tags: string[];
  request?: string;
  response?: string;
  /** From the nuclei template's info block (not AI). */
  description?: string;
  remediation?: string;
  cvss?: number;
  cveIds: string[];
  references: string[];
}

export interface NucleiOptions {
  /** e.g. ['critical','high','medium','low'] */
  severities?: string[];
  /** tag filter, e.g. ['wordpress'] for the conditional WordPress pass */
  tags?: string[];
  /** explicit template paths */
  templates?: string[];
  /** tags to exclude (safety: dos/intrusive/fuzzing off by default) */
  excludeTags?: string[];
  /** custom request headers (per target) */
  headers?: Record<string, string>;
  userAgent?: string;
  rateLimit?: number;
  concurrency?: number;
  retries?: number;
  /** allow-listed extra flags (see ALLOWED_NUCLEI_FLAGS) */
  extraArgs?: string[];
}

/** Allow-listed nuclei flags accepted from a profile's extraArgs (value-less or value flags). */
export const ALLOWED_NUCLEI_FLAGS = new Set([
  '-follow-redirects',
  '-fr',
  '-include-tags',
  '-etags',
  '-exclude-tags',
  '-itags',
  '-timeout',
  '-max-host-error',
  '-mhe',
  '-scan-strategy',
  '-headless',
]);

/** Keep only allow-listed flags (+ their immediate value tokens). */
export function filterExtraArgs(args: string[], allow: Set<string>): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (allow.has(a)) {
      out.push(a);
      const nxt = args[i + 1];
      if (nxt && !nxt.startsWith('-')) {
        out.push(nxt);
        i++;
      }
    }
    // Unknown tokens are dropped (no arbitrary flag injection).
  }
  return out;
}

export function nucleiArgs(opts: NucleiOptions = {}): string[] {
  const args = ['-jsonl', '-silent', '-no-interactsh', '-no-color'];
  if (opts.severities?.length) args.push('-severity', opts.severities.join(','));
  if (opts.tags?.length) args.push('-tags', opts.tags.join(','));
  if (opts.excludeTags?.length) args.push('-exclude-tags', opts.excludeTags.join(','));
  for (const t of opts.templates ?? []) args.push('-t', t);
  for (const [k, v] of Object.entries(opts.headers ?? {})) args.push('-H', `${k}: ${v}`);
  if (opts.userAgent) args.push('-H', `User-Agent: ${opts.userAgent}`);
  if (opts.rateLimit && opts.rateLimit > 0) args.push('-rate-limit', String(opts.rateLimit));
  if (opts.concurrency && opts.concurrency > 0) args.push('-c', String(opts.concurrency));
  if (opts.retries && opts.retries >= 0) args.push('-retries', String(opts.retries));
  if (opts.extraArgs?.length) args.push(...filterExtraArgs(opts.extraArgs, ALLOWED_NUCLEI_FLAGS));
  return args;
}

interface NucleiRaw {
  'template-id'?: string;
  info?: {
    name?: string;
    severity?: string;
    tags?: string[];
    description?: string;
    remediation?: string;
    reference?: string[] | string;
    classification?: {
      'cvss-metrics'?: string;
      'cvss-score'?: number | string;
      'cve-id'?: string[] | string;
      'cwe-id'?: string[] | string;
    };
  };
  type?: string;
  host?: string;
  port?: string;
  scheme?: string;
  url?: string;
  'matched-at'?: string;
  request?: string;
  response?: string;
}

/** Normalise a nuclei field that may be a string, array, or absent into a string[]. */
// Strip the NUL byte (0x00): Postgres text columns reject it, and nuclei's raw request/response
// capture can contain it - which crashed the whole scan insert with no retry. fromCharCode keeps
// a literal NUL out of the source.
const NUL = String.fromCharCode(0);
function stripNul(x: string): string {
  return x.split(NUL).join('');
}

function toList(v: string[] | string | undefined): string[] {
  if (!v) return [];
  return (Array.isArray(v) ? v : [v]).map((x) => stripNul(String(x)).trim()).filter(Boolean);
}

// Postgres text columns reject the NUL byte (0x00); nuclei's captured request/response (raw, sometimes
// binary HTTP) can contain it and would otherwise crash the whole scan's insert with no retry. Strip it.
const pgText = (s: string | undefined): string | undefined => (s == null ? s : stripNul(s));

export function parseNucleiLine(line: string): VulnResult | null {
  try {
    const j = JSON.parse(line) as NucleiRaw;
    const id = j['template-id'];
    if (!id) return null;
    const cls = j.info?.classification;
    const rawScore = cls?.['cvss-score'];
    const cvss = rawScore != null && rawScore !== '' ? Number(rawScore) : undefined;
    return {
      templateId: id,
      name: pgText(j.info?.name) ?? id,
      severity: mapNucleiSeverity(j.info?.severity),
      type: j.type,
      host: pgText(j.host),
      port: j.port,
      scheme: j.scheme,
      url: pgText(j.url),
      matchedAt: pgText(j['matched-at']),
      tags: (j.info?.tags ?? []).map(stripNul),
      request: pgText(j.request),
      response: pgText(j.response),
      description: pgText(j.info?.description?.trim()) || undefined,
      remediation: pgText(j.info?.remediation?.trim()) || undefined,
      cvss: cvss != null && Number.isFinite(cvss) ? cvss : undefined,
      cveIds: toList(cls?.['cve-id']),
      references: toList(j.info?.reference),
    };
  } catch {
    return null;
  }
}
