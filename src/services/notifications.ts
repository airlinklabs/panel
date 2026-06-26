import prisma from '../db';
import logger from './logger';

interface CreateNotificationData {
  userId: number;
  type: string;
  title: string;
  message: string;
  serverId?: string;
}

interface GetNotificationsOptions {
  unreadOnly?: boolean;
  limit?: number;
}

export async function createNotification(data: CreateNotificationData) {
  try {
    return await prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        serverId: data.serverId ?? null,
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      logger.error('Failed to create notification:', err);
    }
    throw err;
  }
}

export async function getNotifications(userId: number, options: GetNotificationsOptions = {}) {
  try {
    const where: Record<string, unknown> = { userId };
    if (options.unreadOnly) {
      where.read = false;
    }

    return await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options.limit ?? 50,
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      logger.error('Failed to fetch notifications:', err);
    }
    throw err;
  }
}

export async function markAsRead(notificationId: number, userId: number) {
  try {
    return await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true },
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      logger.error('Failed to mark notification as read:', err);
    }
    throw err;
  }
}

export async function markAllAsRead(userId: number) {
  try {
    return await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      logger.error('Failed to mark all notifications as read:', err);
    }
    throw err;
  }
}

export async function getUnreadCount(userId: number) {
  try {
    return await prisma.notification.count({
      where: { userId, read: false },
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      logger.error('Failed to count unread notifications:', err);
    }
    throw err;
  }
}

export async function deleteNotification(notificationId: number, userId: number) {
  try {
    return await prisma.notification.deleteMany({
      where: { id: notificationId, userId },
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      logger.error('Failed to delete notification:', err);
    }
    throw err;
  }
}

export async function notifyUser(
  userId: number,
  type: string,
  title: string,
  message: string,
  serverId?: string,
) {
  return createNotification({ userId, type, title, message, serverId });
}
