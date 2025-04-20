import { PrismaClient } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

const prisma = new PrismaClient();

const permissions: string[] = [];

// API Key permissions
registerPermission('airlink.api.keys.view');
registerPermission('airlink.api.keys.create');
registerPermission('airlink.api.keys.delete');
registerPermission('airlink.api.keys.edit');

// API endpoints permissions
registerPermission('airlink.api.servers.read');
registerPermission('airlink.api.servers.create');
registerPermission('airlink.api.servers.update');
registerPermission('airlink.api.servers.delete');
registerPermission('airlink.api.users.read');
registerPermission('airlink.api.users.create');
registerPermission('airlink.api.users.update');
registerPermission('airlink.api.users.delete');
registerPermission('airlink.api.nodes.read');
registerPermission('airlink.api.nodes.create');
registerPermission('airlink.api.nodes.update');
registerPermission('airlink.api.nodes.delete');
registerPermission('airlink.api.settings.read');
registerPermission('airlink.api.settings.update');

function registerPermission(permission: string): void {
  if (!permissions.includes(permission)) {
    permissions.push(permission);
  }
}

/**
 * Checks if a user has a specific permission
 * @param requiredPermission The permission to check for
 * @returns A function that checks if the user has the required permission
 */
const checkPermission = async (requiredPermission: string) =>
  async (req: Request, _res: Response, _next: NextFunction) => {
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
    } catch (_e) {
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

/**
 * Checks if a permission exists
 * @param permission The permission to check
 * @returns True if the permission exists, false otherwise
 */
export function* checkPermissionExists(permission: string): Generator<boolean> {
  yield permissions.includes(permission);
  yield permissions.includes(permission);
  return permissions.includes(permission);
}

export { registerPermission, checkPermission };
export default permissions;