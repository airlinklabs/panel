import { Router } from 'express';
import { TwoTierCacheStore } from './lib/cache-store';
import { ModrinthClient } from './lib/modrinth-client';
import { DaemonClient } from './lib/daemon-client';
import { Installer } from './lib/installer';
import { SettingsStore } from './lib/settings-store';
import { DependencyResolver } from './lib/dependency-resolver';
import { UpdateChecker } from './lib/update-checker';
import { createAuthMiddleware, createAdminMiddleware } from './utils/auth';
import { registerSidebarItems, unregisterSidebarItems } from './ui/sidebar';
import { createLifecycleHooks } from './ui/lifecycle';
import { createRoutes } from './routes';

export const CONFIG = {
  MODRINTH_API_BASE: 'https://api.modrinth.com/v2',
  USER_AGENT: 'AirLink-ModrinthAddon/2.0',
  CACHE_DURATION: 30 * 60 * 1000,
  MAX_FILE_SIZE: 100 * 1024 * 1024,
  SEARCH_LIMIT: 20,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 2000,
  REQUEST_TIMEOUT: 30000,
} as const;

async function setupDatabase(prisma: any, logger: any): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ModrinthCache (
      cacheKey TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      expiresAt DATETIME NOT NULL
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ModrinthInstallation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId TEXT NOT NULL,
      projectType TEXT NOT NULL,
      projectName TEXT,
      versionId TEXT,
      serverId TEXT,
      status TEXT NOT NULL CHECK (status IN ('completed', 'failed', 'blocked', 'in_progress')),
      error TEXT,
      installedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_modrinth_status ON ModrinthInstallation(status)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_modrinth_project ON ModrinthInstallation(projectId, status)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_modrinth_server ON ModrinthInstallation(serverId)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_modrinth_installed_at ON ModrinthInstallation(installedAt)`);

  // New tables for collections and search history
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ModrinthCollection (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ModrinthCollectionItem (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collectionId INTEGER NOT NULL,
      projectId TEXT NOT NULL,
      projectName TEXT,
      projectType TEXT,
      addedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (collectionId) REFERENCES ModrinthCollection(id) ON DELETE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ModrinthSearchHistory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      query TEXT NOT NULL,
      type TEXT,
      searchedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  logger.info('Modrinth database schema ready');
}

export default async (router: Router, api: any) => {
  const { logger, prisma, config: addonConfig } = api;

  await setupDatabase(prisma, logger);

  // Initialize core services
  const cache = new TwoTierCacheStore(prisma);
  const modrinthClient = new ModrinthClient(cache, logger, {
    apiBase: CONFIG.MODRINTH_API_BASE,
    userAgent: CONFIG.USER_AGENT,
    searchLimit: CONFIG.SEARCH_LIMIT,
    cacheDuration: CONFIG.CACHE_DURATION,
    retryAttempts: CONFIG.RETRY_ATTEMPTS,
    retryDelay: CONFIG.RETRY_DELAY,
    requestTimeout: CONFIG.REQUEST_TIMEOUT,
  });
  const daemonClient = new DaemonClient(logger, {
    maxFileSize: CONFIG.MAX_FILE_SIZE,
  });
  const installer = new Installer(prisma, logger, daemonClient);
  const settingsStore = new SettingsStore(api.addonPath, logger);
  const dependencyResolver = new DependencyResolver(modrinthClient, logger);
  const updateChecker = new UpdateChecker(modrinthClient, logger);

  // Create middleware
  const authMiddleware = createAuthMiddleware(prisma);
  const adminMiddleware = createAdminMiddleware(prisma);

  // Register UI
  registerSidebarItems(api.ui);

  // Create and mount routes
  const routes = createRoutes({
    modrinthClient,
    installer,
    settingsStore,
    progressTracker: require('./lib/progress-tracker').progressTracker,
    cache,
    prisma,
    createAuthMiddleware: () => authMiddleware,
    createAdminMiddleware: () => adminMiddleware,
    getComponents: api.getComponents,
  });

  router.use('/', routes);

  // Set up lifecycle hooks
  const hooks = createLifecycleHooks(logger, addonConfig, () => unregisterSidebarItems(api.ui));

  // Periodic cache cleanup
  setInterval(() => cache.clearExpired().catch(() => {}), 24 * 60 * 60 * 1000);

  logger.info('Modrinth addon initialized');

  return hooks;
};
