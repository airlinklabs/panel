import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';

const ACTIVITY_PAGE_SIZE = 50;

const activityModule: Module = {
  info: {
    name: 'Admin Activity Log Module',
    description: 'Audit log of panel actions (servers, files, backups, subusers, databases).',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/admin/activity',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const user = await prisma.users.findUnique({ where: { id: req.session?.user?.id } });
          if (!user) return res.redirect('/login');

          const page = Math.max(parseInt(String(req.query.page ?? '1'), 10) || 1, 1);
          const eventFilter = typeof req.query.event === 'string' ? req.query.event : undefined;
          const serverFilter = typeof req.query.server === 'string' ? req.query.server.trim() : undefined;
          const actorFilter = typeof req.query.actor === 'string' ? req.query.actor.trim() : undefined;

          const where: Record<string, unknown> = {};
          if (eventFilter) where.event = eventFilter;
          if (serverFilter) where.serverId = serverFilter;
          if (actorFilter) {
            const actors = await prisma.users.findMany({
              where: {
                OR: [
                  { username: { contains: actorFilter } },
                  { email: { contains: actorFilter } },
                ],
              },
              select: { id: true },
            });
            where.actorId = { in: actors.map((a: { id: number }) => a.id) };
          }

          const [total, logs, events, actors] = await Promise.all([
            prisma.activityLog.count({ where }),
            prisma.activityLog.findMany({
              where,
              orderBy: { createdAt: 'desc' },
              skip: (page - 1) * ACTIVITY_PAGE_SIZE,
              take: ACTIVITY_PAGE_SIZE,
              include: { actor: { select: { id: true, username: true, email: true } } },
            }),
            prisma.activityLog.groupBy({ by: ['event'], _count: { _all: true }, orderBy: { event: 'asc' } }),
            prisma.users.findMany({
              select: { id: true, username: true, email: true },
              orderBy: { username: 'asc' },
              take: 500,
            }),
          ]);

          const settings = await prisma.settings.findUnique({ where: { id: 1 } });

          res.render('admin/activity/activity', {
            user,
            req,
            settings,
            logs: logs.map((log: { metadata: string | null }) => ({
              ...log,
              metadata: log.metadata ? JSON.parse(log.metadata) : null,
            })),
            events: events.map((e: { event: string; _count: { _all: number } }) => ({ event: e.event, count: e._count._all })),
            actors,
            filters: { event: eventFilter ?? '', server: serverFilter ?? '', actor: actorFilter ?? '' },
            page,
            totalPages: Math.max(Math.ceil(total / ACTIVITY_PAGE_SIZE), 1),
            total,
          });
        } catch (error) {
          logger.error('Error fetching activity log:', error);
          res.status(500).json({ message: 'Error fetching activity log.' });
        }
      },
    );

    return router;
  },
};

export default activityModule;
