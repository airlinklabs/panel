import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import axios from 'axios';
import { registerPermission } from '../../handlers/permisions';


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

    router.get(
      '/admin/analytics',
      isAuthenticated(true, 'airlink.admin.analytics.view'),
      async (req: Request, res: Response) => {
        const errorMessage: ErrorMessage = {};
        const userId = req.session?.user?.id;

        try {
          const [user, settings] = await Promise.all([
            prisma.users.findUnique({ where: { id: userId } }),
            prisma.settings.findUnique({ where: { id: 1 } }),
          ]);
          if (!user) {
            return res.redirect('/login');
          }

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

          return res.render('admin/analytics/analytics', {
            errorMessage,
            user: req.session?.user,
            req,
            settings: null,
            title: 'Analytics'
          });
        }
      }
    );

    router.get(
      '/admin/playerstats/data',
      isAuthenticated(true, 'airlink.admin.analytics.view'),
      async (req: Request, res: Response) => {
        try {
          const DAEMON_REQUEST_TIMEOUT = parseInt(process.env.DAEMON_TIMEOUT || '5000');
          const servers = await prisma.server.findMany({
            include: {
              node: true,
            },
          });

          const playerData = await Promise.all(
            servers.map(async (server) => {
              try {
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

          const totalPlayers = playerData.reduce((sum, server) => sum + server.playerCount, 0);
          const totalMaxPlayers = playerData.reduce((sum, server) => sum + server.maxPlayers, 0);
          const onlineServers = playerData.filter(server => server.online).length;

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

    router.get(
      '/api/admin/analytics/performance',
      isAuthenticated(true, 'airlink.admin.analytics.view'),
      async (req: Request, res: Response) => {
        try {
          res.json({
            cpu: { usage: 0, cores: 0 },
            memory: { used: 0, total: 0 },
            disk: { used: 0, total: 0 },
            network: { in: 0, out: 0, latency: 0 },
            uptime: { current: 0, average: 0 },
          });
        } catch (error) {
          logger.error('Error fetching performance metrics:', error);
          res.status(500).json({ error: 'Failed to fetch performance metrics' });
        }
      }
    );

    router.get(
      '/api/admin/analytics/usage',
      isAuthenticated(true, 'airlink.admin.analytics.view'),
      async (req: Request, res: Response) => {
        try {
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