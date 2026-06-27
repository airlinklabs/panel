import type { Request, Response } from 'express';
import { Router } from 'express';
import type { Module } from '../../core/moduleInit.js';
import prisma from '../../db.js';
import { isAuthenticated } from '../../middleware/auth.js';
import { checkNodeStatus } from '../../services/nodeStatus.js';
import logger from '../../services/logger.js';
import axios from 'axios';
import { getParamAsNumber } from '../../utils/typeHelpers.js';
import { daemonSchemeSync } from '../../services/daemonRequest.js';
import { generateSecureKey } from '../../utils/generateKey.js';
import { buildDaemonUrl } from '../../utils/daemonUrl.js';
import { z } from 'zod';
import { parseBody } from '../../utils/validate.js';

interface NodeWithInstances {
  id: number;
  name: string;
  ram: number;
  cpu: number;
  disk: number;
  address: string;
  port: number;
  key: string;
  createdAt: Date;
  instances: { id: number; UUID: string; name: string }[];
  servers?: { id: number; UUID: string; name: string }[];
}

async function listNodes(res: Response, includeServers = false) {
  try {
    const nodes = await prisma.node.findMany();
    const nodesWithStatus = [];

    for (const node of nodes) {
      const instances = await prisma.server.findMany({
        where: { nodeId: node.id },
      });

      const nodeWithInstances: NodeWithInstances = {
        ...node,
        instances,
        ...(includeServers ? { servers: instances } : {}),
      };

      nodesWithStatus.push(await checkNodeStatus(nodeWithInstances));
    }

    return nodesWithStatus;
  } catch (error) {
    logger.error('Error fetching nodes:', error);
    res.status(500).json({ message: 'Error fetching nodes.' });
  }
}

const CreateNodeBody = z.object({
  name: z.string().min(3).max(50),
  ram: z.coerce.number().positive(),
  cpu: z.coerce.number().positive(),
  disk: z.coerce.number().positive(),
  address: z.string().regex(/^(localhost|(?:\d{1,3}\.){3}\d{1,3}|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})$/),
  port: z.coerce.number().min(1025).max(65535),
});

const adminModule: Module = {
  info: {
    name: 'Admin Nodes Module',
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
            res.redirect('/login'); return;
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
          res.redirect('/login'); return;
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
            res.redirect('/login'); return;
          }

          const nodes = await listNodes(res);

          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });
          res.render('admin/nodes/create', { user, req, settings, nodes });
        } catch (error) {
          logger.error('Error fetching user:', error);
          res.redirect('/login'); return;
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
        const parsed = parseBody(CreateNodeBody, req, res);
        if (!parsed) return;

        const { name, ram, cpu, disk, address, port } = parsed;

        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(403).json({ message: 'Unauthorized access.' });
            return;
          }

          const key = generateSecureKey(24);

          const node = await prisma.node.create({
            data: {
              name,
              ram,
              cpu,
              disk,
              address,
              port,
              key,
              createdAt: new Date(),
            },
          });

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
            res.redirect('/login'); return;
          }

          const nodeId = getParamAsNumber(req.params.id);
          const deleteInstances = req.query.deleteInstance === 'true';

          try {
            if (deleteInstances) {
              const node = await prisma.node.findUnique({
                where: { id: nodeId },
                include: { servers: true },
              });

              if (node) {
                await Promise.allSettled(
                  node.servers.map((server) =>
                    axios.delete(
                      buildDaemonUrl(daemonSchemeSync(), node.address, node.port, '/container'),
                      {
                        auth: { username: 'Airlink', password: node.key },
                        data: { id: server.UUID },
                        timeout: 8000,
                      },
                    ),
                  ),
                );
              }

              await prisma.server.deleteMany({
                where: { nodeId },
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
          res.redirect('/login'); return;
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
            res.redirect('/login'); return;
          }

          const nodeId = getParamAsNumber(req.params.id);

          const node = await prisma.node.findUnique({ where: { id: nodeId } });
          if (!node) {
            res.status(404).json({ message: 'Node not found.' });
            return;
          }

          const panelUrl = process.env.URL;
          if (!panelUrl) {
            res.status(500).json({ message: 'Panel URL not configured. Set URL in .env.' });
            return;
          }

          res.status(200).json({
            command: `airlinkd configure --panel "${panelUrl}" --key "${node.key}"`,
            panelUrl,
            nodeKey: node.key,
          });
          return;
        } catch (error) {
          logger.error('Error fetching user:', error);
          res.redirect('/login'); return;
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
            res.redirect('/login'); return;
          }

          const nodeId = getParamAsNumber(req.params.id);

          const node = await prisma.node.findUnique({
            where: { id: nodeId },
            include: {
              servers: true
            }
          });

          if (!node) {
            res.status(404).json({ message: 'Node not found.' });
            return;
          }

          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          res.render('admin/nodes/edit', { node, user, req, settings });
        } catch (error) {
          logger.error('Error fetching user:', error);
          res.redirect('/login'); return;
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
            res.redirect('/login'); return;
          }

          const nodeId = getParamAsNumber(req.params.id);

          const name = req.body.name;
          const ram = parseInt(req.body.ram);
          const cpu = parseInt(req.body.cpu);
          const disk = parseInt(req.body.disk);
          const address = req.body.address;
          const port = parseInt(req.body.port);
          const allocatedPorts = req.body.allocatedPorts || '[]';

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

          try {
            const parsedPorts = JSON.parse(allocatedPorts);
            if (!Array.isArray(parsedPorts)) {
              throw new Error('Allocated ports must be an array');
            }

            // Validate each port
            for (const p of parsedPorts) {
              if (typeof p !== 'number' || p < 1024 || p > 65535) {
                throw new Error('Each port must be a number between 1024 and 65535');
              }
            }
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            res.status(400).json({
              message: 'Invalid allocated ports format: ' + msg,
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
              address,
              port,
              allocatedPorts,
            },
          });

          res.status(200).json({ message: 'Node updated successfully.', node });
          return;
        } catch (error) {
          logger.error('Error when updating the node:', error);
          res.status(500).json({ message: 'Error when updating the node.' });
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
          res.redirect('/login'); return;
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
          const response = await axios.get(
            buildDaemonUrl(daemonSchemeSync(), node.address, node.port, '/stats'),
            {
              auth: {
                username: 'Airlink',
                password: node.key,
              },
              headers: {
                'Content-Type': 'application/json',
              },
            }
          );

          stats = response.data;
        } catch {
          stats = { error: 'Unable to fetch stats from the node.' };
        }
        res.render('admin/nodes/stats', { node, user, req, settings, stats });
      }
    );


    router.post(
      '/admin/node/:id/test-connection',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        const nodeId = getParamAsNumber(req.params.id);
        const node = await prisma.node.findUnique({ where: { id: nodeId } });
        if (!node) { res.status(404).json({ message: 'Node not found.' }); return; }

        try {
          const response = await axios.get(
            buildDaemonUrl(daemonSchemeSync(), node.address, node.port, '/'),
            {
              auth: { username: 'Airlink', password: node.key },
              timeout: 5000,
            },
          );
          res.json({ ok: true, status: response.data?.status, version: response.data?.versionRelease });
        } catch (err) {
          const msg = axios.isAxiosError(err)
            ? (err.response?.status === 401 ? 'Key mismatch — check daemon .env and node key' : err.message)
            : 'Connection failed';
          res.status(502).json({ ok: false, message: msg });
        }
      },
    );

    return router;
  },
};


export default adminModule;
