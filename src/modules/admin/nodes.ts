import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import { checkNodeStatus } from '../../handlers/nodeStatus';

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
    console.error('Error fetching nodes:', error);
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
        const userId = req.session?.user?.id;
        if (!userId) {
          return res.redirect('/login');
        }
    
        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }
    
          const nodes = await listNodes(res);
    
          res.render('admin/nodes', { user, req, name: 'AirLink', logo: '', nodes });
        } catch (error) {
          console.error('Error fetching user:', error);
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
      async (req: Request, res: Response): Promise<void> => {
        const { name, ram, cpu, disk, address, port } = req.body;
    
        const userId = req.session?.user?.id;
        if (!userId) {
          return res.redirect('/login');
        }
        if (
          !name || typeof name !== 'string' || name.length < 3 || name.length > 50 ||
          !ram || isNaN(parseInt(ram)) || parseInt(ram) <= 0 || 
          !cpu || isNaN(parseInt(cpu)) || parseInt(cpu) <= 0 || 
          !disk || isNaN(parseInt(disk)) || parseInt(disk) <= 0 ||
          !address || typeof address !== 'string' || !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(address) ||
          !port || isNaN(parseInt(port)) || parseInt(port) <= 1024 || parseInt(port) > 65535
        ) {
          res.status(400).json({ message: 'Invalid input.' });
          return Promise.resolve();
        }
    
        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(403).json({ message: 'Unauthorized access.' });
            return Promise.resolve();
          }
    
          const key = generateApiKey(32);

          const ramValue = parseFloat(ram);
          const cpuValue = parseFloat(cpu);
          const diskValue = parseFloat(disk);
          const portValue = parseInt(port);
    
          const node = await prisma.node.create({
            data: {
              name,
              ram: ramValue ,
              cpu: cpuValue,
              disk: diskValue,
              address,
              port: portValue,
              key,
              createdAt: new Date(),
            },
          });
    
          res.status(201).json({ message: 'Node created successfully.', node });
          return Promise.resolve();
    
        } catch (error) {
          console.error('Error when creating the node:', error);
          res.status(500).json({ message: 'Error when creating the node.' });
          return Promise.resolve();
        }
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
