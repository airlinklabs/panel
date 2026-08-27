import type { Server } from '@prisma/client';
import prisma from '../../../db';
import { subUserHasPermission } from '../../../handlers/utils/auth/serverAuthUtil';

export type ClientApiServerAccess = {
  server: Server;
  isOwner: boolean;
};

/** Resolve server scope and enforce an operation-level subuser permission. */
export async function resolveClientApiServerAccess(
  serverId: string,
  userId: number,
  permission: Parameters<typeof subUserHasPermission>[1],
): Promise<ClientApiServerAccess | null> {
  const server = await prisma.server.findUnique({ where: { UUID: serverId } });
  if (!server) return null;

  if (server.ownerId === userId) {
    return { server, isOwner: true };
  }

  const subUser = await prisma.subUser.findUnique({
    where: { serverId_userId: { serverId: server.UUID, userId } },
  });
  if (!subUser || !subUserHasPermission(subUser, permission)) return null;

  return { server, isOwner: false };
}
