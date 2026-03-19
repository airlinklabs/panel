import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import logger from '../../handlers/logger';
import os from 'os';
import prisma from '../../db';
import { checkNodeStatus } from '../../handlers/utils/node/nodeStatus';

const coreModule: Module = {
  info: {
    name: 'Core Module',
    description: 'This file is for all core functionality.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get('/api/system/status', async (_req: Request, res: Response) => {
      try {
        const systemInfo = {
          hostname: os.hostname(),
          platform: os.platform(),
          arch: os.arch(),
          cpus: os.cpus().length,
          memory: {
            total: Math.round(os.totalmem() / (1024 * 1024 * 1024) * 100) / 100,
            free: Math.round(os.freemem() / (1024 * 1024 * 1024) * 100) / 100,
          },
          uptime: Math.floor(os.uptime() / 60),
        };

        const nodes = await prisma.node.findMany();
        const nodeStatuses = await Promise.all(
          nodes.map(async (node) => {
            try {
              const nodeWithStatus = await checkNodeStatus(node);
              return nodeWithStatus;
            } catch (error) {
              logger.error(`Error checking node status for ${node.name}:`, error);
              return { ...node, status: 'Error', error: 'Failed to check status' };
            }
          })
        );

        const serverCount = await prisma.server.count();
        const userCount = await prisma.users.count();

        res.json({
          system: systemInfo,
          nodes: nodeStatuses,
          stats: {
            servers: serverCount,
            users: userCount,
            nodes: nodes.length,
          },
        });
      } catch (error) {
        logger.error('Error fetching system status:', error);
        res.status(500).json({ error: 'Failed to fetch system status' });
      }
    });

    router.get('/api/health', (_req: Request, res: Response) => {
      res.status(200).json({ status: 'ok' });
    });

    router.post('/api/system/test-node-connection', async (req: Request, res: Response) => {
      try {
        const { address, port, key } = req.body;

        if (!address || !port || !key) {
          res.status(400).json({ error: 'Missing required parameters' });
          return;
        }

        const testNode = { address, port, key };

        const nodeWithStatus = await checkNodeStatus(testNode);

        if (nodeWithStatus.status === 'Offline') {
          res.status(400).json({ 
            success: false, 
            message: 'Failed to connect to node', 
            error: nodeWithStatus.error 
          });
          return;
        }
        res.json({
          success: true,
          message: 'Successfully connected to node',
          version: nodeWithStatus.versionRelease,
          status: nodeWithStatus.status,
        });
      } catch (error) {
        logger.error('Error testing node connection:', error);
        res.status(500).json({ 
          success: false, 
          message: 'Error testing node connection', 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
        return;
      }
    });

    router.get('/api/search', async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      if (!userId) return res.status(401).json({ results: [] });

      const q = String(req.query.q || '').trim().toLowerCase();
      if (!q || q.length < 1) return res.json({ results: [] });

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) return res.status(401).json({ results: [] });

        const results: { type: string; label: string; sub: string; url: string }[] = [];

        const serverWhere = user.isAdmin
          ? { OR: [{ name: { contains: q } }, { UUID: { contains: q } }] }
          : { ownerId: userId, OR: [{ name: { contains: q } }, { UUID: { contains: q } }] };

        const servers = await prisma.server.findMany({
          where: serverWhere as any,
          select: { UUID: true, name: true, description: true },
          take: 8,
        });

        servers.forEach(s => {
          results.push({ type: 'server', label: s.name, sub: s.description || s.UUID, url: `/server/${s.UUID}` });
        });

        if (user.isAdmin) {
          const users = await prisma.users.findMany({
            where: { OR: [{ username: { contains: q } }, { email: { contains: q } }] },
            select: { id: true, username: true, email: true },
            take: 5,
          });
          users.forEach(u => {
            results.push({ type: 'user', label: u.username, sub: u.email, url: `/admin/users/view/${u.id}/` });
          });

          const nodes = await prisma.node.findMany({
            where: { OR: [{ name: { contains: q } }, { address: { contains: q } }] },
            select: { id: true, name: true, address: true },
            take: 4,
          });
          nodes.forEach(n => {
            results.push({ type: 'node', label: n.name, sub: n.address, url: `/admin/node/${n.id}/stats` });
          });
        }

        res.json({ results });
      } catch (err) {
        logger.error('Search error:', err);
        res.status(500).json({ results: [] });
      }
    });

    return router;
  },
};

export default coreModule;
