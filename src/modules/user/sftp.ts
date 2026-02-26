import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { isAuthenticatedForServer } from '../../handlers/utils/auth/serverAuthUtil';
import { getParamAsString } from '../../utils/typeHelpers';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import logger from '../../handlers/logger';

const prisma = new PrismaClient();

const sftpModule: Module = {
  info: {
    name: 'SFTP Module',
    description: 'Provides SFTP credential generation for server file access.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/server/:id/sftp/credentials',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params?.id);

        if (!serverId) {
          res.status(400).json({ error: 'Server ID is required.' });
          return;
        }

        try {
          const stored = await (prisma as any).sftpCredential.findUnique({
            where: { serverId },
          });

          if (!stored) {
            res.status(404).json({ error: 'No credentials found.' });
            return;
          }

          res.json({
            username: stored.username,
            password: stored.password,
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

          // Revoke existing credential on the daemon if one exists
          const existing = await (prisma as any).sftpCredential.findUnique({
            where: { serverId },
          });

          if (existing) {
            try {
              await axios({
                method: 'DELETE',
                url: `http://${server.node.address}:${server.node.port}/sftp/credentials`,
                data: { id: server.UUID },
                auth: { username: 'Airlink', password: server.node.key },
                timeout: 10000,
              });
            } catch {
              // Daemon revocation failure is non-fatal; proceed to regenerate
            }
          }

          const response = await axios({
            method: 'POST',
            url: `http://${server.node.address}:${server.node.port}/sftp/credentials`,
            data: { id: server.UUID },
            auth: { username: 'Airlink', password: server.node.key },
            timeout: 15000,
          });

          //const sftpPort = (server.node as any).sftpPort ?? 3003;
          const { username, password, host, expiresAt } = response.data;

          await (prisma as any).sftpCredential.upsert({
            where: { serverId },
            update: { username, password, host, port: sftpPort, expiresAt: expiresAt ? new Date(expiresAt) : null },
            create: { serverId, username, password, host, port: sftpPort, expiresAt: expiresAt ? new Date(expiresAt) : null },
          });

          res.json({ username, password, host, port: sftpPort, expiresAt });
        } catch (error) {
          if (axios.isAxiosError(error)) {
            const status = error.response?.status || 500;
            const message = error.response?.data?.error || 'Failed to generate SFTP credentials.';
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

          await axios({
            method: 'DELETE',
            url: `http://${server.node.address}:${server.node.port}/sftp/credentials`,
            data: { id: server.UUID },
            auth: { username: 'Airlink', password: server.node.key },
            timeout: 10000,
          });

          await (prisma as any).sftpCredential.deleteMany({
            where: { serverId },
          });

          res.json({ message: 'SFTP credentials revoked.' });
        } catch (error) {
          if (axios.isAxiosError(error)) {
            const status = error.response?.status || 500;
            const message = error.response?.data?.error || 'Failed to revoke SFTP credentials.';
            res.status(status).json({ error: message });
          } else {
            logger.error('SFTP revocation error:', error);
            res.status(500).json({ error: 'Internal error while revoking SFTP credentials.' });
          }
        }
      },
    );

    return router;
  },
};

export default sftpModule;
