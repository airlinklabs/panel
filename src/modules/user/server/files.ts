import { Router, Request, Response } from 'express';
import { isAuthenticatedForServer } from '../../../handlers/utils/auth/serverAuthUtil';
import logger from '../../../handlers/logger';
import axios from 'axios';
import multer from 'multer';
import { isWorld } from '../../../handlers/features';
import { checkForServerInstallation } from '../../../handlers/checkForServerInstallation';
import { getServerStatus } from '../../../handlers/utils/server/serverStatus';
import { getParamAsString } from '../../../utils/typeHelpers';
import prisma from '../../../db';
import { daemonSchemeSync } from '../../../handlers/utils/core/daemonRequest';
import {
  type ErrorMessage,
  type ServerPageServer,
  loadServerPageContext,
  loadAuthenticatedServerContext,
  sendMissingServerContext,
  getServerDaemonAddress,
  getServerDaemonAuth,
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
            user,
            req,
            settings,
          });
          return;
        }

        const filesRequest = {
          method: 'GET',
          url: `${daemonSchemeSync()}://${server.node.address}:${server.node.port}/fs/list?id=${server.UUID}&path=${path}`,
          auth: {
            username: 'Airlink',
            password: server.node.key,
          },
          headers: {
            'Content-Type': 'application/json',
          },
        };

        let files = (await axios(filesRequest)).data as any[];
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
      } catch (error) {
        if (axios.isAxiosError(error)) {
          if (
            error.code !== 'ECONNREFUSED' &&
            error.code !== 'ETIMEDOUT' &&
            error.code !== 'ENOTFOUND' &&
            error.code !== 'ERR_BAD_RESPONSE'
          ) {
            logger.error('Error fetching files:', error);
          }
        } else {
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
    async (req: Request, res: Response) => {
      const filePath = Array.isArray(req.params?.path) ? req.params.path.join('/') : getParamAsString(req.params?.path);

      try {
        const context = await loadAuthenticatedServerContext(req);
        if (sendMissingServerContext(res, context)) {
          return;
        }
        const { server } = context;

        const response = await axios({
          method: 'GET',
          url: getServerDaemonAddress(server, '/fs/download'),
          params: { id: server.UUID, path: filePath },
          auth: getServerDaemonAuth(server),
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
    '/server/:id/zip',
    isAuthenticatedForServer('id'),
    async (req: Request, res: Response) => {
      const serverId = req.params?.id;
      let relativePath = req.body?.relativePath || '/';
      const zipName = req.body?.zipname;

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

        const response: any = await axios({
          method: 'POST',
          url: getServerDaemonAddress(server, '/fs/zip'),
          auth: getServerDaemonAuth(server),
          data: {
            id: serverId,
            path: relativePath,
            zipname: zipName,
          },
        });

        if (response.status === 200) {
          res.json({ success: true });
        } else {
          res.status(response.status).json({ error: response.statusText });
        }
      } catch (error) {
        logger.error('Error zipping files:', error);
        if (axios.isAxiosError(error)) {
          res
            .status(500)
            .json({ error: 'Failed to zip files: ' + error.message });
        } else {
          res.status(500).json({ error: 'An unexpected error occurred.' });
        }
      }
    },
  );

  router.post(
    '/server/:id/unzip',
    isAuthenticatedForServer('id'),
    async (req: Request, res: Response) => {
      const serverId = req.params?.id;
      const relativePath = req.body?.relativePath || '/';
      const zipName = req.body?.zipname;

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
        const cleanZipName = zipName.replace(/^\/+|\/+$/g, '');

        const requestConfig = {
          method: 'POST',
          url: getServerDaemonAddress(server, '/fs/unzip'),
          auth: getServerDaemonAuth(server),
          data: {
            id: serverId,
            path: cleanPath,
            zipname: cleanZipName,
          },
        };

        try {
          const response = await axios(requestConfig);

          if (response.status === 200) {
            res.json({ success: true });
          } else {
            res.status(response.status).json({
              error: response.data?.message || 'Failed to unzip file',
              details: response.data,
            });
          }
        } catch (axiosError) {
          if (axios.isAxiosError(axiosError)) {
            logger.error('Axios error:', {
              error: axiosError,
              response: axiosError.response?.data,
              status: axiosError.response?.status,
            });
          } else {
            logger.error('Unexpected error:', {
              error: axiosError,
            });
          }
        }
      } catch (error) {
        logger.error('Error unzipping files:', error);
        if (axios.isAxiosError(error)) {
          res
            .status(500)
            .json({ error: 'Failed to unzip files: ' + error.message });
        } else {
          res.status(500).json({ error: 'An unexpected error occurred.' });
        }
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
    async (req: Request, res: Response) => {
      const serverId = req.params?.id;
      const filePath = Array.isArray(req.params?.path) ? req.params.path.join('/') : getParamAsString(req.params?.path);

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
          await axios({
            method: 'DELETE',
            url: getServerDaemonAddress(server, '/fs/rm'),
            data: {
              id: server.UUID,
              path: filePath,
            },
            auth: getServerDaemonAuth(server),
            timeout: 10000,
          });

          logger.success(
            `Successfully deleted ${isMinecraftWorld ? 'world' : 'file/directory'}: ${filePath}`,
          );
          res.json({ success: true });
          return;
        } catch (axiosError) {
          if (axios.isAxiosError(axiosError)) {
            const statusCode = axiosError.response?.status || 500;
            const errorMessage =
              axiosError.response?.data?.error || 'Failed to delete file';

            logger.error(
              `Error deleting ${filePath}: ${errorMessage}`,
              axiosError,
            );
            res.status(statusCode).json({ error: errorMessage });
          } else {
            logger.error(
              `Unexpected error deleting ${filePath}:`,
              axiosError,
            );
            res.status(500).json({ error: 'An unexpected error occurred' });
          }
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

          const renameRequest = {
            method: 'POST',
            url: `${daemonSchemeSync()}://${server.node.address}:${server.node.port}/fs/rename`,
            auth: {
              username: 'Airlink',
              password: server.node.key,
            },
            headers: {
              'Content-Type': 'application/json',
            },
            data: {
              id: server.UUID,
              path: relativePath,
              newName: newName,
              newPath: newPath,
            },
          };

          await axios(renameRequest);
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

            const uploadRequest = {
              method: 'POST',
              url: `${daemonSchemeSync()}://${server.node.address}:${server.node.port}/fs/upload`,
              auth: {
                username: 'Airlink',
                password: server.node.key,
              },
              headers: {
                'Content-Type': 'application/json',
              },
              data: {
                id: server.UUID,
                path: relativePath,
                fileName: fileName,
                fileContent: fileContentWithMeta,
              },
              maxContentLength: 15 * 1024 * 1024,
              maxBodyLength: 15 * 1024 * 1024,
              timeout: 60000,
            };

            const response = await axios(uploadRequest);
            logger.info(
              `File ${fileName} successfully uploaded to ${relativePath}`,
            );
            res.status(200).json({
              success: true,
              fileName: response.data.fileName,
              path: response.data.path,
            });
          } else {
            const createEmptyFileRequest = {
              method: 'POST',
              url: `${daemonSchemeSync()}://${server.node.address}:${server.node.port}/fs/create-empty-file`,
              auth: {
                username: 'Airlink',
                password: server.node.key,
              },
              data: {
                id: server.UUID,
                path: relativePath,
                fileName: fileName,
              },
              timeout: 10000,
            };

            await axios(createEmptyFileRequest);
            logger.info(`Created empty file ${fileName} in ${relativePath}`);

            const CHUNK_SIZE = 5 * 1024 * 1024;
            const totalChunks = Math.ceil(req.file.size / CHUNK_SIZE);

            for (let i = 0; i < totalChunks; i++) {
              const start = i * CHUNK_SIZE;
              const end = Math.min(start + CHUNK_SIZE, req.file.size);
              const chunk = req.file.buffer.slice(start, end);
              const chunkContent = chunk.toString('base64');
              const chunkContentWithMeta = `data:${req.file.mimetype};base64,${chunkContent}`;

              const uploadChunkRequest = {
                method: 'POST',
                url: `${daemonSchemeSync()}://${server.node.address}:${server.node.port}/fs/append-file`,
                auth: {
                  username: 'Airlink',
                  password: server.node.key,
                },
                data: {
                  id: server.UUID,
                  path: relativePath,
                  fileName: fileName,
                  fileContent: chunkContentWithMeta,
                  chunkIndex: i,
                  totalChunks: totalChunks,
                },
                timeout: 30000,
              };

              await axios(uploadChunkRequest);
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
        } catch (error) {
          if (axios.isAxiosError(error)) {
            if (error.response) {
              logger.error(
                `Error uploading file - Status: ${error.response.status}, Data:`,
                error.response.data,
              );
              res.status(error.response.status).json({
                error: error.response.data.error || 'Failed to upload file',
                details: error.response.data,
              });
            } else if (error.request) {
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
                error.message,
              );
              res
                .status(500)
                .json({ error: 'Error setting up upload request' });
            }
          } else {
            logger.error('Error uploading file:', error);
            res.status(500).json({ error: 'Failed to upload file' });
          }
        }
      } catch (error) {
        logger.error('Error uploading file:', error);
        res.status(500).json({ error: 'Failed to upload file' });
      }
    },
  );
}
