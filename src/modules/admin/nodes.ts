import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import { checkNodeStatus } from '../../handlers/utils/node/nodeStatus';
import logger from '../../handlers/logger';

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

async function listNodes(res: Response) {
  try {
    const nodes = await prisma.node.findMany();
    const nodesWithStatus = [];

    for (const node of nodes) {
      nodesWithStatus.push(await checkNodeStatus(node));
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

          res.render('admin/nodes/nodes', { user, req, logo: '', nodes });
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

          res.render('admin/nodes/create', { user, req, logo: '', nodes });
        } catch (error) {
          logger.error('Error fetching user:', error);
          return res.redirect('/login');
        }
      },
    );

    router.get(
      '/admin/nodes/list',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        const listNode = await listNodes(res);
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

    return router;
  },
};

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit();
});

export default adminModule;
