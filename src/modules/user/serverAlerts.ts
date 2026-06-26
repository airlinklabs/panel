import type { Request, Response } from 'express';
import { Router } from 'express';
import type { Module } from '../../core/moduleInit';
import prisma from '../../db';
import { isAuthenticatedForServer } from '../../middleware/serverAuth';
import logger from '../../services/logger';
import { createNotification } from '../../services/notifications';
import { getParamAsString } from '../../utils/typeHelpers';

interface ErrorMessage {
  message?: string;
}

const ALERT_TYPES = ['cpu', 'memory', 'disk'] as const;
type AlertType = (typeof ALERT_TYPES)[number];

function isValidAlertType(value: string): value is AlertType {
  return ALERT_TYPES.includes(value as AlertType);
}

export async function checkServerAlerts(
  serverId: string,
  stats: { cpu: number; memory: number; disk: number },
): Promise<void> {
  try {
    const alerts = await prisma.serverAlert.findMany({
      where: { serverId, enabled: true },
    });

    for (const alert of alerts) {
      const currentValue = stats[alert.type as AlertType];
      if (currentValue === undefined) {continue;}

      if (currentValue > alert.threshold && !alert.triggered) {
        await prisma.serverAlert.update({
          where: { id: alert.id },
          data: { triggered: true, current: currentValue },
        });

        const server = await prisma.server.findUnique({
          where: { UUID: serverId },
          select: { name: true },
        });

        await createNotification({
          userId: alert.userId,
          type: 'alert',
          title: `Server Alert: ${alert.type.toUpperCase()}`,
          message: `Server "${server?.name ?? serverId}" ${alert.type.toUpperCase()} is at ${currentValue.toFixed(1)}%, exceeding threshold of ${alert.threshold}%.`,
          serverId,
        });
      } else if (currentValue <= alert.threshold && alert.triggered) {
        await prisma.serverAlert.update({
          where: { id: alert.id },
          data: { triggered: false, current: currentValue },
        });
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error) {
      logger.error('Error checking server alerts:', err);
    }
  }
}

const serverAlertsModule: Module = {
  info: {
    name: 'Server Alerts Module',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/server/:id/alerts',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const errorMessage: ErrorMessage = {};
        const userId = req.session?.user?.id;
        const serverId = getParamAsString(req.params?.id);

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            errorMessage.message = 'User not found.';
            res.render('user/account', { errorMessage, user, req }); return;
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true, image: true, owner: true },
          });

          if (!server) {
            errorMessage.message = 'Server not found.';
            res.render('user/server/alerts', {
              errorMessage,
              user,
              server: null,
              alerts: [],
              req,
            }); return;
          }

          const alerts = await prisma.serverAlert.findMany({
            where: { serverId },
            orderBy: { createdAt: 'desc' },
          });

          const settings = await prisma.settings.findUnique({ where: { id: 1 } });

          res.render('user/server/alerts', {
            errorMessage,
            user,
            server,
            alerts,
            req,
            settings,
          });
        } catch (error) {
          logger.error('Error loading server alerts:', error);
          errorMessage.message = 'Error loading alerts.';
          res.render('user/server/alerts', {
            errorMessage,
            user: req.session?.user,
            server: null,
            alerts: [],
            req,
          });
        }
      },
    );

    router.post(
      '/server/:id/alerts',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const serverId = getParamAsString(req.params?.id);
        const { type, threshold } = req.body;

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.status(404).json({ error: 'User not found.' });
          }

          if (!type || !isValidAlertType(type)) {
            return res.status(400).json({ error: 'Invalid alert type. Must be cpu, memory, or disk.' });
          }

          const thresholdNum = parseFloat(threshold);
          if (isNaN(thresholdNum) || thresholdNum < 0 || thresholdNum > 100) {
            return res.status(400).json({ error: 'Threshold must be a number between 0 and 100.' });
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
          });

          if (!server) {
            return res.status(404).json({ error: 'Server not found.' });
          }

          const alert = await prisma.serverAlert.create({
            data: {
              userId: userId!,
              serverId,
              type,
              threshold: thresholdNum,
              enabled: true,
              triggered: false,
            },
          });

          res.status(201).json({ success: true, alert });
        } catch (error) {
          logger.error('Error creating server alert:', error);
          res.status(500).json({ error: 'Failed to create alert.' });
        }
      },
    );

    router.delete(
      '/server/:id/alerts/:alertId',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const alertId = parseInt(getParamAsString(req.params.alertId), 10);

        try {
          if (isNaN(alertId)) {
            return res.status(400).json({ error: 'Invalid alert ID.' });
          }

          const alert = await prisma.serverAlert.findUnique({
            where: { id: alertId },
          });

          if (!alert) {
            return res.status(404).json({ error: 'Alert not found.' });
          }

          await prisma.serverAlert.delete({ where: { id: alertId } });
          res.json({ success: true });
        } catch (error) {
          logger.error('Error deleting server alert:', error);
          res.status(500).json({ error: 'Failed to delete alert.' });
        }
      },
    );

    router.post(
      '/server/:id/alerts/:alertId/toggle',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const alertId = parseInt(getParamAsString(req.params.alertId), 10);

        try {
          if (isNaN(alertId)) {
            return res.status(400).json({ error: 'Invalid alert ID.' });
          }

          const alert = await prisma.serverAlert.findUnique({
            where: { id: alertId },
          });

          if (!alert) {
            return res.status(404).json({ error: 'Alert not found.' });
          }

          const updated = await prisma.serverAlert.update({
            where: { id: alertId },
            data: { enabled: !alert.enabled },
          });

          res.json({ success: true, alert: updated });
        } catch (error) {
          logger.error('Error toggling server alert:', error);
          res.status(500).json({ error: 'Failed to toggle alert.' });
        }
      },
    );

    return router;
  },
};

export default serverAlertsModule;
