/**
 * Shared authorization logic — pure functions, no HTTP concerns.
 *
 * Used by:
 *   - V2 REST API (src/modules/api/v2/helpers.ts)
 *   - Client API (src/modules/api/client/clientApi.ts)
 *   - Server auth middleware (src/handlers/utils/auth/serverAuthUtil.ts)
 */

import prisma from "../../../db";
import { isRoleAdmin, hasPermission } from "./roles";

// ---------------------------------------------------------------------------
// Permission parsing
// ---------------------------------------------------------------------------

/** Parse a JSON permissions string into a string array. */
export function parsePermissions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((p): p is string => typeof p === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * Check if a sub-user has a specific permission.
 *
 * Matching rules (in order):
 *   1. Exact match: perm === permission
 *   2. Wildcard: perm ends with ".*" and permission starts with that prefix
 *   3. Parent group: perm equals the parent of permission (e.g. "files" grants "files.read")
 */
export function subUserHasPermission(
  subUser: { permissions: string | null | undefined },
  permission: string,
): boolean {
  const perms = parsePermissions(subUser.permissions);
  return hasPermission(perms, permission);
}

// ---------------------------------------------------------------------------
// Server access resolution
// ---------------------------------------------------------------------------

export interface ServerAccessResult {
  server: {
    id: number;
    UUID: string;
    name: string;
    ownerId: number;
    nodeId: number;
    Suspended: boolean;
    [key: string]: unknown;
  };
  isOwner: boolean;
  isAdmin: boolean;
  subUser: {
    id: number;
    serverId: string;
    userId: number;
    permissions: string;
    [key: string]: unknown;
  } | null;
}

/**
 * Resolve a server by UUID and determine the user's access level.
 * Returns null if server not found or user has no access.
 * Does NOT send HTTP responses — caller handles errors.
 */
export async function resolveServerAccess(
  serverUUID: string,
  userId: number,
): Promise<ServerAccessResult | null> {
  const server = await prisma.server.findUnique({
    where: { UUID: serverUUID },
  });
  if (!server) return null;

  // Admin bypasses ownership check
  const user = await prisma.users.findUnique({ where: { id: userId } });
  if (isRoleAdmin(user?.role)) {
    return { server, isOwner: false, isAdmin: true, subUser: null };
  }

  // Owner check
  if (server.ownerId === userId) {
    return { server, isOwner: true, isAdmin: false, subUser: null };
  }

  // Sub-user check
  const subUser = await prisma.subUser.findUnique({
    where: { serverId_userId: { serverId: server.UUID, userId } },
  });
  if (subUser) {
    return { server, isOwner: false, isAdmin: false, subUser };
  }

  return null;
}
