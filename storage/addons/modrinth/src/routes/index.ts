// ── Route Index ──
// Aggregates all page and API routes.
// Applies auth middleware to ALL routes.
// Applies CSRF protection to ALL mutating (POST/DELETE/PUT) routes.

import { Router } from 'express';
import type { AddonApi } from '../types/panel';
import type { CacheStore } from '../lib/cache-store';
import type { ModrinthClient } from '../lib/modrinth-client';
import type { DaemonClient } from '../lib/daemon-client';
import type { Installer } from '../lib/installer';
import type { SettingsStore } from '../lib/settings-store';
import type { UpdateChecker } from '../lib/update-checker';

import { createBrowsePage } from './pages/browse';
import { createProjectPage } from './pages/project';
import { createInstalledPage } from './pages/installed';
import { createAdminPage } from './pages/admin';

import { createSearchApi } from './api/search';
import { createProjectApi } from './api/project';
import { createInstallApi } from './api/install';
import { createUninstallApi } from './api/uninstall';
import { createBulkInstallApi } from './api/bulk-install';
import { createServersApi } from './api/servers';
import { createConfigApi } from './api/config';
import { createProgressApi } from './api/progress';
import { createHealthApi } from './api/health';
import { createCacheApi } from './api/cache';
import { createStatisticsApi } from './api/statistics';
import { createInstallationsApi } from './api/installations';
import { createCollectionsApi } from './api/collections';
import { createSearchHistoryApi } from './api/search-history';

export interface RouteDeps {
  api: AddonApi;
  cache: CacheStore;
  modrinth: ModrinthClient;
  daemon: DaemonClient;
  installer: Installer;
  settings: SettingsStore;
  updateChecker: UpdateChecker;
}

export function createRouter(deps: RouteDeps): Router {
  const router = Router();
  const { api } = deps;

  // ── Auth middleware for ALL routes ──
  const requireAuth = api.security.requireAuth();
  const requireCsrf = api.security.requireCsrf();

  // Apply auth to every route in this router
  router.use(requireAuth);

  // ── Page routes ──
  router.get('/', createBrowsePage(deps));
  router.get('/project/:id', createProjectPage(deps));
  router.get('/installed/:serverId', createInstalledPage(deps));
  router.get('/admin/config', requireAdmin, createAdminPage(deps));

  // ── API routes (CSRF on mutations) ──
  router.get('/api/search', createSearchApi(deps));
  router.get('/api/project/:id', createProjectApi(deps));
  router.post('/api/install', requireCsrf, createInstallApi(deps));
  router.post('/api/bulk-install', requireCsrf, createBulkInstallApi(deps));
  router.post('/api/uninstall', requireCsrf, createUninstallApi(deps));
  router.get('/api/servers', createServersApi(deps));
  router.get('/api/config', requireAdmin, createConfigApi(deps));
  router.post('/api/config', requireAdmin, requireCsrf, createConfigApi(deps));
  router.get('/api/progress', createProgressApi(deps));
  router.get('/api/progress/:serverId/:projectId', createProgressApi(deps));
  router.delete('/api/progress/:serverId/:projectId', requireCsrf, createProgressApi(deps));
  router.get('/api/health', createHealthApi(deps));
  router.post('/api/cache/clear', requireAdmin, requireCsrf, createCacheApi(deps));
  router.get('/api/statistics', requireAdmin, createStatisticsApi(deps));
  router.get('/api/installations/:serverId', createInstallationsApi(deps));
  router.get('/api/collections', createCollectionsApi(deps));
  router.post('/api/collections', requireCsrf, createCollectionsApi(deps));
  router.delete('/api/collections/:id', requireCsrf, createCollectionsApi(deps));
  router.get('/api/search-history', createSearchHistoryApi(deps));
  router.post('/api/search-history', requireCsrf, createSearchHistoryApi(deps));

  return router;
}

/** Middleware to require admin access */
function requireAdmin(req: any, res: any, next: any) {
  const user = req.session?.user;
  if (!user?.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
