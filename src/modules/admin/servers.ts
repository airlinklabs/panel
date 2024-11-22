import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import { log } from 'console';

const prisma = new PrismaClient();

interface ErrorMessage {
  message?: string;
}

const adminModule: Module = {
  info: {
    name: 'Admin Module',
    description: 'This file is for admin functionality.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/admin/servers',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        if (!userId) {
          return res.redirect('/login');
        }

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const servers = await prisma.server.findMany({
            include: {
              node: true,
              owner: true,
            },
          });
          
          res.render('admin/servers/servers', { user, req, logo: '', servers });
        } catch (error) {
          logger.error('Error fetching user:', error);
          return res.redirect('/login');
        }
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
