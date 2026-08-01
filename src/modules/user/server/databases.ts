import { Router, Request, Response } from 'express';
import { isAuthenticatedForServer, requireSubUserPermission } from '../../../handlers/utils/auth/serverAuthUtil';
import logger from '../../../handlers/logger';
import { getParamAsString } from '../../../utils/typeHelpers';
import prisma from '../../../db';
import { checkForServerInstallation } from '../../../handlers/checkForServerInstallation';
import { serverPageInclude } from './shared';
import {
  provisionDatabase,
  deprovisionDatabase,
  rotateDatabasePassword,
} from '../../../handlers/utils/core/mysqlProvisioner';

async function loadServerForUser(serverId: string, userId: number, req: Request) {
  const server = await prisma.server.findUnique({
    where: { UUID: getParamAsString(serverId) },
    include: serverPageInclude,
  });
  if (!server) return null;
  if (server.ownerId === userId || (req.session?.user?.isAdmin ?? false)) return server;
  const subUser = (req as any).subUser as { permissions?: string | null } | undefined;
  if (subUser) return server;
  return null;
}

export function registerDatabaseRoutes(router: Router): void {
  // ── GET /server/:id/databases ───────────────────────────────────────────
  router.get(
    '/server/:id/databases',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('settings'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await loadServerForUser(String(serverId), user.id, req);
        if (!server) {
          res.status(403).json({ error: 'Server not found or access denied.' });
          return;
        }

        const [databases, hosts] = await Promise.all([
          prisma.serverDatabase.findMany({
            where: { serverId: server.UUID },
            include: { host: true },
            orderBy: { createdAt: 'desc' },
          }),
          prisma.databaseHost.findMany({ orderBy: { id: 'asc' } }),
        ]);

        const settings = await prisma.settings.findUnique({ where: { id: 1 } });

        res.render('user/server/databases', {
          user,
          req,
          server,
          settings,
          databases,
          hosts,
          features: JSON.parse(server.image.info || '{}').features || [],
          installed: await checkForServerInstallation(getParamAsString(serverId)),
        });
      } catch (error) {
        logger.error('Error fetching databases:', error);
        res.status(500).json({ error: 'Failed to fetch databases' });
      }
    },
  );

  // ── POST /server/:id/databases ──────────────────────────────────────────
  router.post(
    '/server/:id/databases',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('settings'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const { hostId } = req.body as { hostId?: string };

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await loadServerForUser(String(serverId), user.id, req);
        if (!server) {
          res.status(403).json({ error: 'Server not found or access denied.' });
          return;
        }

        const host = await prisma.databaseHost.findUnique({
          where: { id: parseInt(String(hostId), 10) },
        });
        if (!host) {
          res.status(400).json({ error: 'Invalid database host.' });
          return;
        }

        try {
          const credentials = await provisionDatabase(host, server.UUID);
          const db = await prisma.serverDatabase.create({
            data: {
              serverId: server.UUID,
              hostId: host.id,
              ...credentials,
            },
            include: { host: true },
          });
          return res.json({ success: true, database: db });
        } catch (error) {
          logger.error('Failed to provision database:', error);
          return res.status(502).json({
            error: error instanceof Error ? error.message : 'Failed to connect to the database host.',
          });
        }
      } catch (error) {
        logger.error('Error creating database:', error);
        return res.status(500).json({ error: 'Failed to create database' });
      }
    },
  );

  // ── DELETE /server/:id/databases/:dbId ──────────────────────────────────
  router.delete(
    '/server/:id/databases/:dbId',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('settings'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const dbId = parseInt(getParamAsString(req.params?.dbId), 10);

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await loadServerForUser(String(serverId), user.id, req);
        if (!server) {
          res.status(403).json({ error: 'Server not found or access denied.' });
          return;
        }

        const db = await prisma.serverDatabase.findUnique({
          where: { id: dbId },
          include: { host: true },
        });
        if (!db || db.serverId !== server.UUID) {
          res.status(404).json({ error: 'Database not found.' });
          return;
        }

        try {
          await deprovisionDatabase(db.host, db);
          await prisma.serverDatabase.delete({ where: { id: db.id } });
          return res.json({ success: true });
        } catch (error) {
          logger.error('Failed to deprovision database:', error);
          return res.status(502).json({
            error: error instanceof Error ? error.message : 'Failed to remove the database from the host.',
          });
        }
      } catch (error) {
        logger.error('Error deleting database:', error);
        return res.status(500).json({ error: 'Failed to delete database' });
      }
    },
  );

  // ── POST /server/:id/databases/:dbId/rotate-password ────────────────────
  router.post(
    '/server/:id/databases/:dbId/rotate-password',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('settings'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const dbId = parseInt(getParamAsString(req.params?.dbId), 10);

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await loadServerForUser(String(serverId), user.id, req);
        if (!server) {
          res.status(403).json({ error: 'Server not found or access denied.' });
          return;
        }

        const db = await prisma.serverDatabase.findUnique({
          where: { id: dbId },
          include: { host: true },
        });
        if (!db || db.serverId !== server.UUID) {
          res.status(404).json({ error: 'Database not found.' });
          return;
        }

        try {
          const newPassword = await rotateDatabasePassword(db.host, db);
          await prisma.serverDatabase.update({
            where: { id: db.id },
            data: { databasePassword: newPassword },
          });
          return res.json({ success: true, password: newPassword });
        } catch (error) {
          logger.error('Failed to rotate database password:', error);
          return res.status(502).json({
            error: error instanceof Error ? error.message : 'Failed to rotate the password on the host.',
          });
        }
      } catch (error) {
        logger.error('Error rotating database password:', error);
        return res.status(500).json({ error: 'Failed to rotate database password' });
      }
    },
  );
}
