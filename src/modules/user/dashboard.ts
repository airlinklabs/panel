import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import { getUser } from '../../handlers/utils/user/user';
import logger from '../../handlers/logger';
import axios from 'axios';
import { daemonSchemeSync } from '../../handlers/utils/core/daemonRequest';


interface ErrorMessage {
  message?: string;
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

    router.get('/', isAuthenticated(), async (req: Request, res: Response) => {
      const errorMessage: ErrorMessage = {};
      const userId = req.session?.user?.id;
      try {
        const [user, settings] = await Promise.all([
          prisma.users.findUnique({ where: { id: userId } }),
          prisma.settings.findUnique({ where: { id: 1 } }),
        ]);
        if (!user) {
          errorMessage.message = 'User not found.';
          res.render('user/dashboard', { errorMessage, user, req });
          return;
        }

        const servers = await prisma.server.findMany({
          where: { ownerId: user.id },
          include: { node: true, owner: true },
        });

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

        let anyNodeOffline = false;
        const nodeStatuses: Record<number, { online: boolean }> = {};

        for (const server of servers) {
          if (!nodeStatuses[server.node.id]) {
            try {
              const nodeResponse = await axios({
                method: 'GET',
                url: `${daemonSchemeSync()}://${server.node.address}:${server.node.port}`,
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

        if (anyNodeOffline) {
          const folders = await prisma.serverFolder.findMany({
            where: { ownerId: user.id },
            include: { members: true },
            orderBy: { createdAt: 'asc' },
          });
          const settings2 = await prisma.settings.findUnique({ where: { id: 1 } });
          const userServerLimit = user.serverLimit !== null && user.serverLimit !== undefined
            ? user.serverLimit
            : (settings2?.defaultServerLimit ?? 0);
          const canCreateServer = !user.isAdmin && (settings2?.allowUserCreateServer ?? false) && userServerLimit > 0;

          return res.render('user/dashboard', {
            errorMessage: {
              message:
                'One or more nodes are offline. Some server information may be unavailable.',
            },
            user,
            req,
            settings,
            servers,
            allServers: servers,
            folders,
            canCreateServer,
            currentPage: 1,
            totalPages: 1,
            daemonOffline: true,
            nodeStatuses,
          });
        }

        const serversWithStats = await Promise.all(
          servers.map(async (server) => {
            try {
              if (
                nodeStatuses[server.node.id] &&
                !nodeStatuses[server.node.id].online
              ) {
                return {
                  ...server,
                  status: 'unknown',
                  ramUsage: '0',
                  cpuUsage: '0',
                  ramUsed: '0MB',
                  nodeOffline: true,
                };
              }

              const statusResponse = await axios({
                method: 'GET',
                url: `${daemonSchemeSync()}://${server.node.address}:${server.node.port}/container/status`,
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
              let ramUsed = '0MB';

              if (isRunning) {
                try {
                  const statsResponse = await axios({
                    method: 'GET',
                    url: `${daemonSchemeSync()}://${server.node.address}:${server.node.port}/container/stats`,
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

                    const memUsageBytes = statsResponse.data.memory?.usage || 0;
                    const memUsageMB = memUsageBytes / (1024 * 1024);
                    ramUsed = memUsageMB >= 1024
                      ? `${(memUsageMB / 1024).toFixed(1)}GB`
                      : `${memUsageMB.toFixed(0)}MB`;
                  }
                } catch (statsError) {
                  if (axios.isAxiosError(statsError)) {
                    if (
                      statsError.code !== 'ECONNREFUSED' &&
                      statsError.code !== 'ETIMEDOUT' &&
                      statsError.code !== 'ENOTFOUND'
                    ) {
                      logger.error(
                        `Error fetching stats for server ${server.UUID}:`,
                        statsError,
                      );
                    }
                  } else {
                    logger.error(
                      `Error fetching stats for server ${server.UUID}:`,
                      statsError,
                    );
                  }
                }
              }

              return {
                ...server,
                status: isRunning ? 'running' : 'stopped',
                ramUsage,
                cpuUsage,
                ramUsed,
                nodeOffline: false,
              };
            } catch (error) {
              logger.error(
                `Error fetching status for server ${server.UUID}:`,
                error,
              );
              return {
                ...server,
                status: 'unknown',
                ramUsage: '0',
                cpuUsage: '0',
                ramUsed: '0MB',
                nodeOffline: true,
              };
            }
          }),
        );

        const paginatedServers = serversWithStats.slice(startIndex, endIndex);

        const folders = await prisma.serverFolder.findMany({
          where: { ownerId: user.id },
          include: { members: true },
          orderBy: { createdAt: 'asc' },
        });

        const settings2 = await prisma.settings.findUnique({ where: { id: 1 } });
        const userServerLimit = user.serverLimit !== null && user.serverLimit !== undefined
          ? user.serverLimit
          : (settings2?.defaultServerLimit ?? 0);
        const canCreateServer = !user.isAdmin && (settings2?.allowUserCreateServer ?? false) && userServerLimit > 0;

        res.render('user/dashboard', {
          errorMessage,
          user,
          req,
          settings,
          servers: paginatedServers,
          allServers: serversWithStats,
          folders,
          canCreateServer,
          currentPage: page,
          totalPages: Math.ceil(servers.length / perPage),
          title: 'Servers',
        });
      } catch (error) {
        logger.error('Error fetching user:', error);
        errorMessage.message = 'Error fetching user data.';
        res.render('user/dashboard', {
          errorMessage,
          user: getUser(req),
          req,
          settings: null,
        });
      }
    });

    return router;
  },
};


export default dashboardModule;
