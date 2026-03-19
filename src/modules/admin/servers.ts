import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import axios from 'axios';
import { queueer } from '../../handlers/queueer';
import { Buffer } from 'buffer';
import { getParamAsString, getParamAsNumber } from "../../utils/typeHelpers";
import { daemonSchemeSync } from '../../handlers/utils/core/daemonRequest';


const adminModule: Module = {
  info: {
    name: 'Admin Module',
    description: 'This file is for admin functionality.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/admin/servers',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const servers = await prisma.server.findMany({
            include: {
              node: true,
              owner: true,
            },
          });
          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          res.render('admin/servers/servers', { user, req, settings, servers });
        } catch (error: unknown) {
          logger.error('Error fetching servers:', error);
          return res.redirect('/login');
        }
      },
    );

    router.get(
      '/admin/servers/edit/:id',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.redirect('/login');
            return;
          }

          const serverId = getParamAsNumber(req.params.id);
          if (isNaN(serverId)) {
            res.status(400).send('Invalid server ID');
            return;
          }

          const server = await prisma.server.findUnique({
            where: { id: serverId },
            include: {
              node: true,
              owner: true,
              image: true,
            },
          });

          if (!server) {
            res.status(404).send('Server not found');
            return;
          }

          const users = await prisma.users.findMany();
          const nodes = await prisma.node.findMany();
          const images = await prisma.images.findMany();
          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          res.render('admin/servers/edit', {
            user,
            req,
            settings,
            server,
            nodes,
            images,
            users,
          });
        } catch (error: unknown) {
          logger.error('Error fetching server for editing:', error);
          res.redirect('/admin/servers');
          return;
        }
      },
    );

    router.post(
      '/admin/servers/edit/:id',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
          }

          const serverId = getParamAsNumber(req.params.id);
          if (isNaN(serverId)) {
            res.status(400).json({ error: 'Invalid server ID' });
            return;
          }

          const server = await prisma.server.findUnique({
            where: { id: serverId },
            include: { node: true, image: true },
          });

          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const {
            name,
            description,
            nodeId,
            imageId,
            Memory,
            Cpu,
            Storage,
            ownerId,
            allowStartupEdit,
            Suspended,
            StartCommand,
          } = req.body;

          // Validate required fields
          if (!name || !nodeId || !imageId || !Memory || !Cpu || !Storage || !ownerId) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
          }

          // Check if suspension status is changing
          const currentSuspendedState = server.Suspended;
          const newSuspendedState = Suspended === 'true';
          const suspensionChanged = currentSuspendedState !== newSuspendedState;

          // Update server in database
          await prisma.server.update({
            where: { id: serverId },
            data: {
              name,
              description,
              ownerId: parseInt(ownerId),
              nodeId: parseInt(nodeId),
              imageId: parseInt(imageId),
              Memory: parseInt(Memory),
              Cpu: parseInt(Cpu),
              Storage: parseInt(Storage),
              StartCommand,
              Suspended: newSuspendedState,
            },
          });

          // Update allowStartupEdit field using raw SQL
          await prisma.$executeRaw`UPDATE "Server" SET "allowStartupEdit" = ${allowStartupEdit === 'true'} WHERE "id" = ${serverId}`;

          // If server is being suspended, stop it
          if (suspensionChanged && newSuspendedState) {
            try {
              logger.info(`Stopping server ${server.UUID} due to suspension`);

              const stopRequestData = {
                method: 'POST',
                url: `${daemonSchemeSync()}://${server.node.address}:${server.node.port}/container/stop`,
                auth: {
                  username: 'Airlink',
                  password: server.node.key,
                },
                headers: {
                  'Content-Type': 'application/json',
                },
                data: {
                  id: String(server.UUID),
                  stopCmd: server.image?.stop || 'stop',
                },
              };

              await axios(stopRequestData);
              logger.info(`Server ${server.UUID} stopped successfully due to suspension`);
            } catch (stopError) {
              logger.error(`Error stopping server ${server.UUID} during suspension:`, stopError);
              // Continue with the update even if stopping fails
            }
          }

          logger.info(`Server ${serverId} updated successfully`);
          res.status(200).json({ success: true });
        } catch (error: unknown) {
          logger.error('Error updating server:', error);
          res.status(500).json({ error: 'Failed to update server' });
          return;
        }
      },
    );

    router.get(
      '/admin/servers/create',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const users = await prisma.users.findMany();
          const nodes = await prisma.node.findMany();
          const images = await prisma.images.findMany();
          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          res.render('admin/servers/create', {
            user,
            req,
            settings,
            nodes,
            images,
            users,
          });
        } catch (error: unknown) {
          logger.error('Error fetching data for server creation:', error);
          return res.redirect('/login');
        }
      },
    );

    router.post(
      '/admin/servers/create',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        const {
          name,
          description,
          nodeId,
          imageId,
          Ports,
          Memory,
          Cpu,
          Storage,
          dockerImage,
          variables,
          ownerId,
          allowStartupEdit,
        } = req.body;

        const userId = +ownerId;
        if (
          !name ||
          !description ||
          !nodeId ||
          !imageId ||
          !Ports ||
          !Memory ||
          !Cpu ||
          !Storage ||
          !userId
        ) {
          res.status(400).send('Missing required fields');
          return;
        }

        // Validate that the selected port is allocated to the node and not already in use
        try {
          const node = await prisma.node.findUnique({
            where: { id: parseInt(nodeId) }
          });

          if (!node) {
            res.status(400).send('Selected node not found');
            return;
          }

          // Extract the port number from the port string (e.g., "25565:25565" -> 25565)
          const portNumber = parseInt(Ports.split(':')[0]);

          // Check if the port is allocated to the node
          let allocatedPorts = [];
          try {
            if (node.allocatedPorts) {
              allocatedPorts = JSON.parse(node.allocatedPorts);
            }
          } catch (error) {
            logger.error('Error parsing allocated ports:', error);
            res.status(500).send('Error validating port allocation');
            return;
          }

          if (!allocatedPorts.includes(portNumber)) {
            res.status(400).send(`Port ${portNumber} is not allocated to the selected node`);
            return;
          }

          // Check if the port is already in use by another server on this node
          const existingServers = await prisma.server.findMany({
            where: {
              nodeId: parseInt(nodeId)
            }
          });

          // Check each server's ports to see if our port is already in use
          for (const server of existingServers) {
            try {
              const serverPorts = JSON.parse(server.Ports);
              for (const portInfo of serverPorts) {
                const usedPort = parseInt(portInfo.Port.split(':')[0]);
                if (usedPort === portNumber) {
                  res.status(400).send(`Port ${portNumber} is already in use by server "${server.name}"`);
                  return;
                }
              }
            } catch (error) {
              logger.error(`Error parsing ports for server ${server.id}:`, error);
              // Continue checking other servers even if one has invalid port data
            }
          }
        } catch (error) {
          logger.error('Error validating port allocation:', error);
          res.status(500).send('Error validating port allocation');
          return;
        }

        const Port = `[{"Port": "${Ports}", "primary": true}]`;

        try {
          const dockerImages = await prisma.images
            .findUnique({
              where: {
                id: parseInt(imageId),
              },
            })
            .then((image: any) => {
              if (!image) {
                return null;
              }
              return image.dockerImages;
            });

          if (!dockerImages) {
            res.status(400).send('Docker image not found');
            return;
          }

          const imagesDocker = JSON.parse(dockerImages);

          type ImageDocker = { [key: string]: string };

          const imageDocker: ImageDocker | undefined = imagesDocker.find(
            (image: ImageDocker) => Object.keys(image).includes(dockerImage),
          );

          if (!imageDocker) {
            res.status(400).send('Docker image not found');
            return;
          }

          const image = await prisma.images.findUnique({
            where: {
              id: parseInt(imageId),
            },
          });

          if (!image) {
            res.status(400).send('Image not found');
            return;
          }

          const StartCommand = image.startup;

          if (!StartCommand) {
            res.status(400).send('Image startup command not found');
            return;
          }

          // Merge submitted variable values into the egg variable definitions
          let imageVariables: Record<string, unknown>[] = [];
          try { imageVariables = JSON.parse(image.variables || '[]'); } catch { /* keep empty */ }

          const submittedVars = Array.isArray(variables) ? variables : [];
          const mergedVariables = imageVariables.map((imgVar: Record<string, unknown>) => {
            const envKey = String(imgVar.env_variable ?? imgVar.env ?? '');
            const submitted = submittedVars.find(
              (sv: Record<string, unknown>) => String(sv.env_variable ?? sv.env ?? '') === envKey,
            );
            return { ...imgVar, value: submitted?.value ?? imgVar.default_value ?? '' };
          });

          // Create server
          const createdServer = await prisma.server.create({
            data: {
              name,
              description,
              ownerId: userId,
              nodeId: parseInt(nodeId),
              imageId: parseInt(imageId),
              Ports: Port || '[{"Port": "25565:25565", "primary": true}]',
              Memory: (parseInt(Memory) || 1024),
              Cpu: parseInt(Cpu) || 2,
              Storage: parseInt(Storage) || 20,
              Variables: JSON.stringify(mergedVariables),
              StartCommand,
              dockerImage: JSON.stringify(imageDocker),
            },
          });

          // Update allowStartupEdit field using raw SQL
          await prisma.$executeRaw`UPDATE "Server" SET "allowStartupEdit" = ${allowStartupEdit === 'true'} WHERE "id" = ${createdServer.id}`;

          queueer.addTask(async () => {
            const servers = await prisma.server.findMany({
              where: {
                Queued: true,
              },
              include: {
                image: true,
                node: true,
              },
            });

            for (const server of servers) {
              if (!server.Variables) {
                await prisma.server.update({
                  where: { id: server.id },
                  data: { Queued: false },
                });
                continue;
              }

              let ServerEnv;
              try {
                ServerEnv = JSON.parse(server.Variables);

                // Normalize variable shape — Pterodactyl uses env_variable, legacy uses env
                ServerEnv = ServerEnv.map((v: Record<string, unknown>) => ({
                  env: String(v.env_variable ?? v.env ?? ''),
                  value: v.value ?? v.default_value ?? '',
                }));

                ServerEnv.push({
                  env: 'SERVER_PORT',
                  value: Ports.split(':')[0],
                });
                ServerEnv.push({
                  env: 'SERVER_MEMORY',
                  value: String(server.Memory),
                });
                ServerEnv.push({
                  env: 'SERVER_CPU',
                  value: String(server.Cpu),
                });
              } catch (error: unknown) {
                logger.error(`Error parsing Variables for server ID ${server.id}:`, error);
                await prisma.server.update({
                  where: { id: server.id },
                  data: { Queued: false },
                });
                continue;
              }

              if (!Array.isArray(ServerEnv)) {
                logger.error(`ServerEnv is not an array for server ID ${server.id}. Skipping...`);
                await prisma.server.update({
                  where: { id: server.id },
                  data: { Queued: false },
                });
                continue;
              }

              const env = ServerEnv.reduce(
                (
                  acc: { [key: string]: any },
                  curr: { env: string; value: any },
                ) => {
                  acc[curr.env] = curr.value;
                  return acc;
                },
                {},
              );

              const authHeader = `Basic ${Buffer.from(`Airlink:${server.node.key}`).toString('base64')}`;
              const daemonUrl = `${daemonSchemeSync()}://${server.node.address}:${server.node.port}`;

              if (server.image?.scripts) {
                let scripts: Record<string, unknown> = {};
                try {
                  scripts = JSON.parse(server.image.scripts);
                } catch (error: unknown) {
                  logger.error(`Error parsing scripts for server ID ${server.id}:`, error);
                  await prisma.server.update({ where: { id: server.id }, data: { Queued: false } });
                  continue;
                }

                try {
                  // Pterodactyl egg format: scripts.installation has script, container, entrypoint
                  if (scripts.installation && typeof scripts.installation === 'object') {
                    const installation = scripts.installation as {
                      script: string;
                      container: string;
                      entrypoint: string;
                    };

                    await axios.post(
                      `${daemonUrl}/container/installer`,
                      {
                        id: server.UUID,
                        script: installation.script,
                        container: installation.container,
                        entrypoint: installation.entrypoint || 'bash',
                        env,
                      },
                      { headers: { 'Content-Type': 'application/json', Authorization: authHeader }, timeout: 600000 },
                    );

                  // Legacy ALC format: scripts.install is an array of file downloads
                  } else if (Array.isArray(scripts.install)) {
                    // Resolve the docker image so the daemon pulls it during
                    // install rather than on the first Start click.
                    let dockerImageValue: string | undefined;
                    try {
                      const parsed = JSON.parse(server.dockerImage || '{}');
                      dockerImageValue = Object.values(parsed)[0] as string | undefined;
                    } catch { /* leave undefined */ }

                    await axios.post(
                      `${daemonUrl}/container/install`,
                      {
                        id: server.UUID,
                        image: dockerImageValue,
                        env,
                        scripts: (scripts.install as any[]).map((s: any) => ({
                          url: s.url,
                          onStartup: s.onStart,
                          ALVKT: s.ALVKT,
                          fileName: s.fileName,
                        })),
                      },
                      { headers: { 'Content-Type': 'application/json', Authorization: authHeader } },
                    );

                    if (scripts.native && typeof scripts.native === 'object') {
                      const native = scripts.native as { CMD: string; container: string };
                      await axios.post(
                        `${daemonUrl}/container/installer`,
                        { id: server.UUID, env, script: native.CMD, container: native.container, entrypoint: 'bash' },
                        { headers: { 'Content-Type': 'application/json', Authorization: authHeader }, timeout: 600000 },
                      );
                    }
                  } else {
                    logger.info(`No install scripts for server ${server.id}, marking as installed`);
                  }

                  await prisma.server.update({ where: { id: server.id }, data: { Queued: false } });
                } catch (error: unknown) {
                  logger.error(`Error sending install request for server ID ${server.id}:`, error);
                  await prisma.server.update({ where: { id: server.id }, data: { Queued: false } });
                }
              } else {
                logger.warn(`No scripts found for server ID ${server.id}, marking as installed`);
                await prisma.server.update({ where: { id: server.id }, data: { Queued: false } });
              }
            }
          });

          res.status(200).send('Server created successfully');
        } catch (error: unknown) {
          logger.error('Error creating server:', error);
          res.status(500).send('Error creating server');
        }
      },
    );

    router.get(
      '/admin/server/delete/:id',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        const { id } = req.params;

        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.redirect('/login');
            return;
          }

          const serverId = getParamAsNumber(id);
          if (isNaN(serverId)) {
            res.status(400).send('Invalid server ID');
            return;
          }

          const server = await prisma.server.findUnique({
            where: { id: serverId },
            include: { node: true, image: true, owner: true },
          });

          if (!server) {
            res.status(404).send('Server not found');
            return;
          }

          try {
            logger.info(`Deleting container ${server.UUID} on node ${server.node.address}:${server.node.port}`);

            try {
              const response = await axios.delete(
                `${daemonSchemeSync()}://${server.node.address}:${server.node.port}/container`,
                {
                  auth: {
                    username: 'Airlink',
                    password: server.node.key,
                  },
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  data: {
                    id: server.UUID,
                    deleteCmd: 'delete',
                  },
                },
              );

              if (response.status !== 200) {
                throw new Error(`Daemon returned status ${response.status}: ${JSON.stringify(response.data)}`);
              }

              logger.info(`Successfully deleted container ${server.UUID} on daemon`);
            } catch (error: unknown) {
              logger.error(`Error deleting container on daemon:`, error);

              const daemonError = error as any;
              const isNotFoundError =
                daemonError.response &&
                (daemonError.response.status === 404 ||
                 (daemonError.response.data && daemonError.response.data.error &&
                  typeof daemonError.response.data.error === 'string' &&
                  daemonError.response.data.error.includes('not exist')));

              if (!isNotFoundError) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                throw new Error(`Failed to delete container on daemon: ${errorMessage}`);
              } else {
                logger.warn(`Container ${server.UUID} not found on daemon, proceeding with database cleanup`);
              }
            }

            logger.info(`Deleting server ${serverId} from database`);
            await prisma.server.delete({ where: { id: serverId } });

            logger.info(`Server ${serverId} successfully deleted`);
            res.redirect('/admin/servers');
            return;
          } catch (error: unknown) {
            logger.error('Error deleting server:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            res.status(500).send(`Failed to delete server: ${errorMessage}`);
            return;
          }
        } catch (error: unknown) {
          logger.error('Error in delete server route:', error);
          res.status(500).send('Error deleting server');
          return;
        }
      },
    );

    return router;
  },
};


export default adminModule;
