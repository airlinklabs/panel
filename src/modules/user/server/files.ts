import { getSettings } from "../../../handlers/settingsCache";
import type { Router, Request, Response } from "express";
import {
  isAuthenticatedForServer,
  requireSubUserPermission,
} from "../../../handlers/utils/auth/serverAuthUtil";
import logger from "../../../handlers/logger";
import multer from "multer";
import fs from "fs";
import path from "path";
import os from "os";
import { isWorld } from "../../../handlers/features";
import {
  fsListSchema,
  parseDaemonResponse,
  type FsFileEntry,
} from "../../../platform/daemon/dtos";
import { checkForServerInstallation } from "../../../handlers/checkForServerInstallation";
import { getServerStatus } from "../../../handlers/utils/server/serverStatus";
import { getParamAsString } from "../../../utils/typeHelpers";
import {
  safeClientMessage,
  daemonMessage,
  errorBody,
} from "../../../utils/errors";
import prisma from "../../../db";
import {
  daemonRequest,
  daemonBaseUrl,
} from "../../../handlers/utils/core/daemonRequest";
import { isPathSafe, normalizePath } from "../../../utils/pathSecurity";
import { logActivity } from "../../../handlers/utils/activity/activityLogger";
import {
  type ErrorMessage,
  loadAuthenticatedServerContext,
  sendMissingServerContext,
  getServerStatusInput,
  getImageFeatures,
} from "./shared";

export function registerFilesRoutes(router: Router): void {
  router.get(
    "/server/:id/files",
    isAuthenticatedForServer("id"),
    requireSubUserPermission("files"),
    async (req: Request, res: Response) => {
      const errorMessage: ErrorMessage = {};
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      let path = req.query?.path || "/";
      path = typeof path === "string" ? path : String(path);
      path = path.replace(/\/+/g, "/");

      const settings = await getSettings();
      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          errorMessage.message = "User not found.";
          res.render("user/account", { errorMessage, user, req });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { UUID: String(serverId) },
          include: { node: true, image: true, owner: true },
        });

        if (!server) {
          errorMessage.message = "Server not found.";
          res.render("user/server/files", {
            errorMessage,
            features: [],
            user,
            req,
            settings,
          });
          return;
        }

        const filesResponse = await daemonRequest<unknown>({
          method: "GET",
          path: "/fs/list",
          nodeAddress: server.node.address,
          nodePort: server.node.port,
          nodeKey: server.node.key,
          params: { id: server.UUID, path },
        });

        const files = (
          parseDaemonResponse(fsListSchema, filesResponse.data) ?? []
        ).filter((file) => file.name !== "airlink");

        files.sort((a, b) => {
          if (a.type === "directory" && b.type === "file") {
            return -1;
          } else if (a.type === "file" && b.type === "directory") {
            return 1;
          } else {
            return 0;
          }
        });

        const features = getImageFeatures(server.image);
        const serverStatus = await getServerStatus(
          getServerStatusInput(server),
        );

        res.render("user/server/files", {
          errorMessage,
          user,
          features,
          installed: await checkForServerInstallation(
            getParamAsString(serverId),
          ),
          files,
          currentPath: path,
          req,
          server,
          serverStatus,
          settings,
        });
      } catch (error: unknown) {
        const errCode =
          error && typeof error === "object" && "code" in error
            ? String((error as { code: unknown }).code)
            : undefined;
        if (
          errCode !== "ECONNREFUSED" &&
          errCode !== "ETIMEDOUT" &&
          errCode !== "ENOTFOUND" &&
          errCode !== "ERR_BAD_RESPONSE"
        ) {
          logger.error("Error fetching files:", error);
        }

        const server = await prisma.server.findUnique({
          where: { UUID: getParamAsString(serverId) },
          include: {
            node: true,
            owner: true,
            image: true,
          },
        });

        if (!server) {
          res.status(404).json({ error: "Server not found" });
          return;
        }

        const features = getImageFeatures(server.image);
        const serverStatus = await getServerStatus(
          getServerStatusInput(server),
        );

        if (serverStatus.daemonOffline) {
          errorMessage.message =
            "Unable to access files. The daemon appears to be offline.";
        } else {
          errorMessage.message = "Error fetching files data.";
        }

        res.render("user/server/files", {
          errorMessage,
          features,
          user: req.session?.user,
          files: [],
          currentPath: path || "/",
          req,
          server,
          serverStatus,
          settings,
          installed: await checkForServerInstallation(
            getParamAsString(serverId),
          ),
        });
      }
    },
  );

  router.get(
    "/server/:id/files/list",
    isAuthenticatedForServer("id"),
    requireSubUserPermission("files"),
    async (req: Request, res: Response) => {
      try {
        const context = await loadAuthenticatedServerContext(req);
        if (sendMissingServerContext(res, context)) {
          return;
        }
        const { server } = context;

        let path = req.query?.path || "/";
        path = typeof path === "string" ? path : String(path);
        path = path.replace(/\/+/g, "/");

        const filesResponse = await daemonRequest<unknown>({
          method: "GET",
          path: "/fs/list",
          nodeAddress: server.node.address,
          nodePort: server.node.port,
          nodeKey: server.node.key,
          params: { id: server.UUID, path },
        });

        const files = (
          parseDaemonResponse(fsListSchema, filesResponse.data) ?? []
        ).filter((file) => file.name !== "airlink");

        files.sort((a, b) => {
          if (a.type === "directory" && b.type === "file") {
            return -1;
          }
          if (a.type === "file" && b.type === "directory") {
            return 1;
          }
          return 0;
        });

        const html = await new Promise<string>((resolve, reject) => {
          res.render(
            "user/server/files-rows",
            { files, currentPath: path, server, req },
            (err, out) => {
              if (err) {
                reject(err);
              } else {
                resolve(out ?? "");
              }
            },
          );
        });
        res.json({ success: true, files, html });
      } catch (error: unknown) {
        logger.error("Error listing files for in-place refresh:", error);
        res.status(500).json({ error: "Failed to list files." });
      }
    },
  );

  router.get(
    "/server/:id/files/download/{*path}",
    isAuthenticatedForServer("id"),
    requireSubUserPermission("files"),
    async (req: Request, res: Response) => {
      const filePath = Array.isArray(req.params?.path)
        ? req.params.path.join("/")
        : getParamAsString(req.params?.path);

      if (!isPathSafe(filePath)) {
        res.status(400).json({ error: "Invalid file path." });
        return;
      }

      try {
        const context = await loadAuthenticatedServerContext(req);
        if (sendMissingServerContext(res, context)) {
          return;
        }
        const { server } = context;

        // Mint a short-lived single-use daemon token and redirect the browser
        // straight at the daemon — the panel never proxies the file bytes.
        const response = await daemonRequest<{ token?: string; url?: string }>({
          method: "POST",
          path: "/fs/download-token",
          nodeAddress: server.node.address,
          nodePort: server.node.port,
          nodeKey: server.node.key,
          body: { id: server.UUID, path: filePath },
          timeout: 15000,
        });

        if (
          response.status !== 200 ||
          !response.data?.token ||
          !response.data?.url
        ) {
          res
            .status(response.status || 500)
            .json({ error: "Failed to start download" });
          return;
        }

        const base = await daemonBaseUrl(server.node.address, server.node.port);
        await logActivity(req, "file:download", {
          serverId: String(server.UUID),
          metadata: { path: filePath },
        });
        res.redirect(302, `${base}${response.data.url}`);
      } catch (error) {
        logger.error("Error downloading file:", error);
        res.status(500).json({ error: "Failed to download file" });
      }
    },
  );

  router.post(
    "/server/:id/files/mkdir",
    isAuthenticatedForServer("id"),
    requireSubUserPermission("files"),
    async (req: Request, res: Response) => {
      const serverId = req.params?.id;
      const relativePath =
        typeof req.body?.path === "string" ? req.body.path : "/";
      const folderName = req.body?.name;

      if (
        typeof folderName !== "string" ||
        !folderName.trim() ||
        folderName.includes("..")
      ) {
        res.status(400).json({ error: "Invalid folder name." });
        return;
      }
      if (
        typeof relativePath === "string" &&
        !isPathSafe(relativePath) &&
        relativePath !== "/"
      ) {
        res.status(400).json({ error: "Invalid path." });
        return;
      }

      try {
        if (!serverId) {
          res.status(400).json({ error: "Server ID is required." });
          return;
        }

        const context = await loadAuthenticatedServerContext(req);
        if (sendMissingServerContext(res, context)) {
          return;
        }
        const { server } = context;

        const response = await daemonRequest<{ message?: string }>({
          method: "POST",
          path: "/fs/mkdir",
          nodeAddress: server.node.address,
          nodePort: server.node.port,
          nodeKey: server.node.key,
          body: {
            id: serverId,
            path: relativePath,
            folderName: folderName.trim(),
          },
        });

        if (response.status === 200) {
          res.json({ success: true });
        } else {
          res.status(response.status).json({
            error: response.data?.message || "Failed to create folder",
          });
        }
      } catch (error) {
        logger.error("Error creating folder:", error);
        res.status(502).json({ error: "Failed to create folder" });
      }
    },
  );

  router.post(
    "/server/:id/zip",
    isAuthenticatedForServer("id"),
    requireSubUserPermission("files"),
    async (req: Request, res: Response) => {
      const serverId = req.params?.id;
      let relativePath = req.body?.relativePath || "/";
      const zipName = req.body?.zipname;

      if (typeof relativePath === "string") {
        relativePath = normalizePath(relativePath);
        if (!isPathSafe(relativePath) && relativePath !== "/") {
          res.status(400).json({ error: "Invalid path." });
          return;
        }
      }

      try {
        if (!serverId) {
          res.status(400).json({ error: "Server ID is required." });
          return;
        }

        const context = await loadAuthenticatedServerContext(req);
        if (sendMissingServerContext(res, context)) {
          return;
        }
        const { server } = context;

        // daemon's /fs/zip accepts either a single path string or an array of
        // paths — pass arrays through as-is instead of stringifying them
        const zipPaths = Array.isArray(relativePath)
          ? relativePath
          : String(relativePath);

        const response = await daemonRequest<{ message?: string }>({
          method: "POST",
          path: "/fs/zip",
          nodeAddress: server.node.address,
          nodePort: server.node.port,
          nodeKey: server.node.key,
          body: {
            id: serverId,
            path: zipPaths,
            zipname: zipName,
          },
        });

        if (response.status === 200) {
          res.json({ success: true });
        } else {
          res
            .status(response.status)
            .json({ error: response.data?.message || "Failed to zip files" });
        }
      } catch (error) {
        logger.error("Error zipping files:", error);
        res
          .status(500)
          .json({ error: safeClientMessage(error, "Failed to zip files.") });
      }
    },
  );

  router.post(
    "/server/:id/unzip",
    isAuthenticatedForServer("id"),
    requireSubUserPermission("files"),
    async (req: Request, res: Response) => {
      const serverId = req.params?.id;
      let relativePath = req.body?.relativePath || "/";
      const zipName = req.body?.zipname;

      if (typeof relativePath === "string") {
        relativePath = normalizePath(relativePath);
        if (!isPathSafe(relativePath) && relativePath !== "/") {
          res.status(400).json({ error: "Invalid path." });
          return;
        }
      }

      if (typeof zipName !== "string" || !zipName.trim()) {
        res.status(400).json({ error: "Zip file name is required" });
        return;
      }

      try {
        if (!serverId) {
          res.status(400).json({ error: "Server ID is required." });
          return;
        }

        const context = await loadAuthenticatedServerContext(req);
        if (sendMissingServerContext(res, context)) {
          return;
        }
        const { server } = context;

        const cleanPath = relativePath
          .replace(/\/+/g, "/")
          .replace(/^\/|\/$/g, "");
        const cleanZipName = zipName.replace(/^\/+/, "").replace(/\/+$/, "");

        try {
          const response = await daemonRequest<{ message?: string }>({
            method: "POST",
            path: "/fs/unzip",
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            nodeKey: server.node.key,
            body: {
              id: serverId,
              path: cleanPath,
              zipname: cleanZipName,
            },
          });

          if (response.status === 200) {
            res.json({ success: true });
          } else {
            res.status(response.status).json({
              error: daemonMessage(response.data, "Failed to unzip file"),
            });
          }
        } catch (innerError: unknown) {
          const inner =
            innerError && typeof innerError === "object"
              ? (innerError as Record<string, unknown>)
              : {};
          logger.error("Error during unzip request:", {
            error: innerError,
            response: inner.body,
            status: inner.status,
          });
          res.status(502).json({
            error: daemonMessage(inner.body, "Failed to unzip files"),
          });
        }
      } catch (error) {
        logger.error("Error unzipping files:", error);
        res
          .status(500)
          .json({ error: safeClientMessage(error, "Failed to unzip files.") });
      }
    },
  );

  /**
   * Duplicate a file or directory within the container volume.
   * Used by the frontend's "Duplicate" action on the files page.
   */
  router.post(
    "/server/:id/files/copy",
    isAuthenticatedForServer("id"),
    requireSubUserPermission("files"),
    async (req: Request, res: Response) => {
      const location = req.body?.location;

      if (typeof location !== "string" || !location.trim()) {
        res.status(400).json({ error: "Location is required." });
        return;
      }

      const cleanLocation = location.replace(/^\/+/, "");
      if (cleanLocation === "" || !isPathSafe(cleanLocation)) {
        res.status(400).json({ error: "Invalid location." });
        return;
      }

      try {
        const context = await loadAuthenticatedServerContext(req);
        if (sendMissingServerContext(res, context)) {
          return;
        }
        const { server } = context;

        const response = await daemonRequest<{
          message?: string;
          path?: string;
        }>({
          method: "POST",
          path: "/fs/copy",
          nodeAddress: server.node.address,
          nodePort: server.node.port,
          nodeKey: server.node.key,
          body: {
            id: server.UUID,
            source: cleanLocation,
          },
        });

        if (response.status === 200) {
          res.status(200).json({
            success: true,
            message: response.data?.message,
            path: response.data?.path,
          });
          return;
        }

        const body = response.data as { error?: string } | undefined;
        res.status(response.status).json({
          error: daemonMessage(body, "Failed to duplicate file"),
        });
      } catch (error: unknown) {
        logger.error("Error duplicating file:", error);
        const status = (
          error && typeof error === "object"
            ? (error as Record<string, unknown>).status
            : 500
        ) as number;
        res.status(status || 500).json({
          error: daemonMessage(errorBody(error), "Failed to duplicate file"),
        });
      }
    },
  );

  /**
   * Move a file/directory to a new path.
   * Thin adapter for the frontend Move modal (posts { oldPath, newPath }).
   */
  router.post(
    "/server/:id/files/rename",
    isAuthenticatedForServer("id"),
    requireSubUserPermission("files"),
    async (req: Request, res: Response) => {
      const oldPath = req.body?.oldPath;
      const newPath = req.body?.newPath;

      if (
        typeof oldPath !== "string" ||
        typeof newPath !== "string" ||
        !isPathSafe(oldPath) ||
        !isPathSafe(newPath)
      ) {
        res.status(400).json({ error: "Invalid path." });
        return;
      }

      try {
        const context = await loadAuthenticatedServerContext(req);
        if (sendMissingServerContext(res, context)) {
          return;
        }
        const { server } = context;

        const response = await daemonRequest<{ message?: string }>({
          method: "POST",
          path: "/fs/rename",
          nodeAddress: server.node.address,
          nodePort: server.node.port,
          nodeKey: server.node.key,
          body: {
            id: server.UUID,
            path: oldPath,
            newName: newPath,
          },
        });

        if (response.status === 200) {
          res.json({ success: true });
          return;
        }

        res.status(response.status).json({
          error: daemonMessage(response.data, "Failed to rename file"),
        });
      } catch (error) {
        logger.error("Error renaming file:", error);
        const status = (
          error && typeof error === "object"
            ? (error as Record<string, unknown>).status
            : 500
        ) as number;
        res.status(status || 500).json({
          error: daemonMessage(errorBody(error), "Failed to rename file"),
        });
      }
    },
  );

  /**
   * Delete a file or directory
   * Used by both the files page and the worlds page
   */
  router.delete(
    "/server/:id/files/rm/{*path}",
    isAuthenticatedForServer("id"),
    requireSubUserPermission("files"),
    async (req: Request, res: Response) => {
      const serverId = req.params?.id;
      const filePath = Array.isArray(req.params?.path)
        ? req.params.path.join("/")
        : getParamAsString(req.params?.path);

      if (!isPathSafe(filePath)) {
        res.status(400).json({ error: "Invalid file path." });
        return;
      }

      logger.info(
        `Deleting file/directory: ${filePath} from server ${serverId}`,
      );

      try {
        const context = await loadAuthenticatedServerContext(req);
        if (sendMissingServerContext(res, context)) {
          return;
        }
        const { server } = context;

        const isMinecraftWorld = await isWorld(
          getParamAsString(filePath),
          getServerStatusInput(server),
        );

        if (isMinecraftWorld) {
          logger.info(`Deleting Minecraft world: ${filePath}`);
        }

        try {
          await daemonRequest({
            method: "DELETE",
            path: "/fs/rm",
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            nodeKey: server.node.key,
            body: {
              id: server.UUID,
              path: filePath,
            },
            timeout: 10000,
          });

          logger.success(
            `Successfully deleted ${isMinecraftWorld ? "world" : "file/directory"}: ${filePath}`,
          );
          await logActivity(req, "file:delete", {
            serverId: String(server.UUID),
            metadata: { path: filePath },
          });
          res.json({ success: true });
          return;
        } catch (deleteError: unknown) {
          const del =
            deleteError && typeof deleteError === "object"
              ? (deleteError as Record<string, unknown>)
              : {};
          const statusCode = (del.status as number) || 500;

          logger.error(`Error deleting ${filePath}`, deleteError);
          res.status(statusCode).json({
            error: daemonMessage(
              errorBody(deleteError),
              "Failed to delete file",
            ),
          });
          return;
        }
      } catch (error) {
        logger.error("Error in file deletion endpoint:", error);
        res.status(500).json({ error: "Failed to delete file" });
        return;
      }
    },
  );

  router.post(
    "/server/:id/rename",
    isAuthenticatedForServer("id"),
    requireSubUserPermission("files"),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const relativePath = req.body.path;
      const newName = req.body.newName;

      const isSafe = (p: string) =>
        typeof p === "string" && !p.includes("..") && !p.startsWith("/");
      if (!isSafe(relativePath) || !isSafe(newName)) {
        res.status(400).json({ error: "Invalid path" });
        return;
      }
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

        try {
          const newPath = newName;

          await daemonRequest({
            method: "POST",
            path: "/fs/rename",
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            nodeKey: server.node.key,
            body: {
              id: server.UUID,
              path: relativePath,
              newName,
              newPath,
            },
          });
          await logActivity(req, "file:rename", {
            serverId: String(server.UUID),
            metadata: { path: relativePath, newName },
          });
          res.status(200).json({ success: true });
        } catch (error) {
          logger.error("Error renaming file:", error);
          res.status(500).json({ error: "Failed to rename file" });
        }
      } catch (error) {
        logger.error("Error renaming file:", error);
        res.status(500).json({ error: "Failed to rename file" });
      }
    },
  );

  router.post(
    "/server/:id/upload",
    isAuthenticatedForServer("id"),
    requireSubUserPermission("files"),
    async (req: Request, res: Response, next) => {
      const settings = await getSettings();
      const limitMb = settings?.uploadLimit ?? 100;
      const uploadDir = path.join(os.tmpdir(), "airlink-uploads");
      fs.mkdirSync(uploadDir, { recursive: true });
      const upload = multer({
        storage: multer.diskStorage({
          destination: (_req, _file, cb) => cb(null, uploadDir),
          filename: (_req, file, cb) => {
            const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
            cb(null, `${unique}-${file.originalname}`);
          },
        }),
        limits: { fileSize: limitMb * 1024 * 1024 },
      });
      upload.single("file")(req, res, next);
    },
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const relativePath =
        typeof req.body.path === "string" ? req.body.path : "/";
      const fileName =
        req.body.fileName || (req.file ? req.file.originalname : "");
      const tmpFilePath = req.file?.path;

      try {
        if (
          typeof fileName !== "string" ||
          !fileName.trim() ||
          fileName.includes("/") ||
          fileName.includes("\\") ||
          fileName.includes("..")
        ) {
          res.status(400).json({ error: "Invalid file name." });
          return;
        }

        if (
          typeof relativePath === "string" &&
          !isPathSafe(relativePath) &&
          relativePath !== "/"
        ) {
          res.status(400).json({ error: "Invalid path." });
          return;
        }

        logger.info(
          `Upload request received for file ${fileName} to path ${relativePath} for server ${serverId}`,
        );

        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          logger.warn(`User not found: ${userId}`);
          res.status(404).json({ error: "User not found" });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { UUID: getParamAsString(serverId) },
          include: { node: true, image: true },
        });

        if (!server) {
          logger.warn(`Server not found: ${serverId}`);
          res.status(404).json({ error: "Server not found" });
          return;
        }

        if (!req.file) {
          logger.warn("File content is required");
          res.status(400).json({ error: "File content is required" });
          return;
        }

        logger.info(
          `Sending upload request to node at ${server.node.address}:${server.node.port}`,
        );
        logger.info(`File size: ${req.file.size} bytes`);

        if (req.file.size < 10 * 1024 * 1024) {
          const fileContent = fs.readFileSync(req.file.path, "base64");
          const fileContentWithMeta = `data:${req.file.mimetype};base64,${fileContent}`;

          const uploadResponse = await daemonRequest<{
            fileName?: string;
            path?: string;
          }>({
            method: "POST",
            path: "/fs/upload",
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            nodeKey: server.node.key,
            body: {
              id: server.UUID,
              path: relativePath,
              fileName,
              fileContent: fileContentWithMeta,
            },
            timeout: 60000,
          });
          logger.info(
            `File ${fileName} successfully uploaded to ${relativePath}`,
          );
          await logActivity(req, "file:upload", {
            serverId: String(server.UUID),
            metadata: { path: relativePath, fileName, size: req.file.size },
          });
          res.status(200).json({
            success: true,
            fileName: uploadResponse.data?.fileName,
            path: uploadResponse.data?.path,
          });
        } else {
          await daemonRequest({
            method: "POST",
            path: "/fs/create-empty-file",
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            nodeKey: server.node.key,
            body: {
              id: server.UUID,
              path: relativePath,
              fileName,
            },
            timeout: 10000,
          });
          logger.info(`Created empty file ${fileName} in ${relativePath}`);

          const CHUNK_SIZE = 5 * 1024 * 1024;
          const totalChunks = Math.ceil(req.file.size / CHUNK_SIZE);
          const fd = fs.openSync(req.file.path, "r");

          try {
            for (let i = 0; i < totalChunks; i++) {
              const start = i * CHUNK_SIZE;
              const end = Math.min(start + CHUNK_SIZE, req.file.size);
              const buf = Buffer.alloc(end - start);
              fs.readSync(fd, buf, 0, buf.length, start);
              const chunkContent = buf.toString("base64");
              const chunkContentWithMeta = `data:${req.file.mimetype};base64,${chunkContent}`;

              await daemonRequest({
                method: "POST",
                path: "/fs/append-file",
                nodeAddress: server.node.address,
                nodePort: server.node.port,
                nodeKey: server.node.key,
                body: {
                  id: server.UUID,
                  path: relativePath,
                  fileName,
                  fileContent: chunkContentWithMeta,
                  chunkIndex: i,
                  totalChunks,
                },
                timeout: 30000,
              });
              logger.info(
                `Uploaded chunk ${i + 1}/${totalChunks} for file ${fileName}`,
              );
            }
          } finally {
            fs.closeSync(fd);
          }

          logger.info(
            `File ${fileName} successfully uploaded to ${relativePath} in ${totalChunks} chunks`,
          );
          await logActivity(req, "file:upload", {
            serverId: String(server.UUID),
            metadata: { path: relativePath, fileName, size: req.file.size },
          });
          res.status(200).json({
            success: true,
            fileName,
            path: relativePath,
          });
        }
      } catch (error: unknown) {
        const err =
          error && typeof error === "object"
            ? (error as Record<string, unknown>)
            : {};
        const errBody =
          err.body && typeof err.body === "object"
            ? (err.body as Record<string, unknown>)
            : undefined;
        if (err.status && errBody) {
          logger.error(
            `Error uploading file - Status: ${err.status}, Data:`,
            errBody,
          );
          res.status(err.status as number).json({
            error: daemonMessage(errBody, "Failed to upload file"),
          });
        } else if (err.message) {
          logger.error(
            "Error uploading file - No response received:",
            err.message,
          );
          res.status(500).json({
            error:
              "Connection error during file upload. Please try again with a smaller file.",
          });
        } else {
          logger.error("Error uploading file - Request setup error:", error);
          res.status(500).json({ error: "Error setting up upload request" });
        }
      } finally {
        if (tmpFilePath) {
          fs.unlink(tmpFilePath, () => {});
        }
      }
    },
  );

  router.post(
    "/server/:id/files/pull",
    isAuthenticatedForServer("id"),
    requireSubUserPermission("files"),
    async (req: Request, res: Response) => {
      const serverId = req.params?.id;
      const { url, path } = req.body as { url?: string; path?: string };

      if (!url || typeof url !== "string") {
        res.status(400).json({ error: "URL is required" });
        return;
      }
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        res.status(400).json({ error: "Invalid URL" });
        return;
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        res.status(400).json({ error: "Only http(s) URLs are allowed" });
        return;
      }

      try {
        const user = await prisma.users.findUnique({
          where: { id: req.session?.user?.id },
        });
        if (!user) {
          res.status(404).json({ error: "User not found" });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { UUID: getParamAsString(serverId) },
          include: { node: true },
        });
        if (!server) {
          res.status(404).json({ error: "Server not found" });
          return;
        }

        const pullResponse = await daemonRequest<{
          success: boolean;
          file?: string;
          path?: string;
          error?: string;
        }>({
          method: "POST",
          path: "/fs/pull",
          nodeAddress: server.node.address,
          nodePort: server.node.port,
          nodeKey: server.node.key,
          body: {
            id: server.UUID,
            url,
            path: typeof path === "string" ? path : "/",
          },
          timeout: 120000,
        });

        if (pullResponse.status !== 200 || !pullResponse.data?.success) {
          res
            .status(pullResponse.status === 200 ? 400 : pullResponse.status)
            .json({
              error: daemonMessage(
                pullResponse.data,
                "Failed to pull file from URL",
              ),
            });
          return;
        }

        await logActivity(req, "file:pull", {
          serverId: String(server.UUID),
          metadata: { url, path: pullResponse.data.path ?? "/" },
        });
        res.json({
          success: true,
          message: "File pulled successfully",
          file: pullResponse.data.file,
          path: pullResponse.data.path,
        });
      } catch (error: unknown) {
        logger.error("Error pulling file from URL:", error);
        res.status(500).json({
          error: safeClientMessage(error, "Failed to pull file from URL"),
        });
      }
    },
  );
}
