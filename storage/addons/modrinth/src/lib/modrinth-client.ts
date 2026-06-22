import axios, { AxiosInstance } from 'axios';
import { CacheStore } from './cache-store';
import {
  ModrinthSearchResponseSchema,
  ModrinthProjectSchema,
  ModrinthVersionSchema,
  ModrinthSearchResponse,
  ModrinthProject,
  ModrinthVersion,
} from '../types/modrinth-api';

export interface ModrinthClientConfig {
  apiBase: string;
  userAgent: string;
  searchLimit: number;
  cacheDuration: number;
  retryAttempts: number;
  retryDelay: number;
  requestTimeout: number;
}

const DEFAULT_CONFIG: ModrinthClientConfig = {
  apiBase: 'https://api.modrinth.com/v2',
  userAgent: 'AirLink-ModrinthAddon/2.0',
  searchLimit: 20,
  cacheDuration: 10 * 60 * 1000,
  retryAttempts: 3,
  retryDelay: 2000,
  requestTimeout: 30000,
};

export class ModrinthClient {
  private http: AxiosInstance;
  private cache: CacheStore;
  private config: ModrinthClientConfig;
  private logger: any;
  private inFlight = new Map<string, Promise<any>>();

  constructor(cache: CacheStore, logger: any, config?: Partial<ModrinthClientConfig>) {
    this.cache = cache;
    this.logger = logger;
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.http = axios.create({
      baseURL: this.config.apiBase,
      headers: {
        'User-Agent': this.config.userAgent,
        'Accept': 'application/json',
      },
      timeout: this.config.requestTimeout,
      validateStatus: (status) => status < 500,
    });
  }

  private buildCacheKey(endpoint: string, params?: Record<string, any>): string {
    return `modrinth:${endpoint}:${JSON.stringify(params || {})}`;
  }

  private async requestWithRetry<T>(
    endpoint: string,
    params?: Record<string, any>,
    validator?: (data: any) => T,
  ): Promise<T> {
    const cacheKey = this.buildCacheKey(endpoint, params);
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    if (this.inFlight.has(cacheKey)) {
      return this.inFlight.get(cacheKey)!;
    }

    const promise = this.doRequest<T>(cacheKey, endpoint, params, validator);
    this.inFlight.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  private async doRequest<T>(
    cacheKey: string,
    endpoint: string,
    params?: Record<string, any>,
    validator?: (data: any) => T,
  ): Promise<T> {
    let lastError: any;
    for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
      try {
        const response = await this.http.get(endpoint, { params });

        if (response.status === 429) {
          const retryAfter = parseInt(response.headers['retry-after'] || '5', 10);
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
          continue;
        }

        if (response.status >= 400) {
          throw new Error(`Modrinth API returned ${response.status}: ${response.statusText}`);
        }

        const data = validator ? validator(response.data) : response.data as T;
        await this.cache.set(cacheKey, data, this.config.cacheDuration);
        return data;
      } catch (error: any) {
        lastError = error;
        if (error.response?.status >= 400 && error.response?.status < 500) throw error;
        if (attempt < this.config.retryAttempts - 1) {
          const delay = this.config.retryDelay * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    throw lastError;
  }

  async search(query: string, type?: string, page: number = 1): Promise<ModrinthSearchResponse> {
    const params: Record<string, any> = {
      query: query?.trim() || '',
      offset: Math.max(0, (page - 1) * this.config.searchLimit),
      limit: Math.min(this.config.searchLimit, 100),
      index: 'relevance',
    };

    if (type && type !== 'all' && ['mod', 'modpack', 'resourcepack', 'shader', 'plugin', 'datapack'].includes(type)) {
      params.facets = JSON.stringify([[`project_type:${type}`]]);
    }

    return this.requestWithRetry('/search', params, (data) => {
      const result = ModrinthSearchResponseSchema.parse(data);
      return {
        hits: result.hits || [],
        total_hits: result.total_hits || 0,
        offset: result.offset || 0,
        limit: result.limit || this.config.searchLimit,
      };
    });
  }

  async getProject(projectId: string): Promise<ModrinthProject> {
    if (!projectId?.trim()) throw new Error('Project ID is required');
    return this.requestWithRetry(
      `/project/${encodeURIComponent(projectId.trim())}`,
      undefined,
      (data) => ModrinthProjectSchema.parse(data),
    );
  }

  async getProjectVersions(projectId: string): Promise<ModrinthVersion[]> {
    if (!projectId?.trim()) throw new Error('Project ID is required');
    return this.requestWithRetry(
      `/project/${encodeURIComponent(projectId.trim())}/version`,
      undefined,
      (data) => {
        if (!Array.isArray(data)) return [];
        return data.map((v) => ModrinthVersionSchema.parse(v));
      },
    );
  }

  async getVersion(versionId: string): Promise<ModrinthVersion> {
    if (!versionId?.trim()) throw new Error('Version ID is required');
    return this.requestWithRetry(
      `/version/${encodeURIComponent(versionId.trim())}`,
      undefined,
      (data) => ModrinthVersionSchema.parse(data),
    );
  }

  async getMultipleProjects(projectIds: string[]): Promise<ModrinthProject[]> {
    if (!projectIds.length) return [];
    const ids = JSON.stringify(projectIds);
    return this.requestWithRetry(
      '/projects',
      { ids },
      (data) => {
        if (!Array.isArray(data)) return [];
        return data.map((p) => ModrinthProjectSchema.parse(p));
      },
    );
  }

  async healthCheck(): Promise<{ healthy: boolean; accessible: boolean }> {
    try {
      const result = await this.search('minecraft', 'mod', 1);
      return {
        healthy: true,
        accessible: result.total_hits > 0,
      };
    } catch {
      return { healthy: false, accessible: false };
    }
  }
}
