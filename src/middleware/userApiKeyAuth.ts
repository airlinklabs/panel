import type { Request, Response, NextFunction } from 'express';
import prisma from '../db.js';
import logger from '../services/logger.js';

function hasPermission(userPermissions: string[], required: string): boolean {
  return userPermissions.some((perm: string) => {
    if (perm === required) {return true;}
    if (perm.endsWith('.*')) {
      const base = perm.slice(0, -2);
      return required.startsWith(`${base}.`);
    }
    return false;
  });
}

export const userApiKeyAuth = (requiredPermission?: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized: Missing or malformed Authorization header' });
        return;
      }

      const rawKey = authHeader.split(' ')[1];

      const keyData = await prisma.userApiKey.findUnique({ where: { key: rawKey } });

      if (!keyData) {
        await new Promise((r) => setTimeout(r, 200));
        res.status(401).json({ error: 'Unauthorized: Invalid API key' });
        return;
      }

      if (!keyData.active) {
        res.status(401).json({ error: 'Unauthorized: API key is inactive' });
        return;
      }

      if (keyData.expiresAt && new Date() > keyData.expiresAt) {
        res.status(401).json({ error: 'Unauthorized: API key has expired' });
        return;
      }

      const user = await prisma.users.findUnique({ where: { id: keyData.userId } });
      if (!user) {
        res.status(401).json({ error: 'Unauthorized: Key owner not found' });
        return;
      }

      if (requiredPermission) {
        try {
          const permissions: string[] = JSON.parse(keyData.permissions || '[]');
          if (!hasPermission(permissions, requiredPermission)) {
            res.status(403).json({
              error: 'Forbidden: API key does not have the required permission',
              requiredPermission,
            });
            return;
          }
        } catch (error) {
          logger.error('Error parsing user API key permissions:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }

      await prisma.userApiKey.update({
        where: { id: keyData.id },
        data: { lastUsedAt: new Date() },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req as any).user = {
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: user.isAdmin,
      };

      next();
    } catch (error) {
      logger.error('Error in user API key auth middleware:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  };
};

export default userApiKeyAuth;
