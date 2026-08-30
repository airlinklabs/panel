// ── WebSocket proxy for container console ────────────────────────────────────
// Commands go via REST (POST /container/command); the WebSocket is receive-only
// for terminal output. Binary frames are preserved end-to-end for TUI pass-through:
// daemon -> panel proxy -> browser WebSocket -> xterm.js. Do not convert Buffer
// to string in the proxy path — TUI escape sequences are binary data.

import type { Request } from 'express';
import { Router } from 'express';
import type { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { WebSocket } from 'ws';
import {
  isAuthenticatedForServerWS,
  subUserHasPermission,
} from '../../handlers/utils/auth/serverAuthUtil';
import { verifyWsToken } from '../../handlers/utils/security/wsToken';
import { mintCapabilityToken } from '../../handlers/utils/security/capabilityToken';
import logger from '../../handlers/logger';
import { getParamAsString } from '../../utils/typeHelpers';
import {
  daemonRequest,
  daemonScheme,
} from '../../handlers/utils/core/daemonRequest';

async function wsScheme(): Promise<'ws' | 'wss'> {
  return (await daemonScheme()) === 'https' ? 'wss' : 'ws';
}

type ProxiedMessage = string | Buffer;
type WsMessage = string | Buffer | ArrayBuffer | Buffer[];
type ConsoleProxyMode = 'interactive' | 'readonly';

const CONSOLE_COMMAND_EVENTS = new Set([
  'cmd',
  'command',
  'input',
  'stdin',
  'sendcommand',
]);
const MAX_PENDING_CLIENT_MESSAGES = 50;

function isOpen(socket: WebSocket): boolean {
  return socket.readyState === WebSocket.OPEN;
}

function sendIfOpen(socket: WebSocket, data: string | Buffer): void {
  if (isOpen(socket)) {
    socket.send(data);
  }
}

function sendSocketError(socket: WebSocket, message: string): void {
  sendIfOpen(socket, JSON.stringify({ error: message }));
  socket.close();
}

function normalizeWsMessage(data: WsMessage): ProxiedMessage {
  if (typeof data === 'string') {
    return data;
  }
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  return Buffer.from(data);
}

function extractConsoleCommand(data: WsMessage): string | null {
  const raw = normalizeWsMessage(data).toString('utf8').trim();
  if (!raw) {
    return null;
  }

  try {
    const payload = JSON.parse(raw) as {
      event?: string;
      command?: unknown;
      data?: unknown;
      value?: unknown;
      payload?: unknown;
      args?: unknown[];
    };

    const event =
      typeof payload.event === 'string' ? payload.event.toLowerCase() : 'cmd';
    if (!CONSOLE_COMMAND_EVENTS.has(event)) {
      return null;
    }

    const candidates = [
      payload.command,
      payload.data,
      payload.value,
      payload.payload,
      payload.args?.[0],
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string') {
        const command = candidate.replace(/\r\n?/g, '\n').trim();
        if (command) {
          return command;
        }
      }
    }
  } catch {
    return raw;
  }

  return null;
}

async function proxyConsole(
  ws: WebSocket,
  req: Request,
  userId: number,
  daemonPath: (
    nodeAddress: string,
    nodePort: number,
    serverId: string,
  ) => Promise<string> | string,
  mode: ConsoleProxyMode,
) {
  try {
    const token = new URL(req.url ?? '', 'ws://local').searchParams.get(
      'token',
    );
    const tokenData = verifyWsToken(token);
    if (!tokenData) {
      sendSocketError(
        ws,
        'Invalid or expired connect token. Refresh the page and try again.',
      );
      return;
    }

    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user?.username) {
      sendSocketError(ws, 'User not found or username missing');
      return;
    }

    const serverId = getParamAsString(req.params.id);
    if (!serverId) {
      sendSocketError(ws, 'Server ID is required');
      return;
    }

    if (tokenData.serverId !== serverId || tokenData.userId !== userId) {
      sendSocketError(ws, 'Connect token does not match this session');
      return;
    }

    const server = await prisma.server.findUnique({
      where: { UUID: getParamAsString(serverId) },
      include: { node: true },
    });
    if (!server) {
      sendSocketError(ws, 'Server not found');
      return;
    }

    const { node } = server;
    const socket = new WebSocket(
      await daemonPath(node.address, node.port, serverId),
    );
    const pendingClientMessages: ProxiedMessage[] = [];
    let clientClosed = false;

    // Determine which daemon WS routes this connection needs.
    const daemonRoutes: (
      'container' | 'containerstatus' | 'containerevents'
    )[] = [];
    if (daemonPath.toString().includes('/container/')) {
      daemonRoutes.push('container');
    }
    if (daemonPath.toString().includes('/containerstatus')) {
      daemonRoutes.push('containerstatus');
    }
    if (daemonPath.toString().includes('/containerevents')) {
      daemonRoutes.push('containerevents');
    }
    // Fallback: if we can't determine the route from the function, grant all
    // routes that this panel module uses. The daemon will reject mismatches.
    if (daemonRoutes.length === 0) {
      daemonRoutes.push('container', 'containerstatus', 'containerevents');
    }

    // Mint a short-lived capability token instead of sending the raw node key.
    // The daemon verifies this token's signature, expiry, and route match.
    const capabilityToken = mintCapabilityToken({
      nodeKey: node.key,
      nodeId: node.id,
      serverId,
      routes: daemonRoutes,
    });

    function flushPendingClientMessages(): void {
      while (pendingClientMessages.length > 0 && isOpen(socket)) {
        const message = pendingClientMessages.shift();
        if (message) {
          socket.send(message);
        }
      }
    }

    async function forwardToDaemon(data: WsMessage): Promise<void> {
      if (mode === 'readonly') {
        return;
      }

      const command = extractConsoleCommand(data);
      if (command) {
        try {
          await daemonRequest({
            nodeAddress: node.address,
            nodePort: node.port,
            nodeKey: node.key,
            method: 'POST',
            path: '/container/command',
            body: { id: serverId, command },
            timeout: 10_000,
          });
        } catch (error) {
          logger.error(`Failed to send console command to ${serverId}:`, error);
          sendIfOpen(
            ws,
            '\x1b[31;1mCommand failed to reach the daemon. Check panel logs for details.\x1b[0m\r\n',
          );
        }
        return;
      }

      const message = normalizeWsMessage(data);
      if (isOpen(socket)) {
        socket.send(message);
        return;
      }

      if (socket.readyState === WebSocket.CONNECTING) {
        pendingClientMessages.push(message);
        if (pendingClientMessages.length > MAX_PENDING_CLIENT_MESSAGES) {
          pendingClientMessages.shift();
        }
      }
    }

    socket.onopen = () => {
      // Send capability token instead of raw node key. The daemon verifies
      // the token's signature, expiry, and route match before allowing access.
      socket.send(JSON.stringify({ event: 'auth', args: [capabilityToken] }));
      flushPendingClientMessages();
    };

    socket.onmessage = (msg) => sendIfOpen(ws, normalizeWsMessage(msg.data));

    socket.onerror = () => {
      sendIfOpen(ws, '\x1b[31;1mThis instance is unavailable!\x1b[0m');
    };

    socket.onclose = () => {
      pendingClientMessages.length = 0;
      if (!clientClosed && isOpen(ws)) {
        ws.close();
      }
    };

    ws.on('message', forwardToDaemon);
    ws.on('close', () => {
      clientClosed = true;
      pendingClientMessages.length = 0;
      if (socket.readyState === WebSocket.CONNECTING || isOpen(socket)) {
        socket.close();
      }
    });
  } catch (error) {
    logger.error('Error in console proxy:', error);
    sendSocketError(ws, 'Internal server error');
  }
}

const wsServerConsoleModule: Module = {
  info: {
    name: 'Server Console Module',
    description: 'This file is for the server console functionality.',
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

    router.ws(
      '/console/:id',
      isAuthenticatedForServerWS('id'),
      async (ws: WebSocket, req: Request) => {
        const userId = req.session?.user?.id;
        const subUser = req.subUser;
        if (subUser && !subUserHasPermission(subUser, 'console')) {
          ws.send(
            JSON.stringify({
              error: 'You do not have permission to access the console.',
            }),
          );
          ws.close();
          return;
        }
        if (!userId) {
          ws.send(JSON.stringify({ error: 'User not authenticated' }));
          ws.close();
          return;
        }
        await proxyConsole(
          ws,
          req,
          userId,
          async (addr, port, id) =>
            `${await wsScheme()}://${addr}:${port}/container/${id}`,
          'interactive',
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
          ws,
          req,
          userId,
          async (addr, port, id) =>
            `${await wsScheme()}://${addr}:${port}/containerstatus/${id}`,
          'readonly',
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
          ws,
          req,
          userId,
          async (addr, port, id) =>
            `${await wsScheme()}://${addr}:${port}/containerevents/${id}`,
          'readonly',
        );
      },
    );

    return router;
  },
};

export default wsServerConsoleModule;
