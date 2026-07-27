import { Router, Request, Response } from 'express';
import { isAuthenticatedForServer } from '../../../handlers/utils/auth/serverAuthUtil';
import logger from '../../../handlers/logger';
import { checkForServerInstallation } from '../../../handlers/checkForServerInstallation';
import { getServerStatus } from '../../../handlers/utils/server/serverStatus';
import { getParamAsString } from '../../../utils/typeHelpers';
import prisma from '../../../db';
import { daemonRequest } from '../../../handlers/utils/core/daemonRequest';
import {
  getServerStatusInput,
  getImageFeatures,
} from './shared';

export function registerPlayersRoutes(router: Router): void {
  router.get(
    '/server/:id/players',
    isAuthenticatedForServer('id'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { UUID: getParamAsString(serverId) },
          include: { node: true, image: true },
        });

        if (!server) {
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        const primaryPort = server.Ports
          ? JSON.parse(server.Ports)
            .filter((Port: any) => Port.primary)
            .map((Port: any) => Port.Port.split(':')[1])
            .pop()
          : '';

        const features = getImageFeatures(server.image);

        if (!primaryPort) {
          return res.render('user/server/players', {
            errorMessage: { message: 'No primary port found' },
            user,
            features,
            installed: await checkForServerInstallation(getParamAsString(serverId)),
            players: [],
            server,
            req,
            settings: await prisma.settings.findUnique({ where: { id: 1 } }),
          });
        }

        let players: Array<{ name: string; uuid: string }> = [];
        let serverInfo = {
          maxPlayers: 0,
          onlinePlayers: 0,
          version: 'Unknown',
        };
        let hadFetchError = false;
        let serverIsOnline = false;

        try {
          logger.info(
            `Fetching players for server ${serverId} on port ${primaryPort}`,
          );

          const playersResponse = await daemonRequest<{
            online?: boolean;
            version?: string;
            players?: Array<{ name: string; uuid: string }>;
            maxPlayers?: number;
            onlinePlayers?: number;
          }>({
            method: 'GET',
            path: '/minecraft/players',
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            nodeKey: server.node.key,
            params: {
              id: server.UUID,
              host: server.node.address,
              port: parseInt(primaryPort, 10),
            },
            timeout: 8000,
          });

          if (playersResponse.data) {
            serverIsOnline =
              typeof playersResponse.data.online === 'boolean'
                ? playersResponse.data.online
                : !!playersResponse.data.version;

            if (Array.isArray(playersResponse.data.players)) {
              players = playersResponse.data.players;
            }

            serverInfo = {
              maxPlayers: playersResponse.data.maxPlayers || 0,
              onlinePlayers: playersResponse.data.onlinePlayers || 0,
              version: playersResponse.data.version || 'Unknown',
            };

            logger.info(`Successfully fetched server data for ${serverId}`);
            logger.info(
              `Server version: ${serverInfo.version}, Players: ${players.length} (${serverInfo.onlinePlayers}/${serverInfo.maxPlayers})`,
            );
            logger.info(
              `Server online status: ${serverIsOnline ? 'Online' : 'Offline'}`,
            );
          } else {
            logger.warn(`No valid data returned for server ${serverId}`);
            hadFetchError = true;
          }
        } catch (error: any) {
          if (
            error?.code !== 'ECONNREFUSED' &&
            error?.code !== 'ETIMEDOUT' &&
            error?.code !== 'ENOTFOUND'
          ) {
            logger.error(
              `Error fetching players from daemon for server ${serverId}:`,
              error,
            );
          }
          hadFetchError = true;
        }

        const settings = await prisma.settings.findUnique({ where: { id: 1 } });
        const hasError = hadFetchError && !serverIsOnline;
        const serverStatus = await getServerStatus(getServerStatusInput(server));

        return res.render('user/server/players', {
          errorMessage: hasError
            ? {
              message:
                  'Unable to fetch players. The server may be offline or not responding.',
            }
            : {},
          serverIsOnline,
          user,
          players,
          serverInfo,
          features,
          installed: await checkForServerInstallation(getParamAsString(serverId)),
          server,
          serverStatus,
          req,
          settings,
        });
      } catch (error) {
        logger.error('Error getting players:', error);
        res.status(500).json({ error: 'Failed to get players' });
      }
    },
  );
}
