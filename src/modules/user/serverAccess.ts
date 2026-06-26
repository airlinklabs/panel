import type { Request, Response } from 'express';
import { Router } from 'express';
import type { Module } from '../../core/moduleInit';
import prisma from '../../db';
import { isAuthenticatedForServer } from '../../middleware/serverAuth';
import logger from '../../services/logger';
import { getParamAsString } from '../../utils/typeHelpers';

interface ErrorMessage {
  message?: string;
}

const VALID_PERMISSIONS = ['console', 'files', 'backups', 'startup', 'settings'] as const;

function isValidPermissionsArray(permits: unknown): permits is string[] {
  if (!Array.isArray(permits)) {return false;}
  return permits.every(p => typeof p === 'string' && (VALID_PERMISSIONS as readonly string[]).includes(p));
}

const serverAccessModule: Module = {
  info: {
    name: 'Server Access Module',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/server/:id/access',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const errorMessage: ErrorMessage = {};
        const userId = req.session?.user?.id;
        const serverId = getParamAsString(req.params?.id);

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            errorMessage.message = 'User not found.';
            res.render('user/account', { errorMessage, user, req }); return;
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true, image: true, owner: true },
          });

          if (!server) {
            errorMessage.message = 'Server not found.';
            res.render('user/server/access', {
              errorMessage,
              user,
              server: null,
              accessGrants: [],
              req,
            }); return;
          }

          const accessGrants = await prisma.serverAccess.findMany({
            where: { serverId },
            include: { grantee: true },
            orderBy: { createdAt: 'desc' },
          });

          const settings = await prisma.settings.findUnique({ where: { id: 1 } });

          res.render('user/server/access', {
            errorMessage,
            user,
            server,
            accessGrants,
            req,
            settings,
          });
        } catch (error) {
          logger.error('Error loading server access:', error);
          errorMessage.message = 'Error loading access grants.';
          res.render('user/server/access', {
            errorMessage,
            user: req.session?.user,
            server: null,
            accessGrants: [],
            req,
          });
        }
      },
    );

    router.post(
      '/server/:id/access',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const serverId = getParamAsString(req.params?.id);
        const { grantee, permissions } = req.body;

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.status(404).json({ error: 'User not found.' });
          }

          if (!grantee || typeof grantee !== 'string') {
            return res.status(400).json({ error: 'Grantee username or email is required.' });
          }

          if (!isValidPermissionsArray(permissions)) {
            return res.status(400).json({
              error: `Invalid permissions. Must be an array from: ${VALID_PERMISSIONS.join(', ')}`,
            });
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
          });

          if (!server) {
            return res.status(404).json({ error: 'Server not found.' });
          }

          if (server.ownerId !== userId) {
            return res.status(403).json({ error: 'Only the server owner can grant access.' });
          }

          const granteeUser = await prisma.users.findFirst({
            where: {
              OR: [
                { username: grantee.trim() },
                { email: grantee.trim().toLowerCase() },
              ],
            },
          });

          if (!granteeUser) {
            return res.status(404).json({ error: 'User not found.' });
          }

          if (granteeUser.id === userId) {
            return res.status(400).json({ error: 'You cannot grant access to yourself.' });
          }

          const existingGrant = await prisma.serverAccess.findUnique({
            where: {
              serverId_granteeId: {
                serverId,
                granteeId: granteeUser.id,
              },
            },
          });

          if (existingGrant) {
            return res.status(409).json({ error: 'User already has access to this server.' });
          }

          const accessGrant = await prisma.serverAccess.create({
            data: {
              serverId,
              grantorId: userId,
              granteeId: granteeUser.id,
              permissions: JSON.stringify(permissions),
            },
          });

          res.status(201).json({ success: true, accessGrant });
        } catch (error) {
          logger.error('Error granting server access:', error);
          res.status(500).json({ error: 'Failed to grant access.' });
        }
      },
    );

    router.delete(
      '/server/:id/access/:accessId',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const accessId = parseInt(getParamAsString(req.params.accessId), 10);

        try {
          if (isNaN(accessId)) {
            return res.status(400).json({ error: 'Invalid access ID.' });
          }

          const accessGrant = await prisma.serverAccess.findUnique({
            where: { id: accessId },
          });

          if (!accessGrant) {
            return res.status(404).json({ error: 'Access grant not found.' });
          }

          await prisma.serverAccess.delete({ where: { id: accessId } });
          res.json({ success: true });
        } catch (error) {
          logger.error('Error revoking server access:', error);
          res.status(500).json({ error: 'Failed to revoke access.' });
        }
      },
    );

    router.post(
      '/server/:id/access/:accessId',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const accessId = parseInt(getParamAsString(req.params.accessId), 10);
        const { permissions } = req.body;

        try {
          if (isNaN(accessId)) {
            return res.status(400).json({ error: 'Invalid access ID.' });
          }

          if (!isValidPermissionsArray(permissions)) {
            return res.status(400).json({
              error: `Invalid permissions. Must be an array from: ${VALID_PERMISSIONS.join(', ')}`,
            });
          }

          const accessGrant = await prisma.serverAccess.findUnique({
            where: { id: accessId },
          });

          if (!accessGrant) {
            return res.status(404).json({ error: 'Access grant not found.' });
          }

          const updated = await prisma.serverAccess.update({
            where: { id: accessId },
            data: { permissions: JSON.stringify(permissions) },
          });

          res.json({ success: true, accessGrant: updated });
        } catch (error) {
          logger.error('Error updating server access:', error);
          res.status(500).json({ error: 'Failed to update access.' });
        }
      },
    );

    return router;
  },
};

export default serverAccessModule;
