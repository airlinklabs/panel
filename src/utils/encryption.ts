import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const PBKDF2_ITERATIONS = 100_000;
const SALT = 'airlink-panel-encryption-v1';

/**
 * Derive a 256-bit encryption key from the panel's SESSION_SECRET.
 * Uses PBKDF2 with a fixed salt (the secret itself provides entropy).
 */
function deriveKey(secret: string): Buffer {
  return crypto.pbkdf2Sync(
    secret,
    SALT,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    'sha512',
  );
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a compact string: base64(iv):base64(ciphertext):base64(authTag)
 */
export function encrypt(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('base64'),
    encrypted.toString('base64'),
    authTag.toString('base64'),
  ].join(':');
}

/**
 * Decrypt a string previously encrypted with `encrypt()`.
 * Expects format: base64(iv):base64(ciphertext):base64(authTag)
 */
export function decrypt(ciphertext: string, secret: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted value format');
  }

  const [ivB64, encB64, tagB64] = parts as [string, string, string];
  const iv = Buffer.from(ivB64!, 'base64');
  const encrypted = Buffer.from(encB64!, 'base64');
  const authTag = Buffer.from(tagB64!, 'base64');

  const key = deriveKey(secret);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Check whether a value looks like it was encrypted by this module.
 * Encrypted values have the shape base64:base64:base64 (three colon-separated segments).
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  if (parts.length !== 3) {return false;}
  return parts.every((p) => {
    try {
      return Buffer.from(p, 'base64').toString('base64') === p;
    } catch {
      return false;
    }
  });
}
