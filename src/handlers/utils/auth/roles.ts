import type { UsersModel } from '../../../generated/prisma/models/Users';

export type UserRole = 'owner' | 'admin' | 'privileged' | 'user';

export const ROLES: readonly UserRole[] = ['owner', 'admin', 'privileged', 'user'] as const;

const VALID_ROLES = new Set<string>(ROLES);

export function isRole(value: string | null | undefined): value is UserRole {
  return typeof value === 'string' && VALID_ROLES.has(value);
}

export function isRoleInput(value: unknown): value is UserRole {
  return typeof value === 'string' && VALID_ROLES.has(value);
}

export function getUserRole(user: Pick<UsersModel, 'role'>): UserRole {
  return isRole(user.role) ? user.role : 'user';
}

export function isOwner(user: Pick<UsersModel, 'role'>): boolean {
  return getUserRole(user) === 'owner';
}

export function isAdminRole(user: Pick<UsersModel, 'role' | 'isAdmin'> | null | undefined): boolean {
  if (!user) return false;
  return user.isAdmin === true || getUserRole(user) === 'owner' || getUserRole(user) === 'admin';
}

export function isPrivileged(user: Pick<UsersModel, 'role' | 'isAdmin'>): boolean {
  return getUserRole(user) === 'privileged' || isAdminRole(user);
}

// Prisma data assigned whenever a user's role changes. isAdmin is derived so
// the existing `user.isAdmin` checks continue to gate protected routes.
export function roleFields(role: UserRole): { role: string; isAdmin: boolean } {
  const isAdmin = role === 'owner' || role === 'admin';
  return { role, isAdmin };
}