/**
 * V2 API — Admin role management endpoints.
 *
 * GET    /api/v2/admin/roles       — List all roles (with user counts)
 * POST   /api/v2/admin/roles       — Create role
 * GET    /api/v2/admin/roles/:id   — Get role details
 * PUT    /api/v2/admin/roles/:id   — Update role
 * DELETE /api/v2/admin/roles/:id   — Delete role
 */

import { Router } from "express";
import prisma from "../../../../db";
import { parseBody } from "../../../../utils/validation";
import {
  jsonOk,
  jsonError,
  requireAdmin,
  logActivity,
  paginate,
  parsePage,
  parsePerPage,
} from "../helpers";
import { adminCreateRoleBody, adminUpdateRoleBody } from "../dto";
import { SUBUSER_PERMISSIONS } from "../../../../handlers/utils/auth/serverAuthUtil";
import { ensureDefaultRoles } from "../../../../services/roleService";

const router = Router();

router.use(async (req, res, next) => {
  const admin = await requireAdmin(req, res);
  if (!admin) {
    return;
  }
  req.adminUser = admin;
  next();
});

// ---------------------------------------------------------------------------
// Permission validation
// ---------------------------------------------------------------------------

const VALID_PERMISSIONS = SUBUSER_PERMISSIONS as readonly string[];

/**
 * Validate that every permission in the array is either a canonical permission
 * or a wildcard like "servers.*", "files.*", etc. that matches a known prefix.
 */
function isValidPermission(perm: string): boolean {
  if (VALID_PERMISSIONS.includes(perm)) return true;
  // Allow wildcard forms like "servers.*", "files.*", etc.
  if (perm.endsWith(".*")) {
    const prefix = perm.slice(0, -2);
    return VALID_PERMISSIONS.some((p) => p.startsWith(prefix + "."));
  }
  return false;
}

function validatePermissions(permissions: string[]): string | null {
  const invalid = permissions.filter((p) => !isValidPermission(p));
  if (invalid.length > 0) {
    return `Invalid permission(s): ${invalid.join(", ")}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// GET /api/v2/admin/roles — List all roles
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  await ensureDefaultRoles();

  const page = parsePage(req.query.page);
  const perPage = parsePerPage(req.query.perPage);

  const [roles, total] = await Promise.all([
    prisma.role.findMany({
      include: {
        _count: { select: { users: true } },
      },
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { sortOrder: "asc" },
    }),
    prisma.role.count(),
  ]);

  const totalPages = Math.ceil(total / perPage);
  jsonOk(
    res,
    roles.map((r) => ({
      id: r.id,
      name: r.name,
      displayName: r.displayName,
      description: r.description,
      isAdmin: r.isAdmin,
      permissions: JSON.parse(r.permissions),
      isSystem: r.isSystem,
      sortOrder: r.sortOrder,
      userCount: r._count.users,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    {
      current_page: page,
      per_page: perPage,
      total,
      last_page: totalPages,
    },
  );
});

// ---------------------------------------------------------------------------
// POST /api/v2/admin/roles — Create role
// ---------------------------------------------------------------------------
router.post("/", parseBody(adminCreateRoleBody), async (req, res) => {
  const data = req.validatedBody as any;

  // Check name uniqueness
  const existing = await prisma.role.findUnique({ where: { name: data.name } });
  if (existing) {
    return jsonError(res, "CONFLICT", "Role name already exists", 409);
  }

  // Validate permissions
  const permError = validatePermissions(data.permissions ?? []);
  if (permError) {
    return jsonError(res, "BAD_REQUEST", permError, 400);
  }

  const role = await prisma.role.create({
    data: {
      name: data.name,
      displayName: data.displayName,
      description: data.description ?? null,
      isAdmin: data.isAdmin ?? false,
      permissions: JSON.stringify(data.permissions ?? []),
      isSystem: false,
      sortOrder: data.sortOrder ?? 0,
    },
  });

  logActivity(
    req.adminUser?.id,
    "role.created",
    undefined,
    { name: role.name },
    req.ip,
  );

  jsonOk(res, {
    id: role.id,
    name: role.name,
    displayName: role.displayName,
    description: role.description,
    isAdmin: role.isAdmin,
    permissions: JSON.parse(role.permissions),
    isSystem: role.isSystem,
    sortOrder: role.sortOrder,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  });
});

// ---------------------------------------------------------------------------
// GET /api/v2/admin/roles/:id — Get role details
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, "BAD_REQUEST", "Invalid role ID", 400);
  }

  const role = await prisma.role.findUnique({
    where: { id },
    include: {
      _count: { select: { users: true } },
    },
  });

  if (!role) {
    return jsonError(res, "NOT_FOUND", "Role not found", 404);
  }

  jsonOk(res, {
    id: role.id,
    name: role.name,
    displayName: role.displayName,
    description: role.description,
    isAdmin: role.isAdmin,
    permissions: JSON.parse(role.permissions),
    isSystem: role.isSystem,
    sortOrder: role.sortOrder,
    userCount: role._count.users,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  });
});

// ---------------------------------------------------------------------------
// PUT /api/v2/admin/roles/:id — Update role
// ---------------------------------------------------------------------------
router.put("/:id", parseBody(adminUpdateRoleBody), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, "BAD_REQUEST", "Invalid role ID", 400);
  }

  const existing = await prisma.role.findUnique({ where: { id } });
  if (!existing) {
    return jsonError(res, "NOT_FOUND", "Role not found", 404);
  }

  const data = req.validatedBody as any;
  const updateData: Record<string, unknown> = {};

  if (data.name !== undefined) {
    const dup = await prisma.role.findUnique({ where: { name: data.name } });
    if (dup && dup.id !== id) {
      return jsonError(res, "CONFLICT", "Role name already exists", 409);
    }
    updateData.name = data.name;
  }

  if (data.displayName !== undefined) {
    updateData.displayName = data.displayName;
  }

  if (data.description !== undefined) {
    updateData.description = data.description;
  }

  if (data.isAdmin !== undefined) {
    updateData.isAdmin = data.isAdmin;
  }

  if (data.sortOrder !== undefined) {
    updateData.sortOrder = data.sortOrder;
  }

  if (data.permissions !== undefined) {
    const permError = validatePermissions(data.permissions);
    if (permError) {
      return jsonError(res, "BAD_REQUEST", permError, 400);
    }
    updateData.permissions = JSON.stringify(data.permissions);
  }

  if (Object.keys(updateData).length === 0) {
    return jsonError(res, "BAD_REQUEST", "No fields to update", 400);
  }

  const updated = await prisma.role.update({
    where: { id },
    data: updateData,
  });

  logActivity(
    req.adminUser?.id,
    "role.updated",
    undefined,
    { id, fields: Object.keys(updateData) },
    req.ip,
  );

  jsonOk(res, {
    id: updated.id,
    name: updated.name,
    displayName: updated.displayName,
    description: updated.description,
    isAdmin: updated.isAdmin,
    permissions: JSON.parse(updated.permissions),
    isSystem: updated.isSystem,
    sortOrder: updated.sortOrder,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/v2/admin/roles/:id — Delete role
// ---------------------------------------------------------------------------
router.delete("/:id", async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, "BAD_REQUEST", "Invalid role ID", 400);
  }

  const role = await prisma.role.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });

  if (!role) {
    return jsonError(res, "NOT_FOUND", "Role not found", 404);
  }

  if (role.isSystem) {
    return jsonError(res, "FORBIDDEN", "Cannot delete a system role", 403);
  }

  if (role._count.users > 0) {
    return jsonError(
      res,
      "CONFLICT",
      `Cannot delete role with ${role._count.users} user(s) assigned. Reassign users first.`,
      409,
    );
  }

  await prisma.role.delete({ where: { id } });

  logActivity(
    req.adminUser?.id,
    "role.deleted",
    undefined,
    { name: role.name },
    req.ip,
  );

  jsonOk(res, { deleted: id });
});

export default router;
