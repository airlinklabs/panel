import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';

const prisma = new PrismaClient();

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
          logger.error('Error fetching servers:', error);
          return res.redirect('/login');
        }
      },
    );

    router.get(
      '/admin/servers/create',
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

          const users = await prisma.users.findMany();
          const nodes = await prisma.node.findMany();
          const images = await prisma.images.findMany();

          res.render('admin/servers/create', {
            user,
            req,
            logo: '',
            nodes,
            images,
            users,
          });
        } catch (error) {
          logger.error('Error fetching data for server creation:', error);
          return res.redirect('/login');
        }
      },
    );

    router.post(
      '/admin/servers/create',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        if (!userId) {
          return res.redirect('/login');
        }

        const {
          name,
          description,
          nodeId,
          imageId,
          Ports,
          Memory,
          Cpu,
          Storage,
        } = req.body;

        if (!name || !description || !nodeId || !imageId) {
          res.status(400).send('Missing required fields');
          return;
        }

        const Port = `[{"Port": "${Ports}", "primary": true}]`;

        try {
          await prisma.server.create({
            data: {
              name,
              description,
              ownerId: userId,
              nodeId: parseInt(nodeId),
              imageId: parseInt(imageId),
              Ports: Port || '[{"Port": "25565:25565", "primary": true}]',
              Memory: parseInt(Memory) || 4,
              Cpu: parseInt(Cpu) || 2,
              Storage: parseInt(Storage) || 20,
            },
          });
          res.redirect('/admin/servers');
        } catch (error) {
          logger.error('Error creating server:', error);
          res.status(500).send('Error creating server');
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
