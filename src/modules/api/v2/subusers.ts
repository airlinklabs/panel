/**
 * V2 API — Sub-users endpoints.
 *
 * GET    /api/v2/servers/:id/subusers              — List sub-users
 * POST   /api/v2/servers/:id/subusers              — Add sub-user
 * PUT    /api/v2/servers/:id/subusers/:subId       — Update sub-user
 * DELETE /api/v2/servers/:id/subusers/:subId       — Remove sub-user
 */

import { Router } from 'express';
import prisma from '../../../db';
import { parseBody } from '../../../utils/validation';
import {
  jsonOk,
  jsonError,
  resolveServer,
  logActivity,
  getAuthenticatedUserId,
  paginateQuery,
  parsePage,
  parsePerPage,
} from './helpers';
import { createSubUserBody, updateSubUserBody } from './dto';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/subusers — List sub-users
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }

  // Only owner or admin can view sub-users
  if (!resolved.isOwner) {
    const user = await prisma.users.findUnique({
      where: {
        id: getAuthenticatedUserId(req),
      },
    });
    if (!user?.isAdmin) {
      return jsonError(
        res,
        "FORBIDDEN",
        "Only the server owner can manage sub-users",
        403,
      );
    }
  }

  const page = parsePage(req.query.page);
  const perPage = parsePerPage(req.query.perPage);
  const where = { serverId: resolved.server.UUID };

  const { data: subUsers, meta } = await paginateQuery(
    (args) =>
      prisma.subUser.findMany({
        where,
        ...args,
        include: {
          user: {
            select: { id: true, username: true, email: true, avatar: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    () => prisma.subUser.count({ where }),
    page,
    perPage,
  );

  jsonOk(res, subUsers, meta);
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/subusers — Add sub-user
// ---------------------------------------------------------------------------
router.post("/", parseBody(createSubUserBody), async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }

  // Only owner or admin can add sub-users
  if (!resolved.isOwner) {
    const user = await prisma.users.findUnique({
      where: {
        id: getAuthenticatedUserId(req),
      },
    });
    if (!user?.isAdmin) {
      return jsonError(
        res,
        "FORBIDDEN",
        "Only the server owner can add sub-users",
        403,
      );
    }
  }

  const { userId, permissions } = req.validatedBody as {
    userId: number;
    permissions: string[];
  };

  // Check target user exists
  const targetUser = await prisma.users.findUnique({ where: { id: userId } });
  if (!targetUser) {
    return jsonError(res, "NOT_FOUND", "User not found", 404);
  }

  // Can't add yourself as sub-user
  const callerId = getAuthenticatedUserId(req);
  if (userId === callerId) {
    return jsonError(
      res,
      "BAD_REQUEST",
      "Cannot add yourself as a sub-user",
      400,
    );
  }

  // Check not already a sub-user
  const existing = await prisma.subUser.findUnique({
    where: { serverId_userId: { serverId: resolved.server.UUID, userId } },
  });
  if (existing) {
    return jsonError(
      res,
      "CONFLICT",
      "User is already a sub-user of this server",
      409,
    );
  }

  const subUser = await prisma.subUser.create({
    data: {
      serverId: resolved.server.UUID,
      userId,
      permissions: JSON.stringify(permissions),
    },
    include: {
      user: { select: { id: true, username: true, email: true, avatar: true } },
    },
  });

  logActivity(
    callerId,
    "subuser.created",
    resolved.server.UUID,
    { targetUserId: userId, permissions },
    req.ip,
  );

  jsonOk(res, subUser);
});

// ---------------------------------------------------------------------------
// PUT /api/v2/servers/:id/subusers/:subId — Update sub-user
// ---------------------------------------------------------------------------
router.put("/:subId", parseBody(updateSubUserBody), async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }

  if (!resolved.isOwner) {
    const user = await prisma.users.findUnique({
      where: {
        id: getAuthenticatedUserId(req),
      },
    });
    if (!user?.isAdmin) {
      return jsonError(
        res,
        "FORBIDDEN",
        "Only the server owner can update sub-users",
        403,
      );
    }
  }

  const subId = parseInt(String(req.params.subId), 10);
  if (isNaN(subId)) {
    return jsonError(res, "BAD_REQUEST", "Invalid sub-user ID", 400);
  }

  const subUser = await prisma.subUser.findUnique({ where: { id: subId } });
  if (!subUser || subUser.serverId !== resolved.server.UUID) {
    return jsonError(res, "NOT_FOUND", "Sub-user not found", 404);
  }

  const { permissions } = req.validatedBody as { permissions: string[] };

  const updated = await prisma.subUser.update({
    where: { id: subId },
    data: { permissions: JSON.stringify(permissions) },
    include: {
      user: { select: { id: true, username: true, email: true, avatar: true } },
    },
  });

  logActivity(
    getAuthenticatedUserId(req),
    'subuser.updated',
    resolved.server.UUID,
    { subUserId: subId, permissions },
    req.ip,
  );

  jsonOk(res, updated);
});

// ---------------------------------------------------------------------------
// DELETE /api/v2/servers/:id/subusers/:subId — Remove sub-user
// ---------------------------------------------------------------------------
router.delete("/:subId", async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }

  if (!resolved.isOwner) {
    const user = await prisma.users.findUnique({
      where: {
        id: getAuthenticatedUserId(req),
      },
    });
    if (!user?.isAdmin) {
      return jsonError(
        res,
        "FORBIDDEN",
        "Only the server owner can remove sub-users",
        403,
      );
    }
  }

  const subId = parseInt(String(req.params.subId), 10);
  if (isNaN(subId)) {
    return jsonError(res, "BAD_REQUEST", "Invalid sub-user ID", 400);
  }

  const subUser = await prisma.subUser.findUnique({ where: { id: subId } });
  if (!subUser || subUser.serverId !== resolved.server.UUID) {
    return jsonError(res, "NOT_FOUND", "Sub-user not found", 404);
  }

  await prisma.subUser.delete({ where: { id: subId } });

  logActivity(
    getAuthenticatedUserId(req),
    'subuser.deleted',
    resolved.server.UUID,
    { subUserId: subId, targetUserId: subUser.userId },
    req.ip,
  );

  jsonOk(res, { deleted: subId });
});

export default router;
