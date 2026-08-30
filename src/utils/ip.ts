import type { Request } from 'express';

/**
 * Extracts the client IP address from a request.
 * When behind a reverse proxy, Express sets req.ip correctly after trust proxy is on.
 * For belt-and-suspenders, also reads x-forwarded-for as fallback.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded.split(',')[0];
    return first?.trim() ?? 'unknown';
  }
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
