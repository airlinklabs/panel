import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import axios from 'axios';
import { ServerManager } from '../../handlers/utils/core/serverManager';
import QueueHandler from '../../handlers/utils/core/queueer';

const queueer = new QueueHandler();

const prisma = new PrismaClient();

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
        async (req: Request, res: Response): Promise<void> => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
            if (!user) {
            res.redirect('/login');
            return;
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
        } catch (error) {
            logger.error('Error fetching servers:', error);
            res.redirect('/login');
        }
      },
    );

    router.get(
      '/admin/servers/create',
      isAuthenticated(true),
        async (req: Request, res: Response): Promise<void> => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
            if (!user) {
            res.redirect('/login');
            return;
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
        } catch (error) {
            logger.error('Error fetching data for server creation:', error);
            res.redirect('/login');
        }
      },
    );

    router.post(
      '/admin/servers/create',
      isAuthenticated(true),
        async (req: Request, res: Response): Promise<void> => {
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
            res.status(400).json({ error: 'Missing required fields' });
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
            .then((image) => {
              if (!image) {
                return null;
              }
              return image.dockerImages;
            });

          if (!dockerImages) {
            res.status(400).json({ error: 'Docker image not found' });
            return;
          }

          const imagesDocker = JSON.parse(dockerImages);

          type ImageDocker = { [key: string]: string };

          const imageDocker: ImageDocker | undefined = imagesDocker.find(
            (image: ImageDocker) => Object.keys(image).includes(dockerImage),
          );

          if (!imageDocker) {
            res.status(400).json({ error: 'Docker image not found' });
            return;
          }

          const image = await prisma.images.findUnique({
            where: {
              id: parseInt(imageId),
            },
          });

          if (!image) {
            res.status(400).json({ error: 'Image not found' });
            return;
          }

          const StartCommand = image.startup;

          if (!StartCommand) {
            res.status(400).json({ error: 'Image startup command not found' });
            return;
          }

          await prisma.server.create({
            data: {
              name,
              description,
              ownerId: userId,
              nodeId: parseInt(nodeId),
              imageId: parseInt(imageId),
              Ports: Port || '[{"Port": "25565:25565", "primary": true}]',
              Memory: parseInt(Memory) || 4,
              Cpu: parseInt(Cpu) || 2,
              Storage: parseInt(Storage) || 20,
              Variables: JSON.stringify(variables) || '[]',
              StartCommand,
              dockerImage: JSON.stringify(imageDocker),
            },
          });

          queueer.addTask(async () => {
            const servers = await prisma.server.findMany({
              where: {
                Installing: true,
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
                  data: { Installing: false },
                });
                continue;
              }

              let ServerEnv;
              try {
                ServerEnv = JSON.parse(server.Variables);
              } catch (error) {
                console.error(
                  `Error parsing Variables for server ID ${server.id}:`,
                  error,
                );
                await prisma.server.update({
                  where: { id: server.id },
                  data: { Installing: false },
                });
                continue;
              }

              if (!Array.isArray(ServerEnv)) {
                console.error(
                  `ServerEnv is not an array for server ID ${server.id}. Skipping...`,
                );
                await prisma.server.update({
                  where: { id: server.id },
                  data: { Installing: false },
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

              console.log(env);

              if (server.image?.scripts) {
                let scripts;
                try {
                  scripts = JSON.parse(server.image.scripts);
                } catch (error) {
                  console.error(
                    `Error parsing scripts for server ID ${server.id}:`,
                    error,
                  );
                  await prisma.server.update({
                    where: { id: server.id },
                    data: { Installing: false },
                  });
                  continue;
                }

                const requestBody = {
                  id: server.UUID,
                  env: env,
                  scripts: scripts.install.map(
                    (script: { url: string; fileName: string }) => ({
                      url: script.url,
                      fileName: script.fileName,
                    }),
                  ),
                };

                console.log(requestBody);

                try {
                  await axios.post(
                    `http://${server.node.address}:${server.node.port}/container/install`,
                    requestBody,
                    {
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Basic ${Buffer.from(`Airlink:${server.node.key}`).toString('base64')}`,
                      },
                    },
                  );

                  await prisma.server.update({
                    where: { id: server.id },
                    data: { Installing: false },
                  });
                } catch (error) {
                  console.error(
                    `Error sending install request for server ID ${server.id}:`,
                    error,
                  );
                }
              } else {
                console.warn(
                  `No scripts found for server ID ${server.id}. Skipping...`,
                );
              }
            }
          }, 0);

            res.status(200).json({ success: true, message: 'Server created successfully' });
        } catch (error) {
          logger.error('Error creating server:', error);
            res.status(500).json({ error: 'Error creating server' });
        }
      },
    );

    router.get(
      '/admin/servers/edit/:id',
      isAuthenticated(true),
        async (req: Request, res: Response): Promise<void> => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
          res.redirect('/login');
          return;
          }

          const serverId = parseInt(req.params.id);
          if (isNaN(serverId)) {
          res.status(400).json({ error: 'Invalid server ID' });
          return;
          }

          const server = await prisma.server.findUnique({
          where: { id: serverId },
          include: { node: true, image: true, owner: true },
          });

          if (!server) {
          res.status(404).json({ error: 'Server not found' });
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
      } catch (error) {
        logger.error('Error fetching server for edit:', error);
        res.redirect('/admin/servers');
        return;
      }
      }
    );

    router.put(
      '/admin/servers/edit/:id',
      isAuthenticated(true),
        async (req: Request, res: Response): Promise<void> => {
        try {
        const serverId = parseInt(req.params.id);
        if (isNaN(serverId)) {
          res.status(400).json({ error: 'Invalid server ID' });
          return;
        }

        const {
        name,
        description,
        nodeId,
        Memory,
        Cpu,
        Storage,
        ownerId,
        } = req.body;

        if (!name || !description || !nodeId || !Memory || !Cpu || !Storage || !ownerId) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
        }

        await ServerManager.updateServer(serverId, {
        name,
        description,
        nodeId: parseInt(nodeId),
        Memory: parseInt(Memory),
        Cpu: parseInt(Cpu),
        Storage: parseInt(Storage),
        ownerId: parseInt(ownerId),
        });

        res.status(200).json({ success: true, message: 'Server updated successfully' });
      } catch (error) {
        logger.error('Error updating server:', error);
        res.status(500).json({ error: 'Error updating server' });
      }
      }

    );

    router.delete(
      '/admin/servers/delete/:id',
      isAuthenticated(true),
        async (req: Request, res: Response): Promise<void> => {
        try {
        const userId = req.session?.user?.id;
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.redirect('/login');
          return;
        }

        const serverId = parseInt(req.params.id);
        if (isNaN(serverId)) {
          res.status(400).json({ error: 'Invalid server ID' });
          return;
        }

        const server = await ServerManager.getServerWithDetails(serverId);
        if (!server) {
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        await ServerManager.deleteServer(
        serverId,
        server.node.address,
        server.node.port,
        server.node.key
        );

        res.status(200).json({ success: true, message: 'Server deleted successfully' });
      } catch (error) {
        logger.error('Error in delete server route:', error);
        res.status(500).json({ error: 'Error deleting server' });
      }
      },

    );

    return router;
  },
};

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit();
});

export default adminModule;
