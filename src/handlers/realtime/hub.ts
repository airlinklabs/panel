import type { WebSocket } from 'ws';
import logger from '../logger';
import {
  getUserServerIds,
  invalidateMembershipForEvents,
  MEMBERSHIP_EVENT_TYPES,
} from './access';
import {
  type RealtimeEventEnvelope,
  currentRealtimeCursor,
  emitRealtime,
  subscribeToRealtime,
  syncEventsForClient,
} from './events';

// ── Realtime session hub ──────────────────────────────────────────────────────
// Owns every authenticated realtime socket. Each session registers an allowed
// view (owned + subuser server ids, or everything for admins) and a sender.
// Every event published on the bus is fanned out to sessions whose view covers
// it — the server, never the client, decides who may receive a state change.

export interface RealtimeSession {
  id: string;
  userId: number;
  isAdmin: boolean;
  serverIds: Set<string> | 'all';
  ws: WebSocket;
  alive: boolean;
  lastSeenSeq: number;
  createdAt: number;
}

export const realtimeSessions = new Map<string, RealtimeSession>();

let busSubscribed = false;

function ensureBusListener(): void {
  if (busSubscribed) {
    return;
  }
  busSubscribed = true;
  subscribeToRealtime((event) => {
    // Fire-and-forget: delivery is independent of the bus call stack.
    void fanOut(event);
  });
}

async function fanOut(event: RealtimeEventEnvelope): Promise<void> {
  if (realtimeSessions.size === 0) {
    return;
  }
  invalidateMembershipForEvents(event.type);
  // Membership-affecting events (server.created/deleted, subuser.*, …) change
  // which servers a user may observe. Sessions cached their serverIds at
  // connect time, so re-resolve them now — without waiting for the TTL — or
  // the affected user keeps the stale set (new servers invisible, deleted
  // servers still delivered) until they reconnect.
  if (MEMBERSHIP_EVENT_TYPES.has(event.type)) {
    for (const session of realtimeSessions.values()) {
      if (session.alive && !session.isAdmin) {
        getUserServerIds(session.userId, false)
          .then((ids) => {
            session.serverIds = ids;
          })
          .catch(() => {
            /* keep the previous set on failure */
          });
      }
    }
  }
  await Promise.allSettled(
    Array.from(realtimeSessions.values()).map(async (session) => {
      if (!session.alive) {
        return;
      }
      if (!shouldReceiveSession(session, event)) {
        return;
      }
      if (session.ws.readyState !== 1) {
        return;
      }
      try {
        session.ws.send(JSON.stringify(event));
      } catch (error) {
        logger.warn('[realtime] send failed, dropping socket', {
          error: String(error),
        });
        try {
          session.ws.close();
        } catch {
          /* already closed */
        }
        session.alive = false;
        realtimeSessions.delete(session.id);
      }
    }),
  );
}

/** Authorization predicate for a session against an event. */
export function shouldReceiveEvent(
  session: {
    isAdmin: boolean;
    serverIds: Set<string> | 'all';
    userId?: number;
  },
  event: RealtimeEventEnvelope,
): boolean {
  const scope = event.scope ?? {};
  if (scope.serverId !== undefined) {
    if (session.serverIds === 'all') {
      return true;
    }
    return session.serverIds.has(scope.serverId);
  }
  if (scope.userId !== undefined) {
    return session.userId === scope.userId;
  }
  if (scope.admin !== undefined && scope.admin) {
    return session.isAdmin;
  }
  return true;
}

function shouldReceiveSession(
  session: RealtimeSession,
  event: RealtimeEventEnvelope,
): boolean {
  return shouldReceiveEvent(session, event);
}

/**
 * Register a new realtime socket. Sends the `realtime.ready` handshake.
 */
export async function registerRealtimeSession(
  id: string,
  userId: number,
  isAdmin: boolean,
  serverIds: Promise<Set<string> | 'all'>,
  ws: WebSocket,
): Promise<RealtimeSession> {
  ensureBusListener();
  const resolved = await serverIds;
  const session: RealtimeSession = {
    id,
    userId,
    isAdmin,
    serverIds: resolved,
    ws,
    alive: true,
    lastSeenSeq: 0,
    createdAt: Date.now(),
  };
  realtimeSessions.set(id, session);

  if (ws.readyState === 1) {
    ws.send(
      JSON.stringify({
        type: 'realtime.ready',
        version: 1,
        seq: currentRealtimeCursor(),
        timestamp: Date.now(),
        scope: {},
      }),
    );
  }
  return session;
}

/** A socket asked to resynchronise after a reconnect. */
export async function resynchronizeSession(
  id: string,
  sinceSeq: number | null,
): Promise<void> {
  const session = realtimeSessions.get(id);
  if (!session) {
    return;
  }
  const { cursor, events } = syncEventsForClient(sinceSeq);
  session.lastSeenSeq = cursor;

  for (const event of events) {
    if (!shouldReceiveSession(session, event)) {
      continue;
    }
    if (session.ws.readyState !== 1) {
      return;
    }
    try {
      session.ws.send(JSON.stringify(event));
    } catch (error) {
      logger.warn('[realtime] resync send failed, dropping session', {
        error: String(error),
      });
      session.ws.close();
      dropRealtimeSession(id);
      return;
    }
  }

  session.ws.send(
    JSON.stringify({
      type: 'realtime.synced',
      version: 1,
      seq: cursor,
      timestamp: Date.now(),
      scope: {},
    }),
  );
}

/** Remove a session on disconnect. */
export function dropRealtimeSession(id: string): void {
  const session = realtimeSessions.get(id);
  if (session) {
    session.alive = false;
    realtimeSessions.delete(id);
  }
}

/** Publish an event onto the bus (convenience for producers). */
export function broadcastEvent(
  event: Parameters<typeof emitRealtime>[0],
): void {
  emitRealtime(event);
}

/** Introspection for debug/admin tools. */
export function listRealtimeSessions(): RealtimeSession[] {
  return Array.from(realtimeSessions.values());
}
