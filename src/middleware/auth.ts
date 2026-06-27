import type { Request, Response, NextFunction } from 'express';
import prisma from '../db.js';
import { renderErrorPage } from './errorHandler.js';

export const isAuthenticated =
  (isAdminRequired = false, requiredPermission: string | null = null) =>
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = req.session.user?.id;

      if (!userId) {
        res.redirect('/login'); return;
      }

      const user = await prisma.users.findUnique({ where: { id: userId } });

      if (!user) {
        res.redirect('/login'); return;
      }

      if (isAdminRequired) {
        if (!user.isAdmin) {
          return renderErrorPage(req, res, 403);
        }

        next(); return;
      }

      if (requiredPermission) {
        let userPermissions: string[];
        try {
          userPermissions = JSON.parse(user.permissions || '[]');
        } catch {
          return renderErrorPage(req, res, 403);
        }

        const hasPermission = userPermissions.some((perm: string) => {
          if (perm === requiredPermission) {return true;}
          if (perm.endsWith('.*')) {
            const base = perm.slice(0, -2);
            return requiredPermission.startsWith(`${base}.`);
          }
          return false;
        });

        if (hasPermission) {
          next(); return;
        }

        return renderErrorPage(req, res, 403);
      }
      next();
    };
