import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import { onlineUsers } from '../user/wsUsers';
import logger from '../../handlers/logger';
import bcrypt from 'bcrypt';

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
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const users = await listUsers(res);
          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          res.render('admin/users/users', {
            user,
            req,
            settings,
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
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }
          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          res.render('admin/users/create', { user, req, settings });
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
        let isAdmin = req.body.isAdmin;
        const { email, username, password } = req.body;

        if (!email || !username || !password) {
          res.status(400).json({
            message: 'Missing required fields: email, username, or password.',
          });
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
            res
              .status(400)
              .json({ message: 'Email or username already exists.' });
            return;
          }

          if (!existingUser) {
            await prisma.users.create({
              data: {
                email,
                username,
                password: await bcrypt.hash(password, 10),
                isAdmin,
              },
            });
          }

          res.status(200).json({ message: 'User created successfully.' });
          return;
        } catch (error) {
          logger.error('Error creating user:', error);
          res
            .status(500)
            .json({ message: 'Error creating user. Please try again later.' });
          return;
        }
      },
    );

    router.get(
      '/admin/users/view/:id/',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const dataUser = await prisma.users.findUnique({
            where: { id: parseInt(req.params.id, 10) },
          });
          if (!dataUser) {
            return res.redirect('/admin/users');
          }
          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          // todo:
          //     - render data user
          //     - update user
          //     - see how many time he connected
          //     - see which page was he see
          //     - him request ...

          res.render('admin/users/user', { user, req, settings, dataUser });
        } catch (error) {
          logger.error('Error fetching user:', error);
          return res.redirect('/login');
        }
      },
    );

    router.delete(
      '/admin/users/delete/:id/',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const dataUser = await prisma.users.findUnique({
            where: { id: parseInt(req.params.id, 10) },
          });
          if (!dataUser) {
            return res.redirect('/admin/users');
          }

          await prisma.users.delete({
            where: { id: parseInt(req.params.id, 10) },
          });

          res.status(200).json({ message: 'User deleted successfully.' });
        } catch (error) {
          logger.error('Error deleting user:', error);
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
