import type { Request } from 'express';
import { Router } from 'express';
import type { Module } from '../../core/moduleInit.js';
import prisma from '../../db.js';
import type { WebSocket } from 'ws';
import logger from '../../services/logger.js';

export const onlineUsers = new Set<string>();
export const userTimeouts = new Map<string, NodeJS.Timeout>();


const wsUsersModule: Module = {
  info: {
    name: 'WS Users Module',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: (applyWs?: (router: Router) => void) => {
    const router = Router();
    if (applyWs) {applyWs(router);}

    router.ws('/online-check', async (ws: WebSocket, req: Request) => {
      const userId = req.session?.user?.id;
      if (!userId) {
        ws.close();
        return;
      }

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user?.username) {
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


export default wsUsersModule;
