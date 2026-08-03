import { Router, Request, Response } from 'express';
import { isAuthenticatedForServer, requireSubUserPermission } from '../../../handlers/utils/auth/serverAuthUtil';
import logger from '../../../handlers/logger';
import multer from 'multer';
import { isWorld } from '../../../handlers/features';
import { checkForServerInstallation } from '../../../handlers/checkForServerInstallation';
import { getServerStatus } from '../../../handlers/utils/server/serverStatus';
import { getParamAsString } from '../../../utils/typeHelpers';
import prisma from '../../../db';
import { daemonRequest } from '../../../handlers/utils/core/daemonRequest';
import { isPathSafe, normalizePath } from '../../../utils/pathSecurity';
import { logActivity } from '../../../handlers/utils/activity/activityLogger';
import {
  type ErrorMessage,
  loadAuthenticatedServerContext,
  sendMissingServerContext,
  getServerStatusInput,
  getImageFeatures,
} from './shared';

export function registerFilesRoutes(router: Router): void {
  /*
   * File system : Files
   */
  router.get(
    '/server/:id/files',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('files'),
    async (req: Request, res: Response) => {
      const errorMessage: ErrorMessage = {};
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      let path = req.query?.path || '/';
      path = typeof path === 'string' ? path : String(path);
      path = path.replace(/\/+/g, '/');

      const settings = await prisma.settings.findUnique({ where: { id: 1 } });
      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          errorMessage.message = 'User not found.';
          res.render('user/account', { errorMessage, user, req });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { UUID: String(serverId) },
          include: { node: true, image: true, owner: true },
        });

        if (!server) {
          errorMessage.message = 'Server not found.';
          res.render('user/server/files', {
            errorMessage,
            features: [],
            user,
            req,
            settings,
          });
          return;
        }

        const filesResponse = await daemonRequest<any[]>({
          method: 'GET',
          path: '/fs/list',
          nodeAddress: server.node.address,
          nodePort: server.node.port,
          nodeKey: server.node.key,
          params: { id: server.UUID, path },
        });

        let files = filesResponse.data as any[];
        files = typeof files === 'string' ? JSON.parse(files) : files;

        files = files.filter((file: any) => file.name !== 'airlink');

        files = files.sort((a: any, b: any) => {
          if (a.type === 'directory' && b.type === 'file') {
            return -1;
          } else if (a.type === 'file' && b.type === 'directory') {
            return 1;
          } else {
            return 0;
          }
        });

        const features = getImageFeatures(server.image);
        const serverStatus = await getServerStatus(getServerStatusInput(server));

        res.render('user/server/files', {
          errorMessage,
          user,
          features,
          installed: await checkForServerInstallation(getParamAsString(serverId)),
          files,
          currentPath: path,
          req,
          server,
          serverStatus,
          settings,
        });
      } catch (error: any) {
        if (
          error?.code !== 'ECONNREFUSED' &&
          error?.code !== 'ETIMEDOUT' &&
          error?.code !== 'ENOTFOUND' &&
          error?.code !== 'ERR_BAD_RESPONSE'
        ) {
          logger.error('Error fetching files:', error);
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
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        const features = getImageFeatures(server.image);
        const serverStatus = await getServerStatus(getServerStatusInput(server));

        if (serverStatus.daemonOffline) {
          errorMessage.message =
            'Unable to access files. The daemon appears to be offline.';
        } else {
          errorMessage.message = 'Error fetching files data.';
        }

        res.render('user/server/files', {
          errorMessage,
          features,
          user: req.session?.user,
          files: [],
          currentPath: path || '/',
          req,
          server,
          serverStatus,
          settings,
          installed: await checkForServerInstallation(getParamAsString(serverId)),
        });
      }
    },
  );

  router.get(
    '/server/:id/files/download/{*path}',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('files'),
    async (req: Request, res: Response) => {
      const filePath = Array.isArray(req.params?.path) ? req.params.path.join('/') : getParamAsString(req.params?.path);

      if (!isPathSafe(filePath)) {
        res.status(400).json({ error: 'Invalid file path.' });
        return;
      }

      try {
        const context = await loadAuthenticatedServerContext(req);
        if (sendMissingServerContext(res, context)) {
          return;
        }
        const { server } = context;

        const response = await daemonRequest<import('stream').Readable>({
          method: 'GET',
          path: '/fs/download',
          nodeAddress: server.node.address,
          nodePort: server.node.port,
          nodeKey: server.node.key,
          params: { id: server.UUID, path: filePath },
          responseType: 'stream',
        });

        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${filePath}"`,
        );
        res.setHeader('Content-Type', 'application/octet-stream');

        response.data.pipe(res);
      } catch (error) {
        logger.error('Error downloading file:', error);
        res.status(500).json({ error: 'Failed to download file' });
      }
    },
  );

  router.post(
    '/server/:id/files/mkdir',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('files'),
    async (req: Request, res: Response) => {
      const serverId = req.params?.id;
      const relativePath = typeof req.body?.path === 'string' ? req.body.path : '/';
      const folderName = req.body?.name;

      if (typeof folderName !== 'string' || !folderName.trim() || folderName.includes('..')) {
        res.status(400).json({ error: 'Invalid folder name.' });
        return;
      }
      if (typeof relativePath === 'string' && !isPathSafe(relativePath) && relativePath !== '/') {
        res.status(400).json({ error: 'Invalid path.' });
        return;
      }

      try {
        if (!serverId) {
          res.status(400).json({ error: 'Server ID is required.' });
          return;
        }

        const context = await loadAuthenticatedServerContext(req);
        if (sendMissingServerContext(res, context)) {
          return;
        }
        const { server } = context;

        const response = await daemonRequest<{ message?: string }>({
          method: 'POST',
          path: '/fs/mkdir',
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
          res.status(response.status).json({ error: response.data?.message || 'Failed to create folder' });
        }
      } catch (error: any) {
        logger.error('Error creating folder:', error);
        res.status(502).json({ error: 'Failed to create folder' });
      }
    },
  );

  router.post(
    '/server/:id/zip',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('files'),
    async (req: Request, res: Response) => {
      const serverId = req.params?.id;
      let relativePath = req.body?.relativePath || '/';
      const zipName = req.body?.zipname;

      if (typeof relativePath === 'string') {
        relativePath = normalizePath(relativePath);
        if (!isPathSafe(relativePath) && relativePath !== '/') {
          res.status(400).json({ error: 'Invalid path.' });
          return;
        }
      }

      try {
        if (!serverId) {
          res.status(400).json({ error: 'Server ID is required.' });
          return;
        }

        const context = await loadAuthenticatedServerContext(req);
        if (sendMissingServerContext(res, context)) {
          return;
        }
        const { server } = context;

        if (typeof relativePath !== 'string') {
          relativePath = JSON.stringify(relativePath);
        }

        const response = await daemonRequest<{ message?: string }>({
          method: 'POST',
          path: '/fs/zip',
          nodeAddress: server.node.address,
          nodePort: server.node.port,
          nodeKey: server.node.key,
          body: {
            id: serverId,
            path: relativePath,
            zipname: zipName,
          },
        });

        if (response.status === 200) {
          res.json({ success: true });
        } else {
          res.status(response.status).json({ error: response.data?.message || 'Failed to zip files' });
        }
      } catch (error: any) {
        logger.error('Error zipping files:', error);
        res
          .status(500)
          .json({ error: 'Failed to zip files: ' + (error?.message || 'An unexpected error occurred.') });
      }
    },
  );

  router.post(
    '/server/:id/unzip',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('files'),
    async (req: Request, res: Response) => {
      const serverId = req.params?.id;
      let relativePath = req.body?.relativePath || '/';
      const zipName = req.body?.zipname;

      if (typeof relativePath === 'string') {
        relativePath = normalizePath(relativePath);
        if (!isPathSafe(relativePath) && relativePath !== '/') {
          res.status(400).json({ error: 'Invalid path.' });
          return;
        }
      }

      try {
        if (!serverId) {
          res.status(400).json({ error: 'Server ID is required.' });
          return;
        }

        const context = await loadAuthenticatedServerContext(req);
        if (sendMissingServerContext(res, context)) {
          return;
        }
        const { server } = context;

        const cleanPath = relativePath
          .replace(/\/+/g, '/')
          .replace(/^\/|\/$/g, '');
        const cleanZipName = zipName.replace(/^\/+/, '').replace(/\/+$/, '');

        try {
          const response = await daemonRequest<{ message?: string }>({
            method: 'POST',
            path: '/fs/unzip',
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
              error: response.data?.message || 'Failed to unzip file',
              details: response.data,
            });
          }
        } catch (innerError: any) {
          logger.error('Error during unzip request:', {
            error: innerError,
            response: innerError?.body,
            status: innerError?.status,
          });
        }
      } catch (error: any) {
        logger.error('Error unzipping files:', error);
        res
          .status(500)
          .json({ error: 'Failed to unzip files: ' + (error?.message || 'An unexpected error occurred.') });
      }
    },
  );

  /**
   * Delete a file or directory
   * Used by both the files page and the worlds page
   */
  router.delete(
    '/server/:id/files/rm/{*path}',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('files'),
    async (req: Request, res: Response) => {
      const serverId = req.params?.id;
      const filePath = Array.isArray(req.params?.path) ? req.params.path.join('/') : getParamAsString(req.params?.path);

      if (!isPathSafe(filePath)) {
        res.status(400).json({ error: 'Invalid file path.' });
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
            method: 'DELETE',
            path: '/fs/rm',
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
            `Successfully deleted ${isMinecraftWorld ? 'world' : 'file/directory'}: ${filePath}`,
          );
          await logActivity(req, 'file:delete', { serverId: String(server.UUID), metadata: { path: filePath } });
          res.json({ success: true });
          return;
        } catch (deleteError: any) {
          const statusCode = deleteError?.status || 500;
          const errorMessage =
            deleteError?.body?.error || deleteError?.message || 'Failed to delete file';

          logger.error(
            `Error deleting ${filePath}: ${errorMessage}`,
            deleteError,
          );
          res.status(statusCode).json({ error: errorMessage });
          return;
        }
      } catch (error) {
        logger.error('Error in file deletion endpoint:', error);
        res.status(500).json({ error: 'Failed to delete file' });
        return;
      }
    },
  );

  router.post(
    '/server/:id/rename',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('files'),
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const relativePath = req.body.path;
      const newName = req.body.newName;

      const isSafe = (p: string) =>
        typeof p === 'string' && !p.includes('..') && !p.startsWith('/');
      if (!isSafe(relativePath) || !isSafe(newName)) {
        res.status(400).json({ error: 'Invalid path' });
        return;
      }
      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { UUID: getParamAsString(serverId) },
          include: { node: true, image: true },
        });

        if (!server) {
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        try {
          const newPath = newName;

          await daemonRequest({
            method: 'POST',
            path: '/fs/rename',
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            nodeKey: server.node.key,
            body: {
              id: server.UUID,
              path: relativePath,
              newName: newName,
              newPath: newPath,
            },
          });
          await logActivity(req, 'file:rename', { serverId: String(server.UUID), metadata: { path: relativePath, newName } });
          res.status(200).json({ success: true });
        } catch (error) {
          logger.error('Error renaming file:', error);
          res.status(500).json({ error: 'Failed to rename file' });
        }
      } catch (error) {
        logger.error('Error renaming file:', error);
        res.status(500).json({ error: 'Failed to rename file' });
      }
    },
  );

  router.post(
    '/server/:id/upload',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('files'),
    async (req: Request, res: Response, next) => {
      const settings = await prisma.settings.findUnique({ where: { id: 1 } });
      const limitMb = settings?.uploadLimit ?? 100;
      const upload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: limitMb * 1024 * 1024 },
      });
      upload.single('file')(req, res, next);
    },
    async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const relativePath = req.body.path || '/';
      const fileName =
        req.body.fileName || (req.file ? req.file.originalname : '');

      logger.info(
        `Upload request received for file ${fileName} to path ${relativePath} for server ${serverId}`,
      );

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          logger.warn(`User not found: ${userId}`);
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { UUID: getParamAsString(serverId) },
          include: { node: true, image: true },
        });

        if (!server) {
          logger.warn(`Server not found: ${serverId}`);
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        if (!fileName) {
          logger.warn('File name is required');
          res.status(400).json({ error: 'File name is required' });
          return;
        }

        if (!req.file) {
          logger.warn('File content is required');
          res.status(400).json({ error: 'File content is required' });
          return;
        }

        try {
          logger.info(
            `Sending upload request to node at ${server.node.address}:${server.node.port}`,
          );
          logger.info(`File size: ${req.file.size} bytes`);

          if (req.file.size < 10 * 1024 * 1024) {
            const fileContent = req.file.buffer.toString('base64');
            const fileContentWithMeta = `data:${req.file.mimetype};base64,${fileContent}`;

            const uploadResponse = await daemonRequest<{ fileName?: string; path?: string }>({
              method: 'POST',
              path: '/fs/upload',
              nodeAddress: server.node.address,
              nodePort: server.node.port,
              nodeKey: server.node.key,
              body: {
                id: server.UUID,
                path: relativePath,
                fileName: fileName,
                fileContent: fileContentWithMeta,
              },
              timeout: 60000,
            });
            logger.info(
              `File ${fileName} successfully uploaded to ${relativePath}`,
            );
            res.status(200).json({
              success: true,
              fileName: uploadResponse.data?.fileName,
              path: uploadResponse.data?.path,
            });
          } else {
            await daemonRequest({
              method: 'POST',
              path: '/fs/create-empty-file',
              nodeAddress: server.node.address,
              nodePort: server.node.port,
              nodeKey: server.node.key,
              body: {
                id: server.UUID,
                path: relativePath,
                fileName: fileName,
              },
              timeout: 10000,
            });
            logger.info(`Created empty file ${fileName} in ${relativePath}`);

            const CHUNK_SIZE = 5 * 1024 * 1024;
            const totalChunks = Math.ceil(req.file.size / CHUNK_SIZE);

            for (let i = 0; i < totalChunks; i++) {
              const start = i * CHUNK_SIZE;
              const end = Math.min(start + CHUNK_SIZE, req.file.size);
              const chunk = req.file.buffer.slice(start, end);
              const chunkContent = chunk.toString('base64');
              const chunkContentWithMeta = `data:${req.file.mimetype};base64,${chunkContent}`;

              await daemonRequest({
                method: 'POST',
                path: '/fs/append-file',
                nodeAddress: server.node.address,
                nodePort: server.node.port,
                nodeKey: server.node.key,
                body: {
                  id: server.UUID,
                  path: relativePath,
                  fileName: fileName,
                  fileContent: chunkContentWithMeta,
                  chunkIndex: i,
                  totalChunks: totalChunks,
                },
                timeout: 30000,
              });
              logger.info(
                `Uploaded chunk ${i + 1}/${totalChunks} for file ${fileName}`,
              );
            }

            logger.info(
              `File ${fileName} successfully uploaded to ${relativePath} in ${totalChunks} chunks`,
            );
            res.status(200).json({
              success: true,
              fileName: fileName,
              path: relativePath,
            });
          }
        } catch (error: any) {
          if (error?.status && error?.body) {
            logger.error(
              `Error uploading file - Status: ${error.status}, Data:`,
              error.body,
            );
            res.status(error.status).json({
              error: error.body?.error || 'Failed to upload file',
              details: error.body,
            });
          } else if (error?.message) {
            logger.error(
              'Error uploading file - No response received:',
              error.message,
            );
            res.status(500).json({
              error:
                'Connection error during file upload. Please try again with a smaller file.',
            });
          } else {
            logger.error(
              'Error uploading file - Request setup error:',
              error?.message || error,
            );
            res
              .status(500)
              .json({ error: 'Error setting up upload request' });
          }
        }
        } catch (error) {
        logger.error('Error uploading file:', error);
        res.status(500).json({ error: 'Failed to upload file' });
      }
    },
  );

  router.post(
    '/server/:id/files/pull',
    isAuthenticatedForServer('id'),
    requireSubUserPermission('files'),
    async (req: Request, res: Response) => {
      const serverId = req.params?.id;
      const { url, path } = req.body as { url?: string; path?: string };

      if (!url || typeof url !== 'string') {
        res.status(400).json({ error: 'URL is required' });
        return;
      }
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        res.status(400).json({ error: 'Invalid URL' });
        return;
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        res.status(400).json({ error: 'Only http(s) URLs are allowed' });
        return;
      }

      try {
        const user = await prisma.users.findUnique({ where: { id: req.session?.user?.id } });
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { UUID: getParamAsString(serverId) },
          include: { node: true },
        });
        if (!server) {
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        const pullResponse = await daemonRequest<{ success: boolean; file?: string; path?: string; error?: string }>({
          method: 'POST',
          path: '/fs/pull',
          nodeAddress: server.node.address,
          nodePort: server.node.port,
          nodeKey: server.node.key,
          body: {
            id: server.UUID,
            url,
            path: typeof path === 'string' ? path : '/',
          },
          timeout: 120000,
        });

        if (pullResponse.status !== 200 || !pullResponse.data?.success) {
          res.status(pullResponse.status === 200 ? 400 : pullResponse.status).json({
            error: pullResponse.data?.error || 'Failed to pull file from URL',
          });
          return;
        }

        await logActivity(req, 'file:pull', {
          serverId: String(server.UUID),
          metadata: { url, path: pullResponse.data.path ?? '/' },
        });
        res.json({
          success: true,
          message: 'File pulled successfully',
          file: pullResponse.data.file,
          path: pullResponse.data.path,
        });
      } catch (error: any) {
        logger.error('Error pulling file from URL:', error);
        res.status(500).json({
          error: error?.body?.error || error?.message || 'Failed to pull file from URL',
        });
      }
    },
  );
}
