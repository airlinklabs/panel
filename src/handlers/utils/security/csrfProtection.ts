import { Request, Response, NextFunction } from 'express';
import csurf from 'csurf';
import logger from '../../logger';

// Configure CSRF protection
const csrfProtection = csurf({
  cookie: false, // We're using session-based CSRF protection
});

/**
 * Middleware to handle CSRF errors
 */
export const handleCsrfError = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (err.code !== 'EBADCSRFTOKEN') {
    return next(err);
  }

  // Log the CSRF error
  logger.warn(`CSRF attack detected: IP=${req.ip}, Path=${req.path}, Method=${req.method}`);

  // Handle CSRF token errors
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    // For AJAX requests, return a JSON error
    res.status(403).json({ error: 'CSRF token validation failed' });
  } else {
    // For regular form submissions, redirect to an error page or back to the form
    res.status(403).render('error', {
      message: 'Invalid form submission. Please try again.',
      error: { status: 403, stack: '' },
      req,
    });
  }
};

/**
 * Middleware to add CSRF token to response locals
 */
export const addCsrfTokenToLocals = (req: Request, res: Response, next: NextFunction) => {
  // Only add CSRF token to locals if the CSRF middleware has been applied
  try {
    // Check if csrfToken function exists and call it
    if (req.csrfToken) {
      res.locals.csrfToken = req.csrfToken();
    }
  } catch (error) {
    // If there's an error, just continue without setting the token
    // This can happen if the route doesn't have CSRF protection
  }
  next();
};

export default csrfProtection;
