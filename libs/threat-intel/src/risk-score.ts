/**
 * Unified Risk Score - vacti's risk-scoring model.
 *
 * Component weights (sum = 100):
 *   With VA:    VA 40 · Credential Exposure 30 · Threat Exposure 12 · Reputation 10 · Malware 8
 *   Without VA: Leak 45 · Exposure 25 · Reputation 20 · Malware 10  (VA weight redistributed)
 *
 * VA sub-score = 70% weighted-density + 30% severity² emphasis (critical findings dominate).
 * Unchecked leaks drive the credential component - reviewing (checking) them lowers the score,
 * which incentivises triage. Colour bands: 0-30 green, 31-70 yellow, 71-100 red.
 *
 * NOTE: exact numeric calibration against the reference vectors is finalised in threat-intel task 002
 * acceptance; this scorer is deterministic, bounded [0,100], and monotonic per component.
 */
export interface RiskInput {
  hasVa: boolean;
  vuln: { critical: number; high: number; medium: number; low: number };
  domainCount: number;
  uncheckedLeaks: number;
  threatIndicators: number;
  /** OTX reputation normalised to 0..1 (1 = worst). */
  reputation: number;
  malwareCount: number;
  /** Passive exposure findings (secrets/credentials in discovered URLs/bodies). Optional. */
  exposureFindings?: number;
}

export type RiskColor = 'green' | 'yellow' | 'red';

export interface RiskResult {
  score: number;
  color: RiskColor;
  components: Record<string, number>;
}

const sat = (x: number): number => Math.min(1, Math.max(0, x));

const CAP = { density: 8, severitySq: 32, leak: 20, exposure: 15, malware: 5 } as const;

function vaSubScore(input: RiskInput): number {
  const { critical, high, medium, low } = input.vuln;
  const domains = Math.max(1, input.domainCount);
  const density = (critical * 4 + high * 3 + medium * 2 + low * 1) / domains;
  const severitySq = (critical * 16 + high * 9 + medium * 4 + low * 1) / domains;
  return 0.7 * sat(density / CAP.density) + 0.3 * sat(severitySq / CAP.severitySq); // 0..1
}

export function calculateRiskScore(input: RiskInput): RiskResult {
  const weights = input.hasVa
    ? { va: 40, leak: 30, exposure: 12, reputation: 10, malware: 8 }
    : { va: 0, leak: 45, exposure: 25, reputation: 20, malware: 10 };

  const components: Record<string, number> = {
    va: input.hasVa ? weights.va * vaSubScore(input) : 0,
    leak: weights.leak * sat(input.uncheckedLeaks / CAP.leak),
    exposure: weights.exposure * sat((input.threatIndicators + (input.exposureFindings ?? 0)) / CAP.exposure),
    reputation: weights.reputation * sat(input.reputation),
    malware: weights.malware * sat(input.malwareCount / CAP.malware),
  };

  const raw = Object.values(components).reduce((a, b) => a + b, 0);
  const score = Math.round(Math.min(100, Math.max(0, raw)));
  return { score, color: riskColor(score), components };
}

export function riskColor(score: number): RiskColor {
  if (score <= 30) return 'green';
  if (score <= 70) return 'yellow';
  return 'red';
}
