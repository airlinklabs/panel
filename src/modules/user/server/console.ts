import { Router, Request, Response } from 'express';
import type { Readable } from 'stream';
import { isAuthenticatedForServer, requireSubUserPermission } from '../../../handlers/utils/auth/serverAuthUtil';
import logger from '../../../handlers/logger';
import { checkEulaStatus } from '../../../handlers/features';
import { checkForServerInstallation } from '../../../handlers/checkForServerInstallation';
import { getServerStatus } from '../../../handlers/utils/server/serverStatus';
import { getParamAsString } from '../../../utils/typeHelpers';
import { safeClientMessage } from '../../../utils/errors';
import { NodeCapacityExceededError } from '../../../handlers/utils/server/resourceCheck';
import prisma from '../../../db';
import { daemonRequest } from '../../../handlers/utils/core/daemonRequest';
import { logActivity } from '../../../handlers/utils/activity/activityLogger';
import { issueWsToken } from '../../../handlers/utils/security/wsToken';
import { getPrimaryExternalPort } from '../../../handlers/utils/server/ports';
import {
  type ErrorMessage,
  loadServerPageContext,
  getServerStatusInput,
  getImageFeatures,
  stopServerContainer,
  startServerContainer,
  restartServerContainer,
} from './shared';

const LOG_HISTORY_TIMEOUT_MS = 8_000;
const STATUS_TIMEOUT_MS = 4_000;
const STOP_STATE_TTL_MS = 120_000;
const RESTART_DELAY_MS = 2_000;

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
          return res.render('user/account', { errorMessage, user: context.user, req });
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
        const serverStatus = await getServerStatus(getServerStatusInput(server));

        return res.render('user/server/manage', {
          errorMessage,
          features: features || [],
          installed: await checkForServerInstallation(getParamAsString(serverId)),
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
    });

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
          res.status(404).json({ status: 'error', message: 'Server not found' });
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
            .then(r => ({ state: r.data?.state, error: r.data?.error }))
            .catch(() => null),
        ]);

        res.status(200).json({
          ...serverStatus,
          state: installResult?.state,
          error: installResult?.error
            ? safeClientMessage(installResult.error, 'The server could not be installed.')
            : undefined,
        });
        return;
      } catch (error) {
        logger.error('Error fetching server status:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch server status' });
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

        if (context.status === 'missing-user' || context.status === 'missing-server') {
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        const { user, server } = context;
        const features = getImageFeatures(server.image);
        const serverStatus = await getServerStatus(getServerStatusInput(server));

        res.render('user/server/logs', {
          errorMessage,
          features: features || [],
          installed: await checkForServerInstallation(getParamAsString(serverId)),
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

        const response = await daemonRequest<{ logs?: { fileName: string; size: number; createdAt: string }[] }>({
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
        if (typeof file !== 'string' || !file || !/^[A-Za-z0-9._-]+$/.test(file)) {
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
        if (typeof file !== 'string' || !file || !/^[A-Za-z0-9._-]+$/.test(file)) {
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

        const response = await daemonRequest<Readable>({
          method: 'GET',
          path: `/container/logs/archives/download?id=${server.UUID}&file=${encodeURIComponent(file)}`,
          nodeAddress: node.address,
          nodePort: node.port,
          nodeKey: node.key,
          responseType: 'stream',
          timeout: LOG_HISTORY_TIMEOUT_MS,
        });

        if (response.status >= 400) {
          if (response.data && typeof response.data.destroy === 'function') {
            response.data.destroy();
          }
          res.status(response.status).json({ error: 'Failed to download server log archive' });
          return;
        }

        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Disposition', `attachment; filename="${file}"`);

        response.data.on('error', (streamError) => {
          logger.error('Error streaming server log archive:', streamError);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to download server log archive' });
            return;
          }
          res.end();
        });

        response.data.pipe(res);
        return;
      } catch (error) {
        logger.error('Error downloading server log archive:', error);
        res.status(500).json({ error: 'Failed to download server log archive' });
        return;
      }
    },
  );

  router.post(
    '/server/:id/power/:poweraction',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('console'),
    async (req: Request, res: Response): Promise<void> => {
      const errorMessage: ErrorMessage = {};
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const powerAction = req.params?.poweraction;

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          errorMessage.message = 'User not found.';
          return res.render('user/account', { errorMessage, user, req });
        }

        const server = await prisma.server.findUnique({
          where: { UUID: String(serverId) },
          include: { node: true, image: true, owner: true },
        });

        if (!server) {
          errorMessage.message = 'Server not found.';
          return res.render('user/server/manage', {
            errorMessage,
            features: [],
            user,
            req,
          });
        }

        if (server.Suspended && (powerAction === 'start' || powerAction === 'restart')) {
          logger.warn(
            `Attempt to start suspended server ${serverId} by user ${userId}`,
          );
          res.status(403).json({
            error:
              'This server is suspended. Please contact an administrator for assistance.',
          });
          return;
        }

        if (
          server.node?.maintenanceMode &&
          (powerAction === 'start' || powerAction === 'restart')
        ) {
          logger.warn(
            `Attempt to start server ${serverId} on node ${server.node.id} in maintenance mode by user ${userId}`,
          );
          res.status(403).json({
            error:
              'This server is on a node under maintenance. Please try again later.',
          });
          return;
        }

        if (powerAction === 'stop') {
          try {
            const stoppingStatus = {
              online: true,
              starting: false,
              stopping: true,
              uptime: null,
              startedAt: null,
            };

            const cacheKey = `server_stopping_${serverId}`;

            global.serverStoppingStates = global.serverStoppingStates || {};
            global.serverStoppingStates[cacheKey] = true;

            setTimeout(() => {
              if (
                global.serverStoppingStates &&
                global.serverStoppingStates[cacheKey]
              ) {
                delete global.serverStoppingStates[cacheKey];
                logger.info(
                  `Cleared stopping state for server ${serverId} after timeout`,
                );
              }
            }, STOP_STATE_TTL_MS);

            res.status(200).json({
              success: true,
              message: 'Server is stopping...',
              status: stoppingStatus,
            });

            await daemonRequest({
              method: 'POST',
              path: '/container/stop',
              nodeAddress: server.node.address,
              nodePort: server.node.port,
              nodeKey: server.node.key,
              body: {
                id: String(serverId),
                stopCmd: server.image?.stop || 'stop',
              },
            });
            logger.info('Container stopped successfully: ' + serverId);
            await prisma.server.update({ where: { UUID: String(serverId) }, data: { Running: false } }).catch(() => {});
            await logActivity(req, 'server:stop', { serverId: String(serverId) });
            return;
          } catch (stopError: unknown) {
            const stopErr = stopError as { status?: number } | undefined;
            if (
              stopErr?.status === 404
            ) {
              logger.info(
                'Container already stopped or not found: ' + serverId,
              );

              await prisma.server.update({ where: { UUID: String(serverId) }, data: { Running: false } }).catch(() => {});

              const cacheKey = `server_stopping_${serverId}`;
              if (
                global.serverStoppingStates &&
                global.serverStoppingStates[cacheKey]
              ) {
                delete global.serverStoppingStates[cacheKey];
              }
            } else {
              logger.warn('Failed to stop container', {
                serverId: String(serverId),
                action: 'stop',
                error: stopError,
              });
            }
            return;
          }
        }

        if (powerAction !== 'start' && powerAction !== 'stop' && powerAction !== 'restart') {
          logger.error('Invalid power action:', powerAction);
          res.status(400).json({ error: `Invalid power action: ${powerAction}` });
          return;
        }

        if (powerAction === 'restart') {
          try {
            await stopServerContainer(server, String(serverId), 'stop', { releaseResources: false });
          } catch {
            // Container may already be stopped
          }

          try {
            await new Promise(resolve => setTimeout(resolve, RESTART_DELAY_MS));
            await startServerContainer(server, String(serverId));
          } catch (error) {
            if (error instanceof Error && error.message === 'Docker image not found.') {
              res.status(400).json({ error: 'Docker image not found.' });
              return;
            }
            if (error instanceof NodeCapacityExceededError) {
              res.status(409).json({ error: error.message });
              return;
            }
            throw error;
          }

          logger.info('Container restarted successfully: ' + serverId);
          await logActivity(req, 'server:restart', { serverId: String(serverId) });
          res.status(200).json({ success: true, message: 'Server restarted successfully' });
          return;
        }

        try {
          await startServerContainer(server, String(serverId));
        } catch (error) {
          if (error instanceof Error && error.message === 'Docker image not found.') {
            res.status(400).json({ error: 'Docker image not found.' });
            return;
          }
          if (error instanceof NodeCapacityExceededError) {
            res.status(409).json({ error: error.message });
            return;
          }
          throw error;
        }
        logger.info('Container started successfully: ' + serverId);
        await logActivity(req, 'server:start', { serverId: String(serverId) });
        res.status(200).json({ message: 'Container started successfully.' });
        return;
      } catch (error) {
        logger.error('Failed to process power action', error, {
          serverId: String(serverId),
          action: String(powerAction),
        });
        res.status(500).json({ error: safeClientMessage(error, 'Failed to process power action.') });
      }
    },
  );

  router.post(
    '/server/:id/power/restart',
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

        if (server.Suspended) {
          logger.warn(
            `Attempt to restart suspended server ${serverId} by user ${userId}`,
          );
          res.status(403).json({
            error:
              'This server is suspended. Please contact an administrator for assistance.',
          });
          return;
        }

        if (server.node?.maintenanceMode) {
          logger.warn(
            `Attempt to restart server ${serverId} on node ${server.node.id} in maintenance mode by user ${userId}`,
          );
          res.status(403).json({
            error:
              'This server is on a node under maintenance. Please try again later.',
          });
          return;
        }

        if (!server.dockerImage) {
          res.status(400).json({ error: 'Docker image not found.' });
          return;
        }

        await restartServerContainer(server, String(serverId));
        logger.info('Container restarted successfully: ' + serverId);

        res
          .status(200)
          .json({ success: true, message: 'Server restarted successfully' });
      } catch (error) {
        logger.error('Error restarting server:', error);
        res.status(500).json({ error: 'Failed to restart server' });
      }
    },
  );

  router.post(
    '/server/:id/reinstall',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('settings.reinstall'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      // preserveData defaults to true: plain "reinstall" keeps the server's
      // data (worlds, configs, files). Only an explicit wipe request (a
      // confirmed "delete all data" flow) removes the volume.
      const preserveData = req.body?.preserveData !== false;

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

        await prisma.server.update({
          where: { UUID: getParamAsString(serverId) },
          data: {
            Installing: true,
            Queued: true,
          },
        });

        const { queueer } = await import('../../../handlers/queueer');
        queueer.addTask(async () => {
          try {
            const serverToReinstall = await prisma.server.findUnique({
              where: { UUID: getParamAsString(serverId) },
              include: { image: true, node: true },
            });

            if (!serverToReinstall) {
              logger.error('Server not found for reinstallation:', serverId);
              return;
            }

            let ServerEnv: import('./shared').ServerVariable[] = [];
            if (serverToReinstall.Variables) {
              try {
                ServerEnv = JSON.parse(
                  serverToReinstall.Variables,
                ) as import('./shared').ServerVariable[];

                const primaryPort = getPrimaryExternalPort(serverToReinstall.Ports);
                if (primaryPort) {
                  ServerEnv.push({
                    env: 'SERVER_PORT',
                    name: 'Primary Port',
                    value: primaryPort,
                    type: 'text',
                    default: primaryPort,
                  });
                }
              } catch (error) {
                logger.error(
                  `Error parsing Variables for server ID ${serverToReinstall.id}:`,
                  error,
                );
              }
            }

            const env = ServerEnv.reduce(
              (acc: Record<string, string | number | boolean>, curr: import('./shared').ServerVariable) => {
                if (
                  curr.env &&
                  curr.value !== undefined &&
                  curr.value !== null
                ) {
                  let processedValue: string | number | boolean;
                  switch (curr.type) {
                  case 'boolean':
                    processedValue =
                        curr.value === 1 ||
                        curr.value === '1' ||
                        curr.value === true
                          ? 'true'
                          : 'false';
                    break;
                  case 'number':
                    processedValue = Number(curr.value);
                    break;
                  case 'text':
                  default:
                    processedValue = String(curr.value);
                    break;
                  }
                  acc[curr.env] = processedValue;
                }
                return acc;
              },
              {},
            );

            if (serverToReinstall.image?.scripts) {
              let scripts;
              try {
                scripts = JSON.parse(serverToReinstall.image.scripts);

                let reinstallDockerImage: string | undefined;
                try {
                  const parsed = JSON.parse(serverToReinstall.dockerImage || '{}');
                  reinstallDockerImage = Object.values(parsed)[0] as string | undefined;
                } catch { /* leave undefined */ }

                const installResponse = await daemonRequest<{ status?: number }>({
                  method: 'POST',
                  path: '/container/reinstall',
                  nodeAddress: serverToReinstall.node.address,
                  nodePort: serverToReinstall.node.port,
                  nodeKey: serverToReinstall.node.key,
                  body: {
                    id: serverToReinstall.UUID,
                    image: reinstallDockerImage,
                    env: env,
                    preserveData,
                    scripts: scripts.install.map(
                      (script: {
                        url: string;
                        fileName: string;
                        onStart: boolean;
                        ALVKT: boolean;
                      }) => ({
                        url: script.url,
                        onStartup: script.onStart,
                        ALVKT: script.ALVKT,
                        fileName: script.fileName,
                      }),
                    ),
                  },
                });
                logger.info(
                  `Installation scripts sent for server ${serverId}. Response status: ${installResponse.status}`,
                );

                await prisma.server.update({
                  where: { UUID: getParamAsString(serverId) },
                  data: { Queued: false },
                });
              } catch (error: unknown) {
                logger.error(
                  `Error during reinstallation of server ${serverId}:`,
                  error,
                );
                const err = error && typeof error === 'object' ? error as Record<string, unknown> : {};
                if (err.status) {
                  logger.error(`Response status: ${err.status}`);
                  logger.error('Response data:', err.body);
                }
                await prisma.server.update({
                  where: { UUID: getParamAsString(serverId) },
                  data: { Queued: false, Installing: false },
                });
              }
            } else {
              await prisma.server.update({
                where: { UUID: getParamAsString(serverId) },
                data: { Queued: false, Installing: false },
              });
            }
          } catch (error) {
            logger.error(
              `Error in reinstallation queue for server ${serverId}:`,
              error,
            );

            await prisma.server
              .update({
                where: { UUID: getParamAsString(serverId) },
                data: { Queued: false, Installing: false },
              })
              .catch((e) =>
                logger.error('Error updating server queue status:', e),
              );
          }
        });

        res.status(200).json({
          success: true,
          message: 'Server reinstallation initiated',
        });
        logActivity(req, 'server:reinstall', { serverId: String(serverId) }).catch(() => {});
      } catch (error) {
        logger.error('Error reinstalling server:', error);
        res.status(500).json({ error: 'Failed to reinstall server' });
      }
    },
  );
}
