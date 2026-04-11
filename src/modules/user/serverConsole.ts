import { Router, Request } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { WebSocket } from 'ws';
import { isAuthenticatedForServerWS } from '../../handlers/utils/auth/serverAuthUtil';
import logger from '../../handlers/logger';
import { getParamAsString } from '../../utils/typeHelpers';
import { daemonSchemeSync } from '../../handlers/utils/core/daemonRequest';

function wsScheme(): 'ws' | 'wss' {
  return daemonSchemeSync() === 'https' ? 'wss' : 'ws';
}

async function proxyConsole(
  ws: WebSocket,
  req: Request,
  userId: number,
  daemonPath: (nodeAddress: string, nodePort: number, serverId: string) => string,
) {
  try {
    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user?.username) {
      ws.send(JSON.stringify({ error: 'User not found or username missing' }));
      ws.close();
      return;
    }

    const serverId = getParamAsString(req.params.id);
    if (!serverId) {
      ws.send(JSON.stringify({ error: 'Server ID is required' }));
      ws.close();
      return;
    }

    const server = await prisma.server.findUnique({
      where: { UUID: getParamAsString(serverId) },
      include: { node: true },
    });
    if (!server) {
      ws.send(JSON.stringify({ error: 'Server not found' }));
      ws.close();
      return;
    }

    const { node } = server;
    const socket = new WebSocket(daemonPath(node.address, node.port, serverId));

    socket.onopen = () => {
      socket.send(JSON.stringify({ event: 'auth', args: [node.key] }));
    };

    socket.onmessage = (msg) => ws.send(msg.data);

    socket.onerror = () => {
      ws.send('\x1b[31;1mThis instance is unavailable!\x1b[0m');
    };

    socket.onclose = () => ws.close();

    ws.onmessage = (msg) => socket.send(msg.data);
    ws.on('close', () => socket.close());
  } catch (error) {
    logger.error('Error in console proxy:', error);
    ws.send(JSON.stringify({ error: 'Internal server error' }));
    ws.close();
  }
}

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
        await proxyConsole(
          ws, req, userId,
          (addr, port, id) => `${wsScheme()}://${addr}:${port}/container/${id}`,
        );
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
        await proxyConsole(
          ws, req, +req.query.userId,
          (addr, port, id) => `${wsScheme()}://${addr}:${port}/container/${id}`,
        );
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
        await proxyConsole(
          ws, req, userId,
          (addr, port, id) => `${wsScheme()}://${addr}:${port}/containerstatus/${id}`,
        );
      },
    );

    router.ws(
      '/events/:id',
      isAuthenticatedForServerWS('id'),
      async (ws: WebSocket, req: Request) => {
        const userId = req.session?.user?.id;
        if (!userId) {
          ws.send(JSON.stringify({ error: 'User not authenticated' }));
          ws.close();
          return;
        }
        await proxyConsole(
          ws, req, userId,
          (addr, port, id) => `${wsScheme()}://${addr}:${port}/containerevents/${id}`,
        );
      },
    );

    return router;
  },
};

export default wsServerConsoleModule;
