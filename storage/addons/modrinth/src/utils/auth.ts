// ── Auth Utilities ──
// Shared helpers for authentication and authorization in route handlers.

import type { Request } from 'express';
import type { AddonApi, AddonUserData, AddonServerData } from '../types/panel';

/** Session user shape from the panel */
export interface SessionUser {
  id: number;
  email: string;
  username?: string | null;
  isAdmin?: boolean;
  avatar?: string | null;
  description?: string | null;
}

/**
 * Resolve the current user from the session.
 * Returns null if not authenticated.
 */
export async function resolveUser(
  api: AddonApi,
  req: Request
): Promise<AddonUserData | null> {
  const sessionUser = (req.session as any)?.user as SessionUser | undefined;
  if (!sessionUser?.id) return null;

  try {
    return await api.prisma.users.findUnique({
      where: { id: sessionUser.id },
    });
  } catch {
    return null;
  }
}

/**
 * Check if the current user owns the given server.
 */
export function isServerOwner(
  server: AddonServerData,
  userId: number
): boolean {
  return server.ownerId === userId;
}

/**
 * Get the user ID from the session, or throw if not authenticated.
 */
export function requireSessionUser(req: Request): SessionUser {
  const user = (req.session as any)?.user as SessionUser | undefined;
  if (!user?.id) {
    throw new Error('Not authenticated');
  }
  return user;
}

/**
 * Parse the JSON Ports string from a server into a typed array.
 * Returns empty array on parse failure.
 */
export function parseServerPorts(portsJson: string): Array<{ port: number; primary?: boolean }> {
  try {
    return JSON.parse(portsJson);
  } catch {
    return [];
  }
}

/**
 * Find the primary port for a server.
 */
export function findPrimaryPort(portsJson: string): { port: number; primary?: boolean } | null {
  const ports = parseServerPorts(portsJson);
  return ports.find(p => p.primary === true) ?? ports[0] ?? null;
}
