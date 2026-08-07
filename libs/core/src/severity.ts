/** Vulnerability severity on a -1..4 scale (informational through critical). */
export const Severity = {
  Unknown: -1,
  Info: 0,
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
} as const;

export type SeverityValue = (typeof Severity)[keyof typeof Severity];

export const SEVERITY_LABEL: Record<SeverityValue, string> = {
  [Severity.Unknown]: 'Unknown',
  [Severity.Info]: 'Info',
  [Severity.Low]: 'Low',
  [Severity.Medium]: 'Medium',
  [Severity.High]: 'High',
  [Severity.Critical]: 'Critical',
};

/** Weight used by the unified risk score (crit×4 + high×3 + med×2 + low×1). */
export const SEVERITY_WEIGHT: Record<SeverityValue, number> = {
  [Severity.Unknown]: 0,
  [Severity.Info]: 0,
  [Severity.Low]: 1,
  [Severity.Medium]: 2,
  [Severity.High]: 3,
  [Severity.Critical]: 4,
};
