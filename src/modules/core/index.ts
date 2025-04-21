import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import logger from '../../handlers/logger';
import os from 'os';
import { PrismaClient } from '@prisma/client';
import { checkNodeStatus } from '../../handlers/utils/node/nodeStatus';

const prisma = new PrismaClient();

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

    /**
     * Core system status endpoint
     * Returns information about the panel and connected nodes
     */
    router.get('/api/system/status', async (_req: Request, res: Response) => {
      try {
        // Get system information
        const systemInfo = {
          hostname: os.hostname(),
          platform: os.platform(),
          arch: os.arch(),
          cpus: os.cpus().length,
          memory: {
            total: Math.round(os.totalmem() / (1024 * 1024 * 1024) * 100) / 100, // GB
            free: Math.round(os.freemem() / (1024 * 1024 * 1024) * 100) / 100, // GB
          },
          uptime: Math.floor(os.uptime() / 60), // minutes
        };

        // Get node information
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

        // Get server count
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

    /**
     * Health check endpoint
     * Used by monitoring systems to check if the panel is running
     */
    router.get('/api/health', (_req: Request, res: Response) => {
      res.status(200).json({ status: 'ok' });
    });

    /**
     * Node connection test endpoint
     * Tests the connection to a node
     */
    router.post('/api/system/test-node-connection', async (req: Request, res: Response) => {
      try {
        const { address, port, key } = req.body;

        if (!address || !port || !key) {
          res.status(400).json({ error: 'Missing required parameters' });
          return;
        }

        // Create a test node object
        const testNode = { address, port, key };

        // Test the connection
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
          status: nodeWithStatus.status
        });
        return;
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

    return router;
  },
};

export default coreModule;
