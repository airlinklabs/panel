import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import axios from 'axios';
import { registerPermission } from '../../handlers/permisions';
import { collectPlayerStats } from '../../handlers/playerStatsCollector';

registerPermission('airlink.admin.playerstats.view');

interface ErrorMessage {
  message?: string;
}

const adminModule: Module = {
  info: {
    name: 'Admin Player Stats Module',
    description: 'This file provides player statistics for the admin panel.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/admin/playerstats',
      isAuthenticated(true, 'airlink.admin.playerstats.view'),
      async (req: Request, res: Response) => {
        const errorMessage: ErrorMessage = {};
        const settings = await prisma.settings.findUnique({ where: { id: 1 } });

        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const servers = await prisma.server.findMany({
            include: { node: true },
          });

          res.render('admin/playerstats/playerstats', {
            errorMessage,
            user,
            servers,
            req,
            settings,
          });
        } catch (error) {
          logger.error('Error fetching player stats:', error);
          errorMessage.message = 'Error fetching player statistics.';
          return res.render('admin/playerstats/playerstats', {
            errorMessage,
            user: req.session?.user,
            servers: [],
            req,
            settings,
          });
        }
      }
    );

    router.get(
      '/api/admin/playerstats',
      isAuthenticated(true, 'airlink.admin.playerstats.view'),
      async (req: Request, res: Response) => {
        try {
          const servers = await prisma.server.findMany({
            include: {
              node: true,
            },
          });

          // Fetch player counts for each server
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
                  timeout: 5000
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
            take: 576 // 48 hours of data at 5-minute intervals (12 data points per hour * 48 hours)
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
          res.status(500).json({ error: 'Failed to fetch player statistics' });
        }
      }
    );

    router.post(
      '/api/admin/playerstats/collect',
      isAuthenticated(true, 'airlink.admin.playerstats.view'),
      async (req: Request, res: Response) => {
        try {
          await collectPlayerStats();
          res.json({ success: true, message: 'Player statistics collected successfully' });
        } catch (error) {
          res.status(500).json({ error: 'Failed to collect player statistics' });
        }
      }
    );

    return router;
  },
};

export default adminModule;
