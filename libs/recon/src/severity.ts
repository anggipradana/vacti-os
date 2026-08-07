import { Severity, type SeverityValue } from '@vacti/core';

/** Map a nuclei severity string to the shared Severity scale. */
export function mapNucleiSeverity(s: string | undefined): SeverityValue {
  switch ((s ?? '').toLowerCase()) {
    case 'critical':
      return Severity.Critical;
    case 'high':
      return Severity.High;
    case 'medium':
      return Severity.Medium;
    case 'low':
      return Severity.Low;
    case 'info':
      return Severity.Info;
    default:
      return Severity.Unknown;
  }
}
