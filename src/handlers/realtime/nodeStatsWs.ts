import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import prisma from '../../db';
import { getSessionStore } from '../sessionStore';
import { daemonScheme } from '../utils/core/daemonRequest';
import logger from '../logger';

/**
 * Parses the raw signed session ID from a connect.sid cookie value.
 * Express-session signs cookies as `s:<sid>.<signature>`; we strip the
 * signature and return the bare session ID for store lookup.
 */
function parseSignedSid(raw: string): string | null {
  if (!raw || typeof raw !== 'string') {
    return null;
  }
  // Signed cookie: s:<sid>.<sig>  — strip the leading "s:" and everything after the last dot.
  const bare = raw.startsWith('s:') ? raw.slice(2) : raw;
  const lastDot = bare.lastIndexOf('.');
  return lastDot > 0 ? bare.slice(0, lastDot) : bare;
}

export function attachNodeStatsWs(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const match = url.pathname.match(/^\/ws\/node\/(\d+)\/stats$/);
    if (!match) {
      return;
    }

    const nodeId = Number(match[1]);
    if (!nodeId || !Number.isFinite(nodeId)) {
      socket.destroy();
      return;
    }

    // ── Authentication: resolve session from the real session store ──────
    const cookie = req.headers.cookie ?? '';
    const sidMatch = cookie.match(/connect\.sid=([^;]+)/);
    if (!sidMatch) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const signedSid = parseSignedSid(sidMatch[1] ?? '');
    if (!signedSid) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const store = getSessionStore();
    store.get(signedSid, (err, sessionData) => {
      if (err || !sessionData?.user?.id) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      // Stash validated user ID on the request for downstream node auth.
      (req as any).__authedUserId = sessionData.user.id;
      (req as any).__authedIsAdmin = sessionData.user.isAdmin;

      wss.handleUpgrade(req, socket, head, (ws) => {
        (ws as any)._nodeId = nodeId;
        (ws as any).__authedUserId = (req as any).__authedUserId;
        (ws as any).__authedIsAdmin = (req as any).__authedIsAdmin;
        wss.emit('connection', ws, req);
      });
    });
  });

  wss.on('connection', async (ws: WebSocket, _req) => {
    const nodeId = (ws as any)._nodeId as number;
    const userId = (ws as any).__authedUserId as number;
    const isAdmin = (ws as any).__authedIsAdmin as boolean;

    // ── Authorization: verify user is allowed to view this node ─────────
    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user || user.lockedUntil) {
      ws.close(1008, 'account unavailable');
      return;
    }

    const node = await prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) {
      ws.close(1008, 'node not found');
      return;
    }

    // Non-admin users must be the node owner or a subuser with websocket.connect permission.
    if (!isAdmin) {
      const isNodeOwner = await prisma.server.findFirst({
        where: { nodeId: node.id, ownerId: userId },
        select: { UUID: true },
      });

      if (!isNodeOwner) {
        // Check if user has any subuser record on a server on this node with websocket.connect permission.
        const subUserOnNode = await prisma.subUser.findFirst({
          where: {
            userId,
            server: { nodeId: node.id },
          },
        });

        if (!subUserOnNode) {
          ws.close(1008, 'unauthorized');
          return;
        }
      }
    }

    const scheme = await daemonScheme();
    const wsUrl = `${scheme === 'https' ? 'wss' : 'ws'}://${node.address}:${node.port}/nodestats`;

    let daemonWs: WebSocket;
    try {
      daemonWs = new WebSocket(wsUrl);
    } catch (err) {
      logger.warn(
        `nodestats ws connect failed for node ${nodeId}`,
        err as Record<string, unknown>,
      );
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
            logger.warn(
              `nodestats ws auth failed for node ${nodeId}: ${parsed.error}`,
            );
            ws.close(1008, 'daemon auth failed');
            daemonWs.close();
            return;
          }
        } catch {}
        authed = true;
      }

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    });

    daemonWs.on('error', (err) => {
      logger.warn(`nodestats ws error for node ${nodeId}: ${err.message}`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1011, 'daemon connection error');
      }
    });

    daemonWs.on('close', (code, reason) => {
      logger.info(`nodestats ws closed for node ${nodeId}: ${code} ${reason}`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'daemon disconnected');
      }
    });

    ws.on('close', () => {
      if (
        daemonWs.readyState === WebSocket.OPEN ||
        daemonWs.readyState === WebSocket.CONNECTING
      ) {
        daemonWs.close();
      }
    });

    ws.on('error', () => {
      if (
        daemonWs.readyState === WebSocket.OPEN ||
        daemonWs.readyState === WebSocket.CONNECTING
      ) {
        daemonWs.close();
      }
    });
  });

  logger.info('node stats ws proxy attached');
}
