import fs from 'fs';
import path from 'path';
import express, { Express, Router, Request, Response } from 'express';
import { uiComponentStore, SidebarItem, ServerMenuItem, ServerSection, ServerSectionItem } from './uiComponentHandler';
import { PrismaClient } from '@prisma/client';
import logger from './logger';

const prisma = new PrismaClient();

interface MigrationTemplate {
  name: string;
  sql: string;
}

interface AddonPackageJson {
  name: string;
  version: string;
  description?: string;
  author?: string;
  main?: string;
  router?: string;
  enabled?: boolean;
  migrations?: MigrationTemplate[];
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

  renderView: (viewName: string, data?: any) => string;

  getComponentPath: (componentPath: string) => string;

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
  };
}

export async function loadAddons(app: Express) {
  for (const [slug, _] of loadedAddons.entries()) {
    unloadAddon(app, slug);
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
  } catch (error) {
    addonTableExists = false;
    logger.warn('Addon table does not exist yet. Run migrations to create it.');
  }

  if (addonTableExists) {
    try {
      const dbAddons = await prisma.addon.findMany();
      const missingAddons = dbAddons.filter(addon => !addonFolders.includes(addon.slug));

      if (missingAddons.length > 0) {
        for (const addon of missingAddons) {
          await prisma.addon.delete({
            where: { id: addon.id }
          });
          logger.info(`Removed addon ${addon.name} (${addon.slug}) from database because it no longer exists in the filesystem`);
        }
      }
    } catch (error) {
      logger.error('Failed to check for missing addons:', error);
    }
  }

  if (addonFolders.length > 0) {
    logger.info(`---- Loading ${addonFolders.length} Addons ----`);

    for (const folder of addonFolders) {
      const addonPath = path.join(addonsDir, folder);
      const packageJsonPath = path.join(addonPath, 'package.json');

      try {
        if (!fs.existsSync(packageJsonPath)) {
          logger.warn(`Addon ${folder} is missing package.json, skipping`);
          continue;
        }

        const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');
        const packageJson: AddonPackageJson = JSON.parse(packageJsonContent);

        let addonEnabled = packageJson.enabled !== false;

        if (addonTableExists) {
          try {
            let addonRecord = await prisma.addon.findUnique({
              where: { slug: folder }
            });

            if (!addonRecord) {
              // This is a new addon, apply migrations if it's enabled
              if (packageJson.enabled !== false) {
                const migrationResult = await applyAddonMigrations(folder, packageJson);
                if (!migrationResult.success) {
                  logger.error(`Failed to apply migrations for new addon ${packageJson.name}:`, migrationResult.message);
                  // Continue with installation but disable the addon
                  addonEnabled = false;
                }
              }

              addonRecord = await prisma.addon.create({
                data: {
                  name: packageJson.name,
                  slug: folder,
                  description: packageJson.description || '',
                  version: packageJson.version,
                  author: packageJson.author || '',
                  enabled: addonEnabled,
                  mainFile: packageJson.main || 'index.ts'
                }
              });
              logger.info(`Added addon ${packageJson.name} to database`);
            } else {
              await prisma.addon.update({
                where: { id: addonRecord.id },
                data: {
                  name: packageJson.name,
                  description: packageJson.description || '',
                  version: packageJson.version,
                  author: packageJson.author || '',
                  mainFile: packageJson.main || 'index.ts'
                }
              });

              addonEnabled = addonRecord.enabled;
            }

            if (!addonEnabled) {
              logger.info(`Addon ${packageJson.name} is disabled, skipping`);
              continue;
            }
          } catch (error) {
            logger.error(`Database error for addon ${folder}:`, error);
          }
        }

        const mainFile = packageJson.main || 'index.ts';
        const mainFilePath = path.join(addonPath, mainFile);

        if (!fs.existsSync(mainFilePath)) {
          logger.warn(`Addon ${packageJson.name} is missing main file (${mainFile}), skipping`);
          continue;
        }

        const addonViewsPath = path.join(addonPath, 'views');
        if (!fs.existsSync(addonViewsPath)) {
          fs.mkdirSync(addonViewsPath, { recursive: true });
        }

        const addonRouter = Router();
        const addonAPI: AddonAPI = {
          registerRoute: (routePath, router) => {
            app.use(routePath, router);
          },
          logger,
          prisma,
          addonPath,
          viewsPath: addonViewsPath,
          getComponentPath: (componentPath: string) => {
            return path.join(__dirname, '../..', componentPath);
          },
          ui: {
            addSidebarItem: (item: SidebarItem) => uiComponentStore.addSidebarItem(item),
            removeSidebarItem: (id: string) => uiComponentStore.removeSidebarItem(id),
            getSidebarItems: (section?: string, isAdmin?: boolean) => uiComponentStore.getSidebarItems(section, isAdmin),
            addServerMenuItem: (item: ServerMenuItem) => uiComponentStore.addServerMenuItem(item),
            removeServerMenuItem: (id: string) => uiComponentStore.removeServerMenuItem(id),
            getServerMenuItems: (feature?: string) => uiComponentStore.getServerMenuItems(feature),
            addServerSection: (section: ServerSection) => uiComponentStore.addServerSection(section),
            removeServerSection: (id: string) => uiComponentStore.removeServerSection(id),
            getServerSections: () => uiComponentStore.getServerSections(),
            addServerSectionItem: (sectionId: string, item: ServerSectionItem) => uiComponentStore.addServerSectionItem(sectionId, item),
            removeServerSectionItem: (sectionId: string, itemId: string) => uiComponentStore.removeServerSectionItem(sectionId, itemId),
            getServerSectionItems: (sectionId: string) => uiComponentStore.getServerSectionItems(sectionId)
          },
          renderView: (viewName: string, data: any = {}) => {
            const ejs = require('ejs');
            const viewPath = path.join(addonViewsPath, viewName);

            try {
              if (!fs.existsSync(viewPath)) {
                throw new Error(`View ${viewName} not found in addon ${packageJson.name}`);
              }

              return ejs.renderFile(viewPath, data, {}, (err: any, str: string) => {
                if (err) {
                  logger.error(`Error rendering view ${viewName}:`, err);
                  return `Error rendering view: ${err.message}`;
                }
                return str;
              });
            } catch (error: any) {
              logger.error(`Error rendering view ${viewName}:`, error);
              return `Error rendering view: ${error.message}`;
            }
          },
          utils: {
            isUserAdmin: async (userId: number) => {
              try {
                const user = await prisma.users.findUnique({
                  where: { id: userId }
                });
                return user?.isAdmin === true;
              } catch (error) {
                logger.error(`Error checking if user is admin:`, error);
                return false;
              }
            },

            getServerById: async (serverId: number) => {
              try {
                return await prisma.server.findUnique({
                  where: { id: serverId },
                  include: {
                    node: true,
                    image: true,
                    owner: true,
                  }
                });
              } catch (error) {
                logger.error(`Error getting server by ID:`, error);
                return null;
              }
            },
            getServerByUUID: async (uuid: string) => {
              try {
                return await prisma.server.findUnique({
                  where: { UUID: uuid },
                  include: {
                    node: true,
                    image: true,
                    owner: true,
                  }
                });
              } catch (error) {
                logger.error(`Error getting server by UUID:`, error);
                return null;
              }
            },
            getServerPorts: (server: any) => {
              try {
                if (!server.Ports) return [];
                return JSON.parse(server.Ports);
              } catch (error) {
                logger.error(`Error parsing server ports:`, error);
                return [];
              }
            },
            getPrimaryPort: (server: any) => {
              try {
                if (!server.Ports) return null;
                const ports = JSON.parse(server.Ports);
                return ports.find((port: any) => port.primary === true);
              } catch (error) {
                logger.error(`Error getting primary port:`, error);
                return null;
              }
            }
          }
        };

        try {
          const addonModule = require(mainFilePath);

          if (typeof addonModule === 'function') {
            addonModule(addonRouter, addonAPI);
            const routerPath = packageJson.router || '/';
            Object.defineProperty(addonRouter, 'name', { value: `router_${folder}` });
            app.use(routerPath, addonRouter);
            loadedAddons.set(folder, { router: addonRouter, path: routerPath });
            logger.info(`Loaded addon: ${packageJson.name} (v${packageJson.version})`);
          } else if (addonModule.default && typeof addonModule.default === 'function') {
            addonModule.default(addonRouter, addonAPI);
            const routerPath = packageJson.router || '/';
            Object.defineProperty(addonRouter, 'name', { value: `router_${folder}` });
            app.use(routerPath, addonRouter);
            loadedAddons.set(folder, { router: addonRouter, path: routerPath });
            logger.info(`Loaded addon: ${packageJson.name} (v${packageJson.version})`);
          } else {
            logger.error(`Invalid main export for addon ${packageJson.name}`, null);
          }
        } catch (error: any) {
          logger.error(`Failed to initialize addon ${packageJson.name}:`, error.message);
        }
      } catch (error: any) {
        logger.error(`Failed to load addon from folder ${folder}:`, error.message);
      }
    }
  } else {
    logger.info('---- Found 0 Addons ----');
  }
}

/**
 * Apply migrations defined in an addon's package.json
 * @param slug The addon slug
 * @param packageJson The addon's package.json content
 */
async function applyAddonMigrations(slug: string, packageJson: AddonPackageJson) {
  if (!packageJson.migrations || packageJson.migrations.length === 0) {
    return { success: true, message: 'No migrations to apply' };
  }

  logger.info(`Applying ${packageJson.migrations.length} migrations for addon ${packageJson.name}`);

  try {
    // Create a migrations table for addons if it doesn't exist
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS AddonMigration (
        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        addonSlug TEXT NOT NULL,
        migrationName TEXT NOT NULL,
        appliedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(addonSlug, migrationName)
      )
    `;

    // Get already applied migrations for this addon
    const appliedMigrations = await prisma.$queryRaw<{ migrationName: string }[]>`
      SELECT migrationName FROM AddonMigration WHERE addonSlug = ${slug}
    `;
    const appliedMigrationNames = appliedMigrations.map(m => m.migrationName);

    // Apply each migration that hasn't been applied yet
    for (const migration of packageJson.migrations) {
      if (appliedMigrationNames.includes(migration.name)) {
        logger.info(`Migration ${migration.name} already applied, skipping`);
        continue;
      }

      try {
        // Execute the migration SQL
        await prisma.$executeRawUnsafe(migration.sql);

        // Record the migration as applied
        await prisma.$executeRaw`
          INSERT INTO AddonMigration (addonSlug, migrationName)
          VALUES (${slug}, ${migration.name})
        `;

        logger.info(`Successfully applied migration ${migration.name} for addon ${packageJson.name}`);
      } catch (error: any) {
        logger.error(`Failed to apply migration ${migration.name}:`, error.message);
        return { success: false, message: `Failed to apply migration ${migration.name}: ${error.message}` };
      }
    }

    return { success: true, message: `Successfully applied ${packageJson.migrations.length} migrations` };
  } catch (error: any) {
    logger.error(`Failed to apply migrations for addon ${packageJson.name}:`, error.message);
    return { success: false, message: `Failed to apply migrations: ${error.message}` };
  }
}

export async function toggleAddonStatus(slug: string, enabled: boolean) {
  try {
    try {
      await prisma.$queryRaw`SELECT 1 FROM Addon LIMIT 1`;
    } catch (error) {
      logger.warn('Addon table does not exist yet. Run migrations to create it.');
      return false;
    }

    const addon = await prisma.addon.findUnique({
      where: { slug }
    });

    if (!addon) {
      throw new Error(`Addon ${slug} not found`);
    }

    // If enabling the addon, apply migrations
    if (enabled && !addon.enabled) {
      const addonsDir = path.join(__dirname, '../../storage/addons');
      const addonPath = path.join(addonsDir, slug);
      const packageJsonPath = path.join(addonPath, 'package.json');

      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');
          const packageJson: AddonPackageJson = JSON.parse(packageJsonContent);

          const migrationResult = await applyAddonMigrations(slug, packageJson);
          if (!migrationResult.success) {
            logger.error(`Failed to enable addon ${packageJson.name} due to migration errors:`, migrationResult.message);
            return false;
          }
        } catch (error: any) {
          logger.error(`Failed to read package.json for addon ${slug}:`, error.message);
          // Continue with enabling the addon even if we can't read the package.json
        }
      }
    }

    await prisma.addon.update({
      where: { id: addon.id },
      data: { enabled }
    });

    return true;
  } catch (error: any) {
    logger.error(`Failed to toggle addon status:`, error.message);
    return false;
  }
}

export async function getAllAddons() {
  try {
    try {
      await prisma.$queryRaw`SELECT 1 FROM Addon LIMIT 1`;
    } catch (error) {
      logger.warn('Addon table does not exist yet. Run migrations to create it.');
      return [];
    }

    return await prisma.addon.findMany({
      orderBy: { name: 'asc' }
    });
  } catch (error: any) {
    logger.error(`Failed to get addons:`, error.message);
    return [];
  }
}

const loadedAddons: Map<string, { router: Router, path: string }> = new Map();

function unloadAddon(app: Express, slug: string) {
  const addon = loadedAddons.get(slug);
  if (addon) {
    const routerStack = (app as any)._router.stack;
    const routerIndex = routerStack.findIndex((layer: any) =>
      layer.handle && layer.handle.name === `router_${slug}`);

    if (routerIndex !== -1) {
      routerStack.splice(routerIndex, 1);
      logger.info(`Unloaded addon: ${slug}`);
    }

    loadedAddons.delete(slug);
  }
}

export async function reloadAddons(app: Express) {
  logger.info('Reloading addons...');

  try {
    const addons = await prisma.addon.findMany();

    const enabledAddons = addons.filter(addon => addon.enabled);
    const disabledAddons = addons.filter(addon => !addon.enabled);

    if (enabledAddons.length > 0) {
      logger.info(`Enabled addons: ${enabledAddons.map(a => a.name).join(', ')}`);
    }

    if (disabledAddons.length > 0) {
      logger.info(`Disabled addons: ${disabledAddons.map(a => a.name).join(', ')}`);
    }

    for (const addon of disabledAddons) {
      if (loadedAddons.has(addon.slug)) {
        unloadAddon(app, addon.slug);
      }
    }
  } catch (error) {
    logger.error('Failed to get addons:', error);
  }

  await loadAddons(app);

  return { success: true, message: 'Addons reloaded successfully' };
}