import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import { checkForUpdates, performUpdate } from '../../handlers/updater';
import { registerPermission } from '../../handlers/permissions';
import fs from 'fs';
import path from 'path';


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
            return res.redirect('/login');
          }

          const userCount = await prisma.users.count();
          const nodeCount = await prisma.node.count();
          const instanceCount = await prisma.server.count();
          const imageCount = await prisma.images.count();
          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          let airlinkCodename = String(res.locals.airlinkCodename || '');
          let vcodeBg: string | null = null;

          try {
            const configPath = path.join(process.cwd(), 'storage', 'config.json');
            if (fs.existsSync(configPath)) {
              const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
              if (cfg && cfg.meta && cfg.meta.codename) {
                airlinkCodename = String(cfg.meta.codename);
              }
            }
          } catch (error) {
            logger.error('Error reading storage/config.json for codename:', error);
          }

          if (airlinkCodename) {
            try {
              const vcodeDir = path.join(process.cwd(), 'public', 'assets', 'vcode');
              if (fs.existsSync(vcodeDir)) {
                const target = airlinkCodename.toLowerCase() + '.svg';
                const match = fs.readdirSync(vcodeDir).find((f) => f.toLowerCase() === target);
                if (match) {
                  vcodeBg = '/assets/vcode/' + match;
                }
              }
            } catch (error) {
              logger.error('Error scanning vcode assets:', error);
            }
          }

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
            airlinkCodename,
            vcodeBg,
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


export default adminModule;
