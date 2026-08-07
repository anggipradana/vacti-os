// Kill-chain phase inference for the VA Attack Path visualization. VA `vulnerabilities` have no explicit
// phase or findingClass column, so we INFER a phase from a finding's nuclei classifications (tags,
// templateId, name) via lowercase keyword matching.

import type { Locale } from '../../../../../lib/i18n';

// The five ordered kill-chain phases, left-to-right.
export type Phase = 'recon' | 'initial_access' | 'privilege_escalation' | 'lateral_movement' | 'impact';

const PHASE_LABELS: Record<Phase, { en: string; id: string }> = {
  recon: { en: 'Recon', id: 'Rekon' },
  initial_access: { en: 'Initial Access', id: 'Akses Awal' },
  privilege_escalation: { en: 'Privilege Escalation', id: 'Eskalasi Privilese' },
  lateral_movement: { en: 'Lateral Movement', id: 'Pergerakan Lateral' },
  impact: { en: 'Impact', id: 'Dampak' },
};

export function phaseLabel(phase: Phase, locale: Locale): string {
  const l = PHASE_LABELS[phase];
  return locale === 'id' ? l.id : l.en;
}

// Severity-name -> color used for the graph nodes and heatmap cells (SVG fills need concrete hex).
export const SEVERITY_COLOR: Record<string, string> = {
  critical: '#dc2626',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#3b82f6',
  info: '#6b7280',
};

// Severity is an int 0-4 on VA findings (4=critical .. 0=info). Map it to the severity name used as the
// SEVERITY_COLOR key so the shared color table applies directly.
const SEVERITY_NAME = ['info', 'low', 'medium', 'high', 'critical'] as const;
export type SeverityName = (typeof SEVERITY_NAME)[number];

export function severityName(severity: number): SeverityName {
  return SEVERITY_NAME[Math.max(0, Math.min(4, severity))] ?? 'info';
}

// Phase -> keyword set. Checked in order; the first phase whose keyword hits a substring of the combined
// (tags + templateId + name), lowercased, wins. Initial-access keywords are checked before recon so an
// "rce"/"sqli" template is not swallowed by a generic "detect"/"info" recon tag it also carries.
const PHASE_KEYWORDS: Array<{ phase: Phase; keywords: string[] }> = [
  {
    phase: 'impact',
    keywords: ['ransom', 'defacement', 'deface', 'dos', 'denial-of-service', 'denial_of_service'],
  },
  {
    phase: 'privilege_escalation',
    keywords: ['privesc', 'privilege', 'sudo', 'suid', 'escalation'],
  },
  {
    phase: 'lateral_movement',
    keywords: ['smb', 'rmi', 'share', 'network', 'proxy', 'lateral', 'pivot'],
  },
  {
    phase: 'initial_access',
    keywords: [
      'rce',
      'sqli',
      'sql-injection',
      'sql_injection',
      'lfi',
      'rfi',
      'ssrf',
      'xxe',
      'injection',
      'default-login',
      'default-credential',
      'weak-credential',
      'auth-bypass',
      'unauth',
      'upload',
      'webshell',
      'backdoor',
      'deserialization',
    ],
  },
  {
    phase: 'recon',
    keywords: ['exposure', 'tech', 'ssl', 'tls', 'misconfig', 'info', 'disclosure', 'default-page', 'detect'],
  },
];

/**
 * Infer a kill-chain phase for a VA finding from its tags, templateId and name (case-insensitive). Checked
 * in PHASE_KEYWORDS order; default for an unknown classification is `recon`.
 */
export function inferPhaseVa(input: { tags: string[]; templateId: string; name: string }): Phase {
  const haystack = [...input.tags, input.templateId, input.name].join(' ').toLowerCase();
  for (const { phase, keywords } of PHASE_KEYWORDS) {
    if (keywords.some((k) => haystack.includes(k))) return phase;
  }
  return 'recon';
}
