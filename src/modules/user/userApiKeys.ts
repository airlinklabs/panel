import type { Request, Response } from 'express';
import { Router } from 'express';
import type { Module } from '../../core/moduleInit.js';
import prisma from '../../db.js';
import { isAuthenticated } from '../../middleware/auth.js';
import logger from '../../services/logger.js';
import { randomBytes } from 'crypto';
import { getParamAsNumber } from '../../utils/typeHelpers.js';

const ALLOWED_PERMISSIONS = [
  'server.view',
  'server.start',
  'server.stop',
  'server.restart',
  'server.files',
];

const coreModule: Module = {
  info: {
    name: 'User API Keys Module',
    description: 'This module handles user API key management.',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/account/api-keys',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const settings = await prisma.settings.findUnique({ where: { id: 1 } });

          const apiKeys = await prisma.userApiKey.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
          });

          const displayKeys = apiKeys.map((key) => ({
            ...key,
            displayKey: key.prefix + key.key.slice(8, 20),
          }));

          res.render('user/account-api-keys', {
            apiKeys: displayKeys,
            allowedPermissions: ALLOWED_PERMISSIONS,
            settings,
            user: req.session.user,
            req,
          });
        } catch (error) {
          logger.error('Error fetching user API keys:', error);
          res.status(500).render('error', {
            error: 'Failed to load API keys',
            req,
          });
        }
      },
    );

    router.post(
      '/account/api-keys/create',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const { name, description: _description, permissions } = req.body;

          if (!name) {
            res.status(400).json({ error: 'API key name is required' });
            return;
          }

          const rawBytes = randomBytes(32);
          const rawKey = 'alp_' + rawBytes.toString('hex');
          const prefix = rawKey.slice(0, 8);

          let permissionsArray: string[] = [];
          if (permissions) {
            const raw = Array.isArray(permissions) ? permissions : [permissions];
            permissionsArray = raw.filter((p: string) =>
              ALLOWED_PERMISSIONS.includes(p),
            );
          }

          const expiresInDays = 90;
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + expiresInDays);

          await prisma.userApiKey.create({
            data: {
              name,
              key: rawKey,
              prefix,
              permissions: JSON.stringify(permissionsArray),
              userId: userId!,
              expiresAt,
              updatedAt: new Date(),
            },
          });

          res.redirect('/account/api-keys');
        } catch (error) {
          logger.error('Error creating user API key:', error);
          res.status(500).json({ error: 'Failed to create API key' });
        }
      },
    );

    router.post(
      '/account/api-keys/:id/toggle',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const id = getParamAsNumber(req.params.id);

          const apiKey = await prisma.userApiKey.findFirst({
            where: { id, userId },
          });

          if (!apiKey) {
            res.status(404).json({ error: 'API key not found' });
            return;
          }

          await prisma.userApiKey.update({
            where: { id },
            data: {
              active: !apiKey.active,
              updatedAt: new Date(),
            },
          });

          res.redirect('/account/api-keys');
        } catch (error) {
          logger.error('Error toggling user API key status:', error);
          res.status(500).json({ error: 'Failed to toggle API key status' });
        }
      },
    );

    router.delete(
      '/account/api-keys/:id',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const id = getParamAsNumber(req.params.id);

          const apiKey = await prisma.userApiKey.findFirst({
            where: { id, userId },
          });

          if (!apiKey) {
            res.status(404).json({ error: 'API key not found' });
            return;
          }

          await prisma.userApiKey.delete({
            where: { id },
          });

          res.json({ success: true });
        } catch (error) {
          logger.error('Error deleting user API key:', error);
          res.status(500).json({ error: 'Failed to delete API key' });
        }
      },
    );

    router.post(
      '/account/api-keys/:id/edit',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const id = getParamAsNumber(req.params.id);
          const { name, description: _description } = req.body;

          if (!name) {
            res.status(400).json({ error: 'API key name is required' });
            return;
          }

          const apiKey = await prisma.userApiKey.findFirst({
            where: { id, userId },
          });

          if (!apiKey) {
            res.status(404).json({ error: 'API key not found' });
            return;
          }

          await prisma.userApiKey.update({
            where: { id },
            data: {
              name,
              updatedAt: new Date(),
            },
          });

          res.redirect('/account/api-keys');
        } catch (error) {
          logger.error('Error updating user API key:', error);
          res.status(500).json({ error: 'Failed to update API key' });
        }
      },
    );

    return router;
  },
};

export default coreModule;
