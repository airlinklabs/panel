import type { Request } from 'express';
import { Router } from 'express';
import type { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import type { WebSocket } from 'ws';
import logger from '../../handlers/logger';

// Presence is tracked per connection, not per username: a user with several
// open tabs/sockets stays online until the LAST connection closes. The set of
// socket ids per username is updated immediately on connect/close, so there is
// no stale 1-second window and no timeout bookkeeping.
export const onlineUsers = new Set<string>();
export const onlineConnections = new Map<string, Set<string>>();

function connectionKey(): string {
  // Connection identity is what matters; the socket's own id is opaque.
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const wsUsersModule: Module = {
  info: {
    name: 'WS Users Module',
    description: 'This file is for the users functionality.',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: (applyWs?: (router: Router) => void) => {
    const router = Router();
    if (applyWs) {
      applyWs(router);
    }

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
        const connectionId = connectionKey();

        let connections = onlineConnections.get(username);
        if (!connections) {
          connections = new Set();
          onlineConnections.set(username, connections);
        }
        connections.add(connectionId);
        onlineUsers.add(username);

        ws.send(JSON.stringify({ online: true }));

        ws.on('close', () => {
          const conns = onlineConnections.get(username);
          if (!conns) {
            return;
          }
          conns.delete(connectionId);
          if (conns.size === 0) {
            onlineConnections.delete(username);
            onlineUsers.delete(username);
          }
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
