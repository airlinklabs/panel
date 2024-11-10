import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import { onlineUsers } from '../user/wsUsers';
import logger from '../../handlers/logger';

const prisma = new PrismaClient();

async function listUsers(res: Response) {
  try {
    const users = await prisma.users.findMany();

    return users;
  } catch (error) {
    logger.error('Error fetching users:', error);
    res.status(500).json({ message: 'Error fetching users.' });
  }
}

const adminModule: Module = {
  info: {
    name: 'Admin Users Module',
    description: 'This file is for admin functionality of the Users.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/admin/users',
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

          const users = await listUsers(res);
          
          res.render('admin/users/users', { user, req, logo: '', users, onlineUsers });
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
