import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticatedForServer } from '../../handlers/utils/auth/serverAuthUtil';
import logger from '../../handlers/logger';
import axios from 'axios';
import { checkEulaStatus, isWorld } from '../../handlers/features';
const { MinecraftServerListPing } = require('minecraft-status');
import { checkForServerInstallation } from '../../handlers/checkForServerInstallation';
import { queueer } from '../../handlers/queueer';

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


          let alshID = "";
          let alshPASSWORD = "";

          if (features.includes('alsh')) {
            try {
              const idresponse = await axios({
                method: 'GET',
                url: `http://${server.node.address}:${server.node.port}/fs/file/content`,
                responseType: 'text',
                params: { id: server.UUID, path: "./airlink/alshid.txt" },
                auth: {
                  username: 'Airlink',
                  password: server.node.key,
                },
              });

              const passresponse = await axios({
                method: 'GET',
                url: `http://${server.node.address}:${server.node.port}/fs/file/content`,
                responseType: 'text',
                params: { id: server.UUID, path: "./airlink/password.txt" },
                auth: {
                  username: 'Airlink',
                  password: server.node.key,
                },
              });

              alshID = idresponse.data;
              alshPASSWORD = passresponse.data;
            } catch (error: any) {
              console.error("Error:", error.message);
            }
          }

          return res.render('user/server/manage', {
            errorMessage,
            features: features || [],
            installed: await checkForServerInstallation(serverId),
            user,
            alshID,
            alshPASSWORD,
            req,
            server,
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


    router.post(
      '/server/:id/power/:poweraction',
      isAuthenticatedForServer('id'),
      async (req: Request, res: Response) => {
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

          if (powerAction === 'stop') {
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

            try {
              await axios(requestData);
              logger.info('Container stopped successfully: ' + serverId);
              res
                .status(200)
                .json({ success: true, message: 'Container stopped successfully.' });
              return;
            } catch (stopError) {
              if (axios.isAxiosError(stopError) && stopError.response?.status === 404) {
                logger.info('Container already stopped or not found: ' + serverId);
                res.status(200).json({ success: true, message: 'Container stopped successfully.' });
              } else {
                logger.debug('Error stopping container:', stopError);
                res.status(200).json({ success: true, message: 'Container stopped successfully.' });
              }
              return;
            }
          }

          if (powerAction !== 'start') {
            logger.error(`Invalid power action:`, powerAction);
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
            return res.render('user/server/files', {
              errorMessage,
              user,
              req,
              settings,
            });
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

          return res.render('user/server/files', {
            errorMessage,
            user,
            features,
            installed: await checkForServerInstallation(serverId),
            files,
            currentPath: path,
            req,
            server,
            settings,
          });
        } catch (error) {
          logger.error('Error fetching user:', error);
          errorMessage.message = 'Error fetching user data.';
          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          return res.render('user/server/files', {
            errorMessage,
            features: [],
            user: req.session?.user,
            req,
            settings,
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

          return res.render('user/server/file', {
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
            req,
            settings,
          });
        } catch (error) {
          logger.error('Error fetching file:', error);
          res.status(500).json({ error: 'Failed to fetch file' });
          return;
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

    router.delete(
      '/server/:id/files/rm/:path(*)',
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
          });

          res.json({ success: true });
          return;
        } catch (error) {
          logger.error('Error deleting file:', error);
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
          try {
            const pingResponse = await MinecraftServerListPing.ping(
              4,
              server.node.address,
              parseInt(primaryPort, 10),
              3000,
            );
            players =
              pingResponse.players?.sample?.map((player: any) => ({
                name: player.name,
                uuid: player.id,
              })) || [];
          } catch (pingError) {
            logger.error('Error pinging server:', pingError);
            res.redirect('/server/' + serverId + '/');
            return;
          }

          const settings = await prisma.settings.findUnique({
            where: { id: 1 },
          });

          return res.render('user/server/players', {
            errorMessage: {},
            user,
            players,
            features,
            installed: await checkForServerInstallation(serverId),
            server,
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
            const axios = require('axios');
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

            return res.render('user/server/worlds', {
              errorMessage: {},
              user,
              worlds,
              features,
              installed: await checkForServerInstallation(serverId),
              server,
              req,
              settings,
            });
          } catch (fileRequestError) {
            console.error('Error fetching files:', fileRequestError);
            res.status(500).json({ error: 'Failed to fetch files' });
          }
        } catch (error) {
          logger.error('Error getting worlds:', error);
          res.status(500).json({ error: 'Failed to get worlds' });
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
          }

          return res.render('user/server/startup', {
            errorMessage,
            features,
            installed: await checkForServerInstallation(serverId),
            user,
            req,
            server,
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
          });

          if (!server) {
            logger.warn(`Server not found: ${serverId}`);
            res.status(404).json({ error: 'Server not found' });
            return;
          }

          let serverVariables = [];
          try {
            if (server.Variables) {
              serverVariables = JSON.parse(server.Variables);
            }
          } catch (error) {
            logger.error(`Error parsing server variables:`, error);
            serverVariables = [];
          }

          variables = serverVariables.map((variable: ServerVariable) => {
            const formKey = `var_${variable.env}`;
            let value = req.body[formKey];

            if (variable.type === 'boolean') {
              value = value ? 1 : 0;
            } else if (variable.type === 'number') {
              value = parseInt(value);
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
              if (serverToReinstall.Variables) {
                try {
                  ServerEnv = JSON.parse(serverToReinstall.Variables) as ServerVariable[];

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
                  if (curr.env && curr.value !== undefined) {
                    acc[curr.env] = curr.value;
                  }
                  return acc;
                },
                {}
              );


              if (serverToReinstall.image?.scripts) {
                let scripts;
                try {
                  scripts = JSON.parse(serverToReinstall.image.scripts);


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


                  await axios(installRequestData);
                  logger.info(`Installation scripts sent for server ${serverId}`);


                  await prisma.server.update({
                    where: { UUID: serverId },
                    data: { Queued: false },
                  });
                } catch (error) {
                  logger.error(`Error during reinstallation of server ${serverId}:`, error);
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

    return router;
  },
};

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit();
});

export default dashboardModule;
