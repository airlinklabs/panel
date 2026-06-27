import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import type { Module } from '../../../core/moduleInit.js';
import prisma from '../../../db.js';
import logger from '../../../services/logger.js';

const ALLOWED_CONSUMER_PERMISSIONS = [
  'server.view',
  'server.start',
  'server.stop',
  'server.restart',
  'server.console',
  'server.files.read',
];

async function validateUserApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) { res.status(401).json({ error: 'Missing auth' }); return; }
    const raw = authHeader.split(' ')[1];
    if (!raw) { res.status(401).json({ error: 'Missing auth' }); return; }

    const key = await prisma.userApiKey.findUnique({ where: { key: raw }, include: { user: true } });
    if (!key || !key.active) { res.status(401).json({ error: 'Invalid or inactive key' }); return; }
    if (key.expiresAt && key.expiresAt < new Date()) { res.status(401).json({ error: 'Key expired' }); return; }

    // Attach consumer key and user to request
    (req as unknown as Record<string, unknown>).consumerKey = key;
    (req as unknown as Record<string, unknown>).consumerUser = key.user;
    next();
  } catch (error) {
    logger.error('Error validating consumer API key:', error);
    res.status(401).json({ error: 'Invalid auth' });
  }
}

function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = (req as unknown as Record<string, unknown>).consumerKey as { permissions?: string } | undefined;
    if (!key) { res.status(401).json({ error: 'Not authenticated' }); return; }

    let perms: string[];
    try {
      perms = JSON.parse(key.permissions || '[]');
    } catch {
      res.status(403).json({ error: 'Invalid permissions' }); return;
    }

    const hasPermission = perms.some((p: string) => {
      if (p === permission) return true;
      if (p.endsWith('.*')) {
        const base = p.slice(0, -2);
        return permission.startsWith(`${base}.`);
      }
      return false;
    });

    if (!hasPermission) {
      res.status(403).json({ error: 'Permission denied' }); return;
    }
    next();
  };
}

const consumerApiModule: Module = {
  info: {
    name: 'Consumer API Module',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get('/api/consumer/v1/servers', validateUserApiKey, requirePermission('server.view'), async (req: Request, res: Response) => {
      try {
        const user = (req as unknown as Record<string, unknown>).consumerUser as { id: number };
        const servers = await prisma.server.findMany({
          where: { ownerId: user.id },
          select: {
            UUID: true,
            name: true,
            description: true,
            Memory: true,
            Cpu: true,
            Storage: true,
            Installing: true,
            Suspended: true,
          },
        });
        res.json({ data: servers });
      } catch (error) {
        logger.error('Error in consumer API list servers:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    router.get('/api/consumer/v1/servers/:uuid', validateUserApiKey, requirePermission('server.view'), async (req: Request, res: Response) => {
      try {
        const user = (req as unknown as Record<string, unknown>).consumerUser as { id: number };
        const server = await prisma.server.findFirst({
          where: { UUID: req.params.uuid, ownerId: user.id },
          select: {
            UUID: true,
            name: true,
            description: true,
            Memory: true,
            Cpu: true,
            Storage: true,
            Installing: true,
            Suspended: true,
            Ports: true,
          },
        });
        if (!server) { res.status(404).json({ error: 'Server not found' }); return; }
        res.json({ data: server });
      } catch (error) {
        logger.error('Error in consumer API get server:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    router.post('/api/consumer/v1/servers/:uuid/power', validateUserApiKey, requirePermission('server.start'), async (req: Request, res: Response) => {
      try {
        const user = (req as unknown as Record<string, unknown>).consumerUser as { id: number };
        const server = await prisma.server.findFirst({
          where: { UUID: req.params.uuid, ownerId: user.id },
          include: { node: true },
        });
        if (!server) { res.status(404).json({ error: 'Server not found' }); return; }

        const { action } = req.body;
        if (!['start', 'stop', 'restart'].includes(action)) {
          res.status(400).json({ error: 'Invalid action' }); return;
        }

        // Forward to daemon
        const { default: axios } = await import('axios');
        const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
        const daemonUrl = `${protocol}://${server.node.address}:${server.node.port}`;

        await axios.post(
          `${daemonUrl}/container/${action}`,
          { id: server.UUID },
          {
            auth: { username: 'Airlink', password: server.node.key },
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000,
          },
        );

        res.json({ success: true, action });
      } catch (error) {
        logger.error('Error in consumer API power action:', error);
        res.status(500).json({ error: 'Failed to perform power action' });
      }
    });

    return router;
  },
};

export default consumerApiModule;
