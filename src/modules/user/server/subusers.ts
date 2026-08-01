import { Router, Request, Response } from 'express';
import { isAuthenticatedForServer, SUBUSER_PERMISSIONS } from '../../../handlers/utils/auth/serverAuthUtil';
import logger from '../../../handlers/logger';
import { getParamAsString } from '../../../utils/typeHelpers';
import prisma from '../../../db';
import { checkForServerInstallation } from '../../../handlers/checkForServerInstallation';
import { serverPageInclude } from './shared';

const PERMISSION_LABELS: Record<string, string> = {
  console: 'Console',
  files: 'Files',
  'files.sftp': 'SFTP Access',
  startup: 'Startup',
  backups: 'Backups',
  settings: 'Settings',
};

function isValidPermissionSet(permissions: unknown): permissions is string[] {
  if (!Array.isArray(permissions)) return false;
  return permissions.every((p) => SUBUSER_PERMISSIONS.includes(p as never));
}

async function loadOwnedServer(serverId: string, userId: number) {
  return prisma.server.findUnique({
    where: { UUID: getParamAsString(serverId) },
    include: serverPageInclude,
  }).then((server) => {
    return server && (server.ownerId === userId) ? server : null;
  });
}

export function registerSubUserRoutes(router: Router): void {
  router.get(
    '/server/:id/subusers',
    isAuthenticatedForServer('id'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await loadOwnedServer(String(serverId), user.id);
        if (!server) {
          res.status(403).json({ error: 'Only the server owner can manage subusers.' });
          return;
        }

        const [subUsers, settings] = await Promise.all([
          prisma.subUser.findMany({
            where: { serverId: server.UUID },
            include: { user: { select: { id: true, username: true, email: true, avatar: true } } },
            orderBy: { createdAt: 'asc' },
          }),
          prisma.settings.findUnique({ where: { id: 1 } }),
        ]);

        const subUsersWithPerms = subUsers.map((subUser) => ({
          ...subUser,
          permissions: (() => {
            try {
              const parsed = JSON.parse(subUser.permissions);
              return Array.isArray(parsed) ? parsed : [];
            } catch {
              return [];
            }
          })(),
        }));

        res.render('user/server/subusers', {
          user,
          req,
          server,
          subUsers: subUsersWithPerms,
          permissionLabels: PERMISSION_LABELS,
          permissionOptions: SUBUSER_PERMISSIONS,
          settings,
          features: JSON.parse(server.image.info || '{}').features || [],
          installed: await checkForServerInstallation(getParamAsString(serverId)),
        });
      } catch (error) {
        logger.error('Error fetching subusers:', error);
        res.status(500).json({ error: 'Failed to fetch subusers' });
      }
    },
  );

  router.post(
    '/server/:id/subusers',
    isAuthenticatedForServer('id'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const { email, permissions } = req.body as { email?: string; permissions?: unknown };

      if (!email || typeof email !== 'string' || email.trim() === '') {
        res.status(400).json({ error: 'Email is required' });
        return;
      }

      if (!isValidPermissionSet(permissions)) {
        res.status(400).json({ error: 'Invalid permissions' });
        return;
      }

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await loadOwnedServer(String(serverId), user.id);
        if (!server) {
          res.status(403).json({ error: 'Only the server owner can manage subusers.' });
          return;
        }

        const target = await prisma.users.findUnique({
          where: { email: email.trim().toLowerCase() },
        });

        if (!target) {
          res.status(404).json({ error: 'No user found with that email.' });
          return;
        }

        if (target.id === user.id) {
          res.status(400).json({ error: 'You cannot add yourself as a subuser.' });
          return;
        }

        if (server.ownerId === target.id) {
          res.status(400).json({ error: 'The server owner is already in full control.' });
          return;
        }

        const existing = await prisma.subUser.findUnique({
          where: { serverId_userId: { serverId: server.UUID, userId: target.id } },
        });
        if (existing) {
          res.status(409).json({ error: 'That user is already a subuser of this server.' });
          return;
        }

        await prisma.subUser.create({
          data: {
            serverId: server.UUID,
            userId: target.id,
            permissions: JSON.stringify(permissions),
          },
        });

        res.json({ success: true, message: `${target.username || target.email} added as a subuser.` });
        return;
      } catch (error) {
        logger.error('Error adding subuser:', error);
        res.status(500).json({ error: 'Failed to add subuser' });
        return;
      }
    },
  );

  router.delete(
    '/server/:id/subusers/:subUserId',
    isAuthenticatedForServer('id'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const subUserId = req.params?.subUserId;

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await loadOwnedServer(String(serverId), user.id);
        if (!server) {
          res.status(403).json({ error: 'Only the server owner can manage subusers.' });
          return;
        }

        const subUser = await prisma.subUser.findFirst({
          where: { id: parseInt(getParamAsString(subUserId), 10), serverId: server.UUID },
        });

        if (!subUser) {
          res.status(404).json({ error: 'Subuser not found' });
          return;
        }

        await prisma.subUser.delete({ where: { id: subUser.id } });

        res.json({ success: true, message: 'Subuser removed.' });
        return;
      } catch (error) {
        logger.error('Error removing subuser:', error);
        res.status(500).json({ error: 'Failed to remove subuser' });
        return;
      }
    },
  );

  router.put(
    '/server/:id/subusers/:subUserId',
    isAuthenticatedForServer('id'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const subUserId = req.params?.subUserId;
      const { permissions } = req.body as { permissions?: unknown };

      if (!isValidPermissionSet(permissions)) {
        res.status(400).json({ error: 'Invalid permissions' });
        return;
      }

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await loadOwnedServer(String(serverId), user.id);
        if (!server) {
          res.status(403).json({ error: 'Only the server owner can manage subusers.' });
          return;
        }

        const subUser = await prisma.subUser.findFirst({
          where: { id: parseInt(getParamAsString(subUserId), 10), serverId: server.UUID },
        });

        if (!subUser) {
          res.status(404).json({ error: 'Subuser not found' });
          return;
        }

        await prisma.subUser.update({
          where: { id: subUser.id },
          data: { permissions: JSON.stringify(permissions) },
        });

        res.json({ success: true, message: 'Subuser permissions updated.' });
        return;
      } catch (error) {
        logger.error('Error updating subuser permissions:', error);
        res.status(500).json({ error: 'Failed to update subuser permissions' });
        return;
      }
    },
  );
}
