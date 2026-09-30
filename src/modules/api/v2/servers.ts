/**
 * V2 API — Servers endpoints.
 *
 * POST   /api/v2/servers               — Create a server (user flow)
 * GET    /api/v2/servers               — List user's servers
 * GET    /api/v2/servers/:id           — Get server details
 * PATCH  /api/v2/servers/:id           — Update server
 * DELETE /api/v2/servers/:id           — Delete server
 * GET    /api/v2/servers/:id/settings  — Settings form payload
 * POST   /api/v2/servers/:id/settings  — Save name/description
 * GET    /api/v2/servers/:id/ws-token  — Issue websocket token
 * GET    /api/v2/servers/:id/players   — Player list (daemon /minecraft/players)
 * GET    /api/v2/servers/:id/worlds    — Detected worlds
 * POST   /api/v2/servers/:id/worlds/:world/:action — delete|download a world
 * GET    /api/v2/servers/:id/console/logs — Recent console output
 * POST   /api/v2/servers/:id/power     — Power action
 * POST   /api/v2/servers/:id/reinstall — Reinstall server
 * GET    /api/v2/servers/:id/status    — Get server status
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import prisma from '../../../db';
import { parseBody } from '../../../utils/validation';
import { parseDockerImageRef } from '../../../utils/dockerImage';
import { getPrimaryExternalPort } from '../../../handlers/utils/server/ports';
import {
  jsonOk,
  jsonError,
  requireUser,
  resolveServer,
  requireSubUserPermission,
  checkSuspended,
  logActivity,
  paginateQuery,
  parsePage,
  parsePerPage,
  getAuthenticatedUserId,
} from './helpers';
import type { SubUserPermission } from './helpers';
import {
  updateServerBody,
  powerBody,
  createServerBody,
  updateServerSettingsBody,
} from './dto';
import type { CreateServerBody, UpdateServerSettingsBody } from './dto';
import type { Prisma } from '../../../generated/prisma/client';
import {
  daemonRequest,
  DaemonNodeNotFoundError,
} from '../../../services/daemonService';
import { daemonBaseUrl } from '../../../handlers/utils/core/daemonRequest';
import logger from '../../../handlers/logger';
import { getSettings } from '../../../handlers/settingsCache';
import { queueer } from '../../../handlers/queueer';
import { processQueuedServerInstalls } from '../../../handlers/installQueue';
import {
  assertNodeCapacity,
  NodeCapacityExceededError,
} from '../../../handlers/utils/server/resourceCheck';
import {
  claimNodePorts,
  getNodePortPool,
  withNodePortLock,
} from '../../../handlers/utils/server/allocations';
import {
  getUsedExternalPorts,
  isValidPort,
  parseImagePortRequirements,
  pickRandomFreePorts,
  serializeServerPorts,
} from '../../../handlers/utils/server/ports';
import {
  DEFAULT_BACKUP_LIMIT,
  DEFAULT_DATABASE_LIMIT,
  DEFAULT_MAX_CPU_PERCENT,
  DEFAULT_MAX_MEMORY_MB,
  DEFAULT_MAX_STORAGE_MB,
  MIN_CPU_PERCENT,
  MIN_MEMORY_MB,
  MIN_STORAGE_MB,
} from '../../../config/server';
import {
  runtimeStartQueue,
  QueueBannedError,
} from '../../../handlers/runtimeQueue';
import { issueWsToken } from '../../../handlers/utils/security/wsToken';
import { isWorld } from '../../../handlers/features';
import {
  getImageFeatures,
  getPrimaryPort,
  getServerStatusInput,
} from '../../user/server/shared';
import type { ServerVariable } from '../../user/server/shared';
import {
  daemonPlayerListSchema,
  fsListSchema,
  parseDaemonResponse,
} from '../../../types/daemon';
import { isPathSafe } from '../../../utils/pathSecurity';
import {
  DAEMON_TIMEOUT_MEDIUM_MS,
  DAEMON_TIMEOUT_FILE_MS,
  DAEMON_TIMEOUT_FILE_WRITE_MS,
  DAEMON_TIMEOUT_FILE_HEAVY_MS,
} from '../../../config/daemonTimeouts';

const router = Router();

// ---------------------------------------------------------------------------
// Local helpers (create-server flow)
// ---------------------------------------------------------------------------

interface ClientPort {
  name: string;
  internalPort: number;
}

/**
 * Parse the port specs a client may submit for the multi-port flow. Returns
 * `null` when nothing usable was supplied so callers fall back to the image's
 * own requirements.
 */
function parseClientPorts(raw: unknown): ClientPort[] | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }
  const out: ClientPort[] = [];
  for (const item of raw) {
    const obj =
      item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const internalPort = Number(obj.internalPort ?? obj.port);
    const name = typeof obj.name === 'string' ? obj.name.trim() : '';
    if (!Number.isInteger(internalPort) || !isValidPort(internalPort) || !name) {
      return null;
    }
    out.push({ name, internalPort });
  }
  return out;
}

/** `images.dockerImages` is a Json column that may hold an array, a JSON
 * string, or nothing. Normalise to the array of `{name: ref}` maps the rest of
 * the panel works with. */
function parseDockerImageVariants(raw: unknown): Record<string, string>[] {
  const keep = (value: unknown): value is Record<string, string> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

  if (Array.isArray(raw)) {
    return raw.filter(keep);
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(keep);
      }
    } catch {
      /* fall through */
    }
  }
  return [];
}

type SettingsRow = Awaited<ReturnType<typeof getSettings>>;

async function resolveUserServerLimit(
  userId: number,
  settings: SettingsRow,
): Promise<number> {
  const user = await prisma.users.findUnique({ where: { id: userId } });
  if (!user) {
    return 0;
  }
  if (user.role === 'owner' || user.role === 'admin') {
    return Number.MAX_SAFE_INTEGER;
  }
  if (user.serverLimit !== null && user.serverLimit !== undefined) {
    return user.serverLimit;
  }
  if (user.role === 'privileged') {
    return settings?.allowPrivilegedServerLimit ?? 5;
  }
  return settings?.defaultServerLimit ?? 0;
}

async function resolveUserResourceLimits(userId: number, settings: SettingsRow) {
  const user = await prisma.users.findUnique({ where: { id: userId } });
  const isPrivilegedRole = user?.role === 'privileged';
  return {
    maxMemory:
      user?.maxMemory ??
      settings?.[
        isPrivilegedRole ? 'allowPrivilegedMaxMemory' : 'defaultMaxMemory'
      ] ??
      DEFAULT_MAX_MEMORY_MB,
    maxCpu:
      user?.maxCpu ??
      settings?.[
        isPrivilegedRole ? 'allowPrivilegedMaxCpu' : 'defaultMaxCpu'
      ] ??
      DEFAULT_MAX_CPU_PERCENT,
    maxStorage:
      user?.maxStorage ??
      settings?.[
        isPrivilegedRole ? 'allowPrivilegedMaxStorage' : 'defaultMaxStorage'
      ] ??
      DEFAULT_MAX_STORAGE_MB,
  };
}

// ---------------------------------------------------------------------------
// POST /api/v2/servers — Create a server (user flow)
//
// Ported from legacy `src/modules/user/createServer.ts`: same limit checks,
// resource-capacity checks, node port allocation and install-queue kick.
// Responds `{ success: true, data: { serverUUID } }` — the page controller
// only reads it to redirect.
// ---------------------------------------------------------------------------
router.post('/', parseBody(createServerBody), async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return;
  }

  const settings = await getSettings();
  if (!settings?.allowUserCreateServer) {
    return jsonError(res, 'FORBIDDEN', 'Server creation is not enabled.', 403);
  }

  const serverLimit = await resolveUserServerLimit(userId, settings);
  if (serverLimit === 0) {
    return jsonError(
      res,
      'FORBIDDEN',
      'You are not allowed to create servers.',
      403,
    );
  }

  const currentCount = await prisma.server.count({
    where: { ownerId: userId },
  });
  if (currentCount >= serverLimit) {
    return jsonError(
      res,
      'FORBIDDEN',
      `You have reached your server limit of ${serverLimit}.`,
      403,
    );
  }

  const resourceLimits = await resolveUserResourceLimits(userId, settings);
  const data = req.validatedBody as CreateServerBody;

  const memory = parseInt(String(data.Memory), 10);
  const cpu = parseInt(String(data.Cpu), 10);
  const storage = parseInt(String(data.Storage), 10);
  const swap =
    data.Swap !== undefined && String(data.Swap) !== ''
      ? parseInt(String(data.Swap), 10)
      : 0;

  if (
    isNaN(memory) ||
    memory < MIN_MEMORY_MB ||
    memory > resourceLimits.maxMemory
  ) {
    return jsonError(
      res,
      'BAD_REQUEST',
      `Memory must be between ${MIN_MEMORY_MB} and ${resourceLimits.maxMemory} MB.`,
      400,
    );
  }
  if (isNaN(cpu) || cpu < MIN_CPU_PERCENT || cpu > resourceLimits.maxCpu) {
    return jsonError(
      res,
      'BAD_REQUEST',
      `CPU must be between ${MIN_CPU_PERCENT} and ${resourceLimits.maxCpu}% (${MIN_CPU_PERCENT}% = half a core).`,
      400,
    );
  }
  if (
    isNaN(storage) ||
    storage < MIN_STORAGE_MB ||
    storage > resourceLimits.maxStorage
  ) {
    return jsonError(
      res,
      'BAD_REQUEST',
      `Storage must be between ${MIN_STORAGE_MB} and ${resourceLimits.maxStorage} MB.`,
      400,
    );
  }
  if (isNaN(swap) || swap < -1) {
    return jsonError(
      res,
      'BAD_REQUEST',
      'Swap must be -1 (unlimited), 0 (disabled), or a positive MB value.',
      400,
    );
  }

  const used = await prisma.server.aggregate({
    where: { ownerId: userId },
    _sum: { Memory: true, Cpu: true, Storage: true },
  });
  const usedMemory = used._sum.Memory ?? 0;
  const usedCpu = used._sum.Cpu ?? 0;
  const usedStorage = used._sum.Storage ?? 0;

  if (usedMemory + memory > resourceLimits.maxMemory) {
    return jsonError(
      res,
      'BAD_REQUEST',
      `Memory allocation would exceed your limit of ${resourceLimits.maxMemory} MB (${usedMemory} MB already in use).`,
      400,
    );
  }
  if (usedCpu + cpu > resourceLimits.maxCpu) {
    return jsonError(
      res,
      'BAD_REQUEST',
      `CPU allocation would exceed your limit of ${resourceLimits.maxCpu}% (${usedCpu}% already in use).`,
      400,
    );
  }
  if (usedStorage + storage > resourceLimits.maxStorage) {
    return jsonError(
      res,
      'BAD_REQUEST',
      `Storage allocation would exceed your limit of ${resourceLimits.maxStorage} MB (${usedStorage} MB already in use).`,
      400,
    );
  }

  const node = await prisma.node.findUnique({
    where: { id: parseInt(String(data.nodeId), 10) },
  });
  if (!node) {
    return jsonError(res, 'BAD_REQUEST', 'Node not found.', 400);
  }
  try {
    await assertNodeCapacity(node, memory, cpu, storage);
  } catch (error) {
    return jsonError(
      res,
      'BAD_REQUEST',
      error instanceof Error ? error.message : 'Node capacity exceeded.',
      400,
    );
  }

  const image = await prisma.images.findUnique({
    where: { id: parseInt(String(data.imageId), 10) },
  });
  if (!image) {
    return jsonError(res, 'BAD_REQUEST', 'Image not found.', 400);
  }
  if (image.status !== 'approved') {
    return jsonError(res, 'BAD_REQUEST', 'This image is not approved yet.', 400);
  }

  // Port specs the client may supply (multi-port flow); fall back to the
  // image's requirements. External ports are always auto-assigned below.
  const portRequirements = parseImagePortRequirements(image.portRequirements);
  let portSpecs: ClientPort[] = portRequirements.map((requirement) => ({
    name: requirement.name,
    internalPort: requirement.internalPort,
  }));
  if (Array.isArray(data.ports) && data.ports.length > 0) {
    const parsed = parseClientPorts(data.ports);
    if (!parsed) {
      return jsonError(res, 'BAD_REQUEST', 'Invalid port configuration.', 400);
    }
    if (parsed.length > 20) {
      return jsonError(res, 'BAD_REQUEST', 'Too many ports (max 20).', 400);
    }
    portSpecs = parsed;
  }
  const requiredPortCount = Math.max(1, portSpecs.length);

  const imageDocker = parseDockerImageVariants(image.dockerImages).find(
    (variant) => Object.keys(variant).includes(data.dockerImage),
  );
  if (!imageDocker) {
    return jsonError(res, 'BAD_REQUEST', 'Docker image variant not found.', 400);
  }

  const startCommand = image.startup;
  if (!startCommand) {
    return jsonError(
      res,
      'INTERNAL_ERROR',
      'Image has no startup command.',
      500,
    );
  }

  let imageVariables: ServerVariable[] = [];
  try {
    const parsed: unknown = JSON.parse(String(image.variables ?? '[]'));
    if (Array.isArray(parsed)) {
      imageVariables = parsed as ServerVariable[];
    }
  } catch {
    imageVariables = [];
  }

  try {
    const { createdServer } = await withNodePortLock(node.id, async () => {
      const pool = await getNodePortPool(node.id);
      const existingServers = await prisma.server.findMany({
        where: { nodeId: node.id },
      });
      const picked = pickRandomFreePorts(
        pool,
        getUsedExternalPorts(existingServers),
        requiredPortCount,
      );
      if (picked.length < requiredPortCount) {
        throw new Error(
          `No available ports on the selected node. ${requiredPortCount} port(s) required.`,
        );
      }

      const portsJson = serializeServerPorts(
        picked.map((externalPort, index) => {
          const spec = portSpecs[index];
          return {
            name: spec?.name ?? `Port ${index + 1}`,
            internalPort: spec?.internalPort ?? externalPort,
            externalPort,
            primary: index === 0,
          };
        }),
      );

      const created = await prisma.server.create({
        data: {
          name: data.name.trim(),
          description: data.description?.trim() || null,
          ownerId: userId,
          nodeId: node.id,
          imageId: image.id,
          Ports: portsJson as unknown as Prisma.InputJsonValue,
          Memory: memory,
          Swap: swap,
          Cpu: cpu,
          Storage: storage,
          backupLimit: DEFAULT_BACKUP_LIMIT,
          databaseLimit: DEFAULT_DATABASE_LIMIT,
          Variables: imageVariables as unknown as Prisma.InputJsonValue,
          StartCommand: startCommand,
          dockerImage: JSON.stringify(imageDocker),
        },
      });

      await claimNodePorts(node.id, picked, created.UUID).catch(() => {
        /* noop */
      });

      return { assignedPorts: picked, createdServer: created };
    });

    queueer.addTask(processQueuedServerInstalls);

    logActivity(
      userId,
      'server.created',
      createdServer.UUID,
      {
        name: createdServer.name,
        nodeId: node.id,
        imageId: image.id,
        memory,
        cpu,
        storage,
      },
      req.ip,
    );

    jsonOk(res, { serverUUID: createdServer.UUID });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith('No available ports on the selected node.')
    ) {
      return jsonError(res, 'SERVICE_UNAVAILABLE', error.message, 503);
    }
    logger.error('Error creating user server:', error);
    jsonError(res, 'INTERNAL_ERROR', 'Failed to create server.', 500);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v2/servers — List user's servers
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const page = parsePage(req.query.page);
  const perPage = parsePerPage(req.query.perPage);

  const where = user.isAdmin
    ? {}
    : {
      OR: [{ ownerId: user.id }, { subUsers: { some: { userId: user.id } } }],
    };

  const { data: servers, meta } = await paginateQuery(
    (args) =>
      prisma.server.findMany({
        where,
        include: {
          node: { select: { id: true, name: true, address: true } },
          image: { select: { id: true, name: true } },
          owner: { select: { id: true, username: true, email: true } },
          _count: {
            select: { backups: true, databases: true, subUsers: true },
          },
        },
        ...args,
        orderBy: { createdAt: 'desc' },
      }),
    () => prisma.server.count({ where }),
    page,
    perPage,
  );

  jsonOk(res, servers, meta);
});

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id — Get server details
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }

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
  if (!resolved) {
    return;
  }

  // Only owner or admin can update server settings
  if (!resolved.isOwner) {
    const user = await prisma.users.findUnique({
      where: {
        id: getAuthenticatedUserId(req),
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

  if (checkSuspended(res, resolved)) {
    return;
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

  if (Object.keys(updateData).length === 0) {
    return jsonError(res, 'BAD_REQUEST', 'No fields to update', 400);
  }

  const updated = await prisma.server.update({
    where: { UUID: resolved.server.UUID },
    data: updateData,
  });

  logActivity(
    getAuthenticatedUserId(req),
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
  if (!resolved) {
    return;
  }

  if (!resolved.isOwner) {
    const user = await prisma.users.findUnique({
      where: {
        id: getAuthenticatedUserId(req),
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

  // Ask the daemon to drop the container + volume before deleting the row.
  try {
    await daemonRequest(resolved.server.UUID, '/container', {
      method: 'DELETE',
      body: { id: resolved.server.UUID },
      timeout: 30000,
    });
  } catch {
    // Best effort — daemon may be offline
  }

  await prisma.server.delete({ where: { UUID: resolved.server.UUID } });

  logActivity(
    getAuthenticatedUserId(req),
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
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }

  // Permission check for sub-users
  const { action } = req.validatedBody as { action: string };
  const permMap: Record<string, SubUserPermission> = {
    start: 'start',
    stop: 'stop',
    restart: 'restart',
    kill: 'kill',
  };
  if (
    permMap[action] &&
    !requireSubUserPermission(res, resolved, permMap[action])
  ) {
    return;
  }

  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return;
  }

  // Starts go through the runtime queue (capacity-gated, fairness-ordered);
  // the queue worker issues the actual daemon start.
  if (action === 'start') {
    try {
      const actor = await prisma.users.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      const priority =
        actor?.role === 'owner' ||
        actor?.role === 'admin' ||
        actor?.role === 'privileged' ||
        resolved.server.ownerId === userId;
      const queued = await runtimeStartQueue.enqueueStart({
        serverId: resolved.server.UUID,
        userId,
        priority,
      });

      logActivity(
        userId,
        'server.power.start',
        resolved.server.UUID,
        { action, queued: queued.queued, position: queued.position },
        req.ip,
      );

      return jsonOk(res, {
        action,
        queued: queued.queued,
        position: queued.position,
        total: queued.total,
        status: queued.queued ? 'queued' : 'already_running',
      });
    } catch (err) {
      if (err instanceof QueueBannedError) {
        return jsonError(res, 'FORBIDDEN', err.message, 403);
      }
      if (err instanceof NodeCapacityExceededError) {
        return jsonError(res, 'CONFLICT', err.message, 409);
      }
      logger.error('Power start failed:', err);
      return jsonError(res, 'DAEMON_ERROR', 'Could not queue start', 502);
    }
  }

  const method = action === 'kill' ? 'DELETE' : 'POST';
  const path = action === 'kill' ? '/container/kill' : `/container/${action}`;

  try {
    const response = await daemonRequest(resolved.server.UUID, path, {
      method,
      body: { id: resolved.server.UUID },
      timeout: 30000,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'Daemon error');
      return jsonError(
        res,
        'DAEMON_ERROR',
        `Daemon returned ${response.status}: ${text}`,
        502,
      );
    }

    if (action === 'stop' || action === 'kill') {
      await prisma.server
        .update({
          where: { UUID: resolved.server.UUID },
          data: { Running: false },
        })
        .catch(() => {
          /* noop */
        });
      runtimeStartQueue.cleanCapacityFreed().catch(() => undefined);
    }

    logActivity(
      userId,
      `server.power.${action}`,
      resolved.server.UUID,
      { action },
      req.ip,
    );

    jsonOk(res, { action, status: 'sent' });
  } catch (err) {
    if (err instanceof DaemonNodeNotFoundError) {
      return jsonError(res, 'NOT_FOUND', 'Node not found', 404);
    }
    if (err instanceof NodeCapacityExceededError) {
      return jsonError(res, 'CONFLICT', err.message, 409);
    }
    jsonError(res, 'DAEMON_UNREACHABLE', 'Could not reach daemon', 502);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/reinstall — Reinstall server
// ---------------------------------------------------------------------------
router.post('/:id/reinstall', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }

  if (!requireSubUserPermission(res, resolved, 'reinstall')) {
    return;
  }

  const serverUUID = resolved.server.UUID;
  // preserveData defaults to true: a plain reinstall keeps worlds/configs;
  // only an explicit `{ preserveData: false }` wipe removes the volume.
  const preserveData = (req.body as { preserveData?: unknown })?.preserveData !== false;

  try {
    await prisma.server.update({
      where: { UUID: serverUUID },
      data: { Installing: true, Queued: true },
    });

    queueer.addTask(async () => {
      try {
        const current = await prisma.server.findUnique({
          where: { UUID: serverUUID },
          include: { image: true, node: true },
        });
        if (!current) {
          logger.error('Server not found for reinstallation:', serverUUID);
          return;
        }

        // Environment from the stored variable definitions.
        const ServerEnv: ServerVariable[] = Array.isArray(current.Variables)
          ? [...(current.Variables as unknown as ServerVariable[])]
          : [];

        const primaryPort = getPrimaryExternalPort(current.Ports);
        if (primaryPort) {
          ServerEnv.push({
            env: 'SERVER_PORT',
            name: 'Primary Port',
            value: primaryPort,
            type: 'text',
            default: primaryPort,
          });
        }

        const env = ServerEnv.reduce(
          (acc: Record<string, string | number | boolean>, curr) => {
            if (curr.env && curr.value !== undefined && curr.value !== null) {
              switch (curr.type) {
              case 'boolean':
                acc[curr.env] =
                  curr.value === 1 || curr.value === '1' || curr.value === true
                    ? 'true'
                    : 'false';
                break;
              case 'number':
                acc[curr.env] = Number(curr.value);
                break;
              default:
                acc[curr.env] = String(curr.value);
              }
            }
            return acc;
          },
          {},
        );

        const scripts = (current.image?.scripts ?? null) as
          | Record<string, unknown>
          | null;
        const installScripts = Array.isArray(scripts?.install)
          ? (scripts.install as Record<string, unknown>[])
          : [];
        const dockerRef = parseDockerImageRef(current.dockerImage);

        const response = await daemonRequest(serverUUID, '/container/reinstall', {
          method: 'POST',
          body: {
            id: serverUUID,
            image: dockerRef,
            env,
            preserveData,
            scripts: installScripts.map((script) => ({
              url: script.url as string,
              onStartup: script.onStart as boolean,
              ALVKT: script.ALVKT as boolean,
              fileName: script.fileName as string,
            })),
          },
          timeout: 600000,
        });

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          logger.error(`Reinstall failed for ${serverUUID}: ${text}`);
          await prisma.server.update({
            where: { UUID: serverUUID },
            data: { Queued: false, Installing: false },
          });
          return;
        }

        await prisma.server.update({
          where: { UUID: serverUUID },
          data: { Queued: false },
        });
      } catch (error) {
        logger.error(`Error in reinstallation queue for ${serverUUID}:`, error);
        await prisma.server
          .update({
            where: { UUID: serverUUID },
            data: { Queued: false, Installing: false },
          })
          .catch(() => {
            /* noop */
          });
      }
    });

    logActivity(
      getAuthenticatedUserId(req),
      'server.reinstall',
      serverUUID,
      { preserveData },
      req.ip,
    );

    jsonOk(res, { status: 'reinstalling' });
  } catch (err) {
    if (err instanceof DaemonNodeNotFoundError) {
      return jsonError(res, 'NOT_FOUND', 'Node not found', 404);
    }
    logger.error('Error reinstalling server:', err);
    jsonError(res, 'INTERNAL_ERROR', 'Failed to reinstall server', 500);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/status — Get server status
// ---------------------------------------------------------------------------
router.get('/:id/status', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }

  try {
    const response = await daemonRequest(
      resolved.server.UUID,
      `/container/status?id=${encodeURIComponent(resolved.server.UUID)}`,
      { timeout: 10000 },
    );

    if (!response.ok) {
      return jsonOk(res, { online: false, status: 'unknown' });
    }

    const data = (await response.json().catch(() => null)) as {
      status?: string;
      running?: boolean;
      exists?: boolean;
    } | null;

    if (!data) {
      return jsonOk(res, { online: false, status: 'unknown' });
    }

    jsonOk(res, {
      online: data.running ?? false,
      status: data.status ?? (data.exists === false ? 'missing' : 'unknown'),
    });
  } catch (err) {
    if (err instanceof DaemonNodeNotFoundError) {
      return jsonOk(res, { online: false, status: 'node_not_found' });
    }
    jsonOk(res, { online: false, status: 'unreachable' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/settings — settings form payload
//
// `views/user/server/settings.ejs` reads `server.UUID/name/description/Memory/
// Cpu/Storage/Suspended/createdAt/node.name/image.name`, so the full relations
// are returned alongside `features` and the panel `settings` row (both used by
// the layout/partials around the form).
// ---------------------------------------------------------------------------
const serverSettingsInclude = {
  node: true,
  image: true,
  owner: true,
} as const;

const getSettingsHandler = async (req: Request, res: Response) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'settings')) {
    return;
  }

  const server = await prisma.server.findUnique({
    where: { UUID: resolved.server.UUID },
    include: serverSettingsInclude,
  });
  if (!server) {
    return jsonError(res, 'NOT_FOUND', 'Server not found', 404);
  }

  jsonOk(res, {
    server,
    features: getImageFeatures(server.image),
    settings: await getSettings(),
  });
};

const updateSettingsHandler = async (req: Request, res: Response) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'settings')) {
    return;
  }

  const { name, description } = req.validatedBody as UpdateServerSettingsBody;

  const server = await prisma.server.update({
    where: { UUID: resolved.server.UUID },
    data: { name: name.trim(), description: description ?? null },
  });

  logActivity(
    getAuthenticatedUserId(req),
    'server.updated',
    resolved.server.UUID,
    { fields: ['name', 'description'] },
    req.ip,
  );

  jsonOk(res, { server });
};

router.get('/:id/settings', getSettingsHandler);
router.post('/:id/settings', parseBody(updateServerSettingsBody), updateSettingsHandler);
// `views/fragments/user/server/settings-form.ejs` (HTMX fragment) PATCHes the
// same payload — alias it so both callers hit one handler.
router.patch('/:id/settings', parseBody(updateServerSettingsBody), updateSettingsHandler);

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/ws-token — issue a websocket auth token
// ---------------------------------------------------------------------------
router.get('/:id/ws-token', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'console')) {
    return;
  }
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return;
  }

  jsonOk(res, { token: issueWsToken(resolved.server.UUID, userId) });
});

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/players — players + server info
//
// Ported from legacy `src/modules/user/server/players.ts`. The daemon pings
// `node.address:primaryExternalPort` (see the mapping note there). The view
// (`players.ejs`) reads `online` / `banned` / `whitelisted` / `whitelistEnabled`
// off the unwrapped payload; the extra legacy keys are kept for other callers.
// ---------------------------------------------------------------------------
router.get('/:id/players', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'console')) {
    return;
  }

  const server = await prisma.server.findUnique({
    where: { UUID: resolved.server.UUID },
    include: { node: true },
  });
  if (!server) {
    return jsonError(res, 'NOT_FOUND', 'Server not found', 404);
  }

  const players: { name: string; uuid: string }[] = [];
  let serverInfo = { maxPlayers: 0, onlinePlayers: 0, version: 'Unknown' };
  let serverIsOnline = false;
  let error: string | null = null;

  const primaryPort = getPrimaryPort(server.Ports);
  if (!primaryPort) {
    error = 'No port assigned to this server.';
  } else {
    try {
      const query = `id=${encodeURIComponent(server.UUID)}` +
        `&host=${encodeURIComponent(server.node.address)}` +
        `&port=${primaryPort}`;
      const response = await daemonRequest(
        server.UUID,
        `/minecraft/players?${query}`,
        { timeout: DAEMON_TIMEOUT_MEDIUM_MS },
      );

      if (!response.ok) {
        error = `Daemon returned ${response.status}`;
      } else {
        const raw: unknown = await response.json().catch(() => null);
        const playersData = parseDaemonResponse(daemonPlayerListSchema, raw);

        if (!playersData) {
          error = 'No valid data returned';
        } else {
          serverIsOnline =
            typeof playersData.online === 'boolean'
              ? playersData.online
              : !!playersData.version;

          if (Array.isArray(playersData.players)) {
            players.push(...playersData.players);
          }

          serverInfo = {
            maxPlayers: playersData.maxPlayers || 0,
            onlinePlayers: playersData.onlinePlayers || 0,
            version: playersData.version || 'Unknown',
          };
        }
      }
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code: unknown }).code)
          : undefined;
      if (
        code !== 'ECONNREFUSED' &&
        code !== 'ETIMEDOUT' &&
        code !== 'ENOTFOUND'
      ) {
        logger.error(
          `Error fetching players from daemon for ${server.UUID}:`,
          err,
        );
      }
      error = 'Server unreachable';
    }
  }

  jsonOk(res, {
    // `players.ejs` reads these four off the top of the payload.
    online: players,
    banned: [],
    whitelisted: [],
    whitelistEnabled: false,
    // Legacy/extra consumers.
    players,
    serverInfo,
    serverIsOnline,
    error,
  });
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/players/:player/:action
//         — kick | ban | pardon | whitelist-remove
//
// The daemon has no dedicated moderation endpoint; each action is issued as
// the equivalent console command via `POST /container/command` — the same
// path the interactive console uses (`serverConsole.ts`).
// ---------------------------------------------------------------------------
router.post('/:id/players/:player/:action', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'console')) {
    return;
  }

  const { player, action } = req.params;
  const commands: Record<string, string> = {
    kick: `kick ${player}`,
    ban: `ban ${player}`,
    pardon: `pardon ${player}`,
    'whitelist-remove': `whitelist remove ${player}`,
  };
  const command = commands[action];
  if (!command) {
    return jsonError(res, 'BAD_REQUEST', 'Unknown player action', 400);
  }
  // The player name is interpolated into one console command — reject
  // anything that could smuggle flags or extra commands into it.
  if (!/^[A-Za-z0-9_.[\]-]{1,64}$/.test(player)) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid player name', 400);
  }

  try {
    const response = await daemonRequest(
      resolved.server.UUID,
      '/container/command',
      {
        method: 'POST',
        body: { id: resolved.server.UUID, command },
        timeout: DAEMON_TIMEOUT_MEDIUM_MS,
      },
    );
    if (!response.ok) {
      return jsonError(
        res,
        'DAEMON_ERROR',
        `Daemon rejected the command (${response.status})`,
        502,
      );
    }
    jsonOk(res, { action, player, command });
  } catch (err) {
    if (err instanceof DaemonNodeNotFoundError) {
      return jsonError(res, 'NODE_NOT_FOUND', 'Node not found', 404);
    }
    logger.warn(`Player action ${action} failed for ${resolved.server.UUID}:`, {
      err,
    });
    return jsonError(res, 'DAEMON_UNREACHABLE', 'Could not reach daemon', 502);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/worlds — detected world folders
//
// Returns a bare array (the page controller passes it straight into
// `worlds.ejs`, which only relies on `world.name`; `size`/`players` are
// guarded and stay undefined).
// ---------------------------------------------------------------------------
router.get('/:id/worlds', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'files')) {
    return;
  }

  const server = await prisma.server.findUnique({
    where: { UUID: resolved.server.UUID },
    include: { node: true, image: true },
  });
  if (!server) {
    return jsonError(res, 'NOT_FOUND', 'Server not found', 404);
  }

  try {
    const serverStatusInput = getServerStatusInput(server);
    const response = await daemonRequest(
      server.UUID,
      `/fs/list?id=${encodeURIComponent(server.UUID)}`,
      { timeout: DAEMON_TIMEOUT_FILE_MS },
    );

    if (!response.ok) {
      jsonOk(res, []);
      return;
    }

    const raw: unknown = await response.json().catch(() => null);
    const folders = parseDaemonResponse(fsListSchema, raw);
    if (!Array.isArray(folders)) {
      // Daemon rate-limits `/fs/list` with `{ error: ... }` — show no worlds
      // rather than failing the page.
      jsonOk(res, []);
      return;
    }

    const worlds: { name: string }[] = [];
    for (const folder of folders) {
      if (
        folder.type === 'directory' &&
        (await isWorld(folder.name, serverStatusInput))
      ) {
        worlds.push({ name: folder.name });
      }
    }

    jsonOk(res, worlds);
  } catch (err) {
    logger.warn(`Failed to list worlds for ${server.UUID}:`, {
      err: err instanceof Error ? err.message : String(err),
    });
    jsonOk(res, []);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/worlds/:world/:action — delete | download
//
// `delete` → daemon `DELETE /fs/rm`.
// `download` → zip the folder (a download token only mints for files), then
// `POST /fs/download-token`; returns `{ world, token, url }`.
// ---------------------------------------------------------------------------
router.post('/:id/worlds/:world/:action', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'files')) {
    return;
  }

  const serverUUID = resolved.server.UUID;
  const world = String(req.params.world ?? '');
  const action = String(req.params.action ?? '');

  if (
    !world ||
    world.includes('/') ||
    world.includes('\\') ||
    world.includes('\0') ||
    !isPathSafe(world)
  ) {
    return jsonError(res, 'BAD_REQUEST', 'Invalid world name.', 400);
  }

  const userId = getAuthenticatedUserId(req);

  if (action === 'delete') {
    if (checkSuspended(res, resolved)) {
      return;
    }
    try {
      const response = await daemonRequest(serverUUID, '/fs/rm', {
        method: 'DELETE',
        body: { id: serverUUID, path: world },
        timeout: DAEMON_TIMEOUT_FILE_WRITE_MS,
      });

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
        userId,
        'server.world.deleted',
        serverUUID,
        { world },
        req.ip,
      );

      jsonOk(res, { world, deleted: true });
    } catch (err) {
      if (err instanceof DaemonNodeNotFoundError) {
        return jsonError(res, 'NOT_FOUND', 'Node not found', 404);
      }
      jsonError(res, 'DAEMON_UNREACHABLE', 'Could not reach daemon', 502);
    }
    return;
  }

  if (action === 'download') {
    try {
      const zipResponse = await daemonRequest(serverUUID, '/fs/zip', {
        method: 'POST',
        body: { id: serverUUID, path: [world], zipname: world },
        timeout: DAEMON_TIMEOUT_FILE_HEAVY_MS,
      });

      if (!zipResponse.ok) {
        const text = await zipResponse.text().catch(() => 'Daemon error');
        return jsonError(
          res,
          'DAEMON_ERROR',
          `Daemon returned ${zipResponse.status}: ${text}`,
          502,
        );
      }

      const tokenResponse = await daemonRequest(serverUUID, '/fs/download-token', {
        method: 'POST',
        body: { id: serverUUID, path: `${world}.zip` },
        timeout: DAEMON_TIMEOUT_MEDIUM_MS,
      });

      if (!tokenResponse.ok) {
        const text = await tokenResponse.text().catch(() => 'Daemon error');
        return jsonError(
          res,
          'DAEMON_ERROR',
          `Daemon returned ${tokenResponse.status}: ${text}`,
          502,
        );
      }

      const data = (await tokenResponse.json().catch(() => null)) as {
        token?: string;
        url?: string;
      } | null;

      if (!data?.token || !data?.url) {
        return jsonError(res, 'DAEMON_ERROR', 'No download token issued', 502);
      }

      jsonOk(res, { world, token: data.token, url: data.url });
    } catch (err) {
      if (err instanceof DaemonNodeNotFoundError) {
        return jsonError(res, 'NOT_FOUND', 'Node not found', 404);
      }
      jsonError(res, 'DAEMON_UNREACHABLE', 'Could not reach daemon', 502);
    }
    return;
  }

  jsonError(res, 'BAD_REQUEST', 'Unknown world action.', 400);
});

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/console/logs — recent console output from disk
//
// Ported from the daemon's `/container/logs/history` (the only history
// endpoint the daemon exposes). `server-console.js` reads `d.logs`.
// ---------------------------------------------------------------------------
router.get('/:id/console/logs', async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, 'console')) {
    return;
  }

  try {
    const response = await daemonRequest(
      resolved.server.UUID,
      `/container/logs/history?id=${encodeURIComponent(resolved.server.UUID)}`,
      { timeout: DAEMON_TIMEOUT_MEDIUM_MS },
    );

    if (!response.ok) {
      jsonOk(res, { logs: [] });
      return;
    }

    const raw = (await response.json().catch(() => null)) as {
      logs?: unknown;
    } | null;

    jsonOk(res, { logs: Array.isArray(raw?.logs) ? raw.logs : [] });
  } catch (err) {
    logger.warn(`Failed to read console logs for ${resolved.server.UUID}:`, {
      err: err instanceof Error ? err.message : String(err),
    });
    jsonOk(res, { logs: [] });
  }
});

export default router;
