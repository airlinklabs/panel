/**
 * V2 API — System endpoints.
 *
 * GET  /api/v2/system/status    — System status
 * GET  /api/v2/system/health    — Health check
 * POST /api/v2/system/test-node — Test node connection
 */

import { Router } from 'express';
import prisma from '../../../db';
import { jsonOk, jsonError, requireUser } from './helpers';
import { daemonRequestDirect } from '../../../services/daemonService';
import { cache } from '../../../handlers/cache';
import logger from '../../../handlers/logger';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v2/system/status — System status
// ---------------------------------------------------------------------------
router.get("/status", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const [serverCount, nodeCount, userCount] = await Promise.all([
    prisma.server.count(),
    prisma.node.count(),
    prisma.users.count(),
  ]);

  jsonOk(res, {
    version: process.env.AIRLINK_VERSION ?? "2.0.0",
    servers: serverCount,
    nodes: nodeCount,
    users: userCount,
    uptime: process.uptime(),
  });
});

// ---------------------------------------------------------------------------
// GET /api/v2/system/health — Health check
// ---------------------------------------------------------------------------
router.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    jsonOk(res, { status: "healthy", database: "connected" });
  } catch {
    jsonOk(res, { status: "degraded", database: "disconnected" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v2/system/test-node — Test node connection
// ---------------------------------------------------------------------------
router.post("/test-node", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }
  if (!user.isAdmin) {
    return jsonError(res, "FORBIDDEN", "Admin access required", 403);
  }

  const { address, port, key } = req.body as {
    address?: string;
    port?: number;
    key?: string;
  };
  if (!address || !port || !key) {
    return jsonError(
      res,
      "BAD_REQUEST",
      "address, port, and key are required",
      400,
    );
  }

  try {
    const response = await daemonRequestDirect(address, port, key, '/', {
      timeout: 10000,
    });

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      jsonOk(res, {
        connected: true,
        daemonVersion: (data as any).version ?? "unknown",
      });
    } else {
      jsonOk(res, { connected: false, error: `HTTP ${response.status}` });
    }
  } catch (err) {
    jsonOk(res, { connected: false, error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v2/system/search?q=... — Global search
// ---------------------------------------------------------------------------
router.get('/search', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const qRaw = String(req.query.q || '')
    .trim()
    .toLowerCase();
  if (!qRaw) {
    return jsonOk(res, { results: [] });
  }

  try {
    // Cache search results per user+query for 30 seconds to avoid
    // repeated DB hits from the search-as-you-type frontend.
    const cacheKey = `search:${user.id}:${qRaw}`;
    const cached = await cache.get<
      {
        type: string;
        label: string;
        sub: string;
        url: string;
        score: number;
      }[]
    >(cacheKey);
    if (cached) {
      return jsonOk(res, { results: cached });
    }

    interface SearchItem {
      type: string;
      label: string;
      sub: string;
      url: string;
      score: number;
    }

    const normalize = (s: string): string =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

    const qNorm = normalize(qRaw);
    const tokens = qNorm.split(' ').filter(Boolean);
    if (tokens.length === 0) {
      return jsonOk(res, { results: [] });
    }

    const levenshtein = (a: string, b: string): number => {
      const m = a.length;
      const n = b.length;
      if (!m) {
        return n;
      }
      if (!n) {
        return m;
      }
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
      if (token.length < 4) {
        return false;
      }
      return hay
        .split(/\s+/)
        .some(
          (w) =>
            Math.abs(w.length - token.length) <= 1 &&
            levenshtein(w, token) <= 1,
        );
    };

    const scoreFields = (fields: string[]): number => {
      let best = 0;
      for (const raw of fields) {
        const f = normalize(raw);
        let s = 0;
        if (f === qNorm) {
          s = 100;
        } else if (f.startsWith(qNorm)) {
          s = 80;
        } else if (f.includes(qNorm)) {
          s = 60;
        } else if (tokens.length > 1 && tokens.every((t) => f.includes(t))) {
          s = 45;
        } else if (tokens.some((t) => f.includes(t))) {
          s = 30;
        } else if (tokens.some((t) => fuzzyOk(t, f))) {
          s = 15;
        }
        best = Math.max(best, s);
      }
      return best;
    };

    const results: SearchItem[] = [];

    const tokenFieldOrs = (fields: string[]) =>
      tokens.flatMap((t) => fields.map((f) => ({ [f]: { contains: t } })));

    const whereClause = user.isAdmin
      ? { OR: tokenFieldOrs(['name', 'description', 'UUID']) }
      : {
        ownerId: user.id,
        OR: tokenFieldOrs(['name', 'description', 'UUID']),
      };

    let servers = await prisma.server.findMany({
      where: whereClause as never,
      select: { UUID: true, name: true, description: true },
      take: 30,
    });

    if (servers.length === 0) {
      servers = await prisma.server.findMany({
        where: user.isAdmin ? undefined : { ownerId: user.id },
        select: { UUID: true, name: true, description: true },
        orderBy: { id: 'desc' },
        take: 100,
      });
    }

    servers.forEach((s) => {
      const score = scoreFields([s.name, s.description || '', s.UUID]);
      if (score > 0) {
        results.push({
          type: 'server',
          label: s.name,
          sub: s.description || s.UUID,
          url: `/server/${s.UUID}`,
          score,
        });
      }
    });

    const serverFeatures = [
      {
        name: 'Console',
        suffix: '',
        kw: 'console terminal status power start stop restart kill',
      },
      {
        name: 'Files',
        suffix: '/files',
        kw: 'files file manager sftp upload download',
      },
      {
        name: 'Backups',
        suffix: '/backups',
        kw: 'backup backups restore snapshot',
      },
      {
        name: 'Players',
        suffix: '/players',
        kw: 'players player list whitelist',
      },
      { name: 'Worlds', suffix: '/worlds', kw: 'worlds world map save' },
      {
        name: 'Startup',
        suffix: '/startup',
        kw: 'startup command variables cmd',
      },
      {
        name: 'Settings',
        suffix: '/settings',
        kw: 'server settings rename',
      },
    ];

    const featureMatches = serverFeatures.filter(
      (f) => scoreFields([f.kw]) > 0,
    );
    if (featureMatches.length > 0) {
      const featServers = await prisma.server.findMany({
        where: user.isAdmin ? undefined : { ownerId: user.id },
        select: { UUID: true, name: true },
        orderBy: { id: 'desc' },
        take: 5,
      });
      featureMatches.slice(0, 3).forEach((f) => {
        const score = scoreFields([f.kw]);
        featServers.slice(0, 4).forEach((s) => {
          results.push({
            type: 'feature',
            label: f.name,
            sub: s.name,
            url: `/server/${s.UUID}${f.suffix}`,
            score,
          });
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
          results.push({
            type: 'user',
            label: u.username ?? '',
            sub: u.email ?? '',
            url: `/admin/users/view/${u.id}/`,
            score,
          });
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
          results.push({
            type: 'node',
            label: n.name,
            sub: n.address,
            url: `/admin/node/${n.id}/stats`,
            score,
          });
        }
      });
    }

    results.sort((a, b) => b.score - a.score);
    // Store in Redis for 30 seconds.
    await cache.set(cacheKey, results, 30);
    return jsonOk(res, { results });
  } catch (err) {
    logger.error('Search error:', err);
    return jsonError(res, 'INTERNAL', 'Search failed', 500);
  }
});

export default router;
