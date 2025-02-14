import { Router, Request, Response } from 'express';
import { apiKeyMiddleware, checkPermission } from '../../../handlers/utils/auth/apiAuthMiddleware';
import apiKeysRouter from './apiKeys';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// API Key Management Routes (Admin only)
router.use('/keys', apiKeysRouter);

// Protected API Routes (Require API Key)
const protectedRoutes = [
  {
    path: '/allocations',
    handler: (req: Request, res: Response): void => {
      prisma.server.findMany({
        select: { Ports: true, UUID: true }
      }).then(allocations => {
        res.json({ data: allocations });
      }).catch(error => {
        console.error('Error fetching allocations:', error);
        res.status(500).json({ error: 'Internal server error' });
      });
    }
  },
  {
    path: '/databases',
    handler: (req: Request, res: Response): void => {
      // Implement database endpoint
      res.json({ message: 'Databases endpoint' });
    }
  },
  {
    path: '/images',
    handler: (req: Request, res: Response): void => {
      prisma.images.findMany().then(images => {
        res.json({ data: images });
      }).catch(error => {
        console.error('Error fetching images:', error);
        res.status(500).json({ error: 'Internal server error' });
      });
    }
  },
  {
    path: '/locations',
    handler: (req: Request, res: Response): void => {
      prisma.location.findMany({
        include: { nodes: true }
      }).then(locations => {
        res.json({ data: locations });
      }).catch(error => {
        console.error('Error fetching locations:', error);
        res.status(500).json({ error: 'Internal server error' });
      });
    }
  },
  {
    path: '/nodes',
    handler: (req: Request, res: Response): void => {
      prisma.node.findMany({
        include: { location: true, servers: true }
      }).then(nodes => {
        res.json({ data: nodes });
      }).catch(error => {
        console.error('Error fetching nodes:', error);
        res.status(500).json({ error: 'Internal server error' });
      });
    }
  },
  {
    path: '/servers',
    handler: (req: Request, res: Response): void => {
      prisma.server.findMany({
        include: {
          node: true,
          image: true,
          owner: {
            select: {
              id: true,
              username: true,
              email: true
            }
          }
        }
      }).then(servers => {
        res.json({ data: servers });
      }).catch(error => {
        console.error('Error fetching servers:', error);
        res.status(500).json({ error: 'Internal server error' });
      });
    }
  },
  {
    path: '/users',
    handler: (req: Request, res: Response): void => {
      prisma.users.findMany({
        select: {
          id: true,
          username: true,
          email: true,
          isAdmin: true,
          description: true
        }
      }).then(users => {
        res.json({ data: users });
      }).catch(error => {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Internal server error' });
      });
    }
  }
];

// Register protected routes
protectedRoutes.forEach(route => {
  router.get(route.path, 
    apiKeyMiddleware, 
    checkPermission(route.path.substring(1), 'read'), 
    route.handler
  );
});

// API Documentation endpoint
router.get('/docs', (req: Request, res: Response): void => {
  res.json({
    version: '1.0.0',
    endpoints: protectedRoutes.reduce((acc, route) => ({
      ...acc,
      [route.path]: `Manage ${route.path.substring(1)}`
    }), {})
  });
});

export default router;

