import { Request } from 'express';
import prisma from '../../../db';
import logger from '../../logger';

export type ActivityEvent =
  | 'server:create'
  | 'server:update'
  | 'server:delete'
  | 'server:suspend'
  | 'server:unsuspend'
  | 'server:start'
  | 'server:stop'
  | 'server:kill'
  | 'server:restart'
  | 'server:transfer'
  | 'server:reinstall'
  | 'server:update-startup'
  | 'file:create'
  | 'file:delete'
  | 'file:rename'
  | 'file:edit'
  | 'file:upload'
  | 'file:pull'
  | 'file:sftp-connect'
  | 'file:sftp-disconnect'
  | 'file:sftp-write'
  | 'file:sftp-read'
  | 'file:sftp-rename'
  | 'file:sftp-delete'
  | 'backup:create'
  | 'backup:restore'
  | 'backup:delete'
  | 'backup:lock'
  | 'backup:unlock'
  | 'subuser:create'
  | 'subuser:update'
  | 'subuser:delete'
  | 'schedule:create'
  | 'schedule:run'
  | 'schedule:delete'
  | 'database:create'
  | 'database:delete'
  | 'node:create'
  | 'node:update'
  | 'node:delete'
  | 'node:delete-allocation'
  | 'allocation:create'
  | 'location:create'
  | 'api:key'
  | 'apikey:create'
  | 'apikey:delete'
  | 'user:create'
  | 'user:delete'
  | 'user:update'
  | 'image:create'
  | 'image:update'
  | 'image:delete';

// Per-user (or per-IP when unauthenticated) sliding-window rate limit so a
// single actor cannot flood the audit table. Dropping excess logs is a
// deliberate trade-off: audit stays useful and the write never blocks the
// action it records.
const ACTIVITY_WINDOW_MS = 60_000;
const ACTIVITY_MAX_PER_WINDOW = 120;
const buckets = new Map<string, number[]>();

export function resetActivityRateLimitForTests(): void {
  buckets.clear();
}

export function isActivityRateLimited(key: string): boolean {
  const now = Date.now();
  const cutoff = now - ACTIVITY_WINDOW_MS;
  const times = buckets.get(key)?.filter((t) => t > cutoff) ?? [];
  if (times.length >= ACTIVITY_MAX_PER_WINDOW) {
    buckets.set(key, times);
    return true;
  }
  times.push(now);
  buckets.set(key, times);
  return false;
}

export function activityRateLimitKey(req: Request): string {
  const id = req.session?.user?.id;
  if (id) {
    return `user:${id}`;
  }
  const ip = getClientIp(req);
  return ip ? `ip:${ip}` : 'anon';
}

export function getClientIp(req: Request): string | undefined {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0]?.trim();
  return req.socket?.remoteAddress;
}

export async function logActivity(
  req: Request,
  event: ActivityEvent,
  opts: { serverId?: string | null; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    if (isActivityRateLimited(activityRateLimitKey(req))) {
      return;
    }
    await prisma.activityLog.create({
      data: {
        actorId: req.session?.user?.id ?? null,
        serverId: opts.serverId ?? null,
        event,
        metadata: opts.metadata ? JSON.stringify(opts.metadata) : null,
        ip: getClientIp(req),
      },
    });
  } catch (error) {
    // audit logging must never break the action it records
    logger.error('[audit] failed to write activity log', error);
  }
}
