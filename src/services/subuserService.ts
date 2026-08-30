import prisma from "../db";

export interface SubUserResponse {
  id: number;
  user: { id: number; username: string | null; email: string };
  permissions: string[];
  createdAt: Date;
}

function parsePermissions(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // ignore malformed permission payloads
  }
  return [];
}

export async function listSubUsers(
  serverId: string,
): Promise<SubUserResponse[]> {
  const subUsers = await prisma.subUser.findMany({
    where: { serverId },
    include: {
      user: { select: { id: true, username: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return subUsers.map((s) => ({
    id: s.id,
    user: s.user,
    permissions: parsePermissions(s.permissions),
    createdAt: s.createdAt,
  }));
}

export async function getSubUser(id: number, serverId: string) {
  return prisma.subUser.findFirst({
    where: { id, serverId },
  });
}

export async function addSubUser(
  serverId: string,
  email: string,
  permissions: string[],
): Promise<SubUserResponse> {
  const target = await prisma.users.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!target) {
    throw new SubUserError(404, "No user found with that email.");
  }

  const existing = await prisma.subUser.findUnique({
    where: {
      serverId_userId: { serverId, userId: target.id },
    },
  });
  if (existing) {
    throw new SubUserError(
      409,
      "That user is already a subuser of this server.",
    );
  }

  const subUser = await prisma.subUser.create({
    data: {
      serverId,
      userId: target.id,
      permissions: JSON.stringify(permissions),
    },
  });

  return {
    id: subUser.id,
    user: { id: target.id, username: target.username, email: target.email },
    permissions,
    createdAt: subUser.createdAt,
  };
}

export async function updateSubUser(
  id: number,
  serverId: string,
  permissions: string[],
) {
  const subUser = await prisma.subUser.findFirst({
    where: { id, serverId },
  });
  if (!subUser) {
    throw new SubUserError(404, "Subuser not found");
  }

  await prisma.subUser.update({
    where: { id: subUser.id },
    data: { permissions: JSON.stringify(permissions) },
  });

  return { success: true, permissions };
}

export async function deleteSubUser(id: number, serverId: string) {
  const subUser = await prisma.subUser.findFirst({
    where: { id, serverId },
  });
  if (!subUser) {
    throw new SubUserError(404, "Subuser not found");
  }

  await prisma.subUser.delete({ where: { id: subUser.id } });
  return { success: true };
}

export class SubUserError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "SubUserError";
  }
}
