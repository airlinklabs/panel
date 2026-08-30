/**
 * Upstream capability tokens — replace static key auth for panel→daemon WS.
 *
 * The panel mints a short-lived, scoped capability token instead of sending
 * the raw node key over the WebSocket. The daemon verifies the token's
 * signature, expiry, route match, and nonce before allowing attach/poll/subscribe.
 *
 * Wire format: base64url(payload).base64url(hmac-sha256)
 * Signed with the daemon's node key.
 */

import crypto from 'node:crypto';

const CAPABILITY_VERSION = 1;
const CAPABILITY_TTL_MS = 60_000; // 60 seconds

function b64url(input: Buffer): string {
  return input.toString('base64url');
}

function b64urlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

export interface CapabilityClaims {
  /** Protocol version. */
  v: number;
  /** Node ID this token is valid for. */
  nodeId: number;
  /** Server/container ID the panel wants to attach to. */
  serverId: string;
  /** Permitted daemon WS route(s). */
  routes: ('container' | 'containerstatus' | 'containerevents')[];
  /** Issued-at (ms since epoch). */
  iat: number;
  /** Expiry (ms since epoch). */
  exp: number;
  /** Unique token ID (replay prevention). */
  jti: string;
}

export interface MintOptions {
  nodeKey: string;
  nodeId: number;
  serverId: string;
  routes: ('container' | 'containerstatus' | 'containerevents')[];
}

/**
 * Mints a capability token for upstream WS auth.
 * The token is signed with the node key and has a short TTL.
 */
export function mintCapabilityToken(options: MintOptions): string {
  const { nodeKey, nodeId, serverId, routes } = options;
  const now = Date.now();
  const claims: CapabilityClaims = {
    v: CAPABILITY_VERSION,
    nodeId,
    serverId,
    routes: [...routes].sort(),
    iat: now,
    exp: now + CAPABILITY_TTL_MS,
    jti: crypto.randomUUID(),
  };

  const payload = b64url(Buffer.from(JSON.stringify(claims)));
  const sig = crypto
    .createHmac('sha256', nodeKey)
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

export type VerifyResult =
  | {
      ok: true;
      claims: CapabilityClaims;
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Verifies a capability token on the daemon side.
 * Checks: signature, version, expiry, route match, server ID match.
 */
export function verifyCapabilityToken(
  token: string,
  expectedKey: string,
  expectedServerId: string,
  expectedRoute: string,
): VerifyResult {
  if (!token || typeof token !== 'string') {
    return { ok: false, error: 'missing token' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { ok: false, error: 'malformed token' };
  }

  const [payload, sig] = [parts[0]!, parts[1]!];

  // Verify signature
  const expected = crypto
    .createHmac('sha256', expectedKey)
    .update(payload)
    .digest('base64url');
  const a = Buffer.from(sig, 'base64url');
  const b = Buffer.from(expected, 'base64url');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: 'invalid signature' };
  }

  // Decode and validate claims
  let claims: CapabilityClaims;
  try {
    claims = JSON.parse(
      b64urlDecode(payload).toString('utf8'),
    ) as CapabilityClaims;
  } catch {
    return { ok: false, error: 'invalid payload' };
  }

  if (claims.v !== CAPABILITY_VERSION) {
    return { ok: false, error: 'unsupported version' };
  }

  if (
    typeof claims.serverId !== 'string' ||
    claims.serverId !== expectedServerId
  ) {
    return { ok: false, error: 'server ID mismatch' };
  }

  if (
    !Array.isArray(claims.routes) ||
    !(claims.routes as string[]).includes(expectedRoute)
  ) {
    return { ok: false, error: 'route not permitted' };
  }

  if (typeof claims.exp !== 'number' || claims.exp < Date.now()) {
    return { ok: false, error: 'token expired' };
  }

  if (typeof claims.iat !== 'number' || claims.iat > Date.now()) {
    return { ok: false, error: 'token from the future' };
  }

  return { ok: true, claims };
}
