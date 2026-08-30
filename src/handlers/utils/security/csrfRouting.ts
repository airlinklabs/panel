/**
 * CSRF exemption routing — determines per request whether CSRF validation runs.
 * Only WebSocket upgrades, bearer-only API mounts, and Bearer-authenticated
 * requests are exempt. All session-authenticated routes require a valid CSRF
 * token on non-GET requests.
 *
 * V2 API routes use hybrid auth (API-key via Bearer header OR session cookie).
 * When a Bearer header is present, the request is API-key authenticated and
 * CSRF protection is unnecessary (no cookie involved). When session auth is
 * used, CSRF protection applies normally.
 */

import type { Request } from "express";

/** API mounts authenticated exclusively via API-key headers, never cookies. */
const BEARER_ONLY_MOUNTS = [
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
 *
 * Exemptions:
 *   1. WebSocket upgrades
 *   2. Bearer-only mounts (client, application, health)
 *   3. Any request with Authorization: Bearer header (API-key auth, no cookie)
 */
export function isCsrfExempt(req: Pick<Request, "path" | "headers">): boolean {
  if (isWsUpgrade(req.path)) {
    return true;
  }
  if (isBearerOnlyApi(req.path)) {
    return true;
  }
  // V2 hybrid auth: Bearer header means API-key auth → no cookie → no CSRF needed
  const authHeader = req.headers?.["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    return true;
  }
  return false;
}
