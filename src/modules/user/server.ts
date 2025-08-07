import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticatedForServer } from '../../handlers/utils/auth/serverAuthUtil';
import logger from '../../handlers/logger';
import axios from 'axios';
import { checkEulaStatus, isWorld } from '../../handlers/features';
import { checkForServerInstallation } from '../../handlers/checkForServerInstallation';
import { queueer } from '../../handlers/queueer';
import { getServerStatus } from '../../handlers/utils/server/serverStatus';

// Declare global serverStoppingStates
declare global {
  var serverStoppingStates: {
    [key: string]: boolean;
  };
}

const prisma = new PrismaClient();

interface ErrorMessage {
  message?: string;
}

interface ServerImageInfo {
  features: string[];
  stop: string;
}

interface Port {
  primary: boolean;
  Port: number;
}

interface ServerVariable {
  name: string;
  env: string;
  type: 'boolean' | 'text' | 'number';
  default: string | number | boolean;
  value: string | number | boolean;
}

const dashboardModule: Module = {
  info: {
    name: 'Server Module',
    description: 'This file is for dashboard functionality.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    // Get server info
    router.get(
      '/server/:id',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const errorMessage: ErrorMessage = {};
        const userId = req.session?.user?.id;
        const serverId = req.params?.id;

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            errorMessage.message = 'User not found.';
            return res.render('user/account', { errorMessage, user, req });
          }

          const server = await prisma.server.findUnique({
            where: { UUID: String(serverId) },
            include: { node: true, image: true, owner: true },
          });
          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });
          if (!server) {
            errorMessage.message = 'Server not found.';
            return res.render('user/server/manage', {
              errorMessage,
              features: [],
              user,
              req,
              settings,
            });
          }

          let features: string[] = [];

          if (server.image && typeof server.image.info === 'string') {
            try {
              const parsedInfo = JSON.parse(
                server.image.info,
              ) as ServerImageInfo;
              if (Array.isArray(parsedInfo.features)) {
                features = parsedInfo.features;
              }
            } catch (error) {
              console.error('Failed to parse server.image.info:', error);
            }
          } else if (
            server.image &&
            typeof server.image.info === 'object' &&
            server.image.info !== null
          ) {
            const info = server.image.info as ServerImageInfo;
            if (Array.isArray(info.features)) {
              features = info.features;
            }
          }

          if (features.includes('eula')) {
            const eulaStatus = await checkEulaStatus(server.UUID);
            if (eulaStatus.accepted) {
              features = features.filter((feature) => feature !== 'eula');
            }
          }


          let alshID = '';
          let alshPASSWORD = '';

          if (features.includes('alsh')) {
            try {
              const idresponse = await axios({
                method: 'GET',
                url: `http://${server.node.address}:${server.node.port}/fs/file/content`,
                responseType: 'text',
                params: { id: server.UUID, path: './airlink/alshid.txt' },
                auth: {
                  username: 'Airlink',
                  password: server.node.key,
                },
              });

              const passresponse = await axios({
                method: 'GET',
                url: `http://${server.node.address}:${server.node.port}/fs/file/content`,
                responseType: 'text',
                params: { id: server.UUID, path: './airlink/password.txt' },
                auth: {
                  username: 'Airlink',
                  password: server.node.key,
                },
              });

              alshID = idresponse.data;
              alshPASSWORD = passresponse.data;
            } catch (error: any) {
              console.error('Error:', error.message);
            }
          }

          // Get server status including uptime
          const serverInfos = {
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            serverUUID: server.UUID,
            nodeKey: server.node.key,
          };
          const serverStatus = await getServerStatus(serverInfos);

          return res.render('user/server/manage', {
            errorMessage,
            features: features || [],
            installed: await checkForServerInstallation(serverId),
            user,
            alshID,
            alshPASSWORD,
            req,
            server,
            serverStatus,
            settings,
          });
        } catch (error) {
          logger.error('Error fetching user:', error);
          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });
          errorMessage.message = 'Error fetching user data.';
          return res.render('user/server/manage', {
            errorMessage,
            features: [],
            user: req.session?.user,
            req,
            settings,
          });
        }
      },
    );


    // Get server status
    router.get(
      '/server/:id/status',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response): Promise<void> => {
        const serverId = req.params?.id;

        try {
          const server = await prisma.server.findUnique({
            where: { UUID: String(serverId) },
            include: { node: true },
          });

          if (!server) {
            res.status(404).json({ status: 'error', message: 'Server not found' });
            return;
          }

          // Get server status including uptime
          const serverInfos = {
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            serverUUID: server.UUID,
            nodeKey: server.node.key,
          };

          const serverStatus = await getServerStatus(serverInfos);
          res.status(200).json(serverStatus);
          return;
        } catch (error) {
          logger.error('Error fetching server status:', error);
          res.status(500).json({ status: 'error', message: 'Failed to fetch server status' });
          return;
        }
      }
    );

    router.post(
      '/server/:id/power/:poweraction',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response): Promise<void> => {
        const errorMessage: ErrorMessage = {};
        const userId = req.session?.user?.id;
        const serverId = req.params?.id;
        const powerAction = req.params?.poweraction;

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            errorMessage.message = 'User not found.';
            return res.render('user/account', { errorMessage, user, req });
          }

          const server = await prisma.server.findUnique({
            where: { UUID: String(serverId) },
            include: { node: true, image: true, owner: true },
          });

          if (!server) {
            errorMessage.message = 'Server not found.';
            return res.render('user/server/manage', {
              errorMessage,
              user,
              req,
            });
          }

          // Check if server is suspended and trying to start
          if (server.Suspended && powerAction === 'start') {
            logger.warn(`Attempt to start suspended server ${serverId} by user ${userId}`);
            res.status(403).json({
              error: 'This server is suspended. Please contact an administrator for assistance.'
            });
            return;
          }

          if (powerAction === 'stop') {
            // First, update the server status to indicate it's stopping
            try {
              // Get current server status
              const serverInfos = {
                nodeAddress: server.node.address,
                nodePort: server.node.port,
                serverUUID: server.UUID,
                nodeKey: server.node.key,
              };

              // Create a custom status object with stopping=true
              const stoppingStatus = {
                online: true,
                starting: false,
                stopping: true,
                uptime: null,
                startedAt: null
              };

              // Create a cache key for this server's stopping state
              const cacheKey = `server_stopping_${serverId}`;

              // Store the stopping state in a global variable or cache
              // This will be used by the getServerStatus function
              global.serverStoppingStates = global.serverStoppingStates || {};
              global.serverStoppingStates[cacheKey] = true;

              // Set a timeout to clear the stopping state after 2 minutes
              setTimeout(() => {
                if (global.serverStoppingStates && global.serverStoppingStates[cacheKey]) {
                  delete global.serverStoppingStates[cacheKey];
                  logger.info(`Cleared stopping state for server ${serverId} after timeout`);
                }
              }, 120000); // 2 minutes

              // Return the stopping status to the client
              res.status(200).json({
                success: true,
                message: 'Server is stopping...',
                status: stoppingStatus
              });

              // Now actually stop the container
              const requestData = {
                method: 'POST',
                url: `http://${server.node.address}:${server.node.port}/container/stop`,
                auth: {
                  username: 'Airlink',
                  password: server.node.key,
                },
                headers: {
                  'Content-Type': 'application/json',
                },
                data: {
                  id: String(serverId),
                  stopCmd: 'stop',
                },
              };

              await axios(requestData);
              logger.info('Container stopped successfully: ' + serverId);
              return;
            } catch (stopError) {
              if (axios.isAxiosError(stopError) && stopError.response?.status === 404) {
                logger.info('Container already stopped or not found: ' + serverId);

                // Clear the stopping state if the container is already stopped
                const cacheKey = `server_stopping_${serverId}`;
                if (global.serverStoppingStates && global.serverStoppingStates[cacheKey]) {
                  delete global.serverStoppingStates[cacheKey];
                }
              } else {
                logger.debug('Error stopping container:', stopError);
              }
              return;
            }
          }

          if (powerAction !== 'start') {
            logger.error('Invalid power action:', powerAction);
            res.status(400).json({ error: `Invalid power action: ${powerAction}` });
            return;
          }

          const ports = (JSON.parse(server.Ports) as Port[])
            .filter((port) => port.primary)
            .map((port) => port.Port)
            .pop();

          const envVariables: Record<string, string | number | boolean> = {};
          if (server.Variables) {
            try {
              const serverVariables = JSON.parse(
                server.Variables,
              ) as ServerVariable[];
              serverVariables.forEach((variable) => {
                if (
                  variable.env &&
                  variable.value !== undefined &&
                  variable.type
                ) {
                  let processedValue: string | number | boolean;
                  switch (variable.type) {
                  case 'boolean':
                    processedValue =
                        variable.value === 1 || variable.value === '1'
                          ? 'true'
                          : 'false';
                    break;
                  case 'number':
                    processedValue = Number(variable.value);
                    break;
                  case 'text':
                    processedValue = String(variable.value);
                    break;
                  default:
                    processedValue = variable.value;
                  }
                  envVariables[variable.env] = processedValue;
                }
              });
            } catch (error) {
              logger.error('Error processing server.Variables:', error);
              throw new Error('Invalid format in server.Variables');
            }
          }

          if (!server.dockerImage) {
            res.status(400).json({ error: 'Docker image not found.' });
            return;
          }

          const ServerImage = Object.values(JSON.parse(server.dockerImage))[0];

          const startRequestData = {
            method: 'POST',
            url: `http://${server.node.address}:${server.node.port}/container/start`,
            auth: {
              username: 'Airlink',
              password: server.node.key,
            },
            headers: {
              'Content-Type': 'application/json',
            },
            data: {
              id: String(serverId),
              image: String(ServerImage),
              ports: ports,
              Memory: server.Memory * 1024,
              Cpu: server.Cpu,
              env: envVariables,
              StartCommand: server.StartCommand,
            },
          };

          await axios(startRequestData);
          logger.info('Container started successfully: ' + serverId);

          res.status(200).json({ message: 'Container started successfully.' });
          return;
        } catch (error) {
          logger.debug('Error processing power action:', error);
          res.status(500).json({ error: 'Failed to process power action.' });
        }
      },
    );

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
          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
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
            url: `http://${server.node.address}:${server.node.port}/fs/list?id=${server.UUID}&path=${path}`,
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

          // Filter out the airlink folder
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

          let features: string[] = [];

          if (server.image && typeof server.image.info === 'string') {
            try {
              const parsedInfo = JSON.parse(
                server.image.info,
              ) as ServerImageInfo;
              if (Array.isArray(parsedInfo.features)) {
                features = parsedInfo.features;
              }
            } catch (error) {
              console.error('Failed to parse server.image.info:', error);
            }
          } else if (
            server.image &&
            typeof server.image.info === 'object' &&
            server.image.info !== null
          ) {
            const info = server.image.info as ServerImageInfo;
            if (Array.isArray(info.features)) {
              features = info.features;
            }
          }

          // Get server status including uptime
          const serverInfos = {
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            serverUUID: server.UUID,
            nodeKey: server.node.key,
          };
          const serverStatus = await getServerStatus(serverInfos);

          res.render('user/server/files', {
            errorMessage,
            user,
            features,
            installed: await checkForServerInstallation(serverId),
            files,
            currentPath: path,
            req,
            server,
            serverStatus,
            settings,
          });
        } catch (error) {
          // Only log error if it's not a connection error (daemon offline)
          if (axios.isAxiosError(error)) {
            if (error.code !== 'ECONNREFUSED' && error.code !== 'ETIMEDOUT' && error.code !== 'ENOTFOUND') {
              logger.error('Error fetching files:', error);
            }
          } else {
            logger.error('Error fetching files:', error);
          }

          // Still need to get server data for the template
          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
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

          // Extract features from server image
          let features: string[] = [];
          if (server.image && typeof server.image.info === 'string') {
            try {
              const parsedInfo = JSON.parse(server.image.info) as ServerImageInfo;
              if (Array.isArray(parsedInfo.features)) {
                features = parsedInfo.features;
              }
            } catch (error) {
              console.error('Failed to parse server.image.info:', error);
            }
          } else if (
            server.image &&
            typeof server.image.info === 'object' &&
            server.image.info !== null
          ) {
            const info = server.image.info as ServerImageInfo;
            if (Array.isArray(info.features)) {
              features = info.features;
            }
          }

          // Get server status to determine if daemon is offline
          const serverInfos = {
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            serverUUID: server.UUID,
            nodeKey: server.node.key,
          };
          const serverStatus = await getServerStatus(serverInfos);

          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          // Set appropriate error message based on daemon status
          if (serverStatus.daemonOffline) {
            errorMessage.message = 'Unable to access files. The daemon appears to be offline.';
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
            installed: false,
          });
        }
      },
    );

    /*
     * File system : Get file content
     */
    router.get(
      '/server/:id/files/edit/:path(*)',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const serverId = req.params?.id;
        const filePath = req.params?.path;

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true, image: true },
          });

          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const response = await axios({
            method: 'GET',
            url: `http://${server.node.address}:${server.node.port}/fs/file/content`,
            responseType: 'text',
            params: { id: server.UUID, path: filePath },
            auth: {
              username: 'Airlink',
              password: server.node.key,
            },
          });

          const extension = filePath.split('.').pop()?.toLowerCase() || '';
          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          let features: string[] = [];

          if (server.image && typeof server.image.info === 'string') {
            try {
              const parsedInfo = JSON.parse(
                server.image.info,
              ) as ServerImageInfo;
              if (Array.isArray(parsedInfo.features)) {
                features = parsedInfo.features;
              }
            } catch (error) {
              console.error('Failed to parse server.image.info:', error);
            }
          } else if (
            server.image &&
            typeof server.image.info === 'object' &&
            server.image.info !== null
          ) {
            const info = server.image.info as ServerImageInfo;
            if (Array.isArray(info.features)) {
              features = info.features;
            }
          }

          // Get server status including uptime
          const serverInfos = {
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            serverUUID: server.UUID,
            nodeKey: server.node.key,
          };
          const serverStatus = await getServerStatus(serverInfos);

          res.render('user/server/file', {
            errorMessage: {},
            user,
            features,
            installed: await checkForServerInstallation(serverId),
            file: {
              name: filePath.split('/').pop(),
              path: filePath,
              content: response.data,
              extension,
            },
            server,
            serverStatus,
            req,
            settings,
          });
        } catch (error) {
          logger.error('Error fetching file:', error);

          // Still need to get server data for the template
          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
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

          // Extract features from server image
          let features: string[] = [];
          if (server.image && typeof server.image.info === 'string') {
            try {
              const parsedInfo = JSON.parse(server.image.info) as ServerImageInfo;
              if (Array.isArray(parsedInfo.features)) {
                features = parsedInfo.features;
              }
            } catch (error) {
              console.error('Failed to parse server.image.info:', error);
            }
          } else if (
            server.image &&
            typeof server.image.info === 'object' &&
            server.image.info !== null
          ) {
            const info = server.image.info as ServerImageInfo;
            if (Array.isArray(info.features)) {
              features = info.features;
            }
          }

          // Get server status to determine if daemon is offline
          const serverInfos = {
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            serverUUID: server.UUID,
            nodeKey: server.node.key,
          };
          const serverStatus = await getServerStatus(serverInfos);

          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          // Set appropriate error message based on daemon status
          let errorMessage = 'Error fetching file data.';
          if (serverStatus.daemonOffline) {
            errorMessage = 'Unable to access file. The daemon appears to be offline.';
          }

          res.render('user/server/file', {
            errorMessage: { message: errorMessage },
            user: req.session?.user,
            features,
            installed: false,
            file: {
              name: filePath.split('/').pop() || 'Unknown',
              path: filePath,
              content: '// Unable to load file content\n// The daemon appears to be offline',
              extension: filePath.split('.').pop() || 'txt',
            },
            server,
            serverStatus,
            req,
            settings,
          });
        }
      },
    );

    /*
     * File system : Save
     */
    router.post(
      '/server/:id/files/:path(*)',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const serverId = req.params?.id;
        let filePath = req.params?.path;
        if (filePath.endsWith('/save')) {
          filePath = filePath.slice(0, -5);
        }
        const { content } = req.body;

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true },
          });

          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          await axios({
            method: 'POST',
            url: `http://${server.node.address}:${server.node.port}/fs/file/content`,
            data: {
              id: server.UUID,
              path: filePath,
              content: content,
            },
            auth: {
              username: 'Airlink',
              password: server.node.key,
            },
          });

          res.json({ success: true });
          return;
        } catch (error) {
          logger.error('Error saving file:', error);
          res.status(500).json({ error: 'Failed to save file' });
          return;
        }
      },
    );

    /**
     * Delete a file or directory
     * Used by both the files page and the worlds page
     */
    router.delete(
      '/server/:id/files/rm/:path(*)',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const serverId = req.params?.id;
        const filePath = req.params?.path;

        logger.info(`Deleting file/directory: ${filePath} from server ${serverId}`);

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            logger.warn(`User not found: ${userId}`);
            res.status(404).json({ error: 'User not found' });
            return;
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true },
          });

          if (!server) {
            logger.warn(`Server not found: ${serverId}`);
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          // Check if the server is a Minecraft world
          const isMinecraftWorld = await isWorld(filePath, {
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            serverUUID: server.UUID,
            nodeKey: server.node.key,
          });

          if (isMinecraftWorld) {
            logger.info(`Deleting Minecraft world: ${filePath}`);
          }

          try {
            await axios({
              method: 'DELETE',
              url: `http://${server.node.address}:${server.node.port}/fs/rm`,
              data: {
                id: server.UUID,
                path: filePath,
              },
              auth: {
                username: 'Airlink',
                password: server.node.key,
              },
              timeout: 10000, // 10 second timeout for large directories
            });

            logger.success(`Successfully deleted ${isMinecraftWorld ? 'world' : 'file/directory'}: ${filePath}`);
            res.json({ success: true });
            return;
          } catch (axiosError) {
            if (axios.isAxiosError(axiosError)) {
              const statusCode = axiosError.response?.status || 500;
              const errorMessage = axiosError.response?.data?.error || 'Failed to delete file';

              logger.error(`Error deleting ${filePath}: ${errorMessage}`, axiosError);
              res.status(statusCode).json({ error: errorMessage });
            } else {
              logger.error(`Unexpected error deleting ${filePath}:`, axiosError);
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

    router.get(
      '/server/:id/files/download/:path(*)',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const serverId = req.params?.id;
        const filePath = req.params?.path;

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true },
          });

          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const response = await axios({
            method: 'GET',
            url: `http://${server.node.address}:${server.node.port}/fs/download`,
            params: { id: server.UUID, path: filePath },
            auth: {
              username: 'Airlink',
              password: server.node.key,
            },
            responseType: 'stream',
          });

          res.setHeader(
            'Content-Disposition',
            `attachment; filename="${filePath}"`,
          );
          res.setHeader('Content-Type', 'application/octet-stream');

          response.data.pipe(res); // Redirige le flux du fichier vers la réponse
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
        const userId = req.session?.user?.id;
        const serverId = req.params?.id;
        let relativePath = req.body?.relativePath || '/';
        const zipName = req.body?.zipname;

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
          }

          if (!serverId) {
            res.status(400).json({ error: 'Server ID is required.' });
            return;
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true },
          });

          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          if (typeof relativePath !== 'string') {
            relativePath = JSON.stringify(relativePath);
          }

          const response: any = await axios({
            method: 'POST',
            url: `http://${server.node.address}:${server.node.port}/fs/zip`,
            auth: {
              username: 'Airlink',
              password: server.node.key,
            },
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
        const userId = req.session?.user?.id;
        const serverId = req.params?.id;
        const relativePath = req.body?.relativePath || '/';
        const zipName = req.body?.zipname;

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
          }

          if (!serverId) {
            res.status(400).json({ error: 'Server ID is required.' });
            return;
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true },
          });

          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          console.log('Server found:', {
            nodeAddress: server.node.address,
            nodePort: server.node.port
          });

          const cleanPath = relativePath.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
          const cleanZipName = zipName.replace(/^\/+|\/+$/g, '');

          const requestConfig = {
            method: 'POST',
            url: `http://${server.node.address}:${server.node.port}/fs/unzip`,
            auth: {
              username: 'Airlink',
              password: server.node.key,
            },
            data: {
              id: serverId,
              path: cleanPath,
              zipname: cleanZipName
            },
          };

          try {
            const response = await axios(requestConfig);

            if (response.status === 200) {
              res.json({ success: true });
            } else {
              res.status(response.status).json({
                error: response.data?.message || 'Failed to unzip file',
                details: response.data
              });
            }
          } catch (axiosError) {
            if (axios.isAxiosError(axiosError)) {
              logger.error('Axios error:', {
                error: axiosError,
                response: axiosError.response?.data,
                status: axiosError.response?.status
              });
            } else {
              logger.error('Unexpected error:', {
                error: axiosError
              });
            }
          }
        }
        catch (error) {
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

    router.post(
      '/server/:id/feature/eula',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const serverId = req.params?.id;

        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { UUID: serverId },
          include: { node: true },
        });

        if (!server) {
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        try {
          await axios({
            method: 'POST',
            url: `http://${server.node.address}:${server.node.port}/fs/file/content`,
            data: {
              id: server.UUID,
              path: 'eula.txt',
              content: 'eula=true',
            },
            auth: {
              username: 'Airlink',
              password: server.node.key,
            },
          });

          res.status(200).json({ success: true });
          return;
        } catch (error) {
          logger.error('Error accepting EULA:', error);
          res.status(500).json({ error: 'Failed to accept EULA' });
          return;
        }
      },
    );

    router.get(
      '/server/:id/players',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const serverId = req.params?.id;

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true, image: true },
          });

          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const primaryPort = server.Ports
            ? JSON.parse(server.Ports)
              .filter((Port: any) => Port.primary)
              .map((Port: any) => Port.Port.split(':')[1])
              .pop()
            : '';

          let features: string[] = [];

          if (server.image && typeof server.image.info === 'string') {
            try {
              const parsedInfo = JSON.parse(
                server.image.info,
              ) as ServerImageInfo;
              if (Array.isArray(parsedInfo.features)) {
                features = parsedInfo.features;
              }
            } catch (error) {
              console.error('Failed to parse server.image.info:', error);
            }
          } else if (
            server.image &&
            typeof server.image.info === 'object' &&
            server.image.info !== null
          ) {
            const info = server.image.info as ServerImageInfo;
            if (Array.isArray(info.features)) {
              features = info.features;
            }
          }

          if (!primaryPort) {
            return res.render('user/server/players', {
              errorMessage: { message: 'No primary port found' },
              user,
              features,
              installed: await checkForServerInstallation(serverId),
              players: [],
              server,
              req,
              settings: await prisma.settings.findUnique({ where: { id: 1 } }),
            });
          }

          let players: Array<{ name: string; uuid: string }> = [];
          let serverInfo = {
            maxPlayers: 0,
            onlinePlayers: 0,
            version: 'Unknown'
          };
          let hadFetchError = false;
          let serverIsOnline = false;

          try {
            logger.info(`Fetching players for server ${serverId} on port ${primaryPort}`);

            const playersResponse = await axios({
              method: 'GET',
              url: `http://${server.node.address}:${server.node.port}/minecraft/players`,
              params: {
                id: server.UUID,
                host: server.node.address,
                port: parseInt(primaryPort, 10)
              },
              auth: {
                username: 'Airlink',
                password: server.node.key,
              },
              timeout: 8000
            });

            if (playersResponse.data) {
              serverIsOnline = typeof playersResponse.data.online === 'boolean'
                ? playersResponse.data.online
                : !!playersResponse.data.version;

              if (Array.isArray(playersResponse.data.players)) {
                players = playersResponse.data.players;
              }

              serverInfo = {
                maxPlayers: playersResponse.data.maxPlayers || 0,
                onlinePlayers: playersResponse.data.onlinePlayers || 0,
                version: playersResponse.data.version || 'Unknown'
              };

              logger.info(`Successfully fetched server data for ${serverId}`);
              logger.info(`Server version: ${serverInfo.version}, Players: ${players.length} (${serverInfo.onlinePlayers}/${serverInfo.maxPlayers})`);
              logger.info(`Server online status: ${serverIsOnline ? 'Online' : 'Offline'}`);
            } else {
              logger.warn(`No valid data returned for server ${serverId}`);
              hadFetchError = true;
            }
          } catch (error) {
            // Only log error if it's not a connection error (daemon offline)
            if (axios.isAxiosError(error)) {
              if (error.code !== 'ECONNREFUSED' && error.code !== 'ETIMEDOUT' && error.code !== 'ENOTFOUND') {
                logger.error(`Error fetching players from daemon for server ${serverId}:`, error);
              }
            } else {
              logger.error(`Error fetching players from daemon for server ${serverId}:`, error);
            }
            hadFetchError = true;
          }

          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });
          const hasError = hadFetchError && !serverIsOnline;

          // Get server status including uptime
          const serverInfos = {
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            serverUUID: server.UUID,
            nodeKey: server.node.key,
          };
          const serverStatus = await getServerStatus(serverInfos);

          return res.render('user/server/players', {
            errorMessage: hasError ?
              { message: 'Unable to fetch players. The server may be offline or not responding.' } :
              {},
            serverIsOnline,
            user,
            players,
            serverInfo,
            features,
            installed: await checkForServerInstallation(serverId),
            server,
            serverStatus,
            req,
            settings,
          });
        } catch (error) {
          logger.error('Error getting players:', error);
          res.status(500).json({ error: 'Failed to get players' });
        }
      },
    );

    router.get(
      '/server/:id/worlds',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const serverId = req.params?.id;

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true, image: true },
          });

          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          try {
            const worldsRequest = {
              method: 'GET',
              url: `http://${server.node.address}:${server.node.port}/fs/list?id=${server.UUID}`,
              auth: {
                username: 'Airlink',
                password: server.node.key,
              },
              headers: {
                'Content-Type': 'application/json',
              },
            };

            const serverInfos = {
              nodeAddress: server.node.address,
              nodePort: server.node.port,
              serverUUID: server.UUID,
              nodeKey: server.node.key,
            };
            // Use the imported axios instead of requiring it again
            const response = await axios(worldsRequest);
            const Folders = response.data;

            const worlds = [];
            for (const folder of Folders) {
              if (
                folder.type === 'directory' &&
                (await isWorld(folder.name, serverInfos))
              ) {
                worlds.push({ name: folder.name });
              }
            }

            const settings = await prisma.settings.findUnique({
              where: { id: 1 },
            });

            let features: string[] = [];

            if (server.image && typeof server.image.info === 'string') {
              try {
                const parsedInfo = JSON.parse(
                  server.image.info,
                ) as ServerImageInfo;
                if (Array.isArray(parsedInfo.features)) {
                  features = parsedInfo.features;
                }
              } catch (error) {
                logger.error('Failed to parse server.image.info:', error);
              }
            } else if (
              server.image &&
              typeof server.image.info === 'object' &&
              server.image.info !== null
            ) {
              const info = server.image.info as ServerImageInfo;
              if (Array.isArray(info.features)) {
                features = info.features;
              }
            }

            // Get server status including uptime
            const serverStatus = await getServerStatus(serverInfos);

            return res.render('user/server/worlds', {
              errorMessage: {},
              user,
              worlds,
              features,
              installed: await checkForServerInstallation(serverId),
              server,
              serverStatus,
              req,
              settings,
            });
          } catch (fileRequestError) {
            // Only log error if it's not a connection error (daemon offline)
            if (axios.isAxiosError(fileRequestError)) {
              if (fileRequestError.code !== 'ECONNREFUSED' && fileRequestError.code !== 'ETIMEDOUT' && fileRequestError.code !== 'ENOTFOUND') {
                logger.error('Error fetching files:', fileRequestError);
              }
            } else {
              logger.error('Error fetching files:', fileRequestError);
            }

            // Render the worlds page with an error message instead of returning JSON
            const settings = await prisma.settings.findUnique({
              where: { id: 1 },
            });

            // Get server status including uptime
            const serverStatus = await getServerStatus({
              nodeAddress: server.node.address,
              nodePort: server.node.port,
              serverUUID: server.UUID,
              nodeKey: server.node.key,
            });

            return res.render('user/server/worlds', {
              errorMessage: { message: 'Failed to fetch worlds. The server may be offline or not responding.' },
              user,
              worlds: [],
              features: [],
              installed: await checkForServerInstallation(serverId),
              server,
              serverStatus,
              req,
              settings,
            });
          }
        } catch (error) {
          logger.error('Error getting worlds:', error);

          // Render the worlds page with an error message
          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          return res.render('user/server/worlds', {
            errorMessage: { message: 'Failed to load worlds. Please try again later.' },
            user: req.session?.user,
            worlds: [],
            features: [],
            installed: false,
            server: null,
            req,
            settings,
          });
        }
      },
    );

    router.post('/server/:id/rename', isAuthenticatedForServer('id'), async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const relativePath = req.body.path;
      const newName = req.body.newName;

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { UUID: serverId },
          include: { node: true, image: true },
        });

        if (!server) {
          res.status(404).json({ error: 'Server not found' });
          return;
        }

        try {
          let directoryPath = '';

          const lastSlashIndex = relativePath.lastIndexOf('/');
          if (lastSlashIndex !== -1) {
            directoryPath = relativePath.substring(0, lastSlashIndex);
          }

          const newPath = directoryPath ? `${directoryPath}/${newName}` : newName;

          const renameRequest = {
            method: 'POST',
            url: `http://${server.node.address}:${server.node.port}/fs/rename`,
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
              newPath: newPath
            },
          };

          await axios(renameRequest);
          res.status(200).json({ success: true });
        } catch (error) {
          console.error('Error renaming file:', error);
          res.status(500).json({ error: 'Failed to rename file' });
        }
      } catch (error) {
        logger.error('Error renaming file:', error);
        res.status(500).json({ error: 'Failed to rename file' });
      }
    });

    const multer = require('multer');
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: 100 * 1024 * 1024 // 100MB
      }
    });

    router.post('/server/:id/upload', isAuthenticatedForServer('id'), upload.single('file'), async (req: Request, res: Response) => {
      const userId = req.session?.user?.id;
      const serverId = req.params?.id;
      const relativePath = req.body.path || '/';
      const fileName = req.body.fileName || (req.file ? req.file.originalname : '');

      logger.info(`Upload request received for file ${fileName} to path ${relativePath} for server ${serverId}`);

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          logger.warn(`User not found: ${userId}`);
          res.status(404).json({ error: 'User not found' });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { UUID: serverId },
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
          logger.info(`Sending upload request to node at ${server.node.address}:${server.node.port}`);
          logger.info(`File size: ${req.file.size} bytes`);

          if (req.file.size < 10 * 1024 * 1024) {
            const fileContent = req.file.buffer.toString('base64');
            const fileContentWithMeta = `data:${req.file.mimetype};base64,${fileContent}`;

            const uploadRequest = {
              method: 'POST',
              url: `http://${server.node.address}:${server.node.port}/fs/upload`,
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
                fileContent: fileContentWithMeta
              },
              maxContentLength: 15 * 1024 * 1024, // 15MB
              maxBodyLength: 15 * 1024 * 1024,    // 15MB
              timeout: 60000
            };

            const response = await axios(uploadRequest);
            logger.info(`File ${fileName} successfully uploaded to ${relativePath}`);
            res.status(200).json({
              success: true,
              fileName: response.data.fileName,
              path: response.data.path
            });
          } else {
            const createEmptyFileRequest = {
              method: 'POST',
              url: `http://${server.node.address}:${server.node.port}/fs/create-empty-file`,
              auth: {
                username: 'Airlink',
                password: server.node.key,
              },
              data: {
                id: server.UUID,
                path: relativePath,
                fileName: fileName
              },
              timeout: 10000
            };

            await axios(createEmptyFileRequest);
            logger.info(`Created empty file ${fileName} in ${relativePath}`);

            const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
            const totalChunks = Math.ceil(req.file.size / CHUNK_SIZE);

            for (let i = 0; i < totalChunks; i++) {
              const start = i * CHUNK_SIZE;
              const end = Math.min(start + CHUNK_SIZE, req.file.size);
              const chunk = req.file.buffer.slice(start, end);
              const chunkContent = chunk.toString('base64');
              const chunkContentWithMeta = `data:${req.file.mimetype};base64,${chunkContent}`;

              const uploadChunkRequest = {
                method: 'POST',
                url: `http://${server.node.address}:${server.node.port}/fs/append-file`,
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
                  totalChunks: totalChunks
                },
                timeout: 30000 // 30 seconds per chunk
              };

              await axios(uploadChunkRequest);
              logger.info(`Uploaded chunk ${i+1}/${totalChunks} for file ${fileName}`);
            }

            logger.info(`File ${fileName} successfully uploaded to ${relativePath} in ${totalChunks} chunks`);
            res.status(200).json({
              success: true,
              fileName: fileName,
              path: relativePath
            });
          }
        } catch (error) {
          if (axios.isAxiosError(error)) {
            if (error.response) {
              logger.error(`Error uploading file - Status: ${error.response.status}, Data:`, error.response.data);
              res.status(error.response.status).json({
                error: error.response.data.error || 'Failed to upload file',
                details: error.response.data
              });
            } else if (error.request) {
              logger.error('Error uploading file - No response received:', error.message);
              res.status(500).json({ error: 'Connection error during file upload. Please try again with a smaller file.' });
            } else {
              logger.error('Error uploading file - Request setup error:', error.message);
              res.status(500).json({ error: 'Error setting up upload request' });
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
    });

    router.get(
      '/server/:id/startup',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const errorMessage: ErrorMessage = {};
        const userId = req.session?.user?.id;
        const serverId = req.params?.id;

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            errorMessage.message = 'User not found.';
            return res.render('user/account', { errorMessage, user, req });
          }

          const server = await prisma.server.findUnique({
            where: { UUID: String(serverId) },
            include: { node: true, image: true, owner: true },
          });
          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          if (!server) {
            errorMessage.message = 'Server not found.';
            return res.render('user/server/startup', {
              errorMessage,
              user,
              req,
              settings,
            });
          }

          let features: string[] = [];

          if (server.image && typeof server.image.info === 'string') {
            try {
              const parsedInfo = JSON.parse(
                server.image.info,
              ) as ServerImageInfo;
              if (Array.isArray(parsedInfo.features)) {
                features = parsedInfo.features;
              }
            } catch (error) {
              console.error('Failed to parse server.image.info:', error);
            }
          } else if (
            server.image &&
            typeof server.image.info === 'object' &&
            server.image.info !== null
          ) {
            const info = server.image.info as ServerImageInfo;
            if (Array.isArray(info.features)) {
              features = info.features;
            }
          }

          let serverVariables: ServerVariable[] = [];
          if (server.Variables) {
            try {
              serverVariables = JSON.parse(server.Variables) as ServerVariable[];
            } catch (error) {
              logger.error('Error parsing server variables:', error);
            }
          } else {
            logger.info(`No variables found for server ${serverId}`);
          }

          // Get server status including uptime
          const serverInfos = {
            nodeAddress: server.node.address,
            nodePort: server.node.port,
            serverUUID: server.UUID,
            nodeKey: server.node.key,
          };
          const serverStatus = await getServerStatus(serverInfos);

          return res.render('user/server/startup', {
            errorMessage,
            features,
            installed: await checkForServerInstallation(serverId),
            user,
            req,
            server,
            serverStatus,
            serverVariables,
            settings,
          });
        } catch (error) {
          logger.error('Error fetching server startup data:', error);
          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });
          errorMessage.message = 'Error fetching server data.';
          return res.render('user/server/startup', {
            errorMessage,
            user: req.session?.user,
            req,
            settings,
          });
        }
      },
    );

    router.post(
      '/server/:id/startup/command',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const serverId = req.params?.id;
        let startCommand;
        const contentType = req.headers['content-type'] || '';

        if (contentType.includes('application/json')) {
          startCommand = req.body.startCommand;
        } else {
          startCommand = req.body.startCommand;
          logger.info(`Processing form data for startup command: ${startCommand}`);
        }

        logger.info(`Updating startup command for server ${serverId}: ${startCommand}`);

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            logger.warn(`User not found: ${userId}`);
            res.status(404).json({ error: 'User not found' });
            return;
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true },
          });

          if (!server) {
            logger.warn(`Server not found: ${serverId}`);
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          // Check if startup command editing is allowed
          // Get the allowStartupEdit value from the database
          const allowStartupEdit = await prisma.$queryRaw`SELECT "allowStartupEdit" FROM "Server" WHERE "UUID" = ${serverId}`;
          const isEditAllowed = allowStartupEdit && Array.isArray(allowStartupEdit) && allowStartupEdit.length > 0 && allowStartupEdit[0].allowStartupEdit === true;

          if (!isEditAllowed) {
            logger.warn(`Startup command editing not allowed for server ${serverId}`);
            const acceptsJson = req.headers.accept?.includes('application/json');
            if (acceptsJson) {
              res.status(403).json({ error: 'Startup command editing not allowed for this server' });
            } else {
              res.redirect(`/server/${serverId}/startup?error=true&message=Startup+command+editing+not+allowed+for+this+server`);
            }
            return;
          }

          await prisma.server.update({
            where: { UUID: serverId },
            data: { StartCommand: startCommand },
          });
          logger.info(`Startup command updated in database for server ${serverId}`);
          try {
            const statusRequest = {
              method: 'GET',
              url: `http://${server.node.address}:${server.node.port}/container/status`,
              auth: {
                username: 'Airlink',
                password: server.node.key,
              },
              params: { id: serverId },
            };

            const statusResponse = await axios(statusRequest);
            logger.info(`Server status response: ${JSON.stringify(statusResponse.data)}`);
            const isRunning = statusResponse.data?.running === true;

            if (isRunning) {
              const restartRequestData = {
                method: 'POST',
                url: `http://${server.node.address}:${server.node.port}/container/stop`,
                auth: {
                  username: 'Airlink',
                  password: server.node.key,
                },
                headers: {
                  'Content-Type': 'application/json',
                },
                data: {
                  id: String(serverId),
                  stopCmd: 'stop',
                },
              };

              await axios(restartRequestData);
              logger.info('Container stopped to apply new startup command: ' + serverId);
              await new Promise(resolve => setTimeout(resolve, 2000));
              const ports = (JSON.parse(server.Ports) as Port[])
                .filter((port) => port.primary)
                .map((port) => port.Port)
                .pop();

              const envVariables: Record<string, string | number | boolean> = {};
              if (server.Variables) {
                try {
                  const serverVariables = JSON.parse(
                    server.Variables,
                  ) as ServerVariable[];
                  serverVariables.forEach((variable) => {
                    if (
                      variable.env &&
                      variable.value !== undefined &&
                      variable.type
                    ) {
                      let processedValue: string | number | boolean;
                      switch (variable.type) {
                      case 'boolean':
                        processedValue =
                            variable.value === 1 || variable.value === '1'
                              ? 'true'
                              : 'false';
                        break;
                      case 'number':
                        processedValue = Number(variable.value);
                        break;
                      case 'text':
                        processedValue = String(variable.value);
                        break;
                      default:
                        processedValue = variable.value;
                      }
                      envVariables[variable.env] = processedValue;
                    }
                  });
                } catch (error) {
                  logger.error('Error processing server.Variables:', error);
                  throw new Error('Invalid format in server.Variables');
                }
              }

              if (!server.dockerImage) {
                res.status(400).json({ error: 'Docker image not found.' });
                return;
              }

              const ServerImage = Object.values(JSON.parse(server.dockerImage))[0];

              const startRequestData = {
                method: 'POST',
                url: `http://${server.node.address}:${server.node.port}/container/start`,
                auth: {
                  username: 'Airlink',
                  password: server.node.key,
                },
                headers: {
                  'Content-Type': 'application/json',
                },
                data: {
                  id: String(serverId),
                  image: String(ServerImage),
                  ports: ports,
                  Memory: server.Memory * 1024,
                  Cpu: server.Cpu,
                  env: envVariables,
                  StartCommand: startCommand,
                },
              };

              await axios(startRequestData);
              logger.info('Container restarted with new startup command: ' + serverId);
            }
          } catch (statusError) {
            logger.warn(`Could not check server status or restart server: ${statusError}`);
          }

          logger.info(`Successfully updated startup command for server ${serverId}`);
          const acceptsJson = req.headers.accept?.includes('application/json');
          if (acceptsJson) {
            res.status(200).json({ success: true });
          } else {
            res.redirect(`/server/${serverId}/startup?success=true&message=Startup+command+updated+successfully`);
          }
        } catch (error) {
          logger.error(`Error updating startup command for server ${serverId}:`, error);
          const acceptsJson = req.headers.accept?.includes('application/json');
          if (acceptsJson) {
            res.status(500).json({ error: 'Failed to update startup command' });
          } else {
            res.redirect(`/server/${serverId}/startup?error=true&message=Failed+to+update+startup+command`);
          }
        }
      },
    );

    router.post(
      '/server/:id/startup/docker-image',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const serverId = req.params?.id;
        const dockerImage = req.body.dockerImage;

        logger.info(`Updating Docker image for server ${serverId} to ${dockerImage}`);

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            logger.warn(`User not found: ${userId}`);
            res.status(404).json({ error: 'User not found' });
            return;
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true, image: true },
          });

          if (!server) {
            logger.warn(`Server not found: ${serverId}`);
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          // Validate that the Docker image exists in the available images
          let availableDockerImages = [];
          let validImage = false;

          try {
            if (server.image && server.image.dockerImages) {
              const dockerImagesArray = JSON.parse(server.image.dockerImages);
              dockerImagesArray.forEach((imageObj: Record<string, string>) => {
                Object.keys(imageObj).forEach(key => {
                  availableDockerImages.push(key);
                  if (key === dockerImage) {
                    validImage = true;
                  }
                });
              });
            }
          } catch (e) {
            logger.error(`Error parsing Docker images for server ${serverId}:`, e);
            availableDockerImages = [];
          }

          if (!validImage) {
            logger.warn(`Invalid Docker image selected for server ${serverId}: ${dockerImage}`);
            const acceptsJson = req.headers.accept?.includes('application/json');
            if (acceptsJson) {
              res.status(400).json({ error: 'Invalid Docker image selected' });
            } else {
              res.redirect(`/server/${serverId}/startup?error=true&message=Invalid+Docker+image+selected`);
            }
            return;
          }

          // Find the Docker image object that contains the selected image
          let dockerImageObj = {};
          try {
            if (server.image && server.image.dockerImages) {
              const dockerImagesArray = JSON.parse(server.image.dockerImages);
              for (const imageObj of dockerImagesArray) {
                if (Object.keys(imageObj).includes(dockerImage)) {
                  dockerImageObj = { [dockerImage]: imageObj[dockerImage] };
                  break;
                }
              }
            }
          } catch (e) {
            logger.error(`Error finding Docker image object for server ${serverId}:`, e);
          }

          // Update the server with the new Docker image
          await prisma.server.update({
            where: { UUID: serverId },
            data: { dockerImage: JSON.stringify(dockerImageObj) },
          });

          logger.info(`Docker image updated in database for server ${serverId}`);

          // Check if the server is running and restart it if necessary
          try {
            const statusRequest = {
              method: 'GET',
              url: `http://${server.node.address}:${server.node.port}/container/status`,
              auth: {
                username: 'Airlink',
                password: server.node.key,
              },
              params: { id: serverId },
            };

            const statusResponse = await axios(statusRequest);
            logger.info(`Server status response: ${JSON.stringify(statusResponse.data)}`);
            const isRunning = statusResponse.data?.running === true;

            if (isRunning) {
              const restartRequestData = {
                method: 'POST',
                url: `http://${server.node.address}:${server.node.port}/container/stop`,
                auth: {
                  username: 'Airlink',
                  password: server.node.key,
                },
                headers: {
                  'Content-Type': 'application/json',
                },
                data: {
                  id: String(serverId),
                  stopCmd: 'stop',
                },
              };

              await axios(restartRequestData);
              logger.info('Container stopped to apply new Docker image: ' + serverId);

              await new Promise(resolve => setTimeout(resolve, 2000));

              const ports = (JSON.parse(server.Ports) as Port[])
                .filter((port) => port.primary)
                .map((port) => port.Port)
                .pop();

              const envVariables: Record<string, string | number | boolean> = {};
              if (server.Variables) {
                try {
                  const serverVariables = JSON.parse(
                    server.Variables,
                  ) as ServerVariable[];
                  serverVariables.forEach((variable) => {
                    if (
                      variable.env &&
                      variable.value !== undefined &&
                      variable.type
                    ) {
                      let processedValue: string | number | boolean;
                      switch (variable.type) {
                      case 'boolean':
                        processedValue =
                            variable.value === 1 || variable.value === '1'
                              ? 'true'
                              : 'false';
                        break;
                      case 'number':
                        processedValue = Number(variable.value);
                        break;
                      case 'text':
                        processedValue = String(variable.value);
                        break;
                      default:
                        processedValue = variable.value;
                      }
                      envVariables[variable.env] = processedValue;
                    }
                  });
                } catch (error) {
                  logger.error('Error processing server.Variables:', error);
                  throw new Error('Invalid format in server.Variables');
                }
              }

              const startRequestData = {
                method: 'POST',
                url: `http://${server.node.address}:${server.node.port}/container/start`,
                auth: {
                  username: 'Airlink',
                  password: server.node.key,
                },
                headers: {
                  'Content-Type': 'application/json',
                },
                data: {
                  id: String(serverId),
                  image: dockerImage,
                  ports: ports,
                  Memory: server.Memory * 1024,
                  Cpu: server.Cpu,
                  env: envVariables,
                  StartCommand: server.StartCommand,
                },
              };

              await axios(startRequestData);
              logger.info('Container restarted with new Docker image: ' + serverId);
            }
          } catch (statusError) {
            logger.warn(`Could not check server status or restart server: ${statusError}`);
          }

          logger.info(`Successfully updated Docker image for server ${serverId}`);

          const acceptsJson = req.headers.accept?.includes('application/json');
          if (acceptsJson) {
            res.status(200).json({ success: true });
          } else {
            res.redirect(`/server/${serverId}/startup?success=true&message=Docker+image+updated+successfully`);
          }
        } catch (error) {
          logger.error(`Error updating Docker image for server ${serverId}:`, error);

          const acceptsJson = req.headers.accept?.includes('application/json');
          if (acceptsJson) {
            res.status(500).json({ error: 'Failed to update Docker image' });
          } else {
            res.redirect(`/server/${serverId}/startup?error=true&message=Failed+to+update+Docker+image`);
          }
        }
      },
    );

    router.post(
      '/server/:id/startup/variables',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const serverId = req.params?.id;
        let variables = [];
        const contentType = req.headers['content-type'] || '';

        if (contentType.includes('application/json')) {
          variables = req.body.variables || [];
        } else {
          logger.info(`Processing form data: ${JSON.stringify(req.body)}`);

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { image: true },
          });

          if (!server) {
            logger.warn(`Server not found: ${serverId}`);
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          let serverVariables = [];
          let imageVariables = [];

          try {
            if (server.Variables) {
              serverVariables = JSON.parse(server.Variables);
            }
          } catch (error) {
            logger.error('Error parsing server variables:', error);
            serverVariables = [];
          }

          // Get original default values from the server image
          try {
            if (server.image && server.image.variables) {
              imageVariables = JSON.parse(server.image.variables);
              logger.info(`Image variables for server ${serverId}: ${JSON.stringify(imageVariables)}`);
            }
          } catch (error) {
            logger.error('Error parsing image variables:', error);
            imageVariables = [];
          }

          variables = serverVariables.map((variable: ServerVariable) => {
            const formKey = `var_${variable.env}`;
            let value = req.body[formKey];

            // If the form value is empty or undefined, keep the current value or use default
            if (variable.type === 'boolean') {
              value = value ? 1 : 0;
            } else if (variable.type === 'number') {
              const numValue = parseInt(value);
              // If parsing fails or value is empty, keep current value or use default
              if (isNaN(numValue) || value === '' || value === undefined) {
                value = variable.value !== undefined && variable.value !== null && variable.value !== ''
                  ? variable.value
                  : (variable.default || 0);
              } else {
                value = numValue;
              }
            } else if (variable.type === 'text') {
              // For text fields, if empty, keep current value or use default
              if (value === '' || value === undefined) {
                value = variable.value !== undefined && variable.value !== null && variable.value !== ''
                  ? variable.value
                  : (variable.default || '');
              }
            }

            return {
              ...variable,
              value: value
            };
          });
        }

        logger.info(`Updating variables for server ${serverId}: ${JSON.stringify(variables)}`);

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            logger.warn(`User not found: ${userId}`);
            res.status(404).json({ error: 'User not found' });
            return;
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true },
          });

          if (!server) {
            logger.warn(`Server not found: ${serverId}`);
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          await prisma.server.update({
            where: { UUID: serverId },
            data: { Variables: JSON.stringify(variables) },
          });
          logger.info(`Variables updated in database for server ${serverId}`);

          try {
            const statusRequest = {
              method: 'GET',
              url: `http://${server.node.address}:${server.node.port}/container/status`,
              auth: {
                username: 'Airlink',
                password: server.node.key,
              },
              params: { id: serverId },
            };

            const statusResponse = await axios(statusRequest);
            logger.info(`Server status response: ${JSON.stringify(statusResponse.data)}`);
            const isRunning = statusResponse.data?.running === true;

            if (isRunning) {
              const restartRequestData = {
                method: 'POST',
                url: `http://${server.node.address}:${server.node.port}/container/stop`,
                auth: {
                  username: 'Airlink',
                  password: server.node.key,
                },
                headers: {
                  'Content-Type': 'application/json',
                },
                data: {
                  id: String(serverId),
                  stopCmd: 'stop',
                },
              };

              await axios(restartRequestData);
              logger.info('Container stopped to apply new variables: ' + serverId);

              await new Promise(resolve => setTimeout(resolve, 2000));

              const ports = (JSON.parse(server.Ports) as Port[])
                .filter((port) => port.primary)
                .map((port) => port.Port)
                .pop();

              const envVariables: Record<string, string | number | boolean> = {};
              if (variables && Array.isArray(variables)) {
                variables.forEach((variable: ServerVariable) => {
                  if (
                    variable.env &&
                    variable.value !== undefined &&
                    variable.type
                  ) {
                    let processedValue: string | number | boolean;
                    switch (variable.type) {
                    case 'boolean':
                      processedValue =
                          variable.value === 1 || variable.value === '1'
                            ? 'true'
                            : 'false';
                      break;
                    case 'number':
                      processedValue = Number(variable.value);
                      break;
                    case 'text':
                      processedValue = String(variable.value);
                      break;
                    default:
                      processedValue = variable.value;
                    }
                    envVariables[variable.env] = processedValue;
                  }
                });
              }

              if (!server.dockerImage) {
                logger.error(`Docker image not found for server ${serverId}`, new Error('Docker image not found'));
                res.status(400).json({ error: 'Docker image not found.' });
                return;
              }

              const ServerImage = Object.values(JSON.parse(server.dockerImage))[0];

              const startRequestData = {
                method: 'POST',
                url: `http://${server.node.address}:${server.node.port}/container/start`,
                auth: {
                  username: 'Airlink',
                  password: server.node.key,
                },
                headers: {
                  'Content-Type': 'application/json',
                },
                data: {
                  id: String(serverId),
                  image: String(ServerImage),
                  ports: ports,
                  Memory: server.Memory * 1024,
                  Cpu: server.Cpu,
                  env: envVariables,
                  StartCommand: server.StartCommand,
                },
              };

              await axios(startRequestData);
              logger.info('Container restarted with new variables: ' + serverId);
            }
          } catch (statusError) {
            logger.warn(`Could not check server status or restart server: ${statusError}`);
          }

          logger.info(`Successfully updated variables for server ${serverId}`);

          const acceptsJson = req.headers.accept?.includes('application/json');
          if (acceptsJson) {
            res.status(200).json({ success: true });
          } else {
            res.redirect(`/server/${serverId}/startup?success=true&message=Server+variables+updated+successfully`);
          }
        } catch (error) {
          logger.error(`Error updating variables for server ${serverId}:`, error);
          const acceptsJson = req.headers.accept?.includes('application/json');
          if (acceptsJson) {
            res.status(500).json({ error: 'Failed to update server variables' });
          } else {
            res.redirect(`/server/${serverId}/startup?error=true&message=Failed+to+update+server+variables`);
          }
        }
      },
    );


    router.get(
      '/server/:id/settings',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const errorMessage: ErrorMessage = {};
        const userId = req.session?.user?.id;
        const serverId = req.params?.id;

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            errorMessage.message = 'User not found.';
            return res.render('user/account', { errorMessage, user, req });
          }

          const server = await prisma.server.findUnique({
            where: { UUID: String(serverId) },
            include: { node: true, image: true, owner: true },
          });
          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          if (!server) {
            errorMessage.message = 'Server not found.';
            return res.render('user/server/settings', {
              errorMessage,
              user,
              req,
              settings,
            });
          }

          let features: string[] = [];

          if (server.image && typeof server.image.info === 'string') {
            try {
              const parsedInfo = JSON.parse(
                server.image.info,
              ) as ServerImageInfo;
              if (Array.isArray(parsedInfo.features)) {
                features = parsedInfo.features;
              }
            } catch (error) {
              console.error('Failed to parse server.image.info:', error);
            }
          } else if (
            server.image &&
            typeof server.image.info === 'object' &&
            server.image.info !== null
          ) {
            const info = server.image.info as ServerImageInfo;
            if (Array.isArray(info.features)) {
              features = info.features;
            }
          }

          return res.render('user/server/settings', {
            errorMessage,
            features,
            installed: await checkForServerInstallation(serverId),
            user,
            req,
            server,
            settings,
          });
        } catch (error) {
          logger.error('Error fetching server settings data:', error);
          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });
          errorMessage.message = 'Error fetching server data.';
          return res.render('user/server/settings', {
            errorMessage,
            user: req.session?.user,
            req,
            settings,
          });
        }
      },
    );

    router.post(
      '/server/:id/settings',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const serverId = req.params?.id;
        const { name, description } = req.body;

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { image: true },
          });

          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          await prisma.server.update({
            where: { UUID: serverId },
            data: {
              name: name,
              description: description
            },
          });

          res.status(200).json({ success: true });
        } catch (error) {
          logger.error('Error updating server settings:', error);
          res.status(500).json({ error: 'Failed to update server settings' });
        }
      },
    );


    router.post(
      '/server/:id/power/restart',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const serverId = req.params?.id;

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true },
          });

          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }


          const stopRequestData = {
            method: 'POST',
            url: `http://${server.node.address}:${server.node.port}/container/stop`,
            auth: {
              username: 'Airlink',
              password: server.node.key,
            },
            headers: {
              'Content-Type': 'application/json',
            },
            data: {
              id: String(serverId),
              stopCmd: 'stop',
            },
          };

          await axios(stopRequestData);
          logger.info('Container stopped for restart: ' + serverId);


          await new Promise(resolve => setTimeout(resolve, 2000));


          const ports = (JSON.parse(server.Ports) as Port[])
            .filter((port) => port.primary)
            .map((port) => port.Port)
            .pop();

          const envVariables: Record<string, string | number | boolean> = {};
          if (server.Variables) {
            try {
              const serverVariables = JSON.parse(
                server.Variables,
              ) as ServerVariable[];
              serverVariables.forEach((variable) => {
                if (
                  variable.env &&
                  variable.value !== undefined &&
                  variable.type
                ) {
                  let processedValue: string | number | boolean;
                  switch (variable.type) {
                  case 'boolean':
                    processedValue =
                        variable.value === 1 || variable.value === '1'
                          ? 'true'
                          : 'false';
                    break;
                  case 'number':
                    processedValue = Number(variable.value);
                    break;
                  case 'text':
                    processedValue = String(variable.value);
                    break;
                  default:
                    processedValue = variable.value;
                  }
                  envVariables[variable.env] = processedValue;
                }
              });
            } catch (error) {
              logger.error('Error processing server.Variables:', error);
              throw new Error('Invalid format in server.Variables');
            }
          }

          if (!server.dockerImage) {
            res.status(400).json({ error: 'Docker image not found.' });
            return;
          }

          const ServerImage = Object.values(JSON.parse(server.dockerImage))[0];

          const startRequestData = {
            method: 'POST',
            url: `http://${server.node.address}:${server.node.port}/container/start`,
            auth: {
              username: 'Airlink',
              password: server.node.key,
            },
            headers: {
              'Content-Type': 'application/json',
            },
            data: {
              id: String(serverId),
              image: String(ServerImage),
              ports: ports,
              Memory: server.Memory * 1024,
              Cpu: server.Cpu,
              env: envVariables,
              StartCommand: server.StartCommand,
            },
          };

          await axios(startRequestData);
          logger.info('Container restarted successfully: ' + serverId);

          res.status(200).json({ success: true, message: 'Server restarted successfully' });
        } catch (error) {
          logger.error('Error restarting server:', error);
          res.status(500).json({ error: 'Failed to restart server' });
        }
      },
    );


    router.post(
      '/server/:id/reinstall',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const serverId = req.params?.id;

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true, image: true },
          });

          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }


          await prisma.server.update({
            where: { UUID: serverId },
            data: {
              Installing: true,
              Queued: true
            },
          });


          const deleteRequestData = {
            method: 'DELETE',
            url: `http://${server.node.address}:${server.node.port}/container`,
            auth: {
              username: 'Airlink',
              password: server.node.key,
            },
            headers: {
              'Content-Type': 'application/json',
            },
            data: {
              id: String(serverId),
            },
          };

          await axios(deleteRequestData);
          logger.info('Container deleted for reinstallation: ' + serverId);


          await new Promise(resolve => setTimeout(resolve, 2000));


          queueer.addTask(async () => {
            try {
              const serverToReinstall = await prisma.server.findUnique({
                where: { UUID: serverId },
                include: { image: true, node: true },
              });

              if (!serverToReinstall) {
                logger.error('Server not found for reinstallation:', serverId);
                return;
              }


              let ServerEnv: ServerVariable[] = [];
              logger.info(`Raw Variables from database for server ${serverId}: ${serverToReinstall.Variables}`);
              if (serverToReinstall.Variables) {
                try {
                  ServerEnv = JSON.parse(serverToReinstall.Variables) as ServerVariable[];
                  logger.info(`Parsed ServerEnv: ${JSON.stringify(ServerEnv)}`);

                  const ports = JSON.parse(serverToReinstall.Ports);
                  const primaryPort = ports.find((p: any) => p.primary);
                  if (primaryPort) {
                    ServerEnv.push({
                      env: 'SERVER_PORT',
                      name: 'Primary Port',
                      value: primaryPort.Port.split(':')[0],
                      type: 'text',
                      default: primaryPort.Port.split(':')[0],
                    });
                  }
                } catch (error) {
                  logger.error(`Error parsing Variables for server ID ${serverToReinstall.id}:`, error);
                }
              }


              const env = ServerEnv.reduce(
                (acc: { [key: string]: any }, curr: ServerVariable) => {
                  logger.info(`Processing variable: ${curr.env} = ${curr.value} (type: ${curr.type})`);
                  if (curr.env && curr.value !== undefined && curr.value !== null) {
                    // Process the value based on its type
                    let processedValue: string | number | boolean;
                    switch (curr.type) {
                      case 'boolean':
                        processedValue = curr.value === 1 || curr.value === '1' || curr.value === true ? 'true' : 'false';
                        break;
                      case 'number':
                        processedValue = Number(curr.value);
                        break;
                      case 'text':
                      default:
                        processedValue = String(curr.value);
                        break;
                    }
                    acc[curr.env] = processedValue;
                    logger.info(`Added to env: ${curr.env} = ${processedValue}`);
                  } else {
                    logger.info(`Skipped variable ${curr.env}: value is ${curr.value}`);
                  }
                  return acc;
                },
                {}
              );


              if (serverToReinstall.image?.scripts) {
                let scripts;
                try {
                  scripts = JSON.parse(serverToReinstall.image.scripts);



                  logger.info(`Reinstalling server ${serverToReinstall.UUID} with environment variables: ${JSON.stringify(env)}`);

                  const installRequestData = {
                    method: 'POST',
                    url: `http://${serverToReinstall.node.address}:${serverToReinstall.node.port}/container/install`,
                    auth: {
                      username: 'Airlink',
                      password: serverToReinstall.node.key,
                    },
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    data: {
                      id: serverToReinstall.UUID,
                      env: env,
                      scripts: scripts.install.map(
                        (script: {
                          url: string;
                          fileName: string;
                          onStart: boolean;
                          ALVKT: boolean;
                        }) => ({
                          url: script.url,
                          onStartup: script.onStart,
                          ALVKT: script.ALVKT,
                          fileName: script.fileName,
                        }),
                      ),
                    },
                  };


                  const installResponse = await axios(installRequestData);
                  logger.info(`Installation scripts sent for server ${serverId}. Response status: ${installResponse.status}`);


                  await prisma.server.update({
                    where: { UUID: serverId },
                    data: { Queued: false },
                  });
                } catch (error: any) {
                  logger.error(`Error during reinstallation of server ${serverId}:`, error);
                  if (error.response) {
                    logger.error(`Response status: ${error.response.status}`);
                    logger.error(`Response data:`, error.response.data);
                  }
                  await prisma.server.update({
                    where: { UUID: serverId },
                    data: { Queued: false },
                  });
                }
              } else {

                await prisma.server.update({
                  where: { UUID: serverId },
                  data: { Queued: false },
                });
              }
            } catch (error) {
              logger.error(`Error in reinstallation queue for server ${serverId}:`, error);

              await prisma.server.update({
                where: { UUID: serverId },
                data: { Queued: false },
              }).catch(e => logger.error('Error updating server queue status:', e));
            }
          });

          res.status(200).json({ success: true, message: 'Server reinstallation initiated' });
        } catch (error) {
          logger.error('Error reinstalling server:', error);
          res.status(500).json({ error: 'Failed to reinstall server' });
        }
      },
    );

    // Backup endpoints
    router.get(
      '/server/:id/backups',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const serverId = req.params?.id;

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true, image: true },
          });

          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const backups = await prisma.backup.findMany({
            where: { serverId: serverId },
            orderBy: { createdAt: 'desc' },
          });

          const settings = await prisma.settings.findUnique({ where: { id: 1 } });

          res.render('user/server/backups', {
            user,
            req,
            server,
            backups,
            settings,
            features: JSON.parse(server.image.info || '{}').features || [],
            installed: await checkForServerInstallation(serverId),
          });
        } catch (error) {
          logger.error('Error fetching backups:', error);
          res.status(500).json({ error: 'Failed to fetch backups' });
        }
      },
    );

    router.post(
      '/server/:id/backups/create',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const serverId = req.params?.id;
        const { name } = req.body;

        if (!name || name.trim() === '') {
          res.status(400).json({ error: 'Backup name is required' });
          return;
        }

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true },
          });

          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const response = await axios.post(
            `http://${server.node.address}:${server.node.port}/container/backup`,
            {
              id: serverId,
              name: name.trim(),
            },
            {
              auth: {
                username: 'Airlink',
                password: server.node.key,
              },
              timeout: 300000,
            }
          );

          if (response.data.success) {
            const backup = await prisma.backup.create({
              data: {
                UUID: response.data.backup.uuid,
                name: name.trim(),
                serverId: serverId,
                filePath: response.data.backup.filePath,
                size: BigInt(response.data.backup.size),
              },
            });

            res.json({
              success: true,
              message: 'Backup created successfully',
              backup: {
                ...backup,
                size: backup.size ? backup.size.toString() : '0',
              },
            });
          } else {
            res.status(500).json({ error: 'Failed to create backup on daemon' });
          }
        } catch (error) {
          logger.error('Error creating backup:', error);
          if (axios.isAxiosError(error)) {
            res.status(500).json({
              error: `Failed to create backup: ${error.response?.data?.error || error.message}`
            });
          } else {
            res.status(500).json({ error: 'Failed to create backup' });
          }
        }
      },
    );

    router.post(
      '/server/:id/backups/:backupId/restore',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const serverId = req.params?.id;
        const backupId = req.params?.backupId;

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true },
          });

          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const backup = await prisma.backup.findUnique({
            where: { UUID: backupId, serverId: serverId },
          });

          if (!backup) {
            res.status(404).json({ error: 'Backup not found' });
            return;
          }

          const response = await axios.post(
            `http://${server.node.address}:${server.node.port}/container/restore`,
            {
              id: serverId,
              backupPath: backup.filePath,
            },
            {
              auth: {
                username: 'Airlink',
                password: server.node.key,
              },
              timeout: 300000,
            }
          );

          if (response.data.success) {
            res.json({
              success: true,
              message: 'Backup restored successfully',
            });
          } else {
            res.status(500).json({ error: 'Failed to restore backup on daemon' });
          }
        } catch (error) {
          logger.error('Error restoring backup:', error);
          if (axios.isAxiosError(error)) {
            res.status(500).json({
              error: `Failed to restore backup: ${error.response?.data?.error || error.message}`
            });
          } else {
            res.status(500).json({ error: 'Failed to restore backup' });
          }
        }
      },
    );

    router.get(
      '/server/:id/backups/:backupId/download',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const serverId = req.params?.id;
        const backupId = req.params?.backupId;

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true },
          });

          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const backup = await prisma.backup.findUnique({
            where: { UUID: backupId, serverId: serverId },
          });

          if (!backup) {
            res.status(404).json({ error: 'Backup not found' });
            return;
          }

          const downloadUrl = `http://${server.node.address}:${server.node.port}/container/backup/download`;
          const response = await axios({
            method: 'GET',
            url: downloadUrl,
            params: {
              backupPath: backup.filePath,
            },
            auth: {
              username: 'Airlink',
              password: server.node.key,
            },
            responseType: 'stream',
          });

          const fileName = `${backup.name}_${backup.createdAt.toISOString().split('T')[0]}.tar.gz`;
          res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
          res.setHeader('Content-Type', 'application/gzip');

          response.data.pipe(res);
        } catch (error) {
          logger.error('Error downloading backup:', error);
          if (axios.isAxiosError(error)) {
            res.status(500).json({
              error: `Failed to download backup: ${error.response?.data?.error || error.message}`
            });
          } else {
            res.status(500).json({ error: 'Failed to download backup' });
          }
        }
      },
    );

    router.delete(
      '/server/:id/backups/:backupId',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
        const userId = req.session?.user?.id;
        const serverId = req.params?.id;
        const backupId = req.params?.backupId;

        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
          }

          const server = await prisma.server.findUnique({
            where: { UUID: serverId },
            include: { node: true },
          });

          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          const backup = await prisma.backup.findUnique({
            where: { UUID: backupId, serverId: serverId },
          });

          if (!backup) {
            res.status(404).json({ error: 'Backup not found' });
            return;
          }

          try {
            await axios.delete(
              `http://${server.node.address}:${server.node.port}/container/backup`,
              {
                data: {
                  backupPath: backup.filePath,
                },
                auth: {
                  username: 'Airlink',
                  password: server.node.key,
                },
              }
            );
          } catch (daemonError) {
            logger.warn('Failed to delete backup file from daemon');
          }

          await prisma.backup.delete({
            where: { UUID: backupId },
          });

          res.json({
            success: true,
            message: 'Backup deleted successfully',
          });
        } catch (error) {
          logger.error('Error deleting backup:', error);
          res.status(500).json({ error: 'Failed to delete backup' });
        }
      },
    );

    return router;
  },
};

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit();
});

export default dashboardModule;
