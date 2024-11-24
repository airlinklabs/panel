import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to check if the user is authenticated.
 * If `isAdminRequired` is true, it checks if the user has admin privileges.
 * If not authenticated, redirects to the /login page.
 * If authenticated but not an admin (when required), redirects to the / page.
 */
export const isAuthenticated =
  (isAdminRequired = false) =>
    (req: Request, res: Response, next: NextFunction) => {
      if (!req.session.user?.id) {
        return res.redirect('/login');
      }

      if (isAdminRequired && !req.session.user?.isAdmin) {
        return res.redirect('/');
      }

      next();
    };
