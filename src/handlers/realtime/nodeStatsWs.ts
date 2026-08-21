import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import prisma from '../../db';
import { daemonScheme } from '../utils/core/daemonRequest';
import logger from '../logger';

export function attachNodeStatsWs(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const match = url.pathname.match(/^\/ws\/node\/(\d+)\/stats$/);
    if (!match) return;

    const nodeId = Number(match[1]);
    if (!nodeId || !Number.isFinite(nodeId)) {
      socket.destroy();
      return;
    }

    // Authenticate the browser — must have a valid session cookie
    const cookie = req.headers.cookie ?? '';
    const sidMatch = cookie.match(/connect\.sid=([^;]+)/);
    if (!sidMatch) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      (ws as any)._nodeId = nodeId;
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', async (ws: WebSocket, req) => {
    const nodeId = (ws as any)._nodeId as number;

    const node = await prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) {
      ws.close(1008, 'node not found');
      return;
    }

    const scheme = await daemonScheme();
    const daemonUrl = `${scheme}://${node.address}:${node.port}`;

    let daemonWs: WebSocket;
    try {
      daemonWs = new WebSocket(`${daemonUrl.replace('http', 'ws')}/nodestats`);
    } catch {
      ws.close(1011, 'could not connect to daemon');
      return;
    }

    daemonWs.on('open', () => {
      // Authenticate with daemon using raw key
      daemonWs.send(JSON.stringify({ event: 'auth', args: [node.key] }));
    });

    daemonWs.on('message', (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(typeof data === 'string' ? data : data.toString());
      }
    });

    daemonWs.on('error', (err) => {
      logger.warn(`nodestats ws error for node ${nodeId}`, err);
      if (ws.readyState === WebSocket.OPEN) ws.close(1011, 'daemon connection error');
    });

    daemonWs.on('close', () => {
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
