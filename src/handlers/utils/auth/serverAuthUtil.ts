import { PrismaClient } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import { WebSocket } from 'ws';
import bcrypt from 'bcrypt';

import logger from '../../logger';

/**
 * Middleware to check if the user is authenticated and either admin or owner of the server.
 * Redirects to `/redirected` if the user does not have the required permissions.
 *
 * @param {string} serverIdParam - Name of the parameter containing the server ID (default: 'id').
 * @returns {Function} Express middleware function.
 */
export const isAuthenticatedForServer =
  (serverIdParam: string = 'id') =>
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const prisma = new PrismaClient();

      const userId = req.session?.user?.id;

      if (!userId) {
        res.redirect('/login');
        return;
      }

      try {
        const user = await prisma.users.findUnique({
          where: { id: userId },
        });

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
          where: { UUID: serverId },
          include: { owner: true },
        });

        if (server?.ownerId === userId) {
          next();
          return;
        }

        res.redirect('/');
      } catch (error) {
        logger.error('Error in isAuthenticatedForServer middleware:', error);
        res.redirect('/');
      } finally {
        await prisma.$disconnect();
      }
    };

export const isAuthenticatedForServerWS =
  (serverIdParam: string = 'id', passwordParam: string = 'password') =>
    async (ws: WebSocket, req: any, next: NextFunction): Promise<void> => {
      const prisma = new PrismaClient();
      const userId = req.session?.user?.id || +req.query.userId;
      const password = req.params[passwordParam];

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
          where: { UUID: serverId },
          include: { owner: true },
        });

        if (server?.ownerId === req.session?.user?.id) {
          next();
          return;
        }

        if (password && server?.owner?.password) {
          const isPasswordValid = await bcrypt.compare(
            password,
            server.owner.password,
          );
          if (isPasswordValid) {
            next();
            return;
          }
        }

        ws.close();
      } catch (error) {
        logger.error('Error in isAuthenticatedForServerWS:', error);
        ws.close();
      } finally {
        await prisma.$disconnect();
      }
    };
