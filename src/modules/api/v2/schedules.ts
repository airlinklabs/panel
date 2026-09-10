/**
 * V2 API — Schedules endpoints.
 *
 * GET    /api/v2/servers/:id/schedules                           — List schedules
 * POST   /api/v2/servers/:id/schedules                           — Create schedule
 * PATCH  /api/v2/servers/:id/schedules/:scheduleId               — Update schedule
 * DELETE /api/v2/servers/:id/schedules/:scheduleId               — Delete schedule
 * POST   /api/v2/servers/:id/schedules/:scheduleId/tasks          — Add task
 * DELETE /api/v2/servers/:id/schedules/:scheduleId/tasks/:taskId  — Remove task
 * POST   /api/v2/servers/:id/schedules/:scheduleId/run            — Run schedule now
 */

import { Router } from 'express';
import prisma from '../../../db';
import { parseBody } from '../../../utils/validation';
import {
  jsonOk,
  jsonError,
  resolveServer,
  requireSubUserPermission,
  checkSuspended,
  logActivity,
  getAuthenticatedUserId,
  paginateQuery,
  parsePage,
  parsePerPage,
} from './helpers';
import {
  createScheduleBody,
  updateScheduleBody,
  createScheduleTaskBody,
} from './dto';
import {
  daemonRequest,
  DaemonNodeNotFoundError,
} from '../../../services/daemonService';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/schedules — List schedules
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'schedule.read')) {
    return;
  }

  const page = parsePage(req.query.page);
  const perPage = parsePerPage(req.query.perPage);
  const where = { serverId: resolved.server.UUID };

  const { data: schedules, meta } = await paginateQuery(
    (args) =>
      prisma.schedule.findMany({
        where,
        ...args,
        include: { tasks: { orderBy: { order: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      }),
    () => prisma.schedule.count({ where }),
    page,
    perPage,
  );

  jsonOk(res, schedules, meta);
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/schedules — Create schedule
// ---------------------------------------------------------------------------
router.post('/', parseBody(createScheduleBody), async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'schedule.create')) {
    return;
  }

  const data = req.validatedBody as {
    name: string;
    cron: string;
    enabled?: boolean;
    action: string;
    payload?: string;
    timeOffset?: number;
  };

  // Validate cron roughly
  const cronParts = data.cron.trim().split(/\s+/);
  if (cronParts.length < 5 || cronParts.length > 6) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid cron expression', 400);
  }

  // Validate payload for power action
  if (data.action === 'power' && data.payload) {
    try {
      const parsed = JSON.parse(data.payload);
      const validActions = ['start', 'stop', 'restart', 'kill'];
      if (!parsed.action || !validActions.includes(parsed.action)) {
        return jsonError(
          res,
          'BAD_REQUEST',
          'Power payload must include a valid action',
          400,
        );
      }
    } catch {
      return jsonError(res, 'BAD_REQUEST', 'Invalid power payload JSON', 400);
    }
  }

  const schedule = await prisma.schedule.create({
    data: {
      serverId: resolved.server.UUID,
      name: data.name,
      cron: data.cron,
      enabled: data.enabled ?? false,
      timeOffset: data.timeOffset ?? 0,
      tasks: {
        create: {
          action: data.action,
          payload: data.payload ?? '{}',
          order: 0,
          timeOffset: data.timeOffset ?? 0,
        },
      },
    },
    include: { tasks: true },
  });

  logActivity(
    getAuthenticatedUserId(req),
    'schedule.created',
    resolved.server.UUID,
    { name: data.name, cron: data.cron },
    req.ip,
  );

  jsonOk(res, schedule);
});

// ---------------------------------------------------------------------------
// PATCH /api/v2/servers/:id/schedules/:scheduleId — Update schedule
// ---------------------------------------------------------------------------
router.patch(
  '/:scheduleId',
  parseBody(updateScheduleBody),
  async (req, res) => {
    const resolved = await resolveServer(req, res);
    if (!resolved) {
      return;
    }
    if (!requireSubUserPermission(res, resolved, 'schedule.create')) {
      return;
    }

    const schedule = await prisma.schedule.findUnique({
      where: { id: parseInt(String(req.params.scheduleId), 10) },
    });
    if (!schedule || schedule.serverId !== resolved.server.UUID) {
      return jsonError(res, 'NOT_FOUND', 'Schedule not found', 404);
    }

    const data = req.validatedBody as {
      name?: string;
      cron?: string;
      enabled?: boolean;
      timeOffset?: number;
    };
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    if (data.cron !== undefined) {
      updateData.cron = data.cron;
    }
    if (data.enabled !== undefined) {
      updateData.enabled = data.enabled;
    }
    if (data.timeOffset !== undefined) {
      updateData.timeOffset = data.timeOffset;
    }

    if (Object.keys(updateData).length === 0) {
      return jsonError(res, 'BAD_REQUEST', 'No fields to update', 400);
    }

    const updated = await prisma.schedule.update({
      where: { id: schedule.id },
      data: updateData,
      include: { tasks: { orderBy: { order: 'asc' } } },
    });

    jsonOk(res, updated);
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/v2/servers/:id/schedules/:scheduleId — Delete schedule
// ---------------------------------------------------------------------------
router.delete('/:scheduleId', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'schedule.delete')) {
    return;
  }

  const scheduleId = parseInt(String(req.params.scheduleId), 10);
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
  });
  if (!schedule || schedule.serverId !== resolved.server.UUID) {
    return jsonError(res, 'NOT_FOUND', 'Schedule not found', 404);
  }

  await prisma.schedule.delete({ where: { id: scheduleId } });

  logActivity(
    getAuthenticatedUserId(req),
    'schedule.deleted',
    resolved.server.UUID,
    { name: schedule.name },
    req.ip,
  );

  jsonOk(res, { deleted: scheduleId });
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/schedules/:scheduleId/tasks — Add task
// ---------------------------------------------------------------------------
router.post(
  '/:scheduleId/tasks',
  parseBody(createScheduleTaskBody),
  async (req, res) => {
    const resolved = await resolveServer(req, res);
    if (!resolved) {
      return;
    }
    if (!requireSubUserPermission(res, resolved, 'schedule.create')) {
      return;
    }

    const scheduleId = parseInt(String(req.params.scheduleId), 10);
    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
    });
    if (!schedule || schedule.serverId !== resolved.server.UUID) {
      return jsonError(res, 'NOT_FOUND', 'Schedule not found', 404);
    }

    const data = req.validatedBody as {
      action: string;
      payload?: string;
      order?: number;
      timeOffset?: number;
    };

    // Get the next order number
    const maxOrder = await prisma.scheduleTask.aggregate({
      where: { scheduleId },
      _max: { order: true },
    });

    const task = await prisma.scheduleTask.create({
      data: {
        scheduleId,
        action: data.action,
        payload: data.payload ?? '{}',
        order: data.order ?? (maxOrder._max.order ?? -1) + 1,
        timeOffset: data.timeOffset ?? 0,
      },
    });

    jsonOk(res, task);
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/v2/servers/:id/schedules/:scheduleId/tasks/:taskId — Remove task
// ---------------------------------------------------------------------------
router.delete('/:scheduleId/tasks/:taskId', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'schedule.delete')) {
    return;
  }

  const scheduleId = parseInt(String(req.params.scheduleId), 10);
  const taskId = parseInt(String(req.params.taskId), 10);

  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
  });
  if (!schedule || schedule.serverId !== resolved.server.UUID) {
    return jsonError(res, 'NOT_FOUND', 'Schedule not found', 404);
  }

  const task = await prisma.scheduleTask.findUnique({ where: { id: taskId } });
  if (!task || task.scheduleId !== scheduleId) {
    return jsonError(res, 'NOT_FOUND', 'Task not found', 404);
  }

  await prisma.scheduleTask.delete({ where: { id: taskId } });

  jsonOk(res, { deleted: taskId });
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/schedules/:scheduleId/run — Run schedule now
// ---------------------------------------------------------------------------
router.post('/:scheduleId/run', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'schedule.create')) {
    return;
  }

  const scheduleId = parseInt(String(req.params.scheduleId), 10);
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: { tasks: { orderBy: { order: 'asc' } } },
  });
  if (!schedule || schedule.serverId !== resolved.server.UUID) {
    return jsonError(res, 'NOT_FOUND', 'Schedule not found', 404);
  }

  try {
    const response = await daemonRequest(
      resolved.server.UUID,
      `/servers/${resolved.server.UUID}/schedules/${scheduleId}/run`,
      { method: 'POST', body: { tasks: schedule.tasks }, timeout: 30000 },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => 'Daemon error');
      return jsonError(
        res,
        'DAEMON_ERROR',
        `Failed to run schedule: ${text}`,
        502,
      );
    }

    // Update lastRunAt
    await prisma.schedule.update({
      where: { id: scheduleId },
      data: { lastRunAt: new Date() },
    });

    logActivity(
      getAuthenticatedUserId(req),
      'schedule.executed',
      resolved.server.UUID,
      { name: schedule.name },
      req.ip,
    );

    jsonOk(res, { scheduleId, status: 'running' });
  } catch (err) {
    if (err instanceof DaemonNodeNotFoundError) {
      return jsonError(res, 'NOT_FOUND', 'Node not found', 404);
    }
    jsonError(res, 'DAEMON_UNREACHABLE', 'Could not reach daemon', 502);
  }
});

export default router;
