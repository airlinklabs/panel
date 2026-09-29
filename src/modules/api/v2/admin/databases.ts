/**
 * V2 API — Admin databases endpoints.
 *
 * GET    /api/v2/admin/databases        — List database hosts
 * POST   /api/v2/admin/databases        — Create database host
 * POST   /api/v2/admin/databases/auto-host   — Find/create + test the default host
 * POST   /api/v2/admin/databases/auto-bucket — Create the default S3 bucket
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
import logger from '../../../../handlers/logger';
import { testDatabaseHost } from '../../../../handlers/utils/core/postgresProvisioner';
import { ensureS3Bucket } from '../../../../handlers/utils/core/s3Client';
import { safeClientMessage } from '../../../../utils/errors';
import { encrypt } from '../../../../utils/encryption';

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

// POST /api/v2/admin/databases/auto-host — reuse the first host or create one
// from the panel's own PG settings, then verify connectivity.
//
// Both the success and the handled-failure paths answer 200 with a
// `{ success }` flag: views/admin/databases/index.ejs branches on
// `data.success !== false` after a page-level `res.json(...)` proxy, and a
// non-2xx status would turn that into an HTML error page ("Network error.").
router.post('/auto-host', async (req, res) => {
  try {
    const hosts = await prisma.databaseHost.findMany({
      orderBy: { id: 'asc' },
    });
    let host = hosts[0];
    let created = false;
    if (!host) {
      host = await prisma.databaseHost.create({
        data: {
          name: 'Auto-generated host',
          host: process.env.PGHOST || '127.0.0.1',
          port: Number(process.env.PGPORT) || 5432,
          username: process.env.PGUSER || 'airlink',
          password: encrypt(
            process.env.PGPASSWORD || '',
            process.env.SESSION_SECRET || '',
          ),
        },
      });
      created = true;
      logActivity(
        req.adminUser?.id,
        'database_host.created',
        undefined,
        { name: host.name, source: 'auto' },
        req.ip,
      );
    }

    const result = await testDatabaseHost(host);

    let hostError: string | undefined;
    if (result.error) {
      hostError = safeClientMessage(
        result.error,
        'The database host could not be reached.',
      );
    }

    jsonOk(res, {
      success: result.success,
      created,
      hostId: host.id,
      latency: result.latency,
      error: hostError,
    });
  } catch (error: unknown) {
    logger.error('Error auto-generating database host:', error);
    jsonOk(res, {
      success: false,
      error: 'Failed to auto-generate database host.',
    });
  }
});

// POST /api/v2/admin/databases/auto-bucket — create the default S3 bucket.
// Same 200-with-`success` contract as /auto-host (see above).
router.post('/auto-bucket', async (_req, res) => {
  try {
    const { created } = await ensureS3Bucket();
    jsonOk(res, { success: true, created });
  } catch (error: unknown) {
    logger.error('Error auto-generating S3 bucket:', error);
    const message = error instanceof Error ? error.message : '';
    const unconfigured = message.includes('S3 not configured');
    jsonOk(res, {
      success: false,
      error: unconfigured
        ? 'S3 is not configured. Add your S3-compatible endpoint and credentials in Admin Settings first.'
        : safeClientMessage(error, 'Failed to auto-generate S3 bucket.'),
    });
  }
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
