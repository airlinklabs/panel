import { Router, Request, Response } from 'express';
import { Module } from '../../../handlers/moduleInit';
import prisma from '../../../db';
import logger from '../../../handlers/logger';
import { apiValidator } from '../../../handlers/utils/api/apiValidator';
import { getParamAsString, getParamAsNumber } from '../../../utils/typeHelpers';
import bcrypt from 'bcryptjs';
import validator from 'validator';
import crypto from 'crypto';
import { daemonRequest } from '../../../handlers/utils/core/daemonRequest';
import { AirlinkCloudClient } from '../../../handlers/utils/core/airlinkCloud';
import {
  uploadStreamToS3,
  deleteFromS3,
  getS3ObjectStream,
  isS3Backup,
  S3_KEY_PREFIX,
} from '../../../handlers/utils/core/s3Client';
import {
  withNodePortLock,
  getNodePortPool,
  syncNodeAllocations,
} from '../../../handlers/utils/server/allocations';
import {
  provisionDatabase,
  deprovisionDatabase,
} from '../../../handlers/utils/core/mysqlProvisioner';
import { logActivity } from '../../../handlers/utils/activity/activityLogger';
import { validateVariableRules } from '../../user/server/startup';
import { apiEndpoints } from './apiDocs';
import { nextRunFromCron, isValidCron } from '../../../utils/cron';

const POWER_ACTIONS = ['start', 'stop', 'restart', 'kill'] as const;
const TASK_ACTIONS = ['command', 'power', 'backup'] as const;

const BCRYPT_SALT_ROUNDS = 10;
const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_MEMORY_MB = 512;
const DEFAULT_SWAP_MB = 0;
const DEFAULT_CPU_PERCENT = 100;
const DEFAULT_STORAGE_MB = 5120;
const DEFAULT_NODE_PORT = 3001;
const DEFAULT_SFTP_PORT = 3003;
const MIN_PORT_NUMBER = 1024;
const MAX_PORT_NUMBER = 65535;
const MIN_TIME_OFFSET = -1440;
const MAX_TIME_OFFSET = 1440;
const BACKUP_TIMEOUT_MS = 300_000;
const SHORT_TIMEOUT_MS = 30_000;
const STREAM_TIMEOUT_MS = 120_000;
const DAEMON_REQUEST_TIMEOUT_MS = 15_000;

function s3KeyFor(serverId: string, uuid: string): string {
  return `backups/${serverId}/${uuid}.tar.gz`;
}

async function apiAudit(req: Request, event: string, serverId?: string, metadata?: Record<string, unknown>): Promise<void> {
  try {
    await logActivity(req, event as Parameters<typeof logActivity>[1], {
      serverId,
      metadata,
    });
  } catch {
    // Audit logging must never break the API response.
  }
}

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
    version: '2.0.0',
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
        version: '2.0.0',
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
            { method: 'GET', path: '/api/v1/servers/:id/backups', description: 'List backups', permission: 'airlink.api.servers.read' },
            { method: 'POST', path: '/api/v1/servers/:id/backups', description: 'Create a backup', permission: 'airlink.api.servers.update' },
            { method: 'POST', path: '/api/v1/servers/:id/backups/:backupId/restore', description: 'Restore a backup', permission: 'airlink.api.servers.update' },
            { method: 'DELETE', path: '/api/v1/servers/:id/backups/:backupId', description: 'Delete a backup', permission: 'airlink.api.servers.update' },
            { method: 'GET', path: '/api/v1/servers/:id/databases', description: 'List databases', permission: 'airlink.api.servers.read' },
            { method: 'POST', path: '/api/v1/servers/:id/databases', description: 'Create a database', permission: 'airlink.api.servers.update' },
            { method: 'DELETE', path: '/api/v1/servers/:id/databases/:dbId', description: 'Delete a database', permission: 'airlink.api.servers.update' },
            { method: 'GET', path: '/api/v1/servers/:id/subusers', description: 'List subusers', permission: 'airlink.api.servers.read' },
            { method: 'POST', path: '/api/v1/servers/:id/subusers', description: 'Add a subuser', permission: 'airlink.api.servers.update' },
            { method: 'PATCH', path: '/api/v1/servers/:id/subusers/:subUserId', description: 'Update subuser permissions', permission: 'airlink.api.servers.update' },
            { method: 'DELETE', path: '/api/v1/servers/:id/subusers/:subUserId', description: 'Remove a subuser', permission: 'airlink.api.servers.update' },
            { method: 'GET', path: '/api/v1/servers/:id/startup', description: 'Get server startup', permission: 'airlink.api.servers.read' },
            { method: 'PATCH', path: '/api/v1/servers/:id/startup', description: 'Update server startup', permission: 'airlink.api.servers.update' },
            { method: 'GET', path: '/api/v1/servers/:id/schedules', description: 'List schedules', permission: 'airlink.api.servers.read' },
            { method: 'POST', path: '/api/v1/servers/:id/schedules', description: 'Create a schedule', permission: 'airlink.api.servers.update' },
            { method: 'PATCH', path: '/api/v1/servers/:id/schedules/:scheduleId', description: 'Update a schedule', permission: 'airlink.api.servers.update' },
            { method: 'DELETE', path: '/api/v1/servers/:id/schedules/:scheduleId', description: 'Delete a schedule', permission: 'airlink.api.servers.update' },
            { method: 'POST', path: '/api/v1/servers/:id/schedules/:scheduleId/tasks', description: 'Add a schedule task', permission: 'airlink.api.servers.update' },
            { method: 'DELETE', path: '/api/v1/servers/:id/schedules/:scheduleId/tasks/:taskId', description: 'Delete a schedule task', permission: 'airlink.api.servers.update' },
            { method: 'GET', path: '/api/v1/nodes/:id/allocations', description: 'List node allocations', permission: 'airlink.api.nodes.read' },
            { method: 'POST', path: '/api/v1/nodes/:id/allocations', description: 'Add a node allocation', permission: 'airlink.api.nodes.update' },
            { method: 'DELETE', path: '/api/v1/nodes/:id/allocations/:allocationId', description: 'Delete a node allocation', permission: 'airlink.api.nodes.update' },
            { method: 'GET', path: '/api/v1/images', description: 'List images', permission: 'airlink.api.images.read' },
            { method: 'POST', path: '/api/v1/images', description: 'Create an image', permission: 'airlink.api.images.create' },
            { method: 'GET', path: '/api/v1/images/:id', description: 'Get an image', permission: 'airlink.api.images.read' },
            { method: 'PATCH', path: '/api/v1/images/:id', description: 'Update an image', permission: 'airlink.api.images.update' },
            { method: 'DELETE', path: '/api/v1/images/:id', description: 'Delete an image', permission: 'airlink.api.images.delete' },
            { method: 'GET', path: '/api/v1/locations', description: 'List locations', permission: 'airlink.api.locations.read' },
            { method: 'POST', path: '/api/v1/locations', description: 'Create a location', permission: 'airlink.api.locations.create' },
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
          settings,
          apiEndpoints,
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
          const perPage = Number(req.query.per_page) || DEFAULT_PAGE_SIZE;

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

          const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

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
          if (password !== undefined) data.password = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

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
          const perPage = Number(req.query.per_page) || DEFAULT_PAGE_SIZE;

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
          const { name, description, ownerId, nodeId, imageId, Ports, Memory, Swap, Cpu, Storage, Variables, StartCommand, dockerImage } = req.body;

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
              Memory: Memory ?? DEFAULT_MEMORY_MB,
              Swap: Swap ?? DEFAULT_SWAP_MB,
              Cpu: Cpu ?? DEFAULT_CPU_PERCENT,
              Storage: Storage ?? DEFAULT_STORAGE_MB,
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
          const { name, description, Ports, Memory, Swap, Cpu, Storage, Variables, StartCommand, dockerImage } = req.body;

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
          if (Swap !== undefined) data.Swap = Swap;
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

          const existing = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true },
          });
          if (!existing) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          if (existing.node) {
            try {
              await daemonRequest({
                nodeAddress: existing.node.address,
                nodePort: existing.node.port,
                nodeKey: existing.node.key,
                method: 'DELETE',
                path: '/container',
                body: { id: existing.UUID },
              });
            } catch (err: unknown) {
              const daemonErr = err as { status?: number; body?: { error?: string } };
              const isGone =
                daemonErr.status === 404 ||
                daemonErr.body?.error?.includes('not exist');
              if (!isGone) {
                logger.warn(`Could not delete container on daemon: ${err}`);
              }
            }
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
          const perPage = Number(req.query.per_page) || DEFAULT_PAGE_SIZE;

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
              port: port ?? DEFAULT_NODE_PORT,
              ram: ram ?? 0,
              cpu: cpu ?? 0,
              disk: disk ?? 0,
              key,
              sftpPort: sftpPort ?? DEFAULT_SFTP_PORT,
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

    // ── GET /api/v1/servers/:id/backups ─────────────────────────────────────
    router.get(
      '/api/v1/servers/:id/backups',
      apiValidator('airlink.api.servers.read'),
      async (req: Request, res: Response) => {
        try {
          const server = await prisma.server.findUnique({
            where: { UUID: getParamAsString(req.params.id) },
          });
          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const backups = await prisma.backup.findMany({
            where: { serverId: server.UUID },
            orderBy: { createdAt: 'desc' },
            select: {
              UUID: true,
              name: true,
              size: true,
              checksum: true,
              locked: true,
              createdAt: true,
            },
          });

          res.json({
            data: backups.map((b) => ({
              ...b,
              size: b.size ? b.size.toString() : '0',
            })),
          });
        } catch (error) {
          logger.error('Error fetching backups:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    // ── POST /api/v1/servers/:id/backups ────────────────────────────────────
    router.post(
      '/api/v1/servers/:id/backups',
      apiValidator('airlink.api.servers.update'),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params.id);
        const { name } = req.body as { name?: string };

        if (!name || name.trim() === '') {
          res.status(422).json({ error: 'Backup name is required' });
          return;
        }

        try {
          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true },
          });
          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const settings = await prisma.settings.findUnique({ where: { id: 1 } });
          const isCloudBackupEnabled = settings?.airlinkCloudBackupEnabled && settings?.airlinkCloudApiKey;

          const backupCount = await prisma.backup.count({ where: { serverId } });
          if (server.backupLimit > 0 && backupCount >= server.backupLimit) {
            res.status(400).json({ error: `Backup limit reached (${server.backupLimit}).` });
            return;
          }

          const response = await daemonRequest<{
            success: boolean;
            backup?: { filePath: string; uuid: string; size: number; checksum?: string };
          }>({
            method: 'POST',
            path: '/container/backup',
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            nodeKey: server.node.key,
            body: {
              id: serverId,
              name: name.trim(),
            },
            timeout: BACKUP_TIMEOUT_MS,
          });

          if (!response.data.success || !response.data.backup) {
            res.status(502).json({ error: 'Failed to create backup on daemon' });
            return;
          }

          let airlinkCloudId: string | null = null;
          let filePath = response.data.backup.filePath;

          if (isCloudBackupEnabled) {
            try {
              const cloudClient = new AirlinkCloudClient(settings.airlinkCloudApiKey!);
              const downloadResponse = await daemonRequest<import('stream').Readable>({
                method: 'GET',
                path: '/container/backup/download',
                nodeAddress: server.node.address,
                nodePort: server.node.port,
                nodeKey: server.node.key,
                params: { backupPath: filePath },
                responseType: 'stream',
              });

              const uniqueCloudFileName = `${serverId}_${response.data.backup.uuid}_${Date.now()}.tar.gz`;
              const uploadResult = await cloudClient.uploadFile(downloadResponse.data, uniqueCloudFileName);

              if (uploadResult && (uploadResult as Record<string, unknown>).id) {
                airlinkCloudId = (uploadResult as Record<string, unknown>).id as string;
                await daemonRequest({
                  method: 'DELETE',
                  path: '/container/backup',
                  nodeAddress: server.node.address,
                  nodePort: server.node.port,
                  nodeKey: server.node.key,
                  body: { backupPath: filePath },
                }).catch((e) => logger.warn(`Failed to delete temporary local backup: ${e}`));
                filePath = 'airlink-cloud';
              }
            } catch (cloudError) {
              logger.error('Failed to redirect backup to Airlink Cloud:', cloudError);
            }
          } else if (settings?.s3Enabled) {
            try {
              const downloadResponse = await daemonRequest<import('stream').Readable>({
                method: 'GET',
                path: '/container/backup/download',
                nodeAddress: server.node.address,
                nodePort: server.node.port,
                nodeKey: server.node.key,
                params: { backupPath: filePath },
                responseType: 'stream',
              });
              const s3Key = s3KeyFor(serverId, response.data.backup.uuid);
              await uploadStreamToS3(downloadResponse.data, s3Key);
              await daemonRequest({
                method: 'DELETE',
                path: '/container/backup',
                nodeAddress: server.node.address,
                nodePort: server.node.port,
                nodeKey: server.node.key,
                body: { backupPath: filePath },
              }).catch((e) => logger.warn(`Failed to delete temporary local backup: ${e}`));
              filePath = `${S3_KEY_PREFIX}${s3Key}`;
            } catch (s3Error) {
              logger.error('Failed to redirect backup to S3:', s3Error);
            }
          }

          const backup = await prisma.backup.create({
            data: {
              UUID: response.data.backup.uuid,
              name: name.trim(),
              serverId,
              filePath,
              size: BigInt(response.data.backup.size),
              checksum: typeof response.data.backup.checksum === 'string' ? response.data.backup.checksum : null,
              airlinkCloudId,
            },
            select: {
              UUID: true,
              name: true,
              size: true,
              checksum: true,
              locked: true,
              createdAt: true,
            },
          });

          await apiAudit(req, 'backup:create', serverId, { name: name.trim(), uuid: backup.UUID });
          res.status(201).json({ data: { ...backup, size: backup.size ? backup.size.toString() : '0' } });
        } catch (error: unknown) {
          const err = error as { body?: { error?: string }; message?: string };
          logger.error('Error creating backup:', error);
          res.status(500).json({ error: `Failed to create backup: ${err.body?.error || err.message || 'Failed to create backup'}` });
          return;
        }
      }
    );

    // ── POST /api/v1/servers/:id/backups/:backupId/restore ─────────────────
    router.post(
      '/api/v1/servers/:id/backups/:backupId/restore',
      apiValidator('airlink.api.servers.update'),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params.id);
        const backupId = getParamAsString(req.params.backupId);

        try {
          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true },
          });
          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const backup = await prisma.backup.findUnique({
            where: { UUID: backupId, serverId },
          });
          if (!backup) {
            res.status(404).json({ error: 'Backup not found' });
            return;
          }

          let backupPath = backup.filePath;

          if (backup.airlinkCloudId) {
            const settings = await prisma.settings.findUnique({ where: { id: 1 } });
            if (!settings?.airlinkCloudApiKey) {
              res.status(500).json({ error: 'Airlink Cloud API key not configured' });
              return;
            }
            try {
              const cloudClient = new AirlinkCloudClient(settings.airlinkCloudApiKey);
              const cloudDownloadResponse = await cloudClient.getDownloadStream(backup.airlinkCloudId);
              const uploadResponse = await daemonRequest<{ success: boolean; filePath?: string }>({
                method: 'POST',
                path: '/container/backup/upload',
                nodeAddress: server.node.address,
                nodePort: server.node.port,
                nodeKey: server.node.key,
                params: { id: serverId, backupUuid: backup.UUID },
                body: cloudDownloadResponse.data,
                timeout: 300000,
              });
              if (uploadResponse.data.success) {
                backupPath = uploadResponse.data.filePath!;
              } else {
                throw new Error('Failed to upload cloud backup to daemon');
              }
            } catch (err) {
              logger.error('Failed to prepare Airlink Cloud backup for restore:', err);
              res.status(500).json({ error: 'Failed to prepare cloud backup for restore' });
              return;
            }
          } else if (isS3Backup(backup.filePath)) {
            try {
              const stream = await getS3ObjectStream(backup.filePath.slice(S3_KEY_PREFIX.length));
              if (!stream) throw new Error('S3 object not found');
              const uploadResponse = await daemonRequest<{ success: boolean; filePath?: string }>({
                method: 'POST',
                path: '/container/backup/upload',
                nodeAddress: server.node.address,
                nodePort: server.node.port,
                nodeKey: server.node.key,
                params: { id: serverId, backupUuid: backup.UUID },
                body: stream,
                timeout: 300000,
              });
              if (uploadResponse.data.success) {
                backupPath = uploadResponse.data.filePath!;
              } else {
                throw new Error('Failed to upload S3 backup to daemon');
              }
            } catch (err) {
              logger.error('Failed to prepare S3 backup for restore:', err);
              res.status(500).json({ error: 'Failed to prepare S3 backup for restore' });
              return;
            }
          }

          const response = await daemonRequest<{ success: boolean }>({
            method: 'POST',
            path: '/container/restore',
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            nodeKey: server.node.key,
            body: {
              id: serverId,
              backupPath,
              checksum: backup.checksum ?? undefined,
            },
            timeout: 300000,
          });

          if (backupPath !== backup.filePath) {
            daemonRequest({
              method: 'DELETE',
              path: '/container/backup',
              nodeAddress: server.node.address,
              nodePort: server.node.port,
              nodeKey: server.node.key,
              body: { backupPath },
            }).catch((e: unknown) => logger.warn(`Failed to delete temporary restore file: ${e}`));
          }

          if (!response.data.success) {
            res.status(502).json({ error: 'Failed to restore backup on daemon' });
            return;
          }

          await apiAudit(req, 'backup:restore', serverId, { name: backup.name, uuid: backup.UUID });
          res.json({ data: { success: true } });
        } catch (error: unknown) {
          const err = error as { body?: { error?: string }; message?: string };
          logger.error('Error restoring backup:', error);
          res.status(500).json({ error: `Failed to restore backup: ${err.body?.error || err.message || 'Failed to restore backup'}` });
          return;
        }
      }
    );

    // ── DELETE /api/v1/servers/:id/backups/:backupId ───────────────────────
    router.delete(
      '/api/v1/servers/:id/backups/:backupId',
      apiValidator('airlink.api.servers.update'),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params.id);
        const backupId = getParamAsString(req.params.backupId);

        try {
          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true },
          });
          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const backup = await prisma.backup.findUnique({
            where: { UUID: backupId, serverId },
          });
          if (!backup) {
            res.status(404).json({ error: 'Backup not found' });
            return;
          }

          if (backup.locked) {
            res.status(403).json({ error: 'This backup is locked. Unlock it before deleting.' });
            return;
          }

          if (backup.airlinkCloudId) {
            const settings = await prisma.settings.findUnique({ where: { id: 1 } });
            if (settings?.airlinkCloudApiKey) {
              const cloudClient = new AirlinkCloudClient(settings.airlinkCloudApiKey);
              await cloudClient.deleteFile(backup.airlinkCloudId).catch((e) => logger.warn(`Failed to delete backup from Airlink Cloud: ${e}`));
            }
          } else if (isS3Backup(backup.filePath)) {
            try {
              await deleteFromS3(backup.filePath.slice(S3_KEY_PREFIX.length));
            } catch (e) {
              logger.warn(`Failed to delete backup from S3: ${e}`);
            }
          } else {
            try {
              await daemonRequest({
                method: 'DELETE',
                path: '/container/backup',
                nodeAddress: server.node.address,
                nodePort: server.node.port,
                nodeKey: server.node.key,
                body: { backupPath: backup.filePath },
              });
            } catch {
              logger.warn('Failed to delete backup file from daemon');
            }
          }

          await prisma.backup.delete({ where: { UUID: backupId } });
          await apiAudit(req, 'backup:delete', serverId, { name: backup.name, uuid: backup.UUID });
          res.json({ data: { success: true } });
        } catch (error) {
          logger.error('Error deleting backup:', error);
          res.status(500).json({ error: 'Failed to delete backup' });
          return;
        }
      }
    );

    // ── GET /api/v1/servers/:id/databases ───────────────────────────────────
    router.get(
      '/api/v1/servers/:id/databases',
      apiValidator('airlink.api.servers.read'),
      async (req: Request, res: Response) => {
        try {
          const server = await prisma.server.findUnique({
            where: { UUID: getParamAsString(req.params.id) },
          });
          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const databases = await prisma.serverDatabase.findMany({
            where: { serverId: server.UUID },
            include: { host: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' },
          });

          res.json({ data: databases });
        } catch (error) {
          logger.error('Error fetching databases:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    // ── POST /api/v1/servers/:id/databases ──────────────────────────────────
    router.post(
      '/api/v1/servers/:id/databases',
      apiValidator('airlink.api.servers.update'),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params.id);
        const { hostId } = req.body as { hostId?: string | number };

        try {
          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
          });
          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const host = await prisma.databaseHost.findUnique({
            where: { id: parseInt(String(hostId), 10) },
          });
          if (!host) {
            res.status(400).json({ error: 'Invalid database host.' });
            return;
          }
          if (host.nodeId !== null && host.nodeId !== server.nodeId) {
            res.status(403).json({ error: "This database host is not available for this server's node." });
            return;
          }

          const databaseLimit = server.databaseLimit ?? 0;
          if (databaseLimit > 0) {
            const existing = await prisma.serverDatabase.count({ where: { serverId: server.UUID } });
            if (existing >= databaseLimit) {
              res.status(400).json({ error: `Database limit reached (${databaseLimit}).` });
              return;
            }
          }

          const owner = await prisma.users.findUnique({ where: { id: server.ownerId } });
          const settings = await prisma.settings.findUnique({ where: { id: 1 } });
          const userMaxDatabases =
            owner?.maxDatabases !== null && owner?.maxDatabases !== undefined
              ? (owner.maxDatabases ?? 0)
              : (settings?.defaultMaxDatabases ?? 0);
          if (userMaxDatabases > 0) {
            const totalOwnerDatabases = await prisma.serverDatabase.count({
              where: { server: { ownerId: server.ownerId } },
            });
            if (totalOwnerDatabases >= userMaxDatabases) {
              res.status(400).json({ error: `You have reached your database limit of ${userMaxDatabases} across all servers.` });
              return;
            }
          }

          try {
            const credentials = await provisionDatabase(host, server.UUID);
            const db = await prisma.serverDatabase.create({
              data: {
                serverId: server.UUID,
                hostId: host.id,
                ...credentials,
              },
              include: { host: { select: { id: true, name: true } } },
            });
            await apiAudit(req, 'database:create', server.UUID, { databaseId: db.id, hostId: host.id });
            res.status(201).json({ data: db });
          } catch (error) {
            logger.error('Failed to provision database:', error);
            res.status(502).json({ error: error instanceof Error ? error.message : 'Failed to connect to the database host.' });
            return;
          }
        } catch (error) {
          logger.error('Error creating database:', error);
          res.status(500).json({ error: 'Failed to create database' });
          return;
        }
      }
    );

    // ── DELETE /api/v1/servers/:id/databases/:dbId ──────────────────────────
    router.delete(
      '/api/v1/servers/:id/databases/:dbId',
      apiValidator('airlink.api.servers.update'),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params.id);
        const dbId = parseInt(getParamAsString(req.params.dbId), 10);

        try {
          const server = await prisma.server.findUnique({ where: { UUID: serverId } });
          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const db = await prisma.serverDatabase.findUnique({
            where: { id: dbId },
            include: { host: true },
          });
          if (!db || db.serverId !== server.UUID) {
            res.status(404).json({ error: 'Database not found.' });
            return;
          }

          try {
            await deprovisionDatabase(db.host, db);
            await prisma.serverDatabase.delete({ where: { id: db.id } });
            await apiAudit(req, 'database:delete', serverId, { databaseId: db.id });
            res.json({ data: { success: true } });
          } catch (error) {
            logger.error('Failed to deprovision database:', error);
            res.status(502).json({ error: error instanceof Error ? error.message : 'Failed to remove the database from the host.' });
            return;
          }
        } catch (error) {
          logger.error('Error deleting database:', error);
          res.status(500).json({ error: 'Failed to delete database' });
          return;
        }
      }
    );

    // ── GET /api/v1/servers/:id/subusers ────────────────────────────────────
    router.get(
      '/api/v1/servers/:id/subusers',
      apiValidator('airlink.api.servers.read'),
      async (req: Request, res: Response) => {
        try {
          const server = await prisma.server.findUnique({
            where: { UUID: getParamAsString(req.params.id) },
          });
          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const subUsers = await prisma.subUser.findMany({
            where: { serverId: server.UUID },
            include: { user: { select: { id: true, username: true, email: true } } },
            orderBy: { createdAt: 'asc' },
          });

          res.json({
            data: subUsers.map((s) => {
              let permissions: string[] = [];
              try {
                const parsed = JSON.parse(s.permissions);
                if (Array.isArray(parsed)) permissions = parsed;
              } catch {
                // ignore malformed permission payloads
              }
              return {
                id: s.id,
                user: s.user,
                permissions,
                createdAt: s.createdAt,
              };
            }),
          });
        } catch (error) {
          logger.error('Error fetching subusers:', error);
          res.status(500).json({ error: 'Failed to fetch subusers' });
          return;
        }
      }
    );

    // ── POST /api/v1/servers/:id/subusers ───────────────────────────────────
    router.post(
      '/api/v1/servers/:id/subusers',
      apiValidator('airlink.api.servers.update'),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params.id);
        const { email, permissions } = req.body as { email?: string; permissions?: unknown };

        if (!email || typeof email !== 'string' || email.trim() === '') {
          res.status(400).json({ error: 'Email is required' });
          return;
        }
        if (!Array.isArray(permissions)) {
          res.status(400).json({ error: 'Permissions must be an array' });
          return;
        }

        try {
          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
          });
          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const target = await prisma.users.findUnique({ where: { email: email.trim().toLowerCase() } });
          if (!target) {
            res.status(404).json({ error: 'No user found with that email.' });
            return;
          }

          const existing = await prisma.subUser.findUnique({
            where: { serverId_userId: { serverId: server.UUID, userId: target.id } },
          });
          if (existing) {
            res.status(409).json({ error: 'That user is already a subuser of this server.' });
            return;
          }

          const subUser = await prisma.subUser.create({
            data: {
              serverId: server.UUID,
              userId: target.id,
              permissions: JSON.stringify(permissions),
            },
          });

          await apiAudit(req, 'subuser:create', serverId, { targetUserId: target.id });
          res.status(201).json({ data: { id: subUser.id, user: { id: target.id, username: target.username, email: target.email }, permissions, createdAt: subUser.createdAt } });
        } catch (error) {
          logger.error('Error adding subuser:', error);
          res.status(500).json({ error: 'Failed to add subuser' });
          return;
        }
      }
    );

    // ── PATCH /api/v1/servers/:id/subusers/:subUserId ───────────────────────
    router.patch(
      '/api/v1/servers/:id/subusers/:subUserId',
      apiValidator('airlink.api.servers.update'),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params.id);
        const subUserId = parseInt(getParamAsString(req.params.subUserId), 10);
        const { permissions } = req.body as { permissions?: unknown };

        if (!Array.isArray(permissions)) {
          res.status(400).json({ error: 'Permissions must be an array' });
          return;
        }

        try {
          const server = await prisma.server.findUnique({ where: { UUID: serverId } });
          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const subUser = await prisma.subUser.findFirst({ where: { id: subUserId, serverId: server.UUID } });
          if (!subUser) {
            res.status(404).json({ error: 'Subuser not found' });
            return;
          }

          await prisma.subUser.update({
            where: { id: subUser.id },
            data: { permissions: JSON.stringify(permissions) },
          });

          await apiAudit(req, 'subuser:update', serverId, { subUserId });
          res.json({ data: { success: true, permissions } });
        } catch (error) {
          logger.error('Error updating subuser permissions:', error);
          res.status(500).json({ error: 'Failed to update subuser permissions' });
          return;
        }
      }
    );

    // ── DELETE /api/v1/servers/:id/subusers/:subUserId ──────────────────────
    router.delete(
      '/api/v1/servers/:id/subusers/:subUserId',
      apiValidator('airlink.api.servers.update'),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params.id);
        const subUserId = parseInt(getParamAsString(req.params.subUserId), 10);

        try {
          const server = await prisma.server.findUnique({ where: { UUID: serverId } });
          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const subUser = await prisma.subUser.findFirst({ where: { id: subUserId, serverId: server.UUID } });
          if (!subUser) {
            res.status(404).json({ error: 'Subuser not found' });
            return;
          }

          await prisma.subUser.delete({ where: { id: subUser.id } });
          await apiAudit(req, 'subuser:delete', serverId, { subUserId });
          res.json({ data: { success: true } });
        } catch (error) {
          logger.error('Error removing subuser:', error);
          res.status(500).json({ error: 'Failed to remove subuser' });
          return;
        }
      }
    );

    // ── GET /api/v1/servers/:id/startup ─────────────────────────────────────
    router.get(
      '/api/v1/servers/:id/startup',
      apiValidator('airlink.api.servers.read'),
      async (req: Request, res: Response) => {
        try {
          const server = await prisma.server.findUnique({
            where: { UUID: getParamAsString(req.params.id) },
            include: { image: true },
          });
          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          let variables: unknown[] = [];
          try {
            const parsed = JSON.parse(server.Variables || '[]');
            if (Array.isArray(parsed)) variables = parsed;
          } catch {
            // ignore malformed variables
          }

          res.json({
            data: {
              startCommand: server.StartCommand,
              dockerImage: (() => {
                try {
                  const d = JSON.parse(server.dockerImage || '{}');
                  return Object.values(d)[0] ?? null;
                } catch {
                  return null;
                }
              })(),
              variables,
            },
          });
        } catch (error) {
          logger.error('Error fetching startup:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    // ── PATCH /api/v1/servers/:id/startup ───────────────────────────────────
    router.patch(
      '/api/v1/servers/:id/startup',
      apiValidator('airlink.api.servers.update'),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params.id);
        const { startCommand, dockerImage, variables } = req.body as {
          startCommand?: string;
          dockerImage?: string;
          variables?: unknown[];
        };

        try {
          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true, image: true },
          });
          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const data: Record<string, unknown> = {};

          if (startCommand !== undefined) {
            data.StartCommand = startCommand;
          }

          if (dockerImage !== undefined) {
            let valid = false;
            let imageObj: Record<string, string> = {};
            let available: string[] = [];
            try {
              const arr = JSON.parse(server.image?.dockerImages || '[]');
              if (Array.isArray(arr)) {
                for (const obj of arr) {
                  for (const key of Object.keys(obj)) {
                    available.push(key);
                    if (key === dockerImage) {
                      valid = true;
                      imageObj = { [key]: obj[key] };
                    }
                  }
                }
              }
            } catch {
              available = [];
            }
            if (!valid) {
              res.status(400).json({ error: 'Invalid Docker image selected' });
              return;
            }
            data.dockerImage = JSON.stringify(imageObj);
          }

          if (variables !== undefined) {
            if (!Array.isArray(variables)) {
              res.status(400).json({ error: 'Variables must be an array' });
              return;
            }
            // Validate against stored rules before persisting.
            let defs: { env?: string; rules?: string; rulesMessage?: string }[] = [];
            try {
              defs = JSON.parse(server.Variables || '[]');
            } catch {
              defs = [];
            }
            const defByEnv = new Map(defs.map((d) => [d.env, d]));
            for (const v of variables as Array<Record<string, unknown>>) {
              const def = defByEnv.get(String(v.env));
              const rulesSource = def ? { ...def, name: def.env, env: def.env, ...(v as object) } : v;
              const err = validateVariableRules(rulesSource as unknown as import('../../user/server/shared').ServerVariable, String(v.value ?? ''));
              if (err) {
                res.status(400).json({ error: 'Variable validation failed.', fields: [{ key: v.env, error: err }] });
                return;
              }
            }
            data.Variables = JSON.stringify(variables);
          }

          if (Object.keys(data).length > 0) {
            await prisma.server.update({ where: { UUID: serverId }, data });
          }

          await apiAudit(req, 'server:update-startup', serverId);
          res.json({ data: { success: true } });
        } catch (error: unknown) {
          const err = error as { body?: { error?: string }; message?: string };
          logger.error('Error updating startup:', error);
          res.status(500).json({ error: `Failed to update startup: ${err.body?.error || err.message || 'Failed to update startup'}` });
          return;
        }
      }
    );

    // ── GET /api/v1/servers/:id/schedules ───────────────────────────────────
    router.get(
      '/api/v1/servers/:id/schedules',
      apiValidator('airlink.api.servers.read'),
      async (req: Request, res: Response) => {
        try {
          const server = await prisma.server.findUnique({
            where: { UUID: getParamAsString(req.params.id) },
          });
          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const schedules = await prisma.schedule.findMany({
            where: { serverId: server.UUID },
            include: { tasks: { orderBy: { order: 'asc' } } },
            orderBy: { createdAt: 'desc' },
          });

          res.json({
            data: schedules.map((s) => ({
              ...s,
              tasks: s.tasks.map((t) => {
                let payload: unknown = {};
                try {
                  payload = JSON.parse(t.payload || '{}');
                } catch {
                  payload = {};
                }
                return { ...t, payload };
              }),
            })),
          });
        } catch (error) {
          logger.error('Error fetching schedules:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    // ── POST /api/v1/servers/:id/schedules ──────────────────────────────────
    router.post(
      '/api/v1/servers/:id/schedules',
      apiValidator('airlink.api.servers.update'),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params.id);
        const { name, cron, timeOffset } = req.body as { name?: string; cron?: string; timeOffset?: unknown };

        if (!name || typeof name !== 'string' || name.trim() === '') {
          res.status(400).json({ error: 'Schedule name is required' });
          return;
        }
        if (!cron || typeof cron !== 'string' || !isValidCron(cron.trim())) {
          res.status(400).json({ error: 'Invalid cron expression.' });
          return;
        }
        const parsedOffset = parseInt(String(timeOffset ?? '0'), 10);
        const offset = Number.isNaN(parsedOffset) ? 0 : Math.min(Math.max(parsedOffset, MIN_TIME_OFFSET), MAX_TIME_OFFSET);

        try {
          const server = await prisma.server.findUnique({ where: { UUID: serverId } });
          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const schedule = await prisma.schedule.create({
            data: {
              serverId: server.UUID,
              name: name.trim(),
              cron: cron.trim(),
              timeOffset: offset,
              nextRunAt: nextRunFromCron(cron.trim()),
            },
          });

          res.status(201).json({ data: schedule });
        } catch (error) {
          logger.error('Error creating schedule:', error);
          res.status(500).json({ error: 'Failed to create schedule' });
          return;
        }
      }
    );

    // ── PATCH /api/v1/servers/:id/schedules/:scheduleId ─────────────────────
    router.patch(
      '/api/v1/servers/:id/schedules/:scheduleId',
      apiValidator('airlink.api.servers.update'),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params.id);
        const scheduleId = parseInt(getParamAsString(req.params.scheduleId), 10);
        const { enabled, timeOffset } = req.body as { enabled?: unknown; timeOffset?: unknown };

        try {
          const server = await prisma.server.findUnique({ where: { UUID: serverId } });
          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const schedule = await prisma.schedule.findFirst({ where: { id: scheduleId, serverId: server.UUID } });
          if (!schedule) {
            res.status(404).json({ error: 'Schedule not found' });
            return;
          }

          let offset = schedule.timeOffset ?? 0;
          if (timeOffset !== undefined) {
            const parsed = parseInt(String(timeOffset), 10);
            offset = Number.isNaN(parsed) ? 0 : Math.min(Math.max(parsed, MIN_TIME_OFFSET), MAX_TIME_OFFSET);
          }

          const wantEnabled = enabled === true || enabled === 'true';
          const updated = await prisma.schedule.update({
            where: { id: schedule.id },
            data: {
              enabled: wantEnabled,
              timeOffset: offset,
              nextRunAt: wantEnabled ? nextRunFromCron(schedule.cron, offset) : null,
            },
          });

          res.json({ data: updated });
        } catch (error) {
          logger.error('Error toggling schedule:', error);
          res.status(500).json({ error: 'Failed to update schedule' });
          return;
        }
      }
    );

    // ── DELETE /api/v1/servers/:id/schedules/:scheduleId ────────────────────
    router.delete(
      '/api/v1/servers/:id/schedules/:scheduleId',
      apiValidator('airlink.api.servers.update'),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params.id);
        const scheduleId = parseInt(getParamAsString(req.params.scheduleId), 10);

        try {
          const server = await prisma.server.findUnique({ where: { UUID: serverId } });
          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const schedule = await prisma.schedule.findFirst({ where: { id: scheduleId, serverId: server.UUID } });
          if (!schedule) {
            res.status(404).json({ error: 'Schedule not found' });
            return;
          }

          await prisma.schedule.delete({ where: { id: schedule.id } });
          res.json({ data: { success: true } });
        } catch (error) {
          logger.error('Error deleting schedule:', error);
          res.status(500).json({ error: 'Failed to delete schedule' });
          return;
        }
      }
    );

    // ── POST /api/v1/servers/:id/schedules/:scheduleId/tasks ───────────────
    router.post(
      '/api/v1/servers/:id/schedules/:scheduleId/tasks',
      apiValidator('airlink.api.servers.update'),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params.id);
        const scheduleId = parseInt(getParamAsString(req.params.scheduleId), 10);
        const { action, payload, timeOffset = 0 } = req.body as {
          action?: string;
          payload?: Record<string, unknown>;
          timeOffset?: unknown;
        };

        if (!action || !(TASK_ACTIONS as readonly string[]).includes(action)) {
          res.status(400).json({ error: 'Task action must be one of: command, power, backup.' });
          return;
        }
        if (!payload || typeof payload !== 'object') {
          res.status(400).json({ error: 'Task payload is required.' });
          return;
        }
        if (action === 'command' && !String(payload.command ?? '').trim()) {
          res.status(400).json({ error: 'Command is required.' });
          return;
        }
        if (action === 'power' && !(POWER_ACTIONS as readonly string[]).includes(String(payload.action ?? ''))) {
          res.status(400).json({ error: 'Power action must be one of: start, stop, restart, kill.' });
          return;
        }
        if (action === 'backup' && !String(payload.name ?? '').trim()) {
          res.status(400).json({ error: 'Backup name is required.' });
          return;
        }

        try {
          const server = await prisma.server.findUnique({ where: { UUID: serverId } });
          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const schedule = await prisma.schedule.findFirst({ where: { id: scheduleId, serverId: server.UUID } });
          if (!schedule) {
            res.status(404).json({ error: 'Schedule not found' });
            return;
          }

          const taskCount = await prisma.scheduleTask.count({ where: { scheduleId: schedule.id } });

          const task = await prisma.scheduleTask.create({
            data: {
              scheduleId: schedule.id,
              order: taskCount,
              action,
              payload: JSON.stringify(payload),
              timeOffset: Math.max(0, parseInt(String(timeOffset), 10) || 0),
            },
          });

          res.status(201).json({ data: { ...task, payload } });
        } catch (error) {
          logger.error('Error adding schedule task:', error);
          res.status(500).json({ error: 'Failed to add task' });
          return;
        }
      }
    );

    // ── DELETE /api/v1/servers/:id/schedules/:scheduleId/tasks/:taskId ─────
    router.delete(
      '/api/v1/servers/:id/schedules/:scheduleId/tasks/:taskId',
      apiValidator('airlink.api.servers.update'),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params.id);
        const scheduleId = parseInt(getParamAsString(req.params.scheduleId), 10);
        const taskId = parseInt(getParamAsString(req.params.taskId), 10);

        try {
          const server = await prisma.server.findUnique({ where: { UUID: serverId } });
          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const schedule = await prisma.schedule.findFirst({ where: { id: scheduleId, serverId: server.UUID } });
          if (!schedule) {
            res.status(404).json({ error: 'Schedule not found' });
            return;
          }

          const task = await prisma.scheduleTask.findFirst({ where: { id: taskId, scheduleId: schedule.id } });
          if (!task) {
            res.status(404).json({ error: 'Task not found' });
            return;
          }

          await prisma.scheduleTask.delete({ where: { id: task.id } });
          res.json({ data: { success: true } });
        } catch (error) {
          logger.error('Error removing schedule task:', error);
          res.status(500).json({ error: 'Failed to remove task' });
          return;
        }
      }
    );

    // ── GET /api/v1/nodes/:id/allocations ───────────────────────────────────
    router.get(
      '/api/v1/nodes/:id/allocations',
      apiValidator('airlink.api.nodes.read'),
      async (req: Request, res: Response) => {
        try {
          const nodeId = getParamAsNumber(req.params.id);
          const node = await prisma.node.findUnique({ where: { id: nodeId } });
          if (!node) {
            res.status(404).json({ error: 'Node not found' });
            return;
          }

          const allocations = await prisma.allocation.findMany({
            where: { nodeId },
            include: { server: { select: { UUID: true, name: true } } },
            orderBy: { port: 'asc' },
          });

          res.json({ data: allocations });
        } catch (error) {
          logger.error('Error fetching allocations:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    // ── POST /api/v1/nodes/:id/allocations ─────────────────────────────────
    router.post(
      '/api/v1/nodes/:id/allocations',
      apiValidator('airlink.api.nodes.update'),
      async (req: Request, res: Response) => {
        const nodeId = getParamAsNumber(req.params.id);
        const { ip, port } = req.body as { ip?: string; port?: unknown };

        try {
          const node = await prisma.node.findUnique({ where: { id: nodeId } });
          if (!node) {
            res.status(404).json({ error: 'Node not found' });
            return;
          }

          const parsedPort = parseInt(String(port), 10);
          if (isNaN(parsedPort) || parsedPort < MIN_PORT_NUMBER || parsedPort > MAX_PORT_NUMBER) {
            res.status(422).json({ error: `Port must be a number between ${MIN_PORT_NUMBER} and ${MAX_PORT_NUMBER}` });
            return;
          }

          await withNodePortLock(nodeId, async () => {
            const pool = await getNodePortPool(nodeId);
            const next = Array.from(new Set([...pool, parsedPort])).sort((a, b) => a - b);
            await syncNodeAllocations(nodeId, next, String(ip ?? ''));
            // Keep the admin-configured pool in sync with the new row.
            await prisma.node.update({
              where: { id: nodeId },
              data: { allocatedPorts: JSON.stringify(next) },
            });
          });

          const allocation = await prisma.allocation.findUnique({
            where: { nodeId_ip_port: { nodeId, ip: String(ip ?? ''), port: parsedPort } },
          });

          await apiAudit(req, 'allocation:create', undefined, { nodeId, port: parsedPort });
          res.status(201).json({ data: allocation });
        } catch (error) {
          logger.error('Error creating allocation:', error);
          res.status(500).json({ error: 'Failed to create allocation' });
          return;
        }
      }
    );

    // ── DELETE /api/v1/nodes/:id/allocations/:allocationId ────────────────
    router.delete(
      '/api/v1/nodes/:id/allocations/:allocationId',
      apiValidator('airlink.api.nodes.update'),
      async (req: Request, res: Response) => {
        const nodeId = getParamAsNumber(req.params.id);
        const allocationId = getParamAsNumber(req.params.allocationId);

        try {
          const node = await prisma.node.findUnique({ where: { id: nodeId } });
          if (!node) {
            res.status(404).json({ error: 'Node not found' });
            return;
          }

          const allocation = await prisma.allocation.findUnique({ where: { id: allocationId } });
          if (!allocation || allocation.nodeId !== nodeId) {
            res.status(404).json({ error: 'Allocation not found' });
            return;
          }
          if (allocation.serverId) {
            res.status(409).json({ error: 'Allocation is in use and cannot be deleted.' });
            return;
          }

          await withNodePortLock(nodeId, async () => {
            await prisma.allocation.delete({ where: { id: allocation.id } });
            const pool = await getNodePortPool(nodeId);
            await prisma.node.update({
              where: { id: nodeId },
              data: { allocatedPorts: JSON.stringify(pool) },
            });
          });

          await apiAudit(req, 'node:delete-allocation', undefined, { nodeId, port: allocation.port });
          res.json({ data: { success: true } });
        } catch (error) {
          logger.error('Error deleting allocation:', error);
          res.status(500).json({ error: 'Failed to delete allocation' });
          return;
        }
      }
    );

    // ── GET /api/v1/images ──────────────────────────────────────────────────
    router.get(
      '/api/v1/images',
      apiValidator('airlink.api.images.read'),
      async (req: Request, res: Response) => {
        try {
          const page = Number(req.query.page) || 1;
          const perPage = Number(req.query.per_page) || DEFAULT_PAGE_SIZE;

          const images = await prisma.images.findMany({
            select: {
              id: true,
              UUID: true,
              name: true,
              description: true,
              author: true,
              authorName: true,
              startup: true,
              stop: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          });

          res.json(paginate(images, page, perPage));
        } catch (error) {
          logger.error('Error fetching images:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    // ── POST /api/v1/images ─────────────────────────────────────────────────
    router.post(
      '/api/v1/images',
      apiValidator('airlink.api.images.create'),
      async (req: Request, res: Response) => {
        try {
          const { name, description, author, authorName, startup, stop } = req.body as {
            name?: string;
            description?: string;
            author?: string;
            authorName?: string;
            startup?: string;
            stop?: string;
          };

          if (!name || typeof name !== 'string' || name.trim() === '') {
            res.status(422).json({ error: 'Image name is required' });
            return;
          }
          if (!startup || typeof startup !== 'string' || startup.trim() === '') {
            res.status(422).json({ error: 'Image startup command is required' });
            return;
          }

          const image = await prisma.images.create({
            data: {
              name: name.trim(),
              description: description ?? '',
              author: author ?? '',
              authorName: authorName ?? '',
              startup: startup.trim(),
              stop: stop ?? 'stop',
              startup_done: '',
              config_files: '',
              meta: JSON.stringify({ version: 'AL_V1' }),
              dockerImages: JSON.stringify([]),
              info: JSON.stringify({ features: [] }),
              scripts: JSON.stringify({}),
              variables: JSON.stringify([]),
              portRequirements: JSON.stringify([]),
            },
            select: {
              id: true,
              UUID: true,
              name: true,
              description: true,
              startup: true,
              createdAt: true,
            },
          });

          await apiAudit(req, 'image:create', undefined, { imageId: image.id, name: image.name });
          res.status(201).json({ data: image });
        } catch (error) {
          logger.error('Error creating image:', error);
          res.status(500).json({ error: 'Failed to create image' });
          return;
        }
      }
    );

    // ── GET /api/v1/images/:id ──────────────────────────────────────────────
    router.get(
      '/api/v1/images/:id',
      apiValidator('airlink.api.images.read'),
      async (req: Request, res: Response) => {
        try {
          const image = await prisma.images.findUnique({
            where: { id: getParamAsNumber(req.params.id) },
          });
          if (!image) {
            res.status(404).json({ error: 'Image not found' });
            return;
          }
          res.json({ data: image });
        } catch (error) {
          logger.error('Error fetching image:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    // ── PATCH /api/v1/images/:id ────────────────────────────────────────────
    router.patch(
      '/api/v1/images/:id',
      apiValidator('airlink.api.images.update'),
      async (req: Request, res: Response) => {
        try {
          const imageId = getParamAsNumber(req.params.id);
          const existing = await prisma.images.findUnique({ where: { id: imageId } });
          if (!existing) {
            res.status(404).json({ error: 'Image not found' });
            return;
          }

          const { name, description, author, authorName, startup, stop, startup_done, config_files, dockerImages, variables, info, scripts, portRequirements } = req.body as Record<string, unknown>;

          const data: Record<string, unknown> = {};
          if (name !== undefined) data.name = name;
          if (description !== undefined) data.description = description;
          if (author !== undefined) data.author = author;
          if (authorName !== undefined) data.authorName = authorName;
          if (startup !== undefined) data.startup = startup;
          if (stop !== undefined) data.stop = stop;
          if (startup_done !== undefined) data.startup_done = startup_done;
          if (config_files !== undefined) data.config_files = config_files;
          if (dockerImages !== undefined) data.dockerImages = JSON.stringify(dockerImages);
          if (variables !== undefined) data.variables = JSON.stringify(variables);
          if (info !== undefined) data.info = JSON.stringify(info);
          if (scripts !== undefined) data.scripts = JSON.stringify(scripts);
          if (portRequirements !== undefined) data.portRequirements = JSON.stringify(portRequirements);

          const image = await prisma.images.update({
            where: { id: imageId },
            data,
            select: {
              id: true,
              UUID: true,
              name: true,
              description: true,
              startup: true,
              createdAt: true,
            },
          });

          await apiAudit(req, 'image:update', undefined, { imageId, name: image.name });
          res.json({ data: image });
        } catch (error) {
          logger.error('Error updating image:', error);
          res.status(500).json({ error: 'Failed to update image' });
          return;
        }
      }
    );

    // ── DELETE /api/v1/images/:id ───────────────────────────────────────────
    router.delete(
      '/api/v1/images/:id',
      apiValidator('airlink.api.images.delete'),
      async (req: Request, res: Response) => {
        try {
          const imageId = getParamAsNumber(req.params.id);
          const serverCount = await prisma.server.count({ where: { imageId } });
          if (serverCount > 0) {
            res.status(409).json({ error: 'This image is in use by one or more servers.' });
            return;
          }

          const existing = await prisma.images.findUnique({ where: { id: imageId }, select: { name: true } });
          if (!existing) {
            res.status(404).json({ error: 'Image not found' });
            return;
          }

          await prisma.images.delete({ where: { id: imageId } });
          await apiAudit(req, 'image:delete', undefined, { imageId, name: existing.name });
          res.json({ data: { success: true } });
        } catch (error) {
          logger.error('Error deleting image:', error);
          res.status(500).json({ error: 'Failed to delete image' });
          return;
        }
      }
    );

    // ── GET /api/v1/locations ───────────────────────────────────────────────
    router.get(
      '/api/v1/locations',
      apiValidator('airlink.api.locations.read'),
      async (req: Request, res: Response) => {
        try {
          const page = Number(req.query.page) || 1;
          const perPage = Number(req.query.per_page) || DEFAULT_PAGE_SIZE;

          const locations = await prisma.location.findMany({
            include: { _count: { select: { nodes: true } } },
            orderBy: { name: 'asc' },
          });

          res.json(paginate(locations, page, perPage));
        } catch (error) {
          logger.error('Error fetching locations:', error);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }
      }
    );

    // ── POST /api/v1/locations ──────────────────────────────────────────────
    router.post(
      '/api/v1/locations',
      apiValidator('airlink.api.locations.create'),
      async (req: Request, res: Response) => {
        try {
          const { name, shortCode } = req.body as { name?: string; shortCode?: string };
          const cleanName = typeof name === 'string' ? name.trim() : '';
          const cleanShortCode = typeof shortCode === 'string' ? shortCode.trim().toLowerCase() : '';

          if (cleanName.length < 2 || cleanName.length > 50) {
            res.status(422).json({ error: 'Name must be between 2 and 50 characters.' });
            return;
          }
          if (!/^[a-z0-9-]{2,32}$/.test(cleanShortCode)) {
            res.status(422).json({ error: 'Short code must be 2-32 chars: lowercase letters, numbers, dashes.' });
            return;
          }

          const existing = await prisma.location.findUnique({ where: { shortCode: cleanShortCode } });
          if (existing) {
            res.status(409).json({ error: 'A location with this short code already exists.' });
            return;
          }

          const location = await prisma.location.create({ data: { name: cleanName, shortCode: cleanShortCode } });
          await apiAudit(req, 'location:create', undefined, { locationId: location.id, name: location.name });
          res.status(201).json({ data: location });
        } catch (error) {
          logger.error('Error creating location:', error);
          res.status(500).json({ error: 'Failed to create location' });
          return;
        }
      }
    );

    return router;
  },
};

export default coreModule;
