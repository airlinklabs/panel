// ── Cache Store ──
// Two-tier cache: in-memory Map + SQLite via Prisma.
// Typed, with background cleanup and TTL support.

import type { AddonLogger, AddonPrisma } from '../types/panel';
import type { CacheEntry } from '../types/modrinth';
import { CACHE_TTL_MS } from '../types/modrinth';

interface MemoryCacheEntry {
  data: unknown;
  expiresAt: number;
}

export class CacheStore {
  private logger: AddonLogger;
  private prisma: AddonPrisma;
  private memoryCache = new Map<string, MemoryCacheEntry>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(logger: AddonLogger, prisma: AddonPrisma) {
    this.logger = logger;
    this.prisma = prisma;
    this.startCleanup();
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupMemoryCache();
    }, 60_000);
  }

  private cleanupMemoryCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expiresAt <= now) {
        this.memoryCache.delete(key);
      }
    }
  }

  /**
   * Get a cached value by key. Checks memory first, then SQLite.
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    // Check memory cache first
    const memEntry = this.memoryCache.get(key);
    if (memEntry && memEntry.expiresAt > Date.now()) {
      return memEntry.data as T;
    }
    this.memoryCache.delete(key);

    // Check SQLite cache
    try {
      const row = await this.prisma.$queryRaw<CacheEntry[]>`
        SELECT cacheKey, data, expiresAt FROM ModrinthCache
        WHERE cacheKey = ${key} AND expiresAt > datetime('now')
        LIMIT 1
      `;

      if (row.length > 0) {
        const parsed = JSON.parse(row[0].data) as T;
        // Populate memory cache
        this.memoryCache.set(key, {
          data: parsed,
          expiresAt: new Date(row[0].expiresAt).getTime(),
        });
        return parsed;
      }
    } catch (error: any) {
      this.logger.warn(`Cache read error for key "${key}": ${error.message}`);
    }

    return null;
  }

  /**
   * Set a cached value with TTL.
   */
  async set<T = unknown>(key: string, data: T, ttlMs: number = CACHE_TTL_MS): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlMs);

    // Set in memory cache
    this.memoryCache.set(key, {
      data,
      expiresAt: expiresAt.getTime(),
    });

    // Set in SQLite cache
    try {
      await this.prisma.$executeRaw`
        INSERT OR REPLACE INTO ModrinthCache (cacheKey, data, expiresAt)
        VALUES (${key}, ${JSON.stringify(data)}, ${expiresAt.toISOString()})
      `;
    } catch (error: any) {
      this.logger.warn(`Cache write error for key "${key}": ${error.message}`);
    }
  }

  /**
   * Delete a cached value.
   */
  async delete(key: string): Promise<void> {
    this.memoryCache.delete(key);
    try {
      await this.prisma.$executeRaw`
        DELETE FROM ModrinthCache WHERE cacheKey = ${key}
      `;
    } catch (error: any) {
      this.logger.warn(`Cache delete error for key "${key}": ${error.message}`);
    }
  }

  /**
   * Clear all cached values.
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();
    try {
      await this.prisma.$executeRaw`DELETE FROM ModrinthCache`;
    } catch (error: any) {
      this.logger.warn(`Cache clear error: ${error.message}`);
    }
  }

  /**
   * Clear expired cache entries.
   */
  async cleanup(): Promise<void> {
    this.cleanupMemoryCache();
    try {
      await this.prisma.$executeRaw`
        DELETE FROM ModrinthCache WHERE expiresAt <= datetime('now')
      `;
    } catch (error: any) {
      this.logger.warn(`Cache cleanup error: ${error.message}`);
    }
  }

  /**
   * Destroy the cache store (cleanup intervals).
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.memoryCache.clear();
  }
}
