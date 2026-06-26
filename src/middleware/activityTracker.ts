import type { Request, Response, NextFunction } from 'express';
import { logActivity } from '../services/activityLog';

export function trackActivity(action: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.on('finish', () => {
      const userId = req.session?.user?.id;
      if (!userId) {return;}

      const serverId = req.params?.id as string | undefined;
      const ip = (req.headers['x-forwarded-for'] as string) ?? req.socket?.remoteAddress ?? undefined;

      logActivity({
        userId,
        serverId,
        action,
        ip,
      }).catch(() => {});
    });

    next();
  };
}
