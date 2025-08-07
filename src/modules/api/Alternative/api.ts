import { Router, Request, Response, NextFunction } from 'express';
import { Module } from '../../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import logger from '../../../handlers/logger';
import axios from 'axios';
import QueueHandler from '../../../handlers/utils/core/queueer';
import bcrypt from 'bcrypt';
import { Buffer } from 'buffer';

const queueer = new QueueHandler();

const prisma = new PrismaClient();

const coreModule: Module = {
  info: {
    name: 'Core Module',
    description: 'This file is for all core functionality.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    let validKeys: string[] = [];

    async function loadApiKeys() {
      try {
        const keys = await prisma.apiKey.findMany();
        validKeys = keys.map((key: any) => key.key);
      } catch (error) {
        console.error('Error loading API keys:', error);
      }
    }

    async function validator(req: Request, res: Response, next: NextFunction) {
      await loadApiKeys();

      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          error: 'Unauthorized: Missing or malformed Authorization header',
        });
        return;
      }

      const apiKey = authHeader.split(' ')[1];

      if (validKeys.includes(apiKey)) {
        next();
      } else {
        console.error('Invalid API key:', apiKey);
        res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
      }
    }

    const router = Router();

    router.get(
      '/api/application/users',
      validator,
      async (req: Request, res: Response) => {
        try {
          const filter =
            typeof req.query.filter === 'string'
              ? JSON.parse(req.query.filter)
              : req.query.filter;

          const include = req.query.include;
          const users = await prisma.users.findMany({
            where: filter || {},
          });

          let serverData = null;
          if (include && include === 'servers') {
            serverData = await prisma.server.findMany({
              where: { ownerId: { in: users.map((user: any) => user.id) } },
              include: { node: true, owner: true },
            });
          }

          const response = users.map((user: any) => {
            const userData: any = {
              object: 'user',
              attributes: {
                id: user.id,
                username: user.username,
                email: user.email,
                root_admin: user.isAdmin,
              },
              relationships: {
                servers: [],
              },
            };

            if (include && include === 'servers' && serverData) {
              userData.relationships.servers = serverData
                .filter((server: any) => server.ownerId === user.id)
                .map((server: any) => ({
                  object: 'server',
                  attributes: {
                    id: server.id,
                    name: server.name,
                    node: server.node,
                  },
                }));
            }

            return userData;
          });

          res.json({
            object: 'list',
            data: response,
            meta: {
              pagination: {
                total: users.length,
                count: users.length,
                per_page: 50,
                current_page: 1,
                total_pages: 1,
                links: {},
              },
            },
          });
        } catch (error) {
          console.error('Error fetching users:', error);
          res.status(500).json({ error: 'Internal Server Error' });
        }
      },
    );

    router.get(
      '/api/application/users/:user',
      validator,
      async (req: Request, res: Response) => {
        try {
          const userId = req.params.user;
          const filter =
            typeof req.query.filter === 'string'
              ? JSON.parse(req.query.filter)
              : req.query.filter;
          const include = req.query.include;

          let user;

          if (userId) {
            user = await prisma.users.findUnique({
              where: { id: parseInt(userId) },
            });
          } else if (filter?.email) {
            user = await prisma.users.findUnique({
              where: { email: filter.email },
            });
          }

          if (!user) {
            res.status(404).json({ error: 'Not Found' });
            return;
          }

          const userResponse = {
            object: 'user',
            attributes: {
              id: user.id,
              username: user.username,
              email: user.email,
              root_admin: user.isAdmin || false,
              relationships: {
                servers: {
                  object: 'null_resource',
                  attributes: {},
                  data: {},
                },
              },
            },
          };

          if (include === 'servers') {
            const servers = await prisma.server.findMany({
              where: { ownerId: user.id },
              include: { node: true, owner: true },
            });

            const formattedServers = servers.map((server: any) => ({
              attributes: {
                id: server.id,
                UUID: server.UUID,
                name: server.name,
                description: server.description,
                createdAt: server.createdAt,
                ports: JSON.parse(server.Ports || '[]'),
                limits: {
                  memory: server.Memory,
                  disk: server.Storage,
                  cpu: server.Cpu,
                },
                variables: JSON.parse(server.Variables || '[]'),
                startCommand: server.StartCommand,
                dockerImage: JSON.parse(server.dockerImage || '{}'),
                installing: server.Installing,
                suspended: server.Suspended,
              },
              relationships: {
                node: {
                  attributes: {
                    id: server.node.id,
                    name: server.node.name,
                    ram: server.node.ram,
                    cpu: server.node.cpu,
                    disk: server.node.disk,
                    address: server.node.address,
                    port: server.node.port,
                    key: server.node.key,
                    createdAt: server.node.createdAt,
                  },
                },
                owner: {
                  attributes: {
                    id: server.owner.id,
                    email: server.owner.email,
                    username: server.owner.username,
                    isAdmin: server.owner.isAdmin,
                    description: server.owner.description,
                  },
                },
              },
            }));

            userResponse.attributes.relationships.servers = {
              object: 'server_list',
              attributes: formattedServers,
              data: formattedServers,
            };
          }

          res.status(200).json(userResponse);
        } catch (error) {
          console.error('Error fetching user:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      },
    );

    router.post(
      '/api/application/users',
      validator,
      async (req: Request, res: Response) => {
        try {
          let { username, email, first_name, last_name, password } = req.body;

          if (!username || !email || !first_name || !last_name || !password) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
          }

          // Check if registration is allowed
          const userCount = await prisma.users.count();
          const isFirstUser = userCount === 0;

          if (!isFirstUser) {
            const settings = await prisma.settings.findUnique({ where: { id: 1 } });
            if (!settings || !(settings as any).allowRegistration) {
              res.status(403).json({ error: 'Registration is disabled' });
              return;
            }
          }

          const existingUser = await prisma.users.findUnique({
            where: { email },
          });

          if (existingUser) {
            res.status(400).json({ error: 'User already exists' });
            return;
          }

          password = await bcrypt.hash(password, 10);

          const newUser = await prisma.users.create({
            data: {
              username,
              email,
              password,
            },
          });

          res.status(201).json({
            atributes: {
              id: newUser.id,
              username: newUser.username,
              email: newUser.email,
            },
          });
        } catch (error) {
          console.error('Error creating user:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      },
    );

    router.patch(
      '/api/application/users/:id',
      validator,
      async (req: Request, res: Response) => {
        try {
          const userId = parseInt(req.params.id);
          const { username, email, first_name, last_name, password } = req.body;

          if (!username && !email && !first_name && !last_name && !password) {
            res.status(400).json({ error: 'No fields to update' });
            return;
          }

          const user = await prisma.users.findUnique({
            where: { id: userId },
          });

          if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
          }

          const updatedData: any = {};

          if (username) updatedData.username = username;
          if (email) updatedData.email = email;
          if (first_name) updatedData.first_name = first_name;
          if (last_name) updatedData.last_name = last_name;
          if (password) updatedData.password = password;

          updatedData.password = await bcrypt.hash(password, 10);

          const updatedUser = await prisma.users.update({
            where: { id: userId },
            data: updatedData,
          });

          res.status(200).json({
            object: 'user',
            attributes: {
              id: updatedUser.id,
              username: updatedUser.username,
              email: updatedUser.email,
            },
          });
        } catch (error) {
          console.error('Error updating user:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      },
    );

    router.get(
      '/api/application/nodes',
      validator,
      async (req: Request, res: Response) => {
        try {
          const nodes = await prisma.node.findMany({
            include: {
              _count: {
                select: {
                  servers: true,
                },
              },
            },
          });

          const formattedNodes = nodes.map(node => ({
            object: 'node',
            attributes: {
              id: node.id,
              uuid: node.id.toString(),
              public: true,
              name: node.name,
              description: node.name,
              fqdn: node.address,
              scheme: 'http',
              memory: node.ram,
              disk: node.disk,
              daemon_listen: node.port,
              created_at: node.createdAt.toISOString(),
              updated_at: node.createdAt.toISOString(),
            }
          }));

          res.json({
            object: 'list',
            data: formattedNodes,
            meta: {
              pagination: {
                total: nodes.length,
                count: nodes.length,
                per_page: 50,
                current_page: 1,
                total_pages: 1,
                links: {}
              }
            }
          });
        } catch (error) {
          logger.error('Error fetching nodes:', error);
          res.status(500).json({ error: 'Internal Server Error' });
        }
      }
    );

    router.get(
      '/api/application/nodes/:id',
      validator,
      async (req: Request, res: Response) => {
        try {
          const nodeId = parseInt(req.params.id);

          const node = await prisma.node.findUnique({
            where: { id: nodeId },
            include: {
              servers: {
                select: {
                  id: true,
                  UUID: true,
                  name: true,
                  Memory: true,
                  Cpu: true,
                  Storage: true,
                },
              },
            },
          });

          if (!node) {
            res.status(404).json({ error: 'Node not found' });
            return;
          }

          const formattedNode = {
            object: 'node',
            attributes: {
              id: node.id,
              uuid: node.id.toString(),
              public: true,
              name: node.name,
              description: node.name,
              fqdn: node.address,
              scheme: 'http',
              memory: node.ram,
              disk: node.disk,
              daemon_listen: node.port,
              created_at: node.createdAt.toISOString(),
              updated_at: node.createdAt.toISOString(),
            }
          };

          res.json({
            object: 'node',
            data: [formattedNode],
          });
        } catch (error) {
          logger.error('Error fetching node:', error);
          res.status(500).json({ error: 'Internal Server Error' });
        }
      }
    );

    router.post(
      '/api/application/servers',
      validator,
      async (req: Request, res: Response) => {
        const name = req.body.name;
        const description = req.body.description || 'Server Generated by API';
        const nodeId = Number(req.body.deploy.locations[0]);
        const imageId = req.body.egg;
        const Memory = req.body.limits.memory;
        const Cpu = req.body.limits.cpu;
        const Storage = req.body.limits.disk;
        const variables = req.body.environment;
        const dockerImage = req.body.docker_image;

        const servers = await prisma.server.findMany({
          where: { nodeId: nodeId },
        });

        const allPossiblePorts = Array.from(
          { length: 100 },
          (_, i) => 25565 + i,
        );
        const usedPorts = servers.flatMap((server: any) =>
          JSON.parse(server.Ports).map((portInfo: { Port: string }) =>
            parseInt(portInfo.Port.split(':')[0]),
          ),
        );

        const freePorts = allPossiblePorts.filter(
          (port) => !usedPorts.includes(port),
        );
        if (freePorts.length === 0) {
          res.status(400).send('No Free Ports Found.');
          return;
        }
        const randomFreePort =
          freePorts[Math.floor(Math.random() * freePorts.length)];
        const Ports = `${randomFreePort}:${randomFreePort}`;

        const userId = req.body.user;

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

        const Port = `[{"Port": "${Ports}", "primary": true}]`;

        try {
          const dockerImages = await prisma.images
            .findUnique({
              where: {
                id: imageId,
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
            (image: ImageDocker) => Object.values(image).includes(dockerImage),
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

          const server = await prisma.server.create({
            data: {
              name,
              description,
              ownerId: userId,
              nodeId: nodeId,
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
              } catch (error) {
                console.error(
                  `Error parsing Variables for server ID ${server.id}:`,
                  error,
                );
                await prisma.server.update({
                  where: { id: server.id },
                  data: { Queued: false },
                });
                continue;
              }

              if (!Array.isArray(ServerEnv)) {
                console.error(
                  `ServerEnv is not an array for server ID ${server.id}. Skipping...`,
                );
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
                    data: { Queued: false },
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
                    data: { Queued: false },
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

          res.status(201).json({
            message: 'Server created successfully',
            attributes: { id: server.UUID },
          });
        } catch (error) {
          logger.error('Error creating server:', error);
          res.status(500).send('Error creating server');
        }
      },
    );

    return router;
  },
};

export default coreModule;
