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
          res.redirect('/login');
          return;
        }

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const users = await listUsers(res);

          res.render('admin/users/users', {
            user,
            req,
            logo: '',
            users,
            onlineUsers,
          });
        } catch (error) {
          logger.error('Error fetching user:', error);
          return res.redirect('/login');
        }
      },
    );

    router.get(
      '/admin/users/create',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        if (!userId) {
          res.redirect('/login');
          return;
        }

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          res.render('admin/users/create', { user, req, logo: '' });
        } catch (error) {
          logger.error('Error fetching user:', error);
          return res.redirect('/login');
        }
      },
    );

    router.post(
      '/admin/users/create-user',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        let { email, username, password, isAdmin } = req.body;
    
        if (!email || !username || !password) {
          res.status(400).json({ message: 'Missing required fields: email, username, or password.' });
          return;
        }
    
        isAdmin = isAdmin === 'true';
    
        try {
          const existingUser = await prisma.users.findFirst({
            where: {
              OR: [{ email }, { username }],
            },
          });
    
          if (existingUser) {
            res.status(400).json({ message: 'Email or username already exists.' });
            return;
          }

          if (!existingUser) {
            await prisma.users.create({
              data: {
                email,
                username,
                password,
                isAdmin,
              },
            });
          }
    
          res.redirect('/admin/users');
          return;
        } catch (error) {
          logger.error('Error creating user:', error);
          res.status(500).json({ message: 'Error creating user. Please try again later.' });
          return;
        }
      }
    );
    
    return router;
  },
};

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit();
});

export default adminModule;
