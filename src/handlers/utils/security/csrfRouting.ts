/**
 * CSRF exemption routing — determines per request whether CSRF validation runs.
 * Only WebSocket upgrades and bearer-only API mounts (API-key authenticated) are exempt.
 * All session-authenticated /api/* routes require a valid CSRF token on non-GET requests.
 */

import type { Request } from "express";

/** API mounts authenticated exclusively via API-key headers, never cookies. */
const BEARER_ONLY_MOUNTS = [
  "/api/v1",
  "/api/client",
  "/api/application",
  "/api/health",
] as const;

function isMount(path: string, mount: string): boolean {
  return path === mount || path.startsWith(`${mount}/`);
}

/** True for the realtime websocket upgrade paths. */
export function isWsUpgrade(path: string): boolean {
  return path === "/ws" || path.startsWith("/ws/");
}

/** True when the path belongs to a bearer-only (API-key) mount. */
export function isBearerOnlyApi(path: string): boolean {
  return BEARER_ONLY_MOUNTS.some((mount) => isMount(path, mount));
}

/**
 * Returns true when the request should skip CSRF validation entirely.
 * Only used to route around doubleCsrf; safe methods are already allowed.
 */
export function isCsrfExempt(req: Pick<Request, "path">): boolean {
  if (isWsUpgrade(req.path)) {
    return true;
  }
  if (isBearerOnlyApi(req.path)) {
    return true;
  }
  return false;
}
