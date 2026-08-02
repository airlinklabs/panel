import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

// Replicate the panel's HMAC signing logic
const HMAC_PAYLOAD_VERSION = 1;

function sign(key: string, method: string, path: string, body: string, ts: number, nonce: string): string {
  const payload = `${ts}:${nonce}:${method.toUpperCase()}:${path}:${body}`;
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

describe('HMAC forgery resistance', () => {
  const realKey = 'super-secret-daemon-key-12345678';
  const fakeKey = 'attacker-known-key-123456789012';

  it('cannot forge signature with different key', () => {
    const ts = Math.floor(Date.now() / 1000);
    const nonce = 'unique-nonce-1';
    const realSig = sign(realKey, 'POST', '/container/stop', '{"id":"abc"}', ts, nonce);
    const fakeSig = sign(fakeKey, 'POST', '/container/stop', '{"id":"abc"}', ts, nonce);
    expect(realSig).not.toBe(fakeSig);
  });

  it('cannot forge signature by modifying body', () => {
    const ts = Math.floor(Date.now() / 1000);
    const nonce = 'unique-nonce-2';
    const sig1 = sign(realKey, 'POST', '/container/stop', '{"id":"abc"}', ts, nonce);
    const sig2 = sign(realKey, 'POST', '/container/stop', '{"id":"xyz"}', ts, nonce);
    expect(sig1).not.toBe(sig2);
  });

  it('cannot forge signature by modifying path', () => {
    const ts = Math.floor(Date.now() / 1000);
    const nonce = 'unique-nonce-3';
    const sig1 = sign(realKey, 'POST', '/container/stop', '', ts, nonce);
    const sig2 = sign(realKey, 'POST', '/container/start', '', ts, nonce);
    expect(sig1).not.toBe(sig2);
  });

  it('cannot forge signature by modifying method', () => {
    const ts = Math.floor(Date.now() / 1000);
    const nonce = 'unique-nonce-4';
    const sig1 = sign(realKey, 'POST', '/test', '', ts, nonce);
    const sig2 = sign(realKey, 'DELETE', '/test', '', ts, nonce);
    expect(sig1).not.toBe(sig2);
  });

  it('cannot forge signature by modifying timestamp', () => {
    const ts = Math.floor(Date.now() / 1000);
    const nonce = 'unique-nonce-5';
    const sig1 = sign(realKey, 'GET', '/test', '', ts, nonce);
    const sig2 = sign(realKey, 'GET', '/test', '', ts + 1, nonce);
    expect(sig1).not.toBe(sig2);
  });

  it('cannot forge signature by modifying nonce', () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig1 = sign(realKey, 'GET', '/test', '', ts, 'nonce-a');
    const sig2 = sign(realKey, 'GET', '/test', '', ts, 'nonce-b');
    expect(sig1).not.toBe(sig2);
  });

  it('signature is deterministic for same inputs', () => {
    const ts = 1700000000;
    const nonce = 'deterministic';
    const s1 = sign(realKey, 'POST', '/test', '{"x":1}', ts, nonce);
    const s2 = sign(realKey, 'POST', '/test', '{"x":1}', ts, nonce);
    expect(s1).toBe(s2);
  });

  it('signature is 64-char hex string', () => {
    const sig = sign(realKey, 'GET', '/', '', Date.now(), 'nonce');
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
  });

  it('constant-time comparison catches length mismatch', () => {
    const a = Buffer.from('abc');
    const b = Buffer.from('abcd');
    expect(timingSafeEqual(a, b)).toBe(false);
  });

  it('constant-time comparison catches content mismatch', () => {
    const a = Buffer.from('abc');
    const b = Buffer.from('abd');
    expect(timingSafeEqual(a, b)).toBe(false);
  });

  it('constant-time comparison accepts equal buffers', () => {
    const a = Buffer.from('abc');
    const b = Buffer.from('abc');
    expect(timingSafeEqual(a, b)).toBe(true);
  });

  it('method case is normalized (lowercase matches uppercase)', () => {
    const ts = Math.floor(Date.now() / 1000);
    const nonce = 'case-test';
    const s1 = sign(realKey, 'get', '/test', '', ts, nonce);
    const s2 = sign(realKey, 'GET', '/test', '', ts, nonce);
    expect(s1).toBe(s2);
  });

  it('empty body produces different signature than null body', () => {
    const ts = Math.floor(Date.now() / 1000);
    const nonce = 'body-test';
    const s1 = sign(realKey, 'POST', '/test', '', ts, nonce);
    const s2 = sign(realKey, 'POST', '/test', 'null', ts, nonce);
    expect(s1).not.toBe(s2);
  });

  it('unicode in body changes signature', () => {
    const ts = Math.floor(Date.now() / 1000);
    const nonce = 'unicode-test';
    const s1 = sign(realKey, 'POST', '/test', '{"name":"hello"}', ts, nonce);
    const s2 = sign(realKey, 'POST', '/test', '{"name":"héllo"}', ts, nonce);
    expect(s1).not.toBe(s2);
  });

  it('very long body produces valid signature', () => {
    const ts = Math.floor(Date.now() / 1000);
    const nonce = 'long-body';
    const longBody = 'x'.repeat(100_000);
    const sig = sign(realKey, 'POST', '/test', longBody, ts, nonce);
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
  });

  it('empty key produces different signature than real key', () => {
    const ts = Math.floor(Date.now() / 1000);
    const nonce = 'empty-key';
    const s1 = sign('', 'GET', '/', '', ts, nonce);
    const s2 = sign(realKey, 'GET', '/', '', ts, nonce);
    expect(s1).not.toBe(s2);
  });
});
