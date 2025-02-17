import { RequestHandler, Request, Response, NextFunction } from 'express';

export const isAuthenticated = (requireAdmin: boolean = false): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.user) {
      res.redirect('/login');
      return;
    }

    if (requireAdmin && !req.session.user.isAdmin) {
      res.status(403).json({ error: 'Unauthorized access' });
      return;
    }

    next();
  };
};


