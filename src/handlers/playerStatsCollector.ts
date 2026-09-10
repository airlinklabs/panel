import prisma from '../db';
import logger from './logger';
import { daemonRequest } from './utils/core/daemonRequest';
import { daemonPlayerListSchema, parseDaemonResponse } from '../types/daemon';
import { parseServerPorts } from './utils/server/ports';
import { emitRealtime } from './realtime/events';
import { PLAYER_STATS_INTERVAL_MS } from '../config/timeouts';
import { PLAYER_STATS_MAX_DATA_POINTS } from '../config/ui';
import { DAEMON_TIMEOUT_SHORT_MS } from '../config/daemonTimeouts';
import { logT } from '../services/i18n';

// Interval in milliseconds (5 minutes)
// Maximum number of data points to keep (48 hours worth of data at 5-minute intervals)

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
          const ports = parseServerPorts(server.Ports);
          const primaryPort = ports
            .find((p) => p.primary)
            ?.externalPort?.toString();

          if (!primaryPort) {
            return {
              serverId: server.UUID,
              playerCount: 0,
              maxPlayers: 0,
              online: false,
            };
          }

          // Fetch player data from the daemon
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
            parseDaemonResponse(daemonPlayerListSchema, response.data) ?? {};

          return {
            serverId: server.UUID,
            playerCount: playersData.onlinePlayers || 0,
            maxPlayers: playersData.maxPlayers || 0,
            online: playersData.online || false,
          };
        } catch {
          return {
            serverId: server.UUID,
            playerCount: 0,
            maxPlayers: 0,
            online: false,
          };
        }
      }),
    );

    // Calculate totals
    const totalPlayers = playerData.reduce(
      (sum, server) => sum + server.playerCount,
      0,
    );
    const maxPlayers = playerData.reduce(
      (sum, server) => sum + server.maxPlayers,
      0,
    );
    const onlineServers = playerData.filter((server) => server.online).length;
    const totalServers = servers.length;

    // Store in database
    await prisma.playerStats.create({
      data: {
        totalPlayers,
        maxPlayers,
        onlineServers,
        totalServers,
      },
    });

    // Clean up old data
    const oldestToKeep = await prisma.playerStats.findMany({
      orderBy: {
        timestamp: 'desc',
      },
      take: PLAYER_STATS_MAX_DATA_POINTS,
    });

    if (oldestToKeep.length === PLAYER_STATS_MAX_DATA_POINTS) {
      const oldestTimestamp =
        oldestToKeep[PLAYER_STATS_MAX_DATA_POINTS - 1]!.timestamp;

      await prisma.playerStats.deleteMany({
        where: {
          timestamp: {
            lt: oldestTimestamp,
          },
        },
      });
    }

    // Player stats were just collected — tell any admin playerstats page to
    // re-fetch instead of waiting out its own poll interval.
    emitRealtime({
      type: 'player.stats.updated',
      scope: { admin: true },
      state: {},
    });
  } catch (error) {
    logger.warn(logT('log.playerStatsCollectionFailed'), { error });
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
  statsCollectionInterval = setInterval(
    collectPlayerStats,
    PLAYER_STATS_INTERVAL_MS,
  );
  logger.info(
    logT('log.playerStatsCollectionStarted', {
      interval: PLAYER_STATS_INTERVAL_MS / 1000,
    }),
  );
}

/**
 * Stops the player statistics collection service
 */
export function stopPlayerStatsCollection(): void {
  if (statsCollectionInterval) {
    clearInterval(statsCollectionInterval);
    statsCollectionInterval = null;
    logger.info(logT('log.playerStatsCollectionStopped'));
  }
}
