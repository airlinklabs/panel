import { z } from 'zod';

// ── Modrinth API Schemas ──────────────────────────────────────────────

export const ModrinthSearchResultSchema = z.object({
  hits: z.array(z.object({
    slug: z.string(),
    title: z.string(),
    project_type: z.string(),
    project_id: z.string(),
    description: z.string(),
    downloads: z.number(),
    follows: z.number(),
    categories: z.array(z.string()).optional(),
    versions: z.array(z.string()),
    icon_url: z.string().optional(),
    date_created: z.string(),
    date_modified: z.string(),
    latest_version: z.string().optional(),
    author: z.string(),
    display_categories: z.array(z.string()).optional(),
  })),
  offset: z.number(),
  limit: z.number(),
  total_hits: z.number(),
});

export type ModrinthSearchResult = z.infer<typeof ModrinthSearchResultSchema>;

export const ModrinthProjectSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  categories: z.array(z.string()).optional(),
  client_side: z.string().optional(),
  server_side: z.string().optional(),
  body: z.string().optional(),
  status: z.string(),
  requested_status: z.string().optional(),
  additional_categories: z.array(z.string()).optional(),
  issues_url: z.string().optional(),
  source_url: z.string().optional(),
  wiki_url: z.string().optional(),
  discord_url: z.string().optional(),
  donation_urls: z.array(z.object({
    id: z.string(),
    platform: z.string(),
    url: z.string(),
  })).optional(),
  project_type: z.string(),
  downloads: z.number(),
  icon_url: z.string().optional(),
  color: z.number().optional(),
  team_id: z.string(),
  moderator_message: z.string().nullable().optional(),
  date_created: z.string(),
  date_modified: z.string(),
  latest_version: z.string().optional(),
  license: z.string().nullable().optional(),
  gallery: z.array(z.string()).optional(),
  featured_gallery: z.string().optional(),
});

export type ModrinthProject = z.infer<typeof ModrinthProjectSchema>;

export const ModrinthVersionSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  name: z.string(),
  version_number: z.string(),
  changelog: z.string().optional(),
  dependencies: z.array(z.object({
    project_id: z.string().optional(),
    version_id: z.string().optional(),
    file_name: z.string().optional(),
    dependency_type: z.string(),
  })),
  date_published: z.string(),
  downloads: z.number(),
  version_type: z.string(),
  files: z.array(z.object({
    hashes: z.record(z.string(), z.string()),
    url: z.string(),
    filename: z.string(),
    primary: z.boolean(),
    size: z.number(),
    file_type: z.string().optional(),
  })),
  game_versions: z.array(z.string()),
  loaders: z.array(z.string()),
});

export type ModrinthVersion = z.infer<typeof ModrinthVersionSchema>;

// ── Panel Types ───────────────────────────────────────────────────────

export interface ServerData {
  id: number;
  UUID: string;
  name: string;
  description?: string | null;
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
  dockerImage?: string | null;
  startCommand?: string | null;
}

export interface ServerInfo {
  host: string;
  port: number;
  daemonToken: string;
}

// ── Settings ──────────────────────────────────────────────────────────

export interface ModrinthSettings {
  showWarningBanner: boolean;
  warningTitle: string;
  warningMessage: string;
  disabledProjectTypes: string[];
  blockedProjects: string[];
}

export const DEFAULT_SETTINGS: ModrinthSettings = {
  showWarningBanner: false,
  warningTitle: 'Notice',
  warningMessage: '',
  disabledProjectTypes: [],
  blockedProjects: [],
};

// ── Progress ──────────────────────────────────────────────────────────

export type InstallStage =
  | 'initializing'
  | 'downloading'
  | 'processing'
  | 'installing_mods'
  | 'installing_overrides'
  | 'finalizing'
  | 'completed'
  | 'failed';

export interface ModProgress {
  name: string;
  status: 'pending' | 'downloading' | 'completed' | 'failed' | 'skipped';
}

export interface InstallProgress {
  serverId: string;
  projectId: string;
  projectName: string;
  stage: InstallStage;
  overall: number;
  total: number;
  done: number;
  skipped: number;
  failed: number;
  currentMod: string;
  mods: ModProgress[];
  errors: string[];
  warnings: string[];
  startedAt: number;
}

// ── Addon API (minimal subset we use) ─────────────────────────────────

export interface AddonApi {
  registerRoute: (path: string, router: any) => void;
  logger: {
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
  };
  prisma: any;
  config: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
  ui: {
    addSidebarItem: (item: any) => void;
    removeSidebarItem: (id: string) => void;
  };
  middleware: {
    isAuthenticated: any;
    csrfProtection: any;
  };
  viewsPath: string;
  renderView: (viewName: string, data?: any, isMobile?: boolean) => Promise<string>;
  getComponentPath: (p: string) => string;
}
