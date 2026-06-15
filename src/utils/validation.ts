// ── Request Validation Middleware ─────────────────────────────────────────────
// Reusable middleware factory for validating request body/params/query with Zod.

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import logger from '../handlers/logger';

type ValidationTarget = 'body' | 'params' | 'query';

/**
 * Creates Express middleware that validates req[target] against the given Zod schema.
 * On validation failure, responds with 400 and structured error details.
 */
export function validate(schema: z.ZodSchema, target: ValidationTarget = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      const errors = result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      logger.warn(`Validation failed on ${req.method} ${req.path}`, { errors });
      res.status(400).json({
        error: 'Validation failed',
        details: errors,
      });
      return;
    }
    // Replace with parsed (coerced/defaulted) values
    (req as unknown as Record<string, unknown>)[target] = result.data;
    next();
  };
}
