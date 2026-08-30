import prisma from '../db';
import { daemonRequest } from '../handlers/utils/core/daemonRequest';
import logger from '../handlers/logger';

const BACKUP_TIMEOUT_MS = 300_000;

export interface BackupListItem {
  UUID: string;
  name: string;
  size: bigint | null;
  checksum: string | null;
  locked: boolean;
  createdAt: Date;
}

export interface DaemonBackupResult {
  success: boolean;
  backup?: {
    filePath: string;
    uuid: string;
    size: number;
    checksum?: string;
  };
}

/**
 * List backups for a server, ordered by newest first.
 */
export async function listBackups(serverId: string): Promise<BackupListItem[]> {
  return prisma.backup.findMany({
    where: { serverId },
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
}

/**
 * Get a single backup by UUID, optionally scoped to a server.
 */
export async function getBackup(uuid: string, serverId?: string) {
  if (serverId) {
    return prisma.backup.findFirst({
      where: { UUID: uuid, serverId },
    });
  }
  return prisma.backup.findUnique({ where: { UUID: uuid } });
}

/**
 * Count existing backups for a server (for limit checks).
 */
export async function countBackups(serverId: string): Promise<number> {
  return prisma.backup.count({ where: { serverId } });
}

/**
 * Call the daemon to create a backup on the node.
 */
export async function createBackupOnDaemon(
  nodeAddress: string,
  nodePort: number,
  nodeKey: string,
  serverId: string,
  name: string,
): Promise<DaemonBackupResult> {
  const response = await daemonRequest<DaemonBackupResult>({
    method: 'POST',
    path: '/container/backup',
    nodeAddress,
    nodePort,
    nodeKey,
    body: { id: serverId, name },
    timeout: BACKUP_TIMEOUT_MS,
  });
  return response.data;
}

/**
 * Call the daemon to delete a backup file from the node.
 */
export async function deleteBackupFileOnDaemon(
  nodeAddress: string,
  nodePort: number,
  nodeKey: string,
  filePath: string,
): Promise<void> {
  await daemonRequest({
    method: 'DELETE',
    path: '/container/backup',
    nodeAddress,
    nodePort,
    nodeKey,
    body: { backupPath: filePath },
  });
}

/**
 * Save a new backup record to the database.
 */
export async function createBackupRecord(data: {
  uuid: string;
  name: string;
  serverId: string;
  filePath: string;
  size: number;
  checksum?: string;
  airlinkCloudId?: string;
}): Promise<BackupListItem> {
  const backup = await prisma.backup.create({
    data: {
      UUID: data.uuid,
      name: data.name,
      serverId: data.serverId,
      filePath: data.filePath,
      size: BigInt(data.size),
      checksum: data.checksum ?? null,
      airlinkCloudId: data.airlinkCloudId ?? null,
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
  return backup;
}

/**
 * Delete a backup record from the database.
 */
export async function deleteBackupRecord(uuid: string): Promise<void> {
  await prisma.backup.delete({ where: { UUID: uuid } });
}

/**
 * Convenience: create a backup (daemon call + DB record) for the simple
 * local-only case. Callers that need S3/Airlink Cloud should use the
 * lower-level functions (createBackupOnDaemon, createBackupRecord) instead.
 */
export async function createBackup(
  serverId: string,
  name: string,
): Promise<BackupListItem> {
  const server = await prisma.server.findUnique({
    where: { UUID: serverId },
    include: { node: true },
  });
  if (!server) {
    throw new Error('Server not found');
  }
  if (!server.node) {
    throw new Error('Server node not found');
  }

  const count = await countBackups(serverId);
  if (server.backupLimit > 0 && count >= server.backupLimit) {
    throw new Error(`Backup limit reached (${server.backupLimit}).`);
  }

  const result = await createBackupOnDaemon(
    server.node.address,
    server.node.port,
    server.node.key,
    serverId,
    name,
  );

  if (!result.success || !result.backup) {
    throw new Error('Failed to create backup on daemon');
  }

  return createBackupRecord({
    uuid: result.backup.uuid,
    name,
    serverId,
    filePath: result.backup.filePath,
    size: result.backup.size,
    checksum: result.backup.checksum,
  });
}

/**
 * Convenience: delete a backup (daemon file + DB record) for the simple
 * local-only case. Callers that need S3/Airlink Cloud deletion should
 * handle that before calling this, or use the lower-level functions.
 */
export async function deleteBackup(
  uuid: string,
  serverId: string,
): Promise<void> {
  const backup = await getBackup(uuid, serverId);
  if (!backup) {
    throw new Error('Backup not found');
  }
  if (backup.locked) {
    throw new Error('Backup is locked');
  }

  const server = await prisma.server.findUnique({
    where: { UUID: serverId },
    include: { node: true },
  });
  if (!server?.node) {
    throw new Error('Server node not found');
  }

  // Delete file from daemon (best-effort for local files)
  try {
    const fullBackup = await prisma.backup.findUnique({
      where: { UUID: uuid },
    });
    if (fullBackup && !fullBackup.airlinkCloudId) {
      await deleteBackupFileOnDaemon(
        server.node.address,
        server.node.port,
        server.node.key,
        fullBackup.filePath,
      );
    }
  } catch (err) {
    logger.warn(`Failed to delete backup file from daemon: ${err}`);
  }

  await deleteBackupRecord(uuid);
}
