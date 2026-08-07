/**
 * CVSS 4.0 base-score calculator - a faithful TypeScript port of the official FIRST.org / Red Hat
 * reference implementation (RedHatProductSecurity/cvss `cvss4.py` + `constants4.py`, which mirror the
 * FIRST cvss-v4-calculator). CVSS 4.0 scoring is NOT a closed-form formula: it maps the vector to a
 * MacroVector (six equivalence classes), looks the base value up in a 270-entry table, then interpolates
 * by the severity-distance to the next-lower macrovectors. This module reproduces that exactly so the
 * SERVER computes the score from the vector - editing any metric (e.g. the CIA impact) recomputes it.
 *
 * Public API: scoreVector(vector) -> { baseScore, severity }, withMetric(vector, m, v) -> new vector,
 * parseCvss4(vector), CVSS4_METRICS (UI metadata). Severity is returned in vacti's lowercase scale
 * (critical|high|medium|low|info) via cvss4Severity().
 */
import { CVSS_LOOKUP_GLOBAL } from './cvss4-lookup';

const EPSILON = 1e-6;

/** Metric order per the CVSS 4.0 spec (used to emit a clean, correctly-ordered vector). */
export const CVSS4_ORDER = [
  'AV',
  'AC',
  'AT',
  'PR',
  'UI',
  'VC',
  'VI',
  'VA',
  'SC',
  'SI',
  'SA',
  'E',
  'CR',
  'IR',
  'AR',
  'MAV',
  'MAC',
  'MAT',
  'MPR',
  'MUI',
  'MVC',
  'MVI',
  'MVA',
  'MSC',
  'MSI',
  'MSA',
  'S',
  'AU',
  'R',
  'V',
  'RE',
  'U',
] as const;

export const CVSS4_MANDATORY = ['AV', 'AC', 'AT', 'PR', 'UI', 'VC', 'VI', 'VA', 'SC', 'SI', 'SA'] as const;

/** Allowed values per metric (also drives validation + the editable UI). Order matters for the UI. */
export const CVSS4_VALUES: Record<string, Array<{ value: string; label: string }>> = {
  AV: [
    { value: 'N', label: 'Network' },
    { value: 'A', label: 'Adjacent' },
    { value: 'L', label: 'Local' },
    { value: 'P', label: 'Physical' },
  ],
  AC: [
    { value: 'L', label: 'Low' },
    { value: 'H', label: 'High' },
  ],
  AT: [
    { value: 'N', label: 'None' },
    { value: 'P', label: 'Present' },
  ],
  PR: [
    { value: 'N', label: 'None' },
    { value: 'L', label: 'Low' },
    { value: 'H', label: 'High' },
  ],
  UI: [
    { value: 'N', label: 'None' },
    { value: 'P', label: 'Passive' },
    { value: 'A', label: 'Active' },
  ],
  VC: [
    { value: 'H', label: 'High' },
    { value: 'L', label: 'Low' },
    { value: 'N', label: 'None' },
  ],
  VI: [
    { value: 'H', label: 'High' },
    { value: 'L', label: 'Low' },
    { value: 'N', label: 'None' },
  ],
  VA: [
    { value: 'H', label: 'High' },
    { value: 'L', label: 'Low' },
    { value: 'N', label: 'None' },
  ],
  SC: [
    { value: 'H', label: 'High' },
    { value: 'L', label: 'Low' },
    { value: 'N', label: 'None' },
  ],
  SI: [
    { value: 'H', label: 'High' },
    { value: 'L', label: 'Low' },
    { value: 'N', label: 'None' },
  ],
  SA: [
    { value: 'H', label: 'High' },
    { value: 'L', label: 'Low' },
    { value: 'N', label: 'None' },
  ],
  E: [
    { value: 'X', label: 'Not Defined' },
    { value: 'A', label: 'Attacked' },
    { value: 'P', label: 'PoC' },
    { value: 'U', label: 'Unreported' },
  ],
  CR: [
    { value: 'X', label: 'Not Defined' },
    { value: 'H', label: 'High' },
    { value: 'M', label: 'Medium' },
    { value: 'L', label: 'Low' },
  ],
  IR: [
    { value: 'X', label: 'Not Defined' },
    { value: 'H', label: 'High' },
    { value: 'M', label: 'Medium' },
    { value: 'L', label: 'Low' },
  ],
  AR: [
    { value: 'X', label: 'Not Defined' },
    { value: 'H', label: 'High' },
    { value: 'M', label: 'Medium' },
    { value: 'L', label: 'Low' },
  ],
  MAV: [
    { value: 'X', label: 'Not Defined' },
    { value: 'N', label: 'Network' },
    { value: 'A', label: 'Adjacent' },
    { value: 'L', label: 'Local' },
    { value: 'P', label: 'Physical' },
  ],
  MAC: [
    { value: 'X', label: 'Not Defined' },
    { value: 'L', label: 'Low' },
    { value: 'H', label: 'High' },
  ],
  MAT: [
    { value: 'X', label: 'Not Defined' },
    { value: 'N', label: 'None' },
    { value: 'P', label: 'Present' },
  ],
  MPR: [
    { value: 'X', label: 'Not Defined' },
    { value: 'N', label: 'None' },
    { value: 'L', label: 'Low' },
    { value: 'H', label: 'High' },
  ],
  MUI: [
    { value: 'X', label: 'Not Defined' },
    { value: 'N', label: 'None' },
    { value: 'P', label: 'Passive' },
    { value: 'A', label: 'Active' },
  ],
  MVC: [
    { value: 'X', label: 'Not Defined' },
    { value: 'H', label: 'High' },
    { value: 'L', label: 'Low' },
    { value: 'N', label: 'None' },
  ],
  MVI: [
    { value: 'X', label: 'Not Defined' },
    { value: 'H', label: 'High' },
    { value: 'L', label: 'Low' },
    { value: 'N', label: 'None' },
  ],
  MVA: [
    { value: 'X', label: 'Not Defined' },
    { value: 'H', label: 'High' },
    { value: 'L', label: 'Low' },
    { value: 'N', label: 'None' },
  ],
  MSC: [
    { value: 'X', label: 'Not Defined' },
    { value: 'H', label: 'High' },
    { value: 'L', label: 'Low' },
    { value: 'N', label: 'Negligible' },
  ],
  MSI: [
    { value: 'X', label: 'Not Defined' },
    { value: 'S', label: 'Safety' },
    { value: 'H', label: 'High' },
    { value: 'L', label: 'Low' },
    { value: 'N', label: 'Negligible' },
  ],
  MSA: [
    { value: 'X', label: 'Not Defined' },
    { value: 'S', label: 'Safety' },
    { value: 'H', label: 'High' },
    { value: 'L', label: 'Low' },
    { value: 'N', label: 'Negligible' },
  ],
  S: [
    { value: 'X', label: 'Not Defined' },
    { value: 'N', label: 'Negligible' },
    { value: 'P', label: 'Present' },
  ],
  AU: [
    { value: 'X', label: 'Not Defined' },
    { value: 'N', label: 'No' },
    { value: 'Y', label: 'Yes' },
  ],
  R: [
    { value: 'X', label: 'Not Defined' },
    { value: 'A', label: 'Automatic' },
    { value: 'U', label: 'User' },
    { value: 'I', label: 'Irrecoverable' },
  ],
  V: [
    { value: 'X', label: 'Not Defined' },
    { value: 'D', label: 'Diffuse' },
    { value: 'C', label: 'Concentrated' },
  ],
  RE: [
    { value: 'X', label: 'Not Defined' },
    { value: 'L', label: 'Low' },
    { value: 'M', label: 'Moderate' },
    { value: 'H', label: 'High' },
  ],
  U: [
    { value: 'X', label: 'Not Defined' },
    { value: 'Clear', label: 'Clear' },
    { value: 'Green', label: 'Green' },
    { value: 'Amber', label: 'Amber' },
    { value: 'Red', label: 'Red' },
  ],
};

/** Human labels for the metric abbreviations (UI). */
export const CVSS4_LABELS: Record<string, string> = {
  AV: 'Attack Vector',
  AC: 'Attack Complexity',
  AT: 'Attack Requirements',
  PR: 'Privileges Required',
  UI: 'User Interaction',
  VC: 'Confidentiality (VC)',
  VI: 'Integrity (VI)',
  VA: 'Availability (VA)',
  SC: 'Subsequent Confidentiality (SC)',
  SI: 'Subsequent Integrity (SI)',
  SA: 'Subsequent Availability (SA)',
  E: 'Exploit Maturity',
  CR: 'Confidentiality Req.',
  IR: 'Integrity Req.',
  AR: 'Availability Req.',
};

/** The impact (CIA) metrics the user most often adjusts - highlighted in the editor. */
export const CVSS4_CIA_METRICS = ['VC', 'VI', 'VA', 'SC', 'SI', 'SA'] as const;

export interface ParsedCvss4 {
  valid: boolean;
  error?: string;
  metrics: Record<string, string>;
}

/** Parse + validate a CVSS:4.0 vector into its metric map. Does NOT mutate/fill defaults. */
export function parseCvss4(vector: string): ParsedCvss4 {
  const metrics: Record<string, string> = {};
  if (!vector) return { valid: false, error: 'empty vector', metrics };
  if (vector.endsWith('/')) return { valid: false, error: 'trailing slash', metrics };
  if (!vector.startsWith('CVSS:4.0/')) return { valid: false, error: 'missing CVSS:4.0/ prefix', metrics };
  const fields = vector.split('/').slice(1);
  for (const field of fields) {
    if (field === '') return { valid: false, error: 'empty field', metrics };
    const idx = field.indexOf(':');
    if (idx < 0) return { valid: false, error: `malformed field "${field}"`, metrics };
    const metric = field.slice(0, idx);
    const value = field.slice(idx + 1);
    if (metric in metrics) return { valid: false, error: `duplicate metric "${metric}"`, metrics };
    if (!(metric in CVSS4_VALUES)) return { valid: false, error: `unknown metric "${metric}"`, metrics };
    if (!CVSS4_VALUES[metric]!.some((o) => o.value === value))
      return { valid: false, error: `bad value "${field}"`, metrics };
    metrics[metric] = value;
  }
  for (const m of CVSS4_MANDATORY) {
    if (!(m in metrics)) return { valid: false, error: `missing mandatory metric ${m}`, metrics };
  }
  return { valid: true, metrics };
}

/** Emit a clean, spec-ordered vector from a metric map, dropping any metric set to X. */
export function cleanVector(metrics: Record<string, string>): string {
  const parts: string[] = [];
  for (const m of CVSS4_ORDER) {
    const v = metrics[m];
    if (v !== undefined && v !== 'X') parts.push(`${m}:${v}`);
  }
  return 'CVSS:4.0/' + parts.join('/');
}

/** Return a NEW clean vector with `metric` set to `value` (value 'X' or invalid clears it). */
export function withMetric(vector: string, metric: string, value: string): string {
  const parsed = parseCvss4(vector);
  const metrics = { ...parsed.metrics };
  if (value === 'X' || value === '') delete metrics[metric];
  else metrics[metric] = value;
  return cleanVector(metrics);
}

// --- scoring internals (mirror the reference) ---

function addMissingOptional(base: Record<string, string>): Record<string, string> {
  const m = { ...base };
  for (const abbr of ['MAV', 'MAC', 'MAT', 'MPR', 'MUI', 'MVC', 'MVI', 'MVA', 'MSC', 'MSI', 'MSA']) {
    if (!(abbr in m) || m[abbr] === 'X') m[abbr] = m[abbr.slice(1)]!;
  }
  for (const abbr of ['S', 'AU', 'R', 'V', 'RE', 'U', 'CR', 'IR', 'AR', 'E']) {
    if (!(abbr in m)) m[abbr] = 'X';
  }
  return m;
}

/** The effective value of a metric, honouring modified-metric overrides + the E/CR/IR/AR defaults. */
function mVal(metrics: Record<string, string>, metric: string): string {
  const selected = metrics[metric];
  if (metric === 'E' && selected === 'X') return 'A';
  if ((metric === 'CR' || metric === 'IR' || metric === 'AR') && selected === 'X') return 'H';
  const mod = metrics['M' + metric];
  if (mod !== undefined && mod !== 'X') return mod;
  return selected!;
}

function macroVector(metrics: Record<string, string>): string {
  const m = (k: string) => mVal(metrics, k);
  let eq1 = '',
    eq2 = '',
    eq3 = '',
    eq4 = '',
    eq5 = '',
    eq6 = '';

  if (m('AV') === 'N' && m('PR') === 'N' && m('UI') === 'N') eq1 = '0';
  else if (
    (m('AV') === 'N' || m('PR') === 'N' || m('UI') === 'N') &&
    !(m('AV') === 'N' && m('PR') === 'N' && m('UI') === 'N') &&
    m('AV') !== 'P'
  )
    eq1 = '1';
  else eq1 = '2';

  if (m('AC') === 'L' && m('AT') === 'N') eq2 = '0';
  else eq2 = '1';

  if (m('VC') === 'H' && m('VI') === 'H') eq3 = '0';
  else if (m('VC') === 'H' || m('VI') === 'H' || m('VA') === 'H') eq3 = '1';
  else eq3 = '2';

  if (m('MSI') === 'S' || m('MSA') === 'S') eq4 = '0';
  else if (m('SC') === 'H' || m('SI') === 'H' || m('SA') === 'H') eq4 = '1';
  else eq4 = '2';

  if (m('E') === 'A') eq5 = '0';
  else if (m('E') === 'P') eq5 = '1';
  else eq5 = '2';

  if (
    (m('CR') === 'H' && m('VC') === 'H') ||
    (m('IR') === 'H' && m('VI') === 'H') ||
    (m('AR') === 'H' && m('VA') === 'H')
  )
    eq6 = '0';
  else eq6 = '1';

  return eq1 + eq2 + eq3 + eq4 + eq5 + eq6;
}

const MAX_COMPOSED: Record<string, Record<string, string[]>> = {
  eq1: {
    '0': ['AV:N/PR:N/UI:N/'],
    '1': ['AV:A/PR:N/UI:N/', 'AV:N/PR:L/UI:N/', 'AV:N/PR:N/UI:P/'],
    '2': ['AV:P/PR:N/UI:N/', 'AV:A/PR:L/UI:P/'],
  },
  eq2: { '0': ['AC:L/AT:N/'], '1': ['AC:H/AT:N/', 'AC:L/AT:P/'] },
  eq4: { '0': ['SC:H/SI:S/SA:S/'], '1': ['SC:H/SI:H/SA:H/'], '2': ['SC:L/SI:L/SA:L/'] },
  eq5: { '0': ['E:A/'], '1': ['E:P/'], '2': ['E:U/'] },
};
// EQ3+EQ6 is two-dimensional (indexed by eq3 then eq6).
const MAX_COMPOSED_EQ3EQ6: Record<string, Record<string, string[]>> = {
  '0': {
    '0': ['VC:H/VI:H/VA:H/CR:H/IR:H/AR:H/'],
    '1': ['VC:H/VI:H/VA:L/CR:M/IR:M/AR:H/', 'VC:H/VI:H/VA:H/CR:M/IR:M/AR:M/'],
  },
  '1': {
    '0': ['VC:L/VI:H/VA:H/CR:H/IR:H/AR:H/', 'VC:H/VI:L/VA:H/CR:H/IR:H/AR:H/'],
    '1': [
      'VC:L/VI:H/VA:L/CR:H/IR:M/AR:H/',
      'VC:L/VI:H/VA:H/CR:H/IR:M/AR:M/',
      'VC:H/VI:L/VA:H/CR:M/IR:H/AR:M/',
      'VC:H/VI:L/VA:L/CR:M/IR:H/AR:H/',
      'VC:L/VI:L/VA:H/CR:H/IR:H/AR:M/',
    ],
  },
  '2': { '1': ['VC:L/VI:L/VA:L/CR:H/IR:H/AR:H/'] },
};

const MAX_SEVERITY: {
  eq1: Record<number, number>;
  eq2: Record<number, number>;
  eq3eq6: Record<number, Record<number, number>>;
  eq4: Record<number, number>;
} = {
  eq1: { 0: 1, 1: 4, 2: 5 },
  eq2: { 0: 1, 1: 2 },
  eq3eq6: { 0: { 0: 7, 1: 6 }, 1: { 0: 8, 1: 8 }, 2: { 1: 10 } },
  eq4: { 0: 6, 1: 5, 2: 4 },
};

const AV_L: Record<string, number> = { N: 0.0, A: 0.1, L: 0.2, P: 0.3 };
const PR_L: Record<string, number> = { N: 0.0, L: 0.1, H: 0.2 };
const UI_L: Record<string, number> = { N: 0.0, P: 0.1, A: 0.2 };
const AC_L: Record<string, number> = { L: 0.0, H: 0.1 };
const AT_L: Record<string, number> = { N: 0.0, P: 0.1 };
const VC_L: Record<string, number> = { H: 0.0, L: 0.1, N: 0.2 };
const VI_L = VC_L,
  VA_L = VC_L;
const SC_L: Record<string, number> = { H: 0.1, L: 0.2, N: 0.3 };
const SI_L: Record<string, number> = { S: 0.0, H: 0.1, L: 0.2, N: 0.3 };
const SA_L = SI_L;
const CR_L: Record<string, number> = { H: 0.0, M: 0.1, L: 0.2 };
const IR_L = CR_L,
  AR_L = CR_L;

function extractValueMetric(metric: string, str: string): string {
  const start = str.indexOf(metric) + metric.length + 1;
  const rest = str.slice(start);
  const slash = rest.indexOf('/');
  return slash >= 0 ? rest.slice(0, slash) : rest;
}

function finalRounding(x: number): number {
  return Math.round((x + EPSILON) * 10) / 10;
}

/** Compute the CVSS 4.0 base score (0.0 - 10.0) for a valid vector. Returns 0 for an unscorable vector. */
export function cvss4Score(vector: string): number {
  const parsed = parseCvss4(vector);
  if (!parsed.valid) return 0;
  const metrics = addMissingOptional(parsed.metrics);
  const m = (k: string) => mVal(metrics, k);

  if (['VC', 'VI', 'VA', 'SC', 'SI', 'SA'].every((k) => m(k) === 'N')) return 0.0;

  const mv = macroVector(metrics);
  let value = CVSS_LOOKUP_GLOBAL[mv];
  if (value === undefined) return 0;

  const eq1v = +mv[0]!,
    eq2v = +mv[1]!,
    eq3v = +mv[2]!,
    eq4v = +mv[3]!,
    eq5v = +mv[4]!,
    eq6v = +mv[5]!;

  const lookup = (s: string): number => {
    const v = CVSS_LOOKUP_GLOBAL[s];
    return v === undefined ? NaN : v;
  };

  const eq1NextLower = `${eq1v + 1}${eq2v}${eq3v}${eq4v}${eq5v}${eq6v}`;
  const eq2NextLower = `${eq1v}${eq2v + 1}${eq3v}${eq4v}${eq5v}${eq6v}`;

  let scoreEq3Eq6NextLower: number;
  if (eq3v === 1 && eq6v === 1) scoreEq3Eq6NextLower = lookup(`${eq1v}${eq2v}${eq3v + 1}${eq4v}${eq5v}${eq6v}`);
  else if (eq3v === 0 && eq6v === 1) scoreEq3Eq6NextLower = lookup(`${eq1v}${eq2v}${eq3v + 1}${eq4v}${eq5v}${eq6v}`);
  else if (eq3v === 1 && eq6v === 0) scoreEq3Eq6NextLower = lookup(`${eq1v}${eq2v}${eq3v}${eq4v}${eq5v}${eq6v + 1}`);
  else if (eq3v === 0 && eq6v === 0) {
    const left = lookup(`${eq1v}${eq2v}${eq3v}${eq4v}${eq5v}${eq6v + 1}`);
    const right = lookup(`${eq1v}${eq2v}${eq3v + 1}${eq4v}${eq5v}${eq6v}`);
    scoreEq3Eq6NextLower = Math.max(left, right);
  } else scoreEq3Eq6NextLower = lookup(`${eq1v}${eq2v}${eq3v + 1}${eq4v}${eq5v}${eq6v + 1}`);

  const scoreEq1NextLower = lookup(eq1NextLower);
  const scoreEq2NextLower = lookup(eq2NextLower);
  const scoreEq4NextLower = lookup(`${eq1v}${eq2v}${eq3v}${eq4v + 1}${eq5v}${eq6v}`);
  const scoreEq5NextLower = lookup(`${eq1v}${eq2v}${eq3v}${eq4v}${eq5v + 1}${eq6v}`);

  const eq1Maxes = MAX_COMPOSED.eq1![String(eq1v)]!;
  const eq2Maxes = MAX_COMPOSED.eq2![String(eq2v)]!;
  const eq3Eq6Maxes = MAX_COMPOSED_EQ3EQ6[String(eq3v)]![String(eq6v)]!;
  const eq4Maxes = MAX_COMPOSED.eq4![String(eq4v)]!;
  const eq5Maxes = MAX_COMPOSED.eq5![String(eq5v)]!;

  const maxVectors: string[] = [];
  for (const a of eq1Maxes)
    for (const b of eq2Maxes)
      for (const c of eq3Eq6Maxes)
        for (const d of eq4Maxes) for (const e of eq5Maxes) maxVectors.push(a + b + c + d + e);

  let sd: Record<string, number> = {};
  for (const maxVector of maxVectors) {
    const dist = (metric: string, levels: Record<string, number>) =>
      levels[m(metric)]! - levels[extractValueMetric(metric, maxVector)]!;
    sd = {
      AV: dist('AV', AV_L),
      PR: dist('PR', PR_L),
      UI: dist('UI', UI_L),
      AC: dist('AC', AC_L),
      AT: dist('AT', AT_L),
      VC: dist('VC', VC_L),
      VI: dist('VI', VI_L),
      VA: dist('VA', VA_L),
      SC: dist('SC', SC_L),
      SI: dist('SI', SI_L),
      SA: dist('SA', SA_L),
      CR: dist('CR', CR_L),
      IR: dist('IR', IR_L),
      AR: dist('AR', AR_L),
    };
    if (Object.values(sd).some((x) => x < 0 || Number.isNaN(x))) continue;
    break;
  }

  const currentEq1 = sd.AV! + sd.PR! + sd.UI!;
  const currentEq2 = sd.AC! + sd.AT!;
  const currentEq3Eq6 = sd.VC! + sd.VI! + sd.VA! + sd.CR! + sd.IR! + sd.AR!;
  const currentEq4 = sd.SC! + sd.SI! + sd.SA!;

  const step = 0.1;
  const availEq1 = value - scoreEq1NextLower;
  const availEq2 = value - scoreEq2NextLower;
  const availEq3Eq6 = value - scoreEq3Eq6NextLower;
  const availEq4 = value - scoreEq4NextLower;
  const availEq5 = value - scoreEq5NextLower;

  const maxEq1 = MAX_SEVERITY.eq1[eq1v]! * step;
  const maxEq2 = MAX_SEVERITY.eq2[eq2v]! * step;
  const maxEq3Eq6 = MAX_SEVERITY.eq3eq6[eq3v]![eq6v]! * step;
  const maxEq4 = MAX_SEVERITY.eq4[eq4v]! * step;

  let n = 0;
  let normEq1 = 0,
    normEq2 = 0,
    normEq3Eq6 = 0,
    normEq4 = 0,
    normEq5 = 0;
  if (!Number.isNaN(availEq1) && availEq1 >= 0) {
    n++;
    normEq1 = availEq1 * (currentEq1 / maxEq1);
  }
  if (!Number.isNaN(availEq2) && availEq2 >= 0) {
    n++;
    normEq2 = availEq2 * (currentEq2 / maxEq2);
  }
  if (!Number.isNaN(availEq3Eq6) && availEq3Eq6 >= 0) {
    n++;
    normEq3Eq6 = availEq3Eq6 * (currentEq3Eq6 / maxEq3Eq6);
  }
  if (!Number.isNaN(availEq4) && availEq4 >= 0) {
    n++;
    normEq4 = availEq4 * (currentEq4 / maxEq4);
  }
  if (!Number.isNaN(availEq5) && availEq5 >= 0) {
    n++;
    normEq5 = 0;
  }

  const meanDistance = n === 0 ? 0 : (normEq1 + normEq2 + normEq3Eq6 + normEq4 + normEq5) / n;
  value -= meanDistance;
  value = Math.max(0.0, Math.min(10.0, value));
  return finalRounding(value);
}

/** vacti severity scale from a CVSS 4.0 score. CVSS "None" maps to vacti "info". */
export function cvss4Severity(score: number): 'critical' | 'high' | 'medium' | 'low' | 'info' {
  if (score === 0) return 'info';
  if (score <= 3.9) return 'low';
  if (score <= 6.9) return 'medium';
  if (score <= 8.9) return 'high';
  return 'critical';
}

/** One-shot: validate + score + severity for a vector. `valid=false` leaves score 0 / severity info. */
export function scoreVector(vector: string): {
  valid: boolean;
  error?: string;
  baseScore: number;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
} {
  const parsed = parseCvss4(vector);
  if (!parsed.valid) return { valid: false, error: parsed.error, baseScore: 0, severity: 'info' };
  const baseScore = cvss4Score(vector);
  return { valid: true, baseScore, severity: cvss4Severity(baseScore) };
}
