// ── Panel Addon API Contract ──
// These types represent what the panel provides to addons.
// Import from the panel's addonHandler if available, otherwise define locally.

import type { Request, Response, NextFunction } from 'express';

// ── Express Type Augmentation ──
declare module 'express' {
  interface Request {
    session?: {
      user?: {
        id: number;
        email: string;
        username?: string | null;
        isAdmin?: boolean;
        avatar?: string | null;
      };
      device?: string;
      [key: string]: unknown;
    };
  }
}

/** Minimal Prisma-like interface for addon DB operations */
export interface AddonPrisma {
  $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
  $queryRaw: <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
  $transaction: <T>(fn: (tx: AddonPrisma) => Promise<T>) => Promise<T>;
  server: {
    findUnique: (args: { where: Record<string, unknown>; include?: Record<string, boolean> }) => Promise<AddonServerData | null>;
    findMany: (args?: Record<string, unknown>) => Promise<AddonServerData[]>;
  };
  users: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<AddonUserData | null>;
  };
}

/** Server data from Prisma */
export interface AddonServerData {
  id: number;
  UUID: string;
  name: string;
  description: string | null;
  Ports: string;
  Memory: number;
  Cpu: number;
  Storage: number;
  ownerId: number;
  nodeId: number;
  imageId: number;
  Installing: boolean;
  Queued: boolean;
  Suspended: boolean;
  dockerImage: string | null;
  StartCommand: string | null;
  node?: { id: number; name: string; address: string; port: number; key: string } | null;
  image?: { id: number; UUID: string; name: string | null; dockerImages: string | null } | null;
  owner?: { id: number; username: string | null; email: string; avatar: string | null } | null;
}

/** User data from Prisma */
export interface AddonUserData {
  id: number;
  email: string;
  username: string | null;
  isAdmin: boolean;
  avatar: string | null;
  description: string | null;
}

/** Port entry parsed from Server.Ports JSON */
export interface AddonServerPort {
  port: number;
  primary?: boolean;
  [key: string]: unknown;
}

/** Logger interface */
export interface AddonLogger {
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  debug: (message: string, ...args: unknown[]) => void;
}

/** Sidebar item for registration */
export interface AddonSidebarItem {
  id: string;
  label: string;
  icon: string;
  url: string;
  priority: number;
  section?: string;
  isAdminItem?: boolean;
}

/** Security utilities provided by the panel */
export interface AddonSecurity {
  sanitizePath: (baseDir: string, userPath: string) => string | null;
  validateUrl: (url: string, allowedDomains?: string[]) => boolean;
  escapeHtml: (str: string) => string;
  escapeJsString: (str: string) => string;
  requireAuth: (isAdmin?: boolean, permission?: string) => (req: Request, res: Response, next: NextFunction) => void;
  requireCsrf: () => (req: Request, res: Response, next: NextFunction) => void;
}

/** UI utilities for registering sidebar items and slots */
export interface AddonUI {
  addSidebarItem: (item: AddonSidebarItem) => void;
  removeSidebarItem: (id: string) => void;
  getSidebarItems: (section?: string, isAdmin?: boolean) => AddonSidebarItem[];
  registerSlot: (slotId: string, render: (locals: Record<string, unknown>) => string | Promise<string>) => void;
  unregisterSlot: (slotId: string) => void;
}

/** Config store for per-addon key-value storage */
export interface AddonConfigStore {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  getMany: (keys: string[]) => Promise<Record<string, string | null>>;
  setMany: (entries: Array<{ key: string; value: string }>) => Promise<void>;
  delete: (key: string) => Promise<void>;
  deleteAll: () => Promise<void>;
  getAll: () => Promise<Record<string, string>>;
}

/** Middleware references */
export interface AddonMiddleware {
  isAuthenticated: (isAdmin?: boolean, permission?: string) => (req: Request, res: Response, next: NextFunction) => void;
  apiValidator: (permission?: string) => (req: Request, res: Response, next: NextFunction) => void;
  csrfProtection: (req: Request, res: Response, next: NextFunction) => void;
}

/** Full addon API provided by the panel */
export interface AddonApi {
  registerRoute: (path: string, router: unknown) => void;
  logger: AddonLogger;
  prisma: AddonPrisma;
  security: AddonSecurity;
  addonPath: string;
  viewsPath: string;
  desktopViewsPath: string;
  mobileViewsPath: string;
  renderView: (viewName: string, data?: Record<string, unknown>, isMobile?: boolean) => Promise<string>;
  getComponentPath: (componentPath: string) => string;
  config: AddonConfigStore;
  ui: AddonUI;
  commands: { register: (command: { name: string; description: string; handler: (args: string[]) => Promise<string> | string }) => void };
  schedule: { register: (task: { id: string; intervalMs: number; handler: () => Promise<void> | void }) => void };
  permissions: { register: (permission: string) => boolean };
  middleware: AddonMiddleware;
  assetsUrl: string;
  utils: {
    isUserAdmin: (userId: number) => Promise<boolean>;
    getServerById: (serverId: number) => Promise<AddonServerData | null>;
    getServerByUUID: (uuid: string) => Promise<AddonServerData | null>;
    getServerPorts: (server: AddonServerData) => AddonServerPort[];
    getPrimaryPort: (server: AddonServerData) => AddonServerPort | null;
  };
}
