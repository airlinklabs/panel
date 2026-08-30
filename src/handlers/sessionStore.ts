import session from 'express-session';
import { getRedisClient } from './redis';

const SESSION_PREFIX = 'airlink:sess:';
const USER_INDEX_PREFIX = 'airlink:usr:';
const DEFAULT_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

/**
 * Redis-backed session store using ioredis directly.
 *
 * Stores serialized session data in Redis with a TTL matching the cookie
 * maxAge. A secondary index (`airlink:usr:{userId}` → Set of session IDs)
 * enables the admin panel to revoke all sessions for a given user without
 * scanning the entire keyspace.
 */
class RedisSessionStore extends session.Store {
  private redis;
  private prefix: string;
  private defaultTtl: number;

  constructor() {
    super();
    this.redis = getRedisClient();
    this.prefix = SESSION_PREFIX;
    this.defaultTtl = DEFAULT_TTL_SEC;
  }

  get(
    sid: string,
    callback: (err: Error | null, session?: session.SessionData) => void,
  ): void {
    this.redis
      .get(`${this.prefix}${sid}`)
      .then((data) => {
        if (!data) {
          callback(null, undefined);
          return;
        }
        try {
          callback(null, JSON.parse(data) as session.SessionData);
        } catch (err) {
          callback(err as Error);
        }
      })
      .catch((err) => {
        callback(err as Error);
      });
  }

  set(
    sid: string,
    sess: session.SessionData,
    callback?: (err?: Error) => void,
  ): void {
    const ttlSec = this.getTTL(sess);
    const data = JSON.stringify(sess);

    this.redis
      .set(`${this.prefix}${sid}`, data, 'EX', ttlSec)
      .then(() => {
        // Track user → session mapping for admin session revocation.
        try {
          const userId = (sess as any)?.user?.id;
          if (userId !== null && userId !== undefined) {
            const key = `${USER_INDEX_PREFIX}${userId}`;
            this.redis
              .pipeline()
              .sadd(key, sid)
              .expire(key, ttlSec)
              .exec()
              .catch(() => {
                /* noop */
              });
          }
        } catch {
          // Non-critical — index is best-effort.
        }
        callback?.();
      })
      .catch((err) => {
        callback?.(err as Error);
      });
  }

  destroy(sid: string, callback?: (err?: Error) => void): void {
    // Look up session to find userId for index cleanup.
    this.redis
      .get(`${this.prefix}${sid}`)
      .then((data) => {
        const pipeline = this.redis.pipeline();
        pipeline.del(`${this.prefix}${sid}`);

        if (data) {
          try {
            const sess = JSON.parse(data) as session.SessionData;
            const userId = (sess as any)?.user?.id;
            if (userId !== null && userId !== undefined) {
              pipeline.srem(`${USER_INDEX_PREFIX}${userId}`, sid);
            }
          } catch {
            // ignore parse errors
          }
        }

        pipeline
          .exec()
          .then(() => callback?.())
          .catch((err) => callback?.(err as Error));
      })
      .catch((err) => {
        callback?.(err as Error);
      });
  }

  touch(sid: string, sess: session.SessionData, callback?: () => void): void {
    const ttlSec = this.getTTL(sess);
    this.redis
      .expire(`${this.prefix}${sid}`, ttlSec)
      .then(() => {
        callback?.();
      })
      .catch(() => {
        callback?.();
      });
  }

  all(
    callback: (err: Error | null, sessions?: session.SessionData[]) => void,
  ): void {
    this.getAllKeys()
      .then((keys) => {
        if (keys.length === 0) {
          callback(null, []);
          return;
        }
        this.redis
          .mget(...keys)
          .then((results) => {
            const sessions: session.SessionData[] = [];
            for (const raw of results) {
              if (raw) {
                try {
                  sessions.push(JSON.parse(raw) as session.SessionData);
                } catch {
                  // skip corrupt entries
                }
              }
            }
            callback(null, sessions);
          })
          .catch((err) => callback(err as Error));
      })
      .catch((err) => callback(err as Error));
  }

  lengths(callback: (err: Error | null, length?: number) => void): void {
    this.getAllKeys()
      .then((keys) => {
        callback(null, keys.length);
      })
      .catch((err) => callback(err as Error));
  }

  ids(callback: (err: Error | null, ids?: string[]) => void): void {
    this.getAllKeys()
      .then((keys) => {
        const ids = keys.map((k) => k.slice(this.prefix.length));
        callback(null, ids);
      })
      .catch((err) => callback(err as Error));
  }

  clear(callback?: (err?: Error) => void): void {
    this.getAllKeys()
      .then((keys) => {
        if (keys.length === 0) {
          callback?.();
          return;
        }
        this.redis
          .del(...keys)
          .then(() => callback?.())
          .catch((err) => callback?.(err as Error));
      })
      .catch((err) => callback?.(err as Error));
  }

  /**
   * Destroys every session belonging to the given user.
   * Used by the admin panel when banning/deleting a user.
   */
  async destroyUserSessions(userId: number | string): Promise<void> {
    const key = `${USER_INDEX_PREFIX}${userId}`;
    try {
      const sessionIds = await this.redis.smembers(key);
      if (sessionIds.length > 0) {
        const pipeline = this.redis.pipeline();
        for (const sid of sessionIds) {
          pipeline.del(`${this.prefix}${sid}`);
        }
        pipeline.del(key);
        await pipeline.exec();
      }
    } catch {
      // Best-effort.
    }
  }

  private getTTL(sess: session.SessionData): number {
    const maxAge = sess.cookie?.maxAge;
    if (typeof maxAge === 'number') {
      return Math.ceil(maxAge / 1000);
    }
    return this.defaultTtl;
  }

  private async getAllKeys(): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, batch] = await this.redis.scan(
        cursor,
        'MATCH',
        `${this.prefix}*`,
        'COUNT',
        200,
      );
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');
    return keys;
  }
}

/**
 * Singleton session store instance shared across the application.
 * Used by admin routes to revoke user sessions from Redis.
 */
let _instance: RedisSessionStore | null = null;

export function getSessionStore(): RedisSessionStore {
  if (!_instance) {
    _instance = new RedisSessionStore();
  }
  return _instance;
}

export default RedisSessionStore;
