import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import axios from 'axios';
import { registerPermission } from '../../handlers/permisions';
import { daemonSchemeSync } from '../../handlers/utils/core/daemonRequest';


registerPermission('airlink.admin.analytics.view');

interface ErrorMessage {
  message?: string;
}

const analyticsModule: Module = {
  info: {
    name: 'Admin Analytics Module',
    description: 'This file provides analytics dashboard for the admin panel.',
    version: '1.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get(
      '/admin/analytics',
      isAuthenticated(true, 'airlink.admin.analytics.view'),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const [user, settings] = await Promise.all([
            prisma.users.findUnique({ where: { id: userId } }),
            prisma.settings.findUnique({ where: { id: 1 } }),
          ]);
          if (!user) return res.redirect('/login');
          res.render('admin/analytics/analytics', { user, req, settings, title: 'Analytics' });
        } catch (error) {
          logger.error('Error loading analytics page:', error);
          res.redirect('/admin/overview');
        }
      },
    );

    // Single endpoint that returns everything the analytics page needs
    router.get(
      '/api/admin/analytics/summary',
      isAuthenticated(true, 'airlink.admin.analytics.view'),
      async (_req: Request, res: Response) => {
        try {
          const [servers, users, nodes, images, loginHistory, playerHistory] = await Promise.all([
            prisma.server.findMany({ include: { node: true, image: true, owner: { select: { username: true } } } }),
            prisma.users.findMany({ select: { id: true, isAdmin: true } }),
            prisma.node.findMany(),
            prisma.images.findMany({ select: { id: true, name: true } }),
            prisma.loginHistory.findMany({
              orderBy: { timestamp: 'desc' },
              take: 200,
              select: { userId: true, ipAddress: true, timestamp: true },
            }),
            prisma.playerStats.findMany({
              orderBy: { timestamp: 'asc' },
              take: 288,
            }),
          ]);

          // — Servers section
          const totalAllocatedRam     = servers.reduce((s, srv) => s + (srv.Memory  || 0), 0);
          const totalAllocatedCpu     = servers.reduce((s, srv) => s + (srv.Cpu     || 0), 0);
          const totalAllocatedStorage = servers.reduce((s, srv) => s + (srv.Storage || 0), 0);

          const imageCounts: Record<string, { name: string | null; count: number }> = {};
          images.forEach(img => { imageCounts[img.id] = { name: img.name, count: 0 }; });
          servers.forEach(srv => { if (imageCounts[srv.imageId]) imageCounts[srv.imageId].count++; });
          const topImages = Object.values(imageCounts)
            .sort((a, b) => b.count - a.count)
            .filter(i => i.count > 0)
            .slice(0, 6);

          // Top servers by RAM allocated
          const topServers = [...servers]
            .sort((a, b) => b.Memory - a.Memory)
            .slice(0, 6)
            .map(s => ({
              name:    s.name,
              uuid:    s.UUID,
              memory:  s.Memory,
              cpu:     s.Cpu,
              storage: s.Storage,
              owner:   s.owner?.username ?? '—',
              image:   s.image?.name ?? '—',
              suspended: s.Suspended,
            }));

          // — Nodes section: check daemon health for each node
          const TIMEOUT = parseInt(process.env.DAEMON_TIMEOUT || '4000');
          const nodeStatuses = await Promise.all(
            nodes.map(async node => {
              const serverCount = servers.filter(s => s.nodeId === node.id).length;
              try {
                const r = await axios({
                  method: 'get',
                  url: `${daemonSchemeSync()}://${node.address}:${node.port}`,
                  auth: { username: 'Airlink', password: node.key },
                  timeout: TIMEOUT,
                });
                return {
                  id:             node.id,
                  name:           node.name,
                  address:        node.address,
                  port:           node.port,
                  online:         true,
                  serverCount,
                  ram:            node.ram,
                  cpu:            node.cpu,
                  disk:           node.disk,
                  versionFamily:  r.data?.versionFamily ?? null,
                  versionRelease: r.data?.versionRelease ?? null,
                };
              } catch {
                return {
                  id:         node.id,
                  name:       node.name,
                  address:    node.address,
                  port:       node.port,
                  online:     false,
                  serverCount,
                  ram:        node.ram,
                  cpu:        node.cpu,
                  disk:       node.disk,
                };
              }
            }),
          );

          // — Activity section
          const adminCount   = users.filter(u => u.isAdmin).length;
          const last30Days   = new Date(); last30Days.setDate(last30Days.getDate() - 30);
          const recentLogins = loginHistory.filter(l => new Date(l.timestamp) >= last30Days);

          const loginsByDay: Record<string, number> = {};
          for (let i = 29; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            loginsByDay[d.toISOString().slice(0, 10)] = 0;
          }
          recentLogins.forEach(l => {
            const key = new Date(l.timestamp).toISOString().slice(0, 10);
            if (loginsByDay[key] !== undefined) loginsByDay[key]++;
          });

          res.json({
            servers: {
              total:            servers.length,
              suspended:        servers.filter(s => s.Suspended).length,
              installing:       servers.filter(s => s.Installing).length,
              totalRamMb:       totalAllocatedRam,
              totalCpuPct:      totalAllocatedCpu,
              totalStorageGb:   totalAllocatedStorage,
              topImages,
              topServers,
            },
            nodes: nodeStatuses,
            activity: {
              totalUsers:   users.length,
              adminCount,
              totalImages:  images.length,
              loginsByDay,
              recentLogins: loginHistory.slice(0, 10),
              playerHistory,
            },
          });
        } catch (error) {
          logger.error('Error fetching analytics summary:', error);
          res.status(500).json({ error: 'Failed to fetch analytics' });
        }
      },
    );

    return router;
  },
};

export default analyticsModule;