import type { Router, Request, Response } from 'express';
import {
  isAuthenticatedForServer,
  requireSubUserPermission,
} from '../../../handlers/utils/auth/serverAuthUtil';
import logger from '../../../handlers/logger';
import { getParamAsString } from '../../../utils/typeHelpers';
import prisma from '../../../db';
import { daemonRequest } from '../../../handlers/utils/core/daemonRequest';
import { logActivity } from '../../../handlers/utils/activity/activityLogger';
import { getPrimaryExternalPort } from '../../../handlers/utils/server/ports';
import type { ServerVariable } from './shared';

export function registerReinstallRoutes(router: Router): void {
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

            let ServerEnv: ServerVariable[] = [];
            if (serverToReinstall.Variables) {
              try {
                ServerEnv = JSON.parse(
                  serverToReinstall.Variables,
                ) as ServerVariable[];

                const primaryPort = getPrimaryExternalPort(
                  serverToReinstall.Ports,
                );
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
              (
                acc: Record<string, string | number | boolean>,
                curr: ServerVariable,
              ) => {
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
                  const parsed = JSON.parse(
                    serverToReinstall.dockerImage || '{}',
                  );
                  reinstallDockerImage = Object.values(parsed)[0] as
                    string | undefined;
                } catch {
                  /* leave undefined */
                }

                const installResponse = await daemonRequest<{
                  status?: number;
                }>({
                  method: 'POST',
                  path: '/container/reinstall',
                  nodeAddress: serverToReinstall.node.address,
                  nodePort: serverToReinstall.node.port,
                  nodeKey: serverToReinstall.node.key,
                  body: {
                    id: serverToReinstall.UUID,
                    image: reinstallDockerImage,
                    env,
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
                const err =
                  error && typeof error === 'object'
                    ? (error as Record<string, unknown>)
                    : {};
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
        logActivity(req, 'server:reinstall', {
          serverId: String(serverId),
        }).catch(() => {
          /* noop */
        });
      } catch (error) {
        logger.error('Error reinstalling server:', error);
        res.status(500).json({ error: 'Failed to reinstall server' });
      }
    },
  );
}
