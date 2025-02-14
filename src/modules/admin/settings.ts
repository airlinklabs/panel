import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient, ApiKey, Users } from '@prisma/client';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import { checkAdmin } from '../../handlers/utils/auth/adminAuthMiddleware';
import logger from '../../handlers/logger';

const prisma = new PrismaClient();

interface RequestWithUser extends Request {
  user?: {
    id: number;
    email: string;
    isAdmin: boolean;
  };
  session?: {
    user?: {
      id: number;
      isAdmin: boolean;
    };
  };
}

const adminModule: Module = {
  info: {
    name: 'Admin Nodes Module',
    description: 'This file is for admin functionality of the Nodes.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    // API Management Routes
    router.get('/admin/api-keys', checkAdmin, async (req: RequestWithUser, res: Response) => {
      try {
      const apiKeys = await prisma.apiKey.findMany({
        include: {
        user: {
          select: {
          id: true,
          email: true,
          username: true
          }
        }
        },
        orderBy: { createdAt: 'desc' }
      });
      
      res.render('admin/applicationapi/api-keys', {
        apiKeys,
        user: req.user,
        success: req.query.success,
        error: req.query.error
      });
      } catch (error) {
      logger.error('Error fetching API keys:', error);
      res.redirect('/admin/settings?error=Failed to fetch API keys');
      }
    });

    router.get('/admin/api-keys/:id', checkAdmin, async (req: Request, res: Response): Promise<void> => {
      try {
      const apiKey = await prisma.apiKey.findUnique({
        where: { id: parseInt(req.params.id) },
        include: {
        user: {
          select: {
          id: true,
          email: true,
          username: true
          }
        }
        }
      });

      if (!apiKey) {
        res.status(404).json({ error: 'API key not found' });
        return;
      }

      res.json(apiKey);
      } catch (error) {
      logger.error('Error fetching API key:', error);
      res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Main settings page
    router.get(
      '/admin/settings',
      isAuthenticated(true),
      async (req: RequestWithUser, res: Response): Promise<void> => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });
          res.render('admin/settings/settings', { user, req, settings });
        } catch (error) {
          logger.error('Error fetching user:', error);
          return res.redirect('/login');
        }
      },
    );

    // API Keys management page
    router.get(
      '/admin/settings/api-keys',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }
          res.render('admin/settings/api-keys', { user, req });
        } catch (error) {
          logger.error('Error accessing API keys page:', error);
          return res.redirect('/login');
        }
      },
    );

    router.post('/admin/settings', isAuthenticated(true), async (req, res) => {
      const settingsData = req.body;
      await prisma.settings.update({
        where: { id: 1 },
        data: settingsData,
      });
      res.json({ success: true });
    });

    router.post(
      '/admin/settings/reset',
      isAuthenticated(true),
      async (req, res) => {
        await prisma.settings.update({
          where: { id: 1 },
          data: {
            title: 'Airlink',
            logo: '../assets/logo.png',
            theme: 'default',
            language: 'en',
          },
        });
        res.json({ success: true });
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
