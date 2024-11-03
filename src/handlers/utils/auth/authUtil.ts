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
  if (!req.session?.user?.id) {
    return res.redirect('/login');
  }
  next();
};
