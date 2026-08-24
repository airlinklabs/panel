import type { Request, Response } from 'express';
import { Router } from 'express';
import type { Module } from '../../handlers/moduleInit';
import logger from '../../handlers/logger';
import os from 'os';
import prisma from '../../db';
import { checkNodeStatus, checkNodeStatusUncached } from '../../handlers/utils/node/nodeStatus';
import { isAuthenticated, requireApiAuth } from '../../handlers/utils/auth/authUtil';
import { cache } from '../../handlers/cache';

const coreModule: Module = {
  info: {
    name: 'Core Module',
    description: 'This file is for all core functionality.',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'AirLinkLab',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get('/api/system/status', isAuthenticated(true), async (_req: Request, res: Response) => {
      try {
        const systemInfo = {
          hostname: os.hostname(),
          platform: os.platform(),
          arch: os.arch(),
          cpus: os.cpus().length,
          memory: {
            total: Math.round(os.totalmem() / (1024 * 1024 * 1024) * 100) / 100,
            free: Math.round(os.freemem() / (1024 * 1024 * 1024) * 100) / 100,
          },
          uptime: Math.floor(os.uptime() / 60),
        };

        const nodes = await prisma.node.findMany();
        const nodeStatuses = await Promise.all(
          nodes.map(async (node) => {
            try {
              const nodeWithStatus = await checkNodeStatus(node);
              return nodeWithStatus;
            } catch (error) {
              logger.error(`Error checking node status for ${node.name}:`, error);
              return { ...node, status: 'Error', error: 'Failed to check status' };
            }
          })
        );

        const serverCount = await prisma.server.count();
        const userCount = await prisma.users.count();

        res.json({
          system: systemInfo,
          nodes: nodeStatuses,
          stats: {
            servers: serverCount,
            users: userCount,
            nodes: nodes.length,
          },
        });
      } catch (error) {
        logger.error('Error fetching system status:', error);
        res.status(500).json({ error: 'Failed to fetch system status' });
      }
    });

    router.get('/api/health', (_req: Request, res: Response) => {
      res.status(200).json({ status: 'ok' });
    });

    router.post('/api/system/test-node-connection', isAuthenticated(true), async (req: Request, res: Response) => {
      try {
        const { address, port, key } = req.body;

        if (typeof address !== 'string' || address.trim() === '') {
          res.status(400).json({ error: 'address must be a non-empty string' });
          return;
        }
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          res.status(400).json({ error: 'port must be an integer between 1 and 65535' });
          return;
        }
        if (typeof key !== 'string' || key.trim() === '') {
          res.status(400).json({ error: 'key must be a non-empty string' });
          return;
        }

        const testNode = { address: address.trim(), port, key };

        const nodeWithStatus = await checkNodeStatusUncached(testNode);

        if (nodeWithStatus.status === 'Offline') {
          res.status(400).json({ 
            success: false, 
            message: 'Failed to connect to node', 
            error: nodeWithStatus.error 
          });
          return;
        }
        res.json({
          success: true,
          message: 'Successfully connected to node',
          version: nodeWithStatus.versionRelease,
          status: nodeWithStatus.status,
        });
      } catch (error) {
        logger.error('Error testing node connection:', error);
        res.status(500).json({ 
          success: false, 
          message: 'Error testing node connection', 
          error: 'Failed to test node connection' 
        });
        return;
      }
    });

    router.get('/api/search', requireApiAuth, async (req: Request, res: Response) => {
      const userId = req.session.user?.id;
      if (!userId) {return res.status(401).json({ results: [] });}

      const qRaw = String(req.query.q || '').trim().toLowerCase();
      if (!qRaw) {return res.json({ results: [] });}

      try {
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) {return res.status(401).json({ results: [] });}

        // Cache search results per user+query for 30 seconds to avoid
        // repeated DB hits from the search-as-you-type frontend.
        const cacheKey = `search:${userId}:${qRaw}`;
        const cached = await cache.get<{ type: string; label: string; sub: string; url: string; score: number }[]>(cacheKey);
        if (cached) {return res.json({ results: cached });}

        interface SearchItem { type: string; label: string; sub: string; url: string; score: number }

        const normalize = (s: string): string =>
          s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

        const qNorm = normalize(qRaw);
        const tokens = qNorm.split(' ').filter(Boolean);
        if (tokens.length === 0) {return res.json({ results: [] });}

        const levenshtein = (a: string, b: string): number => {
          const m = a.length;
          const n = b.length;
          if (!m) {return n;}
          if (!n) {return m;}
          let prev: number[] = Array.from({ length: n + 1 }, (_, j) => j);
          let curr: number[] = new Array(n + 1).fill(0);
          for (let i = 1; i <= m; i++) {
            curr[0] = i;
            for (let j = 1; j <= n; j++) {
              const del = prev[j]! + 1;
              const ins = curr[j - 1]! + 1;
              const sub = prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
              curr[j] = Math.min(del, ins, sub);
            }
            const tmp = prev;
            prev = curr;
            curr = tmp;
          }
          return prev[n]!;
        };

        const fuzzyOk = (token: string, hay: string): boolean => {
          if (token.length < 4) {return false;}
          return hay
            .split(/\s+/)
            .some((w) => Math.abs(w.length - token.length) <= 1 && levenshtein(w, token) <= 1);
        };

        const scoreFields = (fields: string[]): number => {
          let best = 0;
          for (const raw of fields) {
            const f = normalize(raw);
            let s = 0;
            if (f === qNorm) {s = 100;}
            else if (f.startsWith(qNorm)) {s = 80;}
            else if (f.includes(qNorm)) {s = 60;}
            else if (tokens.length > 1 && tokens.every((t) => f.includes(t))) {s = 45;}
            else if (tokens.some((t) => f.includes(t))) {s = 30;}
            else if (tokens.some((t) => fuzzyOk(t, f))) {s = 15;}
            best = Math.max(best, s);
          }
          return best;
        };

        const results: SearchItem[] = [];

        const tokenFieldOrs = (fields: string[]) =>
          tokens.flatMap((t) => fields.map((f) => ({ [f]: { contains: t } })));

        const whereClause = user.isAdmin
          ? { OR: tokenFieldOrs(['name', 'description', 'UUID']) }
          : { ownerId: userId, OR: tokenFieldOrs(['name', 'description', 'UUID']) };

        let servers = await prisma.server.findMany({
          where: whereClause as never,
          select: { UUID: true, name: true, description: true },
          take: 30,
        });

        if (servers.length === 0) {
          servers = await prisma.server.findMany({
            where: user.isAdmin ? undefined : { ownerId: userId },
            select: { UUID: true, name: true, description: true },
            orderBy: { id: 'desc' },
            take: 100,
          });
        }

        servers.forEach((s) => {
          const score = scoreFields([s.name, s.description || '', s.UUID]);
          if (score > 0) {
            results.push({ type: 'server', label: s.name, sub: s.description || s.UUID, url: `/server/${s.UUID}`, score });
          }
        });

        const serverFeatures = [
          { name: 'Console', suffix: '', kw: 'console terminal status power start stop restart kill' },
          { name: 'Files', suffix: '/files', kw: 'files file manager sftp upload download' },
          { name: 'Backups', suffix: '/backups', kw: 'backup backups restore snapshot' },
          { name: 'Players', suffix: '/players', kw: 'players player list whitelist' },
          { name: 'Worlds', suffix: '/worlds', kw: 'worlds world map save' },
          { name: 'Startup', suffix: '/startup', kw: 'startup command variables cmd' },
          { name: 'Settings', suffix: '/settings', kw: 'server settings rename' },
        ];

        const featureMatches = serverFeatures.filter((f) => scoreFields([f.kw]) > 0);
        if (featureMatches.length > 0) {
          const featServers = await prisma.server.findMany({
            where: user.isAdmin ? undefined : { ownerId: userId },
            select: { UUID: true, name: true },
            orderBy: { id: 'desc' },
            take: 5,
          });
          featureMatches.slice(0, 3).forEach((f) => {
            const score = scoreFields([f.kw]);
            featServers.slice(0, 4).forEach((s) => {
              results.push({ type: 'feature', label: f.name, sub: s.name, url: `/server/${s.UUID}${f.suffix}`, score });
            });
          });
        }

        if (user.isAdmin) {
          let users = await prisma.users.findMany({
            where: { OR: tokenFieldOrs(['username', 'email']) },
            select: { id: true, username: true, email: true },
            take: 20,
          });
          if (users.length === 0) {
            users = await prisma.users.findMany({
              select: { id: true, username: true, email: true },
              orderBy: { id: 'desc' },
              take: 50,
            });
          }
          users.forEach((u) => {
            const score = scoreFields([u.username || '', u.email || '']);
            if (score > 0) {
              results.push({ type: 'user', label: u.username ?? '', sub: u.email ?? '', url: `/admin/users/view/${u.id}/`, score });
            }
          });

          let nodes = await prisma.node.findMany({
            where: { OR: tokenFieldOrs(['name', 'address']) },
            select: { id: true, name: true, address: true },
            take: 15,
          });
          if (nodes.length === 0) {
            nodes = await prisma.node.findMany({
              select: { id: true, name: true, address: true },
              orderBy: { id: 'desc' },
              take: 30,
            });
          }
          nodes.forEach((n) => {
            const score = scoreFields([n.name, n.address]);
            if (score > 0) {
              results.push({ type: 'node', label: n.name, sub: n.address, url: `/admin/node/${n.id}/stats`, score });
            }
          });
        }

        results.sort((a, b) => b.score - a.score);
        // Store in Redis for 30 seconds.
        await cache.set(cacheKey, results, 30);
        return res.json({ results });
      } catch (err) {
        logger.error('Search error:', err);
        res.status(500).json({ results: [] });
        return;
      }
    });

    // Local deterministic avatar generation. Replaces the remote DiceBear API
    // that was used as the default avatar in layouts across the panel.
    // The seed is the (already escaped) avatar seed — render an SVG locally.
    // Only the seed matters; the route is public and content is static per seed.
    router.get('/avatar/:seed', async (req: Request, res: Response) => {
      const { avatarSvg, isValidAvatarSeed } = await import('../../utils/avatar');
      const seed = Array.isArray(req.params.seed) ? req.params.seed[0] : req.params.seed;
      if (!isValidAvatarSeed(seed)) {
        res.status(400).type('text/plain').send('invalid avatar seed');
        return;
      }
      try {
        const svg = await avatarSvg(seed);
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=86400');
        res.send(svg);
      } catch (error) {
        logger.error('Avatar generation failed:', error);
        res.status(500).type('text/plain').send('avatar generation failed');
      }
    });

    return router;
  },
};

export default coreModule;
