import prisma from '../db';
import { daemonRequest } from '../handlers/utils/core/daemonRequest';
import { fsListSchema, parseDaemonResponse } from '../platform/daemon/dtos';
import type { FsFileEntry } from '../platform/daemon/dtos';
import { isPathSafe } from '../utils/pathSecurity';

const FILE_TIMEOUT_MS = 15_000;

interface ServerNode {
  UUID: string;
  node: { address: string; port: number; key: string };
}

async function resolveServerNode(serverId: string): Promise<ServerNode> {
  const server = await prisma.server.findUnique({
    where: { UUID: serverId },
    select: {
      UUID: true,
      node: { select: { address: true, port: true, key: true } },
    },
  });
  if (!server?.node) {
    throw new Error('Server or node not found');
  }
  return server;
}

export async function listFiles(
  serverId: string,
  dir: string,
): Promise<FsFileEntry[]> {
  const server = await resolveServerNode(serverId);
  const response = await daemonRequest<unknown>({
    nodeAddress: server.node.address,
    nodePort: server.node.port,
    nodeKey: server.node.key,
    method: 'GET',
    path: '/fs/list',
    params: { id: server.UUID, path: dir },
    timeout: FILE_TIMEOUT_MS,
  });
  return parseDaemonResponse(fsListSchema, response.data) ?? [];
}

export async function readFile(
  serverId: string,
  file: string,
): Promise<unknown> {
  if (!isPathSafe(file)) {
    throw new Error('invalid file path');
  }
  const server = await resolveServerNode(serverId);
  const response = await daemonRequest({
    nodeAddress: server.node.address,
    nodePort: server.node.port,
    nodeKey: server.node.key,
    method: 'GET',
    path: '/fs/file/content',
    params: { id: server.UUID, path: file },
    timeout: FILE_TIMEOUT_MS,
  });
  return response.data;
}

export async function writeFile(
  serverId: string,
  file: string,
  content: string,
): Promise<void> {
  const server = await resolveServerNode(serverId);
  await daemonRequest({
    nodeAddress: server.node.address,
    nodePort: server.node.port,
    nodeKey: server.node.key,
    method: 'POST',
    path: '/fs/file/content',
    body: { id: server.UUID, path: file, content },
    timeout: FILE_TIMEOUT_MS,
  });
}

export async function deleteFile(
  serverId: string,
  file: string,
): Promise<void> {
  const server = await resolveServerNode(serverId);
  await daemonRequest({
    nodeAddress: server.node.address,
    nodePort: server.node.port,
    nodeKey: server.node.key,
    method: 'DELETE',
    path: '/fs/rm',
    body: { id: server.UUID, path: file },
    timeout: FILE_TIMEOUT_MS,
  });
}

export async function renameFile(
  serverId: string,
  file: string,
  newName: string,
): Promise<void> {
  const server = await resolveServerNode(serverId);
  await daemonRequest({
    nodeAddress: server.node.address,
    nodePort: server.node.port,
    nodeKey: server.node.key,
    method: 'POST',
    path: '/fs/rename',
    body: { id: server.UUID, path: file, newName },
    timeout: FILE_TIMEOUT_MS,
  });
}
