import { scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';

const scrypt = promisify(scryptCb) as (pw: string | Buffer, salt: Buffer, keylen: number) => Promise<Buffer>;

/**
 * Hash a password with **argon2id** (OWASP-recommended). Returns a self-describing
 * `$argon2id$...` PHC string. Legacy `scrypt$<salt>$<hash>` hashes still verify (see below) and are
 * upgraded on next login via {@link needsRehash}.
 */
export async function hashPassword(password: string): Promise<string> {
  // @node-rs/argon2 defaults to Argon2id - the OWASP-recommended variant.
  return argonHash(password);
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith('$argon2')) {
    try {
      return await argonVerify(stored, password);
    } catch {
      return false;
    }
  }
  // Legacy scrypt format (pre-argon2id migration): `scrypt$<saltHex>$<hashHex>`.
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1]!, 'hex');
  const expected = Buffer.from(parts[2]!, 'hex');
  const actual = await scrypt(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** True if the stored hash is not argon2id and should be re-hashed after a successful login. */
export function needsRehash(stored: string): boolean {
  return !stored.startsWith('$argon2');
}
