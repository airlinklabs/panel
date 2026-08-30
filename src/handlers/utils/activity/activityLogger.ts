import type { Request } from "express";
import prisma from "../../../db";
import logger from "../../logger";
import { getRedisClient } from "../../redis";

export type ActivityEvent =
  | "server:create"
  | "server:update"
  | "server:delete"
  | "server:suspend"
  | "server:unsuspend"
  | "server:start"
  | "server:stop"
  | "server:kill"
  | "server:restart"
  | "server:transfer"
  | "server:reinstall"
  | "server:update-startup"
  | "file:create"
  | "file:delete"
  | "file:rename"
  | "file:edit"
  | "file:upload"
  | "file:download"
  | "file:pull"
  | "file:sftp-connect"
  | "file:sftp-disconnect"
  | "file:sftp-write"
  | "file:sftp-read"
  | "file:sftp-rename"
  | "file:sftp-delete"
  | "backup:create"
  | "backup:restore"
  | "backup:download"
  | "backup:delete"
  | "backup:lock"
  | "backup:unlock"
  | "subuser:create"
  | "subuser:update"
  | "subuser:delete"
  | "schedule:create"
  | "schedule:run"
  | "schedule:delete"
  | "database:create"
  | "database:delete"
  | "node:create"
  | "node:update"
  | "node:delete"
  | "node:delete-allocation"
  | "allocation:create"
  | "location:create"
  | "api:key"
  | "apikey:create"
  | "apikey:delete"
  | "user:create"
  | "user:delete"
  | "user:update"
  | "image:create"
  | "image:update"
  | "image:delete"
  | "image:submit"
  | "image:approve"
  | "image:reject"
  | "addon:toggle"
  | "addon:reload"
  | "addon:settings"
  | "addon:capability"
  | "addon:uninstall"
  | "addon:command";

// Per-user (or per-IP when unauthenticated) sliding-window rate limit so a
// single actor cannot flood the audit table. Dropping excess logs is a
// deliberate trade-off: audit stays useful and the write never blocks the
// action it records.
const ACTIVITY_WINDOW_MS = 60_000;
const ACTIVITY_MAX_PER_WINDOW = 120;
const RATE_LIMIT_KEY = "rl:activity";

export function resetActivityRateLimitForTests(): void {
  // No-op — Redis-backed, no local state to clear
}

export async function isActivityRateLimited(key: string): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const now = Date.now();
    const windowStart = now - ACTIVITY_WINDOW_MS;
    const fullKey = `${RATE_LIMIT_KEY}:${key}`;
    await redis.zremrangebyscore(fullKey, 0, windowStart);
    const count = await redis.zcard(fullKey);
    if (count >= ACTIVITY_MAX_PER_WINDOW) {
      return true;
    }
    const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;
    await redis.zadd(fullKey, now, member);
    await redis.expire(fullKey, Math.ceil(ACTIVITY_WINDOW_MS / 1000));
    return false;
  } catch {
    // Fail open — if Redis is down, allow logging through
    return false;
  }
}

export function activityRateLimitKey(req: Request): string {
  const id = req.session?.user?.id;
  if (id) {
    return `user:${id}`;
  }
  const ip = getClientIp(req);
  return ip ? `ip:${ip}` : "anon";
}

export function getClientIp(req: Request): string | undefined {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0]?.trim();
  }
  return req.socket?.remoteAddress;
}

export interface LogActivityOpts {
  serverId?: string | null;
  metadata?: Record<string, unknown>;
  category?: string;
  severity?: string;
  targetId?: number;
  targetType?: string;
}

export async function logActivity(
  req: Request,
  event: ActivityEvent | string,
  opts: LogActivityOpts = {},
): Promise<void> {
  try {
    if (await isActivityRateLimited(activityRateLimitKey(req))) {
      return;
    }
    await prisma.activityLog.create({
      data: {
        actorId: req.session?.user?.id ?? null,
        serverId: opts.serverId ?? null,
        event,
        category: opts.category ?? "user_action",
        severity: opts.severity ?? "info",
        metadata: opts.metadata ? JSON.stringify(opts.metadata) : null,
        ip: getClientIp(req),
      },
    });
  } catch (error) {
    // audit logging must never break the action it records
    logger.error("[audit] failed to write activity log", error);
  }
}
