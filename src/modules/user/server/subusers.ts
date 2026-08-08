import { Router, Request, Response } from 'express';
import { isAuthenticatedForServer, PERMISSION_GROUPS, SUBUSER_PERMISSIONS } from '../../../handlers/utils/auth/serverAuthUtil';
import logger from '../../../handlers/logger';
import { getParamAsString } from '../../../utils/typeHelpers';
import prisma from '../../../db';
import { checkForServerInstallation } from '../../../handlers/checkForServerInstallation';
import { logActivity } from '../../../handlers/utils/activity/activityLogger';
import { sendSubUserInvite } from '../../../handlers/utils/core/mailer';
import { serverPageInclude } from './shared';
import { emitRealtime, serverEvent } from '../../../handlers/realtime/events';

const PERMISSION_LABELS: Record<string, string> = {
  'websocket.connect': 'Live console',
  console: 'Full console',
  'console.send': 'Send commands',
  'control.start': 'Start server',
  'control.stop': 'Stop server',
  'control.restart': 'Restart server',
  'control.console': 'Console access',
  files: 'All files',
  'files.read': 'Read files',
  'files.write': 'Edit & upload',
  'files.delete': 'Delete files',
  'files.sftp': 'SFTP access',
  'files.pull': 'Pull/import',
  'files.archive': 'Archive & unpack',
  'files.create': 'Create files',
  'files.update': 'Update files',
  startup: 'Full startup',
  'startup.read': 'View startup',
  'startup.update': 'Edit startup',
  'startup.docker-image': 'Change Docker image',
  backups: 'All backups',
  'backups.read': 'List backups',
  'backups.create': 'Create backups',
  'backups.delete': 'Delete backups',
  'backups.download': 'Download backups',
  'backups.restore': 'Restore backups',
  'backups.lock': 'Lock backups',
  'database.create': 'Create databases',
  'database.read': 'View databases',
  'database.update': 'Edit databases',
  'database.delete': 'Delete databases',
  'database.view_password': 'View passwords',
  'schedule.create': 'Create schedules',
  'schedule.read': 'View schedules',
  'schedule.update': 'Edit schedules',
  'schedule.delete': 'Delete schedules',
  'allocation.read': 'View allocations',
  'allocation.create': 'Create allocations',
  'allocation.update': 'Edit allocations',
  'allocation.delete': 'Delete allocations',
  settings: 'View settings',
  'settings.update': 'Edit settings',
  'settings.rename': 'Rename server',
  'settings.reinstall': 'Reinstall server',
  'activity.read': 'View activity',
};

function isValidPermissionSet(permissions: unknown): permissions is string[] {
  if (!Array.isArray(permissions)) {
    return false;
  }
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
          permissionGroups: PERMISSION_GROUPS,
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

        await logActivity(req, 'subuser:create', { serverId: String(server.UUID), metadata: { targetUserId: target.id } });
        emitRealtime(serverEvent('subuser.created', String(server.UUID), {
          state: { userId: target.id, username: target.username },
        }));

        if (target.email) {
          await sendSubUserInvite({
            to: target.email,
            panelName: 'Airlink',
            serverName: server.name,
            inviteUrl: `${process.env.PANEL_URL ?? ''}/server/${server.UUID}`,
          });
        }

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

        await logActivity(req, 'subuser:delete', { serverId: String(server.UUID), metadata: { subUserId: String(subUserId) } });
        emitRealtime(serverEvent('subuser.deleted', String(server.UUID), {
          state: { subUserId: subUser.id, userId: subUser.userId },
        }));
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

        await logActivity(req, 'subuser:update', { serverId: String(server.UUID), metadata: { subUserId: String(subUserId) } });
        emitRealtime(serverEvent('subuser.updated', String(server.UUID), {
          state: { subUserId: subUser.id, userId: subUser.userId },
        }));
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
