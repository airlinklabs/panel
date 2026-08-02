import { Request, Response, NextFunction } from 'express';
import { WebSocket } from 'ws';

import logger from '../../logger';
import prisma from '../../../db';
import { getParamAsString } from '../../../utils/typeHelpers';
import { renderErrorPage } from '../../errorPages';

export const SUBUSER_PERMISSIONS = [
  'console',
  'console.send',
  'files',
  'files.read',
  'files.write',
  'files.delete',
  'files.sftp',
  'files.pull',
  'files.archive',
  'startup',
  'startup.read',
  'startup.update',
  'startup.docker-image',
  'backups',
  'backups.read',
  'backups.create',
  'backups.delete',
  'backups.download',
  'settings',
  'settings.update',
] as const;

export type SubUserPermission = (typeof SUBUSER_PERMISSIONS)[number];

// Logical groups for the subuser permission UI.
export const PERMISSION_GROUPS: { title: string; perms: SubUserPermission[] }[] = [
  { title: 'Console control', perms: ['console', 'console.send'] },
  { title: 'Files', perms: ['files', 'files.read', 'files.write', 'files.delete', 'files.sftp', 'files.pull', 'files.archive'] },
  { title: 'Startup', perms: ['startup', 'startup.read', 'startup.update', 'startup.docker-image'] },
  { title: 'Backups', perms: ['backups', 'backups.read', 'backups.create', 'backups.delete', 'backups.download'] },
  { title: 'Settings', perms: ['settings', 'settings.update'] },
];

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
  const parent = permission.includes('.') ? permission.slice(0, permission.lastIndexOf('.')) : null;

  for (const p of perms) {
    if (p === permission) return true;
    if (p.endsWith('.*') && (permission === p.slice(0, -2) || permission.startsWith(p.slice(0, -1)))) return true;
    if (parent && p === parent) return true;
  }
  return false;
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
