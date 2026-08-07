import { describe, it, expect } from 'vitest';
import { isPrivateOrLoopbackValue } from './refresh';

describe('isPrivateOrLoopbackValue (TI lookup guard)', () => {
  it('flags loopback/private/reserved hosts so OSINT is not queried for them', () => {
    for (const v of [
      '127.0.0.1',
      '10.0.0.5',
      '192.168.1.1',
      '172.16.0.1',
      '169.254.169.254',
      '100.64.1.1',
      '224.0.0.1',
      'localhost',
      'svc.local',
      '::1',
      '',
    ])
      expect(isPrivateOrLoopbackValue(v)).toBe(true);
  });
  it('allows public domains and public IPs (monitored assets)', () => {
    for (const v of ['example.com', 'api.example.com', '8.8.8.8', '203.0.113.20', '203.0.113.10'])
      expect(isPrivateOrLoopbackValue(v)).toBe(false);
  });
});
