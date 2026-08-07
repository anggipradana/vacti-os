import { describe, it, expect } from 'vitest';
import { calculateRiskScore, riskColor, type RiskInput } from './risk-score';

const zero: RiskInput = {
  hasVa: true,
  vuln: { critical: 0, high: 0, medium: 0, low: 0 },
  domainCount: 1,
  uncheckedLeaks: 0,
  threatIndicators: 0,
  reputation: 0,
  malwareCount: 0,
};

describe('calculateRiskScore', () => {
  it('is 0 / green when there is no signal', () => {
    const r = calculateRiskScore(zero);
    expect(r.score).toBe(0);
    expect(r.color).toBe('green');
  });

  it('is bounded to 100 / red under heavy signal', () => {
    const r = calculateRiskScore({
      ...zero,
      vuln: { critical: 50, high: 50, medium: 50, low: 50 },
      uncheckedLeaks: 100,
      threatIndicators: 100,
      reputation: 1,
      malwareCount: 100,
    });
    expect(r.score).toBe(100);
    expect(r.color).toBe('red');
  });

  it('redistributes weight when VA is absent and stays bounded', () => {
    const r = calculateRiskScore({
      ...zero,
      hasVa: false,
      uncheckedLeaks: 100,
      threatIndicators: 100,
      reputation: 1,
      malwareCount: 100,
    });
    expect(r.components.va).toBe(0);
    expect(r.score).toBe(100);
  });

  it('reviewing leaks (fewer unchecked) lowers the score', () => {
    const many = calculateRiskScore({ ...zero, uncheckedLeaks: 20 });
    const few = calculateRiskScore({ ...zero, uncheckedLeaks: 5 });
    expect(many.score).toBeGreaterThan(few.score);
  });

  it('maps colour bands correctly', () => {
    expect(riskColor(0)).toBe('green');
    expect(riskColor(30)).toBe('green');
    expect(riskColor(31)).toBe('yellow');
    expect(riskColor(70)).toBe('yellow');
    expect(riskColor(71)).toBe('red');
    expect(riskColor(100)).toBe('red');
  });
});
