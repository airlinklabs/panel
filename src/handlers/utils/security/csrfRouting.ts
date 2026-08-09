/**
 * CSRF exemption routing.
 *
 * Historically every /api/* route skipped CSRF validation because the panel's
 * API mounts were assumed to be bearer-token authenticated. That is only true
 * for the Pterodactyl-compatible mounts. Several /api routes are authenticated
 * purely by the session cookie (folder system, admin endpoints, admin system
 * status, search) and were therefore wide open to cross-site request forgery.
 *
 * This module decides, per request, whether double-csrf protection should run.
 * Only two classes of request are exempt:
 *
 *   1. WebSocket upgrades (/ws/*) — the handshake is a GET upgrade; a CSRF
 *      token cannot be attached to it. The realtime endpoint authenticates via
 *      the session cookie and enforces server-side event filtering.
 *
 *   2. The bearer-only API mounts, which require an API-key header the
 *      attacker cannot know (and /api/health, a public GET).
 *
 * Everything else — including session-authenticated /api/* routes — must
 * present a valid CSRF token on non-GET requests.
 */

import type { Request } from 'express';

/** API mounts authenticated exclusively via API-key headers, never cookies. */
const BEARER_ONLY_MOUNTS = [
  '/api/v1',
  '/api/client',
  '/api/application',
  '/api/health',
] as const;

function isMount(path: string, mount: string): boolean {
  return path === mount || path.startsWith(`${mount  }/`);
}

/** True for the realtime websocket upgrade paths. */
export function isWsUpgrade(path: string): boolean {
  return path === '/ws' || path.startsWith('/ws/');
}

/** True when the path belongs to a bearer-only (API-key) mount. */
export function isBearerOnlyApi(path: string): boolean {
  return BEARER_ONLY_MOUNTS.some((mount) => isMount(path, mount));
}

/**
 * Returns true when the request should skip CSRF validation entirely.
 * Only used to route around doubleCsrf; safe methods are already allowed.
 */
export function isCsrfExempt(req: Pick<Request, 'path'>): boolean {
  if (isWsUpgrade(req.path)) {return true;}
  if (isBearerOnlyApi(req.path)) {return true;}
  return false;
}
