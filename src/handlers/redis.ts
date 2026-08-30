import Redis from 'ioredis';
import logger from './logger';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

let client: Redis | null = null;

/**
 * Returns a shared Redis client. Created lazily on first call.
 * In development, if Redis is unreachable the client still returns —
 * connection errors are logged but do not crash the panel. The session
 * store will fall through gracefully.
 */
export function getRedisClient(): Redis {
  if (client) {
    return client;
  }

  client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
      if (times > 10) {
        return null;
      }
      return Math.min(times * 200, 5000);
    },
    lazyConnect: false,
  });

  client.on('connect', () => {
    logger.info('Redis connected');
  });

  client.on('error', (err: Error) => {
    logger.warn('Redis connection error', { error: err.message });
  });

  return client;
}

/**
 * Creates a separate Redis client dedicated to session storage.
 * connect-redis requires its own client instance.
 */
export function createSessionRedisClient(): Redis {
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
      if (times > 10) {
        return null;
      }
      return Math.min(times * 200, 5000);
    },
    lazyConnect: false,
  });
}
