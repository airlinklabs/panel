import { z } from 'zod';

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
  status: z.string().optional(),
  requested_status: z.string().nullable().optional(),
  additional_categories: z.array(z.string()).optional(),
  issues_url: z.string().nullable().optional(),
  source_url: z.string().nullable().optional(),
  wiki_url: z.string().nullable().optional(),
  discord_url: z.string().nullable().optional(),
  donation_urls: z.array(z.object({
    id: z.string(),
    platform: z.string(),
    url: z.string(),
  })).optional(),
  project_type: z.string(),
  downloads: z.number().optional(),
  icon_url: z.string().nullable().optional(),
  color: z.number().nullable().optional(),
  team_id: z.string().optional(),
  moderator_message: z.string().nullable().optional(),
  date_created: z.string().optional(),
  date_modified: z.string().optional(),
  latest_version: z.string().nullable().optional(),
  license: z.any().nullable().optional(),
  gallery: z.array(z.any()).optional(),
  featured_gallery: z.string().nullable().optional(),
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
