import type { Request, Response, NextFunction } from 'express';
import { doubleCsrf } from 'csrf-csrf';
import crypto from 'crypto';
import logger from '../services/logger.js';

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
    process.env.NODE_ENV === 'production'
      ? '__Host-psifi.x-csrf-token'
      : 'psifi.x-csrf-token',
  cookieOptions: {
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: false, // Must be false so the React client can read the token
  },
  size: 32,
  getCsrfTokenFromRequest: (req: Request) =>
    (req.headers['csrf-token'] as string) ||
    (req.headers['x-csrf-token'] as string) ||
    (typeof req.body === 'object' && req.body !== null ? (req.body._csrf as string | undefined) : undefined),
});

export const csrfProtection = doubleCsrfProtection;

export const handleCsrfError = (err: unknown, req: Request, res: Response, next: NextFunction) => {
  const csrfError = err as { code?: string };
  if (csrfError.code !== 'EBADCSRFTOKEN') {
    next(err); return;
  }
  logger.warn(`CSRF attack detected: IP=${req.ip}, Path=${req.path}, Method=${req.method}`);
  if (req.xhr || req.headers.accept?.includes('application/json')) {
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
