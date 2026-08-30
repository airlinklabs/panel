import { getSettings } from '../../../handlers/settingsCache';
import type { Router, Request, Response } from 'express';
import {
  isAuthenticatedForServer,
  requireSubUserPermission,
} from '../../../handlers/utils/auth/serverAuthUtil';
import logger from '../../../handlers/logger';
import { checkForServerInstallation } from '../../../handlers/checkForServerInstallation';
import { getServerStatus } from '../../../handlers/utils/server/serverStatus';
import { getParamAsString } from '../../../utils/typeHelpers';
import prisma from '../../../db';
import { daemonRequest } from '../../../handlers/utils/core/daemonRequest';
import { redisRateLimit } from '../../../handlers/utils/security/redisRateLimit';
import {
  loadAuthenticatedServerContext,
  sendMissingServerContext,
  getServerStatusInput,
  getImageFeatures,
} from './shared';

export function registerFileDetailRoutes(router: Router): void {
  router.get(
    '/server/:id/files/edit/{*path}',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('files'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const filePath = Array.isArray(req.params?.path)
        ? req.params.path.join('/')
        : getParamAsString(req.params?.path);
      const settings = await getSettings();
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

        const response = await daemonRequest<string>({
          method: 'GET',
          path: '/fs/file/content',
          nodeAddress: server.node.address,
          nodePort: server.node.port,
          nodeKey: server.node.key,
          params: { id: server.UUID, path: filePath },
        });

        const extension =
          getParamAsString(filePath).split('.').pop()?.toLowerCase() || '';

        const features = getImageFeatures(server.image);
        const serverStatus = await getServerStatus(
          getServerStatusInput(server),
        );

        res.render('user/server/file', {
          errorMessage: {},
          user,
          features,
          installed: await checkForServerInstallation(
            getParamAsString(serverId),
          ),
          file: {
            name: getParamAsString(filePath).split('/').pop(),
            path: filePath,
            content: response.data,
            extension,
          },
          server,
          serverStatus,
          req,
          settings,
        });
      } catch (error) {
        logger.error('Error fetching file:', error);

        const server = await prisma.server.findUnique({
          where: { UUID: getParamAsString(serverId) },
          include: {
            node: true,
            owner: true,
            image: true,
          },
        });

        if (!server) {
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        const features = getImageFeatures(server.image);
        const serverStatus = await getServerStatus(
          getServerStatusInput(server),
        );

        let errorMessage = 'Error fetching file data.';
        if (serverStatus.daemonOffline) {
          errorMessage =
            'Unable to access file. The daemon appears to be offline.';
        }

        res.render('user/server/file', {
          errorMessage: { message: errorMessage },
          user: req.session?.user,
          features,
          installed: false,
          file: {
            name: getParamAsString(filePath).split('/').pop() || 'Unknown',
            path: filePath,
            content:
              '// Unable to load file content\n// The daemon appears to be offline',
            extension: getParamAsString(filePath).split('.').pop() || 'txt',
          },
          server,
          serverStatus,
          req,
          settings,
        });
      }
    },
  );

  /*
   * File system : Save
   */
  router.post(
    '/server/:id/files/{*path}',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('files'),
    redisRateLimit,
    async (req: Request, res: Response) => {
      let filePath = Array.isArray(req.params?.path)
        ? req.params.path.join('/')
        : getParamAsString(req.params?.path);
      if (filePath.endsWith('/save')) {
        filePath = filePath.slice(0, -5);
      }
      const { content } = req.body;

      if (typeof content !== 'string') {
        res.status(400).json({ error: 'Content is required' });
        return;
      }

      try {
        const context = await loadAuthenticatedServerContext(req);
        if (sendMissingServerContext(res, context)) {
          return;
        }
        const { server } = context;

        await daemonRequest({
          method: 'POST',
          path: '/fs/file/content',
          nodeAddress: server.node.address,
          nodePort: server.node.port,
          nodeKey: server.node.key,
          body: {
            id: server.UUID,
            path: filePath,
            content,
          },
        });

        res.json({ success: true });
        return;
      } catch (error) {
        logger.error('Error saving file:', error);
        res.status(500).json({ error: 'Failed to save file' });
        return;
      }
    },
  );

  router.post(
    '/server/:id/feature/eula',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('files'),
    async (req: Request, res: Response) => {
      const context = await loadAuthenticatedServerContext(req);
      if (sendMissingServerContext(res, context)) {
        return;
      }
      const { server } = context;

      try {
        await daemonRequest({
          method: 'POST',
          path: '/fs/file/content',
          nodeAddress: server.node.address,
          nodePort: server.node.port,
          nodeKey: server.node.key,
          body: {
            id: server.UUID,
            path: 'eula.txt',
            content: 'eula=true',
          },
        });

        res.status(200).json({ success: true });
        return;
      } catch (error) {
        logger.error('Error accepting EULA:', error);
        res.status(500).json({ error: 'Failed to accept EULA' });
        return;
      }
    },
  );
}
