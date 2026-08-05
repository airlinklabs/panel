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
  | 'schedule:run'
  | 'database:create'
  | 'database:delete'
  | 'node:create'
  | 'node:update'
  | 'node:delete'
  | 'api:key'
  | 'apikey:create'
  | 'apikey:delete'
  | 'user:create'
  | 'user:delete'
  | 'user:update'
  | 'image:create'
  | 'image:update'
  | 'image:delete';

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
