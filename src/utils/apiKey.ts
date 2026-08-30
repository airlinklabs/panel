import crypto from 'crypto';

const API_KEY_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generate a cryptographically secure random API key of the given length.
 * Uses `crypto.randomBytes` for proper entropy instead of `Math.random`.
 */
export function generateApiKey(length: number): string {
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += API_KEY_CHARS[bytes[i]! % API_KEY_CHARS.length];
  }
  return result;
}
