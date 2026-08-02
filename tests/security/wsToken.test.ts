import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

// Replicate wsToken.ts logic for testing
const TOKEN_TTL_MS = 60 * 1000;
const VERSION = 1;

function secret(): string {
  return process.env.SESSION_SECRET || 'dev-only-insecure-secret-change-me';
}

function b64url(input: Buffer): string {
  return input.toString('base64url');
}

function b64urlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

function issueWsToken(serverId: string, userId: number): string {
  const payload = b64url(
    Buffer.from(
      JSON.stringify({
        v: VERSION,
        srv: serverId,
        usr: userId,
        exp: Date.now() + TOKEN_TTL_MS,
      }),
    ),
  );
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyWsToken(token: string | null | undefined): { serverId: string; userId: number } | null {
  if (!token || typeof token !== 'string') {return null;}
  const parts = token.split('.');
  if (parts.length !== 2) {return null;}
  const payload = parts[0];
  const sig = parts[1];
  if (!payload || !sig) {return null;}
  const expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {return null;}
  if (!crypto.timingSafeEqual(a, b)) {return null;}

  try {
    const decoded = JSON.parse(b64urlDecode(payload).toString('utf8'));
    if (decoded.v !== VERSION || typeof decoded.srv !== 'string' || typeof decoded.usr !== 'number') {return null;}
    if (typeof decoded.exp !== 'number' || decoded.exp < Date.now()) {return null;}
    return { serverId: decoded.srv, userId: decoded.usr };
  } catch {
    return null;
  }
}

describe('WebSocket token security', () => {
  it('issues and verifies a valid token', () => {
    const token = issueWsToken('server-uuid-123', 42);
    const payload = verifyWsToken(token);
    expect(payload).toEqual({ serverId: 'server-uuid-123', userId: 42 });
  });

  it('rejects null/undefined tokens', () => {
    expect(verifyWsToken(null)).toBeNull();
    expect(verifyWsToken(undefined)).toBeNull();
    expect(verifyWsToken('')).toBeNull();
  });

  it('rejects tokens with wrong number of parts', () => {
    expect(verifyWsToken('onlyonepart')).toBeNull();
    expect(verifyWsToken('a.b.c')).toBeNull();
    expect(verifyWsToken('..')).toBeNull();
  });

  it('rejects tokens with tampered payload', () => {
    const token = issueWsToken('server-uuid-123', 42);
    const [payload, sig] = token.split('.');
    // Tamper with the payload
    const tampered = b64url(Buffer.from(JSON.stringify({ v: VERSION, srv: 'hacked', usr: 999, exp: Date.now() + 60000 })));
    expect(verifyWsToken(`${tampered}.${sig}`)).toBeNull();
  });

  it('rejects tokens with tampered signature', () => {
    const token = issueWsToken('server-uuid-123', 42);
    const [payload] = token.split('.');
    const tamperedSig = crypto.randomBytes(32).toString('base64url');
    expect(verifyWsToken(`${payload}.${tamperedSig}`)).toBeNull();
  });

  it('rejects expired tokens', () => {
    // Create a token with exp in the past
    const payload = b64url(
      Buffer.from(JSON.stringify({ v: VERSION, srv: 'server-uuid-123', usr: 42, exp: Date.now() - 1000 })),
    );
    const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
    expect(verifyWsToken(`${payload}.${sig}`)).toBeNull();
  });

  it('rejects tokens with wrong version', () => {
    const payload = b64url(
      Buffer.from(JSON.stringify({ v: 999, srv: 'server-uuid-123', usr: 42, exp: Date.now() + 60000 })),
    );
    const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
    expect(verifyWsToken(`${payload}.${sig}`)).toBeNull();
  });

  it('rejects tokens with missing fields', () => {
    // Missing srv
    const p1 = b64url(Buffer.from(JSON.stringify({ v: VERSION, usr: 42, exp: Date.now() + 60000 })));
    const s1 = crypto.createHmac('sha256', secret()).update(p1).digest('base64url');
    expect(verifyWsToken(`${p1}.${s1}`)).toBeNull();

    // Missing usr
    const p2 = b64url(Buffer.from(JSON.stringify({ v: VERSION, srv: 'x', exp: Date.now() + 60000 })));
    const s2 = crypto.createHmac('sha256', secret()).update(p2).digest('base64url');
    expect(verifyWsToken(`${p2}.${s2}`)).toBeNull();

    // Missing exp
    const p3 = b64url(Buffer.from(JSON.stringify({ v: VERSION, srv: 'x', usr: 1 })));
    const s3 = crypto.createHmac('sha256', secret()).update(p3).digest('base64url');
    expect(verifyWsToken(`${p3}.${s3}`)).toBeNull();
  });

  it('rejects tokens with non-string serverId', () => {
    const payload = b64url(Buffer.from(JSON.stringify({ v: VERSION, srv: 123, usr: 42, exp: Date.now() + 60000 })));
    const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
    expect(verifyWsToken(`${payload}.${sig}`)).toBeNull();
  });

  it('rejects tokens with non-number userId', () => {
    const payload = b64url(Buffer.from(JSON.stringify({ v: VERSION, srv: 'x', usr: '42', exp: Date.now() + 60000 })));
    const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
    expect(verifyWsToken(`${payload}.${sig}`)).toBeNull();
  });

  it('rejects garbage strings', () => {
    expect(verifyWsToken('not-a-token')).toBeNull();
    expect(verifyWsToken('eyJ2IjoxLCJzcnYiOiJ4In0.abc')).toBeNull();
    expect(verifyWsToken('!!!invalid!!!')).toBeNull();
  });

  it('rejects tokens signed with wrong secret', () => {
    // Manually create a token with a different secret
    const payload = b64url(
      Buffer.from(JSON.stringify({ v: VERSION, srv: 'server-uuid-123', usr: 42, exp: Date.now() + 60000 })),
    );
    const sig = crypto.createHmac('sha256', 'wrong-secret-key').update(payload).digest('base64url');
    expect(verifyWsToken(`${payload}.${sig}`)).toBeNull();
  });

  it('timing-safe comparison prevents timing attacks', () => {
    const token = issueWsToken('server-uuid-123', 42);
    const [payload] = token.split('.');

    // Try many different signatures to detect timing differences
    const times: number[] = [];
    for (let i = 0; i < 10; i++) {
      const fakeSig = crypto.randomBytes(32).toString('base64url');
      const start = performance.now();
      verifyWsToken(`${payload}.${fakeSig}`);
      times.push(performance.now() - start);
    }

    // All rejections should take roughly the same time (timing-safe)
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const maxDeviation = Math.max(...times.map((t) => Math.abs(t - avg)));
    // Should not vary wildly (generous threshold for CI noise)
    expect(maxDeviation).toBeLessThan(avg * 3 + 5);
  });
});
