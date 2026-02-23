import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticatedForServer } from '../../handlers/utils/auth/serverAuthUtil';
import logger from '../../handlers/logger';
import crypto from 'crypto';
import { getParamAsString } from '../../utils/typeHelpers';
import { checkForServerInstallation } from '../../handlers/checkForServerInstallation';

const prisma = new PrismaClient();

function generateSftpPassword(): string {
  return crypto.randomBytes(18).toString('base64url');
}

const sftpModule: Module = {
  info: {
    name: 'SFTP Module',
    description: 'SFTP credential management for server file access.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/server/:id/sftp',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const serverId = req.params?.id;

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect('/login');
          }

          const server = await prisma.server.findUnique({
            where: { UUID: getParamAsString(serverId) },
            include: { node: true, image: true, owner: true },
          });

          const settings = await prisma.settings.findUnique({ where: { id: 1 } });

          if (!server) {
            return res.redirect('/');
          }

          let sftpCredential = await (prisma as any).sftpCredential.findUnique({
            where: { serverUUID: server.UUID },
          });

          if (!sftpCredential) {
            sftpCredential = await (prisma as any).sftpCredential.create({
              data: {
                serverUUID: server.UUID,
                userId: user.id,
                password: generateSftpPassword(),
              },
            });
          }

          const sftpPort = server.node.port + 1;

          const features = (() => {
            try {
              const info = typeof server.image.info === 'string'
                ? JSON.parse(server.image.info)
                : server.image.info;
              return Array.isArray(info?.features) ? info.features : [];
            } catch {
              return [];
            }
          })();

          res.render('user/server/sftp', {
            user,
            req,
            server,
            settings,
            features,
            installed: await checkForServerInstallation(getParamAsString(serverId)),
            sftp: {
              host: server.node.address,
              port: sftpPort,
              username: `${server.UUID}.${user.username}`,
              password: sftpCredential.password,
            },
          });
        } catch (error) {
          logger.error('Error loading SFTP page:', error);
          res.status(500).send('Failed to load SFTP details');
        }
      },
    );

    router.post(
      '/server/:id/sftp/regenerate',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const serverId = req.params?.id;

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
          }

          const server = await prisma.server.findUnique({
            where: { UUID: getParamAsString(serverId) },
          });

          if (!server) {
            return res.status(404).json({ error: 'Server not found' });
          }

          const newPassword = generateSftpPassword();

          await (prisma as any).sftpCredential.upsert({
            where: { serverUUID: server.UUID },
            update: { password: newPassword, userId: user.id },
            create: {
              serverUUID: server.UUID,
              userId: user.id,
              password: newPassword,
            },
          });

          res.json({ password: newPassword });
        } catch (error) {
          logger.error('Error regenerating SFTP credentials:', error);
          res.status(500).json({ error: 'Failed to regenerate credentials' });
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

export default sftpModule;
