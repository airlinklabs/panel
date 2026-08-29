/**
 * V2 API — Admin locations, mounts, apikeys, addons, overview, radar, analytics, playerstats endpoints.
 *
 * Locations:
 *   GET    /api/v2/admin/locations
 *   POST   /api/v2/admin/locations
 *   PUT    /api/v2/admin/locations/:id
 *   DELETE /api/v2/admin/locations/:id
 *
 * Mounts:
 *   GET    /api/v2/admin/mounts
 *   POST   /api/v2/admin/mounts
 *   DELETE /api/v2/admin/mounts/:id
 *
 * API Keys:
 *   GET    /api/v2/admin/apikeys
 *   POST   /api/v2/admin/apikeys
 *   PUT    /api/v2/admin/apikeys/:id
 *   DELETE /api/v2/admin/apikeys/:id
 *   POST   /api/v2/admin/apikeys/:id/toggle
 *
 * Addons:
 *   GET    /api/v2/admin/addons
 *   POST   /api/v2/admin/addons/:slug/toggle
 *   POST   /api/v2/admin/addons/:slug/reload
 *   POST   /api/v2/admin/addons/:slug/uninstall
 *
 * Overview:
 *   GET    /api/v2/admin/overview/check-update
 *   POST   /api/v2/admin/overview/perform-update
 *
 * Radar:
 *   POST   /api/v2/admin/radar/scan/:serverId
 *
 * Analytics:
 *   GET    /api/v2/admin/analytics/summary
 *
 * Player Stats:
 *   GET    /api/v2/admin/playerstats
 *   POST   /api/v2/admin/playerstats/collect
 */

import { Router } from 'express';
import prisma from '../../../../db';
import { parseBody } from '../../../../utils/validation';
import { jsonOk, jsonError, requireAdmin, logActivity } from '../helpers';
import {
  adminCreateLocationBody,
  adminUpdateLocationBody,
  adminCreateMountBody,
  adminCreateApiKeyBody,
  adminUpdateApiKeyBody,
} from '../dto';

const router = Router();

router.use(async (req, res, next) => {
  const admin = await requireAdmin(req, res);
  if (!admin) {return;}
  (req as any).adminUser = admin;
  next();
});

// ======================== LOCATIONS ========================

router.get('/locations', async (_req, res) => {
  const locations = await prisma.location.findMany({
    include: { _count: { select: { nodes: true } } },
    orderBy: { createdAt: 'desc' },
  });
  jsonOk(res, locations);
});

router.post(
  '/locations',
  parseBody(adminCreateLocationBody),
  async (req, res) => {
    const data = req.validatedBody as any;
    const existing = await prisma.location.findUnique({
      where: { shortCode: data.shortCode },
    });
    if (existing)
    {return jsonError(res, 'CONFLICT', 'Short code already in use', 409);}
    const location = await prisma.location.create({ data });
    logActivity(
      (req as any).adminUser?.id,
      'location.created',
      undefined,
      { name: location.name },
      req.ip,
    );
    jsonOk(res, location);
  },
);

router.put(
  '/locations/:id',
  parseBody(adminUpdateLocationBody),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {return jsonError(res, 'BAD_REQUEST', 'Invalid ID', 400);}
    const existing = await prisma.location.findUnique({ where: { id } });
    if (!existing) {return jsonError(res, 'NOT_FOUND', 'Not found', 404);}
    const data = req.validatedBody as any;
    if (data.shortCode) {
      const dup = await prisma.location.findUnique({
        where: { shortCode: data.shortCode },
      });
      if (dup && dup.id !== id)
      {return jsonError(res, 'CONFLICT', 'Short code already in use', 409);}
    }
    const updated = await prisma.location.update({ where: { id }, data });
    jsonOk(res, updated);
  },
);

router.delete('/locations/:id', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {return jsonError(res, 'BAD_REQUEST', 'Invalid ID', 400);}
  const location = await prisma.location.findUnique({ where: { id } });
  if (!location) {return jsonError(res, 'NOT_FOUND', 'Not found', 404);}
  const nodeCount = await prisma.node.count({ where: { locationId: id } });
  if (nodeCount > 0)
  {return jsonError(
    res,
    'CONFLICT',
    `Cannot delete location with ${nodeCount} nodes`,
    409,
  );}
  await prisma.location.delete({ where: { id } });
  logActivity(
    (req as any).adminUser?.id,
    'location.deleted',
    undefined,
    { name: location.name },
    req.ip,
  );
  jsonOk(res, { deleted: id });
});

// ======================== MOUNTS ========================

router.get('/mounts', async (_req, res) => {
  const mounts = await prisma.mount.findMany({
    include: { _count: { select: { servers: true } } },
    orderBy: { createdAt: 'desc' },
  });
  jsonOk(res, mounts);
});

router.post('/mounts', parseBody(adminCreateMountBody), async (req, res) => {
  const data = req.validatedBody as any;
  const mount = await prisma.mount.create({ data });
  logActivity(
    (req as any).adminUser?.id,
    'mount.created',
    undefined,
    { name: mount.name },
    req.ip,
  );
  jsonOk(res, mount);
});

router.delete('/mounts/:id', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {return jsonError(res, 'BAD_REQUEST', 'Invalid ID', 400);}
  const mount = await prisma.mount.findUnique({ where: { id } });
  if (!mount) {return jsonError(res, 'NOT_FOUND', 'Not found', 404);}
  const serverCount = await prisma.serverMount.count({
    where: { mountId: id },
  });
  if (serverCount > 0)
  {return jsonError(
    res,
    'CONFLICT',
    `Cannot delete mount used by ${serverCount} servers`,
    409,
  );}
  await prisma.mount.delete({ where: { id } });
  logActivity(
    (req as any).adminUser?.id,
    'mount.deleted',
    undefined,
    { name: mount.name },
    req.ip,
  );
  jsonOk(res, { deleted: id });
});

// ======================== API KEYS ========================

router.get('/apikeys', async (_req, res) => {
  const keys = await prisma.apiKey.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      permissions: true,
      active: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  jsonOk(res, keys);
});

router.post('/apikeys', parseBody(adminCreateApiKeyBody), async (req, res) => {
  const data = req.validatedBody as any;
  const crypto = await import('crypto');
  const key = crypto.randomBytes(48).toString('base64url');
  const apiKey = await prisma.apiKey.create({
    data: {
      name: data.name,
      description: data.description,
      key,
      permissions: JSON.stringify(data.permissions ?? []),
    },
    select: {
      id: true,
      name: true,
      key: true,
      description: true,
      permissions: true,
      active: true,
      createdAt: true,
    },
  });
  logActivity(
    (req as any).adminUser?.id,
    'apikey.created',
    undefined,
    { name: data.name },
    req.ip,
  );
  jsonOk(res, apiKey);
});

router.put(
  '/apikeys/:id',
  parseBody(adminUpdateApiKeyBody),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {return jsonError(res, 'BAD_REQUEST', 'Invalid ID', 400);}
    const existing = await prisma.apiKey.findUnique({ where: { id } });
    if (!existing) {return jsonError(res, 'NOT_FOUND', 'Not found', 404);}
    const data = req.validatedBody as any;
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) {updateData.name = data.name;}
    if (data.description !== undefined)
    {updateData.description = data.description;}
    if (data.permissions !== undefined)
    {updateData.permissions = JSON.stringify(data.permissions);}
    if (data.active !== undefined) {updateData.active = data.active;}
    const updated = await prisma.apiKey.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        permissions: true,
        active: true,
        updatedAt: true,
      },
    });
    jsonOk(res, updated);
  },
);

router.delete('/apikeys/:id', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {return jsonError(res, 'BAD_REQUEST', 'Invalid ID', 400);}
  const existing = await prisma.apiKey.findUnique({ where: { id } });
  if (!existing) {return jsonError(res, 'NOT_FOUND', 'Not found', 404);}
  await prisma.apiKey.delete({ where: { id } });
  logActivity(
    (req as any).adminUser?.id,
    'apikey.deleted',
    undefined,
    { name: existing.name },
    req.ip,
  );
  jsonOk(res, { deleted: id });
});

router.post('/apikeys/:id/toggle', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {return jsonError(res, 'BAD_REQUEST', 'Invalid ID', 400);}
  const existing = await prisma.apiKey.findUnique({ where: { id } });
  if (!existing) {return jsonError(res, 'NOT_FOUND', 'Not found', 404);}
  const updated = await prisma.apiKey.update({
    where: { id },
    data: { active: !existing.active },
    select: { id: true, name: true, active: true },
  });
  jsonOk(res, updated);
});

// ======================== ADDONS ========================

router.get('/addons', async (_req, res) => {
  const addons = await prisma.addon.findMany({
    orderBy: { createdAt: 'desc' },
  });
  jsonOk(res, addons);
});

router.post('/addons/:slug/toggle', async (req, res) => {
  const addon = await prisma.addon.findUnique({
    where: { slug: String(req.params.slug) },
  });
  if (!addon) {return jsonError(res, 'NOT_FOUND', 'Addon not found', 404);}
  const updated = await prisma.addon.update({
    where: { slug: addon.slug },
    data: { enabled: !addon.enabled },
  });
  logActivity(
    (req as any).adminUser?.id,
    'addon.toggled',
    undefined,
    { slug: addon.slug, enabled: updated.enabled },
    req.ip,
  );
  jsonOk(res, updated);
});

router.post('/addons/:slug/reload', async (req, res) => {
  const addon = await prisma.addon.findUnique({
    where: { slug: String(req.params.slug) },
  });
  if (!addon) {return jsonError(res, 'NOT_FOUND', 'Addon not found', 404);}
  logActivity(
    (req as any).adminUser?.id,
    'addon.reloaded',
    undefined,
    { slug: addon.slug },
    req.ip,
  );
  jsonOk(res, { reloaded: addon.slug });
});

router.post('/addons/:slug/uninstall', async (req, res) => {
  const addon = await prisma.addon.findUnique({
    where: { slug: String(req.params.slug) },
  });
  if (!addon) {return jsonError(res, 'NOT_FOUND', 'Addon not found', 404);}
  await prisma.addon.delete({ where: { slug: addon.slug } });
  await prisma.addonSetting.deleteMany({ where: { addonSlug: addon.slug } });
  logActivity(
    (req as any).adminUser?.id,
    'addon.uninstalled',
    undefined,
    { slug: addon.slug },
    req.ip,
  );
  jsonOk(res, { uninstalled: addon.slug });
});

// ======================== OVERVIEW ========================

router.get('/overview/check-update', async (_req, res) => {
  try {
    const response = await fetch(
      'https://api.github.com/repos/airlinklabs/panel/releases/latest',
      {
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) {return jsonOk(res, { updateAvailable: false });}
    const release = (await response.json()) as {
      tag_name?: string;
      name?: string;
    };
    const currentVersion = process.env.AIRLINK_VERSION ?? '2.0.0';
    const latestVersion = release.tag_name ?? 'unknown';
    jsonOk(res, {
      updateAvailable: currentVersion !== latestVersion,
      currentVersion,
      latestVersion,
      releaseName: release.name,
    });
  } catch {
    jsonOk(res, {
      updateAvailable: false,
      error: 'Could not check for updates',
    });
  }
});

router.post('/overview/perform-update', async (req, res) => {
  try {
    const { execSync } = await import('child_process');
    execSync('git pull && npm install && npm run build', {
      cwd: process.cwd(),
      timeout: 120000,
    });
    logActivity(
      (req as any).adminUser?.id,
      'system.updated',
      undefined,
      {},
      req.ip,
    );
    jsonOk(res, { updated: true });
  } catch (err) {
    jsonError(res, 'UPDATE_FAILED', `Update failed: ${String(err)}`, 500);
  }
});

// ======================== RADAR ========================

router.post('/radar/scan/:serverId', async (req, res) => {
  const serverId = parseInt(String(req.params.serverId), 10);
  if (isNaN(serverId))
  {return jsonError(res, 'BAD_REQUEST', 'Invalid server ID', 400);}
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) {return jsonError(res, 'NOT_FOUND', 'Server not found', 404);}
  logActivity(
    (req as any).adminUser?.id,
    'radar.scan',
    server.UUID,
    {},
    req.ip,
  );
  jsonOk(res, { scanRequested: true, serverId });
});

// ======================== ANALYTICS ========================

router.get('/analytics/summary', async (_req, res) => {
  const [totalServers, totalUsers, totalNodes, onlineServers] =
    await Promise.all([
      prisma.server.count(),
      prisma.users.count(),
      prisma.node.count(),
      prisma.server.count({ where: { Running: true } }),
    ]);
  jsonOk(res, { totalServers, totalUsers, totalNodes, onlineServers });
});

// ======================== PLAYER STATS ========================

router.get('/playerstats', async (_req, res) => {
  const stats = await prisma.playerStats.findMany({
    orderBy: { timestamp: 'desc' },
    take: 100,
  });
  jsonOk(res, stats);
});

router.post('/playerstats/collect', async (req, res) => {
  logActivity(
    (req as any).adminUser?.id,
    'playerstats.collect',
    undefined,
    {},
    req.ip,
  );
  jsonOk(res, { collectRequested: true });
});

export default router;
