import { Router, Request } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { WebSocket } from 'ws';
import logger from '../../handlers/logger';

export const onlineUsers: Set<string> = new Set();
export const userTimeouts: Map<string, NodeJS.Timeout> = new Map();

const prisma = new PrismaClient();

const wsUsersModule: Module = {
  info: {
    name: 'WS Users Module',
    description: 'This file is for the users functionality.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.ws('/online-check', async (ws: WebSocket, req: Request) => {
      const userId = req.session?.user?.id;
      if (!userId) {
        ws.close();
        return;
      }

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user || !user.username) {
          ws.close();
          return;
        }

        const username = user.username;

        if (onlineUsers.has(username)) {
          const existingTimeout = userTimeouts.get(username);
          if (existingTimeout) {
            clearTimeout(existingTimeout);
            userTimeouts.delete(username);
          }
        }

        onlineUsers.add(username);

        ws.send(JSON.stringify({ online: true }));

        ws.on('close', () => {
          const timeout = setTimeout(() => {
            onlineUsers.delete(username);
            userTimeouts.delete(username);
          }, 1000);

          userTimeouts.set(username, timeout);
        });
      } catch (error) {
        logger.error('Error fetching user:', error);
        ws.close();
      }
    });

    return router;
  },
};

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit();
});

export default wsUsersModule;
