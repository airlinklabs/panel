import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import logger from '../../handlers/logger';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const authModule: Module = {
  info: {
    name: 'Auth Module',
    description: 'This file is for authentication and authorization of users.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get('/login', async (req: Request, res: Response) => {
      const settings = await prisma.settings.findUnique({ where: { id: 1 } });

      const userCount = await prisma.users.count();
      const isFirstUser = userCount === 0;

      if (isFirstUser) {
        res.redirect('/register');
        return;
      }

      res.render('auth/login', { req, settings });
    });

    router.get('/register', async (req: Request, res: Response) => {
      const settings = await prisma.settings.findUnique({ where: { id: 1 } });
      const userCount = await prisma.users.count();
      const isFirstUser = userCount === 0;

      // Check if registration is allowed
      if (!isFirstUser && settings && !(settings as any).allowRegistration) {
        res.redirect('/login?err=registration_disabled');
        return;
      }

      res.render('auth/register', { req, settings });
    });

    router.post('/logout', (req: Request, res: Response) => {
      if (req.session) {
        req.session.destroy((err) => {
          if (err) {
            logger.error('Session destruction error', err);
            return res.status(500).json({ error: 'logout_error' });
          }
          res.clearCookie('connect.sid');
          res.redirect('/');
        });
      } else {
        res.redirect('/');
      }
    });

    return router;
  },
};

export default authModule;
