// ── Modrinth API Types (validated with Zod) ──

import { z } from 'zod';

// ── Modrinth Search Result ──

export const ModrinthSearchResultSchema = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  categories: z.array(z.string()),
  client_side: z.enum(['required', 'optional', 'unsupported']),
  server_side: z.enum(['required', 'optional', 'unsupported']),
  project_type: z.enum(['mod', 'modpack', 'resourcepack', 'shader', 'datapack', 'plugin']),
  downloads: z.number(),
  icon_url: z.string().nullable().optional(),
  color: z.number().nullable().optional(),
  project_id: z.string(),
  author: z.string(),
  display_categories: z.array(z.string()).optional(),
  versions: z.array(z.string()),
  follows: z.number(),
  date_created: z.string(),
  date_modified: z.string(),
  latest_version: z.string(),
  license: z.string(),
  gallery: z.array(z.string()).optional(),
});

export type ModrinthSearchResult = z.infer<typeof ModrinthSearchResultSchema>;

export const ModrinthSearchResponseSchema = z.object({
  hits: z.array(ModrinthSearchResultSchema),
  offset: z.number(),
  limit: z.number(),
  total_hits: z.number(),
});

export type ModrinthSearchResponse = z.infer<typeof ModrinthSearchResponseSchema>;

// ── Modrinth Project ──

export const ModrinthProjectSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  body: z.string().optional(),
  categories: z.array(z.string()),
  client_side: z.enum(['required', 'optional', 'unsupported']),
  server_side: z.enum(['required', 'optional', 'unsupported']),
  project_type: z.enum(['mod', 'modpack', 'resourcepack', 'shader', 'datapack', 'plugin']),
  downloads: z.number(),
  icon_url: z.string().nullable().optional(),
  color: z.number().nullable().optional(),
  issues_url: z.string().nullable().optional(),
  source_url: z.string().nullable().optional(),
  wiki_url: z.string().nullable().optional(),
  discord_url: z.string().nullable().optional(),
  donation_urls: z.array(z.object({
    platform: z.string(),
    url: z.string(),
  })).optional(),
  versions: z.array(z.string()),
  follows: z.number(),
  date_created: z.string(),
  date_modified: z.string(),
  latest_version: z.string(),
  license: z.string(),
  gallery: z.array(z.string()).optional(),
  game_versions: z.array(z.string()).optional(),
  loaders: z.array(z.string()).optional(),
});

export type ModrinthProject = z.infer<typeof ModrinthProjectSchema>;

// ── Modrinth Version ──

export const ModrinthVersionSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  name: z.string(),
  version_number: z.string(),
  changelog: z.string().nullable().optional(),
  date_published: z.string(),
  downloads: z.number(),
  version_type: z.enum(['release', 'beta', 'alpha']),
  status: z.string().optional(),
  game_versions: z.array(z.string()),
  loaders: z.array(z.string()),
  files: z.array(z.object({
    hashes: z.record(z.string(), z.string()),
    url: z.string(),
    filename: z.string(),
    primary: z.boolean(),
    size: z.number(),
    file_type: z.enum(['required', 'optional', 'incompatible', 'unknown']).optional(),
  })),
  dependencies: z.array(z.object({
    project_id: z.string(),
    version_id: z.string().nullable().optional(),
    file_name: z.string().nullable().optional(),
    dependency_type: z.enum(['required', 'optional', 'incompatible', 'embedded']),
  })).optional(),
});

export type ModrinthVersion = z.infer<typeof ModrinthVersionSchema>;

// ── Progress Types ──

export type ProgressStage =
  | 'initializing'
  | 'downloading'
  | 'processing'
  | 'installing_mods'
  | 'installing_overrides'
  | 'finalizing'
  | 'completed'
  | 'failed';

export type ModStatus = 'pending' | 'downloading' | 'completed' | 'failed' | 'skipped';

export interface ModProgress {
  projectId: string;
  projectName: string;
  status: ModStatus;
  size?: number;
  error?: string;
}

export interface InstallationProgress {
  serverId: string;
  projectId: string;
  projectName: string;
  stage: ProgressStage;
  totalMods: number;
  completedMods: number;
  skippedMods: number;
  failedMods: number;
  currentMod: string;
  mods: ModProgress[];
  errors: string[];
  warnings: string[];
  startedAt: number;
  completedAt?: number;
}

// ── Settings ──

export interface ModrinthSettings {
  showWarningBanner: boolean;
  warningTitle: string;
  warningMessage: string;
  disabledProjectTypes: string; // comma-separated
  blockedProjects: string; // comma-separated
}

// ── Installation Record (DB) ──

export interface InstallationRecord {
  id: number;
  projectId: string;
  projectType: string;
  projectName: string | null;
  versionId: string | null;
  serverId: string | null;
  status: 'completed' | 'failed' | 'blocked' | 'in_progress';
  error: string | null;
  installedAt: Date;
  createdAt: Date;
}

// ── Cache Entry ──

export interface CacheEntry {
  cacheKey: string;
  data: string;
  expiresAt: Date;
}

// ── Utility Types ──

export type ProjectType = 'mod' | 'modpack' | 'resourcepack' | 'shader' | 'datapack' | 'plugin';

export const PROJECT_TYPE_DIRS: Record<ProjectType, string> = {
  mod: 'mods',
  plugin: 'plugins',
  shader: 'shaderpacks',
  resourcepack: 'resourcepacks',
  datapack: 'world/datapacks',
  modpack: 'mods',
};

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  mod: 'Mod',
  modpack: 'Modpack',
  resourcepack: 'Resource Pack',
  shader: 'Shader',
  datapack: 'Datapack',
  plugin: 'Plugin',
};

export const ALLOWED_MODRINTH_DOMAINS = ['api.modrinth.com', 'cdn.modrinth.com', 'modrinth.com'];

export const REQUEST_TIMEOUT_MS = 15_000;
export const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const MAX_SEARCH_LENGTH = 200;
export const MAX_RESULTS_PER_PAGE = 50;
