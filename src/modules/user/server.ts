import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticatedForServer } from '../../handlers/utils/auth/serverAuthUtil';
import logger from '../../handlers/logger';
import axios from 'axios';

const prisma = new PrismaClient();

interface ErrorMessage {
  message?: string;
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

          if (!server) {
            errorMessage.message = 'Server not found.';
            return res.render('user/server/manage', {
              errorMessage,
              user,
              req,
              logo: '',
            });
          }

          return res.render('user/server/manage', {
            errorMessage,
            user,
            req,
            server,
            logo: '',
          });
        } catch (error) {
          logger.error('Error fetching user:', error);
          errorMessage.message = 'Error fetching user data.';
          return res.render('user/server/manage', {
            errorMessage,
            user: req.session?.user,
            req,
            logo: '',
          });
        }
      }
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
            return res.render('user/server/manage', { errorMessage, user, req });
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
              const response = await axios(requestData);
              logger.info('Container stopped successfully:' + response.data);
              res.status(200).json({ message: 'Container stopped successfully.' });
              return;
            } catch (stopError) {
              logger.error('Error stopping container:', stopError);
              res.status(500).json({ error: 'Failed to stop container.' });
            }
          }
    
          const ports = (JSON.parse(server.Ports) as Port[])
            .filter((port) => port.primary)
            .map((port) => port.Port)
            .pop();
    
          const envVariables: Record<string, string | number | boolean> = {};
          if (server.Variables) {
            try {
              const serverVariables = JSON.parse(server.Variables) as ServerVariable[];
              serverVariables.forEach((variable) => {
                if (variable.env && variable.value !== undefined && variable.type) {
                  let processedValue: string | number | boolean;
                  switch (variable.type) {
                  case 'boolean':
                    processedValue = variable.value === 1 || variable.value === '1' ? 'true' : 'false';
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
            return
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
    
          const startResponse = await axios(startRequestData);
          logger.info('Container started successfully:' + startResponse.data);
    
          res.status(200).json({ message: 'Container started successfully.' });
          return;
        } catch (error) {
          logger.error('Error processing power action:', error);
          res.status(500).json({ error: 'Failed to process power action.' });
        }
      }
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

          if (!server) {
            errorMessage.message = 'Server not found.';
            return res.render('user/server/files', {
              errorMessage,
              user,
              req,
              logo: '',
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
            }
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

          return res.render('user/server/files', {
            errorMessage,
            user,
            files,
            currentPath: path,
            req,
            server,
            logo: '',
          });
        } catch (error) {
          logger.error('Error fetching user:', error);
          errorMessage.message = 'Error fetching user data.';
          return res.render('user/server/files', {
            errorMessage,
            user: req.session?.user,
            req,
            logo: '',
          });
        }
      }
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
            include: { node: true }
          });
          
          if (!server) {
            res.status(404).json({ error: 'Server not found' });
            return;
          }
    
          const response = await axios({
            method: 'GET',
            url: `http://${server.node.address}:${server.node.port}/fs/file/content`,
            params: { id: server.UUID, path: filePath },
            auth: {
              username: 'Airlink',
              password: server.node.key
            }
          });
    
          const extension = filePath.split('.').pop()?.toLowerCase() || '';
          
          return res.render('user/server/file', {
            errorMessage: {},
            user,
            file: {
              name: filePath.split('/').pop(),
              path: filePath,
              content: response.data.content,
              extension
            },
            server,
            req,
            logo: ''
          });
        } catch (error) {
          logger.error('Error fetching file:', error);
          res.status(500).json({ error: 'Failed to fetch file' });
          return;
        }
      }
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
            include: { node: true }
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
              content: content 
            },
            auth: {
              username: 'Airlink',
              password: server.node.key
            }
          });
    
          res.json({ success: true });
          return;
        } catch (error) {
          logger.error('Error saving file:', error);
          res.status(500).json({ error: 'Failed to save file' });
          return;
        }
      }
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
            include: { node: true }
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
              path: filePath
            },
            auth: {
              username: 'Airlink',
              password: server.node.key
            }
          });
    
          res.json({ success: true });
          return;
        } catch (error) {
          logger.error('Error deleting file:', error);
          res.status(500).json({ error: 'Failed to delete file' });
          return;
        }
      }
    );

    return router;
  },
};

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit();
});

export default dashboardModule;
