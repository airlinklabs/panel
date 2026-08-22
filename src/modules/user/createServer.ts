import { getSettings } from '../../handlers/settingsCache';
import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import { queueer } from '../../handlers/queueer';
import { daemonRequest } from '../../handlers/utils/core/daemonRequest';
import { processQueuedServerInstalls } from '../../handlers/installQueue';
import { assertNodeCapacity } from '../../handlers/utils/server/resourceCheck';
import {
  claimNodePorts,
  getNodePortPool,
  releaseServerAllocations,
  withNodePortLock,
} from '../../handlers/utils/server/allocations';
import {
  getUsedExternalPorts,
  isValidPort,
  parseImagePortRequirements,
  pickRandomFreePorts,
  serializeServerPorts,
} from '../../handlers/utils/server/ports';
import type { ServerVariable } from './server/shared';

interface ClientPort {
  name: string;
  internalPort: number;
}

// Users choose internal ports (and names) themselves; external ports are always
// auto-assigned from the node pool. Returns null when `raw` is invalid so the
// request is rejected; the create flow falls back to the image's requirements
// when no ports are supplied at all.
function parseClientPorts(raw: unknown): ClientPort[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: ClientPort[] = [];
  for (const item of raw) {
    const obj = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const internalPort = Number(obj.internalPort ?? obj.port);
    const name = typeof obj.name === 'string' ? obj.name.trim() : '';
    if (!Number.isInteger(internalPort) || !isValidPort(internalPort) || !name) {
      return null;
    }
    out.push({ name, internalPort });
  }
  return out;
}

const DEFAULT_MAX_MEMORY_MB = 512;
const DEFAULT_MAX_CPU_PERCENT = 100;
const DEFAULT_MAX_STORAGE_MB = 5120;
const MIN_MEMORY_MB = 128;
const MIN_CPU_PERCENT = 50;
const MIN_STORAGE_MB = 128;
const DEFAULT_BACKUP_LIMIT = 5;
const DEFAULT_DATABASE_LIMIT = 5;

interface PortAllocation {
  assignedPorts: number[];
  createdServer: { UUID: string; id: number };
}

async function resolveUserServerLimit(
  userId: number,
  settings: {
    defaultServerLimit?: number | null;
    allowPrivilegedServerLimit?: number | null;
  } | null,
): Promise<number> {
const user = await prisma.users.findUnique({ where: { id: userId } });
  if (!user) return 0;
  // Owner and admins are not subject to per-user server limits.
  if (user.role === 'owner' || user.role === 'admin') return Number.MAX_SAFE_INTEGER;
  if (user.serverLimit !== null && user.serverLimit !== undefined) return user.serverLimit;
  if (user.role === 'privileged') return settings?.allowPrivilegedServerLimit ?? 5;
  return settings?.defaultServerLimit ?? 0;
}

async function resolveUserResourceLimits(
  userId: number,
  settings: {
    defaultMaxMemory?: number | null;
    defaultMaxCpu?: number | null;
    defaultMaxStorage?: number | null;
    allowPrivilegedMaxMemory?: number | null;
    allowPrivilegedMaxCpu?: number | null;
    allowPrivilegedMaxStorage?: number | null;
  } | null,
) {
  const user = await prisma.users.findUnique({ where: { id: userId } });
  const isPrivilegedRole = user?.role === 'privileged';
  return {
    maxMemory: user?.maxMemory ?? settings?.[isPrivilegedRole ? 'allowPrivilegedMaxMemory' : 'defaultMaxMemory'] ?? DEFAULT_MAX_MEMORY_MB,
    maxCpu: user?.maxCpu ?? settings?.[isPrivilegedRole ? 'allowPrivilegedMaxCpu' : 'defaultMaxCpu'] ?? DEFAULT_MAX_CPU_PERCENT,
    maxStorage: user?.maxStorage ?? settings?.[isPrivilegedRole ? 'allowPrivilegedMaxStorage' : 'defaultMaxStorage'] ?? DEFAULT_MAX_STORAGE_MB,
  };
}

const userCreateServerModule: Module = {
  info: {
    name: 'User Create Server Module',
    description: 'Allows users to create their own servers within admin-defined limits.',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirlinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get('/create-server', isAuthenticated(), async (req: Request, res: Response) => {
      try {
        const userId = req.session?.user?.id;
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) return res.redirect('/login');

        const settings = await await getSettings();

        if (!settings?.allowUserCreateServer) {
          return res.redirect('/');
        }

        const serverLimit = await resolveUserServerLimit(userId!, settings);
        if (serverLimit === 0) {
          return res.redirect('/');
        }

        const currentCount = await prisma.server.count({ where: { ownerId: userId } });
        if (currentCount >= serverLimit) {
          return res.redirect('/?err=SERVER_LIMIT_REACHED');
        }

        const resourceLimits = await resolveUserResourceLimits(userId!, settings);
        const nodes = await prisma.node.findMany();
        const images = await prisma.images.findMany({ where: { status: 'approved' } });

        const nodeHeadroom: Record<number, unknown> = {};
        // Recommend the node with the most free capacity so new servers land on
        // the least-loaded node by default (a local "prefer nearby node" proxy).
        let recommendedNodeId: number | null = null;
        let bestRatio = Infinity;
        for (const n of nodes) {
          const agg = await prisma.server.aggregate({
            where: { nodeId: n.id },
            _sum: { Memory: true, Cpu: true, Storage: true },
          });
          const usedMemory = agg._sum.Memory ?? 0;
          const usedCpu = agg._sum.Cpu ?? 0;
          const usedStorage = agg._sum.Storage ?? 0;
          nodeHeadroom[n.id] = {
            ram: n.ram,
            cpu: n.cpu,
            disk: n.disk,
            overMemory: n.overallocateMemory,
            overCpu: n.overallocateCpu,
            overDisk: n.overallocateDisk,
            usedMemory,
            usedCpu,
            usedStorage,
          };

          const caps: number[] = [];
          const ratios: number[] = [];
          if (n.ram > 0) {
            caps.push(n.ram);
            ratios.push(usedMemory / (n.ram * 1024));
          }
          if (n.cpu > 0) {
            caps.push(n.cpu);
            ratios.push(usedCpu / n.cpu);
          }
          if (n.disk > 0) {
            caps.push(n.disk);
            ratios.push(usedStorage / (n.disk * 1024));
          }
          const ratio = ratios.length > 0 ? ratios.reduce((sum, r) => sum + r, 0) / ratios.length : 0;
          if (ratio < bestRatio) {
            bestRatio = ratio;
            recommendedNodeId = n.id;
          }
        }

        // Prefer the node the user chose in their account settings; the
        // least-loaded node remains the fallback default.
        if (user.preferredNodeId && nodes.some(n => n.id === user.preferredNodeId)) {
          recommendedNodeId = user.preferredNodeId;
        }

        res.render('user/create-server', {
          user,
          req,
          settings,
          nodes,
          images,
          serverLimit,
          currentCount,
          resourceLimits,
          nodeHeadroom,
          recommendedNodeId,
        });
      } catch (error) {
        logger.error('Error loading user create server page:', error);
        return res.redirect('/');
      }
    });

    router.post('/create-server', isAuthenticated(), async (req: Request, res: Response) => {
      try {
        const userId = req.session?.user?.id;
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        const settings = await await getSettings();

        if (!settings?.allowUserCreateServer) {
          return res.status(403).json({ error: 'Server creation is not enabled.' });
        }

        const serverLimit = await resolveUserServerLimit(userId!, settings);
        if (serverLimit === 0) {
          return res.status(403).json({ error: 'You are not allowed to create servers.' });
        }

        const currentCount = await prisma.server.count({ where: { ownerId: userId } });
        if (currentCount >= serverLimit) {
          return res.status(403).json({ error: `You have reached your server limit of ${serverLimit}.` });
        }

        const resourceLimits = await resolveUserResourceLimits(userId!, settings);

        const { name, description, nodeId, imageId, dockerImage, Memory, Swap, Cpu, Storage } = req.body;

        if (!name || !nodeId || !imageId || !dockerImage || !Memory || !Cpu || !Storage) {
          return res.status(400).json({ error: 'Missing required fields.' });
        }

        const memory = parseInt(Memory);
        const cpu = parseInt(Cpu);
        const storage = parseInt(Storage);
        const swap = Swap !== undefined && Swap !== '' ? parseInt(Swap) : 0;

        if (isNaN(memory) || memory < MIN_MEMORY_MB || memory > resourceLimits.maxMemory) {
          return res.status(400).json({ error: `Memory must be between ${MIN_MEMORY_MB} and ${resourceLimits.maxMemory} MB.` });
        }
        if (isNaN(cpu) || cpu < MIN_CPU_PERCENT || cpu > resourceLimits.maxCpu) {
          return res.status(400).json({ error: `CPU must be between ${MIN_CPU_PERCENT} and ${resourceLimits.maxCpu}% (${MIN_CPU_PERCENT}% = half a core).` });
        }
        if (isNaN(storage) || storage < MIN_STORAGE_MB || storage > resourceLimits.maxStorage) {
          return res.status(400).json({ error: `Storage must be between ${MIN_STORAGE_MB} and ${resourceLimits.maxStorage} MB.` });
        }

        const used = await prisma.server.aggregate({
          where: { ownerId: userId },
          _sum: { Memory: true, Cpu: true, Storage: true },
        });
        const usedMemory = used._sum.Memory ?? 0;
        const usedCpu = used._sum.Cpu ?? 0;
        const usedStorage = used._sum.Storage ?? 0;

        if (usedMemory + memory > resourceLimits.maxMemory) {
          return res.status(400).json({
            error: `Memory allocation would exceed your limit of ${resourceLimits.maxMemory} MB (${usedMemory} MB already in use).`,
          });
        }
        if (usedCpu + cpu > resourceLimits.maxCpu) {
          return res.status(400).json({
            error: `CPU allocation would exceed your limit of ${resourceLimits.maxCpu}% (${usedCpu}% already in use).`,
          });
        }
        if (usedStorage + storage > resourceLimits.maxStorage) {
          return res.status(400).json({
            error: `Storage allocation would exceed your limit of ${resourceLimits.maxStorage} MB (${usedStorage} MB already in use).`,
          });
        }
        if (isNaN(swap) || swap < -1) {
          return res.status(400).json({ error: 'Swap must be -1 (unlimited), 0 (disabled), or a positive MB value.' });
        }

        const node = await prisma.node.findUnique({ where: { id: parseInt(nodeId) } });
        if (!node) return res.status(400).json({ error: 'Node not found.' });

        try {
          await assertNodeCapacity(node, memory, cpu, storage);
        } catch (error) {
          return res.status(400).json({ error: error instanceof Error ? error.message : 'Node capacity exceeded.' });
        }

        const image = await prisma.images.findUnique({ where: { id: parseInt(imageId) } });
        if (!image) return res.status(400).json({ error: 'Image not found.' });
        if (image.status !== 'approved') {
          return res.status(400).json({ error: 'This image is not approved yet.' });
        }

        const portRequirements = parseImagePortRequirements(image.portRequirements);
        // Port specs the client may supply (the multi-port flow). When omitted,
        // fall back to the image's required ports. External ports are always
        // auto-assigned from the node pool below.
        const hasClientPorts = Array.isArray(req.body.ports) && (req.body.ports as unknown[]).length > 0;
        let portSpecs: ClientPort[] = portRequirements.map((r) => ({ name: r.name, internalPort: r.internalPort }));
        if (hasClientPorts) {
          const parsed = parseClientPorts(req.body.ports);
          if (!parsed) {
            return res.status(400).json({ error: 'Invalid port configuration.' });
          }
          if (parsed.length > 20) {
            return res.status(400).json({ error: 'Too many ports (max 20).' });
          }
          portSpecs = parsed;
        }
        const requiredPortCount = Math.max(1, portSpecs.length);

        let dockerImages: Record<string, string>[] = [];
        try {
          const parsed: unknown = JSON.parse(image.dockerImages || '[]');
          if (Array.isArray(parsed)) {
            dockerImages = parsed;
          }
        } catch {
          return res.status(500).json({ error: 'Image docker configuration is invalid.' });
        }

        const imageDocker = dockerImages.find((img) => Object.keys(img).includes(dockerImage));
        if (!imageDocker) return res.status(400).json({ error: 'Docker image variant not found.' });

        const startCommand = image.startup;
        if (!startCommand) return res.status(500).json({ error: 'Image has no startup command.' });

        let imageVariables: ServerVariable[] = [];
        try {
          const parsed: unknown = JSON.parse(image.variables || '[]');
          if (Array.isArray(parsed)) {
            imageVariables = parsed;
          }
        } catch {
          imageVariables = [];
        }

        const { assignedPorts, createdServer }: PortAllocation = await withNodePortLock(node.id, async () => {
          const pool = await getNodePortPool(node.id);
          const existingServers = await prisma.server.findMany({ where: { nodeId: node.id } });
          const picked = pickRandomFreePorts(pool, getUsedExternalPorts(existingServers), requiredPortCount);
          if (picked.length < requiredPortCount) {
            throw new Error(`No available ports on the selected node. ${requiredPortCount} port(s) required.`);
          }

          const portsJson = serializeServerPorts(picked.map((externalPort, index) => {
            const spec = portSpecs[index];
            return {
              name: spec?.name ?? `Port ${index + 1}`,
              internalPort: spec?.internalPort ?? externalPort,
              externalPort,
              primary: index === 0,
            };
          }));

          const created = await prisma.server.create({
            data: {
              name: name.trim(),
              description: description?.trim() || null,
              ownerId: userId!,
              nodeId: node.id,
              imageId: image.id,
              Ports: portsJson,
              Memory: memory,
              Swap: swap,
              Cpu: cpu,
              Storage: storage,
              backupLimit: DEFAULT_BACKUP_LIMIT,
              databaseLimit: DEFAULT_DATABASE_LIMIT,
              Variables: JSON.stringify(imageVariables),
              StartCommand: startCommand,
              dockerImage: JSON.stringify(imageDocker),
            },
          });

          await claimNodePorts(node.id, picked, created.UUID).catch(() => {});

          return { assignedPorts: picked, createdServer: created };
        });

        queueer.addTask(processQueuedServerInstalls);

        return res.status(200).json({ success: true, serverUUID: createdServer.UUID });
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('No available ports on the selected node.')) {
          res.status(503).json({ error: error.message });
          return;
        }
        logger.error('Error creating user server:', error);
        res.status(500).json({ error: 'Failed to create server.' });
        return;
      }
    });

    router.delete('/user/server/:uuid', isAuthenticated(), async (req: Request, res: Response) => {
      try {
        const userId = req.session?.user?.id;
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        const settings = await await getSettings();
        if (!settings?.allowUserDeleteServer) {
          return res.status(403).json({ error: 'Server deletion is not enabled for users.' });
        }

        const server = await prisma.server.findUnique({
          where: { UUID: String(req.params.uuid) },
          include: { node: true },
        });

        if (!server) return res.status(404).json({ error: 'Server not found.' });
        if (server.ownerId !== userId) return res.status(403).json({ error: 'This is not your server.' });

        const force = req.query.force === 'true';

        if (!force) {
          try {
            await daemonRequest({
              nodeAddress: server.node.address,
              nodePort: server.node.port,
              nodeKey: server.node.key,
              method: 'DELETE',
              path: '/container',
              body: { id: server.UUID },
            });
          } catch (err: unknown) {
            const errObj = err && typeof err === 'object' ? err as Record<string, unknown> : {};
            const errBody = errObj.body && typeof errObj.body === 'object' ? errObj.body as Record<string, unknown> : undefined;
            const isGone =
              errObj.status === 404 ||
              (errBody?.error as string)?.includes('not exist');

            if (!isGone) {
              logger.error('Error deleting container from daemon:', err);
              return res.status(502).json({
                error: 'Could not delete the server on the node. Try again, or use force delete to remove it from the panel only.',
              });
            }
          }
        }

        await releaseServerAllocations(server.UUID).catch(() => {});
        await prisma.server.delete({ where: { UUID: server.UUID } });
        return res.json({ success: true });
      } catch (error) {
        logger.error('Error deleting user server:', error);
        res.status(500).json({ error: 'Failed to delete server.' });
        return;
      }
    });

    return router;
  },
};

export default userCreateServerModule;
