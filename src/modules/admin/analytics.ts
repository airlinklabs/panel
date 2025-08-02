import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import axios from 'axios';
import { registerPermission } from '../../handlers/permisions';

const prisma = new PrismaClient();

registerPermission('airlink.admin.analytics.view');

interface ErrorMessage {
  message?: string;
}

const analyticsModule: Module = {
  info: {
    name: 'Admin Analytics Module',
    description: 'This file provides analytics dashboard for the admin panel.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    // Main analytics page
    router.get(
      '/admin/analytics',
      isAuthenticated(true, 'airlink.admin.analytics.view'),
      async (req: Request, res: Response) => {
        const errorMessage: ErrorMessage = {};

        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          // Get settings
          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          // Render the analytics page
          res.render('admin/analytics/analytics', {
            errorMessage,
            user,
            req,
            settings,
            title: 'Analytics'
          });
        } catch (error) {
          logger.error('Error loading analytics page:', error);
          errorMessage.message = 'Error loading analytics page.';

          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          return res.render('admin/analytics/analytics', {
            errorMessage,
            user: req.session?.user,
            req,
            settings,
            title: 'Analytics'
          });
        }
      }
    );

    // API endpoint to get player stats data for analytics
    router.get(
      '/admin/playerstats/data',
      isAuthenticated(true, 'airlink.admin.analytics.view'),
      async (req: Request, res: Response) => {
        try {
          // Get all servers
          const servers = await prisma.server.findMany({
            include: {
              node: true,
            },
          });

          // Fetch player counts for each server
          const playerData = await Promise.all(
            servers.map(async (server) => {
              try {
                // Parse ports to find the primary port
                const ports = JSON.parse(server.Ports || '[]');
                const primaryPort = ports.find((p: any) => p.primary)?.Port;

                if (!primaryPort) {
                  return {
                    serverId: server.UUID,
                    serverName: server.name,
                    playerCount: 0,
                    maxPlayers: 0,
                    online: false,
                    error: 'No primary port found'
                  };
                }
                const DAEMON_REQUEST_TIMEOUT = parseInt(process.env.DAEMON_TIMEOUT || '5000');
              
                // Fetch player data from the daemon
                const response = await axios({
                  method: 'GET',
                  url: `http://${server.node.address}:${server.node.port}/minecraft/players`,
                  params: {
                    id: server.UUID,
                    host: server.node.address,
                    port: primaryPort
                  },
                  auth: {
                    username: 'Airlink',
                    password: server.node.key,
                  },
                  timeout: DAEMON_REQUEST_TIMEOUT
                });

                return {
                  serverId: server.UUID,
                  serverName: server.name,
                  playerCount: response.data.onlinePlayers || 0,
                  maxPlayers: response.data.maxPlayers || 0,
                  online: response.data.online || false,
                  version: response.data.version || 'Unknown'
                };
              } catch (error) {
                return {
                  serverId: server.UUID,
                  serverName: server.name,
                  playerCount: 0,
                  maxPlayers: 0,
                  online: false,
                  error: 'Failed to fetch player data'
                };
              }
            })
          );

          // Calculate total players
          const totalPlayers = playerData.reduce((sum, server) => sum + server.playerCount, 0);
          const totalMaxPlayers = playerData.reduce((sum, server) => sum + server.maxPlayers, 0);
          const onlineServers = playerData.filter(server => server.online).length;

          // Get historical data (48 hours worth of data at 5-minute intervals)
          const historicalData = await prisma.playerStats.findMany({
            orderBy: {
              timestamp: 'asc'
            },
            take: 576 // 48 hours of data at 5-minute intervals
          });

          res.json({
            servers: playerData,
            totalPlayers,
            totalMaxPlayers,
            onlineServers,
            totalServers: servers.length,
            historicalData
          });
        } catch (error) {
          logger.error('Error fetching player stats for analytics:', error);
          res.status(500).json({ 
            error: 'Failed to fetch player statistics',
            html: '<p class="text-red-600 dark:text-red-400">Error loading player statistics.</p>'
          });
        }
      }
    );

    // API endpoint for performance metrics
    router.get(
      '/api/admin/analytics/performance',
      isAuthenticated(true, 'airlink.admin.analytics.view'),
      async (req: Request, res: Response) => {
        try {
          // TODO: Implement actual performance metrics collection
          // This should include real CPU, memory, disk, and network metrics
          // Consider integrating with system monitoring tools or node.js performance APIs
          res.json({
            cpu: { usage: 0, cores: 0 },
            memory: { used: 0, total: 0 },
            disk: { used: 0, total: 0 },
            network: { in: 0, out: 0, latency: 0 },
            uptime: { current: 0, average: 0 }
          });
        } catch (error) {
          logger.error('Error fetching performance metrics:', error);
          res.status(500).json({ error: 'Failed to fetch performance metrics' });
        }
      }
    );

    // API endpoint for usage analytics
    router.get(
      '/api/admin/analytics/usage',
      isAuthenticated(true, 'airlink.admin.analytics.view'),
      async (req: Request, res: Response) => {
        try {
          // Get basic usage statistics
          const totalServers = await prisma.server.count();
          const totalUsers = await prisma.users.count();
          
          res.json({
            totalServers,
            activeUsers: totalUsers, // This could be refined to show only active users
            apiCalls: 0, // This would need to be tracked separately
            storageUsed: 0 // This would need to be calculated from actual usage
          });
        } catch (error) {
          logger.error('Error fetching usage analytics:', error);
          res.status(500).json({ error: 'Failed to fetch usage analytics' });
        }
      }
    );

    return router;
  },
};

export default analyticsModule;