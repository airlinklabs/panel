import type { Router, Request, Response } from 'express';
import {
  isAuthenticatedForServer,
  requireSubUserPermission,
} from '../../../handlers/utils/auth/serverAuthUtil';
import logger from '../../../handlers/logger';
import { checkEulaStatus } from '../../../handlers/features';
import { checkForServerInstallation } from '../../../handlers/checkForServerInstallation';
import { getServerStatus } from '../../../handlers/utils/server/serverStatus';
import { getParamAsString } from '../../../utils/typeHelpers';
import { safeClientMessage } from '../../../utils/errors';
import prisma from '../../../db';
import {
  daemonRequest,
  daemonBaseUrl,
} from '../../../handlers/utils/core/daemonRequest';
import { issueWsToken } from '../../../handlers/utils/security/wsToken';
import {
  type ErrorMessage,
  loadServerPageContext,
  getServerStatusInput,
  getImageFeatures,
} from './shared';
import { runtimeStartQueue } from '../../../handlers/runtimeQueue';
import { registerPowerRoutes } from './power';
import { registerReinstallRoutes } from './reinstall';

const LOG_HISTORY_TIMEOUT_MS = 8_000;
const STATUS_TIMEOUT_MS = 4_000;

export function registerConsoleRoutes(router: Router): void {
  router.get(
    '/server/:id',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('console'),
    async (req: Request, res: Response) => {
      const errorMessage: ErrorMessage = {};
      const serverId = req.params?.id;
      let settings = null;
      try {
        const context = await loadServerPageContext(req);
        settings = context.settings;
        if (context.status === 'missing-user') {
          errorMessage.message = 'User not found.';
          return res.render('user/account', {
            errorMessage,
            user: context.user,
            req,
          });
        }
        if (context.status === 'missing-server') {
          errorMessage.message = 'Server not found.';
          return res.render('user/server/manage', {
            errorMessage,
            features: [],
            user: context.user,
            req,
            settings,
          });
        }

        const { user, server } = context;
        let features = getImageFeatures(server.image);

        if (features.includes('eula')) {
          const eulaStatus = await checkEulaStatus(server.UUID);
          if (eulaStatus.accepted) {
            features = features.filter((feature) => feature !== 'eula');
          } else if (eulaStatus.error) {
            features = features.filter((feature) => feature !== 'eula');
          }
        }
        const serverStatus = await getServerStatus(
          getServerStatusInput(server),
        );

        return res.render('user/server/manage', {
          errorMessage,
          features: features || [],
          installed: await checkForServerInstallation(
            getParamAsString(serverId),
          ),
          user,
          req,
          server,
          serverStatus,
          settings,
        });
      } catch (error) {
        logger.error('Error fetching user:', error);
        errorMessage.message = 'Error fetching user data.';
        return res.render('user/server/manage', {
          errorMessage,
          features: [],
          user: req.session?.user,
          req,
          settings,
        });
      }
    },
  );

  router.get(
    '/server/:id/ws-token',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('console'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const serverId = getParamAsString(req.params?.id);
        const user = req.session?.user;
        if (!user?.id || !serverId) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }
        const target = await prisma.server.findUnique({
          where: { UUID: serverId },
          select: { UUID: true },
        });
        if (!target) {
          res.status(404).json({ error: 'Server not found' });
          return;
        }
        res.status(200).json({ token: issueWsToken(serverId, user.id) });
      } catch (error) {
        logger.error('Error issuing WS token:', error);
        res.status(500).json({ error: 'Failed to issue WS token' });
      }
    },
  );

  router.get(
    '/server/:id/logs/history',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('console'),
    async (req: Request, res: Response): Promise<void> => {
      const serverId = req.params?.id;

      try {
        const server = await prisma.server.findUnique({
          where: { UUID: String(serverId) },
          include: { node: true },
        });

        if (!server) {
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        const { node } = server;

        const response = await daemonRequest<{ logs?: string[] }>({
          method: 'GET',
          path: `/container/logs/history?id=${server.UUID}`,
          nodeAddress: node.address,
          nodePort: node.port,
          nodeKey: node.key,
          timeout: LOG_HISTORY_TIMEOUT_MS,
        });

        res.status(200).json({ logs: response.data?.logs ?? [] });
        return;
      } catch (error) {
        logger.error('Error fetching server log history:', error);
        res.status(500).json({ error: 'Failed to fetch server log history' });
        return;
      }
    },
  );

  router.get(
    '/server/:id/status',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('console'),
    async (req: Request, res: Response): Promise<void> => {
      const serverId = req.params?.id;

      try {
        const server = await prisma.server.findUnique({
          where: { UUID: String(serverId) },
          include: { node: true },
        });

        if (!server) {
          res
            .status(404)
            .json({ status: 'error', message: 'Server not found' });
          return;
        }

        const { node } = server;

        const [serverStatus, installResult] = await Promise.all([
          getServerStatus({
            nodeAddress: node.address,
            nodePort: node.port,
            serverUUID: server.UUID,
            nodeKey: node.key,
          }),
          daemonRequest<{ state?: string; error?: string }>({
            method: 'GET',
            path: `/container/status/${server.UUID}`,
            nodeAddress: node.address,
            nodePort: node.port,
            nodeKey: node.key,
            timeout: STATUS_TIMEOUT_MS,
          })
            .then((r) => ({ state: r.data?.state, error: r.data?.error }))
            .catch(() => null),
        ]);

        res.status(200).json({
          ...serverStatus,
          state: installResult?.state,
          error: installResult?.error
            ? safeClientMessage(
              installResult.error,
              'The server could not be installed.',
            )
            : undefined,
          queue: await runtimeStartQueue.getPublicQueueState(server.UUID, node),
        });
        return;
      } catch (error) {
        logger.error('Error fetching server status:', error);
        res
          .status(500)
          .json({ status: 'error', message: 'Failed to fetch server status' });
        return;
      }
    },
  );

  router.get(
    '/server/:id/logs',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('console'),
    async (req: Request, res: Response): Promise<void> => {
      const errorMessage: ErrorMessage = {};
      const serverId = req.params?.id;

      try {
        const context = await loadServerPageContext(req);
        const settings = context.settings;

        if (
          context.status === 'missing-user' ||
          context.status === 'missing-server'
        ) {
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        const { user, server } = context;
        const features = getImageFeatures(server.image);
        const serverStatus = await getServerStatus(
          getServerStatusInput(server),
        );

        res.render('user/server/logs', {
          errorMessage,
          features: features || [],
          installed: await checkForServerInstallation(
            getParamAsString(serverId),
          ),
          user,
          req,
          server,
          serverStatus,
          settings,
        });
        return;
      } catch (error) {
        logger.error('Error loading server logs page:', error);
        errorMessage.message = 'Error loading server logs page.';
        res.status(500).json({ error: 'Failed to load server logs page' });
        return;
      }
    },
  );

  router.get(
    '/server/:id/logs/archives',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('console'),
    async (req: Request, res: Response): Promise<void> => {
      const serverId = req.params?.id;

      try {
        const server = await prisma.server.findUnique({
          where: { UUID: String(serverId) },
          include: { node: true },
        });

        if (!server) {
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        const { node } = server;

        const response = await daemonRequest<{
          logs?: { fileName: string; size: number; createdAt: string }[];
        }>({
          method: 'GET',
          path: `/container/logs/archives?id=${server.UUID}`,
          nodeAddress: node.address,
          nodePort: node.port,
          nodeKey: node.key,
          timeout: LOG_HISTORY_TIMEOUT_MS,
        });

        res.status(200).json({ logs: response.data?.logs ?? [] });
        return;
      } catch (error) {
        logger.error('Error fetching server log archives:', error);
        res.status(500).json({ error: 'Failed to fetch server log archives' });
        return;
      }
    },
  );

  router.get(
    '/server/:id/logs/archives/read',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('console'),
    async (req: Request, res: Response): Promise<void> => {
      const serverId = req.params?.id;
      const file = req.query?.file;

      try {
        if (
          typeof file !== 'string' ||
          !file ||
          !/^[A-Za-z0-9._-]+$/.test(file)
        ) {
          res.status(400).json({ error: 'Invalid file name' });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { UUID: String(serverId) },
          include: { node: true },
        });

        if (!server) {
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        const { node } = server;

        const response = await daemonRequest<{ lines?: string[] }>({
          method: 'GET',
          path: `/container/logs/archives/read?id=${server.UUID}&file=${encodeURIComponent(file)}`,
          nodeAddress: node.address,
          nodePort: node.port,
          nodeKey: node.key,
          timeout: LOG_HISTORY_TIMEOUT_MS,
        });

        res.status(200).json({ lines: response.data?.lines ?? [] });
        return;
      } catch (error) {
        logger.error('Error reading server log archive:', error);
        res.status(500).json({ error: 'Failed to read server log archive' });
        return;
      }
    },
  );

  router.get(
    '/server/:id/logs/archives/download',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('console'),
    async (req: Request, res: Response): Promise<void> => {
      const serverId = req.params?.id;
      const file = req.query?.file;

      try {
        if (
          typeof file !== 'string' ||
          !file ||
          !/^[A-Za-z0-9._-]+$/.test(file)
        ) {
          res.status(400).json({ error: 'Invalid file name' });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { UUID: String(serverId) },
          include: { node: true },
        });

        if (!server) {
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        const { node } = server;

        const response = await daemonRequest<{ token?: string; url?: string }>({
          method: 'POST',
          path: '/container/logs/archives/download-token',
          nodeAddress: node.address,
          nodePort: node.port,
          nodeKey: node.key,
          body: { id: server.UUID, file },
          timeout: 15000,
        });

        if (
          response.status !== 200 ||
          !response.data?.token ||
          !response.data?.url
        ) {
          res
            .status(response.status || 500)
            .json({ error: 'Failed to start download' });
          return;
        }

        const base = await daemonBaseUrl(node.address, node.port);
        res.redirect(302, `${base}${response.data.url}`);
        return;
      } catch (error) {
        logger.error('Error downloading server log archive:', error);
        res
          .status(500)
          .json({ error: 'Failed to download server log archive' });
        return;
      }
    },
  );

  registerPowerRoutes(router);

  registerReinstallRoutes(router);
}
