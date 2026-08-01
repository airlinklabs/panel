import { Request, Response, NextFunction } from 'express';
import { WebSocket } from 'ws';

import logger from '../../logger';
import prisma from '../../../db';
import { getParamAsString } from '../../../utils/typeHelpers';
import { renderErrorPage } from '../../errorPages';

export const SUBUSER_PERMISSIONS = [
  'console', // view console and send commands
  'files', // view and edit files
  'files.sftp', // generate SFTP credentials
  'startup', // view/edit startup variables
  'backups', // view and create backups
  'settings', // view server settings (read-only)
] as const;

export type SubUserPermission = (typeof SUBUSER_PERMISSIONS)[number];

export function parseSubUserPermissions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

export function subUserHasPermission(subUser: { permissions: string | null | undefined }, permission: string): boolean {
  const perms = parseSubUserPermissions(subUser.permissions);
  if (perms.includes(permission)) return true;
  if (permission === 'files.sftp' && perms.includes('files')) return true;
  return perms.some((perm) => perm.endsWith('.*') && permission.startsWith(perm.slice(0, -1)));
}

async function findSubUser(serverId: string, userId: number) {
  return prisma.subUser.findUnique({
    where: { serverId_userId: { serverId, userId } },
  });
}

export const isAuthenticatedForServer =
  (serverIdParam: string = 'id') =>
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const userId = req.session?.user?.id;

      if (!userId) {
        res.redirect('/login');
        return;
      }

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });

        if (!user) {
          res.redirect('/login');
          return;
        }

        if (user.isAdmin) {
          next();
          return;
        }

        const serverId = req.params[serverIdParam];
        const server = await prisma.server.findUnique({
          where: { UUID: getParamAsString(serverId) },
          select: { ownerId: true },
        });

        if (server?.ownerId === userId) {
          next();
          return;
        }

        // Subuser access: attach the SubUser row for downstream permission checks.
        const subUser = await findSubUser(getParamAsString(serverId), userId);
        if (subUser) {
          (req as any).subUser = subUser;
          next();
          return;
        }

        res.redirect('/');
      } catch (error) {
        logger.error('Error in isAuthenticatedForServer middleware:', error);
        res.redirect('/');
      }
    };

export const isAuthenticatedForServerWS =
  (serverIdParam: string = 'id') =>
    async (ws: WebSocket, req: any, next: NextFunction): Promise<void> => {
      const userId = req.session?.user?.id;

      if (!userId) {
        ws.close();
        return;
      }

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          ws.close();
          return;
        }

        if (user.isAdmin) {
          next();
          return;
        }

        const serverId = req.params[serverIdParam];
        const server = await prisma.server.findUnique({
          where: { UUID: getParamAsString(serverId) },
          select: { ownerId: true },
        });

        if (server?.ownerId === userId) {
          next();
          return;
        }

        const subUser = await findSubUser(getParamAsString(serverId), userId);
        if (subUser) {
          (req as any).subUser = subUser;
          next();
          return;
        }

        ws.close();
      } catch (error) {
        logger.error('Error in isAuthenticatedForServerWS:', error);
        ws.close();
      }
    };

/**
 * Requires a specific subuser permission. Passes through for owners and admins
 * (who have no `req.subUser` attached). Use after `isAuthenticatedForServer`.
 */
export const requireSubUserPermission =
  (permission: SubUserPermission) =>
    (req: Request, res: Response, next: NextFunction): void => {
      const subUser = (req as any).subUser as { permissions: string | null | undefined } | undefined;

      if (!subUser) {
        next();
        return;
      }

      if (subUserHasPermission(subUser, permission)) {
        next();
        return;
      }

      renderErrorPage(req, res, 403);
    };
