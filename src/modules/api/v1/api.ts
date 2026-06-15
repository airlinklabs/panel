import { Router, Request, Response } from 'express';
import { Module } from '../../../handlers/moduleInit';
import prisma from '../../../db';
import logger from '../../../handlers/logger';
import { apiValidator } from '../../../handlers/utils/api/apiValidator';
import { getParamAsString, getParamAsNumber } from '../../../utils/typeHelpers';
import bcrypt from 'bcryptjs';
import validator from 'validator';
import crypto from 'crypto';

function paginate<T>(items: T[], page: number, perPage: number) {
  const total = items.length;
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.max(1, Math.min(page, lastPage));
  return {
    data: items.slice((safePage - 1) * perPage, safePage * perPage),
    meta: { total, per_page: perPage, current_page: safePage, last_page: lastPage },
  };
}

const coreModule: Module = {
  info: {
    name: 'API Module',
    description: 'This module provides the API endpoints for the panel.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get('/api/v1/ping', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0',
      });
    });

    router.get('/api/v1', (_req: Request, res: Response) => {
      res.json({
        data: {
          version: 'v1',
          endpoints: [
            { method: 'GET', path: '/api/v1', description: 'Introspection – list all routes' },
            { method: 'GET', path: '/api/v1/ping', description: 'Health check' },
            { method: 'GET', path: '/api/v1/users', description: 'List users', permission: 'airlink.api.users.read' },
            { method: 'POST', path: '/api/v1/users', description: 'Create a user', permission: 'airlink.api.users.create' },
            { method: 'GET', path: '/api/v1/users/:id', description: 'Get a user', permission: 'airlink.api.users.read' },
            { method: 'PATCH', path: '/api/v1/users/:id', description: 'Update a user', permission: 'airlink.api.users.update' },
            { method: 'DELETE', path: '/api/v1/users/:id', description: 'Delete a user', permission: 'airlink.api.users.delete' },
            { method: 'GET', path: '/api/v1/servers', description: 'List servers', permission: 'airlink.api.servers.read' },
            { method: 'POST', path: '/api/v1/servers', description: 'Create a server', permission: 'airlink.api.servers.create' },
            { method: 'GET', path: '/api/v1/servers/:id', description: 'Get a server', permission: 'airlink.api.servers.read' },
            { method: 'PATCH', path: '/api/v1/servers/:id', description: 'Update a server', permission: 'airlink.api.servers.update' },
            { method: 'POST', path: '/api/v1/servers/:id/suspend', description: 'Suspend a server', permission: 'airlink.api.servers.update' },
            { method: 'POST', path: '/api/v1/servers/:id/unsuspend', description: 'Unsuspend a server', permission: 'airlink.api.servers.update' },
            { method: 'DELETE', path: '/api/v1/servers/:id', description: 'Delete a server', permission: 'airlink.api.servers.delete' },
            { method: 'GET', path: '/api/v1/nodes', description: 'List nodes', permission: 'airlink.api.nodes.read' },
            { method: 'POST', path: '/api/v1/nodes', description: 'Create a node', permission: 'airlink.api.nodes.create' },
            { method: 'GET', path: '/api/v1/nodes/:id', description: 'Get a node', permission: 'airlink.api.nodes.read' },
            { method: 'PATCH', path: '/api/v1/nodes/:id', description: 'Update a node', permission: 'airlink.api.nodes.update' },
            { method: 'DELETE', path: '/api/v1/nodes/:id', description: 'Delete a node', permission: 'airlink.api.nodes.delete' },
            { method: 'GET', path: '/api/v1/settings', description: 'Get settings', permission: 'airlink.api.settings.read' },
            { method: 'PATCH', path: '/api/v1/settings', description: 'Update settings', permission: 'airlink.api.settings.update' },
          ],
        },
      });
    });

    router.get('/api', async (req: Request, res: Response) => {
      try {
        const settings = await prisma.settings.findFirst();
        res.render('api/documentation', {
          req,
          user: req.session.user,
          settings
        });
      } catch (error) {
        logger.error('Error rendering API documentation:', error);
        res.status(500).render('error', {
          error: 'Failed to load API documentation',
          req
        });
      }
    });

    router.get(
      '/api/v1/users',
      apiValidator('airlink.api.users.read'),
      async (req: Request, res: Response) => {
        try {
          const page = Number(req.query.page) || 1;
          const perPage = Number(req.query.per_page) || 25;

          const users = await prisma.users.findMany({
            select: {
              id: true,
              username: true,
              email: true,
              isAdmin: true,
              description: true,
            },
          });

          res.json(paginate(users, page, perPage));
        } catch (error) {
          logger.error('Error fetching users:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    router.get(
      '/api/v1/users/:id',
      apiValidator('airlink.api.users.read'),
      async (req: Request, res: Response) => {
        try {
          const userId = getParamAsNumber(req.params.id);

          const user = await prisma.users.findUnique({
            where: { id: userId },
            select: {
              id: true,
              username: true,
              email: true,
              isAdmin: true,
              description: true
            },
          });

          if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
          }

          res.json({ data: user });
        } catch (error) {
          logger.error('Error fetching user:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    router.post(
      '/api/v1/users',
      apiValidator('airlink.api.users.create'),
      async (req: Request, res: Response) => {
        try {
          const { email, username, password, isAdmin, description } = req.body;

          if (!email || !username || !password) {
            res.status(422).json({ error: 'email, username, and password are required' });
            return;
          }

          if (!validator.isEmail(email)) {
            res.status(422).json({ error: 'Invalid email' });
            return;
          }

          if (!validator.isLength(username, { min: 3, max: 32 })) {
            res.status(422).json({ error: 'Username 3–32 chars' });
            return;
          }

          if (!validator.isLength(password, { min: 8, max: 128 })) {
            res.status(422).json({ error: 'Password 8–128 chars' });
            return;
          }

          const existingEmail = await prisma.users.findUnique({ where: { email } });
          if (existingEmail) {
            res.status(409).json({ error: 'Email already in use' });
            return;
          }

          const existingUsername = await prisma.users.findUnique({ where: { username } });
          if (existingUsername) {
            res.status(409).json({ error: 'Username already in use' });
            return;
          }

          const hashedPassword = await bcrypt.hash(password, 10);

          const user = await prisma.users.create({
            data: {
              email,
              username,
              password: hashedPassword,
              isAdmin: isAdmin ?? false,
              description: description ?? null,
            },
            select: {
              id: true,
              username: true,
              email: true,
              isAdmin: true,
              description: true,
            },
          });

          logger.info(`[AUDIT] userId=${req.session.user?.id} action=create-user target=${email}`);
          res.status(201).json({ data: user });
        } catch (error) {
          logger.error('Error creating user:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    router.patch(
      '/api/v1/users/:id',
      apiValidator('airlink.api.users.update'),
      async (req: Request, res: Response) => {
        try {
          const userId = getParamAsNumber(req.params.id);
          const { email, username, password, isAdmin, description } = req.body;

          const existing = await prisma.users.findUnique({ where: { id: userId } });
          if (!existing) {
            res.status(404).json({ error: 'User not found' });
            return;
          }

          if (email !== undefined) {
            if (!validator.isEmail(email)) {
              res.status(422).json({ error: 'Invalid email' });
              return;
            }
            if (email !== existing.email) {
              const dup = await prisma.users.findUnique({ where: { email } });
              if (dup) {
                res.status(409).json({ error: 'Email already in use' });
                return;
              }
            }
          }

          if (username !== undefined) {
            if (!validator.isLength(username, { min: 3, max: 32 })) {
              res.status(422).json({ error: 'Username 3–32 chars' });
              return;
            }
            if (username !== existing.username) {
              const dup = await prisma.users.findUnique({ where: { username } });
              if (dup) {
                res.status(409).json({ error: 'Username already in use' });
                return;
              }
            }
          }

          if (password !== undefined) {
            if (!validator.isLength(password, { min: 8, max: 128 })) {
              res.status(422).json({ error: 'Password 8–128 chars' });
              return;
            }
          }

          const data: Record<string, unknown> = {};
          if (email !== undefined) data.email = email;
          if (username !== undefined) data.username = username;
          if (isAdmin !== undefined) data.isAdmin = isAdmin;
          if (description !== undefined) data.description = description;
          if (password !== undefined) data.password = await bcrypt.hash(password, 10);

          const user = await prisma.users.update({
            where: { id: userId },
            data,
            select: {
              id: true,
              username: true,
              email: true,
              isAdmin: true,
              description: true,
            },
          });

          logger.info(`[AUDIT] userId=${req.session.user?.id} action=update-user target=${user.email}`);
          res.json({ data: user });
        } catch (error) {
          logger.error('Error updating user:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    router.delete(
      '/api/v1/users/:id',
      apiValidator('airlink.api.users.delete'),
      async (req: Request, res: Response) => {
        try {
          const userId = getParamAsNumber(req.params.id);

          const existing = await prisma.users.findUnique({ where: { id: userId } });
          if (!existing) {
            res.status(404).json({ error: 'User not found' });
            return;
          }

          await prisma.users.delete({ where: { id: userId } });

          logger.info(`[AUDIT] userId=${req.session.user?.id} action=delete-user target=${existing.email}`);
          res.json({ data: { success: true } });
        } catch (error) {
          logger.error('Error deleting user:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    router.get(
      '/api/v1/servers',
      apiValidator('airlink.api.servers.read'),
      async (req: Request, res: Response) => {
        try {
          const page = Number(req.query.page) || 1;
          const perPage = Number(req.query.per_page) || 25;

          const servers = await prisma.server.findMany({
            include: {
              owner: {
                select: {
                  id: true,
                  username: true,
                  email: true,
                },
              },
              node: {
                select: {
                  id: true,
                  name: true,
                  address: true,
                },
              },
            },
          });

          res.json(paginate(servers, page, perPage));
        } catch (error) {
          logger.error('Error fetching servers:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    router.get(
      '/api/v1/servers/:id',
      apiValidator('airlink.api.servers.read'),
      async (req: Request, res: Response) => {
        try {
          const serverId = req.params.id;

          const server = await prisma.server.findUnique({
            where: { UUID: getParamAsString(serverId) },
            include: {
              owner: {
                select: {
                  id: true,
                  username: true,
                  email: true,
                },
              },
              node: {
                select: {
                  id: true,
                  name: true,
                  address: true,
                },
              },
            },
          });

          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          res.json({ data: server });
        } catch (error) {
          logger.error('Error fetching server:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    router.post(
      '/api/v1/servers',
      apiValidator('airlink.api.servers.create'),
      async (req: Request, res: Response) => {
        try {
          const { name, description, ownerId, nodeId, imageId, Ports, Memory, Cpu, Storage, Variables, StartCommand, dockerImage } = req.body;

          if (!name || !ownerId || !nodeId || !imageId) {
            res.status(422).json({ error: 'name, ownerId, nodeId, and imageId are required' });
            return;
          }

          const owner = await prisma.users.findUnique({ where: { id: ownerId } });
          if (!owner) {
            res.status(404).json({ error: 'Owner not found' });
            return;
          }

          const node = await prisma.node.findUnique({ where: { id: nodeId } });
          if (!node) {
            res.status(404).json({ error: 'Node not found' });
            return;
          }

          const image = await prisma.images.findUnique({ where: { id: imageId } });
          if (!image) {
            res.status(404).json({ error: 'Image not found' });
            return;
          }

          const UUID = crypto.randomUUID();

          const server = await prisma.server.create({
            data: {
              UUID,
              name,
              description: description ?? null,
              ownerId,
              nodeId,
              imageId,
              Ports: Ports ?? '[]',
              Memory: Memory ?? 512,
              Cpu: Cpu ?? 100,
              Storage: Storage ?? 5120,
              Variables: Variables ?? null,
              StartCommand: StartCommand ?? image.startup,
              dockerImage: dockerImage ?? null,
              Installing: false,
              Queued: false,
            },
            include: {
              owner: { select: { id: true, username: true, email: true } },
              node: { select: { id: true, name: true, address: true } },
            },
          });

          logger.info(`[AUDIT] userId=${req.session.user?.id} action=create-server target=${UUID}`);
          res.status(201).json({ data: server });
        } catch (error) {
          logger.error('Error creating server:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    router.patch(
      '/api/v1/servers/:id',
      apiValidator('airlink.api.servers.update'),
      async (req: Request, res: Response) => {
        try {
          const serverId = getParamAsString(req.params.id);
          const { name, description, Ports, Memory, Cpu, Storage, Variables, StartCommand, dockerImage } = req.body;

          const existing = await prisma.server.findUnique({ where: { UUID: serverId } });
          if (!existing) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const data: Record<string, unknown> = {};
          if (name !== undefined) data.name = name;
          if (description !== undefined) data.description = description;
          if (Ports !== undefined) data.Ports = Ports;
          if (Memory !== undefined) data.Memory = Memory;
          if (Cpu !== undefined) data.Cpu = Cpu;
          if (Storage !== undefined) data.Storage = Storage;
          if (Variables !== undefined) data.Variables = Variables;
          if (StartCommand !== undefined) data.StartCommand = StartCommand;
          if (dockerImage !== undefined) data.dockerImage = dockerImage;

          const server = await prisma.server.update({
            where: { UUID: serverId },
            data,
            include: {
              owner: { select: { id: true, username: true, email: true } },
              node: { select: { id: true, name: true, address: true } },
            },
          });

          logger.info(`[AUDIT] userId=${req.session.user?.id} action=update-server target=${serverId}`);
          res.json({ data: server });
        } catch (error) {
          logger.error('Error updating server:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    router.post(
      '/api/v1/servers/:id/suspend',
      apiValidator('airlink.api.servers.update'),
      async (req: Request, res: Response) => {
        try {
          const serverId = getParamAsString(req.params.id);

          const existing = await prisma.server.findUnique({ where: { UUID: serverId } });
          if (!existing) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          if (existing.Suspended) {
            res.status(409).json({ error: 'Server is already suspended' });
            return;
          }

          const server = await prisma.server.update({
            where: { UUID: serverId },
            data: { Suspended: true },
          });

          logger.info(`[AUDIT] userId=${req.session.user?.id} action=suspend-server target=${serverId}`);
          res.json({ data: server });
        } catch (error) {
          logger.error('Error suspending server:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    router.post(
      '/api/v1/servers/:id/unsuspend',
      apiValidator('airlink.api.servers.update'),
      async (req: Request, res: Response) => {
        try {
          const serverId = getParamAsString(req.params.id);

          const existing = await prisma.server.findUnique({ where: { UUID: serverId } });
          if (!existing) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          if (!existing.Suspended) {
            res.status(409).json({ error: 'Server is not suspended' });
            return;
          }

          const server = await prisma.server.update({
            where: { UUID: serverId },
            data: { Suspended: false },
          });

          logger.info(`[AUDIT] userId=${req.session.user?.id} action=unsuspend-server target=${serverId}`);
          res.json({ data: server });
        } catch (error) {
          logger.error('Error unsuspending server:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    router.delete(
      '/api/v1/servers/:id',
      apiValidator('airlink.api.servers.delete'),
      async (req: Request, res: Response) => {
        try {
          const serverId = getParamAsString(req.params.id);

          const existing = await prisma.server.findUnique({ where: { UUID: serverId } });
          if (!existing) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          await prisma.server.delete({ where: { UUID: serverId } });

          logger.info(`[AUDIT] userId=${req.session.user?.id} action=delete-server target=${serverId}`);
          res.json({ data: { success: true } });
        } catch (error) {
          logger.error('Error deleting server:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    router.get(
      '/api/v1/nodes',
      apiValidator('airlink.api.nodes.read'),
      async (req: Request, res: Response) => {
        try {
          const page = Number(req.query.page) || 1;
          const perPage = Number(req.query.per_page) || 25;

          const nodes = await prisma.node.findMany({
            select: {
              id: true,
              name: true,
              address: true,
              port: true,
              ram: true,
              cpu: true,
              disk: true,
              createdAt: true,
              _count: {
                select: {
                  servers: true,
                },
              },
            },
          });

          res.json(paginate(nodes, page, perPage));
        } catch (error) {
          logger.error('Error fetching nodes:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    router.get(
      '/api/v1/nodes/:id',
      apiValidator('airlink.api.nodes.read'),
      async (req: Request, res: Response) => {
        try {
          const nodeId = getParamAsNumber(req.params.id);

          const node = await prisma.node.findUnique({
            where: { id: nodeId },
            select: {
              id: true,
              name: true,
              address: true,
              port: true,
              ram: true,
              cpu: true,
              disk: true,
              createdAt: true,
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

          res.json({ data: node });
        } catch (error) {
          logger.error('Error fetching node:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    router.post(
      '/api/v1/nodes',
      apiValidator('airlink.api.nodes.create'),
      async (req: Request, res: Response) => {
        try {
          const { name, address, port, ram, cpu, disk, key, sftpPort } = req.body;

          if (!name || !key) {
            res.status(422).json({ error: 'name and key are required' });
            return;
          }

          const node = await prisma.node.create({
            data: {
              name,
              address: address ?? '127.0.0.1',
              port: port ?? 3001,
              ram: ram ?? 0,
              cpu: cpu ?? 0,
              disk: disk ?? 0,
              key,
              sftpPort: sftpPort ?? 3003,
            },
            select: {
              id: true,
              name: true,
              address: true,
              port: true,
              ram: true,
              cpu: true,
              disk: true,
              createdAt: true,
            },
          });

          logger.info(`[AUDIT] userId=${req.session.user?.id} action=create-node target=${name}`);
          res.status(201).json({ data: node });
        } catch (error) {
          logger.error('Error creating node:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    router.patch(
      '/api/v1/nodes/:id',
      apiValidator('airlink.api.nodes.update'),
      async (req: Request, res: Response) => {
        try {
          const nodeId = getParamAsNumber(req.params.id);
          const { name, address, port, ram, cpu, disk, key, sftpPort } = req.body;

          const existing = await prisma.node.findUnique({ where: { id: nodeId } });
          if (!existing) {
            res.status(404).json({ error: 'Node not found' });
            return;
          }

          const data: Record<string, unknown> = {};
          if (name !== undefined) data.name = name;
          if (address !== undefined) data.address = address;
          if (port !== undefined) data.port = port;
          if (ram !== undefined) data.ram = ram;
          if (cpu !== undefined) data.cpu = cpu;
          if (disk !== undefined) data.disk = disk;
          if (key !== undefined) data.key = key;
          if (sftpPort !== undefined) data.sftpPort = sftpPort;

          const node = await prisma.node.update({
            where: { id: nodeId },
            data,
            select: {
              id: true,
              name: true,
              address: true,
              port: true,
              ram: true,
              cpu: true,
              disk: true,
              createdAt: true,
            },
          });

          logger.info(`[AUDIT] userId=${req.session.user?.id} action=update-node target=${node.name}`);
          res.json({ data: node });
        } catch (error) {
          logger.error('Error updating node:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    router.delete(
      '/api/v1/nodes/:id',
      apiValidator('airlink.api.nodes.delete'),
      async (req: Request, res: Response) => {
        try {
          const nodeId = getParamAsNumber(req.params.id);

          const existing = await prisma.node.findUnique({
            where: { id: nodeId },
            select: { id: true, name: true, _count: { select: { servers: true } } },
          });
          if (!existing) {
            res.status(404).json({ error: 'Node not found' });
            return;
          }

          if (existing._count.servers > 0) {
            res.status(409).json({ error: 'Cannot delete node with assigned servers' });
            return;
          }

          await prisma.node.delete({ where: { id: nodeId } });

          logger.info(`[AUDIT] userId=${req.session.user?.id} action=delete-node target=${existing.name}`);
          res.json({ data: { success: true } });
        } catch (error) {
          logger.error('Error deleting node:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    router.get(
      '/api/v1/settings',
      apiValidator('airlink.api.settings.read'),
      async (_req: Request, res: Response) => {
        try {
          const settings = await prisma.settings.findFirst();

          if (!settings) {
            res.status(404).json({ error: 'Settings not found' });
            return;
          }

          res.json({ data: settings });
        } catch (error) {
          logger.error('Error fetching settings:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    router.patch(
      '/api/v1/settings',
      apiValidator('airlink.api.settings.update'),
      async (req: Request, res: Response) => {
        try {
          const { title, description, logo, favicon, theme, language } = req.body;

          const currentSettings = await prisma.settings.findFirst();

          if (!currentSettings) {
            res.status(404).json({ error: 'Settings not found' });
            return;
          }

          const updatedSettings = await prisma.settings.update({
            where: { id: currentSettings.id },
            data: {
              title: title !== undefined ? title : currentSettings.title,
              description: description !== undefined ? description : currentSettings.description,
              logo: logo !== undefined ? logo : currentSettings.logo,
              favicon: favicon !== undefined ? favicon : currentSettings.favicon,
              theme: theme !== undefined ? theme : currentSettings.theme,
              language: language !== undefined ? language : currentSettings.language,
              updatedAt: new Date(),
            },
          });

          res.json({ data: updatedSettings });
        } catch (error) {
          logger.error('Error updating settings:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    return router;
  },
};

export default coreModule;
