/**
 * V2 API — Servers endpoints.
 *
 * GET    /api/v2/servers              — List user's servers
 * GET    /api/v2/servers/:id          — Get server details
 * PATCH  /api/v2/servers/:id          — Update server
 * DELETE /api/v2/servers/:id          — Delete server
 * POST   /api/v2/servers/:id/power    — Power action
 * POST   /api/v2/servers/:id/reinstall — Reinstall server
 * GET    /api/v2/servers/:id/status   — Get server status
 */

import { Router } from "express";
import prisma from "../../../db";
import { parseBody } from "../../../utils/validation";
import {
  jsonOk,
  jsonError,
  requireUser,
  resolveServer,
  requireSubUserPermission,
  checkSuspended,
  logActivity,
  paginateQuery,
  parsePage,
  parsePerPage,
  getAuthenticatedUserId,
} from "./helpers";
import { updateServerBody, powerBody } from "./dto";
import {
  daemonRequest,
  DaemonNodeNotFoundError,
} from "../../../services/daemonService";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v2/servers — List user's servers
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const page = parsePage(req.query.page);
  const perPage = parsePerPage(req.query.perPage);

  const where = user.isAdmin
    ? {}
    : {
        OR: [{ ownerId: user.id }, { subUsers: { some: { userId: user.id } } }],
      };

  const { data: servers, meta } = await paginateQuery(
    (args) =>
      prisma.server.findMany({
        where,
        include: {
          node: { select: { id: true, name: true, address: true } },
          image: { select: { id: true, name: true } },
          owner: { select: { id: true, username: true, email: true } },
          _count: {
            select: { backups: true, databases: true, subUsers: true },
          },
        },
        ...args,
        orderBy: { createdAt: "desc" },
      }),
    () => prisma.server.count({ where }),
    page,
    perPage,
  );

  jsonOk(res, servers, meta);
});

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id — Get server details
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }

  const server = await prisma.server.findUnique({
    where: { UUID: resolved.server.UUID },
    include: {
      node: { select: { id: true, name: true, address: true, port: true } },
      image: {
        select: { id: true, name: true, dockerImages: true, startup: true },
      },
      owner: { select: { id: true, username: true, email: true } },
      _count: {
        select: {
          backups: true,
          databases: true,
          subUsers: true,
          schedules: true,
        },
      },
    },
  });

  jsonOk(res, server);
});

// ---------------------------------------------------------------------------
// PATCH /api/v2/servers/:id — Update server
// ---------------------------------------------------------------------------
router.patch("/:id", parseBody(updateServerBody), async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }

  // Only owner or admin can update server settings
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
        "Only the server owner can update settings",
        403,
      );
    }
  }

  if (checkSuspended(res, resolved)) {
    return;
  }

  const data = req.validatedBody as any;
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) {
    updateData.name = data.name;
  }
  if (data.description !== undefined) {
    updateData.description = data.description;
  }
  if (data.memory !== undefined) {
    updateData.Memory = data.memory;
  }
  if (data.cpu !== undefined) {
    updateData.Cpu = data.cpu;
  }
  if (data.storage !== undefined) {
    updateData.Storage = data.storage;
  }
  if (data.swap !== undefined) {
    updateData.Swap = data.swap;
  }
  if (data.backupLimit !== undefined) {
    updateData.backupLimit = data.backupLimit;
  }
  if (data.databaseLimit !== undefined) {
    updateData.databaseLimit = data.databaseLimit;
  }

  if (Object.keys(updateData).length === 0) {
    return jsonError(res, "BAD_REQUEST", "No fields to update", 400);
  }

  const updated = await prisma.server.update({
    where: { UUID: resolved.server.UUID },
    data: updateData,
  });

  logActivity(
    getAuthenticatedUserId(req),
    "server.updated",
    resolved.server.UUID,
    { fields: Object.keys(updateData) },
    req.ip,
  );

  jsonOk(res, updated);
});

// ---------------------------------------------------------------------------
// DELETE /api/v2/servers/:id — Delete server
// ---------------------------------------------------------------------------
router.delete("/:id", async (req, res) => {
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
        "Only the server owner can delete the server",
        403,
      );
    }
  }

  // Notify daemon before deleting
  try {
    await daemonRequest(
      resolved.server.UUID,
      `/servers/${resolved.server.UUID}`,
      {
        method: "DELETE",
        timeout: 10000,
      },
    );
  } catch {
    // Best effort — daemon may be offline
  }

  await prisma.server.delete({ where: { UUID: resolved.server.UUID } });

  logActivity(
    getAuthenticatedUserId(req),
    "server.deleted",
    resolved.server.UUID,
    { name: resolved.server.name },
    req.ip,
  );

  jsonOk(res, { deleted: true });
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/power — Power action
// ---------------------------------------------------------------------------
router.post("/:id/power", parseBody(powerBody), async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }

  // Permission check for sub-users
  const { action } = req.validatedBody as { action: string };
  const permMap: Record<string, string> = {
    start: "start",
    stop: "stop",
    restart: "restart",
    kill: "kill",
  };
  if (
    permMap[action] &&
    !requireSubUserPermission(res, resolved, permMap[action] as any)
  ) {
    return;
  }

  try {
    const response = await daemonRequest(
      resolved.server.UUID,
      `/server/${resolved.server.UUID}/power`,
      { method: "POST", body: { action }, timeout: 30000 },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "Daemon error");
      return jsonError(
        res,
        "DAEMON_ERROR",
        `Daemon returned ${response.status}: ${text}`,
        502,
      );
    }

    logActivity(
      getAuthenticatedUserId(req),
      `server.power.${action}`,
      resolved.server.UUID,
      { action },
      req.ip,
    );

    jsonOk(res, { action, status: "sent" });
  } catch (err) {
    if (err instanceof DaemonNodeNotFoundError) {
      return jsonError(res, "NOT_FOUND", "Node not found", 404);
    }
    jsonError(res, "DAEMON_UNREACHABLE", "Could not reach daemon", 502);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/reinstall — Reinstall server
// ---------------------------------------------------------------------------
router.post("/:id/reinstall", async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }

  if (!requireSubUserPermission(res, resolved, "reinstall")) {
    return;
  }

  try {
    const response = await daemonRequest(
      resolved.server.UUID,
      `/server/${resolved.server.UUID}/reinstall`,
      { method: "POST", timeout: 30000 },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "Daemon error");
      return jsonError(
        res,
        "DAEMON_ERROR",
        `Daemon returned ${response.status}: ${text}`,
        502,
      );
    }

    await prisma.server.update({
      where: { UUID: resolved.server.UUID },
      data: { Installing: true },
    });

    logActivity(
      getAuthenticatedUserId(req),
      "server.reinstall",
      resolved.server.UUID,
      {},
      req.ip,
    );

    jsonOk(res, { status: "reinstalling" });
  } catch (err) {
    if (err instanceof DaemonNodeNotFoundError) {
      return jsonError(res, "NOT_FOUND", "Node not found", 404);
    }
    jsonError(res, "DAEMON_UNREACHABLE", "Could not reach daemon", 502);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/status — Get server status
// ---------------------------------------------------------------------------
router.get("/:id/status", async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }

  try {
    const response = await daemonRequest(
      resolved.server.UUID,
      `/containerstatus/${resolved.server.UUID}`,
      { timeout: 10000 },
    );

    if (!response.ok) {
      return jsonOk(res, { online: false, status: "unknown" });
    }

    const data = (await response.json()) as {
      status?: string;
      running?: boolean;
    };
    jsonOk(res, {
      online: data.running ?? false,
      status: data.status ?? "unknown",
    });
  } catch (err) {
    if (err instanceof DaemonNodeNotFoundError) {
      return jsonOk(res, { online: false, status: "node_not_found" });
    }
    jsonOk(res, { online: false, status: "unreachable" });
  }
});

export default router;
