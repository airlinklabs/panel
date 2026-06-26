import prisma from '../db';
import logger from './logger';

interface LogActivityData {
  userId: number;
  serverId?: string;
  action: string;
  detail?: string;
  ip?: string;
}

interface ActivityLogFilters {
  userId?: number;
  serverId?: string;
  limit?: number;
  offset?: number;
}

export async function logActivity(data: LogActivityData): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        userId: data.userId,
        serverId: data.serverId ?? null,
        action: data.action,
        detail: data.detail ?? null,
        ip: data.ip ?? null,
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      logger.error('Failed to log activity:', err.message);
    }
  }
}

export async function getActivityLogs(filters: ActivityLogFilters) {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const where: Record<string, unknown> = {};
  if (filters.userId !== undefined) {
    where.userId = filters.userId;
  }
  if (filters.serverId !== undefined) {
    where.serverId = filters.serverId;
  }

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: { user: { select: { id: true, username: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.activityLog.count({ where }),
  ]);

  return { logs, total, limit, offset };
}

export async function getServerActivity(serverId: string, limit = 50) {
  return prisma.activityLog.findMany({
    where: { serverId },
    include: { user: { select: { id: true, username: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
