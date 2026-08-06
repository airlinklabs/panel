import { Router, Request, Response } from 'express';
import { isAuthenticatedForServer, requireSubUserPermission } from '../../../handlers/utils/auth/serverAuthUtil';
import logger from '../../../handlers/logger';
import { checkForServerInstallation } from '../../../handlers/checkForServerInstallation';
import { getServerStatus } from '../../../handlers/utils/server/serverStatus';
import { getParamAsString } from '../../../utils/typeHelpers';
import prisma from '../../../db';
import { daemonRequest } from '../../../handlers/utils/core/daemonRequest';
import {
  type ServerPageServer,
  getServerStatusInput,
  getImageFeatures,
  getPrimaryPort,
} from './shared';

type PlayerServer = Pick<ServerPageServer, 'UUID' | 'Ports' | 'node' | 'image'>;

export function registerPlayersRoutes(router: Router): void {
  // The daemon /minecraft/players handler pings host:port on the node address.
  // Server start maps ports as external:internal (portsToDaemonString), so the
  // Minecraft server inside the container is reachable on the node's own
  // address at the EXTERNAL (primary) port — not the internal port. Match the
  // server-start contract by using the external primary port.
  async function fetchPlayerData(server: PlayerServer, primaryPort: number) {
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
        `Fetching players for server ${server.UUID} on port ${primaryPort}`,
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
          port: primaryPort,
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

        logger.info(`Successfully fetched server data for ${server.UUID}`);
        logger.info(
          `Server version: ${serverInfo.version}, Players: ${players.length} (${serverInfo.onlinePlayers}/${serverInfo.maxPlayers})`,
        );
        logger.info(
          `Server online status: ${serverIsOnline ? 'Online' : 'Offline'}`,
        );
      } else {
        logger.warn(`No valid data returned for server ${server.UUID}`);
        hadFetchError = true;
      }
    } catch (error: unknown) {
      const errCode = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : undefined;
      if (
        errCode !== 'ECONNREFUSED' &&
        errCode !== 'ETIMEDOUT' &&
        errCode !== 'ENOTFOUND'
      ) {
        logger.error(
          `Error fetching players from daemon for server ${server.UUID}:`,
          error,
        );
      }
      hadFetchError = true;
    }

    return { players, serverInfo, serverIsOnline, hadFetchError };
  }

  router.get(
    '/server/:id/players/data',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('console'),
    async (req: Request, res: Response) => {
      const serverId = getParamAsString(req.params?.id);

      try {
        const server = await prisma.server.findUnique({
          where: { UUID: serverId },
          include: { node: true, image: true },
        });

        if (!server) {
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        const primaryPort = getPrimaryPort(server.Ports);

        if (!primaryPort) {
          res.json({ serverInfo: null, players: [], serverIsOnline: false, error: 'No primary port found' });
          return;
        }

        const { players, serverInfo, serverIsOnline, hadFetchError } =
          await fetchPlayerData(server, primaryPort);

        res.json({
          players,
          serverInfo,
          serverIsOnline,
          error: hadFetchError && !serverIsOnline ? 'unreachable' : null,
        });
      } catch (error) {
        logger.error('Error fetching players data:', error);
        res.status(500).json({ error: 'Failed to get players data' });
      }
    },
  );

  router.get(
    '/server/:id/players',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('console'),
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

        const primaryPort = getPrimaryPort(server.Ports);

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

        const { players, serverInfo, serverIsOnline, hadFetchError } =
          await fetchPlayerData(server, primaryPort);

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
