import type { Request, Response } from 'express';
import { Router } from 'express';
import type { Module } from '../../core/moduleInit.js';
import prisma from '../../db.js';
import { isAuthenticated } from '../../middleware/auth.js';
import logger from '../../services/logger.js';
import { checkForUpdates, runUpdate } from '../../services/updater.js';
import { registerPermission } from '../../core/permissions.js';


registerPermission('airlink.admin.overview.main');
registerPermission('airlink.admin.overview.checkForUpdates');
registerPermission('airlink.admin.overview.performUpdate');

interface ErrorMessage {
  message?: string;
}

const adminModule: Module = {
  info: {
    name: 'Admin Module',
    version: '2.0.0',
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
            res.redirect('/login'); return;
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
          res.redirect('/login'); return;
        }
      },
    );



    router.get(
      '/admin/check-update',
      isAuthenticated(true, 'airlink.admin.overview.checkForUpdates'),
      async (req: Request, res: Response) => {
        try {
          const branch = (req.query.branch as string) === 'dev' ? 'dev' : 'stable';
          const updateInfo = await checkForUpdates(branch);
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
      async (req: Request, res: Response) => {
        try {
          const branch = (req.query.branch as string) === 'dev' ? 'dev' : 'stable';
          const success = await runUpdate(branch);
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


export default adminModule;
