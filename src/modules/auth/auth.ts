import { getSettings } from '../../handlers/settingsCache';
import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';


const authModule: Module = {
  info: {
    name: 'Auth Module',
    description: 'This file is for authentication and authorization of users.',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get('/login', async (req: Request, res: Response) => {
      const settings = await await getSettings();

      const userCount = await prisma.users.count();
      const isFirstUser = userCount === 0;

      if (isFirstUser) {
        res.redirect('/register');
        return;
      }

      res.render('auth/login', { req, settings });
    });

    router.get('/register', async (req: Request, res: Response) => {
      const settings = await await getSettings();
      const userCount = await prisma.users.count();
      const isFirstUser = userCount === 0;

      // Check if registration is allowed
      if (!isFirstUser && settings && !settings.allowRegistration) {
        res.redirect('/login?err=registration_disabled');
        return;
      }

      res.render('auth/register', { req, settings });
    });

    return router;
  },
};

export default authModule;
