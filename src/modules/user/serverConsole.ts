import { Router, Request } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { WebSocket } from 'ws';
import { isAuthenticatedForServerWS } from '../../handlers/utils/auth/serverAuthUtil';
import logger from '../../handlers/logger';

const prisma = new PrismaClient();

const wsServerConsoleModule: Module = {
  info: {
    name: 'Server Console Module',
    description: 'This file is for the server console functionality.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.ws(
      '/console/:id',
      isAuthenticatedForServerWS('id'),
      async (ws: WebSocket, req: Request) => {
        const userId = req.session?.user?.id;
        if (!userId) {
          ws.send(JSON.stringify({ error: 'User not authenticated' }));
          ws.close();
          return;
        }

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user || !user.username) {
            ws.send(
              JSON.stringify({ error: 'User not found or username missing' }),
            );
            ws.close();
            return;
          }

          const serverId = req.params.id;
          if (!serverId) {
            ws.send(JSON.stringify({ error: 'Server ID is required' }));
            ws.close();
            return;
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true },
          });
          if (!server) {
            ws.send(JSON.stringify({ error: 'Server not found' }));
            ws.close();
            return;
          }

          const node = server.node;

          const socket = new WebSocket(
            `ws://${node.address}:${node.port}/container/${serverId}`,
          );

          socket.onopen = () => {
            socket.send(JSON.stringify({ event: 'auth', args: [node.key] }));
          };

          socket.onmessage = (msg) => {
            ws.send(msg.data);
          };

          socket.onerror = () => {
            ws.send('\x1b[31;1mThis instance is unavailable!\x1b[0m');
          };

          socket.onclose = () => {};

          ws.onmessage = (msg) => {
            socket.send(msg.data);
          };

          ws.on('close', () => {
            socket.close();
          });
        } catch (error) {
          logger.error('Error fetching user:', error);
          ws.send(JSON.stringify({ error: 'Internal server error' }));
          ws.close();
        }
      },
    );

    router.ws(
      '/api/console/:id/:password',
      isAuthenticatedForServerWS('id', 'password'),
      async (ws: WebSocket, req: Request) => {
        if (!req.query.userId) {
          ws.send(JSON.stringify({ error: 'User not authenticated' }));
          ws.close();
          return;
        }

        const userId = +req.query.userId;

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user || !user.username) {
            ws.send(
              JSON.stringify({ error: 'User not found or username missing' }),
            );
            ws.close();
            return;
          }

          const serverId = req.params.id;
          if (!serverId) {
            ws.send(JSON.stringify({ error: 'Server ID is required' }));
            ws.close();
            return;
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true },
          });
          if (!server) {
            ws.send(JSON.stringify({ error: 'Server not found' }));
            ws.close();
            return;
          }

          const node = server.node;

          const socket = new WebSocket(
            `ws://${node.address}:${node.port}/container/${serverId}`,
          );

          socket.onopen = () => {
            socket.send(JSON.stringify({ event: 'auth', args: [node.key] }));
          };

          socket.onmessage = (msg) => {
            ws.send(msg.data);
          };

          socket.onerror = () => {
            ws.send('\x1b[31;1mThis instance is unavailable!\x1b[0m');
          };

          socket.onclose = () => {};

          ws.onmessage = (msg) => {
            socket.send(msg.data);
          };

          ws.on('close', () => {
            socket.close();
          });
        } catch (error) {
          logger.error('Error fetching user:', error);
          ws.send(JSON.stringify({ error: 'Internal server error' }));
          ws.close();
        }
      },
    );

    router.ws(
      '/status/:id',
      isAuthenticatedForServerWS('id'),
      async (ws: WebSocket, req: Request) => {
        const userId = req.session?.user?.id;
        if (!userId) {
          ws.send(JSON.stringify({ error: 'User not authenticated' }));
          ws.close();
          return;
        }

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user || !user.username) {
            ws.send(
              JSON.stringify({ error: 'User not found or username missing' }),
            );
            ws.close();
            return;
          }

          const serverId = req.params.id;
          if (!serverId) {
            ws.send(JSON.stringify({ error: 'Server ID is required' }));
            ws.close();
            return;
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true },
          });
          if (!server) {
            ws.send(JSON.stringify({ error: 'Server not found' }));
            ws.close();
            return;
          }

          const node = server.node;

          const socket = new WebSocket(
            `ws://${node.address}:${node.port}/containerstatus/${serverId}`,
          );

          socket.onopen = () => {
            socket.send(JSON.stringify({ event: 'auth', args: [node.key] }));
          };

          socket.onmessage = (msg) => {
            ws.send(msg.data);
          };

          socket.onerror = () => {
            ws.send('\x1b[31;1mThis instance is unavailable!\x1b[0m');
          };

          socket.onclose = () => {
            ws.close();
          };

          ws.on('close', () => {
            socket.close();
          });
        } catch (error) {
          logger.error('Error fetching user:', error);
          ws.send(JSON.stringify({ error: 'Internal server error' }));
          ws.close();
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

export default wsServerConsoleModule;
