import { describe, it, expect } from 'vitest';
import { Severity, SEVERITY_LABEL, SEVERITY_WEIGHT } from './severity';

describe('severity', () => {
  it('maps labels and weights', () => {
    expect(SEVERITY_LABEL[Severity.Critical]).toBe('Critical');
    expect(SEVERITY_WEIGHT[Severity.Critical]).toBe(4);
    expect(SEVERITY_WEIGHT[Severity.Info]).toBe(0);
  });
});
