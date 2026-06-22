import { Router } from 'express';
import { createSearchRoutes } from './api/search';
import { createProjectApiRoutes } from './api/project';
import { createInstallRoutes } from './api/install';
import { createServersRoutes } from './api/servers';
import { createConfigRoutes } from './api/config';
import { createProgressRoutes } from './api/progress';
import { createHealthRoutes } from './api/health';
import { createCacheRoutes } from './api/cache';
import { createStatisticsRoutes } from './api/statistics';
import { createInstallationsRoutes } from './api/installations';
import { createBrowseRoutes } from './pages/browse';
import { createAdminRoutes } from './pages/admin';

interface RouteDeps {
  modrinthClient: any;
  installer: any;
  settingsStore: any;
  progressTracker: any;
  cache: any;
  prisma: any;
  createAuthMiddleware: () => any;
  createAdminMiddleware: () => any;
  getComponents: (viewport?: string) => Record<string, string>;
}

export function createRoutes(deps: RouteDeps): Router {
  const router = Router();
  const {
    modrinthClient, installer, settingsStore, progressTracker,
    cache, prisma, createAuthMiddleware, createAdminMiddleware, getComponents,
  } = deps;

  // API routes
  router.use('/api/search', createSearchRoutes({ modrinthClient, settingsStore }));
  router.use('/api/project', createProjectApiRoutes({ modrinthClient }));
  router.use('/api/install', createInstallRoutes({
    installer, modrinthClient, settingsStore, progressTracker,
    createAuthMiddleware, prisma,
  }));
  router.use('/api/servers', createServersRoutes({ prisma }));
  router.use('/api/config', createConfigRoutes({ settingsStore, createAdminMiddleware }));
  router.use('/api/progress', createProgressRoutes({ progressTracker, createAuthMiddleware }));
  router.use('/api/health', createHealthRoutes({ modrinthClient, progressTracker }));
  router.use('/api/cache', createCacheRoutes({ cache, createAdminMiddleware }));
  router.use('/api/statistics', createStatisticsRoutes({ prisma, createAdminMiddleware }));
  router.use('/api/installations', createInstallationsRoutes({ prisma, createAuthMiddleware }));

  // Page routes
  router.use('/admin/config', createAdminRoutes({
    settingsStore, prisma, createAdminMiddleware, getComponents,
  }));
  router.use('/', createBrowseRoutes({ modrinthClient, settingsStore, prisma, getComponents } as any));

  return router;
}
