import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';

const prisma = new PrismaClient();

interface ErrorMessage {
  message?: string;
}

interface User {
  username?: string;
  id?: number;
  description?: string;
  isAdmin?: boolean;
  email?: string;
}

async function getUser(req: Request) {
  const userObject: User = {
    username: req.session?.user?.username,
    id: req.session?.user?.id,
    description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    isAdmin: req?.session?.user?.isAdmin,
    email: req.session?.user?.email,
  };
}

const dashboardModule: Module = {
  info: {
    name: 'Dashboard Module',
    description: 'This file is for dashboard functionality.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get('/dashboard', isAuthenticated, async (req: Request, res: Response) => {
      const errorMessage: ErrorMessage = {};
      const userId = req.session?.user?.id;
      if (!userId) {
        return res.redirect('/login');
      }

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          errorMessage.message = 'User not found.';
          return res.render('user/dashboard', { errorMessage, user: getUser(req), req });
        }

        res.render('user/dashboard', { errorMessage, user, req });
      } catch (error) {
        console.error('Error fetching user:', error);
        errorMessage.message = 'Error fetching user data.';
        res.render('user/dashboard', { errorMessage, user: getUser(req), req });
      }
    });

    return router;
  },
};

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit();
});

export default dashboardModule;
