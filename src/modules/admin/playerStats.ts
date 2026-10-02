import type { Request, Response } from 'express';
import { Router } from 'express';
import type { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import { registerPermission } from '../../handlers/permissions';
import { collectPlayerStats } from '../../handlers/playerStatsCollector';
import { daemonRequest } from '../../handlers/utils/core/daemonRequest';
import {
  daemonPlayerListSchema,
  parseDaemonResponse,
} from '../../types/daemon';
import { getPrimaryExternalPort } from '../../handlers/utils/server/ports';
import { DAEMON_TIMEOUT_SHORT_MS } from '../../config/daemonTimeouts';

registerPermission('airlink.admin.playerstats.view');

const adminModule: Module = {
  info: {
    name: 'Admin Player Stats Module',
    description: 'This file provides player statistics for the admin panel.',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    // No legacy `GET /admin/playerstats` page route here. It rendered
    // `admin/playerstats/playerstats` — a view that has never existed — and
    // only ever worked because `pages/admin/playerStats.ts` mounted first and
    // shadowed it. Player Statistics is now the Player Statistics tab of
    // /admin/analytics, so with that shadow gone this route would have started
    // 500'ing. The JSON API below is untouched.

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
                const primaryPort = getPrimaryExternalPort(server.Ports);

                if (!primaryPort) {
                  return {
                    serverId: server.UUID,
                    serverName: server.name,
                    playerCount: 0,
                    maxPlayers: 0,
                    online: false,
                    error: 'No primary port found',
                  };
                }

                const response = await daemonRequest<unknown>({
                  nodeAddress: server.node.address,
                  nodePort: server.node.port,
                  nodeKey: server.node.key,
                  method: 'GET',
                  path: '/minecraft/players',
                  params: {
                    id: server.UUID,
                    host: server.node.address,
                    port: primaryPort,
                  },
                  timeout: DAEMON_TIMEOUT_SHORT_MS,
                });

                const playersData =
                  parseDaemonResponse(daemonPlayerListSchema, response.data) ??
                  {};

                return {
                  serverId: server.UUID,
                  serverName: server.name,
                  playerCount: playersData.onlinePlayers || 0,
                  maxPlayers: playersData.maxPlayers || 0,
                  online: playersData.online || false,
                  version: playersData.version || 'Unknown',
                };
              } catch {
                return {
                  serverId: server.UUID,
                  serverName: server.name,
                  playerCount: 0,
                  maxPlayers: 0,
                  online: false,
                  error: 'Failed to fetch player data',
                };
              }
            }),
          );

          const totalPlayers = playerData.reduce(
            (sum, server) => sum + server.playerCount,
            0,
          );
          const totalMaxPlayers = playerData.reduce(
            (sum, server) => sum + server.maxPlayers,
            0,
          );
          const onlineServers = playerData.filter(
            (server) => server.online,
          ).length;

          const historicalData = await prisma.playerStats.findMany({
            orderBy: {
              timestamp: 'asc',
            },
            take: 576, // 48 hours of data at 5-minute intervals (12 data points per hour * 48 hours)
          });

          res.json({
            servers: playerData,
            totalPlayers,
            totalMaxPlayers,
            onlineServers,
            totalServers: servers.length,
            historicalData,
          });
        } catch (error: unknown) {
          logger.error('Failed to fetch player statistics:', error);
          res.status(500).json({ error: 'Failed to fetch player statistics' });
        }
      },
    );

    router.post(
      '/api/admin/playerstats/collect',
      isAuthenticated(true, 'airlink.admin.playerstats.view'),
      async (req: Request, res: Response) => {
        try {
          await collectPlayerStats();
          res.json({
            success: true,
            message: 'Player statistics collected successfully',
          });
        } catch (error: unknown) {
          logger.error('Failed to collect player statistics:', error);
          res
            .status(500)
            .json({ error: 'Failed to collect player statistics' });
        }
      },
    );

    return router;
  },
};

export default adminModule;
