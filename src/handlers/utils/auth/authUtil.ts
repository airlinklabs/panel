import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Middleware to check if the user is authenticated.
 * If `isAdminRequired` is true, it checks if the user has admin privileges.
 * If not authenticated, redirects to the /login page.
 * If authenticated but not an admin (when required), redirects to the / page.
 */

export const isAuthenticated =
  (isAdminRequired = false, requiredPermission: string | null = null) =>
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = req.session.user?.id;

      if (!userId) {
        return res.redirect('/login');
      }

      const user = await prisma.users.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.redirect('/login');
      }

      if (requiredPermission) {
        let userPermissions: string[] = [];

        try {
          userPermissions = JSON.parse(user.permissions || '[]');
        } catch (e) {
          return res.redirect('/');
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
      }

      if (isAdminRequired && !user.isAdmin) {
        return res.redirect('/');
      }
      next();
    };