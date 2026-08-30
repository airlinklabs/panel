/**
 * V2 API — System endpoints.
 *
 * GET  /api/v2/system/status    — System status
 * GET  /api/v2/system/health    — Health check
 * POST /api/v2/system/test-node — Test node connection
 */

import { Router } from "express";
import prisma from "../../../db";
import { jsonOk, jsonError, requireUser } from "./helpers";
import { daemonRequestDirect } from "../../../services/daemonService";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v2/system/status — System status
// ---------------------------------------------------------------------------
router.get("/status", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const [serverCount, nodeCount, userCount] = await Promise.all([
    prisma.server.count(),
    prisma.node.count(),
    prisma.users.count(),
  ]);

  jsonOk(res, {
    version: process.env.AIRLINK_VERSION ?? "2.0.0",
    servers: serverCount,
    nodes: nodeCount,
    users: userCount,
    uptime: process.uptime(),
  });
});

// ---------------------------------------------------------------------------
// GET /api/v2/system/health — Health check
// ---------------------------------------------------------------------------
router.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    jsonOk(res, { status: "healthy", database: "connected" });
  } catch {
    jsonOk(res, { status: "degraded", database: "disconnected" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/system/test-node — Test node connection
// ---------------------------------------------------------------------------
router.post("/test-node", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }
  if (!user.isAdmin) {
    return jsonError(res, "FORBIDDEN", "Admin access required", 403);
  }

  const { address, port, key } = req.body as {
    address?: string;
    port?: number;
    key?: string;
  };
  if (!address || !port || !key) {
    return jsonError(
      res,
      "BAD_REQUEST",
      "address, port, and key are required",
      400,
    );
  }

  try {
    const response = await daemonRequestDirect(address, port, key, "/", {
      timeout: 10000,
    });

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      jsonOk(res, {
        connected: true,
        daemonVersion: (data as any).version ?? "unknown",
      });
    } else {
      jsonOk(res, { connected: false, error: `HTTP ${response.status}` });
    }
  } catch (err) {
    jsonOk(res, { connected: false, error: String(err) });
  }
});

export default router;
