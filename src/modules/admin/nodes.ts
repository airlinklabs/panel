import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import { checkNodeStatus } from '../../handlers/utils/node/nodeStatus';
import logger from '../../handlers/logger';
import axios from 'axios';
import { Buffer } from 'buffer';

const prisma = new PrismaClient();

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
  address: string;
  port: number;
  key: string;
  createdAt: Date;
  instances: any[];
  servers?: any[]; // For port allocation UI
}

async function listNodes(res: Response, includeServers = false) {
  try {
    const nodes = await prisma.node.findMany();
    const nodesWithStatus = [];

    for (const node of nodes) {
      const instances = await prisma.server.findMany({
        where: {
          nodeId: node.id,
        },
      });

      // Create a node object with instances
      const nodeWithInstances: NodeWithInstances = {
        ...node,
        instances: instances || []
      };

      // Add servers data if requested (for port allocation UI)
      if (includeServers) {
        nodeWithInstances.servers = instances;
      }

      nodesWithStatus.push(await checkNodeStatus(nodeWithInstances));
    }

    return nodesWithStatus;
  } catch (error) {
    logger.error('Error fetching nodes:', error);
    res.status(500).json({ message: 'Error fetching nodes.' });
  }
}

const adminModule: Module = {
  info: {
    name: 'Admin Nodes Module',
    description: 'This file is for admin functionality of the Nodes.',
    version: '1.0.0',
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
          res.render('admin/nodes/create', { user, req, settings, nodes });
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

        if (!name || typeof name !== 'string') {
          res.status(400).json({ message: 'Name must be a string.' });
          return;
        } else if (name.length < 3 || name.length > 50) {
          res.status(400).json({
            message: 'Name must be between 3 and 50 characters long.',
          });
          return;
        }

        if (!ram || isNaN(parseInt(ram)) || parseInt(ram) <= 0) {
          res.status(400).json({ message: 'RAM must be a positive number.' });
          return;
        }

        if (!cpu || isNaN(parseInt(cpu)) || parseInt(cpu) <= 0) {
          res.status(400).json({ message: 'CPU must be a positive number.' });
          return;
        }

        if (!disk || isNaN(parseInt(disk)) || parseInt(disk) <= 0) {
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

        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(403).json({ message: 'Unauthorized access.' });
            return;
          }

          const key = generateApiKey(32);

          const ramValue = parseFloat(ram);
          const cpuValue = parseFloat(cpu);
          const diskValue = parseFloat(disk);
          const portValue = parseInt(port);

          const node = await prisma.node.create({
            data: {
              name,
              ram: ramValue,
              cpu: cpuValue,
              disk: diskValue,
              address,
              port: portValue,
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
            return res.redirect('/login');
          }

          const nodeId = parseInt(req.params.id);
          const deleteInstances = req.query.deleteInstance === 'true';

          try {
            if (deleteInstances) {
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

          const nodeId = parseInt(req.params.id);

          const node = await prisma.node.findUnique({ where: { id: nodeId } });
          if (!node) {
            res.status(404).json({ message: 'Node not found.' });
            return;
          }

          res
            .status(200)
            .json(
              'npm run configure -- -- --panel "' +
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

          const nodeId = parseInt(req.params.id);

          // Get node with its servers for port allocation UI
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

          const nodeId = parseInt(req.params.id);

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

          // Validate allocated ports
          try {
            const parsedPorts = JSON.parse(allocatedPorts);
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
          return res.redirect('/login');
        }

        const nodeId = parseInt(req.params.id);

        const node = await prisma.node.findUnique({ where: { id: nodeId } });
        if (!node) {
          res.status(404).json({ message: 'Node not found.' });
          return;
        }

        const settings = await prisma.settings.findUnique({
          where: { id: 1 },
        });

        let stats = {};

        try {
          const response = await axios.get(
            `http://${node.address}:${node.port}/stats`,
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Basic ${Buffer.from(`Airlink:${node.key}`).toString('base64')}`,
              },
            }
          );

          stats = response.data;
        } catch (_error) {
          stats = { error: 'Unable to fetch stats from the node.' };
        }
        res.render('admin/nodes/stats', { node, user, req, settings, stats });
      }
    );


    return router;
  },
};

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit();
});

export default adminModule;
