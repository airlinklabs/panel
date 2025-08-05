import { Router, Request, Response } from 'express';
import { Module } from '../../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import logger from '../../../handlers/logger';
import { apiValidator } from '../../../handlers/utils/api/apiValidator';

const prisma = new PrismaClient();

const coreModule: Module = {
  info: {
    name: 'API Module',
    description: 'This module provides the API endpoints for the panel.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    // Ping endpoint for health checks and latency measurement
    router.get('/api/v1/ping', async (_req: Request, res: Response) => {
      try {
        res.json({
          status: 'ok',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          version: '1.0.0'
        });
      } catch (error) {
        logger.error('Error in ping endpoint:', error);
        res.status(500).json({
          status: 'error',
          message: 'Internal Server Error'
        });
      }
    });

    router.get('/api', async (req: Request, res: Response) => {
      try {
        const settings = await prisma.settings.findFirst();
        res.render('api/documentation', {
          req,
          user: req.session.user,
          settings
        });
      } catch (error) {
        logger.error('Error rendering API documentation:', error);
        res.status(500).render('error', {
          error: 'Failed to load API documentation',
          req
        });
      }
    });


    router.get(
      '/api/v1/users',
      apiValidator('airlink.api.users.read'),
      async (req: Request, res: Response) => {
        try {
          const users = await prisma.users.findMany({
            select: {
              id: true,
              username: true,
              email: true,
              isAdmin: true,
              description: true,
            },
          });

          res.json({ data: users });
        } catch (error) {
          logger.error('Error fetching users:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    router.get(
      '/api/v1/users/:id',
      apiValidator('airlink.api.users.read'),
      async (req: Request, res: Response) => {
        try {
          const userId = parseInt(req.params.id);

          const user = await prisma.users.findUnique({
            where: { id: userId },
            select: {
              id: true,
              username: true,
              email: true,
              isAdmin: true,
              description: true
            },
          });

          if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
          }

          res.json({ data: user });
        } catch (error) {
          logger.error('Error fetching user:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );


    router.get(
      '/api/v1/servers',
      apiValidator('airlink.api.servers.read'),
      async (_req: Request, res: Response) => {
        try {
          const servers = await prisma.server.findMany({
            include: {
              owner: {
                select: {
                  id: true,
                  username: true,
                  email: true,
                },
              },
              node: {
                select: {
                  id: true,
                  name: true,
                  address: true,
                },
              },
            },
          });

          res.json({ data: servers });
        } catch (error) {
          logger.error('Error fetching servers:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    router.get(
      '/api/v1/servers/:id',
      apiValidator('airlink.api.servers.read'),
      async (req: Request, res: Response) => {
        try {
          const serverId = req.params.id;

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: {
              owner: {
                select: {
                  id: true,
                  username: true,
                  email: true,
                },
              },
              node: {
                select: {
                  id: true,
                  name: true,
                  address: true,
                },
              },
            },
          });

          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          res.json({ data: server });
        } catch (error) {
          logger.error('Error fetching server:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );


    router.get(
      '/api/v1/nodes',
      apiValidator('airlink.api.nodes.read'),
      async (_req: Request, res: Response) => {
        try {
          const nodes = await prisma.node.findMany({
            select: {
              id: true,
              name: true,
              address: true,
              port: true,
              ram: true,
              cpu: true,
              disk: true,
              createdAt: true,
              _count: {
                select: {
                  servers: true,
                },
              },
            },
          });

          res.json({ data: nodes });
        } catch (error) {
          logger.error('Error fetching nodes:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    router.get(
      '/api/v1/nodes/:id',
      apiValidator('airlink.api.nodes.read'),
      async (req: Request, res: Response) => {
        try {
          const nodeId = parseInt(req.params.id);

          const node = await prisma.node.findUnique({
            where: { id: nodeId },
            select: {
              id: true,
              name: true,
              address: true,
              port: true,
              ram: true,
              cpu: true,
              disk: true,
              createdAt: true,
              servers: {
                select: {
                  id: true,
                  UUID: true,
                  name: true,
                  Memory: true,
                  Cpu: true,
                  Storage: true,
                },
              },
            },
          });

          if (!node) {
            res.status(404).json({ error: 'Node not found' });
            return;
          }

          res.json({ data: node });
        } catch (error) {
          logger.error('Error fetching node:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );




    router.get(
      '/api/v1/settings',
      apiValidator('airlink.api.settings.read'),
      async (_req: Request, res: Response) => {
        try {
          const settings = await prisma.settings.findFirst();

          if (!settings) {
            res.status(404).json({ error: 'Settings not found' });
            return;
          }

          res.json({ data: settings });
        } catch (error) {
          logger.error('Error fetching settings:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    router.patch(
      '/api/v1/settings',
      apiValidator('airlink.api.settings.update'),
      async (req: Request, res: Response) => {
        try {
          const { title, description, logo, favicon, theme, language } = req.body;


          const currentSettings = await prisma.settings.findFirst();

          if (!currentSettings) {
            res.status(404).json({ error: 'Settings not found' });
            return;
          }


          const updatedSettings = await prisma.settings.update({
            where: { id: currentSettings.id },
            data: {
              title: title !== undefined ? title : currentSettings.title,
              description: description !== undefined ? description : currentSettings.description,
              logo: logo !== undefined ? logo : currentSettings.logo,
              favicon: favicon !== undefined ? favicon : currentSettings.favicon,
              theme: theme !== undefined ? theme : currentSettings.theme,
              language: language !== undefined ? language : currentSettings.language,
              updatedAt: new Date(),
            },
          });

          res.json({ data: updatedSettings });
        } catch (error) {
          logger.error('Error updating settings:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    return router;
  },
};

export default coreModule;
