// ── Modrinth API Client ──
// HTTP client for api.modrinth.com/v2 with retry, caching, and validation.

import type { AddonLogger, AddonSecurity } from '../types/panel';
import type { CacheStore } from './cache-store';
import type {
  ModrinthSearchResponse,
  ModrinthProject,
  ModrinthVersion,
} from '../types/modrinth';
import {
  ModrinthSearchResponseSchema,
  ModrinthProjectSchema,
  ModrinthVersionSchema,
  ALLOWED_MODRINTH_DOMAINS,
  REQUEST_TIMEOUT_MS,
} from '../types/modrinth';

const MODRINTH_API_BASE = 'https://api.modrinth.com/v2';
const USER_AGENT = 'AirLink-ModrinthAddon/3.0.0 (contact@airlinklabs.com)';
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;

interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

export class ModrinthClient {
  private logger: AddonLogger;
  private security: AddonSecurity;
  private cache: CacheStore;

  constructor(logger: AddonLogger, security: AddonSecurity, cache: CacheStore) {
    this.logger = logger;
    this.security = security;
    this.cache = cache;
  }

  /**
   * Make a request to the Modrinth API with retry logic.
   * Only retries on 5xx errors. Handles 429 (rate limit) with Retry-After.
   */
  private async fetchApi<T>(
    endpoint: string,
    schema: { parse: (data: unknown) => T },
    options: FetchOptions = {}
  ): Promise<T> {
    const url = `${MODRINTH_API_BASE}${endpoint}`;

    // Validate URL is safe
    if (!this.security.validateUrl(url, ALLOWED_MODRINTH_DOMAINS)) {
      throw new Error(`Invalid Modrinth API URL: ${url}`);
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), options.timeout ?? REQUEST_TIMEOUT_MS);

        const response = await fetch(url, {
          method: options.method ?? 'GET',
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'application/json',
            ...options.headers,
          },
          body: options.body,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        // Handle rate limiting (429)
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000;
          this.logger.warn(`Modrinth API rate limited, waiting ${waitMs}ms`);
          await this.sleep(waitMs);
          continue;
        }

        // Only retry on 5xx errors
        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          if (response.status >= 500 && attempt < MAX_RETRIES) {
            lastError = new Error(`Modrinth API error ${response.status}: ${errorText}`);
            await this.sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1));
            continue;
          }
          throw new Error(`Modrinth API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        return schema.parse(data);
      } catch (error: any) {
        if (error.name === 'AbortError') {
          lastError = new Error(`Modrinth API request timed out after ${options.timeout ?? REQUEST_TIMEOUT_MS}ms`);
          if (attempt < MAX_RETRIES) {
            await this.sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1));
            continue;
          }
        }
        // Zod validation errors — don't retry
        if (error.name === 'ZodError') {
          throw new Error(`Modrinth API response validation failed: ${error.message}`);
        }
        lastError = error;
        if (attempt < MAX_RETRIES) {
          await this.sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1));
          continue;
        }
      }
    }

    throw lastError ?? new Error('Modrinth API request failed after all retries');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Search for projects on Modrinth.
   */
  async search(
    query: string,
    options: {
      facets?: string[][];
      index?: string;
      offset?: number;
      limit?: number;
    } = {}
  ): Promise<ModrinthSearchResponse> {
    const params = new URLSearchParams();
    if (query) params.set('query', query);
    if (options.index) params.set('index', options.index);
    if (options.offset !== undefined) params.set('offset', String(options.offset));
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.facets) {
      params.set('facets', JSON.stringify(options.facets));
    }

    const cacheKey = `search:${params.toString()}`;
    const cached = await this.cache.get<ModrinthSearchResponse>(cacheKey);
    if (cached) return cached;

    const result = await this.fetchApi(
      `/search?${params.toString()}`,
      ModrinthSearchResponseSchema
    );

    await this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Get a project by ID or slug.
   */
  async getProject(idOrSlug: string): Promise<ModrinthProject> {
    const encoded = encodeURIComponent(idOrSlug);
    const cacheKey = `project:${encoded}`;
    const cached = await this.cache.get<ModrinthProject>(cacheKey);
    if (cached) return cached;

    const result = await this.fetchApi(
      `/project/${encoded}`,
      ModrinthProjectSchema
    );

    await this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Get all versions for a project.
   */
  async getProjectVersions(
    projectIdOrSlug: string,
    loaders?: string[],
    gameVersions?: string[]
  ): Promise<ModrinthVersion[]> {
    const encoded = encodeURIComponent(projectIdOrSlug);
    const params = new URLSearchParams();
    if (loaders?.length) params.set('loaders', JSON.stringify(loaders));
    if (gameVersions?.length) params.set('game_versions', JSON.stringify(gameVersions));

    const queryString = params.toString();
    const cacheKey = `versions:${encoded}:${queryString}`;
    const cached = await this.cache.get<ModrinthVersion[]>(cacheKey);
    if (cached) return cached;

    const endpoint = `/project/${encoded}/version${queryString ? `?${queryString}` : ''}`;
    const result = await this.fetchApi(endpoint, ModrinthVersionSchema.array());

    await this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Get a specific version by ID.
   */
  async getVersion(versionId: string): Promise<ModrinthVersion> {
    const encoded = encodeURIComponent(versionId);
    const cacheKey = `version:${encoded}`;
    const cached = await this.cache.get<ModrinthVersion>(cacheKey);
    if (cached) return cached;

    const result = await this.fetchApi(
      `/version/${encoded}`,
      ModrinthVersionSchema
    );

    await this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Health check — verify Modrinth API is reachable.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${MODRINTH_API_BASE}/tags/game_version`, {
        method: 'GET',
        headers: { 'User-Agent': USER_AGENT },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Download a file from a URL. Returns the buffer.
   * Validates URL before fetching.
   */
  async downloadFile(url: string): Promise<Buffer> {
    if (!this.security.validateUrl(url, ALLOWED_MODRINTH_DOMAINS)) {
      throw new Error(`Invalid download URL: ${url}`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } finally {
      clearTimeout(timeout);
    }
  }
}
