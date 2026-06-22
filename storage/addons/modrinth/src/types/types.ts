/**
 * =============================================================================
 * File: types.ts
 * Author: g-flame
 * =============================================================================
 *
 * CREDITS:
 * - Addon developed by g-flame
 * - Panel by AirlinkLabs
 * - Special thanks to Modrinth for platform and API
 * - Thanks to all contributors
 *
 * NOTES:
 * - This file is part of the Airlink Addons – Modrinth Store project
 * - All TypeScript logic written by g-flame
 *
 * =============================================================================
 */
export interface AddonAPI {
  registerRoute: (path: string, router: any) => void;
  logger: any;
  prisma: any;
  addonPath: string;
  viewsPath: string;
  renderView: (viewName: string, data?: any) => string;
  getComponentPath: (componentPath: string) => string;
  ui?: {
    addSidebarItem?: (item: any) => void;
    addServerMenuItem?: (item: any) => void;
  };
}

export interface ModrinthProject {
  id: string;
  slug: string;
  project_type: string;
  title: string;
  description: string;
  downloads: number;
  followers: number;
  categories: string[];
  game_versions: string[];
  loaders: string[];
  icon_url?: string;
  versions: string[];
  body?: string;
  license?: { name: string };
  client_side?: string;
  server_side?: string;
  published?: string;
  updated?: string;
  donation_urls?: Array<{ platform: string; url: string }>;
  source_url?: string;
  issues_url?: string;
  wiki_url?: string;
}

export interface ModrinthVersion {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  version_type: string;
  game_versions: string[];
  loaders: string[];
  date_published: string;
  files: Array<{
    hashes: { sha1: string; sha512: string };
    url: string;
    filename: string;
    primary: boolean;
    size: number;
  }>;
}

export interface ServerData {
  UUID: string;
  name: string;
  description: string;
  status: string;
  Installing?: boolean;
  Suspended?: boolean;
  ownerId?: string;
  node?: any;
  image?: any;
  owner?: any;
}

export interface ServerInfo {
  nodeAddress: string;
  nodePort: number;
  serverUUID: string;
  nodeKey: string;
}

export interface ModpackIndex {
  formatVersion: number;
  game: string;
  versionId: string;
  name: string;
  summary?: string;
  files: Array<{
    path: string;
    hashes: {
      sha1: string;
      sha512?: string;
    };
    env?: {
      client: string;
      server: string;
    };
    downloads: string[];
    fileSize: number;
  }>;
  dependencies: {
    minecraft: string;
    [loader: string]: string;
  };
}

export interface ServerJarInfo {
  version: string;
  url: string;
  loader: string;
}
