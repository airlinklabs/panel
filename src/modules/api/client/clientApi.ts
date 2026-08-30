import type { Request, Response } from "express";
import { Router } from "express";
import type { Module } from "../../../handlers/moduleInit";
import prisma from "../../../db";
import logger from "../../../handlers/logger";
import { apiValidator } from "../../../handlers/utils/api/apiValidator";
import { getParamAsString } from "../../../utils/typeHelpers";
import { daemonRequest } from "../../../handlers/utils/core/daemonRequest";
import { listServers, getServerRaw } from "../../../services/serverService";
import {
  listBackups,
  createBackup,
  deleteBackup,
} from "../../../services/backupService";
import {
  listFiles,
  readFile,
  writeFile,
  deleteFile,
  renameFile,
} from "../../../services/fileService";
import {
  listSchedules,
  createSchedule,
  deleteSchedule,
} from "../../../services/scheduleService";
import { runtimeStartQueue } from "../../../handlers/runtimeQueue";
import { NodeCapacityExceededError } from "../../../handlers/utils/server/resourceCheck";
import { logActivity } from "../../../handlers/utils/activity/activityLogger";
import { nextRunFromCron } from "../../../utils/cron";
import { parseBody, validationErrorBoundary } from "../../../utils/validation";
import {
  parsePermissions,
  subUserHasPermission,
  resolveServerAccess,
} from "../../../handlers/utils/auth/authorization";
import type { SubUserPermission } from "../../../handlers/utils/auth/serverAuthUtil";
import {
  CLIENT_API_VERSION,
  powerBodySchema,
  writeFileBodySchema,
  deleteFileBodySchema,
  renameFileBodySchema,
  createBackupBodySchema,
  createScheduleBodySchema,
  type PowerBody,
  type WriteFileBody,
  type DeleteFileBody,
  type RenameFileBody,
  type CreateBackupBody,
  type CreateScheduleBody,
  type ClientServer,
  type ClientBackup,
  type ClientSchedule,
} from "./dto";

// --- Helpers ---

function getApiKeyUserId(req: Request): number | undefined {
  return req.apiKey?.userId ?? undefined;
}

function jsonError(res: Response, error: string, status = 400): void {
  res.status(status).json({ error });
}

type ServerResult = Awaited<ReturnType<typeof prisma.server.findUnique>> & {
  node: NonNullable<unknown>;
};

async function resolveServerForUser(serverId: string, userId: number) {
  const result = await resolveServerAccess(serverId, userId);
  if (!result) return null;
  // Include node relation for client API responses
  const server = await getServerRaw(serverId);
  if (!server) return null;
  return { server, isOwner: result.isOwner, subUser: result.subUser };
}

function requirePermission(
  res: Response,
  subUser: { permissions: string | null | undefined } | null,
  isOwner: boolean,
  permission: SubUserPermission,
): boolean {
  if (isOwner || !subUser) {
    return true;
  }
  if (subUserHasPermission(subUser, permission)) {
    return true;
  }
  res.status(403).json({ error: "permission denied" });
  return false;
}

// --- Client API Module ---

const clientApiModule: Module = {
  info: {
    name: "Client API Module",
    description: "User-facing API for server management via API keys.",
    version: "2.0.0",
    moduleVersion: "2.0.0",
    author: "AirLinkLab",
    license: "MIT",
  },

  router: () => {
    const router = Router();

    // All /api/client/* routes require a valid API key.
    // The key must belong to a user (userId set). Admin keys also work.
    router.use("/api/client", apiValidator());

    // --- Servers ---

    router.get("/api/client/servers", async (req: Request, res: Response) => {
      try {
        const userId = getApiKeyUserId(req);
        if (!userId) {
          return jsonError(res, "API key must be associated with a user", 403);
        }

        const servers = await listServers({
          page: 1,
          perPage: 10000,
          where: { ownerId: userId },
          include: {
            UUID: true,
            name: true,
            description: true,
            Installing: true,
            Queued: true,
            Suspended: true,
            nodeId: true,
            createdAt: true,
          },
        });
        const data = servers satisfies ClientServer[];

        res.json({ data });
      } catch (err) {
        logger.error("Client API: list servers error", err);
        jsonError(res, "Internal error", 500);
      }
    });

    router.get(
      "/api/client/servers/:id",
      async (req: Request, res: Response) => {
        try {
          const userId = getApiKeyUserId(req);
          if (!userId) {
            return jsonError(
              res,
              "API key must be associated with a user",
              403,
            );
          }

          const serverId = getParamAsString(req.params.id);
          const resolved = await resolveServerForUser(serverId, userId);
          if (!resolved) {
            return jsonError(res, "Server not found", 404);
          }
          const { server } = resolved;

          const data = {
            UUID: server.UUID,
            name: server.name,
            description: server.description,
            Installing: server.Installing,
            Queued: server.Queued,
            Suspended: server.Suspended,
            nodeId: server.nodeId,
            createdAt: server.createdAt,
          } satisfies ClientServer;

          res.json({ data });
        } catch (err) {
          logger.error("Client API: get server error", err);
          jsonError(res, "Internal error", 500);
        }
      },
    );

    // --- Power ---

    router.post(
      "/api/client/servers/:id/power",
      parseBody(powerBodySchema),
      async (req: Request, res: Response) => {
        try {
          const userId = getApiKeyUserId(req);
          if (!userId) {
            return jsonError(
              res,
              "API key must be associated with a user",
              403,
            );
          }

          const serverId = getParamAsString(req.params.id);
          const resolved = await resolveServerForUser(serverId, userId);
          if (!resolved) {
            return jsonError(res, "Server not found", 404);
          }
          const { server, isOwner, subUser } = resolved;

          if (
            !requirePermission(
              res,
              subUser,
              isOwner,
              "console" as SubUserPermission,
            )
          ) {
            return;
          }

          const { action } = req.validatedBody as PowerBody;

          if (server.Suspended) {
            return jsonError(res, "Server is suspended", 403);
          }

          if (action === "start") {
            const apiUser = await prisma.users.findUnique({
              where: { id: userId },
              select: { isAdmin: true, role: true },
            });
            const priority =
              apiUser?.isAdmin === true ||
              server.ownerId === userId ||
              apiUser?.role === "privileged";
            const queued = await runtimeStartQueue.enqueueStart({
              serverId: server.UUID,
              userId,
              priority,
            });
            if (queued.queued) {
              await logActivity(
                req,
                "server:start" as Parameters<typeof logActivity>[1],
                {
                  serverId: server.UUID,
                  metadata: {
                    source: "client-api",
                    queued: true,
                    position: queued.position,
                  },
                },
              );
              return res.status(202).json({
                message: `Server queued to start (position ${queued.position})`,
              });
            }
          } else {
            const method = action === "kill" ? "DELETE" : "POST";
            const path =
              action === "kill" ? "/container/kill" : `/container/${action}`;

            await daemonRequest({
              nodeAddress: server.node.address,
              nodePort: server.node.port,
              nodeKey: server.node.key,
              method,
              path,
              body: { id: server.UUID },
              timeout: 30000,
            });

            if (action === "stop" || action === "kill") {
              await prisma.server
                .update({
                  where: { UUID: server.UUID },
                  data: { Running: false },
                })
                .catch(() => {});
              runtimeStartQueue.cleanCapacityFreed().catch(() => undefined);
            }
          }

          await logActivity(
            req,
            `server:${action}` as Parameters<typeof logActivity>[1],
            {
              serverId: server.UUID,
              metadata: { source: "client-api" },
            },
          );

          res.json({ message: `${action} signal sent` });
        } catch (err) {
          if (err instanceof NodeCapacityExceededError) {
            logger.warn("Client API: power action blocked by node capacity", {
              error: err.message,
            });
            return jsonError(res, err.message, 409);
          }
          logger.error("Client API: power action error", err);
          jsonError(res, "Failed to execute power action", 500);
        }
      },
    );

    // --- Files ---

    router.get(
      "/api/client/servers/:id/files",
      async (req: Request, res: Response) => {
        try {
          const userId = getApiKeyUserId(req);
          if (!userId) {
            return jsonError(
              res,
              "API key must be associated with a user",
              403,
            );
          }

          const serverId = getParamAsString(req.params.id);
          const resolved = await resolveServerForUser(serverId, userId);
          if (!resolved) {
            return jsonError(res, "Server not found", 404);
          }
          const { server, isOwner, subUser } = resolved;

          if (
            !requirePermission(
              res,
              subUser,
              isOwner,
              "files" as SubUserPermission,
            )
          ) {
            return;
          }

          const dir = (req.query.dir as string) || "/";

          const data = await listFiles(server.UUID, dir);
          res.json({ data });
        } catch (err) {
          logger.error("Client API: list files error", err);
          jsonError(res, "Failed to list files", 500);
        }
      },
    );

    router.get(
      "/api/client/servers/:id/files/content",
      async (req: Request, res: Response) => {
        try {
          const userId = getApiKeyUserId(req);
          if (!userId) {
            return jsonError(
              res,
              "API key must be associated with a user",
              403,
            );
          }

          const serverId = getParamAsString(req.params.id);
          const resolved = await resolveServerForUser(serverId, userId);
          if (!resolved) {
            return jsonError(res, "Server not found", 404);
          }
          const { server, isOwner, subUser } = resolved;

          if (
            !requirePermission(
              res,
              subUser,
              isOwner,
              "files" as SubUserPermission,
            )
          ) {
            return;
          }

          const file = req.query.file as string;
          if (!file) {
            return jsonError(res, "file query parameter is required");
          }

          const data = await readFile(server.UUID, file);
          res.json({ data });
        } catch (err) {
          logger.error("Client API: read file error", err);
          jsonError(res, "Failed to read file", 500);
        }
      },
    );

    router.post(
      "/api/client/servers/:id/files/content",
      parseBody(writeFileBodySchema),
      async (req: Request, res: Response) => {
        try {
          const userId = getApiKeyUserId(req);
          if (!userId) {
            return jsonError(
              res,
              "API key must be associated with a user",
              403,
            );
          }

          const serverId = getParamAsString(req.params.id);
          const resolved = await resolveServerForUser(serverId, userId);
          if (!resolved) {
            return jsonError(res, "Server not found", 404);
          }
          const { server, isOwner, subUser } = resolved;

          if (
            !requirePermission(
              res,
              subUser,
              isOwner,
              "files.write" as SubUserPermission,
            )
          ) {
            return;
          }

          const { file, content } = req.validatedBody as WriteFileBody;

          await writeFile(server.UUID, file, content);

          await logActivity(req, "file:edit", {
            serverId: server.UUID,
            metadata: { path: file, source: "client-api" },
          });

          res.json({ message: "File saved" });
        } catch (err) {
          logger.error("Client API: write file error", err);
          jsonError(res, "Failed to write file", 500);
        }
      },
    );

    router.delete(
      "/api/client/servers/:id/files",
      parseBody(deleteFileBodySchema),
      async (req: Request, res: Response) => {
        try {
          const userId = getApiKeyUserId(req);
          if (!userId) {
            return jsonError(
              res,
              "API key must be associated with a user",
              403,
            );
          }

          const serverId = getParamAsString(req.params.id);
          const resolved = await resolveServerForUser(serverId, userId);
          if (!resolved) {
            return jsonError(res, "Server not found", 404);
          }
          const { server, isOwner, subUser } = resolved;

          if (
            !requirePermission(
              res,
              subUser,
              isOwner,
              "files.write" as SubUserPermission,
            )
          ) {
            return;
          }

          const { file } = req.validatedBody as DeleteFileBody;

          await deleteFile(server.UUID, file);

          await logActivity(req, "file:delete", {
            serverId: server.UUID,
            metadata: { path: file, source: "client-api" },
          });

          res.json({ message: "File deleted" });
        } catch (err) {
          logger.error("Client API: delete file error", err);
          jsonError(res, "Failed to delete file", 500);
        }
      },
    );

    router.post(
      "/api/client/servers/:id/files/rename",
      parseBody(renameFileBodySchema),
      async (req: Request, res: Response) => {
        try {
          const userId = getApiKeyUserId(req);
          if (!userId) {
            return jsonError(
              res,
              "API key must be associated with a user",
              403,
            );
          }

          const serverId = getParamAsString(req.params.id);
          const resolved = await resolveServerForUser(serverId, userId);
          if (!resolved) {
            return jsonError(res, "Server not found", 404);
          }
          const { server, isOwner, subUser } = resolved;

          if (
            !requirePermission(
              res,
              subUser,
              isOwner,
              "files.write" as SubUserPermission,
            )
          ) {
            return;
          }

          const { file, newname } = req.validatedBody as RenameFileBody;

          await renameFile(server.UUID, file, newname);

          await logActivity(req, "file:rename", {
            serverId: server.UUID,
            metadata: { path: file, newName: newname, source: "client-api" },
          });

          res.json({ message: "File renamed" });
        } catch (err) {
          logger.error("Client API: rename file error", err);
          jsonError(res, "Failed to rename file", 500);
        }
      },
    );

    // --- Backups ---

    router.get(
      "/api/client/servers/:id/backups",
      async (req: Request, res: Response) => {
        try {
          const userId = getApiKeyUserId(req);
          if (!userId) {
            return jsonError(
              res,
              "API key must be associated with a user",
              403,
            );
          }

          const serverId = getParamAsString(req.params.id);
          const resolved = await resolveServerForUser(serverId, userId);
          if (!resolved) {
            return jsonError(res, "Server not found", 404);
          }
          const { server, isOwner, subUser } = resolved;

          if (
            !requirePermission(
              res,
              subUser,
              isOwner,
              "backups" as SubUserPermission,
            )
          ) {
            return;
          }

          const backups = await listBackups(server.UUID);

          const data = backups.map(
            (backup) =>
              ({
                UUID: backup.UUID,
                name: backup.name,
                createdAt: backup.createdAt,
                locked: backup.locked,
                size: backup.size ? backup.size.toString() : null,
              }) satisfies ClientBackup,
          );

          res.json({ data });
        } catch (err) {
          logger.error("Client API: list backups error", err);
          jsonError(res, "Internal error", 500);
        }
      },
    );

    router.post(
      "/api/client/servers/:id/backups",
      parseBody(createBackupBodySchema),
      async (req: Request, res: Response) => {
        try {
          const userId = getApiKeyUserId(req);
          if (!userId) {
            return jsonError(
              res,
              "API key must be associated with a user",
              403,
            );
          }

          const serverId = getParamAsString(req.params.id);
          const resolved = await resolveServerForUser(serverId, userId);
          if (!resolved) {
            return jsonError(res, "Server not found", 404);
          }
          const { server, isOwner, subUser } = resolved;

          if (
            !requirePermission(
              res,
              subUser,
              isOwner,
              "backups.create" as SubUserPermission,
            )
          ) {
            return;
          }

          const { name } = req.validatedBody as CreateBackupBody;

          const backup = await createBackup(server.UUID, name);

          await logActivity(req, "backup:create", {
            serverId: server.UUID,
            metadata: { name, uuid: backup.UUID, source: "client-api" },
          });

          res.json({ data: { UUID: backup.UUID, name: backup.name } });
        } catch (err) {
          logger.error("Client API: create backup error", err);
          jsonError(res, "Failed to create backup", 500);
        }
      },
    );

    router.delete(
      "/api/client/servers/:id/backups/:backupId",
      async (req: Request, res: Response) => {
        try {
          const userId = getApiKeyUserId(req);
          if (!userId) {
            return jsonError(
              res,
              "API key must be associated with a user",
              403,
            );
          }

          const serverId = getParamAsString(req.params.id);
          const resolved = await resolveServerForUser(serverId, userId);
          if (!resolved) {
            return jsonError(res, "Server not found", 404);
          }
          const { server, isOwner, subUser } = resolved;

          if (
            !requirePermission(
              res,
              subUser,
              isOwner,
              "backups.delete" as SubUserPermission,
            )
          ) {
            return;
          }

          const backupUUID = getParamAsString(req.params.backupId);

          await deleteBackup(backupUUID, server.UUID);

          await logActivity(req, "backup:delete", {
            serverId: server.UUID,
            metadata: {
              uuid: backupUUID,
              source: "client-api",
            },
          });

          res.json({ message: "Backup deleted" });
        } catch (err) {
          logger.error("Client API: delete backup error", err);
          jsonError(res, "Failed to delete backup", 500);
        }
      },
    );

    // --- Schedules ---

    router.get(
      "/api/client/servers/:id/schedules",
      async (req: Request, res: Response) => {
        try {
          const userId = getApiKeyUserId(req);
          if (!userId) {
            return jsonError(
              res,
              "API key must be associated with a user",
              403,
            );
          }

          const serverId = getParamAsString(req.params.id);
          const resolved = await resolveServerForUser(serverId, userId);
          if (!resolved) {
            return jsonError(res, "Server not found", 404);
          }
          const { server, isOwner, subUser } = resolved;

          if (
            !requirePermission(
              res,
              subUser,
              isOwner,
              "schedule.read" as SubUserPermission,
            )
          ) {
            return;
          }

          const allSchedules = await listSchedules(server.UUID);
          const data = allSchedules.map((s) => ({
            id: s.id,
            name: s.name,
            cron: s.cron,
            enabled: s.enabled,
            nextRunAt: s.nextRunAt,
            lastRunAt: s.lastRunAt,
            createdAt: s.createdAt,
            tasks: s.tasks.map((t) => ({
              id: t.id,
              action: t.action,
              payload: t.payload,
              order: t.order,
            })),
          })) satisfies ClientSchedule[];

          res.json({ data });
        } catch (err) {
          logger.error("Client API: list schedules error", err);
          jsonError(res, "Internal error", 500);
        }
      },
    );

    router.post(
      "/api/client/servers/:id/schedules",
      parseBody(createScheduleBodySchema),
      async (req: Request, res: Response) => {
        try {
          const userId = getApiKeyUserId(req);
          if (!userId) {
            return jsonError(
              res,
              "API key must be associated with a user",
              403,
            );
          }

          const serverId = getParamAsString(req.params.id);
          const resolved = await resolveServerForUser(serverId, userId);
          if (!resolved) {
            return jsonError(res, "Server not found", 404);
          }
          const { server, isOwner, subUser } = resolved;

          if (
            !requirePermission(
              res,
              subUser,
              isOwner,
              "schedule.create" as SubUserPermission,
            )
          ) {
            return;
          }

          const { name, cron, action, payload } =
            req.validatedBody as CreateScheduleBody;

          const schedule = await createSchedule(server.UUID, {
            name,
            cron,
            nextRunAt: nextRunFromCron(cron.trim()),
            tasks: {
              create: {
                order: 0,
                action,
                payload: payload ?? "{}",
              },
            },
          });

          await logActivity(
            req,
            "schedule:create" as Parameters<typeof logActivity>[1],
            {
              serverId: server.UUID,
              metadata: { name, cron, action, source: "client-api" },
            },
          );

          res.json({ data: schedule });
        } catch (err) {
          logger.error("Client API: create schedule error", err);
          jsonError(res, "Failed to create schedule", 500);
        }
      },
    );

    router.delete(
      "/api/client/servers/:id/schedules/:scheduleId",
      async (req: Request, res: Response) => {
        try {
          const userId = getApiKeyUserId(req);
          if (!userId) {
            return jsonError(
              res,
              "API key must be associated with a user",
              403,
            );
          }

          const serverId = getParamAsString(req.params.id);
          const resolved = await resolveServerForUser(serverId, userId);
          if (!resolved) {
            return jsonError(res, "Server not found", 404);
          }
          const { server, isOwner, subUser } = resolved;

          if (
            !requirePermission(
              res,
              subUser,
              isOwner,
              "schedule.delete" as SubUserPermission,
            )
          ) {
            return;
          }

          const scheduleId = parseInt(
            getParamAsString(req.params.scheduleId),
            10,
          );
          if (isNaN(scheduleId)) {
            return jsonError(res, "Invalid schedule ID");
          }

          const deleted = await deleteSchedule(scheduleId, server.UUID);
          if (!deleted) {
            return jsonError(res, "Schedule not found", 404);
          }

          await logActivity(
            req,
            "schedule:delete" as Parameters<typeof logActivity>[1],
            {
              serverId: server.UUID,
              metadata: { name: deleted.name, source: "client-api" },
            },
          );

          res.json({ message: "Schedule deleted" });
        } catch (err) {
          logger.error("Client API: delete schedule error", err);
          jsonError(res, "Failed to delete schedule", 500);
        }
      },
    );

    // --- Introspection ---

    router.get("/api/client", (_req: Request, res: Response) => {
      res.json({
        version: CLIENT_API_VERSION,
        endpoints: [
          {
            method: "GET",
            path: "/api/client",
            description: "Introspection – list client API routes",
          },
          {
            method: "GET",
            path: "/api/client/servers",
            description: "List your servers",
          },
          {
            method: "GET",
            path: "/api/client/servers/:id",
            description: "Get server details",
          },
          {
            method: "POST",
            path: "/api/client/servers/:id/power",
            description: "Power action (start/stop/restart/kill)",
          },
          {
            method: "GET",
            path: "/api/client/servers/:id/files",
            description: "List files",
            query: ["dir"],
          },
          {
            method: "GET",
            path: "/api/client/servers/:id/files/content",
            description: "Read file content",
            query: ["file"],
          },
          {
            method: "POST",
            path: "/api/client/servers/:id/files/content",
            description: "Write file content",
            body: ["file", "content"],
          },
          {
            method: "DELETE",
            path: "/api/client/servers/:id/files",
            description: "Delete file",
            body: ["file"],
          },
          {
            method: "POST",
            path: "/api/client/servers/:id/files/rename",
            description: "Rename file",
            body: ["file", "newname"],
          },
          {
            method: "GET",
            path: "/api/client/servers/:id/backups",
            description: "List backups",
          },
          {
            method: "POST",
            path: "/api/client/servers/:id/backups",
            description: "Create backup",
            body: ["name"],
          },
          {
            method: "DELETE",
            path: "/api/client/servers/:id/backups/:backupId",
            description: "Delete backup",
          },
          {
            method: "GET",
            path: "/api/client/servers/:id/schedules",
            description: "List schedules",
          },
          {
            method: "POST",
            path: "/api/client/servers/:id/schedules",
            description: "Create schedule",
            body: ["name", "cron", "action", "payload"],
          },
          {
            method: "DELETE",
            path: "/api/client/servers/:id/schedules/:scheduleId",
            description: "Delete schedule",
          },
        ],
      });
    });

    // ValidationError from parseBody middleware becomes a standardized 400.
    router.use(validationErrorBoundary);

    return router;
  },
};

export default clientApiModule;
