import { getSettings } from "../../handlers/settingsCache";
import type { Request, Response } from "express";
import { Router } from "express";
import type { Module } from "../../handlers/moduleInit";
import prisma from "../../db";
import { isAuthenticated } from "../../handlers/utils/auth/authUtil";
import logger from "../../handlers/logger";
import rateLimit from "express-rate-limit";
import { checkForUpdates, performUpdate } from "../../handlers/updater";
import { registerPermission } from "../../handlers/permissions";
import { getClientIp } from "../../utils/ip";
import fs from "fs";
import path from "path";

registerPermission("airlink.admin.overview.main");
registerPermission("airlink.admin.overview.checkForUpdates");
registerPermission("airlink.admin.overview.performUpdate");

interface ErrorMessage {
  message?: string;
}

// Rate limit for expensive admin routes (file system access, update checks/runs) — 100 req/15min/IP.
const adminOverviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Try again later." },
  keyGenerator: (req) => getClientIp(req),
  validate: false,
});

const adminModule: Module = {
  info: {
    name: "Admin Module",
    description: "This file is for admin functionality.",
    version: "2.0.0",
    moduleVersion: "1.0.0",
    author: "AirLinkLab",
    license: "MIT",
  },

  router: () => {
    const router = Router();

    router.get(
      "/admin/overview",
      adminOverviewLimiter,
      isAuthenticated(true, "airlink.admin.overview.main"),
      async (req: Request, res: Response) => {
        const errorMessage: ErrorMessage = {};

        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            return res.redirect("/login");
          }

          const userCount = await prisma.users.count();
          const nodeCount = await prisma.node.count();
          const instanceCount = await prisma.server.count();
          const imageCount = await prisma.images.count();
          const settings = await getSettings();

          let airlinkCodename = String(res.locals.airlinkCodename || "");
          let vcodeBg: string | null = null;

          try {
            const configPath = path.join(
              process.cwd(),
              "storage",
              "config.json",
            );
            if (fs.existsSync(configPath)) {
              const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
              if (cfg && cfg.meta && cfg.meta.codename) {
                airlinkCodename = String(cfg.meta.codename);
              }
            }
          } catch (error: unknown) {
            logger.error(
              "Error reading storage/config.json for codename:",
              error,
            );
          }

          if (airlinkCodename) {
            try {
              const vcodeDir = path.join(
                process.cwd(),
                "public",
                "assets",
                "vcode",
              );
              if (fs.existsSync(vcodeDir)) {
                const target = `${airlinkCodename.toLowerCase()}.svg`;
                const match = fs
                  .readdirSync(vcodeDir)
                  .find((f) => f.toLowerCase() === target);
                if (match) {
                  vcodeBg = `/assets/vcode/${match}`;
                }
              }
            } catch (error: unknown) {
              logger.error("Error scanning vcode assets:", error);
            }
          }

          res.render("admin/overview/overview", {
            errorMessage,
            user,
            userCount,
            instanceCount,
            nodeCount,
            imageCount,
            req,
            settings,
            airlinkVersion: res.locals.airlinkVersion,
            airlinkCodename,
            vcodeBg,
          });
        } catch (error: unknown) {
          logger.error("Error fetching user:", error);
          return res.redirect("/login");
        }
      },
    );

    router.get(
      "/admin/check-update",
      adminOverviewLimiter,
      isAuthenticated(true, "airlink.admin.overview.checkForUpdates"),
      async (_req: Request, res: Response) => {
        try {
          const updateInfo = await checkForUpdates();
          res.json(updateInfo);
        } catch (error: unknown) {
          logger.error("Error checking for updates:", error);
          res.status(500).json({ error: "Error checking for updates" });
        }
      },
    );

    router.post(
      "/admin/perform-update",
      adminOverviewLimiter,
      isAuthenticated(true, "airlink.admin.overview.performUpdate"),
      async (_req: Request, res: Response) => {
        try {
          const success = await performUpdate();
          if (success) {
            res.json({ message: "Update completed successfully" });
          } else {
            res.status(500).json({ error: "Error performing update" });
          }
        } catch (error: unknown) {
          logger.error("Error performing update:", error);
          res.status(500).json({ error: "Error performing update" });
        }
      },
    );

    return router;
  },
};

export default adminModule;
