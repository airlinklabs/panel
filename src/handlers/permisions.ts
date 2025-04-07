import { PrismaClient } from "@prisma/client";
import { Request, Response, NextFunction } from 'express';

const prisma = new PrismaClient();

let permissions: string[] = [];

function registerPermission(permission: string): void {
  if (!permissions.includes(permission)) {
    permissions.push(permission);
  }
}

const checkPermission = async ( requiredPermission: string) => 
async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.session.user?.id;

  const user = await prisma.users.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return false;
  }

  let userPermissions: string[] = [];
  try {
    userPermissions = JSON.parse(user.permissions || '[]');
  } catch (e) {
    return false;
  }

  return userPermissions.some((perm: string) => {
    if (perm === requiredPermission) return true;
    if (perm.endsWith('.*')) {
      const base = perm.slice(0, -2);
      return requiredPermission.startsWith(`${base}.`);
    }
    return false;
  });
};

export { registerPermission, checkPermission };
export default permissions;