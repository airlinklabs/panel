/**
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 *      AirLink - Open Source Project by AirlinkLabs
 *      Repository: https://github.com/airlinklabs/panel
 *
 *     © 2024 AirlinkLabs. Licensed under the MIT License
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 */

import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import { getAllAddons, toggleAddonStatus, reloadAddons } from '../../handlers/addonHandler';
import { registerPermission } from '../../handlers/permisions';

const prisma = new PrismaClient();

registerPermission('airlink.admin.addons.view');
registerPermission('airlink.admin.addons.toggle');
registerPermission('airlink.admin.addons.reload');

const addonsModule: Module = {
  info: {
    name: 'Admin Addons Module',
    description: 'This file is for admin functionality of the Addons.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/admin/addons',
      isAuthenticated(true, 'airlink.admin.addons.view'),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const addons = await getAllAddons();
          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          let addonTableExists = true;
          try {
            await prisma.$queryRaw`SELECT 1 FROM Addon LIMIT 1`;
          } catch (_error) {
            addonTableExists = false;
          }

          res.render('admin/addons/addons', {
            user,
            req,
            settings,
            addons,
            addonTableExists,
            errorMessage: {}
          });
        } catch (error) {
          logger.error('Error fetching addons:', error);
          return res.redirect('/admin/overview');
        }
      }
    );

    router.post(
      '/admin/addons/toggle/:slug',
      isAuthenticated(true, 'airlink.admin.addons.toggle'),
      async (req: Request, res: Response) => {
        try {
          const { slug } = req.params;
          const { enabled } = req.body;

          const enabledBool = enabled === 'true' || enabled === true;
          logger.info(`Toggling addon ${slug} to ${enabledBool ? 'enabled' : 'disabled'}`);
          const result = await toggleAddonStatus(slug, enabledBool);

          if (result.success) {
            const reloadResult = await reloadAddons(req.app);

            let message = result.message;
            if (reloadResult.migrationsApplied && result.migrationsApplied) {
              message = `${result.message}. ${reloadResult.message}`;
            } else if (reloadResult.migrationsApplied) {
              message = reloadResult.message;
            }

            res.json({
              success: true,
              message,
              migrationsApplied: (result.migrationsApplied || 0) + (reloadResult.migrationsApplied || 0)
            });
          } else {
            res.status(500).json({
              success: false,
              message: result.message || 'Failed to update addon status'
            });
          }
        } catch (error: any) {
          logger.error('Error toggling addon status:', error);
          res.status(500).json({ success: false, message: error.message });
        }
      }
    );

    router.post(
      '/admin/addons/reload',
      isAuthenticated(true, 'airlink.admin.addons.reload'),
      async (req: Request, res: Response) => {
        try {
          const result = await reloadAddons(req.app);

          res.json({
            success: result.success,
            message: result.message,
            migrationsApplied: result.migrationsApplied || 0
          });
        } catch (error: any) {
          logger.error('Error reloading addons:', error);
          res.status(500).json({ success: false, message: error.message });
        }
      }
    );

    return router;
  },
};

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit();
});

export default addonsModule;
