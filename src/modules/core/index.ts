import type { Request, Response } from "express";
import { Router } from "express";
import type { Module } from "../../handlers/moduleInit";
import logger from "../../handlers/logger";
import os from "os";
import prisma from "../../db";
import {
  checkNodeStatus,
  checkNodeStatusUncached,
} from "../../handlers/utils/node/nodeStatus";
import {
  isAuthenticated,
  requireApiAuth,
} from "../../handlers/utils/auth/authUtil";
import { cache } from "../../handlers/cache";

const coreModule: Module = {
  info: {
    name: "Core Module",
    description: "Core routes (status, search, avatar).",
    version: "2.0.0",
    moduleVersion: "1.0.0",
    author: "AirLinkLab",
    license: "MIT",
  },

  router: () => {
    const router = Router();

    router.get(
      "/api/system/status",
      isAuthenticated(true),
      async (_req: Request, res: Response) => {
        try {
          const systemInfo = {
            hostname: os.hostname(),
            platform: os.platform(),
            arch: os.arch(),
            cpus: os.cpus().length,
            memory: {
              total:
                Math.round((os.totalmem() / (1024 * 1024 * 1024)) * 100) / 100,
              free:
                Math.round((os.freemem() / (1024 * 1024 * 1024)) * 100) / 100,
            },
            uptime: Math.floor(os.uptime() / 60),
          };

          const nodes = await prisma.node.findMany();
          const nodeStatuses = await Promise.all(
            nodes.map(async (node) => {
              try {
                const nodeWithStatus = await checkNodeStatus(node);
                return nodeWithStatus;
              } catch (error) {
                logger.error(
                  `Error checking node status for ${node.name}:`,
                  error,
                );
                return {
                  ...node,
                  status: "Error",
                  error: "Failed to check status",
                };
              }
            }),
          );

          const serverCount = await prisma.server.count();
          const userCount = await prisma.users.count();

          res.json({
            system: systemInfo,
            nodes: nodeStatuses,
            stats: {
              servers: serverCount,
              users: userCount,
              nodes: nodes.length,
            },
          });
        } catch (error) {
          logger.error("Error fetching system status:", error);
          res.status(500).json({ error: "Failed to fetch system status" });
        }
      },
    );

    router.get("/api/health", (_req: Request, res: Response) => {
      res.status(200).json({ status: "ok" });
    });

    router.post(
      "/api/system/test-node-connection",
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const { address, port, key } = req.body;

          if (typeof address !== "string" || address.trim() === "") {
            res
              .status(400)
              .json({ error: "address must be a non-empty string" });
            return;
          }
          if (!Number.isInteger(port) || port < 1 || port > 65535) {
            res
              .status(400)
              .json({ error: "port must be an integer between 1 and 65535" });
            return;
          }
          if (typeof key !== "string" || key.trim() === "") {
            res.status(400).json({ error: "key must be a non-empty string" });
            return;
          }

          const testNode = { address: address.trim(), port, key };

          const nodeWithStatus = await checkNodeStatusUncached(testNode);

          if (nodeWithStatus.status === "Offline") {
            res.status(400).json({
              success: false,
              message: "Failed to connect to node",
              error: nodeWithStatus.error,
            });
            return;
          }
          res.json({
            success: true,
            message: "Successfully connected to node",
            version: nodeWithStatus.versionRelease,
            status: nodeWithStatus.status,
          });
        } catch (error) {
          logger.error("Error testing node connection:", error);
          res.status(500).json({
            success: false,
            message: "Error testing node connection",
            error: "Failed to test node connection",
          });
          return;
        }
      },
    );

    // Local deterministic avatar generation — renders SVG locally per seed (public, static cacheable).
    router.get("/avatar/:seed", async (req: Request, res: Response) => {
      const { avatarSvg, isValidAvatarSeed } =
        await import("../../utils/avatar");
      const seed = Array.isArray(req.params.seed)
        ? req.params.seed[0]
        : req.params.seed;
      if (!isValidAvatarSeed(seed)) {
        res.status(400).type("text/plain").send("invalid avatar seed");
        return;
      }
      try {
        const svg = await avatarSvg(seed);
        res.setHeader("Content-Type", "image/svg+xml");
        res.setHeader(
          "Cache-Control",
          "public, max-age=86400, stale-while-revalidate=86400",
        );
        res.send(svg);
      } catch (error) {
        logger.error("Avatar generation failed:", error);
        res.status(500).type("text/plain").send("avatar generation failed");
      }
    });

    return router;
  },
};

export default coreModule;
