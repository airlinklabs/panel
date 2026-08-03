import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import { checkNodeStatus } from '../../handlers/utils/node/nodeStatus';
import logger from '../../handlers/logger';
import { getParamAsNumber } from '../../utils/typeHelpers';
import { daemonRequest } from '../../handlers/utils/core/daemonRequest';
import { syncNodeAllocations } from '../../handlers/utils/server/allocations';


function generateApiKey(length: number): string {
  const characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters[randomIndex];
  }
  return result;
}

type NodeWithInstances = {
  id: number;
  name: string;
  ram: number;
  cpu: number;
  disk: number;
  overallocateMemory: number;
  overallocateDisk: number;
  overallocateCpu: number;
  allocationCount?: number;
  allocationsInUse?: number;
  locationId: number | null;
  address: string;
  port: number;
  key: string;
  createdAt: Date;
  instances: any[];
  servers?: any[]; // For port allocation UI
  usage?: {
    memory: number;
    cpu: number;
    disk: number;
    overallocatedMemory: number;
  };
}

async function listNodes(res: Response, includeServers = false) {
  try {
    const nodes = await prisma.node.findMany({ include: { location: true } });
    const nodesWithStatus = [];

    for (const node of nodes) {
      const instances = await prisma.server.findMany({
        where: { nodeId: node.id },
      });

      const usedMemory = instances.reduce((sum, s) => sum + s.Memory, 0);
      const usedCpu = instances.reduce((sum, s) => sum + s.Cpu, 0);
      const usedDisk = instances.reduce((sum, s) => sum + s.Storage, 0);

      const [allocationTotal, inUse] = await Promise.all([
        prisma.allocation.count({ where: { nodeId: node.id } }),
        prisma.allocation.count({ where: { nodeId: node.id, serverId: { not: null } } }),
      ]);

      const nodeWithInstances: NodeWithInstances = {
        ...node,
        instances,
        ...(includeServers ? { servers: instances } : {}),
        allocationCount: allocationTotal,
        allocationsInUse: inUse,
        usage: {
          memory: node.ram > 0 ? Math.round((usedMemory / (node.ram * 1024)) * 100) : 0,
          cpu: node.cpu > 0 ? Math.round((usedCpu / node.cpu) * 100) : 0,
          disk: node.disk > 0 ? Math.round((usedDisk / (node.disk * 1024)) * 100) : 0,
          overallocatedMemory:
            node.ram > 0
              ? Math.round((usedMemory / (node.ram * 1024 * (1 + node.overallocateMemory / 100))) * 100)
              : 0,
        },
      };

      nodesWithStatus.push(await checkNodeStatus(nodeWithInstances));
    }

    return nodesWithStatus;
  } catch (error) {
    logger.error('Error fetching nodes:', error);
    res.status(500).json({ message: 'Error fetching nodes.' });
    return;
  }
}

const adminModule: Module = {
  info: {
    name: 'Admin Nodes Module',
    description: 'This file is for admin functionality of the Nodes.',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/admin/nodes',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const nodes = await listNodes(res);

          const instance = await prisma.server.findMany();
          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          res.render('admin/nodes/nodes', {
            user,
            req,
            settings,
            nodes,
            instance,
          });
        } catch (error) {
          logger.error('Error fetching user:', error);
          return res.redirect('/login');
        }
      },
    );

    router.get(
      '/admin/nodes/create',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const nodes = await listNodes(res);

          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });
          const locations = await prisma.location.findMany();
          res.render('admin/nodes/create', { user, req, settings, nodes, locations });
        } catch (error) {
          logger.error('Error fetching user:', error);
          return res.redirect('/login');
        }
      },
    );

    router.get(
      '/admin/nodes/list',
      isAuthenticated(true),
      async (_req: Request, res: Response) => {
        // Include servers data for port allocation UI
        const listNode = await listNodes(res, true);
        res.json(listNode);
      },
    );

    router.post(
      '/admin/nodes/create',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        const { name, ram, cpu, disk, address, port } = req.body;
        const locationId = req.body.locationId ? parseInt(req.body.locationId) : null;

        // 'all' from the UI means unlimited → store 0
        const parseLimit = (v: unknown): number => (v === 'all' ? 0 : parseFloat(String(v ?? '')));

        // Fall back to the global defaults (set in admin settings) when the form
        // leaves overallocation empty or the field isn't sent.
        const settings = await prisma.settings.findUnique({ where: { id: 1 } });
        const defOvMem = settings?.defaultOverallocateMemory ?? 0;
        const defOvDisk = settings?.defaultOverallocateDisk ?? 0;
        const defOvCpu = settings?.defaultOverallocateCpu ?? 0;
        const rawOv = (v: unknown, d: number): number =>
          v === undefined || v === null || String(v).trim() === '' || String(v) === 'all'
            ? d
            : parseFloat(String(v));
        const overallocateMemory = rawOv(req.body.overallocateMemory, defOvMem);
        const overallocateDisk   = rawOv(req.body.overallocateDisk, defOvDisk);
        const overallocateCpu    = rawOv(req.body.overallocateCpu, defOvCpu);

        if (
          [overallocateMemory, overallocateDisk, overallocateCpu].some(
            (v) => isNaN(v) || v < 0,
          )
        ) {
          res.status(400).json({ message: 'Overallocation percentages must be >= 0.' });
          return;
        }

        if (locationId !== null) {
          const location = await prisma.location.findUnique({ where: { id: locationId } });
          if (!location) {
            res.status(400).json({ message: 'Selected location not found.' });
            return;
          }
        }

        if (!name || typeof name !== 'string') {
          res.status(400).json({ message: 'Name must be a string.' });
          return;
        } else if (name.length < 3 || name.length > 50) {
          res.status(400).json({
            message: 'Name must be between 3 and 50 characters long.',
          });
          return;
        }

        if (ram !== 'all' && (!ram || isNaN(parseFloat(ram)) || parseFloat(ram) <= 0)) {
          res.status(400).json({ message: 'RAM must be a positive number.' });
          return;
        }

        if (cpu !== 'all' && (!cpu || isNaN(parseFloat(cpu)) || parseFloat(cpu) <= 0)) {
          res.status(400).json({ message: 'CPU must be a positive number.' });
          return;
        }

        if (disk !== 'all' && (!disk || isNaN(parseFloat(disk)) || parseFloat(disk) <= 0)) {
          res.status(400).json({ message: 'Disk must be a positive number.' });
          return;
        }

        const addressRegex =
          /^(localhost|(?:\d{1,3}\.){3}\d{1,3}|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})$/;
        if (
          !address ||
          typeof address !== 'string' ||
          !addressRegex.test(address)
        ) {
          res.status(400).json({
            message: 'Address must be a valid IPv4, domain, or localhost.',
          });
          return;
        }

        if (
          !port ||
          isNaN(parseInt(port)) ||
          parseInt(port) <= 1024 ||
          parseInt(port) > 65535
        ) {
          res
            .status(400)
            .json({ message: 'Port must be a number between 1025 and 65535.' });
          return;
        }

        const allocatedPorts = req.body.allocatedPorts || '[]';
        let parsedPorts: number[] = [];
        try {
          parsedPorts = JSON.parse(allocatedPorts);
          if (!Array.isArray(parsedPorts)) {
            throw new Error('Allocated ports must be an array');
          }
          for (const p of parsedPorts) {
            if (typeof p !== 'number' || p < 1024 || p > 65535) {
              throw new Error('Each port must be a number between 1024 and 65535');
            }
          }
        } catch (error: any) {
          res.status(400).json({
            message: 'Invalid allocated ports format: ' + (error.message || 'Unknown error'),
          });
          return;
        }

        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(403).json({ message: 'Unauthorized access.' });
            return;
          }

          const key = generateApiKey(32);

          const ramValue = parseLimit(ram);
          const cpuValue = parseLimit(cpu);
          const diskValue = parseLimit(disk);
          const portValue = parseInt(port);

          const node = await prisma.node.create({
            data: {
              name,
              ram: ramValue,
              cpu: cpuValue,
              disk: diskValue,
              overallocateMemory,
              overallocateDisk,
              overallocateCpu,
              locationId,
              address,
              port: portValue,
              key,
              allocatedPorts,
              createdAt: new Date(),
            },
          });

          await syncNodeAllocations(node.id, parsedPorts).catch(() => {});

          res.status(200).json({ message: 'Node created successfully.', node });
          return;
        } catch (error) {
          logger.error('Error when creating the node:', error);
          res.status(500).json({ message: 'Error when creating the node.' });
          return;
        }
      },
    );

    router.delete(
      '/admin/node/:id',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const nodeId = getParamAsNumber(req.params.id);
          const deleteInstances = req.query.deleteInstance === 'true';

          try {
            const serverCount = await prisma.server.count({
              where: { nodeId: nodeId },
            });

            if (serverCount > 0 && !deleteInstances) {
              res.status(400).json({
                message: `Node has ${serverCount} server(s) associated. Set ?deleteInstance=true to delete them as well, or delete the servers first.`,
              });
              return;
            }

            if (deleteInstances) {
              const node = await prisma.node.findUnique({
                where: { id: nodeId },
                include: { servers: true },
              });

              if (node) {
                await Promise.allSettled(
                  node.servers.map((server) =>
                    daemonRequest({
                      nodeAddress: node.address,
                      nodePort: node.port,
                      nodeKey: node.key,
                      method: 'DELETE',
                      path: '/container',
                      body: { id: server.UUID },
                      timeout: 8000,
                    }),
                  ),
                );
              }

              await prisma.server.deleteMany({
                where: { nodeId: nodeId },
              });
            }

            await prisma.node.delete({ where: { id: nodeId } });

            res.status(200).json({
              message: deleteInstances
                ? 'Node and associated instances deleted successfully.'
                : 'Node deleted successfully.',
            });
          } catch (error) {
            logger.error('Error when deleting the node:', error);
            res.status(500).json({ message: 'Error when deleting the node.' });
          }
        } catch (error) {
          logger.error('Error fetching user:', error);
          return res.redirect('/login');
        }
      },
    );

    router.get(
      '/admin/node/:id/configure',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const nodeId = getParamAsNumber(req.params.id);

          const node = await prisma.node.findUnique({ where: { id: nodeId } });
          if (!node) {
            res.status(404).json({ message: 'Node not found.' });
            return;
          }

          res
            .status(200)
            .json(
              'configure -- -- --panel "' +
                process.env.URL +
                '" --key "' +
                node.key +
                '"',
            );
          return;
        } catch (error) {
          logger.error('Error fetching user:', error);
          return res.redirect('/login');
        }
      },
    );

    router.post(
      '/admin/node/:id/verify',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const nodeId = getParamAsNumber(req.params.id);
          const node = await prisma.node.findUnique({ where: { id: nodeId } });
          if (!node) {
            res.status(404).json({ message: 'Node not found.' });
            return;
          }

          const result = await daemonRequest<{ status?: string; versionRelease?: string; remote?: string; error?: string }>({
            nodeAddress: node.address,
            nodePort: node.port,
            nodeKey: node.key,
            method: 'GET',
            path: '/',
            timeout: 10000,
          });

          res.status(200).json({
            connected: result.status === 200,
            status: result.data?.status || null,
            version: result.data?.versionRelease || null,
            remote: result.data?.remote ?? null,
            error: result.data?.error ?? null,
          });
        } catch (error: any) {
          const cause = error?.cause?.code || error?.code || error?.message || '';
          const friendly =
            typeof cause === 'string' && cause.includes('ECONNREFUSED')
              ? 'No daemon is listening on that address and port yet. Start the daemon, then try again.'
              : cause.includes('ENOTFOUND') || cause.includes('EAI_AGAIN')
                ? 'That address does not resolve. Check the hostname or IP you entered.'
                : cause.includes('timed out')
                  ? 'The daemon did not answer in time. Check the address, port, and firewall.'
                  : `Could not reach the daemon: ${cause || 'unknown error'}`;
          res.status(200).json({ connected: false, error: friendly });
        }
      },
    );

    router.get(
      '/admin/node/:id',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const nodeId = getParamAsNumber(req.params.id);

          // Get node with its servers for port allocation UI
          const node = await prisma.node.findUnique({
            where: { id: nodeId },
            include: {
              servers: true,
              location: true,
            }
          });

          if (!node) {
            res.status(404).json({ message: 'Node not found.' });
            return;
          }

          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });
          const locations = await prisma.location.findMany();

          res.render('admin/nodes/edit', { node, user, req, settings, locations });
        } catch (error) {
          logger.error('Error fetching user:', error);
          return res.redirect('/login');
        }
      },
    );

    router.put(
      '/admin/node/:id/edit',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const nodeId = getParamAsNumber(req.params.id);

          const name = req.body.name;
          const ram = parseInt(req.body.ram);
          const cpu = parseInt(req.body.cpu);
          const disk = parseInt(req.body.disk);
          const address = req.body.address;
          const port = parseInt(req.body.port);
          const allocatedPorts = req.body.allocatedPorts || '[]';
          const overallocateMemory = parseInt(req.body.overallocateMemory);
          const overallocateDisk = parseInt(req.body.overallocateDisk);
          const overallocateCpu = parseInt(req.body.overallocateCpu);
          const locationId = req.body.locationId ? parseInt(req.body.locationId) : null;
          let parsedPorts: number[] = [];

          if (
            [overallocateMemory, overallocateDisk, overallocateCpu].some(
              (v) => isNaN(v) || v < 0,
            )
          ) {
            res.status(400).json({ message: 'Overallocation percentages must be >= 0.' });
            return;
          }

          if (locationId !== null) {
            const location = await prisma.location.findUnique({ where: { id: locationId } });
            if (!location) {
              res.status(400).json({ message: 'Selected location not found.' });
              return;
            }
          }

          if (
            !name ||
            isNaN(ram) ||
            isNaN(cpu) ||
            isNaN(disk) ||
            !address ||
            !port
          ) {
            res.status(400).json({
              message:
                'All fields are required and numeric values must be valid numbers.',
            });
            return;
          }

          // Validate allocated ports
          try {
            parsedPorts = JSON.parse(allocatedPorts);
            if (!Array.isArray(parsedPorts)) {
              throw new Error('Allocated ports must be an array');
            }

            // Validate each port
            for (const port of parsedPorts) {
              if (typeof port !== 'number' || port < 1024 || port > 65535) {
                throw new Error('Each port must be a number between 1024 and 65535');
              }
            }
          } catch (error: any) {
            res.status(400).json({
              message: 'Invalid allocated ports format: ' + (error.message || 'Unknown error'),
            });
            return;
          }

          const node = await prisma.node.update({
            where: { id: nodeId },
            data: {
              name,
              ram,
              cpu,
              disk,
              overallocateMemory,
              overallocateDisk,
              overallocateCpu,
              locationId,
              address,
              port,
              allocatedPorts,
            },
          });

          await syncNodeAllocations(nodeId, parsedPorts).catch(() => {});

          res.status(200).json({ message: 'Node updated successfully.', node });
          return;
        } catch (error) {
          logger.error('Error when updating the node:', error);
          res.status(500).json({ message: 'Error when updating the node.' });
          return;
        }
      },
    );

    router.post(
      '/admin/node/:id/maintenance',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const nodeId = getParamAsNumber(req.params.id);
          const node = await prisma.node.findUnique({ where: { id: nodeId } });
          if (!node) {
            res.status(404).json({ message: 'Node not found.' });
            return;
          }
          const maintenanceMode = req.body.maintenanceMode === true;
          const updated = await prisma.node.update({
            where: { id: nodeId },
            data: { maintenanceMode },
          });
          res.status(200).json({ message: 'Node maintenance mode updated.', node: updated });
          return;
        } catch (error) {
          logger.error('Error toggling node maintenance mode:', error);
          res.status(500).json({ message: 'Error toggling node maintenance mode.' });
          return;
        }
      },
    );

    router.get(
      '/admin/node/:id/stats',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          return res.redirect('/login');
        }

        const nodeId = getParamAsNumber(req.params.id);

        const node = await prisma.node.findUnique({ where: { id: nodeId } });
        if (!node) {
          res.status(404).json({ message: 'Node not found.' });
          return;
        }

        const settings = await prisma.settings.findUnique({
          where: { id: 1 },
        });

        let stats: Record<string, unknown>;

        try {
          const response = await daemonRequest({
            nodeAddress: node.address,
            nodePort: node.port,
            nodeKey: node.key,
            method: 'GET',
            path: '/stats',
          });

          stats = response.data as Record<string, unknown>;
        } catch {
          stats = { error: 'Unable to fetch stats from the node.' };
        }
        res.render('admin/nodes/stats', { node, user, req, settings, stats });
      }
    );


    return router;
  },
};


export default adminModule;
