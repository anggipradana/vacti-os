/**
 * Exposure / secret detection - regex ruleset run over discovered URL strings and (optionally)
 * fetched response bodies. Ported & adapted from the SCOPTIX methodology (Apache-2.0): keyword
 * prefilter for speed, priority ordering so specific rules claim overlaps before generic ones.
 * Pure function, no I/O - safe to run over large URL batches.
 */

export type ExposureHit = { type: string; snippet: string };

export interface ExposureRule {
  type: string;
  /** Lower number = higher priority (runs first to claim overlapping spans). */
  priority: number;
  re: RegExp;
  /** If set, text must contain at least one of these (case-insensitive when the regex is) to run. */
  prefilters?: string[];
  /**
   * Optional post-match validator: return true to REJECT a regex match as a false positive (the
   * span is not claimed and not reported). Lets a loose pattern stay fast while a precise check
   * (Luhn for cards, file-extension denylist for emails) removes the noise. `full` is the whole
   * match, `captured` is group 1 when present.
   */
  reject?: (full: string, captured: string | undefined) => boolean;
}

// File/asset extensions that masquerade as an email TLD: e.g. retina images `logo@2x.png`,
// `sprite@3x.webp`, or `bundle@v2.js` get matched by a naive email regex (`@2x.png` looks like
// `@domain.tld`). A real email never ends in one of these, so reject them.
const ASSET_TLDS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'webp',
  'avif',
  'ico',
  'bmp',
  'tiff',
  'css',
  'js',
  'mjs',
  'cjs',
  'map',
  'json',
  'xml',
  'woff',
  'woff2',
  'ttf',
  'eot',
  'otf',
  'mp4',
  'webm',
  'mp3',
  'wav',
  'ogg',
  'pdf',
]);

/** Reject email matches that are really asset filenames (retina `@2x.png`, etc.). */
function isAssetFilenameEmail(full: string): boolean {
  const at = full.lastIndexOf('@');
  if (at < 0) return false;
  const domain = full.slice(at + 1).toLowerCase();
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  if (ASSET_TLDS.has(tld)) return true;
  // Retina markers `@2x.` / `@3x.` (the label right after @ is digits followed by 'x').
  if (/^\d+x(?:\.|$)/.test(domain)) return true;
  return false;
}

/** Luhn checksum - real payment-card numbers pass it; random 13-16 digit ids almost never do. */
function passesLuhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/** Built-in rules, alphabetical by type. All use the global flag so every match is found. */
export const EXPOSURE_RULES: ExposureRule[] = [
  {
    type: 'aws-key',
    priority: 10,
    re: /\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/g,
    prefilters: ['AKIA', 'ASIA', 'ABIA', 'ACCA'],
  },
  {
    type: 'azure-sas-token',
    priority: 20,
    re: /(?:sig|signature)=([a-zA-Z0-9%+/]{40,})/gi,
    prefilters: ['sig=', 'signature='],
  },
  {
    type: 'basic-auth-url',
    priority: 20,
    re: /https?:\/\/[^\s:@/]+:([^\s:@/]{3,})@[^\s:/?#]+/gi,
    prefilters: ['http://', 'https://', '@'],
  },
  { type: 'bearer-token', priority: 50, re: /[Bb]earer\s+([A-Za-z0-9_\-.~+/]{20,})\b/g, prefilters: ['bearer '] },
  {
    type: 'combo-list-cred',
    priority: 15,
    // Stealer-log format: URL:Username:Password or URL:Email:Password
    re: /(?:https?:\/\/[a-zA-Z0-9.-]+(?::\d{2,5})?(?:[/?#][^:\s]*)?):([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|[a-zA-Z0-9_-]{3,30}):([^:\s]{4,50})/gi,
    prefilters: ['http'],
  },
  {
    type: 'credential-like',
    priority: 100,
    re: /(?:password|passwd|pwd|secret|token|api[_-]?key)\s*[=:]\s*([^\s&"']{8,80})/gi,
    // Drop obvious non-secrets: template placeholders (${VAR}, {{var}}, <value>) and documentation
    // stand-ins (changeme, your_password, example, redacted, ...). These are not real credentials.
    reject: (_full, captured) => {
      const v = (captured ?? '').toLowerCase();
      if (/[${}<>]|\{\{|%[a-z_]+%/.test(v)) return true;
      return /^(?:changeme|change_me|password|passw0rd|your[_-]?\w+|example|placeholder|redacted|xxx+|none|null|true|false|secret|test\w*)$/.test(
        v,
      );
    },
  },
  {
    type: 'credit-card',
    priority: 60,
    re: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/g,
    // A 13-16 digit number in the right prefix range is not a card unless it passes Luhn; this
    // kills the bulk of false positives (numeric ids, timestamps, tracking codes).
    reject: (full) => !passesLuhn(full),
  },
  {
    type: 'db-connection',
    priority: 20,
    re: /(?:mysql|postgres(?:ql)?|mongodb(?:\+srv)?|redis|mssql):\/\/[^\s'"]{10,}/gi,
    prefilters: ['mysql://', 'postgres://', 'postgresql://', 'mongodb://', 'mongodb+srv://', 'redis://', 'mssql://'],
  },
  {
    type: 'email',
    priority: 90,
    re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
    prefilters: ['@'],
    // Reject asset filenames that look like emails (logo@2x.png, sprite@3x.webp, bundle@v2.js).
    reject: (full) => isAssetFilenameEmail(full),
  },
  {
    type: 'gcp-service-account',
    priority: 10,
    re: /"type"\s*:\s*"service_account"\s*,\s*"project_id"/g,
    prefilters: ['service_account'],
  },
  {
    type: 'github-token',
    priority: 10,
    re: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[a-zA-Z0-9_]{36,255}\b/g,
    prefilters: ['ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_', 'github_pat_'],
  },
  { type: 'gitlab-token', priority: 10, re: /\bglpat-[a-zA-Z0-9-]{20}\b/g, prefilters: ['glpat-'] },
  { type: 'google-api-key', priority: 10, re: /\bAIzaSy[A-Za-z0-9_-]{33}\b/g, prefilters: ['AIzaSy'] },
  {
    type: 'hex-secret',
    priority: 90,
    re: /(?:key|secret|token|apikey|api_key|access_key|auth)\s*[=:]\s*[0-9a-f]{32,}/gi,
  },
  {
    type: 'jwt-token',
    priority: 30,
    re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    prefilters: ['eyJ'],
  },
  { type: 'openai-key', priority: 10, re: /\bsk-[a-zA-Z0-9]{48}\b/g, prefilters: ['sk-'] },
  { type: 'private-key', priority: 10, re: /-----BEGIN [A-Z ]+PRIVATE KEY-----/g, prefilters: ['-----BEGIN '] },
  { type: 'sendgrid-key', priority: 10, re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g, prefilters: ['SG.'] },
  {
    type: 'slack-bot-token',
    priority: 10,
    re: /\bxoxb-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*\b/g,
    prefilters: ['xoxb-'],
  },
  {
    type: 'slack-user-token',
    priority: 10,
    re: /\bxoxp-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*\b/g,
    prefilters: ['xoxp-'],
  },
  {
    type: 'slack-webhook',
    priority: 10,
    re: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]{8,}\/B[A-Z0-9]{8,}\/[A-Za-z0-9]{20,}/g,
    prefilters: ['hooks.slack.com/services/'],
  },
  {
    type: 'stripe-key',
    priority: 10,
    re: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{20,99}\b/g,
    prefilters: ['_live_', '_test_'],
  },
  { type: 'twilio-key', priority: 10, re: /\bSK[a-z0-9]{32}\b/g, prefilters: ['SK'] },
];

const MAX_SNIPPET = 240;

/**
 * Run the exposure ruleset over `text`. Returns one hit per non-overlapping match, most-specific
 * rule winning overlaps. `rules` defaults to the built-ins; pass a filtered/extended set to honour
 * analyst-toggled rules.
 */
export function scanExposure(text: string, rules: ExposureRule[] = EXPOSURE_RULES): ExposureHit[] {
  if (!text) return [];
  const order = [...rules].sort((a, b) => a.priority - b.priority);
  const textLower = text.toLowerCase();
  const hits: ExposureHit[] = [];
  const claimed: { start: number; end: number }[] = [];

  for (const r of order) {
    if (r.prefilters?.length) {
      const ci = r.re.flags.includes('i');
      const hay = ci ? textLower : text;
      const ok = r.prefilters.some((pf) => hay.includes(ci ? pf.toLowerCase() : pf));
      if (!ok) continue;
    }
    r.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = r.re.exec(text)) !== null) {
      // Guard against zero-width matches looping forever.
      if (m[0].length === 0) {
        r.re.lastIndex += 1;
        continue;
      }
      // Post-match validation (Luhn, asset-filename email, ...): a rejected match is a false
      // positive - skip it without claiming the span so a different rule may still match.
      if (r.reject?.(m[0], m[1])) continue;
      const start = m.index;
      const end = m.index + m[0].length;
      const overlap = claimed.some((c) => start < c.end && end > c.start);
      if (overlap) continue;
      claimed.push({ start, end });
      const snippet = (m[1] !== undefined ? m[1] : m[0]).slice(0, MAX_SNIPPET);
      hits.push({ type: r.type, snippet });
    }
  }
  return hits;
}
