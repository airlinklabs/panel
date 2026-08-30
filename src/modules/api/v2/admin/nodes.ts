/**
 * V2 API — Admin nodes endpoints.
 *
 * GET    /api/v2/admin/nodes              — List nodes
 * POST   /api/v2/admin/nodes              — Create node
 * GET    /api/v2/admin/nodes/:id          — Get node
 * PUT    /api/v2/admin/nodes/:id          — Update node
 * DELETE /api/v2/admin/nodes/:id          — Delete node
 * POST   /api/v2/admin/nodes/:id/verify   — Verify node
 * POST   /api/v2/admin/nodes/:id/maintenance — Toggle maintenance
 * GET    /api/v2/admin/nodes/:id/stats     — Get node stats
 * GET    /api/v2/admin/nodes/:id/allocations — List allocations
 * POST   /api/v2/admin/nodes/:id/allocations — Add allocation
 * DELETE /api/v2/admin/nodes/:id/allocations/:allocId — Delete allocation
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
import {
  adminCreateNodeBody,
  adminUpdateNodeBody,
  adminCreateAllocationBody,
} from "../dto";
import { daemonRequestByNode } from "../../../../services/daemonService";

const router = Router();

// All routes require admin
router.use(async (req, res, next) => {
  const admin = await requireAdmin(req, res);
  if (!admin) {
    return;
  }
  req.adminUser = admin;
  next();
});

// ---------------------------------------------------------------------------
// GET /api/v2/admin/nodes — List nodes
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  const page = parsePage(req.query.page);
  const perPage = parsePerPage(req.query.perPage);

  const [nodes, total] = await Promise.all([
    prisma.node.findMany({
      include: {
        location: { select: { id: true, name: true, shortCode: true } },
        _count: { select: { servers: true, allocations: true } },
      },
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { createdAt: "desc" },
    }),
    prisma.node.count(),
  ]);

  const totalPages = Math.ceil(total / perPage);
  jsonOk(res, nodes, {
    current_page: page,
    per_page: perPage,
    total,
    last_page: totalPages,
  });
});

// ---------------------------------------------------------------------------
// POST /api/v2/admin/nodes — Create node
// ---------------------------------------------------------------------------
router.post("/", parseBody(adminCreateNodeBody), async (req, res) => {
  const data = req.validatedBody as any;

  const node = await prisma.node.create({
    data: {
      name: data.name,
      address: data.address,
      port: data.port,
      sftpPort: data.sftpPort,
      key: data.key,
      ram: data.ram,
      cpu: data.cpu,
      disk: data.disk,
      locationId: data.locationId,
      overallocateMemory: data.overallocateMemory,
      overallocateDisk: data.overallocateDisk,
      overallocateCpu: data.overallocateCpu,
    },
    include: {
      location: { select: { id: true, name: true, shortCode: true } },
    },
  });

  logActivity(
    req.adminUser?.id,
    "node.created",
    undefined,
    { name: node.name },
    req.ip,
  );

  jsonOk(res, node);
});

// ---------------------------------------------------------------------------
// GET /api/v2/admin/nodes/:id — Get node
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, "BAD_REQUEST", "Invalid node ID", 400);
  }

  const node = await prisma.node.findUnique({
    where: { id },
    include: {
      location: { select: { id: true, name: true, shortCode: true } },
      _count: { select: { servers: true, allocations: true } },
    },
  });

  if (!node) {
    return jsonError(res, "NOT_FOUND", "Node not found", 404);
  }
  jsonOk(res, node);
});

// ---------------------------------------------------------------------------
// PUT /api/v2/admin/nodes/:id — Update node
// ---------------------------------------------------------------------------
router.put("/:id", parseBody(adminUpdateNodeBody), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, "BAD_REQUEST", "Invalid node ID", 400);
  }

  const existing = await prisma.node.findUnique({ where: { id } });
  if (!existing) {
    return jsonError(res, "NOT_FOUND", "Node not found", 404);
  }

  const data = req.validatedBody as any;
  const updateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      updateData[key] = value;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return jsonError(res, "BAD_REQUEST", "No fields to update", 400);
  }

  const updated = await prisma.node.update({
    where: { id },
    data: updateData,
    include: {
      location: { select: { id: true, name: true, shortCode: true } },
    },
  });

  logActivity(
    req.adminUser?.id,
    "node.updated",
    undefined,
    { nodeId: id, fields: Object.keys(updateData) },
    req.ip,
  );

  jsonOk(res, updated);
});

// ---------------------------------------------------------------------------
// DELETE /api/v2/admin/nodes/:id — Delete node
// ---------------------------------------------------------------------------
router.delete("/:id", async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, "BAD_REQUEST", "Invalid node ID", 400);
  }

  const node = await prisma.node.findUnique({ where: { id } });
  if (!node) {
    return jsonError(res, "NOT_FOUND", "Node not found", 404);
  }

  // Check for servers on this node
  const serverCount = await prisma.server.count({ where: { nodeId: id } });
  if (serverCount > 0) {
    return jsonError(
      res,
      "CONFLICT",
      `Cannot delete node with ${serverCount} servers attached`,
      409,
    );
  }

  await prisma.node.delete({ where: { id } });

  logActivity(
    req.adminUser?.id,
    "node.deleted",
    undefined,
    { name: node.name },
    req.ip,
  );

  jsonOk(res, { deleted: id });
});

// ---------------------------------------------------------------------------
// POST /api/v2/admin/nodes/:id/verify — Verify node
// ---------------------------------------------------------------------------
router.post("/:id/verify", async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, "BAD_REQUEST", "Invalid node ID", 400);
  }

  const node = await prisma.node.findUnique({ where: { id } });
  if (!node) {
    return jsonError(res, "NOT_FOUND", "Node not found", 404);
  }

  try {
    const response = await daemonRequestByNode(node.id, "/", {
      timeout: 10000,
    });

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      jsonOk(res, {
        verified: true,
        version: (data as any).version ?? "unknown",
      });
    } else {
      jsonOk(res, { verified: false, error: `HTTP ${response.status}` });
    }
  } catch (err) {
    jsonOk(res, { verified: false, error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/admin/nodes/:id/maintenance — Toggle maintenance
// ---------------------------------------------------------------------------
router.post("/:id/maintenance", async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, "BAD_REQUEST", "Invalid node ID", 400);
  }

  const node = await prisma.node.findUnique({ where: { id } });
  if (!node) {
    return jsonError(res, "NOT_FOUND", "Node not found", 404);
  }

  const updated = await prisma.node.update({
    where: { id },
    data: { maintenanceMode: !node.maintenanceMode },
  });

  logActivity(
    req.adminUser?.id,
    updated.maintenanceMode
      ? "node.maintenance.enabled"
      : "node.maintenance.disabled",
    undefined,
    { nodeId: id },
    req.ip,
  );

  jsonOk(res, { nodeId: id, maintenanceMode: updated.maintenanceMode });
});

// ---------------------------------------------------------------------------
// GET /api/v2/admin/nodes/:id/stats — Get node stats
// ---------------------------------------------------------------------------
router.get("/:id/stats", async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, "BAD_REQUEST", "Invalid node ID", 400);
  }

  const node = await prisma.node.findUnique({ where: { id } });
  if (!node) {
    return jsonError(res, "NOT_FOUND", "Node not found", 404);
  }

  try {
    const response = await daemonRequestByNode(node.id, "/stats", {
      timeout: 10000,
    });

    if (!response.ok) {
      return jsonError(
        res,
        "DAEMON_ERROR",
        `Daemon returned ${response.status}`,
        502,
      );
    }

    const data = await response.json();
    jsonOk(res, data);
  } catch {
    jsonError(res, "DAEMON_UNREACHABLE", "Could not reach daemon", 502);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v2/admin/nodes/:id/allocations — List allocations
// ---------------------------------------------------------------------------
router.get("/:id/allocations", async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, "BAD_REQUEST", "Invalid node ID", 400);
  }

  const allocations = await prisma.allocation.findMany({
    where: { nodeId: id },
    include: {
      server: { select: { UUID: true, name: true } },
    },
    orderBy: { port: "asc" },
  });

  jsonOk(res, allocations);
});

// ---------------------------------------------------------------------------
// POST /api/v2/admin/nodes/:id/allocations — Add allocation
// ---------------------------------------------------------------------------
router.post(
  "/:id/allocations",
  parseBody(adminCreateAllocationBody),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      return jsonError(res, "BAD_REQUEST", "Invalid node ID", 400);
    }

    const node = await prisma.node.findUnique({ where: { id } });
    if (!node) {
      return jsonError(res, "NOT_FOUND", "Node not found", 404);
    }

    const { ip, port } = req.validatedBody as { ip: string; port: number };

    // Check uniqueness
    const existing = await prisma.allocation.findFirst({
      where: { nodeId: id, ip, port },
    });
    if (existing) {
      return jsonError(res, "CONFLICT", "Allocation already exists", 409);
    }

    const allocation = await prisma.allocation.create({
      data: { nodeId: id, ip, port },
    });

    jsonOk(res, allocation);
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/v2/admin/nodes/:id/allocations/:allocId — Delete allocation
// ---------------------------------------------------------------------------
router.delete("/:id/allocations/:allocId", async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const allocId = parseInt(String(req.params.allocId), 10);
  if (isNaN(id) || isNaN(allocId)) {
    return jsonError(res, "BAD_REQUEST", "Invalid ID", 400);
  }

  const allocation = await prisma.allocation.findUnique({
    where: { id: allocId },
  });
  if (!allocation || allocation.nodeId !== id) {
    return jsonError(res, "NOT_FOUND", "Allocation not found", 404);
  }

  if (allocation.serverId) {
    return jsonError(
      res,
      "CONFLICT",
      "Cannot delete allocation assigned to a server",
      409,
    );
  }

  await prisma.allocation.delete({ where: { id: allocId } });
  jsonOk(res, { deleted: allocId });
});

export default router;
