import { z } from 'zod';
import type { Request, Response } from 'express';

export function parseBody<T>(
  schema: z.ZodType<T>,
  req: Request,
  res: Response,
): T | null {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      message: result.error.issues.map(i => i.message).join('; '),
    });
    return null;
  }
  return result.data;
}
