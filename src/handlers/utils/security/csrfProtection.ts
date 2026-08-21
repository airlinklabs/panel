import type { Request, Response, NextFunction } from 'express';
import { doubleCsrf } from 'csrf-csrf';
import crypto from 'crypto';
import logger from '../../logger';
import { getClientIp } from '../../../utils/ip';

const CSRF_TOKEN_SIZE = 32;
// Session cookies already derive their Secure attribute from URL in app.ts.
// The CSRF cookie must use the exact same rule: production HTTP installs are
// supported behind a local/reverse-proxy setup, while HTTPS remains secure.
// `loadEnv()` runs after static imports in app.ts, so this must remain a pure
// environment read rather than calling getConfig() at module evaluation time.
const csrfCookieSecure = (process.env.URL || '').startsWith('https://');

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Accept the standard header used by HTMX/XHR first, then the progressively
 * enhanced form field. Keeping this in one place prevents the two clients
 * from drifting into different CSRF contracts.
 */
export function getRequestCsrfToken(req: Request): string | undefined {
  const body = req.body as Record<string, unknown> | undefined;
  const formToken = typeof body?._csrf === 'string' ? body._csrf : undefined;

  return (
    firstHeaderValue(req.headers['x-csrf-token']) ||
    firstHeaderValue(req.headers['csrf-token']) ||
    formToken
  );
}

function ensureCsrfSessionId(req: Request): string {
  const session = req.session as { csrfSessionId?: string } | undefined;

  if (!session) {return '';}

  if (!session.csrfSessionId) {
    session.csrfSessionId = crypto.randomBytes(16).toString('hex');
  }

  return session.csrfSessionId;
}

const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  // SESSION_SECRET must be set. The startup check in envLoader.ts ensures this.
  // If somehow missing at runtime, fail hard rather than using an insecure default.
  getSecret: () => {
    const secret = process.env.SESSION_SECRET;
    if (!secret) {throw new Error('SESSION_SECRET is required but not set');}
    return secret;
  },
  getSessionIdentifier: (req: Request) => ensureCsrfSessionId(req),
  cookieName:
    csrfCookieSecure
      ? '__Host-psifi.x-csrf-token'
      : 'psifi.x-csrf-token',
  cookieOptions: {
    sameSite: 'lax',
    secure: csrfCookieSecure,
    httpOnly: true,
  },
  size: CSRF_TOKEN_SIZE,
  getCsrfTokenFromRequest: getRequestCsrfToken,
});

export const csrfProtection = doubleCsrfProtection;

export const handleCsrfError = (err: unknown, req: Request, res: Response, next: NextFunction) => {
  const csrfError = err as { code?: string };
  if (csrfError.code !== 'EBADCSRFTOKEN') {
    return next(err);
  }
  logger.warn(`CSRF attack detected: IP=${getClientIp(req)}, Path=${req.path}, Method=${req.method}`);
  const wantsJson =
    req.get('HX-Request') === 'true' ||
    req.xhr ||
    req.headers.accept?.includes('application/json') ||
    req.headers['content-type']?.includes('application/json');
  if (wantsJson) {
    if (req.get('HX-Request') === 'true') {
      res.setHeader(
        'HX-Trigger',
        JSON.stringify({
          al: {
            toast: {
              type: 'error',
              message: 'Your security token expired. Refresh the page and try again.',
            },
          },
        }),
      );
    }
    res.status(403).json({ error: 'CSRF token validation failed' });
  } else {
    res.redirect('/login?err=session_expired');
  }
};

export const addCsrfTokenToLocals = (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureCsrfSessionId(req);
    res.locals.csrfToken = generateCsrfToken(req, res);
  } catch (error: unknown) {
    logger.warn('Failed to generate CSRF token', { error });
  }
  next();
};

export default csrfProtection;
