import { getSettings } from "../../../handlers/settingsCache";
import type { Router, Request, Response } from "express";
import {
  isAuthenticatedForServer,
  requireSubUserPermission,
} from "../../../handlers/utils/auth/serverAuthUtil";
import logger from "../../../handlers/logger";
import { getParamAsString } from "../../../utils/typeHelpers";
import { safeClientMessage } from "../../../utils/errors";
import prisma from "../../../db";
import { checkForServerInstallation } from "../../../handlers/checkForServerInstallation";
import { logActivity } from "../../../handlers/utils/activity/activityLogger";
import { serverPageInclude } from "./shared";
import {
  provisionDatabase,
  deprovisionDatabase,
  rotateDatabasePassword,
} from "../../../handlers/utils/core/postgresProvisioner";
import { emitRealtime, serverEvent } from "../../../handlers/realtime/events";

async function loadServerForUser(
  serverId: string,
  userId: number,
  req: Request,
) {
  const server = await prisma.server.findUnique({
    where: { UUID: getParamAsString(serverId) },
    include: serverPageInclude,
  });
  if (!server) {
    return null;
  }
  if (
    server.ownerId === userId ||
    req.session?.user?.role === "owner" ||
    req.session?.user?.role === "admin"
  ) {
    return server;
  }
  const subUser = req.subUser;
  if (subUser) {
    return server;
  }
  return null;
}

export function registerDatabaseRoutes(router: Router): void {
  // ── GET /server/:id/databases ───────────────────────────────────────────
  router.get(
    "/server/:id/databases",
    isAuthenticatedForServer("id"),
    requireSubUserPermission("settings"),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: "User not found" });
          return;
        }

        const server = await loadServerForUser(String(serverId), user.id, req);
        if (!server) {
          res.status(403).json({ error: "Server not found or access denied." });
          return;
        }

        const [databases, hosts] = await Promise.all([
          prisma.serverDatabase.findMany({
            where: { serverId: server.UUID },
            include: { host: true },
            orderBy: { createdAt: "desc" },
          }),
          prisma.databaseHost.findMany({
            where: {
              OR: [{ nodeId: null }, { nodeId: server.nodeId ?? -1 }],
            },
            orderBy: { id: "asc" },
          }),
        ]);

        const settings = await getSettings();
        const owner = await prisma.users.findUnique({
          where: { id: server.ownerId },
        });
        const userDbLimit =
          owner?.maxDatabases !== null && owner?.maxDatabases !== undefined
            ? (owner.maxDatabases ?? 0)
            : (settings?.defaultMaxDatabases ?? 0);
        const userDbCount = await prisma.serverDatabase.count({
          where: { server: { ownerId: server.ownerId } },
        });

        if (req.htmx) {
          res.vary("HX-Request");
          return res.render("fragments/user/server/db-list", {
            req,
            server,
            databases,
            hosts,
            userDbLimit,
          });
        }

        res.render("user/server/databases", {
          user,
          req,
          server,
          settings,
          databases,
          hosts,
          userDbLimit,
          userDbCount,
          features: JSON.parse(server.image.info || "{}").features || [],
          installed: await checkForServerInstallation(
            getParamAsString(serverId),
          ),
        });
      } catch (error) {
        logger.error("Error fetching databases:", error);
        res.status(500).json({ error: "Failed to fetch databases" });
      }
    },
  );

  // ── POST /server/:id/databases ──────────────────────────────────────────
  router.post(
    "/server/:id/databases",
    isAuthenticatedForServer("id"),
    requireSubUserPermission("database.create"),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const { hostId } = req.body as { hostId?: string };

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: "User not found" });
          return;
        }

        const server = await loadServerForUser(String(serverId), user.id, req);
        if (!server) {
          res.status(403).json({ error: "Server not found or access denied." });
          return;
        }

        const host = await prisma.databaseHost.findUnique({
          where: { id: parseInt(String(hostId), 10) },
        });
        if (!host) {
          res.status(400).json({ error: "Invalid database host." });
          return;
        }
        if (host.nodeId !== null && host.nodeId !== server.nodeId) {
          res.status(403).json({
            error:
              "This database host is not available for this server's node.",
          });
          return;
        }

        const databaseLimit = server.databaseLimit ?? 0;
        if (databaseLimit > 0) {
          const existing = await prisma.serverDatabase.count({
            where: { serverId: server.UUID },
          });
          if (existing >= databaseLimit) {
            res.status(400).json({
              error: `Database limit reached (${databaseLimit}). Delete an existing database first.`,
            });
            return;
          }
        }

        // User-level hard cap — the server owner's total across all their servers.
        const owner = await prisma.users.findUnique({
          where: { id: server.ownerId },
        });
        const settings = await getSettings();
        const userMaxDatabases =
          owner?.maxDatabases !== null && owner?.maxDatabases !== undefined
            ? (owner.maxDatabases ?? 0)
            : (settings?.defaultMaxDatabases ?? 0);
        if (userMaxDatabases > 0) {
          const totalOwnerDatabases = await prisma.serverDatabase.count({
            where: { server: { ownerId: server.ownerId } },
          });
          if (totalOwnerDatabases >= userMaxDatabases) {
            res.status(400).json({
              error: `You have reached your database limit of ${userMaxDatabases} across all servers. Delete an existing database first.`,
            });
            return;
          }
        }

        try {
          const credentials = await provisionDatabase(host, server.UUID);
          const db = await prisma.serverDatabase.create({
            data: {
              serverId: server.UUID,
              hostId: host.id,
              ...credentials,
            },
            include: { host: true },
          });
          await logActivity(req, "database:create", {
            serverId: String(server.UUID),
            metadata: { databaseId: db.id, hostId: host.id },
          });
          emitRealtime(
            serverEvent("database.created", String(server.UUID), {
              state: { id: db.id, name: db.databaseName, hostId: host.id },
            }),
          );

          if (req.htmx) {
            const databases = await prisma.serverDatabase.findMany({
              where: { serverId: server.UUID },
              include: { host: true },
              orderBy: { createdAt: "desc" },
            });
            const hosts = await prisma.databaseHost.findMany({
              where: {
                OR: [{ nodeId: null }, { nodeId: server.nodeId ?? -1 }],
              },
              orderBy: { id: "asc" },
            });
            const owner = await prisma.users.findUnique({
              where: { id: server.ownerId },
            });
            const settings = await getSettings();
            const userDbLimit =
              owner?.maxDatabases ?? settings?.defaultMaxDatabases ?? 0;
            res.vary("HX-Request");
            return res.render("fragments/user/server/db-list", {
              req,
              server,
              databases,
              hosts,
              userDbLimit,
            });
          }

          return res.json({ success: true, database: db });
        } catch (error) {
          logger.error("Failed to provision database:", error);
          return res.status(502).json({
            error: safeClientMessage(
              error,
              "Failed to connect to the database host.",
            ),
          });
        }
      } catch (error) {
        logger.error("Error creating database:", error);
        return res.status(500).json({ error: "Failed to create database" });
      }
    },
  );

  // ── DELETE /server/:id/databases/:dbId ──────────────────────────────────
  router.delete(
    "/server/:id/databases/:dbId",
    isAuthenticatedForServer("id"),
    requireSubUserPermission("database.delete"),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const dbId = parseInt(getParamAsString(req.params?.dbId), 10);

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: "User not found" });
          return;
        }

        const server = await loadServerForUser(String(serverId), user.id, req);
        if (!server) {
          res.status(403).json({ error: "Server not found or access denied." });
          return;
        }

        const db = await prisma.serverDatabase.findUnique({
          where: { id: dbId },
          include: { host: true },
        });
        if (!db || db.serverId !== server.UUID) {
          res.status(404).json({ error: "Database not found." });
          return;
        }

        try {
          await deprovisionDatabase(db.host, db);
          await prisma.serverDatabase.delete({ where: { id: db.id } });
          await logActivity(req, "database:delete", {
            serverId: String(server.UUID),
            metadata: { databaseId: db.id },
          });
          emitRealtime(
            serverEvent("database.deleted", String(server.UUID), {
              state: { id: db.id, name: db.databaseName },
            }),
          );

          if (req.htmx) {
            const databases = await prisma.serverDatabase.findMany({
              where: { serverId: server.UUID },
              include: { host: true },
              orderBy: { createdAt: "desc" },
            });
            const hosts = await prisma.databaseHost.findMany({
              where: {
                OR: [{ nodeId: null }, { nodeId: server.nodeId ?? -1 }],
              },
              orderBy: { id: "asc" },
            });
            const owner = await prisma.users.findUnique({
              where: { id: server.ownerId },
            });
            const settings = await getSettings();
            const userDbLimit =
              owner?.maxDatabases ?? settings?.defaultMaxDatabases ?? 0;
            res.vary("HX-Request");
            return res.render("fragments/user/server/db-list", {
              req,
              server,
              databases,
              hosts,
              userDbLimit,
            });
          }

          return res.json({ success: true });
        } catch (error) {
          logger.error("Failed to deprovision database:", error);
          return res.status(502).json({
            error: safeClientMessage(
              error,
              "Failed to remove the database from the host.",
            ),
          });
        }
      } catch (error) {
        logger.error("Error deleting database:", error);
        return res.status(500).json({ error: "Failed to delete database" });
      }
    },
  );

  // ── POST /server/:id/databases/:dbId/rotate-password ────────────────────
  router.post(
    "/server/:id/databases/:dbId/rotate-password",
    isAuthenticatedForServer("id"),
    requireSubUserPermission("database.update"),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const dbId = parseInt(getParamAsString(req.params?.dbId), 10);

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: "User not found" });
          return;
        }

        const server = await loadServerForUser(String(serverId), user.id, req);
        if (!server) {
          res.status(403).json({ error: "Server not found or access denied." });
          return;
        }

        const db = await prisma.serverDatabase.findUnique({
          where: { id: dbId },
          include: { host: true },
        });
        if (!db || db.serverId !== server.UUID) {
          res.status(404).json({ error: "Database not found." });
          return;
        }

        try {
          const newPassword = await rotateDatabasePassword(db.host, db);
          await prisma.serverDatabase.update({
            where: { id: db.id },
            data: { databasePassword: newPassword },
          });
          emitRealtime(
            serverEvent("database.updated", String(server.UUID), {
              state: { id: db.id, name: db.databaseName },
            }),
          );

          if (req.htmx) {
            const databases = await prisma.serverDatabase.findMany({
              where: { serverId: server.UUID },
              include: { host: true },
              orderBy: { createdAt: "desc" },
            });
            const hosts = await prisma.databaseHost.findMany({
              where: {
                OR: [{ nodeId: null }, { nodeId: server.nodeId ?? -1 }],
              },
              orderBy: { id: "asc" },
            });
            const owner = await prisma.users.findUnique({
              where: { id: server.ownerId },
            });
            const settings = await getSettings();
            const userDbLimit =
              owner?.maxDatabases ?? settings?.defaultMaxDatabases ?? 0;
            res.vary("HX-Request");
            return res.render("fragments/user/server/db-list", {
              req,
              server,
              databases,
              hosts,
              userDbLimit,
            });
          }

          return res.json({ success: true, password: newPassword });
        } catch (error) {
          logger.error("Failed to rotate database password:", error);
          return res.status(502).json({
            error: safeClientMessage(
              error,
              "Failed to rotate the password on the host.",
            ),
          });
        }
      } catch (error) {
        logger.error("Error rotating database password:", error);
        return res
          .status(500)
          .json({ error: "Failed to rotate database password" });
      }
    },
  );
}
