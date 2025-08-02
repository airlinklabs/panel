import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const spaTestModule: Module = {
  info: {
    name: 'SPA Test Module',
    description: 'Test module for Single Page Application functionality.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get('/test/spa', isAuthenticated(), async (req: Request, res: Response) => {
      try {
        const userId = req.session?.user?.id;
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          return res.redirect('/login');
        }

        const settings = await prisma.settings.findUnique({ where: { id: 1 } });

        res.render('test/spa-test', {
          user,
          req,
          settings,
          title: 'SPA Test Page'
        });
      } catch (error) {
        console.error('Error loading SPA test page:', error);
        res.status(500).send('Error loading test page');
      }
    });

    return router;
  },
};

export default spaTestModule;
