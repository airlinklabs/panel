import { Router, Request, Response } from 'express';
import { Module } from '../../../handlers/moduleInit';
import prisma from '../../../db';
import logger from '../../../handlers/logger';
import { apiValidator } from '../../../handlers/utils/api/apiValidator';
import { getParamAsString } from '../../../utils/typeHelpers';
import { daemonRequest } from '../../../handlers/utils/core/daemonRequest';
import { startServerContainer } from '../../user/server/shared';
import { logActivity } from '../../../handlers/utils/activity/activityLogger';
import { nextRunFromCron } from '../../../utils/cron';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AuthenticatedRequest = Request & { apiKey?: { userId?: number } };

function getApiKeyUserId(req: Request): number | undefined {
  return (req as AuthenticatedRequest).apiKey?.userId;
}

function jsonError(res: Response, error: string, status = 400): void {
  res.status(status).json({ error });
}

async function resolveServerForUser(serverId: string, userId: number) {
  const server = await prisma.server.findUnique({
    where: { UUID: serverId },
    include: { node: true },
  });
  if (!server) return null;
  if (server.ownerId === userId) return server;
  const subUser = await prisma.subUser.findFirst({
    where: { serverId: server.UUID, userId },
  });
  if (!subUser) return null;
  return server;
}

// ---------------------------------------------------------------------------
// Client API Module
// ---------------------------------------------------------------------------

const clientApiModule: Module = {
  info: {
    name: 'Client API Module',
    description: 'User-facing API for server management via API keys.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    // All /api/client/* routes require a valid API key.
    // The key must belong to a user (userId set). Admin keys also work.
    router.use('/api/client', apiValidator());

    // -----------------------------------------------------------------------
    // Servers
    // -----------------------------------------------------------------------

    router.get('/api/client/servers', async (req: Request, res: Response) => {
      try {
        const userId = getApiKeyUserId(req);
        if (!userId) return jsonError(res, 'API key must be associated with a user', 403);

        const servers = await prisma.server.findMany({
          where: { ownerId: userId },
          select: {
            UUID: true,
            name: true,
            description: true,
            Installing: true,
            Queued: true,
            Suspended: true,
            nodeId: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        res.json({ data: servers });
      } catch (err) {
        logger.error('Client API: list servers error', err);
        jsonError(res, 'Internal error', 500);
      }
    });

    router.get('/api/client/servers/:id', async (req: Request, res: Response) => {
      try {
        const userId = getApiKeyUserId(req);
        if (!userId) return jsonError(res, 'API key must be associated with a user', 403);

        const serverId = getParamAsString(req.params.id);
        const server = await resolveServerForUser(serverId, userId);
        if (!server) return jsonError(res, 'Server not found', 404);

        res.json({
          data: {
            UUID: server.UUID,
            name: server.name,
            description: server.description,
            Installing: server.Installing,
            Queued: server.Queued,
            Suspended: server.Suspended,
            nodeId: server.nodeId,
            createdAt: server.createdAt,
          },
        });
      } catch (err) {
        logger.error('Client API: get server error', err);
        jsonError(res, 'Internal error', 500);
      }
    });

    // -----------------------------------------------------------------------
    // Power
    // -----------------------------------------------------------------------

    router.post('/api/client/servers/:id/power', async (req: Request, res: Response) => {
      try {
        const userId = getApiKeyUserId(req);
        if (!userId) return jsonError(res, 'API key must be associated with a user', 403);

        const serverId = getParamAsString(req.params.id);
        const server = await resolveServerForUser(serverId, userId);
        if (!server) return jsonError(res, 'Server not found', 404);

        const { action } = req.body as { action?: string };
        if (!action || !['start', 'stop', 'restart', 'kill'].includes(action)) {
          return jsonError(res, 'action must be start, stop, restart, or kill');
        }

        if (server.Suspended) return jsonError(res, 'Server is suspended', 403);

        if (action === 'start') {
          // start requires the full runtime config (image, env, ports, limits);
          // resolve it here instead of sending a bare { id } that the daemon rejects
          const fullServer = await prisma.server.findUnique({
            where: { UUID: server.UUID },
            include: { node: true, image: true },
          });
          if (!fullServer) {
            return jsonError(res, 'Server not found', 404);
          }
          await startServerContainer(fullServer, server.UUID);
        } else {
          const method = action === 'kill' ? 'DELETE' : 'POST';
          const path = action === 'kill' ? '/container/kill' : `/container/${action}`;

          await daemonRequest({
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            nodeKey: server.node.key,
            method,
            path,
            body: { id: server.UUID },
            timeout: 30000,
          });
        }

        await logActivity(req, `server:${action}` as Parameters<typeof logActivity>[1], {
          serverId: server.UUID,
          metadata: { source: 'client-api' },
        });

        res.json({ message: `${action} signal sent` });
      } catch (err) {
        logger.error('Client API: power action error', err);
        jsonError(res, 'Failed to execute power action', 500);
      }
    });

    // -----------------------------------------------------------------------
    // Files
    // -----------------------------------------------------------------------

    router.get('/api/client/servers/:id/files', async (req: Request, res: Response) => {
      try {
        const userId = getApiKeyUserId(req);
        if (!userId) return jsonError(res, 'API key must be associated with a user', 403);

        const serverId = getParamAsString(req.params.id);
        const server = await resolveServerForUser(serverId, userId);
        if (!server) return jsonError(res, 'Server not found', 404);

        const dir = (req.query.dir as string) || '/';

        const response = await daemonRequest({
          nodeAddress: server.node.address,
          nodePort: server.node.port,
          nodeKey: server.node.key,
          method: 'GET',
          path: '/fs/list',
          params: { id: server.UUID, path: dir },
          timeout: 15000,
        });

        res.json({ data: response.data });
      } catch (err) {
        logger.error('Client API: list files error', err);
        jsonError(res, 'Failed to list files', 500);
      }
    });

    router.get('/api/client/servers/:id/files/content', async (req: Request, res: Response) => {
      try {
        const userId = getApiKeyUserId(req);
        if (!userId) return jsonError(res, 'API key must be associated with a user', 403);

        const serverId = getParamAsString(req.params.id);
        const server = await resolveServerForUser(serverId, userId);
        if (!server) return jsonError(res, 'Server not found', 404);

        const file = req.query.file as string;
        if (!file) return jsonError(res, 'file query parameter is required');

        const response = await daemonRequest({
          nodeAddress: server.node.address,
          nodePort: server.node.port,
          nodeKey: server.node.key,
          method: 'GET',
          path: '/fs/file/content',
          params: { id: server.UUID, path: file },
          timeout: 15000,
        });

        res.json({ data: response.data });
      } catch (err) {
        logger.error('Client API: read file error', err);
        jsonError(res, 'Failed to read file', 500);
      }
    });

    router.post('/api/client/servers/:id/files/content', async (req: Request, res: Response) => {
      try {
        const userId = getApiKeyUserId(req);
        if (!userId) return jsonError(res, 'API key must be associated with a user', 403);

        const serverId = getParamAsString(req.params.id);
        const server = await resolveServerForUser(serverId, userId);
        if (!server) return jsonError(res, 'Server not found', 404);

        const { file, content } = req.body as { file?: string; content?: string };
        if (!file || content === undefined) return jsonError(res, 'file and content are required');

        await daemonRequest({
          nodeAddress: server.node.address,
          nodePort: server.node.port,
          nodeKey: server.node.key,
          method: 'POST',
          path: '/fs/file/content',
          body: { id: server.UUID, path: file, content },
          timeout: 15000,
        });

        await logActivity(req, 'file:edit', {
          serverId: server.UUID,
          metadata: { path: file, source: 'client-api' },
        });

        res.json({ message: 'File saved' });
      } catch (err) {
        logger.error('Client API: write file error', err);
        jsonError(res, 'Failed to write file', 500);
      }
    });

    router.delete('/api/client/servers/:id/files', async (req: Request, res: Response) => {
      try {
        const userId = getApiKeyUserId(req);
        if (!userId) return jsonError(res, 'API key must be associated with a user', 403);

        const serverId = getParamAsString(req.params.id);
        const server = await resolveServerForUser(serverId, userId);
        if (!server) return jsonError(res, 'Server not found', 404);

        const { file } = req.body as { file?: string };
        if (!file) return jsonError(res, 'file is required');

        await daemonRequest({
          nodeAddress: server.node.address,
          nodePort: server.node.port,
          nodeKey: server.node.key,
          method: 'DELETE',
          path: '/fs/rm',
          body: { id: server.UUID, path: file },
          timeout: 15000,
        });

        await logActivity(req, 'file:delete', {
          serverId: server.UUID,
          metadata: { path: file, source: 'client-api' },
        });

        res.json({ message: 'File deleted' });
      } catch (err) {
        logger.error('Client API: delete file error', err);
        jsonError(res, 'Failed to delete file', 500);
      }
    });

    router.post('/api/client/servers/:id/files/rename', async (req: Request, res: Response) => {
      try {
        const userId = getApiKeyUserId(req);
        if (!userId) return jsonError(res, 'API key must be associated with a user', 403);

        const serverId = getParamAsString(req.params.id);
        const server = await resolveServerForUser(serverId, userId);
        if (!server) return jsonError(res, 'Server not found', 404);

        const { file, newname } = req.body as { file?: string; newname?: string };
        if (!file || !newname) return jsonError(res, 'file and newname are required');

        await daemonRequest({
          nodeAddress: server.node.address,
          nodePort: server.node.port,
          nodeKey: server.node.key,
          method: 'POST',
          path: '/fs/rename',
          body: { id: server.UUID, path: file, newName: newname },
          timeout: 15000,
        });

        await logActivity(req, 'file:rename', {
          serverId: server.UUID,
          metadata: { path: file, newName: newname, source: 'client-api' },
        });

        res.json({ message: 'File renamed' });
      } catch (err) {
        logger.error('Client API: rename file error', err);
        jsonError(res, 'Failed to rename file', 500);
      }
    });

    // -----------------------------------------------------------------------
    // Backups
    // -----------------------------------------------------------------------

    router.get('/api/client/servers/:id/backups', async (req: Request, res: Response) => {
      try {
        const userId = getApiKeyUserId(req);
        if (!userId) return jsonError(res, 'API key must be associated with a user', 403);

        const serverId = getParamAsString(req.params.id);
        const server = await resolveServerForUser(serverId, userId);
        if (!server) return jsonError(res, 'Server not found', 404);

        const backups = await prisma.backup.findMany({
          where: { serverId: server.UUID },
          select: {
            UUID: true,
            name: true,
            createdAt: true,
            locked: true,
            size: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        res.json({ data: backups });
      } catch (err) {
        logger.error('Client API: list backups error', err);
        jsonError(res, 'Internal error', 500);
      }
    });

    router.post('/api/client/servers/:id/backups', async (req: Request, res: Response) => {
      try {
        const userId = getApiKeyUserId(req);
        if (!userId) return jsonError(res, 'API key must be associated with a user', 403);

        const serverId = getParamAsString(req.params.id);
        const server = await resolveServerForUser(serverId, userId);
        if (!server) return jsonError(res, 'Server not found', 404);

        const existingBackups = await prisma.backup.count({ where: { serverId: server.UUID } });
        if (existingBackups >= server.backupLimit) {
          return jsonError(res, 'Backup limit reached', 400);
        }

        const { name } = req.body as { name?: string };
        if (!name) return jsonError(res, 'name is required');

        const response = await daemonRequest<{
          success: boolean;
          backup: { uuid: string; filePath: string; size: number; checksum?: string };
        }>({
          nodeAddress: server.node.address,
          nodePort: server.node.port,
          nodeKey: server.node.key,
          method: 'POST',
          path: '/container/backup',
          body: { id: server.UUID, name },
          timeout: 120000,
        });

        if (!response.data?.success || !response.data?.backup) {
          return jsonError(res, 'Failed to create backup on daemon', 502);
        }

        const backup = await prisma.backup.create({
          data: {
            UUID: response.data.backup.uuid,
            name,
            serverId: server.UUID,
            filePath: response.data.backup.filePath,
            size: BigInt(response.data.backup.size),
            checksum: response.data.backup.checksum ?? null,
          },
        });

        await logActivity(req, 'backup:create', {
          serverId: server.UUID,
          metadata: { name, uuid: backup.UUID, source: 'client-api' },
        });

        res.json({ data: { UUID: backup.UUID, name: backup.name } });
      } catch (err) {
        logger.error('Client API: create backup error', err);
        jsonError(res, 'Failed to create backup', 500);
      }
    });

    router.delete('/api/client/servers/:id/backups/:backupId', async (req: Request, res: Response) => {
      try {
        const userId = getApiKeyUserId(req);
        if (!userId) return jsonError(res, 'API key must be associated with a user', 403);

        const serverId = getParamAsString(req.params.id);
        const server = await resolveServerForUser(serverId, userId);
        if (!server) return jsonError(res, 'Server not found', 404);

        const backupUUID = getParamAsString(req.params.backupId);
        const backup = await prisma.backup.findFirst({
          where: { UUID: backupUUID, serverId: server.UUID },
        });
        if (!backup) return jsonError(res, 'Backup not found', 404);
        if (backup.locked) return jsonError(res, 'Backup is locked', 400);

        await daemonRequest({
          nodeAddress: server.node.address,
          nodePort: server.node.port,
          nodeKey: server.node.key,
          method: 'DELETE',
          path: '/container/backup',
          body: { backupPath: backup.filePath },
          timeout: 30000,
        });

        await prisma.backup.delete({ where: { UUID: backupUUID } });

        await logActivity(req, 'backup:delete', {
          serverId: server.UUID,
          metadata: { name: backup.name, uuid: backupUUID, source: 'client-api' },
        });

        res.json({ message: 'Backup deleted' });
      } catch (err) {
        logger.error('Client API: delete backup error', err);
        jsonError(res, 'Failed to delete backup', 500);
      }
    });

    // -----------------------------------------------------------------------
    // Schedules
    // -----------------------------------------------------------------------

    router.get('/api/client/servers/:id/schedules', async (req: Request, res: Response) => {
      try {
        const userId = getApiKeyUserId(req);
        if (!userId) return jsonError(res, 'API key must be associated with a user', 403);

        const serverId = getParamAsString(req.params.id);
        const server = await resolveServerForUser(serverId, userId);
        if (!server) return jsonError(res, 'Server not found', 404);

        const schedules = await prisma.schedule.findMany({
          where: { serverId: server.UUID },
          select: {
            id: true,
            name: true,
            cron: true,
            enabled: true,
            nextRunAt: true,
            lastRunAt: true,
            createdAt: true,
            tasks: {
              orderBy: { order: 'asc' },
              select: { id: true, action: true, payload: true, order: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        res.json({ data: schedules });
      } catch (err) {
        logger.error('Client API: list schedules error', err);
        jsonError(res, 'Internal error', 500);
      }
    });

    router.post('/api/client/servers/:id/schedules', async (req: Request, res: Response) => {
      try {
        const userId = getApiKeyUserId(req);
        if (!userId) return jsonError(res, 'API key must be associated with a user', 403);

        const serverId = getParamAsString(req.params.id);
        const server = await resolveServerForUser(serverId, userId);
        if (!server) return jsonError(res, 'Server not found', 404);

        const { name, cron, action, payload } = req.body as {
          name?: string;
          cron?: string;
          action?: string;
          payload?: string;
        };
        if (!name || !cron || !action) {
          return jsonError(res, 'name, cron, and action are required');
        }
        if (!['command', 'power', 'backup'].includes(action)) {
          return jsonError(res, 'action must be command, power, or backup');
        }
        if (action === 'power') {
          const parsed = (() => {
            try {
              return JSON.parse(payload ?? '{}');
            } catch {
              return {};
            }
          })() as { action?: string };
          if (!parsed.action || !['start', 'stop', 'restart', 'kill'].includes(parsed.action)) {
            return jsonError(res, 'power payload must include a valid action');
          }
        }

        const schedule = await prisma.schedule.create({
          data: {
            name,
            cron,
            enabled: true,
            nextRunAt: nextRunFromCron(cron.trim()),
            serverId: server.UUID,
            tasks: {
              create: {
                order: 0,
                action,
                payload: payload ?? '{}',
              },
            },
          },
          include: { tasks: { orderBy: { order: 'asc' } } },
        });

        await logActivity(req, 'schedule:create' as Parameters<typeof logActivity>[1], {
          serverId: server.UUID,
          metadata: { name, cron, action, source: 'client-api' },
        });

        res.json({ data: schedule });
      } catch (err) {
        logger.error('Client API: create schedule error', err);
        jsonError(res, 'Failed to create schedule', 500);
      }
    });

    router.delete('/api/client/servers/:id/schedules/:scheduleId', async (req: Request, res: Response) => {
      try {
        const userId = getApiKeyUserId(req);
        if (!userId) return jsonError(res, 'API key must be associated with a user', 403);

        const serverId = getParamAsString(req.params.id);
        const server = await resolveServerForUser(serverId, userId);
        if (!server) return jsonError(res, 'Server not found', 404);

        const scheduleId = parseInt(getParamAsString(req.params.scheduleId), 10);
        if (isNaN(scheduleId)) return jsonError(res, 'Invalid schedule ID');

        const schedule = await prisma.schedule.findFirst({
          where: { id: scheduleId, serverId: server.UUID },
        });
        if (!schedule) return jsonError(res, 'Schedule not found', 404);

        await prisma.schedule.delete({ where: { id: scheduleId } });

        await logActivity(req, 'schedule:delete' as Parameters<typeof logActivity>[1], {
          serverId: server.UUID,
          metadata: { name: schedule.name, source: 'client-api' },
        });

        res.json({ message: 'Schedule deleted' });
      } catch (err) {
        logger.error('Client API: delete schedule error', err);
        jsonError(res, 'Failed to delete schedule', 500);
      }
    });

    // -----------------------------------------------------------------------
    // Introspection
    // -----------------------------------------------------------------------

    router.get('/api/client', (_req: Request, res: Response) => {
      res.json({
        version: 'client-v1',
        endpoints: [
          { method: 'GET', path: '/api/client', description: 'Introspection – list client API routes' },
          { method: 'GET', path: '/api/client/servers', description: 'List your servers' },
          { method: 'GET', path: '/api/client/servers/:id', description: 'Get server details' },
          { method: 'POST', path: '/api/client/servers/:id/power', description: 'Power action (start/stop/restart/kill)' },
          { method: 'GET', path: '/api/client/servers/:id/files', description: 'List files', query: ['dir'] },
          { method: 'GET', path: '/api/client/servers/:id/files/content', description: 'Read file content', query: ['file'] },
          { method: 'POST', path: '/api/client/servers/:id/files/content', description: 'Write file content', body: ['file', 'content'] },
          { method: 'DELETE', path: '/api/client/servers/:id/files', description: 'Delete file', body: ['file'] },
          { method: 'POST', path: '/api/client/servers/:id/files/rename', description: 'Rename file', body: ['file', 'newname'] },
          { method: 'GET', path: '/api/client/servers/:id/backups', description: 'List backups' },
          { method: 'POST', path: '/api/client/servers/:id/backups', description: 'Create backup', body: ['name'] },
          { method: 'DELETE', path: '/api/client/servers/:id/backups/:backupId', description: 'Delete backup' },
          { method: 'GET', path: '/api/client/servers/:id/schedules', description: 'List schedules' },
          { method: 'POST', path: '/api/client/servers/:id/schedules', description: 'Create schedule', body: ['name', 'cron', 'action', 'payload'] },
          { method: 'DELETE', path: '/api/client/servers/:id/schedules/:scheduleId', description: 'Delete schedule' },
        ],
      });
    });

    return router;
  },
};

export default clientApiModule;