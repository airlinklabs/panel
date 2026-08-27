import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import prisma from '../../db';
import { daemonScheme } from '../utils/core/daemonRequest';
import { getSessionStore } from '../sessionStore';
import { hasPermission } from '../permissions';
import crypto from 'crypto';
import logger from '../logger';

function getSessionIdFromCookieHeader(header: string): string | null {
  const match = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('connect.sid='));
  if (!match) return null;

  let raw: string;
  try {
    raw = decodeURIComponent(match.slice('connect.sid='.length));
  } catch {
    return null;
  }

  const signed = raw.startsWith('s:') ? raw.slice(2) : raw;
  const dot = signed.lastIndexOf('.');
  if (dot <= 0 || dot === signed.length - 1) return null;

  const sid = signed.slice(0, dot);
  const signature = signed.slice(dot + 1);
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(sid)
    .digest('base64')
    .replace(/=+$/, '');
  const provided = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (provided.length !== expectedBuf.length || !crypto.timingSafeEqual(provided, expectedBuf)) {
    return null;
  }
  return sid;
}

async function loadAuthenticatedUser(req: import('http').IncomingMessage) {
  const sid = getSessionIdFromCookieHeader(req.headers.cookie ?? '');
  if (!sid) return null;

  const session = await new Promise<import('express-session').SessionData | undefined>((resolve, reject) => {
    getSessionStore().get(sid, (err, value) => (err ? reject(err) : resolve(value)));
  });
  const userId = session?.user?.id;
  if (!userId) return null;

  return prisma.users.findUnique({
    where: { id: userId },
    select: { id: true, isAdmin: true, permissions: true },
  });
}

function canViewNode(user: { isAdmin: boolean; permissions: string | null }): boolean {
  if (!user.isAdmin) return false;

  let permissions: string[];
  try {
    permissions = JSON.parse(user.permissions ?? '[]');
  } catch {
    return false;
  }

  return hasPermission(permissions as never, 'airlink.admin.nodes.view');
}

export function attachNodeStatsWs(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const match = url.pathname.match(/^\/ws\/node\/(\d+)\/stats$/);
    if (!match) return;

    const nodeId = Number(match[1]);
    if (!Number.isSafeInteger(nodeId) || nodeId <= 0) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    void (async () => {
      try {
        const user = await loadAuthenticatedUser(req);
        if (!user) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        if (!canViewNode(user)) {
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          socket.destroy();
          return;
        }

        const node = await prisma.node.findUnique({ where: { id: nodeId } });
        if (!node) {
          socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
          socket.destroy();
          return;
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
          (ws as any)._nodeId = nodeId;
          wss.emit('connection', ws, req);
        });
      } catch (err) {
        logger.warn('node stats websocket authorization failed', err as Record<string, unknown>);
        socket.destroy();
      }
    })();
  });

  wss.on('connection', async (ws: WebSocket, _req) => {
    const nodeId = (ws as any)._nodeId as number;

    const node = await prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) {
      ws.close(1008, 'node not found');
      return;
    }

    const scheme = await daemonScheme();
    const wsUrl = `${scheme === 'https' ? 'wss' : 'ws'}://${node.address}:${node.port}/nodestats`;

    let daemonWs: WebSocket;
    try {
      daemonWs = new WebSocket(wsUrl);
    } catch (err) {
      logger.warn(`nodestats ws connect failed for node ${nodeId}`, err as Record<string, unknown>);
      ws.close(1011, 'could not connect to daemon');
      return;
    }

    let authed = false;

    daemonWs.on('open', () => {
      daemonWs.send(JSON.stringify({ event: 'auth', args: [node.key] }));
    });

    daemonWs.on('message', (data) => {
      const msg = typeof data === 'string' ? data : data.toString();

      if (!authed) {
        try {
          const parsed = JSON.parse(msg);
          if (parsed.error) {
            logger.warn(`nodestats ws auth failed for node ${nodeId}: ${parsed.error}`);
            ws.close(1008, 'daemon auth failed');
            daemonWs.close();
            return;
          }
        } catch {
          // Ignore non-JSON messages until daemon authentication succeeds.
        }
        authed = true;
      }

      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    });

    daemonWs.on('error', (err) => {
      logger.warn(`nodestats ws error for node ${nodeId}: ${err.message}`);
      if (ws.readyState === WebSocket.OPEN) ws.close(1011, 'daemon connection error');
    });

    daemonWs.on('close', (code, reason) => {
      logger.info(`nodestats ws closed for node ${nodeId}: ${code} ${reason}`);
      if (ws.readyState === WebSocket.OPEN) ws.close(1000, 'daemon disconnected');
    });

    ws.on('close', () => {
      if (daemonWs.readyState === WebSocket.OPEN || daemonWs.readyState === WebSocket.CONNECTING) {
        daemonWs.close();
      }
    });

    ws.on('error', () => {
      if (daemonWs.readyState === WebSocket.OPEN || daemonWs.readyState === WebSocket.CONNECTING) {
        daemonWs.close();
      }
    });
  });

  logger.info('node stats ws proxy attached');
}
