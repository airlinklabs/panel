import { Request, Response, NextFunction } from 'express';
import prisma from '../../../db';

export const isAuthenticated =
  (isAdminRequired = false, requiredPermission: string | null = null) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.session.user?.id;
    if (!userId) return res.redirect('/login');

    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) return res.redirect('/login');

    if (requiredPermission) {
      let perms: string[] = [];
      try {
        perms = JSON.parse(user.permissions || '[]');
      } catch {
        return res.redirect('/');
      }

      const ok = perms.some((p) => {
        if (p === requiredPermission) return true;
        if (p.endsWith('.*')) return requiredPermission.startsWith(p.slice(0, -2) + '.');
        return false;
      });

      if (!ok) return res.redirect('/');
      return next();
    }

    if (isAdminRequired && !user.isAdmin) return res.redirect('/');
    next();
  };
