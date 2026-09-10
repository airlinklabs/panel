/**
 * V2 API — Admin servers endpoints.
 *
 * GET    /api/v2/admin/servers              — List all servers
 * POST   /api/v2/admin/servers              — Create server
 * GET    /api/v2/admin/servers/:id          — Get server
 * PUT    /api/v2/admin/servers/:id          — Update server
 * DELETE /api/v2/admin/servers/:id          — Delete server
 * POST   /api/v2/admin/servers/:id/suspend  — Suspend server
 * POST   /api/v2/admin/servers/:id/unsuspend — Unsuspend server
 * POST   /api/v2/admin/servers/:id/transfer — Transfer server
 * GET    /api/v2/admin/servers/:id/transfer/status — Transfer poll
 */

import { Router } from 'express';
import prisma from '../../../../db';
import { parseBody } from '../../../../utils/validation';
import {
  jsonOk,
  jsonError,
  requireAdmin,
  logActivity,
  parsePage,
  parsePerPage,
} from '../helpers';
import {
  adminCreateServerBody,
  adminUpdateServerBody,
  adminTransferServerBody,
} from '../dto';
import { daemonRequest } from '../../../../services/daemonService';
import { getTransferState } from '../../../../handlers/utils/server/serverTransfer';

const router = Router();

router.use(async (req, res, next) => {
  const admin = await requireAdmin(req, res);
  if (!admin) {
    return;
  }
  req.adminUser = admin;
  next();
});

// ---------------------------------------------------------------------------
// GET /api/v2/admin/servers — List all servers
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  const page = parsePage(req.query.page);
  const perPage = parsePerPage(req.query.perPage);
  const search = (req.query.search as string) || '';

  const where = search
    ? {
      OR: [{ name: { contains: search } }, { UUID: { contains: search } }],
    }
    : {};

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
  jsonOk(res, servers, {
    current_page: page,
    per_page: perPage,
    total,
    last_page: totalPages,
  });
});

// ---------------------------------------------------------------------------
// POST /api/v2/admin/servers — Create server
// ---------------------------------------------------------------------------
router.post('/', parseBody(adminCreateServerBody), async (req, res) => {
  const data = req.validatedBody as any;

  // Verify owner exists
  const owner = await prisma.users.findUnique({ where: { id: data.ownerId } });
  if (!owner) {
    return jsonError(res, 'NOT_FOUND', 'Owner not found', 404);
  }

  // Verify node exists
  const node = await prisma.node.findUnique({ where: { id: data.nodeId } });
  if (!node) {
    return jsonError(res, 'NOT_FOUND', 'Node not found', 404);
  }

  // Verify image exists
  const image = await prisma.images.findUnique({ where: { id: data.imageId } });
  if (!image) {
    return jsonError(res, 'NOT_FOUND', 'Image not found', 404);
  }

  const server = await prisma.server.create({
    data: {
      name: data.name,
      description: data.description,
      ownerId: data.ownerId,
      nodeId: data.nodeId,
      imageId: data.imageId,
      Memory: data.memory,
      Cpu: data.cpu,
      Storage: data.storage,
      Swap: data.swap,
      Ports: data.Ports ?? '[]',
      StartCommand: data.StartCommand,
      dockerImage: data.dockerImage,
      Variables: data.Variables,
      backupLimit: data.backupLimit,
      databaseLimit: data.databaseLimit,
      Installing: false,
      Queued: false,
    },
    include: {
      node: { select: { id: true, name: true, address: true } },
      image: { select: { id: true, name: true } },
      owner: { select: { id: true, username: true, email: true } },
    },
  });

  logActivity(
    req.adminUser?.id,
    'server.created',
    server.UUID,
    { name: server.name },
    req.ip,
  );

  jsonOk(res, server);
});

// ---------------------------------------------------------------------------
// GET /api/v2/admin/servers/:id — Get server
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid server ID', 400);
  }

  const server = await prisma.server.findUnique({
    where: { id },
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

  if (!server) {
    return jsonError(res, 'NOT_FOUND', 'Server not found', 404);
  }
  jsonOk(res, server);
});

// ---------------------------------------------------------------------------
// PUT /api/v2/admin/servers/:id — Update server
// ---------------------------------------------------------------------------
router.put('/:id', parseBody(adminUpdateServerBody), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid server ID', 400);
  }

  const existing = await prisma.server.findUnique({ where: { id } });
  if (!existing) {
    return jsonError(res, 'NOT_FOUND', 'Server not found', 404);
  }

  const data = req.validatedBody as any;
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) {
    updateData.name = data.name;
  }
  if (data.description !== undefined) {
    updateData.description = data.description;
  }
  if (data.memory !== undefined) {
    updateData.Memory = data.memory;
  }
  if (data.cpu !== undefined) {
    updateData.Cpu = data.cpu;
  }
  if (data.storage !== undefined) {
    updateData.Storage = data.storage;
  }
  if (data.swap !== undefined) {
    updateData.Swap = data.swap;
  }
  if (data.backupLimit !== undefined) {
    updateData.backupLimit = data.backupLimit;
  }
  if (data.databaseLimit !== undefined) {
    updateData.databaseLimit = data.databaseLimit;
  }
  if (data.nodeId !== undefined) {
    updateData.nodeId = data.nodeId;
  }
  if (data.imageId !== undefined) {
    updateData.imageId = data.imageId;
  }
  if (data.StartCommand !== undefined) {
    updateData.StartCommand = data.StartCommand;
  }
  if (data.dockerImage !== undefined) {
    updateData.dockerImage = data.dockerImage;
  }
  if (data.Variables !== undefined) {
    updateData.Variables = data.Variables;
  }

  if (Object.keys(updateData).length === 0) {
    return jsonError(res, 'BAD_REQUEST', 'No fields to update', 400);
  }

  const updated = await prisma.server.update({
    where: { id },
    data: updateData,
    include: {
      node: { select: { id: true, name: true, address: true } },
      image: { select: { id: true, name: true } },
      owner: { select: { id: true, username: true, email: true } },
    },
  });

  logActivity(
    req.adminUser?.id,
    'server.updated',
    updated.UUID,
    { fields: Object.keys(updateData) },
    req.ip,
  );

  jsonOk(res, updated);
});

// ---------------------------------------------------------------------------
// DELETE /api/v2/admin/servers/:id — Delete server
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid server ID', 400);
  }

  const server = await prisma.server.findUnique({ where: { id } });
  if (!server) {
    return jsonError(res, 'NOT_FOUND', 'Server not found', 404);
  }

  // Notify daemon
  try {
    await daemonRequest(server.UUID, `/servers/${server.UUID}`, {
      method: 'DELETE',
      timeout: 10000,
    });
  } catch {
    // Best effort
  }

  await prisma.server.delete({ where: { id } });

  logActivity(
    req.adminUser?.id,
    'server.deleted',
    server.UUID,
    { name: server.name },
    req.ip,
  );

  jsonOk(res, { deleted: id });
});

// ---------------------------------------------------------------------------
// POST /api/v2/admin/servers/:id/suspend — Suspend server
// ---------------------------------------------------------------------------
router.post('/:id/suspend', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid server ID', 400);
  }

  const server = await prisma.server.findUnique({ where: { id } });
  if (!server) {
    return jsonError(res, 'NOT_FOUND', 'Server not found', 404);
  }

  if (server.Suspended) {
    return jsonError(res, 'BAD_REQUEST', 'Server is already suspended', 400);
  }

  const updated = await prisma.server.update({
    where: { id },
    data: { Suspended: true },
  });

  // Notify daemon to stop the server
  try {
    await daemonRequest(server.UUID, `/server/${server.UUID}/power`, {
      method: 'POST',
      body: { action: 'stop' },
    });
  } catch {
    // Best effort
  }

  logActivity(req.adminUser?.id, 'server.suspended', server.UUID, {}, req.ip);

  jsonOk(res, { suspended: true, serverId: updated.UUID });
});

// ---------------------------------------------------------------------------
// POST /api/v2/admin/servers/:id/unsuspend — Unsuspend server
// ---------------------------------------------------------------------------
router.post('/:id/unsuspend', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid server ID', 400);
  }

  const server = await prisma.server.findUnique({ where: { id } });
  if (!server) {
    return jsonError(res, 'NOT_FOUND', 'Server not found', 404);
  }

  if (!server.Suspended) {
    return jsonError(res, 'BAD_REQUEST', 'Server is not suspended', 400);
  }

  const updated = await prisma.server.update({
    where: { id },
    data: { Suspended: false },
  });

  logActivity(req.adminUser?.id, 'server.unsuspended', server.UUID, {}, req.ip);

  jsonOk(res, { suspended: false, serverId: updated.UUID });
});

// ---------------------------------------------------------------------------
// POST /api/v2/admin/servers/:id/transfer — Transfer server
// ---------------------------------------------------------------------------
router.post(
  '/:id/transfer',
  parseBody(adminTransferServerBody),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      return jsonError(res, 'BAD_REQUEST', 'Invalid server ID', 400);
    }

    const { ownerId } = req.validatedBody as { ownerId: number };

    const server = await prisma.server.findUnique({ where: { id } });
    if (!server) {
      return jsonError(res, 'NOT_FOUND', 'Server not found', 404);
    }

    const newOwner = await prisma.users.findUnique({ where: { id: ownerId } });
    if (!newOwner) {
      return jsonError(res, 'NOT_FOUND', 'New owner not found', 404);
    }

    const updated = await prisma.server.update({
      where: { id },
      data: { ownerId },
    });

    logActivity(
      req.adminUser?.id,
      'server.transferred',
      server.UUID,
      { fromOwnerId: server.ownerId, toOwnerId: ownerId },
      req.ip,
    );

    jsonOk(res, {
      transferred: true,
      serverId: updated.UUID,
      newOwnerId: ownerId,
    });
  },
);

// ---------------------------------------------------------------------------
// GET /api/v2/admin/servers/:id/transfer/status — Transfer poll
// ---------------------------------------------------------------------------
router.get('/:id/transfer/status', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid server ID', 400);
  }

  const state = getTransferState(id);
  if (!state) {
    return jsonOk(res, { status: 'idle' });
  }

  jsonOk(res, {
    status: state.status,
    error: state.error,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
    serverName: state.serverName,
    sourceNodeId: state.sourceNodeId,
    targetNodeId: state.targetNodeId,
  });
});

export default router;
