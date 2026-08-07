import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validatePayload, PGBOSS_SCHEMA } from './queue';

describe('queue payload validation', () => {
  const schema = z.object({ scanId: z.string().uuid(), profile: z.string() });

  it('returns parsed payload for valid data', () => {
    const data = { scanId: '11111111-1111-1111-1111-111111111111', profile: 'default' };
    expect(validatePayload(schema, data)).toEqual(data);
  });

  it('throws on invalid payload', () => {
    expect(() => validatePayload(schema, { scanId: 'nope', profile: 'x' })).toThrow(/Invalid job payload/);
  });

  it('uses a dedicated pgboss schema', () => {
    expect(PGBOSS_SCHEMA).toBe('pgboss');
  });
});
