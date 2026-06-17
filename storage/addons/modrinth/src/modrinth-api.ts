import { CacheStore } from './cache';
import {
  ModrinthSearchResultSchema,
  ModrinthProjectSchema,
  ModrinthVersionSchema,
  type ModrinthSearchResult,
  type ModrinthProject,
  type ModrinthVersion,
} from './types';

const BASE_URL = 'https://api.modrinth.com/v2';
const USER_AGENT = 'AirLink-ModrinthAddon/2.0';
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;

export class ModrinthApiClient {
  constructor(
    private cache: CacheStore,
    private logger: { info: (...a: any[]) => void; warn: (...a: any[]) => void; error: (...a: any[]) => void }
  ) {}

  async search(query: string, type: string, limit = 20, offset = 0, index = 'relevance'): Promise<ModrinthSearchResult> {
    const facets: string[][] = [];
    if (type && type !== 'all') facets.push([`project_type:${type}`]);
    const facetStr = facets.length ? JSON.stringify(facets) : '';

    const params = new URLSearchParams({
      query: query || '',
      limit: String(limit),
      offset: String(offset),
      index,
    });
    if (facetStr) params.set('facets', facetStr);

    const cacheKey = `search:${params.toString()}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached as ModrinthSearchResult;

    const data = await this.request(`/search?${params}`);
    const parsed = ModrinthSearchResultSchema.parse(data);
    await this.cache.set(cacheKey, parsed);
    return parsed;
  }

  async getProject(id: string): Promise<ModrinthProject> {
    const cacheKey = `project:${id}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached as ModrinthProject;

    const data = await this.request(`/project/${id}`);
    const parsed = ModrinthProjectSchema.parse(data);
    await this.cache.set(cacheKey, parsed);
    return parsed;
  }

  async getProjectVersions(id: string): Promise<ModrinthVersion[]> {
    const cacheKey = `versions:${id}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached as ModrinthVersion[];

    const data = await this.request(`/project/${id}/version`);
    const parsed = (data as any[]).map(v => ModrinthVersionSchema.parse(v));
    await this.cache.set(cacheKey, parsed);
    return parsed;
  }

  async getVersion(versionId: string): Promise<ModrinthVersion> {
    const data = await this.request(`/version/${versionId}`);
    return ModrinthVersionSchema.parse(data);
  }

  async clearCache(): Promise<void> {
    await this.cache.clear();
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.request('/tags/category');
      return true;
    } catch {
      return false;
    }
  }

  private async request(path: string): Promise<unknown> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(`${BASE_URL}${path}`, {
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'application/json',
          },
        });

        if (res.status >= 500) {
          throw new Error(`Modrinth API ${res.status}: ${res.statusText}`);
        }

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`Modrinth API ${res.status}: ${body.slice(0, 200)}`);
        }

        return await res.json();
      } catch (err: any) {
        lastError = err;
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
          await sleep(delay);
        }
      }
    }

    throw lastError || new Error('Modrinth API request failed');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
