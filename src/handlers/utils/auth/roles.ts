export type UserRole = "owner" | "admin" | "privileged" | "user";

const VALID_ROLES = new Set<string>(["owner", "admin", "privileged", "user"]);

export function isRoleInput(value: unknown): value is UserRole {
  return typeof value === "string" && VALID_ROLES.has(value);
}

// Prisma data assigned whenever a user's role changes. isAdmin is derived so
// the existing `user.isAdmin` checks continue to gate protected routes.
export function roleFields(role: UserRole): { role: string; isAdmin: boolean } {
  const isAdmin = role === "owner" || role === "admin";
  return { role, isAdmin };
}
