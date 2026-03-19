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
          const [servers, nodes, images] = await Promise.all([
            prisma.server.findMany({ include: { node: true, image: true } }),
            prisma.node.findMany(),
            prisma.images.findMany(),
          ]);

          const totalRamMb  = servers.reduce((s, srv) => s + (srv.Memory || 0), 0);
          const totalCpuPct = servers.reduce((s, srv) => s + (srv.Cpu   || 0), 0);

          const imageCounts: Record<string, number> = {};
          servers.forEach(srv => {
            const name = srv.image?.name || 'Unknown';
            imageCounts[name] = (imageCounts[name] || 0) + 1;
          });
          const topImage = Object.entries(imageCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

          const nodeServerCounts: Record<number, { name: string; serverCount: number }> = {};
          nodes.forEach(n => { nodeServerCounts[n.id] = { name: n.name, serverCount: 0 }; });
          servers.forEach(srv => {
            if (nodeServerCounts[srv.nodeId]) nodeServerCounts[srv.nodeId].serverCount++;
          });

          res.json({
            nodeCount:    nodes.length,
            imageCount:   images.length,
            totalRamMb,
            totalCpuPct,
            topImage,
            nodes: Object.values(nodeServerCounts).sort((a, b) => b.serverCount - a.serverCount),
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
          const [servers, users, nodes, images] = await Promise.all([
            prisma.server.findMany({ include: { node: true, image: true } }),
            prisma.users.findMany({ select: { id: true, isAdmin: true } }),
            prisma.node.findMany(),
            prisma.images.findMany({ select: { id: true, name: true } }),
          ]);

          const totalStorageGb = servers.reduce((s, srv) => s + (srv.Storage || 0), 0);
          const adminUsers     = users.filter(u => u.isAdmin).length;

          const imageCounts: Record<string, { name: string; count: number }> = {};
          images.forEach(img => { imageCounts[img.id] = { name: img.name, count: 0 }; });
          servers.forEach(srv => {
            if (imageCounts[srv.imageId]) imageCounts[srv.imageId].count++;
          });
          const byImage = Object.values(imageCounts)
            .sort((a, b) => b.count - a.count)
            .filter(i => i.count > 0)
            .slice(0, 8);

          const nodeCounts: Record<number, { name: string; count: number }> = {};
          nodes.forEach(n => { nodeCounts[n.id] = { name: n.name, count: 0 }; });
          servers.forEach(srv => {
            if (nodeCounts[srv.nodeId]) nodeCounts[srv.nodeId].count++;
          });
          const byNode = Object.values(nodeCounts).sort((a, b) => b.count - a.count);

          res.json({
            totalServers: servers.length,
            totalUsers:   users.length,
            adminUsers,
            totalStorageGb,
            byImage,
            byNode,
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