/**
 * V2 API — Admin users endpoints.
 *
 * GET    /api/v2/admin/users              — List users
 * POST   /api/v2/admin/users              — Create user
 * GET    /api/v2/admin/users/:id          — Get user
 * PUT    /api/v2/admin/users/:id          — Update user
 * DELETE /api/v2/admin/users/:id          — Delete user
 * POST   /api/v2/admin/users/:id/transfer — Transfer ownership
 * POST   /api/v2/admin/users/:id/onboarding/reset — Reset onboarding
 */

import { Router } from "express";
import prisma from "../../../../db";
import bcrypt from "bcryptjs";
import { parseBody } from "../../../../utils/validation";
import {
  jsonOk,
  jsonError,
  requireAdmin,
  logActivity,
  parsePage,
  parsePerPage,
} from "../helpers";
import {
  adminCreateUserBody,
  adminUpdateUserBody,
  adminTransferOwnerBody,
} from "../dto";

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
// GET /api/v2/admin/users — List users
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  const page = parsePage(req.query.page);
  const perPage = parsePerPage(req.query.perPage);
  const search = (req.query.search as string) || "";

  const where = search
    ? {
        OR: [
          { email: { contains: search } },
          { username: { contains: search } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    prisma.users.findMany({
      where,
      select: {
        id: true,
        email: true,
        username: true,
        isAdmin: true,
        role: true,
        description: true,
        avatar: true,
        serverLimit: true,
        totpEnabled: true,
        createdAt: true,
        _count: { select: { servers: true } },
      },
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { createdAt: "desc" },
    }),
    prisma.users.count({ where }),
  ]);

  const totalPages = Math.ceil(total / perPage);
  jsonOk(res, users, {
    current_page: page,
    per_page: perPage,
    total,
    last_page: totalPages,
  });
});

// ---------------------------------------------------------------------------
// POST /api/v2/admin/users — Create user
// ---------------------------------------------------------------------------
router.post("/", parseBody(adminCreateUserBody), async (req, res) => {
  const data = req.validatedBody as any;

  // Check email uniqueness
  const existingEmail = await prisma.users.findUnique({
    where: { email: data.email },
  });
  if (existingEmail) {
    return jsonError(res, "CONFLICT", "Email is already registered", 409);
  }

  // Check username uniqueness if provided
  if (data.username) {
    const existingUsername = await prisma.users.findUnique({
      where: { username: data.username },
    });
    if (existingUsername) {
      return jsonError(res, "CONFLICT", "Username is already taken", 409);
    }
  }

  // Single-owner constraint: only one user can have the owner role
  const role = data.role || (data.isAdmin ? "admin" : "user");
  if (role === "owner") {
    const existingOwner = await prisma.users.findFirst({
      where: { role: "owner" },
    });
    if (existingOwner) {
      return jsonError(
        res,
        "CONFLICT",
        "An owner already exists. Transfer ownership first.",
        409,
      );
    }
  }

  const hashedPassword = await bcrypt.hash(data.password, 12);

  const user = await prisma.users.create({
    data: {
      email: data.email,
      username: data.username,
      password: hashedPassword,
      role,
      isAdmin: role === "owner" || role === "admin" ? true : data.isAdmin,
      serverLimit: data.serverLimit,
      maxMemory: data.maxMemory,
      maxCpu: data.maxCpu,
      maxStorage: data.maxStorage,
      maxDatabases: data.maxDatabases,
    },
    select: {
      id: true,
      email: true,
      username: true,
      isAdmin: true,
      role: true,
      createdAt: true,
    },
  });

  logActivity(
    req.adminUser?.id,
    "user.created",
    undefined,
    { email: data.email },
    req.ip,
  );

  jsonOk(res, user);
});

// ---------------------------------------------------------------------------
// GET /api/v2/admin/users/:id — Get user
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, "BAD_REQUEST", "Invalid user ID", 400);
  }

  const user = await prisma.users.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      username: true,
      isAdmin: true,
      role: true,
      description: true,
      avatar: true,
      permissions: true,
      serverLimit: true,
      maxMemory: true,
      maxCpu: true,
      maxStorage: true,
      maxDatabases: true,
      preferredNodeId: true,
      totpEnabled: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { servers: true, subUserAccess: true, apiKeys: true } },
    },
  });

  if (!user) {
    return jsonError(res, "NOT_FOUND", "User not found", 404);
  }
  jsonOk(res, user);
});

// ---------------------------------------------------------------------------
// PUT /api/v2/admin/users/:id — Update user
// ---------------------------------------------------------------------------
router.put("/:id", parseBody(adminUpdateUserBody), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, "BAD_REQUEST", "Invalid user ID", 400);
  }

  const existing = await prisma.users.findUnique({ where: { id } });
  if (!existing) {
    return jsonError(res, "NOT_FOUND", "User not found", 404);
  }

  const data = req.validatedBody as any;
  const updateData: Record<string, unknown> = {};

  // Owner role protections
  if (
    existing.role === "owner" &&
    data.role !== undefined &&
    data.role !== "owner"
  ) {
    return jsonError(
      res,
      "FORBIDDEN",
      "Cannot change the owner's role directly. Use the transfer ownership endpoint.",
      403,
    );
  }
  if (data.role === "owner" && existing.role !== "owner") {
    const existingOwner = await prisma.users.findFirst({
      where: { role: "owner", id: { not: id } },
    });
    if (existingOwner) {
      return jsonError(
        res,
        "CONFLICT",
        "An owner already exists. Transfer ownership first.",
        409,
      );
    }
  }

  if (data.email !== undefined) {
    const dup = await prisma.users.findUnique({ where: { email: data.email } });
    if (dup && dup.id !== id) {
      return jsonError(res, "CONFLICT", "Email is already in use", 409);
    }
    updateData.email = data.email;
  }
  if (data.username !== undefined) {
    const dup = await prisma.users.findUnique({
      where: { username: data.username },
    });
    if (dup && dup.id !== id) {
      return jsonError(res, "CONFLICT", "Username is already taken", 409);
    }
    updateData.username = data.username;
  }
  if (data.password !== undefined) {
    updateData.password = await bcrypt.hash(data.password, 12);
  }
  if (data.isAdmin !== undefined) {
    updateData.isAdmin = data.isAdmin;
  }
  if (data.role !== undefined) {
    updateData.role = data.role;
    // Owner must always be admin
    if (data.role === "owner" && data.isAdmin === undefined) {
      updateData.isAdmin = true;
    }
  }
  if (data.serverLimit !== undefined) {
    updateData.serverLimit = data.serverLimit;
  }
  if (data.maxMemory !== undefined) {
    updateData.maxMemory = data.maxMemory;
  }
  if (data.maxCpu !== undefined) {
    updateData.maxCpu = data.maxCpu;
  }
  if (data.maxStorage !== undefined) {
    updateData.maxStorage = data.maxStorage;
  }
  if (data.maxDatabases !== undefined) {
    updateData.maxDatabases = data.maxDatabases;
  }

  if (Object.keys(updateData).length === 0) {
    return jsonError(res, "BAD_REQUEST", "No fields to update", 400);
  }

  const updated = await prisma.users.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      email: true,
      username: true,
      isAdmin: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  logActivity(
    req.adminUser?.id,
    "user.updated",
    undefined,
    { userId: id, fields: Object.keys(updateData) },
    req.ip,
  );

  jsonOk(res, updated);
});

// ---------------------------------------------------------------------------
// DELETE /api/v2/admin/users/:id — Delete user
// ---------------------------------------------------------------------------
router.delete("/:id", async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, "BAD_REQUEST", "Invalid user ID", 400);
  }

  const user = await prisma.users.findUnique({ where: { id } });
  if (!user) {
    return jsonError(res, "NOT_FOUND", "User not found", 404);
  }

  // Can't delete yourself
  if (req.adminUser?.id === id) {
    return jsonError(res, "BAD_REQUEST", "Cannot delete your own account", 400);
  }

  // Can't delete the owner
  if (user.role === "owner") {
    return jsonError(
      res,
      "FORBIDDEN",
      "Cannot delete the owner. Transfer ownership first.",
      403,
    );
  }

  // Check for owned servers
  const serverCount = await prisma.server.count({ where: { ownerId: id } });
  if (serverCount > 0) {
    return jsonError(
      res,
      "CONFLICT",
      `Cannot delete user with ${serverCount} servers. Transfer ownership first.`,
      409,
    );
  }

  await prisma.users.delete({ where: { id } });

  logActivity(
    req.adminUser?.id,
    "user.deleted",
    undefined,
    { email: user.email },
    req.ip,
  );

  jsonOk(res, { deleted: id });
});

// ---------------------------------------------------------------------------
// POST /api/v2/admin/users/:id/onboarding/reset — Reset onboarding state
// ---------------------------------------------------------------------------
router.post("/:id/onboarding/reset", async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, "BAD_REQUEST", "Invalid user ID", 400);
  }

  const user = await prisma.users.findUnique({ where: { id } });
  if (!user) {
    return jsonError(res, "NOT_FOUND", "User not found", 404);
  }

  await prisma.users.update({
    where: { id },
    data: {
      onboardingCompleted: false,
      onboardingSkipped: false,
    },
  });

  logActivity(
    req.adminUser?.id,
    "user.onboarding.reset",
    undefined,
    { userId: id },
    req.ip,
  );

  jsonOk(res, { reset: true });
});

// ---------------------------------------------------------------------------
// POST /api/v2/admin/users/:id/transfer — Transfer ownership
// ---------------------------------------------------------------------------
router.post(
  "/:id/transfer",
  parseBody(adminTransferOwnerBody),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      return jsonError(res, "BAD_REQUEST", "Invalid user ID", 400);
    }

    const { newOwnerId } = req.validatedBody as { newOwnerId: number };

    const user = await prisma.users.findUnique({ where: { id } });
    if (!user) {
      return jsonError(res, "NOT_FOUND", "User not found", 404);
    }
    if (user.role !== "owner") {
      return jsonError(
        res,
        "FORBIDDEN",
        "Only the current owner can transfer ownership",
        403,
      );
    }

    const newOwner = await prisma.users.findUnique({
      where: { id: newOwnerId },
    });
    if (!newOwner) {
      return jsonError(res, "NOT_FOUND", "New owner not found", 404);
    }
    if (newOwnerId === id) {
      return jsonError(
        res,
        "BAD_REQUEST",
        "Cannot transfer ownership to yourself",
        400,
      );
    }

    // Atomic transfer: swap roles and reassign servers
    await prisma.$transaction(async (tx) => {
      // Set new owner's role to 'owner'
      await tx.users.update({
        where: { id: newOwnerId },
        data: { role: "owner", isAdmin: true },
      });
      // Demote old owner to 'admin'
      await tx.users.update({
        where: { id },
        data: { role: "admin", isAdmin: true },
      });
      // Transfer all servers
      await tx.server.updateMany({
        where: { ownerId: id },
        data: { ownerId: newOwnerId },
      });
    });

    // Invalidate old owner's sessions (destroy all sessions for that user)
    try {
      const sessionStore = req.sessionStore as any;
      if (sessionStore && typeof sessionStore.destroy === "function") {
        await new Promise<void>((resolve) => {
          sessionStore.all((err: Error | null, sessions: any) => {
            if (err || !sessions) {
              resolve();
              return;
            }
            for (const [sid, sess] of Object.entries(sessions)) {
              const su = (sess as any)?.user;
              if (su?.id === id) {
                sessionStore.destroy(sid, () => {
                  /* noop */
                });
              }
            }
            resolve();
          });
        });
      }
    } catch {
      // Best-effort — session invalidation failure should not block transfer
    }

    logActivity(
      req.adminUser?.id,
      "user.ownership.transferred",
      undefined,
      { fromUserId: id, toUserId: newOwnerId },
      req.ip,
    );

    jsonOk(res, {
      transferred: true,
      fromUserId: id,
      toUserId: newOwnerId,
    });
  },
);

export default router;
