import { Router, Request, Response } from 'express';
import { isAuthenticatedForServer } from '../../../handlers/utils/auth/serverAuthUtil';
import logger from '../../../handlers/logger';
import axios from 'axios';
import { checkForServerInstallation } from '../../../handlers/checkForServerInstallation';
import { getParamAsString } from '../../../utils/typeHelpers';
import prisma from '../../../db';
import { daemonSchemeSync } from '../../../handlers/utils/core/daemonRequest';
import { AirlinkCloudClient } from '../../../handlers/utils/core/airlinkCloud';

export function registerBackupRoutes(router: Router): void {
  router.get(
    '/server/:id/backups',
    isAuthenticatedForServer('id'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { UUID: getParamAsString(serverId) },
          include: { node: true, image: true },
        });

        if (!server) {
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        const backups = await prisma.backup.findMany({
          where: { serverId: getParamAsString(serverId) },
          orderBy: { createdAt: 'desc' },
        });

        const settings = await prisma.settings.findUnique({
          where: { id: 1 },
        });

        res.render('user/server/backups', {
          user,
          req,
          server,
          backups,
          settings,
          features: JSON.parse(server.image.info || '{}').features || [],
          installed: await checkForServerInstallation(getParamAsString(serverId)),
        });
      } catch (error) {
        logger.error('Error fetching backups:', error);
        res.status(500).json({ error: 'Failed to fetch backups' });
      }
    },
  );

  router.post(
    '/server/:id/backups/create',
    isAuthenticatedForServer('id'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const { name } = req.body;

      if (!name || name.trim() === '') {
        res.status(400).json({ error: 'Backup name is required' });
        return;
      }

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { UUID: getParamAsString(serverId) },
          include: { node: true },
        });

        if (!server) {
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        const settings = await prisma.settings.findUnique({ where: { id: 1 } });
        const isCloudBackupEnabled = settings?.airlinkCloudBackupEnabled && settings?.airlinkCloudApiKey;

        const response = await axios.post(
          `${daemonSchemeSync()}://${server.node.address}:${server.node.port}/container/backup`,
          {
            id: serverId,
            name: name.trim(),
          },
          {
            auth: {
              username: 'Airlink',
              password: server.node.key,
            },
            timeout: 300000,
          },
        );

        if (response.data.success) {
          let airlinkCloudId = null;
          let filePath = response.data.backup.filePath;

          if (isCloudBackupEnabled) {
            try {
              const cloudClient = new AirlinkCloudClient(settings.airlinkCloudApiKey!);

              const downloadResponse = await axios({
                method: 'GET',
                url: `${daemonSchemeSync()}://${server.node.address}:${server.node.port}/container/backup/download`,
                params: { backupPath: filePath },
                auth: { username: 'Airlink', password: server.node.key },
                responseType: 'stream',
              });

              const uniqueCloudFileName = `${getParamAsString(serverId)}_${response.data.backup.uuid}_${Date.now()}.tar.gz`;
              const uploadResult = await cloudClient.uploadFile(
                downloadResponse.data,
                uniqueCloudFileName
              );

              if (uploadResult && uploadResult.id) {
                airlinkCloudId = uploadResult.id;

                await axios.delete(
                  `${daemonSchemeSync()}://${server.node.address}:${server.node.port}/container/backup`,
                  {
                    data: { backupPath: filePath },
                    auth: { username: 'Airlink', password: server.node.key },
                  }
                ).catch(e => logger.warn(`Failed to delete temporary local backup: ${e}`));

                filePath = 'airlink-cloud';
              }
            } catch (cloudError) {
              logger.error('Failed to redirect backup to Airlink Cloud:', cloudError);
            }
          }

          const backup = await prisma.backup.create({
            data: {
              UUID: response.data.backup.uuid,
              name: name.trim(),
              serverId: getParamAsString(serverId),
              filePath: filePath,
              size: BigInt(response.data.backup.size),
              airlinkCloudId: airlinkCloudId,
            },
          });

          res.json({
            success: true,
            message: isCloudBackupEnabled && airlinkCloudId ? 'Backup created and uploaded to Airlink Cloud' : 'Backup created successfully',
            backup: {
              ...backup,
              size: backup.size ? backup.size.toString() : '0',
              UUID: response.data.backup.uuid,
              name: name.trim(),
              createdAt: backup.createdAt,
            },
          });
        } else {
          res
            .status(500)
            .json({ error: 'Failed to create backup on daemon' });
        }
      } catch (error) {
        logger.error('Error creating backup:', error);
        if (axios.isAxiosError(error)) {
          res.status(500).json({
            error: `Failed to create backup: ${error.response?.data?.error || error.message}`,
          });
        } else {
          res.status(500).json({ error: 'Failed to create backup' });
        }
      }
    },
  );

  router.post(
    '/server/:id/backups/:backupId/restore',
    isAuthenticatedForServer('id'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const backupId = req.params?.backupId;

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { UUID: getParamAsString(serverId) },
          include: { node: true },
        });

        if (!server) {
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        const backup = await prisma.backup.findUnique({
          where: { UUID: getParamAsString(backupId), serverId: getParamAsString(serverId) },
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

            const uploadResponse = await axios({
              method: 'POST',
              url: `${daemonSchemeSync()}://${server.node.address}:${server.node.port}/container/backup/upload`,
              params: {
                id: serverId,
                backupUuid: backup.UUID
              },
              auth: {
                username: 'Airlink',
                password: server.node.key
              },
              data: cloudDownloadResponse.data,
              headers: {
                'Content-Type': 'application/octet-stream'
              },
              maxContentLength: Infinity,
              maxBodyLength: Infinity
            });

            if (uploadResponse.data.success) {
              backupPath = uploadResponse.data.filePath;
            } else {
              throw new Error('Failed to upload cloud backup to daemon');
            }
          } catch (err) {
            logger.error('Failed to prepare Airlink Cloud backup for restore:', err);
            res.status(500).json({ error: 'Failed to prepare cloud backup for restore' });
            return;
          }
        }

        const response = await axios.post(
          `${daemonSchemeSync()}://${server.node.address}:${server.node.port}/container/restore`,
          {
            id: serverId,
            backupPath: backupPath,
          },
          {
            auth: {
              username: 'Airlink',
              password: server.node.key,
            },
            timeout: 300000,
          },
        );

        if (backup.airlinkCloudId && backupPath !== 'airlink-cloud') {
          axios.delete(
            `${daemonSchemeSync()}://${server.node.address}:${server.node.port}/container/backup`,
            {
              data: { backupPath: backupPath },
              auth: { username: 'Airlink', password: server.node.key },
            }
          ).catch(e => logger.warn(`Failed to delete temporary restore file: ${e}`));
        }

        if (response.data.success) {
          res.json({
            success: true,
            message: 'Backup restored successfully',
          });
        } else {
          res
            .status(500)
            .json({ error: 'Failed to restore backup on daemon' });
        }
      } catch (error) {
        logger.error('Error restoring backup:', error);
        if (axios.isAxiosError(error)) {
          res.status(500).json({
            error: `Failed to restore backup: ${error.response?.data?.error || error.message}`,
          });
        } else {
          res.status(500).json({ error: 'Failed to restore backup' });
        }
      }
    },
  );

  router.get(
    '/server/:id/backups/:backupId/download',
    isAuthenticatedForServer('id'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const backupId = req.params?.backupId;

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { UUID: getParamAsString(serverId) },
          include: { node: true },
        });

        if (!server) {
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        const backup = await prisma.backup.findUnique({
          where: { UUID: getParamAsString(backupId), serverId: getParamAsString(serverId) },
        });

        if (!backup) {
          res.status(404).json({ error: 'Backup not found' });
          return;
        }

        if (backup.airlinkCloudId) {
          const settings = await prisma.settings.findUnique({ where: { id: 1 } });
          if (!settings?.airlinkCloudApiKey) {
            res.status(500).json({ error: 'Airlink Cloud API key not configured' });
            return;
          }

          const cloudClient = new AirlinkCloudClient(settings.airlinkCloudApiKey);
          const downloadResponse = await cloudClient.getDownloadStream(backup.airlinkCloudId);

          const fileName = `${backup.name}_${backup.createdAt.toISOString().split('T')[0]}.tar.gz`;
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="${fileName}"`,
          );
          res.setHeader('Content-Type', 'application/gzip');

          downloadResponse.data.pipe(res);
          return;
        }

        const downloadUrl = `${daemonSchemeSync()}://${server.node.address}:${server.node.port}/container/backup/download`;
        const response = await axios({
          method: 'GET',
          url: downloadUrl,
          params: {
            backupPath: backup.filePath,
          },
          auth: {
            username: 'Airlink',
            password: server.node.key,
          },
          responseType: 'stream',
        });

        const fileName = `${backup.name}_${backup.createdAt.toISOString().split('T')[0]}.tar.gz`;
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${fileName}"`,
        );
        res.setHeader('Content-Type', 'application/gzip');

        response.data.pipe(res);
      } catch (error) {
        logger.error('Error downloading backup:', error);
        if (axios.isAxiosError(error)) {
          res.status(500).json({
            error: `Failed to download backup: ${error.response?.data?.error || error.message}`,
          });
        } else {
          res.status(500).json({ error: 'Failed to download backup' });
        }
      }
    },
  );

  router.delete(
    '/server/:id/backups/:backupId',
    isAuthenticatedForServer('id'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const backupId = req.params?.backupId;

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { UUID: getParamAsString(serverId) },
          include: { node: true },
        });

        if (!server) {
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        const backup = await prisma.backup.findUnique({
          where: { UUID: getParamAsString(backupId), serverId: getParamAsString(serverId) },
        });

        if (!backup) {
          res.status(404).json({ error: 'Backup not found' });
          return;
        }

        if (backup.airlinkCloudId) {
          const settings = await prisma.settings.findUnique({ where: { id: 1 } });
          if (settings?.airlinkCloudApiKey) {
            const cloudClient = new AirlinkCloudClient(settings.airlinkCloudApiKey);
            await cloudClient.deleteFile(backup.airlinkCloudId).catch(e => logger.warn(`Failed to delete backup from Airlink Cloud: ${e}`));
          }
        } else {
          try {
            await axios.delete(
              `${daemonSchemeSync()}://${server.node.address}:${server.node.port}/container/backup`,
              {
                data: {
                  backupPath: backup.filePath,
                },
                auth: {
                  username: 'Airlink',
                  password: server.node.key,
                },
              },
            );
          } catch {
            logger.warn('Failed to delete backup file from daemon');
          }
        }

        await prisma.backup.delete({
          where: { UUID: getParamAsString(backupId) },
        });

        res.json({
          success: true,
          message: 'Backup deleted successfully',
        });
      } catch (error) {
        logger.error('Error deleting backup:', error);
        res.status(500).json({ error: 'Failed to delete backup' });
      }
    },
  );
}
