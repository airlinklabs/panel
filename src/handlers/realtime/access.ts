import prisma from '../../db';
import logger from '../logger';

// ── Realtime membership cache ─────────────────────────────────────────────────
// Real-time event delivery must honour authorization: a socket may only
// receive events for servers it can actually access. Rather than querying the
// database for every event (one event may fan out to many sockets), each
// session resolves the set of server ids it may observe and caches it. The
// cache is short-lived so new servers / permission grants show up within the
// TTL, and it is invalidated eagerly when a membership-affecting event type
// (server.created/deleted/updated, user.updated) arrives.

const SERVER_SET_TTL_MS = 45_000;

interface CachedMembership {
  serverIds: Set<string>;
  fetchedAt: number;
}

const membershipCache = new Map<number, CachedMembership>();

// Event types that change which servers a user may observe.
export const MEMBERSHIP_EVENT_TYPES = new Set([
  'server.created',
  'server.deleted',
  'server.updated',
  'user.updated',
  'admin.subuser.updated',
  'subuser.created',
  'subuser.deleted',
  'admin.servers.updated',
  'account.suspended',
]);

export function invalidateMembershipForUser(userId: number): void {
  membershipCache.delete(userId);
}

export function invalidateMembershipForEvents(eventTypes: string | string[]): void {
  const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
  if (types.some((t) => MEMBERSHIP_EVENT_TYPES.has(t))) {
    membershipCache.clear();
  }
}

/**
 * Server ids the user may observe (owned + subuser). Resolves from cache when
 * fresh, otherwise queries the database exactly once.
 */
export async function getUserServerIds(
  userId: number,
  isAdmin: boolean,
): Promise<Set<string> | 'all'> {
  if (isAdmin) return 'all';

  const cached = membershipCache.get(userId);
  if (cached && Date.now() - cached.fetchedAt < SERVER_SET_TTL_MS) {
    return cached.serverIds;
  }

  try {
    const [owned, subUserServers] = await Promise.all([
      prisma.server.findMany({
        where: { ownerId: userId },
        select: { UUID: true },
      }),
      prisma.subUser.findMany({
        where: { userId },
        select: { serverId: true },
      }),
    ]);
    const set = new Set<string>([
      ...owned.map((s) => s.UUID),
      ...subUserServers.map((s) => s.serverId),
    ]);
    membershipCache.set(userId, { serverIds: set, fetchedAt: Date.now() });
    return set;
  } catch (error) {
    logger.warn(`Failed to resolve realtime membership for user ${userId}:`, { error: String(error) });
    return new Set<string>();
  }
}

/**
 * Whether this user may observe events scoped for the given entity type/id.
 */
export async function canObserve(
  userId: number,
  serverIds: Set<string> | 'all',
  scope: {
    serverId?: string;
    userId?: number;
    admin?: boolean;
  },
): Promise<boolean> {
  if (scope.serverId) {
    if (serverIds === 'all') return true;
    return serverIds.has(scope.serverId);
  }
  if (scope.userId !== undefined) {
    return scope.userId === userId;
  }
  if (scope.admin) {
    return serverIds === 'all';
  }
  // Unscoped events (system announcements, etc.) reach everyone.
  return true;
}