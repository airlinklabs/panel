/**
 * V2 API — Backups endpoints.
 *
 * GET    /api/v2/servers/:id/backups                  — List backups
 * POST   /api/v2/servers/:id/backups                  — Create backup
 * DELETE /api/v2/servers/:id/backups/:backupId         — Delete backup
 * POST   /api/v2/servers/:id/backups/:backupId/restore — Restore backup
 * PATCH  /api/v2/servers/:id/backups/:backupId/lock    — Toggle lock
 * GET    /api/v2/servers/:id/backups/:backupId/download — Download backup
 * GET    /api/v2/servers/:id/backups/progress           — Backup progress
 * GET    /api/v2/servers/:id/backups/restore/progress   — Restore progress
 */

import { Router } from "express";
import prisma from "../../../db";
import { parseBody } from "../../../utils/validation";
import {
  jsonOk,
  jsonError,
  resolveServer,
  requireSubUserPermission,
  checkSuspended,
  logActivity,
  getAuthenticatedUserId,
  getAppProtocol,
} from "./helpers";
import { createBackupBody } from "./dto";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/backups — List backups
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, "backups")) {
    return;
  }

  const backups = await prisma.backup.findMany({
    where: { serverId: resolved.server.UUID },
    orderBy: { createdAt: "desc" },
  });

  jsonOk(res, backups);
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/backups — Create backup
// ---------------------------------------------------------------------------
router.post("/", parseBody(createBackupBody), async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, "backups.create")) {
    return;
  }

  const { name } = req.validatedBody as { name: string };

  // Check backup limit
  const backupCount = await prisma.backup.count({
    where: { serverId: resolved.server.UUID },
  });
  if (
    resolved.server.backupLimit > 0 &&
    backupCount >= resolved.server.backupLimit
  ) {
    return jsonError(res, "FORBIDDEN", "Backup limit reached", 403);
  }

  const node = await prisma.node.findUnique({
    where: { id: resolved.server.nodeId },
  });
  if (!node) {
    return jsonError(res, "NOT_FOUND", "Node not found", 404);
  }

  try {
    const protocol = getAppProtocol(req);
    const response = await fetch(
      `${protocol}://${node.address}:${node.port}/servers/${resolved.server.UUID}/backup`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${node.key}`,
        },
        body: JSON.stringify({ name }),
        signal: AbortSignal.timeout(60000),
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "Daemon error");
      return jsonError(
        res,
        "DAEMON_ERROR",
        `Failed to create backup: ${text}`,
        502,
      );
    }

    logActivity(
      getAuthenticatedUserId(req),
      "backup.created",
      resolved.server.UUID,
      { name },
      req.ip,
    );

    jsonOk(res, { name, status: "creating" });
  } catch {
    jsonError(res, "DAEMON_UNREACHABLE", "Could not reach daemon", 502);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v2/servers/:id/backups/:backupId — Delete backup
// ---------------------------------------------------------------------------
router.delete("/:backupId", async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, "backups.delete")) {
    return;
  }

  const backup = await prisma.backup.findUnique({
    where: { UUID: req.params.backupId },
  });
  if (!backup || backup.serverId !== resolved.server.UUID) {
    return jsonError(res, "NOT_FOUND", "Backup not found", 404);
  }

  if (backup.locked) {
    return jsonError(res, "FORBIDDEN", "Backup is locked", 403);
  }

  const node = await prisma.node.findUnique({
    where: { id: resolved.server.nodeId },
  });
  if (node) {
    try {
      const protocol = getAppProtocol(req);
      await fetch(
        `${protocol}://${node.address}:${node.port}/servers/${resolved.server.UUID}/backup/${backup.UUID}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${node.key}` },
          signal: AbortSignal.timeout(30000),
        },
      );
    } catch {
      // Best effort
    }
  }

  await prisma.backup.delete({ where: { UUID: backup.UUID } });

  logActivity(
    getAuthenticatedUserId(req),
    "backup.deleted",
    resolved.server.UUID,
    { backupName: backup.name },
    req.ip,
  );

  jsonOk(res, { deleted: backup.UUID });
});

// ---------------------------------------------------------------------------
// POST /api/v2/servers/:id/backups/:backupId/restore — Restore backup
// ---------------------------------------------------------------------------
router.post("/:backupId/restore", async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (checkSuspended(res, resolved)) {
    return;
  }

  const backup = await prisma.backup.findUnique({
    where: { UUID: req.params.backupId },
  });
  if (!backup || backup.serverId !== resolved.server.UUID) {
    return jsonError(res, "NOT_FOUND", "Backup not found", 404);
  }

  const node = await prisma.node.findUnique({
    where: { id: resolved.server.nodeId },
  });
  if (!node) {
    return jsonError(res, "NOT_FOUND", "Node not found", 404);
  }

  try {
    const protocol = getAppProtocol(req);
    const response = await fetch(
      `${protocol}://${node.address}:${node.port}/servers/${resolved.server.UUID}/backup/${backup.UUID}/restore`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${node.key}` },
        signal: AbortSignal.timeout(120000),
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "Daemon error");
      return jsonError(
        res,
        "DAEMON_ERROR",
        `Failed to restore backup: ${text}`,
        502,
      );
    }

    logActivity(
      getAuthenticatedUserId(req),
      "backup.restored",
      resolved.server.UUID,
      { backupName: backup.name },
      req.ip,
    );

    jsonOk(res, { backupId: backup.UUID, status: "restoring" });
  } catch {
    jsonError(res, "DAEMON_UNREACHABLE", "Could not reach daemon", 502);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/v2/servers/:id/backups/:backupId/lock — Toggle lock
// ---------------------------------------------------------------------------
router.patch("/:backupId/lock", async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }

  const backup = await prisma.backup.findUnique({
    where: { UUID: req.params.backupId },
  });
  if (!backup || backup.serverId !== resolved.server.UUID) {
    return jsonError(res, "NOT_FOUND", "Backup not found", 404);
  }

  const updated = await prisma.backup.update({
    where: { UUID: backup.UUID },
    data: { locked: !backup.locked },
  });

  jsonOk(res, { UUID: updated.UUID, locked: updated.locked });
});

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/backups/:backupId/download — Download backup
// ---------------------------------------------------------------------------
router.get("/:backupId/download", async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }
  if (!requireSubUserPermission(res, resolved, "backups")) {
    return;
  }

  const backup = await prisma.backup.findUnique({
    where: { UUID: req.params.backupId },
  });
  if (!backup || backup.serverId !== resolved.server.UUID) {
    return jsonError(res, "NOT_FOUND", "Backup not found", 404);
  }

  const node = await prisma.node.findUnique({
    where: { id: resolved.server.nodeId },
  });
  if (!node) {
    return jsonError(res, "NOT_FOUND", "Node not found", 404);
  }

  try {
    const protocol = getAppProtocol(req);
    const response = await fetch(
      `${protocol}://${node.address}:${node.port}/servers/${resolved.server.UUID}/backup/${backup.UUID}/download`,
      {
        headers: { Authorization: `Bearer ${node.key}` },
        signal: AbortSignal.timeout(120000),
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "Daemon error");
      return jsonError(
        res,
        "DAEMON_ERROR",
        `Failed to download backup: ${text}`,
        502,
      );
    }

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${backup.name}.zip"`,
    );
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        res.write(value);
      }
    }
    res.end();
  } catch {
    jsonError(res, "DAEMON_UNREACHABLE", "Could not reach daemon", 502);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/backups/progress — Backup progress
// ---------------------------------------------------------------------------
router.get("/progress", async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }

  const node = await prisma.node.findUnique({
    where: { id: resolved.server.nodeId },
  });
  if (!node) {
    return jsonOk(res, { progress: 0, status: "unknown" });
  }

  try {
    const protocol = getAppProtocol(req);
    const response = await fetch(
      `${protocol}://${node.address}:${node.port}/servers/${resolved.server.UUID}/backup/progress`,
      {
        headers: { Authorization: `Bearer ${node.key}` },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!response.ok) {
      return jsonOk(res, { progress: 0, status: "unknown" });
    }

    const data = await response.json();
    jsonOk(res, data);
  } catch {
    jsonOk(res, { progress: 0, status: "unreachable" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v2/servers/:id/backups/restore/progress — Restore progress
// ---------------------------------------------------------------------------
router.get("/restore/progress", async (req, res) => {
  const resolved = await resolveServer(req, res);
  if (!resolved) {
    return;
  }

  const node = await prisma.node.findUnique({
    where: { id: resolved.server.nodeId },
  });
  if (!node) {
    return jsonOk(res, { progress: 0, status: "unknown" });
  }

  try {
    const protocol = getAppProtocol(req);
    const response = await fetch(
      `${protocol}://${node.address}:${node.port}/servers/${resolved.server.UUID}/backup/restore/progress`,
      {
        headers: { Authorization: `Bearer ${node.key}` },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!response.ok) {
      return jsonOk(res, { progress: 0, status: "unknown" });
    }

    const data = await response.json();
    jsonOk(res, data);
  } catch {
    jsonOk(res, { progress: 0, status: "unreachable" });
  }
});

export default router;
