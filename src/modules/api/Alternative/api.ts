import { Router, Request, Response, NextFunction } from 'express';
import { Module } from '../../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';

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
        validKeys = keys.map((key) => key.key);
      } catch (error) {
        console.error('Error loading API keys:', error);
      }
    }

    async function validator(req: Request, res: Response, next: NextFunction) {
      await loadApiKeys();

      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res
          .status(401)
          .json({
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

    router.get('/api/application/users', validator, async (req: Request, res: Response) => {
        try {
            const filter = typeof req.query.filter === 'string' 
                ? JSON.parse(req.query.filter) 
                : req.query.filter;
    
            const include = req.query.include;
            const users = await prisma.users.findMany({
                where: filter || {},
            });
    
            let serverData = null;
            if (include && include === 'servers') {
                serverData = await prisma.server.findMany({
                    where: { ownerId: { in: users.map((user) => user.id) } },
                    include: { node: true, owner: true },
                });
            }
    
            const response = users.map((user) => {
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
                    userData.relationships.servers = serverData.filter((server) => server.ownerId === user.id).map((server) => ({
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
    });

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
                },
              },
            },
          };

          if (include === 'servers') {
            const servers = await prisma.server.findMany({
              where: { ownerId: user.id },
              include: { node: true, owner: true },
            });

            userResponse.attributes.relationships.servers = {
              object: 'server_list',
              attributes: servers,
            };
          }
          console.log(userResponse);

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
          const { username, email, first_name, last_name, password } = req.body;

          if (!username || !email || !first_name || !last_name || !password) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
          }

          const existingUser = await prisma.users.findUnique({
            where: { email },
          });

          if (existingUser) {
            res.status(400).json({ error: 'User already exists' });
            return;
          }

          const newUser = await prisma.users.create({
            data: {
              username,
              email,
              password,
            },
          });

          res
            .status(201)
            .json({
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

    return router;
  },
};

export default coreModule;
