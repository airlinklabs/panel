import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import express, { Express, Router } from 'express';
import { uiComponentStore, SidebarItem, ServerMenuItem, ServerSection, ServerSectionItem } from './uiComponentHandler';
import { slotRegistry, SlotId } from './addonSlotRegistry';
import { commandRegistry, scheduler, RegisteredCommand, ScheduledTask } from './addonCommands';
import { createConfigStore, AddonConfigStore } from './addonConfigStore';
import { parseAddonManifest, AddonManifestV2, isVersionInRange } from './addonManifest';
import { registerAddonPermission, clearAddonPermissions } from './permissions';
import prisma from '../db';
import type { PrismaClient } from '../generated/prisma/client';
import logger from './logger';
import { isAuthenticated } from './utils/auth/authUtil';
import { apiValidator } from './utils/api/apiValidator';
import csrfProtection from './utils/security/csrfProtection';

let _appInstance: Express | null = null;

export function setAppInstance(app: Express): void {
  _appInstance = app;
}

function getApp(): Express {
  if (!_appInstance) throw new Error('App instance not initialized');
  return _appInstance;
}

function buildTailwind() {
  exec('npx tailwindcss -i ./public/tw.css -o ./public/styles.css', (error, stdout, stderr) => {
    if (error) {
      logger.error('Tailwind build failed:', error.message);
      return;
    }
    if (stderr) logger.warn('Tailwind reported warnings', { stderr: stderr.trim() });
  });
}

export interface AddonLifecycleHooks {
  onInstall?: () => Promise<void> | void;
  onEnable?: () => Promise<void> | void;
  onDisable?: () => Promise<void> | void;
  onUpdate?: (previousVersion: string) => Promise<void> | void;
  onUninstall?: () => Promise<void> | void;
}

export interface AddonAPI {
  registerRoute: (path: string, router: Router) => void;
  logger: typeof logger;
  prisma: PrismaClient;

  utils: {
    isUserAdmin: (userId: number) => Promise<boolean>;
    getServerById: (serverId: number) => Promise<any>;
    getServerByUUID: (uuid: string) => Promise<any>;
    getServerPorts: (server: any) => any[];
    getPrimaryPort: (server: any) => any;
  };

  addonPath: string;
  viewsPath: string;
  desktopViewsPath: string;
  mobileViewsPath: string;

  renderView: (viewName: string, data?: any, isMobile?: boolean) => Promise<string>;

  getComponentPath: (componentPath: string) => string;

  config: AddonConfigStore;

  ui: {
    addSidebarItem: (item: SidebarItem) => void;
    removeSidebarItem: (id: string) => void;
    getSidebarItems: (section?: string, isAdmin?: boolean) => SidebarItem[];

    addServerMenuItem: (item: ServerMenuItem) => void;
    removeServerMenuItem: (id: string) => void;
    getServerMenuItems: (feature?: string) => ServerMenuItem[];

    addServerSection: (section: ServerSection) => void;
    removeServerSection: (id: string) => void;
    getServerSections: () => ServerSection[];
    addServerSectionItem: (sectionId: string, item: ServerSectionItem) => void;
    removeServerSectionItem: (sectionId: string, itemId: string) => void;
    getServerSectionItems: (sectionId: string) => ServerSectionItem[];

    registerSlot: (slotId: SlotId, render: (locals: Record<string, unknown>) => string | Promise<string>) => void;
    unregisterSlot: (slotId: SlotId) => void;
    registerDashboardWrapper: (render: (locals: Record<string, unknown>) => string | Promise<string>) => void;
    unregisterDashboardWrapper: () => void;
    registerAdminWrapper: (render: (locals: Record<string, unknown>) => string | Promise<string>) => void;
    unregisterAdminWrapper: () => void;
  };

  commands: {
    register: (command: RegisteredCommand) => void;
  };

  schedule: {
    register: (task: ScheduledTask) => void;
  };

  permissions: {
    register: (permission: string) => boolean;
  };

  middleware: {
    isAuthenticated: typeof isAuthenticated;
    apiValidator: typeof apiValidator;
    csrfProtection: typeof csrfProtection;
  };

  assetsUrl: string;
}

interface LoadedAddon {
  router: Router;
  routerPath: string;
  staticPath?: string;
  manifest?: AddonManifestV2;
  hooks?: AddonLifecycleHooks;
  version?: string;
}

const loadedAddons = new Map<string, LoadedAddon>();
const addonMutexes = new Map<string, Promise<void>>();

async function withAddonLock<T>(slug: string, fn: () => Promise<T>): Promise<T> {
  const prev = addonMutexes.get(slug) ?? Promise.resolve();
  let release!: () => void;
  const wait = new Promise<void>(r => { release = r; });
  const chain = prev.then(() => wait).then(fn);
  const entry = chain.then(() => {}, () => {});
  addonMutexes.set(slug, entry);
  try {
    return await chain;
  } finally {
    release();
    if (addonMutexes.get(slug) === entry) {
      addonMutexes.delete(slug);
    }
  }
}

function trackRequireCache(_addonPath: string): () => string[] {
  const before = new Set(Object.keys(require.cache));
  return () => {
    const after = Object.keys(require.cache);
    return after.filter(key => !before.has(key));
  };
}

function containPath(baseDir: string, targetPath: string): boolean {
  const realBase = fs.realpathSync(baseDir);
  let resolved: string;
  try {
    resolved = fs.realpathSync(targetPath);
  } catch {
    resolved = path.resolve(baseDir, targetPath);
  }
  return resolved.startsWith(realBase + path.sep) || resolved === realBase;
}

function buildAddonAPI(slug: string, addonPath: string, _manifest?: AddonManifestV2): AddonAPI {
  const addonViewsPath = path.join(addonPath, 'views');
  const addonDesktopViewsPath = path.join(addonViewsPath, 'desktop');
  const addonMobileViewsPath = path.join(addonViewsPath, 'mobile');

  return {
    registerRoute: (routePath: string, router: Router) => {
      getApp().use(routePath, router);
    },
    logger,
    prisma,
    addonPath,
    viewsPath: addonViewsPath,
    desktopViewsPath: addonDesktopViewsPath,
    mobileViewsPath: addonMobileViewsPath,
    getComponentPath: (componentPath: string) => {
      return path.join(__dirname, '../..', componentPath);
    },
    utils: {
      isUserAdmin: async (userId: number) => {
        try {
          const user = await prisma.users.findUnique({ where: { id: userId } });
          return user?.isAdmin === true;
        } catch (error) {
          logger.error('Error checking if user is admin:', error);
          return false;
        }
      },
      getServerById: async (serverId: number) => {
        try {
          return await prisma.server.findUnique({
            where: { id: serverId },
            include: { node: true, image: true, owner: true },
          });
        } catch (error) {
          logger.error('Error getting server by ID:', error);
          return null;
        }
      },
      getServerByUUID: async (uuid: string) => {
        try {
          return await prisma.server.findUnique({
            where: { UUID: uuid },
            include: { node: true, image: true, owner: true },
          });
        } catch (error) {
          logger.error('Error getting server by UUID:', error);
          return null;
        }
      },
      getServerPorts: (server: any) => {
        try {
          if (!server.Ports) return [];
          return JSON.parse(server.Ports);
        } catch (error) {
          logger.error('Error parsing server ports:', error);
          return [];
        }
      },
      getPrimaryPort: (server: any) => {
        try {
          if (!server.Ports) return null;
          const ports = JSON.parse(server.Ports);
          return ports.find((port: any) => port.primary === true);
        } catch (error) {
          logger.error('Error getting primary port:', error);
          return null;
        }
      },
    },
    renderView: async (viewName: string, data: any = {}, isMobile: boolean = false): Promise<string> => {
      const ejs = require('ejs');
      const viewportDir = isMobile ? addonMobileViewsPath : addonDesktopViewsPath;
      const viewportPath = path.join(viewportDir, viewName);
      const fallbackPath = path.join(addonViewsPath, viewName);
      const viewPath = fs.existsSync(viewportPath) ? viewportPath : fallbackPath;

      if (!fs.existsSync(viewPath)) {
        throw new Error(`View ${viewName} not found in addon ${slug}`);
      }

      return new Promise<string>((resolve, reject) => {
        ejs.renderFile(viewPath, data, {}, (err: any, str: string) => {
          if (err) {
            logger.error(`Error rendering view ${viewName}:`, err);
            reject(err);
          } else {
            resolve(str);
          }
        });
      });
    },
    config: createConfigStore(slug),
    ui: {
      addSidebarItem: (item: SidebarItem) => uiComponentStore.addSidebarItem(item, slug),
      removeSidebarItem: (id: string) => uiComponentStore.removeSidebarItem(id),
      getSidebarItems: (section?: string, isAdmin?: boolean) => uiComponentStore.getSidebarItems(section, isAdmin),
      addServerMenuItem: (item: ServerMenuItem) => uiComponentStore.addServerMenuItem(item, slug),
      removeServerMenuItem: (id: string) => uiComponentStore.removeServerMenuItem(id),
      getServerMenuItems: (feature?: string) => uiComponentStore.getServerMenuItems(feature),
      addServerSection: (section: ServerSection) => uiComponentStore.addServerSection(section, slug),
      removeServerSection: (id: string) => uiComponentStore.removeServerSection(id),
      getServerSections: () => uiComponentStore.getServerSections(),
      addServerSectionItem: (sectionId: string, item: ServerSectionItem) => uiComponentStore.addServerSectionItem(sectionId, item),
      removeServerSectionItem: (sectionId: string, itemId: string) => uiComponentStore.removeServerSectionItem(sectionId, itemId),
      getServerSectionItems: (sectionId: string) => uiComponentStore.getServerSectionItems(sectionId),
      registerSlot: (slotId: SlotId, render: (locals: Record<string, unknown>) => string | Promise<string>) => {
        slotRegistry.register(slotId, slug, render);
      },
      unregisterSlot: (slotId: SlotId) => {
        slotRegistry.unregister(slotId, slug);
      },
      registerDashboardWrapper: (render: (locals: Record<string, unknown>) => string | Promise<string>) => {
        slotRegistry.register('layout.dashboard.wrapper', slug, render);
      },
      unregisterDashboardWrapper: () => {
        slotRegistry.unregister('layout.dashboard.wrapper', slug);
      },
      registerAdminWrapper: (render: (locals: Record<string, unknown>) => string | Promise<string>) => {
        slotRegistry.register('layout.admin.wrapper', slug, render);
      },
      unregisterAdminWrapper: () => {
        slotRegistry.unregister('layout.admin.wrapper', slug);
      },
    },
    commands: {
      register: (command: RegisteredCommand) => {
        commandRegistry.register(slug, command);
      },
    },
    schedule: {
      register: (task: ScheduledTask) => {
        scheduler.register(slug, task);
      },
    },
    permissions: {
      register: (permission: string) => {
        return registerAddonPermission(slug, permission);
      },
    },
    middleware: {
      isAuthenticated,
      apiValidator,
      csrfProtection,
    },
    assetsUrl: `/addon-assets/${slug}`,
  };
}

function setupStaticAssetServing(appExpress: Express, slug: string, addonPath: string): string | undefined {
  const publicPath = path.join(addonPath, 'public');
  if (!fs.existsSync(publicPath)) return undefined;

  const realAddonPath = fs.realpathSync(addonPath);
  const realPublicPath = fs.realpathSync(publicPath);

  if (!realPublicPath.startsWith(realAddonPath + path.sep)) {
    logger.warn(`Addon "${slug}" public path escapes addon directory, skipping static serving`);
    return undefined;
  }

  const mountPath = `/addon-assets/${slug}`;
  appExpress.use(mountPath, express.static(publicPath));
  return mountPath;
}

function removeStaticAssetServing(appExpress: Express, mountPath: string): void {
  const routerStack = (appExpress as any)._router?.stack;
  if (!routerStack) return;

  for (let i = routerStack.length - 1; i >= 0; i--) {
    const layer = routerStack[i];
    if (layer?.route?.path === mountPath || layer?.regexp?.test?.(mountPath)) {
      routerStack.splice(i, 1);
    }
  }
}

export async function loadAddons(appExpress: Express | any) {
  for (const [slug] of loadedAddons.entries()) {
    await unloadAddon(appExpress, slug);
  }

  const addonsDir = path.join(__dirname, '../../storage/addons');

  if (!fs.existsSync(addonsDir)) {
    fs.mkdirSync(addonsDir, { recursive: true });
    logger.info('Created addons directory');
  }

  const addonFolders = fs.readdirSync(addonsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  let addonTableExists = true;
  try {
    await prisma.$queryRaw`SELECT 1 FROM Addon LIMIT 1`;
  } catch {
    addonTableExists = false;
    logger.warn('Addon table does not exist yet. Run migrations to create it.');
  }

  if (addonTableExists) {
    try {
      const dbAddons = await prisma.addon.findMany();
      const missingAddons = dbAddons.filter(addon => !addonFolders.includes(addon.slug));

      if (missingAddons.length > 0) {
        for (const addon of missingAddons) {
          await prisma.addon.delete({ where: { id: addon.id } });
          logger.info(`Removed addon ${addon.name} (${addon.slug}) from database because it no longer exists in the filesystem`);
        }
      }
    } catch (error) {
      logger.error('Failed to check for missing addons:', error);
    }
  }

  const dependencyGraph = new Map<string, { manifest: AddonManifestV2; folder: string }>();
  const parseResults = new Map<string, ReturnType<typeof parseAddonManifest>>();

  for (const folder of addonFolders) {
    const addonPath = path.join(addonsDir, folder);
    const packageJsonPath = path.join(addonPath, 'package.json');

    const result = parseAddonManifest(packageJsonPath, folder);
    parseResults.set(folder, result);

    if (result.success) {
      dependencyGraph.set(folder, { manifest: result.manifest, folder });
    } else {
      logger.warn(`Addon ${folder}: ${(result as { error: string }).error}`);
    }
  }

  const loadOrder = topologicalSort(dependencyGraph);

  for (const folder of loadOrder) {
    const result = parseResults.get(folder);
    if (!result || !result.success) continue;

    const addonPath = path.join(addonsDir, folder);
    const manifest = result.manifest;

    let addonEnabled = manifest.enabled !== false;

    if (addonTableExists) {
      try {
        let addonRecord = await prisma.addon.findUnique({ where: { slug: folder } });

        if (!addonRecord) {
          if (addonEnabled) {
            const migrationResult = await applyAddonMigrations(folder, manifest);
            if (!migrationResult.success) {
              logger.error(`Failed to apply migrations for new addon ${manifest.name}:`, migrationResult.message);
              addonEnabled = false;
            }
          }

          addonRecord = await prisma.addon.create({
            data: {
              name: manifest.name,
              slug: folder,
              description: manifest.description || '',
              version: manifest.version,
              author: manifest.author || '',
              enabled: addonEnabled,
              mainFile: manifest.main || 'index.ts',
            },
          });
          logger.info(`Added addon ${manifest.name} to database`);
        } else {
          await prisma.addon.update({
            where: { id: addonRecord.id },
            data: {
              name: manifest.name,
              description: manifest.description || '',
              version: manifest.version,
              author: manifest.author || '',
              mainFile: manifest.main || 'index.ts',
            },
          });

          addonEnabled = addonRecord.enabled;
        }

        if (!addonEnabled) {
          logger.info(`Addon ${manifest.name} is disabled, skipping`);
          continue;
        }
      } catch (error) {
        logger.error(`Database error for addon ${folder}:`, error);
      }
    }

    if (manifest.engines?.panel) {
      const panelVersion = require('../../package.json').version;
      if (!isVersionInRange(panelVersion, manifest.engines.panel)) {
        logger.warn(`Addon ${manifest.name} targets panel ${manifest.engines.panel}, running panel ${panelVersion}`);
      }
    }

    if (manifest.permissions) {
      for (const perm of manifest.permissions) {
        registerAddonPermission(folder, perm);
      }
    }

    const mainFile = manifest.main || 'index.ts';
    const mainFilePath = path.join(addonPath, mainFile);

    if (!fs.existsSync(mainFilePath)) {
      logger.warn(`Addon ${manifest.name} is missing main file (${mainFile}), skipping`);
      continue;
    }

    if (!containPath(addonPath, mainFilePath)) {
      logger.warn(`Addon ${manifest.name} main file escapes addon directory, skipping`);
      continue;
    }

    const addonViewsPath = path.join(addonPath, 'views');
    const addonDesktopViewsPath = path.join(addonViewsPath, 'desktop');
    const addonMobileViewsPath = path.join(addonViewsPath, 'mobile');

    if (!fs.existsSync(addonViewsPath)) fs.mkdirSync(addonViewsPath, { recursive: true });
    if (!fs.existsSync(addonDesktopViewsPath)) fs.mkdirSync(addonDesktopViewsPath, { recursive: true });
    if (!fs.existsSync(addonMobileViewsPath)) fs.mkdirSync(addonMobileViewsPath, { recursive: true });

    const addonRouter = Router();
    const addonAPI = buildAddonAPI(folder, addonPath, manifest);
    const animationsDisabled = manifest.dontfuckinganimateme === true;

    addonRouter.use((_req: any, res: any, next: any) => {
      res.locals.addonAnimationsDisabled = animationsDisabled;
      res.locals.addonSlug = folder;
      next();
    });

    const cacheTracker = trackRequireCache(addonPath);

    try {
      let addonModule: any;
      try {
        addonModule = require(mainFilePath);
      } finally {
        cacheTracker();
      }

      const routerPath = manifest.router || '/';

      let hooks: AddonLifecycleHooks | undefined;

      if (typeof addonModule === 'function') {
        const result = addonModule(addonRouter, addonAPI);
        if (result && typeof result === 'object') {
          hooks = result as AddonLifecycleHooks;
        }
      } else if (addonModule.default && typeof addonModule.default === 'function') {
        const result = addonModule.default(addonRouter, addonAPI);
        if (result && typeof result === 'object') {
          hooks = result as AddonLifecycleHooks;
        }
      } else {
        logger.error(`Invalid main export for addon ${manifest.name}`);
        continue;
      }

      const staticPath = setupStaticAssetServing(appExpress, folder, addonPath);

      Object.defineProperty(addonRouter, 'name', { value: `router_${folder}` });
      appExpress.use(routerPath, addonRouter);
      loadedAddons.set(folder, {
        router: addonRouter,
        routerPath,
        staticPath: staticPath ?? undefined,
        manifest,
        hooks,
        version: manifest.version,
      });

      if (addonTableExists) {
        try {
          const addonRecord = await prisma.addon.findUnique({ where: { slug: folder } });
          if (addonRecord && hooks?.onInstall) {
            const existingMigrations = await prisma.$queryRaw<{ migrationName: string }[]>`
              SELECT migrationName FROM AddonMigration WHERE addonSlug = ${folder}
            `;
            if (existingMigrations.length === 0) {
              await safeHookCall(folder, 'onInstall', () => hooks!.onInstall!());
            }
          }
        } catch {
          // best-effort lifecycle
        }
      }

      logger.info(`Loaded addon: ${manifest.name} (${folder})`);
    } catch (error: any) {
      logger.error(`Failed to initialize addon ${manifest.name}:`, error.message);
    }
  }

  buildTailwind();
}

async function safeHookCall(slug: string, hookName: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (err: any) {
    logger.error(`Addon "${slug}" hook "${hookName}" failed:`, err.message);
  }
}

export async function toggleAddonStatus(slug: string, enabled: boolean) {
  return withAddonLock(slug, async () => {
    try {
      try {
        await prisma.$queryRaw`SELECT 1 FROM Addon LIMIT 1`;
      } catch {
        logger.warn('Addon table does not exist yet. Run migrations to create it.');
        return { success: false, message: 'Addon table does not exist yet' };
      }

      const addon = await prisma.addon.findUnique({ where: { slug } });
      if (!addon) throw new Error(`Addon ${slug} not found`);

      const loaded = loadedAddons.get(slug);

      if (enabled && !addon.enabled) {
        if (loaded?.hooks?.onEnable) {
          await safeHookCall(slug, 'onEnable', () => loaded.hooks!.onEnable!());
        }

        if (loaded?.manifest?.migrations && loaded.manifest.migrations.length > 0) {
          const migrationResult = await applyAddonMigrations(slug, loaded.manifest);
          if (!migrationResult.success) {
            return { success: false, message: `Failed to enable: ${migrationResult.message}` };
          }
        }
      }

      if (!enabled && addon.enabled) {
        const loaded = loadedAddons.get(slug);
        if (loaded?.hooks?.onDisable) {
          await safeHookCall(slug, 'onDisable', () => loaded.hooks!.onDisable!());
        }
      }

      await prisma.addon.update({ where: { id: addon.id }, data: { enabled } });

      return {
        success: true,
        message: `Addon ${addon.name} ${enabled ? 'enabled' : 'disabled'} successfully`,
      };
    } catch (error: any) {
      logger.error('Failed to toggle addon status:', error.message);
      return { success: false, message: `Failed to toggle addon status: ${error.message}` };
    }
  });
}

export async function getAllAddons() {
  try {
    try {
      await prisma.$queryRaw`SELECT 1 FROM Addon LIMIT 1`;
    } catch {
      logger.warn('Addon table does not exist yet. Run migrations to create it.');
      return [];
    }
    return await prisma.addon.findMany({ orderBy: { name: 'asc' } });
  } catch (error: any) {
    logger.error('Failed to get addons:', error.message);
    return [];
  }
}

function unloadAddon(app: Express | any, slug: string): void {
  const addon = loadedAddons.get(slug);
  if (!addon) return;

  const routerStack = (app as any)._router?.stack;
  if (routerStack) {
    for (let i = routerStack.length - 1; i >= 0; i--) {
      const layer = routerStack[i];
      if (layer?.handle?.name === `router_${slug}`) {
        routerStack.splice(i, 1);
        break;
      }
    }
  }

  if (addon.staticPath) {
    removeStaticAssetServing(app, addon.staticPath);
  }

  uiComponentStore.clearAddonItems(slug);
  slotRegistry.clearAddonSlots(slug);
  commandRegistry.clearAddonCommands(slug);
  scheduler.clearAddonTimers(slug);
  clearAddonPermissions(slug);

  loadedAddons.delete(slug);
  logger.info(`Unloaded addon: ${slug}`);
}

export async function reloadAddons(app: Express | any) {
  logger.info('Reloading addons...');

  for (const [slug] of loadedAddons.entries()) {
    unloadAddon(app, slug);
  }

  await loadAddons(app);

  return { success: true, message: 'Addons reloaded successfully' };
}

async function applyAddonMigrations(slug: string, manifest: AddonManifestV2) {
  if (!manifest.migrations || manifest.migrations.length === 0) {
    return { success: true, message: 'No migrations to apply' };
  }

  logger.info(`Applying ${manifest.migrations.length} migrations for addon ${manifest.name}`);

  try {
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS AddonMigration (
        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        addonSlug TEXT NOT NULL,
        migrationName TEXT NOT NULL,
        appliedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(addonSlug, migrationName)
      )
    `;

    const appliedMigrations = await prisma.$queryRaw<{ migrationName: string }[]>`
      SELECT migrationName FROM AddonMigration WHERE addonSlug = ${slug}
    `;
    const appliedNames = new Set(appliedMigrations.map(m => m.migrationName));

    const pending = manifest.migrations.filter(m => !appliedNames.has(m.name));

    if (pending.length === 0) {
      return { success: true, message: 'No new migrations to apply' };
    }

    for (const migration of pending) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(migration.sql);
          await tx.$executeRaw`
            INSERT INTO AddonMigration (addonSlug, migrationName)
            VALUES (${slug}, ${migration.name})
          `;
        });
        logger.info(`Applied migration ${migration.name} for addon ${manifest.name}`);
      } catch (error: any) {
        logger.error(`Failed to apply migration ${migration.name}:`, error.message);
        return { success: false, message: `Failed to apply migration ${migration.name}: ${error.message}` };
      }
    }

    return {
      success: true,
      message: `Applied ${pending.length} migrations for addon ${manifest.name}`,
      migrationsApplied: pending.length,
    };
  } catch (error: any) {
    logger.error(`Failed to apply migrations for addon ${manifest.name}:`, error.message);
    return { success: false, message: `Failed to apply migrations: ${error.message}` };
  }
}

function topologicalSort(graph: Map<string, { manifest: AddonManifestV2; folder: string }>): string[] {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const order: string[] = [];

  function visit(folder: string) {
    if (visited.has(folder)) return;
    if (visiting.has(folder)) {
      logger.warn(`Circular dependency detected involving addon "${folder}"`);
      return;
    }
    visiting.add(folder);

    const node = graph.get(folder);
    if (node?.manifest.dependencies) {
      for (const dep of node.manifest.dependencies) {
        if (graph.has(dep.identifier)) {
          visit(dep.identifier);
        }
      }
    }

    visiting.delete(folder);
    visited.add(folder);
    order.push(folder);
  }

  for (const folder of graph.keys()) {
    visit(folder);
  }

  return order;
}

export async function uninstallAddon(slug: string, app: Express | any) {
  return withAddonLock(slug, async () => {
    const loaded = loadedAddons.get(slug);

    if (loaded?.hooks?.onUninstall) {
      await safeHookCall(slug, 'onUninstall', () => loaded.hooks!.onUninstall!());
    }

    const addonRecord = await prisma.addon.findUnique({ where: { slug } });
    if (addonRecord) {
      const manifest = loaded?.manifest;
      if (manifest?.migrations) {
        const appliedMigrations = await prisma.$queryRaw<{ migrationName: string }[]>`
          SELECT migrationName FROM AddonMigration WHERE addonSlug = ${slug}
        `;
        const appliedNames = new Set(appliedMigrations.map(m => m.migrationName));

        const reversible = manifest.migrations
          .filter(m => m.down && appliedNames.has(m.name))
          .reverse();

        for (const migration of reversible) {
          try {
            await prisma.$executeRawUnsafe(migration.down!);
            logger.info(`Rolled back migration ${migration.name} for addon ${slug}`);
          } catch (err: any) {
            logger.error(`Failed to roll back migration ${migration.name}:`, err.message);
          }
        }
      }

      await prisma.addonSetting.deleteMany({ where: { addonSlug: slug } });
      await prisma.$executeRaw`DELETE FROM AddonMigration WHERE addonSlug = ${slug}`;
      await prisma.addon.delete({ where: { slug } });
    }

    unloadAddon(app, slug);

    const addonsDir = path.join(__dirname, '../../storage/addons');
    const targetDir = path.join(addonsDir, slug);
    if (fs.existsSync(targetDir) && containPath(addonsDir, targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
  });
}
