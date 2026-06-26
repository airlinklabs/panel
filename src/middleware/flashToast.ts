import type { Request, Response, NextFunction } from 'express';

interface FlashSession {
  flashToast?: { message: string; type: string };
}

export function flashToastMiddleware(req: Request, res: Response, next: NextFunction) {
  const session = req.session as FlashSession | undefined;

  (req as Request & { flashToast: (message: string, type?: string) => void }).flashToast = (message: string, type = 'success') => {
    if (session) {
      session.flashToast = { message, type };
    }
  };

  if (session?.flashToast) {
    res.locals.flashToast = session.flashToast;
    delete session.flashToast;
  }

  next();
}
