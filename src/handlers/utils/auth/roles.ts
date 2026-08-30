export type UserRole = 'owner' | 'admin' | 'privileged' | 'user';

const VALID_ROLES = new Set<string>(['owner', 'admin', 'privileged', 'user']);

export function isRoleInput(value: unknown): value is UserRole {
  return typeof value === 'string' && VALID_ROLES.has(value);
}

// Prisma data assigned whenever a user's role changes. isAdmin is derived so
// the existing `user.isAdmin` checks continue to gate protected routes.
export function roleFields(role: UserRole): { role: string; isAdmin: boolean } {
  const isAdmin = role === 'owner' || role === 'admin';
  return { role, isAdmin };
}

/** Check whether a role is considered administrative. */
export function isRoleAdmin(role: string | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Return the effective permissions for a user.
 *
 *  - owner / admin → ["*"] (all permissions)
 *  - other roles → look up the Role record's permissions array
 *  - sub-users → fall through to their flat permission list
 */
export async function getUserPermissions(
  user: { role?: string | null; isAdmin?: boolean | null; id: number },
  opts?: { rolePermissions?: string[] },
): Promise<string[]> {
  if (user.role === 'owner' || user.role === 'admin' || user.isAdmin) {
    return ['*'];
  }

  // If caller already resolved role permissions, skip the DB hit.
  if (opts?.rolePermissions) {
    return opts.rolePermissions;
  }

  // Lazy import to avoid circular dependency (authorization → prisma → ...).
  const { default: prisma } = await import('../../../db');
  const role = await prisma.role.findUnique({
    where: { name: user.role ?? '' },
  });
  if (!role) {
    return [];
  }
  const raw = role.permissions;
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((p: unknown): p is string => typeof p === 'string')
      : [];
  } catch {
    return [];
  }
}

/**
 * Check whether a set of effective permissions grants a required permission.
 *
 *  1. Includes "*" → always true
 *  2. Exact match → true
 *  3. Wildcard: "files.*" matches "files.read"
 *  4. Parent group: "files" matches "files.read"
 */
export function hasPermission(
  userPermissions: string[],
  requiredPermission: string,
): boolean {
  const parent = requiredPermission.includes('.')
    ? requiredPermission.slice(0, requiredPermission.lastIndexOf('.'))
    : null;

  for (const p of userPermissions) {
    if (p === '*') {
      return true;
    }
    if (p === requiredPermission) {
      return true;
    }
    if (
      p.endsWith('.*') &&
      (requiredPermission === p.slice(0, -2) ||
        requiredPermission.startsWith(p.slice(0, -1)))
    ) {
      return true;
    }
    if (parent && p === parent) {
      return true;
    }
  }
  return false;
}
