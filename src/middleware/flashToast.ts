import { Request, Response, NextFunction } from 'express';

/**
 * Simple flash toast middleware.
 * Set a toast before redirect: req.flashToast('Server deleted', 'success')
 * Then call: res.redirect('/somewhere')
 * The next page render reads it from res.locals.flashToast.
 */
export function flashToastMiddleware(req: Request, res: Response, next: NextFunction) {
  const session = req.session as Record<string, any> | undefined;

  // Set flash toast on session
  (req as any).flashToast = (message: string, type: string = 'success') => {
    if (session) {
      session.flashToast = { message, type };
    }
  };

  // Read and clear flash toast from session, expose to templates
  if (session?.flashToast) {
    res.locals.flashToast = session.flashToast;
    delete session.flashToast;
  }

  next();
}
