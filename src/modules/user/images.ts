import { getSettings } from "../../handlers/settingsCache";
import type { Request, Response } from "express";
import { Router } from "express";
import prisma from "../../db";
import type { Module } from "../../handlers/moduleInit";
import { isAuthenticated } from "../../handlers/utils/auth/authUtil";
import logger from "../../handlers/logger";
import {
  isPterodactylEgg,
  parseEgg,
  normalizeEggForDb,
  validateEggData,
  fetchEggFromUrl,
} from "../../handlers/utils/egg/eggParser";
import { logActivity } from "../../handlers/utils/activity/activityLogger";

function normalizeImageData(raw: Record<string, unknown>) {
  if (isPterodactylEgg(raw)) {
    const egg = parseEgg(raw);
    const data = normalizeEggForDb(egg);
    return {
      ...data,
      portRequirements: JSON.stringify(
        raw.portRequirements ?? raw.port_requirements ?? [],
      ),
    };
  }

  const dockerImages = raw.docker_images || raw.dockerImages;
  const dockerImagesArray = Array.isArray(dockerImages)
    ? dockerImages
    : typeof dockerImages === 'object' && dockerImages !== null
      ? Object.entries(dockerImages as Record<string, string>).map(
        ([k, v]) => ({ [k]: v }),
      )
      : [];

  return {
    name: String(raw.name ?? ""),
    description: String(raw.description ?? ""),
    author: String(raw.author ?? ""),
    authorName: String(raw.authorName ?? ""),
    startup: String(raw.startup ?? ""),
    stop: String(raw.stop ?? ""),
    startup_done: String(raw.startup_done ?? ""),
    config_files: String(raw.config_files ?? ""),
    meta: JSON.stringify(raw.meta ?? {}),
    dockerImages: JSON.stringify(dockerImagesArray),
    info: JSON.stringify(raw.info ?? {}),
    scripts: JSON.stringify(raw.scripts ?? {}),
    variables: JSON.stringify(raw.variables ?? []),
    portRequirements: JSON.stringify(
      raw.portRequirements ?? raw.port_requirements ?? [],
    ),
  };
}

async function canSubmitImages(user: {
  id: number;
  isAdmin?: boolean;
  role?: string;
}): Promise<boolean> {
  if (user.isAdmin || user.role === 'owner' || user.role === 'admin') {
    return true;
  }
  const settings = await getSettings();
  return settings?.allowUserCreateImages === true;
}

const userImagesModule: Module = {
  info: {
    name: 'User Images Module',
    description:
      'Lets users submit and manage custom images for admin approval.',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    // Legacy /my-images pages redirect to Account #images (Phase 12)
    router.get("/my-images", isAuthenticated(), (_req, res) => {
      res.redirect("/account#images");
    });
    router.get("/my-images/new", isAuthenticated(), (_req, res) => {
      res.redirect("/account#images");
    });
    router.get("/my-images/edit/:id", isAuthenticated(), (_req, res) => {
      res.redirect("/account#images");
    });

    router.post(
      "/my-images/create",
      isAuthenticated(),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(401).json({ error: "Unauthorized" });
            return;
          }
          const allowed = await canSubmitImages(user);
          if (!allowed) {
            res
              .status(403)
              .json({ error: 'Image submissions are not enabled.' });
            return;
          }

          const {
            name,
            startup,
            description,
            author,
            authorName,
            dockerImages,
            variables,
          } = req.body;

          if (!name || !startup) {
            res
              .status(400)
              .json({ error: 'Name and startup command are required.' });
            return;
          }

          let parsedDockerImages: unknown = dockerImages;
          if (typeof dockerImages === "string" && dockerImages.trim()) {
            try {
              parsedDockerImages = JSON.parse(dockerImages);
            } catch {
              res
                .status(400)
                .json({ error: 'Docker images must be valid JSON.' });
              return;
            }
          }

          const raw = {
            name,
            startup,
            description: description || "",
            author: author || "",
            authorName: authorName || "",
            docker_images: parsedDockerImages,
            variables:
              typeof variables === 'string' && variables.trim()
                ? JSON.parse(variables)
                : variables || [],
          };

          const { valid, errors } = validateEggData(raw);
          if (!valid) {
            res
              .status(400)
              .json({ error: 'Invalid image configuration', details: errors });
            return;
          }

          const data = normalizeImageData(raw);

          const existing = await prisma.images.findFirst({
            where: { name: data.name },
          });
          if (existing) {
            res
              .status(409)
              .json({ error: 'An image with that name already exists.' });
            return;
          }

          const image = await prisma.images.create({
            data: {
              ...data,
              status: "pending",
              createdById: user.id,
            },
          });
          await logActivity(req, "image:submit", {
            metadata: { imageId: image.id, name: image.name },
          });
          res.status(200).json({
            success: true,
            message: 'Image submitted for review.',
            id: image.id,
          });
        } catch (error: unknown) {
          logger.error("Error submitting image:", error);
          res.status(500).json({ error: "Failed to submit image." });
        }
      },
    );

    router.post(
      "/my-images/import-url",
      isAuthenticated(),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(401).json({ error: "Unauthorized" });
            return;
          }
          const allowed = await canSubmitImages(user);
          if (!allowed) {
            res
              .status(403)
              .json({ error: 'Image submissions are not enabled.' });
            return;
          }

          const url = String(req.body?.url ?? "").trim();
          if (!url) {
            res.status(400).json({ error: "URL is required." });
            return;
          }

          const result = await fetchEggFromUrl(url);
          if (!result.ok) {
            res.status(400).json({ error: result.error });
            return;
          }

          const { valid, errors } = validateEggData(result.payload);
          if (!valid) {
            res
              .status(400)
              .json({ error: 'Invalid egg configuration', details: errors });
            return;
          }

          const data = normalizeImageData(result.payload);
          const existing = await prisma.images.findFirst({
            where: { name: data.name },
          });
          if (existing) {
            res
              .status(409)
              .json({ error: 'An image with that name already exists.' });
            return;
          }

          const image = await prisma.images.create({
            data: {
              ...data,
              status: "pending",
              createdById: user.id,
            },
          });

          await logActivity(req, "image:submit", {
            metadata: { imageId: image.id, name: image.name, source: "url" },
          });
          res.status(200).json({
            success: true,
            message: 'Image imported and submitted for review.',
            id: image.id,
          });
        } catch (error: unknown) {
          logger.error("Failed to import image from URL:", error);
          res.status(500).json({ error: "Failed to import image from URL." });
        }
      },
    );

    router.post(
      "/my-images/update/:id/:state",
      isAuthenticated(),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const targetImage = await prisma.images.findUnique({
            where: { id: Number(req.params.id) },
          });
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(401).json({ error: "Unauthorized" });
            return;
          }
          if (!targetImage) {
            res.status(404).json({ error: "Image not found." });
            return;
          }
          if (targetImage.createdById !== user.id) {
            res
              .status(403)
              .json({ error: 'You can only edit images you submitted.' });
            return;
          }

          const state = req.params.state;
          const body = req.body as Record<string, unknown>;

          // The edit form posts dockerImages/variables as JSON strings.
          const raw: Record<string, unknown> = { ...body };
          for (const key of ["docker_images", "dockerImages", "variables"]) {
            if (typeof raw[key] === "string" && (raw[key] as string).trim()) {
              try {
                raw[key] = JSON.parse(raw[key] as string);
              } catch {
                res.status(400).json({ error: `${key} must be valid JSON.` });
                return;
              }
            }
          }

          const normalized = normalizeImageData(raw);

          const data: Record<string, unknown> = { ...normalized };
          if (state === "published") {
            data.status = "pending";
            data.rejectionReason = null;
          }

          await prisma.images.update({
            where: { id: targetImage.id },
            data,
          });

          res.json({ success: true, message: "Image updated." });
        } catch (error: unknown) {
          logger.error("Failed to update image:", error);
          res.status(500).json({ error: "Failed to update image." });
        }
      },
    );

    router.delete(
      "/my-images/:id",
      isAuthenticated(),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const image = await prisma.images.findUnique({
            where: { id: Number(req.params.id) },
          });
          if (!image) {
            res.status(404).json({ error: "Image not found." });
            return;
          }
          if (image.createdById !== userId) {
            res
              .status(403)
              .json({ error: 'You can only delete images you submitted.' });
            return;
          }

          const inUse = await prisma.server.count({
            where: { imageId: image.id },
          });
          if (inUse > 0) {
            res.status(400).json({
              error: 'This image is in use by a server and cannot be deleted.',
            });
            return;
          }

          await prisma.images.delete({ where: { id: image.id } });
          res.json({ success: true, message: "Image deleted." });
        } catch (error: unknown) {
          logger.error("Failed to delete image:", error);
          res.status(500).json({ error: "Failed to delete image." });
        }
      },
    );

    return router;
  },
};

export default userImagesModule;
