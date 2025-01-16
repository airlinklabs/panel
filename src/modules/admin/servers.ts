import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import axios from 'axios';

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
        try {
          const userId = req.session?.user?.id;
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
        try {
          const userId = req.session?.user?.id;
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
        
        const userId = req.session?.user?.id;
        if (!name || !description || !nodeId || !imageId || !Ports || !Memory || !Cpu || !Storage || !userId) {
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

    router.get(
      '/admin/server/delete/:id',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        const { id } = req.params;
        
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.redirect('/login');
            return;
          }
    
          const serverId = parseInt(id);
          if (isNaN(serverId)) {
            res.status(400).send('Invalid server ID');
            return;
          }
    
          const server = await prisma.server.findUnique({
            where: { id: serverId },
            include: { node: true, image: true, owner: true },
          });
    
          if (!server) {
            res.status(404).send('Server not found');
            return;
          }
    
          try {
            const response = await axios.delete(
              `http://${server.node.address}:${server.node.port}/container/delete`,
              {
                auth: {
                  username: 'Airlink',
                  password: server.node.key,
                },
                headers: {
                  'Content-Type': 'application/json',
                },
                data: {
                  id: serverId,
                  deleteCmd: 'delete',
                }
              }
            );
    
            if (response.status !== 200) {
              throw new Error('Failed to delete server container');
            }
    
            await prisma.server.delete({ where: { id: serverId } });
            res.redirect('/admin/servers');
            return;
          } catch (error) {
            logger.error('Error deleting server container:', error);
            res.status(500).send(`Failed to delete server container: ${error}`);
            return;
          }
        } catch (error) {
          logger.error('Error in delete server route:', error);
          res.status(500).send('Error deleting server');
          return;
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
