import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { isAuthenticatedForServer, requireSubUserPermission } from '../../handlers/utils/auth/serverAuthUtil';
import { getParamAsString } from '../../utils/typeHelpers';
import prisma from '../../db';
import logger from '../../handlers/logger';
import { daemonRequest } from '../../handlers/utils/core/daemonRequest';
import { logActivity } from '../../handlers/utils/activity/activityLogger';
import bcrypt from 'bcryptjs';


const sftpModule: Module = {
  info: {
    name: 'SFTP Module',
    description: 'Provides SFTP credential generation for server file access.',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/server/:id/sftp/credentials',
      isAuthenticatedForServer('id'),
      requireSubUserPermission('files.sftp'),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params?.id);

        if (!serverId) {
          res.status(400).json({ error: 'Server ID is required.' });
          return;
        }

        try {
          const stored = await prisma.sftpCredential.findUnique({
            where: { serverId },
          });

          if (!stored) {
            res.status(404).json({ error: 'No credentials found.' });
            return;
          }

          res.json({
            username: stored.username,
            host: stored.host,
            port: stored.port,
            expiresAt: stored.expiresAt,
          });
        } catch (error) {
          logger.error('SFTP credential fetch error:', error);
          res.status(500).json({ error: 'Internal error while fetching SFTP credentials.' });
        }
      },
    );

    router.post(
      '/server/:id/sftp/credentials',
      isAuthenticatedForServer('id'),
      requireSubUserPermission('files.sftp'),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params?.id);

        if (!serverId) {
          res.status(400).json({ error: 'Server ID is required.' });
          return;
        }

        try {
          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true },
          });

          if (!server) {
            res.status(404).json({ error: 'Server not found.' });
            return;
          }

          const existing = await prisma.sftpCredential.findUnique({
            where: { serverId },
          });

          if (existing) {
            try {
              await daemonRequest({
                nodeAddress: server.node.address,
                nodePort: server.node.port,
                nodeKey: server.node.key,
                method: 'DELETE',
                path: '/sftp/credentials',
                body: { id: server.UUID },
                timeout: 10000,
              });
            } catch {
              // non-fatal, proceed to regenerate
            }
          }

          const response = await daemonRequest<Record<string, unknown>>({
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            nodeKey: server.node.key,
            method: 'POST',
            path: '/sftp/credentials',
            body: { id: server.UUID },
            timeout: 15000,
          });

          if (response.status < 200 || response.status >= 300) {
            const errBody = response.data as Record<string, unknown> | undefined;
            const message =
              typeof errBody?.error === 'string' && errBody.error
                ? errBody.error
                : 'The daemon failed to generate SFTP credentials.';
            res.status(502).json({ error: message });
            return;
          }

          // Validate at the boundary: only persist well-formed credentials.
          const data = response.data;
          const username = typeof data?.username === 'string' ? data.username : '';
          const password = typeof data?.password === 'string' ? data.password : '';
          const port = typeof data?.port === 'number' ? data.port : NaN;
          const expiresAt = typeof data?.expiresAt === 'string' ? data.expiresAt : null;
          const expiresDate = expiresAt ? new Date(expiresAt) : null;

          if (!username || !password || !Number.isInteger(port) || (expiresDate && isNaN(expiresDate.getTime()))) {
            logger.error(`Daemon returned malformed SFTP credentials for server ${serverId}`);
            res.status(502).json({ error: 'The daemon returned invalid SFTP credentials.' });
            return;
          }

          const host = server.node.address;
          const hashedPassword = await bcrypt.hash(password, 12);

          await prisma.sftpCredential.upsert({
            where: { serverId },
            update: { username, password: hashedPassword, host, port, expiresAt: expiresDate },
            create: { serverId, username, password: hashedPassword, host, port, expiresAt: expiresDate },
          });

          res.json({ username, password, host, port, expiresAt });
        } catch (error) {
          if (error instanceof Error && 'status' in error) {
            const httpErr = error as unknown as { status: number; body?: { error?: string } };
            const status = httpErr.status || 500;
            const message = httpErr.body?.error || 'Failed to generate SFTP credentials.';
            res.status(status).json({ error: message });
          } else {
            logger.error('SFTP credential request error:', error);
            res.status(500).json({ error: 'Internal error while generating SFTP credentials.' });
          }
        }
      },
    );

    router.delete(
      '/server/:id/sftp/credentials',
      isAuthenticatedForServer('id'),
      requireSubUserPermission('files.sftp'),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params?.id);

        if (!serverId) {
          res.status(400).json({ error: 'Server ID is required.' });
          return;
        }

        try {
          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true },
          });

          if (!server) {
            res.status(404).json({ error: 'Server not found.' });
            return;
          }

          await daemonRequest({
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            nodeKey: server.node.key,
            method: 'DELETE',
            path: '/sftp/credentials',
            body: { id: server.UUID },
            timeout: 10000,
          });

          await prisma.sftpCredential.deleteMany({
            where: { serverId },
          });

          res.json({ message: 'SFTP credentials revoked.' });
        } catch (error) {
          if (error instanceof Error && 'status' in error) {
            const httpErr = error as unknown as { status: number; body?: { error?: string } };
            const status = httpErr.status || 500;
            const message = httpErr.body?.error || 'Failed to revoke SFTP credentials.';
            res.status(status).json({ error: message });
          } else {
            logger.error('SFTP revocation error:', error);
            res.status(500).json({ error: 'Internal error while revoking SFTP credentials.' });
          }
        }
      },
    );

    router.get(
      '/server/:id/sftp/activity',
      isAuthenticatedForServer('id'),
      requireSubUserPermission('files.sftp'),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params?.id);

        if (!serverId) {
          res.status(400).json({ error: 'Server ID is required.' });
          return;
        }

        try {
          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true },
          });

          if (!server) {
            res.status(404).json({ error: 'Server not found.' });
            return;
          }

          const response = await daemonRequest<{ events: Array<Record<string, unknown>> }>({
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            nodeKey: server.node.key,
            method: 'GET',
            path: '/sftp/activity',
            params: { server: server.UUID },
            timeout: 10000,
          });

          const events = response.data?.events ?? [];

          for (const event of events) {
            const kind = String((event as { kind?: string }).kind ?? '');
            const username = String((event as { username?: string }).username ?? '');
            const ip = String((event as { ip?: string }).ip ?? '');
            const path = String((event as { path?: string; from?: string }).path ?? '');

            // Only real file mutations belong in the audit log. Session
            // lifecycle (connect/disconnect) and view-only reads are noise.
            const mapToAuditEvent: Record<string, string> = {
              write: 'file:sftp-write',
              rename: 'file:sftp-rename',
              remove: 'file:sftp-delete',
              mkdir: 'file:create',
            };
            const auditEvent = mapToAuditEvent[kind];
            if (!auditEvent) continue;

            await logActivity(req, auditEvent as never, {
              serverId,
              metadata: { username, ip, ...(path ? { path } : {}) },
            });
          }

          res.json({ events: events.length });
        } catch (error) {
          logger.error('SFTP activity drain error:', error);
          res.status(500).json({ error: 'Internal error while fetching SFTP activity.' });
        }
      },
    );

    return router;
  },
};

export default sftpModule;
