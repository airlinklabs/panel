import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import { getUser } from '../../handlers/utils/user/user';
import logger from '../../handlers/logger';
import { daemonRequest } from '../../handlers/utils/core/daemonRequest';
import type { ErrorMessage } from './server/shared';

interface ServerSnapshot {
  status: string;
  dockerStatus: string | null;
  ramUsage: string;
  cpuUsage: string;
  ramUsed: string;
  nodeOffline: boolean;
}

interface CachedServerSnapshot extends ServerSnapshot {
  fetchedAt: number;
}

interface NodeHealth {
  online: boolean;
  reason?: string;
}

interface CachedNodeHealth extends NodeHealth {
  checkedAt: number;
}

// Stale-while-revalidate caches. Fresh entries are served without touching
// the daemon; stale entries are served immediately while a background fetch
// refreshes them; missing entries are fetched synchronously (cold path).
const NODE_TTL = 15_000;
const SERVER_TTL = 8_000;
const nodeHealthCache = new Map<number, CachedNodeHealth>();
const serverSnapshotCache = new Map<string, CachedServerSnapshot>();
const nodeHealthFetches = new Map<number, Promise<CachedNodeHealth>>();
const serverSnapshotFetches = new Map<string, Promise<CachedServerSnapshot>>();

function errCodeToReason(code?: string): string {
  return code === 'ECONNREFUSED'
    ? 'daemon unreachable'
    : code === 'ETIMEDOUT' || code === 'ECONNABORTED'
      ? 'connection timed out'
      : code === 'ENOTFOUND'
        ? 'host not found'
        : 'unreachable';
}

function checkNodeHealth(node: { id: number; address: string; port: number; key: string }): Promise<CachedNodeHealth> {
  if (nodeHealthFetches.has(node.id)) return nodeHealthFetches.get(node.id)!;
  const fetch = (async () => {
    const checkedAt = Date.now();
    try {
      await daemonRequest({
        nodeAddress: node.address,
        nodePort: node.port,
        nodeKey: node.key,
        method: 'GET',
        path: '/',
        timeout: 2000,
      });
      const health: CachedNodeHealth = { online: true, checkedAt };
      nodeHealthCache.set(node.id, health);
      return health;
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : undefined;
      const health: CachedNodeHealth = { online: false, reason: errCodeToReason(code), checkedAt };
      nodeHealthCache.set(node.id, health);
      return health;
    }
  })();
  nodeHealthFetches.set(node.id, fetch);
  fetch.finally(() => nodeHealthFetches.delete(node.id));
  return fetch;
}

function fetchServerSnapshot(
  node: { address: string; port: number; key: string },
  uuid: string,
): Promise<CachedServerSnapshot> {
  if (serverSnapshotFetches.has(uuid)) return serverSnapshotFetches.get(uuid)!;
  const fetch = (async () => {
    const fetchedAt = Date.now();
    const snapshot: CachedServerSnapshot = {
      status: 'unknown',
      dockerStatus: null,
      ramUsage: '0',
      cpuUsage: '0',
      ramUsed: '0MB',
      nodeOffline: true,
      fetchedAt,
    };
    try {
      const statusResponse = await daemonRequest({
        nodeAddress: node.address,
        nodePort: node.port,
        nodeKey: node.key,
        method: 'GET',
        path: '/container/status',
        params: { id: uuid },
        timeout: 2000,
      });

      const data = statusResponse.data as { running?: boolean; status?: string } | undefined;
      const isRunning = data?.running === true;
      snapshot.status = isRunning ? 'running' : 'stopped';
      const dockerStatus = data?.status;
      snapshot.dockerStatus = typeof dockerStatus === 'string' && dockerStatus.length > 0 ? dockerStatus : null;
      snapshot.nodeOffline = false;

      if (isRunning) {
        try {
          const statsResponse = await daemonRequest({
            nodeAddress: node.address,
            nodePort: node.port,
            nodeKey: node.key,
            method: 'GET',
            path: '/container/stats',
            params: { id: uuid },
            timeout: 2000,
          });

          if (statsResponse.data) {
            const statsData = statsResponse.data as {
              memory?: { percentage?: number; usage?: number };
              cpu?: { percentage?: number };
            };
            const rawRam = Number(statsData.memory?.percentage) || 0;
            const rawCpu = Number(statsData.cpu?.percentage) || 0;
            snapshot.ramUsage = String(Math.round(rawRam * 100) / 100);
            snapshot.cpuUsage = String(Math.round(rawCpu * 100) / 100);

            const memUsageBytes = statsData.memory?.usage || 0;
            const memUsageMB = memUsageBytes / (1024 * 1024);
            snapshot.ramUsed = memUsageMB >= 1024
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
              logger.error(`Error fetching stats for server ${uuid}:`, statsError);
            }
          } else {
            logger.error(`Error fetching stats for server ${uuid}:`, statsError);
          }
        }
      }

      serverSnapshotCache.set(uuid, snapshot);
      return snapshot;
    } catch (error) {
      logger.error(`Error fetching status for server ${uuid}:`, error);
      serverSnapshotCache.set(uuid, snapshot);
      return snapshot;
    }
  })();
  serverSnapshotFetches.set(uuid, fetch);
  fetch.finally(() => serverSnapshotFetches.delete(uuid));
  return fetch;
}

// Serves a node health check from cache when fresh, revalidates in the
// background when stale, and only touches the daemon synchronously when the
// cache is empty (cold path).
function getNodeHealth(
  node: { id: number; address: string; port: number; key: string },
  revalidate: boolean,
): CachedNodeHealth | Promise<CachedNodeHealth> {
  const cached = nodeHealthCache.get(node.id);
  if (cached && Date.now() - cached.checkedAt < NODE_TTL) return cached;
  if (cached) {
    if (revalidate) {
      checkNodeHealth(node).catch((err) => logger.warn('Background node health revalidation failed:', err));
    }
    return cached;
  }
  return checkNodeHealth(node);
}

function getServerSnapshot(
  node: { address: string; port: number; key: string },
  server: { UUID: string },
  revalidate: boolean,
): CachedServerSnapshot | Promise<CachedServerSnapshot> {
  const cached = serverSnapshotCache.get(server.UUID);
  if (cached && Date.now() - cached.fetchedAt < SERVER_TTL) return cached;
  if (cached) {
    if (revalidate) {
      fetchServerSnapshot(node, server.UUID).catch((err) => logger.warn('Background server snapshot revalidation failed:', err));
    }
    return cached;
  }
  return fetchServerSnapshot(node, server.UUID);
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

        const perPage = 8 as const;
        const startIndex = (page - 1) * perPage;
        const endIndex = page * perPage;

        let anyNodeOffline = false;
        const nodeStatuses: Record<number, NodeHealth> = {};

        for (const server of mergedServers) {
          if (!nodeStatuses[server.node.id]) {
            const health = await getNodeHealth(server.node, true);
            nodeStatuses[server.node.id] = health;
            if (!health.online) anyNodeOffline = true;
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
          mergedServers.map(async (server, index) => {
            const revalidate = index >= startIndex && index < endIndex;
            if (
              nodeStatuses[server.node.id] &&
              !nodeStatuses[server.node.id]?.online
            ) {
              return {
                ...server,
                status: 'unknown',
                dockerStatus: null,
                ramUsage: '0',
                cpuUsage: '0',
                ramUsed: '0MB',
                nodeOffline: true,
              };
            }

            const snapshot = await getServerSnapshot(server.node, server, revalidate);

            return {
              ...server,
              status: snapshot.status,
              dockerStatus: snapshot.dockerStatus,
              ramUsage: snapshot.ramUsage,
              cpuUsage: snapshot.cpuUsage,
              ramUsed: snapshot.ramUsed,
              nodeOffline: snapshot.nodeOffline,
            };
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
