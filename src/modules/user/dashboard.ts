import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import { getUser } from '../../handlers/utils/user/user';
import logger from '../../handlers/logger';
import { daemonRequest } from '../../handlers/utils/core/daemonRequest';


interface ErrorMessage {
  message?: string;
}

const dashboardModule: Module = {
  info: {
    name: 'Dashboard Module',
    description: 'This file is for dashboard functionality.',
    version: '2.0.0',
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

        // Servers the user has been granted subuser access to.
        const subUserServers = await prisma.subUser.findMany({
          where: { userId: user.id },
          include: { server: { include: { node: true, owner: true } } },
        });

        const ownedUuids = new Set(servers.map((s) => s.UUID));
        const mergedServers = [
          ...servers,
          ...subUserServers
            .filter((su) => !ownedUuids.has(su.server.UUID))
            .map((su) => ({ ...su.server, shared: true })),
        ];

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
        const nodeStatuses: Record<number, { online: boolean; reason?: string }> = {};

        for (const server of mergedServers) {
          if (!nodeStatuses[server.node.id]) {
            try {
              await daemonRequest({
                nodeAddress: server.node.address,
                nodePort: server.node.port,
                nodeKey: server.node.key,
                method: 'GET',
                path: '/',
                timeout: 2000,
              });
              nodeStatuses[server.node.id] = { online: true };
            } catch (err: any) {
              // Silently handle node offline errors - don't log to console
              // Just mark the node as offline in our status tracking
              const code = err?.code;
              const reason =
                code === 'ECONNREFUSED'
                  ? 'daemon unreachable'
                  : code === 'ETIMEDOUT' || code === 'ECONNABORTED'
                    ? 'connection timed out'
                    : code === 'ENOTFOUND'
                      ? 'host not found'
                      : 'unreachable';
              nodeStatuses[server.node.id] = { online: false, reason };
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

          const offlineNodes = mergedServers
            .filter((s) => !nodeStatuses[s.node.id]?.online)
            .reduce<Record<number, { name: string; reason: string }>>((acc, s) => {
              if (!acc[s.node.id]) {
                acc[s.node.id] = {
                  name: s.node.name,
                  reason: nodeStatuses[s.node.id]?.reason ?? 'unreachable',
                };
              }
              return acc;
            }, {});

          return res.render('user/dashboard', {
            errorMessage: {
              message:
                'One or more nodes are offline. Some server information may be unavailable.',
            },
            user,
            req,
            settings,
            servers: mergedServers,
            allServers: mergedServers,
            folders,
            canCreateServer,
            currentPage: 1,
            totalPages: 1,
            daemonOffline: true,
            nodeStatuses,
            offlineNodes: Object.values(offlineNodes),
          });
        }

        const serversWithStats = await Promise.all(
          mergedServers.map(async (server) => {
            try {
              if (
                nodeStatuses[server.node.id] &&
                !nodeStatuses[server.node.id]?.online
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

              const statusResponse = await daemonRequest({
                nodeAddress: server.node.address,
                nodePort: server.node.port,
                nodeKey: server.node.key,
                method: 'GET',
                path: '/container/status',
                params: { id: server.UUID },
                timeout: 2000,
              });

              const isRunning = (statusResponse.data as any)?.running === true;
              let ramUsage = '0';
              let cpuUsage = '0';
              let ramUsed = '0MB';

              if (isRunning) {
                try {
                  const statsResponse = await daemonRequest({
                    nodeAddress: server.node.address,
                    nodePort: server.node.port,
                    nodeKey: server.node.key,
                    method: 'GET',
                    path: '/container/stats',
                    params: { id: server.UUID },
                    timeout: 2000,
                  });

                  if (statsResponse.data) {
                    const rawRam = Number((statsResponse.data as any).memory?.percentage) || 0;
                    const rawCpu = Number((statsResponse.data as any).cpu?.percentage) || 0;
                    ramUsage = String(Math.round(rawRam * 100) / 100);
                    cpuUsage = String(Math.round(rawCpu * 100) / 100);

                    const memUsageBytes = (statsResponse.data as any).memory?.usage || 0;
                    const memUsageMB = memUsageBytes / (1024 * 1024);
                    ramUsed = memUsageMB >= 1024
                      ? `${(memUsageMB / 1024).toFixed(1)}GB`
                      : `${memUsageMB.toFixed(0)}MB`;
                  }
                } catch (statsError) {
                  if (statsError instanceof Error && 'status' in statsError) {
                    const httpErr = statsError as { code?: string };
                    if (
                      httpErr.code !== 'ECONNREFUSED' &&
                      httpErr.code !== 'ETIMEDOUT' &&
                      httpErr.code !== 'ENOTFOUND'
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
          totalPages: Math.ceil(mergedServers.length / perPage),
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
