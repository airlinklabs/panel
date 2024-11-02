import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import { getUser } from '../../handlers/utils/user/user';

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

    router.get('/admin/overview', isAuthenticated, async (req: Request, res: Response) => {
      const errorMessage: ErrorMessage = {};
      const userId = req.session?.user?.id;
      if (!userId) {
        return res.redirect('/login');
      }

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
            return res.redirect('/login');
        }
        
        if (!user.isAdmin) {
            return res.redirect('/dashboard');
        }

        res.render('admin/overview', { errorMessage, user, req });
      } catch (error) {
        console.error('Error fetching user:', error);
        return res.redirect('/login');
      }
    });

    return router;
  },
};

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit();
});

export default adminModule;
