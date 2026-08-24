import { getSettings } from '../../handlers/settingsCache';
import type { Request, Response } from 'express';
import { Router } from 'express';
import type { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import { getActivityEventMeta, type ActivityCategory } from '../../handlers/utils/activity/activityEvents';

const ACTIVITY_PAGE_SIZE = 50;

const activityModule: Module = {
  info: {
    name: 'Admin Activity Log Module',
    description: 'Audit log of panel actions (servers, files, backups, subusers, databases).',
    version: '2.1.0',
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
          if (!user) {return res.redirect('/login');}

          const page = Math.max(parseInt(String(req.query.page ?? '1'), 10) || 1, 1);
          const eventFilter = typeof req.query.event === 'string' ? req.query.event : undefined;
          const serverFilter = typeof req.query.server === 'string' ? req.query.server.trim() : undefined;
          const actorFilter = typeof req.query.actor === 'string' ? req.query.actor.trim() : undefined;
          const categoryFilter = typeof req.query.category === 'string' ? req.query.category.trim() : undefined;
          const fromRaw = typeof req.query.from === 'string' ? req.query.from.trim() : undefined;
          const toRaw = typeof req.query.to === 'string' ? req.query.to.trim() : undefined;

          const where: Record<string, unknown> = {};

          if (eventFilter) {where.event = eventFilter;}
          if (serverFilter) {where.serverId = serverFilter;}
          if (categoryFilter && !eventFilter) {
            const events = await prisma.activityLog.findMany({
              where: { event: { not: '' } },
              select: { event: true },
              distinct: ['event'],
            });
            const matching = events
              .map((e) => e.event)
              .filter((e) => getActivityEventMeta(e).category === (categoryFilter as ActivityCategory));
            where.event = matching.length > 0 ? { in: matching } : '__none__';
          }
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

          const createdAt: Record<string, Date> = {};
          if (fromRaw) {
            const from = new Date(`${fromRaw}T00:00:00.000Z`);
            if (!isNaN(from.getTime())) {
              createdAt.gte = from;
            }
          }
          if (toRaw) {
            const to = new Date(`${toRaw}T23:59:59.999Z`);
            if (!isNaN(to.getTime())) {
              createdAt.lte = to;
            }
          }
          if (Object.keys(createdAt).length > 0) {
            where.createdAt = createdAt;
          }

          const [total, logs, events, actors, servers] = await Promise.all([
            prisma.activityLog.count({ where }),
            prisma.activityLog.findMany({
              where,
              orderBy: { createdAt: 'desc' },
              skip: (page - 1) * ACTIVITY_PAGE_SIZE,
              take: ACTIVITY_PAGE_SIZE,
              include: {
                actor: { select: { id: true, username: true, email: true } },
                server: { select: { UUID: true, name: true } },
              },
            }),
            prisma.activityLog.groupBy({ by: ['event'], _count: { _all: true }, orderBy: { event: 'asc' } }),
            prisma.users.findMany({
              select: { id: true, username: true, email: true },
              orderBy: { username: 'asc' },
              take: 500,
            }),
            prisma.server.findMany({
              select: { UUID: true, name: true },
              orderBy: { name: 'asc' },
              take: 500,
            }),
          ]);

          const settings = await await getSettings();

          res.render('admin/activity/activity', {
            user,
            req,
            settings,
            logs: logs.map((log: { metadata: string | null; event: string }) => ({
              ...log,
              metadata: log.metadata ? JSON.parse(log.metadata) : null,
              meta: getActivityEventMeta(log.event),
            })),
            events: events.map((e: { event: string; _count: { _all: number } }) => ({ event: e.event, count: e._count._all })),
            actors,
            servers,
            filters: {
              event: eventFilter ?? '',
              server: serverFilter ?? '',
              actor: actorFilter ?? '',
              category: categoryFilter ?? '',
              from: fromRaw ?? '',
              to: toRaw ?? '',
            },
            page,
            totalPages: Math.max(Math.ceil(total / ACTIVITY_PAGE_SIZE), 1),
            total,
          });
        } catch (error: unknown) {
          logger.error('Error fetching activity log:', error);
          res.status(500).json({ message: 'Error fetching activity log.' });
        }
      },
    );

    return router;
  },
};

export default activityModule;
