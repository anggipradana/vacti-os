import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

export const TOKEN_PREFIX = 'vct_';

export interface GeneratedToken {
  /** Shown to the user exactly once. */
  plaintext: string;
  /** Stored in the database. */
  hash: string;
}

/** Create an API token. The plaintext is returned once; only the hash is persisted. */
export function generateApiToken(): GeneratedToken {
  const plaintext = TOKEN_PREFIX + randomBytes(32).toString('base64url');
  return { plaintext, hash: hashToken(plaintext) };
}

export function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

/** Constant-time comparison of a presented token against a stored hash. */
export function verifyToken(plaintext: string, storedHash: string): boolean {
  const a = Buffer.from(hashToken(plaintext), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
