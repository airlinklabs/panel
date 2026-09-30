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
import logger from '../../../handlers/logger';
import { safeClientMessage } from '../../../utils/errors';
import {
  databaseNamesFor,
  deprovisionDatabase,
  provisionDatabase,
  rotateDatabasePassword,
} from '../../../handlers/utils/core/postgresProvisioner';

const router = Router({ mergeParams: true });

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

  // Pick the lowest free per-server name variant so creating a second
  // database never resets the first one's role password.
  const used = new Set(
    (
      await prisma.serverDatabase.findMany({
        where: { serverId: resolved.server.UUID },
        select: { databaseName: true },
      })
    ).map((row) => row.databaseName),
  );
  let suffix: number | undefined;
  for (let n = 1; n <= 100; n += 1) {
    if (!used.has(databaseNamesFor(resolved.server.UUID, n).databaseName)) {
      suffix = n > 1 ? n : undefined;
      break;
    }
    if (n === 100) {
      return jsonError(
        res,
        'BAD_REQUEST',
        'Too many databases for this server',
        400,
      );
    }
  }

  // Databases are panel-managed PostgreSQL — provision on the host directly;
  // the daemon has no role in this.
  let credentials: Awaited<ReturnType<typeof provisionDatabase>>;
  try {
    credentials = await provisionDatabase(host, resolved.server.UUID, suffix);
  } catch (error: unknown) {
    logger.error('Failed to provision database:', error);
    return jsonError(
      res,
      'DB_HOST_UNREACHABLE',
      safeClientMessage(error, 'Failed to connect to the database host.'),
      502,
    );
  }

  const db = await prisma.serverDatabase.create({
    data: {
      serverId: resolved.server.UUID,
      hostId,
      ...credentials,
    },
    include: {
      host: { select: { id: true, name: true, host: true, port: true } },
    },
  });

  logActivity(
    getAuthenticatedUserId(req),
    'database.created',
    resolved.server.UUID,
    { databaseName: db.databaseName, hostName: host.name },
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

  // Drop the database/role on the host. Best effort — a host that's
  // unreachable still loses the row so the UI stays consistent, matching the
  // page-route implementation.
  try {
    await deprovisionDatabase(db.host, db);
  } catch (error: unknown) {
    logger.error('Failed to deprovision database:', error);
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

  // Rotate the role password on the host directly.
  let newPassword: string;
  try {
    newPassword = await rotateDatabasePassword(db.host, db);
  } catch (error: unknown) {
    logger.error('Failed to rotate database password:', error);
    return jsonError(
      res,
      'DB_HOST_UNREACHABLE',
      safeClientMessage(error, 'Failed to connect to the database host.'),
      502,
    );
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
