import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

// Test the HMAC signing logic directly (same as daemonRequest.ts)
const HMAC_PAYLOAD_VERSION = 1;

function hmacSign(key: string, method: string, path: string, body: string, timestamp: number, nonce: string): string {
  const payload = `${timestamp}:${nonce}:${method.toUpperCase()}:${path}:${body}`;
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

describe('HMAC signing', () => {
  const testKey = 'test-secret-key-12345';

  it('produces consistent signatures for same inputs', () => {
    const sig1 = hmacSign(testKey, 'GET', '/container/status', '', 1700000000, 'abc123');
    const sig2 = hmacSign(testKey, 'GET', '/container/status', '', 1700000000, 'abc123');
    expect(sig1).toBe(sig2);
  });

  it('produces different signatures for different timestamps', () => {
    const sig1 = hmacSign(testKey, 'GET', '/test', '', 1700000000, 'nonce');
    const sig2 = hmacSign(testKey, 'GET', '/test', '', 1700000001, 'nonce');
    expect(sig1).not.toBe(sig2);
  });

  it('produces different signatures for different nonces', () => {
    const sig1 = hmacSign(testKey, 'GET', '/test', '', 1700000000, 'nonce1');
    const sig2 = hmacSign(testKey, 'GET', '/test', '', 1700000000, 'nonce2');
    expect(sig1).not.toBe(sig2);
  });

  it('produces different signatures for different methods', () => {
    const sig1 = hmacSign(testKey, 'GET', '/test', '', 1700000000, 'nonce');
    const sig2 = hmacSign(testKey, 'POST', '/test', '', 1700000000, 'nonce');
    expect(sig1).not.toBe(sig2);
  });

  it('produces different signatures for different paths', () => {
    const sig1 = hmacSign(testKey, 'GET', '/a', '', 1700000000, 'nonce');
    const sig2 = hmacSign(testKey, 'GET', '/b', '', 1700000000, 'nonce');
    expect(sig1).not.toBe(sig2);
  });

  it('produces different signatures for different bodies', () => {
    const sig1 = hmacSign(testKey, 'POST', '/test', '{"id":"a"}', 1700000000, 'nonce');
    const sig2 = hmacSign(testKey, 'POST', '/test', '{"id":"b"}', 1700000000, 'nonce');
    expect(sig1).not.toBe(sig2);
  });

  it('produces different signatures for different keys', () => {
    const sig1 = hmacSign('key1', 'GET', '/test', '', 1700000000, 'nonce');
    const sig2 = hmacSign('key2', 'GET', '/test', '', 1700000000, 'nonce');
    expect(sig1).not.toBe(sig2);
  });

  it('normalizes method to uppercase', () => {
    const sig1 = hmacSign(testKey, 'get', '/test', '', 1700000000, 'nonce');
    const sig2 = hmacSign(testKey, 'GET', '/test', '', 1700000000, 'nonce');
    expect(sig1).toBe(sig2);
  });

  it('returns hex string of correct length', () => {
    const sig = hmacSign(testKey, 'GET', '/test', '', 1700000000, 'nonce');
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
  });
});
