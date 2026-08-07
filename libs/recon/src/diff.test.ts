import { describe, it, expect } from 'vitest';
import { diffScans } from './diff';

describe('diffScans', () => {
  it('computes added/removed/unchanged per category', () => {
    const baseline = { subdomains: ['a.x', 'b.x'], endpoints: ['http://a.x'], ports: ['1.1.1.1:80'], vulns: ['v1'] };
    const current = {
      subdomains: ['b.x', 'c.x'],
      endpoints: ['http://a.x'],
      ports: ['1.1.1.1:443'],
      vulns: ['v1', 'v2'],
    };
    const d = diffScans(baseline, current);
    expect(d.subdomains.added).toEqual(['c.x']);
    expect(d.subdomains.removed).toEqual(['a.x']);
    expect(d.subdomains.unchanged).toBe(1);
    expect(d.endpoints).toEqual({ added: [], removed: [], unchanged: 1 });
    expect(d.ports.added).toEqual(['1.1.1.1:443']);
    expect(d.ports.removed).toEqual(['1.1.1.1:80']);
    expect(d.vulns.added).toEqual(['v2']);
    expect(d.vulns.removed).toEqual([]);
  });
});
