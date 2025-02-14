import { Router, Request, Response } from 'express';
import { Module } from '../../../handlers/moduleInit';
import { apiKeyMiddleware, checkPermission } from '../../../handlers/utils/auth/apiAuthMiddleware';
import apiKeysModule from './apiKeys';
import { prisma } from '../../../handlers/utils/prisma';
import { ApiResponse } from '../../../types/api';

const router = Router();

/**
 * @openapi
 * components:
 *   securitySchemes:
 *     ApiKeyAuth:
 *       type: apiKey
 *       in: header
 *       name: x-api-key
 */

// API Key Management Routes (Admin only)
router.use('/keys', apiKeysModule.router());

// Protected API Routes
const protectedRoutes = [
  {
    path: '/allocations',
    /**
     * @openapi
     * /api/v1/allocations:
     *   get:
     *     tags: [Allocations]
     *     summary: Get all server port allocations
     *     security:
     *       - ApiKeyAuth: []
     *     responses:
     *       200:
     *         description: List of server port allocations
     */
    handler: async (_req: Request, res: Response<ApiResponse<any[]>>): Promise<void> => {
      try {
        const allocations = await prisma.server.findMany({
          select: { Ports: true, UUID: true }
        });
        res.json({ success: true, data: allocations });
      } catch (error) {
        console.error('Error fetching allocations:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
      }
    }
  },
  {
    path: '/images',
    /**
     * @openapi
     * /api/v1/images:
     *   get:
     *     tags: [Images]
     *     summary: Get all available server images
     *     security:
     *       - ApiKeyAuth: []
     *     responses:
     *       200:
     *         description: List of server images
     */
    handler: async (_req: Request, res: Response<ApiResponse<any[]>>): Promise<void> => {
      try {
        const images = await prisma.images.findMany();
        res.json({ success: true, data: images });
      } catch (error) {
        console.error('Error fetching images:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
      }
    }
  },
  {
    path: '/locations',
    /**
     * @openapi
     * /api/v1/locations:
     *   get:
     *     tags: [Locations]
     *     summary: Get all server locations with nodes
     *     security:
     *       - ApiKeyAuth: []
     *     responses:
     *       200:
     *         description: List of server locations
     */
    handler: async (_req: Request, res: Response<ApiResponse<any[]>>): Promise<void> => {
      try {
        const locations = await prisma.location.findMany({
          include: { nodes: true }
        });
        res.json({ success: true, data: locations });
      } catch (error) {
        console.error('Error fetching locations:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
      }
    }
  },
  {
    path: '/nodes',
    handler: (_req: Request, res: Response<ApiResponse<any[]>>): void => {
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
    handler: (_req: Request, res: Response<ApiResponse<any[]>>): void => {
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
    handler: (_req: Request, res: Response<ApiResponse<any[]>>): void => {
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

const apiModule: Module = {
  info: {
    name: 'API v1 Module',
    description: 'API v1 endpoints and functionality',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },
  router: () => router
};

export default apiModule;

