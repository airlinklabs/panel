import { getSettings } from '../../handlers/settingsCache';
import type { Request, Response } from 'express';
import { Router } from 'express';
import type { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import logger from '../../handlers/logger';

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
      try {
        const settings = await getSettings();
        const userCount = await prisma.users.count();
        const isFirstUser = userCount === 0;

        if (isFirstUser) {
          res.redirect('/register');
          return;
        }

        res.render('auth/login', { req, settings });
      } catch (error) {
        logger.error('Error rendering login page:', error);
        res.status(500).render('auth/login', { req, settings: null });
      }
    });

    router.get('/register', async (req: Request, res: Response) => {
      try {
        const settings = await getSettings();
        const userCount = await prisma.users.count();
        const isFirstUser = userCount === 0;

        // Check if registration is allowed
        if (!isFirstUser && settings && !settings.allowRegistration) {
          res.redirect('/login?err=registration_disabled');
          return;
        }

        res.render('auth/register', { req, settings });
      } catch (error) {
        logger.error('Error rendering register page:', error);
        res.status(500).render('auth/register', { req, settings: null });
      }
    });

    return router;
  },
};

export default authModule;
