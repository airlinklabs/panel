import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to check if the user is authenticated.
 * If not, redirects to the /login page.
 */
export const isAuthenticated = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.session?.id) {
    // If there's no session ID, redirect to /login
    return res.redirect('/login');
  }
  next();
};
