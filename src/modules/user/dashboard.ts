import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { PrismaClient } from '@prisma/client';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import { getUser } from '../../handlers/utils/user/user';
import logger from '../../handlers/logger';
import axios from 'axios';

const prisma = new PrismaClient();

interface ErrorMessage {
  message?: string;
}

async function getDashboardContent(req: Request, res: Response): Promise<string> {
  const ejs = require('ejs');
  const path = require('path');

  try {
    const userId = req.session?.user?.id;
    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    const servers = await prisma.server.findMany({
      where: { ownerId: user.id },
      include: { node: true, owner: true },
    });
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });

    let page: number = 1;
    if (typeof req.query.page === 'string') {
      page = parseInt(req.query.page, 10);
    }
    if (isNaN(page)) {
      page = 1;
    }

    const perPage = 8;
    const startIndex = (page - 1) * perPage;
    const endIndex = page * perPage;

    // Check node statuses and get server stats (simplified for initial load)
    const serversWithStats = await Promise.all(
      servers.map(async (server) => {
        try {
          // For initial load, we'll use cached/default values
          return {
            ...server,
            status: 'unknown',
            ramUsage: '0',
            cpuUsage: '0',
            ramLimit: '1GB',
            nodeOffline: false
          };
        } catch (error) {
          return {
            ...server,
            status: 'unknown',
            ramUsage: '0',
            cpuUsage: '0',
            ramLimit: '1GB',
            nodeOffline: true
          };
        }
      })
    );

    const paginatedServers = serversWithStats.slice(startIndex, endIndex);

    const templatePath = path.resolve(process.cwd(), 'views/user/dashboard-spa.ejs');
    return await new Promise((resolve, reject) => {
      ejs.renderFile(templatePath, {
        user,
        req,
        settings,
        servers: paginatedServers,
        currentPage: page,
        totalPages: Math.ceil(servers.length / perPage),
        errorMessage: {}
      }, (err: any, html: string) => {
        if (err) reject(err);
        else resolve(html);
      });
    });
  } catch (error) {
    logger.error('Error getting dashboard content:', error);
    return '<div class="text-center mt-8"><p class="text-red-500">Error loading dashboard content</p></div>';
  }
}

const dashboardModule: Module = {
  info: {
    name: 'Dashboard Module',
    description: 'This file is for dashboard functionality.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    // SPA entry point route
    router.get('/spa', isAuthenticated(), async (req: Request, res: Response) => {
      try {
        const userId = req.session?.user?.id;
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          return res.redirect('/login');
        }

        const settings = await prisma.settings.findUnique({ where: { id: 1 } });

        // Render the initial SPA layout with dashboard content
        const dashboardContent = await getDashboardContent(req, res);

        res.render('spa-app', {
          user,
          req,
          settings,
          title: 'Servers',
          content: dashboardContent
        });
      } catch (error) {
        logger.error('Error loading SPA:', error);
        res.redirect('/');
      }
    });

    router.get('/', isAuthenticated(), async (req: Request, res: Response) => {
      const errorMessage: ErrorMessage = {};
      try {
        const userId = req.session?.user?.id;
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {
          errorMessage.message = 'User not found.';
          res.render('user/dashboard', { errorMessage, user, req });
          return;
        }

        const servers = await prisma.server.findMany({
          where: { ownerId: user.id },
          include: { node: true, owner: true },
        });
        const settings = await prisma.settings.findUnique({ where: { id: 1 } });

        let page: number = 1;

        if (typeof req.query.page === 'string') {
          page = parseInt(req.query.page, 10);
        }

        if (isNaN(page)) {
          page = 1;
        }

        const perPage = 8;
        const startIndex = (page - 1) * perPage;
        const endIndex = page * perPage;

        // Check if any node is offline
        let anyNodeOffline = false;
        const nodeStatuses: Record<number, { online: boolean }> = {};

        // First check node statuses
        for (const server of servers) {
          if (!nodeStatuses[server.node.id]) {
            try {
              const nodeResponse = await axios({
                method: 'GET',
                url: `http://${server.node.address}:${server.node.port}`,
                auth: {
                  username: 'Airlink',
                  password: server.node.key,
                },
                timeout: 2000,
              });
              nodeStatuses[server.node.id] = { online: true };
            } catch (error) {
              // Silently handle node offline errors - don't log to console
              // Just mark the node as offline in our status tracking
              nodeStatuses[server.node.id] = { online: false };
              anyNodeOffline = true;
            }
          }
        }

        // If any node is offline, render the page with a daemon offline error
        if (anyNodeOffline) {
          return res.render('user/dashboard', {
            errorMessage: { message: 'One or more nodes are offline. Some server information may be unavailable.' },
            user,
            req,
            settings,
            servers,
            currentPage: 1,
            totalPages: 1,
            daemonOffline: true,
            nodeStatuses
          });
        }

        const serversWithStats = await Promise.all(
          servers.map(async (server) => {
            try {
              // Skip servers on offline nodes
              if (nodeStatuses[server.node.id] && !nodeStatuses[server.node.id].online) {
                return {
                  ...server,
                  status: 'unknown',
                  ramUsage: '0',
                  cpuUsage: '0',
                  ramLimit: '1GB',
                  nodeOffline: true
                };
              }

              const statusResponse = await axios({
                method: 'GET',
                url: `http://${server.node.address}:${server.node.port}/container/status`,
                auth: {
                  username: 'Airlink',
                  password: server.node.key,
                },
                params: { id: server.UUID },
                timeout: 2000,
              });

              const isRunning = statusResponse.data?.running === true;
              let ramUsage = '0';
              let cpuUsage = '0';
              let ramLimit = '1GB';

              if (isRunning) {
                try {
                  const statsResponse = await axios({
                    method: 'GET',
                    url: `http://${server.node.address}:${server.node.port}/container/stats`,
                    auth: {
                      username: 'Airlink',
                      password: server.node.key,
                    },
                    params: { id: server.UUID },
                    timeout: 2000,
                  });

                  if (statsResponse.data) {
                    ramUsage = statsResponse.data.memory?.percentage || '0';
                    cpuUsage = statsResponse.data.cpu?.percentage || '0';

                    const memLimitBytes = statsResponse.data.memory?.limit || 0;
                    const memLimitGB = (memLimitBytes / (1024 * 1024 * 1024)).toFixed(1);
                    ramLimit = `${memLimitGB}GB`;
                  }
                } catch (statsError) {
                  // Only log error if it's not a connection error (daemon offline)
                  if (axios.isAxiosError(statsError)) {
                    if (statsError.code !== 'ECONNREFUSED' && statsError.code !== 'ETIMEDOUT' && statsError.code !== 'ENOTFOUND') {
                      logger.error(`Error fetching stats for server ${server.UUID}:`, statsError);
                    }
                  } else {
                    logger.error(`Error fetching stats for server ${server.UUID}:`, statsError);
                  }
                }
              }

              return {
                ...server,
                status: isRunning ? 'running' : 'stopped',
                ramUsage,
                cpuUsage,
                ramLimit,
                nodeOffline: false
              };
            } catch (error) {
              logger.error(`Error fetching status for server ${server.UUID}:`, error);
              return {
                ...server,
                status: 'unknown',
                ramUsage: '0',
                cpuUsage: '0',
                ramLimit: '1GB',
                nodeOffline: true
              };
            }
          })
        );

        const paginatedServers = serversWithStats.slice(startIndex, endIndex);

        // For initial page load, use SPA layout; for AJAX requests, use SPA content template
        const template = res.locals.isSPA ? 'user/dashboard' : 'user/dashboard';

        res.render(template, {
          errorMessage,
          user,
          req,
          settings,
          servers: paginatedServers,
          currentPage: page,
          totalPages: Math.ceil(servers.length / perPage),
          title: 'Servers'
        });
      } catch (error) {
        logger.error('Error fetching user:', error);
        errorMessage.message = 'Error fetching user data.';
        const settings = await prisma.settings.findUnique({ where: { id: 1 } });
        res.render('user/dashboard', {
          errorMessage,
          user: getUser(req),
          req,
          settings,
        });
      }
    });

    return router;
  },
};

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit();
});

export default dashboardModule;
