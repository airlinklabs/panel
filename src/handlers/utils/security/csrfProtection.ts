import { Request, Response, NextFunction } from 'express';
import { doubleCsrf } from 'csrf-csrf';
import crypto from 'crypto';
import logger from '../../logger';

function ensureCsrfSessionId(req: Request): string {
  const session = req.session as { csrfSessionId?: string } | undefined;

  if (!session) return '';

  if (!session.csrfSessionId) {
    session.csrfSessionId = crypto.randomBytes(16).toString('hex');
  }

  return session.csrfSessionId;
}

const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.SESSION_SECRET || 'fallback-secret',
  getSessionIdentifier: (req: Request) => ensureCsrfSessionId(req),
  cookieName:
    process.env.NODE_ENV === 'production'
      ? '__Host-psifi.x-csrf-token'
      : 'psifi.x-csrf-token',
  cookieOptions: {
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
  },
  size: 32,
  getCsrfTokenFromRequest: (req: Request) =>
    (req.headers['csrf-token'] as string) ||
    (req.headers['x-csrf-token'] as string) ||
    ((req.body as Record<string, unknown>)?._csrf as string),
});

export const csrfProtection = doubleCsrfProtection;

export const handleCsrfError = (err: unknown, req: Request, res: Response, next: NextFunction) => {
  const csrfError = err as { code?: string };
  if (csrfError.code !== 'EBADCSRFTOKEN') {
    return next(err);
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
