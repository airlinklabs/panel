/**
 * V2 API — Admin images endpoints.
 *
 * GET    /api/v2/admin/images        — List images
 * POST   /api/v2/admin/images        — Create image
 * GET    /api/v2/admin/images/:id    — Get image
 * PUT    /api/v2/admin/images/:id    — Update image
 * DELETE /api/v2/admin/images/:id    — Delete image
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
import { adminCreateImageBody, adminUpdateImageBody } from "../dto";

const router = Router();

router.use(async (req, res, next) => {
  const admin = await requireAdmin(req, res);
  if (!admin) {
    return;
  }
  req.adminUser = admin;
  next();
});

router.get("/", async (req, res) => {
  const page = parsePage(req.query.page);
  const perPage = parsePerPage(req.query.perPage);
  const [images, total] = await Promise.all([
    prisma.images.findMany({
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { createdAt: "desc" },
    }),
    prisma.images.count(),
  ]);
  jsonOk(res, images, {
    current_page: page,
    per_page: perPage,
    total,
    last_page: Math.ceil(total / perPage),
  });
});

router.post("/", parseBody(adminCreateImageBody), async (req, res) => {
  const data = req.validatedBody as any;
  const image = await prisma.images.create({ data });
  logActivity(
    req.adminUser?.id,
    "image.created",
    undefined,
    { name: image.name },
    req.ip,
  );
  jsonOk(res, image);
});

router.get("/:id", async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, "BAD_REQUEST", "Invalid ID", 400);
  }
  const image = await prisma.images.findUnique({ where: { id } });
  if (!image) {
    return jsonError(res, "NOT_FOUND", "Not found", 404);
  }
  jsonOk(res, image);
});

router.put("/:id", parseBody(adminUpdateImageBody), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, "BAD_REQUEST", "Invalid ID", 400);
  }
  const existing = await prisma.images.findUnique({ where: { id } });
  if (!existing) {
    return jsonError(res, "NOT_FOUND", "Not found", 404);
  }
  const data = req.validatedBody as any;
  const updated = await prisma.images.update({ where: { id }, data });
  logActivity(
    req.adminUser?.id,
    "image.updated",
    undefined,
    { id, fields: Object.keys(data) },
    req.ip,
  );
  jsonOk(res, updated);
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    return jsonError(res, "BAD_REQUEST", "Invalid ID", 400);
  }
  const image = await prisma.images.findUnique({ where: { id } });
  if (!image) {
    return jsonError(res, "NOT_FOUND", "Not found", 404);
  }
  const serverCount = await prisma.server.count({ where: { imageId: id } });
  if (serverCount > 0) {
    return jsonError(
      res,
      "CONFLICT",
      `Cannot delete image with ${serverCount} servers`,
      409,
    );
  }
  await prisma.images.delete({ where: { id } });
  logActivity(
    req.adminUser?.id,
    "image.deleted",
    undefined,
    { name: image.name },
    req.ip,
  );
  jsonOk(res, { deleted: id });
});

export default router;
