import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

// Test the HMAC signing logic directly (same as daemonRequest.ts).
// HMAC v1: non-GET bodies are signed as `digest:<sha256 hex of the exact bytes>`.

function hmacSign(key: string, method: string, path: string, bodyRepr: string, timestamp: number, nonce: string): string {
  const payload = `${timestamp}:${nonce}:${method.toUpperCase()}:${path}:${bodyRepr}`;
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function digestHex(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function bodyRepr(body: string): string {
  return `digest:${digestHex(body)}`;
}

describe('HMAC signing (protocol v1 — digest-signed bodies)', () => {
  const testKey = 'test-secret-key-12345';

  it('matches the known-answer vector shared with the daemon test suite', () => {
    // cross-repo parity: daemon tests/security/hmacFull.test.ts asserts the same
    // payload + signature — if the signing format drifts on either side this fails
    const payload = `1700000000:nonce:POST:/container/start:${bodyRepr('{"id":"test"}')}`;
    const sig = hmacSign(testKey, 'POST', '/container/start', bodyRepr('{"id":"test"}'), 1700000000, 'nonce');
    expect(payload).toBe(
      '1700000000:nonce:POST:/container/start:digest:665c531373a4d3427505587923a4f15ac573fb8e96b1f983ec1d6eacdfa4334c',
    );
    expect(sig).toBe('07dc58d6643f3b31e3dad065dc7565aa5fc56f82d3c656b3fcc451f6efc059b8');
  });

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
    const sig1 = hmacSign(testKey, 'POST', '/test', bodyRepr('{"id":"a"}'), 1700000000, 'nonce');
    const sig2 = hmacSign(testKey, 'POST', '/test', bodyRepr('{"id":"b"}'), 1700000000, 'nonce');
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
