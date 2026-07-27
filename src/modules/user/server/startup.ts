import { Router, Request, Response } from 'express';
import { isAuthenticatedForServer } from '../../../handlers/utils/auth/serverAuthUtil';
import logger from '../../../handlers/logger';
import { checkForServerInstallation } from '../../../handlers/checkForServerInstallation';
import { getServerStatus } from '../../../handlers/utils/server/serverStatus';
import { getParamAsString } from '../../../utils/typeHelpers';
import prisma from '../../../db';
import { daemonRequest } from '../../../handlers/utils/core/daemonRequest';
import {
  type ErrorMessage,
  type ServerVariable,
  loadServerPageContext,
  getServerStatusInput,
  getImageFeatures,
  restartServerContainer,
} from './shared';

export function registerStartupRoutes(router: Router): void {
  router.get(
    '/server/:id/startup',
    isAuthenticatedForServer('id'),
    async (req: Request, res: Response) => {
      const errorMessage: ErrorMessage = {};
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const settings = await prisma.settings.findUnique({ where: { id: 1 } });
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
          return res.render('user/server/startup', {
            errorMessage,
            user,
            req,
            settings,
          });
        }

        const features = getImageFeatures(server.image);

        let serverVariables: ServerVariable[] = [];
        if (server.Variables) {
          try {
            serverVariables = JSON.parse(
              server.Variables,
            ) as ServerVariable[];
          } catch (error) {
            logger.error('Error parsing server variables:', error);
          }
        } else {
          logger.info(`No variables found for server ${serverId}`);
        }
        const serverStatus = await getServerStatus(getServerStatusInput(server));

        return res.render('user/server/startup', {
          errorMessage,
          features,
          installed: await checkForServerInstallation(getParamAsString(serverId)),
          user,
          req,
          server,
          serverStatus,
          serverVariables,
          settings,
        });
      } catch (error) {
        logger.error('Error fetching server startup data:', error);
        errorMessage.message = 'Error fetching server data.';
        return res.render('user/server/startup', {
          errorMessage,
          user: req.session?.user,
          req,
          settings,
        });
      }
    },
  );

  router.post(
    '/server/:id/startup/command',
    isAuthenticatedForServer('id'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      let startCommand;
      const contentType = req.headers['content-type'] || '';

      if (contentType.includes('application/json')) {
        startCommand = req.body.startCommand;
      } else {
        startCommand = req.body.startCommand;
        logger.info(
          `Processing form data for startup command: ${startCommand}`,
        );
      }

      logger.info(
        `Updating startup command for server ${serverId}: ${startCommand}`,
      );

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          logger.warn(`User not found: ${userId}`);
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { UUID: getParamAsString(serverId) },
          include: { node: true, image: true },
        });

        if (!server) {
          logger.warn(`Server not found: ${serverId}`);
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        const allowStartupEdit =
          await prisma.$queryRaw`SELECT "allowStartupEdit" FROM "Server" WHERE "UUID" = ${serverId}`;
        const isEditAllowed =
          allowStartupEdit &&
          Array.isArray(allowStartupEdit) &&
          allowStartupEdit.length > 0 &&
          allowStartupEdit[0].allowStartupEdit === true;

        if (!isEditAllowed) {
          logger.warn(
            `Startup command editing not allowed for server ${serverId}`,
          );
          const acceptsJson =
            req.headers.accept?.includes('application/json');
          if (acceptsJson) {
            res.status(403).json({
              error: 'Startup command editing not allowed for this server',
            });
          } else {
            res.redirect(
              `/server/${serverId}/startup?error=true&message=Startup+command+editing+not+allowed+for+this+server`,
            );
          }
          return;
        }

        await prisma.server.update({
          where: { UUID: getParamAsString(serverId) },
          data: { StartCommand: startCommand },
        });
        logger.info(
          `Startup command updated in database for server ${serverId}`,
        );
        try {
          const statusResponse = await daemonRequest<{ running?: boolean }>({
            method: 'GET',
            path: '/container/status',
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            nodeKey: server.node.key,
            params: { id: getParamAsString(serverId) },
          });
          const isRunning = statusResponse.data?.running === true;

          if (isRunning) {
            if (!server.dockerImage) {
              res.status(400).json({ error: 'Docker image not found.' });
              return;
            }

            await restartServerContainer(server, String(serverId), {
              startCommand,
            });
            logger.info(
              'Container restarted with new startup command: ' + serverId,
            );
          }
        } catch (statusError) {
          logger.warn(
            `Could not check server status or restart server: ${statusError}`,
          );
        }

        logger.info(
          `Successfully updated startup command for server ${serverId}`,
        );
        const acceptsJson = req.headers.accept?.includes('application/json');
        if (acceptsJson) {
          res.status(200).json({ success: true });
        } else {
          res.redirect(
            `/server/${serverId}/startup?success=true&message=Startup+command+updated+successfully`,
          );
        }
      } catch (error) {
        logger.error(
          `Error updating startup command for server ${serverId}:`,
          error,
        );
        const acceptsJson = req.headers.accept?.includes('application/json');
        if (acceptsJson) {
          res.status(500).json({ error: 'Failed to update startup command' });
        } else {
          res.redirect(
            `/server/${serverId}/startup?error=true&message=Failed+to+update+startup+command`,
          );
        }
      }
    },
  );

  router.post(
    '/server/:id/startup/docker-image',
    isAuthenticatedForServer('id'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const dockerImage = req.body.dockerImage;

      logger.info(
        `Updating Docker image for server ${serverId} to ${dockerImage}`,
      );

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          logger.warn(`User not found: ${userId}`);
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { UUID: getParamAsString(serverId) },
          include: { node: true, image: true },
        });

        if (!server) {
          logger.warn(`Server not found: ${serverId}`);
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        let availableDockerImages: string[] = [];
        let validImage = false;

        try {
          if (server.image && server.image.dockerImages) {
            const dockerImagesArray = JSON.parse(server.image.dockerImages);
            dockerImagesArray.forEach((imageObj: Record<string, string>) => {
              Object.keys(imageObj).forEach((key) => {
                availableDockerImages.push(key);
                if (key === dockerImage) {
                  validImage = true;
                }
              });
            });
          }
        } catch (e) {
          logger.error(
            `Error parsing Docker images for server ${serverId}:`,
            e,
          );
          availableDockerImages = [];
        }

        if (!validImage) {
          logger.warn(
            `Invalid Docker image selected for server ${serverId}: ${dockerImage}`,
          );
          const acceptsJson =
            req.headers.accept?.includes('application/json');
          if (acceptsJson) {
            res.status(400).json({ error: 'Invalid Docker image selected' });
          } else {
            res.redirect(
              `/server/${serverId}/startup?error=true&message=Invalid+Docker+image+selected`,
            );
          }
          return;
        }

        let dockerImageObj = {};
        try {
          if (server.image && server.image.dockerImages) {
            const dockerImagesArray = JSON.parse(server.image.dockerImages);
            for (const imageObj of dockerImagesArray) {
              if (Object.keys(imageObj).includes(dockerImage)) {
                dockerImageObj = { [dockerImage]: imageObj[dockerImage] };
                break;
              }
            }
          }
        } catch (e) {
          logger.error(
            `Error finding Docker image object for server ${serverId}:`,
            e,
          );
        }

        await prisma.server.update({
          where: { UUID: getParamAsString(serverId) },
          data: { dockerImage: JSON.stringify(dockerImageObj) },
        });

        logger.info(
          `Docker image updated in database for server ${serverId}`,
        );

        try {
          const statusResponse = await daemonRequest<{ running?: boolean }>({
            method: 'GET',
            path: '/container/status',
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            nodeKey: server.node.key,
            params: { id: getParamAsString(serverId) },
          });
          const isRunning = statusResponse.data?.running === true;

          if (isRunning) {
            await restartServerContainer(server, String(serverId), {
              dockerImage,
            });
            logger.info(
              'Container restarted with new Docker image: ' + serverId,
            );
          }
        } catch (statusError) {
          logger.warn(
            `Could not check server status or restart server: ${statusError}`,
          );
        }

        logger.info(
          `Successfully updated Docker image for server ${serverId}`,
        );

        const acceptsJson = req.headers.accept?.includes('application/json');
        if (acceptsJson) {
          res.status(200).json({ success: true });
        } else {
          res.redirect(
            `/server/${serverId}/startup?success=true&message=Docker+image+updated+successfully`,
          );
        }
      } catch (error) {
        logger.error(
          `Error updating Docker image for server ${serverId}:`,
          error,
        );

        const acceptsJson = req.headers.accept?.includes('application/json');
        if (acceptsJson) {
          res.status(500).json({ error: 'Failed to update Docker image' });
        } else {
          res.redirect(
            `/server/${serverId}/startup?error=true&message=Failed+to+update+Docker+image`,
          );
        }
      }
    },
  );

  router.post(
    '/server/:id/startup/variables',
    isAuthenticatedForServer('id'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const contentType = req.headers['content-type'] || '';
      let variables: ServerVariable[];

      if (contentType.includes('application/json')) {
        variables = req.body.variables || [];
      } else {
        logger.info(`Processing form data: ${JSON.stringify(req.body)}`);

        const server = await prisma.server.findUnique({
          where: { UUID: getParamAsString(serverId) },
          include: { image: true },
        });

        if (!server) {
          logger.warn(`Server not found: ${serverId}`);
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        let serverVariables: ServerVariable[] = [];

        if (server.Variables) {
          try {
            serverVariables = JSON.parse(server.Variables);
          } catch (error) {
            logger.error('Error parsing server variables:', error);
          }
        }

        variables = serverVariables.map((variable: ServerVariable) => {
          const formKey = `var_${variable.env}`;
          let value = req.body[formKey];

          if (variable.type === 'boolean') {
            value = value ? 1 : 0;
          } else if (variable.type === 'number') {
            const numValue = parseInt(value);
            if (isNaN(numValue) || value === '' || value === undefined) {
              value =
                variable.value !== undefined &&
                variable.value !== null &&
                variable.value !== ''
                  ? variable.value
                  : variable.default || 0;
            } else {
              value = numValue;
            }
          } else if (variable.type === 'text') {
            if (value === '' || value === undefined) {
              value =
                variable.value !== undefined &&
                variable.value !== null &&
                variable.value !== ''
                  ? variable.value
                  : variable.default || '';
            }
          }

          return {
            ...variable,
            value: value,
          };
        });
      }

      logger.info(
        `Updating variables for server ${serverId}: ${JSON.stringify(variables)}`,
      );

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          logger.warn(`User not found: ${userId}`);
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { UUID: getParamAsString(serverId) },
          include: { node: true, image: true },
        });

        if (!server) {
          logger.warn(`Server not found: ${serverId}`);
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        await prisma.server.update({
          where: { UUID: getParamAsString(serverId) },
          data: { Variables: JSON.stringify(variables) },
        });
        logger.info(`Variables updated in database for server ${serverId}`);

        try {
          const statusResponse = await daemonRequest<{ running?: boolean }>({
            method: 'GET',
            path: '/container/status',
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            nodeKey: server.node.key,
            params: { id: getParamAsString(serverId) },
          });
          const isRunning = statusResponse.data?.running === true;

          if (isRunning) {
            if (!server.dockerImage) {
              logger.error(
                `Docker image not found for server ${serverId}`,
                new Error('Docker image not found'),
              );
              res.status(400).json({ error: 'Docker image not found.' });
              return;
            }

            await restartServerContainer(server, String(serverId), {
              variables,
            });
            logger.info(
              'Container restarted with new variables: ' + serverId,
            );
          }
        } catch (statusError) {
          logger.warn(
            `Could not check server status or restart server: ${statusError}`,
          );
        }

        logger.info(`Successfully updated variables for server ${serverId}`);

        const acceptsJson = req.headers.accept?.includes('application/json');
        if (acceptsJson) {
          res.status(200).json({ success: true });
        } else {
          res.redirect(
            `/server/${serverId}/startup?success=true&message=Server+variables+updated+successfully`,
          );
        }
      } catch (error) {
        logger.error(
          `Error updating variables for server ${serverId}:`,
          error,
        );
        const acceptsJson = req.headers.accept?.includes('application/json');
        if (acceptsJson) {
          res
            .status(500)
            .json({ error: 'Failed to update server variables' });
        } else {
          res.redirect(
            `/server/${serverId}/startup?error=true&message=Failed+to+update+server+variables`,
          );
        }
      }
    },
  );
}
