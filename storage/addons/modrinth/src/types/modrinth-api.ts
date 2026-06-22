import { z } from 'zod';

export const ModrinthProjectSchema = z.object({
  id: z.string(),
  slug: z.string().optional(),
  project_type: z.string(),
  title: z.string(),
  description: z.string().optional().default(''),
  downloads: z.number().optional().default(0),
  followers: z.number().optional().default(0),
  categories: z.array(z.string()).optional().default([]),
  game_versions: z.array(z.string()).optional().default([]),
  loaders: z.array(z.string()).optional().default([]),
  icon_url: z.string().optional(),
  versions: z.array(z.string()).optional().default([]),
  body: z.string().optional(),
  license: z.object({ name: z.string() }).optional(),
  client_side: z.string().optional(),
  server_side: z.string().optional(),
  published: z.string().optional(),
  updated: z.string().optional(),
  date_modified: z.string().optional(),
  source_url: z.string().optional(),
  issues_url: z.string().optional(),
  wiki_url: z.string().optional(),
  discord_url: z.string().optional(),
  donation_urls: z.array(z.object({ platform: z.string(), url: z.string() })).optional(),
});

export type ModrinthProject = z.infer<typeof ModrinthProjectSchema>;

export const ModrinthVersionSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  name: z.string(),
  version_number: z.string(),
  version_type: z.string(),
  game_versions: z.array(z.string()).optional().default([]),
  loaders: z.array(z.string()).optional().default([]),
  date_published: z.string().optional(),
  files: z.array(z.object({
    hashes: z.object({ sha1: z.string().optional(), sha512: z.string().optional() }).optional(),
    url: z.string(),
    filename: z.string(),
    primary: z.boolean().optional().default(false),
    size: z.number().optional().default(0),
  })).optional().default([]),
});

export type ModrinthVersion = z.infer<typeof ModrinthVersionSchema>;

export const ModrinthSearchHitSchema = z.object({
  project_id: z.string(),
  title: z.string(),
  description: z.string().optional().default(''),
  project_type: z.string().optional(),
  icon_url: z.string().optional(),
  downloads: z.number().optional().default(0),
  follows: z.number().optional().default(0),
  categories: z.array(z.string()).optional().default([]),
  date_modified: z.string().optional(),
});

export type ModrinthSearchHit = z.infer<typeof ModrinthSearchHitSchema>;

export const ModrinthSearchResponseSchema = z.object({
  hits: z.array(ModrinthSearchHitSchema).optional().default([]),
  total_hits: z.number().optional().default(0),
  offset: z.number().optional().default(0),
  limit: z.number().optional().default(20),
});

export type ModrinthSearchResponse = z.infer<typeof ModrinthSearchResponseSchema>;

export interface ModpackIndex {
  formatVersion: number;
  game: string;
  versionId: string;
  name: string;
  summary?: string;
  files: Array<{
    path: string;
    hashes: { sha1: string; sha512?: string };
    env?: { client: string; server: string };
    downloads: string[];
    fileSize: number;
  }>;
  dependencies: {
    minecraft: string;
    [loader: string]: string;
  };
}

export interface ServerInfo {
  nodeAddress: string;
  nodePort: number;
  serverUUID: string;
  nodeKey: string;
}

export interface ServerData {
  UUID: string;
  name: string;
  description: string;
  status: string;
  Installing?: boolean;
  Suspended?: boolean;
  ownerId?: string;
  node?: { address: string; port: number; key: string } | null;
  image?: { info: string } | null;
  owner?: { id: number; username: string | null } | null;
}

export interface ModrinthSettings {
  modrinthInstallationWarning: boolean;
  warningTitle: string;
  warningMessage: string;
  disabledProjectTypes: string[];
  blockedProjects: string[];
}

export const DEFAULT_MODRINTH_SETTINGS: ModrinthSettings = {
  modrinthInstallationWarning: false,
  warningTitle: 'Installation Temporarily Disabled',
  warningMessage: 'Installations are temporarily disabled due to technical issues in the backend.',
  disabledProjectTypes: [],
  blockedProjects: [],
};
