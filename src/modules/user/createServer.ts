import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import { queueer } from '../../handlers/queueer';
import axios from 'axios';
import { daemonSchemeSync } from '../../handlers/utils/core/daemonRequest';
import {
  getUsedExternalPorts,
  parseImagePortRequirements,
  serializeServerPorts,
} from '../../handlers/utils/server/ports';

function pickAvailablePorts(allocatedPorts: number[], usedPorts: number[], count: number): number[] {
  const picked: number[] = [];
  for (const port of allocatedPorts) {
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

        res.render('user/create-server', {
          user,
          req,
          settings,
          nodes,
          images,
          serverLimit,
          currentCount,
          resourceLimits,
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

        const { name, description, nodeId, imageId, dockerImage, Memory, Cpu, Storage } = req.body;

        if (!name || !nodeId || !imageId || !dockerImage || !Memory || !Cpu || !Storage) {
          return res.status(400).json({ error: 'Missing required fields.' });
        }

        const memory = parseInt(Memory);
        const cpu = parseInt(Cpu);
        const storage = parseInt(Storage);

        if (isNaN(memory) || memory < 128 || memory > resourceLimits.maxMemory) {
          return res.status(400).json({ error: `Memory must be between 128 and ${resourceLimits.maxMemory} MB.` });
        }
        if (isNaN(cpu) || cpu < 50 || cpu > resourceLimits.maxCpu) {
          return res.status(400).json({ error: `CPU must be between 50 and ${resourceLimits.maxCpu}% (50% = half a core).` });
        }
        if (isNaN(storage) || storage < 128 || storage > resourceLimits.maxStorage) {
          return res.status(400).json({ error: `Storage must be between 128 and ${resourceLimits.maxStorage} MB.` });
        }

        const node = await prisma.node.findUnique({ where: { id: parseInt(nodeId) } });
        if (!node) return res.status(400).json({ error: 'Node not found.' });

        let allocatedPorts: number[] = [];
        try {
          if (node.allocatedPorts) allocatedPorts = JSON.parse(node.allocatedPorts);
        } catch {
          return res.status(500).json({ error: 'Node port configuration is invalid.' });
        }

        const image = await prisma.images.findUnique({ where: { id: parseInt(imageId) } });
        if (!image) return res.status(400).json({ error: 'Image not found.' });

        const portRequirements = parseImagePortRequirements(image.portRequirements);
        const requiredPortCount = Math.max(1, portRequirements.length);
        const existingServers = await prisma.server.findMany({ where: { nodeId: node.id } });
        const assignedPorts = pickAvailablePorts(allocatedPorts, getUsedExternalPorts(existingServers), requiredPortCount);

        if (assignedPorts.length < requiredPortCount) {
          return res.status(503).json({ error: `No available ports on the selected node. ${requiredPortCount} port(s) required.` });
        }

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

        const portsJson = serializeServerPorts(assignedPorts.map((externalPort, index) => {
          const requirement = portRequirements[index];
          return {
            name: requirement?.name || `Port ${index + 1}`,
            internalPort: requirement?.internalPort || externalPort,
            externalPort,
            primary: index === 0,
          };
        }));

        const createdServer = await prisma.server.create({
          data: {
            name: name.trim(),
            description: description?.trim() || null,
            ownerId: userId!,
            nodeId: node.id,
            imageId: image.id,
            Ports: portsJson,
            Memory: memory,
            Cpu: cpu,
            Storage: storage,
            Variables: JSON.stringify(imageVariables),
            StartCommand: startCommand,
            dockerImage: JSON.stringify(imageDocker),
          },
        });

        queueer.addTask(async () => {
          const servers = await prisma.server.findMany({
            where: { Queued: true },
            include: { image: true, node: true },
          });

          for (const server of servers) {
            if (!server.Variables) {
              await prisma.server.update({ where: { id: server.id }, data: { Queued: false } });
              continue;
            }

            let serverEnv: any[];
            try {
              const rawVars = JSON.parse(server.Variables);
              serverEnv = rawVars.map((v: any) => ({
                env: String(v.env_variable ?? v.env ?? ''),
                value: v.value ?? v.default_value ?? '',
              }));
              let serverPort = assignedPorts[0];
              try {
                const parsedPorts = JSON.parse(server.Ports);
                const primary = parsedPorts.find((p: any) => p.primary);
                if (primary?.Port) {
                  serverPort = parseInt(String(primary.Port).split(':')[0]);
                }
              } catch { /* keep fallback */ }
              serverEnv.push({ env: 'SERVER_PORT', value: serverPort });
              serverEnv.push({ env: 'SERVER_MEMORY', value: String(server.Memory) });
              serverEnv.push({ env: 'SERVER_CPU',    value: String(server.Cpu) });
            } catch (err) {
              logger.error(`Error parsing Variables for server ${server.id}:`, err);
              await prisma.server.update({ where: { id: server.id }, data: { Queued: false } });
              continue;
            }

            const env = serverEnv.reduce((acc: any, curr: any) => {
              acc[curr.env] = curr.value;
              return acc;
            }, {});

            const daemonUrl = `${daemonSchemeSync()}://${server.node.address}:${server.node.port}`;

            if (!server.image?.scripts) {
              await prisma.server.update({ where: { id: server.id }, data: { Queued: false } });
              continue;
            }

            let scripts: Record<string, unknown>;
            try {
              scripts = JSON.parse(server.image.scripts);
            } catch (err) {
              logger.error(`Error parsing scripts for server ${server.id}:`, err);
              await prisma.server.update({ where: { id: server.id }, data: { Queued: false } });
              continue;
            }

            try {
              if (scripts.installation && typeof scripts.installation === 'object') {
                const inst = scripts.installation as { script: string; container: string; entrypoint: string };
                await axios.post(
                  `${daemonUrl}/container/installer`,
                  { id: server.UUID, script: inst.script, container: inst.container, entrypoint: inst.entrypoint || 'bash', env },
                  {
                    auth: { username: 'Airlink', password: server.node.key },
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 600000,
                  },
                );
              } else if (Array.isArray(scripts.install)) {
                // Pass the docker image so the daemon can pull it during install
                // rather than waiting until the first Start click.
                let dockerImageValue: string | undefined;
                try {
                  const parsed = JSON.parse(server.dockerImage || '{}');
                  dockerImageValue = Object.values(parsed)[0] as string | undefined;
                } catch { /* leave undefined */ }

                await axios.post(
                  `${daemonUrl}/container/install`,
                  {
                    id: server.UUID,
                    image: dockerImageValue,
                    env,
                    scripts: (scripts.install as any[]).map((s: any) => ({
                      url: s.url,
                      onStartup: s.onStart,
                      ALVKT: s.ALVKT,
                      fileName: s.fileName,
                    })),
                  },
                  {
                    auth: { username: 'Airlink', password: server.node.key },
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 600000,
                  },
                );
              }
              await prisma.server.update({ where: { id: server.id }, data: { Queued: false } });
            } catch (err) {
              logger.error(`Error sending install request for server ${server.id}:`, err);
            }
          }
        });

        res.status(200).json({ success: true, serverUUID: createdServer.UUID });
      } catch (error) {
        logger.error('Error creating user server:', error);
        res.status(500).json({ error: 'Failed to create server.' });
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
            await axios.delete(`${daemonSchemeSync()}://${server.node.address}:${server.node.port}/container`, {
              auth: { username: 'Airlink', password: server.node.key },
              headers: { 'Content-Type': 'application/json' },
              data: { id: server.UUID },
            });
          } catch (err: any) {
            const isGone =
              err.response?.status === 404 ||
              err.response?.data?.error?.includes('not exist');

            if (!isGone) {
              logger.error('Error deleting container from daemon:', err);
              return res.status(502).json({
                error: 'Could not delete the server on the node. Try again, or use force delete to remove it from the panel only.',
              });
            }
          }
        }

        await prisma.server.delete({ where: { UUID: server.UUID } });
        res.json({ success: true });
      } catch (error) {
        logger.error('Error deleting user server:', error);
        res.status(500).json({ error: 'Failed to delete server.' });
      }
    });

    return router;
  },
};

export default userCreateServerModule;
