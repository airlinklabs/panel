import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';

const prisma = new PrismaClient();

const radarModule: Module = {
  info: {
    name: 'Radar Module',
    description: 'This module provides radar scanning functionality for server volumes.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    // Get available radar scripts
    router.get(
      '/admin/radar/scripts',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const radarDir = path.join(__dirname, '../../../storage/radar');

          try {
            await fs.access(radarDir);
          } catch (error: unknown) {
            await fs.mkdir(radarDir, { recursive: true });
          }

          const files = await fs.readdir(radarDir);
          const scripts = await Promise.all(
            files
              .filter(file => file.endsWith('.json'))
              .map(async file => {
                const content = await fs.readFile(path.join(radarDir, file), 'utf-8');
                try {
                  const scriptData = JSON.parse(content);
                  return {
                    id: file.replace('.json', ''),
                    name: scriptData.name || file,
                    description: scriptData.description || '',
                    version: scriptData.version || '1.0.0',
                    filename: file
                  };
                } catch (error: unknown) {
                  logger.error(`Error parsing radar script ${file}:`, error);
                  return {
                    id: file.replace('.json', ''),
                    name: file,
                    description: 'Invalid script format',
                    version: 'unknown',
                    filename: file
                  };
                }
              })
          );

          res.json({ success: true, scripts });
        } catch (error: unknown) {
          logger.error('Error fetching radar scripts:', error);
          res.status(500).json({ success: false, error: 'Failed to fetch radar scripts' });
        }
      }
    );

    // Run radar scan on a server
    router.post(
      '/admin/radar/scan/:serverId',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const { serverId } = req.params;
          const { scriptId } = req.body;

          if (!serverId || !scriptId) {
            res.status(400).json({
              success: false,
              error: 'Server ID and Script ID are required'
            });
            return;
          }

          // Get server information
          const server = await prisma.server.findUnique({
            where: { id: parseInt(serverId) },
            include: { node: true }
          });

          if (!server) {
            res.status(404).json({
              success: false,
              error: 'Server not found'
            });
            return;
          }

          // Get the script content
          const scriptPath = path.join(__dirname, '../../../storage/radar', `${scriptId}.json`);
          const scriptContent = await fs.readFile(scriptPath, 'utf-8');
          const script = JSON.parse(scriptContent);
          
          const response = await axios.post(
            `http://${server.node.address}:${server.node.port}/radar/scan`,
            {
              id: server.UUID,
              script
            },
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Basic ${Buffer.from(`Airlink:${server.node.key}`).toString('base64')}`
              }
            }
          );

          res.json({
            success: true,
            message: 'Radar scan initiated',
            results: response.data
          });
        } catch (error: unknown) {
          logger.error('Error running radar scan:', error);
          const errorMessage = error instanceof Error
            ? error.message
            : 'Unknown error occurred';

          res.status(500).json({
            success: false,
            error: 'Failed to run radar scan',
            message: errorMessage
          });
        }
      }
    );

    return router;
  }
};

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit();
});

export default radarModule;
