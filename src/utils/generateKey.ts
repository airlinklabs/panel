import crypto from 'crypto';

/**
 * Generates a URL-safe random key using a cryptographically secure source.
 * @param bytes - number of random bytes; output is hex-encoded (2× length)
 */
export function generateSecureKey(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('hex');
}
