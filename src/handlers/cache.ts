import { getRedisClient } from './redis';

const CACHE_PREFIX = 'airlink:cache:';

/**
 * Generic Redis cache helper with TTL support.
 * All keys are prefixed with `airlink:cache:` to avoid collisions
 * with session data.
 */
export const cache = {
  /**
   * Get a cached value by key. Returns null on miss or error.
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const redis = getRedisClient();
      const raw = await redis.get(`${CACHE_PREFIX}${key}`);
      if (!raw) {return null;}
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  /**
   * Set a cached value with a TTL in seconds.
   */
  async set(key: string, value: unknown, ttlSec: number): Promise<void> {
    try {
      const redis = getRedisClient();
      await redis.set(`${CACHE_PREFIX}${key}`, JSON.stringify(value), 'EX', ttlSec);
    } catch {
      // Non-critical — cache miss on next read.
    }
  },

  /**
   * Delete a cached value.
   */
  async del(key: string): Promise<void> {
    try {
      const redis = getRedisClient();
      await redis.del(`${CACHE_PREFIX}${key}`);
    } catch {
      // Non-critical.
    }
  },

  /**
   * Wraps an async function with caching. On cache hit, returns the stored
   * value without calling the function. On miss, calls the function, stores
   * the result, and returns it.
   *
   * @param key     Cache key (will be prefixed automatically)
   * @param ttlSec  Time-to-live in seconds
   * @param fn      Function to call on cache miss
   * @returns       Cached or freshly computed value
   */
  async wrap<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
    const cached = await cache.get<T>(key);
    if (cached !== null) {return cached;}

    const result = await fn();
    // Only cache non-null/undefined results.
    if (result != null) {
      await cache.set(key, result, ttlSec);
    }
    return result;
  },
};
