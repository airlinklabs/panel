import { Router, Request, Response } from 'express';
import type { AddonApi, ModrinthSettings } from './types';
import { ModrinthApiClient } from './modrinth-api';
import { SettingsStore } from './settings';
import { progressTracker } from './progress';
import * as daemon from './daemon';
import { install } from './installer';

const GITHUB_REPO_OWNER = 'airlinklabs';
const GITHUB_REPO_NAME = 'addons';

export function createRoutes(
  api: AddonApi,
  modrinth: ModrinthApiClient,
  settings: SettingsStore
): Router {
  const router = Router();
  const { prisma, logger } = api;

  // ── Auth helper ───────────────────────────────────────────────────
  async function requireUser(req: Request, res: Response): Promise<any | null> {
    const userId = (req as any).session?.user?.id;
    if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return null; }
    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) { res.status(401).json({ error: 'User not found' }); return null; }
    return user;
  }

  async function requireServerOwner(req: Request, res: Response, serverUUID: string): Promise<{ user: any; server: any } | null> {
    const user = await requireUser(req, res);
    if (!user) return null;
    const server = await prisma.server.findUnique({ where: { UUID: serverUUID } });
    if (!server) { res.status(404).json({ error: 'Server not found' }); return null; }
    if (!user.isAdmin && server.ownerId !== user.id) {
      res.status(403).json({ error: 'Forbidden' }); return null;
    }
    return { user, server };
  }

  // ── Settings helper ───────────────────────────────────────────────
  async function getSettings(): Promise<ModrinthSettings> {
    return settings.get();
  }

  function isBlocked(projectId: string, s: ModrinthSettings): boolean {
    return settings.isProjectBlocked(projectId, s);
  }

  // ── API Routes ────────────────────────────────────────────────────

  router.get('/api/search', async (req: Request, res: Response) => {
    try {
      const q = String(req.query.q ?? '').trim().slice(0, 100);
      const type = String(req.query.type ?? 'all');
      const limit = Math.min(Number(req.query.limit) || 20, 50);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const index = String(req.query.index ?? 'relevance');

      const result = await modrinth.search(q, type, limit, offset, index);

      const s = await getSettings();
      result.hits = result.hits.filter(h =>
        !settings.isTypeDisabled(h.project_type, s) && !isBlocked(h.project_id, s)
      );

      res.json({ success: true, ...result });
    } catch (err: any) {
      logger.error('[Modrinth] Search error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/api/project/:id', async (req: Request, res: Response) => {
    try {
      const project = await modrinth.getProject(String(req.params.id));
      const versions = await modrinth.getProjectVersions(String(req.params.id));
      res.json({ success: true, project, versions });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/api/progress', (_req: Request, res: Response) => {
    res.json({ progress: progressTracker.getAll() });
  });

  router.get('/api/progress/:serverId/:projectId', (req: Request, res: Response) => {
    const p = progressTracker.get(String(req.params.serverId), String(req.params.projectId));
    res.json({ progress: p || null });
  });

  router.delete('/api/progress/:serverId/:projectId', (req: Request, res: Response) => {
    progressTracker.remove(`${String(req.params.serverId)}:${String(req.params.projectId)}`);
    res.json({ success: true });
  });

  router.get('/api/health', async (_req: Request, res: Response) => {
    const ok = await modrinth.healthCheck();
    res.json({ healthy: ok });
  });

  router.post('/api/cache/clear', async (_req: Request, res: Response) => {
    await modrinth.clearCache();
    res.json({ success: true, message: 'Cache cleared' });
  });

  router.get('/api/config', async (_req: Request, res: Response) => {
    res.json({ settings: await getSettings() });
  });

  router.post('/api/config', async (req: Request, res: Response) => {
    try {
      const update: Partial<ModrinthSettings> = {};
      if (req.body.showWarningBanner !== undefined) update.showWarningBanner = Boolean(req.body.showWarningBanner);
      if (req.body.warningTitle !== undefined) update.warningTitle = String(req.body.warningTitle);
      if (req.body.warningMessage !== undefined) update.warningMessage = String(req.body.warningMessage);
      if (req.body.disabledProjectTypes !== undefined) {
        update.disabledProjectTypes = Array.isArray(req.body.disabledProjectTypes)
          ? req.body.disabledProjectTypes
          : String(req.body.disabledProjectTypes).split(',').map((s: string) => s.trim()).filter(Boolean);
      }
      if (req.body.blockedProjects !== undefined) {
        update.blockedProjects = Array.isArray(req.body.blockedProjects)
          ? req.body.blockedProjects
          : String(req.body.blockedProjects).split(',').map((s: string) => s.trim()).filter(Boolean);
      }
      await settings.update(update);
      res.json({ success: true, settings: await getSettings() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/api/statistics', async (_req: Request, res: Response) => {
    try {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT projectType, status, COUNT(*) as count FROM ModrinthInstallation GROUP BY projectType, status`
      );
      res.json({ success: true, statistics: rows });
    } catch {
      res.json({ success: true, statistics: [] });
    }
  });

  router.get('/api/servers', async (req: Request, res: Response) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;
      const servers = user.isAdmin
        ? await prisma.server.findMany()
        : await prisma.server.findMany({ where: { ownerId: user.id } });
      res.json({ success: true, servers });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/install', async (req: Request, res: Response) => {
    try {
      const { serverId, projectId, versionId } = req.body;
      if (!serverId || !projectId || !versionId) {
        return res.status(400).json({ error: 'Missing serverId, projectId, or versionId' });
      }

      const result = await requireServerOwner(req, res, serverId);
      if (!result) return;
      const { server } = result;

      const s = await getSettings();
      if (isBlocked(projectId, s)) {
        return res.status(403).json({ error: 'This project is blocked' });
      }

      const key = `${server.UUID}:${projectId}`;
      const existing = progressTracker.get(server.UUID, projectId);
      if (existing && existing.stage !== 'completed' && existing.stage !== 'failed') {
        return res.status(409).json({ error: 'Installation already in progress' });
      }

      const [project, version] = await Promise.all([
        modrinth.getProject(projectId),
        modrinth.getVersion(versionId),
      ]);

      install({ api: modrinth, prisma, logger }, { server, project, version }).catch(err => {
        logger.error('[Modrinth] Background install error:', err.message);
      });

      res.json({ success: true, message: 'Installation started' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/api/installations/:serverId', async (req: Request, res: Response) => {
    try {
      const serverId = String(req.params.serverId);
      const result = await requireServerOwner(req, res, serverId);
      if (!result) return;
      const rows = await prisma.$queryRawUnsafe(
        `SELECT * FROM ModrinthInstallation WHERE serverId = ? ORDER BY installedAt DESC LIMIT 50`,
        serverId
      );
      res.json({ success: true, installations: rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Store API ─────────────────────────────────────────────────────

  router.get('/api/store/list', async (_req: Request, res: Response) => {
    try {
      const contentsRes = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents`,
        { headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'airlink-panel' } }
      );
      if (!contentsRes.ok) return res.status(502).json({ error: 'Failed to fetch addon list' });

      const contents = (await contentsRes.json()) as any[];
      const folders = contents.filter((i: any) => i.type === 'dir' && !i.name.startsWith('.'));

      const addons = await Promise.all(
        folders.map(async (folder: any) => {
          try {
            const rawBase = `https://raw.githubusercontent.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/main`;
            const infoRes = await fetch(`${rawBase}/${folder.name}/info.json`, {
              headers: { 'User-Agent': 'airlink-panel' },
            });
            if (!infoRes.ok) return null;
            return await infoRes.json();
          } catch {
            return null;
          }
        })
      );

      res.json({ success: true, addons: addons.filter(Boolean) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
