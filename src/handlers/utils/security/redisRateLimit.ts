import { getRedisClient } from '../../redis';
import type { Request, Response, NextFunction } from 'express';

/**
 * Redis-backed sliding-window rate limiter using sorted sets.
 * Replaces express-rate-limit for distributed/multi-instance deployments.
 * Fails open if Redis is unreachable.
 */
export function createRedisRateLimit(opts: {
  windowMs: number;
  max: number;
  keyPrefix?: string;
  keyGenerator?: (req: Request) => string;
  handler?: (req: Request, res: Response) => void;
  skip?: (req: Request) => boolean;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  message?: unknown;
  validate?: boolean;
}) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (opts.skip?.(req)) {
      next();
      return;
    }

    try {
      const redis = getRedisClient();
      const keyGen = opts.keyGenerator ?? ((r: Request) => r.ip ?? 'unknown');
      const key = `${opts.keyPrefix ?? 'rl:'}:${keyGen(req)}`;
      const now = Date.now();
      const windowStart = now - opts.windowMs;

      // Sliding window with Redis sorted sets
      await redis.zremrangebyscore(key, 0, windowStart);
      const count = await redis.zcard(key);

      if (count >= opts.max) {
        res.setHeader('Retry-After', String(Math.ceil(opts.windowMs / 1000)));
        if (opts.handler) {
          opts.handler(req, res);
          return;
        }
        res.status(429).json(opts.message ?? { error: 'Too many requests' });
        return;
      }

      // Use timestamp + random suffix to avoid member collision at same ms
      const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;
      await redis.zadd(key, now, member);
      await redis.expire(key, Math.ceil(opts.windowMs / 1000));

      if (opts.standardHeaders) {
        res.setHeader('RateLimit-Limit', String(opts.max));
        res.setHeader('RateLimit-Remaining', String(opts.max - count - 1));
        res.setHeader(
          'RateLimit-Reset',
          String(Math.ceil((now + opts.windowMs) / 1000)),
        );
      }
      if (opts.legacyHeaders) {
        res.setHeader('X-RateLimit-Limit', String(opts.max));
        res.setHeader('X-RateLimit-Remaining', String(opts.max - count - 1));
        res.setHeader(
          'X-RateLimit-Reset',
          String(Math.ceil((now + opts.windowMs) / 1000)),
        );
      }

      next();
    } catch {
      // Fail open — if Redis is down, allow the request through
      next();
    }
  };
}

/** Default rate limiter: 100 req/min/IP. For stricter limits, use createRedisRateLimit directly. */
export const redisRateLimit = createRedisRateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
