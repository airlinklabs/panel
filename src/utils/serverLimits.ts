import prisma from '../db.js';

export async function resolveUserServerLimit(userId: number, settings: { defaultServerLimit?: number | null } | null): Promise<number> {
  const user = await prisma.users.findUnique({ where: { id: userId } });
  if (!user) { return 0; }
  if (user.serverLimit !== null && user.serverLimit !== undefined && user.serverLimit > 0) { return user.serverLimit; }
  return settings?.defaultServerLimit ?? 0;
}

export async function resolveUserResourceLimits(userId: number, settings: { defaultMaxMemory?: number | null; defaultMaxCpu?: number | null; defaultMaxStorage?: number | null } | null) {
  const user = await prisma.users.findUnique({ where: { id: userId } });
  return {
    maxMemory: user?.maxMemory ?? settings?.defaultMaxMemory ?? 512,
    maxCpu: user?.maxCpu ?? settings?.defaultMaxCpu ?? 100,
    maxStorage: user?.maxStorage ?? settings?.defaultMaxStorage ?? 5120,
  };
}
