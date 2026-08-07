import { describe, it, expect } from 'vitest';
import { loadEnv } from './env';

const KEY = Buffer.alloc(32, 7).toString('base64');
const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  ENCRYPTION_KEY: KEY,
};

describe('loadEnv', () => {
  it('parses a valid environment with defaults', () => {
    const env = loadEnv(base as NodeJS.ProcessEnv);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.DATABASE_URL).toContain('postgres://');
  });

  it('rejects a bad encryption key length', () => {
    expect(() =>
      loadEnv({ ...base, ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') } as NodeJS.ProcessEnv),
    ).toThrow(/ENCRYPTION_KEY must be 32 bytes/);
  });

  it('rejects a missing DATABASE_URL', () => {
    const { DATABASE_URL, ...rest } = base;
    void DATABASE_URL;
    expect(() => loadEnv(rest as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
  });
});
