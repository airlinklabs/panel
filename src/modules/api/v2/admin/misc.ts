/**
 * V2 API — Admin locations, mounts, apikeys, addons, overview, radar, analytics, playerstats endpoints.
 *
 * Locations:
 *   GET    /api/v2/admin/locations
 *   GET    /api/v2/admin/locations/:id/nodes
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
 *   GET    /api/v2/admin/addons/store
 *   GET    /api/v2/admin/addons/store/list
 *   GET    /api/v2/admin/addons/store/discussions
 *   GET    /api/v2/admin/addons/:id
 *   POST   /api/v2/admin/addons/reload
 *   POST   /api/v2/admin/addons/:id/capability
 *   POST   /api/v2/admin/addons/:id/command/:commandId
 *   POST   /api/v2/admin/addons/:id/settings
 *   POST   /api/v2/admin/addons/store/install
 *   POST   /api/v2/admin/addons/store/uninstall
 *   POST   /api/v2/admin/addons/:slug/toggle
 *   POST   /api/v2/admin/addons/:slug/reload
 *   POST   /api/v2/admin/addons/:slug/uninstall
 *
 * Overview:
 *   GET    /api/v2/admin/overview/check-update
 *   POST   /api/v2/admin/overview/perform-update
 *
 * Radar:
 *   GET    /api/v2/admin/radar
 *   POST   /api/v2/admin/radar/scan/:serverId
 *   GET    /api/v2/admin/radar/virustotal-enabled
 *   GET    /api/v2/admin/radar/virustotal
 *   GET    /api/v2/admin/radar/scripts
 *   GET    /api/v2/admin/radar/scripts/:id
 *   POST   /api/v2/admin/radar/scripts
 *   POST   /api/v2/admin/radar/scripts/:id
 *   POST   /api/v2/admin/radar/scripts/:id/delete
 *   GET    /api/v2/admin/radar/virustotal/scan/:hash
 *   POST   /api/v2/admin/radar/virustotal/:hash
 *   POST   /api/v2/admin/radar/vtscan/:serverId
 *   POST   /api/v2/admin/radar/virustotal
 *
 * Analytics:
 *   GET    /api/v2/admin/analytics/summary
 *
 * Player Stats:
 *   GET    /api/v2/admin/playerstats
 *   POST   /api/v2/admin/playerstats/collect
 */

import { Router } from 'express';
import type { Response } from 'express';
import prisma from '../../../../db';
import { parseBody } from '../../../../utils/validation';
import { jsonOk, jsonError, requireAdmin, logActivity } from '../helpers';
import {
  adminCreateLocationBody,
  adminUpdateLocationBody,
  adminCreateMountBody,
  adminCreateApiKeyBody,
  adminUpdateApiKeyBody,
  adminRadarScriptBody,
  adminRadarScriptUpdateBody,
  adminRadarVtPostBody,
  adminAddonCapabilityBody,
  adminAddonSettingsBody,
  adminAddonCommandBody,
  RADAR_SCRIPT_ID_RE,
  ADDON_CAPABILITIES,
} from '../dto';
import {
  getSettings,
  invalidateSettingsCache,
} from '../../../../handlers/settingsCache';
import { parseAddonManifest } from '../../../../handlers/addonManifest';
import { commandRegistry } from '../../../../handlers/addonCommands';
import { containPath } from '../../../../utils/pathSecurity';
import logger from '../../../../handlers/logger';
import { redisRateLimit } from '../../../../handlers/utils/security/redisRateLimit';
import fs from 'fs/promises';
import path from 'path';
import { httpGet } from '../../../../utils/http';
import { getSystemLogs } from '../../../../services/systemLogService';
import {
  PANEL_UPDATE_API_BASE,
  VT_API_BASE,
  VT_GUI_FILE_URL,
  VT_GUI_UPLOAD_URL,
} from '../../../../config/urls';
import {
  VT_POLL_INTERVAL_MS,
  DEFAULT_DAEMON_TIMEOUT_MS,
} from '../../../../config/timeouts';
import {
  DAEMON_TIMEOUT_MEDIUM_MS,
  DAEMON_TIMEOUT_VT_UPLOAD_MS,
  DAEMON_TIMEOUT_VT_WAIT_MS,
  DAEMON_TIMEOUT_RADAR_ZIP_MS,
} from '../../../../config/daemonTimeouts';
import { VT_FILE_LIMIT_BYTES } from '../../../../config/limits';

const router = Router();

router.use(async (req, res, next) => {
  const admin = await requireAdmin(req, res);
  if (!admin) {
    return;
  }
  req.adminUser = admin;
  next();
});

// ======================== SHARED HELPERS ========================

/** Radar scripts live as `<id>.json` files under storage/radar. */
const RADAR_DIR = path.join(__dirname, '../../../../storage/radar');
const VT_HASH_RE = /^[a-fA-F0-9]{32,64}$/;

async function ensureRadarDir(): Promise<string> {
  try {
    await fs.access(RADAR_DIR);
  } catch {
    await fs.mkdir(RADAR_DIR, { recursive: true });
  }
  return RADAR_DIR;
}

interface RadarScriptSummary {
  id: string;
  name: string;
  description: string;
  version: string;
  filename: string;
}

/** Read every script file, tolerating individually malformed JSON. */
async function listRadarScripts(): Promise<RadarScriptSummary[]> {
  const radarDir = await ensureRadarDir();
  const files = await fs.readdir(radarDir);
  return Promise.all(
    files
      .filter((file) => file.endsWith('.json'))
      .map(async (file) => {
        const content = await fs.readFile(path.join(radarDir, file), 'utf-8');
        try {
          const scriptData = JSON.parse(content) as Record<string, unknown>;
          return {
            id: file.replace('.json', ''),
            name: (scriptData.name as string) || file,
            description: (scriptData.description as string) || '',
            version: (scriptData.version as string) || '1.0.0',
            filename: file,
          };
        } catch {
          return {
            id: file.replace('.json', ''),
            name: file,
            description: 'Invalid script format',
            version: 'unknown',
            filename: file,
          };
        }
      }),
  );
}

function radarScriptPath(id: string): string {
  return path.join(RADAR_DIR, `${id}.json`);
}

/** Derive a traversal-safe script id from a human-readable script name. */
function slugifyRadarScriptId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  if (base && RADAR_SCRIPT_ID_RE.test(base)) {
    return base;
  }
  return `script-${Date.now().toString(36)}`;
}

/** Resolve a script id from the URL, rejecting traversal attempts. */
function readRadarScriptId(raw: unknown): string | null {
  const id = String(raw ?? '');
  return RADAR_SCRIPT_ID_RE.test(id) ? id : null;
}

// In-memory rate limiter respecting the VT free tier: 4/min, 500/day.
const vtRateLimit = {
  minuteWindow: 0,
  minuteCount: 0,
  dayWindow: 0,
  dayCount: 0,
  allow(): boolean {
    const now = Math.floor(Date.now() / 1000);
    const minute = Math.floor(now / 60);
    if (minute !== this.minuteWindow) {
      this.minuteWindow = minute;
      this.minuteCount = 0;
    }
    if (this.minuteCount >= 4) {
      return false;
    }
    this.minuteCount++;
    return true;
  },
  allowDaily(): boolean {
    const day = Math.floor(Date.now() / 86400000);
    if (day !== this.dayWindow) {
      this.dayWindow = day;
      this.dayCount = 0;
    }
    if (this.dayCount >= 500) {
      return false;
    }
    this.dayCount++;
    return true;
  },
};

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
    if (existing) {
      return jsonError(res, 'CONFLICT', 'Short code already in use', 409);
    }
    const location = await prisma.location.create({ data });
    logActivity(
      req.adminUser?.id,
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
    if (isNaN(id)) {
      return jsonError(res, 'BAD_REQUEST', 'Invalid ID', 400);
    }
    const existing = await prisma.location.findUnique({ where: { id } });
    if (!existing) {
      return jsonError(res, 'NOT_FOUND', 'Not found', 404);
    }
    const data = req.validatedBody as any;
    if (data.shortCode) {
      const dup = await prisma.location.findUnique({
        where: { shortCode: data.shortCode },
      });
      if (dup && dup.id !== id) {
        return jsonError(res, 'CONFLICT', 'Short code already in use', 409);
      }
    }
    const updated = await prisma.location.update({ where: { id }, data });
    jsonOk(res, updated);
  },
);

router.delete('/locations/:id', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid ID', 400);
  }
  const location = await prisma.location.findUnique({ where: { id } });
  if (!location) {
    return jsonError(res, 'NOT_FOUND', 'Not found', 404);
  }
  const nodeCount = await prisma.node.count({ where: { locationId: id } });
  if (nodeCount > 0) {
    return jsonError(
      res,
      'CONFLICT',
      `Cannot delete location with ${nodeCount} nodes`,
      409,
    );
  }
  await prisma.location.delete({ where: { id } });
  logActivity(
    req.adminUser?.id,
    'location.deleted',
    undefined,
    { name: location.name },
    req.ip,
  );
  jsonOk(res, { deleted: id });
});

// GET /api/v2/admin/locations/:id/nodes — nodes belonging to a location
router.get('/locations/:id/nodes', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid ID', 400);
  }
  const location = await prisma.location.findUnique({ where: { id } });
  if (!location) {
    return jsonError(res, 'NOT_FOUND', 'Location not found', 404);
  }
  const nodes = await prisma.node.findMany({
    where: { locationId: id },
    include: { servers: { select: { id: true } } },
    orderBy: { name: 'asc' },
  });
  jsonOk(res, nodes);
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
    req.adminUser?.id,
    'mount.created',
    undefined,
    { name: mount.name },
    req.ip,
  );
  jsonOk(res, mount);
});

router.delete('/mounts/:id', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid ID', 400);
  }
  const mount = await prisma.mount.findUnique({ where: { id } });
  if (!mount) {
    return jsonError(res, 'NOT_FOUND', 'Not found', 404);
  }
  const serverCount = await prisma.serverMount.count({
    where: { mountId: id },
  });
  if (serverCount > 0) {
    return jsonError(
      res,
      'CONFLICT',
      `Cannot delete mount used by ${serverCount} servers`,
      409,
    );
  }
  await prisma.mount.delete({ where: { id } });
  logActivity(
    req.adminUser?.id,
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
      permissions: data.permissions ?? [],
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
    req.adminUser?.id,
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
    if (isNaN(id)) {
      return jsonError(res, 'BAD_REQUEST', 'Invalid ID', 400);
    }
    const existing = await prisma.apiKey.findUnique({ where: { id } });
    if (!existing) {
      return jsonError(res, 'NOT_FOUND', 'Not found', 404);
    }
    const data = req.validatedBody as any;
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    if (data.permissions !== undefined) {
      updateData.permissions = data.permissions;
    }
    if (data.active !== undefined) {
      updateData.active = data.active;
    }
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
  if (isNaN(id)) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid ID', 400);
  }
  const existing = await prisma.apiKey.findUnique({ where: { id } });
  if (!existing) {
    return jsonError(res, 'NOT_FOUND', 'Not found', 404);
  }
  await prisma.apiKey.delete({ where: { id } });
  logActivity(
    req.adminUser?.id,
    'apikey.deleted',
    undefined,
    { name: existing.name },
    req.ip,
  );
  jsonOk(res, { deleted: id });
});

router.post('/apikeys/:id/toggle', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid ID', 400);
  }
  const existing = await prisma.apiKey.findUnique({ where: { id } });
  if (!existing) {
    return jsonError(res, 'NOT_FOUND', 'Not found', 404);
  }
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

// The addon store is deliberately switched off upstream ("coming soon").
// Answer with a 200 + `available:false` payload rather than the legacy 410:
// these paths are proxied by page routes that do `res.json(await apiGet(...))`
// / `apiPost(...)`, and a non-2xx status turns them into HTML error pages.
const ADDON_STORE_UNAVAILABLE = {
  available: false,
  message: 'Addon store is not available yet.',
} as const;

// GET /api/v2/admin/addons/store — store page payload (installed addons;
// views/admin/addons/store.ejs renders `addons.length` from this)
router.get('/addons/store', async (_req, res) => {
  const addons = await prisma.addon.findMany({
    orderBy: { createdAt: 'desc' },
  });
  jsonOk(res, addons);
});

// GET /api/v2/admin/addons/store/list — catalogue (disabled)
router.get('/addons/store/list', (_req, res) => {
  jsonOk(res, ADDON_STORE_UNAVAILABLE);
});

// GET /api/v2/admin/addons/store/discussions — discussions (disabled)
router.get('/addons/store/discussions', (_req, res) => {
  jsonOk(res, ADDON_STORE_UNAVAILABLE);
});

// POST /api/v2/admin/addons/store/install — install from store (disabled)
router.post('/addons/store/install', (_req, res) => {
  jsonOk(res, ADDON_STORE_UNAVAILABLE);
});

// POST /api/v2/admin/addons/store/uninstall — uninstall from store (disabled)
router.post('/addons/store/uninstall', (_req, res) => {
  jsonOk(res, ADDON_STORE_UNAVAILABLE);
});

/**
 * Resolve storage/addons/<slug> with a traversal guard. `containPath` throws
 * when the base directory does not exist yet, so fall back to a lexical check.
 */
function resolveAddonDir(slug: string): string | null {
  const addonsDir = path.join(__dirname, '../../../../storage/addons');
  const addonDir = path.join(addonsDir, slug);
  try {
    return containPath(addonsDir, addonDir) ? addonDir : null;
  } catch {
    const base = path.resolve(addonsDir);
    const resolved = path.resolve(addonDir);
    return resolved.startsWith(base + path.sep) ? resolved : null;
  }
}

// GET /api/v2/admin/addons/:id — addon detail (`:id` is the addon slug)
// Payload is FLAT: views/admin/addons/detail.ejs reads addon.name / slug /
// enabled / settings / commands / capabilities directly off the local.
router.get('/addons/:id', async (req, res) => {
  const slug = String(req.params.id);
  const addon = await prisma.addon.findUnique({ where: { slug } });
  if (!addon) {
    return jsonError(res, 'NOT_FOUND', 'Addon not found', 404);
  }

  const addonDir = resolveAddonDir(slug);
  if (!addonDir) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid addon slug', 400);
  }

  const manifestResult = parseAddonManifest(
    path.join(addonDir, 'package.json'),
    slug,
  );
  const manifest = manifestResult.success ? manifestResult.manifest : null;

  const commands = commandRegistry
    .getAddonCommands(slug)
    .map((c) => ({ name: c.name, description: c.description }));

  const rows = await prisma.addonSetting.findMany({
    where: { addonSlug: slug },
  });
  const settings: Record<string, string> = {};
  const capabilityOverrides: Record<string, string> = {};
  for (const row of rows) {
    if (row.key.startsWith('capability.')) {
      capabilityOverrides[row.key.slice('capability.'.length)] = row.value;
    } else {
      settings[row.key] = row.value;
    }
  }

  const declared = manifest?.capabilities ?? {};
  const capabilities = ADDON_CAPABILITIES.filter(
    (name) => declared[name] !== undefined || capabilityOverrides[name] !== undefined,
  ).map((name) => ({
    name,
    enabled:
      capabilityOverrides[name] !== undefined
        ? capabilityOverrides[name] === 'true'
        : declared[name] === true,
  }));

  jsonOk(res, { ...addon, settings, commands, capabilities, manifest });
});

// POST /api/v2/admin/addons/reload — reload EVERY addon.
// views/admin/addons/index.ejs posts here with no slug, so this cannot be
// served by POST /addons/:slug/reload.
router.post('/addons/reload', async (req, res) => {
  try {
    const { reloadAddons } = await import('../../../../handlers/addonHandler');
    const result = await reloadAddons(req.app);
    logActivity(
      req.adminUser?.id,
      'addon.reloaded',
      undefined,
      { all: true, success: result.success },
      req.ip,
    );
    jsonOk(res, { reloaded: true, ...result });
  } catch (error) {
    logger.error('Error reloading addons:', error);
    jsonError(res, 'RELOAD_FAILED', 'Failed to reload addons', 500);
  }
});

// POST /api/v2/admin/addons/:id/capability — grant/revoke a capability
router.post(
  '/addons/:id/capability',
  parseBody(adminAddonCapabilityBody),
  async (req, res) => {
    const slug = String(req.params.id);
    const addon = await prisma.addon.findUnique({ where: { slug } });
    if (!addon) {
      return jsonError(res, 'NOT_FOUND', 'Addon not found', 404);
    }

    const { capability, enabled } = req.validatedBody as {
      capability: string;
      enabled: boolean;
    };

    await prisma.addonSetting.upsert({
      where: {
        addonSlug_key: { addonSlug: slug, key: `capability.${capability}` },
      },
      create: {
        addonSlug: slug,
        key: `capability.${capability}`,
        value: enabled ? 'true' : 'false',
      },
      update: { value: enabled ? 'true' : 'false' },
    });

    logActivity(
      req.adminUser?.id,
      'addon.capability',
      undefined,
      { slug, capability, enabled },
      req.ip,
    );

    jsonOk(res, { slug, capability, enabled });
  },
);

// POST /api/v2/admin/addons/:id/command/:commandId — run an addon command.
// The view posts with no body at all, so the args come from an optional key.
router.post(
  '/addons/:id/command/:commandId',
  parseBody(adminAddonCommandBody),
  async (req, res) => {
    const slug = String(req.params.id);
    const commandId = String(req.params.commandId);
    const { args } = req.validatedBody as { args?: unknown };

    const parsedArgs = Array.isArray(args) ? args.map((a) => String(a)) : [];
    const output = await commandRegistry.execute(
      `${slug}:${commandId}`,
      parsedArgs,
    );

    logActivity(
      req.adminUser?.id,
      'addon.command',
      undefined,
      { slug, command: commandId },
      req.ip,
    );

    jsonOk(res, { slug, command: commandId, output });
  },
);

// POST /api/v2/admin/addons/:id/settings — save keys declared by the addon's
// manifest settingsSchema (unknown keys are ignored, booleans/numbers are
// normalised to strings before the upsert).
router.post(
  '/addons/:id/settings',
  parseBody(adminAddonSettingsBody),
  async (req, res) => {
    const slug = String(req.params.id);
    const addon = await prisma.addon.findUnique({ where: { slug } });
    if (!addon) {
      return jsonError(res, 'NOT_FOUND', 'Addon not found', 404);
    }

    const addonDir = resolveAddonDir(slug);
    if (!addonDir) {
      return jsonError(res, 'BAD_REQUEST', 'Invalid addon slug', 400);
    }

    const manifestResult = parseAddonManifest(
      path.join(addonDir, 'package.json'),
      slug,
    );
    if (!manifestResult.success || !manifestResult.manifest.settingsSchema) {
      return jsonError(
        res,
        'BAD_REQUEST',
        'Addon has no settings schema',
        400,
      );
    }

    const schema = manifestResult.manifest.settingsSchema;
    const rawBody = (req.validatedBody ?? {}) as Record<string, unknown>;
    const updates: Record<string, string> = {};

    for (const field of schema) {
      if (!(field.key in rawBody)) {
        continue;
      }
      const value = rawBody[field.key];
      if (field.type === 'boolean') {
        updates[field.key] = value === 'true' || value === true ? 'true' : 'false';
      } else if (field.type === 'number') {
        const num = Number(value);
        if (Number.isNaN(num)) {
          continue;
        }
        updates[field.key] = String(num);
      } else {
        updates[field.key] = String(value);
      }
    }

    for (const [key, value] of Object.entries(updates)) {
      await prisma.addonSetting.upsert({
        where: { addonSlug_key: { addonSlug: slug, key } },
        create: { addonSlug: slug, key, value },
        update: { value },
      });
    }

    logActivity(
      req.adminUser?.id,
      'addon.settings.updated',
      undefined,
      { slug, keys: Object.keys(updates) },
      req.ip,
    );

    jsonOk(res, { slug, updated: Object.keys(updates) });
  },
);

router.post('/addons/:slug/toggle', async (req, res) => {
  const addon = await prisma.addon.findUnique({
    where: { slug: String(req.params.slug) },
  });
  if (!addon) {
    return jsonError(res, 'NOT_FOUND', 'Addon not found', 404);
  }
  const updated = await prisma.addon.update({
    where: { slug: addon.slug },
    data: { enabled: !addon.enabled },
  });
  logActivity(
    req.adminUser?.id,
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
  if (!addon) {
    return jsonError(res, 'NOT_FOUND', 'Addon not found', 404);
  }
  logActivity(
    req.adminUser?.id,
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
  if (!addon) {
    return jsonError(res, 'NOT_FOUND', 'Addon not found', 404);
  }
  await prisma.addon.delete({ where: { slug: addon.slug } });
  await prisma.addonSetting.deleteMany({ where: { addonSlug: addon.slug } });
  logActivity(
    req.adminUser?.id,
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
    const response = await fetch(`${PANEL_UPDATE_API_BASE}/releases/latest`, {
      signal: AbortSignal.timeout(DEFAULT_DAEMON_TIMEOUT_MS),
    });
    if (!response.ok) {
      return jsonOk(res, { updateAvailable: false });
    }
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

router.post('/overview/perform-update', redisRateLimit, async (req, res) => {
  try {
    const { execSync } = await import('child_process');
    execSync('git pull && npm install && npm run build', {
      cwd: process.cwd(),
      timeout: DAEMON_TIMEOUT_RADAR_ZIP_MS,
    });
    logActivity(req.adminUser?.id, 'system.updated', undefined, {}, req.ip);
    jsonOk(res, { updated: true });
  } catch (err) {
    jsonError(res, 'UPDATE_FAILED', `Update failed: ${String(err)}`, 500);
  }
});

// ======================== RADAR ========================

router.post('/radar/scan/:serverId', async (req, res) => {
  const serverId = parseInt(String(req.params.serverId), 10);
  if (isNaN(serverId)) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid server ID', 400);
  }
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) {
    return jsonError(res, 'NOT_FOUND', 'Server not found', 404);
  }
  logActivity(req.adminUser?.id, 'radar.scan', server.UUID, {}, req.ip);
  jsonOk(res, { scanRequested: true, serverId });
});

// ---------------------------------------------------------------------------
// GET /api/v2/admin/radar/virustotal-enabled — VT status check
// ---------------------------------------------------------------------------
router.get('/radar/virustotal-enabled', async (_req, res) => {
  try {
    const settings = await getSettings();
    jsonOk(res, { enabled: !!settings?.virusTotalApiKey });
  } catch {
    jsonOk(res, { enabled: false });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v2/admin/radar/scripts — List radar scan scripts
// ---------------------------------------------------------------------------
router.get('/radar/scripts', redisRateLimit, async (_req, res) => {
  try {
    jsonOk(res, await listRadarScripts());
  } catch (error: unknown) {
    logger.error('Error fetching radar scripts:', error);
    jsonError(res, 'SCRIPTS_ERROR', 'Failed to fetch radar scripts', 500);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/admin/radar/vtscan/:serverId — VT file scan
// ---------------------------------------------------------------------------
router.post('/radar/vtscan/:serverId', async (req, res) => {
  const settings = await getSettings();
  const apiKey = settings?.virusTotalApiKey;

  if (!apiKey) {
    return jsonError(
      res,
      'VT_NOT_CONFIGURED',
      'VirusTotal API key is not configured. Add it in Admin Settings.',
      503,
    );
  }

  const serverId = parseInt(String(req.params.serverId), 10);
  if (isNaN(serverId)) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid server ID', 400);
  }

  const server = await prisma.server.findUnique({
    where: { id: serverId },
    include: { node: true },
  });
  if (!server) {
    return jsonError(res, 'NOT_FOUND', 'Server not found', 404);
  }

  try {
    const { default: fsSync } = await import('fs');
    const { default: pathMod } = await import('path');

    const tmpPath = pathMod.join(
      '/tmp',
      `vtscan-${server.UUID}-${Date.now()}.zip`,
    );

    // Import daemonRequest from the services layer
    const { daemonRequest } =
      await import('../../../../services/daemonService');

    const zipResponse = await daemonRequest(server.UUID, '/radar/zip', {
      method: 'POST',
      body: {
        id: server.UUID,
        include: ['plugins', 'mods', 'config', 'addons', 'datapacks'],
        exclude: [
          'world',
          'world_nether',
          'world_the_end',
          'logs',
          'cache',
          'crash-reports',
        ],
        maxFileSizeMb: 32,
      },
      timeout: DAEMON_TIMEOUT_RADAR_ZIP_MS,
    });

    if (!zipResponse.ok) {
      return jsonError(
        res,
        'DAEMON_ERROR',
        `Daemon returned ${zipResponse.status}`,
        502,
      );
    }

    const buffer = Buffer.from(await zipResponse.arrayBuffer());
    fsSync.writeFileSync(tmpPath, buffer);

    const stat = fsSync.statSync(tmpPath);
    if (stat.size > VT_FILE_LIMIT_BYTES) {
      fsSync.unlinkSync(tmpPath);
      return jsonError(
        res,
        'FILE_TOO_LARGE',
        'Zipped server files exceed 32 MB — VT free tier limit.',
        413,
      );
    }

    const fileBuffer = fsSync.readFileSync(tmpPath);
    const boundary = `----FormBoundary${Math.random().toString(36).slice(2)}`;
    const fileName = `${server.name}-scan.zip`;

    const formBody = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
          'Content-Type: application/zip\r\n\r\n',
      ),
      fileBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const { httpPost } = await import('../../../../utils/http');

    const uploadResponse = await httpPost<Record<string, unknown>>(
      `${VT_API_BASE}/files`,
      formBody,
      {
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'x-apikey': apiKey,
        },
        timeout: DAEMON_TIMEOUT_VT_UPLOAD_MS,
      },
    );

    fsSync.unlinkSync(tmpPath);

    if (uploadResponse.status !== 200 && uploadResponse.status !== 409) {
      return jsonError(
        res,
        'VT_ERROR',
        `VT returned status ${uploadResponse.status}`,
        502,
      );
    }

    const vtUploadData = uploadResponse.data as {
      data?: { id?: string };
    };
    const analysisId = vtUploadData?.data?.id;
    if (!analysisId) {
      return jsonError(
        res,
        'VT_ERROR',
        'VT did not return an analysis ID',
        502,
      );
    }

    // Poll VT up to 8 times, 20s apart
    let analysisData: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise((r) => setTimeout(r, VT_POLL_INTERVAL_MS));

      const pollResponse = await httpGet<Record<string, unknown>>(
        `${VT_API_BASE}/analyses/${analysisId}`,
        { headers: { 'x-apikey': apiKey }, timeout: DAEMON_TIMEOUT_VT_WAIT_MS },
      );

      const pollData = pollResponse.data as Record<string, unknown> | undefined;
      const status = (
        (pollData?.data as Record<string, unknown> | undefined)?.attributes as
          Record<string, unknown> | undefined
      )?.status;
      if (status === 'completed') {
        analysisData = pollResponse.data;
        break;
      }
    }

    if (!analysisData) {
      return jsonOk(res, {
        pending: true,
        analysisId,
        vtLink: VT_GUI_UPLOAD_URL,
      });
    }

    const meta = analysisData.meta as Record<string, unknown> | undefined;
    const fileInfo = meta?.file_info as Record<string, unknown> | undefined;
    const sha256 = fileInfo?.sha256 as string | undefined;
    const vtLink = sha256 ? VT_GUI_FILE_URL(sha256) : VT_GUI_UPLOAD_URL;

    const dataAttrs = (analysisData.data as Record<string, unknown>)
      ?.attributes as Record<string, unknown> | undefined;
    const results = (dataAttrs?.results || {}) as Record<
      string,
      Record<string, unknown>
    >;
    const stats = (dataAttrs?.stats || {}) as Record<string, number>;
    const maliciousEngines = Object.entries(results)
      .filter(
        ([, v]) => v.category === 'malicious' || v.category === 'suspicious',
      )
      .map(([engine, v]) => ({ engine, result: v.result }));

    jsonOk(res, {
      pending: false,
      serverName: server.name,
      maliciousEngines,
      stats,
      totalEngines: Object.keys(results).length,
      vtLink,
    });
  } catch (error: unknown) {
    logger.error(
      'VT file scan error:',
      error instanceof Error ? error.message : error,
    );
    jsonError(res, 'VT_SCAN_FAILED', 'File scan failed', 502);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/admin/radar/virustotal — dual mode.
//   { enabled, apiKey? } → save VT config. Nothing posts this since the
//     Radar tab dropped its VirusTotal settings card (Admin → Settings owns
//     virusTotalApiKey); the mode is kept so the endpoint stays backward
//     compatible for addons.
//   { hash }             → legacy VirusTotal hash lookup (still used by the
//     Radar tab's hash-lookup card)
// ---------------------------------------------------------------------------
router.post(
  '/radar/virustotal',
  parseBody(adminRadarVtPostBody),
  async (req, res) => {
    const body = req.validatedBody as Record<string, unknown>;

    if (!('hash' in body)) {
      const settings = await prisma.settings.findFirst();
      if (!settings) {
        return jsonError(res, 'NOT_FOUND', 'Settings not found', 404);
      }

      // There is no separate "enabled" column — enabled ⇔ a key is stored.
      const enabled = body.enabled === true;
      const rawKey = body.virusTotalApiKey ?? body.apiKey;
      let apiKey = settings.virusTotalApiKey ?? '';
      if (typeof rawKey === 'string') {
        apiKey = rawKey.trim();
      }
      if (!enabled) {
        apiKey = '';
      }

      const updated = await prisma.settings.update({
        where: { id: settings.id },
        data: { virusTotalApiKey: apiKey.length > 0 ? apiKey : null },
      });
      invalidateSettingsCache();

      logActivity(
        req.adminUser?.id,
        'settings.virustotal.updated',
        undefined,
        { enabled: !!updated.virusTotalApiKey },
        req.ip,
      );

      return jsonOk(res, {
        enabled: !!updated.virusTotalApiKey,
        virusTotalApiKey: updated.virusTotalApiKey,
      });
    }

    sendVtOutcome(res, await lookupVtHash(String(body.hash)));
  },
);

// ======================== RADAR (page data + script CRUD) ========================

// GET /api/v2/admin/radar — radar page payload (settings row + script list).
// No page consumes it as a whole since Radar became a tab on /admin/servers:
// that tab's markup is static, and Settings owns the VirusTotal key. Kept as
// an endpoint because the per-feature calls (scan, virustotal/scan, scripts)
// sit alongside it and an empty key check is cheap.
router.get('/radar', async (_req, res) => {
  const settings = await getSettings();
  const scripts = await listRadarScripts().catch(() => []);
  jsonOk(res, {
    settings: settings ?? {},
    scripts,
    stats: {
      scriptCount: scripts.length,
      virustotalEnabled: !!settings?.virusTotalApiKey,
    },
  });
});

// GET /api/v2/admin/radar/scripts/:id — single script (edit form payload)
router.get('/radar/scripts/:id', async (req, res) => {
  const id = readRadarScriptId(req.params.id);
  if (!id) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid script ID', 400);
  }
  let raw: string;
  try {
    raw = await fs.readFile(radarScriptPath(id), 'utf-8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return jsonError(res, 'NOT_FOUND', 'Script not found', 404);
    }
    logger.error('Error reading radar script:', error);
    return jsonError(res, 'SCRIPT_ERROR', 'Failed to read radar script', 500);
  }
  try {
    const script = JSON.parse(raw) as Record<string, unknown>;
    jsonOk(res, { ...script, id, filename: `${id}.json` });
  } catch {
    jsonError(res, 'SCRIPT_INVALID', 'Invalid script format', 500);
  }
});

// POST /api/v2/admin/radar/scripts — create a script
router.post(
  '/radar/scripts',
  parseBody(adminRadarScriptBody),
  async (req, res) => {
    const data = req.validatedBody as Record<string, unknown> & { name: string };
    const id =
      typeof data.id === 'string' && data.id.length > 0
        ? data.id
        : slugifyRadarScriptId(data.name);
    if (!RADAR_SCRIPT_ID_RE.test(id)) {
      return jsonError(res, 'BAD_REQUEST', 'Invalid script ID', 400);
    }

    await ensureRadarDir();
    try {
      await fs.access(radarScriptPath(id));
      return jsonError(
        res,
        'CONFLICT',
        'A script with that ID already exists',
        409,
      );
    } catch {
      /* free to create */
    }

    const script: Record<string, unknown> = { ...data };
    delete script.id;
    await fs.writeFile(radarScriptPath(id), JSON.stringify(script, null, 2), 'utf-8');

    logActivity(
      req.adminUser?.id,
      'radar.script.created',
      undefined,
      { id, name: data.name },
      req.ip,
    );

    jsonOk(res, { ...script, id, filename: `${id}.json` });
  },
);

// POST /api/v2/admin/radar/scripts/:id — update a script (partial)
router.post(
  '/radar/scripts/:id',
  parseBody(adminRadarScriptUpdateBody),
  async (req, res) => {
    const id = readRadarScriptId(req.params.id);
    if (!id) {
      return jsonError(res, 'BAD_REQUEST', 'Invalid script ID', 400);
    }

    let raw: string;
    try {
      raw = await fs.readFile(radarScriptPath(id), 'utf-8');
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        return jsonError(res, 'NOT_FOUND', 'Script not found', 404);
      }
      logger.error('Error reading radar script:', error);
      return jsonError(res, 'SCRIPT_ERROR', 'Failed to read radar script', 500);
    }

    let existing: Record<string, unknown> = {};
    try {
      existing = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      /* overwrite malformed content */
    }

    const patch = {
      ...(req.validatedBody as Record<string, unknown> | undefined),
    };
    delete patch.id;

    const merged = { ...existing, ...patch };
    await fs.writeFile(radarScriptPath(id), JSON.stringify(merged, null, 2), 'utf-8');

    logActivity(
      req.adminUser?.id,
      'radar.script.updated',
      undefined,
      { id, fields: Object.keys(patch) },
      req.ip,
    );

    jsonOk(res, { ...merged, id, filename: `${id}.json` });
  },
);

// POST /api/v2/admin/radar/scripts/:id/delete — delete a script
router.post('/radar/scripts/:id/delete', async (req, res) => {
  const id = readRadarScriptId(req.params.id);
  if (!id) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid script ID', 400);
  }
  try {
    await fs.unlink(radarScriptPath(id));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return jsonError(res, 'NOT_FOUND', 'Script not found', 404);
    }
    logger.error('Error deleting radar script:', error);
    return jsonError(res, 'SCRIPT_ERROR', 'Failed to delete radar script', 500);
  }

  logActivity(req.adminUser?.id, 'radar.script.deleted', undefined, { id }, req.ip);

  jsonOk(res, { deleted: id });
});

// GET /api/v2/admin/radar/virustotal — VT config state for the tab page
router.get('/radar/virustotal', async (_req, res) => {
  const settings = await getSettings();
  jsonOk(res, {
    enabled: !!settings?.virusTotalApiKey,
    virusTotalApiKey: settings?.virusTotalApiKey ?? null,
  });
});

interface VtLookupOutcome {
  payload?: Record<string, unknown>;
  error?: { code: string; message: string; status: number };
}

/**
 * Hash lookup against VirusTotal (port of the legacy POST /admin/radar/
 * virustotal handler). Every call site shares the free-tier rate limiter.
 */
async function lookupVtHash(hash: string): Promise<VtLookupOutcome> {
  const settings = await getSettings();
  const apiKey = settings?.virusTotalApiKey;

  if (!apiKey) {
    return {
      error: {
        code: 'VT_NOT_CONFIGURED',
        message:
          'VirusTotal API key is not configured. Add it in Admin Settings.',
        status: 503,
      },
    };
  }
  if (!vtRateLimit.allow()) {
    return {
      error: {
        code: 'VT_RATE_LIMITED',
        message: 'Rate limit: 4 lookups/min on free tier. Wait a moment.',
        status: 429,
      },
    };
  }
  if (!vtRateLimit.allowDaily()) {
    return {
      error: {
        code: 'VT_DAILY_QUOTA',
        message: 'Daily quota reached: 500 lookups/day on free tier.',
        status: 429,
      },
    };
  }

  try {
    const vtResponse = await httpGet<Record<string, unknown>>(
      `${VT_API_BASE}/files/${hash}`,
      {
        headers: { 'x-apikey': apiKey },
        timeout: DAEMON_TIMEOUT_VT_WAIT_MS,
      },
    );

    if (vtResponse.status === 404) {
      return {
        payload: {
          found: false,
          hash,
          malicious: 0,
          total: 0,
          message: 'Hash is not known to VirusTotal.',
        },
      };
    }

    if (vtResponse.status !== 200) {
      logger.error('VirusTotal API error:', `Status ${vtResponse.status}`);
      return {
        error: {
          code: 'VT_ERROR',
          message: `VirusTotal request failed — status ${vtResponse.status}`,
          status: 502,
        },
      };
    }

    const vtData = vtResponse.data as Record<string, unknown> | undefined;
    const attrs = (vtData?.data as Record<string, unknown> | undefined)
      ?.attributes as Record<string, unknown> | undefined;
    if (!attrs) {
      return {
        payload: {
          found: false,
          hash,
          malicious: 0,
          total: 0,
          message: 'Hash is not known to VirusTotal.',
        },
      };
    }

    const stats = (attrs.last_analysis_stats || {}) as Record<string, number>;
    const total = Object.values(stats).reduce(
      (a: number, b: number) => a + b,
      0,
    );
    const malicious = (stats.malicious || 0) + (stats.suspicious || 0);

    return {
      payload: {
        found: true,
        hash,
        malicious,
        total,
        name: String(attrs.meaningful_name || attrs.name || null),
        type: String(attrs.type_description || null),
        size: attrs.size || null,
        firstSeen: attrs.first_submission_date
          ? new Date(Number(attrs.first_submission_date) * 1000)
            .toISOString()
            .split('T')[0]
          : null,
        vtLink: VT_GUI_FILE_URL(hash),
        message:
          malicious > 0
            ? `Flagged by ${malicious} of ${total} engines.`
            : 'No threats found.',
      },
    };
  } catch (error: unknown) {
    logger.error(
      'VirusTotal API error:',
      error instanceof Error ? error.message : error,
    );
    return {
      error: { code: 'VT_FAILED', message: 'VirusTotal scan failed', status: 502 },
    };
  }
}

function sendVtOutcome(res: Response, outcome: VtLookupOutcome): void {
  if (outcome.error) {
    jsonError(
      res,
      outcome.error.code,
      outcome.error.message,
      outcome.error.status,
    );
    return;
  }
  jsonOk(res, outcome.payload);
}

// GET /api/v2/admin/radar/virustotal/scan/:hash — verdict JSON for a hash.
// views/admin/servers/servers reads `malicious` (truthy = bad) and `message`.
router.get('/radar/virustotal/scan/:hash', async (req, res) => {
  const hash = String(req.params.hash);
  if (!VT_HASH_RE.test(hash)) {
    return jsonError(
      res,
      'BAD_REQUEST',
      'A valid MD5, SHA1, or SHA256 hash is required',
      400,
    );
  }
  sendVtOutcome(res, await lookupVtHash(hash));
});

// POST /api/v2/admin/radar/virustotal/:hash — trigger a VT lookup for a hash
router.post('/radar/virustotal/:hash', async (req, res) => {
  const hash = String(req.params.hash);
  if (!VT_HASH_RE.test(hash)) {
    return jsonError(
      res,
      'BAD_REQUEST',
      'A valid MD5, SHA1, or SHA256 hash is required',
      400,
    );
  }
  sendVtOutcome(res, await lookupVtHash(hash));
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

// ======================== ACTIVITY LOGS ========================

router.get('/activity-logs', async (req, res) => {
  const page = parseInt(String(req.query.page ?? '1'), 10) || 1;
  const perPage = Math.min(
    parseInt(String(req.query.perPage ?? '50'), 10) || 50,
    100,
  );
  const category = (req.query.category as string) || undefined;
  const severity = (req.query.severity as string) || undefined;
  const search = (req.query.search as string) || undefined;
  const startDate = req.query.startDate
    ? new Date(req.query.startDate as string)
    : undefined;
  const endDate = req.query.endDate
    ? new Date(req.query.endDate as string)
    : undefined;

  const where: Record<string, unknown> = {};
  if (category) {
    where.category = category;
  }
  if (severity) {
    where.severity = severity;
  }
  if (search) {
    where.OR = [
      { event: { contains: search } },
      { metadata: { contains: search } },
    ];
  }
  if (startDate || endDate) {
    where.createdAt = {
      ...(startDate ? { gte: startDate } : {}),
      ...(endDate ? { lte: endDate } : {}),
    };
  }

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: {
        actor: { select: { id: true, username: true, email: true } },
      },
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.activityLog.count({ where }),
  ]);

  jsonOk(res, logs, {
    current_page: page,
    per_page: perPage,
    total,
    last_page: Math.ceil(total / perPage) || 1,
  });
});

// Activity logs summary — counts by category and severity for charts
router.get('/activity-logs/summary', async (_req, res) => {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [totalAll, total24h, total7d, byCategory, bySeverity, byDay] =
    await Promise.all([
      prisma.activityLog.count(),
      prisma.activityLog.count({ where: { createdAt: { gte: last24h } } }),
      prisma.activityLog.count({ where: { createdAt: { gte: last7d } } }),
      prisma.activityLog.groupBy({
        by: ['category'],
        _count: true,
        orderBy: { _count: { category: 'desc' } },
      }),
      prisma.activityLog.groupBy({
        by: ['severity'],
        _count: true,
        orderBy: { _count: { severity: 'desc' } },
      }),
      // Last 30 days grouped by day
      prisma.$queryRawUnsafe<{ date: string; count: bigint }[]>(
        `SELECT DATE("createdAt")::text as date, COUNT(*)::int as count
         FROM "ActivityLog"
         WHERE "createdAt" >= $1
         GROUP BY DATE("createdAt")
         ORDER BY date ASC`,
        new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      ),
    ]);

  jsonOk(res, {
    total: totalAll,
    last24h: total24h,
    last7d: total7d,
    byCategory: byCategory.map((r) => ({
      category: r.category,
      count: r._count,
    })),
    bySeverity: bySeverity.map((r) => ({
      severity: r.severity,
      count: r._count,
    })),
    byDay: byDay.map((r) => ({ date: r.date, count: Number(r.count) })),
  });
});

// ======================== SYSTEM LOGS (owner-only) ========================

router.get('/system-logs', async (req, res) => {
  // Owner-only check
  if (req.adminUser?.role !== 'owner') {
    return jsonError(res, 'FORBIDDEN', 'Owner access required', 403);
  }

  const page = parseInt(String(req.query.page ?? '1'), 10) || 1;
  const perPage = Math.min(
    parseInt(String(req.query.perPage ?? '50'), 10) || 50,
    100,
  );
  const severity = (req.query.severity as string) || undefined;
  const component = (req.query.component as string) || undefined;
  const search = (req.query.search as string) || undefined;
  const startDate = req.query.startDate
    ? new Date(req.query.startDate as string)
    : undefined;
  const endDate = req.query.endDate
    ? new Date(req.query.endDate as string)
    : undefined;

  const result = await getSystemLogs({
    page,
    perPage,
    severity,
    component,
    startDate,
    endDate,
    search,
  });

  jsonOk(res, result.logs, result.meta);
});

// System logs summary — counts by severity and component
router.get('/system-logs/summary', async (req, res) => {
  if (req.adminUser?.role !== 'owner') {
    return jsonError(res, 'FORBIDDEN', 'Owner access required', 403);
  }

  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [totalAll, total24h, bySeverity, byComponent] = await Promise.all([
    prisma.systemLog.count(),
    prisma.systemLog.count({ where: { createdAt: { gte: last24h } } }),
    prisma.systemLog.groupBy({
      by: ['severity'],
      _count: true,
      orderBy: { _count: { severity: 'desc' } },
    }),
    prisma.systemLog.groupBy({
      by: ['component'],
      _count: true,
      orderBy: { _count: { component: 'desc' } },
    }),
  ]);

  jsonOk(res, {
    total: totalAll,
    last24h: total24h,
    bySeverity: bySeverity.map((r) => ({
      severity: r.severity,
      count: r._count,
    })),
    byComponent: byComponent.map((r) => ({
      component: r.component,
      count: r._count,
    })),
  });
});

// ======================== OVERVIEW (main dashboard) ========================

router.get('/overview', async (_req, res) => {
  const [userCount, instanceCount, nodeCount, imageCount, onlineServers] =
    await Promise.all([
      prisma.users.count(),
      prisma.server.count(),
      prisma.node.count(),
      prisma.images.count(),
      prisma.server.count({ where: { Running: true } }),
    ]);

  const airlinkVersion = process.env.AIRLINK_VERSION ?? '2.0.0';
  const airlinkCodename = process.env.AIRLINK_CODENAME ?? 'Nebula';
  const vcodeBg = process.env.VCODE_BG_URL ?? '';

  jsonOk(res, {
    userCount,
    instanceCount,
    nodeCount,
    imageCount,
    onlineServers,
    airlinkVersion,
    airlinkCodename,
    vcodeBg,
  });
});

// ======================== ANALYTICS (full) ========================

router.get('/analytics', async (_req, res) => {
  const [
    totalServers,
    suspendedServers,
    totalRamMb,
    totalCpuPct,
    totalStorageGb,
    topImagesGroup,
    topServers,
    nodes,
    totalUsers,
    adminCount,
    totalImages,
  ] = await Promise.all([
    prisma.server.count(),
    prisma.server.count({ where: { Suspended: true } }),
    prisma.server.aggregate({ _sum: { Memory: true } }),
    prisma.server.aggregate({ _sum: { Cpu: true } }),
    prisma.server.aggregate({ _sum: { Storage: true } }),
    prisma.server.groupBy({
      by: ['imageId'],
      _count: true,
      orderBy: { _count: { imageId: 'desc' } },
      take: 10,
    }),
    prisma.server.findMany({
      orderBy: [{ Memory: 'desc' }, { Cpu: 'desc' }],
      take: 10,
      select: {
        name: true,
        Memory: true,
        Cpu: true,
        Storage: true,
        Suspended: true,
        owner: { select: { username: true } },
        image: { select: { name: true } },
      },
    }),
    prisma.node.findMany({
      select: {
        id: true,
        name: true,
        address: true,
        port: true,
        ram: true,
        cpu: true,
        disk: true,
        _count: { select: { servers: true } },
      },
    }),
    prisma.users.count(),
    prisma.users.count({ where: { isAdmin: true } }),
    prisma.images.count(),
  ]);

  // Resolve image names for topImagesGroup
  const imageIds = topImagesGroup
    .map((i) => i.imageId)
    .filter(Boolean) as number[];
  const imageRecords = imageIds.length
    ? await prisma.images.findMany({
      where: { id: { in: imageIds } },
      select: { id: true, name: true },
    })
    : [];
  const imageMap = new Map(imageRecords.map((i) => [i.id, i.name]));

  // Login stats (30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const loginHistory = await prisma.loginHistory.findMany({
    where: { timestamp: { gte: thirtyDaysAgo } },
    orderBy: { timestamp: 'desc' },
    take: 500,
  });

  const loginsByDay: Record<string, number> = {};
  for (let i = 0; i < 30; i++) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    loginsByDay[d] = 0;
  }
  loginHistory.forEach((l) => {
    const day = l.timestamp.toISOString().slice(0, 10);
    loginsByDay[day] = (loginsByDay[day] || 0) + 1;
  });

  jsonOk(res, {
    servers: {
      total: totalServers,
      suspended: suspendedServers,
      totalRamMb: totalRamMb._sum.Memory ?? 0,
      totalCpuPct: totalCpuPct._sum.Cpu ?? 0,
      totalStorageGb: totalStorageGb._sum.Storage ?? 0,
      topImages: topImagesGroup.map((i) => ({
        name: imageMap.get(i.imageId ?? 0) ?? 'Unknown',
        count: i._count,
      })),
      topServers: topServers.map((s) => ({
        name: s.name,
        memory: s.Memory,
        cpu: s.Cpu,
        storage: s.Storage,
        suspended: s.Suspended,
        owner: s.owner?.username ?? 'Unknown',
        image: s.image?.name ?? 'Unknown',
      })),
    },
    nodes: nodes.map((n) => ({
      name: n.name,
      address: n.address,
      port: n.port,
      ram: n.ram,
      cpu: n.cpu,
      disk: n.disk,
      online: false, // Determined client-side via daemon health check
      versionRelease: '',
      serverCount: n._count.servers,
    })),
    activity: {
      totalUsers,
      adminCount,
      totalImages,
      loginsByDay,
      recentLogins: loginHistory.slice(0, 10).map((l) => ({
        userId: l.userId,
        ipAddress: l.ipAddress,
        timestamp: l.timestamp,
      })),
    },
  });
});

// ======================== ACTIVITY LOGS (page-render) ========================

router.get('/activity', async (req, res) => {
  const page = parseInt(String(req.query.page ?? '1'), 10) || 1;
  const perPage = 50;

  const where: Record<string, unknown> = {};
  if (req.query.category) {where.category = req.query.category;}
  if (req.query.server) {where.serverId = req.query.server;}
  if (req.query.actor) {
    const actorUser = await prisma.users.findFirst({
      where: { username: String(req.query.actor) },
      select: { id: true },
    });
    if (actorUser) {where.actorId = actorUser.id;}
  }
  if (req.query.from || req.query.to) {
    where.createdAt = {
      ...(req.query.from ? { gte: new Date(String(req.query.from)) } : {}),
      ...(req.query.to
        ? { lte: new Date(`${String(req.query.to)  }T23:59:59`) }
        : {}),
    };
  }

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: {
        actor: { select: { id: true, username: true } },
        server: { select: { UUID: true, name: true } },
      },
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.activityLog.count({ where }),
  ]);

  const totalPages = Math.ceil(total / perPage) || 1;

  // Get distinct events and servers for filter dropdowns
  const [events, servers] = await Promise.all([
    prisma.activityLog.groupBy({
      by: ['event'],
      _count: true,
      orderBy: { _count: { event: 'desc' } },
      take: 50,
    }),
    prisma.server.findMany({
      select: { UUID: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const filters = {
    category: String(req.query.category || ''),
    event: String(req.query.event || ''),
    server: String(req.query.server || ''),
    actor: String(req.query.actor || ''),
    from: String(req.query.from || ''),
    to: String(req.query.to || ''),
  };

  jsonOk(res, {
    logs: logs.map((l) => ({
      id: l.id,
      event: l.event,
      category: l.category,
      severity: l.severity,
      metadata: l.metadata ? JSON.parse(l.metadata) : null,
      ip: l.ip,
      createdAt: l.createdAt,
      actor: l.actor,
      server: l.server,
      serverId: l.serverId,
    })),
    total,
    page,
    totalPages,
    events: events.map((e) => ({ event: e.event, count: e._count })),
    servers,
    filters,
  });
});

// ======================== QUEUE ========================

router.get('/queue', async (_req, res) => {
  const { runtimeStartQueue } =
    await import('../../../../handlers/runtimeQueue');
  const entries = runtimeStartQueue.listQueueForAdmin();
  jsonOk(res, entries);
});

router.post('/queue/:serverId/kick', async (req, res) => {
  const serverId = String(req.params.serverId);
  try {
    const { runtimeStartQueue } =
      await import('../../../../handlers/runtimeQueue');
    const removed = await runtimeStartQueue.cancelQueuedStart(serverId);
    if (removed) {
      logActivity(req.adminUser?.id, 'queue.kick', serverId, {}, req.ip);
    }
    jsonOk(res, { removed });
  } catch (err) {
    jsonError(res, 'KICK_FAILED', `Failed to kick: ${String(err)}`, 500);
  }
});

router.post('/queue/users/:userId/ban', async (req, res) => {
  const userId = parseInt(String(req.params.userId), 10);
  if (isNaN(userId)) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid user ID', 400);
  }
  try {
    const { runtimeStartQueue } =
      await import('../../../../handlers/runtimeQueue');
    const minutes = parseInt(String(req.body?.minutes ?? 30), 10) || 30;
    const removed = await runtimeStartQueue.banUserFromQueue(userId, minutes);
    logActivity(
      req.adminUser?.id,
      'queue.ban',
      undefined,
      { userId, minutes },
      req.ip,
    );
    jsonOk(res, { banned: true, removed, minutes });
  } catch (err) {
    jsonError(res, 'BAN_FAILED', `Failed to ban: ${String(err)}`, 500);
  }
});

router.post('/queue/users/:userId/unban', async (req, res) => {
  const userId = parseInt(String(req.params.userId), 10);
  if (isNaN(userId)) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid user ID', 400);
  }
  try {
    const { runtimeStartQueue } =
      await import('../../../../handlers/runtimeQueue');
    const unbanned = await runtimeStartQueue.unbanUserFromQueue(userId);
    logActivity(
      req.adminUser?.id,
      'queue.unban',
      undefined,
      { userId },
      req.ip,
    );
    jsonOk(res, { unbanned });
  } catch (err) {
    jsonError(res, 'UNBAN_FAILED', `Failed to unban: ${String(err)}`, 500);
  }
});

// ======================== MENU ========================

router.get('/menu', async (_req, res) => {
  const items = global.uiComponentStore?.getServerMenuItems() ?? [];
  jsonOk(res, items);
});

router.get('/menu/list', async (_req, res) => {
  const items = global.uiComponentStore?.getServerMenuItems() ?? [];
  jsonOk(res, items);
});

router.post('/menu', async (req, res) => {
  const { id, label, url, visible, group } = req.body as Record<
    string,
    unknown
  >;
  if (!id) {
    return jsonError(res, 'BAD_REQUEST', 'Menu item ID is required', 400);
  }
  const store = global.uiComponentStore;
  if (!store) {
    return jsonError(
      res,
      'INTERNAL_ERROR',
      'UI component store not available',
      500,
    );
  }
  store.updateServerMenuItem(String(id), {
    label: label as string,
    url: url as string,
    visible: visible as boolean,
    group: group as string,
  });
  logActivity(req.adminUser?.id, 'menu.updated', undefined, { id }, req.ip);
  jsonOk(res, { updated: true });
});

router.post('/menu/reorder', async (req, res) => {
  const { items } = req.body as { items?: { id: string; priority: number }[] };
  if (!items || !Array.isArray(items)) {
    return jsonError(res, 'BAD_REQUEST', 'Items array is required', 400);
  }
  const store = global.uiComponentStore;
  if (!store) {
    return jsonError(
      res,
      'INTERNAL_ERROR',
      'UI component store not available',
      500,
    );
  }
  items.forEach((item) => {
    store.updateServerMenuItem(item.id, { priority: item.priority });
  });
  logActivity(
    req.adminUser?.id,
    'menu.reordered',
    undefined,
    { count: items.length },
    req.ip,
  );
  jsonOk(res, { reordered: true });
});

router.post('/menu/:id/delete', async (req, res) => {
  const id = String(req.params.id);
  const store = global.uiComponentStore;
  if (!store) {
    return jsonError(
      res,
      'INTERNAL_ERROR',
      'UI component store not available',
      500,
    );
  }
  store.removeServerMenuItem(id);
  logActivity(req.adminUser?.id, 'menu.deleted', undefined, { id }, req.ip);
  jsonOk(res, { deleted: true });
});

// ======================== PLAYER STATS ========================

router.get('/playerstats', async (_req, res) => {
  const [latest, historicalData, servers] = await Promise.all([
    prisma.playerStats.findFirst({ orderBy: { timestamp: 'desc' } }),
    prisma.playerStats.findMany({
      orderBy: { timestamp: 'desc' },
      take: 288, // 24h at 5min intervals
    }),
    prisma.server.findMany({
      select: {
        UUID: true,
        name: true,
        Running: true,
        Memory: true,
        Cpu: true,
        Storage: true,
        dockerImage: true,
        image: { select: { name: true } },
        node: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  const totalPlayers = latest?.totalPlayers ?? 0;
  const totalMaxPlayers = latest?.maxPlayers ?? 0;
  const onlineServersCount = latest?.onlineServers ?? 0;

  jsonOk(res, {
    totalPlayers,
    totalMaxPlayers,
    onlineServers: onlineServersCount,
    servers: servers.map((s) => ({
      serverId: s.UUID,
      serverName: s.name,
      online: s.Running,
      playerCount: 0,
      maxPlayers: Math.floor(s.Memory / 1024),
      version: s.dockerImage || 'Unknown',
    })),
    historicalData: historicalData.map((h) => ({
      timestamp: h.timestamp,
      totalPlayers: h.totalPlayers,
    })),
  });
});

router.get('/playerstats/search', async (req, res) => {
  const search = String(req.query.q ?? '').trim();
  if (!search) {
    return jsonOk(res, []);
  }
  const stats = await prisma.playerStats.findMany({
    orderBy: { timestamp: 'desc' },
    take: 50,
  });
  jsonOk(res, stats);
});

router.post('/playerstats/lookup', async (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name) {
    return jsonError(res, 'BAD_REQUEST', 'Player name is required', 400);
  }
  logActivity(
    req.adminUser?.id,
    'playerstats.lookup',
    undefined,
    { name },
    req.ip,
  );
  jsonOk(res, { found: false, name });
});

router.post('/playerstats/collect', async (req, res) => {
  logActivity(req.adminUser?.id, 'playerstats.collect', undefined, {}, req.ip);
  jsonOk(res, { collectRequested: true });
});

export default router;
