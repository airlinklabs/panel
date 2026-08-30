import crypto from 'crypto';
import prisma from '../db';
import { daemonRequest } from '../handlers/utils/core/daemonRequest';
import logger from '../handlers/logger';
import {
  DEFAULT_MEMORY_MB,
  DEFAULT_CPU_PERCENT,
  DEFAULT_STORAGE_MB,
} from '../config/constants';

const DEFAULT_SWAP_MB = 0;

interface ServerInclude {
  owner: { select: { id: true; username: true; email: true } };
  node: { select: { id: true; name: true; address: true } };
}

const SERVER_INCLUDE_OWNER_NODE = {
  owner: { select: { id: true, username: true, email: true } },
  node: { select: { id: true, name: true, address: true } },
} satisfies ServerInclude;

export interface ListServersParams {
  page: number;
  perPage: number;
  where?: Record<string, unknown>;
  include?: Record<string, unknown>;
}

export async function listServers(params: ListServersParams) {
  return prisma.server.findMany({
    where: params.where as any,
    include: (params.include as any) ?? SERVER_INCLUDE_OWNER_NODE,
  });
}

export async function getServer(uuid: string) {
  return prisma.server.findUnique({
    where: { UUID: uuid },
    include: SERVER_INCLUDE_OWNER_NODE,
  });
}

export async function getServerRaw(uuid: string) {
  return prisma.server.findUnique({
    where: { UUID: uuid },
    include: { node: true },
  });
}

export interface CreateServerData {
  name: string;
  description?: string | null;
  ownerId: number;
  nodeId: number;
  imageId: number;
  Ports?: string;
  Memory?: number;
  Swap?: number;
  Cpu?: number;
  Storage?: number;
  Variables?: string | null;
  StartCommand?: string;
  dockerImage?: string | null;
}

export async function createServer(data: CreateServerData) {
  const UUID = crypto.randomUUID();

  const server = await prisma.server.create({
    data: {
      UUID,
      name: data.name,
      description: data.description ?? null,
      ownerId: data.ownerId,
      nodeId: data.nodeId,
      imageId: data.imageId,
      Ports: data.Ports ?? '[]',
      Memory: data.Memory ?? DEFAULT_MEMORY_MB,
      Swap: data.Swap ?? DEFAULT_SWAP_MB,
      Cpu: data.Cpu ?? DEFAULT_CPU_PERCENT,
      Storage: data.Storage ?? DEFAULT_STORAGE_MB,
      Variables: data.Variables ?? null,
      StartCommand: data.StartCommand ?? '',
      dockerImage: data.dockerImage ?? null,
      Installing: false,
      Queued: false,
    },
    include: SERVER_INCLUDE_OWNER_NODE,
  });

  return server;
}

export async function deleteServer(uuid: string): Promise<boolean> {
  const existing = await prisma.server.findUnique({
    where: { UUID: uuid },
    include: { node: true },
  });
  if (!existing) {
    return false;
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
      const daemonErr = err as {
        status?: number;
        body?: { error?: string };
      };
      const isGone =
        daemonErr.status === 404 ||
        daemonErr.body?.error?.includes('not exist');
      if (!isGone) {
        logger.warn(`Could not delete container on daemon: ${err}`);
      }
    }
  }

  await prisma.server.delete({ where: { UUID: uuid } });
  return true;
}

export async function suspendServer(uuid: string) {
  const existing = await prisma.server.findUnique({
    where: { UUID: uuid },
  });
  if (!existing) {
    return null;
  }
  if (existing.Suspended) {
    return 'already_suspended';
  }

  const server = await prisma.server.update({
    where: { UUID: uuid },
    data: { Suspended: true },
  });
  return server;
}

export async function unsuspendServer(uuid: string) {
  const existing = await prisma.server.findUnique({
    where: { UUID: uuid },
  });
  if (!existing) {
    return null;
  }
  if (!existing.Suspended) {
    return 'not_suspended';
  }

  const server = await prisma.server.update({
    where: { UUID: uuid },
    data: { Suspended: false },
  });
  return server;
}
