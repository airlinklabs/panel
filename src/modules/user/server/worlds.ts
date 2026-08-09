import { Router, Request, Response } from 'express';
import { isAuthenticatedForServer, requireSubUserPermission } from '../../../handlers/utils/auth/serverAuthUtil';
import logger from '../../../handlers/logger';
import { isWorld } from '../../../handlers/features';
import { fsListSchema, parseDaemonResponse } from '../../../platform/daemon/dtos';
import { checkForServerInstallation } from '../../../handlers/checkForServerInstallation';
import { getServerStatus } from '../../../handlers/utils/server/serverStatus';
import { getParamAsString } from '../../../utils/typeHelpers';
import prisma from '../../../db';
import { daemonRequest } from '../../../handlers/utils/core/daemonRequest';
import {
  getServerStatusInput,
  getImageFeatures,
} from './shared';

export function registerWorldsRoutes(router: Router): void {
  router.get(
    '/server/:id/worlds',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('files'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const settings = await prisma.settings.findUnique({ where: { id: 1 } });
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

        try {
          const serverStatusInput = getServerStatusInput(server);
          const response = await daemonRequest<unknown>({
            method: 'GET',
            path: '/fs/list',
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            nodeKey: server.node.key,
            params: { id: server.UUID },
          });
          const Folders = parseDaemonResponse(fsListSchema, response.data) ?? [];

          const worlds = [];
          for (const folder of Folders) {
            if (
              folder.type === 'directory' &&
              (await isWorld(folder.name, serverStatusInput))
            ) {
              worlds.push({ name: folder.name });
            }
          }

          const features = getImageFeatures(server.image);

          const serverStatus = await getServerStatus(serverStatusInput);

          return res.render('user/server/worlds', {
            errorMessage: {},
            user,
            worlds,
            features,
            installed: await checkForServerInstallation(getParamAsString(serverId)),
            server,
            serverStatus,
            req,
            settings,
          });
        } catch (fileRequestError: unknown) {
          const errCode = fileRequestError && typeof fileRequestError === 'object' && 'code' in fileRequestError
            ? String((fileRequestError as { code: unknown }).code)
            : undefined;
          if (
            errCode !== 'ECONNREFUSED' &&
            errCode !== 'ETIMEDOUT' &&
            errCode !== 'ENOTFOUND' &&
            errCode !== 'ERR_BAD_RESPONSE'
          ) {
            logger.error('Error fetching files:', fileRequestError);
          }

          const serverStatus = await getServerStatus({
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            serverUUID: server.UUID,
            nodeKey: server.node.key,
          });

          return res.render('user/server/worlds', {
            errorMessage: {
              message:
                'Failed to fetch worlds. The server may be offline or not responding.',
            },
            user,
            worlds: [],
            features: [],
            installed: await checkForServerInstallation(getParamAsString(serverId)),
            server,
            serverStatus,
            req,
            settings,
          });
        }
      } catch (error) {
        logger.error('Error getting worlds:', error);

        return res.render('user/server/worlds', {
          errorMessage: {
            message: 'Failed to load worlds. Please try again later.',
          },
          user: req.session?.user,
          worlds: [],
          features: [],
          installed: false,
          server: null,
          req,
          settings: null,
        });
      }
    },
  );
}
