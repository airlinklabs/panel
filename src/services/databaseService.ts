import prisma from '../db';
import {
  provisionDatabase as pgProvision,
  deprovisionDatabase as pgDeprovision,
} from '../handlers/utils/core/postgresProvisioner';
import { getSettings } from './settingsService';
import type { DatabaseHost, ServerDatabase } from '../generated/prisma/client';

export interface DatabaseListItem {
  id: number;
  serverId: string;
  hostId: number;
  databaseName: string;
  databaseUser: string;
  databasePassword: string;
  createdAt: Date;
  host: { id: number; name: string };
}

/**
 * List databases for a server, ordered by newest first.
 */
export async function listDatabases(
  serverUUID: string,
): Promise<DatabaseListItem[]> {
  return prisma.serverDatabase.findMany({
    where: { serverId: serverUUID },
    include: { host: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get a single database by ID with host included.
 */
export async function getDatabase(
  id: number,
): Promise<(ServerDatabase & { host: DatabaseHost }) | null> {
  return prisma.serverDatabase.findUnique({
    where: { id },
    include: { host: true },
  });
}

/**
 * Provision a new database for a server.
 * Validates host, checks server + owner limits, creates PG resources + record.
 */
export async function provisionDatabase(
  serverUUID: string,
  data: { hostId: string | number },
): Promise<DatabaseListItem> {
  const server = await prisma.server.findUnique({
    where: { UUID: serverUUID },
  });
  if (!server) {
    throw new Error('Server not found');
  }

  const host = await prisma.databaseHost.findUnique({
    where: { id: parseInt(String(data.hostId), 10) },
  });
  if (!host) {
    throw new Error('Invalid database host.');
  }
  if (host.nodeId !== null && host.nodeId !== server.nodeId) {
    throw new Error(
      'This database host is not available for this server\'s node.',
    );
  }

  const databaseLimit = server.databaseLimit ?? 0;
  if (databaseLimit > 0) {
    const existing = await prisma.serverDatabase.count({
      where: { serverId: server.UUID },
    });
    if (existing >= databaseLimit) {
      throw new Error(`Database limit reached (${databaseLimit}).`);
    }
  }

  const owner = await prisma.users.findUnique({
    where: { id: server.ownerId },
  });
  const settings = await getSettings();
  const userMaxDatabases =
    owner?.maxDatabases !== null && owner?.maxDatabases !== undefined
      ? (owner.maxDatabases ?? 0)
      : (settings?.defaultMaxDatabases ?? 0);
  if (userMaxDatabases > 0) {
    const totalOwnerDatabases = await prisma.serverDatabase.count({
      where: { server: { ownerId: server.ownerId } },
    });
    if (totalOwnerDatabases >= userMaxDatabases) {
      throw new Error(
        `You have reached your database limit of ${userMaxDatabases} across all servers.`,
      );
    }
  }

  const credentials = await pgProvision(host, server.UUID);
  const db = await prisma.serverDatabase.create({
    data: {
      serverId: server.UUID,
      hostId: host.id,
      ...credentials,
    },
    include: { host: { select: { id: true, name: true } } },
  });

  return db;
}

/**
 * Deprovision and delete a database.
 */
export async function deprovisionDatabase(
  dbId: number,
  serverUUID: string,
): Promise<void> {
  const server = await prisma.server.findUnique({
    where: { UUID: serverUUID },
  });
  if (!server) {
    throw new Error('Server not found');
  }

  const db = await prisma.serverDatabase.findUnique({
    where: { id: dbId },
    include: { host: true },
  });
  if (!db || db.serverId !== server.UUID) {
    throw new Error('Database not found.');
  }

  await pgDeprovision(db.host, db);
  await prisma.serverDatabase.delete({ where: { id: db.id } });
}
