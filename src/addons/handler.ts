import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import express, { Express, Router, Request, Response, NextFunction } from 'express';
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

// ── Security Utilities ──────────────────────────────────────────

/** Allowed SQL verbs for addon migrations (CREATE/ALTER/DROP TABLE, CREATE INDEX) */
const ALLOWED_MIGRATION_SQL = /^\s*(CREATE\s+(TABLE|INDEX)\s+(IF\s+NOT\s+EXISTS\s+)?|ALTER\s+TABLE\s+|DROP\s+(TABLE|INDEX)\s+(IF\s+EXISTS\s+)?)\S/i;

/**
 * Sanitize a user-provided path to prevent directory traversal.
 * Returns the resolved absolute path if it stays within baseDir, or null if it escapes.
 */
function sanitizePath(baseDir: string, userPath: string): string | null {
  const realBase = fs.realpathSync(baseDir);
  let resolved: string;
  try {
    resolved = fs.realpathSync(path.resolve(baseDir, userPath));
  } catch {
    resolved = path.resolve(baseDir, userPath);
  }
  if (resolved.startsWith(realBase + path.sep) || resolved === realBase) {
    return resolved;
  }
  return null;
}

/**
 * Validate a URL is safe to fetch: must be HTTPS and from an allowed domain.
 */
function validateUrl(urlStr: string, allowedDomains: string[]): boolean {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== 'https:') return false;
    if (allowedDomains.length > 0 && !allowedDomains.some(d => url.hostname === d || url.hostname.endsWith('.' + d))) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Escape HTML entities for safe injection into HTML context */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/** Escape a string for safe use inside a JavaScript string literal in an HTML script tag */
function escapeJsString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/<\//g, '<\\/');
}

/** Create auth middleware bound to the panel's auth system */
function createRequireAuth(isAdmin?: boolean, permission?: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    isAuthenticated(isAdmin, permission)(req, res, next);
  };
}

/** Create CSRF protection middleware */
function createRequireCsrf() {
  return (req: Request, res: Response, next: NextFunction) => {
    csrfProtection(req, res, next);
  };
}

let _appInstance: Express | null = null;

export function setAppInstance(app: Express): void {
  _appInstance = app;
}

function getApp(): Express {
  if (!_appInstance) throw new Error('App instance not initialized');
  return _appInstance;
}

function buildTailwind() {
  const tailwindBin = path.join(__dirname, '../../node_modules/.bin/tailwindcss');
  const fallbackNpx = 'npx tailwindcss';
  const cmd = fs.existsSync(tailwindBin) ? tailwindBin : fallbackNpx;
  exec(`${cmd} -i ./public/tw.css -o ./public/styles.css`, (error, stdout, stderr) => {
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

/** Server data returned by addon API utils (includes relations) */
export type AddonServerData = Awaited<ReturnType<PrismaClient['server']['findUnique']>> & {
  node?: { id: number; name: string; address: string; port: number; key: string } | null;
  image?: { id: number; UUID: string; name: string | null; dockerImages: string | null } | null;
  owner?: { id: number; username: string | null; email: string; avatar: string | null } | null;
};

/** Port entry parsed from Server.Ports JSON */
export interface AddonServerPort {
  port: number;
  primary?: boolean;
  [key: string]: unknown;
}

/** View data passed to addon EJS templates */
export interface AddonViewData extends Record<string, unknown> {
  title?: string;
  user?: { id: number; username: string | null; email: string; avatar: string | null; isAdmin: boolean; description?: string | null };
  settings?: Record<string, unknown>;
  req?: { translations: Record<string, string>; path: string; query: Record<string, string>; session?: Record<string, unknown> };
  nonce?: string;
  [key: string]: unknown;
}

export interface AddonAPI {
  registerRoute: (path: string, router: Router) => void;
  logger: typeof logger;
  prisma: PrismaClient;

  utils: {
    isUserAdmin: (userId: number) => Promise<boolean>;
    getServerById: (serverId: number) => Promise<AddonServerData | null>;
    getServerByUUID: (uuid: string) => Promise<AddonServerData | null>;
    getServerPorts: (server: AddonServerData) => AddonServerPort[];
    getPrimaryPort: (server: AddonServerData) => AddonServerPort | null;
  };

  /** Security utilities for safe file operations and URL fetching */
  security: {
    /** Resolve a user path within a base directory. Returns null if path escapes. */
    sanitizePath: (baseDir: string, userPath: string) => string | null;
    /** Validate a URL is HTTPS and from allowed domains. Empty allowedDomains = any HTTPS. */
    validateUrl: (url: string, allowedDomains?: string[]) => boolean;
    /** Escape HTML entities for safe injection into HTML */
    escapeHtml: (str: string) => string;
    /** Escape a string for safe use inside a JS string literal in a <script> tag */
    escapeJsString: (str: string) => string;
    /** Create auth middleware (wraps panel's isAuthenticated) */
    requireAuth: (isAdmin?: boolean, permission?: string) => (req: Request, res: Response, next: NextFunction) => void;
    /** Create CSRF protection middleware */
    requireCsrf: () => (req: Request, res: Response, next: NextFunction) => void;
  };

  addonPath: string;
  viewsPath: string;
  desktopViewsPath: string;
  mobileViewsPath: string;

  renderView: (viewName: string, data?: AddonViewData, isMobile?: boolean) => Promise<string>;

  getComponentPath: (componentPath: string) => string;

  /** Resolve a panel UI component path by name (e.g. 'header', 'footer', 'template') */
  getComponent: (name: string, viewport?: 'desktop' | 'mobile' | 'auto') => string | null;

  /** Get all panel UI component paths for a viewport */
  getComponents: (viewport?: 'desktop' | 'mobile' | 'auto') => Record<string, string>;

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

  const panelViewsPath = path.join(__dirname, '../../views');
  const { AddonComponentResolver } = require('./addonComponentResolver') as typeof import('./addonComponentResolver');
  const componentResolver = new AddonComponentResolver(panelViewsPath);

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
    getComponent: (name: string, viewport: 'desktop' | 'mobile' | 'auto' = 'auto') => {
      const resolved = componentResolver.resolveViewport(viewport, undefined);
      return componentResolver.getComponent(name, resolved);
    },
    getComponents: (viewport: 'desktop' | 'mobile' | 'auto' = 'auto') => {
      const resolved = componentResolver.resolveViewport(viewport, undefined);
      return componentResolver.getComponents(resolved);
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
          }) as AddonServerData | null;
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
          }) as AddonServerData | null;
        } catch (error) {
          logger.error('Error getting server by UUID:', error);
          return null;
        }
      },
      getServerPorts: (server: AddonServerData) => {
        try {
          if (!server.Ports) return [];
          return JSON.parse(server.Ports) as AddonServerPort[];
        } catch (error) {
          logger.error('Error parsing server ports:', error);
          return [];
        }
      },
      getPrimaryPort: (server: AddonServerData) => {
        try {
          if (!server.Ports) return null;
          const ports = JSON.parse(server.Ports) as AddonServerPort[];
          return ports.find(port => port.primary === true) ?? null;
        } catch (error) {
          logger.error('Error getting primary port:', error);
          return null;
        }
      },
    },
    security: {
      sanitizePath,
      validateUrl: (url: string, allowedDomains: string[] = []) => validateUrl(url, allowedDomains),
      escapeHtml,
      escapeJsString,
      requireAuth: (isAdmin?: boolean, permission?: string) => createRequireAuth(isAdmin, permission),
      requireCsrf: () => createRequireCsrf(),
    },
    renderView: async (viewName: string, data: AddonViewData = {}, isMobile: boolean = false): Promise<string> => {
      const ejs = require('ejs');
      const viewportDir = isMobile ? addonMobileViewsPath : addonDesktopViewsPath;
      const viewportPath = path.join(viewportDir, viewName);
      const fallbackPath = path.join(addonViewsPath, viewName);
      const viewPath = fs.existsSync(viewportPath) ? viewportPath : fallbackPath;

      if (!fs.existsSync(viewPath)) {
        throw new Error(`View ${viewName} not found in addon ${slug}`);
      }

      let panelSettings: Record<string, unknown> = {};
      try {
        const row = await (prisma as any).settings.findUnique({ where: { id: 1 } });
        if (row) panelSettings = row;
      } catch (_) {}

      // Inject all template vars into data so addon views (and their includes) have access
      data.nonce = data.nonce || '';
      data.settings = { ...panelSettings, ...(data.settings || {}) };
      data.user = data.user || { id: 0, username: 'Guest', email: '', avatar: null, isAdmin: false, description: '' };
      data.req = data.req || { translations: {}, path: '', query: {} };

      const content = await new Promise<string>((resolve, reject) => {
        ejs.renderFile(viewPath, data, {}, (err: any, str: string) => {
          if (err) {
            logger.error(`Error rendering view ${viewName}:`, err);
            reject(err);
          } else {
            resolve(str);
          }
        });
      });

      const viewsBase = isMobile
        ? path.join(__dirname, '../../views/mobile')
        : path.join(__dirname, '../../views/desktop');
      const headerPath = path.join(viewsBase, 'components/header.ejs');
      const footerPath = path.join(viewsBase, 'components/footer.ejs');
      const templatePath = path.join(viewsBase, 'components/template.ejs');

      const hasHeader = fs.existsSync(headerPath);
      const hasFooter = fs.existsSync(footerPath);
      const hasTemplate = fs.existsSync(templatePath);

      if (!hasHeader && !hasFooter) return content;

      const templateData: AddonViewData & { regularMenuItems: SidebarItem[]; adminMenuItems: SidebarItem[]; addonSidebarIds: Set<string>; addonUrls: string[]; icon: (name: string, opts?: Record<string, unknown>) => string } = {
        ...data,
        settings: { ...panelSettings, ...(data.settings || {}) },
        user: data.user!,
        req: data.req!,
        nonce: data.nonce || '',
        regularMenuItems: uiComponentStore.getSidebarItems(undefined, false),
        adminMenuItems: uiComponentStore.getSidebarItems('admin', true),
        addonSidebarIds: uiComponentStore.getAddonSidebarIds(),
        addonUrls: uiComponentStore.getSidebarItems(undefined, false)
          .filter(item => uiComponentStore.getAddonSidebarIds().has(item.id))
          .map(item => item.url),
        icon: (name: string, opts: any = {}) => {
          const icons: Record<string, string> = {
            'search': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>',
            'layout-dashboard': '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
            'settings': '<circle cx="12" cy="12" r="3"/><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
            'server': '"M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"',
            'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
            'network': '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 6v12M19 6v12M5 12h14"/>',
            'box': '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
            'puzzle': '<path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.611a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.877.528 1.073 1.01a2.5 2.5 0 1 0 3.259-3.259c-.482-.196-.933-.558-1.01-1.073-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0 1 12 1.998c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02z"/>',
            'cloud': '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
            'key': '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
            'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
            'layout-grid': '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
            'bar-chart': '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
            'chevron-right': '<polyline points="9 18 15 12 9 6"/>',
            'x': '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
            'menu': '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
            'lock': '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
          };
          const iconContent = icons[name] || '';
          const cls = opts.class || 'w-5 h-5';
          const sw = opts.strokeWidth !== undefined ? opts.strokeWidth : 1.5;
          return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="${sw}">${iconContent}</svg>`;
        },
      };

      let header = '';
      if (hasHeader) {
        header = await new Promise<string>((resolve) => {
          ejs.renderFile(headerPath, templateData, {}, (err: any, str: string) => {
            if (err) { resolve(''); } else { resolve(str); }
          });
        });
      }

      let template = '';
      if (hasTemplate) {
        template = await new Promise<string>((resolve) => {
          ejs.renderFile(templatePath, templateData, {}, (err: any, str: string) => {
            if (err) { resolve(''); } else { resolve(str); }
          });
        });
      }

      let footer = '';
      if (hasFooter) {
        footer = await new Promise<string>((resolve) => {
          ejs.renderFile(footerPath, templateData, {}, (err: any, str: string) => {
            if (err) { resolve(''); } else { resolve(str); }
          });
        });
      }

      if (isMobile) {
        return `${header}\n<main id="page-content" class="">\n${template}\n${content}\n</main>\n${footer}`;
      }
      return `${header}\n<main class="min-h-screen m-auto"><div class="flex min-h-screen"><div class="w-60 h-full">\n${template}\n</div><div id="page-content" class="flex-1 overflow-y-auto pt-16">\n${content}\n</div></div></main>\n${footer}`;
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
    const disabledPhPath = path.join(addonPath, 'disabled.ph');

    // disabled.ph acts as a hard-disable flag: addon is not loaded regardless of DB state.
    // Once the admin enables it via the UI, the file is deleted and DB state takes over.
    const hasDisabledPh = fs.existsSync(disabledPhPath);

    let addonEnabled = !hasDisabledPh && manifest.enabled !== false;

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

          // If disabled.ph exists, force DB state to disabled
          if (hasDisabledPh && addonRecord.enabled) {
            await prisma.addon.update({ where: { id: addonRecord.id }, data: { enabled: false } });
            addonEnabled = false;
          } else {
            addonEnabled = addonRecord.enabled;
          }
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

      // When enabling, delete disabled.ph if it exists — DB state takes over from here
      if (enabled) {
        const disabledPhPath = path.join(__dirname, '../../storage/addons', slug, 'disabled.ph');
        if (fs.existsSync(disabledPhPath)) {
          fs.unlinkSync(disabledPhPath);
          logger.info(`Removed disabled.ph for ${slug}`);
        }
      }

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
      // Validate migration SQL — only allow safe DDL verbs
      if (!ALLOWED_MIGRATION_SQL.test(migration.sql)) {
        logger.error(`Migration "${migration.name}" rejected: SQL does not match allowed DDL pattern`);
        return { success: false, message: `Migration "${migration.name}" contains disallowed SQL. Only CREATE TABLE, CREATE INDEX, ALTER TABLE, and DROP are permitted.` };
      }
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
          // Validate rollback SQL too
          if (!ALLOWED_MIGRATION_SQL.test(migration.down!)) {
            logger.warn(`Rollback migration "${migration.name}" rejected: disallowed SQL pattern`);
            continue;
          }
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
