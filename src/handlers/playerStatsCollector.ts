/**
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 *      AirLink - Open Source Project by AirlinkLabs
 *      Repository: https://github.com/airlinklabs/panel
 *
 *     © 2024 AirlinkLabs. Licensed under the MIT License
 * ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import logger from './logger';

const prisma = new PrismaClient();

// Interval in milliseconds (5 minutes)
const COLLECTION_INTERVAL = 5 * 60 * 1000;

// Maximum number of data points to keep (48 hours worth of data at 5-minute intervals)
const MAX_DATA_POINTS = 48 * 12;

/**
 * Collects player statistics from all servers and stores them in the database
 */
export async function collectPlayerStats(): Promise<void> {
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
              playerCount: 0,
              maxPlayers: 0,
              online: false,
            };
          }

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
            timeout: 5000
          });

          return {
            serverId: server.UUID,
            playerCount: response.data.onlinePlayers || 0,
            maxPlayers: response.data.maxPlayers || 0,
            online: response.data.online || false,
          };
        } catch (error) {
          return {
            serverId: server.UUID,
            playerCount: 0,
            maxPlayers: 0,
            online: false,
          };
        }
      })
    );

    // Calculate totals
    const totalPlayers = playerData.reduce((sum, server) => sum + server.playerCount, 0);
    const maxPlayers = playerData.reduce((sum, server) => sum + server.maxPlayers, 0);
    const onlineServers = playerData.filter(server => server.online).length;
    const totalServers = servers.length;

    // Store in database
    await prisma.playerStats.create({
      data: {
        totalPlayers,
        maxPlayers,
        onlineServers,
        totalServers
      }
    });

    // Clean up old data
    const oldestToKeep = await prisma.playerStats.findMany({
      orderBy: {
        timestamp: 'desc'
      },
      take: MAX_DATA_POINTS
    });

    if (oldestToKeep.length === MAX_DATA_POINTS) {
      const oldestTimestamp = oldestToKeep[MAX_DATA_POINTS - 1].timestamp;

      await prisma.playerStats.deleteMany({
        where: {
          timestamp: {
            lt: oldestTimestamp
          }
        }
      });
    }

    logger.debug(`Collected player stats: ${totalPlayers} players, ${onlineServers}/${totalServers} servers online`);
  } catch (error) {
    // Silently handle errors during player stats collection
    // This prevents console errors when nodes are offline
    logger.debug('Player stats collection skipped due to error');
  }
}

let statsCollectionInterval: NodeJS.Timeout | null = null;

/**
 * Starts the player statistics collection service
 */
export function startPlayerStatsCollection(): void {
  if (statsCollectionInterval) {
    clearInterval(statsCollectionInterval);
  }

  // Collect stats immediately
  collectPlayerStats();

  // Then set up interval
  statsCollectionInterval = setInterval(collectPlayerStats, COLLECTION_INTERVAL);
  logger.debug(`Player stats collection started (interval: ${COLLECTION_INTERVAL / 1000} seconds)`);
}

/**
 * Stops the player statistics collection service
 */
export function stopPlayerStatsCollection(): void {
  if (statsCollectionInterval) {
    clearInterval(statsCollectionInterval);
    statsCollectionInterval = null;
    logger.info('Player stats collection stopped');
  }
}
