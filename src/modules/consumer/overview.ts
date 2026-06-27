import type { Request, Response } from 'express';
import { Router } from 'express';
import type { Module } from '../../core/moduleInit.js';
import prisma from '../../db.js';
import { isAuthenticated } from '../../middleware/auth.js';
import logger from '../../services/logger.js';

const consumerOverviewModule: Module = {
  info: {
    name: 'Consumer Overview Module',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get('/consumer/overview', isAuthenticated(), async (req: Request, res: Response) => {
      try {
        const userId = req.session?.user?.id;
        if (!userId) { res.redirect('/login'); return; }

        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) { res.redirect('/login'); return; }
        if (user.isAdmin) { res.redirect('/admin/overview'); return; }

        const servers = await prisma.server.findMany({
          where: { ownerId: userId },
          include: { node: true, image: true },
        });
        const settings = await prisma.settings.findUnique({ where: { id: 1 } });
        const serverLimit = user.serverLimit ?? settings?.defaultServerLimit ?? 0;

        res.render('consumer/overview', {
          user,
          servers,
          serverLimit,
          settings,
          req,
          totalMemory: servers.reduce((s, sv) => s + sv.Memory, 0),
          totalCpu: servers.reduce((s, sv) => s + sv.Cpu, 0),
          totalStorage: servers.reduce((s, sv) => s + sv.Storage, 0),
        });
      } catch (error) {
        logger.error('Error loading consumer overview:', error);
        res.redirect('/');
      }
    });

    return router;
  },
};

export default consumerOverviewModule;
