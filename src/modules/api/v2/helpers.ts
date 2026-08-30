/**
 * V2 API — shared helpers.
 *
 * Standardised response envelope, pagination, auth resolution, and error
 * formatting used by every V2 endpoint file.
 */

import type { Request, Response } from "express";
import prisma from "../../../db";
import logger from "../../../handlers/logger";
import {
  subUserHasPermission as _subUserHasPermission,
  parsePermissions as _parsePermissions,
} from "../../../handlers/utils/auth/authorization";

// Infer types from the Prisma client instance
type Users = Awaited<ReturnType<typeof prisma.users.findUnique>> &
  Record<string, unknown>;
type Server = Awaited<ReturnType<typeof prisma.server.findUnique>> &
  Record<string, unknown>;
type SubUser = Awaited<ReturnType<typeof prisma.subUser.findUnique>> &
  Record<string, unknown>;

// ---------------------------------------------------------------------------
// Response envelope
// ---------------------------------------------------------------------------

export interface V2SuccessResponse<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface V2ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: { field: string; message: string }[];
  };
}

export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

/** Send a success response with the standard envelope. */
export function jsonOk<T>(res: Response, data: T, meta?: PaginationMeta): void {
  const body: V2SuccessResponse<T> = { success: true, data };
  if (meta) {
    body.meta = meta;
  }
  res.json(body);
}

/** Send an error response with the standard envelope. */
export function jsonError(
  res: Response,
  code: string,
  message: string,
  status = 400,
  details?: { field: string; message: string }[],
): void {
  const body: V2ErrorResponse = { success: false, error: { code, message } };
  if (details) {
    body.error.details = details;
  }
  res.status(status).json(body);
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export function paginate<T>(
  items: T[],
  page: number,
  perPage: number,
): { data: T[]; meta: PaginationMeta } {
  const total = items.length;
  const totalPages = Math.ceil(total / perPage);
  const safePage = Math.max(1, Math.min(page, totalPages || 1));
  const start = (safePage - 1) * perPage;
  return {
    data: items.slice(start, start + perPage),
    meta: { page: safePage, perPage, total, totalPages },
  };
}

export async function paginateQuery<T>(
  findManyFn: (args: { skip: number; take: number }) => Promise<T[]>,
  countFn: () => Promise<number>,
  page: number,
  perPage: number,
): Promise<{ data: T[]; meta: PaginationMeta }> {
  const total = await countFn();
  const totalPages = Math.ceil(total / perPage);
  const safePage = Math.max(1, Math.min(page, totalPages || 1));
  const data = await findManyFn({
    skip: (safePage - 1) * perPage,
    take: perPage,
  });
  return { data, meta: { page: safePage, perPage, total, totalPages } };
}

export function parsePage(query: unknown): number {
  const raw = typeof query === "string" ? parseInt(query, 10) : 1;
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

export function parsePerPage(query: unknown, defaultVal = 25): number {
  const raw = typeof query === "string" ? parseInt(query, 10) : defaultVal;
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 100) : defaultVal;
}

// ---------------------------------------------------------------------------
// Auth resolution
// ---------------------------------------------------------------------------

/** Get the session user ID from the request (set by isAuthenticated middleware). */
export function getSessionUserId(req: Request): number | undefined {
  // express-session types are available via the module augmentation in
  // express.d.ts, but req.session requires a narrow cast since Express's
  // Request type doesn't expose it directly without the session import.
  try {
    // Access through the Express app's session middleware — the session
    // object is always present when isAuthenticated middleware runs.
    const session = req["session"] as { user?: { id?: number } } | undefined;
    return session?.user?.id;
  } catch {
    return undefined;
  }
}

/** Get the API key user ID from the request (set by apiValidator middleware). */
export function getApiKeyUserId(req: Request): number | undefined {
  return req.apiKey?.userId as number | undefined;
}

/** Resolve the authenticated user ID from either session or API key. */
export function getAuthenticatedUserId(req: Request): number | undefined {
  return getSessionUserId(req) ?? getApiKeyUserId(req);
}

/** Get the daemon protocol based on the app environment. */
export function getAppProtocol(req: Request): string {
  return req.app?.get("env") === "production" ? "https" : "http";
}

// ---------------------------------------------------------------------------
// API-key capability constants
// ---------------------------------------------------------------------------

/**
 * Well-known capabilities for API-key scope enforcement.
 * API keys declare a subset of these; session users bypass the check.
 * Wildcard forms (e.g. "servers.*") grant all sub-capabilities.
 */
export const ApiCapabilities = {
  SERVERS_READ: "servers.read",
  SERVERS_WRITE: "servers.write",
  SERVERS_ALL: "servers.*",
  FILES_READ: "files.read",
  FILES_WRITE: "files.write",
  FILES_ALL: "files.*",
  DATABASES_READ: "databases.read",
  DATABASES_WRITE: "databases.write",
  DATABASES_ALL: "databases.*",
  BACKUPS_READ: "backups.read",
  BACKUPS_WRITE: "backups.write",
  BACKUPS_ALL: "backups.*",
  SCHEDULES_READ: "schedules.read",
  SCHEDULES_WRITE: "schedules.write",
  SCHEDULES_ALL: "schedules.*",
  SUBUSERS_READ: "subusers.read",
  SUBUSERS_WRITE: "subusers.write",
  SUBUSERS_ALL: "subusers.*",
  STARTUP_READ: "startup.read",
  STARTUP_WRITE: "startup.write",
  STARTUP_ALL: "startup.*",
  ACCOUNT_READ: "account.read",
  ACCOUNT_WRITE: "account.write",
  ADMIN: "admin.*",
} as const;

export type ApiCapability =
  (typeof ApiCapabilities)[keyof typeof ApiCapabilities];

/** Resolve the authenticated user or send 401. Returns null if not authenticated. */
export async function requireUser(
  req: Request,
  res: Response,
): Promise<Users | null> {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    jsonError(res, "UNAUTHORIZED", "Authentication required", 401);
    return null;
  }
  const user = await prisma.users.findUnique({ where: { id: userId } });
  if (!user) {
    jsonError(res, "UNAUTHORIZED", "User not found", 401);
    return null;
  }
  return user;
}

/** Require admin role. Returns null and sends error if not admin. */
export async function requireAdmin(
  req: Request,
  res: Response,
): Promise<Users | null> {
  const user = await requireUser(req, res);
  if (!user) {
    return null;
  }
  if (!user.isAdmin) {
    jsonError(res, "FORBIDDEN", "Admin access required", 403);
    return null;
  }
  return user;
}

// ---------------------------------------------------------------------------
// Server resolution with ownership / subuser check
// ---------------------------------------------------------------------------

export interface ResolvedServer {
  server: Server;
  isOwner: boolean;
  subUser: SubUser | null;
}

/**
 * Resolve a server by UUID and verify the authenticated user has access.
 * Returns null and sends error if not found or unauthorized.
 */
export async function resolveServer(
  req: Request,
  res: Response,
  serverIdParam = "id",
): Promise<ResolvedServer | null> {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    jsonError(res, "UNAUTHORIZED", "Authentication required", 401);
    return null;
  }

  const serverUUID = String(req.params[serverIdParam] ?? "");
  if (!serverUUID) {
    jsonError(res, "BAD_REQUEST", "Server ID is required", 400);
    return null;
  }

  const server = await prisma.server.findUnique({
    where: { UUID: serverUUID },
  });
  if (!server) {
    jsonError(res, "NOT_FOUND", "Server not found", 404);
    return null;
  }

  // Admin bypasses ownership check
  const user = await prisma.users.findUnique({ where: { id: userId } });
  if (user?.isAdmin) {
    return { server, isOwner: false, subUser: null };
  }

  // Owner check
  if (server.ownerId === userId) {
    return { server, isOwner: true, subUser: null };
  }

  // Subuser check
  const subUser = await prisma.subUser.findUnique({
    where: { serverId_userId: { serverId: server.UUID, userId } },
  });
  if (!subUser) {
    jsonError(res, "FORBIDDEN", "You do not have access to this server", 403);
    return null;
  }

  return { server, isOwner: false, subUser };
}

/** Check if a resolved server is suspended. Sends error and returns true if so. */
export function checkSuspended(
  res: Response,
  resolved: ResolvedServer,
): boolean {
  if (resolved.server.Suspended) {
    jsonError(res, "FORBIDDEN", "Server is suspended", 403);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// SubUser permission check
// ---------------------------------------------------------------------------

export type SubUserPermission =
  | "console"
  | "console.send"
  | "files"
  | "files.read"
  | "files.write"
  | "backups"
  | "backups.create"
  | "backups.delete"
  | "schedule.read"
  | "schedule.create"
  | "schedule.delete"
  | "databases"
  | "databases.create"
  | "databases.delete"
  | "start"
  | "stop"
  | "restart"
  | "kill"
  | "reinstall"
  | "websocket.connect";

/** Parse the permissions JSON string from a SubUser record. */
export const parsePermissions = _parsePermissions;

/** Check if a subuser has a specific permission (supports wildcard `.*` and parent groups). */
export const subUserHasPermission = _subUserHasPermission;

/**
 * Require a specific subuser permission. Sends 403 and returns false if denied.
 * Owner always passes. Returns true if allowed.
 */
export function requireSubUserPermission(
  res: Response,
  resolved: ResolvedServer,
  permission: SubUserPermission,
): boolean {
  if (resolved.isOwner) {
    return true;
  }
  if (resolved.subUser && subUserHasPermission(resolved.subUser, permission)) {
    return true;
  }
  jsonError(res, "FORBIDDEN", `Missing permission: ${permission}`, 403);
  return false;
}

// ---------------------------------------------------------------------------
// Activity logging (non-blocking)
// ---------------------------------------------------------------------------

export async function logActivity(
  actorId: number | undefined,
  event: string,
  serverId?: string,
  metadata?: Record<string, unknown>,
  ip?: string,
): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        actorId: actorId ?? null,
        serverId: serverId ?? null,
        event,
        metadata: metadata ? JSON.stringify(metadata) : null,
        ip: ip ?? null,
      },
    });
  } catch (err) {
    logger.error("Failed to log activity:", err);
  }
}
