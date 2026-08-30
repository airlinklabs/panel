import type { Router, Request, Response } from "express";
import {
  isAuthenticatedForServer,
  requireSubUserPermission,
} from "../../../handlers/utils/auth/serverAuthUtil";
import logger from "../../../handlers/logger";
import { getParamAsString } from "../../../utils/typeHelpers";
import { safeClientMessage } from "../../../utils/errors";
import prisma from "../../../db";
import { daemonRequest } from "../../../handlers/utils/core/daemonRequest";
import { logActivity } from "../../../handlers/utils/activity/activityLogger";
import { type ErrorMessage, stopServerContainer } from "./shared";
import {
  runtimeStartQueue,
  QueueBannedError,
} from "../../../handlers/runtimeQueue";

const STOP_STATE_TTL_MS = 120_000;
const RESTART_DELAY_MS = 2_000;

export function registerPowerRoutes(router: Router): void {
  router.post(
    "/server/:id/power/:poweraction",
    isAuthenticatedForServer("id"),
    requireSubUserPermission("console"),
    async (req: Request, res: Response): Promise<void> => {
      const errorMessage: ErrorMessage = {};
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const powerAction = req.params?.poweraction;

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          errorMessage.message = "User not found.";
          return res.render("user/account", { errorMessage, user, req });
        }

        const server = await prisma.server.findUnique({
          where: { UUID: String(serverId) },
          include: { node: true, image: true, owner: true },
        });

        if (!server) {
          errorMessage.message = "Server not found.";
          return res.render("user/server/manage", {
            errorMessage,
            features: [],
            user,
            req,
          });
        }

        if (
          server.Suspended &&
          (powerAction === "start" || powerAction === "restart")
        ) {
          logger.warn(
            `Attempt to start suspended server ${serverId} by user ${userId}`,
          );
          res.status(403).json({
            error:
              "This server is suspended. Please contact an administrator for assistance.",
          });
          return;
        }

        if (
          server.node?.maintenanceMode &&
          (powerAction === "start" || powerAction === "restart")
        ) {
          logger.warn(
            `Attempt to start server ${serverId} on node ${server.node.id} in maintenance mode by user ${userId}`,
          );
          res.status(403).json({
            error:
              "This server is on a node under maintenance. Please try again later.",
          });
          return;
        }

        if (powerAction === "stop") {
          try {
            const stoppingStatus = {
              online: true,
              starting: false,
              stopping: true,
              uptime: null,
              startedAt: null,
            };

            const cacheKey = `server_stopping_${serverId}`;

            global.serverStoppingStates = global.serverStoppingStates || {};
            global.serverStoppingStates[cacheKey] = true;

            setTimeout(() => {
              if (
                global.serverStoppingStates &&
                global.serverStoppingStates[cacheKey]
              ) {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete global.serverStoppingStates[cacheKey];
                logger.info(
                  `Cleared stopping state for server ${serverId} after timeout`,
                );
              }
            }, STOP_STATE_TTL_MS);

            res.status(200).json({
              success: true,
              message: "Server is stopping...",
              status: stoppingStatus,
            });

            await daemonRequest({
              method: "POST",
              path: "/container/stop",
              nodeAddress: server.node.address,
              nodePort: server.node.port,
              nodeKey: server.node.key,
              body: {
                id: String(serverId),
                stopCmd: server.image?.stop || "stop",
              },
            });
            logger.info(`Container stopped successfully: ${serverId}`);
            await prisma.server
              .update({
                where: { UUID: String(serverId) },
                data: { Running: false },
              })
              .catch(() => {});
            runtimeStartQueue.cleanCapacityFreed().catch(() => undefined);
            await logActivity(req, "server:stop", {
              serverId: String(serverId),
            });
            return;
          } catch (stopError: unknown) {
            const stopErr = stopError as { status?: number } | undefined;
            if (stopErr?.status === 404) {
              logger.info(
                `Container already stopped or not found: ${serverId}`,
              );

              await prisma.server
                .update({
                  where: { UUID: String(serverId) },
                  data: { Running: false },
                })
                .catch(() => {});
              runtimeStartQueue.cleanCapacityFreed().catch(() => undefined);

              const cacheKey = `server_stopping_${serverId}`;
              if (
                global.serverStoppingStates &&
                global.serverStoppingStates[cacheKey]
              ) {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete global.serverStoppingStates[cacheKey];
              }
            } else {
              logger.warn("Failed to stop container", {
                serverId: String(serverId),
                action: "stop",
                error: stopError,
              });
            }
            return;
          }
        }

        if (
          powerAction !== "start" &&
          powerAction !== "stop" &&
          powerAction !== "restart"
        ) {
          logger.error("Invalid power action:", powerAction);
          res
            .status(400)
            .json({ error: `Invalid power action: ${powerAction}` });
          return;
        }

        if (powerAction === "restart") {
          try {
            await stopServerContainer(server, String(serverId), "stop", {
              releaseResources: false,
            });
          } catch {
            // Container may already be stopped
          }

          try {
            await new Promise((resolve) =>
              setTimeout(resolve, RESTART_DELAY_MS),
            );
            // Restarts pass through the capacity queue like fresh starts. The
            // stop above (releaseResources:false) keeps this server's own
            // reservation, so a restart is granted immediately when the node
            // has room and otherwise waits in line.
            const q = await runtimeStartQueue.enqueueStart({
              serverId: String(serverId),
              userId: user.id,
              priority:
                user.isAdmin === true ||
                server.ownerId === user.id ||
                user.role === "privileged",
            });
            if (q.queued) {
              res.status(202).json({
                queued: true,
                position: q.position,
                message: `Server queued to restart (position ${q.position}).`,
              });
              return;
            }
          } catch (error) {
            if (error instanceof QueueBannedError) {
              res.status(403).json({ error: error.message });
              return;
            }
            if (
              error instanceof Error &&
              error.message === "Server not found."
            ) {
              res.status(404).json({ error: "Server not found." });
              return;
            }
            throw error;
          }

          logger.info(`Container restart queued successfully: ${serverId}`);
          await logActivity(req, "server:restart", {
            serverId: String(serverId),
          });
          res
            .status(200)
            .json({ success: true, message: "Server restarted successfully" });
          return;
        }

        try {
          // Runtime starts go through the capacity-aware queue: the processor
          // starts the container immediately when the node has capacity, and
          // waits in line otherwise. The manage page polls for the queue
          // position via GET /server/:id/status.
          const q = await runtimeStartQueue.enqueueStart({
            serverId: String(serverId),
            userId: user.id,
            priority:
              user.isAdmin === true ||
              server.ownerId === user.id ||
              user.role === "privileged",
          });
          if (q.queued) {
            await logActivity(req, "server:start", {
              serverId: String(serverId),
              metadata: { queued: true, position: q.position },
            });
            res.status(202).json({
              queued: true,
              position: q.position,
              message: `Server queued to start (position ${q.position}).`,
            });
            return;
          }
          await logActivity(req, "server:start", {
            serverId: String(serverId),
          });
          res.status(200).json({ message: "Container is starting." });
          return;
        } catch (error) {
          if (error instanceof QueueBannedError) {
            res.status(403).json({ error: error.message });
            return;
          }
          if (error instanceof Error && error.message === "Server not found.") {
            res.status(404).json({ error: "Server not found." });
            return;
          }
          throw error;
        }
      } catch (error) {
        logger.error("Failed to process power action", error, {
          serverId: String(serverId),
          action: String(powerAction),
        });
        res.status(500).json({
          error: safeClientMessage(error, "Failed to process power action."),
        });
      }
    },
  );

  router.post(
    "/server/:id/power/restart",
    isAuthenticatedForServer("id"),
    requireSubUserPermission("console"),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: "User not found" });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { UUID: getParamAsString(serverId) },
          include: { node: true, image: true },
        });

        if (!server) {
          res.status(404).json({ error: "Server not found" });
          return;
        }

        if (server.Suspended) {
          logger.warn(
            `Attempt to restart suspended server ${serverId} by user ${userId}`,
          );
          res.status(403).json({
            error:
              "This server is suspended. Please contact an administrator for assistance.",
          });
          return;
        }

        if (server.node?.maintenanceMode) {
          logger.warn(
            `Attempt to restart server ${serverId} on node ${server.node.id} in maintenance mode by user ${userId}`,
          );
          res.status(403).json({
            error:
              "This server is on a node under maintenance. Please try again later.",
          });
          return;
        }

        if (!server.dockerImage) {
          res.status(400).json({ error: "Docker image not found." });
          return;
        }

        await stopServerContainer(server, String(serverId), "stop", {
          releaseResources: false,
        }).catch(() => {});
        const q = await runtimeStartQueue.enqueueStart({
          serverId: String(serverId),
          userId: user.id,
          priority:
            user.isAdmin === true ||
            server.ownerId === user.id ||
            user.role === "privileged",
        });
        logger.info(`Container restart queued successfully: ${serverId}`);

        if (q.queued) {
          res.status(202).json({
            queued: true,
            position: q.position,
            message: `Server queued to restart (position ${q.position}).`,
          });
          return;
        }

        res
          .status(200)
          .json({ success: true, message: "Server restarted successfully" });
      } catch (error) {
        logger.error("Error restarting server:", error);
        res.status(500).json({ error: "Failed to restart server" });
      }
    },
  );

  router.post(
    "/server/:id/power/queue/cancel",
    isAuthenticatedForServer("id"),
    requireSubUserPermission("console"),
    async (req: Request, res: Response) => {
      const serverId = req.params?.id;
      try {
        const user = await prisma.users.findUnique({
          where: { id: req.session?.user?.id },
        });
        if (!user) {
          res.status(404).json({ error: "User not found" });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { UUID: String(serverId) },
          select: { UUID: true, ownerId: true },
        });
        if (!server) {
          res.status(404).json({ error: "Server not found" });
          return;
        }

        // Only the owning user or an admin may pull a server off the queue.
        if (server.ownerId !== user.id && !user.isAdmin) {
          res.status(403).json({ error: "You do not own this server." });
          return;
        }

        const removed = await runtimeStartQueue.cancelQueuedStart(server.UUID);
        res.json({ success: true, wasQueued: removed });
      } catch (error) {
        logger.error("Error cancelling queued start:", error);
        res.status(500).json({ error: "Failed to cancel queued start." });
      }
    },
  );
}
