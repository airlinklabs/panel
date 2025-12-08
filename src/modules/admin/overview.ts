import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import { checkForUpdates, performUpdate } from '../../handlers/updater';
import { registerPermission } from '../../handlers/permisions';

const prisma = new PrismaClient();

registerPermission('airlink.admin.overview.main');
registerPermission('airlink.admin.overview.checkForUpdates');
registerPermission('airlink.admin.overview.performUpdate');

interface ErrorMessage {
  message?: string;
}

const adminModule: Module = {
  info: {
    name: 'Admin Module',
    description: 'This file is for admin functionality.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/admin/overview',
      isAuthenticated(true, 'airlink.admin.overview.main'),
      async (req: Request, res: Response) => {
        const errorMessage: ErrorMessage = {};

        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const userCount = await prisma.users.count();
          const nodeCount = await prisma.node.count();
          const instanceCount = await prisma.server.count();
          const imageCount = await prisma.images.count();
          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          res.render('admin/overview/overview', {
            errorMessage,
            user,
            userCount,
            instanceCount,
            nodeCount,
            imageCount,
            req,
            settings,
            airlinkVersion: res.locals.airlinkVersion,
          });
        } catch (error) {
          logger.error('Error fetching user:', error);
          return res.redirect('/login');
        }
      },
    );



    router.get(
      '/admin/check-update',
      isAuthenticated(true, 'airlink.admin.overview.checkForUpdates'),
      async (_req: Request, res: Response) => {
        try {
          const updateInfo = await checkForUpdates();
          res.json(updateInfo);
        } catch (error) {
          logger.error('Error checking for updates:', error);
          res.status(500).json({ error: 'Error checking for updates' });
        }
      },
    );

    router.post(
      '/admin/perform-update',
      isAuthenticated(true, 'airlink.admin.overview.performUpdate'),
      async (_req: Request, res: Response) => {
        try {
          const success = await performUpdate();
          if (success) {
            res.json({ message: 'Update completed successfully' });
          } else {
            res.status(500).json({ error: 'Error performing update' });
          }
        } catch (error) {
          logger.error('Error performing update:', error);
          res.status(500).json({ error: 'Error performing update' });
        }
      },
    );

    return router;
  },
};

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit();
});

export default adminModule;
