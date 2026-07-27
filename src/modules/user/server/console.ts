import { Router, Request, Response } from 'express';
import { isAuthenticatedForServer } from '../../../handlers/utils/auth/serverAuthUtil';
import logger from '../../../handlers/logger';
import { checkEulaStatus } from '../../../handlers/features';
import { checkForServerInstallation } from '../../../handlers/checkForServerInstallation';
import { getServerStatus } from '../../../handlers/utils/server/serverStatus';
import { getParamAsString } from '../../../utils/typeHelpers';
import prisma from '../../../db';
import { daemonRequest } from '../../../handlers/utils/core/daemonRequest';
import {
  type ErrorMessage,
  type ServerPageServer,
  loadServerPageContext,
  getServerStatusInput,
  getImageFeatures,
  stopServerContainer,
  startServerContainer,
  restartServerContainer,
  getServerDaemonAuth,
  getServerDaemonAddress,
} from './shared';

export function registerConsoleRoutes(router: Router): void {
  router.get(
    '/server/:id',
    isAuthenticatedForServer('id'),
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
    },
  );

  router.get(
    '/server/:id/status',
    isAuthenticatedForServer('id'),
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
          daemonRequest<{ state?: string }>({
            method: 'GET',
            path: `/container/status/${server.UUID}`,
            nodeAddress: node.address,
            nodePort: node.port,
            nodeKey: node.key,
            timeout: 4000,
          }).then(r => r.data?.state as string).catch(() => null),
        ]);

        res.status(200).json({ ...serverStatus, state: installResult });
        return;
      } catch (error) {
        logger.error('Error fetching server status:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch server status' });
        return;
      }
    },
  );

  router.post(
    '/server/:id/power/:poweraction',
    isAuthenticatedForServer('id'),
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
            user,
            req,
          });
        }

        if (server.Suspended && powerAction === 'start') {
          logger.warn(
            `Attempt to start suspended server ${serverId} by user ${userId}`,
          );
          res.status(403).json({
            error:
              'This server is suspended. Please contact an administrator for assistance.',
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
            }, 120000);

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
            return;
          } catch (stopError: any) {
            if (
              stopError?.status === 404
            ) {
              logger.info(
                'Container already stopped or not found: ' + serverId,
              );

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
            await stopServerContainer(server, String(serverId), 'stop');
          } catch {
            // Container may already be stopped
          }

          try {
            await new Promise(resolve => setTimeout(resolve, 2000));
            await startServerContainer(server, String(serverId));
          } catch (error) {
            if (error instanceof Error && error.message === 'Docker image not found.') {
              res.status(400).json({ error: 'Docker image not found.' });
              return;
            }
            throw error;
          }

          logger.info('Container restarted successfully: ' + serverId);
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
          throw error;
        }
        logger.info('Container started successfully: ' + serverId);

        res.status(200).json({ message: 'Container started successfully.' });
        return;
      } catch (error) {
        logger.error('Failed to process power action', error, {
          serverId: String(serverId),
          action: String(powerAction),
        });
        res.status(500).json({ error: 'Failed to process power action.' });
      }
    },
  );

  router.post(
    '/server/:id/power/restart',
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

        await prisma.server.update({
          where: { UUID: getParamAsString(serverId) },
          data: {
            Installing: true,
            Queued: true,
          },
        });

        await daemonRequest({
          method: 'DELETE',
          path: '/container',
          nodeAddress: server.node.address,
          nodePort: server.node.port,
          nodeKey: server.node.key,
          body: {
            id: String(serverId),
          },
        });
        logger.info('Container deleted for reinstallation: ' + serverId);

        await new Promise((resolve) => setTimeout(resolve, 2000));

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

                const ports = JSON.parse(serverToReinstall.Ports);
                const primaryPort = ports.find((p: any) => p.primary);
                if (primaryPort) {
                  ServerEnv.push({
                    env: 'SERVER_PORT',
                    name: 'Primary Port',
                    value: primaryPort.Port.split(':')[0],
                    type: 'text',
                    default: primaryPort.Port.split(':')[0],
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
              (acc: { [key: string]: any }, curr: import('./shared').ServerVariable) => {
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
                  path: '/container/install',
                  nodeAddress: serverToReinstall.node.address,
                  nodePort: serverToReinstall.node.port,
                  nodeKey: serverToReinstall.node.key,
                  body: {
                    id: serverToReinstall.UUID,
                    image: reinstallDockerImage,
                    env: env,
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
              } catch (error: any) {
                logger.error(
                  `Error during reinstallation of server ${serverId}:`,
                  error,
                );
                if (error?.status) {
                  logger.error(`Response status: ${error.status}`);
                  logger.error('Response data:', error?.body);
                }
                await prisma.server.update({
                  where: { UUID: getParamAsString(serverId) },
                  data: { Queued: false },
                });
              }
            } else {
              await prisma.server.update({
                where: { UUID: getParamAsString(serverId) },
                data: { Queued: false },
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
                data: { Queued: false },
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
      } catch (error) {
        logger.error('Error reinstalling server:', error);
        res.status(500).json({ error: 'Failed to reinstall server' });
      }
    },
  );
}
