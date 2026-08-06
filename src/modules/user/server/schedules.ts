import { Router, Request, Response } from 'express';
import CronParser from 'cron-parser';
import { isAuthenticatedForServer, requireSubUserPermission } from '../../../handlers/utils/auth/serverAuthUtil';
import logger from '../../../handlers/logger';
import { getParamAsString } from '../../../utils/typeHelpers';
import prisma from '../../../db';
import { checkForServerInstallation } from '../../../handlers/checkForServerInstallation';
import { serverPageInclude } from './shared';
import { runSchedule } from '../../../handlers/schedulerWorker';

const POWER_ACTIONS = ['start', 'stop', 'restart', 'kill'] as const;
const TASK_ACTIONS = ['command', 'power', 'backup'] as const;

function isValidCron(cron: string): boolean {
  try {
    CronParser.parse(cron);
    return true;
  } catch {
    return false;
  }
}

function nextRunFromCron(cron: string, timeOffset = 0): Date {
  const clock = new Date(Date.now() + timeOffset * 60_000);
  return CronParser.parse(cron, { currentDate: clock }).next().toDate();
}

function parsePayload(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function loadServerForUser(serverId: string, userId: number, req: Request) {
  const server = await prisma.server.findUnique({
    where: { UUID: getParamAsString(serverId) },
    include: serverPageInclude,
  });
  if (!server) return null;
  if (server.ownerId === userId || (req.session?.user?.isAdmin ?? false)) return server;
  const subUser = (req as any).subUser as { permissions?: string | null } | undefined;
  if (subUser) return server;
  return null;
}

export function registerScheduleRoutes(router: Router): void {
  // ── GET /server/:id/schedules ───────────────────────────────────────────
  router.get(
    '/server/:id/schedules',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('schedule.read'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await loadServerForUser(String(serverId), user.id, req);
        if (!server) {
          res.status(403).json({ error: 'Server not found or access denied.' });
          return;
        }

        const schedules = await prisma.schedule.findMany({
          where: { serverId: server.UUID },
          include: { tasks: { orderBy: { order: 'asc' } } },
          orderBy: { createdAt: 'desc' },
        });

        const schedulesWithTasks = schedules.map((schedule) => ({
          ...schedule,
          tasks: schedule.tasks.map((task) => ({
            ...task,
            payload: parsePayload(task.payload),
          })),
        }));

        const settings = await prisma.settings.findUnique({ where: { id: 1 } });

        res.render('user/server/schedules', {
          user,
          req,
          server,
          settings,
          schedules: schedulesWithTasks,
          features: JSON.parse(server.image.info || '{}').features || [],
          installed: await checkForServerInstallation(getParamAsString(serverId)),
        });
      } catch (error) {
        logger.error('Error fetching schedules:', error);
        res.status(500).json({ error: 'Failed to fetch schedules' });
      }
    },
  );

  // ── POST /server/:id/schedules ──────────────────────────────────────────
  router.post(
    '/server/:id/schedules',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('schedule.create'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const { name, cron, timeOffset } = req.body as { name?: string; cron?: string; timeOffset?: unknown };

      if (!name || typeof name !== 'string' || name.trim() === '') {
        res.status(400).json({ error: 'Schedule name is required' });
        return;
      }
      if (name.trim().length > 60) {
        res.status(400).json({ error: 'Schedule name must be 60 characters or less.' });
        return;
      }
      if (!cron || typeof cron !== 'string' || !isValidCron(cron.trim())) {
        res.status(400).json({ error: 'Invalid cron expression.' });
        return;
      }
      const parsedOffset = parseInt(String(timeOffset ?? '0'), 10);
      const offset = Number.isNaN(parsedOffset) ? 0 : Math.min(Math.max(parsedOffset, -1440), 1440);

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await loadServerForUser(String(serverId), user.id, req);
        if (!server) {
          res.status(403).json({ error: 'Server not found or access denied.' });
          return;
        }

        const schedule = await prisma.schedule.create({
          data: {
            serverId: server.UUID,
            name: name.trim(),
            cron: cron.trim(),
            timeOffset: offset,
            nextRunAt: nextRunFromCron(cron.trim()),
          },
        });

        res.json({ success: true, message: 'Schedule created.', schedule });
      } catch (error) {
        logger.error('Error creating schedule:', error);
        res.status(500).json({ error: 'Failed to create schedule' });
      }
    },
  );

  // ── PATCH /server/:id/schedules/:scheduleId ─────────────────────────────
  router.patch(
    '/server/:id/schedules/:scheduleId',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('schedule.update'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const scheduleId = parseInt(getParamAsString(req.params?.scheduleId), 10);
      const { enabled, timeOffset } = req.body as { enabled?: unknown; timeOffset?: unknown };

      if (isNaN(scheduleId)) {
        res.status(400).json({ error: 'Invalid schedule id' });
        return;
      }

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await loadServerForUser(String(serverId), user.id, req);
        if (!server) {
          res.status(403).json({ error: 'Server not found or access denied.' });
          return;
        }

        const schedule = await prisma.schedule.findFirst({
          where: { id: scheduleId, serverId: server.UUID },
        });
        if (!schedule) {
          res.status(404).json({ error: 'Schedule not found' });
          return;
        }

        let offset = schedule.timeOffset ?? 0;
        if (timeOffset !== undefined) {
          const parsed = parseInt(String(timeOffset), 10);
          offset = Number.isNaN(parsed) ? 0 : Math.min(Math.max(parsed, -1440), 1440);
        }

        const wantEnabled = enabled === true || enabled === 'true';
        await prisma.schedule.update({
          where: { id: schedule.id },
          data: {
            enabled: wantEnabled,
            timeOffset: offset,
            nextRunAt: wantEnabled ? nextRunFromCron(schedule.cron, offset) : null,
          },
        });

        res.json({ success: true, message: wantEnabled ? 'Schedule enabled.' : 'Schedule disabled.' });
      } catch (error) {
        logger.error('Error toggling schedule:', error);
        res.status(500).json({ error: 'Failed to update schedule' });
      }
    },
  );

  // ── DELETE /server/:id/schedules/:scheduleId ────────────────────────────
  router.delete(
    '/server/:id/schedules/:scheduleId',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('schedule.delete'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const scheduleId = parseInt(getParamAsString(req.params?.scheduleId), 10);

      if (isNaN(scheduleId)) {
        res.status(400).json({ error: 'Invalid schedule id' });
        return;
      }

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await loadServerForUser(String(serverId), user.id, req);
        if (!server) {
          res.status(403).json({ error: 'Server not found or access denied.' });
          return;
        }

        const schedule = await prisma.schedule.findFirst({
          where: { id: scheduleId, serverId: server.UUID },
        });
        if (!schedule) {
          res.status(404).json({ error: 'Schedule not found' });
          return;
        }

        await prisma.schedule.delete({ where: { id: schedule.id } });
        res.json({ success: true, message: 'Schedule deleted.' });
      } catch (error) {
        logger.error('Error deleting schedule:', error);
        res.status(500).json({ error: 'Failed to delete schedule' });
      }
    },
  );

  // ── POST /server/:id/schedules/:scheduleId/tasks ────────────────────────
  router.post(
    '/server/:id/schedules/:scheduleId/tasks',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('schedule.update'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const scheduleId = parseInt(getParamAsString(req.params?.scheduleId), 10);
      const { action, payload, timeOffset = 0 } = req.body as {
        action?: string;
        payload?: Record<string, unknown>;
        timeOffset?: unknown;
      };

      if (isNaN(scheduleId)) {
        res.status(400).json({ error: 'Invalid schedule id' });
        return;
      }
      if (!action || !(TASK_ACTIONS as readonly string[]).includes(action)) {
        res.status(400).json({ error: 'Task action must be one of: command, power, backup.' });
        return;
      }
      if (!payload || typeof payload !== 'object') {
        res.status(400).json({ error: 'Task payload is required.' });
        return;
      }
      if (action === 'command' && !String(payload.command ?? '').trim()) {
        res.status(400).json({ error: 'Command is required.' });
        return;
      }
      if (action === 'power' && !(POWER_ACTIONS as readonly string[]).includes(String(payload.action ?? ''))) {
        res.status(400).json({ error: 'Power action must be one of: start, stop, restart, kill.' });
        return;
      }
      if (action === 'backup' && !String(payload.name ?? '').trim()) {
        res.status(400).json({ error: 'Backup name is required.' });
        return;
      }

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await loadServerForUser(String(serverId), user.id, req);
        if (!server) {
          res.status(403).json({ error: 'Server not found or access denied.' });
          return;
        }

        const schedule = await prisma.schedule.findFirst({
          where: { id: scheduleId, serverId: server.UUID },
        });
        if (!schedule) {
          res.status(404).json({ error: 'Schedule not found' });
          return;
        }

        const taskCount = await prisma.scheduleTask.count({ where: { scheduleId: schedule.id } });

        const task = await prisma.scheduleTask.create({
          data: {
            scheduleId: schedule.id,
            order: taskCount,
            action,
            payload: JSON.stringify(payload),
            timeOffset: Math.max(0, parseInt(String(timeOffset), 10) || 0),
          },
        });

        res.json({ success: true, message: 'Task added.', task });
      } catch (error) {
        logger.error('Error adding schedule task:', error);
        res.status(500).json({ error: 'Failed to add task' });
      }
    },
  );

  // ── DELETE /server/:id/schedules/:scheduleId/tasks/:taskId ──────────────
  router.delete(
    '/server/:id/schedules/:scheduleId/tasks/:taskId',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('schedule.update'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const scheduleId = parseInt(getParamAsString(req.params?.scheduleId), 10);
      const taskId = parseInt(getParamAsString(req.params?.taskId), 10);

      if (isNaN(scheduleId) || isNaN(taskId)) {
        res.status(400).json({ error: 'Invalid ids' });
        return;
      }

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await loadServerForUser(String(serverId), user.id, req);
        if (!server) {
          res.status(403).json({ error: 'Server not found or access denied.' });
          return;
        }

        const schedule = await prisma.schedule.findFirst({
          where: { id: scheduleId, serverId: server.UUID },
        });
        if (!schedule) {
          res.status(404).json({ error: 'Schedule not found' });
          return;
        }

        const task = await prisma.scheduleTask.findFirst({
          where: { id: taskId, scheduleId: schedule.id },
        });
        if (!task) {
          res.status(404).json({ error: 'Task not found' });
          return;
        }

        await prisma.scheduleTask.delete({ where: { id: task.id } });
        res.json({ success: true, message: 'Task removed.' });
      } catch (error) {
        logger.error('Error removing schedule task:', error);
        res.status(500).json({ error: 'Failed to remove task' });
      }
    },
  );

  // ── POST /server/:id/schedules/:scheduleId/run ──────────────────────────
  router.post(
    '/server/:id/schedules/:scheduleId/run',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('schedule.update'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const scheduleId = parseInt(getParamAsString(req.params?.scheduleId), 10);

      if (isNaN(scheduleId)) {
        res.status(400).json({ error: 'Invalid schedule id' });
        return;
      }

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await loadServerForUser(String(serverId), user.id, req);
        if (!server) {
          res.status(403).json({ error: 'Server not found or access denied.' });
          return;
        }

        const schedule = await prisma.schedule.findFirst({
          where: { id: scheduleId, serverId: server.UUID },
          include: {
            tasks: { orderBy: { order: 'asc' } },
            server: { include: { node: true, image: true } },
          },
        });
        if (!schedule) {
          res.status(404).json({ error: 'Schedule not found' });
          return;
        }

        if (schedule.tasks.length === 0) {
          res.status(400).json({ error: 'This schedule has no tasks. Add a task first.' });
          return;
        }

        await runSchedule(schedule);
        const now = new Date();
        await prisma.schedule.update({
          where: { id: schedule.id },
          data: {
            lastRunAt: now,
            nextRunAt: nextRunFromCron(schedule.cron, schedule.timeOffset || 0),
          },
        });

        res.json({ success: true, message: 'Schedule run triggered.' });
      } catch (error) {
        logger.error('Error running schedule:', error);
        res.status(500).json({ error: 'Failed to run schedule' });
      }
    },
  );
}
