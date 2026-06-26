import type { Request, Response } from 'express';
import { Router } from 'express';
import type { Module } from '../../core/moduleInit';
import { isAuthenticated } from '../../middleware/auth';
import logger from '../../services/logger';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from '../../services/notifications';

const notificationsModule: Module = {
  info: {
    name: 'Notifications Module',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/api/notifications',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const unreadOnly = req.query.unreadOnly === 'true';
          const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

          const notifications = await getNotifications(userId!, { unreadOnly, limit });
          res.json(notifications);
        } catch (err: unknown) {
          if (err instanceof Error) {
            logger.error('Error fetching notifications:', err);
          }
          res.status(500).json({ message: 'Internal Server Error' });
        }
      },
    );

    router.get(
      '/api/notifications/unread-count',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const count = await getUnreadCount(userId!);
          res.json({ count });
        } catch (err: unknown) {
          if (err instanceof Error) {
            logger.error('Error fetching unread count:', err);
          }
          res.status(500).json({ message: 'Internal Server Error' });
        }
      },
    );

    router.post(
      '/api/notifications/:id/read',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const notificationId = parseInt(String(req.params.id), 10);

          if (isNaN(notificationId)) {
            res.status(400).json({ message: 'Invalid notification ID.' });
            return;
          }

          const result = await markAsRead(notificationId, userId!);
          if (result.count === 0) {
            res.status(404).json({ message: 'Notification not found.' });
            return;
          }

          res.json({ message: 'Notification marked as read.' });
        } catch (err: unknown) {
          if (err instanceof Error) {
            logger.error('Error marking notification as read:', err);
          }
          res.status(500).json({ message: 'Internal Server Error' });
        }
      },
    );

    router.post(
      '/api/notifications/read-all',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          await markAllAsRead(userId!);
          res.json({ message: 'All notifications marked as read.' });
        } catch (err: unknown) {
          if (err instanceof Error) {
            logger.error('Error marking all notifications as read:', err);
          }
          res.status(500).json({ message: 'Internal Server Error' });
        }
      },
    );

    router.delete(
      '/api/notifications/:id',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const notificationId = parseInt(String(req.params.id), 10);

          if (isNaN(notificationId)) {
            res.status(400).json({ message: 'Invalid notification ID.' });
            return;
          }

          const result = await deleteNotification(notificationId, userId!);
          if (result.count === 0) {
            res.status(404).json({ message: 'Notification not found.' });
            return;
          }

          res.json({ message: 'Notification deleted.' });
        } catch (err: unknown) {
          if (err instanceof Error) {
            logger.error('Error deleting notification:', err);
          }
          res.status(500).json({ message: 'Internal Server Error' });
        }
      },
    );

    return router;
  },
};

export default notificationsModule;
