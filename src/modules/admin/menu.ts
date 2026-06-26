import type { Request, Response } from 'express';
import { Router } from 'express';
import type { Module } from '../../core/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../middleware/auth';
import logger from '../../services/logger';

const adminMenuModule: Module = {
  info: {
    name: 'Admin Menu Module',
    description: 'Admin menu route.',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/admin/menu',
      isAuthenticated(true, 'airlink.admin.overview.main'),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {res.redirect('/login'); return;}
          const settings = await prisma.settings.findUnique({ where: { id: 1 } });
          res.render('admin/menu/menu', { user, req, settings });
        } catch (error) {
          logger.error('Error rendering admin menu:', error);
          res.redirect('/admin/overview');
        }
      },
    );

    router.get(
      '/menu',
      isAuthenticated(false),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {res.redirect('/login'); return;}
          const settings = await prisma.settings.findUnique({ where: { id: 1 } });
          res.render('admin/menu/menu', { user, req, settings });
        } catch (error) {
          logger.error('Error rendering menu:', error);
          res.redirect('/');
        }
      },
    );

    return router;
  },
};

export default adminMenuModule;
