/**
 * V2 API — Servers endpoints.
 *
 * GET    /api/v2/servers              — List user's servers
 * GET    /api/v2/servers/:id          — Get server details
 * PATCH  /api/v2/servers/:id          — Update server
 * DELETE /api/v2/servers/:id          — Delete server
 * POST   /api/v2/servers/:id/power    — Power action
 * POST   /api/v2/servers/:id/reinstall — Reinstall server
 * GET    /api/v2/servers/:id/status   — Get server status
 */

import { Router } from 'express';
import prisma from '../../../db';
import { parseBody } from '../../../utils/validation';
import {
  jsonOk,
  jsonError,
  requireUser,
  resolveServer,
  requireSubUserPermission,
  checkSuspended,
  logActivity,
  paginate,
  parsePage,
  parsePerPage,
} from './helpers';
import { updateServerBody, powerBody } from './dto';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v2/servers — List user's servers
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {return;}

  const page = parsePage(req.query.page);
  const perPage = parsePerPage(req.query.perPage);

  const where = user.isAdmin
    ? {}
    : {
      OR: [{ ownerId: user.id }, { subUsers: { some: { userId: user.id } } }],
    };

  const [servers, total] = await Promise.all([
    prisma.server.findMany({
      where,
      include: {
        node: { select: { id: true, name: true, address: true } },
        image: { select: { id: true, name: true } },
        owner: { select: { id: true, username: true, email: true } },
        _count: { select: { backups: true, databases: true, subUsers: true } },
      },
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.server.count({ where }),
  ]);

  const totalPages = Math.ceil(total / perPage);
  jsonOk(res, servers, { page, perPage, total, totalPages });
});

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id — Get server details
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {return;}

  const server = await prisma.server.findUnique({
    where: { UUID: resolved.server.UUID },
    include: {
      node: { select: { id: true, name: true, address: true, port: true } },
      image: {
        select: { id: true, name: true, dockerImages: true, startup: true },
      },
      owner: { select: { id: true, username: true, email: true } },
      _count: {
        select: {
          backups: true,
          databases: true,
          subUsers: true,
          schedules: true,
        },
      },
    },
  });

  jsonOk(res, server);
});

// ---------------------------------------------------------------------------
// PATCH /api/v2/servers/:id — Update server
// ---------------------------------------------------------------------------
router.patch('/:id', parseBody(updateServerBody), async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {return;}

  // Only owner or admin can update server settings
  if (!resolved.isOwner) {
    const user = await prisma.users.findUnique({
      where: {
        id: (req as any).session?.user?.id ?? (req as any).apiKey?.userId,
      },
    });
    if (!user?.isAdmin) {
      return jsonError(
        res,
        'FORBIDDEN',
        'Only the server owner can update settings',
        403,
      );
    }
  }

  if (checkSuspended(res, resolved)) {return;}

  const data = req.validatedBody as any;
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) {updateData.name = data.name;}
  if (data.description !== undefined) {updateData.description = data.description;}
  if (data.memory !== undefined) {updateData.Memory = data.memory;}
  if (data.cpu !== undefined) {updateData.Cpu = data.cpu;}
  if (data.storage !== undefined) {updateData.Storage = data.storage;}
  if (data.swap !== undefined) {updateData.Swap = data.swap;}
  if (data.backupLimit !== undefined) {updateData.backupLimit = data.backupLimit;}
  if (data.databaseLimit !== undefined)
  {updateData.databaseLimit = data.databaseLimit;}

  if (Object.keys(updateData).length === 0) {
    return jsonError(res, 'BAD_REQUEST', 'No fields to update', 400);
  }

  const updated = await prisma.server.update({
    where: { UUID: resolved.server.UUID },
    data: updateData,
  });

  logActivity(
    (req as any).session?.user?.id ?? (req as any).apiKey?.userId,
    'server.updated',
    resolved.server.UUID,
    { fields: Object.keys(updateData) },
    req.ip,
  );

  jsonOk(res, updated);
});

// ---------------------------------------------------------------------------
// DELETE /api/v2/servers/:id — Delete server
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {return;}

  if (!resolved.isOwner) {
    const user = await prisma.users.findUnique({
      where: {
        id: (req as any).session?.user?.id ?? (req as any).apiKey?.userId,
      },
    });
    if (!user?.isAdmin) {
      return jsonError(
        res,
        'FORBIDDEN',
        'Only the server owner can delete the server',
        403,
      );
    }
  }

  // Notify daemon before deleting
  try {
    const node = await prisma.node.findUnique({
      where: { id: resolved.server.nodeId },
    });
    if (node) {
      const protocol =
        (req as any).app?.get('env') === 'production' ? 'https' : 'http';
      await fetch(
        `${protocol}://${node.address}:${node.port}/servers/${resolved.server.UUID}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${node.key}`,
          },
          signal: AbortSignal.timeout(10000),
        },
      );
    }
  } catch {
    // Best effort — daemon may be offline
  }

  await prisma.server.delete({ where: { UUID: resolved.server.UUID } });

  logActivity(
    (req as any).session?.user?.id ?? (req as any).apiKey?.userId,
    'server.deleted',
    resolved.server.UUID,
    { name: resolved.server.name },
    req.ip,
  );

  jsonOk(res, { deleted: true });
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/power — Power action
// ---------------------------------------------------------------------------
router.post('/:id/power', parseBody(powerBody), async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {return;}
  if (checkSuspended(res, resolved)) {return;}

  // Permission check for sub-users
  const { action } = req.validatedBody as { action: string };
  const permMap: Record<string, string> = {
    start: 'start',
    stop: 'stop',
    restart: 'restart',
    kill: 'kill',
  };
  if (
    permMap[action] &&
    !requireSubUserPermission(res, resolved, permMap[action] as any)
  )
  {return;}

  const node = await prisma.node.findUnique({
    where: { id: resolved.server.nodeId },
  });
  if (!node) {
    return jsonError(res, 'NOT_FOUND', 'Node not found', 404);
  }

  try {
    const protocol =
      (req as any).app?.get('env') === 'production' ? 'https' : 'http';
    const response = await fetch(
      `${protocol}://${node.address}:${node.port}/server/${resolved.server.UUID}/power`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${node.key}`,
        },
        body: JSON.stringify({ action }),
        signal: AbortSignal.timeout(30000),
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => 'Daemon error');
      return jsonError(
        res,
        'DAEMON_ERROR',
        `Daemon returned ${response.status}: ${text}`,
        502,
      );
    }

    logActivity(
      (req as any).session?.user?.id ?? (req as any).apiKey?.userId,
      `server.power.${action}`,
      resolved.server.UUID,
      { action },
      req.ip,
    );

    jsonOk(res, { action, status: 'sent' });
  } catch (err) {
    jsonError(res, 'DAEMON_UNREACHABLE', 'Could not reach daemon', 502);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/reinstall — Reinstall server
// ---------------------------------------------------------------------------
router.post('/:id/reinstall', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {return;}
  if (checkSuspended(res, resolved)) {return;}

  if (!requireSubUserPermission(res, resolved, 'reinstall')) {return;}

  const node = await prisma.node.findUnique({
    where: { id: resolved.server.nodeId },
  });
  if (!node) {
    return jsonError(res, 'NOT_FOUND', 'Node not found', 404);
  }

  try {
    const protocol =
      (req as any).app?.get('env') === 'production' ? 'https' : 'http';
    const response = await fetch(
      `${protocol}://${node.address}:${node.port}/server/${resolved.server.UUID}/reinstall`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${node.key}`,
        },
        signal: AbortSignal.timeout(30000),
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => 'Daemon error');
      return jsonError(
        res,
        'DAEMON_ERROR',
        `Daemon returned ${response.status}: ${text}`,
        502,
      );
    }

    await prisma.server.update({
      where: { UUID: resolved.server.UUID },
      data: { Installing: true },
    });

    logActivity(
      (req as any).session?.user?.id ?? (req as any).apiKey?.userId,
      'server.reinstall',
      resolved.server.UUID,
      {},
      req.ip,
    );

    jsonOk(res, { status: 'reinstalling' });
  } catch {
    jsonError(res, 'DAEMON_UNREACHABLE', 'Could not reach daemon', 502);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/status — Get server status
// ---------------------------------------------------------------------------
router.get('/:id/status', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {return;}

  const node = await prisma.node.findUnique({
    where: { id: resolved.server.nodeId },
  });
  if (!node) {
    return jsonOk(res, { online: false, status: 'node_not_found' });
  }

  try {
    const protocol =
      (req as any).app?.get('env') === 'production' ? 'https' : 'http';
    const response = await fetch(
      `${protocol}://${node.address}:${node.port}/containerstatus/${resolved.server.UUID}`,
      {
        headers: { Authorization: `Bearer ${node.key}` },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!response.ok) {
      return jsonOk(res, { online: false, status: 'unknown' });
    }

    const data = (await response.json()) as {
      status?: string;
      running?: boolean;
    };
    jsonOk(res, {
      online: data.running ?? false,
      status: data.status ?? 'unknown',
    });
  } catch {
    jsonOk(res, { online: false, status: 'unreachable' });
  }
});

export default router;
