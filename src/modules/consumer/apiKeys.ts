import type { Request, Response } from 'express';
import { Router } from 'express';
import type { Module } from '../../core/moduleInit.js';
import prisma from '../../db.js';
import { isAuthenticated } from '../../middleware/auth.js';
import logger from '../../services/logger.js';

const consumerApiKeysModule: Module = {
  info: {
    name: 'Consumer API Keys Module',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get('/consumer/api-keys', isAuthenticated(), async (req: Request, res: Response) => {
      try {
        const userId = req.session?.user?.id;
        const user = await prisma.users.findUnique({ where: { id: userId! } });
        if (!user) { res.redirect('/login'); return; }
        if (user.isAdmin) { res.redirect('/admin/apikeys'); return; }

        const settings = await prisma.settings.findUnique({ where: { id: 1 } });
        const apiKeys = await prisma.userApiKey.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        });

        const displayKeys = apiKeys.map((key) => ({
          ...key,
          displayKey: key.prefix + key.key.slice(8, 20),
        }));

        res.render('consumer/api-keys', {
          apiKeys: displayKeys,
          settings,
          user,
          req,
        });
      } catch (error) {
        logger.error('Error loading consumer API keys page:', error);
        res.redirect('/');
      }
    });

    return router;
  },
};

export default consumerApiKeysModule;
