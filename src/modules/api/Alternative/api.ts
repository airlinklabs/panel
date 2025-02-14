import { Router, Request, Response } from 'express';
import { apiKeyMiddleware, checkPermission } from '../../../handlers/utils/auth/apiAuthMiddleware';
import { PrismaClient, Server, Node, Location } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

// Alternative API version routes with legacy support
router.get('/servers', apiKeyMiddleware, checkPermission('servers', 'read'), (_req: Request, res: Response): void => {
  prisma.server.findMany({
    include: {
      node: true,
      image: true,
      owner: {
        select: {
          id: true,
          username: true,
          email: true
        }
      }
    }
  }).then((servers: Server[]) => {
    res.json({ data: servers }); // Legacy format
  }).catch((error: Error) => {
    console.error('Error fetching servers:', error);
    res.status(500).json({ error: 'Internal server error' });
  });
});

router.get('/nodes', apiKeyMiddleware, checkPermission('nodes', 'read'), (_req: Request, res: Response): void => {
  prisma.node.findMany({
    include: {
      location: true,
      servers: true
    }
  }).then((nodes: Node[]) => {
    res.json({ data: nodes }); // Legacy format
  }).catch((error: Error) => {
    console.error('Error fetching nodes:', error);
    res.status(500).json({ error: 'Internal server error' });
  });
});

router.get('/locations', apiKeyMiddleware, checkPermission('locations', 'read'), (_req: Request, res: Response): void => {
  prisma.location.findMany({
    include: {
      nodes: true
    }
  }).then((locations: Location[]) => {
    res.json({ data: locations }); // Legacy format
  }).catch((error: Error) => {
    console.error('Error fetching locations:', error);
    res.status(500).json({ error: 'Internal server error' });
  });
});

// Legacy compatibility layer
const legacyMiddleware = (_req: Request, res: Response, next: () => void): void => {
  res.setHeader('X-API-Version', 'alternative');
  res.setHeader('X-Deprecated', 'true');
  next();
};

router.use(legacyMiddleware);

// Export as module
const alternativeApiModule = {
  router,
  info: {
    name: 'Alternative API Module',
    version: '1.0.0',
    description: 'Legacy API support with backward compatibility'
  }
};

export default alternativeApiModule;
import axios from 'axios';
import QueueHandler from '../../../handlers/utils/core/queueer';
import bcrypt from 'bcrypt';

const queueer = new QueueHandler();
const prisma = new PrismaClient();


interface ApiResponse<T> {
  object: string;
  data?: T;
  attributes?: T;
  meta?: {
    pagination?: {
      total: number;
      count: number;
      per_page: number;
      current_page: number;
      total_pages: number;
      links: Record<string, string>;
    };
  };
  error?: string;
}

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
    const router = Router();
    let validKeys: string[] = [];

    async function loadApiKeys() {
      try {
        const keys = await prisma.apiKey.findMany({ where: { active: true } });
        validKeys = keys.map(key => key.key);
      } catch (error) {
        logger.error('Error loading API keys:', error);
        throw new Error('Failed to load API keys');
      }
    }

    const validator: RequestHandler = async (req, res, next) => {
      try {
        await loadApiKeys();

        const authHeader = req.headers['authorization'];
        if (!authHeader?.startsWith('Bearer ')) {
          res.status(401).json({
            error: 'Unauthorized: Missing or malformed Authorization header'
          });
          return;
        }

        const apiKey = authHeader.split(' ')[1];
        if (!validKeys.includes(apiKey)) {
          logger.warn(`Invalid API key attempt: ${apiKey}`);
          res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
          return;
        }

        next();
      } catch (error) {
        logger.error('Validator error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    };

    const getUsersList: RequestHandler = async (req, res, next) => {
      try {
        const filter = typeof req.query.filter === 'string' ? JSON.parse(req.query.filter) : undefined;
        const include = req.query.include as string;

        const users = await prisma.users.findMany({
          where: filter || {},
          include: {
            servers: include === 'servers'
          }
        });

        const response: ApiResponse<any> = {
          object: 'list',
          data: users.map(user => ({
            object: 'user',
            attributes: {
              id: user.id,
              username: user.username,
              email: user.email,
              root_admin: user.isAdmin,
              relationships: {
                servers: include === 'servers' ? user.servers : []
              }
            }
          })),
          meta: {
            pagination: {
              total: users.length,
              count: users.length,
              per_page: 50,
              current_page: 1,
              total_pages: Math.ceil(users.length / 50),
              links: {}
            }
          }
        };

        res.json(response);
        return next();
      } catch (error) {
        logger.error('Error fetching users:', error);
        res.status(500).json({ error: 'Internal server error' });
        return next(error);
      }
    };


    const getUser: RequestHandler = async (req, res, next) => {
      try {
        const userId = req.params.user;
        const filter = typeof req.query.filter === 'string' ? JSON.parse(req.query.filter) : undefined;
        const include = req.query.include as string;

        const user = userId ? 
          await prisma.users.findUnique({ where: { id: parseInt(userId) } }) :
          filter?.email ? 
            await prisma.users.findUnique({ where: { email: filter.email } }) :
            null;

        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return next();
        }

        const response: ApiResponse<any> = {
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
                data: {}
              }
            }
          }
        };

        if (include === 'servers') {
          const servers = await prisma.server.findMany({
            where: { ownerId: user.id },
            include: { node: true, owner: true }
          });

          response.attributes.relationships.servers = {
            object: 'server_list',
            attributes: servers.map(server => ({
              id: server.id,
              UUID: server.UUID,
              name: server.name,
              description: server.description,
              createdAt: server.createdAt,
              ports: JSON.parse(server.Ports || '[]'),
              limits: {
                memory: server.Memory,
                disk: server.Storage,
                cpu: server.Cpu
              },
              node: {
                id: server.node.id,
                name: server.node.name,
                address: server.node.address,
                port: server.node.port
              }
            }))
          };
        }

        res.status(200).json(response);
        return next();
      } catch (error) {
        logger.error('Error fetching user:', error);
        res.status(500).json({ error: 'Internal server error' });
        return next(error);
      }
    };


    const createUser: RequestHandler = async (req, res, next) => {
      try {
        const { username, email, first_name, last_name, password } = req.body;

        if (!username || !email || !first_name || !last_name || !password) {
          res.status(400).json({ error: 'Missing required fields' });
          return next();
        }

        const existingUser = await prisma.users.findFirst({
          where: { OR: [{ email }, { username }] }
        });

        if (existingUser) {
          res.status(400).json({ error: 'User with this email or username already exists' });
          return next();
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await prisma.users.create({
          data: {
            username,
            email,
            password: hashedPassword
          }
        });

        res.status(201).json({
          object: 'user',
          attributes: {
            id: newUser.id,
            username: newUser.username,
            email: newUser.email
          }
        });
        return next();
      } catch (error) {
        logger.error('Error creating user:', error);
        res.status(500).json({ error: 'Internal server error' });
        return next(error);
      }
    };


    const updateUser: RequestHandler = async (req, res, next) => {
      try {
        const userId = parseInt(req.params.id);
        const { username, email, password } = req.body;

        if (!username && !email && !password) {
          res.status(400).json({ error: 'No fields to update' });
          return next();
        }

        const user = await prisma.users.findUnique({
          where: { id: userId }
        });

        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return next();
        }

        const updateData: any = {};
        if (username) updateData.username = username;
        if (email) updateData.email = email;
        if (password) updateData.password = await bcrypt.hash(password, 10);

        const updatedUser = await prisma.users.update({
          where: { id: userId },
          data: updateData
        });

        res.status(200).json({
          object: 'user',
          attributes: {
            id: updatedUser.id,
            username: updatedUser.username,
            email: updatedUser.email
          }
        });
        return next();
      } catch (error) {
        logger.error('Error updating user:', error);
        res.status(500).json({ error: 'Internal server error' });
        return next(error);
      }
    };


    const createServer: RequestHandler = async (req, res, next) => {
      try {
        const {
          name,
          description = 'Server Generated by API',
          deploy: { locations },
          egg: imageId,
          limits: { memory, cpu, disk },
          environment: variables,
          docker_image: dockerImage,
          user: userId
        } = req.body;

        if (!name || !locations?.[0] || !imageId || !memory || !cpu || !disk || !userId) {
          res.status(400).json({ error: 'Missing required fields' });
          return next();
        }

        const nodeId = Number(locations[0]);

        // Validate node exists
        const node = await prisma.node.findUnique({
          where: { id: nodeId }
        });

        if (!node) {
          res.status(404).json({ error: 'Node not found' });
          return next();
        }

        // Find available port
        const servers = await prisma.server.findMany({
          where: { nodeId }
        });

        const allPossiblePorts = Array.from({ length: 100 }, (_, i) => 25565 + i);
        const usedPorts = servers.flatMap(server => 
          JSON.parse(server.Ports).map((portInfo: { Port: string }) => parseInt(portInfo.Port.split(':')[0]))
        );

        const freePorts = allPossiblePorts.filter(port => !usedPorts.includes(port));
        if (freePorts.length === 0) {
          res.status(400).json({ error: 'No free ports available' });
          return next();
        }

        const randomFreePort = freePorts[Math.floor(Math.random() * freePorts.length)];
        const portConfig = JSON.stringify([{
          Port: `${randomFreePort}:${randomFreePort}`,
          primary: true
        }]);

        // Validate image
        const image = await prisma.images.findUnique({
          where: { id: parseInt(imageId) }
        });

        if (!image || !image.dockerImages || !image.startup) {
          res.status(400).json({ error: 'Invalid image configuration' });
          return next();
        }

        const dockerImages = JSON.parse(image.dockerImages);
        const imageDocker = dockerImages.find(
          (img: Record<string, string>) => Object.values(img).includes(dockerImage)
        );

        if (!imageDocker) {

        }

        // Create server
        const server = await prisma.server.create({
          data: {
            name,
            description,
            ownerId: userId,
            nodeId,
            imageId: parseInt(imageId),
            Ports: portConfig,
            Memory: parseInt(memory),
            Cpu: parseInt(cpu),
            Storage: parseInt(disk),
            Variables: JSON.stringify(variables),
            StartCommand: image.startup,
            dockerImage: JSON.stringify(imageDocker)
          }
        });

        // Queue installation task
        queueer.addTask(async () => {
          try {
            const serverToInstall = await prisma.server.findUnique({
              where: { id: server.id },
              include: { image: true, node: true }
            });

            if (!serverToInstall?.Variables) {
              await prisma.server.update({
                where: { id: server.id },
                data: { Installing: false }
              });
              return;
            }

            const env = JSON.parse(serverToInstall.Variables).reduce(
              (acc: Record<string, any>, curr: { env: string; value: any }) => {
                acc[curr.env] = curr.value;
                return acc;
              },
              {}
            );

            if (serverToInstall.image?.scripts) {
              const scripts = JSON.parse(serverToInstall.image.scripts);
              await axios.post(
                `http://${serverToInstall.node.address}:${serverToInstall.node.port}/container/install`,
                {
                  id: serverToInstall.UUID,
                  env,
                  scripts: scripts.install.map((script: { url: string; fileName: string }) => ({
                    url: script.url,
                    fileName: script.fileName
                  }))
                },
                {
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Basic ${Buffer.from(`Airlink:${serverToInstall.node.key}`).toString('base64')}`
                  }
                }
              );
            }

            await prisma.server.update({
              where: { id: server.id },
              data: { Installing: false }
            });
          } catch (error) {
            logger.error('Server installation error:', error);
            await prisma.server.update({
              where: { id: server.id },
              data: { Installing: false }
            });
          }
        }, 0);

        res.status(201).json({
          object: 'server',
          attributes: {
            id: server.UUID,
            name: server.name
          }
        });
        return next();
      } catch (error) {
        logger.error('Error creating server:', error);
        res.status(500).json({ error: 'Internal server error' });
        return next(error);
      }
    };

    // Register routes with proper handlers
    router.get('/api/application/users', validator, getUsersList);
    router.get('/api/application/users/:user', validator, getUser);
    router.post('/api/application/users', validator, createUser);
    router.patch('/api/application/users/:id', validator, updateUser);
    router.post('/api/application/servers', validator, createServer);

    return router;
  },
};

export default coreModule;
