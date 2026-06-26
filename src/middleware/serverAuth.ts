import { Request, Response, NextFunction } from 'express';
import { WebSocket } from 'ws';

import logger from '../services/logger';
import prisma from '../db';
import { getParamAsString } from '../utils/typeHelpers';

export const isAuthenticatedForServer =
  (serverIdParam = 'id') =>
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

        res.redirect('/');
      } catch (error) {
        logger.error('Error in isAuthenticatedForServer middleware:', error);
        res.redirect('/');
      }
    };

export const isAuthenticatedForServerWS =
  (serverIdParam = 'id') =>
    async (ws: WebSocket, req: Request, next: NextFunction): Promise<void> => {
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

        ws.close();
      } catch (error) {
        logger.error('Error in isAuthenticatedForServerWS:', error);
        ws.close();
      }
    };

export interface ServerAccessResult {
  hasAccess: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  permissions: string[];
}

export async function hasServerAccess(
  userId: number,
  serverUUID: string,
): Promise<ServerAccessResult> {
  const defaultResult: ServerAccessResult = {
    hasAccess: false,
    isOwner: false,
    isAdmin: false,
    permissions: [],
  };

  try {
    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) return defaultResult;

    if (user.isAdmin) {
      return {
        hasAccess: true,
        isOwner: false,
        isAdmin: true,
        permissions: ['console', 'files', 'backups', 'startup', 'settings'],
      };
    }

    const server = await prisma.server.findUnique({
      where: { UUID: serverUUID },
      select: { ownerId: true },
    });

    if (!server) return defaultResult;

    if (server.ownerId === userId) {
      return {
        hasAccess: true,
        isOwner: true,
        isAdmin: false,
        permissions: ['console', 'files', 'backups', 'startup', 'settings'],
      };
    }

    const accessGrant = await prisma.serverAccess.findUnique({
      where: {
        serverId_granteeId: {
          serverId: serverUUID,
          granteeId: userId,
        },
      },
    });

    if (!accessGrant) return defaultResult;

    let permissions: string[];
    try {
      permissions = JSON.parse(accessGrant.permissions);
    } catch {
      permissions = [];
    }

    return {
      hasAccess: true,
      isOwner: false,
      isAdmin: false,
      permissions,
    };
  } catch (error) {
    logger.error('Error checking server access:', error);
    return defaultResult;
  }
}
