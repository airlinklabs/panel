import { getSettings, updateSettings } from "../../../services/settingsService";
import type { Request, Response } from "express";
import { Router } from "express";
import type { Module } from "../../../handlers/moduleInit";
import prisma from "../../../db";
import logger from "../../../handlers/logger";
import { apiValidator } from "../../../handlers/utils/api/apiValidator";
import { getParamAsString, getParamAsNumber } from "../../../utils/typeHelpers";
import { safeClientMessage } from "../../../utils/errors";
import validator from "validator";
import {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
} from "../../../services/userService";
import { daemonRequest } from "../../../handlers/utils/core/daemonRequest";
import { AirlinkCloudClient } from "../../../handlers/utils/core/airlinkCloud";
import {
  uploadStreamToS3,
  deleteFromS3,
  getS3ObjectStream,
  isS3Backup,
  S3_KEY_PREFIX,
} from "../../../handlers/utils/core/s3Client";
import {
  listNodes,
  getNode,
  getNodeForDelete,
  createNode,
  updateNode,
  deleteNode,
  listAllocations,
  createAllocation,
  deleteAllocation,
  NodeError,
} from "../../../services/nodeService";
import {
  listDatabases,
  getDatabase,
  provisionDatabase,
  deprovisionDatabase,
} from "../../../services/databaseService";
import { logActivity } from "../../../handlers/utils/activity/activityLogger";
import { getStartup, updateStartup } from "../../../services/startupService";
import { apiEndpoints } from "./apiDocs";
import { nextRunFromCron, isValidCron } from "../../../utils/cron";
import {
  listImages,
  getImage,
  createImage,
  updateImage,
  deleteImage,
  countServersByImage,
} from "../../../services/imageService";
import {
  listLocations,
  createLocation,
} from "../../../services/locationService";
import {
  listBackups,
  getBackup,
  createBackupOnDaemon,
  createBackupRecord,
  deleteBackupRecord,
} from "../../../services/backupService";
import {
  listSchedules,
  getSchedule,
  createSchedule,
  deleteSchedule,
} from "../../../services/scheduleService";
import {
  listSubUsers,
  addSubUser,
  updateSubUser,
  deleteSubUser,
  SubUserError,
} from "../../../services/subuserService";
import {
  BCRYPT_SALT_ROUNDS,
  DEFAULT_PAGE_SIZE,
  DEFAULT_MEMORY_MB,
  DEFAULT_CPU_PERCENT,
  DEFAULT_STORAGE_MB,
} from "../../../config/constants";
import {
  listServers,
  getServer,
  createServer,
  deleteServer,
  suspendServer,
  unsuspendServer,
} from "../../../services/serverService";

const POWER_ACTIONS = ["start", "stop", "restart", "kill"] as const;
const TASK_ACTIONS = ["command", "power", "backup"] as const;

const DEFAULT_SWAP_MB = 0;
const DEFAULT_NODE_PORT = 3001;
const DEFAULT_SFTP_PORT = 3003;
const MIN_PORT_NUMBER = 1024;
const MAX_PORT_NUMBER = 65535;
const MIN_TIME_OFFSET = -1440;
const MAX_TIME_OFFSET = 1440;
const BACKUP_TIMEOUT_MS = 300_000;
const SHORT_TIMEOUT_MS = 30_000;
const STREAM_TIMEOUT_MS = 120_000;
const DAEMON_REQUEST_TIMEOUT_MS = 15_000;

function s3KeyFor(serverId: string, uuid: string): string {
  return `backups/${serverId}/${uuid}.tar.gz`;
}

async function apiAudit(
  req: Request,
  event: string,
  serverId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await logActivity(req, event as Parameters<typeof logActivity>[1], {
      serverId,
      metadata,
    });
  } catch {
    // Audit logging must never break the API response.
  }
}

function paginate<T>(items: T[], page: number, perPage: number) {
  const total = items.length;
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.max(1, Math.min(page, lastPage));
  return {
    data: items.slice((safePage - 1) * perPage, safePage * perPage),
    meta: {
      total,
      per_page: perPage,
      current_page: safePage,
      last_page: lastPage,
    },
  };
}

const coreModule: Module = {
  info: {
    name: "API Module",
    description: "Panel REST API endpoints.",
    version: "2.0.0",
    moduleVersion: "1.0.0",
    author: "AirLinkLab",
    license: "MIT",
  },

  router: () => {
    const router = Router();

    // ── V1 Deprecation middleware ──────────────────────────────────────────
    // Add sunset + deprecation headers so integrators can migrate to /api/v2.
    router.use((_req: Request, res: Response, next) => {
      res.setHeader("Deprecation", "true");
      res.setHeader("Sunset", "2027-03-01T00:00:00Z");
      res.setHeader("Link", '</api/v2>; rel="successor-version"');
      next();
    });

    router.get("/api/v1/ping", (_req: Request, res: Response) => {
      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: "2.0.0",
      });
    });

    router.get("/api/v1", (_req: Request, res: Response) => {
      res.json({
        data: {
          version: "v1",
          endpoints: [
            {
              method: "GET",
              path: "/api/v1",
              description: "Introspection – list all routes",
            },
            {
              method: "GET",
              path: "/api/v1/ping",
              description: "Health check",
            },
            {
              method: "GET",
              path: "/api/v1/users",
              description: "List users",
              permission: "airlink.api.users.read",
            },
            {
              method: "POST",
              path: "/api/v1/users",
              description: "Create a user",
              permission: "airlink.api.users.create",
            },
            {
              method: "GET",
              path: "/api/v1/users/:id",
              description: "Get a user",
              permission: "airlink.api.users.read",
            },
            {
              method: "PATCH",
              path: "/api/v1/users/:id",
              description: "Update a user",
              permission: "airlink.api.users.update",
            },
            {
              method: "DELETE",
              path: "/api/v1/users/:id",
              description: "Delete a user",
              permission: "airlink.api.users.delete",
            },
            {
              method: "GET",
              path: "/api/v1/servers",
              description: "List servers",
              permission: "airlink.api.servers.read",
            },
            {
              method: "POST",
              path: "/api/v1/servers",
              description: "Create a server",
              permission: "airlink.api.servers.create",
            },
            {
              method: "GET",
              path: "/api/v1/servers/:id",
              description: "Get a server",
              permission: "airlink.api.servers.read",
            },
            {
              method: "PATCH",
              path: "/api/v1/servers/:id",
              description: "Update a server",
              permission: "airlink.api.servers.update",
            },
            {
              method: "POST",
              path: "/api/v1/servers/:id/suspend",
              description: "Suspend a server",
              permission: "airlink.api.servers.update",
            },
            {
              method: "POST",
              path: "/api/v1/servers/:id/unsuspend",
              description: "Unsuspend a server",
              permission: "airlink.api.servers.update",
            },
            {
              method: "DELETE",
              path: "/api/v1/servers/:id",
              description: "Delete a server",
              permission: "airlink.api.servers.delete",
            },
            {
              method: "GET",
              path: "/api/v1/nodes",
              description: "List nodes",
              permission: "airlink.api.nodes.read",
            },
            {
              method: "POST",
              path: "/api/v1/nodes",
              description: "Create a node",
              permission: "airlink.api.nodes.create",
            },
            {
              method: "GET",
              path: "/api/v1/nodes/:id",
              description: "Get a node",
              permission: "airlink.api.nodes.read",
            },
            {
              method: "PATCH",
              path: "/api/v1/nodes/:id",
              description: "Update a node",
              permission: "airlink.api.nodes.update",
            },
            {
              method: "DELETE",
              path: "/api/v1/nodes/:id",
              description: "Delete a node",
              permission: "airlink.api.nodes.delete",
            },
            {
              method: "GET",
              path: "/api/v1/settings",
              description: "Get settings",
              permission: "airlink.api.settings.read",
            },
            {
              method: "PATCH",
              path: "/api/v1/settings",
              description: "Update settings",
              permission: "airlink.api.settings.update",
            },
            {
              method: "GET",
              path: "/api/v1/servers/:id/backups",
              description: "List backups",
              permission: "airlink.api.servers.read",
            },
            {
              method: "POST",
              path: "/api/v1/servers/:id/backups",
              description: "Create a backup",
              permission: "airlink.api.servers.update",
            },
            {
              method: "POST",
              path: "/api/v1/servers/:id/backups/:backupId/restore",
              description: "Restore a backup",
              permission: "airlink.api.servers.update",
            },
            {
              method: "DELETE",
              path: "/api/v1/servers/:id/backups/:backupId",
              description: "Delete a backup",
              permission: "airlink.api.servers.update",
            },
            {
              method: "GET",
              path: "/api/v1/servers/:id/databases",
              description: "List databases",
              permission: "airlink.api.servers.read",
            },
            {
              method: "POST",
              path: "/api/v1/servers/:id/databases",
              description: "Create a database",
              permission: "airlink.api.servers.update",
            },
            {
              method: "DELETE",
              path: "/api/v1/servers/:id/databases/:dbId",
              description: "Delete a database",
              permission: "airlink.api.servers.update",
            },
            {
              method: "GET",
              path: "/api/v1/servers/:id/subusers",
              description: "List subusers",
              permission: "airlink.api.servers.read",
            },
            {
              method: "POST",
              path: "/api/v1/servers/:id/subusers",
              description: "Add a subuser",
              permission: "airlink.api.servers.update",
            },
            {
              method: "PATCH",
              path: "/api/v1/servers/:id/subusers/:subUserId",
              description: "Update subuser permissions",
              permission: "airlink.api.servers.update",
            },
            {
              method: "DELETE",
              path: "/api/v1/servers/:id/subusers/:subUserId",
              description: "Remove a subuser",
              permission: "airlink.api.servers.update",
            },
            {
              method: "GET",
              path: "/api/v1/servers/:id/startup",
              description: "Get server startup",
              permission: "airlink.api.servers.read",
            },
            {
              method: "PATCH",
              path: "/api/v1/servers/:id/startup",
              description: "Update server startup",
              permission: "airlink.api.servers.update",
            },
            {
              method: "GET",
              path: "/api/v1/servers/:id/schedules",
              description: "List schedules",
              permission: "airlink.api.servers.read",
            },
            {
              method: "POST",
              path: "/api/v1/servers/:id/schedules",
              description: "Create a schedule",
              permission: "airlink.api.servers.update",
            },
            {
              method: "PATCH",
              path: "/api/v1/servers/:id/schedules/:scheduleId",
              description: "Update a schedule",
              permission: "airlink.api.servers.update",
            },
            {
              method: "DELETE",
              path: "/api/v1/servers/:id/schedules/:scheduleId",
              description: "Delete a schedule",
              permission: "airlink.api.servers.update",
            },
            {
              method: "POST",
              path: "/api/v1/servers/:id/schedules/:scheduleId/tasks",
              description: "Add a schedule task",
              permission: "airlink.api.servers.update",
            },
            {
              method: "DELETE",
              path: "/api/v1/servers/:id/schedules/:scheduleId/tasks/:taskId",
              description: "Delete a schedule task",
              permission: "airlink.api.servers.update",
            },
            {
              method: "GET",
              path: "/api/v1/nodes/:id/allocations",
              description: "List node allocations",
              permission: "airlink.api.nodes.read",
            },
            {
              method: "POST",
              path: "/api/v1/nodes/:id/allocations",
              description: "Add a node allocation",
              permission: "airlink.api.nodes.update",
            },
            {
              method: "DELETE",
              path: "/api/v1/nodes/:id/allocations/:allocationId",
              description: "Delete a node allocation",
              permission: "airlink.api.nodes.update",
            },
            {
              method: "GET",
              path: "/api/v1/images",
              description: "List images",
              permission: "airlink.api.images.read",
            },
            {
              method: "POST",
              path: "/api/v1/images",
              description: "Create an image",
              permission: "airlink.api.images.create",
            },
            {
              method: "GET",
              path: "/api/v1/images/:id",
              description: "Get an image",
              permission: "airlink.api.images.read",
            },
            {
              method: "PATCH",
              path: "/api/v1/images/:id",
              description: "Update an image",
              permission: "airlink.api.images.update",
            },
            {
              method: "DELETE",
              path: "/api/v1/images/:id",
              description: "Delete an image",
              permission: "airlink.api.images.delete",
            },
            {
              method: "GET",
              path: "/api/v1/locations",
              description: "List locations",
              permission: "airlink.api.locations.read",
            },
            {
              method: "POST",
              path: "/api/v1/locations",
              description: "Create a location",
              permission: "airlink.api.locations.create",
            },
          ],
        },
      });
    });

    router.get("/api", async (req: Request, res: Response) => {
      try {
        const settings = await getSettings();
        res.render("api/documentation", {
          req,
          user: req.session.user,
          settings,
          apiEndpoints,
        });
      } catch (error) {
        logger.error("Error rendering API documentation:", error);
        res.status(500).render("errors/error", {
          error: "Failed to load API documentation",
          req,
        });
      }
    });

    router.get(
      "/api/v1/users",
      apiValidator("airlink.api.users.read"),
      async (req: Request, res: Response) => {
        try {
          const page = Number(req.query.page) || 1;
          const perPage = Number(req.query.per_page) || DEFAULT_PAGE_SIZE;

          const { users } = await listUsers({ page, perPage });

          res.json(paginate(users, page, perPage));
        } catch (error) {
          logger.error("Error fetching users:", error);
          res.status(500).json({ error: "Internal Server Error" });
          return;
        }
      },
    );

    router.get(
      "/api/v1/users/:id",
      apiValidator("airlink.api.users.read"),
      async (req: Request, res: Response) => {
        try {
          const userId = getParamAsNumber(req.params.id);
          const user = await getUser(userId);

          if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
          }

          res.json({ data: user });
        } catch (error) {
          logger.error("Error fetching user:", error);
          res.status(500).json({ error: "Internal Server Error" });
          return;
        }
      },
    );

    router.post(
      "/api/v1/users",
      apiValidator("airlink.api.users.create"),
      async (req: Request, res: Response) => {
        try {
          const { email, username, password, isAdmin, description } = req.body;

          if (!email || !username || !password) {
            res
              .status(422)
              .json({ error: "email, username, and password are required" });
            return;
          }

          if (!validator.isEmail(email)) {
            res.status(422).json({ error: "Invalid email" });
            return;
          }

          if (!validator.isLength(username, { min: 3, max: 32 })) {
            res.status(422).json({ error: "Username 3–32 chars" });
            return;
          }

          if (!validator.isLength(password, { min: 8, max: 128 })) {
            res.status(422).json({ error: "Password 8–128 chars" });
            return;
          }

          const existingEmail = await prisma.users.findUnique({
            where: { email },
          });
          if (existingEmail) {
            res.status(409).json({ error: "Email already in use" });
            return;
          }

          const existingUsername = await prisma.users.findUnique({
            where: { username },
          });
          if (existingUsername) {
            res.status(409).json({ error: "Username already in use" });
            return;
          }

          const user = await createUser({
            email,
            username,
            password,
            isAdmin,
            description,
          });

          logger.info(
            `[AUDIT] userId=${req.session.user?.id} action=create-user target=${email}`,
          );
          res.status(201).json({ data: user });
        } catch (error) {
          logger.error("Error creating user:", error);
          res.status(500).json({ error: "Internal Server Error" });
          return;
        }
      },
    );

    router.patch(
      "/api/v1/users/:id",
      apiValidator("airlink.api.users.update"),
      async (req: Request, res: Response) => {
        try {
          const userId = getParamAsNumber(req.params.id);
          const { email, username, password, isAdmin, description } = req.body;

          const existing = await prisma.users.findUnique({
            where: { id: userId },
          });
          if (!existing) {
            res.status(404).json({ error: "User not found" });
            return;
          }

          if (email !== undefined) {
            if (!validator.isEmail(email)) {
              res.status(422).json({ error: "Invalid email" });
              return;
            }
            if (email !== existing.email) {
              const dup = await prisma.users.findUnique({ where: { email } });
              if (dup) {
                res.status(409).json({ error: "Email already in use" });
                return;
              }
            }
          }

          if (username !== undefined) {
            if (!validator.isLength(username, { min: 3, max: 32 })) {
              res.status(422).json({ error: "Username 3–32 chars" });
              return;
            }
            if (username !== existing.username) {
              const dup = await prisma.users.findUnique({
                where: { username },
              });
              if (dup) {
                res.status(409).json({ error: "Username already in use" });
                return;
              }
            }
          }

          if (password !== undefined) {
            if (!validator.isLength(password, { min: 8, max: 128 })) {
              res.status(422).json({ error: "Password 8–128 chars" });
              return;
            }
          }

          const user = await updateUser(userId, {
            email,
            username,
            password,
            isAdmin,
            description,
          });

          logger.info(
            `[AUDIT] userId=${req.session.user?.id} action=update-user target=${user.email}`,
          );
          res.json({ data: user });
        } catch (error) {
          logger.error("Error updating user:", error);
          res.status(500).json({ error: "Internal Server Error" });
          return;
        }
      },
    );

    router.delete(
      "/api/v1/users/:id",
      apiValidator("airlink.api.users.delete"),
      async (req: Request, res: Response) => {
        try {
          const userId = getParamAsNumber(req.params.id);

          const existing = await prisma.users.findUnique({
            where: { id: userId },
          });
          if (!existing) {
            res.status(404).json({ error: "User not found" });
            return;
          }

          await deleteUser(userId);

          logger.info(
            `[AUDIT] userId=${req.session.user?.id} action=delete-user target=${existing.email}`,
          );
          res.json({ data: { success: true } });
        } catch (error) {
          logger.error("Error deleting user:", error);
          res.status(500).json({ error: "Internal Server Error" });
          return;
        }
      },
    );

    router.get(
      "/api/v1/servers",
      apiValidator("airlink.api.servers.read"),
      async (req: Request, res: Response) => {
        try {
          const page = Number(req.query.page) || 1;
          const perPage = Number(req.query.per_page) || DEFAULT_PAGE_SIZE;

          const servers = await listServers({ page, perPage });

          res.json(paginate(servers, page, perPage));
        } catch (error) {
          logger.error("Error fetching servers:", error);
          res.status(500).json({ error: "Internal Server Error" });
          return;
        }
      },
    );

    router.get(
      "/api/v1/servers/:id",
      apiValidator("airlink.api.servers.read"),
      async (req: Request, res: Response) => {
        try {
          const serverId = req.params.id;

          const server = await getServer(getParamAsString(serverId));

          if (!server) {
            res.status(404).json({ error: "Server not found" });
            return;
          }

          res.json({ data: server });
        } catch (error) {
          logger.error("Error fetching server:", error);
          res.status(500).json({ error: "Internal Server Error" });
          return;
        }
      },
    );

    router.post(
      "/api/v1/servers",
      apiValidator("airlink.api.servers.create"),
      async (req: Request, res: Response) => {
        try {
          const {
            name,
            description,
            ownerId,
            nodeId,
            imageId,
            Ports,
            Memory,
            Swap,
            Cpu,
            Storage,
            Variables,
            StartCommand,
            dockerImage,
          } = req.body;

          if (!name || !ownerId || !nodeId || !imageId) {
            res.status(422).json({
              error: "name, ownerId, nodeId, and imageId are required",
            });
            return;
          }

          const owner = await prisma.users.findUnique({
            where: { id: ownerId },
          });
          if (!owner) {
            res.status(404).json({ error: "Owner not found" });
            return;
          }

          const node = await prisma.node.findUnique({ where: { id: nodeId } });
          if (!node) {
            res.status(404).json({ error: "Node not found" });
            return;
          }

          const image = await prisma.images.findUnique({
            where: { id: imageId },
          });
          if (!image) {
            res.status(404).json({ error: "Image not found" });
            return;
          }

          const server = await createServer({
            name,
            description: description ?? null,
            ownerId,
            nodeId,
            imageId,
            Ports,
            Memory,
            Swap,
            Cpu,
            Storage,
            Variables,
            StartCommand: StartCommand ?? image.startup,
            dockerImage,
          });

          logger.info(
            `[AUDIT] userId=${req.session.user?.id} action=create-server target=${server.UUID}`,
          );
          res.status(201).json({ data: server });
        } catch (error) {
          logger.error("Error creating server:", error);
          res.status(500).json({ error: "Internal Server Error" });
          return;
        }
      },
    );

    router.patch(
      "/api/v1/servers/:id",
      apiValidator("airlink.api.servers.update"),
      async (req: Request, res: Response) => {
        try {
          const serverId = getParamAsString(req.params.id);
          const {
            name,
            description,
            Ports,
            Memory,
            Swap,
            Cpu,
            Storage,
            Variables,
            StartCommand,
            dockerImage,
          } = req.body;

          const existing = await prisma.server.findUnique({
            where: { UUID: serverId },
          });
          if (!existing) {
            res.status(404).json({ error: "Server not found" });
            return;
          }

          const data: Record<string, unknown> = {};
          if (name !== undefined) {
            data.name = name;
          }
          if (description !== undefined) {
            data.description = description;
          }
          if (Ports !== undefined) {
            data.Ports = Ports;
          }
          if (Memory !== undefined) {
            data.Memory = Memory;
          }
          if (Swap !== undefined) {
            data.Swap = Swap;
          }
          if (Cpu !== undefined) {
            data.Cpu = Cpu;
          }
          if (Storage !== undefined) {
            data.Storage = Storage;
          }
          if (Variables !== undefined) {
            data.Variables = Variables;
          }
          if (StartCommand !== undefined) {
            data.StartCommand = StartCommand;
          }
          if (dockerImage !== undefined) {
            data.dockerImage = dockerImage;
          }

          const server = await prisma.server.update({
            where: { UUID: serverId },
            data,
            include: {
              owner: { select: { id: true, username: true, email: true } },
              node: { select: { id: true, name: true, address: true } },
            },
          });

          logger.info(
            `[AUDIT] userId=${req.session.user?.id} action=update-server target=${serverId}`,
          );
          res.json({ data: server });
        } catch (error) {
          logger.error("Error updating server:", error);
          res.status(500).json({ error: "Internal Server Error" });
          return;
        }
      },
    );

    router.post(
      "/api/v1/servers/:id/suspend",
      apiValidator("airlink.api.servers.update"),
      async (req: Request, res: Response) => {
        try {
          const serverId = getParamAsString(req.params.id);

          const result = await suspendServer(serverId);

          if (result === null) {
            res.status(404).json({ error: "Server not found" });
            return;
          }

          if (result === "already_suspended") {
            res.status(409).json({ error: "Server is already suspended" });
            return;
          }

          logger.info(
            `[AUDIT] userId=${req.session.user?.id} action=suspend-server target=${serverId}`,
          );
          res.json({ data: result });
        } catch (error) {
          logger.error("Error suspending server:", error);
          res.status(500).json({ error: "Internal Server Error" });
          return;
        }
      },
    );

    router.post(
      "/api/v1/servers/:id/unsuspend",
      apiValidator("airlink.api.servers.update"),
      async (req: Request, res: Response) => {
        try {
          const serverId = getParamAsString(req.params.id);

          const result = await unsuspendServer(serverId);

          if (result === null) {
            res.status(404).json({ error: "Server not found" });
            return;
          }

          if (result === "not_suspended") {
            res.status(409).json({ error: "Server is not suspended" });
            return;
          }

          logger.info(
            `[AUDIT] userId=${req.session.user?.id} action=unsuspend-server target=${serverId}`,
          );
          res.json({ data: result });
        } catch (error) {
          logger.error("Error unsuspending server:", error);
          res.status(500).json({ error: "Internal Server Error" });
          return;
        }
      },
    );

    router.delete(
      "/api/v1/servers/:id",
      apiValidator("airlink.api.servers.delete"),
      async (req: Request, res: Response) => {
        try {
          const serverId = getParamAsString(req.params.id);

          const deleted = await deleteServer(serverId);
          if (!deleted) {
            res.status(404).json({ error: "Server not found" });
            return;
          }

          logger.info(
            `[AUDIT] userId=${req.session.user?.id} action=delete-server target=${serverId}`,
          );
          res.json({ data: { success: true } });
        } catch (error) {
          logger.error("Error deleting server:", error);
          res.status(500).json({ error: "Internal Server Error" });
          return;
        }
      },
    );

    router.get(
      "/api/v1/nodes",
      apiValidator("airlink.api.nodes.read"),
      async (req: Request, res: Response) => {
        try {
          const page = Number(req.query.page) || 1;
          const perPage = Number(req.query.per_page) || DEFAULT_PAGE_SIZE;

          const nodes = await listNodes();
          res.json(paginate(nodes, page, perPage));
        } catch (error) {
          logger.error("Error fetching nodes:", error);
          res.status(500).json({ error: "Internal Server Error" });
          return;
        }
      },
    );

    router.get(
      "/api/v1/nodes/:id",
      apiValidator("airlink.api.nodes.read"),
      async (req: Request, res: Response) => {
        try {
          const node = await getNode(getParamAsNumber(req.params.id));
          if (!node) {
            res.status(404).json({ error: "Node not found" });
            return;
          }
          res.json({ data: node });
        } catch (error) {
          logger.error("Error fetching node:", error);
          res.status(500).json({ error: "Internal Server Error" });
          return;
        }
      },
    );

    router.post(
      "/api/v1/nodes",
      apiValidator("airlink.api.nodes.create"),
      async (req: Request, res: Response) => {
        try {
          const { name, address, port, ram, cpu, disk, key, sftpPort } =
            req.body;

          if (!name || !key) {
            res.status(422).json({ error: "name and key are required" });
            return;
          }

          const node = await createNode({
            name,
            address,
            port,
            ram,
            cpu,
            disk,
            key,
            sftpPort,
          });

          logger.info(
            `[AUDIT] userId=${req.session.user?.id} action=create-node target=${name}`,
          );
          res.status(201).json({ data: node });
        } catch (error) {
          logger.error("Error creating node:", error);
          res.status(500).json({ error: "Internal Server Error" });
          return;
        }
      },
    );

    router.patch(
      "/api/v1/nodes/:id",
      apiValidator("airlink.api.nodes.update"),
      async (req: Request, res: Response) => {
        try {
          const nodeId = getParamAsNumber(req.params.id);
          const { name, address, port, ram, cpu, disk, key, sftpPort } =
            req.body;

          const existing = await prisma.node.findUnique({
            where: { id: nodeId },
          });
          if (!existing) {
            res.status(404).json({ error: "Node not found" });
            return;
          }

          const node = await updateNode(nodeId, {
            name,
            address,
            port,
            ram,
            cpu,
            disk,
            key,
            sftpPort,
          });

          logger.info(
            `[AUDIT] userId=${req.session.user?.id} action=update-node target=${node.name}`,
          );
          res.json({ data: node });
        } catch (error) {
          logger.error("Error updating node:", error);
          res.status(500).json({ error: "Internal Server Error" });
          return;
        }
      },
    );

    router.delete(
      "/api/v1/nodes/:id",
      apiValidator("airlink.api.nodes.delete"),
      async (req: Request, res: Response) => {
        try {
          const node = await deleteNode(getParamAsNumber(req.params.id));

          logger.info(
            `[AUDIT] userId=${req.session.user?.id} action=delete-node target=${node.name}`,
          );
          res.json({ data: { success: true } });
        } catch (error) {
          if (error instanceof NodeError) {
            res.status(error.status).json({ error: error.message });
            return;
          }
          logger.error("Error deleting node:", error);
          res.status(500).json({ error: "Internal Server Error" });
          return;
        }
      },
    );

    router.get(
      "/api/v1/settings",
      apiValidator("airlink.api.settings.read"),
      async (_req: Request, res: Response) => {
        try {
          const settings = await getSettings();

          if (!settings) {
            res.status(404).json({ error: "Settings not found" });
            return;
          }

          res.json({ data: settings });
        } catch (error) {
          logger.error("Error fetching settings:", error);
          res.status(500).json({ error: "Internal Server Error" });
          return;
        }
      },
    );

    router.patch(
      "/api/v1/settings",
      apiValidator("airlink.api.settings.update"),
      async (req: Request, res: Response) => {
        try {
          const { title, description, logo, favicon, theme, language } =
            req.body;

          const updatedSettings = await updateSettings({
            title,
            description,
            logo,
            favicon,
            theme,
            language,
          });

          if (!updatedSettings) {
            res.status(404).json({ error: "Settings not found" });
            return;
          }

          res.json({ data: updatedSettings });
        } catch (error) {
          logger.error("Error updating settings:", error);
          res.status(500).json({ error: "Internal Server Error" });
          return;
        }
      },
    );

    // ── GET /api/v1/servers/:id/backups ─────────────────────────────────────
    router.get(
      "/api/v1/servers/:id/backups",
      apiValidator("airlink.api.servers.read"),
      async (req: Request, res: Response) => {
        try {
          const server = await prisma.server.findUnique({
            where: { UUID: getParamAsString(req.params.id) },
          });
          if (!server) {
            res.status(404).json({ error: "Server not found" });
            return;
          }

          const backups = await listBackups(server.UUID);

          res.json({
            data: backups.map((b) => ({
              ...b,
              size: b.size ? b.size.toString() : "0",
            })),
          });
        } catch (error) {
          logger.error("Error fetching backups:", error);
          res.status(500).json({ error: "Internal Server Error" });
          return;
        }
      },
    );

    // ── POST /api/v1/servers/:id/backups ────────────────────────────────────
    router.post(
      "/api/v1/servers/:id/backups",
      apiValidator("airlink.api.servers.update"),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params.id);
        const { name } = req.body as { name?: string };

        if (!name || name.trim() === "") {
          res.status(422).json({ error: "Backup name is required" });
          return;
        }

        try {
          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true },
          });
          if (!server) {
            res.status(404).json({ error: "Server not found" });
            return;
          }

          const settings = await getSettings();
          const isCloudBackupEnabled =
            settings?.airlinkCloudBackupEnabled && settings?.airlinkCloudApiKey;

          const backupCount = await prisma.backup.count({
            where: { serverId },
          });
          if (server.backupLimit > 0 && backupCount >= server.backupLimit) {
            res
              .status(400)
              .json({ error: `Backup limit reached (${server.backupLimit}).` });
            return;
          }

          const result = await createBackupOnDaemon(
            server.node.address,
            server.node.port,
            server.node.key,
            serverId,
            name.trim(),
          );

          if (!result.success || !result.backup) {
            res
              .status(502)
              .json({ error: "Failed to create backup on daemon" });
            return;
          }

          let airlinkCloudId: string | null = null;
          let filePath = result.backup.filePath;

          if (isCloudBackupEnabled) {
            try {
              const cloudClient = new AirlinkCloudClient(
                settings.airlinkCloudApiKey!,
              );
              const downloadResponse = await daemonRequest<
                import("stream").Readable
              >({
                method: "GET",
                path: "/container/backup/download",
                nodeAddress: server.node.address,
                nodePort: server.node.port,
                nodeKey: server.node.key,
                params: { backupPath: filePath },
                responseType: "stream",
              });

              const uniqueCloudFileName = `${serverId}_${result.backup.uuid}_${Date.now()}.tar.gz`;
              const uploadResult = await cloudClient.uploadFile(
                downloadResponse.data,
                uniqueCloudFileName,
              );

              if (
                uploadResult &&
                (uploadResult as Record<string, unknown>).id
              ) {
                airlinkCloudId = (uploadResult as Record<string, unknown>)
                  .id as string;
                await daemonRequest({
                  method: "DELETE",
                  path: "/container/backup",
                  nodeAddress: server.node.address,
                  nodePort: server.node.port,
                  nodeKey: server.node.key,
                  body: { backupPath: filePath },
                }).catch((e) =>
                  logger.warn(`Failed to delete temporary local backup: ${e}`),
                );
                filePath = "airlink-cloud";
              }
            } catch (cloudError) {
              logger.error(
                "Failed to redirect backup to Airlink Cloud:",
                cloudError,
              );
            }
          } else if (settings?.s3Enabled) {
            try {
              const downloadResponse = await daemonRequest<
                import("stream").Readable
              >({
                method: "GET",
                path: "/container/backup/download",
                nodeAddress: server.node.address,
                nodePort: server.node.port,
                nodeKey: server.node.key,
                params: { backupPath: filePath },
                responseType: "stream",
              });
              const s3Key = s3KeyFor(serverId, result.backup.uuid);
              await uploadStreamToS3(downloadResponse.data, s3Key);
              await daemonRequest({
                method: "DELETE",
                path: "/container/backup",
                nodeAddress: server.node.address,
                nodePort: server.node.port,
                nodeKey: server.node.key,
                body: { backupPath: filePath },
              }).catch((e) =>
                logger.warn(`Failed to delete temporary local backup: ${e}`),
              );
              filePath = `${S3_KEY_PREFIX}${s3Key}`;
            } catch (s3Error) {
              logger.error("Failed to redirect backup to S3:", s3Error);
            }
          }

          const backup = await createBackupRecord({
            uuid: result.backup.uuid,
            name: name.trim(),
            serverId,
            filePath,
            size: result.backup.size,
            checksum: result.backup.checksum,
            airlinkCloudId: airlinkCloudId ?? undefined,
          });

          await apiAudit(req, "backup:create", serverId, {
            name: name.trim(),
            uuid: backup.UUID,
          });
          res.status(201).json({
            data: {
              ...backup,
              size: backup.size ? backup.size.toString() : "0",
            },
          });
        } catch (error: unknown) {
          logger.error("Error creating backup:", error);
          res.status(500).json({
            error: safeClientMessage(error, "Failed to create backup"),
          });
          return;
        }
      },
    );

    // ── POST /api/v1/servers/:id/backups/:backupId/restore ─────────────────
    router.post(
      "/api/v1/servers/:id/backups/:backupId/restore",
      apiValidator("airlink.api.servers.update"),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params.id);
        const backupId = getParamAsString(req.params.backupId);

        try {
          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true },
          });
          if (!server) {
            res.status(404).json({ error: "Server not found" });
            return;
          }

          const backup = await getBackup(backupId, serverId);
          if (!backup) {
            res.status(404).json({ error: "Backup not found" });
            return;
          }

          let backupPath = backup.filePath;

          if (backup.airlinkCloudId) {
            const settings = await getSettings();
            if (!settings?.airlinkCloudApiKey) {
              res
                .status(500)
                .json({ error: "Airlink Cloud API key not configured" });
              return;
            }
            try {
              const cloudClient = new AirlinkCloudClient(
                settings.airlinkCloudApiKey,
              );
              const cloudDownloadResponse = await cloudClient.getDownloadStream(
                backup.airlinkCloudId,
              );
              const uploadResponse = await daemonRequest<{
                success: boolean;
                filePath?: string;
              }>({
                method: "POST",
                path: "/container/backup/upload",
                nodeAddress: server.node.address,
                nodePort: server.node.port,
                nodeKey: server.node.key,
                params: { id: serverId, backupUuid: backup.UUID },
                body: cloudDownloadResponse.data,
                timeout: 300000,
              });
              if (uploadResponse.data.success) {
                backupPath = uploadResponse.data.filePath!;
              } else {
                throw new Error("Failed to upload cloud backup to daemon");
              }
            } catch (err) {
              logger.error(
                "Failed to prepare Airlink Cloud backup for restore:",
                err,
              );
              res
                .status(500)
                .json({ error: "Failed to prepare cloud backup for restore" });
              return;
            }
          } else if (isS3Backup(backup.filePath)) {
            try {
              const stream = await getS3ObjectStream(
                backup.filePath.slice(S3_KEY_PREFIX.length),
              );
              if (!stream) {
                throw new Error("S3 object not found");
              }
              const uploadResponse = await daemonRequest<{
                success: boolean;
                filePath?: string;
              }>({
                method: "POST",
                path: "/container/backup/upload",
                nodeAddress: server.node.address,
                nodePort: server.node.port,
                nodeKey: server.node.key,
                params: { id: serverId, backupUuid: backup.UUID },
                body: stream,
                timeout: 300000,
              });
              if (uploadResponse.data.success) {
                backupPath = uploadResponse.data.filePath!;
              } else {
                throw new Error("Failed to upload S3 backup to daemon");
              }
            } catch (err) {
              logger.error("Failed to prepare S3 backup for restore:", err);
              res
                .status(500)
                .json({ error: "Failed to prepare S3 backup for restore" });
              return;
            }
          }

          const response = await daemonRequest<{ success: boolean }>({
            method: "POST",
            path: "/container/restore",
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            nodeKey: server.node.key,
            body: {
              id: serverId,
              backupPath,
              checksum: backup.checksum ?? undefined,
            },
            timeout: 300000,
          });

          if (backupPath !== backup.filePath) {
            daemonRequest({
              method: "DELETE",
              path: "/container/backup",
              nodeAddress: server.node.address,
              nodePort: server.node.port,
              nodeKey: server.node.key,
              body: { backupPath },
            }).catch((e: unknown) =>
              logger.warn(`Failed to delete temporary restore file: ${e}`),
            );
          }

          if (!response.data.success) {
            res
              .status(502)
              .json({ error: "Failed to restore backup on daemon" });
            return;
          }

          await apiAudit(req, "backup:restore", serverId, {
            name: backup.name,
            uuid: backup.UUID,
          });
          res.json({ data: { success: true } });
        } catch (error: unknown) {
          logger.error("Error restoring backup:", error);
          res.status(500).json({
            error: safeClientMessage(error, "Failed to restore backup"),
          });
          return;
        }
      },
    );

    // ── DELETE /api/v1/servers/:id/backups/:backupId ───────────────────────
    router.delete(
      "/api/v1/servers/:id/backups/:backupId",
      apiValidator("airlink.api.servers.update"),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params.id);
        const backupId = getParamAsString(req.params.backupId);

        try {
          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true },
          });
          if (!server) {
            res.status(404).json({ error: "Server not found" });
            return;
          }

          const backup = await getBackup(backupId, serverId);
          if (!backup) {
            res.status(404).json({ error: "Backup not found" });
            return;
          }

          if (backup.locked) {
            res.status(403).json({
              error: "This backup is locked. Unlock it before deleting.",
            });
            return;
          }

          if (backup.airlinkCloudId) {
            const settings = await getSettings();
            if (settings?.airlinkCloudApiKey) {
              const cloudClient = new AirlinkCloudClient(
                settings.airlinkCloudApiKey,
              );
              await cloudClient
                .deleteFile(backup.airlinkCloudId)
                .catch((e) =>
                  logger.warn(
                    `Failed to delete backup from Airlink Cloud: ${e}`,
                  ),
                );
            }
          } else if (isS3Backup(backup.filePath)) {
            try {
              await deleteFromS3(backup.filePath.slice(S3_KEY_PREFIX.length));
            } catch (e) {
              logger.warn(`Failed to delete backup from S3: ${e}`);
            }
          } else {
            try {
              await daemonRequest({
                method: "DELETE",
                path: "/container/backup",
                nodeAddress: server.node.address,
                nodePort: server.node.port,
                nodeKey: server.node.key,
                body: { backupPath: backup.filePath },
              });
            } catch {
              logger.warn("Failed to delete backup file from daemon");
            }
          }

          await deleteBackupRecord(backupId);
          await apiAudit(req, "backup:delete", serverId, {
            name: backup.name,
            uuid: backup.UUID,
          });
          res.json({ data: { success: true } });
        } catch (error) {
          logger.error("Error deleting backup:", error);
          res.status(500).json({ error: "Failed to delete backup" });
          return;
        }
      },
    );

    // ── GET /api/v1/servers/:id/databases ───────────────────────────────────
    router.get(
      "/api/v1/servers/:id/databases",
      apiValidator("airlink.api.servers.read"),
      async (req: Request, res: Response) => {
        try {
          const server = await prisma.server.findUnique({
            where: { UUID: getParamAsString(req.params.id) },
          });
          if (!server) {
            res.status(404).json({ error: "Server not found" });
            return;
          }

          const databases = await listDatabases(server.UUID);
          res.json({ data: databases });
        } catch (error) {
          logger.error("Error fetching databases:", error);
          res.status(500).json({ error: "Internal Server Error" });
          return;
        }
      },
    );

    // ── POST /api/v1/servers/:id/databases ──────────────────────────────────
    router.post(
      "/api/v1/servers/:id/databases",
      apiValidator("airlink.api.servers.update"),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params.id);
        const { hostId } = req.body as { hostId?: string | number };

        try {
          const db = await provisionDatabase(serverId, { hostId: hostId! });
          await apiAudit(req, "database:create", serverId, {
            databaseId: db.id,
            hostId: db.hostId,
          });
          res.status(201).json({ data: db });
        } catch (error: unknown) {
          const msg =
            error instanceof Error
              ? error.message
              : "Failed to create database";
          const isProvisionError =
            msg.includes("database host") || msg.includes("limit reached");
          logger.error("Error creating database:", error);
          res
            .status(isProvisionError ? 502 : 500)
            .json({ error: safeClientMessage(error, msg) });
          return;
        }
      },
    );

    // ── DELETE /api/v1/servers/:id/databases/:dbId ──────────────────────────
    router.delete(
      "/api/v1/servers/:id/databases/:dbId",
      apiValidator("airlink.api.servers.update"),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params.id);
        const dbId = parseInt(getParamAsString(req.params.dbId), 10);

        try {
          await deprovisionDatabase(dbId, serverId);
          await apiAudit(req, "database:delete", serverId, {
            databaseId: dbId,
          });
          res.json({ data: { success: true } });
        } catch (error: unknown) {
          const msg =
            error instanceof Error
              ? error.message
              : "Failed to delete database";
          const isDeprovisionError =
            msg.includes("database host") || msg.includes("not found");
          logger.error("Error deleting database:", error);
          res
            .status(isDeprovisionError ? 502 : 500)
            .json({ error: safeClientMessage(error, msg) });
          return;
        }
      },
    );

    // ── GET /api/v1/servers/:id/subusers ────────────────────────────────────
    router.get(
      "/api/v1/servers/:id/subusers",
      apiValidator("airlink.api.servers.read"),
      async (req: Request, res: Response) => {
        try {
          const server = await prisma.server.findUnique({
            where: { UUID: getParamAsString(req.params.id) },
          });
          if (!server) {
            res.status(404).json({ error: "Server not found" });
            return;
          }

          const subUsers = await listSubUsers(server.UUID);

          res.json({ data: subUsers });
        } catch (error) {
          logger.error("Error fetching subusers:", error);
          res.status(500).json({ error: "Failed to fetch subusers" });
          return;
        }
      },
    );

    // ── POST /api/v1/servers/:id/subusers ───────────────────────────────────
    router.post(
      "/api/v1/servers/:id/subusers",
      apiValidator("airlink.api.servers.update"),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params.id);
        const { email, permissions } = req.body as {
          email?: string;
          permissions?: unknown;
        };

        if (!email || typeof email !== "string" || email.trim() === "") {
          res.status(400).json({ error: "Email is required" });
          return;
        }
        if (!Array.isArray(permissions)) {
          res.status(400).json({ error: "Permissions must be an array" });
          return;
        }

        try {
          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
          });
          if (!server) {
            res.status(404).json({ error: "Server not found" });
            return;
          }

          const subUser = await addSubUser(serverId, email, permissions);

          await apiAudit(req, "subuser:create", serverId, {
            targetUserId: subUser.user.id,
          });
          res.status(201).json({ data: subUser });
        } catch (error) {
          if (error instanceof SubUserError) {
            res.status(error.status).json({ error: error.message });
            return;
          }
          logger.error("Error adding subuser:", error);
          res.status(500).json({ error: "Failed to add subuser" });
          return;
        }
      },
    );

    // ── PATCH /api/v1/servers/:id/subusers/:subUserId ───────────────────────
    router.patch(
      "/api/v1/servers/:id/subusers/:subUserId",
      apiValidator("airlink.api.servers.update"),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params.id);
        const subUserId = parseInt(getParamAsString(req.params.subUserId), 10);
        const { permissions } = req.body as { permissions?: unknown };

        if (!Array.isArray(permissions)) {
          res.status(400).json({ error: "Permissions must be an array" });
          return;
        }

        try {
          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
          });
          if (!server) {
            res.status(404).json({ error: "Server not found" });
            return;
          }

          const result = await updateSubUser(
            subUserId,
            server.UUID,
            permissions,
          );

          await apiAudit(req, "subuser:update", serverId, { subUserId });
          res.json({ data: result });
        } catch (error) {
          if (error instanceof SubUserError) {
            res.status(error.status).json({ error: error.message });
            return;
          }
          logger.error("Error updating subuser permissions:", error);
          res
            .status(500)
            .json({ error: "Failed to update subuser permissions" });
          return;
        }
      },
    );

    // ── DELETE /api/v1/servers/:id/subusers/:subUserId ──────────────────────
    router.delete(
      "/api/v1/servers/:id/subusers/:subUserId",
      apiValidator("airlink.api.servers.update"),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params.id);
        const subUserId = parseInt(getParamAsString(req.params.subUserId), 10);

        try {
          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
          });
          if (!server) {
            res.status(404).json({ error: "Server not found" });
            return;
          }

          await deleteSubUser(subUserId, server.UUID);
          await apiAudit(req, "subuser:delete", serverId, { subUserId });
          res.json({ data: { success: true } });
        } catch (error) {
          if (error instanceof SubUserError) {
            res.status(error.status).json({ error: error.message });
            return;
          }
          logger.error("Error removing subuser:", error);
          res.status(500).json({ error: "Failed to remove subuser" });
          return;
        }
      },
    );

    // ── GET /api/v1/servers/:id/startup ─────────────────────────────────────
    router.get(
      "/api/v1/servers/:id/startup",
      apiValidator("airlink.api.servers.read"),
      async (req: Request, res: Response) => {
        try {
          const startup = await getStartup(getParamAsString(req.params.id));
          if (!startup) {
            res.status(404).json({ error: "Server not found" });
            return;
          }
          res.json({ data: startup });
        } catch (error) {
          logger.error("Error fetching startup:", error);
          res.status(500).json({ error: "Internal Server Error" });
          return;
        }
      },
    );

    // ── PATCH /api/v1/servers/:id/startup ───────────────────────────────────
    router.patch(
      "/api/v1/servers/:id/startup",
      apiValidator("airlink.api.servers.update"),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params.id);
        const { startCommand, dockerImage, variables } = req.body as {
          startCommand?: string;
          dockerImage?: string;
          variables?: unknown[];
        };

        try {
          const result = await updateStartup(serverId, {
            startCommand,
            dockerImage,
            variables:
              variables as import("../../user/server/shared").ServerVariable[],
          });
          if (result) {
            res.status(400).json(result);
            return;
          }

          await apiAudit(req, "server:update-startup", serverId);
          res.json({ data: { success: true } });
        } catch (error: unknown) {
          logger.error("Error updating startup:", error);
          res.status(500).json({
            error: safeClientMessage(error, "Failed to update startup"),
          });
          return;
        }
      },
    );

    // ── GET /api/v1/servers/:id/schedules ───────────────────────────────────
    router.get(
      "/api/v1/servers/:id/schedules",
      apiValidator("airlink.api.servers.read"),
      async (req: Request, res: Response) => {
        try {
          const server = await prisma.server.findUnique({
            where: { UUID: getParamAsString(req.params.id) },
          });
          if (!server) {
            res.status(404).json({ error: "Server not found" });
            return;
          }

          const schedules = await listSchedules(server.UUID);

          res.json({
            data: schedules.map((s) => ({
              ...s,
              tasks: s.tasks.map((t) => {
                let payload: unknown;
                try {
                  payload = JSON.parse(t.payload || "{}");
                } catch {
                  payload = {};
                }
                return { ...t, payload };
              }),
            })),
          });
        } catch (error) {
          logger.error("Error fetching schedules:", error);
          res.status(500).json({ error: "Internal Server Error" });
          return;
        }
      },
    );

    // ── POST /api/v1/servers/:id/schedules ──────────────────────────────────
    router.post(
      "/api/v1/servers/:id/schedules",
      apiValidator("airlink.api.servers.update"),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params.id);
        const { name, cron, timeOffset } = req.body as {
          name?: string;
          cron?: string;
          timeOffset?: unknown;
        };

        if (!name || typeof name !== "string" || name.trim() === "") {
          res.status(400).json({ error: "Schedule name is required" });
          return;
        }
        if (!cron || typeof cron !== "string" || !isValidCron(cron.trim())) {
          res.status(400).json({ error: "Invalid cron expression." });
          return;
        }
        const parsedOffset = parseInt(String(timeOffset ?? "0"), 10);
        const offset = Number.isNaN(parsedOffset)
          ? 0
          : Math.min(Math.max(parsedOffset, MIN_TIME_OFFSET), MAX_TIME_OFFSET);

        try {
          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
          });
          if (!server) {
            res.status(404).json({ error: "Server not found" });
            return;
          }

          const schedule = await createSchedule(server.UUID, {
            name: name.trim(),
            cron: cron.trim(),
            timeOffset: offset,
            nextRunAt: nextRunFromCron(cron.trim()),
          });

          res.status(201).json({ data: schedule });
        } catch (error) {
          logger.error("Error creating schedule:", error);
          res.status(500).json({ error: "Failed to create schedule" });
          return;
        }
      },
    );

    // ── PATCH /api/v1/servers/:id/schedules/:scheduleId ─────────────────────
    router.patch(
      "/api/v1/servers/:id/schedules/:scheduleId",
      apiValidator("airlink.api.servers.update"),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params.id);
        const scheduleId = parseInt(
          getParamAsString(req.params.scheduleId),
          10,
        );
        const { enabled, timeOffset } = req.body as {
          enabled?: unknown;
          timeOffset?: unknown;
        };

        try {
          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
          });
          if (!server) {
            res.status(404).json({ error: "Server not found" });
            return;
          }

          const schedule = await getSchedule(scheduleId, server.UUID);
          if (!schedule) {
            res.status(404).json({ error: "Schedule not found" });
            return;
          }

          let offset = schedule.timeOffset ?? 0;
          if (timeOffset !== undefined) {
            const parsed = parseInt(String(timeOffset), 10);
            offset = Number.isNaN(parsed)
              ? 0
              : Math.min(Math.max(parsed, MIN_TIME_OFFSET), MAX_TIME_OFFSET);
          }

          const wantEnabled = enabled === true || enabled === "true";
          const updated = await prisma.schedule.update({
            where: { id: schedule.id },
            data: {
              enabled: wantEnabled,
              timeOffset: offset,
              nextRunAt: wantEnabled
                ? nextRunFromCron(schedule.cron, offset)
                : null,
            },
          });

          res.json({ data: updated });
        } catch (error) {
          logger.error("Error toggling schedule:", error);
          res.status(500).json({ error: "Failed to update schedule" });
          return;
        }
      },
    );

    // ── DELETE /api/v1/servers/:id/schedules/:scheduleId ────────────────────
    router.delete(
      "/api/v1/servers/:id/schedules/:scheduleId",
      apiValidator("airlink.api.servers.update"),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params.id);
        const scheduleId = parseInt(
          getParamAsString(req.params.scheduleId),
          10,
        );

        try {
          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
          });
          if (!server) {
            res.status(404).json({ error: "Server not found" });
            return;
          }

          const deleted = await deleteSchedule(scheduleId, server.UUID);
          if (!deleted) {
            res.status(404).json({ error: "Schedule not found" });
            return;
          }

          res.json({ data: { success: true } });
        } catch (error) {
          logger.error("Error deleting schedule:", error);
          res.status(500).json({ error: "Failed to delete schedule" });
          return;
        }
      },
    );

    // ── POST /api/v1/servers/:id/schedules/:scheduleId/tasks ───────────────
    router.post(
      "/api/v1/servers/:id/schedules/:scheduleId/tasks",
      apiValidator("airlink.api.servers.update"),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params.id);
        const scheduleId = parseInt(
          getParamAsString(req.params.scheduleId),
          10,
        );
        const {
          action,
          payload,
          timeOffset = 0,
        } = req.body as {
          action?: string;
          payload?: Record<string, unknown>;
          timeOffset?: unknown;
        };

        if (!action || !(TASK_ACTIONS as readonly string[]).includes(action)) {
          res.status(400).json({
            error: "Task action must be one of: command, power, backup.",
          });
          return;
        }
        if (!payload || typeof payload !== "object") {
          res.status(400).json({ error: "Task payload is required." });
          return;
        }
        if (action === "command" && !String(payload.command ?? "").trim()) {
          res.status(400).json({ error: "Command is required." });
          return;
        }
        if (
          action === "power" &&
          !(POWER_ACTIONS as readonly string[]).includes(
            String(payload.action ?? ""),
          )
        ) {
          res.status(400).json({
            error: "Power action must be one of: start, stop, restart, kill.",
          });
          return;
        }
        if (action === "backup" && !String(payload.name ?? "").trim()) {
          res.status(400).json({ error: "Backup name is required." });
          return;
        }

        try {
          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
          });
          if (!server) {
            res.status(404).json({ error: "Server not found" });
            return;
          }

          const schedule = await getSchedule(scheduleId, server.UUID);
          if (!schedule) {
            res.status(404).json({ error: "Schedule not found" });
            return;
          }

          const taskCount = await prisma.scheduleTask.count({
            where: { scheduleId: schedule.id },
          });

          const task = await prisma.scheduleTask.create({
            data: {
              scheduleId: schedule.id,
              order: taskCount,
              action,
              payload: JSON.stringify(payload),
              timeOffset: Math.max(0, parseInt(String(timeOffset), 10) || 0),
            },
          });

          res.status(201).json({ data: { ...task, payload } });
        } catch (error) {
          logger.error("Error adding schedule task:", error);
          res.status(500).json({ error: "Failed to add task" });
          return;
        }
      },
    );

    // ── DELETE /api/v1/servers/:id/schedules/:scheduleId/tasks/:taskId ─────
    router.delete(
      "/api/v1/servers/:id/schedules/:scheduleId/tasks/:taskId",
      apiValidator("airlink.api.servers.update"),
      async (req: Request, res: Response) => {
        const serverId = getParamAsString(req.params.id);
        const scheduleId = parseInt(
          getParamAsString(req.params.scheduleId),
          10,
        );
        const taskId = parseInt(getParamAsString(req.params.taskId), 10);

        try {
          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
          });
          if (!server) {
            res.status(404).json({ error: "Server not found" });
            return;
          }

          const schedule = await getSchedule(scheduleId, server.UUID);
          if (!schedule) {
            res.status(404).json({ error: "Schedule not found" });
            return;
          }

          const task = await prisma.scheduleTask.findFirst({
            where: { id: taskId, scheduleId: schedule.id },
          });
          if (!task) {
            res.status(404).json({ error: "Task not found" });
            return;
          }

          await prisma.scheduleTask.delete({ where: { id: task.id } });
          res.json({ data: { success: true } });
        } catch (error) {
          logger.error("Error removing schedule task:", error);
          res.status(500).json({ error: "Failed to remove task" });
          return;
        }
      },
    );

    // ── GET /api/v1/nodes/:id/allocations ───────────────────────────────────
    router.get(
      "/api/v1/nodes/:id/allocations",
      apiValidator("airlink.api.nodes.read"),
      async (req: Request, res: Response) => {
        try {
          const allocations = await listAllocations(
            getParamAsNumber(req.params.id),
          );
          res.json({ data: allocations });
        } catch (error) {
          logger.error("Error fetching allocations:", error);
          res.status(500).json({ error: "Internal Server Error" });
          return;
        }
      },
    );

    // ── POST /api/v1/nodes/:id/allocations ─────────────────────────────────
    router.post(
      "/api/v1/nodes/:id/allocations",
      apiValidator("airlink.api.nodes.update"),
      async (req: Request, res: Response) => {
        const nodeId = getParamAsNumber(req.params.id);
        const { ip, port } = req.body as { ip?: string; port?: unknown };

        try {
          const allocation = await createAllocation(nodeId, {
            ip,
            port: parseInt(String(port), 10),
          });

          await apiAudit(req, "allocation:create", undefined, {
            nodeId,
            port,
          });
          res.status(201).json({ data: allocation });
        } catch (error) {
          if (error instanceof NodeError) {
            res.status(error.status).json({ error: error.message });
            return;
          }
          logger.error("Error creating allocation:", error);
          res.status(500).json({ error: "Failed to create allocation" });
          return;
        }
      },
    );

    // ── DELETE /api/v1/nodes/:id/allocations/:allocationId ────────────────
    router.delete(
      "/api/v1/nodes/:id/allocations/:allocationId",
      apiValidator("airlink.api.nodes.update"),
      async (req: Request, res: Response) => {
        const nodeId = getParamAsNumber(req.params.id);
        const allocationId = getParamAsNumber(req.params.allocationId);

        try {
          const allocation = await deleteAllocation(nodeId, allocationId);

          await apiAudit(req, "node:delete-allocation", undefined, {
            nodeId,
            port: allocation.port,
          });
          res.json({ data: { success: true } });
        } catch (error) {
          if (error instanceof NodeError) {
            res.status(error.status).json({ error: error.message });
            return;
          }
          logger.error("Error deleting allocation:", error);
          res.status(500).json({ error: "Failed to delete allocation" });
          return;
        }
      },
    );

    // ── GET /api/v1/images ──────────────────────────────────────────────────
    router.get(
      "/api/v1/images",
      apiValidator("airlink.api.images.read"),
      async (req: Request, res: Response) => {
        try {
          const page = Number(req.query.page) || 1;
          const perPage = Number(req.query.per_page) || DEFAULT_PAGE_SIZE;

          const result = await listImages({ page, perPage });
          res.json(result);
        } catch (error) {
          logger.error("Error fetching images:", error);
          res.status(500).json({ error: "Internal Server Error" });
          return;
        }
      },
    );

    // ── POST /api/v1/images ─────────────────────────────────────────────────
    router.post(
      "/api/v1/images",
      apiValidator("airlink.api.images.create"),
      async (req: Request, res: Response) => {
        try {
          const { name, description, author, authorName, startup, stop } =
            req.body as {
              name?: string;
              description?: string;
              author?: string;
              authorName?: string;
              startup?: string;
              stop?: string;
            };

          if (!name || typeof name !== "string" || name.trim() === "") {
            res.status(422).json({ error: "Image name is required" });
            return;
          }
          if (
            !startup ||
            typeof startup !== "string" ||
            startup.trim() === ""
          ) {
            res
              .status(422)
              .json({ error: "Image startup command is required" });
            return;
          }

          const image = await createImage({
            name,
            description,
            author,
            authorName,
            startup,
            stop,
          });

          await apiAudit(req, "image:create", undefined, {
            imageId: image.id,
            name: image.name,
          });
          res.status(201).json({ data: image });
        } catch (error) {
          logger.error("Error creating image:", error);
          res.status(500).json({ error: "Failed to create image" });
          return;
        }
      },
    );

    // ── GET /api/v1/images/:id ──────────────────────────────────────────────
    router.get(
      "/api/v1/images/:id",
      apiValidator("airlink.api.images.read"),
      async (req: Request, res: Response) => {
        try {
          const image = await getImage(getParamAsNumber(req.params.id));
          if (!image) {
            res.status(404).json({ error: "Image not found" });
            return;
          }
          res.json({ data: image });
        } catch (error) {
          logger.error("Error fetching image:", error);
          res.status(500).json({ error: "Internal Server Error" });
          return;
        }
      },
    );

    // ── PATCH /api/v1/images/:id ────────────────────────────────────────────
    router.patch(
      "/api/v1/images/:id",
      apiValidator("airlink.api.images.update"),
      async (req: Request, res: Response) => {
        try {
          const imageId = getParamAsNumber(req.params.id);
          const existing = await getImage(imageId);
          if (!existing) {
            res.status(404).json({ error: "Image not found" });
            return;
          }

          const {
            name,
            description,
            author,
            authorName,
            startup,
            stop,
            startup_done,
            config_files,
            dockerImages,
            variables,
            info,
            scripts,
            portRequirements,
          } = req.body as Record<string, unknown>;

          const image = await updateImage(imageId, {
            name,
            description,
            author,
            authorName,
            startup,
            stop,
            startup_done,
            config_files,
            dockerImages,
            variables,
            info,
            scripts,
            portRequirements,
          });

          await apiAudit(req, "image:update", undefined, {
            imageId,
            name: image.name,
          });
          res.json({ data: image });
        } catch (error) {
          logger.error("Error updating image:", error);
          res.status(500).json({ error: "Failed to update image" });
          return;
        }
      },
    );

    // ── DELETE /api/v1/images/:id ───────────────────────────────────────────
    router.delete(
      "/api/v1/images/:id",
      apiValidator("airlink.api.images.delete"),
      async (req: Request, res: Response) => {
        try {
          const imageId = getParamAsNumber(req.params.id);
          const serverCount = await countServersByImage(imageId);
          if (serverCount > 0) {
            res
              .status(409)
              .json({ error: "This image is in use by one or more servers." });
            return;
          }

          const existing = await getImage(imageId);
          if (!existing) {
            res.status(404).json({ error: "Image not found" });
            return;
          }

          await deleteImage(imageId);

          await apiAudit(req, "image:delete", undefined, {
            imageId,
            name: existing.name,
          });
          res.json({ data: { success: true } });
        } catch (error) {
          logger.error("Error deleting image:", error);
          res.status(500).json({ error: "Failed to delete image" });
          return;
        }
      },
    );

    // ── GET /api/v1/locations ───────────────────────────────────────────────
    router.get(
      "/api/v1/locations",
      apiValidator("airlink.api.locations.read"),
      async (req: Request, res: Response) => {
        try {
          const page = Number(req.query.page) || 1;
          const perPage = Number(req.query.per_page) || DEFAULT_PAGE_SIZE;

          const locations = await listLocations({ page, perPage });

          res.json(paginate(locations, page, perPage));
        } catch (error) {
          logger.error("Error fetching locations:", error);
          res.status(500).json({ error: "Internal Server Error" });
          return;
        }
      },
    );

    // ── POST /api/v1/locations ──────────────────────────────────────────────
    router.post(
      "/api/v1/locations",
      apiValidator("airlink.api.locations.create"),
      async (req: Request, res: Response) => {
        try {
          const { name, shortCode } = req.body as {
            name?: string;
            shortCode?: string;
          };
          const cleanName = typeof name === "string" ? name.trim() : "";
          const cleanShortCode =
            typeof shortCode === "string" ? shortCode.trim().toLowerCase() : "";

          if (cleanName.length < 2 || cleanName.length > 50) {
            res
              .status(422)
              .json({ error: "Name must be between 2 and 50 characters." });
            return;
          }
          if (!/^[a-z0-9-]{2,32}$/.test(cleanShortCode)) {
            res.status(422).json({
              error:
                "Short code must be 2-32 chars: lowercase letters, numbers, dashes.",
            });
            return;
          }

          const existing = await prisma.location.findUnique({
            where: { shortCode: cleanShortCode },
          });
          if (existing) {
            res.status(409).json({
              error: "A location with this short code already exists.",
            });
            return;
          }

          const location = await createLocation({
            name: cleanName,
            shortCode: cleanShortCode,
          });
          await apiAudit(req, "location:create", undefined, {
            locationId: location.id,
            name: location.name,
          });
          res.status(201).json({ data: location });
        } catch (error) {
          logger.error("Error creating location:", error);
          res.status(500).json({ error: "Failed to create location" });
          return;
        }
      },
    );

    return router;
  },
};

export default coreModule;
