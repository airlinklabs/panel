import { Router, Request, Response } from 'express';
import { isAuthenticatedForServer, requireSubUserPermission } from '../../../handlers/utils/auth/serverAuthUtil';
import logger from '../../../handlers/logger';
import { checkForServerInstallation } from '../../../handlers/checkForServerInstallation';
import { getParamAsString } from '../../../utils/typeHelpers';
import prisma from '../../../db';
import { daemonRequest } from '../../../handlers/utils/core/daemonRequest';
import { AirlinkCloudClient } from '../../../handlers/utils/core/airlinkCloud';
import { logActivity } from '../../../handlers/utils/activity/activityLogger';
import {
  uploadStreamToS3,
  deleteFromS3,
  getS3ObjectStream,
  isS3Backup,
  S3_KEY_PREFIX,
} from '../../../handlers/utils/core/s3Client';

function s3KeyFor(serverId: string, uuid: string): string {
  return `backups/${serverId}/${uuid}.tar.gz`;
}

export async function persistBackupRecord(params: {
  uuid: string;
  name: string;
  serverId: string;
  filePath: string;
  size: bigint;
  checksum: string | null;
  airlinkCloudId: string | null;
}): Promise<Awaited<ReturnType<typeof prisma.backup.create>>> {
  return prisma.backup.create({
    data: {
      UUID: params.uuid,
      name: params.name,
      serverId: params.serverId,
      filePath: params.filePath,
      size: params.size,
      checksum: params.checksum,
      airlinkCloudId: params.airlinkCloudId,
    },
  });
}

export function registerBackupRoutes(router: Router): void {
  router.get(
    '/server/:id/backups',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('backups'),
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
    requireSubUserPermission('backups'),
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

        const backupCount = await prisma.backup.count({ where: { serverId: getParamAsString(serverId) } });
        if (server.backupLimit > 0 && backupCount >= server.backupLimit) {
          res.status(400).json({ error: `Backup limit reached (${server.backupLimit}). Delete an existing backup first.` });
          return;
        }

        let ignoreList: string[] = [];
        if (server.backupIgnoreList) {
          try {
            const parsed = JSON.parse(server.backupIgnoreList);
            ignoreList = Array.isArray(parsed) ? parsed : [];
          } catch {
            ignoreList = server.backupIgnoreList.split('\n').map((l) => l.trim()).filter(Boolean);
          }
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
            id: getParamAsString(serverId),
            name: name.trim(),
            ignore: ignoreList,
          },
          timeout: 300000,
        });

        if (response.data.success) {
          const daemonFilePath = response.data.backup!.filePath;
          let airlinkCloudId: string | null = null;
          let filePath = daemonFilePath;
          let remoteRedirect: 'none' | 'ok' | 'failed' = 'none';

          if (isCloudBackupEnabled) {
            try {
              const cloudClient = new AirlinkCloudClient(settings.airlinkCloudApiKey!);

              const downloadResponse = await daemonRequest<import('stream').Readable>({
                method: 'GET',
                path: '/container/backup/download',
                nodeAddress: server.node.address,
                nodePort: server.node.port,
                nodeKey: server.node.key,
                params: { backupPath: daemonFilePath },
                responseType: 'stream',
              });

              const uniqueCloudFileName = `${getParamAsString(serverId)}_${response.data.backup!.uuid}_${Date.now()}.tar.gz`;
              const uploadResult = await cloudClient.uploadFile(
                downloadResponse.data,
                uniqueCloudFileName
              );

              const remoteId = (uploadResult as Record<string, unknown>)?.id as string | undefined;
              if (!remoteId) {
                throw new Error('Airlink Cloud upload returned no file id');
              }

              airlinkCloudId = remoteId;
              filePath = 'airlink-cloud';
              remoteRedirect = 'ok';

              daemonRequest({
                method: 'DELETE',
                path: '/container/backup',
                nodeAddress: server.node.address,
                nodePort: server.node.port,
                nodeKey: server.node.key,
                body: { backupPath: daemonFilePath },
              }).catch(e => logger.warn(`Failed to delete temporary local backup: ${e}`));
            } catch (cloudError) {
              logger.error('Failed to redirect backup to Airlink Cloud:', cloudError);
              remoteRedirect = 'failed';
            }
          } else if (settings?.s3Enabled) {
            try {
              const downloadResponse = await daemonRequest<import('stream').Readable>({
                method: 'GET',
                path: '/container/backup/download',
                nodeAddress: server.node.address,
                nodePort: server.node.port,
                nodeKey: server.node.key,
                params: { backupPath: daemonFilePath },
                responseType: 'stream',
              });

              const s3Key = s3KeyFor(getParamAsString(serverId), response.data.backup!.uuid);

              const stream = downloadResponse.data as import('stream').Readable;
              await uploadStreamToS3(stream, s3Key);

              filePath = `${S3_KEY_PREFIX}${s3Key}`;
              remoteRedirect = 'ok';

              daemonRequest({
                method: 'DELETE',
                path: '/container/backup',
                nodeAddress: server.node.address,
                nodePort: server.node.port,
                nodeKey: server.node.key,
                body: { backupPath: daemonFilePath },
              }).catch(e => logger.warn(`Failed to delete temporary local backup: ${e}`));
            } catch (s3Error) {
              logger.error('Failed to redirect backup to S3:', s3Error);
              remoteRedirect = 'failed';
            }
          }

          const backup = await persistBackupRecord({
            uuid: response.data.backup!.uuid,
            name: name.trim(),
            serverId: getParamAsString(serverId),
            filePath,
            size: BigInt(response.data.backup!.size),
            checksum: typeof response.data.backup!.checksum === 'string' ? response.data.backup!.checksum : null,
            airlinkCloudId,
          });

          await logActivity(req, 'backup:create', { serverId: getParamAsString(serverId), metadata: { name: name.trim(), uuid: backup.UUID } });

          let message: string;
          if (remoteRedirect === 'ok') {
            message = isCloudBackupEnabled ? 'Backup created and uploaded to Airlink Cloud' : 'Backup created successfully';
          } else if (remoteRedirect === 'failed') {
            message = 'Backup created on the node, but the remote upload failed.';
          } else {
            message = 'Backup created successfully';
          }

          res.json({
            success: true,
            message,
            remoteRedirect,
            backup: {
              ...backup,
              size: backup.size ? backup.size.toString() : '0',
              UUID: response.data.backup!.uuid,
              name: name.trim(),
              createdAt: backup.createdAt,
            },
          });
        } else {
          res
            .status(500)
            .json({ error: 'Failed to create backup on daemon' });
        }
      } catch (error: unknown) {
        logger.error('Error creating backup:', error);
        const err = error && typeof error === 'object' ? error as Record<string, unknown> : {};
        const errBody = err.body && typeof err.body === 'object' ? err.body as Record<string, unknown> : undefined;
        res.status(500).json({
          error: `Failed to create backup: ${(errBody?.error as string) || (err.message as string) || 'Failed to create backup'}`,
        });
      }
    },
  );

  router.post(
    '/server/:id/backups/:backupId/restore',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('backups'),
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

            const uploadResponse = await daemonRequest<{ success: boolean; filePath?: string }>({
              method: 'POST',
              path: '/container/backup/upload',
              nodeAddress: server.node.address,
              nodePort: server.node.port,
              nodeKey: server.node.key,
              params: {
                id: getParamAsString(serverId),
                backupUuid: backup.UUID
              },
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
            const s3Key = backup.filePath.slice(S3_KEY_PREFIX.length);
            const stream = await getS3ObjectStream(s3Key);
            if (!stream) throw new Error('S3 object not found');

            const uploadResponse = await daemonRequest<{ success: boolean; filePath?: string }>({
              method: 'POST',
              path: '/container/backup/upload',
              nodeAddress: server.node.address,
              nodePort: server.node.port,
              nodeKey: server.node.key,
              params: {
                id: getParamAsString(serverId),
                backupUuid: backup.UUID
              },
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
            id: getParamAsString(serverId),
            backupPath: backupPath,
            checksum: backup.checksum ?? undefined,
          },
          timeout: 300000,
        });

        if (backup.airlinkCloudId && backupPath !== 'airlink-cloud') {
          daemonRequest({
            method: 'DELETE',
            path: '/container/backup',
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            nodeKey: server.node.key,
            body: { backupPath: backupPath },
          }).catch(e => logger.warn(`Failed to delete temporary restore file: ${e}`));
        } else if (isS3Backup(backup.filePath)) {
          daemonRequest({
            method: 'DELETE',
            path: '/container/backup',
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            nodeKey: server.node.key,
            body: { backupPath: backupPath },
          }).catch(e => logger.warn(`Failed to delete temporary restore file: ${e}`));
        }

        if (response.data.success) {
          await logActivity(req, 'backup:restore', { serverId: getParamAsString(serverId), metadata: { name: backup.name, uuid: backup.UUID } });
          res.json({
            success: true,
            message: 'Backup restored successfully',
          });
        } else {
          res
            .status(500)
            .json({ error: 'Failed to restore backup on daemon' });
        }
      } catch (error: unknown) {
        logger.error('Error restoring backup:', error);
        const err = error && typeof error === 'object' ? error as Record<string, unknown> : {};
        const errBody = err.body && typeof err.body === 'object' ? err.body as Record<string, unknown> : undefined;
        res.status(500).json({
          error: `Failed to restore backup: ${(errBody?.error as string) || (err.message as string) || 'Failed to restore backup'}`,
        });
      }
    },
  );

  router.get(
    '/server/:id/backups/:backupId/download',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('backups'),
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

          (downloadResponse.data as import('stream').Readable).pipe(res);
          return;
        }

        if (isS3Backup(backup.filePath)) {
          const stream = await getS3ObjectStream(backup.filePath.slice(S3_KEY_PREFIX.length));
          if (!stream) {
            res.status(404).json({ error: 'S3 backup not found' });
            return;
          }

          const fileName = `${backup.name}_${backup.createdAt.toISOString().split('T')[0]}.tar.gz`;
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="${fileName}"`,
          );
          res.setHeader('Content-Type', 'application/gzip');

          stream.pipe(res);
          return;
        }

        const downloadResponse = await daemonRequest<import('stream').Readable>({
          method: 'GET',
          path: '/container/backup/download',
          nodeAddress: server.node.address,
          nodePort: server.node.port,
          nodeKey: server.node.key,
          params: {
            backupPath: backup.filePath,
          },
          responseType: 'stream',
        });

        const fileName = `${backup.name}_${backup.createdAt.toISOString().split('T')[0]}.tar.gz`;
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${fileName}"`,
        );
        res.setHeader('Content-Type', 'application/gzip');

        downloadResponse.data.pipe(res);
      } catch (error: unknown) {
        logger.error('Error downloading backup:', error);
        const err = error && typeof error === 'object' ? error as Record<string, unknown> : {};
        const errBody = err.body && typeof err.body === 'object' ? err.body as Record<string, unknown> : undefined;
        res.status(500).json({
          error: `Failed to download backup: ${(errBody?.error as string) || (err.message as string) || 'Failed to download backup'}`,
        });
      }
    },
  );

  router.delete(
    '/server/:id/backups/:backupId',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('backups'),
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

        if (backup.locked) {
          res.status(403).json({ error: 'This backup is locked. Unlock it before deleting.' });
          return;
        }

        if (backup.airlinkCloudId) {
          const settings = await prisma.settings.findUnique({ where: { id: 1 } });
          if (settings?.airlinkCloudApiKey) {
            const cloudClient = new AirlinkCloudClient(settings.airlinkCloudApiKey);
            await cloudClient.deleteFile(backup.airlinkCloudId).catch(e => logger.warn(`Failed to delete backup from Airlink Cloud: ${e}`));
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
              body: {
                backupPath: backup.filePath,
              },
            });
          } catch {
            logger.warn('Failed to delete backup file from daemon');
          }
        }

        await prisma.backup.delete({
          where: { UUID: getParamAsString(backupId) },
        });

        await logActivity(req, 'backup:delete', { serverId: getParamAsString(serverId), metadata: { name: backup.name, uuid: backup.UUID } });
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

  router.patch(
    '/server/:id/backups/:backupId/lock',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('backups'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const backupId = req.params?.backupId;
      const { locked } = req.body as { locked?: unknown };

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { UUID: getParamAsString(serverId) },
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

        const wantLocked = locked === true || locked === 'true';
        await prisma.backup.update({
          where: { UUID: backup.UUID },
          data: { locked: wantLocked },
        });

        await logActivity(req, wantLocked ? 'backup:lock' : 'backup:unlock', {
          serverId: getParamAsString(serverId),
          metadata: { name: backup.name, uuid: backup.UUID },
        });

        res.json({ success: true, locked: wantLocked });
      } catch (error) {
        logger.error('Error toggling backup lock:', error);
        res.status(500).json({ error: 'Failed to update backup lock' });
      }
    },
  );
}
