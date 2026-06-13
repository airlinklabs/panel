import { Request, Response, NextFunction } from 'express';
import prisma from '../../../db';
import { renderErrorPage } from '../../errorPages';

export const isAuthenticated =
  (isAdminRequired = false, requiredPermission: string | null = null) =>
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = req.session.user?.id;

      if (!userId) {
        return res.redirect('/login');
      }

      const user = await prisma.users.findUnique({ where: { id: userId } });

      if (!user) {
        return res.redirect('/login');
      }

      if (isAdminRequired) {
        if (!user.isAdmin) {
          return renderErrorPage(req, res, 403);
        }

        return next();
      }

      if (requiredPermission) {
        let userPermissions: string[] = [];
        try {
          userPermissions = JSON.parse(user.permissions || '[]');
        } catch {
          return renderErrorPage(req, res, 403);
        }

        const hasPermission = userPermissions.some((perm: string) => {
          if (perm === requiredPermission) return true;
          if (perm.endsWith('.*')) {
            const base = perm.slice(0, -2);
            return requiredPermission.startsWith(`${base}.`);
          }
          return false;
        });

        if (hasPermission) {
          return next();
        }

        return renderErrorPage(req, res, 403);
      }
      next();
    };
