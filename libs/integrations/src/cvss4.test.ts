import { describe, expect, it } from 'vitest';
import { cvss4Score, cvss4Severity, scoreVector, parseCvss4, withMetric, cleanVector } from './cvss4';

// Reference values generated from the official Red Hat / FIRST implementation
// (RedHatProductSecurity/cvss cvss4.py). score | vacti-severity | vector.
const REFERENCE: Array<[number, ReturnType<typeof cvss4Severity>, string]> = [
  [10.0, 'critical', 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:H/SI:H/SA:H'],
  [9.3, 'critical', 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N'],
  [8.7, 'high', 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:N/VA:N/SC:N/SI:N/SA:N'],
  [6.9, 'medium', 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:L/VI:N/VA:N/SC:N/SI:N/SA:N'],
  [0.0, 'info', 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:N/SC:N/SI:N/SA:N'],
  [1.0, 'low', 'CVSS:4.0/AV:P/AC:H/AT:P/PR:H/UI:A/VC:L/VI:L/VA:L/SC:L/SI:L/SA:L'],
  [5.2, 'medium', 'CVSS:4.0/AV:A/AC:L/AT:N/PR:L/UI:P/VC:H/VI:L/VA:N/SC:L/SI:N/SA:N'],
  [9.3, 'critical', 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:H/SI:H/SA:H/E:P'],
  [7.9, 'high', 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:H/SI:H/SA:H/E:U/CR:L/IR:L/AR:L'],
  [9.3, 'critical', 'CVSS:4.0/AV:L/AC:L/AT:N/PR:L/UI:N/VC:H/VI:H/VA:H/SC:H/SI:H/SA:H'],
  [9.2, 'critical', 'CVSS:4.0/AV:N/AC:H/AT:P/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N'],
  [7.1, 'high', 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:P/VC:N/VI:H/VA:N/SC:N/SI:N/SA:N'],
];

describe('cvss4Score matches the official reference', () => {
  for (const [expected, sev, vector] of REFERENCE) {
    it(`${vector} -> ${expected} (${sev})`, () => {
      expect(cvss4Score(vector)).toBe(expected);
      const s = scoreVector(vector);
      expect(s.baseScore).toBe(expected);
      expect(s.severity).toBe(sev);
    });
  }
});

describe('cvss4Severity bands', () => {
  it('maps score to vacti scale (None->info)', () => {
    expect(cvss4Severity(0)).toBe('info');
    expect(cvss4Severity(3.9)).toBe('low');
    expect(cvss4Severity(4.0)).toBe('medium');
    expect(cvss4Severity(6.9)).toBe('medium');
    expect(cvss4Severity(7.0)).toBe('high');
    expect(cvss4Severity(8.9)).toBe('high');
    expect(cvss4Severity(9.0)).toBe('critical');
  });
});

describe('parseCvss4', () => {
  it('accepts a valid vector', () => {
    expect(parseCvss4('CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:H/SI:H/SA:H').valid).toBe(true);
  });
  it('rejects missing prefix / mandatory / bad value', () => {
    expect(parseCvss4('AV:N/AC:L').valid).toBe(false);
    expect(parseCvss4('CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H').valid).toBe(false); // missing SC/SI/SA
    expect(parseCvss4('CVSS:4.0/AV:Z/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:H/SI:H/SA:H').valid).toBe(false);
  });
});

describe('withMetric (edit CIA + recompute)', () => {
  it('lowering the exposed confidentiality drops the score', () => {
    const base = 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:H/SI:H/SA:H';
    const lowered = withMetric(base, 'VC', 'L');
    expect(lowered).toContain('VC:L');
    expect(cvss4Score(lowered)).toBeLessThan(cvss4Score(base));
  });
  it('setting an impact to None recomputes a lower severity, and X clears an optional metric', () => {
    const base = 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:N/VA:N/SC:N/SI:N/SA:N';
    expect(cvss4Score(base)).toBe(8.7);
    const none = withMetric(base, 'VC', 'N');
    expect(cvss4Score(none)).toBe(0); // all impacts None
    const withE = withMetric(base, 'E', 'U');
    expect(withE).toContain('E:U');
    expect(withMetric(withE, 'E', 'X')).toBe(base); // clearing E returns the clean base
  });
  it('emits a spec-ordered clean vector', () => {
    expect(
      cleanVector({
        VC: 'H',
        AV: 'N',
        AC: 'L',
        AT: 'N',
        PR: 'N',
        UI: 'N',
        VI: 'H',
        VA: 'H',
        SC: 'N',
        SI: 'N',
        SA: 'N',
        E: 'X',
      }),
    ).toBe('CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N');
  });
});
