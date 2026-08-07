import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

/**
 * AES-256-GCM vault for API keys (OTX/LeakCheck/AI). Ciphertext format:
 * `<ivHex>:<authTagHex>:<cipherHex>`. The key is the base64-decoded ENCRYPTION_KEY (32 bytes).
 */
const IV_LEN = 12;

function keyFromBase64(b64: string): Buffer {
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must decode to 32 bytes');
  return key;
}

export function encryptSecret(plaintext: string, keyB64: string): string {
  const key = keyFromBase64(keyB64);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptSecret(ciphertext: string, keyB64: string): string {
  const key = keyFromBase64(keyB64);
  const [ivHex, tagHex, dataHex] = ciphertext.split(':');
  if (!ivHex || !tagHex || !dataHex) throw new Error('Malformed ciphertext');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}
