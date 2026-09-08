/**
 * V2 API — Databases endpoints.
 *
 * GET    /api/v2/servers/:id/databases              — List databases
 * POST   /api/v2/servers/:id/databases              — Create database
 * DELETE /api/v2/servers/:id/databases/:dbId         — Delete database
 * POST   /api/v2/servers/:id/databases/:dbId/rotate  — Rotate password
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
import { createDatabaseBody } from './dto';
import { daemonRequestByNode } from '../../../services/daemonService';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/databases — List databases
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'databases')) {
    return;
  }

  const page = parsePage(req.query.page);
  const perPage = parsePerPage(req.query.perPage);
  const where = { serverId: resolved.server.UUID };

  const { data: databases, meta } = await paginateQuery(
    (args) =>
      prisma.serverDatabase.findMany({
        where,
        ...args,
        include: {
          host: { select: { id: true, name: true, host: true, port: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    () => prisma.serverDatabase.count({ where }),
    page,
    perPage,
  );

  jsonOk(res, databases, meta);
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/databases — Create database
// ---------------------------------------------------------------------------
router.post('/', parseBody(createDatabaseBody), async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'databases.create')) {
    return;
  }

  const { hostId } = req.validatedBody as { hostId: number };

  // Check database limit
  const dbCount = await prisma.serverDatabase.count({
    where: { serverId: resolved.server.UUID },
  });
  if (
    resolved.server.databaseLimit > 0 &&
    dbCount >= resolved.server.databaseLimit
  ) {
    return jsonError(res, 'FORBIDDEN', 'Database limit reached', 403);
  }

  const host = await prisma.databaseHost.findUnique({ where: { id: hostId } });
  if (!host) {
    return jsonError(res, 'NOT_FOUND', 'Database host not found', 404);
  }

  // Generate database name/user based on server UUID prefix
  const prefix = resolved.server.UUID.slice(0, 8).replace(/-/g, '');
  const databaseName = `s${prefix}_db${dbCount + 1}`;
  const databaseUser = `u${prefix}_u${dbCount + 1}`;

  // Generate random password
  const crypto = await import('crypto');
  const databasePassword = crypto.randomBytes(24).toString('base64url');

  // Create database on the host via daemon
  const nodeId = host.nodeId ?? resolved.server.nodeId;
  if (nodeId) {
    try {
      const response = await daemonRequestByNode(nodeId, '/databases', {
        method: 'POST',
        body: {
          host: host.host,
          port: host.port,
          username: host.username,
          password: host.password,
          database: databaseName,
          databaseUser,
          databasePassword,
        },
        timeout: 30000,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => 'Daemon error');
        return jsonError(
          res,
          'DAEMON_ERROR',
          `Failed to create database on host: ${text}`,
          502,
        );
      }
    } catch {
      return jsonError(
        res,
        'DAEMON_UNREACHABLE',
        'Could not reach daemon for database creation',
        502,
      );
    }
  }

  const db = await prisma.serverDatabase.create({
    data: {
      serverId: resolved.server.UUID,
      hostId,
      databaseName,
      databaseUser,
      databasePassword,
    },
    include: {
      host: { select: { id: true, name: true, host: true, port: true } },
    },
  });

  logActivity(
    getAuthenticatedUserId(req),
    'database.created',
    resolved.server.UUID,
    { databaseName, hostName: host.name },
    req.ip,
  );

  jsonOk(res, db);
});

// ---------------------------------------------------------------------------
// DELETE /api/v2/servers/:id/databases/:dbId — Delete database
// ---------------------------------------------------------------------------
router.delete('/:dbId', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'databases.delete')) {
    return;
  }

  const dbId = parseInt(String(req.params.dbId), 10);
  if (isNaN(dbId)) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid database ID', 400);
  }

  const db = await prisma.serverDatabase.findUnique({
    where: { id: dbId },
    include: { host: true },
  });
  if (!db || db.serverId !== resolved.server.UUID) {
    return jsonError(res, 'NOT_FOUND', 'Database not found', 404);
  }

  // Drop database on the host via daemon
  const nodeId = db.host.nodeId ?? resolved.server.nodeId;
  if (nodeId) {
    try {
      await daemonRequestByNode(nodeId, `/databases/${db.databaseName}`, {
        method: 'DELETE',
        body: {
          host: db.host.host,
          port: db.host.port,
          username: db.host.username,
          password: db.host.password,
        },
        timeout: 30000,
      });
    } catch {
      // Best effort — daemon may be offline
    }
  }

  await prisma.serverDatabase.delete({ where: { id: dbId } });

  logActivity(
    getAuthenticatedUserId(req),
    'database.deleted',
    resolved.server.UUID,
    { databaseName: db.databaseName },
    req.ip,
  );

  jsonOk(res, { deleted: db.databaseName });
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/databases/:dbId/rotate — Rotate password
// ---------------------------------------------------------------------------
router.post('/:dbId/rotate', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'databases')) {
    return;
  }

  const dbId = parseInt(String(req.params.dbId), 10);
  if (isNaN(dbId)) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid database ID', 400);
  }

  const db = await prisma.serverDatabase.findUnique({
    where: { id: dbId },
    include: { host: true },
  });
  if (!db || db.serverId !== resolved.server.UUID) {
    return jsonError(res, 'NOT_FOUND', 'Database not found', 404);
  }

  const crypto = await import('crypto');
  const newPassword = crypto.randomBytes(24).toString('base64url');

  // Rotate on host via daemon
  const nodeId = db.host.nodeId ?? resolved.server.nodeId;
  if (nodeId) {
    try {
      const response = await daemonRequestByNode(
        nodeId,
        `/databases/${db.databaseName}/rotate`,
        {
          method: 'POST',
          body: {
            host: db.host.host,
            port: db.host.port,
            username: db.host.username,
            password: db.host.password,
            databaseUser: db.databaseUser,
            newPassword,
          },
          timeout: 30000,
        },
      );

      if (!response.ok) {
        const text = await response.text().catch(() => 'Daemon error');
        return jsonError(
          res,
          'DAEMON_ERROR',
          `Failed to rotate password: ${text}`,
          502,
        );
      }
    } catch {
      return jsonError(
        res,
        'DAEMON_UNREACHABLE',
        'Could not reach daemon',
        502,
      );
    }
  }

  await prisma.serverDatabase.update({
    where: { id: dbId },
    data: { databasePassword: newPassword },
  });

  logActivity(
    getAuthenticatedUserId(req),
    'database.password.rotated',
    resolved.server.UUID,
    { databaseName: db.databaseName },
    req.ip,
  );

  jsonOk(res, { databaseName: db.databaseName, newPassword });
});

export default router;
