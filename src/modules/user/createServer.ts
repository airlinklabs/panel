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
  parseImagePortRequirements,
  serializeServerPorts,
} from '../../handlers/utils/server/ports';

function pickAvailablePorts(pool: number[], usedPorts: number[], count: number): number[] {
  const picked: number[] = [];
  for (const port of pool) {
    if (!usedPorts.includes(port)) picked.push(port);
    if (picked.length === count) return picked;
  }
  return picked;
}

async function resolveUserServerLimit(userId: number, settings: any): Promise<number> {
  const user = await prisma.users.findUnique({ where: { id: userId } });
  if (!user) return 0;
  if (user.serverLimit !== null && user.serverLimit !== undefined) return user.serverLimit;
  return settings?.defaultServerLimit ?? 0;
}

async function resolveUserResourceLimits(userId: number, settings: any) {
  const user = await prisma.users.findUnique({ where: { id: userId } });
  return {
    maxMemory: user?.maxMemory ?? settings?.defaultMaxMemory ?? 512,
    maxCpu: user?.maxCpu ?? settings?.defaultMaxCpu ?? 100,
    maxStorage: user?.maxStorage ?? settings?.defaultMaxStorage ?? 5120,
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

        const settings = await prisma.settings.findUnique({ where: { id: 1 } });

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
        const images = await prisma.images.findMany();

        const nodeHeadroom: Record<number, unknown> = {};
        for (const n of nodes) {
          const agg = await prisma.server.aggregate({
            where: { nodeId: n.id },
            _sum: { Memory: true, Cpu: true, Storage: true },
          });
          nodeHeadroom[n.id] = {
            ram: n.ram,
            cpu: n.cpu,
            disk: n.disk,
            overMemory: n.overallocateMemory,
            overCpu: n.overallocateCpu,
            overDisk: n.overallocateDisk,
            usedMemory: agg._sum.Memory ?? 0,
            usedCpu: agg._sum.Cpu ?? 0,
            usedStorage: agg._sum.Storage ?? 0,
          };
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

        const settings = await prisma.settings.findUnique({ where: { id: 1 } });

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

        if (isNaN(memory) || memory < 128 || memory > resourceLimits.maxMemory) {
          return res.status(400).json({ error: `Memory must be between 128 and ${resourceLimits.maxMemory} MB.` });
        }
        if (isNaN(cpu) || cpu < 50 || cpu > resourceLimits.maxCpu) {
          return res.status(400).json({ error: `CPU must be between 50 and ${resourceLimits.maxCpu}% (50% = half a core).` });
        }
        if (isNaN(storage) || storage < 128 || storage > resourceLimits.maxStorage) {
          return res.status(400).json({ error: `Storage must be between 128 and ${resourceLimits.maxStorage} MB.` });
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

        const portRequirements = parseImagePortRequirements(image.portRequirements);
        const requiredPortCount = Math.max(1, portRequirements.length);

        let dockerImages: any[] = [];
        try {
          dockerImages = JSON.parse(image.dockerImages || '[]');
        } catch {
          return res.status(500).json({ error: 'Image docker configuration is invalid.' });
        }

        const imageDocker = dockerImages.find((img: any) => Object.keys(img).includes(dockerImage));
        if (!imageDocker) return res.status(400).json({ error: 'Docker image variant not found.' });

        const startCommand = image.startup;
        if (!startCommand) return res.status(500).json({ error: 'Image has no startup command.' });

        let imageVariables: any[] = [];
        try {
          imageVariables = JSON.parse(image.variables || '[]');
        } catch {
          imageVariables = [];
        }

        const { assignedPorts, createdServer }: { assignedPorts: number[]; createdServer: any } = await withNodePortLock(node.id, async () => {
          const pool = await getNodePortPool(node.id);
          const existingServers = await prisma.server.findMany({ where: { nodeId: node.id } });
          const picked = pickAvailablePorts(pool, getUsedExternalPorts(existingServers), requiredPortCount);
          if (picked.length < requiredPortCount) {
            throw new Error(`No available ports on the selected node. ${requiredPortCount} port(s) required.`);
          }

          const portsJson = serializeServerPorts(picked.map((externalPort, index) => {
            const requirement = portRequirements[index];
            return {
              name: requirement?.name || `Port ${index + 1}`,
              internalPort: requirement?.internalPort || externalPort,
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
              backupLimit: 5,
              databaseLimit: 5,
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

        const settings = await prisma.settings.findUnique({ where: { id: 1 } });
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
          } catch (err: any) {
            const isGone =
              err.status === 404 ||
              (err.body as any)?.error?.includes('not exist');

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
