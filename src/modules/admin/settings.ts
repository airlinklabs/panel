import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';

const prisma = new PrismaClient();

const adminModule: Module = {
  info: {
    name: 'Admin Nodes Module',
    description: 'This file is for admin functionality of the Nodes.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/admin/settings',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });
          res.render('admin/settings/settings', { user, req, settings });
        } catch (error) {
          logger.error('Error fetching user:', error);
          return res.redirect('/login');
        }
      },
    );

    router.post('/admin/settings', isAuthenticated(true), async (req, res) => {
      const settingsData = req.body;
      await prisma.settings.update({
        where: { id: 1 },
        data: settingsData,
      });
      res.json({ success: true });
    });

    router.post(
      '/admin/settings/reset',
      isAuthenticated(true),
      async (req, res) => {
        await prisma.settings.update({
          where: { id: 1 },
          data: {
            title: 'Airlink',
            logo: '../assets/logo.png',
            theme: 'default',
            language: 'en',
          },
        });
        res.json({ success: true });
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
