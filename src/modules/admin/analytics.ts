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
                const DAEMON_REQUEST_TIMEOUT = process.env.DAEMON_TIMEOUT || 5000;
              
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

          // Generate HTML content for player stats
          const html = `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">${totalPlayers}</div>
                <div class="text-sm text-blue-600 dark:text-blue-400">Total Players Online</div>
              </div>
              <div class="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                <div class="text-2xl font-bold text-green-600 dark:text-green-400">${onlineServers}</div>
                <div class="text-sm text-green-600 dark:text-green-400">Servers Online</div>
              </div>
              <div class="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                <div class="text-2xl font-bold text-purple-600 dark:text-purple-400">${totalMaxPlayers}</div>
                <div class="text-sm text-purple-600 dark:text-purple-400">Max Capacity</div>
              </div>
              <div class="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
                <div class="text-2xl font-bold text-orange-600 dark:text-orange-400">${Math.round((totalPlayers / Math.max(totalMaxPlayers, 1)) * 100)}%</div>
                <div class="text-sm text-orange-600 dark:text-orange-400">Capacity Used</div>
              </div>
            </div>
            
            <div class="bg-white dark:bg-neutral-800 rounded-lg p-6 mb-6">
              <h3 class="text-lg font-medium text-neutral-900 dark:text-white mb-4">Server Status</h3>
              <div class="space-y-3">
                ${playerData.map(server => `
                  <div class="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-700 rounded-lg">
                    <div class="flex items-center space-x-3">
                      <div class="w-3 h-3 rounded-full ${server.online ? 'bg-green-500' : 'bg-red-500'}"></div>
                      <span class="font-medium text-neutral-900 dark:text-white">${server.serverName}</span>
                    </div>
                    <div class="text-sm text-neutral-600 dark:text-neutral-400">
                      ${server.playerCount}/${server.maxPlayers} players
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
            
            ${historicalData.length > 0 ? `
            <div class="bg-white dark:bg-neutral-800 rounded-lg p-6">
              <h3 class="text-lg font-medium text-neutral-900 dark:text-white mb-4">Player Activity (Last 48 Hours)</h3>
              <div class="h-64 flex items-end space-x-1">
                ${historicalData.slice(-48).map((data, index) => {
                  const height = Math.max((data.totalPlayers / Math.max(...historicalData.map(d => d.totalPlayers), 1)) * 100, 2);
                  return `<div class="bg-blue-500 rounded-t" style="height: ${height}%; width: ${100/48}%;" title="${data.totalPlayers} players at ${new Date(data.timestamp).toLocaleTimeString()}"></div>`;
                }).join('')}
              </div>
            </div>
            ` : '<div class="bg-white dark:bg-neutral-800 rounded-lg p-6"><p class="text-neutral-600 dark:text-neutral-400">No historical data available yet.</p></div>'}
          `;

          res.json({
            html,
            data: {
              servers: playerData,
              totalPlayers,
              totalMaxPlayers,
              onlineServers,
              totalServers: servers.length,
              historicalData
            }
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
          // This would be expanded to include actual performance metrics
          // For now, return placeholder data
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