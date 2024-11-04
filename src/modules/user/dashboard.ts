import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import { getUser } from '../../handlers/utils/user/user';

const prisma = new PrismaClient();

interface ErrorMessage {
  message?: string;
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

    router.get(
      '/dashboard',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        const errorMessage: ErrorMessage = {};
        const userId = req.session?.user?.id;
        if (!userId) {
          return res.redirect('/login');
        }

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            errorMessage.message = 'User not found.';
            return res.render('user/dashboard', { errorMessage, user, req });
          }

          res.render('user/dashboard', {
            errorMessage,
            user,
            req,
            name: 'AirLink',
            logo: '',
          });
        } catch (error) {
          console.error('Error fetching user:', error);
          errorMessage.message = 'Error fetching user data.';
          res.render('user/dashboard', {
            errorMessage,
            user: getUser(req),
            req,
            name: 'AirLink',
            logo: '',
          });
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

export default dashboardModule;
