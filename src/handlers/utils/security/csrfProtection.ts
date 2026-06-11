import { Request, Response, NextFunction } from 'express';
import { doubleCsrf } from 'csrf-csrf';
import logger from '../../logger';

const { generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.SESSION_SECRET || 'fallback-secret',
  cookieName: '__Host-psifi.x-csrf-token',
  cookieOptions: {
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
  },
  size: 64,
  getTokenFromRequest: (req) =>
    (req.headers['csrf-token'] as string) ||
    (req.headers['x-csrf-token'] as string) ||
    ((req.body as any)?._csrf as string),
});

const csrfProtection = doubleCsrfProtection;

export const handleCsrfError = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (err.code !== 'EBADCSRFTOKEN') {
    return next(err);
  }

  logger.warn(`CSRF attack detected: IP=${req.ip}, Path=${req.path}, Method=${req.method}`);

  if (req.xhr || req.headers.accept?.includes('application/json')) {
    res.status(403).json({ error: 'CSRF token validation failed' });
  } else {
    res.status(403).json({
      error: 'Invalid form submission. Please try again.',
      message: 'CSRF token validation failed',
      status: 403,
    });
  }
};

export const addCsrfTokenToLocals = (req: Request, res: Response, next: NextFunction) => {
  try {
    res.locals.csrfToken = generateToken(req, res);
  } catch (error: unknown) {
    logger.warn('Failed to generate CSRF token', { error });
  }
  next();
};

export default csrfProtection;
