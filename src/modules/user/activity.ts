import type { Request, Response } from 'express';
import { Router } from 'express';
import type { Module } from '../../core/moduleInit.js';
import prisma from '../../db.js';
import { isAuthenticated } from '../../middleware/auth.js';
import { isAuthenticatedForServer } from '../../middleware/serverAuth.js';
import { getActivityLogs, getServerActivity } from '../../services/activityLog.js';
import { getParamAsString } from '../../utils/typeHelpers.js';
import logger from '../../services/logger.js';

interface ErrorMessage {
  message?: string;
}

const activityModule: Module = {
  info: {
    name: 'Activity Module',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/activity',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        const errorMessage: ErrorMessage = {};
        const userId = req.session?.user?.id;
        const settings = await prisma.settings.findUnique({ where: { id: 1 } });

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            errorMessage.message = 'User not found.';
            res.render('user/activity', { errorMessage, user: null, req, settings, logs: [], total: 0, page: 1, totalPages: 1 });
            return;
          }

          let page = 1;
          if (typeof req.query.page === 'string') {
            page = parseInt(req.query.page, 10);
          }
          if (isNaN(page) || page < 1) {
            page = 1;
          }

          const perPage = 20;
          const offset = (page - 1) * perPage;

          const { logs, total } = await getActivityLogs({
            userId: user.id,
            limit: perPage,
            offset,
          });

          const totalPages = Math.ceil(total / perPage);

          res.render('user/activity', {
            errorMessage,
            user,
            req,
            settings,
            logs,
            total,
            page,
            totalPages,
          });
        } catch (err: unknown) {
          logger.error('Error fetching activity logs:', err);
          errorMessage.message = 'Error loading activity logs.';
          res.render('user/activity', {
            errorMessage,
            user: null,
            req,
            settings,
            logs: [],
            total: 0,
            page: 1,
            totalPages: 1,
          });
        }
      },
    );

    router.get(
      '/api/activity',
      isAuthenticated(),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
          }

          let limit = 50;
          let offset = 0;

          if (typeof req.query.limit === 'string') {
            const parsed = parseInt(req.query.limit, 10);
            if (!isNaN(parsed) && parsed > 0) {
              limit = Math.min(parsed, 100);
            }
          }

          if (typeof req.query.offset === 'string') {
            const parsed = parseInt(req.query.offset, 10);
            if (!isNaN(parsed) && parsed >= 0) {
              offset = parsed;
            }
          }

          const result = await getActivityLogs({
            userId: user.id,
            limit,
            offset,
          });

          res.json(result);
        } catch (err: unknown) {
          logger.error('Error fetching activity logs API:', err);
          res.status(500).json({ error: 'Failed to fetch activity logs' });
        }
      },
    );

    router.get(
      '/server/:id/activity',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const errorMessage: ErrorMessage = {};
        const userId = req.session?.user?.id;
        const serverId = getParamAsString(req.params?.id);
        const settings = await prisma.settings.findUnique({ where: { id: 1 } });

        try {
          const [user, server] = await Promise.all([
            prisma.users.findUnique({ where: { id: userId } }),
            prisma.server.findUnique({ where: { UUID: serverId }, include: { node: true } }),
          ]);

          if (!user) {
            errorMessage.message = 'User not found.';
            res.render('user/server/activity', {
              errorMessage,
              user: null,
              server: null,
              req,
              settings,
              logs: [],
            });
            return;
          }

          if (!server) {
            errorMessage.message = 'Server not found.';
            res.render('user/server/activity', {
              errorMessage,
              user,
              server: null,
              req,
              settings,
              logs: [],
            });
            return;
          }

          const logs = await getServerActivity(server.UUID, 50);

          res.render('user/server/activity', {
            errorMessage,
            user,
            server,
            req,
            settings,
            logs,
          });
        } catch (err: unknown) {
          logger.error('Error fetching server activity:', err);
          errorMessage.message = 'Error loading server activity.';
          res.render('user/server/activity', {
            errorMessage,
            user: null,
            server: null,
            req,
            settings,
            logs: [],
          });
        }
      },
    );

    return router;
  },
};

export default activityModule;
