import crypto from 'node:crypto';

const TOKEN_TTL_MS = 60 * 1000;
const VERSION = 1;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    throw new Error('SESSION_SECRET environment variable is required');
  }
  return s;
}

function b64url(input: Buffer): string {
  return input.toString('base64url');
}

function b64urlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

export function issueWsToken(serverId: string, userId: number): string {
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
  const sig = crypto
    .createHmac('sha256', secret())
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

export interface WsTokenPayload {
  serverId: string;
  userId: number;
}

export function verifyWsToken(
  token: string | null | undefined,
): WsTokenPayload | null {
  if (!token || typeof token !== 'string') {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [payload, sig] = [parts[0]!, parts[1]!];
  const expected = crypto
    .createHmac('sha256', secret())
    .update(payload)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const decoded = JSON.parse(b64urlDecode(payload).toString('utf8')) as {
      v?: number;
      srv?: string;
      usr?: number;
      exp?: number;
    };
    if (
      decoded.v !== VERSION ||
      typeof decoded.srv !== 'string' ||
      typeof decoded.usr !== 'number'
    ) {
      return null;
    }
    if (typeof decoded.exp !== 'number' || decoded.exp < Date.now()) {
      return null;
    }
    return { serverId: decoded.srv, userId: decoded.usr };
  } catch {
    return null;
  }
}
