/**
 * V2 API — Admin databases endpoints.
 *
 * GET    /api/v2/admin/databases        — List database hosts
 * POST   /api/v2/admin/databases        — Create database host
 * GET    /api/v2/admin/databases/:id    — Get database host
 * DELETE /api/v2/admin/databases/:id    — Delete database host
 * POST   /api/v2/admin/databases/:id/test — Test connection
 */

import { Router } from 'express';
import prisma from '../../../../db';
import { parseBody } from '../../../../utils/validation';
import { jsonOk, jsonError, requireAdmin, logActivity } from '../helpers';
import { adminCreateDbHostBody } from '../dto';
import { redisRateLimit } from '../../../../handlers/utils/security/redisRateLimit';

const router = Router();

router.use(async (req, res, next) => {
  const admin = await requireAdmin(req, res);
  if (!admin) {
    return;
  }
  req.adminUser = admin;
  next();
});

router.get('/', async (_req, res) => {
  const hosts = await prisma.databaseHost.findMany({
    include: {
      node: { select: { id: true, name: true } },
      _count: { select: { databases: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  jsonOk(res, hosts);
});

router.post('/', parseBody(adminCreateDbHostBody), async (req, res) => {
  const data = req.validatedBody as any;
  const host = await prisma.databaseHost.create({
    data: {
      name: data.name,
      host: data.host,
      port: data.port,
      username: data.username,
      password: data.password,
      nodeId: data.nodeId,
    },
    include: { node: { select: { id: true, name: true } } },
  });
  logActivity(
    req.adminUser?.id,
    'database_host.created',
    undefined,
    { name: host.name },
    req.ip,
  );
  jsonOk(res, host);
});

router.get('/:id', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid ID', 400);
  }
  const host = await prisma.databaseHost.findUnique({
    where: { id },
    include: {
      node: { select: { id: true, name: true } },
      _count: { select: { databases: true } },
    },
  });
  if (!host) {
    return jsonError(res, 'NOT_FOUND', 'Not found', 404);
  }
  jsonOk(res, host);
});

router.delete('/:id', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid ID', 400);
  }
  const host = await prisma.databaseHost.findUnique({ where: { id } });
  if (!host) {
    return jsonError(res, 'NOT_FOUND', 'Not found', 404);
  }
  await prisma.databaseHost.delete({ where: { id } });
  logActivity(
    req.adminUser?.id,
    'database_host.deleted',
    undefined,
    { name: host.name },
    req.ip,
  );
  jsonOk(res, { deleted: id });
});

router.post('/:id/test', redisRateLimit, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid ID', 400);
  }
  const host = await prisma.databaseHost.findUnique({ where: { id } });
  if (!host) {
    return jsonError(res, 'NOT_FOUND', 'Not found', 404);
  }
  try {
    const pg = await import('pg');
    const pool = new pg.Pool({
      host: host.host,
      port: host.port,
      user: host.username,
      password: host.password,
      database: 'postgres',
      connectionTimeoutMillis: 10_000,
      max: 1,
    });
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    await pool.end();
    jsonOk(res, { connected: true });
  } catch (err) {
    jsonOk(res, { connected: false, error: String(err) });
  }
});

export default router;
