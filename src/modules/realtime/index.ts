import { Router, type Request } from 'express';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import type { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import logger from '../../handlers/logger';
import { getUserServerIds } from '../../handlers/realtime/access';
import {
  dropRealtimeSession,
  realtimeSessions,
  registerRealtimeSession,
  resynchronizeSession,
  type RealtimeSession,
} from '../../handlers/realtime/hub';
import {
  watchServerStatus,
  type WatchHandle,
} from '../../handlers/realtime/serverStatusWatcher';
import {
  watchServerEvents,
  type WatchHandle as EventWatchHandle,
} from '../../handlers/realtime/serverEventWatcher';

const HEARTBEAT_INTERVAL_MS = 20_000;
const HEARTBEAT_TIMEOUT_MS = 12_000;

/** Realtime socket with the pending heartbeat timeout attached. */
interface RealtimeWS extends WebSocket {
  __pongTimer?: NodeJS.Timeout;
}

// ── Watch registry ────────────────────────────────────────────────────────────
// Sessions may ask the server to stream a server's daemon status/stats and/or
// lifecycle events onto the bus. The daemon connections are shared (watchers
// refcount by serverId); these maps track which session watches what so
// closing a socket releases only its own watch.

const sessionWatches = new Map<string, Map<string, WatchHandle>>();
const sessionEventWatches = new Map<string, Map<string, EventWatchHandle>>();

function releaseSessionWatches(sessionId: string): void {
  const handles = sessionWatches.get(sessionId);
  if (handles) {
    for (const handle of handles.values()) {
      try {
        handle.release();
      } catch {
        /* already released */
      }
    }
    sessionWatches.delete(sessionId);
  }
  const eventHandles = sessionEventWatches.get(sessionId);
  if (eventHandles) {
    for (const handle of eventHandles.values()) {
      try {
        handle.release();
      } catch {
        /* already released */
      }
    }
    sessionEventWatches.delete(sessionId);
  }
}

async function getNode(serverId: string): Promise<{ address: string; port: number; key: string } | null> {
  try {
    const server = await prisma.server.findUnique({
      where: { UUID: serverId },
      select: { node: { select: { address: true, port: true, key: true } } },
    });
    return server?.node ?? null;
  } catch (error) {
    logger.warn(`Failed to resolve node for ${serverId}:`, { error: String(error) });
    return null;
  }
}

function sessionCanSee(session: RealtimeSession | undefined, serverId: string): boolean {
  if (!session) return false;
  if (session.serverIds === 'all') return true;
  return session.serverIds.has(serverId);
}

async function beginWatch(session: RealtimeSession, serverId: string): Promise<void> {
  let handles = sessionWatches.get(session.id);
  if (!handles) {
    handles = new Map();
    sessionWatches.set(session.id, handles);
  }
  if (handles.has(serverId)) return;

  const node = await getNode(serverId);
  if (!node) return;
  const handle = watchServerStatus(serverId, node);
  handles.set(serverId, handle);
}

async function endWatch(session: RealtimeSession, serverId: string): Promise<void> {
  const handles = sessionWatches.get(session.id);
  const handle = handles?.get(serverId);
  if (!handle) return;
  try {
    handle.release();
  } catch {
    /* already released */
  }
  handles?.delete(serverId);
}

async function beginEventWatch(session: RealtimeSession, serverId: string): Promise<void> {
  let handles = sessionEventWatches.get(session.id);
  if (!handles) {
    handles = new Map();
    sessionEventWatches.set(session.id, handles);
  }
  if (handles.has(serverId)) return;

  const node = await getNode(serverId);
  if (!node) return;
  const handle = watchServerEvents(serverId, node);
  handles.set(serverId, handle);
}

async function endEventWatch(session: RealtimeSession, serverId: string): Promise<void> {
  const handles = sessionEventWatches.get(session.id);
  const handle = handles?.get(serverId);
  if (!handle) return;
  try {
    handle.release();
  } catch {
    /* already released */
  }
  handles?.delete(serverId);
}

// ── /ws/realtime ──────────────────────────────────────────────────────────────
// The single browser real-time channel. Authenticated via the Express session
// cookie (no per-socket token needed). The server, not the client, decides
// which events each socket may receive (see hub.ts).

const realtimeModule: Module = {
  info: {
    name: 'Realtime Module',
    description: 'Real-time event stream for the panel UI.',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: (applyWs?: (router: Router) => void) => {
    const router = Router();
    if (applyWs) applyWs(router);

    router.ws('/ws/realtime', async (rawWs: WebSocket, req: Request) => {
      const ws = rawWs as RealtimeWS;
      const userId = req.session?.user?.id;
      if (!userId) {
        ws.close(4401, 'unauthenticated');
        return;
      }

      let user;
      try {
        user = await prisma.users.findUnique({ where: { id: userId } });
      } catch {
        ws.close(1011, 'internal error');
        return;
      }
      if (!user?.username) {
        ws.close(1008, 'invalid user');
        return;
      }

      const isAdmin = Boolean(user.isAdmin);
      const sessionId = randomUUID();

      try {
        await registerRealtimeSession(sessionId, userId, isAdmin, getUserServerIds(userId, isAdmin), ws);
      } catch (error) {
        logger.error('Failed to register realtime session:', error);
        ws.close(1011, 'internal error');
        return;
      }

      // Heartbeats detect half-open connections; a missed pong closes us.
      const heartbeat = setInterval(() => {
        if (ws.readyState !== 1) {
          clearInterval(heartbeat);
          return;
        }
        const timeout = setTimeout(() => {
          logger.debug(`realtime heartbeat timeout for session ${sessionId}`);
          dropRealtimeSession(sessionId);
          try {
            ws.close(4001, 'heartbeat timeout');
          } catch {
            /* already closed */
          }
        }, HEARTBEAT_TIMEOUT_MS);
        ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        // Remember the pending timeout on the socket for cancellation.
        ws.__pongTimer = timeout;
      }, HEARTBEAT_INTERVAL_MS);

      ws.on('message', async (raw) => {
        let msg: { type?: string; sinceSeq?: number | null; serverId?: string };
        try {
          msg = JSON.parse(String(raw));
        } catch {
          return;
        }
        if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;

        if (msg.type === 'pong') {
          const pending = ws.__pongTimer;
          if (pending) {
            clearTimeout(pending);
            ws.__pongTimer = undefined;
          }
          return;
        }

        if (msg.type === 'sync') {
          const sinceSeq =
            typeof msg.sinceSeq === 'number' && Number.isFinite(msg.sinceSeq) ? msg.sinceSeq : null;
          resynchronizeSession(sessionId, sinceSeq).catch((err) =>
            logger.warn('realtime resync failed:', { error: String(err) }),
          );
          return;
        }

        const session = realtimeSessions.get(sessionId);
        if (msg.type === 'watch' && typeof msg.serverId === 'string') {
          if (!session || !sessionCanSee(session, msg.serverId)) return;
          beginWatch(session, msg.serverId).catch((err) =>
            logger.warn(`realtime watch failed for ${msg.serverId}:`, { error: String(err) }),
          );
          return;
        }

        if (msg.type === 'unwatch' && typeof msg.serverId === 'string') {
          if (session) endWatch(session, msg.serverId).catch(() => undefined);
          return;
        }

        if (msg.type === 'watchEvents' && typeof msg.serverId === 'string') {
          if (!session || !sessionCanSee(session, msg.serverId)) return;
          beginEventWatch(session, msg.serverId).catch((err) =>
            logger.warn(`realtime watchEvents failed for ${msg.serverId}:`, { error: String(err) }),
          );
          return;
        }

        if (msg.type === 'unwatchEvents' && typeof msg.serverId === 'string') {
          if (session) endEventWatch(session, msg.serverId).catch(() => undefined);
          return;
        }

        if (msg.type === 'watchAll' && session && session.serverIds === 'all') {
          // Admin dashboards watch everything; server ids are resolved here so
          // a single message glues the session to all reachable servers.
          try {
            const servers = await prisma.server.findMany({ select: { UUID: true } });
            for (const s of servers) await beginWatch(session, s.UUID);
          } catch (error) {
            logger.warn('realtime watchAll failed:', { error: String(error) });
          }
        }
      });

      ws.on('close', () => {
        clearInterval(heartbeat);
        const pending = ws.__pongTimer;
        if (pending) clearTimeout(pending);
        releaseSessionWatches(sessionId);
        dropRealtimeSession(sessionId);
      });

      ws.on('error', () => {
        clearInterval(heartbeat);
        const pending = ws.__pongTimer;
        if (pending) clearTimeout(pending);
        releaseSessionWatches(sessionId);
        dropRealtimeSession(sessionId);
      });
    });

    return router;
  },
};

export default realtimeModule;

export { randomUUID };